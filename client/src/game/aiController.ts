import type { AiLevel, GameState } from '@ur/shared';
import { LocalController } from './local';

export interface AiRequest { state: GameState; level: AiLevel }

const AI_SEAT = 1;
const LEVEL_NAMES: Record<AiLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** You play gold (seat 0); the computer plays carnelian (seat 1) from a Web Worker. */
export class AiController extends LocalController {
  private worker: Worker;
  private busy = false;
  private disposed = false;

  constructor(private level: AiLevel) {
    super('ai', ['You', `Computer · ${LEVEL_NAMES[level]}`], [0]);
    this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
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
    this.worker.onmessage = (e: MessageEvent<number>) =>
      after(Math.max(0, 800 - (performance.now() - started)), () => this.move(e.data));
    this.worker.postMessage({ state: s, level: this.level } satisfies AiRequest);
  }

  override dispose() {
    this.disposed = true;
    this.worker.terminate();
    super.dispose();
  }
}
