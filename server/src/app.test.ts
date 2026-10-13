import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { mulberry32, type ServerMsg } from '@ur/shared';
import { createApp } from './app';
import { openRepo } from './repo';
import { createGameService } from './service';
import { randomBytes } from 'node:crypto';

let server: Server;
let base: string;
let clientDir: string;

beforeEach(async () => {
  clientDir = mkdtempSync(path.join(tmpdir(), 'ur-client-'));
  writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>Ur</title>');
  const service = createGameService({ repo: openRepo(':memory:'), rng: mulberry32(3), randomBytes, now: Date.now });
  server = createApp({ service, clientDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

type Seat = { gameId: string; seatToken: string };
const post = (p: string) => fetch(`http://${base}${p}`, { method: 'POST' });

function connect(gameId: string, token?: string) {
  const ws = new WebSocket(`ws://${base}/ws?game=${gameId}${token ? `&token=${token}` : ''}`);
  const inbox: ServerMsg[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (d) => { inbox.push(JSON.parse(d.toString())); waiters.splice(0).forEach((w) => w()); });
  const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
  async function until(pred: (m: ServerMsg) => boolean): Promise<ServerMsg> {
    for (;;) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(0, i + 1).pop()!;
      await new Promise<void>((r) => waiters.push(r));
    }
  }
  const snap = (pred: (s: Extract<ServerMsg, { type: 'snapshot' }>) => boolean = () => true) =>
    until((m) => m.type === 'snapshot' && pred(m)) as Promise<Extract<ServerMsg, { type: 'snapshot' }>>;
  return { ws, until, snap, closed, drain: () => inbox.splice(0), send: (m: object) => ws.send(JSON.stringify(m)) };
}

async function startedGame() {
  const { gameId, seatToken: a } = await (await post('/api/games')).json() as Seat;
  const { seatToken: b } = await (await post(`/api/games/${gameId}/join`)).json() as Seat;
  const A = connect(gameId, a);
  const B = connect(gameId, b);
  const sa = await A.snap((m) => m.snapshot.connected[1]);
  await B.snap((m) => m.snapshot.connected[0]);
  return { gameId, A, B, first: sa.snapshot.state.current };
}

describe('HTTP API', () => {
  it('creates, inspects and joins games', async () => {
    const created = await post('/api/games');
    expect(created.status).toBe(201);
    const { gameId } = await created.json() as Seat;
    expect((await (await fetch(`http://${base}/api/games/${gameId.toLowerCase()}`)).json())).toEqual({ gameId, seated: [true, false] });
    expect((await post(`/api/games/${gameId}/join`)).status).toBe(200);
    expect((await post(`/api/games/${gameId}/join`)).status).toBe(409);
    expect((await fetch(`http://${base}/api/games/NOPE99`)).status).toBe(404);
  });

  it('rate-limits game creation per IP', async () => {
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await post('/api/games')).status);
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it('serves the SPA for client routes but not for unknown API routes', async () => {
    expect(await (await fetch(`http://${base}/g/ABCDEF`)).text()).toContain('<title>Ur</title>');
    expect((await fetch(`http://${base}/api/unknown`)).status).toBe(404);
  });
});

describe('WebSocket play', () => {
  it('broadcasts each action to both players with events', async () => {
    const { A, B, first } = await startedGame();
    const actor = first === 0 ? A : B;
    const watcher = first === 0 ? B : A;
    actor.send({ type: 'roll' });
    const seen = await watcher.snap((m) => m.events.length > 0);
    expect(seen.events[0]).toMatchObject({ type: 'rolled', player: first });
    expect(seen.snapshot.state.turn).toBe(1);
  });

  it('rejects out-of-turn actions only to the sender', async () => {
    const { A, B, first } = await startedGame();
    const wrong = first === 0 ? B : A;
    wrong.send({ type: 'roll' });
    expect(await wrong.until((m) => m.type === 'error')).toMatchObject({ code: 'notYourTurn' });
  });

  it('applies one of two rapid duplicate rolls and rejects the other', async () => {
    const { A, B, first } = await startedGame();
    const actor = first === 0 ? A : B;
    actor.send({ type: 'roll' });
    actor.send({ type: 'roll' });
    const ok = await actor.snap((m) => m.events.length > 0);
    expect(ok.events[0].type).toBe('rolled');
    const err = await actor.until((m) => m.type === 'error' || (m.type === 'snapshot' && m.events.length > 0));
    // The second roll is either rejected (awaitingMove) or, if the first roll passed the turn, rejected as not your turn.
    expect(err).toMatchObject({ type: 'error' });
    expect(['badPhase', 'notYourTurn']).toContain((err as { code: string }).code);
  });

  it('keeps a player connected while a second tab with the same token stays open', async () => {
    const { gameId, seatToken: a } = await (await post('/api/games')).json() as Seat;
    const tab1 = connect(gameId, a);
    const tab2 = connect(gameId, a);
    expect((await tab2.snap()).snapshot.seat).toBe(0);
    tab2.drain();
    tab1.ws.close();
    const s = await tab2.snap();
    expect(s.snapshot.connected).toEqual([true, false]);
  });

  it('treats tokenless visitors as spectators', async () => {
    const { gameId } = await startedGame();
    const spectator = connect(gameId);
    const s = await spectator.snap();
    expect(s.snapshot.seat).toBeNull();
    spectator.send({ type: 'roll' });
    expect(await spectator.until((m) => m.type === 'error')).toMatchObject({ code: 'notSeated' });
  });

  it('closes connections to unknown games', async () => {
    const c = connect('NOPE99');
    expect(await c.until((m) => m.type === 'error')).toMatchObject({ code: 'notFound' });
    expect(await c.closed).toBe(4404);
  });

  it('rejects malformed messages', async () => {
    const { A } = await startedGame();
    A.ws.send('garbage');
    expect(await A.until((m) => m.type === 'error')).toMatchObject({ code: 'badMessage' });
  });
});
