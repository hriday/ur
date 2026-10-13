import { createHash } from 'node:crypto';
import {
  RuleError, applyMove, applyRoll, newGame, other, rollDice,
  type ErrorCode, type GameEvent, type Player, type RoomSnapshot, type Rng,
} from '@ur/shared';
import type { Repo, Room, RoomRecord } from './repo';

export const IDLE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class ServiceError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}

export interface ServiceDeps {
  repo: Repo;
  rng: Rng;
  randomBytes: (n: number) => Buffer;
  now: () => number;
}

export const normalizeId = (id: string) => id.trim().toUpperCase();
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createGameService({ repo, rng, randomBytes, now }: ServiceDeps) {
  const newToken = () => randomBytes(24).toString('base64url');
  const newId = () => {
    for (;;) {
      const id = [...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
      if (!repo.get(id)) return id;
    }
  };
  const load = (id: string): RoomRecord => {
    const rec = repo.get(normalizeId(id));
    if (!rec) throw new ServiceError('notFound', 'This game no longer exists.');
    return rec;
  };

  /** Validates the seat, applies `fn`, persists, and returns the resulting events. */
  function act(id: string, seat: Player | null, needsTurn: boolean, fn: (room: Room) => { room: Room; events: GameEvent[] }) {
    const rec = load(id);
    if (seat === null) throw new ServiceError('notSeated', 'Spectators cannot play.');
    if (rec.seatHashes[1] === null) throw new ServiceError('waitingForOpponent', 'Waiting for your friend to join.');
    if (needsTurn && rec.room.state.phase !== 'finished' && rec.room.state.current !== seat) {
      throw new ServiceError('notYourTurn', 'It is not your turn.');
    }
    try {
      const { room, events } = fn(rec.room);
      repo.save(rec.id, room, now());
      return events;
    } catch (e) {
      if (e instanceof RuleError) throw new ServiceError(e.code, e.message);
      throw e;
    }
  }

  /** The room as everyone sees it; callers add the receiver's own `seat`. Loads the record once. */
  function roomView(id: string, connected: [boolean, boolean]): Omit<RoomSnapshot, 'seat'> {
    const rec = load(id);
    return {
      gameId: rec.id,
      state: rec.room.state,
      seated: [true, rec.seatHashes[1] !== null],
      connected,
      rematch: rec.room.rematch,
    };
  }

  return {
    create() {
      const id = newId();
      const token = newToken();
      const firstPlayer: Player = rng() < 0.5 ? 0 : 1;
      const t = now();
      repo.insert({
        id,
        room: { state: newGame(firstPlayer), rematch: [false, false], firstPlayer },
        seatHashes: [hashToken(token), null],
        createdAt: t,
        updatedAt: t,
      });
      return { gameId: id, seatToken: token };
    },

    join(id: string) {
      const rec = load(id);
      const token = newToken();
      if (rec.seatHashes[1] !== null || !repo.setSeatB(rec.id, hashToken(token), now())) {
        throw new ServiceError('gameFull', 'Both seats in this game are taken.');
      }
      return { seatToken: token };
    },

    info(id: string) {
      const rec = load(id);
      return { gameId: rec.id, seated: [true, rec.seatHashes[1] !== null] as [boolean, boolean] };
    },

    seatOf(id: string, token: string | null): Player | null {
      const rec = load(id);
      if (!token) return null;
      const h = hashToken(token);
      if (rec.seatHashes[0] === h) return 0;
      if (rec.seatHashes[1] === h) return 1;
      return null;
    },

    roomView,

    snapshot(id: string, seat: Player | null, connected: [boolean, boolean]): RoomSnapshot {
      return { ...roomView(id, connected), seat };
    },

    roll(id: string, seat: Player | null) {
      return act(id, seat, true, (room) => {
        const t = applyRoll(room.state, rollDice(rng));
        return { room: { ...room, state: t.state }, events: t.events };
      });
    },

    move(id: string, seat: Player | null, piece: number) {
      return act(id, seat, true, (room) => {
        const t = applyMove(room.state, piece);
        return { room: { ...room, state: t.state }, events: t.events };
      });
    },

    rematch(id: string, seat: Player | null) {
      return act(id, seat, false, (room) => {
        if (room.state.phase !== 'finished') throw new ServiceError('badPhase', 'The game is still in progress.');
        const flags: [boolean, boolean] = [...room.rematch];
        flags[seat!] = true;
        if (flags[0] && flags[1]) {
          const firstPlayer = other(room.firstPlayer);
          return { room: { state: newGame(firstPlayer), rematch: [false, false], firstPlayer }, events: [] };
        }
        return { room: { ...room, rematch: flags }, events: [] };
      });
    },

    sweep() {
      return repo.deleteIdle(now() - IDLE_LIMIT_MS);
    },
  };
}

export type GameService = ReturnType<typeof createGameService>;
