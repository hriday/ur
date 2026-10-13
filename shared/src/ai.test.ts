import { describe, expect, it } from 'vitest';
import { chooseMove, evaluate, type AiLevel, type AiOptions } from './ai';
import { diceForTotal, rollDice } from './dice';
import { mulberry32 } from './rng';
import { applyMove, applyRoll, legalMoves, newGame } from './rules';
import type { GameState, Player } from './types';

const pad = (xs: number[]) => [...xs, ...Array(7 - xs.length).fill(0)];
const rolled = (p0: number[], p1: number[], n: number): GameState => ({
  ...newGame(0), pieces: [pad(p0), pad(p1)], phase: 'awaitingMove', roll: n, dice: diceForTotal(n),
});

function randomPositions(count: number, seed: number): GameState[] {
  const rng = mulberry32(seed);
  const out: GameState[] = [];
  while (out.length < count) {
    let s = newGame(0);
    const stop = Math.floor(rng() * 120);
    for (let i = 0; i < stop && s.phase !== 'finished'; i++) {
      if (s.phase === 'awaitingRoll') s = applyRoll(s, rollDice(rng)).state;
      else s = applyMove(s, legalMoves(s)[0].piece).state;
    }
    if (s.phase === 'awaitingMove') out.push(s);
  }
  return out;
}

function playMatch(a: AiLevel, b: AiLevel, seed: number, opts: AiOptions = {}): Player {
  const rng = mulberry32(seed);
  let s = newGame(seed % 2 === 0 ? 0 : 1);
  while (s.phase !== 'finished') {
    if (s.phase === 'awaitingRoll') s = applyRoll(s, rollDice(rng)).state;
    else s = applyMove(s, chooseMove(s, s.current === 0 ? a : b, { ...opts, rng })).state;
  }
  return s.winner!;
}

describe('evaluate', () => {
  it('is zero-sum and rewards progress', () => {
    const s = rolled([5], [1], 1);
    expect(evaluate(s, 0)).toBeCloseTo(-evaluate(s, 1));
    expect(evaluate(s, 0)).toBeGreaterThan(0);
  });
  it('scores a won game decisively', () => {
    const s: GameState = { ...newGame(0), pieces: [Array(7).fill(15), pad([])], phase: 'finished', winner: 0 };
    expect(evaluate(s, 0)).toBe(1000);
  });
});

describe('chooseMove', () => {
  it('always returns a legal move at every level', () => {
    for (const s of randomPositions(150, 7)) {
      for (const level of ['easy', 'medium', 'hard'] as const) {
        const piece = chooseMove(s, level, { rng: mulberry32(1), budgetMs: 5 });
        expect(() => applyMove(s, piece)).not.toThrow();
      }
    }
  });

  it('takes an obvious capture at medium and hard', () => {
    const s = rolled([6], [9], 3);
    expect(chooseMove(s, 'medium')).toBe(0);
    expect(chooseMove(s, 'hard', { budgetMs: 50 })).toBe(0);
  });

  it('stops searching when the time budget runs out', () => {
    let t = 0;
    const piece = chooseMove(randomPositions(1, 3)[0], 'hard', { now: () => (t += 1), budgetMs: 40 });
    expect(Number.isInteger(piece)).toBe(true);
    expect(t).toBeLessThan(400);
  });

  it('medium beats easy most of the time', () => {
    let wins = 0;
    for (let seed = 1; seed <= 400; seed++) if (playMatch('medium', 'easy', seed) === 0) wins++;
    expect(wins / 400).toBeGreaterThan(0.55);
  });

  it('hard beats easy most of the time', () => {
    let wins = 0;
    for (let seed = 1; seed <= 150; seed++) if (playMatch('hard', 'easy', seed, { maxDepth: 3, budgetMs: 1e9 }) === 0) wins++;
    expect(wins / 150).toBeGreaterThan(0.55);
  }, 180_000);
});
