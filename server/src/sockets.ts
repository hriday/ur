import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMsg, type GameEvent, type Player, type ServerMsg } from '@ur/shared';
import { ServiceError, normalizeId, type GameService } from './service';

interface Conn { ws: WebSocket; gameId: string; seat: Player | null; alive: boolean }

export function attachSockets(server: Server, service: GameService) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
  const rooms = new Map<string, Set<Conn>>();

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
  const broadcast = (id: string, events: GameEvent[]) => {
    const presence = connected(id);
    for (const k of rooms.get(id) ?? []) {
      try {
        send(k.ws, { type: 'snapshot', snapshot: service.snapshot(id, k.seat, presence), events });
      } catch (e) {
        sendError(k.ws, e);
        k.ws.close(4404, 'notFound');
      }
    }
  };

  wss.on('connection', (ws, req) => {
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
    room.add(conn);
    rooms.set(conn.gameId, room);
    broadcast(conn.gameId, []);

    ws.on('pong', () => { conn.alive = true; });
    ws.on('message', (data) => {
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
