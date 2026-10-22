// Section A of the checklist: leg-to-apron joint options. Each model is one
// leg corner (front right) with a short length of both aprons.
import { box, prism, cyl, path, rect, stadium, halfSpace, body, add, cut, frame, vnorm, vcross, poly } from "./shapes.js";
import {
  COFFEE, SIDE, FIT, GLUE_ROOM, MITRE_GAP, HOLE_CLEAR, SCREW, geom, FR, apronId, legId, legBody,
  apronFrame, endFaceFrame, dirWorld, at, cylA, apronStub, P, vadd, vscale,
} from "./base.js";

const STUB = { long: 160, short: 140 };

// Half-space that trims a tenon end to a 45° mitre where it meets the
// other apron's tenon inside the leg (with a small gap between them).
export function mitreCut(g, c, which, gap = MITRE_GAP) {
  const s = gap / Math.SQRT2, cx = c.sx * g.rail_x, cy = c.sy * g.rail_y;
  return which === "long"
    ? halfSpace([cx - c.sx * s / 2, cy + c.sy * s / 2, 0], [c.sx, -c.sy, 0])
    : halfSpace([cx + c.sx * s / 2, cy - c.sy * s / 2, 0], [-c.sx, c.sy, 0]);
}

// Build a corner model from a joint function. joint(g, c, which, A) returns
// { apron: steps, leg: cut shapes, extra: bodies, joints }.
export function corner({ id, section, title, summary, sizeName, g, joint, params = [], notes = [], stub = STUB }) {
  const c = FR, leg = legBody(g, c), bodies = [], extra = [], joints = [];
  for (const which of ["long", "short"]) {
    const A = apronFrame(g, c, which), j = joint(g, c, which, A);
    bodies.push(body(apronId(c, which), which === "long" ? "Long apron" : "Short apron", "wood",
      [add(apronStub(g, A, stub[which])), ...j.apron]));
    leg.steps.push(...j.leg.map(cut));
    extra.push(...(j.extra || []));
    joints.push(...(j.joints || []));
  }
  return { id, section, title, summary, size: sizeName, params: [...baseParams(g), ...params], notes,
    bodies: [leg, ...bodies, ...extra], joints };
}

export function baseParams(g) {
  return [P("leg_sq", g.leg_sq, "Leg size at the head"), P("apron_h", g.apron_h, "Apron height"),
    P("apron_t", g.apron_t, "Apron thickness"), P("apron_set", g.apron_set, "Apron set back from the leg's outside face")];
}

// ---- A1: haunched mortise and tenon -------------------------------------
export function mtHaunched(o = {}) {
  return (g, c, which, A) => {
    const tt = o.tenon_t ?? 9.525, haunch = o.haunch ?? 9.525, sb = o.shoulder_b ?? 9.525;
    const L = o.tenon_l ?? g.meet, fit = o.fit ?? FIT.standard, top = g.apron_top;
    const zt = top - haunch, zb = top - g.apron_h + sb;
    const tenon = box([0, -tt / 2, zb], [L, tt / 2, zt], A.F);
    const haunchBox = box([0, -tt / 2, zt], [haunch, tt / 2, top], A.F);
    const apron = [add(tenon), add(haunchBox)];
    if (L > g.meet - tt / 2) apron.push(cut(mitreCut(g, c, which)));
    const w = tt / 2 + fit;
    const leg = [
      box([-0.5, -w, zb - fit], [L + GLUE_ROOM, w, zt + fit], A.F),
      box([-0.5, -w, zt - 1], [haunch + GLUE_ROOM, w, top + 1], A.F), // haunch groove, open at the leg top (hidden by the top)
    ];
    return { apron, leg, joints: [{ type: "mortise-and-tenon", parts: [apronId(c, which), legId(c)] }] };
  };
}
const a1Params = (g, o = {}) => [
  P("tenon_t", o.tenon_t ?? 9.525, "Tenon thickness (about 1/3 to 1/2 of the apron)"),
  P("tenon_w", g.apron_h - 9.525 - 9.525, "Tenon height (apron height less haunch and bottom shoulder)"),
  P("haunch", 9.525, "Haunch height and length"),
  P("shoulder_b", 9.525, "Bottom shoulder"),
  P("tenon_l", g.meet, "Tenon length: to the other apron's centre line, mitred 45° at the end"),
  P("miter_gap", MITRE_GAP, "Gap between the two mitred tenon ends"),
  P("fit", FIT.standard, "Clearance per side, tenon to mortise"),
  P("glue_room", GLUE_ROOM, "Mortise deeper than the tenon"),
];

// ---- A1 router version: round-ended mortise, no haunch ------------------
export function mtRounded(o = {}) {
  return (g, c, which, A) => {
    const tt = o.tenon_t ?? 9.525, sh = 9.525, L = g.meet, fit = o.fit ?? FIT.standard, top = g.apron_top;
    const zt = top - sh, zb = top - g.apron_h + sh, zc = (zt + zb) / 2, F = endFaceFrame(A);
    const apron = [add(prism(stadium(0, zc, zt - zb, tt, true), 0, L, F))];
    if (L > g.meet - tt / 2) apron.push(cut(mitreCut(g, c, which)));
    const leg = [prism(stadium(0, zc, zt - zb + 2 * fit, tt + 2 * fit, true), -0.5, L + GLUE_ROOM, F)];
    return { apron, leg, joints: [{ type: "mortise-and-tenon", parts: [apronId(c, which), legId(c)] }] };
  };
}

// ---- A2: loose tenons (Domino) -------------------------------------------
export const DOMINO = { "8x40": { t: 8, w: 22, l: 40 }, "10x50": { t: 10, w: 24, l: 50 }, "5x30": { t: 5, w: 19, l: 30 } };
export function looseTenon(o) {
  return (g, c, which, A) => {
    const D = DOMINO[o.size], F = endFaceFrame(A);
    // e = how far the Domino goes into the leg; the rest goes into the apron.
    const e = o.leg_depth ?? D.l / 2, depth = e + 1, aDepth = D.l - e + 1;
    const zs = (o.heights[which]).map(dz => g.apron_mid + dz);
    const apron = [], leg = [], extra = [];
    zs.forEach((z, i) => {
      const slot = (len, wid) => stadium(0, z, len, wid, true);
      apron.push(cut(prism(slot(D.w + 2 * HOLE_CLEAR, D.t + 2 * HOLE_CLEAR), -aDepth, 0.5, F)));
      leg.push(prism(slot(D.w + 2 * HOLE_CLEAR, D.t + 2 * HOLE_CLEAR), -0.5, depth, F));
      extra.push(body(`domino-${which}-${i + 1}`, `Domino ${o.size}`, "tenon", [add(prism(slot(D.w, D.t), e - D.l, e, F))]));
    });
    return { apron, leg, extra, joints: [{ type: "loose-tenon", parts: [apronId(c, which), legId(c)], via: extra.map(b => b.id) }] };
  };
}

// ---- A3: dowels -------------------------------------------------------------
export function dowels(o) {
  return (g, c, which, A) => {
    const r = o.d / 2, e = o.leg_depth ?? o.l / 2, apron = [], leg = [], extra = [];
    o.heights[which].forEach((dz, i) => {
      const z = g.apron_mid + dz;
      apron.push(cut(cylA(A, e - o.l - 1, 0.5, 0, z, r + HOLE_CLEAR)));
      leg.push(cylA(A, -0.5, e + 1, 0, z, r + HOLE_CLEAR));
      extra.push(body(`dowel-${which}-${i + 1}`, `Dowel ${o.d} × ${o.l}`, "tenon", [add(cylA(A, e - o.l, e, 0, z, r))]));
    });
    return { apron, leg, extra, joints: [{ type: "dowel", parts: [apronId(c, which), legId(c)], via: extra.map(b => b.id) }] };
  };
}

// ---- A4: corner bracket and hanger bolt (knock-down) ------------------------
export function bracketBolt(o = {}) {
  const k = o.kerf_from_end ?? 24, kw = 3.2, kd = 9.5, pt = 2.5, bh = o.bracket_h ?? 50;
  const dz = o.dowel_dz ?? [-20, 20], boltIn = o.bolt_in ?? 40;
  let done = false;
  return (g, c, which, A) => {
    // Kerf across the apron's inside face, and two alignment dowels.
    const apron = [cut(box([-k - kw / 2, A.ins > 0 ? g.apron_t / 2 - kd : -g.apron_t / 2 - 1,
      g.apron_top - g.apron_h - 1], [-k + kw / 2, A.ins > 0 ? g.apron_t / 2 + 1 : -g.apron_t / 2 + kd, g.apron_top + 1], A.F))];
    const leg = [], extra = [];
    dz.forEach((d, i) => {
      const z = g.apron_mid + d;
      apron.push(cut(cylA(A, -16, 0.5, 0, z, 4 + HOLE_CLEAR)));
      leg.push(cylA(A, -0.5, 16, 0, z, 4 + HOLE_CLEAR));
      extra.push(body(`dowel-${which}-${i + 1}`, "Alignment dowel 8 × 30", "tenon", [add(cylA(A, -15, 15, 0, z, 4))]));
    });
    const joints = [{ type: "dowel", parts: [apronId(c, which), legId(c)], via: extra.map(b => b.id) },
      { type: "bracket-in-kerf", parts: ["corner-bracket", apronId(c, which)] }];
    if (!done) {
      done = true;
      const C = [c.sx * g.long_half, c.sy * g.short_half], d = g.inside_step, z0 = g.apron_mid - bh / 2, z1 = z0 + bh;
      const nIn = vnorm([-c.sx, -c.sy, 0]), p2 = (x, y, z = 0) => [x, y, z];
      const kc = k - kw / 2 + pt / 2; // flange bears on the kerf wall nearest the leg
      const Apt = p2(C[0] - c.sx * kc, C[1] + c.sy * d), Bpt = p2(C[0] + c.sx * d, C[1] - c.sy * kc);
      const off = p => vadd(p, vscale(nIn, pt));
      const web = prism(poly([Apt, Bpt, off(Bpt), off(Apt)].map(p => [p[0], p[1]])), z0, z1);
      const yi = Apt[1], xi = Bpt[0];
      const lf = box([Apt[0] - pt / 2, Math.min(yi + c.sy * 8, yi - c.sy * 4), z0], [Apt[0] + pt / 2, Math.max(yi + c.sy * 8, yi - c.sy * 4), z1]);
      const sf = box([Math.min(xi + c.sx * 8, xi - c.sx * 4), Bpt[1] - pt / 2, z0], [Math.max(xi + c.sx * 8, xi - c.sx * 4), Bpt[1] + pt / 2, z1]);
      const M = [(Apt[0] + Bpt[0]) / 2, (Apt[1] + Bpt[1]) / 2, g.apron_mid];
      const Cz = [C[0], C[1], g.apron_mid], cham = 6, face = vadd(Cz, vscale(nIn, -cham));
      extra.push(body("corner-bracket", "Corner bracket (steel)", "hardware",
        [add(web), add(lf), add(sf), cut(cyl(vadd(M, vscale(nIn, -1)), vadd(M, vscale(nIn, pt + 1)), 4.5))]));
      extra.push(body("hanger-bolt", "Hanger bolt M8 × 75", "hardware",
        [add(cyl(vadd(face, vscale(nIn, -boltIn)), vadd(M, vscale(nIn, pt + 6.5 + 4)), 4))]));
      extra.push(body("nut", "M8 nut", "hardware",
        [add(cyl(vadd(M, vscale(nIn, pt)), vadd(M, vscale(nIn, pt + 6.5)), 6.5)), cut(cyl(vadd(M, vscale(nIn, pt - 1)), vadd(M, vscale(nIn, pt + 7.5)), 4 + HOLE_CLEAR))]));
      // Flat on the leg's inside corner (head only) and the bolt's hole.
      leg.push(box([g.head_z0, -100, 0], [g.apron_top + 1, 100, 100], frame([face[0], face[1], 0], [0, 0, 1], nIn)));
      leg.push(cyl(vadd(face, vscale(nIn, 1)), vadd(face, vscale(nIn, -boltIn - 1)), 4 + HOLE_CLEAR));
      joints.push({ type: "hanger-bolt", parts: ["hanger-bolt", legId(c)] }, { type: "nut", parts: ["nut", "hanger-bolt"] },
        { type: "nut-on-bracket", parts: ["nut", "corner-bracket"] });
    }
    return { apron, leg, extra, joints };
  };
}

// ---- A5: pocket screws --------------------------------------------------------
export function pocketScrews(o = {}) {
  const ang = 15 * Math.PI / 180, len = 32, intoLeg = 16, bore = 4.75;
  return (g, c, which, A) => {
    const d = [Math.cos(ang), -A.ins * Math.sin(ang), 0], apron = [], leg = [], extra = [];
    const pt = s => [d[0] * s, d[1] * s]; // point along the axis from the exit point, local a/b
    (o.heights?.[which] ?? [-18, 18]).forEach((dz, i) => {
      const z = g.apron_mid + dz, P0 = s => at(A.F, [...pt(s), z]);
      apron.push(cut(cyl(P0(-(len - intoLeg)), P0(-60), bore)));             // stepped pocket
      apron.push(cut(cyl(P0(1), P0(-(len - intoLeg) - 1), SCREW.clear)));
      leg.push(cyl(P0(-0.5), P0(intoLeg + 1), SCREW.pilot));
      extra.push(body(`pocket-screw-${which}-${i + 1}`, "Pocket screw #8 × 1¼", "hardware", [
        add(cyl(P0(-(len - intoLeg)), P0(intoLeg), SCREW.r)),
        add(cyl(P0(-(len - intoLeg) - 3), P0(-(len - intoLeg)), 4.4)),
      ]));
    });
    return { apron, leg, extra, joints: [{ type: "pocket-screw", parts: [apronId(c, which), legId(c)], via: extra.map(b => b.id) }] };
  };
}

// ---- A6: wedged through tenon ---------------------------------------------
export function throughWedged(o = {}) {
  const tt = o.tenon_t ?? 9.525, th = o.tenon_w ?? 25.4, proud = 1.5, kerf = 2.2, flare = 1.5;
  return (g, c, which, A) => {
    const top = g.apron_top, sh = 9.525, kdepth = Math.min(25, g.leg_sq - 8);
    const zt = which === "long" ? top - sh : top - sh - th - 6.35, zb = zt - th;
    const through = g.leg_sq, L = through + proud, fit = FIT.standard;
    const apron = [add(box([0, -tt / 2, zb], [L, tt / 2, zt], A.F))];
    // Two saw kerfs across the tenon end for the wedges (horizontal slots).
    const kz = [zb + th / 4, zb + 3 * th / 4];
    for (const z of kz) apron.push(cut(box([L - kdepth, -tt / 2 - 1, z - kerf / 2], [L + 1, tt / 2 + 1, z + kerf / 2], A.F)));
    // Mortise: straight, then flared top and bottom over the outer 25 mm.
    const w = tt / 2 + fit;
    const leg = [box([-0.5, -w, zb - fit], [through + 0.5, w, zt + fit], A.F)];
    const side = frame(A.F.o, A.F.x, vcross(A.F.x, [0, 0, 1])); // local XY = (along apron, up)
    leg.push(prism(poly([[through - kdepth, zb - fit], [through + 0.5, zb - fit - flare], [through + 0.5, zt + fit + flare], [through - kdepth, zt + fit]]), -w, w, side));
    const extra = kz.map((z, i) => body(`wedge-${which}-${i + 1}`, "Wedge", "tenon",
      [add(prism(poly([[L - kdepth + 1, z], [L, z - kerf / 2 + 0.05], [L, z + kerf / 2 - 0.05]]), -tt / 2, tt / 2, side))], { material: "maple" }));
    return { apron, leg, extra, joints: [{ type: "through-tenon", parts: [apronId(c, which), legId(c)] }, ...extra.map(b => ({ type: "wedge", parts: [b.id, apronId(c, which)] }))] };
  };
}

// ---- the models ------------------------------------------------------------
export function legApronModels() {
  const gc = geom(COFFEE), gs = geom(SIDE);
  const sideStub = { long: 120, short: 120 };
  return [
    corner({ id: "A1-mt-haunched", section: "A1", title: "Haunched mortise and tenon", sizeName: "coffee table",
      summary: "Long tenon with a haunch at the top, mitred where the two tenons meet in the leg. Square-ended mortise (chisel or mortiser).",
      g: gc, joint: mtHaunched(), params: a1Params(gc) }),
    corner({ id: "A1-mt-haunched-side", section: "A1", title: "Haunched mortise and tenon (side table)", sizeName: "side table",
      summary: "Same joint on the side table's 1½ in round legs and 2½ in aprons.",
      g: gs, joint: mtHaunched(), params: a1Params(gs), stub: sideStub }),
    corner({ id: "A1-mt-router", section: "A1", title: "Mortise and tenon, router cut", sizeName: "coffee table",
      summary: "Round-ended mortise as a router or CNC leaves it; the tenon edges are rounded to match. No haunch.",
      g: gc, joint: mtRounded(), params: [P("tenon_t", 9.525, "Tenon thickness = router bit diameter"),
        P("tenon_w", gc.apron_h - 2 * 9.525, "Tenon height"), P("tenon_l", gc.meet, "Tenon length, mitred"), P("fit", FIT.standard, "Clearance per side")] }),
    corner({ id: "A2-loose-tenon", section: "A2", title: "Loose tenons (Domino 8 × 40)", sizeName: "coffee table",
      summary: "Two 8 mm Dominoes per apron end, stacked. The slots from the two aprons miss each other inside the leg.",
      g: gc, joint: looseTenon({ size: "8x40", heights: { long: [-17, 17], short: [-17, 17] } }),
      params: [P("tenon", 8, "Domino 8 × 22 × 40"), P("count", 2, "per apron end", ""), P("spacing", 34, "Centre to centre"), P("depth", 21, "Slot depth each side")] }),
    corner({ id: "A2-loose-tenon-side", section: "A2", title: "Loose tenons (side table, staggered)", sizeName: "side table",
      summary: "One Domino per apron end. The thinner leg means the two slots would meet, so they are staggered in height.",
      g: gs, joint: looseTenon({ size: "8x40", heights: { long: [12], short: [-12] } }), stub: sideStub,
      params: [P("tenon", 8, "Domino 8 × 22 × 40"), P("count", 1, "per apron end", ""), P("stagger", 24, "Height difference between the two aprons' tenons")] }),
    corner({ id: "A3-dowels", section: "A3", title: "Dowels", sizeName: "coffee table",
      summary: "Two 10 mm dowels per apron end, drilled with a doweling jig.",
      g: gc, joint: dowels({ d: 10, l: 40, heights: { long: [-19, 19], short: [-19, 19] } }),
      params: [P("dowel_d", 10, "Dowel diameter"), P("dowel_l", 40, "Dowel length"), P("spacing", 38, "Centre to centre")] }),
    corner({ id: "A3-dowels-side", section: "A3", title: "Dowels (side table, staggered)", sizeName: "side table",
      summary: "Dowels from the two aprons sit at different heights so they miss each other in the thinner leg.",
      g: gs, joint: dowels({ d: 10, l: 40, heights: { long: [18, -6], short: [6, -18] } }), stub: sideStub,
      params: [P("dowel_d", 10, "Dowel diameter"), P("dowel_l", 40, "Dowel length"), P("stagger", 12, "Offset between the two aprons' dowels")] }),
    corner({ id: "A4-bracket-bolt", section: "A4", title: "Corner bracket and hanger bolt", sizeName: "coffee table",
      summary: "Steel bracket in saw kerfs in both aprons, pulled tight by an M8 hanger bolt in the leg's inside corner. Two dowels per apron keep it aligned. Bracket sizes are placeholders until measured.",
      g: gc, joint: bracketBolt(), notes: ["Measure the bracket you buy and update kerf_from_end, the kerf size and the bolt length."],
      params: [P("kerf_from_end", 24, "Kerf distance from the apron end"), P("kerf_w", 3.2, "Kerf width"), P("kerf_d", 9.5, "Kerf depth"),
        P("bolt", 8, "Hanger bolt diameter (M8 or 5/16 in)"), P("chamfer", 6, "Flat on the leg's inside corner")] }),
    corner({ id: "A5-pocket-screws", section: "A5", title: "Pocket screws", sizeName: "coffee table",
      summary: "Two pocket screws per apron end, drilled at 15° from the inside face.",
      g: gc, joint: pocketScrews(), params: [P("angle", 15, "Pocket angle", "deg"), P("screw_l", 32, "Screw length (#8 × 1¼ in)"), P("count", 2, "per apron end", "")] }),
    corner({ id: "A6-through-wedged", section: "A6", title: "Wedged through tenon", sizeName: "coffee table",
      summary: "Tenons pass through the leg at different heights and show on the outside, each split by two wedges. Shown before wedging.",
      g: gc, joint: throughWedged(), notes: ["The mortise flares 1.5 mm top and bottom on the outside so the wedged tenon locks in."],
      params: [P("tenon_t", 9.525, "Tenon thickness"), P("tenon_w", 25.4, "Tenon height"), P("proud", 1.5, "Tenon end stands out of the leg"),
        P("wedge_kerf", 2.2, "Saw kerf for each wedge"), P("flare", 1.5, "Mortise flare at the outside face")] }),
  ];
}
