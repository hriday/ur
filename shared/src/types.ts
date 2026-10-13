export type Player = 0 | 1;
export type Bit = 0 | 1;
export type Dice = [Bit, Bit, Bit, Bit];
export type Phase = 'awaitingRoll' | 'awaitingMove' | 'finished';

export interface GameState {
  /** pieces[player][i] = position: 0 waiting, 1..14 on the route, 15 borne off */
  pieces: [number[], number[]];
  current: Player;
  phase: Phase;
  dice: Dice | null;
  roll: number | null;
  winner: Player | null;
  /** Increments on every roll and move; used to order and dedupe updates. */
  turn: number;
}

export interface Move {
  piece: number;
  from: number;
  to: number;
  capture: boolean;
  rosette: boolean;
  bearOff: boolean;
}

export type PassReason = 'zero' | 'noMoves';

export type GameEvent =
  | { type: 'rolled'; player: Player; dice: Dice; roll: number }
  | { type: 'passed'; player: Player; reason: PassReason }
  | { type: 'moved'; player: Player; piece: number; from: number; to: number }
  | { type: 'captured'; player: Player; victim: Player; piece: number; at: number }
  | { type: 'rosette'; player: Player; at: number }
  | { type: 'borneOff'; player: Player; piece: number }
  | { type: 'won'; player: Player };

export const other = (p: Player): Player => (p === 0 ? 1 : 0);
