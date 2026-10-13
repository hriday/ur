import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRoll, mulberry32, type GameState } from '@ur/shared';
import type { Update } from './controller';
import { AiController } from './aiController';

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
