import { chooseMove } from '@ur/shared';
import type { AiReply, AiRequest } from './aiController';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiRequest>) => void) | null;
  postMessage(reply: AiReply): void;
};

ctx.onmessage = (e) =>
  ctx.postMessage({ id: e.data.id, piece: chooseMove(e.data.state, e.data.level, { budgetMs: 600 }) });
