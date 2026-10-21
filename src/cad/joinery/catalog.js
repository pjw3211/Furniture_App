// Every joinery reference model from the coffee table checklist, in
// checklist order. Each model is plain data (see shapes.js), so it can be
// written to JSON for the Fusion script and built here for the tests.
import { legApronModels } from "./legApron.js";
import { splayModels } from "./splay.js";
import { topModels } from "./top.js";
import { shelfModels, feetModels } from "./shelf.js";
import { assemblyModels } from "./assembly.js";
import { profiles } from "./profiles.js";

export const SPEC_FORMAT = 1;
export const FRAME_NOTE = "Millimetres. Z up, X along the table length, front of the table faces -Y, origin on the floor at the centre of the table.";

export function allModels() {
  return [...legApronModels(), ...splayModels(), ...topModels(), ...shelfModels(), ...feetModels(), ...assemblyModels()];
}
export { profiles };

// The JSON files the Fusion script reads.
export function specFiles() {
  const models = allModels(), files = {};
  for (const m of models) files[`${m.id}.json`] = { format: SPEC_FORMAT, units: "mm", frame: FRAME_NOTE, ...m };
  files["profiles.json"] = { format: SPEC_FORMAT, units: "mm", profiles: profiles() };
  files["index.json"] = { format: SPEC_FORMAT, models: models.map(m => ({ id: m.id, section: m.section, title: m.title, bodies: m.bodies.length })),
    profiles: profiles().map(p => ({ id: p.id, section: p.section, title: p.title })) };
  return files;
}
