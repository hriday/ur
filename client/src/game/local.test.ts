import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legalMoves, mulberry32 } from '@ur/shared';
import type { Update } from './controller';
import { LocalController, parseSaved } from './local';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

function make() {
  const c = new LocalController('local', ['Gold', 'Carnelian'], [0, 1], mulberry32(5));
  const updates: Update[] = [];
  const errors: string[] = [];
  c.subscribe((u) => updates.push(u));
  c.onError((code) => errors.push(code));
  return { c, updates, errors };
}

describe('LocalController', () => {
  it('delivers the current snapshot on subscribe', () => {
    const { updates } = make();
    expect(updates).toHaveLength(1);
    expect(updates[0].events).toEqual([]);
    expect(updates[0].snapshot).toMatchObject({ mode: 'local', controls: [0, 1], seated: [true, true], spectator: false });
  });

  it('applies rolls and emits events', () => {
    const { c, updates } = make();
    c.roll();
    expect(updates[1].events[0].type).toBe('rolled');
    expect(updates[1].snapshot.state.turn).toBe(1);
  });

  it('reports rule errors instead of throwing', () => {
    const { c, errors } = make();
    c.move(0);
    expect(errors).toEqual(['badPhase']);
  });

  it('starts a rematch with the other player first', () => {
    const { c, updates } = make();
    const first = updates[0].snapshot.state.current;
    c.rematch();
    const s = updates.at(-1)!.snapshot.state;
    expect(s.turn).toBe(0);
    expect(s.current).toBe(1 - first);
  });
});

describe('LocalController errors', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports unexpected failures as an internal error instead of throwing', () => {
    let calls = 0;
    const rng = () => { if (calls++ > 0) throw new Error('boom'); return 0.3; };
    const c = new LocalController('local', ['Gold', 'Carnelian'], [0, 1], rng);
    const errors: string[] = [];
    c.onError((code) => errors.push(code));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => c.roll()).not.toThrow();
    expect(errors).toEqual(['internal']);
    expect(log).toHaveBeenCalled();
  });
});

describe('LocalController persistence', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('sessionStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  const make = (key = 'local', seed = 5) => new LocalController('local', ['Gold', 'Carnelian'], [0, 1], mulberry32(seed), key);
  const stateOf = (c: LocalController) => {
    let s: Update | null = null;
    c.subscribe((u) => (s = u))();
    return s!.snapshot.state;
  };

  it('restores the game in progress after a reload', () => {
    const a = make();
    for (let i = 0; i < 6; i++) {
      const s = stateOf(a);
      if (s.phase === 'awaitingRoll') a.roll();
      else a.move(legalMoves(s)[0].piece);
    }
    const before = stateOf(a);
    expect(before.turn).toBeGreaterThan(0);
    const b = make('local', 99);
    expect(stateOf(b)).toEqual(before);
  });

  it('keeps separate slots per mode and level', () => {
    const a = make('ai.easy');
    a.roll();
    expect(stateOf(make('ai.hard')).turn).toBe(0);
    expect(stateOf(make('ai.easy')).turn).toBe(1);
  });

  it('starts afresh after Play again', () => {
    const a = make();
    a.roll();
    a.rematch();
    expect(storage.keys()).toEqual([]);
    expect(stateOf(make()).turn).toBe(0);
  });

  it('ignores corrupt saved games', () => {
    storage.setItem('ur.game.local', '{"state":{"pieces":[[99],[]]},"firstPlayer":0}');
    expect(stateOf(make()).turn).toBe(0);
    expect(parseSaved('not json')).toBeNull();
    expect(parseSaved(null)).toBeNull();
  });

  it('does not persist without a storage key', () => {
    const c = new LocalController('local', ['Gold', 'Carnelian'], [0, 1], mulberry32(5));
    c.roll();
    expect(storage.keys()).toEqual([]);
  });
});
