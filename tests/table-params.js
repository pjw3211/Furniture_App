// Table settings for the engine tests (inches and degrees): the coffee
// table and side table defaults and the top, leg and apron presets the
// reference Fusion models were made from.
import { DEFAULT_JOINT, DEFAULT_TOP_FIX } from "../src/cad/tableJoinery.js";

const BASE = {
  top_mode: "rect", top_t: 1, corner_r: 0, se_n: 2.5, top_bevel: 18.5, edge_r: 0,
  leg_section: "square", leg_sq: 1.75, foot: 1, splay_ang: 0,
  apron_h: 3, apron_t: 0.75, apron_set: 0.25, arch_rise: 0, shelf: 0, shelf_h: 6,
  joint: DEFAULT_JOINT, top_fix: DEFAULT_TOP_FIX, finish: "walnut",
};
const DEFAULTS = {
  coffee_table: { ...BASE, table_l: 48, table_w: 22, table_h: 16, inset_x: 5, inset_y: 3.5 },
  side_table: { ...BASE, table_l: 20, table_w: 20, table_h: 22, inset_x: 3, inset_y: 3,
    top_mode: "se", se_n: 2, top_bevel: 0, edge_r: 0.125, leg_section: "round", leg_sq: 1.5,
    foot: 0.75, splay_ang: 6, apron_h: 2.5, shelf: 1, shelf_h: 8 },
};
export const PRESETS = {
  Top: {
    bevel: { top_mode: "rect", corner_r: 0, top_bevel: 18.5, edge_r: 0 },
    rounded: { top_mode: "rect", corner_r: 4, top_bevel: 0, edge_r: 0.125 },
    se: { top_mode: "se", se_n: 2.5, top_bevel: 0, edge_r: 0.125 },
  },
  Legs: {
    square: { leg_section: "square", foot: 1, splay_ang: 0 },
    round: { leg_section: "round", foot: 0.875, splay_ang: 0 },
    splayed: { leg_section: "round", foot: 0.875, splay_ang: 8 },
  },
  Aprons: {
    straight: { apron_h: 3, arch_rise: 0 },
    arched: { apron_h: 3, arch_rise: 1.25 },
    slim: { apron_h: 1.5, arch_rise: 0 },
  },
};

export function params(type, extra = {}) {
  const s = { ...DEFAULTS[type], ...extra };
  s.foot = Math.min(s.foot, s.leg_sq);
  s.apron_set = Math.max(0, Math.min(s.apron_set, s.leg_sq - s.apron_t));
  s.arch_rise = Math.min(s.arch_rise, s.apron_h * 0.6);
  s.edge_r = Math.min(s.edge_r, s.top_t / 2 - 0.01);
  return s;
}
export const preset = (type, group, id) => PRESETS[group][id];
