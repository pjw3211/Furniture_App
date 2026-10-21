// Sections C and D of the checklist: fixing the top on, and how the top is
// made. Top fixings are shown on the front-right corner: leg, a length of
// both aprons (haunched mortise and tenon), a corner of the top and the
// fasteners.
import { box, prism, loft, cyl, rect, circle, roundedRect, stadium, poly, body, add, cut, common, vadd } from "./shapes.js";
import { COFFEE, HOLE_CLEAR, SCREW, geom, FR, apronFrame, at, P, movement } from "./base.js";
import { corner, mtHaunched } from "./legApron.js";

const STUB = { long: 330, short: 160 };
const SPOTS = { long: [-100, -300], short: [-100] }; // fastener positions, mm from the leg face along each apron

// Gaps that let the top move. On the long aprons the top moves straight in
// and out from the apron (across the grain), on the short ones it slides along.
function gaps(g) {
  const half = movement(g.table_w) / 2;
  return { long: half + 1, short: 1.5, half };
}

// Box in an apron frame using u = distance from the apron's centre plane
// toward the table centre (so u = apron_t / 2 is the inside face).
function ubox(A, a0, a1, u0, u1, z0, z1) {
  const b0 = A.ins * u0, b1 = A.ins * u1;
  return box([Math.min(a0, a1), Math.min(b0, b1), z0], [Math.max(a0, a1), Math.max(b0, b1), z1], A.F);
}
const upt = (A, a, u, z) => at(A.F, [a, A.ins * u, z]);

function topCornerBox(g, c) {
  const xs = [c.sx * g.table_l / 2, c.sx * 110], ys = [c.sy * g.table_w / 2, 0];
  return box([Math.min(...xs), Math.min(...ys), g.apron_top], [Math.max(...xs), Math.max(...ys), g.table_h]);
}

function topFixing({ id, section, title, summary, params, notes, fix }) {
  const g = geom(COFFEE), c = FR;
  const m = corner({ id, section, title, summary, sizeName: "coffee table", g, joint: mtHaunched(), stub: STUB, params, notes });
  const top = body("top", "Top (corner)", "wood", [add(topCornerBox(g, c))]);
  m.bodies.push(top);
  const byId = Object.fromEntries(m.bodies.map(b => [b.id, b]));
  for (const which of ["long", "short"]) {
    const A = apronFrame(g, c, which), apron = byId[which === "long" ? "apron-front" : "apron-right"];
    const r = fix({ g, c, A, which, apron, top, gap: gaps(g)[which] });
    m.bodies.push(...r.extra);
    m.joints.push(...r.joints);
  }
  m.params.push(P("movement", movement(g.table_w), "Seasonal movement of a 22 in walnut top (4% moisture swing)"));
  return m;
}

// ---- C1: wooden buttons in a groove ---------------------------------------
function buttons() {
  return topFixing({
    id: "C1-buttons", section: "C1", title: "Wooden buttons in a groove",
    summary: "Buttons hook into a groove on the inside of each apron and are screwed to the top. On the long aprons they sit back from the groove bottom so the top can move.",
    params: [P("groove_w", 6, "Groove width"), P("groove_d", 10, "Groove depth"), P("groove_down", 12, "Groove top below the apron top"),
      P("button", 38, "Button length along the apron"), P("button_t", 19, "Button thickness"), P("pull_down", 1, "Button stands 1 mm short of the top so the screw pulls it tight"),
      P("spacing", 200, "Button spacing (8 to 12 in)")],
    notes: ["Fix the button at the middle of each long apron tight (no gap); all others float."],
    fix: ({ g, A, which, apron, top, gap }) => {
      const extra = [], joints = [];
      apron.steps.push(cut(buttonGroove(g, A, -STUB[which] - 1, -25)));
      SPOTS[which].forEach((ac, i) => {
        const b = makeButton(g, A, `${which}-${i + 1}`, ac, gap);
        top.steps.push(cut(b.pilot));
        extra.push(b.button, b.screw);
        joints.push(...b.joints(apron.id, "top"));
      });
      return { extra, joints };
    },
  });
}

// Groove for buttons on the inside face of an apron, between a0 and a1.
export function buttonGroove(g, A, a0, a1) {
  const t2 = g.apron_t / 2, gt = g.apron_top - 12;
  return ubox(A, a0, a1, t2 - 10, t2 + 1, gt - 6, gt);
}
// One button at distance ac along the apron (negative = away from the leg),
// with `gap` left for the top to move. Returns the button, its screw, the
// pilot hole to cut in the top, and the joints.
export function makeButton(g, A, tag, ac, gap) {
  const t2 = g.apron_t / 2, gt = g.apron_top - 12, b0 = t2 + gap, zb = g.apron_top - 1 - 19, su = b0 + 20;
  const s0 = upt(A, ac, su, zb), s1 = upt(A, ac, su, g.apron_top + 12);
  const id = `button-${tag}`, sid = `screw-${tag}`;
  const button = body(id, "Button", "wood", [
    add(ubox(A, ac - 19, ac + 19, b0, b0 + 32, zb, g.apron_top - 1)),
    add(ubox(A, ac - 19, ac + 19, t2 - 10 + gap, b0 + 1, gt - 5, gt)),
    cut(cyl(upt(A, ac, su, zb - 1), upt(A, ac, su, g.apron_top), SCREW.clear)),
  ]);
  const screw = body(sid, "Wood screw #8 × 1¼", "hardware",
    [add(cyl(s0, s1, SCREW.r)), add(cyl(upt(A, ac, su, zb - SCREW.head_t), s0, SCREW.head_r))]);
  const pilot = cyl(upt(A, ac, su, g.apron_top - 0.5), upt(A, ac, su, g.apron_top + 12.5), SCREW.pilot);
  return { button, screw, pilot, joints: (apronId, topId) => [{ type: "button-in-groove", parts: [id, apronId] },
    { type: "screw", parts: [id, topId], via: [sid], contact: "none" }] };
}

// ---- C2: metal Z-clips in a kerf ------------------------------------------------
function zClips() {
  return topFixing({
    id: "C2-z-clips", section: "C2", title: "Metal Z-clips in a saw kerf",
    summary: "Steel clips hook into a 3 mm kerf on the inside of each apron and screw to the top. Clip sizes are placeholders until measured.",
    params: [P("kerf_w", 3.2, "Kerf width (suit your clips and cutter)"), P("kerf_d", 8, "Kerf depth"), P("kerf_down", 12, "Kerf top below the apron top"),
      P("clip_t", 1.6, "Clip steel thickness"), P("clip_w", 19, "Clip width")],
    notes: ["Measure the clips you buy and update kerf and clip sizes."],
    fix: ({ g, A, which, apron, top, gap }) => {
      const t2 = g.apron_t / 2, kt = g.apron_top - 12, s = 1.6, T = g.apron_top, extra = [], joints = [];
      apron.steps.push(cut(ubox(A, -STUB[which] - 1, -25, t2 - 8, t2 + 1, kt - 3.2, kt)));
      SPOTS[which].forEach((ac, i) => {
        const id = `z-clip-${which}-${i + 1}`, b0 = t2 + gap, su = b0 + 10, w = 9.5;
        const clip = body(id, "Z-clip", "hardware", [
          add(ubox(A, ac - w, ac + w, t2 - 8 + gap, b0 + s, kt - s, kt)),
          add(ubox(A, ac - w, ac + w, b0, b0 + s, kt - s, T - s)),
          add(ubox(A, ac - w, ac + w, b0, b0 + 16, T - s, T)),
          cut(cyl(upt(A, ac, su, T - s - 1), upt(A, ac, su, T + 1), SCREW.clear)),
        ]);
        top.steps.push(cut(cyl(upt(A, ac, su, T - 0.5), upt(A, ac, su, T + 14.5), SCREW.pilot)));
        const screw = body(`screw-${which}-${i + 1}`, "Pan-head screw #8 × ⅝", "hardware",
          [add(cyl(upt(A, ac, su, T - s), upt(A, ac, su, T + 14), SCREW.r)), add(cyl(upt(A, ac, su, T - s - 2.5), upt(A, ac, su, T - s), SCREW.head_r))]);
        extra.push(clip, screw);
        joints.push({ type: "clip-in-kerf", parts: [id, apron.id] }, { type: "clip-on-top", parts: [id, "top"], via: [screw.id] });
      });
      return { extra, joints };
    },
  });
}

// ---- C3: figure-8 fasteners --------------------------------------------------
function figure8() {
  return topFixing({
    id: "C3-figure-8", section: "C3", title: "Figure-8 fasteners",
    summary: "Flat steel figure-8s sit in a 22 mm recess in the top edge of the apron, flush, and swivel as the top moves.",
    params: [P("recess_d", 22, "Recess diameter (7/8 in Forstner bit)"), P("recess_depth", 3, "Recess depth = fastener thickness"),
      P("lobe_a", 19, "Apron lobe diameter"), P("lobe_b", 16, "Top lobe diameter"), P("lobe_gap", 16, "Lobe centre to centre")],
    notes: ["Placeholder sizes until a fastener is measured. The recess breaks out of the apron's inside face, which is normal."],
    fix: ({ g, A, which, apron, top }) => {
      const T = g.apron_top, th = 3, extra = [], joints = [];
      SPOTS[which].forEach((ac, i) => {
        const id = `figure-8-${which}-${i + 1}`, pa = upt(A, ac, 0, 0), pb = upt(A, ac, 16, 0);
        apron.steps.push(cut(prism(circle(pa[0], pa[1], 11), T - th, T + 1)));
        apron.steps.push(cut(cyl([pa[0], pa[1], T - th + 0.1], [pa[0], pa[1], T - th - 14], SCREW.pilot)));
        top.steps.push(cut(cyl([pb[0], pb[1], T - 0.5], [pb[0], pb[1], T + 13.5], SCREW.pilot)));
        const plate = body(id, "Figure-8 fastener", "hardware", [
          add(prism(circle(pa[0], pa[1], 9.5), T - th, T)), add(prism(circle(pb[0], pb[1], 8), T - th, T)),
          cut(cyl([pa[0], pa[1], T + 0.01], [pa[0], pa[1], T - 2.2], 4.2, 2.0)), cut(cyl([pa[0], pa[1], T - 2.1], [pa[0], pa[1], T - th - 1], SCREW.clear)),
          cut(cyl([pb[0], pb[1], T - th - 0.01], [pb[0], pb[1], T - 0.8], 4.2, 2.0)), cut(cyl([pb[0], pb[1], T - 0.9], [pb[0], pb[1], T + 1], SCREW.clear)),
        ]);
        const sa = body(`screw-${which}-${i + 1}a`, "Countersunk screw #8 × ⅝ (into apron)", "hardware",
          [add(cyl([pa[0], pa[1], T - 0.1], [pa[0], pa[1], T - 2.1], 4.0, 1.9)), add(cyl([pa[0], pa[1], T - 2.0], [pa[0], pa[1], T - th - 13], SCREW.r))]);
        const sb = body(`screw-${which}-${i + 1}b`, "Countersunk screw #8 × ⅝ (into top)", "hardware",
          [add(cyl([pb[0], pb[1], T - th + 0.1], [pb[0], pb[1], T - 0.9], 4.0, 1.9)), add(cyl([pb[0], pb[1], T - 1.0], [pb[0], pb[1], T + 13], SCREW.r))]);
        extra.push(plate, sa, sb);
        joints.push({ type: "fastener-in-recess", parts: [id, apron.id], via: [sa.id] }, { type: "fastener-on-top", parts: [id, "top"], via: [sb.id] });
      });
      return { extra, joints };
    },
  });
}

// ---- C4: corner block with a slotted screw hole ----------------------------------
function cornerBlock() {
  const g = geom(COFFEE), c = FR, T = g.apron_top, mv = movement(g.table_w);
  const m = topFixing({
    id: "C4-corner-block", section: "C4", title: "Corner block with a slotted screw hole",
    summary: "A glue block notched around the leg, glued to both aprons. One screw goes up into the top through a slot that lets the top move across its width.",
    params: [P("block_leg", 89, "Block length along each apron"), P("block_h", 50, "Block height"), P("slot", mv + 2 * SCREW.clear, "Slot length = movement + screw diameter")],
    notes: ["A plywood top doesn't move, so it can use a plain round hole."],
    fix: () => ({ extra: [], joints: [] }),
  });
  const C = [c.sx * g.long_half, c.sy * g.short_half], yi = c.sy * (g.rail_y - g.apron_t / 2), xi = c.sx * (g.rail_x - g.apron_t / 2);
  const pts = [[C[0] - c.sx * 89, yi], [C[0], yi], [C[0], C[1]], [xi, C[1]], [xi, C[1] - c.sy * 89]];
  const S = [C[0] - c.sx * 25, C[1] - c.sy * 20]; // clear of the leg notch and the diagonal face
  const slotLen = mv + 2 * SCREW.clear;
  const blockB = body("corner-block", "Corner block", "wood", [add(prism(poly(pts), T - 51, T - 1)),
    cut(prism(circle(S[0], S[1], slotLen / 2 + 3), T - 52, T - 16)), cut(prism(stadium(S[0], S[1], slotLen, 2 * SCREW.clear, true), T - 16.5, T))]);
  const top = m.bodies.find(b => b.id === "top");
  top.steps.push(cut(cyl([S[0], S[1], T - 0.5], [S[0], S[1], T + 13.5], SCREW.pilot)));
  const screw = body("screw-block", "Wood screw #8 × 1¼", "hardware",
    [add(cyl([S[0], S[1], T - 16], [S[0], S[1], T + 13], SCREW.r)), add(cyl([S[0], S[1], T - 19], [S[0], S[1], T - 16], SCREW.head_r))]);
  m.bodies.push(blockB, screw);
  m.joints.push({ type: "glue-block", parts: ["corner-block", "apron-front"], contact: "touch" },
    { type: "glue-block", parts: ["corner-block", "apron-right"], contact: "touch" },
    { type: "screw-in-slot", parts: ["corner-block", "top"], via: ["screw-block"], contact: "none" });
  return m;
}

// ---- D1: solid boards, edge glued ----------------------------------------------
function topShape(g, kind) {
  const L = g.table_l, W = g.table_w, z0 = g.apron_top, z1 = g.table_h;
  if (kind === "bevel") {
    const u = (z1 - z0) * Math.tan(18.5 * Math.PI / 180);
    return { shape: loft(z0, rect(0, 0, L - 2 * u, W - 2 * u), z1, rect(0, 0, L, W)), under: u };
  }
  return { shape: prism(roundedRect(0, 0, L, W, 4 * 25.4), z0, z1), under: 0 };
}

function glueUp(kind) {
  const g = geom(COFFEE), n = 5, W = g.table_w, bw = W / n, { shape } = topShape(g, kind);
  const boards = [];
  for (let i = 0; i < n; i++) {
    const y0 = -W / 2 + i * bw, y1 = y0 + bw;
    boards.push(body(`top-board-${i + 1}`, `Top board ${i + 1}`, "wood",
      [add(shape), common(box([-g.table_l, y0, g.apron_top - 1], [g.table_l, y1, g.table_h + 1]))]));
  }
  const over = 25.4;
  const panel = body("rough-panel", "Glued-up panel before shaping", "reference",
    [add(box([-(g.table_l + over) / 2, -(W + over) / 2, g.apron_top], [(g.table_l + over) / 2, (W + over) / 2, g.table_h]))]);
  return {
    id: `D1-glue-up-${kind}`, section: "D1", title: kind === "bevel" ? "Solid top, glued up (bevelled edge)" : "Solid top, glued up (rounded corners)",
    size: "coffee table", summary: `Five ${(bw / 25.4).toFixed(1)} in boards glued edge to edge, grain along the length, cut to shape from a panel 1 in oversize each way.`,
    params: [P("boards", n, "Number of boards", ""), P("board_w", bw, "Finished board width"), P("oversize", over, "Extra length and width before shaping")],
    notes: kind === "bevel" ? ["Bevel: 18.5° undercut, cut on the table saw after glue-up."] : ["The 1/8 in round-over is routed after shaping and is not modelled here."],
    bodies: [...boards, panel],
    joints: boards.slice(1).map((b, i) => ({ type: "edge-glue", parts: [boards[i].id, b.id], contact: "touch" })),
  };
}

// ---- D2: veneered core with a solid edge --------------------------------------------
function veneered() {
  const g = geom(COFFEE), L = g.table_l, W = g.table_w, z0 = g.apron_top, z1 = g.table_h, lip = 12.7, vt = 0.6;
  const { shape } = topShape(g, "bevel");
  const core = rect(0, 0, L - 2 * lip, W - 2 * lip), sz0 = z0 + 14, sz1 = z0 + 20, half = 6, stop = 25;
  const splines = [
    ["front", box([-L / 2 + lip + stop, -W / 2 + lip - half, sz0], [L / 2 - lip - stop, -W / 2 + lip + half, sz1])],
    ["back", box([-L / 2 + lip + stop, W / 2 - lip - half, sz0], [L / 2 - lip - stop, W / 2 - lip + half, sz1])],
    ["right", box([L / 2 - lip - half, -W / 2 + lip + stop, sz0], [L / 2 - lip + half, W / 2 - lip - stop, sz1])],
    ["left", box([-L / 2 + lip - half, -W / 2 + lip + stop, sz0], [-L / 2 + lip + half, W / 2 - lip - stop, sz1])],
  ];
  const grow = (s, d) => box(vadd(s.min, [-d, -d, -d]), vadd(s.max, [d, d, d]));
  const m = 40, a = L / 2, b = W / 2;
  const regions = {
    front: poly([[-a, -b], [a, -b], [a - m, -b + m], [-a + m, -b + m]]), back: poly([[-a, b], [-a + m, b - m], [a - m, b - m], [a, b]]),
    right: poly([[a, -b], [a, b], [a - m, b - m], [a - m, -b + m]]), left: poly([[-a, -b], [-a + m, -b + m], [-a + m, b - m], [-a, b]]),
  };
  const bodies = [body("core", "Core (plywood or MDF)", "wood", [add(prism(core, z0 + vt, z1 - vt)), ...splines.map(([, s]) => cut(grow(s, 0.05)))], { material: "plywood" }),
    body("veneer-top", "Face veneer", "wood", [add(prism(core, z1 - vt, z1))]),
    body("veneer-bottom", "Back veneer", "wood", [add(prism(core, z0, z0 + vt))])];
  for (const [side] of splines) {
    bodies.push(body(`lipping-${side}`, `Solid lipping (${side})`, "wood", [add(shape), cut(prism(core, z0 - 1, z1 + 1)),
      common(prism(regions[side], z0 - 1, z1 + 1)), ...splines.map(([, s]) => cut(grow(s, 0.05)))]));
  }
  splines.forEach(([side, s]) => bodies.push(body(`spline-${side}`, "Spline (6 mm plywood)", "tenon", [add(s)], { material: "plywood" })));
  const joints = [
    ...splines.map(([side]) => ({ type: "spline", parts: ["core", `lipping-${side}`], via: [`spline-${side}`] })),
    { type: "veneer", parts: ["veneer-top", "core"], contact: "touch" }, { type: "veneer", parts: ["veneer-bottom", "core"], contact: "touch" },
    ...[["front", "right"], ["right", "back"], ["back", "left"], ["left", "front"]].map(([p, q]) => ({ type: "mitre", parts: [`lipping-${p}`, `lipping-${q}`], contact: "touch" })),
  ];
  return {
    id: "D2-veneered", section: "D2", title: "Veneered core with a solid edge", size: "coffee table",
    summary: "A plywood or MDF core veneered both sides, edged with ½ in solid lipping mitred at the corners and joined with plywood splines. The bevel is cut in the solid lipping.",
    params: [P("lipping_w", lip, "Lipping width (bevel undercut 8.5 mm + at least 3 mm)"), P("veneer_t", vt, "Veneer thickness"),
      P("core_t", z1 - z0 - 2 * vt, "Core thickness"), P("spline", 6, "Spline thickness"), P("spline_w", 12, "Spline width")],
    notes: ["Curved tops need a wide strip of lipping band-sawn to the curve, or a bent lamination; not modelled yet."],
    bodies, joints,
  };
}

export { gaps, topShape };
export function topModels() {
  return [buttons(), zClips(), figure8(), cornerBlock(), glueUp("bevel"), glueUp("rounded"), veneered()];
}
