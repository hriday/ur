import { describe, expect, it } from 'vitest';
import { H, W, cellCenter, piecePoint, traySlot, trayRanks } from './geometry';

describe('client board geometry', () => {
  it('draws the perspective player’s home row at the bottom', () => {
    expect(piecePoint(0, 1, 0, 0).y).toBeGreaterThan(piecePoint(0, 5, 0, 0).y);
    expect(piecePoint(1, 1, 0, 0).y).toBeLessThan(piecePoint(0, 5, 0, 0).y);
    expect(piecePoint(1, 1, 0, 1).y).toBeGreaterThan(piecePoint(1, 5, 0, 1).y);
  });

  it('places on-board pieces at cell centres', () => {
    expect(piecePoint(0, 8, 0, 0)).toEqual(cellCenter(1, 3, 0));
  });

  it('puts your tray at the bottom, waiting pieces left and finished pieces right', () => {
    const w0 = traySlot(0, 'waiting', 0, 0);
    const w6 = traySlot(0, 'waiting', 6, 0);
    const o0 = traySlot(0, 'off', 0, 0);
    const o6 = traySlot(0, 'off', 6, 0);
    expect(w0.y).toBeGreaterThan(H / 2);
    expect(traySlot(1, 'waiting', 0, 0).y).toBeLessThan(H / 2);
    expect(w6.x).toBeGreaterThan(w0.x);
    expect(o6.x).toBeLessThan(o0.x);
    expect(w6.x).toBeLessThan(o6.x);
    for (const p of [w0, w6, o0, o6]) expect(p.x > 0 && p.x < W).toBe(true);
  });

  it('ranks pieces within the waiting and finished trays', () => {
    expect(trayRanks([0, 5, 0, 15, 0, 15, 3])).toEqual([0, 0, 1, 0, 2, 1, 0]);
  });
});
