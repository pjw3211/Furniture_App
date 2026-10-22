// Shared checks for the joinery reference models.
import { buildBody } from "../src/cad/joinery/shapes.js";

export function bbox(R, solid) {
  const b = solid.boundingBox;
  return { min: b.bounds[0], max: b.bounds[1] };
}

// Build every body; returns { built: [{ b, solid, box }], errors }.
export function buildModel(R, m) {
  return m.bodies.map(b => {
    const solid = buildBody(R, b);
    return { b, solid, box: bbox(R, solid), volume: R.measureVolume(solid) };
  });
}

const boxesTouch = (a, b, tol = 0.01) => [0, 1, 2].every(k => a.min[k] <= b.max[k] + tol && b.min[k] <= a.max[k] + tol);
const boxesInterlock = (a, b) => [0, 1, 2].every(k => a.min[k] < b.max[k] - 0.5 && b.min[k] < a.max[k] - 0.5);

// Pairs of real parts whose solids overlap by more than 1 mm³.
export function overlaps(R, built) {
  const real = built.filter(x => x.b.kind !== "reference"), bad = [];
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
    const a = real[i], b = real[j];
    if (!boxesTouch(a.box, b.box)) continue;
    const common = a.solid.intersect(b.solid), v = R.measureVolume(common);
    common.delete();
    if (v > 1) bad.push(`${a.b.id} × ${b.b.id}: ${v.toFixed(1)} mm³`);
  }
  return bad;
}

// Every joint is checked for contact. `contact` says how the two parts meet:
// "interlock" (a tenon in its mortise: touching, and their boxes overlap in
// all three directions), "touch" (glued or resting faces) or "none" (only
// the connectors hold them). Connectors listed in `via` (dowels, loose
// tenons, screws, bolts) must interlock with both parts.
export function missingJoints(R, m, built) {
  const byId = Object.fromEntries(built.map(x => [x.b.id, x]));
  const bad = [];
  const check = (type, ia, ib, interlock) => {
    const a = byId[ia], b = byId[ib];
    if (!a || !b) return bad.push(`${type}: unknown part ${!a ? ia : ib}`);
    if (interlock && !boxesInterlock(a.box, b.box)) return bad.push(`${type}: ${ia} and ${ib} do not interlock`);
    const d = R.measureDistanceBetween(a.solid, b.solid);
    if (d > 0.25) bad.push(`${type}: ${ia} and ${ib} are ${d.toFixed(2)} mm apart`);
  };
  for (const j of m.joints) {
    const [a, b] = j.parts, contact = j.contact || (j.via ? "touch" : "interlock");
    for (const v of j.via || []) { check(j.type, v, a, true); check(j.type, v, b, true); }
    if (contact !== "none") check(j.type, a, b, contact === "interlock");
  }
  return bad;
}
