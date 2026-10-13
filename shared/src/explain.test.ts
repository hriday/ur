import { describe, expect, it } from 'vitest';
import { diceForTotal } from './dice';
import { whyCannotMove } from './explain';
import { newGame } from './rules';
import type { GameState } from './types';

const pad = (xs: number[]) => [...xs, ...Array(7 - xs.length).fill(0)];
const rolled = (p0: number[], p1: number[], n: number): GameState => ({
  ...newGame(0), pieces: [pad(p0), pad(p1)], phase: 'awaitingMove', roll: n, dice: diceForTotal(n),
});

describe('whyCannotMove', () => {
  it('returns null for a legal move, including any waiting piece', () => {
    expect(whyCannotMove(rolled([], [], 2), 4)).toBeNull();
  });
  it('explains each kind of illegal move', () => {
    expect(whyCannotMove(newGame(0), 0)).toBe('Roll the dice first.');
    expect(whyCannotMove(rolled([15], [], 2), 0)).toBe('That piece has already finished.');
    expect(whyCannotMove(rolled([13], [], 3), 0)).toBe('Bearing off needs an exact roll — this piece needs exactly 2.');
    expect(whyCannotMove(rolled([2, 4], [], 2), 0)).toBe('Your own piece is already on that square.');
    expect(whyCannotMove(rolled([6], [8], 2), 0)).toBe('Your rival is safe on the central rosette.');
  });
});
