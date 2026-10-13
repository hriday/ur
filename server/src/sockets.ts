import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMsg, type GameEvent, type Player, type ServerMsg } from '@ur/shared';
import { addressKey, clientIp, createTokenBucket } from './rateLimit';
import { ServiceError, normalizeId, type GameService } from './service';

interface Conn { ws: WebSocket; gameId: string; seat: Player | null; alive: boolean }

export interface SocketLimits {
  /** Most sockets in one game (players' tabs plus spectators). */
  perRoom: number;
  /** Most sockets from one client address (IPv6 counted per /64). */
  perIp: number;
  /** Sustained client messages per second, per socket. */
  msgRate: number;
  /** Message burst allowance, per socket. */
  msgBurst: number;
}

export const DEFAULT_SOCKET_LIMITS: SocketLimits = { perRoom: 16, perIp: 32, msgRate: 20, msgBurst: 40 };

/** Close codes: 1013 "try again later" for capacity, 1008 "policy violation" for flooding. */
export const CLOSE_FULL = 1013;
export const CLOSE_POLICY = 1008;

export function attachSockets(
  server: Server,
  service: GameService,
  { limits = DEFAULT_SOCKET_LIMITS, now = Date.now }: { limits?: SocketLimits; now?: () => number } = {},
) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
  const rooms = new Map<string, Set<Conn>>();
  const perIp = new Map<string, number>();

  const send = (ws: WebSocket, msg: ServerMsg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const sendError = (ws: WebSocket, e: unknown) => {
    if (e instanceof ServiceError) return send(ws, { type: 'error', code: e.code, message: e.message });
    console.error(e);
    send(ws, { type: 'error', code: 'badMessage', message: 'Something went wrong.' });
  };
  const connected = (id: string): [boolean, boolean] => {
    const c: [boolean, boolean] = [false, false];
    for (const k of rooms.get(id) ?? []) if (k.seat !== null) c[k.seat] = true;
    return c;
  };
  /** Loads the room once, then sends each connection its own view (only `seat` differs). */
  const broadcast = (id: string, events: GameEvent[]) => {
    const room = rooms.get(id);
    if (!room?.size) return;
    let view;
    try {
      view = service.roomView(id, connected(id));
    } catch (e) {
      for (const k of room) {
        sendError(k.ws, e);
        k.ws.close(4404, 'notFound');
      }
      return;
    }
    for (const k of room) send(k.ws, { type: 'snapshot', snapshot: { ...view, seat: k.seat }, events });
  };
  const refuse = (ws: WebSocket, code: number, message: string) => {
    send(ws, { type: 'error', code: 'rateLimited', message });
    ws.close(code, 'rateLimited');
  };

  wss.on('connection', (ws, req) => {
    ws.on('error', (e) => console.warn('websocket error:', e.message));
    const ip = addressKey(clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for']));
    if ((perIp.get(ip) ?? 0) >= limits.perIp) {
      refuse(ws, CLOSE_FULL, 'Too many open connections — close some tabs and try again.');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    let conn: Conn;
    try {
      const gameId = normalizeId(url.searchParams.get('game') ?? '');
      conn = { ws, gameId, seat: service.seatOf(gameId, url.searchParams.get('token')), alive: true };
    } catch (e) {
      sendError(ws, e);
      ws.close(4404, 'notFound');
      return;
    }
    const room = rooms.get(conn.gameId) ?? new Set<Conn>();
    // Only spectators count toward the room cap, so watchers can never lock a seated player out.
    const spectators = [...room].filter((k) => k.seat === null).length;
    if (conn.seat === null && spectators >= limits.perRoom) {
      refuse(ws, CLOSE_FULL, 'This game has too many viewers right now — try again later.');
      return;
    }
    room.add(conn);
    rooms.set(conn.gameId, room);
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    broadcast(conn.gameId, []);

    const bucket = createTokenBucket({ rate: limits.msgRate, burst: limits.msgBurst, now });
    ws.on('pong', () => { conn.alive = true; });
    ws.on('message', (data) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!bucket.take()) {
        refuse(ws, CLOSE_POLICY, 'Too many messages — slow down.');
        return;
      }
      const msg = parseClientMsg(data.toString());
      if (!msg) return send(ws, { type: 'error', code: 'badMessage', message: 'Unrecognised message.' });
      try {
        const events =
          msg.type === 'roll' ? service.roll(conn.gameId, conn.seat)
          : msg.type === 'move' ? service.move(conn.gameId, conn.seat, msg.piece)
          : service.rematch(conn.gameId, conn.seat);
        broadcast(conn.gameId, events);
      } catch (e) {
        sendError(ws, e);
      }
    });
    ws.on('close', () => {
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n > 0) perIp.set(ip, n);
      else perIp.delete(ip);
      room.delete(conn);
      if (room.size === 0) rooms.delete(conn.gameId);
      else broadcast(conn.gameId, []);
    });
  });

  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const c of room) {
        if (!c.alive) { c.ws.terminate(); continue; }
        c.alive = false;
        c.ws.ping();
      }
    }
  }, 30_000);
  // Upgraded sockets keep http.Server.close() waiting, so terminate them as soon as close is requested.
  const originalClose = server.close.bind(server);
  server.close = ((cb?: (err?: Error) => void) => {
    clearInterval(heartbeat);
    for (const c of wss.clients) c.terminate();
    wss.close();
    return originalClose(cb);
  }) as typeof server.close;
  server.on('close', () => clearInterval(heartbeat));
}
