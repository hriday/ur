import {
  OFF, PIECES, RuleError, START, applyMove, applyRoll, legalMoves, newGame, other, rollDice,
  type GameEvent, type GameState, type Player, type Rng,
} from '@ur/shared';
import { Emitter, type ConnectionStatus, type GameController, type Mode, type Snapshot, type Update } from './controller';

interface Saved { state: GameState; firstPlayer: Player }

const isPlayer = (v: unknown): v is Player => v === 0 || v === 1;
const isSide = (v: unknown) =>
  Array.isArray(v) && v.length === PIECES && v.every((p) => Number.isInteger(p) && p >= START && p <= OFF);

/** Accepts only a structurally sound saved game; anything else starts afresh. */
export function parseSaved(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Saved;
    const s = v?.state;
    if (!isPlayer(v.firstPlayer) || !s || !Array.isArray(s.pieces) || !isSide(s.pieces[0]) || !isSide(s.pieces[1])) return null;
    if (!isPlayer(s.current) || !['awaitingRoll', 'awaitingMove', 'finished'].includes(s.phase)) return null;
    if (!Number.isInteger(s.turn) || s.turn < 0) return null;
    if (s.phase === 'awaitingMove' && legalMoves(s).length === 0) return null;
    if (s.phase === 'finished' && !isPlayer(s.winner)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Per-tab persistence, so a reload resumes the game in progress. */
const session = {
  get(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { sessionStorage.setItem(key, value); } catch { /* storage unavailable: the game lives in memory only */ }
  },
  remove(key: string) {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

/** Runs the whole game in the browser: pass & play, and the base for the AI controller. */
export class LocalController implements GameController {
  protected state: GameState;
  private firstPlayer: Player;
  private updates = new Emitter<Update>();
  private errors = new Emitter<[string, string]>();
  private storageKey: string | null;

  constructor(
    protected mode: Mode,
    protected names: [string, string],
    protected controls: Player[],
    protected rng: Rng = Math.random,
    /** sessionStorage slot for this mode (and AI level); null disables persistence. */
    storageKey: string | null = null,
  ) {
    this.storageKey = storageKey && `ur.game.${storageKey}`;
    const saved = this.storageKey ? parseSaved(session.get(this.storageKey)) : null;
    this.firstPlayer = saved?.firstPlayer ?? (rng() < 0.5 ? 0 : 1);
    this.state = saved?.state ?? newGame(this.firstPlayer);
  }

  private save() {
    if (this.storageKey) session.set(this.storageKey, JSON.stringify({ state: this.state, firstPlayer: this.firstPlayer }));
  }

  protected snapshot(): Snapshot {
    return {
      mode: this.mode,
      state: this.state,
      controls: this.controls,
      perspective: 0,
      names: this.names,
      seated: [true, true],
      connected: [true, true],
      rematch: [false, false],
      spectator: false,
    };
  }

  subscribe(fn: (u: Update) => void) {
    const off = this.updates.on(fn);
    fn({ snapshot: this.snapshot(), events: [] });
    return off;
  }
  onError(fn: (code: string, message: string) => void) {
    return this.errors.on(([code, message]) => fn(code, message));
  }
  onStatus(fn: (s: ConnectionStatus) => void) {
    fn('open');
    return () => {};
  }
  roll() {
    this.apply(() => applyRoll(this.state, rollDice(this.rng)));
  }
  move(piece: number) {
    this.apply(() => applyMove(this.state, piece));
  }
  rematch() {
    if (this.storageKey) session.remove(this.storageKey);
    this.firstPlayer = other(this.firstPlayer);
    this.state = newGame(this.firstPlayer);
    this.updates.emit({ snapshot: this.snapshot(), events: [] });
  }
  idle() {}
  dispose() {
    this.updates.clear();
    this.errors.clear();
  }

  protected apply(fn: () => { state: GameState; events: GameEvent[] }) {
    let t: { state: GameState; events: GameEvent[] };
    try {
      t = fn();
    } catch (e) {
      if (e instanceof RuleError) this.errors.emit([e.code, e.message]);
      else {
        // Never leave the screen waiting on an action that will not come.
        console.error('Game action failed', e);
        this.errors.emit(['internal', 'Something went wrong — please try again.']);
      }
      return;
    }
    this.state = t.state;
    this.save();
    this.updates.emit({ snapshot: this.snapshot(), events: t.events });
  }
}
