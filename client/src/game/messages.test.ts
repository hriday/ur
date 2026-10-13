import { describe, expect, it } from 'vitest';
import { describeEvent, eventToast } from './messages';

const names: [string, string] = ['You', 'Computer · Hard'];

describe('messages', () => {
  it('explains passes, rosettes and captures with correct grammar', () => {
    expect(eventToast({ type: 'passed', player: 0, reason: 'zero' }, names)).toBe('You rolled 0 — turn passes');
    expect(eventToast({ type: 'passed', player: 1, reason: 'noMoves' }, names)).toBe('No legal move for Computer · Hard — turn passes');
    expect(eventToast({ type: 'rosette', player: 0, at: 4 }, names)).toBe('Rosette — you roll again');
    expect(eventToast({ type: 'rosette', player: 1, at: 8 }, names)).toBe('Central rosette — safe, and Computer · Hard rolls again');
    expect(eventToast({ type: 'captured', player: 1, victim: 0, piece: 2, at: 7 }, names)).toBe('Computer · Hard captured a piece!');
    expect(eventToast({ type: 'moved', player: 0, piece: 0, from: 0, to: 2 }, names)).toBeNull();
  });

  it('describes every event for screen readers', () => {
    expect(describeEvent({ type: 'rolled', player: 0, dice: [1, 1, 0, 0], roll: 2 }, names)).toBe('You rolled 2.');
    expect(describeEvent({ type: 'moved', player: 0, piece: 0, from: 0, to: 2 }, names)).toBe('You entered a piece onto square 2.');
    expect(describeEvent({ type: 'moved', player: 1, piece: 0, from: 3, to: 6 }, names)).toBe('Computer · Hard moved a piece from square 3 to square 6.');
    expect(describeEvent({ type: 'moved', player: 0, piece: 0, from: 13, to: 15 }, names)).toBe('You bore a piece off the board.');
    expect(describeEvent({ type: 'won', player: 0 }, names)).toBe('You win the game!');
    expect(describeEvent({ type: 'won', player: 1 }, names)).toBe('Computer · Hard wins the game!');
  });
});
