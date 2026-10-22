# Notes for Claude

- Owner (Pjw) does not program. Explain things in plain language; do the coding yourself.
- Plan: https://claude.ai/artifact/JVkqRFMdhzktmLQWzZbYF8. Fusion is not part of the runtime; accuracy comes from the in-browser solid engine plus reference models under `reference/`.
- Units: support mm and inches. The engine takes table sizes in inches (`src/coffeeTable.js` turns dropdown choices into them) and builds in mm.
- The app was restarted on 2026-10-22 as one piece only (the coffee table): dropdowns → exact parts → flat DXF + PDF cut list. Add pieces only once that pipeline is solid.
- Run `npm test` and `npm run test:e2e` before pushing. Locally, set `CHROMIUM_PATH` if Chromium is preinstalled.
- Exact parts live in `src/cad/` (replicad in a worker). Every new recipe or dropdown option needs tests like `tests/coffee-table.test.js`: no overlapping parts, joints present, and a bounding-box match against any reference model.
- The Playwright web server reuses a running preview locally, so run `npm run build` before `npm run test:e2e`.
