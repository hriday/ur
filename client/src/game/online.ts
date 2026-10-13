import type { ClientMsg, RoomSnapshot, ServerMsg } from '@ur/shared';
import { Emitter, type ConnectionStatus, type GameController, type Snapshot, type Update } from './controller';

export function toSnapshot(r: RoomSnapshot): Snapshot {
  const seat = r.seat;
  return {
    mode: 'online',
    gameId: r.gameId,
    state: r.state,
    controls: seat === null ? [] : [seat],
    perspective: seat ?? 0,
    names: seat === null ? ['Gold', 'Carnelian'] : seat === 0 ? ['You', 'Friend'] : ['Friend', 'You'],
    seated: r.seated,
    connected: r.connected,
    rematch: r.rematch,
    spectator: seat === null,
  };
}

const STALE_AFTER_HIDDEN_MS = 15_000;

export class OnlineController implements GameController {
  private ws: WebSocket | null = null;
  private updates = new Emitter<Update>();
  private errors = new Emitter<[string, string]>();
  private statuses = new Emitter<ConnectionStatus>();
  private last: Snapshot | null = null;
  private status: ConnectionStatus = 'connecting';
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hiddenAt = 0;
  private closed = false;

  constructor(private gameId: string, private token: string | null) {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onVisibility);
    this.connect();
  }

  /** Phones freeze background tabs; reconnect promptly (and drop a possibly-dead socket) on return. */
  private onVisibility = () => {
    if (this.closed) return;
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      return;
    }
    const open = this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING);
    const stale = this.hiddenAt && Date.now() - this.hiddenAt > STALE_AFTER_HIDDEN_MS;
    this.hiddenAt = 0;
    if (open && !stale) return;
    clearTimeout(this.timer);
    const old = this.ws;
    this.ws = null;
    old?.close();
    this.connect();
  };

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statuses.emit(s);
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = new URLSearchParams({ game: this.gameId });
    if (this.token) q.set('token', this.token);
    const ws = new WebSocket(`${proto}://${location.host}/ws?${q}`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus('open');
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as ServerMsg;
      if (msg.type === 'snapshot') {
        const snapshot = toSnapshot(msg.snapshot);
        this.last = snapshot;
        this.updates.emit({ snapshot, events: msg.events });
        return;
      }
      if (msg.code === 'notFound') {
        this.closed = true;
        this.setStatus('notFound');
      }
      this.errors.emit([msg.code, msg.message]);
    };
    ws.onclose = () => {
      if (this.closed || this.ws !== ws) return;
      this.setStatus('reconnecting');
      const delay = Math.min(10_000, 500 * 2 ** this.attempts++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  subscribe(fn: (u: Update) => void) {
    const off = this.updates.on(fn);
    if (this.last) fn({ snapshot: this.last, events: [] });
    return off;
  }
  onError(fn: (code: string, message: string) => void) {
    return this.errors.on(([code, message]) => fn(code, message));
  }
  onStatus(fn: (s: ConnectionStatus) => void) {
    fn(this.status);
    return this.statuses.on(fn);
  }
  roll() { this.send({ type: 'roll' }); }
  move(piece: number) { this.send({ type: 'move', piece }); }
  rematch() { this.send({ type: 'rematch' }); }
  idle() {}

  dispose() {
    this.closed = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onVisibility);
    this.ws?.close();
    this.updates.clear();
    this.errors.clear();
    this.statuses.clear();
  }

  private send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else this.errors.emit(['offline', 'Reconnecting — try again in a moment.']);
  }
}
