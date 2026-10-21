"""Turn the Fusion STL exports into GLB files, the parts catalogue and the
web app's embedded data file.

    python build_web_assets.py

Reads   ../models/stl/*.stl   (millimetres, Z up, origin at floor centre)
Writes  ../models/glb/*.glb   (metres, Y up - the glTF convention; same origin)
        ../parts.json         (the parts catalogue)
        ../app/parts_data.js  (catalogue + GLBs as base64, so index.html
                               works when opened straight from disk)
"""
import base64
import json
import os
import struct

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STL = os.path.join(ROOT, "models", "stl")
GLB = os.path.join(ROOT, "models", "glb")
CREASE_DEG = 35

IN = 25.4  # mm per inch

FRAME = {
    "units": {"glb": "metres", "stl": "millimetres", "obj": "millimetres"},
    "axes": {"glb": "Y up, front of table faces +Z",
             "stl": "Z up, front of table faces -Y",
             "obj": "Z up, front of table faces -Y"},
    "origin": "Floor, centre of the table. Every part is exported in place, "
              "so parts assemble with no transform.",
    "mounting_interface_in": {
        "table_height": 16,
        "top_underside_z": 15,
        "leg_centres_xy": [[19, 7.5], [-19, 7.5], [19, -7.5], [-19, -7.5]],
        "leg_head": "1-3/4 in square, Z 12 to 15 in, on every leg set",
        "mortise_and_tenon": "3/8 x 1-1/4 x 3/4 in deep, Z 13-5/8 to 14-7/8 in, "
                             "same on every leg and apron set",
        "long_rail_centre_y": 7.75,
        "short_rail_centre_x": 19.25,
    },
}

PARTS = [
    # id, category, name, description, colour
    ("Top_Bevel", "top", "Bevelled edge",
     "48 x 22 x 1 in. Finn Juhl's 18.5 degree undercut edge makes the top look "
     "thinner than it is."),
    ("Top_Rounded", "top", "Rounded rectangle",
     "48 x 22 x 1 in with 4 in radius corners and 1/8 in round-overs."),
    ("Top_Superellipse", "top", "Superellipse",
     "54 x 24 x 1 in. Piet Hein's superellipse (1964): between an oval and a "
     "rectangle."),
    ("Legs_SquareTaper", "legs", "Square tapered",
     "1-3/4 in square, tapered on the two inside faces to a 1 in foot. "
     "Classic Danish."),
    ("Legs_RoundTaper", "legs", "Round tapered",
     "Square head, then round, tapering from 1-3/4 to 7/8 in. Straight down."),
    ("Legs_Splayed", "legs", "Splayed",
     "Square head, round below, splayed 8 degrees outward on the diagonal, "
     "1-5/8 to 7/8 in."),
    ("Aprons_Straight", "aprons", "Straight",
     "3/4 x 3 in rails, set back 1/4 in from the leg faces."),
    ("Aprons_Arched", "aprons", "Arched",
     "3/4 x 3 in rails with an arched lower edge (1-1/4 in rise long, "
     "3/4 in short)."),
    ("Aprons_Slim", "aprons", "Slim",
     "3/4 x 1-1/2 in rails for a lighter, floating look."),
]
COLOUR = {"top": [0.36, 0.22, 0.13], "legs": [0.30, 0.18, 0.10],
          "aprons": [0.33, 0.20, 0.11]}


def read_stl(path):
    with open(path, "rb") as f:
        data = f.read()
    n = struct.unpack_from("<I", data, 80)[0]
    rec = np.frombuffer(data, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)),
                                              ("a", "<u2")]), count=n, offset=84)
    return rec["v"].astype(np.float64)  # (n, 3, 3) mm


def mesh(tris_mm):
    """Index the triangles with crease-angle smoothed normals.

    Returns positions (metres, Y up), normals, indices, bbox (inches, Z up).
    """
    t = tris_mm
    fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    area = np.linalg.norm(fn, axis=1)
    keep = area > 1e-9
    t, fn, area = t[keep], fn[keep], area[keep]
    fu = fn / area[:, None]
    corners = t.reshape(-1, 3)
    key = np.round(corners / 0.01).astype(np.int64)
    _, gid = np.unique(key, axis=0, return_inverse=True)
    gid = gid.reshape(-1)
    face_of = np.repeat(np.arange(len(t)), 3)
    groups = {}
    for ci, g in enumerate(gid):
        groups.setdefault(g, []).append(ci)
    cos_c = np.cos(np.radians(CREASE_DEG))
    normals = np.zeros_like(corners)
    for members in groups.values():
        fs = face_of[members]
        nus = fu[fs]
        ws = fn[fs]  # area weighted
        sim = nus @ nus.T >= cos_c
        acc = sim.astype(float) @ ws
        acc /= np.linalg.norm(acc, axis=1, keepdims=True)
        normals[members] = acc
    # dedupe (position, normal)
    k2 = np.hstack([key, np.round(normals * 1000).astype(np.int64)])
    uniq, first, inv = np.unique(k2, axis=0, return_index=True, return_inverse=True)
    pos_mm = corners[first]
    nrm = normals[first]
    idx = inv.reshape(-1).astype(np.uint32)
    # Fusion (X, Y, Z-up) -> glTF (X, Y-up, Z toward viewer = -Fusion Y)
    pos = np.column_stack([pos_mm[:, 0], pos_mm[:, 2], -pos_mm[:, 1]]) / 1000.0
    nr = np.column_stack([nrm[:, 0], nrm[:, 2], -nrm[:, 1]])
    bb = (corners.min(axis=0) / IN, corners.max(axis=0) / IN)
    return pos.astype(np.float32), nr.astype(np.float32), idx, bb, len(t)


def write_glb(path, name, pos, nrm, idx, colour):
    pb, nb, ib = pos.tobytes(), nrm.tobytes(), idx.tobytes()
    pad = lambda b: b + b"\0" * ((4 - len(b) % 4) % 4)
    blob = pad(pb) + pad(nb) + pad(ib)
    o_n = len(pad(pb))
    o_i = o_n + len(pad(nb))
    gltf = {
        "asset": {"version": "2.0", "generator": "build_web_assets.py"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name, "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
        "materials": [{"name": "Walnut", "pbrMetallicRoughness": {
            "baseColorFactor": colour + [1.0], "metallicFactor": 0.0,
            "roughnessFactor": 0.6}}],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pb), "target": 34962},
            {"buffer": 0, "byteOffset": o_n, "byteLength": len(nb), "target": 34962},
            {"buffer": 0, "byteOffset": o_i, "byteLength": len(ib), "target": 34963}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(pos), "type": "VEC3",
             "min": pos.min(axis=0).tolist(), "max": pos.max(axis=0).tolist()},
            {"bufferView": 1, "componentType": 5126, "count": len(nrm), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125, "count": len(idx), "type": "SCALAR"}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(blob), 0x004E4942) + blob
    with open(path, "wb") as f:
        f.write(out)
    return out


def main():
    os.makedirs(GLB, exist_ok=True)
    catalogue = dict(FRAME, categories=[
        {"id": "top", "name": "Top"}, {"id": "legs", "name": "Legs"},
        {"id": "aprons", "name": "Aprons"}], parts=[])
    embedded = {}
    for pid, cat, name, desc in PARTS:
        pos, nrm, idx, bb, ntri = mesh(read_stl(os.path.join(STL, pid + ".stl")))
        glb = write_glb(os.path.join(GLB, pid + ".glb"), pid, pos, nrm, idx, COLOUR[cat])
        embedded[pid] = base64.b64encode(glb).decode()
        catalogue["parts"].append({
            "id": pid, "category": cat, "name": name, "description": desc,
            "bbox_in": {"min": [round(v, 3) for v in bb[0]],
                        "max": [round(v, 3) for v in bb[1]]},
            "triangles": ntri,
            "files": {"glb": f"models/glb/{pid}.glb", "stl": f"models/stl/{pid}.stl",
                      "obj": f"models/obj/{pid}.obj"},
        })
        print(f"{pid:18s} {ntri:6d} tris  {len(glb) / 1024:7.1f} KB")
    with open(os.path.join(ROOT, "parts.json"), "w", encoding="utf-8") as f:
        json.dump(catalogue, f, indent=2)
    with open(os.path.join(ROOT, "app", "parts_data.js"), "w", encoding="utf-8") as f:
        f.write("// Generated by fusion/build_web_assets.py - do not edit.\n")
        f.write("window.PARTS_CATALOGUE = ")
        json.dump(catalogue, f)
        f.write(";\nwindow.PARTS_GLB = ")
        json.dump(embedded, f)
        f.write(";\n")
    print("wrote parts.json and app/parts_data.js")


if __name__ == "__main__":
    main()
