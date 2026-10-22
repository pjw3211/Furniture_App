// Shared table geometry for the joinery reference models: sizes, the four
// leg corners, leg bodies, apron frames and small helpers.
import { inch, frame, frameY, toWorld, vsub, vdot, vadd, vscale, rect, circle, box, loft, cyl, body, add, cut } from "./shapes.js";

// Table sizes in inches, as in the app (src/furniture.js).
export const COFFEE = { table_l: 48, table_w: 22, table_h: 16, top_t: 1, inset_x: 5, inset_y: 3.5,
  leg_sq: 1.75, foot: 1, apron_h: 3, apron_t: 0.75, apron_set: 0.25, leg_section: "square" };
export const SIDE = { table_l: 20, table_w: 20, table_h: 22, top_t: 1, inset_x: 3, inset_y: 3,
  leg_sq: 1.5, foot: 0.75, apron_h: 2.5, apron_t: 0.75, apron_set: 0.25, leg_section: "round" };

// Fits and allowances (mm), from the checklist's "Fits and clearances".
export const FIT = { standard: 0.1, tight: 0.05, loose: 0.2 };
export const GLUE_ROOM = 1.5;      // mortise deeper than tenon
export const MITRE_GAP = 1;        // between mitred tenon ends
export const HOLE_CLEAR = 0.05;    // radial clearance around dowels, bolts and screw cores
export const SCREW = { r: 2.0, pilot: 2.05, clear: 2.3, head_r: 4.2, head_t: 3 }; // #8 / 4 mm

// Wood movement: width × coefficient × moisture swing (Wood Handbook, flatsawn).
export const MOVEMENT = { walnut: 0.00274, teak: 0.00186, white_oak: 0.00365, cherry: 0.00248, hard_maple: 0.00353,
  rosewood: 0.0020 }; // rosewood: estimate from its tangential shrinkage
export const MOISTURE_SWING = 4; // %
export const movement = (widthMm, species = "walnut") => widthMm * MOVEMENT[species] * MOISTURE_SWING;

// All sizes in mm plus the derived positions (same rules as tableDerive()).
export function geom(sIn) {
  const s = Object.fromEntries(Object.entries(sIn).map(([k, v]) => [k, typeof v === "number" ? inch(v) : v]));
  const g = { ...s, src: sIn };
  g.apron_top = s.table_h - s.top_t;
  g.head_h = Math.max(inch(3), s.apron_h);
  g.head_z0 = g.apron_top - g.head_h;
  g.leg_cx = s.table_l / 2 - s.inset_x;
  g.leg_cy = s.table_w / 2 - s.inset_y;
  g.long_half = g.leg_cx - s.leg_sq / 2;    // apron end (leg inner face), x
  g.short_half = g.leg_cy - s.leg_sq / 2;
  g.rail_y = g.leg_cy + s.leg_sq / 2 - s.apron_set - s.apron_t / 2;
  g.rail_x = g.leg_cx + s.leg_sq / 2 - s.apron_set - s.apron_t / 2;
  g.apron_mid = g.apron_top - s.apron_h / 2;
  // Distance from a leg's inner face to the other apron's centre plane:
  // mitred tenons from both aprons meet there.
  g.meet = s.leg_sq - s.apron_set - s.apron_t / 2;
  // How far an apron's inside face sits behind the leg's inner face.
  g.inside_step = g.rail_y - s.apron_t / 2 - g.short_half;
  return g;
}

export const CORNERS = [
  { sx: 1, sy: -1, name: "front-right" }, { sx: -1, sy: -1, name: "front-left" },
  { sx: 1, sy: 1, name: "back-right" }, { sx: -1, sy: 1, name: "back-left" },
];
export const FR = CORNERS[0];
export const apronId = (c, which) => which === "long" ? `apron-${c.sy < 0 ? "front" : "back"}` : `apron-${c.sx > 0 ? "right" : "left"}`;
export const legId = c => `leg-${c.name}`;

// Leg in place: square head over the apron zone, tapered or round below.
// Square legs taper on the two inside faces (outer faces stay flush).
export function legShapes(g, c, { z0 = 0, section = g.leg_section } = {}) {
  const cx = c.sx * g.leg_cx, cy = c.sy * g.leg_cy, top = g.leg_sq, foot = g.foot, zH = g.head_z0;
  const head = box([cx - top / 2, cy - top / 2, zH], [cx + top / 2, cy + top / 2, g.apron_top]);
  const t = (z0 - 0) / zH, at = (a, b) => a + (b - a) * t; // section at z0 (when the model starts above the floor)
  let lower;
  if (section === "round") {
    lower = loft(z0, circle(cx, cy, at(foot, top) / 2), zH, circle(cx, cy, top / 2));
  } else {
    const fs = at(foot, top), off = (top - fs) / 2;
    lower = loft(z0, rect(cx + c.sx * off, cy + c.sy * off, fs, fs), zH, rect(cx, cy, top, top));
  }
  return [lower, head];
}
// Leg size and inner-face position at height z (square tapered legs).
export function legSectionAt(g, z) {
  return g.foot + (g.leg_sq - g.foot) * Math.min(1, z / g.head_z0);
}
export const legBody = (g, c, opts) => body(legId(c), "Leg", "wood", legShapes(g, c, opts).map(add));

// Frame at the end of an apron where it meets a leg: origin on the leg's
// inner face at the apron's centre plane, at floor height; x points into the
// leg, z up. `ins` is +1 when local y points toward the table centre.
export function apronFrame(g, c, which) {
  const o = which === "long" ? [c.sx * g.long_half, c.sy * g.rail_y, 0] : [c.sx * g.rail_x, c.sy * g.short_half, 0];
  const x = which === "long" ? [c.sx, 0, 0] : [0, c.sy, 0];
  const inside = which === "long" ? [0, -c.sy, 0] : [-c.sx, 0, 0];
  const F = frame(o, x);
  return { F, ins: Math.sign(vdot(frameY(F), inside)) };
}
// Frame whose local XY is the apron's end face (x across the thickness, y up)
// and z points into the leg: for slots and rounded tenons.
export function endFaceFrame(A) {
  return frame(A.F.o, frameY(A.F), A.F.x);
}
export const dirWorld = (F, d) => vsub(toWorld(F, d), F.o);
export const at = (F, p) => toWorld(F, p);
// Cylinder along the apron frame's x from a0 to a1, at lateral b and height z.
export const cylA = (A, a0, a1, b, z, r) => cyl(at(A.F, [a0, b, z]), at(A.F, [a1, b, z]), r);

// Apron stub (a short length of apron next to the leg), local frame.
export function apronStub(g, A, length, { h = g.apron_h, t = g.apron_t, top = g.apron_top } = {}) {
  return box([-length, -t / 2, top - h], [0, t / 2, top], A.F);
}

export const P = (name, value, note, unit = "mm") => ({ name, value: Math.round(value * 1000) / 1000, unit, note });
export { vadd, vscale, cut, add };
