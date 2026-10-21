// Section B of the checklist: real ways to make splayed legs.
import { box, prism, loft, cyl, rect, circle, halfSpace, body, add, cut, frame, solidOf, vnorm, vadd, vscale, D2R } from "./shapes.js";
import { COFFEE, FIT, GLUE_ROOM, HOLE_CLEAR, SCREW, geom, FR, apronId, legId, apronFrame, apronStub, P, legShapes } from "./base.js";
import { mitreCut, baseParams } from "./legApron.js";

// Unit axis of a leg leaning out on the table diagonal by `deg`, pointing up.
function splayAxis(g, c, deg) {
  const d = vnorm([c.sx * g.leg_cx, c.sy * g.leg_cy, 0]), t = deg * D2R;
  return { d, a: [-d[0] * Math.sin(t), -d[1] * Math.sin(t), Math.cos(t)], t };
}
const lean = (g, c, deg) => {
  const { d, t } = splayAxis(g, c, deg);
  return { x: Math.atan(Math.tan(t) * Math.abs(d[0])) / D2R, y: Math.atan(Math.tan(t) * Math.abs(d[1])) / D2R };
};

// ---- B1: straight leg, leaning out, apron shoulders cut to match ----------
function splayStraight(deg) {
  const g = geom(COFFEE), c = FR, { a, t } = splayAxis(g, c, deg);
  const T = [c.sx * g.leg_cx, c.sy * g.leg_cy, g.apron_top];
  const F = frame(T, [1, 0, 0], a), sq = g.leg_sq, foot = g.foot;
  const headLen = g.head_h / Math.cos(t), floorLen = g.apron_top / Math.cos(t), deep = floorLen + sq;
  const size = zl => foot + (sq - foot) * (zl + floorLen) / (floorLen - headLen); // taper on the two inside faces
  const fs = size(-deep), off = (sq - fs) / 2;
  const legSolid = [
    loft(-deep, rect(c.sx * off, c.sy * off, fs, fs), -headLen, rect(0, 0, sq, sq), F),
    box([-sq / 2, -sq / 2, -headLen], [sq / 2, sq / 2, 30], F),
  ];
  const leg = body(legId(c), "Leg (splayed)", "wood", [...legSolid.map(add),
    cut(halfSpace([0, 0, g.apron_top], [0, 0, 1])), cut(halfSpace([0, 0, 0], [0, 0, -1]))]);
  const bodies = [], joints = [];
  const tt = 9.525, sh = 9.525, L = g.meet, zt = g.apron_top - sh, zb = g.apron_top - g.apron_h + sh, fit = FIT.standard;
  const reach = g.head_h * Math.tan(t) + 3; // how far the leg's inner face moves out over the apron height
  for (const which of ["long", "short"]) {
    const A = apronFrame(g, c, which), stub = which === "long" ? 160 : 140;
    const apron = body(apronId(c, which), which === "long" ? "Long apron" : "Short apron", "wood", [
      add(box([-stub, -g.apron_t / 2, g.apron_top - g.apron_h], [reach, g.apron_t / 2, g.apron_top], A.F)),
      ...legSolid.map(cut),                                     // shoulder follows the leaning leg face
      add(box([-3, -tt / 2, zb], [L, tt / 2, zt], A.F)),
      cut(mitreCut(g, c, which)),
    ]);
    bodies.push(apron);
    leg.steps.push(cut(box([-3, -tt / 2 - fit, zb - fit], [L + GLUE_ROOM, tt / 2 + fit, zt + fit], A.F)));
    joints.push({ type: "mortise-and-tenon", parts: [apron.id, leg.id] });
  }
  const ln = lean(g, c, deg);
  return {
    id: `B1-splay-straight-${deg}`, section: "B1", title: `Straight splayed leg, ${deg}°`, size: "coffee table",
    summary: `A straight leg leaning out ${deg}° on the diagonal. The apron shoulders are cut to the leg's slope and the tenons stay straight.`,
    params: [...baseParams(g), P("splay", deg, "Lean on the diagonal", "deg"),
      P("lean_x", ln.x, "Lean seen from the front: long apron shoulder angle and saw setting", "deg"),
      P("lean_y", ln.y, "Lean seen from the end: short apron shoulder angle", "deg"),
      P("tenon_t", tt, "Tenon thickness"), P("tenon_l", L, "Tenon length, mitred")],
    notes: ["Top and bottom of the leg are cut level; the cut is a compound angle made of lean_x and lean_y."],
    bodies: [leg, ...bodies], joints,
  };
}

// ---- B2: angled block and hanger bolt, no aprons at the leg -----------------
function legPlate(deg = 10) {
  const g = geom(COFFEE), c = FR, { a, t } = splayAxis(g, c, deg), under = g.apron_top;
  const Pt = [c.sx * g.leg_cx, c.sy * g.leg_cy, under - 22];
  const F = frame(Pt, [1, 0, 0], a), along = s => vadd(Pt, vscale(a, s));
  const len = Pt[2] / Math.cos(t) + 30;
  const leg = body(legId(c), "Leg (round, splayed)", "wood", [
    add(loft(-len, circle(0, 0, inchR(0.8)), 0, circle(0, 0, inchR(1.75)), F)),
    cut(halfSpace([0, 0, 0], [0, 0, -1])),
    cut(cyl(along(0.5), along(-26), 4 + HOLE_CLEAR)),
  ]);
  const bx = 76.2, steps = [add(box([Pt[0] - bx / 2, Pt[1] - bx / 2, under - 40], [Pt[0] + bx / 2, Pt[1] + bx / 2, under])),
    cut(halfSpace(Pt, vscale(a, -1))), cut(cyl(along(-0.5), along(20), 6 + HOLE_CLEAR))];
  const top = body("top", "Top (corner)", "wood", [add(box(
    [Math.min(c.sx * g.table_l / 2, c.sx * (g.table_l / 2 - 300)), Math.min(c.sy * g.table_w / 2, c.sy * (g.table_w / 2 - 250)), under],
    [Math.max(c.sx * g.table_l / 2, c.sx * (g.table_l / 2 - 300)), Math.max(c.sy * g.table_w / 2, c.sy * (g.table_w / 2 - 250)), g.table_h]))]);
  const screws = [];
  for (const [dx, dy] of [[-28, -28], [28, -28], [28, 28], [-28, 28]]) {
    const x = Pt[0] + dx, y = Pt[1] + dy, i = screws.length + 1;
    steps.push(cut(cyl([x, y, under - 60], [x, y, under - 12], 5)), cut(cyl([x, y, under - 12.5], [x, y, under + 0.5], SCREW.clear)));
    top.steps.push(cut(cyl([x, y, under - 0.5], [x, y, under + 14], SCREW.pilot)));
    screws.push(body(`screw-${i}`, "Wood screw #8 × 1", "hardware",
      [add(cyl([x, y, under - 12], [x, y, under + 13], SCREW.r)), add(cyl([x, y, under - 15], [x, y, under - 12], SCREW.head_r))]));
  }
  const block = body("mounting-block", "Angled mounting block", "wood", steps);
  const insert = body("threaded-insert", "Threaded insert M8", "hardware",
    [add(cyl(Pt, along(18), 6)), cut(cyl(along(-1), along(19), 4 + HOLE_CLEAR))]);
  const bolt = body("hanger-bolt", "Hanger bolt M8 × 42", "hardware", [add(cyl(along(-25), along(17), 4))]);
  return {
    id: "B2-leg-plate", section: "B2", title: "Angled mounting block and hanger bolt", size: "coffee table",
    summary: `A round leg splayed ${deg}° screws into a threaded insert in a wooden block. The block's underside is cut square to the leg and the block is screwed under the top. No aprons are needed at the leg.`,
    params: [P("splay", deg, "Lean on the diagonal", "deg"), P("block", bx, "Block size (square)"), P("block_t", 22, "Block thickness at the leg centre"),
      P("bolt", 8, "Hanger bolt diameter (M8 or 5/16 in)"), P("insert_od", 12, "Threaded insert outside diameter")],
    notes: ["A bought angled metal leg plate does the same job; measure one and it can replace the block."],
    bodies: [top, block, leg, insert, bolt, ...screws],
    joints: [
      { type: "hanger-bolt", parts: ["hanger-bolt", leg.id] }, { type: "insert", parts: ["threaded-insert", block.id] },
      { type: "bolt-in-insert", parts: ["hanger-bolt", "threaded-insert"] }, { type: "leg-on-block", parts: [leg.id, block.id], contact: "touch" },
      ...screws.map(s => ({ type: "screw", parts: [block.id, "top"], via: [s.id] })),
    ],
  };
}
const inchR = d => d * 25.4 / 2;

// ---- B3: today's shape, upright head with a bend below ------------------------
function bentLeg(deg = 8) {
  const g = geom(COFFEE), c = FR, t = deg * D2R;
  const cx = c.sx * g.leg_cx, cy = c.sy * g.leg_cy, sq = g.leg_sq, foot = g.foot;
  const diag = Math.hypot(g.leg_cx, g.leg_cy), off = g.head_z0 * Math.tan(t);
  const fx = cx + c.sx * off * g.leg_cx / diag + c.sx * (sq - foot) / 2, fy = cy + c.sy * off * g.leg_cy / diag + c.sy * (sq - foot) / 2;
  const leg = body(legId(c), "Leg (bent)", "wood", [
    add(loft(0, rect(fx, fy, foot, foot), g.head_z0, rect(cx, cy, sq, sq))),
    add(box([cx - sq / 2, cy - sq / 2, g.head_z0], [cx + sq / 2, cy + sq / 2, g.apron_top])),
  ]);
  const xs = [cx - sq / 2, cx + sq / 2, fx - foot / 2, fx + foot / 2], ys = [cy - sq / 2, cy + sq / 2, fy - foot / 2, fy + foot / 2];
  const pad = 3, blankMin = [Math.min(...xs) - pad, Math.min(...ys) - pad, -pad], blankMax = [Math.max(...xs) + pad, Math.max(...ys) + pad, g.apron_top + pad];
  const blank = body("blank", "Rough blank needed", "reference", [add(box(blankMin, blankMax))]);
  const bw = Math.max(blankMax[0] - blankMin[0], blankMax[1] - blankMin[1]);
  return {
    id: "B3-bent-leg", section: "B3", title: "Upright head with a bend (today's shape)", size: "coffee table",
    summary: `The current app leg: square head straight up, lower part leaning ${deg}°. The see-through box is the rough blank it has to be cut from.`,
    params: [P("splay", deg, "Lean of the lower part", "deg"), P("blank_w", bw, "Blank width needed (square)"), P("blank_h", blankMax[2] - blankMin[2], "Blank length")],
    notes: [`The blank needs to be about ${(bw / 25.4).toFixed(2)} in square, against ${(sq / 25.4).toFixed(2)} in for a straight leg: 12/4 stock or a glued-on block.`],
    bodies: [leg, blank], joints: [],
  };
}

export function splayModels() {
  return [splayStraight(6), splayStraight(10), legPlate(10), bentLeg(8)];
}
