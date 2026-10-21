"""Check every top + legs + aprons combination for overlaps and gaps.

For each of the 27 combinations, runs Fusion's interference analysis on
the 9 bodies and reports any overlap volume. Also prints each part's
bounding box in inches.
"""
import itertools

import adsk.core
import adsk.fusion

CM3_TO_IN3 = 1 / 16.387064


def run(context):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent
    occs = {o.component.name: o for o in root.occurrences}

    def bodies(name):
        o = occs[name]
        return [o.component.bRepBodies.item(i).createForAssemblyContext(o)
                for i in range(o.component.bRepBodies.count)]

    for name, o in occs.items():
        bb = o.boundingBox
        mn = [round(v / 2.54, 3) for v in (bb.minPoint.x, bb.minPoint.y, bb.minPoint.z)]
        mx = [round(v / 2.54, 3) for v in (bb.maxPoint.x, bb.maxPoint.y, bb.maxPoint.z)]
        print(f"{name:18s} min {mn}  max {mx}")

    tops = [n for n in occs if n.startswith("Top_")]
    legs = [n for n in occs if n.startswith("Legs_")]
    aprons = [n for n in occs if n.startswith("Aprons_")]
    bad = 0
    for t, l, a in itertools.product(tops, legs, aprons):
        coll = adsk.core.ObjectCollection.create()
        for b in bodies(t) + bodies(l) + bodies(a):
            coll.add(b)
        inp = design.createInterferenceInput(coll)
        inp.areCoincidentFacesIncluded = False
        res = design.analyzeInterference(inp)
        vols = []
        for i in range(res.count):
            r = res.item(i)
            v = r.interferenceBody.volume * CM3_TO_IN3 if r.interferenceBody else 0
            if v > 1e-4:
                vols.append((r.entityOne.name, r.entityTwo.name, round(v, 4)))
        status = "OK" if not vols else f"OVERLAP {vols}"
        bad += bool(vols)
        print(f"{t:17s} + {l:17s} + {a:16s}: {status}")
    print(f"RESULT: {27 - bad}/27 combinations clean")
