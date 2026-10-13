import { CENTRAL_ROSETTE, OFF, isShared } from './board';
import { ROLL_ODDS, diceForTotal } from './dice';
import type { Rng } from './rng';
import { RuleError, applyMove, applyRoll, legalMoves } from './rules';
import { other, type GameState, type Move, type Player } from './types';

export type AiLevel = 'easy' | 'medium' | 'hard';
export interface AiOptions { rng?: Rng; now?: () => number; budgetMs?: number; maxDepth?: number }

const WIN = 1000;

/** Probability that an opponent piece 1–4 squares behind `pos` can land on it next roll. */
function danger(pos: number, opponent: number[]): number {
  let p = 0;
  for (let d = 1; d <= 4; d++) if (opponent.includes(pos - d) && pos - d >= 1) p += ROLL_ODDS[d];
  return Math.min(p, 1);
}

function sideScore(state: GameState, p: Player): number {
  const opp = state.pieces[other(p)];
  let s = 0;
  for (const pos of state.pieces[p]) {
    if (pos === OFF) { s += 20; continue; }
    s += pos;
    if (pos === CENTRAL_ROSETTE) s += 4;
    else if (isShared(pos)) s -= danger(pos, opp) * (pos + 3);
  }
  return s;
}

/** Position value from `me`'s point of view; ±1000 for a finished game. */
export function evaluate(state: GameState, me: Player): number {
  if (state.winner !== null) return state.winner === me ? WIN : -WIN;
  return sideScore(state, me) - sideScore(state, other(me));
}

class Timeout extends Error {}

interface Search { me: Player; deadline: number; now: () => number }

function chanceValue(state: GameState, depth: number, ctx: Search): number {
  if (state.phase === 'finished' || depth === 0) return evaluate(state, ctx.me);
  if (ctx.now() > ctx.deadline) throw new Timeout();
  let v = 0;
  for (let r = 0; r <= 4; r++) {
    const next = applyRoll(state, diceForTotal(r)).state;
    v += ROLL_ODDS[r] * (next.phase === 'awaitingMove' ? decisionValue(next, depth, ctx) : chanceValue(next, depth - 1, ctx));
  }
  return v;
}

function decisionValue(state: GameState, depth: number, ctx: Search): number {
  const maximize = state.current === ctx.me;
  let best = maximize ? -Infinity : Infinity;
  for (const m of legalMoves(state)) {
    const v = chanceValue(applyMove(state, m.piece).state, depth - 1, ctx);
    best = maximize ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

function bestAtDepth(state: GameState, moves: Move[], depth: number, ctx: Search): number {
  let best = moves[0].piece;
  let bestValue = -Infinity;
  for (const m of moves) {
    const v = chanceValue(applyMove(state, m.piece).state, depth - 1, ctx);
    if (v > bestValue) { bestValue = v; best = m.piece; }
  }
  return best;
}

export function chooseMove(state: GameState, level: AiLevel, opts: AiOptions = {}): number {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new RuleError('illegalMove', 'No legal moves.');
  if (moves.length === 1) return moves[0].piece;
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? (() => Date.now());
  const unlimited: Search = { me: state.current, deadline: Infinity, now };

  if (level === 'easy') {
    if (rng() < 0.25) return moves[Math.floor(rng() * moves.length)].piece;
    return bestAtDepth(state, moves, 1, unlimited);
  }
  if (level === 'medium') return bestAtDepth(state, moves, 2, unlimited);

  const ctx: Search = { me: state.current, deadline: now() + (opts.budgetMs ?? 500), now };
  let best = bestAtDepth(state, moves, 2, unlimited);
  for (let depth = 3; depth <= (opts.maxDepth ?? 8); depth++) {
    try {
      best = bestAtDepth(state, moves, depth, ctx);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  return best;
}
