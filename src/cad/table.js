// Exact solid model of the coffee table and side table, built with replicad
// (OpenCascade). Takes the same parameters as the quick browser model in
// src/furniture.js (inches and degrees) and returns every part as a solid.
// The joints (s.joint, s.top_fix) come from src/cad/tableJoinery.js.
//
// CAD frame: millimetres, Z up, X along the length, the front of the table
// faces -Y. This matches the STL frame the app has always exported.
import { buildShape, buildBody } from "./joinery/shapes.js";
import { tableJoinery, isBought } from "./tableJoinery.js";

const MM = 25.4;
const D2R = Math.PI / 180;

// Same derived values as tableDerive() in src/furniture.js, in inches.
export function tableDerive(s) {
  const d = {};
  d.apron_top = s.table_h - s.top_t;
  d.head_h = Math.max(3, s.apron_h);
  d.head_z0 = d.apron_top - d.head_h;
  d.leg_cx = s.table_l / 2 - s.inset_x;
  d.leg_cy = s.table_w / 2 - s.inset_y;
  d.long_half = d.leg_cx - s.leg_sq / 2;
  d.short_half = d.leg_cy - s.leg_sq / 2;
  d.rail_y = d.leg_cy + s.leg_sq / 2 - s.apron_set - s.apron_t / 2;
  d.rail_x = d.leg_cx + s.leg_sq / 2 - s.apron_set - s.apron_t / 2;
  const off = d.head_z0 * Math.tan(s.splay_ang * D2R), diag = Math.hypot(d.leg_cx, d.leg_cy) || 1;
  d.splay_dx = off * d.leg_cx / diag;
  d.splay_dy = off * d.leg_cy / diag;
  return d;
}

// Split a curve f(t) into arcs [start, middle, end] that stay within tol of it.
function fitArcs3(f, t0, t1, out, depth, tol = 0.02) {
  const a = f(t0), b = f(t1), m = f((t0 + t1) / 2);
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = m[0], cy = m[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  let ok = false;
  if (Math.abs(d) > 1e-9) {
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    const r = Math.hypot(ax - ux, ay - uy);
    ok = [0.125, 0.25, 0.375, 0.625, 0.75, 0.875].every(k => {
      const p = f(t0 + (t1 - t0) * k);
      return Math.abs(Math.hypot(p[0] - ux, p[1] - uy) - r) < tol;
    });
  }
  if (ok || depth > 10) { out.push([a, m, b]); return; }
  fitArcs3(f, t0, (t0 + t1) / 2, out, depth + 1, tol);
  fitArcs3(f, (t0 + t1) / 2, t1, out, depth + 1, tol);
}

function topOutline(R, s, inset) {
  const a = (s.table_l / 2) * MM - inset, b = (s.table_w / 2) * MM - inset;
  if (s.top_mode === "se") {
    // Polar form keeps the points evenly spread. Drawn as tangent-fitted
    // arcs (within 0.02 mm) rather than a spline: the same shape, but the
    // round-overs and holes are many times quicker to model.
    const n = s.se_n;
    const at = t => {
      const th = 2 * Math.PI * t, c = Math.cos(th), si = Math.sin(th);
      const r = (Math.abs(c / a) ** n + Math.abs(si / b) ** n) ** (-1 / n);
      return [r * c, r * si];
    };
    const arcs = [];
    for (let q = 0; q < 4; q++) fitArcs3(at, q / 4, (q + 1) / 4, arcs, 0);
    let dr = R.draw(arcs[0][0]);
    for (const [, mid, end] of arcs) dr = dr.threePointsArcTo(end, mid);
    return dr.close();
  }
  const r = Math.max(0, Math.min(s.corner_r * MM - inset, a - 0.5, b - 0.5));
  return r > 0.05 ? R.drawRoundedRectangle(2 * a, 2 * b, r) : R.drawRectangle(2 * a, 2 * b);
}

function buildTop(R, s, d, notes) {
  const t = s.top_t * MM, z0 = d.apron_top * MM;
  const under = t * Math.tan(s.top_bevel * D2R);
  let top;
  if (under > 0.05) {
    const lower = topOutline(R, s, under).sketchOnPlane("XY", z0);
    const upper = topOutline(R, s, 0).sketchOnPlane("XY", z0 + t);
    top = lower.loftWith(upper, { ruled: true });
  } else {
    top = topOutline(R, s, 0).sketchOnPlane("XY", z0).extrude(t);
  }
  const ch = Math.min((s.edge_ch || 0) * MM, t / 2 - 0.3);
  if (ch > 0.2) {
    try {
      top = top.chamfer(ch, e => e.inPlane("XY", z0 + t));
      if (under <= 0.05) top = top.chamfer(ch, e => e.inPlane("XY", z0));
    } catch (e) {
      notes.push("The edge chamfer could not be modelled exactly at this size, so the top has square edges in the exports.");
    }
  }
  const r = Math.min(s.edge_r * MM, t / 2 - 0.3);
  if (r > 0.2) {
    try {
      top = top.fillet(r, e => e.inPlane("XY", z0 + t));
      if (under <= 0.05) top = top.fillet(r, e => e.inPlane("XY", z0));
    } catch (e) {
      notes.push("The edge round-over could not be modelled exactly at this size, so the top has square edges in the exports.");
    }
  }
  return top;
}

// Leg in its final place. (sx, sy) are the corner signs in the CAD frame.
function buildLeg(R, s, d, sx, sy) {
  const cx = sx * d.leg_cx * MM, cy = sy * d.leg_cy * MM;
  const top = s.leg_sq * MM, foot = s.foot * MM, zHead = d.head_z0 * MM;
  const diag = Math.hypot(d.leg_cx, d.leg_cy) || 1, off = zHead * Math.tan(s.splay_ang * D2R);
  let fx = cx + sx * off * d.leg_cx / diag, fy = cy + sy * off * d.leg_cy / diag;
  if (s.leg_section === "square") { fx += sx * (top - foot) / 2; fy += sy * (top - foot) / 2; }
  const section = size => legSection(R, s, size);
  const lower = section(foot).translate(fx, fy).sketchOnPlane("XY", 0)
    .loftWith(section(top).translate(cx, cy).sketchOnPlane("XY", zHead), { ruled: true });
  const head = section(top).translate(cx, cy).sketchOnPlane("XY", zHead).extrude(d.apron_top * MM - zHead);
  return lower.fuse(head).simplify();
}

// Edge profile on square legs: the corners are rounded or chamfered along
// the whole leg (the same size at the head and the foot).
export const LEG_EDGE = { eased: 1.5875, chamfer: 3.175 }; // mm
function legSection(R, s, size) {
  if (s.leg_section === "round") return R.drawCircle(size / 2);
  const e = LEG_EDGE[s.leg_edge], h = size / 2;
  if (s.leg_edge === "eased") return R.drawRoundedRectangle(size, size, e);
  if (s.leg_edge === "chamfer") {
    const pts = [[-h + e, -h], [h - e, -h], [h, -h + e], [h, h - e], [h - e, h], [-h + e, h], [-h, h - e], [-h, -h + e]];
    let dr = R.draw(pts[0]);
    for (const p of pts.slice(1)) dr = dr.lineTo(p);
    return dr.close();
  }
  return R.drawRectangle(size, size);
}

// Centre and size (mm) of a leg's section at height z (mm), as buildLeg lofts it.
export function legSectionAt(s, d, sx, sy, z) {
  const cx = sx * d.leg_cx * MM, cy = sy * d.leg_cy * MM, top = s.leg_sq * MM, foot = s.foot * MM, zHead = d.head_z0 * MM;
  const diag = Math.hypot(d.leg_cx, d.leg_cy) || 1, off = zHead * Math.tan(s.splay_ang * D2R);
  let fx = cx + sx * off * d.leg_cx / diag, fy = cy + sy * off * d.leg_cy / diag;
  if (s.leg_section === "square") { fx += sx * (top - foot) / 2; fy += sy * (top - foot) / 2; }
  const t = Math.min(1, z / zHead);
  return { x: fx + (cx - fx) * t, y: fy + (cy - fy) * t, size: foot + (top - foot) * t };
}

// Apron profile in its own plane: u along the length (centred), v up from the
// top edge (v = 0) down to -h, with an optional arch cut from the bottom edge.
function apronProfile(R, half, h, rise) {
  let prof = R.drawRectangle(2 * half, h).translate(0, -h / 2);
  if (rise > 0.3) {
    const rad = (half ** 2 + rise ** 2) / (2 * rise), cy = -h + rise - rad;
    prof = prof.cut(R.drawCircle(rad).translate(0, cy));
  }
  return prof;
}

// One apron, plain ended (the joints add tenons or cut slots), built lying
// along X then placed. along: "x" for the long aprons, "y" for the short
// ones. pos = signed offset of the apron's centre plane from the table centre.
function buildApron(R, s, d, along, pos) {
  const half = (along === "x" ? d.long_half : d.short_half) * MM;
  const h = s.apron_h * MM, t = s.apron_t * MM;
  const rise = (along === "x" ? s.arch_rise : s.arch_rise * 0.6) * MM;
  // Profile on XZ: sketch on XY, extrude, then turn up.
  let body = apronProfile(R, half, h, rise).sketchOnPlane("XY").extrude(t).translate([0, 0, -t / 2]);
  body = body.rotate(90, [0, 0, 0], [1, 0, 0]); // local v -> Z, thickness -> Y
  if (along === "y") body = body.rotate(90, [0, 0, 0], [0, 0, 1]);
  const off = along === "x" ? [0, pos, d.apron_top * MM] : [pos, 0, d.apron_top * MM];
  return body.translate(off);
}

// Apply joinery steps (add, cut or keep-common shapes) to a solid.
function applySteps(R, solid, steps) {
  for (const st of steps) {
    const sh = buildShape(R, st.shape);
    solid = st.op === "add" ? solid.fuse(sh) : st.op === "cut" ? solid.cut(sh) : solid.intersect(sh);
  }
  return solid.simplify();
}

const box = (R, x0, x1, y0, y1, z0, z1) => R.makeBox([x0, y0, z0], [x1, y1, z1]);

// Lower shelf sizes, mm.
export const SHELF = { t: 19.05, rail_t: 19.05, rail_h: 38.1, slat_w: 38.1, slat_gap: 12.7, gap: 6,
  dowel_d: 8, dowel_l: 30, dowel_dz: 9 };
const SCREW = { r: 2.0, pilot: 2.05, clear: 2.3, head_r: 4.2, head_t: 3 }; // #8, as in joinery/base.js

/**
 * Lower shelf: a rail between the front and back legs at each end, dowelled
 * into the legs, carrying either slats or a solid panel screwed down from
 * below. The rail ends are shaped to the legs, so they fit tapered, round
 * and splayed legs alike. Adds parts and joints; drills the legs.
 */
function buildShelf(R, s, d, parts, joints, notes, wood) {
  const S = SHELF, zTop = s.shelf_h * MM, zRail = zTop - S.t, zBot = zRail - S.rail_h, zMid = (zRail + zBot) / 2;
  const legOf = (sx, sy) => parts.find(p => p.id === `leg-${sy < 0 ? "front" : "back"}-${sx > 0 ? "right" : "left"}`);
  // Inner face of the legs (distance from the long centre line) between two heights.
  const innerY = (z0, z1) => Math.min(...[z0, z1].map(z => { const c = legSectionAt(s, d, 1, 1, z); return c.y - c.size / 2; }));
  const ylim = innerY(zRail, zTop) - S.gap;
  let xOut = 0;
  const rails = [];
  for (const sx of [1, -1]) {
    const tag = sx > 0 ? "right" : "left", c = legSectionAt(s, d, sx, 1, zMid);
    const x0 = c.x - S.rail_t / 2, x1 = c.x + S.rail_t / 2;
    xOut = Math.max(xOut, Math.abs(c.x) + S.rail_t / 2);
    let rail = box(R, x0, x1, -c.y, c.y, zBot, zRail);
    for (const sy of [1, -1]) rail = rail.cut(legOf(sx, sy).solid);
    const dowels = [];
    for (const sy of [1, -1]) for (const dz of [-S.dowel_dz, S.dowel_dz]) {
      const z = zMid + dz, at = legSectionAt(s, d, sx, sy, z), dx = c.x - at.x;
      const face = Math.abs(at.y) - (s.leg_section === "round" ? Math.sqrt(Math.max(0, (at.size / 2) ** 2 - dx * dx)) : at.size / 2);
      const e = S.dowel_l / 2, Y = v => sy * v, r = S.dowel_d / 2;
      // Cylinder along Y between distances y0 and y1 from the centre line.
      const cylY = (y0, y1, rad) => R.makeCylinder(rad, Math.abs(y1 - y0), [c.x, Math.min(Y(y0), Y(y1)), z], [0, 1, 0]);
      const leg = legOf(sx, sy);
      // Both holes run 3 mm past the joint line: round and splayed legs
      // curve away from it across the dowel.
      leg.solid = leg.solid.cut(cylY(face - 3, face + e + 1.5, r + 0.05));
      rail = rail.cut(cylY(face - e - 1.5, face + 3, r + 0.05));
      const id = `shelf-dowel-${tag}-${sy < 0 ? "front" : "back"}-${dz > 0 ? "upper" : "lower"}`;
      parts.push({ id, name: `Dowel ${S.dowel_d} × ${S.dowel_l}`, group: "joinery", kind: "tenon", bought: true, material: "beech",
        solid: cylY(face - e, face + e, r) });
      dowels.push([id, leg.id]);
    }
    rails.push({ id: `shelf-rail-${tag}`, x: c.x, solid: rail, dowels });
  }
  // What sits on the rails: slats, or one panel.
  const boards = [];
  if (s.shelf === "slats") {
    const span = 2 * ylim, n = Math.max(2, Math.floor((span + S.slat_gap) / (S.slat_w + S.slat_gap)));
    const pitch = (span - S.slat_w) / (n - 1);
    for (let i = 0; i < n; i++) {
      const y = -ylim + S.slat_w / 2 + i * pitch;
      boards.push({ id: `shelf-slat-${i + 1}`, name: "Shelf slat", y0: y - S.slat_w / 2, y1: y + S.slat_w / 2, screws: [y] });
    }
    notes.push(`The shelf has ${n} slats with ${(pitch - S.slat_w).toFixed(1)} mm gaps, each screwed down through the rails.`);
  } else {
    const mv = 2 * ylim * 0.00274 * 4; // walnut-like movement across the panel
    boards.push({ id: "shelf", name: "Lower shelf", y0: -ylim, y1: ylim, screws: [-ylim / 2, ylim / 2], slot: mv / 2 + 0.5 });
  }
  for (const b of boards) {
    let solid = box(R, -xOut, xOut, b.y0, b.y1, zRail, zTop);
    for (const rl of rails) for (const y of b.screws) {
      // Counterbored from below, clearance through the rail (a slot for the
      // solid shelf so it can move), pilot hole into the board.
      const tag = `${b.id}-${rl.id.replace("shelf-rail-", "")}-${b.screws.indexOf(y) + 1}`;
      const cb = 10, len = 38.1;
      rl.solid = rl.solid.cut(R.makeCylinder(SCREW.head_r + 0.5, cb + 0.5, [rl.x, y, zBot - 0.5]));
      const z0 = zBot + cb - 0.5, hh = S.rail_h - cb + 1, cylAt = dy => R.makeCylinder(SCREW.clear, hh, [rl.x, y + dy, z0]);
      const hole = b.slot ? cylAt(-b.slot).fuse(cylAt(b.slot))
        .fuse(box(R, rl.x - SCREW.clear, rl.x + SCREW.clear, y - b.slot, y + b.slot, z0, z0 + hh)) : cylAt(0);
      rl.solid = rl.solid.cut(hole);
      // The head sits in the counterbore; the shank goes 12 mm into the board.
      const tip = zBot + cb + len;
      solid = solid.cut(R.makeCylinder(SCREW.pilot, tip - zRail + 1.5, [rl.x, y, zRail - 0.5]));
      const screw = R.makeCylinder(SCREW.head_r, SCREW.head_t, [rl.x, y, zBot + cb - SCREW.head_t]).fuse(R.makeCylinder(SCREW.r, len, [rl.x, y, zBot + cb]));
      parts.push({ id: `screw-${tag}`, name: "Wood screw #8 × 1½", group: "fixings", kind: "hardware", bought: true, material: "steel", solid: screw });
      joints.push({ type: "screwed-down", parts: [b.id, rl.id], via: [`screw-${tag}`] });
    }
    parts.push(wood(b.id, b.name, "shelf", solid.simplify()));
  }
  for (const rl of rails) {
    parts.push(wood(rl.id, "Shelf rail", "shelf", rl.solid.simplify()));
    for (const [id, leg] of rl.dowels) joints.push({ type: "dowel", parts: [rl.id, leg], via: [id] });
  }
  if (ylim < 60) notes.push("The legs are close together across the width, so the shelf is narrow.");
}

/**
 * Build every part of a table as an exact solid, with the chosen joints.
 * Parts have a kind (wood, tenon, hardware) and `bought` for the ones you
 * buy rather than make.
 * @returns {{ parts: Array<{id, name, group, kind, bought, material, solid}>, joints: Array, notes: string[] }}
 */
export function buildTableSolids(R, s) {
  const d = tableDerive(s), notes = [];
  const parts = [];
  const material = s.finish || "walnut";
  const J = tableJoinery(s);
  const wood = (id, name, group, solid) => ({ id, name, group, kind: "wood", bought: false, material, solid });

  let top = buildTop(R, s, d, notes);
  for (const sh of J.top) top = top.cut(buildShape(R, sh));
  parts.push(wood("top", "Top", "top", top));

  // Aprons: two long (front and back), two short (ends).
  const aprons = [
    { id: "apron-front", name: "Long apron", along: "x", pos: -d.rail_y * MM },
    { id: "apron-back", name: "Long apron", along: "x", pos: d.rail_y * MM },
    { id: "apron-right", name: "Short apron", along: "y", pos: d.rail_x * MM },
    { id: "apron-left", name: "Short apron", along: "y", pos: -d.rail_x * MM },
  ];
  for (const a of aprons)
    parts.push(wood(a.id, a.name, "aprons", applySteps(R, buildApron(R, s, d, a.along, a.pos), J.apron[a.id])));

  for (const [sx, sy, id] of [[1, -1, "leg-front-right"], [-1, -1, "leg-front-left"], [1, 1, "leg-back-right"], [-1, 1, "leg-back-left"]]) {
    let leg = buildLeg(R, s, d, sx, sy);
    for (const sh of J.leg[id]) leg = leg.cut(buildShape(R, sh));
    parts.push(wood(id, "Leg", "legs", leg.simplify()));
  }

  for (const { body, group } of J.parts) {
    const own = body.kind === "wood";
    parts.push({ id: body.id, name: body.name, group, kind: body.kind, bought: isBought(body),
      material: own ? material : body.material, solid: buildBody(R, body) });
  }

  const joints = [...J.joints];
  if (s.shelf) buildShelf(R, s, d, parts, joints, notes, wood);
  return { parts, joints, notes: [...J.notes, ...notes] };
}
