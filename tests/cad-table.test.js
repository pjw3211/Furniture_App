import { describe, it, expect, beforeAll } from "vitest";
import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { readFileSync } from "fs";
import { createFurniture } from "../src/furniture.js";
import { buildTableSolids } from "../src/cad/table.js";
import { geom } from "../src/cad/joinery/base.js";
import { bounds, cutList, cutListCSV, partDXF, partSTL } from "../src/cad/exports.js";
import { readDXF } from "../src/cad/dxf.js";
import { loadReplicad } from "./oc-node.js";

const F = createFurniture(THREE, { toCreasedNormals, RoundedBoxGeometry });
const T = Object.fromEntries(F.types.map(t => [t.id, t]));
const MM = 25.4;
const REF = JSON.parse(readFileSync(new URL("../reference/coffee-table/parts.json", import.meta.url)));
let R;
beforeAll(async () => { R = await loadReplicad(); }, 60000);

function params(typeId, extra = {}) {
  const t = T[typeId], s = { ...t.defaults, ...extra };
  t.clamp(s);
  return s;
}
const preset = (typeId, group, id) => T[typeId].groups.find(g => g.title === group).presets.find(p => p.id === id).p;

function groupBox(parts, group) {
  const b = new THREE.Box3();
  for (const p of parts.filter(p => p.group === group)) {
    const { min, max } = bounds(p.solid);
    b.union(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)));
  }
  return b;
}
function expectNoOverlaps(parts) {
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j], ba = bounds(a.solid), bb = bounds(b.solid);
    const apart = [0, 1, 2].some(k => ba.max[k] < bb.min[k] - 0.01 || bb.max[k] < ba.min[k] - 0.01);
    if (apart) continue;
    const common = a.solid.intersect(b.solid);
    const vol = R.measureVolume(common);
    expect(vol, `${a.id} overlaps ${b.id}`).toBeLessThan(1); // mm³
  }
}

describe("exact coffee table", () => {
  it("builds every part as a closed solid", () => {
    const { parts, joints } = buildTableSolids(R, params("coffee_table"));
    expect(parts.filter(p => p.kind === "wood" && p.group !== "fixings").map(p => p.id)).toEqual(["top",
      "apron-front", "apron-back", "apron-right", "apron-left",
      "leg-front-right", "leg-front-left", "leg-back-right", "leg-back-left"]);
    for (const p of parts.filter(p => p.group !== "fixings")) expect(R.measureVolume(p.solid), p.id).toBeGreaterThan(1000);
    expect(joints.filter(j => j.type === "mortise-and-tenon")).toHaveLength(8);
  });

  it("matches the size of the quick model: 48 x 22 x 16 in", () => {
    const { parts } = buildTableSolids(R, params("coffee_table"));
    const b = new THREE.Box3();
    for (const p of parts) { const { min, max } = bounds(p.solid); b.union(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))); }
    const size = b.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(48 * MM, 1);
    expect(size.y).toBeCloseTo(22 * MM, 1);
    expect(size.z).toBeCloseTo(16 * MM, 1);
  });

  it("has no overlapping parts (every tenon sits in its mortise)", () => {
    expectNoOverlaps(buildTableSolids(R, params("coffee_table")).parts);
  });

  it("haunched tenons reach to the other apron's centre line, mitred, with glue room in the mortise", () => {
    const s = params("coffee_table"), g = geom(s);
    const { parts } = buildTableSolids(R, s);
    const leg = parts.find(p => p.id === "leg-front-right"), apron = parts.find(p => p.id === "apron-front");
    // The tenon's far corner reaches the mitre line near the other apron's centre plane.
    const reach = bounds(apron.solid).max[0] - g.long_half;
    expect(reach).toBeGreaterThan(g.meet - 9.525);
    expect(reach).toBeLessThan(g.meet + 9.525 / 2);
    // Filling the mortise with the tenon leaves the glue room empty.
    const { min, max } = bounds(leg.solid), legBox = R.makeBox(min, max);
    const tenonIn = R.measureVolume(apron.solid.intersect(legBox));
    const hole = R.measureVolume(legBox) - R.measureVolume(leg.solid);
    expect(tenonIn).toBeGreaterThan(5000);
    expect(hole).toBeGreaterThan(tenonIn); // mortises are bigger than the tenons
  });

  describe("matches the original Fusion parts", () => {
    const cases = [
      ["Top_Bevel", "top", { ...preset("coffee_table", "Top", "bevel") }],
      ["Top_Rounded", "top", { ...preset("coffee_table", "Top", "rounded") }],
      ["Top_Superellipse", "top", { ...preset("coffee_table", "Top", "se"), table_l: 54, table_w: 24 }],
      ["Legs_SquareTaper", "legs", { ...preset("coffee_table", "Legs", "square") }],
      ["Legs_RoundTaper", "legs", { ...preset("coffee_table", "Legs", "round") }],
      ["Legs_Splayed", "legs", { ...preset("coffee_table", "Legs", "splayed") }],
      ["Aprons_Straight", "aprons", { ...preset("coffee_table", "Aprons", "straight") }],
      ["Aprons_Arched", "aprons", { ...preset("coffee_table", "Aprons", "arched") }],
      ["Aprons_Slim", "aprons", { ...preset("coffee_table", "Aprons", "slim") }],
    ];
    for (const [refId, group, p] of cases) {
      it(`${refId} has the same bounding box (within 0.5 mm)`, () => {
        const ref = REF.parts.find(x => x.id === refId).bbox_in;
        const b = groupBox(buildTableSolids(R, params("coffee_table", p)).parts, group);
        for (let k = 0; k < 3; k++) {
          expect(Math.abs(b.min.getComponent(k) - ref.min[k] * MM), `${refId} min[${k}]`).toBeLessThan(0.5);
          expect(Math.abs(b.max.getComponent(k) - ref.max[k] * MM), `${refId} max[${k}]`).toBeLessThan(0.5);
        }
      });
    }
  });

  for (const [g, id] of [["Top", "se"], ["Top", "rounded"], ["Legs", "splayed"], ["Legs", "round"], ["Aprons", "arched"]])
    it(`has no overlapping parts with the ${g.toLowerCase()} preset "${id}"`, () => {
      expectNoOverlaps(buildTableSolids(R, params("coffee_table", preset("coffee_table", g, id))).parts);
    });

  it("side table with its lower shelf builds without overlaps", () => {
    const { parts } = buildTableSolids(R, params("side_table"));
    expect(parts.some(p => p.id === "shelf")).toBe(true);
    expectNoOverlaps(parts);
  });
});

describe("exports", () => {
  it("cut list groups identical parts", () => {
    const rows = cutList(buildTableSolids(R, params("coffee_table")).parts);
    expect(rows.map(r => [r.name, r.qty])).toEqual([["Top", 1], ["Long apron", 2], ["Short apron", 2], ["Leg", 4], ["Button", 8]]);
    const top = rows[0].finished;
    expect(top.length).toBeCloseTo(48 * MM, 1);
    expect(top.width).toBeCloseTo(22 * MM, 1);
    expect(top.thickness).toBeCloseTo(1 * MM, 1);
    const csv = cutListCSV(rows);
    expect(csv).toContain("Leg,4,walnut");
  });

  it("apron DXF shows the profile with both tenons at true size", () => {
    const s = params("coffee_table", preset("coffee_table", "Aprons", "arched"));
    const apron = buildTableSolids(R, s).parts.find(p => p.id === "apron-front");
    const ents = readDXF(partDXF(R, apron, "Long apron"));
    const geo = ents.filter(e => e.type !== "TEXT" && e["8"] === "OUTLINE");
    expect(geo.length).toBeGreaterThan(4);
    expect(ents.some(e => e.type === "ARC")).toBe(true); // the arch is a true arc
    const xs = geo.flatMap(e => e.type === "LINE" ? [+e["10"], +e["11"]]
      : [+e["50"], +e["51"]].map(a => +e["10"] + +e["40"] * Math.cos(a * Math.PI / 180)));
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeCloseTo(bounds(apron.solid).size[0], 0);
  });

  it("leg DXF has two views and hidden mortises", () => {
    const leg = buildTableSolids(R, params("coffee_table")).parts.find(p => p.group === "legs");
    const ents = readDXF(partDXF(R, leg, "Leg"));
    expect(ents.filter(e => e["8"] === "OUTLINE").length).toBeGreaterThan(6);
    expect(ents.filter(e => e["8"] === "HIDDEN").length).toBeGreaterThan(3);
    expect(ents.filter(e => e.type === "TEXT").length).toBe(3);
  });

  it("top DXF of a superellipse is made of arcs", () => {
    const top = buildTableSolids(R, params("coffee_table", preset("coffee_table", "Top", "se"))).parts[0];
    const ents = readDXF(partDXF(R, top, "Top"));
    expect(ents.filter(e => e.type === "ARC").length).toBeGreaterThan(8);
  });

  it("STL of a part is a valid binary file", async () => {
    const leg = buildTableSolids(R, params("coffee_table")).parts.find(p => p.group === "legs");
    const buf = new Uint8Array(await partSTL(leg).arrayBuffer());
    const tris = new DataView(buf.buffer).getUint32(80, true);
    expect(tris).toBeGreaterThan(10);
    expect(buf.length).toBe(84 + 50 * tris);
  });
});
