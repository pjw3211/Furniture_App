# Mid-Century Furniture Designer

Design mid-century modern furniture with sliders, arrange it in a living room, and (soon) export every part as STL, DXF and workshop drawings. A community area for sharing, rating and remixing designs comes later.

**Use it:** https://pjw3211.github.io/Furniture_App/ (live once GitHub Pages is switched on, see below).

![Living room view](public/preview.png)

## What it does today

- **Design a piece:** coffee table, side table, sofa, lounge chair, credenza and bookcase. Pick a style from the pictures, then fine-tune with sliders. Woods: walnut, teak, white oak, rosewood.
- **Living room:** place your saved pieces, move and turn them, and change the room size, walls, floor, rug and light.
- **Save:** pieces and the room are kept in your browser. Download design and Save room file keep a copy.
- **Export:** Download STL exports the whole piece.

## The plan

The full plan is in the [Full furniture app plan](https://claude.ai/artifact/JVkqRFMdhzktmLQWzZbYF8). Step 1 (this version) moved the prototype here unchanged, with automatic checks and a website. Next comes the exact solid-model engine, which makes per-part STL, DXF and drawings possible.

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
| `src/furniture.js` | Furniture builders. Inches, Y up, front faces +Z, origin on the floor at the centre |
| `tests/`, `e2e/` | Unit tests for the builders, browser tests for the app |
| `reference/coffee-table/` | The original nine coffee table parts from Fusion (GLB) with `parts.json`, and the Fusion scripts. Kept as reference models for accuracy tests; the app does not need Fusion |
