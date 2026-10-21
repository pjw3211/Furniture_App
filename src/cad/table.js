// Exact solid model of the coffee table and side table, built with replicad
// (OpenCascade). Takes the same parameters as the quick browser model in
// src/furniture.js (inches and degrees) and returns every part as a solid.
//
// CAD frame: millimetres, Z up, X along the length, the front of the table
// faces -Y. This matches the STL frame the app has always exported.

export const TENON = { t: 0.375, h: 1.25, d: 0.75 }; // inches, as in the quick model
export const MORTISE_EXTRA_DEPTH = 1.5; // mm of glue room below each tenon

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

function topOutline(R, s, inset) {
  const a = (s.table_l / 2) * MM - inset, b = (s.table_w / 2) * MM - inset;
  if (s.top_mode === "se") {
    // Polar form keeps the points evenly spread, so the spline is smooth.
    const n = s.se_n;
    return R.drawParametricFunction(t => {
      const th = 2 * Math.PI * t, c = Math.cos(th), si = Math.sin(th);
      const r = (Math.abs(c / a) ** n + Math.abs(si / b) ** n) ** (-1 / n);
      return [r * c, r * si];
    }, { pointsCount: 240, closeShape: true });
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
  const section = size => s.leg_section === "round" ? R.drawCircle(size / 2) : R.drawRectangle(size, size);
  const lower = section(foot).translate(fx, fy).sketchOnPlane("XY", 0)
    .loftWith(section(top).translate(cx, cy).sketchOnPlane("XY", zHead), { ruled: true });
  const head = R.makeBox([cx - top / 2, cy - top / 2, zHead], [cx + top / 2, cy + top / 2, d.apron_top * MM]);
  return lower.fuse(head).simplify();
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

// One apron with a tenon on each end, built lying along X then placed.
// along: "x" for the long aprons, "y" for the short ones. pos = signed offset
// of the apron's centre plane from the table centre.
function buildApron(R, s, d, along, pos) {
  const half = (along === "x" ? d.long_half : d.short_half) * MM;
  const h = s.apron_h * MM, t = s.apron_t * MM;
  const rise = (along === "x" ? s.arch_rise : s.arch_rise * 0.6) * MM;
  const tt = TENON.t * MM, th = TENON.h * MM, td = tenonLength(s, d, along);
  // Profile on XZ: sketch on XY, extrude, then turn up.
  let body = apronProfile(R, half, h, rise).sketchOnPlane("XY").extrude(t).translate([0, 0, -t / 2]);
  const vMid = -h / 2;
  for (const sgn of [1, -1]) {
    const x0 = sgn > 0 ? half : -half - td, x1 = sgn > 0 ? half + td : -half;
    body = body.fuse(R.makeBox([x0, vMid - th / 2, -tt / 2], [x1, vMid + th / 2, tt / 2]));
  }
  body = body.simplify().rotate(90, [0, 0, 0], [1, 0, 0]); // local v -> Z, thickness -> Y
  if (along === "y") body = body.rotate(90, [0, 0, 0], [0, 0, 1]);
  const off = along === "x" ? [0, pos, d.apron_top * MM] : [pos, 0, d.apron_top * MM];
  return body.translate(off);
}

// The tenon on one end of an apron, as a box in the CAD frame, made a little
// deeper so it can be cut from the leg as the mortise.
function mortiseBox(R, s, d, along, pos, end) {
  const tt = TENON.t * MM, th = TENON.h * MM, td = tenonLength(s, d, along) + MORTISE_EXTRA_DEPTH;
  const zc = (d.apron_top - s.apron_h / 2) * MM;
  const half = (along === "x" ? d.long_half : d.short_half) * MM;
  const a0 = end * half, a1 = end * (half + td);
  const [lo, hi] = [Math.min(a0, a1), Math.max(a0, a1)];
  return along === "x"
    ? R.makeBox([lo, pos - tt / 2, zc - th / 2], [hi, pos + tt / 2, zc + th / 2])
    : R.makeBox([pos - tt / 2, lo, zc - th / 2], [pos + tt / 2, hi, zc + th / 2]);
}

// Tenon length for an apron. On small tables the two tenons entering one leg
// would meet inside it, so they are shortened to leave 1 mm between them.
export function tenonLength(s, d, along) {
  const half = along === "x" ? d.long_half : d.short_half;
  const otherRail = along === "x" ? d.rail_x : d.rail_y;
  const room = (otherRail - TENON.t / 2 - half) * MM - 1;
  return Math.max(6, Math.min(TENON.d * MM, room));
}

const box = (R, x0, x1, y0, y1, z0, z1) => R.makeBox([x0, y0, z0], [x1, y1, z1]);

/**
 * Build every part of a table as an exact solid.
 * @returns {{ parts: Array<{id, name, group, material, solid}>, joints: Array, notes: string[] }}
 */
export function buildTableSolids(R, s) {
  const d = tableDerive(s), notes = [];
  const parts = [], joints = [];
  const material = s.finish || "walnut";

  parts.push({ id: "top", name: "Top", group: "top", material, solid: buildTop(R, s, d, notes) });

  // Aprons: two long (front and back), two short (ends). CAD y = -three z.
  const aprons = [
    { id: "apron-front", name: "Long apron", along: "x", pos: -d.rail_y * MM },
    { id: "apron-back", name: "Long apron", along: "x", pos: d.rail_y * MM },
    { id: "apron-right", name: "Short apron", along: "y", pos: d.rail_x * MM },
    { id: "apron-left", name: "Short apron", along: "y", pos: -d.rail_x * MM },
  ];
  for (const a of aprons)
    parts.push({ id: a.id, name: a.name, group: "aprons", material, solid: buildApron(R, s, d, a.along, a.pos) });

  // Legs, each with the two mortises for the aprons that meet it.
  for (const [sx, sy, id] of [[1, -1, "leg-front-right"], [-1, -1, "leg-front-left"], [1, 1, "leg-back-right"], [-1, 1, "leg-back-left"]]) {
    let leg = buildLeg(R, s, d, sx, sy);
    const longA = aprons.find(a => a.along === "x" && Math.sign(a.pos) === sy);
    const shortA = aprons.find(a => a.along === "y" && Math.sign(a.pos) === sx);
    leg = leg.cut(mortiseBox(R, s, d, "x", longA.pos, sx)).cut(mortiseBox(R, s, d, "y", shortA.pos, sy));
    parts.push({ id, name: "Leg", group: "legs", material, solid: leg });
    for (const a of [longA, shortA]) {
      const len = tenonLength(s, d, a.along);
      joints.push({ type: "mortise-and-tenon", parts: [a.id, id],
        tenon_mm: { thickness: TENON.t * MM, height: TENON.h * MM, length: len },
        mortise_depth_mm: len + MORTISE_EXTRA_DEPTH });
    }
  }

  const shortest = Math.min(tenonLength(s, d, "x"), tenonLength(s, d, "y"));
  if (shortest < TENON.d * MM - 0.01)
    notes.push(`The legs are small for the aprons, so tenons are shortened to ${shortest.toFixed(1)} mm to clear each other inside the legs.`);
  if (s.shelf) {
    const z = s.shelf_h * MM, t = 0.75 * MM;
    parts.push({ id: "shelf", name: "Lower shelf", group: "shelf", material,
      solid: box(R, -d.long_half * MM, d.long_half * MM, -d.short_half * MM, d.short_half * MM, z - t, z) });
    notes.push("The lower shelf sits on cleats screwed to the legs; the cleats are not modelled yet.");
  }
  return { parts, joints, notes };
}
