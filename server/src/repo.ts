import Database from 'better-sqlite3';
import type { GameState, Player } from '@ur/shared';

export interface Room { state: GameState; rematch: [boolean, boolean]; firstPlayer: Player }
export interface RoomRecord {
  id: string;
  room: Room;
  seatHashes: [string, string | null];
  createdAt: number;
  updatedAt: number;
}

interface Row {
  id: string; state_json: string; seat_a_hash: string; seat_b_hash: string | null;
  created_at: number; updated_at: number;
}

export function openRepo(file: string) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    seat_a_hash TEXT NOT NULL,
    seat_b_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS games_updated_at ON games(updated_at)');

  const q = {
    insert: db.prepare('INSERT INTO games (id, state_json, seat_a_hash, seat_b_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    get: db.prepare('SELECT * FROM games WHERE id = ?'),
    save: db.prepare('UPDATE games SET state_json = ?, updated_at = ? WHERE id = ?'),
    seatB: db.prepare('UPDATE games SET seat_b_hash = ?, updated_at = ? WHERE id = ? AND seat_b_hash IS NULL'),
    sweep: db.prepare('DELETE FROM games WHERE updated_at < ?'),
  };

  return {
    insert(r: RoomRecord) {
      q.insert.run(r.id, JSON.stringify(r.room), r.seatHashes[0], r.seatHashes[1], r.createdAt, r.updatedAt);
    },
    get(id: string): RoomRecord | undefined {
      const row = q.get.get(id) as Row | undefined;
      return row && {
        id: row.id,
        room: JSON.parse(row.state_json) as Room,
        seatHashes: [row.seat_a_hash, row.seat_b_hash],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
    save(id: string, room: Room, at: number) {
      q.save.run(JSON.stringify(room), at, id);
    },
    setSeatB(id: string, hash: string, at: number): boolean {
      return q.seatB.run(hash, at, id).changes === 1;
    },
    deleteIdle(before: number): number {
      return q.sweep.run(before).changes;
    },
    close() {
      db.close();
    },
  };
}

export type Repo = ReturnType<typeof openRepo>;
