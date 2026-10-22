// The mid-century coffee table: the choices the app offers (one dropdown
// each) and how a set of choices turns into the table's sizes for the solid
// engine (src/cad/table.js). Sizes here are in inches, like the engine's.
import { JOINTS, TOP_FIXINGS, DEFAULT_JOINT, DEFAULT_TOP_FIX, PEGGABLE } from "./cad/tableJoinery.js";

export const MM = 25.4;

// Overall sizes: length × width × height, inches.
export const SIZES = [
  { id: "small", name: "Small", l: 36, w: 18, h: 16 },
  { id: "medium", name: "Medium", l: 42, w: 20, h: 16 },
  { id: "large", name: "Large", l: 48, w: 22, h: 16 },
  { id: "long", name: "Long and low", l: 60, w: 24, h: 15 },
  { id: "custom", name: "Custom size" },
];
export const LIMITS = { l: [30, 72], w: [16, 32], h: [13, 20] };

// The dropdowns, in the order the app shows them. Each option may carry the
// engine settings (p) it stands for.
export const GROUPS = [
  { id: "size", title: "Size", fields: [
    { key: "size", label: "Overall size", options: SIZES.map(s => ({ id: s.id, name: s.name })) },
  ] },
  { id: "features", title: "Features", fields: [
    { key: "legs", label: "Legs", options: [
      { id: "square", name: "Square, tapered", p: { leg_section: "square", foot: 1, splay_ang: 0 } },
      { id: "round", name: "Round, tapered", p: { leg_section: "round", foot: 0.875, splay_ang: 0 } },
      { id: "splayed", name: "Round, splayed", p: { leg_section: "round", foot: 0.875, splay_ang: 8 } },
      { id: "splayed-square", name: "Square, splayed", p: { leg_section: "square", foot: 1, splay_ang: 6 } },
    ] },
    { key: "aprons", label: "Aprons", options: [
      { id: "straight", name: "Straight", p: { arch_rise: 0 } },
      { id: "arched", name: "Arched", p: { arch_rise: 1.25 } },
    ] },
    { key: "top", label: "Top shape", options: [
      { id: "square", name: "Square corners", p: { top_mode: "rect", corner_r: 0 } },
      { id: "rounded", name: "Rounded corners", p: { top_mode: "rect", corner_r: 4 } },
      { id: "se", name: "Superellipse", p: { top_mode: "se", se_n: 2.5 } },
    ] },
    { key: "shelf", label: "Lower shelf", options: [
      { id: "none", name: "No shelf", p: { shelf: 0 } },
      { id: "slats", name: "Slatted shelf", p: { shelf: "slats" } },
      { id: "solid", name: "Solid shelf", p: { shelf: "solid" } },
    ] },
    { key: "pegs", label: "Pegs", options: [
      { id: "none", name: "No pegs", p: { pegs: 0 } },
      { id: "pegged", name: "Pegged tenons (show on the legs)", p: { pegs: 1 } },
    ] },
    { key: "wood", label: "Wood", options: [
      { id: "walnut", name: "Walnut", p: { finish: "walnut" } },
      { id: "teak", name: "Teak", p: { finish: "teak" } },
      { id: "oak", name: "White oak", p: { finish: "oak" } },
    ] },
  ] },
  { id: "profiles", title: "Profiles", fields: [
    { key: "top_edge", label: "Top edge", options: [
      { id: "bevel", name: "Undercut bevel", p: { top_bevel: 18.5, edge_r: 0, edge_ch: 0 } },
      { id: "square", name: "Square", p: { top_bevel: 0, edge_r: 0, edge_ch: 0 } },
      { id: "eased", name: "Eased (1/16 in round)", p: { top_bevel: 0, edge_r: 0.0625, edge_ch: 0 } },
      { id: "roundover", name: "Roundover (1/4 in)", p: { top_bevel: 0, edge_r: 0.25, edge_ch: 0 } },
      { id: "chamfer", name: "Chamfer (1/8 in)", p: { top_bevel: 0, edge_r: 0, edge_ch: 0.125 } },
    ] },
    { key: "leg_edge", label: "Leg edges", options: [
      { id: "square", name: "Square", p: { leg_edge: "square" } },
      { id: "eased", name: "Eased (1/16 in round)", p: { leg_edge: "eased" } },
      { id: "chamfer", name: "Chamfer (1/8 in)", p: { leg_edge: "chamfer" } },
    ] },
  ] },
  { id: "joinery", title: "Joinery", fields: [
    { key: "joint", label: "Legs to aprons", options: JOINTS.map(j => ({ id: j.id, name: j.name, desc: j.desc, p: { joint: j.id } })) },
    { key: "top_fix", label: "Holding the top on", options: TOP_FIXINGS.map(f => ({ id: f.id, name: f.name, desc: f.desc, p: { top_fix: f.id } })) },
  ] },
];
export const FIELDS = Object.fromEntries(GROUPS.flatMap(g => g.fields).map(f => [f.key, f]));

export const DEFAULT_CHOICE = {
  size: "large", l: 48, w: 22, h: 16, legs: "square", aprons: "straight", top: "square", shelf: "none",
  pegs: "none", wood: "walnut", top_edge: "bevel", leg_edge: "square", joint: DEFAULT_JOINT, top_fix: DEFAULT_TOP_FIX,
};


/** Why an option can't be picked with the other choices, or null when it can. */
export function unavailable(choice, key, id) {
  const c = { ...choice, [key]: id };
  if (key === "pegs" && id === "pegged" && !PEGGABLE.has(c.joint))
    return "Pegs go through a tenon, so pick a mortise and tenon or loose tenons.";
  if (key === "joint" && c.pegs === "pegged" && !PEGGABLE.has(id))
    return "Pegs need a tenon to go through. Switch pegs off to use this joint.";
  if (key === "leg_edge" && id !== "square" && FIELDS.legs.options.find(o => o.id === c.legs)?.p.leg_section === "round")
    return "Round legs have no edges to shape.";
  if (key === "joint" && id === "wedged" && c.legs.startsWith("splayed"))
    return "Through tenons need straight legs.";
  if (key === "legs" && id.startsWith("splayed") && c.joint === "wedged")
    return "Splayed legs can't take through tenons. Pick another joint first.";
  if (key === "joint" && id === "bracket" && c.top_fix === "blocks")
    return "The bracket sits where the corner blocks go. Pick another top fixing first.";
  if (key === "top_fix" && id === "blocks" && c.joint === "bracket")
    return "The corner brackets sit where the blocks go. Pick another joint first.";
  return null;
}

const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));
const q = v => Math.round(v * 8) / 8; // nearest 1/8 in

/** The overall size (inches) a choice stands for. */
export function sizeOf(choice) {
  const preset = SIZES.find(s => s.id === choice.size && s.id !== "custom");
  if (preset) return { l: preset.l, w: preset.w, h: preset.h };
  return { l: clamp(+choice.l || 48, LIMITS.l), w: clamp(+choice.w || 22, LIMITS.w), h: clamp(+choice.h || 16, LIMITS.h) };
}

/** The choices with any that don't fit together swapped for ones that do. */
export function normalize(choice) {
  const c = { ...DEFAULT_CHOICE, ...choice };
  for (const key of Object.keys(FIELDS))
    if (!FIELDS[key].options.some(o => o.id === c[key]) || unavailable(c, key, c[key])) c[key] = DEFAULT_CHOICE[key];
  for (const key of Object.keys(FIELDS)) if (unavailable(c, key, c[key])) c[key] = FIELDS[key].options[0].id;
  return c;
}

/** Engine settings (inches and degrees) for a set of choices. */
export function toParams(choice) {
  const c = normalize(choice), { l, w, h } = sizeOf(c);
  const small = l < 40 || w < 19;
  const s = {
    table_l: l, table_w: w, table_h: h, top_t: 1,
    // Legs sit in from the ends and sides in proportion, as on the 48 × 22 original.
    inset_x: q(5 * l / 48), inset_y: q(3.5 * w / 22),
    leg_sq: small ? 1.5 : 1.75, apron_h: 3, apron_t: 0.75, apron_set: 0.25,
    shelf_h: Math.min(6, q(h * 0.375)),
  };
  for (const key of Object.keys(FIELDS)) Object.assign(s, FIELDS[key].options.find(o => o.id === c[key]).p || {});
  if (small) s.foot = Math.min(s.foot, s.leg_section === "round" ? 0.75 : 0.875);
  s.corner_r = Math.min(s.corner_r, w / 2 - 1);
  return s;
}

/** One line per choice, for the cut list and the DXF. */
export function summary(choice, units = "in") {
  const c = normalize(choice), { l, w, h } = sizeOf(c);
  const dims = units === "mm"
    ? `${Math.round(l * MM)} × ${Math.round(w * MM)} × ${Math.round(h * MM)} mm`
    : `${l} × ${w} × ${h} in`;
  const lines = [["Size", `${SIZES.find(s => s.id === c.size).name}, ${dims} (length × width × height)`]];
  for (const g of GROUPS.slice(1)) for (const f of g.fields)
    lines.push([f.label, f.options.find(o => o.id === c[f.key]).name]);
  if (toParams(c).shelf) lines.push(["Shelf rails to legs", "Dowels"]);
  return lines;
}
