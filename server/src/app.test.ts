import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { mulberry32, type ServerMsg } from '@ur/shared';
import { createApp } from './app';
import { openRepo, type Repo } from './repo';
import { createGameService } from './service';
import { DEFAULT_SOCKET_LIMITS, type SocketLimits } from './sockets';
import { randomBytes } from 'node:crypto';

let server: Server;
let base: string;
let clientDir: string;
let repo: Repo;

async function start(socketLimits?: SocketLimits) {
  repo = openRepo(':memory:');
  const service = createGameService({ repo, rng: mulberry32(3), randomBytes, now: Date.now });
  server = createApp({ service, clientDir, socketLimits });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const stop = () => new Promise<void>((r) => server.close(() => r()));

beforeEach(async () => {
  clientDir = mkdtempSync(path.join(tmpdir(), 'ur-client-'));
  writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>Ur</title>');
  await start();
});
afterEach(stop);

type Seat = { gameId: string; seatToken: string };
const post = (p: string) => fetch(`http://${base}${p}`, { method: 'POST' });

function connect(gameId: string, token?: string, headers?: Record<string, string>) {
  const ws = new WebSocket(`ws://${base}/ws?game=${gameId}${token ? `&token=${token}` : ''}`, { headers });
  const inbox: ServerMsg[] = [];
  const all: ServerMsg[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); all.push(m); inbox.push(m); waiters.splice(0).forEach((w) => w()); });
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
  return { ws, all, until, snap, closed, drain: () => inbox.splice(0), send: (m: object) => ws.send(JSON.stringify(m)) };
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

  it('keys the rate limit on the forwarded client IP', async () => {
    const postAs = (ip: string) => fetch(`http://${base}/api/games`, { method: 'POST', headers: { 'X-Forwarded-For': ip } });
    for (let i = 0; i < 30; i++) expect((await postAs('203.0.113.1')).status).toBe(201);
    expect((await postAs('203.0.113.1')).status).toBe(429);
    expect((await postAs('203.0.113.2')).status).toBe(201);
  });

  it('caps new games from all addresses together', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 301; i++) {
      const ip = `198.51.${Math.floor(i / 250)}.${i % 250}`;
      statuses.push((await fetch(`http://${base}/api/games`, { method: 'POST', headers: { 'X-Forwarded-For': ip } })).status);
    }
    expect(statuses.slice(0, 300).every((s) => s === 201)).toBe(true);
    expect(statuses[300]).toBe(429);
  });

  it('counts an IPv6 /64 as one address', async () => {
    const postAs = (ip: string) => fetch(`http://${base}/api/games`, { method: 'POST', headers: { 'X-Forwarded-For': ip } });
    for (let i = 0; i < 30; i++) expect((await postAs(`2001:db8:1:2::${(i + 1).toString(16)}`)).status).toBe(201);
    expect((await postAs('2001:db8:1:2:ffff:1:2:3')).status).toBe(429);
    expect((await postAs('2001:db8:1:3::1')).status).toBe(201);
  });

  it('sends security headers and hides the framework', async () => {
    for (const p of ['/', '/g/ABCDEF', '/api/games/NOPE99', '/healthz']) {
      const res = await fetch(`http://${base}${p}`);
      expect(res.headers.get('x-powered-by')).toBeNull();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      const csp = res.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain(`connect-src 'self' ws://${base} wss://${base}`);
      expect(csp).toContain('https://fonts.googleapis.com');
      expect(csp).toContain('https://fonts.gstatic.com');
      expect(csp).toContain("worker-src 'self' blob:");
    }
  });

  it('serves the SPA for client routes but not for unknown API routes', async () => {
    expect(await (await fetch(`http://${base}/g/ABCDEF`)).text()).toContain('<title>Ur</title>');
    expect((await fetch(`http://${base}/`, { method: 'HEAD' })).status).toBe(200);
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
    const right = first === 0 ? A : B;
    wrong.drain(); right.drain();
    const before = right.all.length;
    wrong.send({ type: 'roll' });
    expect(await wrong.until((m) => m.type === 'error')).toMatchObject({ code: 'notYourTurn' });
    right.send({ type: 'roll' });
    await right.snap((m) => m.events.length > 0);
    // `all` is a non-consuming log: nothing the other player received since the bad roll may be an error.
    expect(right.all.slice(before).filter((m) => m.type === 'error')).toEqual([]);
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
    await tab1.snap();
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

  it('survives an oversized message and keeps serving', async () => {
    const { A, B } = await startedGame();
    A.ws.send('x'.repeat(2000));
    expect(await A.closed).toBe(1009);
    B.drain();
    expect((await post('/api/games')).status).toBe(201);
    const C = connect((await (await post('/api/games')).json() as Seat).gameId);
    expect((await C.snap()).snapshot.seat).toBeNull();
  });

  it('rejects malformed messages', async () => {
    const { A } = await startedGame();
    A.ws.send('garbage');
    expect(await A.until((m) => m.type === 'error')).toMatchObject({ code: 'badMessage' });
  });
});

describe('WebSocket limits', () => {
  it('loads the room once per broadcast, however many sockets watch it', async () => {
    const { gameId, A, B, first } = await startedGame();
    const watchers = Array.from({ length: 6 }, () => connect(gameId));
    for (const w of watchers) await w.snap();
    // Let every join broadcast settle before counting.
    await new Promise((r) => setTimeout(r, 100));
    const get = vi.spyOn(repo, 'get');
    (first === 0 ? A : B).send({ type: 'roll' });
    for (const w of [A, B, ...watchers]) await w.snap((m) => m.events.length > 0);
    // One load to apply the roll, one for the broadcast to all eight sockets.
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('refuses sockets beyond the per-game cap', async () => {
    const { gameId } = await (await post('/api/games')).json() as Seat;
    const ok = Array.from({ length: DEFAULT_SOCKET_LIMITS.perRoom }, () => connect(gameId));
    for (const c of ok) await c.snap();
    const extra = connect(gameId);
    expect(await extra.until((m) => m.type === 'error')).toMatchObject({ code: 'rateLimited' });
    expect(await extra.closed).toBe(1013);
    ok[0].ws.close();
    await ok[0].closed;
    const again = connect(gameId);
    expect((await again.snap()).snapshot.gameId).toBe(gameId);
  });

  it('lets a seated player reconnect even when spectators fill the per-game cap', async () => {
    const { gameId, seatToken } = await (await post('/api/games')).json() as Seat;
    const watchers = Array.from({ length: DEFAULT_SOCKET_LIMITS.perRoom }, () => connect(gameId));
    for (const c of watchers) await c.snap();
    const extra = connect(gameId);
    expect(await extra.closed).toBe(1013);
    const owner = connect(gameId, seatToken);
    expect((await owner.snap()).snapshot.seat).toBe(0);
  });

  it('refuses sockets beyond the per-address cap, keyed on the forwarded client IP', async () => {
    await stop();
    await start({ ...DEFAULT_SOCKET_LIMITS, perIp: 4 });
    const { gameId } = await (await post('/api/games')).json() as Seat;
    const as = (ip: string) => connect(gameId, undefined, { 'X-Forwarded-For': ip });
    const ok = Array.from({ length: 4 }, () => as('203.0.113.7'));
    for (const c of ok) await c.snap();
    const extra = as('203.0.113.7');
    expect(await extra.until((m) => m.type === 'error')).toMatchObject({ code: 'rateLimited' });
    expect(await extra.closed).toBe(1013);
    expect((await as('203.0.113.8').snap()).snapshot.gameId).toBe(gameId);
  });

  it('closes a flooding socket with 1008 and keeps serving everyone else', async () => {
    const { gameId, A, B } = await startedGame();
    for (let i = 0; i < 200; i++) A.ws.send('garbage');
    expect(await A.closed).toBe(1008);
    expect(A.all.some((m) => m.type === 'error' && m.code === 'rateLimited')).toBe(true);
    // A holds seat 0; B sees it leave.
    await B.snap((m) => !m.snapshot.connected[0]);
    const spectator = connect(gameId);
    expect((await spectator.snap()).snapshot.seat).toBeNull();
    expect((await post('/api/games')).status).toBe(201);
  });

  it('allows a normal pace of messages', async () => {
    const { A } = await startedGame();
    for (let i = 0; i < 30; i++) A.ws.send('garbage');
    for (let i = 0; i < 30; i++) await A.until((m) => m.type === 'error' && m.code === 'badMessage');
    expect(A.ws.readyState).toBe(WebSocket.OPEN);
  });
});
