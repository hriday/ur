import type { GameEvent, GameState, Player } from '@ur/shared';

export type Mode = 'online' | 'ai' | 'local';
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'notFound';

export interface Snapshot {
  mode: Mode;
  state: GameState;
  /** Seats this device may act for. */
  controls: Player[];
  /** Seat drawn at the bottom of the screen. */
  perspective: Player;
  names: [string, string];
  seated: [boolean, boolean];
  connected: [boolean, boolean];
  rematch: [boolean, boolean];
  spectator: boolean;
  gameId?: string;
}

export interface Update { snapshot: Snapshot; events: GameEvent[] }

export interface GameController {
  /** Delivers the current snapshot immediately (with no events), then every update. */
  subscribe(fn: (u: Update) => void): () => void;
  onError(fn: (code: string, message: string) => void): () => void;
  onStatus(fn: (s: ConnectionStatus) => void): () => void;
  roll(): void;
  move(piece: number): void;
  rematch(): void;
  /** Called by the screen once every queued animation has finished. */
  idle(): void;
  dispose(): void;
}

export class Emitter<T> {
  private fns = new Set<(v: T) => void>();
  on(fn: (v: T) => void) {
    this.fns.add(fn);
    return () => { this.fns.delete(fn); };
  }
  emit(v: T) {
    for (const fn of [...this.fns]) fn(v);
  }
  clear() {
    this.fns.clear();
  }
}
