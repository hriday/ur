import { describe, expect, it } from 'vitest';
import { ROLL_ODDS, diceForTotal, diceTotal, rollDice } from './dice';
import { RuleError, applyMove, applyRoll, legalMoves, newGame } from './rules';
import type { GameState } from './types';

const pad = (xs: number[]) => [...xs, ...Array(7 - xs.length).fill(0)];
const at = (p0: number[], p1: number[] = [], extra: Partial<GameState> = {}): GameState => ({
  ...newGame(0),
  pieces: [pad(p0), pad(p1)],
  ...extra,
});
const rolled = (s: GameState, n: number): GameState => ({ ...s, phase: 'awaitingMove', roll: n, dice: diceForTotal(n) });
const seq = (...xs: number[]) => () => xs.shift()!;

describe('dice', () => {
  it('counts marked tips facing up', () => {
    expect(rollDice(seq(0.1, 0.9, 0.2, 0.7))).toEqual([1, 0, 1, 0]);
    expect(diceTotal([1, 1, 0, 1])).toBe(3);
  });
  it('has the 1/4/6/4/1 distribution', () => {
    expect(ROLL_ODDS.map((p) => p * 16)).toEqual([1, 4, 6, 4, 1]);
  });
  it('builds dice for a total', () => {
    expect(diceTotal(diceForTotal(3))).toBe(3);
  });
});

describe('newGame', () => {
  it('starts with all 7 pieces waiting and the starter to roll', () => {
    const g = newGame(1);
    expect(g.pieces).toEqual([Array(7).fill(0), Array(7).fill(0)]);
    expect(g).toMatchObject({ current: 1, phase: 'awaitingRoll', winner: null, turn: 0 });
  });
});

describe('legalMoves', () => {
  it('offers a single entering move when all pieces wait', () => {
    expect(legalMoves(rolled(newGame(0), 3))).toEqual([
      { piece: 0, from: 0, to: 3, capture: false, rosette: false, bearOff: false },
    ]);
  });
  it('forbids landing on your own piece', () => {
    const moves = legalMoves(rolled(at([2, 4]), 2));
    // pieces [2, 4, 0…], roll 2: 2→4 blocked by own piece, entering →2 blocked by own piece, 4→6 legal
    expect(moves.map((m) => m.piece)).toEqual([1]);
  });
  it('captures an opponent in the shared row', () => {
    const [m] = legalMoves(rolled(at([6, 15, 15, 15, 15, 15, 15], [9]), 3));
    expect(m).toMatchObject({ piece: 0, to: 9, capture: true });
  });
  it('does not treat private squares as shared', () => {
    const [m] = legalMoves(rolled(at([], [3]), 3));
    expect(m).toMatchObject({ to: 3, capture: false });
  });
  it('protects a piece on the central rosette', () => {
    const moves = legalMoves(rolled(at([6, 15, 15, 15, 15, 15, 15], [8]), 2));
    expect(moves).toEqual([]);
  });
  it('requires an exact roll to bear off', () => {
    const s = at([13, 15, 15, 15, 15, 15, 15]);
    expect(legalMoves(rolled(s, 2))).toEqual([{ piece: 0, from: 13, to: 15, capture: false, rosette: false, bearOff: true }]);
    expect(legalMoves(rolled(s, 3))).toEqual([]);
  });
  it('never moves borne-off pieces and returns nothing outside awaitingMove', () => {
    expect(legalMoves(rolled(at(Array(7).fill(15)), 1))).toEqual([]);
    expect(legalMoves(newGame(0))).toEqual([]);
  });
});

describe('applyRoll', () => {
  it('moves to awaitingMove when a move exists', () => {
    const { state, events } = applyRoll(newGame(0), diceForTotal(2));
    expect(state).toMatchObject({ phase: 'awaitingMove', roll: 2, current: 0, turn: 1 });
    expect(events).toEqual([{ type: 'rolled', player: 0, dice: diceForTotal(2), roll: 2 }]);
  });
  it('passes the turn on a roll of 0', () => {
    const { state, events } = applyRoll(newGame(0), diceForTotal(0));
    expect(state).toMatchObject({ phase: 'awaitingRoll', current: 1, roll: 0 });
    expect(events[1]).toEqual({ type: 'passed', player: 0, reason: 'zero' });
  });
  it('passes the turn when no legal move exists', () => {
    const { state, events } = applyRoll(at([14, 15, 15, 15, 15, 15, 15]), diceForTotal(3));
    expect(state).toMatchObject({ phase: 'awaitingRoll', current: 1 });
    expect(events[1]).toEqual({ type: 'passed', player: 0, reason: 'noMoves' });
  });
  it('rejects rolling twice', () => {
    const { state } = applyRoll(newGame(0), diceForTotal(2));
    expect(() => applyRoll(state, diceForTotal(1))).toThrowError(RuleError);
  });
});

describe('applyMove', () => {
  it('moves a piece and passes the turn', () => {
    const { state, events } = applyMove(rolled(newGame(0), 2), 0);
    expect(state.pieces[0][0]).toBe(2);
    expect(state).toMatchObject({ current: 1, phase: 'awaitingRoll', turn: 1 });
    expect(events).toEqual([{ type: 'moved', player: 0, piece: 0, from: 0, to: 2 }]);
  });
  it('lets any waiting piece be the one that enters', () => {
    const { state } = applyMove(rolled(newGame(0), 2), 5);
    expect(state.pieces[0][5]).toBe(2);
    expect(state.pieces[0][0]).toBe(0);
  });
  it('grants another roll on a rosette', () => {
    const { state, events } = applyMove(rolled(newGame(0), 4), 0);
    expect(state.current).toBe(0);
    expect(events).toContainEqual({ type: 'rosette', player: 0, at: 4 });
  });
  it('grants another roll on the central rosette (8) and the last rosette (14)', () => {
    for (const [from, roll, to] of [[6, 2, 8], [12, 2, 14], [10, 4, 14]] as const) {
      const { state, events } = applyMove(rolled(at([from]), roll), 0);
      expect(state.pieces[0][0]).toBe(to);
      expect(state).toMatchObject({ current: 0, phase: 'awaitingRoll' });
      expect(events).toContainEqual({ type: 'rosette', player: 0, at: to });
    }
  });
  it('grants no extra roll when bearing off from the rosette on 14', () => {
    const { state, events } = applyMove(rolled(at([14, 3]), 1), 0);
    expect(state.pieces[0][0]).toBe(15);
    expect(state).toMatchObject({ current: 1, phase: 'awaitingRoll' });
    expect(events.map((e) => e.type)).toEqual(['moved', 'borneOff']);
  });
  it('sends a captured piece home', () => {
    const { state, events } = applyMove(rolled(at([6], [5, 9]), 3), 0);
    expect(state.pieces[1]).toEqual([5, 0, 0, 0, 0, 0, 0]);
    expect(events).toContainEqual({ type: 'captured', player: 0, victim: 1, piece: 1, at: 9 });
  });
  it('reports bearing off and detects the win', () => {
    const { state, events } = applyMove(rolled(at([14, 15, 15, 15, 15, 15, 15]), 1), 0);
    expect(state).toMatchObject({ phase: 'finished', winner: 0 });
    expect(events).toEqual([
      { type: 'moved', player: 0, piece: 0, from: 14, to: 15 },
      { type: 'borneOff', player: 0, piece: 0 },
      { type: 'won', player: 0 },
    ]);
  });
  it('rejects illegal moves and moves outside awaitingMove', () => {
    expect(() => applyMove(rolled(at([13, 15, 15, 15, 15, 15, 15]), 3), 0)).toThrowError(/cannot move/);
    expect(() => applyMove(newGame(0), 0)).toThrowError(RuleError);
  });
});
