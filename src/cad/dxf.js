// Minimal DXF (R12, ASCII) writer for replicad drawings. Lines and circular
// arcs are written exactly; any other curve (splines, ellipses) is fitted with
// arcs to within ARC_TOLERANCE, so the file has only LINE, ARC and CIRCLE
// entities, which every CAD and CNC program reads and cuts smoothly.

export const ARC_TOLERANCE = 0.02; // mm

function curvesOf(shape, out = []) {
  if (!shape) return out;
  if (Array.isArray(shape.curves)) out.push(...shape.curves);
  if (Array.isArray(shape.blueprints)) for (const b of shape.blueprints) curvesOf(b, out);
  return out;
}

export function drawingCurves(drawing) {
  if (!drawing || !drawing.innerShape) return [];
  return curvesOf(drawing.innerShape);
}

const near = (a, b, tol = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

function circleFrom3(p1, p2, p3) {
  const [ax, ay] = p1, [bx, by] = p2, [cx, cy] = p3;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { c: [ux, uy], r: Math.hypot(ax - ux, ay - uy) };
}
const ang = (c, p) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180 / Math.PI + 360) % 360;

/** Convert one curve into DXF entities: [{type:'LINE'|'ARC'|'CIRCLE', ...}] */
export function curveEntities(curve) {
  const p0 = curve.firstPoint, p1 = curve.lastPoint;
  const t0 = curve.firstParameter, t1 = curve.lastParameter;
  if (curve.geomType === "LINE") return [{ type: "LINE", a: p0, b: p1 }];
  if (curve.geomType === "CIRCLE") {
    if (near(p0, p1)) {
      const f = circleFrom3(curve.value(t0), curve.value(t0 + (t1 - t0) / 3), curve.value(t0 + 2 * (t1 - t0) / 3));
      if (f) return [{ type: "CIRCLE", c: f.c, r: f.r }];
    } else {
      const pm = curve.value((t0 + t1) / 2), f = circleFrom3(p0, pm, p1);
      if (f) {
        let s = ang(f.c, p0), e = ang(f.c, p1);
        const m = ang(f.c, pm), ccw = ((m - s + 360) % 360) < ((e - s + 360) % 360);
        if (!ccw) [s, e] = [e, s];
        return [{ type: "ARC", c: f.c, r: f.r, start: s, end: e }];
      }
    }
  }
  // Any other curve: start from 16 spans and fit each with an arc.
  const out = [], n = 16;
  for (let i = 0; i < n; i++) fitArcs(curve, t0 + (t1 - t0) * i / n, t0 + (t1 - t0) * (i + 1) / n, out, 0);
  return out;
}

// Fit the curve between parameters a and b with one arc (or line) through its
// end points and middle; split in two until every check point is within
// ARC_TOLERANCE of the arc.
function fitArcs(curve, a, b, out, depth) {
  const pa = curve.value(a), pb = curve.value(b), pm = curve.value((a + b) / 2);
  const checks = [0.125, 0.25, 0.375, 0.625, 0.75, 0.875].map(k => curve.value(a + (b - a) * k));
  const fit = circleFrom3(pa, pm, pb);
  const lineDev = p => {
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy) || 1;
    return Math.abs((p[0] - pa[0]) * dy - (p[1] - pa[1]) * dx) / L;
  };
  if (!fit || fit.r > 1e6 || [pm, ...checks].every(p => lineDev(p) < ARC_TOLERANCE / 4)) {
    if ([pm, ...checks].every(p => lineDev(p) < ARC_TOLERANCE) || depth > 12) { out.push({ type: "LINE", a: pa, b: pb }); return; }
  } else if (checks.every(p => Math.abs(Math.hypot(p[0] - fit.c[0], p[1] - fit.c[1]) - fit.r) < ARC_TOLERANCE) || depth > 12) {
    let s = ang(fit.c, pa), e = ang(fit.c, pb);
    const m = ang(fit.c, pm), ccw = ((m - s + 360) % 360) < ((e - s + 360) % 360);
    if (!ccw) [s, e] = [e, s];
    out.push({ type: "ARC", c: fit.c, r: fit.r, start: s, end: e });
    return;
  }
  fitArcs(curve, a, (a + b) / 2, out, depth + 1);
  fitArcs(curve, (a + b) / 2, b, out, depth + 1);
}

const f = v => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(4);

/**
 * layers: [{ name, drawing?, entities?, color }] → DXF text.
 * texts: [{ layer, at:[x,y], height, text }]
 */
export function writeDXF(layers, texts = []) {
  const L = [];
  const g = (code, val) => L.push(String(code), String(val));
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$INSUNITS"); g(70, 4); // millimetres
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  const names = new Map();
  for (const ly of [...layers, { name: "TEXT", color: 3 }]) if (!names.has(ly.name)) names.set(ly.name, ly);
  g(0, "TABLE"); g(2, "LAYER"); g(70, names.size);
  for (const ly of names.values()) {
    g(0, "LAYER"); g(2, ly.name); g(70, 0); g(62, ly.color || 7); g(6, "CONTINUOUS");
  }
  g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  for (const ly of layers) {
    const ents = ly.entities || drawingCurves(ly.drawing).flatMap(curveEntities);
    for (const e of ents) {
      if (e.type === "LINE") {
        g(0, "LINE"); g(8, ly.name);
        g(10, f(e.a[0])); g(20, f(e.a[1])); g(30, 0); g(11, f(e.b[0])); g(21, f(e.b[1])); g(31, 0);
      } else if (e.type === "ARC") {
        g(0, "ARC"); g(8, ly.name); g(10, f(e.c[0])); g(20, f(e.c[1])); g(30, 0); g(40, f(e.r));
        g(50, f(e.start)); g(51, f(e.end));
      } else if (e.type === "CIRCLE") {
        g(0, "CIRCLE"); g(8, ly.name); g(10, f(e.c[0])); g(20, f(e.c[1])); g(30, 0); g(40, f(e.r));
      }
    }
  }
  for (const t of texts) {
    g(0, "TEXT"); g(8, t.layer || "TEXT"); g(10, f(t.at[0])); g(20, f(t.at[1])); g(30, 0);
    g(40, f(t.height || 5)); g(1, t.text.replace(/[\r\n]/g, " "));
  }
  g(0, "ENDSEC"); g(0, "EOF");
  return L.join("\n") + "\n";
}

/** Parse the entities back out of a DXF written above (used by tests). */
export function readDXF(text) {
  const lines = text.split(/\r?\n/), ents = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    if (lines[i].trim() !== "0" || !["LINE", "ARC", "CIRCLE", "TEXT"].includes(lines[i + 1].trim())) continue;
    const e = { type: lines[i + 1].trim() };
    for (let j = i + 2; j < lines.length - 1 && lines[j].trim() !== "0"; j += 2) e[lines[j].trim()] = lines[j + 1].trim();
    ents.push(e);
  }
  return ents;
}
