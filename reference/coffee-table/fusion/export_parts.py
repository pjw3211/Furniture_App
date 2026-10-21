"""Export every part component as STL and OBJ (millimetres, Fusion frame:
origin at the floor centre, Z up), plus the whole library as .f3d.

Run after coffee_table_parts.py. Output goes to ../models/stl, ../models/obj.
"""
import os

import adsk.core
import adsk.fusion

OUT = os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop", "Mid Century",
                   "Coffee Table Configurator")


def run(context):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    em = design.exportManager
    mm = adsk.fusion.DistanceUnits.MillimeterDistanceUnits
    stl_dir = os.path.join(OUT, "models", "stl")
    obj_dir = os.path.join(OUT, "models", "obj")
    os.makedirs(stl_dir, exist_ok=True)
    os.makedirs(obj_dir, exist_ok=True)
    for occ in design.rootComponent.occurrences:
        occ.isLightBulbOn = True
        name = occ.component.name
        o = em.createSTLExportOptions(occ, os.path.join(stl_dir, name + ".stl"))
        o.unitType = mm
        o.isBinaryFormat = True
        o.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementHigh
        em.execute(o)
        o = em.createOBJExportOptions(occ, os.path.join(obj_dir, name + ".obj"))
        o.unitType = mm
        o.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementHigh
        em.execute(o)
        print("exported", name)
    f3d = os.path.join(OUT, "fusion", "Coffee Table Parts.f3d")
    em.execute(em.createFusionArchiveExportOptions(f3d))
    print("saved", f3d)
