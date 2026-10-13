import { chooseMove, legalMoves, type AiLevel, type GameState, type Rng } from '@ur/shared';
import { LocalController } from './local';

export interface AiRequest { id: number; state: GameState; level: AiLevel }
export interface AiReply { id: number; piece: number }

const AI_SEAT = 1;
const THINK_MS = 800;
const WATCHDOG_MS = 4000;
const LEVEL_NAMES: Record<AiLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** You play gold (seat 0); the computer plays carnelian (seat 1) from a Web Worker. */
export class AiController extends LocalController {
  private worker: Worker | null = null;
  private busy = false;
  private disposed = false;
  /** Id of the request whose answer we are waiting for; replies to older requests are ignored. */
  private requestId = 0;

  constructor(private level: AiLevel, rng?: Rng) {
    super('ai', ['You', `Computer · ${LEVEL_NAMES[level]}`], [0], rng, `ai.${level}`);
    try {
      this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      console.error('AI worker unavailable; thinking on the main thread', e);
    }
  }

  /** Cheap main-thread fallback if the worker fails. */
  private fallbackMove(state: GameState): number {
    try {
      return chooseMove(state, 'easy');
    } catch {
      return legalMoves(state)[0].piece;
    }
  }

  override idle() {
    const s = this.state;
    if (this.disposed || this.busy || s.current !== AI_SEAT || s.phase === 'finished') return;
    this.busy = true;
    const turn = s.turn;
    const after = (wait: number, fn: () => void) =>
      setTimeout(() => {
        this.busy = false;
        if (!this.disposed && this.state.turn === turn) fn();
      }, wait);

    if (s.phase === 'awaitingRoll') {
      after(650, () => this.roll());
      return;
    }

    const started = performance.now();
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const settle = (piece: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      after(Math.max(0, THINK_MS - (performance.now() - started)), () => this.aiMove(piece));
    };
    const fail = () => settle(this.fallbackMove(s));

    const w = this.worker;
    if (!w) {
      fail();
      return;
    }
    const id = ++this.requestId;
    w.onmessage = (e: MessageEvent<AiReply>) => {
      if (e.data?.id !== id) return; // a late answer to an earlier position
      settle(e.data.piece);
    };
    w.onerror = fail;
    w.onmessageerror = fail;
    watchdog = setTimeout(fail, WATCHDOG_MS);
    try {
      w.postMessage({ id, state: s, level: this.level } satisfies AiRequest);
    } catch {
      fail();
    }
  }

  /** Plays the chosen piece, or the first legal move if that choice is somehow not playable. */
  private aiMove(piece: number) {
    const moves = legalMoves(this.state);
    if (!moves.length) return;
    this.move(moves.some((m) => m.piece === piece) ? piece : moves[0].piece);
  }

  override dispose() {
    this.disposed = true;
    this.worker?.terminate();
    super.dispose();
  }
}
