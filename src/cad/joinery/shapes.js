// A small, plain-data shape language for joinery reference models.
//
// Every model is a list of bodies; each body is a list of steps that add,
// cut or intersect simple shapes (boxes, extruded outlines, two-section
// lofts and cylinders/cones). The same data is built two ways:
//   * here, with replicad (OpenCascade), for the automated tests and the app;
//   * in Fusion, by reference/coffee-table/joinery/build_joinery/build_joinery.py.
// Keep the vocabulary small so both builders stay simple.
//
// Units: millimetres. Frame: Z up, X along the table length, front faces -Y,
// origin on the floor at the centre of the table.

export const MM = 25.4;
export const inch = v => v * MM;
export const D2R = Math.PI / 180;

// ---- vectors -------------------------------------------------------------
export const vadd = (a, b) => a.map((v, i) => v + b[i]);
export const vsub = (a, b) => a.map((v, i) => v - b[i]);
export const vscale = (a, s) => a.map(v => v * s);
export const vdot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = a => Math.hypot(...a);
export const vnorm = a => vscale(a, 1 / vlen(a));
const round = v => Math.round(v * 1e6) / 1e6;
const r3 = p => p.map(round);

// A local frame: origin o, x axis and z axis (y = z × x). x is made square to z.
export function frame(o, x = [1, 0, 0], z = [0, 0, 1]) {
  const zn = vnorm(z), xn = vnorm(vsub(x, vscale(zn, vdot(x, zn))));
  return { o: r3(o), x: r3(xn), z: r3(zn) };
}
export const frameY = f => vcross(f.z, f.x);
// Local point -> world point.
export const toWorld = (f, p) => vadd(f.o, vadd(vadd(vscale(f.x, p[0]), vscale(frameY(f), p[1])), vscale(f.z, p[2])));

// ---- 2D outlines (in a frame's local XY) ----------------------------------
export const rect = (cx, cy, w, h) => ({ kind: "rect", cx: round(cx), cy: round(cy), w: round(w), h: round(h) });
export const circle = (cx, cy, r) => ({ kind: "circle", cx: round(cx), cy: round(cy), r: round(r) });
// A closed outline: start point, then segments {to} (line) or {to, via} (arc
// through via). The outline closes itself with a line back to the start.
export const path = (start, segs) => ({
  kind: "path", start: start.map(round),
  segs: segs.map(s => (s.via ? { to: s.to.map(round), via: s.via.map(round) } : { to: s.to.map(round) })),
});
export const poly = pts => path(pts[0], pts.slice(1).map(to => ({ to })));
// Rectangle with rounded corners (radius r), centred on (cx, cy).
export function roundedRect(cx, cy, w, h, r) {
  if (r < 0.01) return rect(cx, cy, w, h);
  const a = w / 2, b = h / 2, k = r * (1 - Math.SQRT1_2), X = x => cx + x, Y = y => cy + y;
  return path([X(-a + r), Y(-b)], [
    { to: [X(a - r), Y(-b)] }, { to: [X(a), Y(-b + r)], via: [X(a - k), Y(-b + k)] },
    { to: [X(a), Y(b - r)] }, { to: [X(a - r), Y(b)], via: [X(a - k), Y(b - k)] },
    { to: [X(-a + r), Y(b)] }, { to: [X(-a), Y(b - r)], via: [X(-a + k), Y(b - k)] },
    { to: [X(-a), Y(-b + r)] }, { to: [X(-a + r), Y(-b)], via: [X(-a + k), Y(-b + k)] },
  ]);
}
// Rounded slot (like a router or Domino mortise): overall length len along
// local x (or y when vertical), width wid, centred on (cx, cy).
export function stadium(cx, cy, len, wid, vertical = false) {
  const r = wid / 2, h = len / 2 - r;
  if (h <= 1e-6) return circle(cx, cy, r);
  const P = (a, b) => (vertical ? [cx + b, cy + a] : [cx + a, cy + b]);
  return path(P(-h, -r), [
    { to: P(h, -r) }, { to: P(h, r), via: P(h + r, 0) },
    { to: P(-h, r) }, { to: P(-h, -r), via: P(-h - r, 0) },
  ]);
}

// ---- 3D shapes ----------------------------------------------------------
// box: min/max corners in the frame (or world when no frame).
export const box = (min, max, f) => ({ type: "box", min: r3(min), max: r3(max), ...(f ? { frame: f } : {}) });
// prism: outline extruded along the frame's z from z0 to z1.
export const prism = (loop, z0, z1, f) => ({ type: "prism", loop, z0: round(z0), z1: round(z1), ...(f ? { frame: f } : {}) });
// loft: straight (ruled) loft between two outlines at frame heights.
export const loft = (z0, loop0, z1, loop1, f) =>
  ({ type: "loft", sections: [{ z: round(z0), loop: loop0 }, { z: round(z1), loop: loop1 }], ...(f ? { frame: f } : {}) });
// cyl: cylinder (or cone when r1 differs) from p0 to p1 in world space.
export const cyl = (p0, p1, r0, r1 = r0) => ({ type: "cyl", p0: r3(p0), p1: r3(p1), r0: round(r0), r1: round(r1) });
// Everything on the far side of a plane through point p with outward normal n.
export function halfSpace(p, n, size = 3000) {
  const z = vnorm(n), x = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return box([-size, -size, 0], [size, size, size], frame(p, x, z));
}

// ---- bodies -------------------------------------------------------------
export const add = shape => ({ op: "add", shape });
export const cut = shape => ({ op: "cut", shape });
export const common = shape => ({ op: "common", shape });
// kind: "wood" (a cut-list part), "tenon" (loose wood insert), "hardware",
// or "reference" (a guide shape such as a rough blank; not a real part).
export const body = (id, name, kind, steps, extra = {}) => ({ id, name, kind, material: extra.material || defaultMaterial(kind), steps, ...extra });
function defaultMaterial(kind) {
  return { wood: "walnut", tenon: "beech", hardware: "steel", reference: "reference" }[kind] || "walnut";
}
// The additive shapes of a body, e.g. to cut a leg's shape out of an apron.
export const solidOf = b => b.steps.filter(s => s.op === "add").map(s => s.shape);

// ---- building with replicad -----------------------------------------------
const WORLD = frame([0, 0, 0]);

function planeAt(R, f, z) {
  return new R.Plane(toWorld(f, [0, 0, z]), f.x, f.z);
}

function drawLoop(R, loop) {
  if (loop.kind === "rect") return R.drawRectangle(loop.w, loop.h).translate(loop.cx, loop.cy);
  if (loop.kind === "circle") return R.drawCircle(loop.r).translate(loop.cx, loop.cy);
  let d = R.draw(loop.start);
  for (const s of loop.segs) d = s.via ? d.threePointsArcTo(s.to, s.via) : d.lineTo(s.to);
  return d.close();
}

export function buildShape(R, s) {
  const f = s.frame || WORLD;
  if (s.type === "box") {
    const [x0, y0, z0] = s.min, [x1, y1, z1] = s.max;
    return drawLoop(R, rect((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0)).sketchOnPlane(planeAt(R, f, z0)).extrude(z1 - z0);
  }
  if (s.type === "prism") return drawLoop(R, s.loop).sketchOnPlane(planeAt(R, f, s.z0)).extrude(s.z1 - s.z0);
  if (s.type === "loft") {
    const [a, b] = s.sections;
    return drawLoop(R, a.loop).sketchOnPlane(planeAt(R, f, a.z))
      .loftWith(drawLoop(R, b.loop).sketchOnPlane(planeAt(R, f, b.z)), { ruled: true });
  }
  if (s.type === "cyl") {
    const axis = vsub(s.p1, s.p0), h = vlen(axis), dir = vnorm(axis);
    if (Math.abs(s.r0 - s.r1) < 1e-9) return R.makeCylinder(s.r0, h, s.p0, dir);
    const fx = Math.abs(dir[2]) < 0.9 ? vcross(dir, [0, 0, 1]) : [1, 0, 0];
    const cf = frame(s.p0, fx, dir);
    return drawLoop(R, circle(0, 0, s.r0)).sketchOnPlane(planeAt(R, cf, 0))
      .loftWith(drawLoop(R, circle(0, 0, s.r1)).sketchOnPlane(planeAt(R, cf, h)), { ruled: true });
  }
  throw new Error(`Unknown shape type ${s.type}`);
}

export function buildBody(R, b) {
  let solid = null;
  for (const step of b.steps) {
    const shape = buildShape(R, step.shape);
    if (step.op === "add") solid = solid ? solid.fuse(shape) : shape;
    else if (!solid) throw new Error(`${b.id}: the first step must add a shape`);
    else if (step.op === "cut") solid = solid.cut(shape);
    else if (step.op === "common") solid = solid.intersect(shape);
  }
  return solid.simplify();
}
