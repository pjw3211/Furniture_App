// Sections E and F of the checklist: the lower shelf and the feet.
import { box, prism, loft, cyl, rect, circle, stadium, poly, body, add, cut, solidOf } from "./shapes.js";
import { COFFEE, FIT, GLUE_ROOM, SCREW, geom, FR, CORNERS, legId, legBody, legShapes, legSectionAt, apronFrame, P, movement } from "./base.js";
import { mitreCut } from "./legApron.js";

const SHELF_TOP = 6 * 25.4, SHELF_T = 19.05;

// ---- E1: shelf on cleats (front-right corner) -------------------------------------
function cleats() {
  const g = geom(COFFEE), c = FR, leg = legBody(g, c), legSolid = solidOf(leg);
  const zt = SHELF_TOP, zb = zt - SHELF_T, cz0 = zb - 19, cz1 = zb;
  const outX = c.sx * (g.leg_cx + g.leg_sq / 2 - g.apron_set), outY = c.sy * (g.leg_cy + g.leg_sq / 2 - g.apron_set);
  const sTop = legSectionAt(g, zt), sBot = legSectionAt(g, cz0);
  const faceX = s => c.sx * (g.leg_cx + g.leg_sq / 2 - s), faceY = s => c.sy * (g.leg_cy + g.leg_sq / 2 - s);
  const shelfW = 2 * Math.abs(outY), gapY = movement(shelfW) / 2 + 1, gapX = 1.5;
  const span = (a, b) => [Math.min(a, b), Math.max(a, b)];
  const [sx0, sx1] = span(c.sx * 110, outX), [sy0, sy1] = span(0, outY);
  const [nx0, nx1] = span(faceX(sTop) - c.sx * gapX, c.sx * 1000), [ny0, ny1] = span(faceY(sTop) - c.sy * gapY, c.sy * 1000);
  const shelf = body("shelf", "Lower shelf (corner)", "wood", [add(box([sx0, sy0, zb], [sx1, sy1, zt])),
    cut(box([nx0, ny0, zb - 1], [nx1, ny1, zt + 1]))]);
  const bodies = [leg, shelf], joints = [];
  // Cleat on the leg's inner x face (toward the table centre in x), and one on the inner y face.
  const cl = [
    { id: "cleat-x", n: [-c.sx, 0], face: faceX(sBot) },
    { id: "cleat-y", n: [0, -c.sy], face: faceY(sBot) },
  ];
  for (const k of cl) {
    const alongX = k.n[0] !== 0, proj = 25;
    // Extent across the leg face, 3 mm in from both edges at the cleat's bottom.
    const across = alongX ? span(faceY(sBot) + c.sy * 3, c.sy * (g.leg_cy + g.leg_sq / 2) - c.sy * 3)
      : span(faceX(sBot) + c.sx * 3, c.sx * (g.leg_cx + g.leg_sq / 2) - c.sx * 3);
    const depth = span(k.face + (alongX ? k.n[0] : k.n[1]) * proj, k.face - (alongX ? k.n[0] : k.n[1]) * 12);
    const bx = alongX ? box([depth[0], across[0], cz0], [depth[1], across[1], cz1]) : box([across[0], depth[0], cz0], [across[1], depth[1], cz1]);
    const mid0 = (across[0] + across[1]) / 2, mid = mid0 - 6, vmid = mid0 + 6, zc = (cz0 + cz1) / 2, nn = alongX ? k.n[0] : k.n[1];
    const P3 = (d, other, z) => (alongX ? [d, other, z] : [other, d, z]);
    const inFace = k.face + nn * proj, sPos = k.face + nn * 15;
    const slotLen = 2 * gapY + 2 * SCREW.clear;
    const cbW = 2 * SCREW.head_r + 1, cbLen = slotLen - 2 * SCREW.clear + cbW; // head can slide with the shelf
    const slot = alongX ? stadium(sPos, vmid, slotLen, 2 * SCREW.clear, true) : stadium(vmid, sPos, slotLen, 2 * SCREW.clear, true);
    const cb = alongX ? stadium(sPos, vmid, cbLen, cbW, true) : stadium(vmid, sPos, cbLen, cbW, true);
    const cleat = body(k.id, "Shelf cleat", "wood", [add(bx), ...legSolid.map(cut),
      cut(cyl(P3(inFace + nn * 1, mid, zc), P3(inFace - nn * 6, mid, zc), 5)),            // counterbore for the screw into the leg
      cut(cyl(P3(inFace - nn * 5, mid, zc), P3(k.face - nn * 6, mid, zc), SCREW.clear)),
      cut(prism(cb, cz0 - 1, cz0 + 6)), cut(prism(slot, cz0 + 5.5, cz1 + 0.5))]);
    const s1 = body(`${k.id}-screw-leg`, "Wood screw #8 × 1¼", "hardware", [add(cyl(P3(inFace - nn * 6, mid, zc), P3(inFace - nn * 6 - nn * 32, mid, zc), SCREW.r)),
      add(cyl(P3(inFace - nn * 3, mid, zc), P3(inFace - nn * 6, mid, zc), SCREW.head_r))]);
    leg.steps.push(cut(cyl(P3(k.face + nn * 2, mid, zc), P3(inFace - nn * 38.5, mid, zc), SCREW.pilot)));
    const vx = alongX ? sPos : vmid, vy = alongX ? vmid : sPos;
    const s2 = body(`${k.id}-screw-shelf`, "Wood screw #8 × 1", "hardware", [add(cyl([vx, vy, cz0 + 6], [vx, vy, zb + 12], SCREW.r)),
      add(cyl([vx, vy, cz0 + 3], [vx, vy, cz0 + 6], SCREW.head_r))]);
    shelf.steps.push(cut(cyl([vx, vy, zb - 0.5], [vx, vy, zb + 12.5], SCREW.pilot)));
    bodies.push(cleat, s1, s2);
    joints.push({ type: "cleat-to-leg", parts: [k.id, leg.id], via: [s1.id] }, { type: "shelf-on-cleat", parts: [shelf.id, k.id], via: [s2.id] });
  }
  return {
    id: "E1-shelf-cleats", section: "E1", title: "Shelf on cleats", size: "coffee table",
    summary: "Small cleats screwed to the inside faces of each leg carry the shelf. The shelf is notched around the leg and screwed up through slots so it can move across its width.",
    params: [P("shelf_top", SHELF_TOP, "Shelf top above the floor"), P("shelf_t", SHELF_T, "Shelf thickness"), P("cleat", 19, "Cleat height"),
      P("cleat_proj", 25, "Cleat sticks out from the leg"), P("notch_gap_x", gapX, "Gap at the notch, along the length"), P("notch_gap_y", gapY, "Gap at the notch, across the width (for movement)")],
    notes: ["The cleat's face is planed to match the leg taper."],
    bodies, joints,
  };
}

// Rail between two legs with a tenon into each, shoulders following the
// tapered leg faces. which: "long" (along x) or "short" (along y); pos is the
// rail's centre plane; corners are the two legs it joins.
function rail(g, id, name, which, pos, corners, z0, z1, legsById, { t = g.apron_t, mitre = false } = {}) {
  const tt = 9.525, sh = 6.35, L = g.meet, fit = FIT.standard;
  const half = which === "long" ? g.leg_cx : g.leg_cy;
  const steps = [add(which === "long" ? box([-half, pos - t / 2, z0], [half, pos + t / 2, z1]) : box([pos - t / 2, -half, z0], [pos + t / 2, half, z1]))];
  for (const c of corners) steps.push(...solidOf(legsById[legId(c)]).map(cut));
  const joints = [];
  for (const c of corners) {
    const A = apronFrame(g, c, which), len = mitre ? L : 25.4 + (g.leg_sq - legSectionAt(g, z1));
    steps.push(add(box([-3, -tt / 2, z0 + sh], [len, tt / 2, z1 - sh], A.F)));
    if (mitre) steps.push(cut(mitreCut(g, c, which)));
    legsById[legId(c)].steps.push(cut(box([-3, -tt / 2 - fit, z0 + sh - fit], [len + GLUE_ROOM, tt / 2 + fit, z1 - sh + fit], A.F)));
    joints.push({ type: "mortise-and-tenon", parts: [id, legId(c)] });
  }
  return { body: body(id, name, "wood", steps), joints };
}

// ---- E2: end stretchers with a slatted shelf (lower frame) --------------------------
function slatted() {
  const g = geom(COFFEE), legs = CORNERS.map(c => legBody(g, c)), byId = Object.fromEntries(legs.map(l => [l.id, l]));
  const st = SHELF_TOP - SHELF_T, sb = st - 38.1, bodies = [...legs], joints = [];
  for (const sx of [1, -1]) {
    const cs = CORNERS.filter(c => c.sx === sx), id = `stretcher-${sx > 0 ? "right" : "left"}`;
    const r = rail(g, id, "End stretcher", "short", sx * g.rail_x, cs, sb, st, byId);
    bodies.push(r.body); joints.push(...r.joints);
  }
  const yIn = g.leg_cy + g.leg_sq / 2 - legSectionAt(g, SHELF_TOP) - 3, n = 5, w = 63.5, gap = (2 * yIn - n * w) / (n - 1);
  const xEnd = g.rail_x + g.apron_t / 2;
  for (let i = 0; i < n; i++) {
    const y0 = -yIn + i * (w + gap), id = `slat-${i + 1}`, yc = y0 + w / 2;
    const slat = body(id, `Slat ${i + 1}`, "wood", [add(box([-xEnd, y0, st], [xEnd, y0 + w, SHELF_TOP]))]);
    bodies.push(slat);
    for (const sx of [1, -1]) {
      const x = sx * g.rail_x, sid = `${id}-screw-${sx > 0 ? "right" : "left"}`, str = bodies.find(b => b.id === `stretcher-${sx > 0 ? "right" : "left"}`);
      str.steps.push(cut(cyl([x, yc, sb - 1], [x, yc, st - 13], 5)), cut(cyl([x, yc, st - 13.5], [x, yc, st + 0.5], SCREW.clear)));
      slat.steps.push(cut(cyl([x, yc, st - 0.5], [x, yc, st + 12.5], SCREW.pilot)));
      bodies.push(body(sid, "Wood screw #8 × 1", "hardware", [add(cyl([x, yc, st - 13], [x, yc, st + 12], SCREW.r)), add(cyl([x, yc, st - 16], [x, yc, st - 13], SCREW.head_r))]));
      joints.push({ type: "slat-on-stretcher", parts: [id, str.id], via: [sid] });
    }
  }
  return {
    id: "E2-shelf-slats", section: "E2", title: "End stretchers with a slatted shelf", size: "coffee table",
    summary: "A stretcher between the legs at each end, tenoned into the legs, carries five slats screwed from below. Lower part of the table only.",
    params: [P("stretcher_h", 38.1, "Stretcher height"), P("stretcher_t", g.apron_t, "Stretcher thickness"), P("slats", n, "Number of slats", ""),
      P("slat_w", w, "Slat width"), P("slat_gap", gap, "Gap between slats"), P("tenon_l", 25.4, "Stretcher tenon length from the leg face")],
    notes: ["Slats are narrow, so they need no allowance for movement beyond the gaps."],
    bodies, joints,
  };
}

// ---- E3: shelf panel in grooved stretchers ------------------------------------------
function grooved() {
  const g = geom(COFFEE), legs = CORNERS.map(c => legBody(g, c)), byId = Object.fromEntries(legs.map(l => [l.id, l]));
  const zt = SHELF_TOP, zb = zt - 38.1, bodies = [...legs], joints = [];
  const gz0 = (zt + zb) / 2 - 6.25, gz1 = gz0 + 12.5, gd = 8;
  const rails = [
    ["stretcher-front", "Long stretcher", "long", -g.rail_y, CORNERS.filter(c => c.sy < 0)],
    ["stretcher-back", "Long stretcher", "long", g.rail_y, CORNERS.filter(c => c.sy > 0)],
    ["stretcher-right", "Short stretcher", "short", g.rail_x, CORNERS.filter(c => c.sx > 0)],
    ["stretcher-left", "Short stretcher", "short", -g.rail_x, CORNERS.filter(c => c.sx < 0)],
  ];
  const sIn = legSectionAt(g, zt), xLeg = g.leg_cx + g.leg_sq / 2 - sIn, yLeg = g.leg_cy + g.leg_sq / 2 - sIn;
  for (const [id, name, which, pos, cs] of rails) {
    const r = rail(g, id, name, which, pos, cs, zb, zt, byId, { mitre: true });
    const inner = Math.abs(pos) - g.apron_t / 2, s = Math.sign(pos);
    const [a0, a1] = [s * (inner - 1), s * (inner + gd)].sort((p, q) => p - q);
    r.body.steps.push(cut(which === "long" ? box([-xLeg + 1, a0, gz0], [xLeg - 1, a1, gz1]) : box([a0, -yLeg + 1, gz0], [a1, yLeg - 1, gz1])));
    bodies.push(r.body); joints.push(...r.joints);
  }
  const px = g.rail_x - g.apron_t / 2 + gd - 1, py = g.rail_y - g.apron_t / 2 + gd - 1, pt = 12;
  const panel = body("shelf-panel", "Shelf panel (12 mm plywood)", "wood", [add(box([-px, -py, gz0], [px, py, gz0 + pt])),
    ...CORNERS.map(c => cut(box([Math.min(c.sx * (xLeg - 1), c.sx * 1000), Math.min(c.sy * (yLeg - 1), c.sy * 1000), gz0 - 1],
      [Math.max(c.sx * (xLeg - 1), c.sx * 1000), Math.max(c.sy * (yLeg - 1), c.sy * 1000), gz1 + 1])))], { material: "plywood" });
  bodies.push(panel);
  for (const [id] of rails) joints.push({ type: "panel-in-groove", parts: ["shelf-panel", id] });
  return {
    id: "E3-shelf-grooved", section: "E3", title: "Shelf panel in grooved stretchers", size: "coffee table",
    summary: "Four stretchers with mitred tenons into the legs, grooved on the inside to hold a 12 mm plywood shelf panel. Lower part of the table only.",
    params: [P("stretcher_h", 38.1, "Stretcher height"), P("groove_w", 12.5, "Groove width (12 mm plywood)"), P("groove_d", gd, "Groove depth"),
      P("panel_t", pt, "Panel thickness"), P("panel_gap", 1, "Gap at the groove bottom")],
    notes: ["A solid wood panel would need extra room in the grooves across its width."],
    bodies, joints,
  };
}

// ---- F: feet (lower 6 in of the leg) ----------------------------------------------
const FOOT_TOP = 152.4;
function ferrule() {
  const g = geom({ ...COFFEE, leg_section: "round", foot: 0.875 }), c = FR, cx = c.sx * g.leg_cx, cy = c.sy * g.leg_cy;
  const r = z => (g.foot + (g.leg_sq - g.foot) * z / g.head_z0) / 2, h = 30, base = 1.5, ro = r(h), ri = ro - 1.4;
  const leg = body(legId(c), "Leg (lower 6 in shown)", "wood", [add(loft(h, circle(cx, cy, ro), FOOT_TOP, circle(cx, cy, r(FOOT_TOP)))),
    add(cyl([cx, cy, base], [cx, cy, h + 0.5], ri - 0.05))]);
  const fer = body("ferrule", "Brass ferrule", "hardware", [add(cyl([cx, cy, 0], [cx, cy, h], ro)), cut(cyl([cx, cy, base], [cx, cy, h + 1], ri))], { material: "brass" });
  return { id: "F1-ferrule", section: "F1", title: "Brass ferrule", size: "coffee table",
    summary: "The round leg's end is turned down to a spigot that fits inside a brass cup, flush with the leg above it.",
    params: [P("ferrule_od", 2 * ro, "Ferrule outside diameter (= leg diameter where it ends)"), P("ferrule_id", 2 * ri, "Ferrule inside diameter = spigot"), P("ferrule_h", h, "Ferrule height")],
    notes: ["Placeholder sizes: buy the ferrules first and size the spigot to them."], bodies: [leg, fer],
    joints: [{ type: "spigot-in-ferrule", parts: [leg.id, "ferrule"] }] };
}
// Square tapered leg between two heights (outer faces flush).
function lowerLeg(g, c, z0, z1) {
  const s = z => legSectionAt(g, z);
  const sq = z => rect(c.sx * (g.leg_cx + (g.leg_sq - s(z)) / 2), c.sy * (g.leg_cy + (g.leg_sq - s(z)) / 2), s(z), s(z));
  return loft(z0, sq(z0), z1, sq(z1));
}
function glide() {
  const g = geom(COFFEE), c = FR, z0 = 8, s = legSectionAt(g, z0);
  const cx = c.sx * (g.leg_cx + (g.leg_sq - s) / 2), cy = c.sy * (g.leg_cy + (g.leg_sq - s) / 2);
  const leg = body(legId(c), "Leg (lower 6 in shown)", "wood", [add(lowerLeg(g, c, z0, FOOT_TOP)), cut(cyl([cx, cy, z0 - 1], [cx, cy, z0 + 15], 5 + 0.05))]);
  const insert = body("threaded-insert", "Threaded insert M8", "hardware", [add(cyl([cx, cy, z0], [cx, cy, z0 + 13], 5)), cut(cyl([cx, cy, z0 - 1], [cx, cy, z0 + 14], 4.05))]);
  const gl = body("glide", "Levelling glide M8", "hardware", [add(cyl([cx, cy, 0], [cx, cy, 5], 11)), add(cyl([cx, cy, 5], [cx, cy, z0 + 12], 4))]);
  return { id: "F2-glide", section: "F2", title: "Levelling glide", size: "coffee table",
    summary: "An M8 threaded insert in the foot takes a screw-in glide, so the table can be levelled.",
    params: [P("insert", 10, "Insert hole diameter"), P("insert_depth", 15, "Insert hole depth"), P("glide_d", 22, "Glide pad diameter"), P("lift", z0, "Glide height when screwed in")],
    notes: ["The leg is 8 mm shorter so the overall height stays the same."], bodies: [leg, insert, gl],
    joints: [{ type: "insert", parts: ["threaded-insert", leg.id] }, { type: "glide", parts: ["glide", "threaded-insert"] }] };
}
function felt() {
  const g = geom(COFFEE), c = FR, ch = 3, fz = 3, s = z => legSectionAt(g, z);
  const ctr = z => [c.sx * (g.leg_cx + (g.leg_sq - s(z)) / 2), c.sy * (g.leg_cy + (g.leg_sq - s(z)) / 2)];
  const sq = z => rect(...ctr(z), s(z), s(z));
  const leg = body(legId(c), "Leg (lower 6 in shown)", "wood", [
    add(loft(fz, rect(...ctr(fz), s(fz) - 2 * ch, s(fz) - 2 * ch), fz + ch, sq(fz + ch))), add(loft(fz + ch, sq(fz + ch), FOOT_TOP, sq(FOOT_TOP)))]);
  const pad = body("felt-pad", "Felt pad", "hardware", [add(cyl([...ctr(0), 0], [...ctr(0), fz], 9.5))], { material: "felt" });
  return { id: "F3-felt", section: "F3", title: "Plain foot with a felt pad", size: "coffee table",
    summary: "A small chamfer on the foot stops it splintering; a 19 mm felt pad goes underneath.",
    params: [P("chamfer", ch, "Foot chamfer"), P("pad_d", 19, "Felt pad diameter"), P("pad_t", fz, "Felt pad thickness")],
    notes: [], bodies: [leg, pad], joints: [{ type: "pad", parts: ["felt-pad", leg.id], contact: "touch" }] };
}

export function shelfModels() { return [cleats(), slatted(), grooved()]; }
export function feetModels() { return [ferrule(), glide(), felt()]; }
