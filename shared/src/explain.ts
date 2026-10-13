import { CENTRAL_ROSETTE, OFF, START } from './board';
import { legalMoves } from './rules';
import { other, type GameState } from './types';

/** Human-readable reason the current player cannot move `piece`, or null if they can. */
export function whyCannotMove(state: GameState, piece: number): string | null {
  if (state.phase === 'finished') return 'The game is over.';
  if (state.phase === 'awaitingRoll') return 'Roll the dice first.';
  const me = state.current;
  const from = state.pieces[me][piece];
  if (legalMoves(state).some((m) => m.piece === piece || (from === START && m.from === START))) return null;
  if (from === OFF) return 'That piece has already finished.';
  const to = from + (state.roll ?? 0);
  if (to > OFF) return `Bearing off needs an exact roll — this piece needs exactly ${OFF - from}.`;
  if (state.pieces[me].includes(to)) return 'Your own piece is already on that square.';
  if (to === CENTRAL_ROSETTE && state.pieces[other(me)].includes(to)) return 'Your rival is safe on the central rosette.';
  return 'That piece cannot move.';
}
