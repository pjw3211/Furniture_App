// Per-part exports from exact solids: STL, DXF templates and the cut list.
import { writeDXF, curveEntities } from "./dxf.js";

const MM = 25.4;

/** Bounding box of a solid as {min:[x,y,z], max:[x,y,z], size:[x,y,z]} in mm. */
export function bounds(solid) {
  const b = solid.boundingBox, [min, max] = b.bounds;
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Finished size of a part as length >= width >= thickness, in mm. */
export function finishedSize(solid) {
  const [l, w, t] = bounds(solid).size.slice().sort((a, b) => b - a);
  return { length: l, width: w, thickness: t };
}

// Common hardwood thicknesses (mm), roughly 4/4 to 16/4 rough stock.
const STOCK = [19, 22, 25, 32, 38, 44, 50, 63, 75, 100];
export const ALLOWANCE = { length: 25, width: 6, thickness: 3 };

export function roughSize(fin, allow = ALLOWANCE) {
  const tNeed = fin.thickness + allow.thickness;
  return {
    length: Math.ceil(fin.length + allow.length),
    width: Math.ceil(fin.width + allow.width),
    thickness: STOCK.find(s => s >= tNeed) || Math.ceil(tNeed),
  };
}

const key = (p, fin) => [p.name, p.material, fin.length.toFixed(1), fin.width.toFixed(1), fin.thickness.toFixed(1)].join("|");

/** Group identical parts you make into cut list rows. Bought parts are left out. */
export function cutList(parts) {
  const rows = new Map();
  for (const p of parts.filter(p => !p.bought)) {
    const fin = finishedSize(p.solid), k = key(p, fin);
    if (rows.has(k)) { rows.get(k).qty++; rows.get(k).ids.push(p.id); continue; }
    rows.set(k, { name: p.name, material: p.material, qty: 1, ids: [p.id], finished: fin, rough: roughSize(fin) });
  }
  return [...rows.values()];
}

/** Parts to buy (screws, clips, Dominoes, dowels) with how many of each. */
export function hardwareList(parts) {
  const rows = new Map();
  for (const p of parts.filter(p => p.bought)) {
    const r = rows.get(p.name) || { name: p.name, qty: 0, ids: [] };
    r.qty++; r.ids.push(p.id); rows.set(p.name, r);
  }
  return [...rows.values()];
}

const inch = mm => (mm / MM).toFixed(2);

export function cutListCSV(rows, title = "Cut list", hardware = []) {
  const out = [[title], [],
    ["Part", "Qty", "Material", "Length mm", "Width mm", "Thickness mm", "Length in", "Width in", "Thickness in",
      "Rough length mm", "Rough width mm", "Stock thickness mm"]];
  for (const r of rows) {
    const f = r.finished, g = r.rough;
    out.push([r.name, r.qty, r.material, f.length.toFixed(1), f.width.toFixed(1), f.thickness.toFixed(1),
      inch(f.length), inch(f.width), inch(f.thickness), g.length, g.width, g.thickness]);
  }
  out.push([], [`Rough sizes add ${ALLOWANCE.length} mm to length and ${ALLOWANCE.width} mm to width; stock thickness is the next common size up.`]);
  if (hardware.length) out.push([], ["To buy", "Qty"], ...hardware.map(h => [h.name, h.qty]));
  return out.map(r => r.map(c => /[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\n") + "\n";
}

/** Which views to draw for a part, and which way up. */
function viewsFor(part) {
  if (part.group === "legs") return [["front", "Front"], ["right", "Side"]];
  if (part.group === "aprons") return [part.id.includes("left") || part.id.includes("right") ? ["right", "Face"] : ["front", "Face"]];
  return [["top", "Top"]];
}

// A projected 3D edge (lying in the view plane) seen as a 2D curve.
function edgeAsCurve(edge) {
  const p = t => { const v = edge.pointAt(t); return [v.x ?? v[0], v.y ?? v[1]]; };
  return { geomType: edge.geomType, firstParameter: 0, lastParameter: 1,
    firstPoint: p(0), lastPoint: p(1), value: p };
}

/** Visible and hidden edges of a solid seen from one side, as DXF entities. */
export function projectView(R, solid, cam) {
  const { visible, hidden } = R.makeProjectedEdges(solid, R.lookFromPlane(cam));
  const ents = edges => edges.flatMap(e => curveEntities(edgeAsCurve(e)));
  const vis = ents(visible);
  // Drop hidden lines that lie exactly under a visible one (the back of a face).
  const r = v => Math.round(v * 10) / 10;
  const key = e => e.type === "LINE"
    ? [e.a, e.b].map(p => `${r(p[0])},${r(p[1])}`).sort().join("|")
    : `${e.type}|${r(e.c[0])},${r(e.c[1])}|${r(e.r)}|${r(e.start ?? 0)}|${r(e.end ?? 0)}`;
  const seen = new Set(vis.map(key));
  return { visible: vis, hidden: ents(hidden).filter(e => !seen.has(key(e))) };
}

function moveEntities(ents, dx, dy) {
  const m = p => [p[0] + dx, p[1] + dy];
  return ents.map(e => e.type === "LINE" ? { ...e, a: m(e.a), b: m(e.b) } : { ...e, c: m(e.c) });
}

/**
 * A DXF template of one part: each view's outline on OUTLINE, hidden edges
 * (mortises, the underside of a bevel) on HIDDEN, and a label. Views sit side
 * by side, starting at the origin, in mm.
 */
export function partDXF(R, part, title) {
  const outline = [], hiddenAll = [], texts = [];
  let x = 0;
  for (const [cam, label] of viewsFor(part)) {
    const { visible, hidden } = projectView(R, part.solid, cam);
    if (!visible.length) continue;
    // Place by the true extent of the visible lines' end points.
    const pts = visible.flatMap(e => e.type === "LINE" ? [e.a, e.b] : e.type === "ARC"
      ? [e.start, e.end, (e.start + (((e.end - e.start) % 360) + 360) % 360 / 2)].map(a =>
          [e.c[0] + e.r * Math.cos(a * Math.PI / 180), e.c[1] + e.r * Math.sin(a * Math.PI / 180)])
      : [[e.c[0] - e.r, e.c[1] - e.r], [e.c[0] + e.r, e.c[1] + e.r]]);
    const x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1]));
    const x1 = Math.max(...pts.map(p => p[0]));
    outline.push(...moveEntities(visible, x - x0, -y0));
    hiddenAll.push(...moveEntities(hidden, x - x0, -y0));
    texts.push({ at: [x, -12], height: 6, text: `${title} - ${label} view` });
    x += (x1 - x0) + 40;
  }
  const fin = finishedSize(part.solid);
  texts.push({ at: [0, -24], height: 4,
    text: `Finished ${fin.length.toFixed(1)} x ${fin.width.toFixed(1)} x ${fin.thickness.toFixed(1)} mm. Units: mm. Hidden lines = mortises and undersides.` });
  return writeDXF([{ name: "OUTLINE", color: 7, entities: outline }, { name: "HIDDEN", color: 8, entities: hiddenAll }], texts);
}

/** Binary STL of one part, laid at its own origin (min corner at 0,0,0). */
export function partSTL(part, tolerance = 0.05) {
  const b = bounds(part.solid);
  const moved = part.solid.clone().translate([-b.min[0], -b.min[1], -b.min[2]]);
  return moved.blobSTL({ tolerance, angularTolerance: 0.1, binary: true });
}

/** Triangle mesh of a part in place, for showing the exact model. */
export function partMesh(part, tolerance = 0.2) {
  const m = part.solid.mesh({ tolerance, angularTolerance: 0.3 });
  return { vertices: Float32Array.from(m.vertices), normals: Float32Array.from(m.normals), triangles: Uint32Array.from(m.triangles) };
}
