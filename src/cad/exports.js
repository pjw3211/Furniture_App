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

// Rough hardwood is sold by the quarter inch: 4/4 is 1 in thick, 8/4 is 2 in.
export const STOCK = [4, 5, 6, 8, 10, 12, 16].map(q => ({ name: `${q}/4`, mm: q * 6.35 }));
export const ALLOWANCE = { length: 25, width: 6, thickness: 3 };

export function roughSize(fin, allow = ALLOWANCE) {
  const tNeed = fin.thickness + allow.thickness;
  const stock = STOCK.find(s => s.mm >= tNeed - 0.01);
  return {
    length: Math.ceil(fin.length + allow.length),
    width: Math.ceil(fin.width + allow.width),
    thickness: stock ? Math.round(stock.mm * 10) / 10 : Math.ceil(tNeed),
    stock: stock ? stock.name : `${Math.ceil(tNeed)} mm`,
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
      "Rough length mm", "Rough width mm", "Stock"]];
  for (const r of rows) {
    const f = r.finished, g = r.rough;
    out.push([r.name, r.qty, r.material, f.length.toFixed(1), f.width.toFixed(1), f.thickness.toFixed(1),
      inch(f.length), inch(f.width), inch(f.thickness), g.length, g.width, g.stock]);
  }
  out.push([], [`Rough sizes add ${ALLOWANCE.length} mm to length and ${ALLOWANCE.width} mm to width; stock is the next rough thickness up (4/4 = 1 in).`]);
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

// Bounding box of DXF entities, [x0, y0, x1, y1].
export function extent(ents) {
  const pts = ents.flatMap(e => {
    if (e.type === "LINE") return [e.a, e.b];
    if (e.type === "CIRCLE") return [[e.c[0] - e.r, e.c[1] - e.r], [e.c[0] + e.r, e.c[1] + e.r]];
    const span = ((e.end - e.start) % 360 + 360) % 360 || 360;
    return Array.from({ length: 17 }, (_, i) => {
      const a = (e.start + span * i / 16) * Math.PI / 180;
      return [e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)];
    });
  });
  if (!pts.length) return [0, 0, 0, 0];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// The views of one part, side by side from the origin: { outline, hidden, texts, w, h }.
// Quarter turn anticlockwise about the origin.
function turnEntities(ents) {
  const t = p => [-p[1], p[0]];
  return ents.map(e => e.type === "LINE" ? { ...e, a: t(e.a), b: t(e.b) }
    : e.type === "ARC" ? { ...e, c: t(e.c), start: (e.start + 90) % 360, end: (e.end + 90) % 360 } : { ...e, c: t(e.c) });
}

function partViews(R, part, title, views = viewsFor(part), { lengthways = false } = {}) {
  const outline = [], hidden = [], texts = [];
  let x = 0, h = 0;
  for (const [cam, label] of views) {
    const v = projectView(R, part.solid, cam);
    if (!v.visible.length) continue;
    // Laid flat, long parts lie along X.
    let [x0, y0, x1, y1] = extent(v.visible);
    if (lengthways && y1 - y0 > x1 - x0) {
      v.visible = turnEntities(v.visible); v.hidden = turnEntities(v.hidden);
      [x0, y0, x1, y1] = extent(v.visible);
    }
    outline.push(...moveEntities(v.visible, x - x0, -y0));
    hidden.push(...moveEntities(v.hidden, x - x0, -y0));
    texts.push({ at: [x, -9], height: 5, text: `${title} - ${label}` });
    x += (x1 - x0) + 40;
    h = Math.max(h, y1 - y0);
  }
  return { outline, hidden, texts, w: Math.max(0, x - 40), h };
}

/**
 * A DXF template of one part: each view's outline on OUTLINE, hidden edges
 * (mortises, the underside of a bevel) on HIDDEN, and a label. Views sit side
 * by side, starting at the origin, in mm.
 */
export function partDXF(R, part, title) {
  const v = partViews(R, part, title);
  for (const t of v.texts) { t.at = [t.at[0], -12]; t.height = 6; t.text += " view"; }
  const fin = finishedSize(part.solid);
  v.texts.push({ at: [0, -24], height: 4,
    text: `Finished ${fin.length.toFixed(1)} x ${fin.width.toFixed(1)} x ${fin.thickness.toFixed(1)} mm. Units: mm. Hidden lines = mortises and undersides.` });
  return writeDXF([{ name: "OUTLINE", color: 7, entities: v.outline }, { name: "HIDDEN", color: 8, entities: v.hidden }], v.texts);
}

// Laid flat: look along the part's thinnest direction. Legs, aprons and
// shelf rails also get a second view along the next thinnest, so every
// mortise, tenon and hole shows in true size on one of them.
const CAM = ["right", "front", "top"], CAM_NAME = { right: "side", front: "face", top: "underside" }; // replicad's "top" looks up from below
function flatViews(part) {
  if (part.group === "legs") return [["front", "front"], ["right", "side"]];
  const size = bounds(part.solid).size, order = [0, 1, 2].sort((a, b) => size[a] - size[b]);
  const two = part.group === "legs" || part.group === "aprons" || /rail/.test(part.id);
  const cams = (two ? order.slice(0, 2) : order.slice(0, 1)).map(k => CAM[k]);
  return cams.map(c => [c, part.group === "aprons" && c === "top" ? "bottom edge" : CAM_NAME[c]]);
}

/**
 * One DXF with every part you make laid flat next to each other, in rows,
 * each labelled with its name and size. Layers: OUTLINE (cut lines), HIDDEN
 * (mortises, holes and edges on the far side), TEXT. Millimetres, or inches
 * when units = "in".
 */
export function flatLayoutDXF(R, parts, titles, { units = "mm", heading = [], rowWidth } = {}) {
  const order = ["top", "aprons", "legs", "shelf"], rank = p => (order.indexOf(p.group) + 1) || order.length + 1;
  const made = parts.filter(p => !p.bought).sort((a, b) => rank(a) - rank(b));
  const blocks = made.map(p => ({ p, v: partViews(R, p, titles[p.id] || p.name, flatViews(p), { lengthways: true }) }));
  const widest = Math.max(...blocks.map(b => b.v.w));
  const W = rowWidth || Math.max(widest, 1800), gap = 50, label = 22;
  const outline = [], hidden = [], texts = [];
  let x = 0, y = 0, rowH = 0;
  const fmt = mm => units === "in" ? `${(mm / MM).toFixed(2)} in` : `${mm.toFixed(1)} mm`;
  // Rows run downward from y = 0, so the sheet reads top to bottom.
  for (const { p, v } of blocks) {
    if (x > 0 && x + v.w > W) { x = 0; y -= rowH + label + gap; rowH = 0; }
    const oy = y - v.h; // block's bottom edge
    outline.push(...moveEntities(v.outline, x, oy));
    hidden.push(...moveEntities(v.hidden, x, oy));
    for (const t of v.texts) texts.push({ ...t, at: [t.at[0] + x, oy - 9] });
    const fin = finishedSize(p.solid);
    texts.push({ at: [x, oy - 17], height: 3.5, text: `Finished ${fmt(fin.length)} x ${fmt(fin.width)} x ${fmt(fin.thickness)}` });
    x += v.w + gap;
    rowH = Math.max(rowH, v.h);
  }
  const head = [...heading, `Units: ${units === "in" ? "inches" : "millimetres"}. OUTLINE = cut lines, HIDDEN = mortises, holes and far-side edges.`];
  head.forEach((t, i) => texts.push({ at: [0, 30 + (head.length - 1 - i) * 9], height: i === 0 ? 7 : 4.5, text: t }));
  const k = units === "in" ? 1 / MM : 1;
  const scale = e => k === 1 ? e : e.type === "LINE" ? { ...e, a: e.a.map(v => v * k), b: e.b.map(v => v * k) } : { ...e, c: e.c.map(v => v * k), r: e.r * k };
  const T = texts.map(t => ({ ...t, at: t.at.map(v => v * k), height: t.height * k }));
  return writeDXF([{ name: "OUTLINE", color: 7, entities: outline.map(scale) }, { name: "HIDDEN", color: 8, entities: hidden.map(scale) }], T,
    { units: units === "in" ? 1 : 4 });
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
