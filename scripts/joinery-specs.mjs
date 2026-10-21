// Writes the joinery reference models as JSON for the Fusion script, and the
// drawn profiles as DXF. Run with: npm run joinery:specs
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "fs";
import { specFiles, profiles } from "../src/cad/joinery/catalog.js";
import { profileDXF } from "../src/cad/joinery/profiles.js";

const root = new URL("../reference/coffee-table/joinery/", import.meta.url);
const specDir = new URL("build_joinery/specs/", root), dxfDir = new URL("profiles-dxf/", root);
for (const d of [specDir, dxfDir]) {
  mkdirSync(d, { recursive: true });
  for (const f of readdirSync(d)) rmSync(new URL(f, d));
}
const files = specFiles();
for (const [name, data] of Object.entries(files)) writeFileSync(new URL(name, specDir), JSON.stringify(data, null, 1) + "\n");
for (const p of profiles()) writeFileSync(new URL(`${p.id}.dxf`, dxfDir), profileDXF(p));
console.log(`Wrote ${Object.keys(files).length} spec files and ${profiles().length} DXF profiles.`);
