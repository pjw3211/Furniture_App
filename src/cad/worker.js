// Web worker that owns the exact solid engine (OpenCascade via replicad).
// The page sends it a piece's parameters; it builds every part as a solid
// and answers requests for meshes, STL, DXF, the cut list and a zip of it all.
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import * as R from "replicad";
import { zipSync, strToU8 } from "fflate";
import { buildTableSolids } from "./table.js";
import { cutList, cutListCSV, partDXF, partSTL, partMesh, finishedSize } from "./exports.js";

const RECIPES = { coffee_table: buildTableSolids, side_table: buildTableSolids };

const ready = opencascade({ locateFile: () => wasmUrl }).then(OC => R.setOC(OC));
let last = null; // { type, name, params, parts, joints, notes, rows }

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Number parts with the same name: "Leg 1", "Leg 2"…
function partTitles(parts) {
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
    const recipe = RECIPES[msg.type];
    if (!recipe) return { supported: false };
    if (last) for (const p of last.parts) p.solid.delete?.();
    const { parts, joints, notes } = recipe(R, msg.params);
    const rows = cutList(parts);
    last = { type: msg.type, name: msg.name, params: msg.params, parts, joints, notes, rows, titles: partTitles(parts) };
    const transfer = [];
    const meshes = parts.map(p => {
      const m = partMesh(p);
      transfer.push(m.vertices.buffer, m.normals.buffer, m.triangles.buffer);
      return { id: p.id, title: last.titles[p.id], group: p.group, size: finishedSize(p.solid), ...m };
    });
    return { result: { supported: true, meshes, rows, notes, joints }, transfer };
  }
  if (!last) throw new Error("Nothing has been built yet.");
  const part = id => last.parts.find(p => p.id === id);
  if (msg.cmd === "stl") return { result: await partSTL(part(msg.partId)).arrayBuffer() };
  if (msg.cmd === "dxf") return { result: partDXF(R, part(msg.partId), last.titles[msg.partId]) };
  if (msg.cmd === "csv") return { result: cutListCSV(last.rows, `Cut list: ${last.name}`) };
  if (msg.cmd === "zip") {
    const base = slug(last.name || last.type), files = {};
    for (const p of last.parts) {
      const t = slug(last.titles[p.id]);
      files[`${base}/stl/${t}.stl`] = new Uint8Array(await partSTL(p).arrayBuffer());
      files[`${base}/dxf/${t}.dxf`] = strToU8(partDXF(R, p, last.titles[p.id]));
    }
    files[`${base}/cut-list.csv`] = strToU8(cutListCSV(last.rows, `Cut list: ${last.name}`));
    files[`${base}/design.json`] = strToU8(JSON.stringify({ format: "mid-century-furniture/1", type: last.type,
      name: last.name, units: "inches, degrees", params: last.params, joints: last.joints }, null, 2));
    files[`${base}/README.txt`] = strToU8([
      `${last.name}: parts for making`, "",
      "stl/  one STL per part, in millimetres, each at its own origin.",
      "dxf/  one DXF template per part, in millimetres. Layer OUTLINE is the cut line,",
      "      layer HIDDEN shows mortises and hidden edges, layer TEXT holds labels.",
      "      Legs have a front and a side view; use them as bandsaw or router templates.",
      "cut-list.csv  finished and rough sizes for every part.",
      "design.json   the design, which the app can open again.", "",
      ...last.notes.map(n => "Note: " + n),
      "These drawings are not engineering-checked; check sizes before cutting.",
    ].join("\n"));
    const zip = zipSync(files, { level: 6 });
    return { result: zip.buffer, transfer: [zip.buffer] };
  }
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
