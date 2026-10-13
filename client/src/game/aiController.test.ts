import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRoll, legalMoves, mulberry32, type GameState } from '@ur/shared';
import type { Update } from './controller';
import { AiController, type AiRequest } from './aiController';

class FailingWorker {
  onmessage: unknown = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: unknown = null;
  postMessage() { queueMicrotask(() => this.onerror?.(new Event('error'))); }
  terminate() {}
}
class SilentWorker extends FailingWorker { override postMessage() {} }
class ThrowingWorker { constructor() { throw new Error('no workers'); } }

/** Gets an AiController to the point where it is the AI's turn to choose a move. */
function toAiMove() {
  const c = new AiController('hard');
  const updates: Update[] = [];
  c.subscribe((u) => updates.push(u));
  // Drive the private state directly: AI seat to move with a roll applied.
  const priv = c as unknown as { state: GameState };
  for (let seed = 1; seed < 50; seed++) {
    const rng = mulberry32(seed);
    let st: GameState = { ...priv.state, current: 1, phase: 'awaitingRoll' };
    st = applyRoll(st, [1, 1, 0, 0]).state;
    if (st.phase === 'awaitingMove') { priv.state = st; break; }
    void rng;
  }
  return { c, priv };
}

describe('AiController worker failures', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  for (const [name, W, advance] of [
    ['worker error event', FailingWorker, 1000],
    ['worker never answers (watchdog)', SilentWorker, 5000],
    ['worker cannot be constructed', ThrowingWorker, 1000],
  ] as const) {
    it(`still moves: ${name}`, async () => {
      vi.useFakeTimers();
      vi.stubGlobal('Worker', W);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { c, priv } = toAiMove();
      expect(priv.state.phase).toBe('awaitingMove');
      const turn = priv.state.turn;
      c.idle();
      await vi.advanceTimersByTimeAsync(advance + 1000);
      expect(priv.state.turn).toBeGreaterThan(turn);
      c.dispose();
    });
  }
});

/** A worker the test answers by hand, as late as it likes. */
class ManualWorker {
  static last: ManualWorker;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: unknown = null;
  onmessageerror: unknown = null;
  requests: AiRequest[] = [];
  constructor() { ManualWorker.last = this; }
  postMessage(r: AiRequest) { this.requests.push(r); }
  reply(id: number, piece: number) { this.onmessage?.({ data: { id, piece } }); }
  terminate() {}
}

/** A position where the AI (seat 1) must choose between at least two moves. */
function choicePosition(base: GameState): GameState {
  const s: GameState = {
    ...base,
    pieces: [[0, 0, 0, 0, 0, 0, 0], [3, 6, 0, 0, 0, 0, 0]],
    current: 1,
    phase: 'awaitingMove',
    roll: 2,
    dice: [1, 1, 0, 0],
  };
  expect(legalMoves(s).length).toBeGreaterThan(1);
  return s;
}

describe('AiController worker replies', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('ignores a late reply to an earlier request and still answers the current one', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', ManualWorker);
    const c = new AiController('hard');
    const priv = c as unknown as { state: GameState };
    priv.state = choicePosition(priv.state);
    c.idle();
    const w = ManualWorker.last;
    const first = w.requests[0];
    // The worker is too slow: the watchdog plays a fallback move.
    await vi.advanceTimersByTimeAsync(5000);
    expect(priv.state.turn).toBe(first.state.turn + 1);

    // A new AI decision is pending when the stale answer finally arrives.
    priv.state = { ...choicePosition(priv.state), turn: priv.state.turn + 1 };
    const turn = priv.state.turn;
    c.idle();
    const second = w.requests[1];
    expect(second.id).not.toBe(first.id);
    w.reply(first.id, 99); // stale, and not even a legal piece
    await vi.advanceTimersByTimeAsync(1000);
    expect(priv.state.turn).toBe(turn); // still waiting for the real answer
    const piece = legalMoves(priv.state)[1].piece;
    w.reply(second.id, piece);
    await vi.advanceTimersByTimeAsync(1000);
    expect(priv.state.turn).toBe(turn + 1);
    expect(priv.state.pieces[1][piece]).not.toBe(second.state.pieces[1][piece]);
    c.dispose();
  });

  it('falls back to a legal move if the chosen piece cannot move', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', ManualWorker);
    const c = new AiController('medium');
    const errors: string[] = [];
    c.onError((code) => errors.push(code));
    const priv = c as unknown as { state: GameState };
    priv.state = choicePosition(priv.state);
    const turn = priv.state.turn;
    c.idle();
    const w = ManualWorker.last;
    w.reply(w.requests[0].id, 99); // no such piece
    await vi.advanceTimersByTimeAsync(1000);
    expect(priv.state.turn).toBe(turn + 1);
    expect(errors).toEqual([]);
    c.dispose();
  });
});
