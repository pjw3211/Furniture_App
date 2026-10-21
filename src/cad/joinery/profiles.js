// Section G of the checklist: the drawn profile library. Each profile is one
// closed outline of lines and arcs (mm), plus construction lines named
// STRETCH that mark where the app may stretch it, and a plain-language rule
// for how it resizes. The app (and the Fusion script) draw these as sketches
// and export them as DXF.
import { path, poly, roundedRect, inch } from "./shapes.js";
import { writeDXF } from "../dxf.js";

const SQ = inch(1.75), FOOT = inch(1), LEG_H = inch(15), HEAD = inch(3);

function circleFrom3(p1, p2, p3) {
  const [ax, ay] = p1, [bx, by] = p2, [cx, cy] = p3;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { c: [ux, uy], r: Math.hypot(ax - ux, ay - uy) };
}

// ---- legs (side elevation, floor at y = 0, outside face at x = 0) -------------
const legSquare2 = {
  id: "leg-square-taper-2", section: "G1", title: "Square leg, tapered on two inside faces",
  rule: "Height stretches inside the taper; head height and the two sizes stay as set.",
  loop: poly([[0, 0], [FOOT, 0], [SQ, LEG_H - HEAD], [SQ, LEG_H], [0, LEG_H]]),
  stretch: [[[-5, (LEG_H - HEAD) / 2], [SQ + 5, (LEG_H - HEAD) / 2]]],
};
const legSquare4 = {
  id: "leg-square-taper-4", section: "G2", title: "Square leg, tapered on all four faces",
  rule: "Height stretches inside the taper; the foot stays centred.",
  loop: poly([[-FOOT / 2, 0], [FOOT / 2, 0], [SQ / 2, LEG_H - HEAD], [SQ / 2, LEG_H], [-SQ / 2, LEG_H], [-SQ / 2, LEG_H - HEAD]]),
  stretch: [[[-SQ / 2 - 5, (LEG_H - HEAD) / 2], [SQ / 2 + 5, (LEG_H - HEAD) / 2]]],
};
const legRound = {
  id: "leg-round-taper", section: "G3", title: "Round taper with a square head (half profile for the lathe)",
  rule: "Half profile about the centre line x = 0: turned below the head. Height stretches inside the taper.",
  loop: poly([[0, 0], [inch(0.875) / 2, 0], [SQ / 2, LEG_H - HEAD], [SQ / 2, LEG_H], [0, LEG_H]]),
  stretch: [[[-5, (LEG_H - HEAD) / 2], [SQ / 2 + 5, (LEG_H - HEAD) / 2]]],
};
const oct = s => { const k = s / (2 + Math.SQRT2), h = s / 2; return poly([[-h + k, -h], [h - k, -h], [h, -h + k], [h, h - k], [h - k, h], [-h + k, h], [-h, h - k], [-h, -h + k]]); };
const legFaceted = {
  id: "leg-faceted-section", section: "G4", title: "Faceted (octagonal) leg, section at the head",
  rule: "Regular octagon across flats = leg size; the foot section is the same shape scaled to the foot size.",
  loop: oct(SQ), stretch: [],
};

// ---- aprons (front view, top edge at y = 0, centred on x = 0) --------------------
const APRON_L = inch(36.25), APRON_H = inch(3), RISE = inch(1), FLAT = inch(2);
function apronArc() {
  const a = APRON_L / 2 - FLAT, h = APRON_H;
  return {
    id: "apron-arc", section: "G5", title: "Apron with a single arc",
    rule: "Ends stay full height for 2 in (room for the tenon); the arc is redrawn through the new span and rise.",
    loop: path([-APRON_L / 2, 0], [{ to: [APRON_L / 2, 0] }, { to: [APRON_L / 2, -h] }, { to: [a, -h] },
      { to: [-a, -h], via: [0, -h + RISE] }, { to: [-APRON_L / 2, -h] }]),
    stretch: [],
  };
}
// Three-centred (basket) arch: the usual stand-in for an ellipse that a
// router template or CNC can cut with plain arcs.
function apronEllipse() {
  const a = APRON_L / 2 - FLAT, b = RISE, h = APRON_H, k = 0.5 * b / a;
  const phi = Math.PI / 2 - 2 * Math.atan(k), r1 = (b - a * k) / (1 - k);
  const c1 = a - r1, P = [c1 + r1 * Math.cos(phi), r1 * Math.sin(phi)];
  const m1 = [c1 + r1 * Math.cos(phi / 2), r1 * Math.sin(phi / 2)];
  const Y = y => -h + y;
  return {
    id: "apron-elliptical", section: "G6", title: "Apron with an elliptical (three-centred) arch",
    rule: "Three tangent arcs: tight at the ends, flat in the middle. Redrawn from span and rise; 2 in flats at each end.",
    loop: path([-APRON_L / 2, 0], [{ to: [APRON_L / 2, 0] }, { to: [APRON_L / 2, -h] }, { to: [a, Y(0)] },
      { to: [P[0], Y(P[1])], via: [m1[0], Y(m1[1])] }, { to: [-P[0], Y(P[1])], via: [0, Y(b)] },
      { to: [-a, Y(0)], via: [-m1[0], Y(m1[1])] }, { to: [-APRON_L / 2, -h] }]),
    stretch: [], radii: { end: r1, crown: r1 + (a - r1) / Math.cos(phi) },
  };
}
function apronStepped() {
  const h = APRON_H, x0 = APRON_L / 2 - FLAT, r = RISE, k = r * (1 - Math.SQRT1_2);
  return {
    id: "apron-stepped", section: "G7", title: "Apron with a raised flat bottom and curved ends",
    rule: "The straight middle stretches; the curves at each end keep their radius.",
    loop: path([-APRON_L / 2, 0], [{ to: [APRON_L / 2, 0] }, { to: [APRON_L / 2, -h] }, { to: [x0, -h] },
      { to: [x0 - r, -h + r], via: [x0 - k, -h + r - k] }, { to: [-x0 + r, -h + r] },
      { to: [-x0, -h], via: [-x0 + k, -h + r - k] }, { to: [-APRON_L / 2, -h] }]),
    stretch: [[[0, -h - 5], [0, 5]]],
  };
}

// ---- top outlines (plan, centred) --------------------------------------------
const TL = inch(48), TW = inch(22);
const topRounded = {
  id: "top-rounded-rect", section: "G8", title: "Top: rectangle with 4 in corners",
  rule: "Straight sides stretch; corner radius stays as set.",
  loop: roundedRect(0, 0, TL, TW, inch(4)),
  stretch: [[[0, -TW / 2 - 5], [0, TW / 2 + 5]], [[-TL / 2 - 5, 0], [TL / 2 + 5, 0]]],
};
// Superellipse |x/a|^n + |y/b|^n = 1 as arcs through point triples (for CNC).
function topSuperellipse(n = 2.5, N = 96) {
  const a = inch(54) / 2, b = inch(24) / 2, pts = [];
  for (let i = 0; i < N; i++) {
    const t = 2 * Math.PI * i / N, c = Math.cos(t), s = Math.sin(t);
    const r = (Math.abs(c / a) ** n + Math.abs(s / b) ** n) ** (-1 / n);
    pts.push([r * c, r * s]);
  }
  const segs = [];
  for (let i = 1; i <= N / 2; i++) segs.push({ to: pts[(2 * i) % N], via: pts[2 * i - 1] });
  return {
    id: "top-superellipse", section: "G9", title: "Top: superellipse (Piet Hein, n = 2.5), 54 × 24 in",
    rule: "Scales evenly to the new length and width; redrawn as 48 arcs, so print a full-size template for routing.",
    loop: path(pts[0], segs), stretch: [],
  };
}
// Surfboard: two large arcs meeting at rounded tips (a starter to adjust).
function topSurfboard() {
  const a = TL / 2, b = TW / 2, rho = inch(2), cx = a - rho;
  // Big arc centre (0, -(R - b)) touching the tip arc centred (cx, 0) radius rho from inside.
  const Rb = (cx * cx - rho * rho + b * b) / (2 * (b - rho)), cy = -(Rb - b);
  const dir = [cx - 0, 0 - cy], L = Math.hypot(...dir), T = [Rb * dir[0] / L, cy + Rb * dir[1] / L];
  return {
    id: "top-surfboard", section: "G10", title: "Top: surfboard (starter shape to adjust)",
    rule: "Scales evenly. Drawn by Claude as a starting point; adjust the tips and sides in Fusion to taste.",
    loop: path([-T[0], T[1]], [{ to: [T[0], T[1]], via: [0, b] }, { to: [T[0], -T[1]], via: [a, 0] },
      { to: [-T[0], -T[1]], via: [0, -b] }, { to: [-T[0], T[1]], via: [-a, 0] }]),
    stretch: [], radii: { side: Rb, tip: rho },
  };
}

// ---- top edges (section through the edge, top underside at y = 0, edge at x = 0) ----
const T = inch(1), BACK = 40;
const edgeBevel = { id: "edge-undercut-bevel", section: "G12", title: "Edge: undercut bevel (Juhl, 18.5°)",
  rule: "Angle stays at 18.5°; the undercut follows the top thickness.",
  loop: poly([[-BACK, 0], [-T * Math.tan(18.5 * Math.PI / 180), 0], [0, T], [-BACK, T]]), stretch: [] };
function edgeRound(r = inch(0.25)) {
  const k = r * (1 - Math.SQRT1_2);
  return { id: "edge-roundover", section: "G13", title: "Edge: ¼ in round-over top and bottom",
    rule: "Radius snaps to router bit sizes: 1/8, 3/16, 1/4, 3/8, 1/2 in or 3, 5, 6, 10, 12 mm.",
    loop: path([-BACK, 0], [{ to: [-r, 0] }, { to: [0, r], via: [-k, k] }, { to: [0, T - r] }, { to: [-r, T], via: [-k, T - k] }, { to: [-BACK, T] }]),
    stretch: [] };
}
const edgeKnife = { id: "edge-knife", section: "G14", title: "Edge: knife edge (bevelled top and bottom)",
  rule: "Bevels run 10 mm in from the edge; the 3 mm flat stays at mid-thickness.",
  loop: poly([[-BACK, 0], [-10, 0], [0, T / 2 - 1.5], [0, T / 2 + 1.5], [-10, T], [-BACK, T]]), stretch: [] };
const edgeSoft = { id: "edge-soft-square", section: "G15", title: "Edge: square with 1.5 mm chamfers",
  rule: "Chamfer stays at 1.5 mm.", loop: poly([[-BACK, 0], [-1.5, 0], [0, 1.5], [0, T - 1.5], [-1.5, T], [-BACK, T]]), stretch: [] };

export function profiles() {
  return [legSquare2, legSquare4, legRound, legFaceted, apronArc(), apronEllipse(), apronStepped(),
    topRounded, topSuperellipse(), topSurfboard(), edgeBevel, edgeRound(), edgeKnife, edgeSoft];
}

// Outline as DXF entities (LINE / ARC), in order.
export function profileEntities(p) {
  const out = [], loop = p.loop;
  let cur = loop.start;
  const segs = [...loop.segs];
  const last = segs.length ? segs[segs.length - 1].to : cur;
  if (Math.hypot(last[0] - loop.start[0], last[1] - loop.start[1]) > 1e-6) segs.push({ to: loop.start });
  for (const s of segs) {
    if (s.via) {
      const f = circleFrom3(cur, s.via, s.to);
      const ang = q => (Math.atan2(q[1] - f.c[1], q[0] - f.c[0]) * 180 / Math.PI + 360) % 360;
      let a0 = ang(cur), a1 = ang(s.to);
      const am = ang(s.via), ccw = ((am - a0 + 360) % 360) < ((a1 - a0 + 360) % 360);
      if (!ccw) [a0, a1] = [a1, a0];
      out.push({ type: "ARC", c: f.c, r: f.r, start: a0, end: a1 });
    } else out.push({ type: "LINE", a: cur, b: s.to });
    cur = s.to;
  }
  return out;
}

export function profileDXF(p) {
  return writeDXF([
    { name: "CUT", color: 7, entities: profileEntities(p) },
    { name: "STRETCH", color: 1, entities: p.stretch.map(([a, b]) => ({ type: "LINE", a, b })) },
  ], [{ layer: "TEXT", at: [0, -25], height: 4, text: `${p.title} - ${p.rule}` }]);
}
