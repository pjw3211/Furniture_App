# Coffee table joinery models

Reference models for every joint option on the coffee table checklist
(https://claude.ai/artifact/3a81VZ6hmWgmFQuiW6Pojh). Each model is built two
ways from the same data:

- by the app's own solid engine, in the automated tests (`tests/joinery.test.js`),
  which check that no parts overlap, every joint is in place, and the full
  table matches the Fusion reference parts in `../parts.json`;
- by Fusion, with the script in `build_joinery/`, so you can look at each
  model, check it would be good to make, and export STEP files.

## What's here

| Folder | What it is |
| --- | --- |
| `build_joinery/` | The Fusion script and the model data it reads (`specs/`). |
| `profiles-dxf/` | The drawn profiles (legs, aprons, top outlines, edges) as DXF, ready for CNC or printing as templates. The `CUT` layer is the outline; `STRETCH` lines mark where the app may stretch it. |

## Models

| Id | Checklist | What it shows |
| --- | --- | --- |
| A1-mt-haunched, -side | A1 | Haunched mortise and tenon, mitred tenon ends (coffee and side table) |
| A1-mt-router | A1 | Router/CNC version with round-ended mortises |
| A2-loose-tenon, -side | A2 | Domino 8 × 40 loose tenons (side table staggered) |
| A3-dowels, -side | A3 | 10 mm dowels (side table staggered) |
| A4-bracket-bolt | A4 | Steel corner bracket, M8 hanger bolt, alignment dowels |
| A5-pocket-screws | A5 | Two pocket screws per apron end |
| A6-through-wedged | A6 | Through tenons at different heights, wedged |
| B1-splay-straight-6, -10 | B1 | Straight leg leaning out, apron shoulders cut to match |
| B2-leg-plate | B2 | Splayed round leg on an angled block with a hanger bolt |
| B3-bent-leg | B3 | Today's bent leg and the rough blank it needs |
| C1 to C4 | C | Buttons, Z-clips, figure-8s, slotted corner block |
| D1-glue-up-bevel, -rounded | D1 | Solid top from five boards |
| D2-veneered | D2 | Veneered core, mitred solid lipping, splines |
| E1 to E3 | E | Shelf on cleats, slatted shelf, panel in grooved stretchers |
| F1 to F3 | F | Brass ferrule, levelling glide, felt pad |
| H-hardware | H | Every bought part on its own |
| T1-default-table | — | The whole table built from the "First" choices |

Hardware marked "placeholder size" (Z-clips, figure-8s, bracket, ferrule)
should be measured from the parts you buy, then the sizes updated.

## Running it in Fusion

1. Copy the whole `build_joinery` folder to your computer.
2. In Fusion: **Utilities > Add-Ins > Scripts and Add-Ins**.
3. Click the **+** next to "My Scripts" and pick the `build_joinery` folder.
4. Select **build_joinery** and click **Run**. It opens a new design and takes a few minutes.
5. When it finishes, a message says where the files went: an `exports` folder
   next to the script with one STEP file per model, the profile DXFs,
   `joinery.f3d`, and `log.txt` (send that to Claude if anything failed).

To build only some models, open `build_joinery.py` and list their ids in
`ONLY`, e.g. `ONLY = ["A1-mt-haunched"]`.

## Changing a model

The models are written in `src/cad/joinery/`. After a change, run
`npm run joinery:specs` to rewrite the JSON and DXF files, then `npm test`.

Units are millimetres. Frame: Z up, X along the table length, front of the
table faces -Y, origin on the floor at the centre of the table, the same as
the app's STL exports.
