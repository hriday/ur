import { PIECES } from './board';
import type { GameEvent, GameState, Player } from './types';

export type ErrorCode =
  | 'notFound' | 'gameFull' | 'notSeated' | 'notYourTurn' | 'waitingForOpponent'
  | 'badPhase' | 'illegalMove' | 'badMessage' | 'rateLimited';

export interface RoomSnapshot {
  gameId: string;
  state: GameState;
  /** The receiving client's seat; null for spectators. */
  seat: Player | null;
  seated: [boolean, boolean];
  connected: [boolean, boolean];
  rematch: [boolean, boolean];
}

export type ClientMsg = { type: 'roll' } | { type: 'move'; piece: number } | { type: 'rematch' };

export type ServerMsg =
  | { type: 'snapshot'; snapshot: RoomSnapshot; events: GameEvent[] }
  | { type: 'error'; code: ErrorCode; message: string };

export function parseClientMsg(raw: string): ClientMsg | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  if (m.type === 'roll' || m.type === 'rematch') return { type: m.type };
  if (m.type === 'move' && Number.isInteger(m.piece) && (m.piece as number) >= 0 && (m.piece as number) < PIECES) {
    return { type: 'move', piece: m.piece as number };
  }
  return null;
}
