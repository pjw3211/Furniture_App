// Web worker that owns the exact solid engine (OpenCascade via replicad).
// The page sends it the coffee table's settings; it builds every part as a
// solid and answers with meshes to show and the cut list, then makes the
// flat DXF of all parts on request.
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import * as R from "replicad";
import { buildTableSolids } from "./table.js";
import { cutList, hardwareList, partMesh, flatLayoutDXF } from "./exports.js";

const ready = opencascade({ locateFile: () => wasmUrl }).then(OC => R.setOC(OC));
let last = null; // { parts, titles }

// Number parts with the same name: "Leg 1", "Leg 2"…
export function partTitles(parts) {
  const count = {}, seen = {};
  for (const p of parts) count[p.name] = (count[p.name] || 0) + 1;
  return Object.fromEntries(parts.map(p => {
    seen[p.name] = (seen[p.name] || 0) + 1;
    return [p.id, count[p.name] > 1 ? `${p.name} ${seen[p.name]}` : p.name];
  }));
}

async function handle(msg) {
  await ready;
  if (msg.cmd === "build") {
    if (last) for (const p of last.parts) p.solid.delete?.();
    const { parts, joints, notes } = buildTableSolids(R, msg.params);
    last = { parts, titles: partTitles(parts) };
    const transfer = [];
    const meshes = parts.map(p => {
      const m = partMesh(p);
      transfer.push(m.vertices.buffer, m.normals.buffer, m.triangles.buffer);
      return { id: p.id, title: last.titles[p.id], group: p.group, material: p.material, kind: p.kind, ...m };
    });
    return { result: { meshes, rows: cutList(parts), hardware: hardwareList(parts), notes, joints }, transfer };
  }
  if (!last) throw new Error("Nothing has been built yet.");
  if (msg.cmd === "dxf") return { result: flatLayoutDXF(R, last.parts, last.titles, { units: msg.units, heading: msg.heading }) };
  throw new Error("Unknown command " + msg.cmd);
}

self.onmessage = async e => {
  const { id } = e.data;
  try {
    const { result, transfer = [] } = await handle(e.data);
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
