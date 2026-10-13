import { describe, expect, it } from 'vitest';
import { BOARD, cellFor, isRosette, isShared } from './board';

describe('board geometry', () => {
  it('maps player 0 along own row leftwards, the middle row rightwards, then back', () => {
    const cells = Array.from({ length: 14 }, (_, i) => cellFor(0, i + 1));
    expect(cells).toEqual([
      { row: 0, col: 3 }, { row: 0, col: 2 }, { row: 0, col: 1 }, { row: 0, col: 0 },
      { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
      { row: 1, col: 4 }, { row: 1, col: 5 }, { row: 1, col: 6 }, { row: 1, col: 7 },
      { row: 0, col: 7 }, { row: 0, col: 6 },
    ]);
  });

  it('mirrors player 1 on the bottom row and shares the middle row', () => {
    expect(cellFor(1, 1)).toEqual({ row: 2, col: 3 });
    expect(cellFor(1, 8)).toEqual(cellFor(0, 8));
    expect(cellFor(1, 14)).toEqual({ row: 2, col: 6 });
  });

  it('has no cell for waiting or borne-off pieces', () => {
    expect(cellFor(0, 0)).toBeNull();
    expect(cellFor(1, 15)).toBeNull();
  });

  it('puts every route square on a real square, with rosettes exactly where the art has them', () => {
    for (const p of [0, 1] as const) {
      for (let pos = 1; pos <= 14; pos++) {
        const c = cellFor(p, pos)!;
        const motif = BOARD[c.row][c.col];
        expect(motif).not.toBeNull();
        expect(motif === 'rosette').toBe(isRosette(pos));
      }
    }
  });

  it('has exactly 20 squares and 5 rosettes', () => {
    expect(BOARD.flat().filter(Boolean)).toHaveLength(20);
    expect(BOARD.flat().filter((m) => m === 'rosette')).toHaveLength(5);
  });

  it('treats 5..12 as the shared row', () => {
    expect([4, 5, 12, 13].map(isShared)).toEqual([false, true, true, false]);
  });
});
