import type { Player } from './types';

export const PIECES = 7;
export const START = 0;
export const OFF = 15;
export const CENTRAL_ROSETTE = 8;
export const ROSETTES: readonly number[] = [4, 8, 14];

export const isRosette = (pos: number) => ROSETTES.includes(pos);
export const isShared = (pos: number) => pos >= 5 && pos <= 12;

export type Row = 0 | 1 | 2;
export interface Cell { row: Row; col: number }

/** Player 0 owns the top row (0), player 1 the bottom row (2). */
export const homeRow = (p: Player): Row => (p === 0 ? 0 : 2);

/** Board cell for a route position, or null when waiting (0) or borne off (15). */
export function cellFor(player: Player, pos: number): Cell | null {
  if (pos < 1 || pos > 14) return null;
  if (pos <= 4) return { row: homeRow(player), col: 4 - pos };
  if (pos <= 12) return { row: 1, col: pos - 5 };
  return { row: homeRow(player), col: 20 - pos };
}

export type Motif = 'rosette' | 'eyes' | 'fiveDots' | 'twelveDots' | 'fourPanels';

/** Square motifs of the British Museum board; null = no square. */
export const BOARD: readonly (readonly (Motif | null)[])[] = [
  ['rosette', 'eyes', 'fiveDots', 'eyes', null, null, 'rosette', 'fourPanels'],
  ['twelveDots', 'fiveDots', 'eyes', 'rosette', 'twelveDots', 'fiveDots', 'eyes', 'twelveDots'],
  ['rosette', 'eyes', 'fiveDots', 'eyes', null, null, 'rosette', 'fourPanels'],
];
