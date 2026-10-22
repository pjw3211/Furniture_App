// Stock layout: which boards to buy and where each part comes out of them.
// Parts are cut the way a woodworker would: rip the board into strips along
// its length, then cross-cut each strip into parts. Wide parts (the top, a
// solid shelf) are glued up from narrower strips.

export const MM = 25.4;
export const BOARDS = [
  { id: "6x8", name: "6 in wide × 8 ft long", w: 6 * MM, l: 96 * MM },
  { id: "8x8", name: "8 in wide × 8 ft long", w: 8 * MM, l: 96 * MM },
  { id: "10x10", name: "10 in wide × 10 ft long", w: 10 * MM, l: 120 * MM },
];
export const DEFAULT_BOARD = "8x8";
export const KERF = 3;   // saw cut, mm
export const TRIM = 25;  // cut off each board end (checks and snipe), mm
export const EDGE = 6;   // straightening the first edge of a rough board, mm

/** Cut list rows as single pieces to cut, wide parts split into glue-up strips. */
export function stockPieces(rows, board) {
  const usable = board.w - EDGE, out = [];
  rows.forEach((r, i) => {
    const key = String.fromCharCode(65 + i); // A, B, C… as in the cut list table
    for (let q = 0; q < r.qty; q++) {
      const w = r.rough.width, n = w > usable ? Math.ceil(w / (usable - 6)) : 1;
      for (let k = 0; k < n; k++) {
        // Each strip is a fair share of the finished width, plus its own allowance.
        const sw = n > 1 ? Math.ceil(r.finished.width / n) + 6 : w;
        out.push({ key, row: i, name: r.name, label: key + (r.qty > 1 ? q + 1 : "") + (n > 1 ? String.fromCharCode(97 + k) : ""),
          l: r.rough.length, w: sw, stock: r.rough.stock, t: r.rough.thickness, strip: n > 1 ? [k + 1, n] : null });
      }
    }
  });
  return out;
}

/**
 * Pack pieces into boards, one group per rough thickness.
 * @returns {Array<{ stock, t, boards: Array<{ lanes: Array<{ y, w, pieces: Array<{x, piece}> }> }>, long: piece[] }>}
 */
export function packBoards(pieces, board) {
  const byStock = new Map();
  for (const p of pieces) {
    if (!byStock.has(p.stock)) byStock.set(p.stock, []);
    byStock.get(p.stock).push(p);
  }
  const L = board.l - 2 * TRIM, W = board.w - EDGE;
  const groups = [];
  for (const [stock, list] of byStock) {
    const fits = list.filter(p => p.l <= L && p.w <= W), long = list.filter(p => !(p.l <= L && p.w <= W));
    fits.sort((a, b) => b.w - a.w || b.l - a.l);
    const boards = [];
    for (const p of fits) {
      let placed = false;
      for (const b of boards) {
        // An existing strip as wide as the piece with room left along it…
        for (const lane of b.lanes) if (p.w <= lane.w && lane.used + p.l <= L) {
          lane.pieces.push({ x: lane.used, piece: p }); lane.used += p.l + KERF; placed = true; break;
        }
        if (placed) break;
        // …or a new strip ripped from what is left of the board's width.
        const left = W - b.width;
        if (p.w <= left) {
          b.lanes.push({ y: b.width, w: p.w, used: p.l + KERF, pieces: [{ x: 0, piece: p }] });
          b.width += p.w + KERF; placed = true; break;
        }
      }
      if (!placed) boards.push({ width: p.w + KERF, lanes: [{ y: 0, w: p.w, used: p.l + KERF, pieces: [{ x: 0, piece: p }] }] });
    }
    groups.push({ stock, t: list[0].t, boards, long });
  }
  return groups.sort((a, b) => a.t - b.t);
}

/** Board feet of one board of this size and thickness (1 bd ft = 144 cubic in). */
export const boardFeet = (board, tMm) => (board.l / MM) * (board.w / MM) * (tMm / MM) / 144;

/** How much of the boards ends up in parts, 0 to 1. */
export function yieldOf(group, board) {
  const used = group.boards.flatMap(b => b.lanes.flatMap(l => l.pieces)).reduce((s, x) => s + x.piece.l * x.piece.w, 0);
  return group.boards.length ? used / (group.boards.length * board.l * board.w) : 0;
}
