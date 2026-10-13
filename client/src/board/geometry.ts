import { OFF, START, cellFor, type Player } from '@ur/shared';

export const S = 100;
export const G = 10;
export const PAD = 28;
export const TRAY = 118;
export const W = PAD * 2 + 8 * S + 7 * G;
export const H = TRAY * 2 + PAD * 2 + 3 * S + 2 * G;
export const PIECE_R = 34;
export const TRAY_R = 27;
export const TRAY_STEP = 62;

export interface Point { x: number; y: number }

/** Board outline: left block, bridge, right block. */
export const FRAME_BLOCKS = [
  { c0: 0, c1: 3, r0: 0, r1: 2 },
  { c0: 4, c1: 5, r0: 1, r1: 1 },
  { c0: 6, c1: 7, r0: 0, r1: 2 },
] as const;

export function blockRect(b: (typeof FRAME_BLOCKS)[number]) {
  return {
    x: PAD + b.c0 * (S + G) - G,
    y: TRAY + PAD + b.r0 * (S + G) - G,
    width: (b.c1 - b.c0 + 1) * (S + G) + G,
    height: (b.r1 - b.r0 + 1) * (S + G) + G,
  };
}

/** The perspective player's home row is drawn at the bottom. */
export const displayRow = (row: number, perspective: Player) => (perspective === 0 ? 2 - row : row);

export function cellOrigin(row: number, col: number, perspective: Player): Point {
  return { x: PAD + col * (S + G), y: TRAY + PAD + displayRow(row, perspective) * (S + G) };
}

export function cellCenter(row: number, col: number, perspective: Player): Point {
  const o = cellOrigin(row, col, perspective);
  return { x: o.x + S / 2, y: o.y + S / 2 };
}

export function traySlot(player: Player, kind: 'waiting' | 'off', index: number, perspective: Player): Point {
  const y = player === perspective ? H - TRAY / 2 : TRAY / 2;
  return kind === 'waiting'
    ? { x: PAD + TRAY_R + 8 + index * TRAY_STEP, y }
    : { x: W - PAD - TRAY_R - 8 - index * TRAY_STEP, y };
}

/** Where a piece at `pos` is drawn; `slot` is its rank within its tray (ignored on the board). */
export function piecePoint(player: Player, pos: number, slot: number, perspective: Player): Point {
  if (pos === START) return traySlot(player, 'waiting', slot, perspective);
  if (pos === OFF) return traySlot(player, 'off', slot, perspective);
  const c = cellFor(player, pos)!;
  return cellCenter(c.row, c.col, perspective);
}

/** For each piece, its rank among the same player's pieces in the same tray. */
export function trayRanks(positions: number[]): number[] {
  const counts: Record<number, number> = { [START]: 0, [OFF]: 0 };
  return positions.map((p) => (p === START || p === OFF ? counts[p]++ : 0));
}
