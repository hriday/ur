import type { Rng } from './rng';
import type { Dice } from './types';

/** Probability of each total 0..4 with four binary tetrahedral dice. */
export const ROLL_ODDS: readonly number[] = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

export function rollDice(rng: Rng): Dice {
  return [0, 1, 2, 3].map(() => (rng() < 0.5 ? 1 : 0)) as Dice;
}

export const diceTotal = (d: Dice) => d[0] + d[1] + d[2] + d[3];

export function diceForTotal(total: number): Dice {
  return [0, 1, 2, 3].map((i) => (i < total ? 1 : 0)) as Dice;
}
