import {
  RuleError, applyMove, applyRoll, newGame, other, rollDice,
  type GameEvent, type GameState, type Player, type Rng,
} from '@ur/shared';
import { Emitter, type ConnectionStatus, type GameController, type Mode, type Snapshot, type Update } from './controller';

/** Runs the whole game in the browser: pass & play, and the base for the AI controller. */
export class LocalController implements GameController {
  protected state: GameState;
  private firstPlayer: Player;
  private updates = new Emitter<Update>();
  private errors = new Emitter<[string, string]>();

  constructor(
    protected mode: Mode,
    protected names: [string, string],
    protected controls: Player[],
    protected rng: Rng = Math.random,
  ) {
    this.firstPlayer = rng() < 0.5 ? 0 : 1;
    this.state = newGame(this.firstPlayer);
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
    this.firstPlayer = other(this.firstPlayer);
    this.state = newGame(this.firstPlayer);
    this.updates.emit({ snapshot: this.snapshot(), events: [] });
  }
  idle() {}
  dispose() {
    this.updates.clear();
    this.errors.clear();
  }

  private apply(fn: () => { state: GameState; events: GameEvent[] }) {
    try {
      const t = fn();
      this.state = t.state;
      this.updates.emit({ snapshot: this.snapshot(), events: t.events });
    } catch (e) {
      if (e instanceof RuleError) this.errors.emit([e.code, e.message]);
      else throw e;
    }
  }
}
