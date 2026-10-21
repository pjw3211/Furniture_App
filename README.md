# Mid-Century Furniture Designer

Design mid-century modern furniture with sliders, arrange it in a living room, and (soon) export every part as STL, DXF and workshop drawings. A community area for sharing, rating and remixing designs comes later.

**Use it:** https://pjw3211.github.io/Furniture_App/ (live once GitHub Pages is switched on, see below).

![Living room view](public/preview.png)

## What it does today

- **Design a piece:** coffee table, side table, sofa, lounge chair, credenza and bookcase. Pick a style from the pictures, then fine-tune with sliders. Woods: walnut, teak, white oak, rosewood.
- **Living room:** place your saved pieces, move and turn them, and change the room size, walls, floor, rug and light.
- **Save:** pieces and the room are kept in your browser. Download design and Save room file keep a copy.
- **Parts for making (coffee table and side table):** every part is built as an exact solid with its mortise and tenon joints cut. Download any part as an STL or a DXF template, the cut list as a spreadsheet (mm and inches), or everything as one zip. "Show exact model" displays the exact parts in the 3D view.
- **Export:** Download STL exports the whole piece.

## The plan

The full plan is in the [Full furniture app plan](https://claude.ai/artifact/JVkqRFMdhzktmLQWzZbYF8). Step 1 moved the prototype here with automatic checks and a website. Step 2 added the exact solid-model engine, starting with the tables. Next: drawing sheets, then the other pieces.

## One-time setup (owner only)

To switch the website on: in this repository go to **Settings → Pages**, and under **Build and deployment → Source** choose **GitHub Actions**. After that, every change to `main` updates the site automatically.

## For developers

Requires Node 22.

    npm install
    npm run dev        # local site at http://localhost:5173
    npm test           # builds every piece with every preset and slider extreme
    npm run test:e2e   # opens the app in a browser and clicks through it

| Folder | Contents |
| --- | --- |
| `index.html`, `src/main.js` | The app: designer, room, saving, STL export |
| `src/furniture.js` | Quick furniture builders for the 3D view. Inches, Y up, front faces +Z, origin on the floor at the centre |
| `src/cad/` | Exact solid engine (OpenCascade via [replicad](https://replicad.xyz), in a web worker): `table.js` builds table parts and joints; `exports.js` makes STL, DXF and the cut list; `dxf.js` writes DXF with true arcs. Millimetres, Z up, front faces -Y |
| `tests/`, `e2e/` | Unit tests for the builders and the exact parts (including no overlapping parts and a match with the original Fusion parts), browser tests for the app |
| `reference/coffee-table/` | The original nine coffee table parts from Fusion (GLB) with `parts.json`, and the Fusion scripts. Kept as reference models for accuracy tests; the app does not need Fusion |
