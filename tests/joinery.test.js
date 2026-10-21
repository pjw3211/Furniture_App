import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { execFileSync } from "child_process";
import { loadReplicad } from "./oc-node.js";
import { buildModel, overlaps, missingJoints } from "./joinery-helpers.js";
import { allModels, specFiles, profiles } from "../src/cad/joinery/catalog.js";
import { profileDXF, profileEntities } from "../src/cad/joinery/profiles.js";
import { readDXF } from "../src/cad/dxf.js";

const MM = 25.4;
const REF = JSON.parse(readFileSync(new URL("../reference/coffee-table/parts.json", import.meta.url)));
const refBox = id => REF.parts.find(p => p.id === id).bbox_in;
const SPEC_DIR = new URL("../reference/coffee-table/joinery/build_joinery/specs/", import.meta.url);
const models = allModels();
let R;
beforeAll(async () => { R = await loadReplicad(); }, 60000);

function unionBox(built) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const x of built) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], x.box.min[k]); max[k] = Math.max(max[k], x.box.max[k]); }
  return { min, max };
}
function expectBoxNear(box, refIn, tol = 0.5) {
  for (let k = 0; k < 3; k++) {
    expect(Math.abs(box.min[k] - refIn.min[k] * MM)).toBeLessThan(tol);
    expect(Math.abs(box.max[k] - refIn.max[k] * MM)).toBeLessThan(tol);
  }
}

describe("joinery catalog", () => {
  it("has every checklist section", () => {
    const sections = new Set(models.map(m => m.section.replace(/\d+$/, "")));
    for (const s of ["A", "B", "C", "D", "E", "F", "H", "T"]) expect(sections.has(s), s).toBe(true);
    expect(models.length).toBeGreaterThanOrEqual(29);
  });
  it("uses unique model ids and unique body ids within each model", () => {
    expect(new Set(models.map(m => m.id)).size).toBe(models.length);
    for (const m of models) expect(new Set(m.bodies.map(b => b.id)).size, m.id).toBe(m.bodies.length);
  });
  it("the JSON specs for Fusion are up to date (run npm run joinery:specs)", () => {
    const files = specFiles();
    expect(readdirSync(SPEC_DIR).sort()).toEqual(Object.keys(files).sort());
    for (const [name, data] of Object.entries(files))
      expect(JSON.parse(readFileSync(new URL(name, SPEC_DIR))), name).toEqual(JSON.parse(JSON.stringify(data)));
  });
});

describe.each(models.map(m => [m.id, m]))("%s", (id, m) => {
  let built;
  beforeAll(() => { built = buildModel(R, m); }, 120000);
  it("builds every body as a solid", () => {
    for (const x of built) expect(x.volume, x.b.id).toBeGreaterThan(50);
  });
  it("has no overlapping parts", () => {
    expect(overlaps(R, built)).toEqual([]);
  }, 120000);
  it("has every joint in place", () => {
    expect(missingJoints(R, m, built)).toEqual([]);
  }, 60000);
});

describe("joinery models match the reference coffee table", () => {
  const byId = Object.fromEntries(models.map(m => [m.id, m]));
  it("the default table's legs, aprons and top match the Fusion reference parts", () => {
    const built = buildModel(R, byId["T1-default-table"]);
    expectBoxNear(unionBox(built.filter(x => x.b.id.startsWith("leg-"))), refBox("Legs_SquareTaper"));
    expectBoxNear(unionBox(built.filter(x => x.b.id.startsWith("apron-"))), refBox("Aprons_Straight"));
    expectBoxNear(unionBox(built.filter(x => x.b.id.startsWith("top-board"))), refBox("Top_Bevel"));
  }, 120000);
  it("the glued-up tops match the reference tops", () => {
    for (const [mid, ref] of [["D1-glue-up-bevel", "Top_Bevel"], ["D1-glue-up-rounded", "Top_Rounded"], ["D2-veneered", "Top_Bevel"]]) {
      const built = buildModel(R, byId[mid]).filter(x => x.b.kind !== "reference");
      expectBoxNear(unionBox(built), refBox(ref));
    }
  }, 120000);
  it("the superellipse profile matches the reference top's outline", () => {
    const p = profiles().find(p => p.id === "top-superellipse"), b = refBox("Top_Superellipse");
    const pts = [p.loop.start, ...p.loop.segs.flatMap(s => [s.to, s.via])];
    expect(Math.max(...pts.map(q => q[0]))).toBeCloseTo(b.max[0] * MM, 0);
    expect(Math.max(...pts.map(q => q[1]))).toBeCloseTo(b.max[1] * MM, 0);
  });
});

describe("drawn profiles", () => {
  it.each(profiles().map(p => [p.id, p]))("%s is one closed outline of lines and arcs", (id, p) => {
    const ents = profileEntities(p);
    expect(ents.every(e => e.type === "LINE" || e.type === "ARC")).toBe(true);
    // The outline must make a real face.
    const draw = p.loop.kind === "path" ? (() => {
      let d = R.draw(p.loop.start);
      for (const s of p.loop.segs) d = s.via ? d.threePointsArcTo(s.to, s.via) : d.lineTo(s.to);
      return d.close();
    })() : null;
    if (draw) expect(R.measureArea(draw.sketchOnPlane("XY").face())).toBeGreaterThan(100);
    const dxf = readDXF(profileDXF(p));
    expect(dxf.filter(e => e.type === "LINE" || e.type === "ARC").length).toBe(ents.length + p.stretch.length);
  });
  it("the DXF files in the repo are up to date", () => {
    const dir = new URL("../reference/coffee-table/joinery/profiles-dxf/", import.meta.url);
    for (const p of profiles()) expect(readFileSync(new URL(`${p.id}.dxf`, dir), "utf8"), p.id).toBe(profileDXF(p));
  });
});

describe("Fusion script", () => {
  it("runs every model and profile against a stand-in for Fusion", () => {
    const out = execFileSync("python3", [new URL("./fusion/mock_run.py", import.meta.url).pathname], { encoding: "utf8" });
    expect(out).toMatch(/Built \d+ models/);
  }, 60000);
});
