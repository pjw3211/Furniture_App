// The cut list as a PDF: what you are making, every part with its finished
// and rough sizes, what to buy, and a drawing of the boards with each part
// marked where it is cut from. Landscape A4, drawn with jsPDF.
import { jsPDF } from "jspdf";
import { stockPieces, packBoards, boardFeet, yieldOf, KERF, TRIM, EDGE, MM } from "./layout.js";

/** Inches to the nearest 1/16, written like 21-1/4. */
export function fraction(mm) {
  const sixteenths = Math.round(mm / MM * 16), whole = Math.floor(sixteenths / 16);
  let n = sixteenths % 16, d = 16;
  while (n && n % 2 === 0) { n /= 2; d /= 2; }
  return n ? (whole ? `${whole}-${n}/${d}` : `${n}/${d}`) : `${whole}`;
}
const mm = v => `${Math.round(v)}`;
const size3 = (f, units) => units === "in"
  ? `${fraction(f.length)} × ${fraction(f.width)} × ${fraction(f.thickness)} in`
  : `${mm(f.length)} × ${mm(f.width)} × ${f.thickness.toFixed(1)} mm`;
const size2 = (r, units) => units === "in" ? `${fraction(r.length)} × ${fraction(r.width)} in` : `${mm(r.length)} × ${mm(r.width)} mm`;
const len = (v, units) => units === "in" ? `${fraction(v)} in` : `${mm(v)} mm`;

const INK = [40, 32, 26], SOFT = [120, 108, 96], LINE = [200, 190, 178];
const FILL = [[214, 170, 120], [176, 128, 86], [226, 196, 150], [190, 150, 104], [238, 214, 178], [160, 116, 80]];

/**
 * @param o.title     e.g. "Mid-century coffee table"
 * @param o.summary   [[label, value]] lines describing the design
 * @param o.rows      cut list rows (src/cad/exports.js cutList)
 * @param o.hardware  [{ name, qty }]
 * @param o.notes     strings
 * @param o.board     one of BOARDS
 * @param o.units     "in" or "mm"
 * @param o.image     optional PNG data URL of the table
 * @returns {ArrayBuffer}
 */
export function cutListPDF(o) {
  const units = o.units || "in";
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297, PH = 210, M = 14;
  let y = M;
  const text = (s, x, yy, { size = 9, bold = false, color = INK, align } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
    doc.text(String(s), x, yy, align ? { align } : undefined);
  };
  const footer = () => text(`${o.title} - cut list - page ${doc.getNumberOfPages()}`, PW - M, PH - 7, { size: 7, color: SOFT, align: "right" });

  // ---- page 1: the design and the parts --------------------------------
  text(o.title, M, y + 6, { size: 18, bold: true });
  text("Cut list", M, y + 13, { size: 11, color: SOFT });
  y += 22;
  const sumW = o.image ? 150 : PW - 2 * M;
  for (const [k, v] of o.summary) {
    text(k, M, y, { size: 8.5, color: SOFT });
    const lines = doc.splitTextToSize(String(v), sumW - 42);
    text(lines.join("\n"), M + 40, y, { size: 8.5 });
    y += 4.4 * lines.length;
  }
  if (o.image) {
    try { doc.addImage(o.image, "PNG", PW - M - 110, M, 110, 72); } catch (e) { /* the picture is optional */ }
  }
  y = Math.max(y + 6, o.image ? M + 78 : y + 6);

  // Parts table.
  const cols = [[M, "Key"], [M + 12, "Part"], [M + 62, "Qty"], [M + 74, "Finished size (L × W × T)"], [M + 146, "Rough size to cut (L × W)"],
    [M + 206, "Stock"], [M + 226, "Wood"]];
  const header = () => {
    doc.setFillColor(244, 238, 228); doc.rect(M, y - 4.5, PW - 2 * M, 7, "F");
    for (const [x, h] of cols) text(h, x + 1, y, { size: 8, bold: true });
    y += 7;
  };
  header();
  o.rows.forEach((r, i) => {
    if (y > PH - 20) { footer(); doc.addPage(); y = M + 6; header(); }
    const cells = [String.fromCharCode(65 + i), r.name, r.qty, size3(r.finished, units), size2(r.rough, units), r.rough.stock, r.material];
    cells.forEach((c, k) => text(c, cols[k][0] + 1, y, { size: 8.5, bold: k === 0 }));
    doc.setDrawColor(...LINE); doc.line(M, y + 2, PW - M, y + 2);
    y += 6.2;
  });
  y += 2;
  text(`Rough sizes add ${len(25, units)} to the length and ${len(6, units)} to the width for squaring up. Stock is the rough thickness to buy (4/4 = 1 in, 8/4 = 2 in).`,
    M, y, { size: 7.5, color: SOFT });
  y += 8;

  if (o.hardware?.length) {
    if (y > PH - 24) { footer(); doc.addPage(); y = M + 6; }
    text("To buy", M, y, { size: 11, bold: true }); y += 6;
    for (const h of o.hardware) {
      if (y > PH - 16) { footer(); doc.addPage(); y = M + 6; }
      text(`${h.qty} ×`, M + 1, y, { size: 8.5, bold: true }); text(h.name, M + 14, y, { size: 8.5 }); y += 5;
    }
    y += 3;
  }
  if (o.notes?.length) {
    if (y > PH - 24) { footer(); doc.addPage(); y = M + 6; }
    text("Notes", M, y, { size: 11, bold: true }); y += 6;
    for (const n of o.notes) {
      const lines = doc.splitTextToSize(n, PW - 2 * M - 4);
      if (y + 4.2 * lines.length > PH - 14) { footer(); doc.addPage(); y = M + 6; }
      text(lines.join("\n"), M + 1, y, { size: 8.5 }); y += 4.2 * lines.length + 1.5;
    }
  }
  footer();

  // ---- stock layout ----------------------------------------------------
  const board = o.board, groups = packBoards(stockPieces(o.rows, board), board);
  doc.addPage(); y = M + 6;
  text("Stock layout", M, y, { size: 16, bold: true }); y += 6;
  const total = groups.reduce((s, g) => s + g.boards.length * boardFeet(board, g.t), 0);
  text(`Boards ${board.name}. ${groups.map(g => `${g.boards.length} × ${g.stock}`).join(", ")}. About ${total.toFixed(1)} board feet in all.`, M, y, { size: 9 });
  y += 4.5;
  text(`Each board loses ${len(TRIM, units)} at both ends and ${len(EDGE, units)} along one edge for straightening; saw cuts are ${len(KERF, units)}. Letters match the cut list keys; a, b, c… are strips glued up into one wide part.`,
    M, y, { size: 7.5, color: SOFT });
  y += 8;
  const scale = (PW - 2 * M - 22) / board.l, bh = board.w * scale;
  for (const g of groups) {
    const need = 9 + g.boards.length * (bh + 9);
    if (y + Math.min(need, 9 + bh + 9) > PH - 14) { footer(); doc.addPage(); y = M + 6; }
    text(`${g.stock} stock (${g.t.toFixed(1)} mm thick rough): ${g.boards.length} board${g.boards.length > 1 ? "s" : ""}, ${Math.round(yieldOf(g, board) * 100)}% used`,
      M, y, { size: 10, bold: true });
    y += 5;
    g.boards.forEach((b, bi) => {
      if (y + bh + 6 > PH - 14) { footer(); doc.addPage(); y = M + 6; }
      const x0 = M + 22;
      text(`Board ${bi + 1}`, M, y + bh / 2 + 1.5, { size: 8, color: SOFT });
      doc.setFillColor(250, 246, 240); doc.setDrawColor(...SOFT); doc.rect(x0, y, board.l * scale, bh, "FD");
      for (const lane of b.lanes) for (const { x, piece } of lane.pieces) {
        const px = x0 + (TRIM + x) * scale, py = y + (EDGE + lane.y) * scale, pw = piece.l * scale, ph = piece.w * scale;
        doc.setFillColor(...FILL[piece.row % FILL.length]); doc.setDrawColor(...INK);
        doc.rect(px, py, pw, ph, "FD");
        const label = pw > 40 ? `${piece.label}  ${piece.name}${piece.strip ? ` strip ${piece.strip[0]}/${piece.strip[1]}` : ""}` : piece.label;
        if (ph > 2.6) text(label, px + 1.2, py + Math.min(ph / 2 + 1.2, ph - 0.6), { size: Math.min(7, ph * 1.8) });
      }
      y += bh + 6;
    });
    for (const p of g.long) {
      text(`${p.label} ${p.name} (${size2({ length: p.l, width: p.w }, units)}) is bigger than these boards: buy it as a separate longer or wider board.`, M, y, { size: 8, color: [160, 60, 40] });
      y += 5;
    }
    y += 3;
  }
  footer();
  return doc.output("arraybuffer");
}
