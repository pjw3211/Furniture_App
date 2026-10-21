# Notes for Claude

- Owner (Pjw) does not program. Explain things in plain language; do the coding yourself.
- Plan: https://claude.ai/artifact/JVkqRFMdhzktmLQWzZbYF8. Fusion is not part of the runtime; accuracy comes from the in-browser solid engine plus reference models under `reference/`.
- Units: support mm and inches. Builders in `src/furniture.js` currently work in inches.
- Run `npm test` and `npm run test:e2e` before pushing. Locally, set `CHROMIUM_PATH` if Chromium is preinstalled.
