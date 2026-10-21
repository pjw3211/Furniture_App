// The full default coffee table built from the "First" choices on the
// checklist, plus a sheet of every hardware item on its own.
import { box, prism, cyl, circle, stadium, poly, body, add, cut, common } from "./shapes.js";
import { COFFEE, SCREW, geom, CORNERS, apronId, legBody, apronFrame, P, movement } from "./base.js";
import { mtHaunched } from "./legApron.js";
import { buttonGroove, makeButton, gaps, topShape } from "./top.js";
import { DOMINO } from "./legApron.js";

// ---- full table: tapered legs, haunched M&T, buttons, glued-up bevel top ----
function defaultTable() {
  const g = geom(COFFEE), legs = CORNERS.map(c => legBody(g, c)), byId = Object.fromEntries(legs.map(l => [l.id, l]));
  const joint = mtHaunched(), gp = gaps(g), bodies = [...legs], joints = [], pilots = [];
  const aprons = [
    { id: "apron-front", which: "long", corners: CORNERS.filter(c => c.sy < 0) },
    { id: "apron-back", which: "long", corners: CORNERS.filter(c => c.sy > 0) },
    { id: "apron-right", which: "short", corners: CORNERS.filter(c => c.sx > 0) },
    { id: "apron-left", which: "short", corners: CORNERS.filter(c => c.sx < 0) },
  ];
  for (const a of aprons) {
    const half = a.which === "long" ? g.long_half : g.short_half;
    const A0 = apronFrame(g, a.corners[0], a.which);
    const steps = [add(box([-2 * half, -g.apron_t / 2, g.apron_top - g.apron_h], [0, g.apron_t / 2, g.apron_top], A0.F))];
    for (const c of a.corners) {
      const j = joint(g, c, a.which, apronFrame(g, c, a.which));
      steps.push(...j.apron);
      byId[`leg-${c.name}`].steps.push(...j.leg.map(cut));
      joints.push(...j.joints);
    }
    steps.push(cut(buttonGroove(g, A0, -2 * half + 25, -25)));
    const apron = body(a.id, a.which === "long" ? "Long apron" : "Short apron", "wood", steps);
    bodies.push(apron);
    // Long aprons: one fixed button in the middle, two floating; short: one sliding.
    const spots = a.which === "long" ? [[-half, 1], [-half + 300, gp.long], [-half - 300, gp.long]] : [[-half, gp.short]];
    spots.forEach(([ac, gap], i) => {
      const b = makeButton(g, A0, `${a.id.replace("apron-", "")}-${i + 1}`, ac, gap);
      bodies.push(b.button, b.screw); pilots.push(b.pilot);
      joints.push(...b.joints(a.id, "top-board-1").slice(0, 1));
    });
  }
  // Top: five boards glued edge to edge, each with the pilot holes it carries.
  const n = 5, W = g.table_w, bw = W / n, { shape } = topShape(g, "bevel"), boards = [];
  for (let i = 0; i < n; i++) {
    const y0 = -W / 2 + i * bw;
    boards.push(body(`top-board-${i + 1}`, `Top board ${i + 1}`, "wood",
      [add(shape), common(box([-g.table_l, y0, g.apron_top - 1], [g.table_l, y0 + bw, g.table_h + 1])), ...pilots.map(cut)]));
  }
  bodies.push(...boards);
  boards.slice(1).forEach((b, i) => joints.push({ type: "edge-glue", parts: [boards[i].id, b.id], contact: "touch" }));
  for (const a of aprons) for (const c of a.corners) joints.push({ type: "top-rests-on-apron", parts: [a.id, "top-board-1"], contact: "none" });
  return {
    id: "T1-default-table", section: "T1", title: "Default coffee table, ready to build", size: "coffee table",
    summary: "48 × 22 × 16 in. Square legs tapered on the inside faces, haunched and mitred mortise and tenons, wooden buttons (fixed at the middle of each long apron), and a bevelled top glued up from five boards.",
    params: [P("table_l", g.table_l, "Length"), P("table_w", g.table_w, "Width"), P("table_h", g.table_h, "Height"),
      P("movement", movement(g.table_w), "Top movement across its width (walnut, 4% swing)")],
    notes: ["Every joint uses the 'First' option from the checklist."],
    bodies, joints: joints.filter(j => j.type !== "top-rests-on-apron"),
  };
}

// ---- hardware sheet: each bought part on its own, in a row ------------------
function hardwareSheet() {
  const items = [];
  let x = 0;
  const next = w => { const at = x + w / 2; x += w + 15; return at; };
  const put = (id, name, steps, material = "steel") => items.push(body(id, name, "hardware", steps, { material }));
  let c = next(10);
  put("screw-8x1-1-4", "Wood screw #8 × 1¼ (4 × 30 mm)", [add(cyl([c, 0, 0], [c, 0, 32], SCREW.r)), add(cyl([c, 0, 32], [c, 0, 35], SCREW.head_r))]);
  c = next(10);
  put("screw-8x5-8", "Pan-head screw #8 × ⅝", [add(cyl([c, 0, 0], [c, 0, 16], SCREW.r)), add(cyl([c, 0, 16], [c, 0, 18.5], SCREW.head_r))]);
  for (const [size, D] of Object.entries(DOMINO)) {
    c = next(D.w);
    put(`domino-${size}`, `Domino ${size}`, [add(prism(stadium(c, 0, D.w, D.t), 0, D.l))], "beech");
  }
  for (const [d, l] of [[10, 40], [8, 30], [9.525, 38.1]]) {
    c = next(d);
    put(`dowel-${d}x${l}`, `Dowel ${d} × ${l}`, [add(cyl([c, 0, 0], [c, 0, l], d / 2))], "beech");
  }
  c = next(20);
  put("z-clip", "Z-clip (placeholder size)", [add(box([c - 10, -9.5, 0], [c - 2, 9.5, 1.6])), add(box([c - 3.6, -9.5, 0], [c - 2, 9.5, 9.6])),
    add(box([c - 3.6, -9.5, 8], [c + 12.4, 9.5, 9.6])), cut(cyl([c + 6.4, 0, 7], [c + 6.4, 0, 11], SCREW.clear))]);
  c = next(35);
  put("figure-8", "Figure-8 fastener (placeholder size)", [add(prism(circle(c - 8, 0, 9.5), 0, 3)), add(prism(circle(c + 8, 0, 8), 0, 3)),
    cut(cyl([c - 8, 0, 3.01], [c - 8, 0, 0.8], 4.2, 2.0)), cut(cyl([c - 8, 0, 0.9], [c - 8, 0, -1], SCREW.clear)),
    cut(cyl([c + 8, 0, -0.01], [c + 8, 0, 2.2], 4.2, 2.0)), cut(cyl([c + 8, 0, 2.1], [c + 8, 0, 4], SCREW.clear))]);
  c = next(60);
  put("corner-bracket", "Corner bracket (placeholder size)", [add(prism(poly([[c - 25, 0], [c + 25, 0], [c + 25, 2.5], [c - 25, 2.5]]), 0, 50)),
    add(box([c - 25, -8, 0], [c - 22.5, 0, 50])), add(box([c + 22.5, -8, 0], [c + 25, 0, 50])), cut(cyl([c, -1, 25], [c, 3.5, 25], 4.5))]);
  c = next(14);
  put("hanger-bolt-m8x75", "Hanger bolt M8 × 75", [add(cyl([c, 0, 0], [c, 0, 75], 4))]);
  c = next(14);
  put("nut-m8", "M8 nut", [add(cyl([c, 0, 0], [c, 0, 6.5], 6.5)), cut(cyl([c, 0, -1], [c, 0, 7.5], 4.05))]);
  for (const od of [10, 12]) {
    c = next(od);
    put(`insert-m8-${od}`, `Threaded insert M8, ${od} mm outside`, [add(cyl([c, 0, 0], [c, 0, od === 10 ? 13 : 18], od / 2)), cut(cyl([c, 0, -1], [c, 0, 20], 4.05))]);
  }
  c = next(22);
  put("glide-m8", "Levelling glide M8", [add(cyl([c, 0, 0], [c, 0, 5], 11)), add(cyl([c, 0, 5], [c, 0, 20], 4))]);
  c = next(25);
  put("ferrule", "Brass ferrule (placeholder size)", [add(cyl([c, 0, 0], [c, 0, 30], 12.2)), cut(cyl([c, 0, 1.5], [c, 0, 31], 10.8))], "brass");
  c = next(19);
  put("felt-pad", "Felt pad 19 mm", [add(cyl([c, 0, 0], [c, 0, 3], 9.5))], "felt");
  return {
    id: "H-hardware", section: "H", title: "Hardware sheet", size: "-",
    summary: "Every bought part used by the joint models, side by side. Items marked 'placeholder size' should be measured from the ones you buy.",
    params: [], notes: [], bodies: items, joints: [],
  };
}

export function assemblyModels() { return [defaultTable(), hardwareSheet()]; }
