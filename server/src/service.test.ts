import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { mulberry32, newGame, type GameState } from '@ur/shared';
import { openRepo, type Repo } from './repo';
import { IDLE_LIMIT_MS, createGameService, type GameService } from './service';

let counter = 0;
const randomBytes = (n: number) => Buffer.from(Array.from({ length: n }, () => (counter = (counter * 31 + 17) % 256)));

function setup(file = ':memory:', clock = { t: 1_000_000 }) {
  const repo = openRepo(file);
  const service = createGameService({ repo, rng: mulberry32(9), randomBytes, now: () => clock.t });
  return { repo, service, clock };
}

describe('game service', () => {
  let repo: Repo;
  let service: GameService;
  beforeEach(() => ({ repo, service } = setup()));

  function started() {
    const { gameId, seatToken: a } = service.create();
    const { seatToken: b } = service.join(gameId);
    const first = repo.get(gameId)!.room.state.current;
    return { gameId, a, b, first, second: (1 - first) as 0 | 1 };
  }

  it('creates a game with a 6-character code and seats the creator at 0', () => {
    const { gameId, seatToken } = service.create();
    expect(gameId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(service.seatOf(gameId, seatToken)).toBe(0);
    expect(service.seatOf(gameId, null)).toBeNull();
    expect(service.seatOf(gameId, 'someone-else')).toBeNull();
  });

  it('lets exactly one friend join, case-insensitively', () => {
    const { gameId } = service.create();
    const { seatToken } = service.join(` ${gameId.toLowerCase()} `);
    expect(service.seatOf(gameId, seatToken)).toBe(1);
    expect(() => service.join(gameId)).toThrowError(expect.objectContaining({ code: 'gameFull' }));
    expect(() => service.join('ZZZZZZ')).toThrowError(expect.objectContaining({ code: 'notFound' }));
    expect(service.info(gameId.toLowerCase())).toEqual({ gameId, seated: [true, true] });
  });

  it('refuses to roll until the friend has joined', () => {
    const { gameId } = service.create();
    expect(() => service.roll(gameId, 0)).toThrowError(expect.objectContaining({ code: 'waitingForOpponent' }));
  });

  it('enforces turns, seats and phases', () => {
    const { gameId, first, second } = started();
    expect(() => service.roll(gameId, second)).toThrowError(expect.objectContaining({ code: 'notYourTurn' }));
    expect(() => service.roll(gameId, null)).toThrowError(expect.objectContaining({ code: 'notSeated' }));
    const events = service.roll(gameId, first);
    expect(events[0]).toMatchObject({ type: 'rolled', player: first });
    const state = repo.get(gameId)!.room.state;
    if (state.phase === 'awaitingMove') {
      expect(() => service.roll(gameId, first)).toThrowError(expect.objectContaining({ code: 'badPhase' }));
      expect(() => service.move(gameId, first, 99)).toThrowError(expect.objectContaining({ code: 'illegalMove' }));
      expect(service.move(gameId, first, 0)[0]).toMatchObject({ type: 'moved', player: first });
    }
  });

  it('builds snapshots with seats, presence and rematch flags', () => {
    const { gameId } = started();
    expect(service.snapshot(gameId, 1, [true, false])).toMatchObject({
      gameId, seat: 1, seated: [true, true], connected: [true, false], rematch: [false, false],
    });
  });

  it('persists every action across a restart', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'ur-')), 'ur.sqlite');
    const one = setup(file);
    const { gameId } = one.service.create();
    one.service.join(gameId);
    const first = one.repo.get(gameId)!.room.state.current;
    one.service.roll(gameId, first);
    const before = one.repo.get(gameId)!.room.state;
    one.repo.close();
    const two = setup(file);
    expect(two.repo.get(gameId)!.room.state).toEqual(before);
  });

  it('starts a rematch only when both players accept, alternating the starter', () => {
    const { gameId } = started();
    expect(() => service.rematch(gameId, 0)).toThrowError(expect.objectContaining({ code: 'badPhase' }));
    const rec = repo.get(gameId)!;
    const finished: GameState = { ...newGame(0), pieces: [Array(7).fill(15), Array(7).fill(0)], phase: 'finished', winner: 0 };
    repo.save(gameId, { ...rec.room, state: finished }, 1);
    service.rematch(gameId, 0);
    expect(repo.get(gameId)!.room.rematch).toEqual([true, false]);
    service.rematch(gameId, 1);
    const room = repo.get(gameId)!.room;
    expect(room.state).toEqual(newGame(room.firstPlayer));
    expect(room.firstPlayer).toBe(1 - rec.room.firstPlayer);
    expect(room.rematch).toEqual([false, false]);
  });

  it('sweeps games idle for more than 7 days', () => {
    const s = setup();
    const { gameId } = s.service.create();
    s.clock.t += IDLE_LIMIT_MS + 1;
    s.service.create();
    expect(s.service.sweep()).toBe(1);
    expect(() => s.service.info(gameId)).toThrowError(expect.objectContaining({ code: 'notFound' }));
  });
});
