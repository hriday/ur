import { describe, expect, it } from 'vitest';
import { newGame, type RoomSnapshot } from '@ur/shared';
import { toSnapshot } from './online';

const room = (seat: 0 | 1 | null): RoomSnapshot => ({
  gameId: 'ABC234', state: newGame(0), seat, seated: [true, true], connected: [true, false], rematch: [false, true],
});

describe('toSnapshot', () => {
  it('maps the creator’s view', () => {
    expect(toSnapshot(room(0))).toMatchObject({
      mode: 'online', gameId: 'ABC234', controls: [0], perspective: 0, names: ['You', 'Friend'],
      spectator: false, connected: [true, false], rematch: [false, true],
    });
  });
  it('puts the joiner at the bottom', () => {
    expect(toSnapshot(room(1))).toMatchObject({ controls: [1], perspective: 1, names: ['Friend', 'You'] });
  });
  it('makes spectators read-only', () => {
    expect(toSnapshot(room(null))).toMatchObject({ controls: [], perspective: 0, names: ['Gold', 'Carnelian'], spectator: true });
  });
});

import { afterEach, beforeEach, vi } from 'vitest';
import { OnlineController } from './online';

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) { FakeWS.instances.push(this); }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  drop() { this.readyState = 3; this.onclose?.(); }
  msg(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

describe('OnlineController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWS.instances = [];
    vi.stubGlobal('WebSocket', FakeWS);
    vi.stubGlobal('location', { protocol: 'http:', host: 'h' });
    vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' });
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const snapMsg = { type: 'snapshot', snapshot: room(0), events: [] };

  it('delivers snapshots and replays to late subscribers', () => {
    const c = new OnlineController('ABC234', 't');
    const early = vi.fn();
    c.subscribe(early);
    FakeWS.instances[0].open();
    FakeWS.instances[0].msg(snapMsg);
    expect(early).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    c.subscribe(late);
    expect(late).toHaveBeenCalledWith(expect.objectContaining({ events: [] }));
    expect(FakeWS.instances[0].url).toContain('token=t');
    c.dispose();
  });

  it('ignores malformed frames', () => {
    const c = new OnlineController('ABC234', null);
    const fn = vi.fn();
    c.subscribe(fn);
    FakeWS.instances[0].onmessage?.({ data: '{nope' });
    expect(fn).not.toHaveBeenCalled();
    c.dispose();
  });

  it('reconnects with backoff and resets on open', () => {
    const c = new OnlineController('ABC234', null);
    const st = vi.fn();
    c.onStatus(st);
    FakeWS.instances[0].open();
    FakeWS.instances[0].drop();
    expect(st).toHaveBeenLastCalledWith('reconnecting');
    vi.advanceTimersByTime(499);
    expect(FakeWS.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[1].drop();
    vi.advanceTimersByTime(999);
    expect(FakeWS.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWS.instances).toHaveLength(3);
    FakeWS.instances[2].open();
    expect(st).toHaveBeenLastCalledWith('open');
    FakeWS.instances[2].drop();
    vi.advanceTimersByTime(500);
    expect(FakeWS.instances).toHaveLength(4);
    c.dispose();
  });

  it('a stale socket’s late close does not cause a second connect', () => {
    const c = new OnlineController('ABC234', null);
    FakeWS.instances[0].drop();
    vi.advanceTimersByTime(500);
    expect(FakeWS.instances).toHaveLength(2);
    FakeWS.instances[0].onclose?.();
    vi.advanceTimersByTime(20_000);
    expect(FakeWS.instances).toHaveLength(2);
    c.dispose();
  });

  it('notFound stops reconnecting', () => {
    const c = new OnlineController('ABC234', null);
    const st = vi.fn();
    const err = vi.fn();
    c.onStatus(st);
    c.onError(err);
    FakeWS.instances[0].msg({ type: 'error', code: 'notFound', message: 'gone' });
    expect(st).toHaveBeenLastCalledWith('notFound');
    expect(err).toHaveBeenCalledWith('notFound', 'gone');
    FakeWS.instances[0].drop();
    vi.advanceTimersByTime(20_000);
    expect(FakeWS.instances).toHaveLength(1);
    c.dispose();
  });

  it('dispose cancels a pending reconnect', () => {
    const c = new OnlineController('ABC234', null);
    FakeWS.instances[0].drop();
    c.dispose();
    vi.advanceTimersByTime(20_000);
    expect(FakeWS.instances).toHaveLength(1);
  });

  it('send while not open emits an offline error', () => {
    const c = new OnlineController('ABC234', null);
    const err = vi.fn();
    c.onError(err);
    c.roll();
    expect(err).toHaveBeenCalledWith('offline', expect.any(String));
    FakeWS.instances[0].open();
    c.roll();
    expect(FakeWS.instances[0].sent).toEqual([JSON.stringify({ type: 'roll' })]);
    c.dispose();
  });
});
