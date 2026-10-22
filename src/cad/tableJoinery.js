// The joints of a full table, chosen in the app: how the aprons join the
// legs and how the top is held on. Uses the same joint recipes as the
// reference models in src/cad/joinery/, sized to the table being designed.
//
// Returns plain shapes (see joinery/shapes.js) in the CAD frame: mm, Z up,
// X along the length, the front faces -Y.
import { cut, add, body, cyl } from "./joinery/shapes.js";
import { geom, CORNERS, apronFrame, apronId, legId, movement, HOLE_CLEAR, at } from "./joinery/base.js";
import { mtHaunched, mtRounded, looseTenon, dowels, bracketBolt, pocketScrews, throughWedged, DOMINO } from "./joinery/legApron.js";
import { buttonGroove, makeButton, zClipKerf, makeZClip, makeFigure8, makeCornerBlock } from "./joinery/top.js";

export const JOINTS = [
  { id: "mt-haunched", name: "Haunched mortise and tenon", desc: "The strongest. Mortises cut with a chisel or a hollow-chisel mortiser." },
  { id: "mt-router", name: "Mortise and tenon, router cut", desc: "Round-ended mortises from a router or CNC, with the tenon edges rounded to match." },
  { id: "domino", name: "Loose tenons (Domino)", desc: "Quick with a Festool Domino and nearly as strong as a tenon." },
  { id: "dowels", name: "Dowels", desc: "Only needs a drill and a doweling jig." },
  { id: "bracket", name: "Corner bracket and hanger bolt", desc: "The legs unbolt, so the table comes apart for moving." },
  { id: "pocket", name: "Pocket screws", desc: "The fastest, with a pocket-hole jig. Hidden on the inside." },
  { id: "wedged", name: "Wedged through tenon", desc: "The tenon ends show on the outside of the legs as a feature." },
];
export const TOP_FIXINGS = [
  { id: "buttons", name: "Wooden buttons", desc: "Traditional. Hook into a groove in the aprons, made from offcuts." },
  { id: "z-clips", name: "Z-clips", desc: "Bought steel clips in a saw kerf." },
  { id: "figure-8", name: "Figure-8 fasteners", desc: "Sit flush in the top of the aprons and swivel as the top moves." },
  { id: "blocks", name: "Corner blocks", desc: "Glued into each corner, with one screw through a slot." },
];
// Joints a peg can go through: a tenon or a loose tenon that sits in the leg.
export const PEGGABLE = new Set(["mt-haunched", "mt-router", "domino"]);
// Cylinder across an apron's thickness (local y) from b0 to b1.
const cylA2 = (A, a, b0, b1, z, r) => cyl(at(A.F, [a, b0, z]), at(A.F, [a, b1, z]), r);

export const DEFAULT_JOINT = "mt-haunched", DEFAULT_TOP_FIX = "buttons";

const SPECIES = { walnut: "walnut", teak: "teak", oak: "white_oak", rosewood: "rosewood" };
const WEDGED_MIN = 12; // smallest through tenon height, mm

// Through tenons are stacked one above the other, so they need a deep apron.
const wedgedHeight = g => Math.min(25.4, (g.apron_h - 2 * 9.525 - 6.35) / 2);

/** Why an option can't be used at these sizes, or null when it can. */
export function unavailable(s, key, id) {
  const g = geom(s);
  if (key === "joint" && id === "wedged" && wedgedHeight(g) < WEDGED_MIN)
    return "Needs aprons at least 2¼ in tall, for two through tenons one above the other.";
  if (key === "joint" && id === "bracket" && s.top_fix === "blocks")
    return "The bracket sits where the corner blocks go. Pick another top fixing first.";
  if (key === "top_fix" && id === "blocks" && s.joint === "bracket")
    return "The corner brackets sit where the blocks go. Pick another joint first.";
  return null;
}

// Domino size, heights (from the apron's middle) and depth into the leg.
function dominoPlan(g) {
  const size = g.apron_t >= 17 && g.apron_h >= 40 ? "8x40" : "5x30", D = DOMINO[size];
  const usable = g.apron_h - 12, sp = Math.min(34, usable - D.w);
  const heights = usable >= 2 * D.w + 6 ? [-sp / 2, sp / 2] : [0];
  // Go less deep into the leg if the other apron's Domino is in the way.
  const e = Math.min(D.l / 2, g.meet - D.t / 2 - HOLE_CLEAR - 1.5);
  return { size, D, heights, e };
}

export const PEG_D = 6.35; // ¼ in dowel

// Where a peg crosses a joint, in the apron frame: a = how far into the leg,
// z = height, t = thickness of what it passes through, and which loose
// tenon (by index) it goes through, if any. The long and short aprons' pegs
// sit at different heights so they pass each other inside the leg.
function pegSpot(id, g, which) {
  const r = PEG_D / 2, up = which === "long" ? 1 : -1;
  if (id === "domino") {
    const { D, heights, e } = dominoPlan(g);
    const a = Math.min(Math.max(e / 2, r + 1.5), e - r - 1.5);
    if (a < r + 1.5) return null;
    const i = heights.length > 1 ? (up > 0 ? heights.length - 1 : 0) : 0;
    const dz = heights.length > 1 ? 0 : up * Math.max(0, Math.min(4, D.w / 2 - D.t / 2 - r));
    return { a, z: g.apron_mid + heights[i] + dz, t: D.t, tenon: i };
  }
  const tt = Math.min(9.525, g.apron_t / 2);
  let zt = g.apron_top - 9.525, zb = g.apron_top - g.apron_h + 9.525;
  if (id === "mt-haunched") { zt = g.apron_top - Math.min(9.525, g.apron_h * 0.2); zb = g.apron_top - g.apron_h + Math.min(9.525, g.apron_h * 0.15); }
  const dz = up * Math.max(0, Math.min(8, (zt - zb) / 2 - r - 2));
  return { a: Math.min(12.7, g.meet / 2), z: (zt + zb) / 2 + dz, t: tt };
}

// Joint recipe for one corner, sized to the table. A new one per corner,
// because the bracket joint adds its bracket and bolt once per corner.
function jointFor(id, g, notes) {
  const half = g.apron_h / 2;
  if (id === "mt-router") return mtRounded({ tenon_t: Math.min(9.525, g.apron_t / 2) });
  if (id === "domino") {
    const { size, heights, e } = dominoPlan(g);
    if (e < 10) notes.add("The legs are thin for these aprons, so the Dominoes only go " + e.toFixed(0) + " mm into the legs.");
    return looseTenon({ size, heights: { long: heights, short: heights }, leg_depth: e });
  }
  if (id === "dowels") {
    const d = g.apron_t >= 19 ? 10 : 8, l = d === 10 ? 40 : 32, sp = Math.min(38, g.apron_h - d - 12);
    const heights = sp >= d + 6 ? [-sp / 2, sp / 2] : [0];
    const e = Math.min(l / 2, g.meet - d / 2 - HOLE_CLEAR - 1.5);
    if (e < 10) notes.add("The legs are thin for these aprons, so the dowels only go " + e.toFixed(0) + " mm into the legs.");
    return dowels({ d, l, heights: { long: heights, short: heights }, leg_depth: e });
  }
  if (id === "bracket") {
    const off = Math.min(20, half - 9), diag = g.leg_sq * Math.SQRT2;
    return bracketBolt({ bracket_h: Math.min(50, g.apron_h - 6), dowel_dz: off >= 9 ? [-off, off] : [],
      bolt_in: Math.min(40, diag - 6 - 8) });
  }
  if (id === "pocket") {
    const s = Math.min(18, half - 8), base = s >= 8 ? [-s, s] : [0];
    // Thin legs: stagger the two aprons' screws so they pass each other.
    const st = g.meet < 19 ? 3 : 0;
    return pocketScrews({ heights: { long: base.map(z => z + st), short: base.map(z => z - st) } });
  }
  if (id === "wedged") return throughWedged({ tenon_t: Math.min(9.525, g.apron_t / 2), tenon_w: wedgedHeight(g) });
  return mtHaunched({ tenon_t: Math.min(9.525, g.apron_t / 2), haunch: Math.min(9.525, g.apron_h * 0.2),
    shoulder_b: Math.min(9.525, g.apron_h * 0.15) });
}

// Where the top fasteners go along an apron: distances from its first
// corner's leg face (negative, toward the other leg), spaced up to 300 mm
// apart, with an odd number on the long aprons so one sits in the middle.
function spots(len, odd) {
  let n = Math.max(1, Math.round(len / 300));
  if (odd && n % 2 === 0) n++;
  const sp = n > 1 ? Math.min(300, (len - 180) / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => -len / 2 + (i - (n - 1) / 2) * sp);
}

const APRONS = [
  { id: "apron-front", which: "long", corners: CORNERS.filter(c => c.sy < 0) },
  { id: "apron-back", which: "long", corners: CORNERS.filter(c => c.sy > 0) },
  { id: "apron-right", which: "short", corners: CORNERS.filter(c => c.sx > 0) },
  { id: "apron-left", which: "short", corners: CORNERS.filter(c => c.sx < 0) },
];

// Give a corner's extra parts their own ids, and fix up the joints that
// name them.
function prefixIds(bodies, joints, prefix) {
  const map = Object.fromEntries(bodies.map(b => [b.id, `${prefix}-${b.id}`]));
  const re = id => map[id] || id;
  for (const b of bodies) b.id = map[b.id];
  for (const j of joints) {
    j.parts = j.parts.map(re);
    if (j.via) j.via = j.via.map(re);
  }
  return { bodies, joints };
}

/**
 * Joinery for a whole table.
 * @param s table parameters in inches (as in src/furniture.js), plus
 *   `joint` and `top_fix`.
 * @returns {{ apron: Object<string, step[]>, leg: Object<string, shape[]>,
 *   top: shape[], parts: Array<{body, group}>, joints: object[], notes: string[] }}
 */
export function tableJoinery(s) {
  const g = geom(s), notes = new Set();
  const jointId = JOINTS.some(j => j.id === s.joint) ? s.joint : DEFAULT_JOINT;
  let fixId = TOP_FIXINGS.some(f => f.id === s.top_fix) ? s.top_fix : DEFAULT_TOP_FIX;
  // The joint comes first: if it clashes with the top fixing, the fixing gives way.
  let useJoint = jointId;
  const why = unavailable({ ...s, top_fix: null }, "joint", jointId);
  if (why) {
    notes.add(`${JOINTS.find(j => j.id === jointId).name}: ${why} Using a haunched mortise and tenon instead.`);
    useJoint = DEFAULT_JOINT;
  }
  if (unavailable({ ...s, joint: useJoint }, "top_fix", fixId)) {
    notes.add(`Corner blocks can't be used with corner brackets, so the top is held with wooden buttons.`);
    fixId = DEFAULT_TOP_FIX;
  }

  const apron = Object.fromEntries(APRONS.map(a => [a.id, []]));
  const leg = Object.fromEntries(CORNERS.map(c => [legId(c), []]));
  const top = [], parts = [], joints = [];

  // Legs to aprons, corner by corner.
  for (const c of CORNERS) {
    const joint = jointFor(useJoint, g, notes), extra = [], cj = [];
    for (const which of ["long", "short"]) {
      const A = apronFrame(g, c, which), j = joint(g, c, which, A);
      const spot = s.pegs && PEGGABLE.has(useJoint) ? pegSpot(useJoint, g, which) : null;
      if (spot) {
        // From the leg's outside face, through the tenon, stopping inside the leg.
        const out = -A.ins * (g.apron_set + g.apron_t / 2), end = A.ins * (spot.t / 2 + 4);
        const hole = cylA2(A, spot.a, out - A.ins * 0.5, end + A.ins, spot.z, PEG_D / 2 + HOLE_CLEAR);
        const peg = body(`peg-${which}`, "Dowel peg ¼ in", "tenon", [add(cylA2(A, spot.a, out, end, spot.z, PEG_D / 2))], { material: "maple" });
        j.leg.push(hole);
        const through = spot.tenon === undefined ? null : j.extra[spot.tenon];
        if (through) through.steps.push(cut(hole)); else j.apron.push(cut(hole));
        j.extra = [...(j.extra || []), peg];
        j.joints = [...(j.joints || []), { type: "peg", parts: [through ? through.id : apronId(c, which), legId(c)], via: [peg.id] }];
      } else if (s.pegs) notes.add("These joints are too small for pegs, so the table is made without them.");
      apron[apronId(c, which)].push(...j.apron);
      leg[legId(c)].push(...j.leg);
      extra.push(...(j.extra || []));
      cj.push(...(j.joints || []));
    }
    prefixIds(extra, cj, c.name);
    parts.push(...extra.map(b => ({ body: b, group: "joinery" })));
    joints.push(...cj);
  }

  // The top, fixed to the aprons.
  const species = SPECIES[s.finish] || "walnut";
  const mv = movement(g.table_w, species);
  const gapLong = mv / 2 + 1, gapShort = 1.5;
  if (fixId === "blocks") {
    for (const c of CORNERS) {
      const b = makeCornerBlock(g, c, `-${c.name}`, mv, { h: Math.min(50, g.apron_h - 2) });
      top.push(b.pilot);
      parts.push({ body: b.block, group: "fixings" }, { body: b.screw, group: "fixings" });
      joints.push(...b.joints(apronId(c, "long"), apronId(c, "short"), "top"));
    }
  } else {
    for (const a of APRONS) {
      const half = a.which === "long" ? g.long_half : g.short_half;
      const A = apronFrame(g, a.corners[0], a.which), len = 2 * half, at = spots(len, a.which === "long");
      const tag = a.id.replace("apron-", "");
      if (fixId === "buttons") apron[a.id].push(cut(buttonGroove(g, A, -len + 25, -25)));
      if (fixId === "z-clips") apron[a.id].push(cut(zClipKerf(g, A, -len + 25, -25)));
      at.forEach((ac, i) => {
        const fixed = a.which === "long" && at.length % 2 === 1 && i === (at.length - 1) / 2;
        const gap = a.which === "long" ? (fixed ? 1 : gapLong) : gapShort, t = `${tag}-${i + 1}`;
        let f;
        if (fixId === "buttons") {
          f = makeButton(g, A, t, ac, gap);
          parts.push({ body: f.button, group: "fixings" }, { body: f.screw, group: "fixings" });
        } else if (fixId === "z-clips") {
          f = makeZClip(g, A, t, ac, gap);
          parts.push({ body: f.clip, group: "fixings" }, { body: f.screw, group: "fixings" });
        } else {
          // Keep 3 mm of apron outside the 22 mm recess, and the lobe that
          // screws to the top clear of the apron's inside face.
          f = makeFigure8(g, A, t, ac, Math.max(14 - g.apron_t / 2, g.apron_t / 2 - 7.5));
          apron[a.id].push(...f.apronCuts.map(cut));
          parts.push(...[f.plate, f.screwA, f.screwB].map(b => ({ body: b, group: "fixings" })));
        }
        top.push(f.pilot);
        joints.push(...f.joints(a.id, "top"));
      });
    }
    if (fixId === "buttons" || fixId === "z-clips")
      notes.add(`The top can move about ${mv.toFixed(1)} mm across its width over a year, so the ${fixId === "buttons" ? "buttons" : "clips"} on the long aprons stand ${gapLong.toFixed(1)} mm off the bottom of the ${fixId === "buttons" ? "groove" : "kerf"}. The one in the middle of each long apron is tight.`);
  }
  if (s.arch_rise > 0 && (fixId === "buttons" || fixId === "z-clips") && (g.apron_h - g.arch_rise) < 26)
    notes.add("The arch leaves little apron in the middle for the groove. A smaller arch is stronger.");
  if (species === "rosewood") notes.add("Wood movement for rosewood is an estimate.");
  return { apron, leg, top, parts, joints, notes: [...notes], joint: useJoint, topFix: fixId };
}

/** True for parts you buy rather than make: hardware, Dominoes and dowels. */
export const isBought = b => b.kind === "hardware" || /^(Domino|Dowel|Alignment dowel)/.test(b.name);
