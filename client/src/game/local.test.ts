import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@ur/shared';
import type { Update } from './controller';
import { LocalController } from './local';

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
