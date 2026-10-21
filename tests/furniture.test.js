import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createFurniture } from "../src/furniture.js";

const F = createFurniture(THREE, { toCreasedNormals, RoundedBoxGeometry });

// Build a piece the way the app does: clamp, then build.
function build(type, params) {
  const s = { ...type.defaults, ...params };
  type.clamp(s);
  return { s, res: type.build(s) };
}

function expectSolidLooking(res, label) {
  expect(res.parts.length, label).toBeGreaterThan(0);
  const box = new THREE.Box3();
  for (const { geo, mat } of res.parts) {
    expect(["wood", "fabric", "accent", "brass", "dark"], label).toContain(mat);
    const pos = geo.getAttribute("position");
    expect(pos.count, label).toBeGreaterThan(0);
    expect(pos.array.every(Number.isFinite), label).toBe(true);
    geo.computeBoundingBox();
    box.union(geo.boundingBox);
  }
  // Inches, origin on the floor: nothing below the floor, nothing absurdly large.
  expect(box.min.y, label).toBeGreaterThanOrEqual(-0.01);
  expect(box.max.y, label).toBeGreaterThan(1);
  const size = box.getSize(new THREE.Vector3());
  expect(Math.max(size.x, size.y, size.z), label).toBeLessThan(150);
}

// Every combination a user can reach in one step: defaults, each preset,
// and each slider at its lowest and highest setting.
function cases(type) {
  const out = [["defaults", {}]];
  for (const g of type.groups) {
    for (const p of g.presets || []) out.push([`preset ${g.title}/${p.id}`, p.p]);
    for (const sl of g.sliders || []) {
      const [key, , a, b] = sl;
      if (Array.isArray(a)) for (const [v] of a) out.push([`${key}=${v}`, { [key]: v }]);
      else { out.push([`${key}=min`, { [key]: a }]); out.push([`${key}=max`, { [key]: b }]); }
    }
  }
  return out;
}

describe("furniture library", () => {
  it("has the six living room pieces", () => {
    expect(F.types.map(t => t.id)).toEqual(
      ["coffee_table", "side_table", "sofa", "lounge_chair", "credenza", "bookcase"]);
  });

  for (const type of F.types) {
    describe(type.name, () => {
      for (const [label, params] of cases(type)) {
        it(`builds with ${label}`, () => {
          const { res } = build(type, params);
          expectSolidLooking(res, `${type.id} ${label}`);
        });
      }
    });
  }
});

describe("coffee table matches the Fusion reference", () => {
  it("default size is 48 x 22 x 16 in", () => {
    const t = F.types.find(x => x.id === "coffee_table");
    const { res } = build(t, {});
    const box = new THREE.Box3();
    for (const { geo } of res.parts) { geo.computeBoundingBox(); box.union(geo.boundingBox); }
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(48, 1);
    expect(size.z).toBeCloseTo(22, 1);
    expect(size.y).toBeCloseTo(16, 1);
  });
});
