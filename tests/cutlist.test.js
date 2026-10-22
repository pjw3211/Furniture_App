// The board layout behind the cut list PDF.
import { describe, it, expect } from "vitest";
import { stockPieces, packBoards, boardFeet, BOARDS, TRIM, EDGE, KERF } from "../src/cutlist/layout.js";
import { fraction } from "../src/cutlist/pdf.js";

const row = (name, qty, l, w, t, stock) => ({ name, qty, material: "walnut",
  finished: { length: l - 25, width: w - 6, thickness: t - 3 }, rough: { length: l, width: w, thickness: t, stock } });
const board = BOARDS.find(b => b.id === "8x8");

describe("stock layout", () => {
  it("splits a top wider than the boards into glue-up strips", () => {
    const pieces = stockPieces([row("Top", 1, 1244, 565, 31.8, "5/4")], board);
    expect(pieces).toHaveLength(3);
    expect(pieces.map(p => p.label)).toEqual(["Aa", "Ab", "Ac"]);
    for (const p of pieces) expect(p.w).toBeLessThanOrEqual(board.w - EDGE);
    expect(pieces.reduce((s, p) => s + p.w, 0)).toBeGreaterThanOrEqual(559);
  });

  it("packs pieces end to end along strips, and never past a board's edges", () => {
    const rows = [row("Leg", 4, 406, 51, 50.8, "8/4"), row("Long apron", 2, 1000, 82, 25.4, "4/4"), row("Short apron", 2, 420, 82, 25.4, "4/4")];
    const groups = packBoards(stockPieces(rows, board), board);
    expect(groups.map(g => g.stock)).toEqual(["4/4", "8/4"]);
    const legs = groups[1];
    expect(legs.boards).toHaveLength(1); // four 16 in legs fit on one 8 ft board
    for (const g of groups) for (const b of g.boards) for (const lane of b.lanes) {
      expect(lane.y + lane.w).toBeLessThanOrEqual(board.w - EDGE + 0.01);
      for (const { x, piece } of lane.pieces) {
        expect(piece.w).toBeLessThanOrEqual(lane.w);
        expect(x + piece.l).toBeLessThanOrEqual(board.l - 2 * TRIM + 0.01);
      }
      // Pieces along a strip don't overlap and leave room for the saw.
      const xs = lane.pieces.map(p => [p.x, p.x + p.piece.l]).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < xs.length; i++) expect(xs[i][0]).toBeGreaterThanOrEqual(xs[i - 1][1] + KERF - 0.01);
    }
    const all = groups.flatMap(g => g.boards.flatMap(b => b.lanes.flatMap(l => l.pieces)));
    expect(all).toHaveLength(8);
  });

  it("lists parts too long for the boards separately", () => {
    const groups = packBoards(stockPieces([row("Top", 1, 2600, 150, 31.8, "5/4")], board), board);
    expect(groups[0].long).toHaveLength(1);
    expect(groups[0].boards).toHaveLength(0);
  });

  it("board feet and fractions", () => {
    expect(boardFeet(board, 25.4)).toBeCloseTo(5.33, 2); // 8 in × 8 ft × 1 in
    expect(fraction(25.4 * 21.25)).toBe("21-1/4");
    expect(fraction(25.4 * 48)).toBe("48");
    expect(fraction(25.4 * 0.75)).toBe("3/4");
  });
});
