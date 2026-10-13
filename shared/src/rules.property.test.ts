import { describe, expect, it } from 'vitest';
import { CENTRAL_ROSETTE, OFF, isShared } from './board';
import { ROLL_ODDS, diceTotal, rollDice } from './dice';
import { mulberry32 } from './rng';
import { applyMove, applyRoll, legalMoves, newGame } from './rules';
import type { GameState } from './types';

function checkInvariants(s: GameState) {
  for (const side of s.pieces) {
    expect(side).toHaveLength(7);
    for (const pos of side) expect(pos >= 0 && pos <= OFF).toBe(true);
    const onBoard = side.filter((p) => p >= 1 && p <= 14);
    expect(new Set(onBoard).size).toBe(onBoard.length);
  }
  const shared0 = s.pieces[0].filter(isShared);
  for (const pos of s.pieces[1].filter(isShared)) expect(shared0).not.toContain(pos);
  if (s.phase === 'awaitingMove') expect(legalMoves(s).length).toBeGreaterThan(0);
  if (s.phase === 'finished') expect(s.pieces[s.winner!].every((p) => p === OFF)).toBe(true);
}

describe('random play', () => {
  it('keeps every invariant across 2000 complete games', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = mulberry32(seed);
      let s = newGame(seed % 2 === 0 ? 0 : 1);
      let steps = 0;
      while (s.phase !== 'finished') {
        if (s.phase === 'awaitingRoll') s = applyRoll(s, rollDice(rng)).state;
        else {
          const moves = legalMoves(s);
          const t = applyMove(s, moves[Math.floor(rng() * moves.length)].piece);
          // The central rosette is a safe square: nothing is ever captured there.
          for (const e of t.events) if (e.type === 'captured') expect(e.at).not.toBe(CENTRAL_ROSETTE);
          expect(moves.some((m) => m.capture && m.to === CENTRAL_ROSETTE)).toBe(false);
          s = t.state;
        }
        checkInvariants(s);
        expect(++steps).toBeLessThan(5000);
      }
    }
  }, 120_000);

  it('rolls with the 1/4/6/4/1 distribution', () => {
    const rng = mulberry32(42);
    const counts = [0, 0, 0, 0, 0];
    const n = 160_000;
    for (let i = 0; i < n; i++) counts[diceTotal(rollDice(rng))]++;
    counts.forEach((c, total) => expect(Math.abs(c / n - ROLL_ODDS[total])).toBeLessThan(0.01));
  });
});
