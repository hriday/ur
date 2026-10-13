import { chooseMove } from '@ur/shared';
import type { AiRequest } from './aiController';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiRequest>) => void) | null;
  postMessage(piece: number): void;
};

ctx.onmessage = (e) => ctx.postMessage(chooseMove(e.data.state, e.data.level, { budgetMs: 600 }));
