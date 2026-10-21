"""
Mid-Century Coffee Table - interchangeable parts library
========================================================
Three tops, three leg sets and three apron sets that all share the same
mounting points, so any top + legs + aprons combination fits.

Common interface (all in inches, origin = floor centre, Z up):
  * Top underside sits at Z = table_h - top_t (15").  Every top covers the
    whole leg frame.
  * Leg centres at (+/-leg_cx, +/-leg_cy) = (+/-19, +/-7.5).  Every leg set
    has the same 1-3/4" square head from Z = 12" to 15", and the same
    3/8" x 1-1/4" x 3/4" deep mortises in that head.
  * Every apron set has rails that stop at the leg faces with the same
    tenons (Z 13-5/8" to 14-7/8"), so any apron set plugs into any leg set.

Parts (one component each):
  Top_Bevel        48 x 22, Juhl-style 18.5 deg undercut edge
  Top_Rounded      48 x 22, 4" radius corners, 1/8" round-overs
  Top_Superellipse 54 x 24, Piet Hein superellipse (n = 2.5)
  Legs_SquareTaper square, tapered on the two inside faces to 1"
  Legs_RoundTaper  square head, round below, tapered 1-3/4" to 7/8"
  Legs_Splayed     square head, round below, splayed 8 deg on the diagonal
  Aprons_Straight  3/4 x 3 rails
  Aprons_Arched    3/4 x 3 rails with an arched lower edge
  Aprons_Slim      3/4 x 1-1/2 rails

Saved designs: set DESIGN_FILE to a design saved from the web app
(Save design) and the script builds just that one table, with the web
app's sizes, instead of the nine-part library.

Run through the ShopPrentice add-in (execute_script, clean=True) or from
Fusion's Scripts and Add-Ins dialog (builds into a new design).
"""
import math
import os
import sys

import adsk.core
import adsk.fusion

_here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else ""
for _p in (_here,
           os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "Mid Century",
                        "Coffee Table Configurator", "fusion"),
           os.path.join(os.path.expanduser("~"), ".shopprentice", "repo")):
    if _p and os.path.isdir(os.path.join(_p, "helpers")) and _p not in sys.path:
        sys.path.append(_p)
from helpers import sp

DESIGN_FILE = ""      # path to a saved design .json; empty = parts library
SPECIES = "walnut"
SE_N = 2.5            # superellipse exponent (library; a design sets its own)
SE_POINTS = 96        # fit points around the superellipse

P3 = adsk.core.Point3D
VI = adsk.core.ValueInput.createByString
CUT = adsk.fusion.FeatureOperations.CutFeatureOperation
JOIN = adsk.fusion.FeatureOperations.JoinFeatureOperation
NEW = adsk.fusion.FeatureOperations.NewBodyFeatureOperation


# ------------------------------------------------------------------
#  Sketch helpers
# ------------------------------------------------------------------
def _plane_axes(sk):
    """In-plane model axes and the dimension orientation for each."""
    o = sk.modelToSketchSpace(P3.create(0, 0, 0))
    moves = {}
    for ax, v in (("x", (1, 0, 0)), ("y", (0, 1, 0)), ("z", (0, 0, 1))):
        t = sk.modelToSketchSpace(P3.create(*v))
        moves[ax] = (abs(t.x - o.x), abs(t.y - o.y))
    orient = {}
    for ax, (mx, my) in moves.items():
        if mx > 0.5:
            orient[ax] = sp.H
        elif my > 0.5:
            orient[ax] = sp.V
    return orient


def rect(comp, plane, c0, c1, name, ev):
    """Constrained rectangle between model corners c0 and c1.

    c0/c1 are (x, y, z) expression tuples; c1 >= c0 on the in-plane axes.
    Width/height are dimensioned as (c1 - c0); the c0 corner is located
    from the sketch origin with abs() so negative coordinates work.
    """
    sk = comp.sketches.add(plane)
    sk.name = name
    a = sk.modelToSketchSpace(P3.create(*[ev(e) for e in c0]))
    b = sk.modelToSketchSpace(P3.create(*[ev(e) for e in c1]))
    r = sk.sketchCurves.sketchLines.addTwoPointRectangle(
        P3.create(a.x, a.y, 0), P3.create(b.x, b.y, 0))
    gc = sk.geometricConstraints
    gc.addHorizontal(r[0]); gc.addHorizontal(r[2])
    gc.addVertical(r[1]); gc.addVertical(r[3])
    orient = _plane_axes(sk)
    d = sk.sketchDimensions
    # corner point nearest c0
    pts = [r[i].startSketchPoint for i in range(4)]
    p0 = min(pts, key=lambda p: (p.geometry.x - a.x) ** 2 + (p.geometry.y - a.y) ** 2)
    idx = "xyz"
    for ax, ori in orient.items():
        i = idx.index(ax)
        span = f"({c1[i]}) - ({c0[i]})"
        line = r[0] if ori == sp.H else r[1]
        mid = P3.create((a.x + b.x) / 2 + 0.7, (a.y + b.y) / 2 + 0.7, 0)
        d.addDistanceDimension(line.startSketchPoint, line.endSketchPoint, ori, mid
                               ).parameter.expression = span
        if abs(ev(c0[i])) > 1e-4:
            d.addDistanceDimension(sk.originPoint, p0, ori,
                                   P3.create(a.x / 2 + 0.3, a.y / 2 + 0.3, 0)
                                   ).parameter.expression = f"abs({c0[i]})"
    return sk, sk.profiles.item(0)


def circle(comp, plane, center, dia_expr, name, ev):
    """Circle with parametric diameter and centre (positive coordinates)."""
    sk = comp.sketches.add(plane)
    sk.name = name
    sc = sk.modelToSketchSpace(P3.create(*[ev(e) for e in center]))
    c = sk.sketchCurves.sketchCircles.addByCenterRadius(
        P3.create(sc.x, sc.y, 0), ev(dia_expr) / 2)
    d = sk.sketchDimensions
    d.addDiameterDimension(c, P3.create(sc.x + 1, sc.y + 1, 0)).parameter.expression = dia_expr
    for ax, ori in _plane_axes(sk).items():
        e = center["xyz".index(ax)]
        if abs(ev(e)) > 1e-4:
            d.addDistanceDimension(sk.originPoint, c.centerSketchPoint, ori,
                                   P3.create(sc.x / 2 + 0.4, sc.y / 2 + 0.4, 0)
                                   ).parameter.expression = e
    return sk, sk.profiles.item(0)


def loft(comp, profiles, name):
    inp = comp.features.loftFeatures.createInput(NEW)
    for p in profiles:
        inp.loftSections.add(p)
    f = comp.features.loftFeatures.add(inp)
    f.name = name
    return f


def ext_sym_cut(comp, prof, half_expr, body, name):
    inp = comp.features.extrudeFeatures.createInput(prof, CUT)
    inp.setDistanceExtent(True, VI(half_expr))
    inp.participantBodies = [body]
    f = comp.features.extrudeFeatures.add(inp)
    f.name = name
    return f


def ext_down(comp, prof, dist_expr, name, taper_expr="0 deg"):
    inp = comp.features.extrudeFeatures.createInput(prof, NEW)
    inp.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(VI(dist_expr)),
                         adsk.fusion.ExtentDirections.NegativeExtentDirection,
                         VI(taper_expr))
    f = comp.features.extrudeFeatures.add(inp)
    f.name = name
    return f


def fillet(comp, edges, r_expr, name):
    inp = comp.features.filletFeatures.createInput()
    inp.addConstantRadiusEdgeSet(edges, VI(r_expr), True)
    f = comp.features.filletFeatures.add(inp)
    f.name = name
    return f


def face_edges(face):
    coll = adsk.core.ObjectCollection.create()
    for i in range(face.edges.count):
        coll.add(face.edges.item(i))
    return coll


# ------------------------------------------------------------------
#  Parameters
# ------------------------------------------------------------------
LIBRARY_PARAMS = [
    # shared frame - the mounting interface
    ("table_h",   "16 in",     "in", "Overall height"),
    ("top_t",     "1 in",      "in", "Top thickness (all tops)"),
    ("leg_cx",    "19 in",     "in", "Leg centre, X from middle"),
    ("leg_cy",    "7.5 in",    "in", "Leg centre, Y from middle"),
    ("leg_sq",    "1.75 in",   "in", "Leg head section (all legs)"),
    ("head_h",    "3 in",      "in", "Square leg head height (apron zone)"),
    ("apron_t",   "0.75 in",   "in", "Apron thickness"),
    ("apron_set", "0.25 in",   "in", "Apron setback from leg face"),
    ("ten_t",     "0.375 in",  "in", "Tenon thickness"),
    ("ten_h",     "1.25 in",   "in", "Tenon height"),
    ("ten_d",     "0.75 in",   "in", "Tenon depth into leg"),
    # legs
    ("foot_sq",   "1 in",      "in", "Square legs: foot size"),
    ("leg_dia",   "1.75 in",   "in", "Round taper: diameter under head"),
    ("foot_dia",  "0.875 in",  "in", "Round legs: foot diameter"),
    ("splay_dia", "1.625 in",  "in", "Splayed: diameter under head"),
    ("splay_ang", "8 deg",     "deg", "Splayed: splay angle on the diagonal"),
    # aprons
    ("apron_h",   "3 in",      "in", "Straight/arched apron height"),
    ("slim_h",    "1.5 in",    "in", "Slim apron height"),
    ("arch_long", "1.25 in",   "in", "Arch rise, long aprons"),
    ("arch_short", "0.75 in",  "in", "Arch rise, short aprons"),
    # tops
    ("top_l",     "48 in",     "in", "Rectangular tops: length"),
    ("top_w",     "22 in",     "in", "Rectangular tops: depth"),
    ("top_bevel", "18.5 deg",  "deg", "Bevel top: undercut angle"),
    ("corner_r",  "4 in",      "in", "Rounded top: corner radius"),
    ("edge_r",    "0.125 in",  "in", "Edge round-over"),
    ("se_l",      "54 in",     "in", "Superellipse top: length"),
    ("se_w",      "24 in",     "in", "Superellipse top: depth"),
]
DERIVED_PARAMS = [
    ("apron_top", "table_h - top_t",                       "in", "Top underside / apron top"),
    ("head_z0",   "apron_top - head_h",                    "in", "Bottom of leg head"),
    ("long_half", "leg_cx - leg_sq / 2",                   "in", "Long rail half length (leg face)"),
    ("short_half", "leg_cy - leg_sq / 2",                  "in", "Short rail half length (leg face)"),
    ("rail_y",    "leg_cy + leg_sq / 2 - apron_set - apron_t / 2", "in", "Long rail centre Y"),
    ("rail_x",    "leg_cx + leg_sq / 2 - apron_set - apron_t / 2", "in", "Short rail centre X"),
    ("ten_z0",    "apron_top - slim_h / 2 - ten_h / 2",    "in", "Tenon bottom (fits every apron)"),
    ("splay_off", "head_z0 * tan(splay_ang)",              "in", "Splay foot offset"),
    ("splay_dx",  "splay_off * leg_cx / sqrt(leg_cx ^ 2 + leg_cy ^ 2)", "in", "Splay offset X"),
    ("splay_dy",  "splay_off * leg_cy / sqrt(leg_cx ^ 2 + leg_cy ^ 2)", "in", "Splay offset Y"),
]


def design_params(path):
    """Parameter values, shapes and part options for a web-app design."""
    import json
    with open(path, encoding="utf-8") as f:
        p = json.load(f)["params"]
    inch = lambda v: f"{v} in"
    leg_cx = p["table_l"] / 2 - p["inset_x"]
    leg_cy = p["table_w"] / 2 - p["inset_y"]
    vals = {
        "table_h": inch(p["table_h"]), "top_t": inch(p["top_t"]),
        "leg_cx": inch(leg_cx), "leg_cy": inch(leg_cy),
        "leg_sq": inch(p["leg_sq"]), "head_h": inch(max(3, p["apron_h"])),
        "apron_t": inch(p["apron_t"]), "apron_set": inch(p["apron_set"]),
        "foot_sq": inch(p["foot"]), "foot_dia": inch(p["foot"]),
        "leg_dia": inch(p["leg_sq"]), "splay_dia": inch(p["leg_sq"]),
        "splay_ang": f"{p['splay_ang']} deg",
        # the design's apron is the only one, so the tenon centres on it
        "apron_h": inch(p["apron_h"]), "slim_h": inch(p["apron_h"]),
        "arch_long": inch(max(p["arch_rise"], 0.0001)),
        "arch_short": inch(max(p["arch_rise"] * 0.6, 0.0001)),
        "top_l": inch(p["table_l"]), "top_w": inch(p["table_w"]),
        "se_l": inch(p["table_l"]), "se_w": inch(p["table_w"]),
        "top_bevel": f"{p['top_bevel']} deg",
        "corner_r": inch(max(p["corner_r"], 0.0001)), "edge_r": inch(max(p["edge_r"], 0.0001)),
    }
    opts = {
        "top": {"mode": p["top_mode"], "n": p["se_n"], "bevel": p["top_bevel"] > 0,
                "corners": p["top_mode"] == "rect" and p["corner_r"] > 0.01,
                "edges": p["edge_r"] > 0.01},
        "legs": {"section": p["leg_section"], "splay": p["splay_ang"] > 0.01},
        "aprons": {"z0": "apron_top - apron_h", "arched": p["arch_rise"] > 0.01},
        "species": {"walnut": "walnut", "teak": "teak", "oak": "white oak"}.get(p.get("finish"), "walnut"),
    }
    return vals, opts


# ------------------------------------------------------------------
#  Build
# ------------------------------------------------------------------
def build(design_file=""):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    design.designType = adsk.fusion.DesignTypes.ParametricDesignType
    root = design.rootComponent
    params = design.userParameters
    ev = lambda e: (params.itemByName(e).value if params.itemByName(e)
                    else design.unitsManager.evaluateExpression(e, "cm"))

    overrides, opts = design_params(design_file) if design_file else ({}, None)
    for name, expr, unit, note in LIBRARY_PARAMS:
        params.add(name, VI(overrides.get(name, expr)), unit, note)
    for name, expr, unit, note in DERIVED_PARAMS:
        params.add(name, VI(expr), unit, note)

    # ==============================================================
    #  LEGS - build the back-right (+X +Y) leg, mirror to the others
    #  section: "square" (tapered on the inside faces) or "round"
    # ==============================================================
    def leg_set(cname, section, shaft_dia, foot_expr, splay):
        occ = sp.make_comp(root, cname)
        c = occ.component
        head_pl = sp.off_plane(c, c.xYConstructionPlane, "head_z0", "Head_Pl")
        hx0, hy0 = "leg_cx - leg_sq / 2", "leg_cy - leg_sq / 2"
        hx1, hy1 = "leg_cx + leg_sq / 2", "leg_cy + leg_sq / 2"
        _, head_pr = rect(c, head_pl, (hx0, hy0, "head_z0"), (hx1, hy1, "head_z0"),
                          "Head_Sk", ev)
        sx = " + splay_dx" if splay else ""
        sy = " + splay_dy" if splay else ""
        if section == "square":
            fx1, fy1 = hx1 + sx, hy1 + sy
            _, foot_pr = rect(c, c.xYConstructionPlane,
                              (f"{fx1} - {foot_expr}", f"{fy1} - {foot_expr}", "0 in"),
                              (fx1, fy1, "0 in"), "Foot_Sk", ev)
            top_pr = head_pr
        else:
            _, foot_pr = circle(c, c.xYConstructionPlane, ("leg_cx" + sx, "leg_cy" + sy, "0 in"),
                                foot_expr, "Foot_Sk", ev)
            _, top_pr = circle(c, head_pl, ("leg_cx", "leg_cy", "head_z0"), shaft_dia,
                               "Shaft_Sk", ev)
        body = loft(c, [foot_pr, top_pr], "Shaft_BR").bodies.item(0)
        body.name = "Leg_BR"
        sp.ext_op(c, head_pr, "head_h", JOIN, body, "Head_BR")
        bl = sp.mirror_body(c, body, c.yZConstructionPlane, "Leg_BL_Mir").bodies.item(0)
        bl.name = "Leg_BL"
        m = sp.mirror_bodies(c, [body, bl], c.xZConstructionPlane, "Legs_Front_Mir")
        fr, fl = m.bodies.item(0), m.bodies.item(1)
        fr.name, fl.name = "Leg_FR", "Leg_FL"
        return occ, {"BR": body, "BL": bl, "FR": fr, "FL": fl}

    # ==============================================================
    #  APRONS - back rail and right rail built, mirrored to front/left
    # ==============================================================
    def apron_set(cname, z0, arched):
        occ = sp.make_comp(root, cname)
        c = occ.component
        # Back rail (+Y), centred on the plane at rail_y
        back_pl = sp.off_plane(c, c.xZConstructionPlane, "rail_y", "RailBack_Pl")
        _, pr = rect(c, back_pl, ("-long_half", "rail_y", z0),
                     ("long_half", "rail_y", "apron_top"), "RailBack_Sk", ev)
        back = sp.ext_new_sym(c, pr, "apron_t / 2", "RailBack").bodies.item(0)
        # Right rail (+X)
        right_pl = sp.off_plane(c, c.yZConstructionPlane, "rail_x", "RailRight_Pl")
        _, pr = rect(c, right_pl, ("rail_x", "-short_half", z0),
                     ("rail_x", "short_half", "apron_top"), "RailRight_Sk", ev)
        right = sp.ext_new_sym(c, pr, "apron_t / 2", "RailRight").bodies.item(0)

        if arched:
            for pl, body, half, rise, ax, tag in (
                    (back_pl, back, "long_half", "arch_long", "x", "Back"),
                    (right_pl, right, "short_half", "arch_short", "y", "Right")):
                sk = c.sketches.add(pl)
                sk.name = f"Arch{tag}_Sk"
                def mp(u, z):
                    if ax == "x":
                        p = P3.create(u, ev("rail_y"), z)
                    else:
                        p = P3.create(ev("rail_x"), u, z)
                    q = sk.modelToSketchSpace(p)
                    return P3.create(q.x, q.y, 0)
                zb = ev(z0)
                ln = sk.sketchCurves.sketchLines.addByTwoPoints(
                    mp(-ev(half), zb), mp(ev(half), zb))
                sk.sketchCurves.sketchArcs.addByThreePoints(
                    ln.startSketchPoint, mp(0, zb + ev(rise)), ln.endSketchPoint)
                ext_sym_cut(c, sk.profiles.item(0), "apron_t", body, f"Arch{tag}_Cut")

        # Tenons: one per rail end, built at +end, mirrored to -end, joined
        _, pr = rect(c, sp.off_plane(c, c.yZConstructionPlane, "long_half", "TenBack_Pl"),
                     ("long_half", "rail_y - ten_t / 2", "ten_z0"),
                     ("long_half", "rail_y + ten_t / 2", "ten_z0 + ten_h"), "TenBack_Sk", ev)
        tb = sp.ext_new(c, pr, "ten_d", "TenBack").bodies.item(0)
        tb2 = sp.mirror_body(c, tb, c.yZConstructionPlane, "TenBack_Mir").bodies.item(0)
        sp.combine(c, back, [tb, tb2], JOIN, False, "TenBack_Join")
        _, pr = rect(c, sp.off_plane(c, c.xZConstructionPlane, "short_half", "TenRight_Pl"),
                     ("rail_x - ten_t / 2", "short_half", "ten_z0"),
                     ("rail_x + ten_t / 2", "short_half", "ten_z0 + ten_h"), "TenRight_Sk", ev)
        tr = sp.ext_new(c, pr, "ten_d", "TenRight").bodies.item(0)
        tr2 = sp.mirror_body(c, tr, c.xZConstructionPlane, "TenRight_Mir").bodies.item(0)
        sp.combine(c, right, [tr, tr2], JOIN, False, "TenRight_Join")

        back.name, right.name = "Apron_Back", "Apron_Right"
        front = sp.mirror_body(c, back, c.xZConstructionPlane, "Front_Mir").bodies.item(0)
        left = sp.mirror_body(c, right, c.yZConstructionPlane, "Left_Mir").bodies.item(0)
        front.name, left.name = "Apron_Front", "Apron_Left"
        return occ, {"B": back, "F": front, "R": right, "L": left}

    # ==============================================================
    #  TOPS - underside at apron_top
    # ==============================================================
    def top_part(cname, mode, n=SE_N, bevel=False, corners=False, edges=False):
        occ = sp.make_comp(root, cname)
        c = occ.component
        pl = sp.off_plane(c, c.xYConstructionPlane, "table_h", "TopFace_Pl")
        if mode == "rect":
            _, pr = rect(c, pl, ("-top_l / 2", "-top_w / 2", "table_h"),
                         ("top_l / 2", "top_w / 2", "table_h"), "Top_Sk", ev)
        else:
            sk = c.sketches.add(pl)
            sk.name = "Top_Sk"
            a, b = ev("se_l") / 2, ev("se_w") / 2
            pts = adsk.core.ObjectCollection.create()
            for i in range(SE_POINTS):
                t = 2 * math.pi * i / SE_POINTS
                ct, st = math.cos(t), math.sin(t)
                x = a * math.copysign(abs(ct) ** (2 / n), ct)
                y = b * math.copysign(abs(st) ** (2 / n), st)
                q = sk.modelToSketchSpace(P3.create(x, y, ev("table_h")))
                pts.add(P3.create(q.x, q.y, 0))
            spl = sk.sketchCurves.sketchFittedSplines.add(pts)
            spl.isClosed = True
            pr = sk.profiles.item(0)
        f = ext_down(c, pr, "top_t", "TopBoard", "-top_bevel" if bevel else "0 deg")
        top = f.bodies.item(0)
        if corners:
            coll = adsk.core.ObjectCollection.create()
            for e in sp.find_edges(top, "z"):
                coll.add(e)
            if coll.count == 0:   # bevelled sides: corner edges are not vertical
                for e in edge_list(top):
                    a0, a1 = e.startVertex.geometry, e.endVertex.geometry
                    if abs(a0.z - a1.z) > 0.1:
                        coll.add(e)
            fillet(c, coll, "corner_r", "Corners_Fil")
            top = f.bodies.item(0)
        if edges:
            fillet(c, face_edges(sp.find_face(top, "z", +1)), "edge_r", "TopEdge_Fil")
            top = f.bodies.item(0)
            fillet(c, face_edges(sp.find_face(top, "z", -1)), "edge_r", "UnderEdge_Fil")
            top = f.bodies.item(0)
        top.name = "Top"
        return occ, top

    if opts is None:
        legs = {
            "Legs_SquareTaper": leg_set("Legs_SquareTaper", "square", "leg_sq", "foot_sq", False),
            "Legs_RoundTaper": leg_set("Legs_RoundTaper", "round", "leg_dia", "foot_dia", False),
            "Legs_Splayed": leg_set("Legs_Splayed", "round", "splay_dia", "foot_dia", True),
        }
        aprons = {
            "Aprons_Straight": apron_set("Aprons_Straight", "apron_top - apron_h", False),
            "Aprons_Arched": apron_set("Aprons_Arched", "apron_top - apron_h", True),
            "Aprons_Slim": apron_set("Aprons_Slim", "apron_top - slim_h", False),
        }
        top_part("Top_Bevel", "rect", bevel=True)
        top_part("Top_Rounded", "rect", corners=True, edges=True)
        top_part("Top_Superellipse", "se", edges=True)
        mortise_set = "Aprons_Straight"
        species = SPECIES
    else:
        L, A, T = opts["legs"], opts["aprons"], opts["top"]
        foot = "foot_sq" if L["section"] == "square" else "foot_dia"
        legs = {"Legs": leg_set("Legs", L["section"], "leg_dia", foot, L["splay"])}
        aprons = {"Aprons": apron_set("Aprons", A["z0"], A["arched"])}
        top_part("Top", T["mode"], T["n"], T["bevel"], T["corners"], T["edges"])
        mortise_set = "Aprons"
        species = opts["species"]
    print(f">>> Legs: {len(legs)} sets, aprons: {len(aprons)} sets")

    # ==============================================================
    #  MORTISES (root) - every leg set is cut by one apron set.
    #  All apron sets share the same tenons, so one mortise fits all.
    # ==============================================================
    a_occ, A_bodies = aprons[mortise_set]
    AP = {k: b.createForAssemblyContext(a_occ) for k, b in A_bodies.items()}
    rails_for = {"BR": ("B", "R"), "BL": ("B", "L"), "FR": ("F", "R"), "FL": ("F", "L")}
    for lname, (l_occ, Lb) in legs.items():
        for corner, body in Lb.items():
            tools = [AP[k] for k in rails_for[corner]]
            sp.combine(root, body.createForAssemblyContext(l_occ), tools, CUT, True,
                       f"Mortise_{lname}_{corner}")
    print(f">>> Mortises: {4 * len(legs)}")

    # ==============================================================
    #  EPILOGUE
    # ==============================================================
    for occ in root.occurrences:
        c = occ.component
        for s in c.sketches:
            s.isVisible = False
        for cp in c.constructionPlanes:
            cp.isLightBulbOn = False
        print(f"{c.name}: {[c.bRepBodies.item(i).name for i in range(c.bRepBodies.count)]}")
    sp.apply_appearance(species)


def edge_list(body):
    return [body.edges.item(i) for i in range(body.edges.count)]


def run(context):
    if context is None:          # ShopPrentice add-in: active, cleaned document
        build(DESIGN_FILE)
        return
    import traceback
    app = adsk.core.Application.get()
    try:
        path = DESIGN_FILE
        if not path:
            dlg = app.userInterface.createFileDialog()
            dlg.title = "Saved coffee table design (Cancel = build the parts library)"
            dlg.filter = "Design (*.json)"
            if dlg.showOpen() == adsk.core.DialogResults.DialogOK:
                path = dlg.filename
        app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
        build(path)
        app.activeViewport.fit()
    except Exception:
        app.userInterface.messageBox("Build failed:\n" + traceback.format_exc())
