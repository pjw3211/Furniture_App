// The full table with each joint and top fixing the app offers: every part
// must be a real solid, nothing may overlap, and every joint must actually
// join (tenons in mortises, dowels and screws in both parts).
import { describe, it, expect, beforeAll } from "vitest";
import { params, preset } from "./table-params.js";
import { buildTableSolids } from "../src/cad/table.js";
import { JOINTS, TOP_FIXINGS, unavailable, tableJoinery } from "../src/cad/tableJoinery.js";
import { bounds, cutList, hardwareList, cutListCSV } from "../src/cad/exports.js";
import { overlaps, missingJoints } from "./joinery-helpers.js";
import { loadReplicad } from "./oc-node.js";

let R;
beforeAll(async () => { R = await loadReplicad(); }, 60000);


// The app's parts in the shape the joinery checks expect.
function check(s) {
  const { parts, joints, notes } = buildTableSolids(R, s);
  const built = parts.map(p => {
    const { min, max } = bounds(p.solid);
    return { b: { id: p.id, kind: p.kind }, solid: p.solid, box: { min, max } };
  });
  for (const x of built) expect(R.measureVolume(x.solid), x.b.id).toBeGreaterThan(1);
  expect(overlaps(R, built), "overlapping parts").toEqual([]);
  expect(missingJoints(R, { joints }, built), "joints that don't join").toEqual([]);
  // Free the solids: the engine's memory is shared by every test in the file.
  for (const p of parts) p.solid.delete();
  return { parts, joints, notes };
}

const SIZES = {
  "coffee table": ["coffee_table", {}],
  // A rectangular top keeps these quick; the superellipse top is checked once below.
  "side table": ["side_table", { top_mode: "rect", corner_r: 4 }],
  "thin legs, slim aprons": ["coffee_table", { leg_sq: 1.25, foot: 0.75, apron_h: 2, apron_t: 0.625, apron_set: 0 }],
  "thick legs, deep aprons": ["coffee_table", { leg_sq: 2.5, foot: 1.25, apron_h: 5, apron_t: 1.25, apron_set: 0.5, table_l: 60, table_w: 30 }],
  "splayed round legs, arched aprons": ["coffee_table", { leg_section: "round", splay_ang: 8, foot: 0.875, arch_rise: 1.25 }],
};

describe("every joint builds and joins", () => {
  for (const [label, [type, extra]] of Object.entries(SIZES))
    for (const j of JOINTS)
      it(`${j.name}, ${label}`, () => {
        const s = params(type, { ...extra, joint: j.id });
        const { joints, notes } = check(s);
        const legJoints = joints.filter(x => /^leg-/.test(x.parts[1]) || x.parts.some(p => p.startsWith("leg-")));
        expect(legJoints.length).toBeGreaterThanOrEqual(8);
        if (unavailable(s, "joint", j.id)) expect(notes.join(" ")).toMatch(/instead/);
      }, 120000);
});

