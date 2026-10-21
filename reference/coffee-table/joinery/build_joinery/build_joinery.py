"""
Coffee table joinery reference models
=====================================
Builds every joint model from the coffee table checklist in a new Fusion
design, one component per model, and exports them.

What it reads (next to this file):
  specs/*.json        one file per model, written by `npm run joinery:specs`
  specs/profiles.json the drawn profile library (legs, aprons, tops, edges)

What it writes (in an "exports" folder next to this file):
  <model>.step        each model on its own, for the app's automated tests
  profiles/<id>.dxf   each profile sketch
  joinery.f3d         the whole design
  log.txt             what was built, and anything that went wrong

How to run: in Fusion, Utilities > Add-Ins > Scripts and Add-Ins, click +
next to "My Scripts", pick this folder, then select build_joinery and Run.
It takes a few minutes. Units are millimetres; every model sits in the
table's own position (Z up, front of the table faces -Y, origin on the
floor at the centre), and models are spread out on a grid so you can see
them all.
"""
import json
import math
import os
import traceback

import adsk.core
import adsk.fusion

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_DIR = os.path.join(HERE, "specs")
OUT_DIR = os.path.join(HERE, "exports")

ONLY = []            # model ids to build, e.g. ["A1-mt-haunched"]; empty = all
GRID_COLUMNS = 6
GRID_STEP_MM = 1500  # distance between models in the layout
EXPORT_STEP = True
EXPORT_DXF = True
EXPORT_F3D = True

APPEARANCES = {      # first name found in the appearance library wins
    "walnut": ["Walnut", "Wood - Walnut", "Walnut - Semigloss"],
    "maple": ["Maple", "Wood - Maple"],
    "beech": ["Beech", "Wood - Beech", "Pine"],
    "plywood": ["Plywood", "Birch", "Pine"],
    "steel": ["Steel - Satin", "Steel", "Iron"],
    "brass": ["Brass - Polished", "Brass - Satin", "Brass"],
    "felt": ["Felt", "Fabric (Felt)", "Plastic - Matte (Black)"],
    "reference": ["Glass", "Glass - Clear"],
}

_app = None
_ui = None


def cm(v):
    return v / 10.0


def P3(p):
    return adsk.core.Point3D.create(cm(p[0]), cm(p[1]), cm(p[2]))


def V3(v):
    return adsk.core.Vector3D.create(v[0], v[1], v[2])


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


class Builder:
    def __init__(self, design):
        self.design = design
        self.root = design.rootComponent
        self.tbm = adsk.fusion.TemporaryBRepManager.get()
        self.appearances = {}

    # -- frames -------------------------------------------------------------
    def frame_matrix(self, f, z_shift=0.0):
        """Local-to-world matrix of a frame, with its origin moved z_shift along its z."""
        o, x, z = (f["o"], f["x"], f["z"]) if f else ([0, 0, 0], [1, 0, 0], [0, 0, 1])
        o = [o[i] + z[i] * z_shift for i in range(3)]
        m = adsk.core.Matrix3D.create()
        m.setWithCoordinateSystem(P3(o), V3(x), V3(cross(z, x)), V3(z))
        return m

    def place(self, temp, f, z_shift=0.0):
        if f or z_shift:
            self.tbm.transform(temp, self.frame_matrix(f, z_shift))
        return temp

    # -- sketch helpers -------------------------------------------------------
    def sketch_at(self, z_mm):
        if abs(z_mm) < 1e-9:
            return self.root.sketches.add(self.root.xYConstructionPlane), None
        planes = self.root.constructionPlanes
        pin = planes.createInput()
        pin.setByOffset(self.root.xYConstructionPlane, adsk.core.ValueInput.createByReal(cm(z_mm)))
        plane = planes.add(pin)
        return self.root.sketches.add(plane), plane

    def draw_loop(self, sk, loop, z_mm):
        def sp(x, y):
            return sk.modelToSketchSpace(P3([x, y, z_mm]))

        lines = sk.sketchCurves.sketchLines
        if loop["kind"] == "rect":
            cx, cy, w, h = loop["cx"], loop["cy"], loop["w"], loop["h"]
            lines.addTwoPointRectangle(sp(cx - w / 2, cy - h / 2), sp(cx + w / 2, cy + h / 2))
            return
        if loop["kind"] == "circle":
            sk.sketchCurves.sketchCircles.addByCenterRadius(sp(loop["cx"], loop["cy"]), cm(loop["r"]))
            return
        start = loop["start"]
        segs = list(loop["segs"])
        last = segs[-1]["to"] if segs else start
        if math.hypot(last[0] - start[0], last[1] - start[1]) > 1e-6:
            segs.append({"to": start})
        first_pt = None
        cur = sp(*start)
        for i, s in enumerate(segs):
            closing = i == len(segs) - 1 and first_pt is not None
            end = first_pt if closing else sp(*s["to"])
            if "via" in s:
                try:
                    c = sk.sketchCurves.sketchArcs.addByThreePoints(cur, sp(*s["via"]), end)
                except Exception:
                    c = sk.sketchCurves.sketchArcs.addByThreePoints(
                        cur.geometry if hasattr(cur, "geometry") else cur, sp(*s["via"]),
                        end.geometry if hasattr(end, "geometry") else end)
            else:
                c = lines.addByTwoPoints(cur, end)
            # Fusion stores every arc counterclockwise, so its start and end can
            # come back swapped: pick the ends by position.
            target = sp(*s["to"])
            a0, a1 = c.startSketchPoint, c.endSketchPoint
            near_end = a1 if float(a1.geometry.distanceTo(target)) <= float(a0.geometry.distanceTo(target)) else a0
            if first_pt is None:
                first_pt = a0 if near_end is a1 else a1
            cur = near_end

    def profile_of(self, sk):
        profs = sk.profiles
        if profs.count == 1:
            return profs.item(0)
        best, area = None, -1.0
        for i in range(profs.count):
            a = profs.item(i).areaProperties().area
            if a > area:
                best, area = profs.item(i), a
        return best

    def take(self, feature, sketches, planes):
        """Copy a feature's body as a temporary body, then remove the scratch geometry."""
        temp = self.tbm.copy(feature.bodies.item(0))
        for b in [feature.bodies.item(i) for i in range(feature.bodies.count)]:
            try:
                b.deleteMe()
            except Exception:
                pass
        for s in sketches:
            try:
                s.deleteMe()
            except Exception:
                pass
        for p in planes:
            if p is not None:
                try:
                    p.deleteMe()
                except Exception:
                    pass
        return temp

    # -- shapes ---------------------------------------------------------------
    def box_local(self, mn, mx):
        c = adsk.core.Point3D.create(cm((mn[0] + mx[0]) / 2), cm((mn[1] + mx[1]) / 2), cm((mn[2] + mx[2]) / 2))
        obb = adsk.core.OrientedBoundingBox3D.create(
            c, adsk.core.Vector3D.create(1, 0, 0), adsk.core.Vector3D.create(0, 1, 0),
            cm(mx[0] - mn[0]), cm(mx[1] - mn[1]), cm(mx[2] - mn[2]))
        return self.tbm.createBox(obb)

    def shape(self, s):
        t = s["type"]
        f = s.get("frame")
        if t == "box":
            return self.place(self.box_local(s["min"], s["max"]), f)
        if t == "cyl":
            return self.tbm.createCylinderOrCone(P3(s["p0"]), cm(s["r0"]), P3(s["p1"]), cm(s["r1"]))
        if t == "prism":
            z0, z1, loop = s["z0"], s["z1"], s["loop"]
            if z1 < z0:
                z0, z1 = z1, z0
            if loop["kind"] == "rect":
                cx, cy, w, h = loop["cx"], loop["cy"], loop["w"], loop["h"]
                return self.place(self.box_local([cx - w / 2, cy - h / 2, z0], [cx + w / 2, cy + h / 2, z1]), f)
            sk, _ = self.sketch_at(0)
            self.draw_loop(sk, loop, 0)
            ext = self.root.features.extrudeFeatures.addSimple(
                self.profile_of(sk), adsk.core.ValueInput.createByReal(cm(z1 - z0)),
                adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
            return self.place(self.take(ext, [sk], []), f, z0)
        if t == "loft":
            a, b = s["sections"]
            ska, pa = self.sketch_at(a["z"])
            self.draw_loop(ska, a["loop"], a["z"])
            skb, pb = self.sketch_at(b["z"])
            self.draw_loop(skb, b["loop"], b["z"])
            lin = self.root.features.loftFeatures.createInput(adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
            lin.loftSections.add(self.profile_of(ska))
            lin.loftSections.add(self.profile_of(skb))
            lin.isSolid = True
            loft = self.root.features.loftFeatures.add(lin)
            return self.place(self.take(loft, [ska, skb], [pa, pb]), f)
        raise ValueError("unknown shape type " + str(t))

    def body(self, b):
        ops = {"add": adsk.fusion.BooleanTypes.UnionBooleanType,
               "cut": adsk.fusion.BooleanTypes.DifferenceBooleanType,
               "common": adsk.fusion.BooleanTypes.IntersectionBooleanType}
        result = None
        for step in b["steps"]:
            temp = self.shape(step["shape"])
            if result is None:
                result = temp
            elif not self.tbm.booleanOperation(result, temp, ops[step["op"]]):
                raise RuntimeError("%s: a %s step failed" % (b["id"], step["op"]))
        return result

    # -- appearance -------------------------------------------------------------
    def appearance(self, material):
        if material in self.appearances:
            return self.appearances[material]
        found = None
        try:
            libs = _app.materialLibraries
            for li in range(libs.count):
                lib = libs.item(li)
                if "ppearance" not in lib.name:
                    continue
                for name in APPEARANCES.get(material, []):
                    a = lib.appearances.itemByName(name)
                    if a:
                        found = self.design.appearances.itemByName(name) or self.design.appearances.addByCopy(a, name)
                        break
                if found:
                    break
        except Exception:
            found = None
        self.appearances[material] = found
        return found


def add_params(design, m, log):
    up = design.userParameters
    prefix = "".join(ch if ch.isalnum() else "_" for ch in m["id"])
    if not prefix[0].isalpha():
        prefix = "m_" + prefix
    for p in m.get("params", []):
        name = prefix + "_" + p["name"]
        unit = p.get("unit", "mm")
        expr = "%s %s" % (p["value"], unit) if unit else str(p["value"])
        try:
            up.add(name, adsk.core.ValueInput.createByString(expr), unit, p.get("note", ""))
        except Exception as e:
            log.append("  parameter %s not added: %s" % (name, e))


def build_model(bld, m, index, log):
    col, row = index % GRID_COLUMNS, index // GRID_COLUMNS
    mat = adsk.core.Matrix3D.create()
    mat.translation = adsk.core.Vector3D.create(cm(col * GRID_STEP_MM), cm(-row * GRID_STEP_MM), 0)
    occ = bld.root.occurrences.addNewComponent(mat)
    comp = occ.component
    comp.name = m["id"]
    comp.description = m.get("title", "")
    failed = []
    for b in m["bodies"]:
        try:
            temp = bld.body(b)
            body = comp.bRepBodies.add(temp)
            body.name = b["id"]
            app = bld.appearance(b.get("material", "walnut"))
            if app:
                body.appearance = app
            if b.get("kind") == "reference":
                try:
                    body.opacity = 0.25
                except Exception:
                    pass
        except Exception:
            failed.append(b["id"])
            log.append("  body %s failed:\n%s" % (b["id"], traceback.format_exc()))
        adsk.doEvents()
    return comp, failed


def build_profiles(bld, data, start_index, log):
    out = []
    for i, p in enumerate(data["profiles"]):
        index = start_index + i
        col, row = index % GRID_COLUMNS, index // GRID_COLUMNS
        mat = adsk.core.Matrix3D.create()
        mat.translation = adsk.core.Vector3D.create(cm(col * GRID_STEP_MM), cm(-row * GRID_STEP_MM), 0)
        comp = bld.root.occurrences.addNewComponent(mat).component
        comp.name = "profile " + p["id"]
        try:
            sk = comp.sketches.add(comp.xYConstructionPlane)
            sk.name = p["id"]
            bld.draw_loop(sk, p["loop"], 0)
            for a, b in p.get("stretch", []):
                ln = sk.sketchCurves.sketchLines.addByTwoPoints(P3([a[0], a[1], 0]), P3([b[0], b[1], 0]))
                ln.isConstruction = True
            out.append((p, sk))
        except Exception:
            log.append("  profile %s failed:\n%s" % (p["id"], traceback.format_exc()))
    return out


def main():
    global _app, _ui
    _app = adsk.core.Application.get()
    _ui = _app.userInterface
    with open(os.path.join(SPEC_DIR, "index.json")) as fh:
        index = json.load(fh)
    ids = [m["id"] for m in index["models"] if not ONLY or m["id"] in ONLY]

    doc = _app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    design = adsk.fusion.Design.cast(_app.activeProduct)
    design.designType = adsk.fusion.DesignTypes.DirectDesignType
    try:
        design.fusionUnitsManager.distanceDisplayUnits = adsk.fusion.DistanceUnits.MillimeterDistanceUnits
    except Exception:
        pass
    bld = Builder(design)
    os.makedirs(OUT_DIR, exist_ok=True)
    log, summary = [], []

    for i, mid in enumerate(ids):
        with open(os.path.join(SPEC_DIR, mid + ".json")) as fh:
            m = json.load(fh)
        log.append("%s: %s" % (mid, m.get("title", "")))
        comp, failed = build_model(bld, m, i, log)
        add_params(design, m, log)
        summary.append("%s%s" % (mid, "  (failed: %s)" % ", ".join(failed) if failed else ""))
        if EXPORT_STEP:
            try:
                em = design.exportManager
                em.execute(em.createSTEPExportOptions(os.path.join(OUT_DIR, mid + ".step"), comp))
            except Exception:
                log.append("  STEP export failed:\n" + traceback.format_exc())

    if not ONLY:
        with open(os.path.join(SPEC_DIR, "profiles.json")) as fh:
            prof = json.load(fh)
        sketches = build_profiles(bld, prof, len(ids), log)
        if EXPORT_DXF:
            os.makedirs(os.path.join(OUT_DIR, "profiles"), exist_ok=True)
            for p, sk in sketches:
                try:
                    sk.saveAsDXF(os.path.join(OUT_DIR, "profiles", p["id"] + ".dxf"))
                except Exception:
                    log.append("  DXF export of %s failed:\n%s" % (p["id"], traceback.format_exc()))
        summary.append("%d profiles" % len(sketches))

    if EXPORT_F3D:
        try:
            em = design.exportManager
            em.execute(em.createFusionArchiveExportOptions(os.path.join(OUT_DIR, "joinery.f3d")))
        except Exception:
            log.append("f3d export failed:\n" + traceback.format_exc())

    with open(os.path.join(OUT_DIR, "log.txt"), "w") as fh:
        fh.write("\n".join(summary) + "\n\n" + "\n".join(log) + "\n")
    bad = [s for s in summary if "failed" in s]
    msg = "Built %d models. Files are in:\n%s" % (len(ids), OUT_DIR)
    if bad:
        msg += "\n\nSome parts failed (see log.txt):\n" + "\n".join(bad)
    _ui.messageBox(msg, "Coffee table joinery")


def run(context):
    try:
        main()
    except Exception:
        if _ui:
            _ui.messageBox("The script stopped:\n" + traceback.format_exc())
        else:
            raise
