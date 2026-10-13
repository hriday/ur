import { CENTRAL_ROSETTE, OFF, PIECES, START, isRosette, isShared } from './board';
import { diceTotal } from './dice';
import { other, type Dice, type GameEvent, type GameState, type Move, type Player } from './types';

export class RuleError extends Error {
  constructor(readonly code: 'badPhase' | 'illegalMove', message: string) {
    super(message);
  }
}

export interface Transition { state: GameState; events: GameEvent[] }

export function newGame(starting: Player): GameState {
  return {
    pieces: [Array(PIECES).fill(START), Array(PIECES).fill(START)],
    current: starting,
    phase: 'awaitingRoll',
    dice: null,
    roll: null,
    winner: null,
    turn: 0,
  };
}

export function legalMoves(state: GameState): Move[] {
  if (state.phase !== 'awaitingMove' || !state.roll) return [];
  const roll = state.roll;
  const mine = state.pieces[state.current];
  const theirs = state.pieces[other(state.current)];
  const moves: Move[] = [];
  let enteringOffered = false;
  mine.forEach((from, piece) => {
    if (from === OFF) return;
    if (from === START) {
      if (enteringOffered) return;
      enteringOffered = true;
    }
    const to = from + roll;
    if (to > OFF) return;
    if (to !== OFF && mine.includes(to)) return;
    const capture = isShared(to) && theirs.includes(to);
    if (capture && to === CENTRAL_ROSETTE) return;
    moves.push({ piece, from, to, capture, rosette: isRosette(to), bearOff: to === OFF });
  });
  return moves;
}

export function applyRoll(state: GameState, dice: Dice): Transition {
  if (state.phase !== 'awaitingRoll') throw new RuleError('badPhase', 'It is not time to roll.');
  const player = state.current;
  const roll = diceTotal(dice);
  const events: GameEvent[] = [{ type: 'rolled', player, dice, roll }];
  let next: GameState = { ...state, dice, roll, phase: 'awaitingMove', turn: state.turn + 1 };
  if (roll === 0 || legalMoves(next).length === 0) {
    events.push({ type: 'passed', player, reason: roll === 0 ? 'zero' : 'noMoves' });
    next = { ...next, phase: 'awaitingRoll', current: other(player) };
  }
  return { state: next, events };
}

export function applyMove(state: GameState, piece: number): Transition {
  if (state.phase !== 'awaitingMove') throw new RuleError('badPhase', 'It is not time to move.');
  const me = state.current;
  const them = other(me);
  const tappedFrom = state.pieces[me][piece];
  const found = legalMoves(state).find(
    (m) => m.piece === piece || (tappedFrom === START && m.from === START),
  );
  if (!found) throw new RuleError('illegalMove', 'That piece cannot move.');
  const move = { ...found, piece };

  const pieces: [number[], number[]] = [[...state.pieces[0]], [...state.pieces[1]]];
  pieces[me][piece] = move.to;
  const events: GameEvent[] = [{ type: 'moved', player: me, piece, from: move.from, to: move.to }];

  if (move.capture) {
    const victim = pieces[them].indexOf(move.to);
    pieces[them][victim] = START;
    events.push({ type: 'captured', player: me, victim: them, piece: victim, at: move.to });
  }
  if (move.bearOff) events.push({ type: 'borneOff', player: me, piece });

  if (pieces[me].every((p) => p === OFF)) {
    events.push({ type: 'won', player: me });
    return { state: { ...state, pieces, phase: 'finished', winner: me, turn: state.turn + 1 }, events };
  }
  if (move.rosette) events.push({ type: 'rosette', player: me, at: move.to });
  return {
    state: { ...state, pieces, phase: 'awaitingRoll', current: move.rosette ? me : them, turn: state.turn + 1 },
    events,
  };
}
