# Royal Game of Ur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A beautiful, rules-faithful Royal Game of Ur web app with online play-a-friend, play-the-computer (Easy/Medium/Hard) and pass & play, deployed to https://ur.moosha.org.

**Architecture:** npm-workspaces TypeScript monorepo. `shared/` is a pure rules engine + AI + protocol types used everywhere. `server/` is Node + Express + `ws` + SQLite, authoritative for online games and serving the built client. `client/` is Vite + Svelte 5 rendering an SVG board, with all game modes behind one `GameController` interface and the AI in a Web Worker.

**Tech Stack:** TypeScript 5.9, Svelte 5 (runes), Vite 8, Vitest 5, Express 5, ws 8, better-sqlite3, Playwright, esbuild, Caddy, systemd.

**Spec:** `docs/superpowers/specs/2026-10-12-royal-game-of-ur-design.md`

## Global Constraints

- Node ≥ 22.12 (production droplet runs Node 24 LTS). ESM everywhere (`"type": "module"`). TypeScript `strict`.
- Rules are exactly spec §2 (Finkel). `shared/src/rules.ts` is the **only** rules implementation; server, client and AI never re-implement a rule.
- Positions: 0 = waiting, 1–14 = on board, 15 = borne off. Rosettes at 4, 8, 14. Shared row 5–12. Central rosette 8 is safe.
- Player 0 = **gold**, player 1 = **carnelian**. Online game creator always takes seat 0.
- Online server is authoritative and rolls dice with a crypto RNG; clients only send intents (`roll`, `move`, `rematch`).
- Palette (verbatim): lapis #060a1f → #1b2f74, gold #e2bf63 / #d9b45a, carnelian #c7512f, shell-cream highlights. Fonts: Cinzel (display), Cormorant Garamond (body).
- Mobile-first: touch targets ≥ 44 px, narrow portrait shows a vertical board, `prefers-reduced-motion` respected.
- No accounts, no matchmaking, no chat, no turn timer, no rule variants. Idle games deleted after 7 days.
- Deploy target: `root@ur.moosha.org` (143.110.208.106), served at `https://ur.moosha.org`.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Rapid repeated actions** (double-click Roll, double-tap a piece, two tabs acting at once) → exactly one action applies; the duplicate gets a quiet rejection and nothing desyncs. Pinned in Task 5 (service rejects second roll) and Task 6 (two quick `roll` messages → one success, one `badPhase` error).
2. **Same player opens the link in a second tab** → both tabs control the same seat, both stay in sync, and closing one tab doesn't mark the player disconnected. Pinned in Task 6.
3. **Trying to roll before the friend joins** → clear "Waiting for your friend to join" plus the invite panel, never a dead button. Pinned in Task 5 (`waitingForOpponent`) and Task 12 (invite panel visible, dice disabled).
4. **Invite code in lowercase / with whitespace** → resolves to the same game. Pinned in Task 5 (`join` lowercase) and Task 6 (`GET /api/games/<lowercase>`).
5. **Phone backgrounded or network drop mid-game** → on return the client reconnects and shows the latest state without replaying stale animations or getting stuck. Pinned in Task 12 (offline toggle and reload mid-game, play continues to the end).

---

## File Structure

```
package.json, tsconfig.base.json, vitest.config.ts, playwright.config.ts, .gitignore
shared/
  package.json, tsconfig.json
  src/index.ts          re-exports
  src/types.ts          Player, GameState, Move, GameEvent, Dice
  src/board.ts          constants, route→cell geometry, BOARD motif layout
  src/dice.ts           ROLL_ODDS, rollDice, diceTotal, diceForTotal
  src/rng.ts            Rng type, mulberry32 seeded RNG
  src/rules.ts          newGame, legalMoves, applyRoll, applyMove, RuleError
  src/explain.ts        whyCannotMove (human-readable illegal-move reasons)
  src/ai.ts             evaluate, chooseMove (easy/medium/hard)
  src/protocol.ts       ErrorCode, RoomSnapshot, ClientMsg, ServerMsg, parseClientMsg
  src/*.test.ts
server/
  package.json, tsconfig.json
  src/repo.ts           SQLite persistence
  src/service.ts        game rooms: create/join/seat/roll/move/rematch/sweep
  src/rateLimit.ts      sliding-window limiter
  src/sockets.ts        WebSocket rooms, presence, broadcast, heartbeat
  src/app.ts            Express routes + static client + sockets
  src/index.ts          entrypoint (env, wiring, sweep timer, shutdown)
  src/*.test.ts
client/
  package.json, tsconfig.json, vite.config.ts, svelte.config.js, index.html
  public/manifest.webmanifest, public/icon.svg, public/icon-*.png
  scripts/make-icons.mjs
  src/main.ts, src/App.svelte
  src/styles/theme.css
  src/lib/router.svelte.ts, src/lib/motion.ts
  src/board/geometry.ts, effects.ts, SvgDefs.svelte, Motif.svelte, BoardTiles.svelte,
            MiniBoard.svelte, Board.svelte, Piece.svelte, Dice.svelte, Burst.svelte
  src/game/controller.ts, local.ts, aiController.ts, ai.worker.ts, online.ts,
           storage.ts, messages.ts, coach.svelte.ts
  src/audio/sound.svelte.ts
  src/ui/toasts.svelte.ts, Toasts.svelte, Coach.svelte, PlayerHud.svelte, TopBar.svelte,
         VictoryOverlay.svelte, InvitePanel.svelte
  src/screens/Home.svelte, GameScreen.svelte, LocalGame.svelte, AiGame.svelte,
              OnlineGame.svelte, HowToPlay.svelte, NotFound.svelte
e2e/
  helpers.ts, online.spec.ts, modes.spec.ts
deploy/
  ur.service, Caddyfile, nginx-ur.conf, setup.sh, deploy.sh
DEPLOY.md
```

---

### Task 1: Workspace scaffold and board geometry

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/types.ts`, `shared/src/board.ts`, `shared/src/index.ts`
- Test: `shared/src/board.test.ts`

**Interfaces:**
- Produces: `Player`, `Bit`, `Dice`, `Phase`, `GameState`, `Move`, `PassReason`, `GameEvent`, `other(p)`; `PIECES=7`, `START=0`, `OFF=15`, `CENTRAL_ROSETTE=8`, `ROSETTES`, `isRosette(pos)`, `isShared(pos)`, `Row`, `Cell`, `homeRow(p)`, `cellFor(player, pos): Cell | null`, `Motif`, `BOARD`. Package name `@ur/shared` (consumed as TS source).

- [ ] **Step 1: Create root workspace files**

`package.json`:
```json
{
  "name": "royal-game-of-ur",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev": "npm run dev -w server & npm run dev -w client",
    "build": "npm run build -w client && npm run build -w server",
    "start": "node server/dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc -p shared && tsc -p server && npm run check -w client",
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.64.0",
    "tsx": "^4.23.15",
    "typescript": "^5.9.3",
    "vitest": "^5.0.4"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": []
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'server/src/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
```

`shared/package.json`:
```json
{
  "name": "@ur/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

`shared/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 2: Write the failing geometry test**

`shared/src/board.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BOARD, cellFor, isRosette, isShared } from './board';

describe('board geometry', () => {
  it('maps player 0 along own row leftwards, the middle row rightwards, then back', () => {
    const cells = Array.from({ length: 14 }, (_, i) => cellFor(0, i + 1));
    expect(cells).toEqual([
      { row: 0, col: 3 }, { row: 0, col: 2 }, { row: 0, col: 1 }, { row: 0, col: 0 },
      { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
      { row: 1, col: 4 }, { row: 1, col: 5 }, { row: 1, col: 6 }, { row: 1, col: 7 },
      { row: 0, col: 7 }, { row: 0, col: 6 },
    ]);
  });

  it('mirrors player 1 on the bottom row and shares the middle row', () => {
    expect(cellFor(1, 1)).toEqual({ row: 2, col: 3 });
    expect(cellFor(1, 8)).toEqual(cellFor(0, 8));
    expect(cellFor(1, 14)).toEqual({ row: 2, col: 6 });
  });

  it('has no cell for waiting or borne-off pieces', () => {
    expect(cellFor(0, 0)).toBeNull();
    expect(cellFor(1, 15)).toBeNull();
  });

  it('puts every route square on a real square, with rosettes exactly where the art has them', () => {
    for (const p of [0, 1] as const) {
      for (let pos = 1; pos <= 14; pos++) {
        const c = cellFor(p, pos)!;
        const motif = BOARD[c.row][c.col];
        expect(motif).not.toBeNull();
        expect(motif === 'rosette').toBe(isRosette(pos));
      }
    }
  });

  it('has exactly 20 squares and 5 rosettes', () => {
    expect(BOARD.flat().filter(Boolean)).toHaveLength(20);
    expect(BOARD.flat().filter((m) => m === 'rosette')).toHaveLength(5);
  });

  it('treats 5..12 as the shared row', () => {
    expect([4, 5, 12, 13].map(isShared)).toEqual([false, true, true, false]);
  });
});
```

- [ ] **Step 3: Install and run the test to verify it fails**

Run: `npm install && npx vitest run shared/src/board.test.ts`
Expected: FAIL — cannot resolve `./board`. (An `EBADENGINE` warning on local Node 23 is fine.)

- [ ] **Step 4: Implement types and board**

`shared/src/types.ts`:
```ts
export type Player = 0 | 1;
export type Bit = 0 | 1;
export type Dice = [Bit, Bit, Bit, Bit];
export type Phase = 'awaitingRoll' | 'awaitingMove' | 'finished';

export interface GameState {
  /** pieces[player][i] = position: 0 waiting, 1..14 on the route, 15 borne off */
  pieces: [number[], number[]];
  current: Player;
  phase: Phase;
  dice: Dice | null;
  roll: number | null;
  winner: Player | null;
  /** Increments on every roll and move; used to order and dedupe updates. */
  turn: number;
}

export interface Move {
  piece: number;
  from: number;
  to: number;
  capture: boolean;
  rosette: boolean;
  bearOff: boolean;
}

export type PassReason = 'zero' | 'noMoves';

export type GameEvent =
  | { type: 'rolled'; player: Player; dice: Dice; roll: number }
  | { type: 'passed'; player: Player; reason: PassReason }
  | { type: 'moved'; player: Player; piece: number; from: number; to: number }
  | { type: 'captured'; player: Player; victim: Player; piece: number; at: number }
  | { type: 'rosette'; player: Player; at: number }
  | { type: 'borneOff'; player: Player; piece: number }
  | { type: 'won'; player: Player };

export const other = (p: Player): Player => (p === 0 ? 1 : 0);
```

`shared/src/board.ts`:
```ts
import type { Player } from './types';

export const PIECES = 7;
export const START = 0;
export const OFF = 15;
export const CENTRAL_ROSETTE = 8;
export const ROSETTES: readonly number[] = [4, 8, 14];

export const isRosette = (pos: number) => ROSETTES.includes(pos);
export const isShared = (pos: number) => pos >= 5 && pos <= 12;

export type Row = 0 | 1 | 2;
export interface Cell { row: Row; col: number }

/** Player 0 owns the top row (0), player 1 the bottom row (2). */
export const homeRow = (p: Player): Row => (p === 0 ? 0 : 2);

/** Board cell for a route position, or null when waiting (0) or borne off (15). */
export function cellFor(player: Player, pos: number): Cell | null {
  if (pos < 1 || pos > 14) return null;
  if (pos <= 4) return { row: homeRow(player), col: 4 - pos };
  if (pos <= 12) return { row: 1, col: pos - 5 };
  return { row: homeRow(player), col: 20 - pos };
}

export type Motif = 'rosette' | 'eyes' | 'fiveDots' | 'twelveDots' | 'fourPanels';

/** Square motifs of the British Museum board; null = no square. */
export const BOARD: readonly (readonly (Motif | null)[])[] = [
  ['rosette', 'eyes', 'fiveDots', 'eyes', null, null, 'rosette', 'fourPanels'],
  ['twelveDots', 'fiveDots', 'eyes', 'rosette', 'twelveDots', 'fiveDots', 'eyes', 'twelveDots'],
  ['rosette', 'eyes', 'fiveDots', 'eyes', null, null, 'rosette', 'fourPanels'],
];
```

`shared/src/index.ts`:
```ts
export * from './types';
export * from './board';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run shared/src/board.test.ts && npx tsc -p shared`
Expected: 6 tests PASS; tsc prints nothing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts shared
git commit -m "feat: workspace scaffold and board geometry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rules engine

**Files:**
- Create: `shared/src/dice.ts`, `shared/src/rng.ts`, `shared/src/rules.ts`, `shared/src/explain.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/rules.test.ts`, `shared/src/explain.test.ts`

**Interfaces:**
- Consumes: Task 1 types/board.
- Produces:
  - `type Rng = () => number` (uniform `[0,1)`), `mulberry32(seed: number): Rng`
  - `ROLL_ODDS: readonly number[]` (index = total), `rollDice(rng: Rng): Dice`, `diceTotal(d: Dice): number`, `diceForTotal(n: number): Dice`
  - `class RuleError extends Error { code: 'badPhase' | 'illegalMove' }`
  - `newGame(starting: Player): GameState`
  - `legalMoves(state: GameState): Move[]` — for the current player and `state.roll`; waiting pieces produce one canonical entering move (lowest waiting index)
  - `applyRoll(state, dice: Dice): { state: GameState; events: GameEvent[] }`
  - `applyMove(state, piece: number): { state: GameState; events: GameEvent[] }` — any waiting piece index may be used to enter
  - `whyCannotMove(state, piece: number): string | null`

- [ ] **Step 1: Write the failing rules tests**

`shared/src/rules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ROLL_ODDS, diceForTotal, diceTotal, rollDice } from './dice';
import { RuleError, applyMove, applyRoll, legalMoves, newGame } from './rules';
import type { GameState } from './types';

const pad = (xs: number[]) => [...xs, ...Array(7 - xs.length).fill(0)];
const at = (p0: number[], p1: number[] = [], extra: Partial<GameState> = {}): GameState => ({
  ...newGame(0),
  pieces: [pad(p0), pad(p1)],
  ...extra,
});
const rolled = (s: GameState, n: number): GameState => ({ ...s, phase: 'awaitingMove', roll: n, dice: diceForTotal(n) });
const seq = (...xs: number[]) => () => xs.shift()!;

describe('dice', () => {
  it('counts marked tips facing up', () => {
    expect(rollDice(seq(0.1, 0.9, 0.2, 0.7))).toEqual([1, 0, 1, 0]);
    expect(diceTotal([1, 1, 0, 1])).toBe(3);
  });
  it('has the 1/4/6/4/1 distribution', () => {
    expect(ROLL_ODDS.map((p) => p * 16)).toEqual([1, 4, 6, 4, 1]);
  });
  it('builds dice for a total', () => {
    expect(diceTotal(diceForTotal(3))).toBe(3);
  });
});

describe('newGame', () => {
  it('starts with all 7 pieces waiting and the starter to roll', () => {
    const g = newGame(1);
    expect(g.pieces).toEqual([Array(7).fill(0), Array(7).fill(0)]);
    expect(g).toMatchObject({ current: 1, phase: 'awaitingRoll', winner: null, turn: 0 });
  });
});

describe('legalMoves', () => {
  it('offers a single entering move when all pieces wait', () => {
    expect(legalMoves(rolled(newGame(0), 3))).toEqual([
      { piece: 0, from: 0, to: 3, capture: false, rosette: false, bearOff: false },
    ]);
  });
  it('forbids landing on your own piece', () => {
    const moves = legalMoves(rolled(at([2, 4]), 2));
    // pieces [2, 4, 0…], roll 2: 2→4 blocked by own piece, entering →2 blocked by own piece, 4→6 legal
    expect(moves.map((m) => m.piece)).toEqual([1]);
  });
  it('captures an opponent in the shared row', () => {
    const [m] = legalMoves(rolled(at([6, 15, 15, 15, 15, 15, 15], [9]), 3));
    expect(m).toMatchObject({ piece: 0, to: 9, capture: true });
  });
  it('does not treat private squares as shared', () => {
    const [m] = legalMoves(rolled(at([], [3]), 3));
    expect(m).toMatchObject({ to: 3, capture: false });
  });
  it('protects a piece on the central rosette', () => {
    const moves = legalMoves(rolled(at([6, 15, 15, 15, 15, 15, 15], [8]), 2));
    expect(moves).toEqual([]);
  });
  it('requires an exact roll to bear off', () => {
    const s = at([13, 15, 15, 15, 15, 15, 15]);
    expect(legalMoves(rolled(s, 2))).toEqual([{ piece: 0, from: 13, to: 15, capture: false, rosette: false, bearOff: true }]);
    expect(legalMoves(rolled(s, 3))).toEqual([]);
  });
  it('never moves borne-off pieces and returns nothing outside awaitingMove', () => {
    expect(legalMoves(rolled(at(Array(7).fill(15)), 1))).toEqual([]);
    expect(legalMoves(newGame(0))).toEqual([]);
  });
});

describe('applyRoll', () => {
  it('moves to awaitingMove when a move exists', () => {
    const { state, events } = applyRoll(newGame(0), diceForTotal(2));
    expect(state).toMatchObject({ phase: 'awaitingMove', roll: 2, current: 0, turn: 1 });
    expect(events).toEqual([{ type: 'rolled', player: 0, dice: diceForTotal(2), roll: 2 }]);
  });
  it('passes the turn on a roll of 0', () => {
    const { state, events } = applyRoll(newGame(0), diceForTotal(0));
    expect(state).toMatchObject({ phase: 'awaitingRoll', current: 1, roll: 0 });
    expect(events[1]).toEqual({ type: 'passed', player: 0, reason: 'zero' });
  });
  it('passes the turn when no legal move exists', () => {
    const { state, events } = applyRoll(at([14, 15, 15, 15, 15, 15, 15]), diceForTotal(3));
    expect(state).toMatchObject({ phase: 'awaitingRoll', current: 1 });
    expect(events[1]).toEqual({ type: 'passed', player: 0, reason: 'noMoves' });
  });
  it('rejects rolling twice', () => {
    const { state } = applyRoll(newGame(0), diceForTotal(2));
    expect(() => applyRoll(state, diceForTotal(1))).toThrowError(RuleError);
  });
});

describe('applyMove', () => {
  it('moves a piece and passes the turn', () => {
    const { state, events } = applyMove(rolled(newGame(0), 2), 0);
    expect(state.pieces[0][0]).toBe(2);
    expect(state).toMatchObject({ current: 1, phase: 'awaitingRoll', turn: 1 });
    expect(events).toEqual([{ type: 'moved', player: 0, piece: 0, from: 0, to: 2 }]);
  });
  it('lets any waiting piece be the one that enters', () => {
    const { state } = applyMove(rolled(newGame(0), 2), 5);
    expect(state.pieces[0][5]).toBe(2);
    expect(state.pieces[0][0]).toBe(0);
  });
  it('grants another roll on a rosette', () => {
    const { state, events } = applyMove(rolled(newGame(0), 4), 0);
    expect(state.current).toBe(0);
    expect(events).toContainEqual({ type: 'rosette', player: 0, at: 4 });
  });
  it('sends a captured piece home', () => {
    const { state, events } = applyMove(rolled(at([6], [5, 9]), 3), 0);
    expect(state.pieces[1]).toEqual([5, 0, 0, 0, 0, 0, 0]);
    expect(events).toContainEqual({ type: 'captured', player: 0, victim: 1, piece: 1, at: 9 });
  });
  it('reports bearing off and detects the win', () => {
    const { state, events } = applyMove(rolled(at([14, 15, 15, 15, 15, 15, 15]), 1), 0);
    expect(state).toMatchObject({ phase: 'finished', winner: 0 });
    expect(events).toEqual([
      { type: 'moved', player: 0, piece: 0, from: 14, to: 15 },
      { type: 'borneOff', player: 0, piece: 0 },
      { type: 'won', player: 0 },
    ]);
  });
  it('rejects illegal moves and moves outside awaitingMove', () => {
    expect(() => applyMove(rolled(at([13, 15, 15, 15, 15, 15, 15]), 3), 0)).toThrowError(/cannot move/);
    expect(() => applyMove(newGame(0), 0)).toThrowError(RuleError);
  });
});
```

`shared/src/explain.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { diceForTotal } from './dice';
import { whyCannotMove } from './explain';
import { newGame } from './rules';
import type { GameState } from './types';

const pad = (xs: number[]) => [...xs, ...Array(7 - xs.length).fill(0)];
const rolled = (p0: number[], p1: number[], n: number): GameState => ({
  ...newGame(0), pieces: [pad(p0), pad(p1)], phase: 'awaitingMove', roll: n, dice: diceForTotal(n),
});

describe('whyCannotMove', () => {
  it('returns null for a legal move, including any waiting piece', () => {
    expect(whyCannotMove(rolled([], [], 2), 4)).toBeNull();
  });
  it('explains each kind of illegal move', () => {
    expect(whyCannotMove(newGame(0), 0)).toBe('Roll the dice first.');
    expect(whyCannotMove(rolled([15], [], 2), 0)).toBe('That piece has already finished.');
    expect(whyCannotMove(rolled([13], [], 3), 0)).toBe('Bearing off needs an exact roll — this piece needs exactly 2.');
    expect(whyCannotMove(rolled([2, 4], [], 2), 0)).toBe('Your own piece is already on that square.');
    expect(whyCannotMove(rolled([6], [8], 2), 0)).toBe('Your rival is safe on the central rosette.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/src/rules.test.ts shared/src/explain.test.ts`
Expected: FAIL — cannot resolve `./dice` / `./rules` / `./explain`.

- [ ] **Step 3: Implement dice, rng, rules, explain**

`shared/src/rng.ts`:
```ts
/** Uniform random number in [0, 1). */
export type Rng = () => number;

/** Small deterministic PRNG for tests and simulations. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`shared/src/dice.ts`:
```ts
import type { Rng } from './rng';
import type { Dice } from './types';

/** Probability of each total 0..4 with four binary tetrahedral dice. */
export const ROLL_ODDS: readonly number[] = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

export function rollDice(rng: Rng): Dice {
  return [0, 1, 2, 3].map(() => (rng() < 0.5 ? 1 : 0)) as Dice;
}

export const diceTotal = (d: Dice) => d[0] + d[1] + d[2] + d[3];

export function diceForTotal(total: number): Dice {
  return [0, 1, 2, 3].map((i) => (i < total ? 1 : 0)) as Dice;
}
```

`shared/src/rules.ts`:
```ts
import { CENTRAL_ROSETTE, OFF, PIECES, START, isRosette, isShared } from './board';
import { diceTotal } from './dice';
import { other, type Dice, type GameEvent, type GameState, type Move, type Player } from './types';

export class RuleError extends Error {
  constructor(readonly code: 'badPhase' | 'illegalMove', message: string) {
    super(message);
  }
}

export interface Transition { state: GameState; events: GameEvent[] }

export function newGame(starting: Player): GameState {
  return {
    pieces: [Array(PIECES).fill(START), Array(PIECES).fill(START)],
    current: starting,
    phase: 'awaitingRoll',
    dice: null,
    roll: null,
    winner: null,
    turn: 0,
  };
}

export function legalMoves(state: GameState): Move[] {
  if (state.phase !== 'awaitingMove' || !state.roll) return [];
  const roll = state.roll;
  const mine = state.pieces[state.current];
  const theirs = state.pieces[other(state.current)];
  const moves: Move[] = [];
  let enteringOffered = false;
  mine.forEach((from, piece) => {
    if (from === OFF) return;
    if (from === START) {
      if (enteringOffered) return;
      enteringOffered = true;
    }
    const to = from + roll;
    if (to > OFF) return;
    if (to !== OFF && mine.includes(to)) return;
    const capture = isShared(to) && theirs.includes(to);
    if (capture && to === CENTRAL_ROSETTE) return;
    moves.push({ piece, from, to, capture, rosette: isRosette(to), bearOff: to === OFF });
  });
  return moves;
}

export function applyRoll(state: GameState, dice: Dice): Transition {
  if (state.phase !== 'awaitingRoll') throw new RuleError('badPhase', 'It is not time to roll.');
  const player = state.current;
  const roll = diceTotal(dice);
  const events: GameEvent[] = [{ type: 'rolled', player, dice, roll }];
  let next: GameState = { ...state, dice, roll, phase: 'awaitingMove', turn: state.turn + 1 };
  if (roll === 0 || legalMoves(next).length === 0) {
    events.push({ type: 'passed', player, reason: roll === 0 ? 'zero' : 'noMoves' });
    next = { ...next, phase: 'awaitingRoll', current: other(player) };
  }
  return { state: next, events };
}

export function applyMove(state: GameState, piece: number): Transition {
  if (state.phase !== 'awaitingMove') throw new RuleError('badPhase', 'It is not time to move.');
  const me = state.current;
  const them = other(me);
  const tappedFrom = state.pieces[me][piece];
  const found = legalMoves(state).find(
    (m) => m.piece === piece || (tappedFrom === START && m.from === START),
  );
  if (!found) throw new RuleError('illegalMove', 'That piece cannot move.');
  const move = { ...found, piece };

  const pieces: [number[], number[]] = [[...state.pieces[0]], [...state.pieces[1]]];
  pieces[me][piece] = move.to;
  const events: GameEvent[] = [{ type: 'moved', player: me, piece, from: move.from, to: move.to }];

  if (move.capture) {
    const victim = pieces[them].indexOf(move.to);
    pieces[them][victim] = START;
    events.push({ type: 'captured', player: me, victim: them, piece: victim, at: move.to });
  }
  if (move.bearOff) events.push({ type: 'borneOff', player: me, piece });

  if (pieces[me].every((p) => p === OFF)) {
    events.push({ type: 'won', player: me });
    return { state: { ...state, pieces, phase: 'finished', winner: me, turn: state.turn + 1 }, events };
  }
  if (move.rosette) events.push({ type: 'rosette', player: me, at: move.to });
  return {
    state: { ...state, pieces, phase: 'awaitingRoll', current: move.rosette ? me : them, turn: state.turn + 1 },
    events,
  };
}
```

`shared/src/explain.ts`:
```ts
import { CENTRAL_ROSETTE, OFF, START } from './board';
import { legalMoves } from './rules';
import { other, type GameState } from './types';

/** Human-readable reason the current player cannot move `piece`, or null if they can. */
export function whyCannotMove(state: GameState, piece: number): string | null {
  if (state.phase === 'finished') return 'The game is over.';
  if (state.phase === 'awaitingRoll') return 'Roll the dice first.';
  const me = state.current;
  const from = state.pieces[me][piece];
  if (legalMoves(state).some((m) => m.piece === piece || (from === START && m.from === START))) return null;
  if (from === OFF) return 'That piece has already finished.';
  const to = from + (state.roll ?? 0);
  if (to > OFF) return `Bearing off needs an exact roll — this piece needs exactly ${OFF - from}.`;
  if (state.pieces[me].includes(to)) return 'Your own piece is already on that square.';
  if (to === CENTRAL_ROSETTE && state.pieces[other(me)].includes(to)) return 'Your rival is safe on the central rosette.';
  return 'That piece cannot move.';
}
```

`shared/src/index.ts` (replace):
```ts
export * from './types';
export * from './board';
export * from './rng';
export * from './dice';
export * from './rules';
export * from './explain';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run shared && npx tsc -p shared`
Expected: all PASS; tsc silent.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat: rules engine with dice, moves, captures, rosettes, bear-off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rules property tests

**Files:**
- Test: `shared/src/rules.property.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `rollDice`, `ROLL_ODDS`, `applyRoll`, `applyMove`, `legalMoves`, `newGame`, `OFF`, `isShared`.

- [ ] **Step 1: Write the property test**

`shared/src/rules.property.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { OFF, isShared } from './board';
import { ROLL_ODDS, diceTotal, rollDice } from './dice';
import { mulberry32 } from './rng';
import { applyMove, applyRoll, legalMoves, newGame } from './rules';
import type { GameState } from './types';

function checkInvariants(s: GameState) {
  for (const side of s.pieces) {
    expect(side).toHaveLength(7);
    for (const pos of side) expect(pos >= 0 && pos <= OFF).toBe(true);
    const onBoard = side.filter((p) => p >= 1 && p <= 14);
    expect(new Set(onBoard).size).toBe(onBoard.length);
  }
  const shared0 = s.pieces[0].filter(isShared);
  for (const pos of s.pieces[1].filter(isShared)) expect(shared0).not.toContain(pos);
  if (s.phase === 'awaitingMove') expect(legalMoves(s).length).toBeGreaterThan(0);
  if (s.phase === 'finished') expect(s.pieces[s.winner!].every((p) => p === OFF)).toBe(true);
}

describe('random play', () => {
  it('keeps every invariant across 2000 complete games', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = mulberry32(seed);
      let s = newGame(seed % 2 === 0 ? 0 : 1);
      let steps = 0;
      while (s.phase !== 'finished') {
        if (s.phase === 'awaitingRoll') s = applyRoll(s, rollDice(rng)).state;
        else {
          const moves = legalMoves(s);
          s = applyMove(s, moves[Math.floor(rng() * moves.length)].piece).state;
        }
        checkInvariants(s);
        expect(++steps).toBeLessThan(5000);
      }
    }
  });

  it('rolls with the 1/4/6/4/1 distribution', () => {
    const rng = mulberry32(42);
    const counts = [0, 0, 0, 0, 0];
    const n = 160_000;
    for (let i = 0; i < n; i++) counts[diceTotal(rollDice(rng))]++;
    counts.forEach((c, total) => expect(Math.abs(c / n - ROLL_ODDS[total])).toBeLessThan(0.01));
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run shared/src/rules.property.test.ts`
Expected: PASS (both tests). If an invariant fails, fix `rules.ts` — not the test.

- [ ] **Step 3: Commit**

```bash
git add shared/src/rules.property.test.ts
git commit -m "test: property tests over thousands of random games

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Computer opponent

**Files:**
- Create: `shared/src/ai.ts`
- Modify: `shared/src/index.ts` (add `export * from './ai';`)
- Test: `shared/src/ai.test.ts`

**Interfaces:**
- Consumes: rules, dice, rng.
- Produces:
  - `type AiLevel = 'easy' | 'medium' | 'hard'`
  - `interface AiOptions { rng?: Rng; now?: () => number; budgetMs?: number; maxDepth?: number }`
  - `evaluate(state: GameState, me: Player): number`
  - `chooseMove(state: GameState, level: AiLevel, opts?: AiOptions): number` — returns a piece index legal for `applyMove`; throws `RuleError('illegalMove')` if there is no move.

Search depth = number of decision plies. Easy = depth 1 (greedy) with 25 % random moves; Medium = depth 2 (my move, then the opponent's best reply averaged over their roll); Hard = iterative deepening from depth 2 up to `maxDepth` (default 8) until `budgetMs` (default 500) elapses, keeping the last fully completed depth.

- [ ] **Step 1: Write the failing AI tests**

`shared/src/ai.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { chooseMove, evaluate, type AiLevel, type AiOptions } from './ai';
import { diceForTotal, rollDice } from './dice';
import { mulberry32 } from './rng';
import { applyMove, applyRoll, legalMoves, newGame } from './rules';
import type { GameState, Player } from './types';

const pad = (xs: number[]) => [...xs, ...Array(7 - xs.length).fill(0)];
const rolled = (p0: number[], p1: number[], n: number): GameState => ({
  ...newGame(0), pieces: [pad(p0), pad(p1)], phase: 'awaitingMove', roll: n, dice: diceForTotal(n),
});

function randomPositions(count: number, seed: number): GameState[] {
  const rng = mulberry32(seed);
  const out: GameState[] = [];
  while (out.length < count) {
    let s = newGame(0);
    const stop = Math.floor(rng() * 120);
    for (let i = 0; i < stop && s.phase !== 'finished'; i++) {
      if (s.phase === 'awaitingRoll') s = applyRoll(s, rollDice(rng)).state;
      else s = applyMove(s, legalMoves(s)[0].piece).state;
    }
    if (s.phase === 'awaitingMove') out.push(s);
  }
  return out;
}

function playMatch(a: AiLevel, b: AiLevel, seed: number, opts: AiOptions = {}): Player {
  const rng = mulberry32(seed);
  let s = newGame(seed % 2 === 0 ? 0 : 1);
  while (s.phase !== 'finished') {
    if (s.phase === 'awaitingRoll') s = applyRoll(s, rollDice(rng)).state;
    else s = applyMove(s, chooseMove(s, s.current === 0 ? a : b, { ...opts, rng })).state;
  }
  return s.winner!;
}

describe('evaluate', () => {
  it('is zero-sum and rewards progress', () => {
    const s = rolled([5], [1], 1);
    expect(evaluate(s, 0)).toBeCloseTo(-evaluate(s, 1));
    expect(evaluate(s, 0)).toBeGreaterThan(0);
  });
  it('scores a won game decisively', () => {
    const s: GameState = { ...newGame(0), pieces: [Array(7).fill(15), pad([])], phase: 'finished', winner: 0 };
    expect(evaluate(s, 0)).toBe(1000);
  });
});

describe('chooseMove', () => {
  it('always returns a legal move at every level', () => {
    for (const s of randomPositions(150, 7)) {
      for (const level of ['easy', 'medium', 'hard'] as const) {
        const piece = chooseMove(s, level, { rng: mulberry32(1), budgetMs: 5 });
        expect(() => applyMove(s, piece)).not.toThrow();
      }
    }
  });

  it('takes an obvious capture at medium and hard', () => {
    const s = rolled([6], [9], 3);
    expect(chooseMove(s, 'medium')).toBe(0);
    expect(chooseMove(s, 'hard', { budgetMs: 50 })).toBe(0);
  });

  it('stops searching when the time budget runs out', () => {
    let t = 0;
    const piece = chooseMove(randomPositions(1, 3)[0], 'hard', { now: () => (t += 1), budgetMs: 40 });
    expect(Number.isInteger(piece)).toBe(true);
    expect(t).toBeLessThan(400);
  });

  it('medium beats easy most of the time', () => {
    let wins = 0;
    for (let seed = 1; seed <= 400; seed++) if (playMatch('medium', 'easy', seed) === 0) wins++;
    expect(wins / 400).toBeGreaterThan(0.55);
  });

  it('hard beats easy most of the time', () => {
    let wins = 0;
    for (let seed = 1; seed <= 150; seed++) if (playMatch('hard', 'easy', seed, { maxDepth: 3, budgetMs: 1e9 }) === 0) wins++;
    expect(wins / 150).toBeGreaterThan(0.55);
  }, 180_000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/src/ai.test.ts`
Expected: FAIL — cannot resolve `./ai`.

- [ ] **Step 3: Implement the AI**

`shared/src/ai.ts`:
```ts
import { CENTRAL_ROSETTE, OFF, isShared } from './board';
import { ROLL_ODDS, diceForTotal } from './dice';
import type { Rng } from './rng';
import { RuleError, applyMove, applyRoll, legalMoves } from './rules';
import { other, type GameState, type Move, type Player } from './types';

export type AiLevel = 'easy' | 'medium' | 'hard';
export interface AiOptions { rng?: Rng; now?: () => number; budgetMs?: number; maxDepth?: number }

const WIN = 1000;

/** Probability that an opponent piece 1–4 squares behind `pos` can land on it next roll. */
function danger(pos: number, opponent: number[]): number {
  let p = 0;
  for (let d = 1; d <= 4; d++) if (opponent.includes(pos - d) && pos - d >= 1) p += ROLL_ODDS[d];
  return Math.min(p, 1);
}

function sideScore(state: GameState, p: Player): number {
  const opp = state.pieces[other(p)];
  let s = 0;
  for (const pos of state.pieces[p]) {
    if (pos === OFF) { s += 20; continue; }
    s += pos;
    if (pos === CENTRAL_ROSETTE) s += 4;
    else if (isShared(pos)) s -= danger(pos, opp) * (pos + 3);
  }
  return s;
}

/** Position value from `me`'s point of view; ±1000 for a finished game. */
export function evaluate(state: GameState, me: Player): number {
  if (state.winner !== null) return state.winner === me ? WIN : -WIN;
  return sideScore(state, me) - sideScore(state, other(me));
}

class Timeout extends Error {}

interface Search { me: Player; deadline: number; now: () => number }

function chanceValue(state: GameState, depth: number, ctx: Search): number {
  if (state.phase === 'finished' || depth === 0) return evaluate(state, ctx.me);
  if (ctx.now() > ctx.deadline) throw new Timeout();
  let v = 0;
  for (let r = 0; r <= 4; r++) {
    const next = applyRoll(state, diceForTotal(r)).state;
    v += ROLL_ODDS[r] * (next.phase === 'awaitingMove' ? decisionValue(next, depth, ctx) : chanceValue(next, depth - 1, ctx));
  }
  return v;
}

function decisionValue(state: GameState, depth: number, ctx: Search): number {
  const maximize = state.current === ctx.me;
  let best = maximize ? -Infinity : Infinity;
  for (const m of legalMoves(state)) {
    const v = chanceValue(applyMove(state, m.piece).state, depth - 1, ctx);
    best = maximize ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

function bestAtDepth(state: GameState, moves: Move[], depth: number, ctx: Search): number {
  let best = moves[0].piece;
  let bestValue = -Infinity;
  for (const m of moves) {
    const v = chanceValue(applyMove(state, m.piece).state, depth - 1, ctx);
    if (v > bestValue) { bestValue = v; best = m.piece; }
  }
  return best;
}

export function chooseMove(state: GameState, level: AiLevel, opts: AiOptions = {}): number {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new RuleError('illegalMove', 'No legal moves.');
  if (moves.length === 1) return moves[0].piece;
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? (() => Date.now());
  const unlimited: Search = { me: state.current, deadline: Infinity, now };

  if (level === 'easy') {
    if (rng() < 0.25) return moves[Math.floor(rng() * moves.length)].piece;
    return bestAtDepth(state, moves, 1, unlimited);
  }
  if (level === 'medium') return bestAtDepth(state, moves, 2, unlimited);

  const ctx: Search = { me: state.current, deadline: now() + (opts.budgetMs ?? 500), now };
  let best = bestAtDepth(state, moves, 2, unlimited);
  for (let depth = 3; depth <= (opts.maxDepth ?? 8); depth++) {
    try {
      best = bestAtDepth(state, moves, depth, ctx);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  return best;
}
```

Add to `shared/src/index.ts`:
```ts
export * from './ai';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run shared/src/ai.test.ts && npx tsc -p shared`
Expected: all PASS (the hard tournament takes up to ~2 min). If a tournament threshold fails, improve `evaluate` (e.g. weight danger more) rather than lowering the threshold.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat: expectimax AI with easy, medium and hard levels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Protocol, persistence and game service

**Files:**
- Create: `shared/src/protocol.ts`; modify `shared/src/index.ts` (add `export * from './protocol';`)
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/repo.ts`, `server/src/service.ts`
- Test: `shared/src/protocol.test.ts`, `server/src/service.test.ts`

**Interfaces:**
- Produces (shared/protocol.ts):
  - `type ErrorCode = 'notFound' | 'gameFull' | 'notSeated' | 'notYourTurn' | 'waitingForOpponent' | 'badPhase' | 'illegalMove' | 'badMessage' | 'rateLimited'`
  - `interface RoomSnapshot { gameId: string; state: GameState; seat: Player | null; seated: [boolean, boolean]; connected: [boolean, boolean]; rematch: [boolean, boolean] }`
  - `type ClientMsg = { type: 'roll' } | { type: 'move'; piece: number } | { type: 'rematch' }`
  - `type ServerMsg = { type: 'snapshot'; snapshot: RoomSnapshot; events: GameEvent[] } | { type: 'error'; code: ErrorCode; message: string }`
  - `parseClientMsg(raw: string): ClientMsg | null`
- Produces (server):
  - `openRepo(file: string): Repo` with `insert(rec)`, `get(id)`, `save(id, room, at)`, `setSeatB(id, hash, at): boolean`, `deleteIdle(before): number`, `close()`
  - `interface Room { state: GameState; rematch: [boolean, boolean]; firstPlayer: Player }`
  - `class ServiceError extends Error { code: ErrorCode }`, `normalizeId(id)`, `IDLE_LIMIT_MS`
  - `createGameService({ repo, rng, randomBytes, now }): GameService` with `create(): { gameId; seatToken }`, `join(id): { seatToken }`, `info(id): { gameId; seated: [boolean, boolean] }`, `seatOf(id, token: string | null): Player | null`, `snapshot(id, seat, connected): RoomSnapshot`, `roll(id, seat): GameEvent[]`, `move(id, seat, piece): GameEvent[]`, `rematch(id, seat): GameEvent[]`, `sweep(): number`

- [ ] **Step 1: Server package files and install**

`server/package.json`:
```json
{
  "name": "@ur/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "esbuild src/index.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/index.js --external:better-sqlite3 --external:express --external:ws"
  },
  "dependencies": {
    "@ur/shared": "*",
    "better-sqlite3": "^13.0.3",
    "express": "^5.3.0",
    "ws": "^8.22.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^9.6.0",
    "@types/express": "^5.0.6",
    "@types/node": "^24.0.0",
    "@types/ws": "^8.18.2",
    "esbuild": "^0.28.2"
  }
}
```

`server/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "../shared/src"]
}
```

Run: `npm install`
Expected: installs; `better-sqlite3` builds or downloads a prebuilt binary. If `better-sqlite3` now ships its own types, remove `@types/better-sqlite3`.

- [ ] **Step 2: Write failing protocol and service tests**

`shared/src/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseClientMsg } from './protocol';

describe('parseClientMsg', () => {
  it('accepts valid messages', () => {
    expect(parseClientMsg('{"type":"roll"}')).toEqual({ type: 'roll' });
    expect(parseClientMsg('{"type":"rematch"}')).toEqual({ type: 'rematch' });
    expect(parseClientMsg('{"type":"move","piece":6}')).toEqual({ type: 'move', piece: 6 });
  });
  it('rejects junk', () => {
    for (const raw of ['', 'nope', 'null', '[]', '{"type":"move","piece":7}', '{"type":"move","piece":"1"}', '{"type":"move","piece":1.5}', '{"type":"hack"}']) {
      expect(parseClientMsg(raw)).toBeNull();
    }
  });
});
```

`server/src/service.test.ts`:
```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { mulberry32, newGame, type GameState } from '@ur/shared';
import { openRepo, type Repo } from './repo';
import { IDLE_LIMIT_MS, createGameService, type GameService } from './service';

let counter = 0;
const randomBytes = (n: number) => Buffer.from(Array.from({ length: n }, () => (counter = (counter * 31 + 17) % 256)));

function setup(file = ':memory:', clock = { t: 1_000_000 }) {
  const repo = openRepo(file);
  const service = createGameService({ repo, rng: mulberry32(9), randomBytes, now: () => clock.t });
  return { repo, service, clock };
}

describe('game service', () => {
  let repo: Repo;
  let service: GameService;
  beforeEach(() => ({ repo, service } = setup()));

  function started() {
    const { gameId, seatToken: a } = service.create();
    const { seatToken: b } = service.join(gameId);
    const first = repo.get(gameId)!.room.state.current;
    return { gameId, a, b, first, second: (1 - first) as 0 | 1 };
  }

  it('creates a game with a 6-character code and seats the creator at 0', () => {
    const { gameId, seatToken } = service.create();
    expect(gameId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(service.seatOf(gameId, seatToken)).toBe(0);
    expect(service.seatOf(gameId, null)).toBeNull();
    expect(service.seatOf(gameId, 'someone-else')).toBeNull();
  });

  it('lets exactly one friend join, case-insensitively', () => {
    const { gameId } = service.create();
    const { seatToken } = service.join(` ${gameId.toLowerCase()} `);
    expect(service.seatOf(gameId, seatToken)).toBe(1);
    expect(() => service.join(gameId)).toThrowError(expect.objectContaining({ code: 'gameFull' }));
    expect(() => service.join('ZZZZZZ')).toThrowError(expect.objectContaining({ code: 'notFound' }));
    expect(service.info(gameId.toLowerCase())).toEqual({ gameId, seated: [true, true] });
  });

  it('refuses to roll until the friend has joined', () => {
    const { gameId } = service.create();
    expect(() => service.roll(gameId, 0)).toThrowError(expect.objectContaining({ code: 'waitingForOpponent' }));
  });

  it('enforces turns, seats and phases', () => {
    const { gameId, first, second } = started();
    expect(() => service.roll(gameId, second)).toThrowError(expect.objectContaining({ code: 'notYourTurn' }));
    expect(() => service.roll(gameId, null)).toThrowError(expect.objectContaining({ code: 'notSeated' }));
    const events = service.roll(gameId, first);
    expect(events[0]).toMatchObject({ type: 'rolled', player: first });
    const state = repo.get(gameId)!.room.state;
    if (state.phase === 'awaitingMove') {
      expect(() => service.roll(gameId, first)).toThrowError(expect.objectContaining({ code: 'badPhase' }));
      expect(() => service.move(gameId, first, 99)).toThrowError(expect.objectContaining({ code: 'illegalMove' }));
      expect(service.move(gameId, first, 0)[0]).toMatchObject({ type: 'moved', player: first });
    }
  });

  it('builds snapshots with seats, presence and rematch flags', () => {
    const { gameId } = started();
    expect(service.snapshot(gameId, 1, [true, false])).toMatchObject({
      gameId, seat: 1, seated: [true, true], connected: [true, false], rematch: [false, false],
    });
  });

  it('persists every action across a restart', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'ur-')), 'ur.sqlite');
    const one = setup(file);
    const { gameId } = one.service.create();
    one.service.join(gameId);
    const first = one.repo.get(gameId)!.room.state.current;
    one.service.roll(gameId, first);
    const before = one.repo.get(gameId)!.room.state;
    one.repo.close();
    const two = setup(file);
    expect(two.repo.get(gameId)!.room.state).toEqual(before);
  });

  it('starts a rematch only when both players accept, alternating the starter', () => {
    const { gameId } = started();
    expect(() => service.rematch(gameId, 0)).toThrowError(expect.objectContaining({ code: 'badPhase' }));
    const rec = repo.get(gameId)!;
    const finished: GameState = { ...newGame(0), pieces: [Array(7).fill(15), Array(7).fill(0)], phase: 'finished', winner: 0 };
    repo.save(gameId, { ...rec.room, state: finished }, 1);
    service.rematch(gameId, 0);
    expect(repo.get(gameId)!.room.rematch).toEqual([true, false]);
    service.rematch(gameId, 1);
    const room = repo.get(gameId)!.room;
    expect(room.state).toEqual(newGame(room.firstPlayer));
    expect(room.firstPlayer).toBe(1 - rec.room.firstPlayer);
    expect(room.rematch).toEqual([false, false]);
  });

  it('sweeps games idle for more than 7 days', () => {
    const s = setup();
    const { gameId } = s.service.create();
    s.clock.t += IDLE_LIMIT_MS + 1;
    s.service.create();
    expect(s.service.sweep()).toBe(1);
    expect(() => s.service.info(gameId)).toThrowError(expect.objectContaining({ code: 'notFound' }));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run shared/src/protocol.test.ts server`
Expected: FAIL — cannot resolve `./protocol`, `./repo`, `./service`.

- [ ] **Step 4: Implement protocol, repo, service**

`shared/src/protocol.ts`:
```ts
import { PIECES } from './board';
import type { GameEvent, GameState, Player } from './types';

export type ErrorCode =
  | 'notFound' | 'gameFull' | 'notSeated' | 'notYourTurn' | 'waitingForOpponent'
  | 'badPhase' | 'illegalMove' | 'badMessage' | 'rateLimited';

export interface RoomSnapshot {
  gameId: string;
  state: GameState;
  /** The receiving client's seat; null for spectators. */
  seat: Player | null;
  seated: [boolean, boolean];
  connected: [boolean, boolean];
  rematch: [boolean, boolean];
}

export type ClientMsg = { type: 'roll' } | { type: 'move'; piece: number } | { type: 'rematch' };

export type ServerMsg =
  | { type: 'snapshot'; snapshot: RoomSnapshot; events: GameEvent[] }
  | { type: 'error'; code: ErrorCode; message: string };

export function parseClientMsg(raw: string): ClientMsg | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  if (m.type === 'roll' || m.type === 'rematch') return { type: m.type };
  if (m.type === 'move' && Number.isInteger(m.piece) && (m.piece as number) >= 0 && (m.piece as number) < PIECES) {
    return { type: 'move', piece: m.piece as number };
  }
  return null;
}
```

Add to `shared/src/index.ts`:
```ts
export * from './protocol';
```

`server/src/repo.ts`:
```ts
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
```

`server/src/service.ts`:
```ts
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
  const newToken = () => randomBytes(16).toString('base64url');
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

    snapshot(id: string, seat: Player | null, connected: [boolean, boolean]): RoomSnapshot {
      const rec = load(id);
      return {
        gameId: rec.id,
        state: rec.room.state,
        seat,
        seated: [true, rec.seatHashes[1] !== null],
        connected,
        rematch: rec.room.rematch,
      };
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run shared/src/protocol.test.ts server && npx tsc -p shared && npx tsc -p server`
Expected: all PASS; tsc silent.

- [ ] **Step 6: Commit**

```bash
git add shared server package.json package-lock.json
git commit -m "feat: protocol types, SQLite persistence and authoritative game service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: HTTP API and WebSocket server

**Files:**
- Create: `server/src/rateLimit.ts`, `server/src/sockets.ts`, `server/src/app.ts`, `server/src/index.ts`
- Test: `server/src/app.test.ts`

**Interfaces:**
- Consumes: `GameService`, `ServiceError`, `normalizeId`, `parseClientMsg`, `ServerMsg`.
- Produces:
  - `createRateLimiter({ limit, windowMs, now }): (key: string) => boolean`
  - `attachSockets(server: http.Server, service: GameService): void`
  - `createApp({ service, clientDir?, now? }): http.Server`
  - HTTP: `POST /api/games` → 201 `{ gameId, seatToken }` | 429; `GET /api/games/:id` → 200 `{ gameId, seated }` | 404; `POST /api/games/:id/join` → 200 `{ seatToken }` | 404 | 409; `GET /healthz` → `ok`; any other GET (non-`/api/`) → `index.html`.
  - WS: `/ws?game=<id>&token=<token?>`. Server sends `ServerMsg`; on unknown game sends `error notFound` then closes with code 4404.
  - Env (index.ts): `PORT` (3000), `HOST` (127.0.0.1), `DATA_DIR` (`<repo>/data`), `CLIENT_DIR` (`<repo>/client/dist`).

- [ ] **Step 1: Write the failing integration test**

`server/src/app.test.ts`:
```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { mulberry32, type ServerMsg } from '@ur/shared';
import { createApp } from './app';
import { openRepo } from './repo';
import { createGameService } from './service';
import { randomBytes } from 'node:crypto';

let server: Server;
let base: string;
let clientDir: string;

beforeEach(async () => {
  clientDir = mkdtempSync(path.join(tmpdir(), 'ur-client-'));
  writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>Ur</title>');
  const service = createGameService({ repo: openRepo(':memory:'), rng: mulberry32(3), randomBytes, now: Date.now });
  server = createApp({ service, clientDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const post = (p: string) => fetch(`http://${base}${p}`, { method: 'POST' });

function connect(gameId: string, token?: string) {
  const ws = new WebSocket(`ws://${base}/ws?game=${gameId}${token ? `&token=${token}` : ''}`);
  const inbox: ServerMsg[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (d) => { inbox.push(JSON.parse(d.toString())); waiters.splice(0).forEach((w) => w()); });
  const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
  async function until(pred: (m: ServerMsg) => boolean): Promise<ServerMsg> {
    for (;;) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(0, i + 1).pop()!;
      await new Promise<void>((r) => waiters.push(r));
    }
  }
  const snap = (pred: (s: Extract<ServerMsg, { type: 'snapshot' }>) => boolean = () => true) =>
    until((m) => m.type === 'snapshot' && pred(m)) as Promise<Extract<ServerMsg, { type: 'snapshot' }>>;
  return { ws, until, snap, closed, drain: () => inbox.splice(0), send: (m: object) => ws.send(JSON.stringify(m)) };
}

async function startedGame() {
  const { gameId, seatToken: a } = await (await post('/api/games')).json();
  const { seatToken: b } = await (await post(`/api/games/${gameId}/join`)).json();
  const A = connect(gameId, a);
  const B = connect(gameId, b);
  const sa = await A.snap((m) => m.snapshot.connected[1]);
  await B.snap((m) => m.snapshot.connected[0]);
  return { gameId, A, B, first: sa.snapshot.state.current };
}

describe('HTTP API', () => {
  it('creates, inspects and joins games', async () => {
    const created = await post('/api/games');
    expect(created.status).toBe(201);
    const { gameId } = await created.json();
    expect((await (await fetch(`http://${base}/api/games/${gameId.toLowerCase()}`)).json())).toEqual({ gameId, seated: [true, false] });
    expect((await post(`/api/games/${gameId}/join`)).status).toBe(200);
    expect((await post(`/api/games/${gameId}/join`)).status).toBe(409);
    expect((await fetch(`http://${base}/api/games/NOPE99`)).status).toBe(404);
  });

  it('rate-limits game creation per IP', async () => {
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await post('/api/games')).status);
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it('serves the SPA for client routes but not for unknown API routes', async () => {
    expect(await (await fetch(`http://${base}/g/ABCDEF`)).text()).toContain('<title>Ur</title>');
    expect((await fetch(`http://${base}/api/unknown`)).status).toBe(404);
  });
});

describe('WebSocket play', () => {
  it('broadcasts each action to both players with events', async () => {
    const { A, B, first } = await startedGame();
    const actor = first === 0 ? A : B;
    const watcher = first === 0 ? B : A;
    actor.send({ type: 'roll' });
    const seen = await watcher.snap((m) => m.events.length > 0);
    expect(seen.events[0]).toMatchObject({ type: 'rolled', player: first });
    expect(seen.snapshot.state.turn).toBe(1);
  });

  it('rejects out-of-turn actions only to the sender', async () => {
    const { A, B, first } = await startedGame();
    const wrong = first === 0 ? B : A;
    wrong.send({ type: 'roll' });
    expect(await wrong.until((m) => m.type === 'error')).toMatchObject({ code: 'notYourTurn' });
  });

  it('applies one of two rapid duplicate rolls and rejects the other', async () => {
    const { A, B, first } = await startedGame();
    const actor = first === 0 ? A : B;
    actor.send({ type: 'roll' });
    actor.send({ type: 'roll' });
    const ok = await actor.snap((m) => m.events.length > 0);
    expect(ok.events[0].type).toBe('rolled');
    const err = await actor.until((m) => m.type === 'error' || (m.type === 'snapshot' && m.events.length > 0));
    // The second roll is either rejected (awaitingMove) or, if the first roll passed the turn, rejected as not your turn.
    expect(err).toMatchObject({ type: 'error' });
    expect(['badPhase', 'notYourTurn']).toContain((err as { code: string }).code);
  });

  it('keeps a player connected while a second tab with the same token stays open', async () => {
    const { gameId, seatToken: a } = await (await post('/api/games')).json();
    const tab1 = connect(gameId, a);
    const tab2 = connect(gameId, a);
    expect((await tab2.snap()).snapshot.seat).toBe(0);
    tab2.drain();
    tab1.ws.close();
    const s = await tab2.snap();
    expect(s.snapshot.connected).toEqual([true, false]);
  });

  it('treats tokenless visitors as spectators', async () => {
    const { gameId } = await startedGame();
    const spectator = connect(gameId);
    const s = await spectator.snap();
    expect(s.snapshot.seat).toBeNull();
    spectator.send({ type: 'roll' });
    expect(await spectator.until((m) => m.type === 'error')).toMatchObject({ code: 'notSeated' });
  });

  it('closes connections to unknown games', async () => {
    const c = connect('NOPE99');
    expect(await c.until((m) => m.type === 'error')).toMatchObject({ code: 'notFound' });
    expect(await c.closed).toBe(4404);
  });

  it('rejects malformed messages', async () => {
    const { A } = await startedGame();
    A.ws.send('garbage');
    expect(await A.until((m) => m.type === 'error')).toMatchObject({ code: 'badMessage' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/src/app.test.ts`
Expected: FAIL — cannot resolve `./app`.

- [ ] **Step 3: Implement rate limiter, sockets, app, entrypoint**

`server/src/rateLimit.ts`:
```ts
export function createRateLimiter({ limit, windowMs, now }: { limit: number; windowMs: number; now: () => number }) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    if (hits.size > 10_000) hits.clear();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(t);
    hits.set(key, recent);
    return allowed;
  };
}
```

`server/src/sockets.ts`:
```ts
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMsg, type GameEvent, type Player, type ServerMsg } from '@ur/shared';
import { ServiceError, normalizeId, type GameService } from './service';

interface Conn { ws: WebSocket; gameId: string; seat: Player | null; alive: boolean }

export function attachSockets(server: Server, service: GameService) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
  const rooms = new Map<string, Set<Conn>>();

  const send = (ws: WebSocket, msg: ServerMsg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const sendError = (ws: WebSocket, e: unknown) => {
    if (e instanceof ServiceError) return send(ws, { type: 'error', code: e.code, message: e.message });
    console.error(e);
    send(ws, { type: 'error', code: 'badMessage', message: 'Something went wrong.' });
  };
  const connected = (id: string): [boolean, boolean] => {
    const c: [boolean, boolean] = [false, false];
    for (const k of rooms.get(id) ?? []) if (k.seat !== null) c[k.seat] = true;
    return c;
  };
  const broadcast = (id: string, events: GameEvent[]) => {
    const presence = connected(id);
    for (const k of rooms.get(id) ?? []) {
      try {
        send(k.ws, { type: 'snapshot', snapshot: service.snapshot(id, k.seat, presence), events });
      } catch (e) {
        sendError(k.ws, e);
        k.ws.close(4404, 'notFound');
      }
    }
  };

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let conn: Conn;
    try {
      const gameId = normalizeId(url.searchParams.get('game') ?? '');
      conn = { ws, gameId, seat: service.seatOf(gameId, url.searchParams.get('token')), alive: true };
    } catch (e) {
      sendError(ws, e);
      ws.close(4404, 'notFound');
      return;
    }
    const room = rooms.get(conn.gameId) ?? new Set<Conn>();
    room.add(conn);
    rooms.set(conn.gameId, room);
    broadcast(conn.gameId, []);

    ws.on('pong', () => { conn.alive = true; });
    ws.on('message', (data) => {
      const msg = parseClientMsg(data.toString());
      if (!msg) return send(ws, { type: 'error', code: 'badMessage', message: 'Unrecognised message.' });
      try {
        const events =
          msg.type === 'roll' ? service.roll(conn.gameId, conn.seat)
          : msg.type === 'move' ? service.move(conn.gameId, conn.seat, msg.piece)
          : service.rematch(conn.gameId, conn.seat);
        broadcast(conn.gameId, events);
      } catch (e) {
        sendError(ws, e);
      }
    });
    ws.on('close', () => {
      room.delete(conn);
      if (room.size === 0) rooms.delete(conn.gameId);
      else broadcast(conn.gameId, []);
    });
  });

  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const c of room) {
        if (!c.alive) { c.ws.terminate(); continue; }
        c.alive = false;
        c.ws.ping();
      }
    }
  }, 30_000);
  server.on('close', () => {
    clearInterval(heartbeat);
    for (const c of wss.clients) c.terminate();
    wss.close();
  });
}
```

`server/src/app.ts`:
```ts
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import express, { type Response } from 'express';
import { createRateLimiter } from './rateLimit';
import { ServiceError, type GameService } from './service';
import { attachSockets } from './sockets';

export interface AppOptions { service: GameService; clientDir?: string; now?: () => number }

export function createApp({ service, clientDir, now = Date.now }: AppOptions): Server {
  const app = express();
  app.set('trust proxy', 'loopback');
  const allowCreate = createRateLimiter({ limit: 30, windowMs: 10 * 60_000, now });

  const fail = (res: Response, e: unknown) => {
    if (!(e instanceof ServiceError)) throw e;
    const status = e.code === 'notFound' ? 404 : e.code === 'gameFull' ? 409 : 400;
    res.status(status).json({ code: e.code, message: e.message });
  };

  app.post('/api/games', (req, res) => {
    if (!allowCreate(req.ip ?? 'unknown')) {
      res.status(429).json({ code: 'rateLimited', message: 'Too many new games — try again in a few minutes.' });
      return;
    }
    res.status(201).json(service.create());
  });
  app.get('/api/games/:id', (req, res) => {
    try { res.json(service.info(req.params.id)); } catch (e) { fail(res, e); }
  });
  app.post('/api/games/:id/join', (req, res) => {
    try { res.json(service.join(req.params.id)); } catch (e) { fail(res, e); }
  });
  app.use('/api', (_req, res) => { res.status(404).json({ code: 'notFound', message: 'Unknown endpoint.' }); });
  app.get('/healthz', (_req, res) => { res.send('ok'); });

  if (clientDir && existsSync(clientDir)) {
    app.use('/assets', express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(clientDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  const server = createServer(app);
  attachSockets(server, service);
  return server;
}
```

`server/src/index.ts`:
```ts
import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { openRepo } from './repo';
import { createGameService } from './service';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = process.env.DATA_DIR ?? path.resolve(here, '../../data');
const clientDir = process.env.CLIENT_DIR ?? path.resolve(here, '../../client/dist');

mkdirSync(dataDir, { recursive: true });
const repo = openRepo(path.join(dataDir, 'ur.sqlite'));
const service = createGameService({
  repo,
  rng: () => randomInt(0, 2 ** 32) / 2 ** 32,
  randomBytes,
  now: Date.now,
});
const server = createApp({ service, clientDir });

setInterval(() => service.sweep(), 60 * 60_000).unref();
server.listen(port, host, () => console.log(`Royal Game of Ur listening on http://${host}:${port}`));

const shutdown = () => {
  server.close();
  repo.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run server && npx tsc -p server && npm run build -w server && ls server/dist/index.js`
Expected: all PASS; tsc silent; bundle exists.

- [ ] **Step 5: Smoke-run the server**

Run: `PORT=3999 DATA_DIR=/tmp/ur-smoke node server/dist/index.js & sleep 1; curl -s -XPOST localhost:3999/api/games; curl -s localhost:3999/healthz; kill %1`
Expected: JSON with `gameId` and `seatToken`, then `ok`.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat: HTTP API and WebSocket rooms with presence and rate limiting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Client scaffold, theme, board rendering and home page

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/svelte.config.js`, `client/index.html`
- Create: `client/src/main.ts`, `client/src/App.svelte`, `client/src/styles/theme.css`
- Create: `client/src/lib/router.svelte.ts`, `client/src/lib/motion.ts`
- Create: `client/src/board/geometry.ts`, `effects.ts`, `SvgDefs.svelte`, `Motif.svelte`, `BoardTiles.svelte`, `MiniBoard.svelte`, `Piece.svelte`
- Create: `client/src/game/api.ts`, `client/src/game/storage.ts`
- Create: `client/src/screens/Home.svelte`, `client/src/screens/NotFound.svelte`
- Modify: `vitest.config.ts` (include client tests)
- Test: `client/src/board/geometry.test.ts`

**Interfaces:**
- Consumes: `BOARD`, `cellFor`, `START`, `OFF`, `Player`, `Motif` from `@ur/shared`.
- Produces:
  - geometry: `S=100`, `G=10`, `PAD=28`, `TRAY=118`, `W`, `H`, `PIECE_R=34`, `TRAY_R=27`, `TRAY_STEP=62`, `type Point`, `FRAME_BLOCKS`, `blockRect(b)`, `displayRow(row, perspective)`, `cellOrigin(row, col, perspective)`, `cellCenter(row, col, perspective)`, `traySlot(player, 'waiting' | 'off', index, perspective)`, `piecePoint(player, pos, slot, perspective)`, `trayRanks(positions)`
  - `interface Effect { id: number; kind: 'capture' | 'rosette' | 'bearOff'; at: Point }`
  - router: `route.path`, `navigate(to, replace?)`, `link` action
  - motion: `reducedMotion()`, `sleep(ms)`
  - api: `ApiError { status }`, `createGame()`, `gameInfo(id)`, `joinGame(id)`
  - storage: `seatTokens.get(id)`, `seatTokens.set(id, token)`
  - `<Piece x y player scale? key? movable? selected? duration? label? onactivate? onhover? onselect? />` — root `<g data-piece={key} data-movable>`
  - `<MiniBoard label trays?>{children}</MiniBoard>`; `<BoardTiles />`; `<SvgDefs />` (mounted once in App; provides gradient ids `ur-tile`, `ur-gold`, `ur-piece-0`, `ur-piece-1`, `ur-sheen`, clip `ur-frame-clip`)
  - `<NotFound title? message? />`

- [ ] **Step 1: Client package and config**

`client/package.json`:
```json
{
  "name": "@ur/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "icons": "node scripts/make-icons.mjs"
  },
  "dependencies": { "@ur/shared": "*" },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^7.3.1",
    "@tsconfig/svelte": "^5.0.8",
    "svelte": "^5.57.2",
    "svelte-check": "^4.7.6",
    "vite": "^8.3.4"
  }
}
```

`client/tsconfig.json`:
```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "../shared/src/**/*.ts"]
}
```

`client/vite.config.ts`:
```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
    },
  },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
```

`client/svelte.config.js`:
```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default { preprocess: vitePreprocess() };
```

`client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>The Royal Game of Ur</title>
    <meta name="description" content="Play the 4,500-year-old Royal Game of Ur online with a friend, against the computer, or pass and play." />
    <meta name="theme-color" content="#0b1438" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`vitest.config.ts` — change the include line to:
```ts
    include: ['shared/src/**/*.test.ts', 'server/src/**/*.test.ts', 'client/src/**/*.test.ts'],
```

Run: `npm install`
Expected: installs Svelte/Vite into the workspace.

- [ ] **Step 2: Write the failing geometry test**

`client/src/board/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { H, W, cellCenter, piecePoint, traySlot, trayRanks } from './geometry';

describe('client board geometry', () => {
  it('draws the perspective player’s home row at the bottom', () => {
    expect(piecePoint(0, 1, 0, 0).y).toBeGreaterThan(piecePoint(0, 5, 0, 0).y);
    expect(piecePoint(1, 1, 0, 0).y).toBeLessThan(piecePoint(0, 5, 0, 0).y);
    expect(piecePoint(1, 1, 0, 1).y).toBeGreaterThan(piecePoint(1, 5, 0, 1).y);
  });

  it('places on-board pieces at cell centres', () => {
    expect(piecePoint(0, 8, 0, 0)).toEqual(cellCenter(1, 3, 0));
  });

  it('puts your tray at the bottom, waiting pieces left and finished pieces right', () => {
    const w0 = traySlot(0, 'waiting', 0, 0);
    const w6 = traySlot(0, 'waiting', 6, 0);
    const o0 = traySlot(0, 'off', 0, 0);
    const o6 = traySlot(0, 'off', 6, 0);
    expect(w0.y).toBeGreaterThan(H / 2);
    expect(traySlot(1, 'waiting', 0, 0).y).toBeLessThan(H / 2);
    expect(w6.x).toBeGreaterThan(w0.x);
    expect(o6.x).toBeLessThan(o0.x);
    expect(w6.x).toBeLessThan(o6.x);
    for (const p of [w0, w6, o0, o6]) expect(p.x > 0 && p.x < W).toBe(true);
  });

  it('ranks pieces within the waiting and finished trays', () => {
    expect(trayRanks([0, 5, 0, 15, 0, 15, 3])).toEqual([0, 0, 1, 0, 2, 1, 0]);
  });
});
```

Run: `npx vitest run client`
Expected: FAIL — cannot resolve `./geometry`.

- [ ] **Step 3: Implement geometry, effects, motion, router, api, storage**

`client/src/board/geometry.ts`:
```ts
import { OFF, START, cellFor, type Player } from '@ur/shared';

export const S = 100;
export const G = 10;
export const PAD = 28;
export const TRAY = 118;
export const W = PAD * 2 + 8 * S + 7 * G;
export const H = TRAY * 2 + PAD * 2 + 3 * S + 2 * G;
export const PIECE_R = 34;
export const TRAY_R = 27;
export const TRAY_STEP = 62;

export interface Point { x: number; y: number }

/** Board outline: left block, bridge, right block. */
export const FRAME_BLOCKS = [
  { c0: 0, c1: 3, r0: 0, r1: 2 },
  { c0: 4, c1: 5, r0: 1, r1: 1 },
  { c0: 6, c1: 7, r0: 0, r1: 2 },
] as const;

export function blockRect(b: (typeof FRAME_BLOCKS)[number]) {
  return {
    x: PAD + b.c0 * (S + G) - G,
    y: TRAY + PAD + b.r0 * (S + G) - G,
    width: (b.c1 - b.c0 + 1) * (S + G) + G,
    height: (b.r1 - b.r0 + 1) * (S + G) + G,
  };
}

/** The perspective player's home row is drawn at the bottom. */
export const displayRow = (row: number, perspective: Player) => (perspective === 0 ? 2 - row : row);

export function cellOrigin(row: number, col: number, perspective: Player): Point {
  return { x: PAD + col * (S + G), y: TRAY + PAD + displayRow(row, perspective) * (S + G) };
}

export function cellCenter(row: number, col: number, perspective: Player): Point {
  const o = cellOrigin(row, col, perspective);
  return { x: o.x + S / 2, y: o.y + S / 2 };
}

export function traySlot(player: Player, kind: 'waiting' | 'off', index: number, perspective: Player): Point {
  const y = player === perspective ? H - TRAY / 2 : TRAY / 2;
  return kind === 'waiting'
    ? { x: PAD + TRAY_R + 8 + index * TRAY_STEP, y }
    : { x: W - PAD - TRAY_R - 8 - index * TRAY_STEP, y };
}

/** Where a piece at `pos` is drawn; `slot` is its rank within its tray (ignored on the board). */
export function piecePoint(player: Player, pos: number, slot: number, perspective: Player): Point {
  if (pos === START) return traySlot(player, 'waiting', slot, perspective);
  if (pos === OFF) return traySlot(player, 'off', slot, perspective);
  const c = cellFor(player, pos)!;
  return cellCenter(c.row, c.col, perspective);
}

/** For each piece, its rank among the same player's pieces in the same tray. */
export function trayRanks(positions: number[]): number[] {
  const counts: Record<number, number> = { [START]: 0, [OFF]: 0 };
  return positions.map((p) => (p === START || p === OFF ? counts[p]++ : 0));
}
```

`client/src/board/effects.ts`:
```ts
import type { Point } from './geometry';

export interface Effect { id: number; kind: 'capture' | 'rosette' | 'bearOff'; at: Point }
```

`client/src/lib/motion.ts`:
```ts
export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const sleep = (ms: number) => (ms <= 0 ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, ms)));
```

`client/src/lib/router.svelte.ts`:
```ts
let path = $state(location.pathname);

window.addEventListener('popstate', () => {
  path = location.pathname;
});

export const route = {
  get path() {
    return path;
  },
};

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  path = location.pathname;
  window.scrollTo(0, 0);
}

/** Svelte action: client-side navigation for internal links. */
export function link(node: HTMLAnchorElement) {
  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(node.getAttribute('href') ?? '/');
  };
  node.addEventListener('click', onClick);
  return { destroy: () => node.removeEventListener('click', onClick) };
}
```

`client/src/game/api.ts`:
```ts
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method });
  } catch {
    throw new ApiError(0, 'Could not reach the server — check your connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.message ?? 'Something went wrong.');
  return body as T;
}

export const createGame = () => call<{ gameId: string; seatToken: string }>('/api/games', 'POST');
export const gameInfo = (id: string) =>
  call<{ gameId: string; seated: [boolean, boolean] }>(`/api/games/${encodeURIComponent(id)}`);
export const joinGame = (id: string) =>
  call<{ seatToken: string }>(`/api/games/${encodeURIComponent(id)}/join`, 'POST');
```

`client/src/game/storage.ts`:
```ts
const key = (gameId: string) => `ur.seat.${gameId.toUpperCase()}`;

export const seatTokens = {
  get(gameId: string): string | null {
    try { return localStorage.getItem(key(gameId)); } catch { return null; }
  },
  set(gameId: string, token: string) {
    try { localStorage.setItem(key(gameId), token); } catch { /* private mode: seat lasts this tab only */ }
  },
};
```

Run: `npx vitest run client`
Expected: 4 tests PASS.

- [ ] **Step 4: Theme and global styles**

`client/src/styles/theme.css`:
```css
:root {
  --lapis-950: #060a1f;
  --lapis-900: #0b1438;
  --lapis-800: #10205a;
  --lapis-700: #16307e;
  --lapis-600: #1b2f74;
  --gold: #e2bf63;
  --gold-leaf: #d9b45a;
  --gold-deep: #b8892e;
  --gold-pale: #f3d27a;
  --carnelian: #c7512f;
  --carnelian-deep: #7a2a16;
  --shell: #f4ead6;
  --font-display: 'Cinzel', 'Trajan Pro', Georgia, serif;
  --font-body: 'Cormorant Garamond', Georgia, serif;
  color-scheme: dark;
}

* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  background: radial-gradient(ellipse at 50% 25%, var(--lapis-600) 0%, var(--lapis-900) 58%, var(--lapis-950) 100%) fixed;
  color: var(--shell);
  font-family: var(--font-body);
  font-size: 19px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
}
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.06;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='96' viewBox='0 0 160 96'%3E%3Cg fill='%23e2bf63'%3E%3Cpath d='M8 12l16 5-16 5z'/%3E%3Cpath d='M30 10l5 18 5-18z'/%3E%3Cpath d='M50 14l14 4-14 4zM50 26l14 4-14 4z'/%3E%3Cpath d='M78 10l5 16 5-16zM90 10l5 16 5-16z'/%3E%3Cpath d='M112 16l18 5-18 5z'/%3E%3Cpath d='M138 8l4 14 4-14z'/%3E%3Cpath d='M14 58l5 16 5-16z'/%3E%3Cpath d='M34 60l16 5-16 5zM34 72l16 5-16 5z'/%3E%3Cpath d='M64 56l5 18 5-18z'/%3E%3Cpath d='M84 62l14 4-14 4z'/%3E%3Cpath d='M106 56l4 14 4-14zM116 56l4 14 4-14zM126 56l4 14 4-14z'/%3E%3Cpath d='M140 64l14 4-14 4z'/%3E%3C/g%3E%3C/svg%3E");
}

a { color: var(--gold); }
button { font: inherit; color: inherit; }
h1, h2, h3 { font-family: var(--font-display); font-weight: 500; color: var(--gold); letter-spacing: 0.04em; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 12px 28px;
  border: 0;
  border-radius: 8px;
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--lapis-950);
  background: linear-gradient(180deg, var(--gold-pale), var(--gold) 45%, var(--gold-deep));
  box-shadow: 0 0 0 1px #00000040, 0 8px 22px #000a, inset 0 1px 0 #fff9;
  cursor: pointer;
  transition: transform 0.15s, filter 0.15s;
}
.btn:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn.ghost { background: transparent; color: var(--gold); box-shadow: inset 0 0 0 1.5px var(--gold); }
.btn.small { min-height: 44px; padding: 8px 18px; font-size: 0.8rem; }

:focus-visible { outline: 2px solid var(--gold-pale); outline-offset: 3px; }

.eyebrow {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--gold-leaf);
}

.frieze {
  height: 14px;
  background: repeating-linear-gradient(135deg, var(--gold) 0 6px, transparent 6px 12px), var(--carnelian);
  opacity: 0.9;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Board building blocks**

`client/src/board/SvgDefs.svelte`:
```svelte
<script lang="ts">
  import { FRAME_BLOCKS, blockRect } from './geometry';
</script>

<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ur-tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a3688" />
      <stop offset="1" stop-color="#0d1d58" />
    </linearGradient>
    <linearGradient id="ur-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3d27a" />
      <stop offset="0.5" stop-color="#d9b45a" />
      <stop offset="1" stop-color="#9c7a2c" />
    </linearGradient>
    <radialGradient id="ur-piece-0" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#fff0bd" />
      <stop offset="0.5" stop-color="#e2bf63" />
      <stop offset="1" stop-color="#8f6720" />
    </radialGradient>
    <radialGradient id="ur-piece-1" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#f19a72" />
      <stop offset="0.5" stop-color="#c7512f" />
      <stop offset="1" stop-color="#5e1f10" />
    </radialGradient>
    <linearGradient id="ur-sheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0" />
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.28" />
      <stop offset="1" stop-color="#fff" stop-opacity="0" />
    </linearGradient>
    <clipPath id="ur-frame-clip">
      {#each FRAME_BLOCKS as b}
        {@const r = blockRect(b)}
        <rect x={r.x} y={r.y} width={r.width} height={r.height} rx="8" />
      {/each}
    </clipPath>
  </defs>
</svg>
```

`client/src/board/Motif.svelte` (drawn in a 58-unit tile; callers scale it):
```svelte
<script lang="ts">
  import type { Motif } from '@ur/shared';

  let { motif }: { motif: Motif } = $props();
  const C = 29;
  const quincunx = [[-15, -15], [15, -15], [-15, 15], [15, 15], [0, 0]];
  const eyes = [[-13, -13], [13, -13], [-13, 13], [13, 13], [0, 0]];
</script>

{#if motif === 'rosette'}
  {#each Array(8) as _, i}
    <ellipse cx={C} cy={C - 13} rx="5.2" ry="11" class={i % 2 ? 'ink petal' : 'ink2 petal'} transform="rotate({i * 45} {C} {C})" />
  {/each}
  <circle cx={C} cy={C} r="25" class="line" />
  <circle cx={C} cy={C} r="5" class="ink2 dot" />
{:else if motif === 'eyes'}
  {#each eyes as [dx, dy]}
    <circle cx={C + dx} cy={C + dy} r="7.5" class="line thin" />
    <circle cx={C + dx} cy={C + dy} r="3.2" class="ink2 dot" />
  {/each}
{:else if motif === 'fiveDots'}
  {#each quincunx as [dx, dy]}
    <circle cx={C + dx} cy={C + dy} r="5.5" class="ink dot" />
  {/each}
{:else if motif === 'twelveDots'}
  {#each Array(12) as _, i}
    <circle cx={15 + (i % 3) * 14} cy={8 + Math.floor(i / 3) * 14} r="4" class={(i % 3 + Math.floor(i / 3)) % 2 ? 'ink dot' : 'ink2 dot'} />
  {/each}
{:else}
  {#each [[0, 0], [1, 0], [0, 1], [1, 1]] as [i, j]}
    <rect x={6 + i * 24} y={6 + j * 24} width="22" height="22" class="line thin" />
    <circle cx={17 + i * 24} cy={17 + j * 24} r="3.5" class="ink2 dot" />
  {/each}
{/if}

<style>
  .ink { fill: var(--gold); }
  .ink2 { fill: var(--carnelian); }
  .line { fill: none; stroke: var(--gold); stroke-width: 2.2; }
  .thin { stroke-width: 1.8; }
  .dot { stroke: var(--gold); stroke-width: 1.3; }
  .petal { stroke: var(--gold-pale); stroke-width: 1.1; }
</style>
```

`client/src/board/BoardTiles.svelte`:
```svelte
<script lang="ts">
  import { BOARD } from '@ur/shared';
  import Motif from './Motif.svelte';
  import { FRAME_BLOCKS, G, PAD, S, TRAY, W, blockRect } from './geometry';

  const x = (c: number) => PAD + c * (S + G);
  const y = (r: number) => TRAY + PAD + r * (S + G);
</script>

<g class="frame">
  {#each FRAME_BLOCKS as b}
    {@const r = blockRect(b)}
    <rect x={r.x - 4} y={r.y - 4} width={r.width + 8} height={r.height + 8} rx="12" class="outer" />
    <rect x={r.x} y={r.y} width={r.width} height={r.height} rx="8" class="inlay" />
  {/each}
</g>
{#each BOARD as row, r}
  {#each row as motif, c}
    {#if motif}
      <g transform="translate({x(c)} {y(r)})">
        <rect width={S} height={S} rx="4" class="tile" />
        <g transform="scale({S / 58})"><Motif {motif} /></g>
        <rect width={S} height={S} rx="4" class="bevel" />
      </g>
    {/if}
  {/each}
{/each}
<g clip-path="url(#ur-frame-clip)" aria-hidden="true">
  <rect class="sheen" x={-W / 3} y={TRAY} width={W / 3} height={3 * S + 2 * G + 2 * PAD} fill="url(#ur-sheen)" />
</g>

<style>
  .outer { fill: #060a1f; filter: drop-shadow(0 14px 18px #000c); }
  .inlay { fill: url(#ur-gold); }
  .tile { fill: url(#ur-tile); }
  .bevel { fill: none; stroke: #fff3c4; stroke-opacity: 0.35; stroke-width: 1.2; }
  .sheen { animation: sheen 9s ease-in-out infinite; mix-blend-mode: soft-light; }
  @keyframes sheen {
    0%, 55% { transform: translateX(0); }
    100% { transform: translateX(1400px); }
  }
</style>
```

`client/src/board/MiniBoard.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import BoardTiles from './BoardTiles.svelte';
  import { H, TRAY, W } from './geometry';

  let { label, trays = false, children }: { label: string; trays?: boolean; children?: Snippet } = $props();
</script>

<svg class="mini" viewBox={trays ? `0 0 ${W} ${H}` : `0 ${TRAY - 8} ${W} ${H - 2 * TRAY + 16}`} role="img" aria-label={label}>
  <BoardTiles />
  {@render children?.()}
</svg>

<style>
  .mini { width: 100%; height: auto; display: block; overflow: visible; }
</style>
```

`client/src/board/Piece.svelte`:
```svelte
<script lang="ts">
  import type { Player } from '@ur/shared';
  import { PIECE_R } from './geometry';

  interface Props {
    x: number;
    y: number;
    player: Player;
    scale?: number;
    key?: string;
    movable?: boolean;
    selected?: boolean;
    duration?: number;
    label?: string;
    onactivate?: (how: string) => void;
    onhover?: (on: boolean) => void;
    onselect?: () => void;
  }
  let { x, y, player, scale = 1, key, movable = false, selected = false, duration = 170, label, onactivate, onhover, onselect }: Props = $props();

  const r = PIECE_R;
  const pips = [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38], [0, 0]];
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<g
  class="piece p{player}"
  class:movable
  class:selected
  data-piece={key}
  data-movable={movable || undefined}
  style="transform: translate({x}px, {y}px) scale({scale}); transition-duration: {duration}ms"
  role={onactivate ? 'button' : 'img'}
  tabindex={movable ? 0 : undefined}
  aria-label={label}
  onpointerup={(e) => onactivate?.(e.pointerType || 'mouse')}
  onpointerenter={(e) => e.pointerType === 'mouse' && onhover?.(true)}
  onpointerleave={(e) => e.pointerType === 'mouse' && onhover?.(false)}
  onfocus={() => onselect?.()}
>
  <circle class="hit" r={r + 8} />
  <circle class="halo" r={r + 6} />
  <ellipse class="shadow" cx="3" cy="6" rx={r} ry={r * 0.94} />
  <circle class="body" r={r} />
  <circle class="rim" r={r * 0.8} />
  {#each pips as [dx, dy]}
    <circle class="pip" cx={dx * r} cy={dy * r} r={r * 0.11} />
  {/each}
</g>

<style>
  .piece { transition-property: transform; transition-timing-function: cubic-bezier(0.4, 0.1, 0.3, 1); outline: none; }
  .movable { cursor: pointer; }
  .hit { fill: transparent; }
  .halo { fill: none; stroke: var(--gold-pale); stroke-width: 3; opacity: 0; }
  .movable .halo { animation: pulse 1.6s ease-in-out infinite; }
  .selected .halo, .piece:focus-visible .halo { opacity: 1; animation: none; stroke-width: 4; }
  .shadow { fill: #000a; }
  .p0 .body { fill: url(#ur-piece-0); }
  .p1 .body { fill: url(#ur-piece-1); }
  .body { stroke: #0006; stroke-width: 1; }
  .rim { fill: none; stroke: #0003; stroke-width: 1.5; }
  .p0 .pip { fill: var(--lapis-700); }
  .p1 .pip { fill: var(--gold-pale); }
  @keyframes pulse {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.95; }
  }
</style>
```

- [ ] **Step 6: App shell, home page and not-found page**

`client/src/main.ts`:
```ts
import { mount } from 'svelte';
import App from './App.svelte';
import './styles/theme.css';

mount(App, { target: document.getElementById('app')! });
```

`client/src/App.svelte`:
```svelte
<script lang="ts">
  import SvgDefs from './board/SvgDefs.svelte';
  import { route } from './lib/router.svelte';
  import Home from './screens/Home.svelte';
  import NotFound from './screens/NotFound.svelte';
</script>

<SvgDefs />
{#if route.path === '/'}
  <Home />
{:else}
  <NotFound />
{/if}
```

`client/src/screens/NotFound.svelte`:
```svelte
<script lang="ts">
  import { link } from '../lib/router.svelte';

  let {
    title = 'This path leads nowhere',
    message = 'The page you were looking for is not here.',
  }: { title?: string; message?: string } = $props();
</script>

<main class="lost">
  <p class="eyebrow">Lost in the sands</p>
  <h1>{title}</h1>
  <p>{message}</p>
  <a class="btn" href="/" use:link>Return home</a>
</main>

<style>
  .lost { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 24px; text-align: center; }
  h1 { margin: 0; font-size: clamp(1.8rem, 5vw, 2.8rem); }
  p { margin: 0 0 12px; max-width: 32ch; }
</style>
```

`client/src/screens/Home.svelte`:
```svelte
<script lang="ts">
  import { slide } from 'svelte/transition';
  import MiniBoard from '../board/MiniBoard.svelte';
  import Piece from '../board/Piece.svelte';
  import { piecePoint } from '../board/geometry';
  import { ApiError, createGame } from '../game/api';
  import { seatTokens } from '../game/storage';
  import { link, navigate } from '../lib/router.svelte';

  const levels = [
    { id: 'easy', name: 'Easy', blurb: 'A gentle opponent for learning the game.' },
    { id: 'medium', name: 'Medium', blurb: 'Thinks a roll ahead.' },
    { id: 'hard', name: 'Hard', blurb: 'Weighs every throw of the dice.' },
  ];
  const heroPieces = [
    { player: 0 as const, ...piecePoint(0, 3, 0, 0) },
    { player: 0 as const, ...piecePoint(0, 8, 0, 0) },
    { player: 1 as const, ...piecePoint(1, 6, 0, 0) },
    { player: 1 as const, ...piecePoint(1, 13, 0, 0) },
  ];

  let choosingLevel = $state(false);
  let creating = $state(false);
  let error = $state<string | null>(null);

  async function playFriend() {
    creating = true;
    error = null;
    try {
      const { gameId, seatToken } = await createGame();
      seatTokens.set(gameId, seatToken);
      navigate(`/g/${gameId}`);
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Could not start a game.';
    } finally {
      creating = false;
    }
  }
</script>

<main class="home">
  <div class="frieze" aria-hidden="true"></div>
  <header>
    <p class="eyebrow">Sumer · c. 2600 BCE</p>
    <h1>The Royal Game <span>of</span> Ur</h1>
    <p class="lede">The oldest playable board game in the world, unearthed in the Royal Cemetery at Ur.</p>
  </header>

  <div class="hero" aria-hidden="true">
    <MiniBoard label="The board of the Royal Game of Ur">
      {#each heroPieces as p}<Piece x={p.x} y={p.y} player={p.player} />{/each}
    </MiniBoard>
  </div>

  <nav class="modes" aria-label="Choose how to play">
    <button class="btn" onclick={playFriend} disabled={creating}>{creating ? 'Preparing…' : 'Play a Friend'}</button>
    <button class="btn" onclick={() => (choosingLevel = !choosingLevel)} aria-expanded={choosingLevel}>Play the Computer</button>
    {#if choosingLevel}
      <div class="levels" transition:slide={{ duration: 220 }}>
        {#each levels as l}
          <a class="level" href="/play/ai/{l.id}" use:link><strong>{l.name}</strong><span>{l.blurb}</span></a>
        {/each}
      </div>
    {/if}
    <a class="btn ghost" href="/play/local" use:link>Pass &amp; Play</a>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </nav>

  <footer>
    <a href="/how-to-play" use:link>How to play</a>
    <span aria-hidden="true">·</span>
    <span>Rules after Irving Finkel’s reconstruction</span>
  </footer>
  <div class="frieze bottom" aria-hidden="true"></div>
</main>

<style>
  .home { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; gap: clamp(16px, 3vh, 32px); text-align: center; }
  .frieze { align-self: stretch; }
  .frieze.bottom { margin-top: auto; }
  header { padding: 0 20px; }
  h1 {
    margin: 0.15em 0;
    font-size: clamp(2.3rem, 7.5vw, 4.6rem);
    font-weight: 700;
    line-height: 1.05;
    background: linear-gradient(100deg, var(--gold-deep) 0%, var(--gold-pale) 25%, var(--gold) 45%, #fff3c4 50%, var(--gold) 55%, var(--gold-deep) 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: gild 9s ease-in-out infinite;
  }
  h1 span { font-size: 0.55em; font-weight: 500; }
  .lede { margin: 0 auto; max-width: 34ch; font-size: 1.2rem; font-style: italic; color: #e9dcc0; }
  .hero { width: min(92vw, 680px); animation: float 7s ease-in-out infinite; filter: drop-shadow(0 30px 40px #000b); }
  .modes { display: grid; gap: 12px; width: min(88vw, 360px); }
  .levels { display: grid; gap: 8px; overflow: hidden; }
  .level { display: grid; gap: 2px; padding: 12px 16px; min-height: 44px; border: 1px solid #e2bf6355; border-radius: 8px; background: #0b1438aa; text-align: left; text-decoration: none; color: var(--shell); }
  .level:hover { border-color: var(--gold); }
  .level strong { font-family: var(--font-display); color: var(--gold); letter-spacing: 0.1em; }
  .level span { font-size: 0.95rem; opacity: 0.85; }
  .error { margin: 0; color: #ffb59c; }
  footer { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 0 20px; font-size: 1rem; opacity: 0.9; }
  @keyframes gild { 0%, 100% { background-position: 100% 0; } 50% { background-position: 0 0; } }
  @keyframes float { 0%, 100% { transform: translateY(0) rotate(-0.4deg); } 50% { transform: translateY(-8px) rotate(0.4deg); } }
</style>
```

- [ ] **Step 7: Type-check and look at it**

Run: `npm run check -w client && npx vitest run client`
Expected: `svelte-check found 0 errors` (warnings acceptable); tests PASS.

Run (background): `npm run dev`
Then with Playwright MCP: navigate to `http://localhost:5173/`, screenshot at 1280×800 and at 390×844.
Expected: gilded title, lapis board with gold inlay and the five rosettes in the right places (compare with the mockup in `.superpowers/brainstorm/*/content/visual-direction-v2.html`, option C), three buttons, no horizontal scrolling on mobile. "Play a Friend" navigates to `/g/XXXXXX` (shows the not-found page until Task 9).

- [ ] **Step 8: Commit**

```bash
git add client vitest.config.ts package.json package-lock.json
git commit -m "feat: client scaffold, lapis-and-gold theme, SVG board and home page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Game screen, pass & play, and computer opponent

**Files:**
- Create: `client/src/game/controller.ts`, `local.ts`, `aiController.ts`, `ai.worker.ts`, `messages.ts`
- Create: `client/src/audio/sound.svelte.ts`
- Create: `client/src/ui/toasts.svelte.ts`, `Toasts.svelte`, `PlayerHud.svelte`, `TopBar.svelte`, `VictoryOverlay.svelte`
- Create: `client/src/board/Board.svelte`, `Dice.svelte`, `Burst.svelte`
- Create: `client/src/screens/GameScreen.svelte`, `LocalGame.svelte`, `AiGame.svelte`
- Modify: `client/src/App.svelte`
- Test: `client/src/game/local.test.ts`, `client/src/game/messages.test.ts`

**Interfaces:**
- Consumes: Task 2/4 engine (`applyRoll`, `applyMove`, `legalMoves`, `whyCannotMove`, `chooseMove`, `rollDice`, `newGame`), Task 7 geometry/board/router/motion.
- Produces:
  - `type Mode = 'online' | 'ai' | 'local'`; `type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'notFound'`
  - `interface Snapshot { mode; state; controls: Player[]; perspective: Player; names: [string, string]; seated; connected; rematch; spectator: boolean; gameId?: string }`
  - `interface Update { snapshot: Snapshot; events: GameEvent[] }`
  - `interface GameController { subscribe(fn): () => void; onError(fn: (code, message) => void): () => void; onStatus(fn): () => void; roll(); move(piece); rematch(); idle(); dispose() }` — `subscribe` immediately delivers the current snapshot with `events: []`
  - `class Emitter<T> { on(fn): () => void; emit(v); clear() }`
  - `new LocalController(mode, names, controls, rng?)`; `new AiController(level)` (AI plays seat 1)
  - `eventToast(e, names): string | null`, `describeEvent(e, names): string`
  - `toasts.push(text)`, `toasts.items`
  - `sound.muted`, `sound.toggle()`, `sound.dice() / step() / capture() / rosette() / bearOff() / win()`
  - `<GameScreen controller invite? gone? />` — DOM hooks used by E2E: dice button `data-testid="dice"`, movable pieces `[data-movable]`, victory overlay `data-testid="victory"`, ghost `.ghost`

- [ ] **Step 1: Write failing controller and message tests**

`client/src/game/local.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@ur/shared';
import type { Update } from './controller';
import { LocalController } from './local';

function make() {
  const c = new LocalController('local', ['Gold', 'Carnelian'], [0, 1], mulberry32(5));
  const updates: Update[] = [];
  const errors: string[] = [];
  c.subscribe((u) => updates.push(u));
  c.onError((code) => errors.push(code));
  return { c, updates, errors };
}

describe('LocalController', () => {
  it('delivers the current snapshot on subscribe', () => {
    const { updates } = make();
    expect(updates).toHaveLength(1);
    expect(updates[0].events).toEqual([]);
    expect(updates[0].snapshot).toMatchObject({ mode: 'local', controls: [0, 1], seated: [true, true], spectator: false });
  });

  it('applies rolls and emits events', () => {
    const { c, updates } = make();
    c.roll();
    expect(updates[1].events[0].type).toBe('rolled');
    expect(updates[1].snapshot.state.turn).toBe(1);
  });

  it('reports rule errors instead of throwing', () => {
    const { c, errors } = make();
    c.move(0);
    expect(errors).toEqual(['badPhase']);
  });

  it('starts a rematch with the other player first', () => {
    const { c, updates } = make();
    const first = updates[0].snapshot.state.current;
    c.rematch();
    const s = updates.at(-1)!.snapshot.state;
    expect(s.turn).toBe(0);
    expect(s.current).toBe(1 - first);
  });
});
```

`client/src/game/messages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeEvent, eventToast } from './messages';

const names: [string, string] = ['You', 'Computer · Hard'];

describe('messages', () => {
  it('explains passes, rosettes and captures with correct grammar', () => {
    expect(eventToast({ type: 'passed', player: 0, reason: 'zero' }, names)).toBe('You rolled 0 — turn passes');
    expect(eventToast({ type: 'passed', player: 1, reason: 'noMoves' }, names)).toBe('No legal move for Computer · Hard — turn passes');
    expect(eventToast({ type: 'rosette', player: 0, at: 4 }, names)).toBe('Rosette — you roll again');
    expect(eventToast({ type: 'rosette', player: 1, at: 8 }, names)).toBe('Central rosette — safe, and Computer · Hard rolls again');
    expect(eventToast({ type: 'captured', player: 1, victim: 0, piece: 2, at: 7 }, names)).toBe('Computer · Hard captured a piece!');
    expect(eventToast({ type: 'moved', player: 0, piece: 0, from: 0, to: 2 }, names)).toBeNull();
  });

  it('describes every event for screen readers', () => {
    expect(describeEvent({ type: 'rolled', player: 0, dice: [1, 1, 0, 0], roll: 2 }, names)).toBe('You rolled 2.');
    expect(describeEvent({ type: 'moved', player: 0, piece: 0, from: 0, to: 2 }, names)).toBe('You entered a piece onto square 2.');
    expect(describeEvent({ type: 'moved', player: 1, piece: 0, from: 3, to: 6 }, names)).toBe('Computer · Hard moved a piece from square 3 to square 6.');
    expect(describeEvent({ type: 'moved', player: 0, piece: 0, from: 13, to: 15 }, names)).toBe('You bore a piece off the board.');
    expect(describeEvent({ type: 'won', player: 0 }, names)).toBe('You win the game!');
    expect(describeEvent({ type: 'won', player: 1 }, names)).toBe('Computer · Hard wins the game!');
  });
});
```

Run: `npx vitest run client/src/game`
Expected: FAIL — modules not found.

- [ ] **Step 2: Implement controller contract, local controller and messages**

`client/src/game/controller.ts`:
```ts
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
```

`client/src/game/local.ts`:
```ts
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
```

`client/src/game/messages.ts`:
```ts
import { OFF, START, type GameEvent } from '@ur/shared';

const isYou = (name: string) => name === 'You';
/** "you roll" / "Gold rolls" */
const subjectVerb = (name: string, verb: string) => (isYou(name) ? `you ${verb}` : `${name} ${verb}s`);

/** Short toast for rules-driven moments; null when nothing needs explaining. */
export function eventToast(e: GameEvent, names: [string, string]): string | null {
  const who = names[e.player];
  switch (e.type) {
    case 'passed':
      return e.reason === 'zero'
        ? `${who} rolled 0 — turn passes`
        : `No legal move for ${isYou(who) ? 'you' : who} — turn passes`;
    case 'rosette':
      return e.at === 8
        ? `Central rosette — safe, and ${subjectVerb(who, 'roll')} again`
        : `Rosette — ${subjectVerb(who, 'roll')} again`;
    case 'captured':
      return `${who} captured a piece!`;
    default:
      return null;
  }
}

/** Full sentence for the screen-reader live region. */
export function describeEvent(e: GameEvent, names: [string, string]): string {
  const who = names[e.player];
  switch (e.type) {
    case 'rolled':
      return `${who} rolled ${e.roll}.`;
    case 'passed':
      return `${eventToast(e, names)}.`;
    case 'moved':
      if (e.from === START) return `${who} entered a piece onto square ${e.to}.`;
      if (e.to === OFF) return `${who} bore a piece off the board.`;
      return `${who} moved a piece from square ${e.from} to square ${e.to}.`;
    case 'captured':
      return `${who} captured a piece on square ${e.at}; it returns to the start.`;
    case 'rosette':
      return `${who} landed on a rosette — ${subjectVerb(who, 'roll')} again.`;
    case 'borneOff':
      return `${who} brought a piece home.`;
    case 'won':
      return `${who} ${isYou(who) ? 'win' : 'wins'} the game!`;
  }
}
```

Run: `npx vitest run client/src/game`
Expected: PASS.

- [ ] **Step 3: AI controller and worker**

`client/src/game/aiController.ts`:
```ts
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
```

`client/src/game/ai.worker.ts`:
```ts
import { chooseMove } from '@ur/shared';
import type { AiRequest } from './aiController';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiRequest>) => void) | null;
  postMessage(piece: number): void;
};

ctx.onmessage = (e) => ctx.postMessage(chooseMove(e.data.state, e.data.level, { budgetMs: 600 }));
```

- [ ] **Step 4: Sound and toasts**

`client/src/audio/sound.svelte.ts`:
```ts
/** Synthesised clay-and-stone sounds; no audio files needed. */
let muted = $state(readMuted());
let ctx: AudioContext | null = null;

function readMuted() {
  try { return localStorage.getItem('ur.muted') === '1'; } catch { return false; }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
  } catch {
    return null;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, at: number, dur: number, { type = 'sine' as OscillatorType, gain = 0.1, glide = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glide) osc.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Band-passed noise burst: the knock of clay or stone. */
function knock(at: number, freq: number, gain = 0.22, dur = 0.06) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 4;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sound = {
  get muted() {
    return muted;
  },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('ur.muted', muted ? '1' : '0'); } catch { /* ignore */ }
  },
  dice() { for (let i = 0; i < 7; i++) knock(i * 0.07 + Math.random() * 0.04, 1800 + Math.random() * 900, 0.16); },
  step() { knock(0, 700, 0.2, 0.05); },
  capture() { tone(140, 0, 0.25, { type: 'triangle', gain: 0.22, glide: 0.5 }); knock(0.02, 2400, 0.22, 0.12); },
  rosette() { [880, 1318.5, 1760].forEach((f, i) => tone(f, i * 0.07, 0.9, { gain: 0.06 })); },
  bearOff() { tone(523.25, 0, 0.3, { gain: 0.07 }); tone(784, 0.1, 0.45, { gain: 0.07 }); },
  win() { [523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(f, i * 0.14, 1.1, { type: 'triangle', gain: 0.08 })); },
};
```

`client/src/ui/toasts.svelte.ts`:
```ts
let items = $state<{ id: number; text: string }[]>([]);
let nextId = 0;

export const toasts = {
  get items() {
    return items;
  },
  push(text: string) {
    const id = nextId++;
    items = [...items.slice(-2), { id, text }];
    setTimeout(() => { items = items.filter((t) => t.id !== id); }, 2800);
  },
};
```

`client/src/ui/Toasts.svelte`:
```svelte
<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { toasts } from './toasts.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <div class="toast" in:fly={{ y: 16, duration: 200 }} out:fade={{ duration: 200 }}>{t.text}</div>
  {/each}
</div>

<style>
  .toasts { position: fixed; left: 50%; top: max(64px, env(safe-area-inset-top)); transform: translateX(-50%); display: grid; gap: 8px; width: min(92vw, 440px); z-index: 30; pointer-events: none; }
  .toast { padding: 10px 18px; border: 1px solid var(--gold); border-radius: 10px; background: #060a1fee; color: var(--shell); text-align: center; font-size: 1.05rem; box-shadow: 0 10px 30px #000a; }
</style>
```

- [ ] **Step 5: Board, dice and effects**

`client/src/board/Burst.svelte`:
```svelte
<script lang="ts">
  import type { Effect } from './effects';

  let { fx }: { fx: Effect } = $props();
</script>

<g class="burst {fx.kind}" transform="translate({fx.at.x} {fx.at.y})" aria-hidden="true">
  {#if fx.kind === 'rosette'}
    <circle r="40" class="ring" />
    <circle r="40" class="ring late" />
    {#each Array(8) as _, i}<ellipse class="petal" rx="6" ry="15" cy="-50" transform="rotate({i * 45})" />{/each}
  {:else if fx.kind === 'capture'}
    <circle r="30" class="flash" />
    {#each Array(12) as _, i}<line class="spark" x1="0" y1="-22" x2="0" y2="-56" transform="rotate({i * 30})" />{/each}
  {:else}
    {#each Array(7) as _, i}<circle class="mote" r="4" cx={(i - 3) * 9} style="animation-delay:{i * 40}ms" />{/each}
  {/if}
</g>

<style>
  .burst { pointer-events: none; }
  .ring { fill: none; stroke: var(--gold-pale); stroke-width: 4; transform-box: fill-box; transform-origin: center; animation: ring 900ms ease-out forwards; }
  .ring.late { opacity: 0; animation-delay: 160ms; }
  .petal { fill: var(--gold); opacity: 0; animation: petal 900ms ease-out forwards; }
  .flash { fill: var(--carnelian); transform-box: fill-box; transform-origin: center; animation: flash 500ms ease-out forwards; }
  .spark { stroke: var(--gold-pale); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 34; stroke-dashoffset: 34; animation: spark 600ms ease-out forwards; }
  .mote { fill: var(--gold-pale); animation: rise 900ms ease-out forwards; }
  @keyframes ring { from { transform: scale(0.4); opacity: 1; } to { transform: scale(1.9); opacity: 0; } }
  @keyframes petal { 0% { opacity: 0; } 30% { opacity: 0.9; } 100% { opacity: 0; } }
  @keyframes flash { from { transform: scale(0.3); opacity: 0.85; } to { transform: scale(1.8); opacity: 0; } }
  @keyframes spark { 0% { stroke-dashoffset: 34; opacity: 1; } 100% { stroke-dashoffset: -34; opacity: 0; } }
  @keyframes rise { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-70px); opacity: 0; } }
</style>
```

`client/src/board/Board.svelte`:
```svelte
<script lang="ts">
  import { OFF, START, legalMoves, type GameState, type Player } from '@ur/shared';
  import BoardTiles from './BoardTiles.svelte';
  import Burst from './Burst.svelte';
  import Piece from './Piece.svelte';
  import type { Effect } from './effects';
  import { H, PIECE_R, TRAY, TRAY_R, W, piecePoint, trayRanks, traySlot, type Point } from './geometry';

  interface Props {
    state: GameState;
    perspective: Player;
    vertical: boolean;
    movable: number[];
    preview: number | null;
    overrides: Record<string, Point>;
    flying: Record<string, boolean>;
    effects: Effect[];
    onpiece: (player: Player, piece: number, how: string) => void;
    onhover: (piece: number | null) => void;
    onselect: (piece: number) => void;
    onghost: () => void;
  }
  let { state, perspective, vertical, movable, preview, overrides, flying, effects, onpiece, onhover, onselect, onghost }: Props = $props();

  const pieces = $derived(
    ([0, 1] as Player[]).flatMap((p) => {
      const ranks = trayRanks(state.pieces[p]);
      return state.pieces[p].map((pos, i) => {
        const key = `${p}-${i}`;
        const override = overrides[key];
        const inTray = (pos === START || pos === OFF) && !override;
        return {
          key, player: p, index: i, pos,
          point: override ?? piecePoint(p, pos, ranks[i], perspective),
          scale: inTray ? TRAY_R / PIECE_R : 1,
          movable: p === state.current && movable.includes(i),
        };
      });
    }),
  );

  const ghost = $derived.by(() => {
    if (preview === null || state.phase !== 'awaitingMove') return null;
    const me = state.current;
    const from = state.pieces[me][preview];
    const m = legalMoves(state).find((mv) => mv.piece === preview || (from === START && mv.from === START));
    if (!m) return null;
    const point = m.to === OFF
      ? traySlot(me, 'off', state.pieces[me].filter((p) => p === OFF).length, perspective)
      : piecePoint(me, m.to, 0, perspective);
    return { point, player: me, capture: m.capture };
  });

  const name = (p: Player) => (p === 0 ? 'Gold' : 'Carnelian');
  const label = (pc: { player: Player; pos: number; movable: boolean }) =>
    `${name(pc.player)} piece ${pc.pos === START ? 'waiting to enter' : pc.pos === OFF ? 'finished' : `on square ${pc.pos}`}${pc.movable ? ', can move' : ''}`;
</script>

<svg class="board" viewBox={vertical ? `0 0 ${H} ${W}` : `0 0 ${W} ${H}`} role="group" aria-label="Game board">
  <g transform={vertical ? `translate(${H} 0) rotate(90)` : undefined}>
    <rect class="tray" x="20" y="12" width={W - 40} height={TRAY - 24} rx="18" />
    <rect class="tray" x="20" y={H - TRAY + 12} width={W - 40} height={TRAY - 24} rx="18" />
    <BoardTiles />
    {#if ghost}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <g class="ghost p{ghost.player}" class:capture={ghost.capture} transform="translate({ghost.point.x} {ghost.point.y})" role="button" tabindex="-1" aria-label="Move here" onclick={onghost}>
        <circle r={PIECE_R} />
      </g>
    {/if}
    {#each pieces as pc (pc.key)}
      <Piece
        x={pc.point.x}
        y={pc.point.y}
        scale={pc.scale}
        player={pc.player}
        key={pc.key}
        movable={pc.movable}
        selected={pc.movable && preview === pc.index}
        duration={flying[pc.key] ? 650 : 170}
        label={label(pc)}
        onactivate={(how) => onpiece(pc.player, pc.index, how)}
        onhover={(on) => onhover(on && pc.movable ? pc.index : null)}
        onselect={() => pc.movable && onselect(pc.index)}
      />
    {/each}
    {#each effects as fx (fx.id)}<Burst {fx} />{/each}
  </g>
</svg>

<style>
  .board { display: block; width: 100%; height: auto; overflow: visible; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
  .tray { fill: #060a1f88; stroke: #e2bf6333; stroke-width: 1.5; }
  .ghost circle { fill: none; stroke: var(--gold-pale); stroke-width: 3; stroke-dasharray: 8 7; animation: spin 6s linear infinite; transform-box: fill-box; transform-origin: center; }
  .ghost.p0 circle { fill: #e2bf6333; }
  .ghost.p1 circle { fill: #c7512f33; }
  .ghost.capture circle { stroke: #ff9b74; }
  .ghost { cursor: pointer; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
```

`client/src/board/Dice.svelte`:
```svelte
<script lang="ts">
  import type { Dice } from '@ur/shared';

  interface Props { dice: Dice | null; total: number | null; rolling: boolean; enabled: boolean; onroll?: () => void }
  let { dice, total, rolling, enabled, onroll }: Props = $props();
</script>

<button
  class="dice"
  class:enabled
  class:rolling
  type="button"
  data-testid="dice"
  disabled={!enabled}
  onclick={() => onroll?.()}
  aria-label={enabled ? 'Roll the dice' : total === null ? 'Dice' : `Last roll: ${total}`}
>
  <span class="set">
    {#each [0, 1, 2, 3] as i}
      <svg class="die" style="--i:{i}" viewBox="0 0 40 38" aria-hidden="true">
        <polygon class="f1" points="20,2 2,35 20,28" />
        <polygon class="f2" points="20,2 38,35 20,28" />
        <polygon class="f3" points="2,35 38,35 20,28" />
        {#if !rolling && dice?.[i]}<circle class="tip" cx="20" cy="7" r="3.8" />{/if}
      </svg>
    {/each}
  </span>
  <span class="total" aria-hidden="true">{rolling || total === null ? '' : total}</span>
  <span class="cta" aria-hidden="true">{enabled ? 'Roll' : ''}</span>
</button>

<style>
  .dice { display: inline-flex; align-items: center; gap: 14px; min-height: 64px; padding: 10px 18px; border: 1px solid #e2bf6333; border-radius: 14px; background: #0b1438aa; color: var(--gold); }
  .dice.enabled { cursor: pointer; border-color: var(--gold); animation: beckon 1.8s ease-in-out infinite; }
  .dice:disabled { cursor: default; }
  .set { display: inline-flex; gap: 6px; }
  .die { width: 40px; height: 38px; overflow: visible; }
  .f1 { fill: #f3d27a; }
  .f2 { fill: #b8892e; }
  .f3 { fill: #8a6522; }
  .tip { fill: var(--carnelian); stroke: #fff3c4; stroke-width: 1.2; filter: drop-shadow(0 0 4px #ffcf7a); }
  .rolling .die { animation: tumble 700ms cubic-bezier(0.3, 0.6, 0.4, 1) both; animation-delay: calc(var(--i) * 45ms); }
  .total { min-width: 1ch; font-family: var(--font-display); font-size: 2.2rem; line-height: 1; background: linear-gradient(180deg, #fff3c4, var(--gold) 55%, var(--gold-deep)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .cta { font-family: var(--font-display); font-size: 0.85rem; letter-spacing: 0.2em; text-transform: uppercase; }
  @keyframes tumble {
    0% { transform: translateY(-26px) rotate(-200deg) scale(0.8); }
    55% { transform: translateY(4px) rotate(30deg); }
    75% { transform: translateY(-6px) rotate(-10deg); }
    100% { transform: none; }
  }
  @keyframes beckon {
    0%, 100% { box-shadow: 0 0 0 0 #e2bf6355; }
    50% { box-shadow: 0 0 0 8px #e2bf6300; }
  }
</style>
```

- [ ] **Step 6: HUD, top bar and victory overlay**

`client/src/ui/PlayerHud.svelte`:
```svelte
<script lang="ts">
  import { OFF, START, type Player } from '@ur/shared';

  interface Props { name: string; player: Player; pieces: number[]; active: boolean; note: string }
  let { name, player, pieces, active, note }: Props = $props();

  const waiting = $derived(pieces.filter((p) => p === START).length);
  const home = $derived(pieces.filter((p) => p === OFF).length);
</script>

<section class="hud p{player}" class:active aria-label="{name}: {waiting} waiting, {home} of 7 home">
  <span class="token" aria-hidden="true"></span>
  <div class="text">
    <strong>{name}</strong>
    <span class="note">{note}</span>
  </div>
  <ol class="pips" aria-hidden="true">
    {#each Array(7) as _, i}<li class:filled={i < home}></li>{/each}
  </ol>
</section>

<style>
  .hud { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 14px; border: 1px solid #e2bf6326; border-radius: 12px; background: #0b143888; transition: border-color 0.3s, box-shadow 0.3s; }
  .hud.active { border-color: var(--gold); box-shadow: 0 0 22px #e2bf6333; }
  .token { width: 22px; height: 22px; border-radius: 50%; flex: none; box-shadow: inset 0 -3px 6px #0006; }
  .p0 .token { background: radial-gradient(circle at 35% 30%, #fff0bd, #e2bf63 50%, #8f6720); }
  .p1 .token { background: radial-gradient(circle at 35% 30%, #f19a72, #c7512f 50%, #5e1f10); }
  .text { display: grid; line-height: 1.15; min-width: 0; }
  strong { font-family: var(--font-display); font-weight: 500; letter-spacing: 0.08em; color: var(--gold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { min-height: 1.15em; font-style: italic; font-size: 1rem; color: #e9dcc0; }
  .pips { display: flex; gap: 4px; margin: 0 0 0 auto; padding: 0; list-style: none; }
  .pips li { width: 9px; height: 14px; border: 1px solid #e2bf6366; transform: skewX(-12deg); }
  .p0 .pips li.filled { background: var(--gold); }
  .p1 .pips li.filled { background: var(--carnelian); border-color: var(--carnelian); }
</style>
```

`client/src/ui/TopBar.svelte`:
```svelte
<script lang="ts">
  import { sound } from '../audio/sound.svelte';
  import { link } from '../lib/router.svelte';

  let { onhelp }: { onhelp?: () => void } = $props();
</script>

<header class="topbar">
  <a class="home" href="/" use:link aria-label="Back to the home page">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    <span>Ur</span>
  </a>
  <div class="actions">
    {#if onhelp}
      <button class="icon" onclick={onhelp} aria-label="How to play">?</button>
    {/if}
    <button class="icon" onclick={() => sound.toggle()} aria-label={sound.muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={sound.muted}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" class="fill" />
        {#if sound.muted}<path d="M16 9l5 6M21 9l-5 6" />{:else}<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />{/if}
      </svg>
    </button>
  </div>
</header>

<style>
  .topbar { display: flex; align-items: center; justify-content: space-between; }
  .home { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding-right: 8px; font-family: var(--font-display); font-size: 1.2rem; letter-spacing: 0.15em; text-decoration: none; }
  .actions { display: flex; gap: 8px; }
  .icon { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid #e2bf6355; border-radius: 50%; background: #0b143888; color: var(--gold); font-family: var(--font-display); font-size: 1.2rem; cursor: pointer; }
  .icon:hover { border-color: var(--gold); }
  svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .fill { fill: currentColor; }
</style>
```

`client/src/ui/VictoryOverlay.svelte`:
```svelte
<script lang="ts">
  import type { Player } from '@ur/shared';
  import { fade, scale } from 'svelte/transition';
  import { link } from '../lib/router.svelte';

  interface Props {
    title: string;
    winner: Player;
    rematchLabel?: string;
    rematchDisabled?: boolean;
    onrematch?: () => void;
  }
  let { title, winner, rematchLabel, rematchDisabled = false, onrematch }: Props = $props();

  const flecks = Array.from({ length: 36 }, () => ({ x: Math.random() * 100, d: Math.random() * 3, t: 3 + Math.random() * 3 }));
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="victory-title" data-testid="victory" transition:fade={{ duration: 250 }}>
  <div class="flecks" aria-hidden="true">
    {#each flecks as f}<i style="left:{f.x}%; animation-delay:{f.d}s; animation-duration:{f.t}s"></i>{/each}
  </div>
  <div class="card p{winner}" in:scale={{ start: 0.85, duration: 400 }}>
    <div class="frieze" aria-hidden="true"></div>
    <p class="eyebrow">All seven pieces home</p>
    <h2 id="victory-title">{title}</h2>
    <div class="actions">
      {#if onrematch && rematchLabel}
        <button class="btn" onclick={onrematch} disabled={rematchDisabled}>{rematchLabel}</button>
      {/if}
      <a class="btn ghost" href="/" use:link>Home</a>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 20px; background: radial-gradient(ellipse at center, #0b1438cc, #060a1ff2); overflow: hidden; }
  .card { position: relative; display: grid; justify-items: center; gap: 10px; width: min(92vw, 440px); padding: 0 24px 28px; border: 1px solid var(--gold); border-radius: 16px; background: linear-gradient(180deg, #16307e, #0b1438); box-shadow: 0 30px 80px #000c, 0 0 60px #e2bf6333; text-align: center; overflow: hidden; }
  .frieze { align-self: stretch; margin: 0 -24px 14px; }
  h2 { margin: 0 0 8px; font-size: clamp(2.4rem, 9vw, 3.6rem); font-weight: 700; background: linear-gradient(180deg, #fff3c4, var(--gold) 55%, var(--gold-deep)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
  .flecks i { position: absolute; top: -20px; width: 8px; height: 12px; background: linear-gradient(var(--gold-pale), var(--gold-deep)); animation: fall linear infinite; opacity: 0.85; }
  @keyframes fall { to { transform: translateY(110vh) rotate(540deg); } }
</style>
```

- [ ] **Step 7: Game screen**

`client/src/screens/GameScreen.svelte`:
```svelte
<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import { OFF, START, legalMoves, other, whyCannotMove, type GameEvent, type GameState, type Player } from '@ur/shared';
  import { sound } from '../audio/sound.svelte';
  import Board from '../board/Board.svelte';
  import Dice from '../board/Dice.svelte';
  import type { Effect } from '../board/effects';
  import { piecePoint, traySlot, type Point } from '../board/geometry';
  import type { ConnectionStatus, GameController, Snapshot, Update } from '../game/controller';
  import { describeEvent, eventToast } from '../game/messages';
  import { reducedMotion, sleep } from '../lib/motion';
  import PlayerHud from '../ui/PlayerHud.svelte';
  import Toasts from '../ui/Toasts.svelte';
  import TopBar from '../ui/TopBar.svelte';
  import VictoryOverlay from '../ui/VictoryOverlay.svelte';
  import { toasts } from '../ui/toasts.svelte';

  interface Props { controller: GameController; invite?: Snippet; gone?: Snippet }
  let { controller, invite, gone }: Props = $props();

  let snap = $state<Snapshot | null>(null);
  let display = $state<GameState | null>(null);
  let overrides = $state<Record<string, Point>>({});
  let flying = $state<Record<string, boolean>>({});
  let effects = $state<Effect[]>([]);
  let rolling = $state(false);
  let animating = $state(false);
  let pending = $state(false);
  let selected = $state<number | null>(null);
  let hovered = $state<number | null>(null);
  let introText = $state<string | null>(null);
  let status = $state<ConnectionStatus>('connecting');
  let announcement = $state('');
  let vertical = $state(false);

  const queue: Update[] = [];
  let introShown = false;
  let effectId = 0;

  const T = (ms: number) => (reducedMotion() ? 0 : ms);
  const keyOf = (p: Player, i: number) => `${p}-${i}`;
  const perspective = $derived<Player>(snap?.perspective ?? 0);
  const top = $derived<Player>(other(perspective));
  const bothSeated = $derived(!!snap && snap.seated[0] && snap.seated[1]);
  const canAct = $derived(
    !!display && !!snap && bothSeated && !animating && !pending && !introText &&
      display.phase !== 'finished' && snap.controls.includes(display.current),
  );
  const moves = $derived(canAct && display!.phase === 'awaitingMove' ? legalMoves(display!) : []);
  const movable = $derived(moves.map((m) => m.piece));
  const canRoll = $derived(canAct && display!.phase === 'awaitingRoll');
  const preview = $derived(selected ?? hovered);
  const finished = $derived(display?.phase === 'finished' && !animating);

  const offUpdate = controller.subscribe((u) => { queue.push(u); void pump(); });
  const offError = controller.onError((code, message) => {
    pending = false;
    if (code !== 'badPhase' && code !== 'notYourTurn') toasts.push(message);
  });
  const offStatus = controller.onStatus((s) => { status = s; });

  const portrait = matchMedia('(max-width: 720px) and (orientation: portrait)');
  vertical = portrait.matches;
  const onPortrait = (e: MediaQueryListEvent) => { vertical = e.matches; };
  portrait.addEventListener('change', onPortrait);

  onDestroy(() => {
    offUpdate();
    offError();
    offStatus();
    portrait.removeEventListener('change', onPortrait);
  });

  async function pump() {
    if (animating) return;
    animating = true;
    while (queue.length) await play(queue.shift()!);
    animating = false;
    controller.idle();
  }

  async function play(u: Update) {
    const prev = display;
    const next = u.snapshot.state;
    const restarted = !!prev && next.turn < prev.turn;
    snap = u.snapshot;
    if (prev && !restarted && u.events.length) {
      for (const e of u.events) await animate(e);
    }
    display = next;
    overrides = {};
    flying = {};
    selected = null;
    hovered = null;
    pending = false;
    if (restarted) introShown = false;
    if (!introShown && next.turn === 0 && next.phase === 'awaitingRoll' && u.snapshot.seated[1]) {
      introShown = true;
      await intro();
    }
  }

  function setPos(p: Player, i: number, pos: number) {
    const pieces: [number[], number[]] = [[...display!.pieces[0]], [...display!.pieces[1]]];
    pieces[p][i] = pos;
    display = { ...display!, pieces };
  }

  function addEffect(kind: Effect['kind'], at: Point) {
    if (reducedMotion()) return;
    const id = effectId++;
    effects = [...effects, { id, kind, at }];
    setTimeout(() => { effects = effects.filter((f) => f.id !== id); }, 1200);
  }

  function say(e: GameEvent) {
    announcement = describeEvent(e, snap!.names);
    const t = eventToast(e, snap!.names);
    if (t) toasts.push(t);
  }

  async function animate(e: GameEvent) {
    switch (e.type) {
      case 'rolled':
        rolling = true;
        sound.dice();
        await sleep(T(700));
        display = { ...display!, dice: e.dice, roll: e.roll };
        rolling = false;
        say(e);
        await sleep(T(250));
        break;
      case 'passed':
        say(e);
        await sleep(T(1100));
        break;
      case 'moved': {
        const key = keyOf(e.player, e.piece);
        for (let pos = e.from + 1; pos < e.to && pos <= 14; pos++) {
          overrides = { ...overrides, [key]: piecePoint(e.player, pos, 0, perspective) };
          sound.step();
          await sleep(T(170));
        }
        const { [key]: _, ...rest } = overrides;
        overrides = rest;
        setPos(e.player, e.piece, e.to);
        sound.step();
        say(e);
        await sleep(T(200));
        break;
      }
      case 'captured':
        addEffect('capture', piecePoint(e.player, e.at, 0, perspective));
        sound.capture();
        flying = { ...flying, [keyOf(e.victim, e.piece)]: true };
        setPos(e.victim, e.piece, START);
        say(e);
        await sleep(T(650));
        break;
      case 'rosette':
        addEffect('rosette', piecePoint(e.player, e.at, 0, perspective));
        sound.rosette();
        say(e);
        await sleep(T(700));
        break;
      case 'borneOff': {
        const home = display!.pieces[e.player].filter((p) => p === OFF).length;
        addEffect('bearOff', traySlot(e.player, 'off', Math.max(0, home - 1), perspective));
        sound.bearOff();
        say(e);
        await sleep(T(350));
        break;
      }
      case 'won':
        sound.win();
        say(e);
        break;
    }
  }

  async function intro() {
    if (reducedMotion()) return;
    introText = 'Casting lots…';
    rolling = true;
    sound.dice();
    await sleep(1100);
    rolling = false;
    const first = display!.current;
    introText = snap!.controls.length === 1 && snap!.controls[0] === first ? 'You go first' : `${snap!.names[first]} goes first`;
    await sleep(1300);
    introText = null;
  }

  function doRoll() {
    if (!canRoll) return;
    pending = true;
    controller.roll();
  }

  function doMove(piece: number) {
    pending = true;
    selected = null;
    controller.move(piece);
  }

  function onPiece(player: Player, piece: number, how: string) {
    if (!display || !snap || animating || pending || introText) return;
    if (!snap.controls.includes(player) || !bothSeated || display.phase === 'finished') return;
    if (display.current !== player) {
      toasts.push(`It is ${snap.names[display.current]}’s turn.`);
      return;
    }
    const why = whyCannotMove(display, piece);
    if (why) {
      toasts.push(why);
      return;
    }
    if (how === 'mouse' || selected === piece) doMove(piece);
    else selected = piece;
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.target instanceof Element && e.target.closest('button, a, input, textarea, [role="dialog"]')) return;
    if (e.key === ' ') {
      if (canRoll) { e.preventDefault(); doRoll(); }
      return;
    }
    if (!moves.length) return;
    const order = [...moves].sort((a, b) => a.from - b.from).map((m) => m.piece);
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= order.length) {
      selected = order[n - 1];
      return;
    }
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const i = selected === null ? (step > 0 ? -1 : 0) : order.indexOf(selected);
      selected = order[(i + step + order.length) % order.length];
      return;
    }
    if (e.key === 'Enter' && selected !== null && movable.includes(selected)) {
      e.preventDefault();
      doMove(selected);
    }
  }

  function noteFor(p: Player): string {
    if (!display || !snap) return '';
    if (snap.mode === 'online' && snap.seated[p] && !snap.connected[p] && !snap.controls.includes(p)) return 'Disconnected — waiting…';
    if (display.phase === 'finished' || display.current !== p || !bothSeated) return '';
    if (snap.controls.includes(p)) {
      const prefix = snap.controls.length > 1 ? `${snap.names[p]} — ` : '';
      return prefix + (display.phase === 'awaitingRoll' ? 'roll the dice' : 'choose a piece');
    }
    return snap.mode === 'ai' ? 'Thinking…' : 'Their turn';
  }

  const victoryTitle = $derived.by(() => {
    if (!display || display.winner === null || !snap) return '';
    if (snap.controls.length === 1) return snap.controls[0] === display.winner ? 'Victory' : 'Defeat';
    return `${snap.names[display.winner]} wins`;
  });

  const rematchUi = $derived.by(() => {
    if (!snap || snap.spectator) return null;
    if (snap.mode !== 'online') return { label: 'Play again', disabled: false };
    const me = snap.controls[0];
    if (snap.rematch[me]) return { label: 'Waiting for rival…', disabled: true };
    if (snap.rematch[other(me)]) return { label: 'Accept rematch', disabled: false };
    return { label: 'Rematch', disabled: false };
  });
</script>

<svelte:window onkeydown={onKey} />

{#if status === 'notFound' && gone}
  {@render gone()}
{:else}
  <div class="screen" class:vertical>
    <TopBar />
    {#if status === 'reconnecting'}<div class="banner" role="status">Connection lost — reconnecting…</div>{/if}
    {#if snap?.spectator}<div class="banner subtle" role="status">You are watching this game.</div>{/if}

    {#if display && snap}
      <PlayerHud name={snap.names[top]} player={top} pieces={display.pieces[top]} active={display.current === top && display.phase !== 'finished'} note={noteFor(top)} />
      <div class="board-wrap">
        <Board
          state={display}
          {perspective}
          {vertical}
          {movable}
          {preview}
          {overrides}
          {flying}
          {effects}
          onpiece={onPiece}
          onhover={(p) => (hovered = p)}
          onselect={(p) => (selected = p)}
          onghost={() => selected !== null && doMove(selected)}
        />
        {#if introText}<div class="intro" role="status"><p>{introText}</p></div>{/if}
      </div>
      <div class="bottom">
        <PlayerHud name={snap.names[perspective]} player={perspective} pieces={display.pieces[perspective]} active={display.current === perspective && display.phase !== 'finished'} note={noteFor(perspective)} />
        <Dice dice={rolling ? null : display.dice} total={display.roll} {rolling} enabled={canRoll} onroll={doRoll} />
      </div>

      {#if !bothSeated && invite}
        <div class="overlay"><div class="card">{@render invite()}</div></div>
      {/if}
      {#if finished && display.winner !== null}
        <VictoryOverlay
          title={victoryTitle}
          winner={display.winner}
          rematchLabel={rematchUi?.label}
          rematchDisabled={rematchUi?.disabled}
          onrematch={rematchUi ? () => controller.rematch() : undefined}
        />
      {/if}
    {:else}
      <p class="loading">Preparing the board…</p>
    {/if}
    <Toasts />
    <p class="sr-only" aria-live="polite">{announcement}</p>
  </div>
{/if}

<style>
  .screen {
    min-height: 100dvh;
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    gap: 10px;
    padding: max(8px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }
  .board-wrap { position: relative; display: grid; place-items: center; min-height: 0; }
  .board-wrap :global(svg.board) { max-height: calc(100dvh - 250px); }
  .bottom { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
  .bottom > :global(.hud) { flex: 1 1 260px; }
  .vertical .bottom { flex-direction: column-reverse; align-items: stretch; }
  .vertical .bottom :global(.dice) { justify-content: center; }
  .banner { padding: 8px 14px; border: 1px solid var(--carnelian); border-radius: 10px; background: #7a2a16cc; text-align: center; }
  .banner.subtle { border-color: #e2bf6355; background: #0b1438cc; }
  .intro { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
  .intro p { margin: 0; padding: 0.4em 1.1em; border: 1px solid var(--gold); border-radius: 12px; background: #060a1fdd; font-family: var(--font-display); font-size: clamp(1.5rem, 5vw, 2.5rem); color: var(--gold); box-shadow: 0 20px 50px #000b; animation: rise 0.45s ease-out; }
  .overlay { position: fixed; inset: 0; z-index: 35; display: grid; place-items: center; padding: 20px; background: #060a1fcc; }
  .card { width: min(92vw, 460px); padding: 24px; border: 1px solid var(--gold); border-radius: 16px; background: linear-gradient(180deg, #16307e, #0b1438); box-shadow: 0 30px 80px #000c; }
  .loading { place-self: center; font-style: italic; }
  @keyframes rise { from { opacity: 0; transform: translateY(12px); } }
</style>
```

- [ ] **Step 8: Mode wrappers and routes**

`client/src/screens/LocalGame.svelte`:
```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { LocalController } from '../game/local';
  import GameScreen from './GameScreen.svelte';

  const controller = new LocalController('local', ['Gold', 'Carnelian'], [0, 1]);
  onDestroy(() => controller.dispose());
</script>

<GameScreen {controller} />
```

`client/src/screens/AiGame.svelte`:
```svelte
<script lang="ts">
  import type { AiLevel } from '@ur/shared';
  import { onDestroy } from 'svelte';
  import { AiController } from '../game/aiController';
  import GameScreen from './GameScreen.svelte';

  let { level }: { level: AiLevel } = $props();
  const controller = new AiController(level);
  onDestroy(() => controller.dispose());
</script>

<GameScreen {controller} />
```

`client/src/App.svelte` (replace):
```svelte
<script lang="ts">
  import type { AiLevel } from '@ur/shared';
  import SvgDefs from './board/SvgDefs.svelte';
  import { route } from './lib/router.svelte';
  import AiGame from './screens/AiGame.svelte';
  import Home from './screens/Home.svelte';
  import LocalGame from './screens/LocalGame.svelte';
  import NotFound from './screens/NotFound.svelte';

  const aiMatch = $derived(route.path.match(/^\/play\/ai\/(easy|medium|hard)\/?$/));
</script>

<SvgDefs />
{#if route.path === '/'}
  <Home />
{:else if aiMatch}
  {#key aiMatch[1]}<AiGame level={aiMatch[1] as AiLevel} />{/key}
{:else if route.path === '/play/local'}
  <LocalGame />
{:else}
  <NotFound />
{/if}
```

- [ ] **Step 9: Check, test and play it**

Run: `npm run check -w client && npx vitest run client`
Expected: 0 errors; tests PASS.

With `npm run dev` running, use Playwright MCP:
1. Open `http://localhost:5173/play/local` at 1280×800. Click the dice; confirm the tumble, the tips lighting up, the total, and glowing movable pieces. Hover a piece → dashed ghost at its destination; click → it slides square by square.
2. Play until a rosette ("Rosette — … roll again" toast and gold bloom) and a capture (spark, captured piece flies to its tray) happen.
3. Open `/play/ai/hard`: the computer rolls and moves on its own with "Thinking…" in its HUD.
4. Resize to 390×844: board is vertical, dice are reachable at the bottom, tap-to-preview then tap-again moves (use `browser_evaluate` to dispatch `pointerup` with `pointerType: 'touch'` if the MCP click is mouse-only).
5. Keyboard: Space rolls; 1–n selects; Enter moves.
Fix anything that looks wrong before committing.

- [ ] **Step 10: Commit**

```bash
git add client
git commit -m "feat: animated game screen with pass & play and computer opponent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Online play in the browser

**Files:**
- Create: `client/src/game/online.ts`, `client/src/ui/InvitePanel.svelte`, `client/src/screens/OnlineGame.svelte`
- Modify: `client/src/App.svelte`
- Test: `client/src/game/online.test.ts`

**Interfaces:**
- Consumes: `RoomSnapshot`, `ServerMsg`, `ClientMsg` (shared); `GameController`, `Snapshot`, `Emitter` (Task 8); `gameInfo`, `joinGame`, `ApiError`, `seatTokens` (Task 7).
- Produces: `toSnapshot(r: RoomSnapshot): Snapshot`; `new OnlineController(gameId, token: string | null)`; `<OnlineGame gameId />`; `<InvitePanel gameId />` (root `data-testid="invite"`, input labelled "Invite link").

- [ ] **Step 1: Write the failing snapshot-mapping test**

`client/src/game/online.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { newGame, type RoomSnapshot } from '@ur/shared';
import { toSnapshot } from './online';

const room = (seat: 0 | 1 | null): RoomSnapshot => ({
  gameId: 'ABC234', state: newGame(0), seat, seated: [true, true], connected: [true, false], rematch: [false, true],
});

describe('toSnapshot', () => {
  it('maps the creator’s view', () => {
    expect(toSnapshot(room(0))).toMatchObject({
      mode: 'online', gameId: 'ABC234', controls: [0], perspective: 0, names: ['You', 'Friend'],
      spectator: false, connected: [true, false], rematch: [false, true],
    });
  });
  it('puts the joiner at the bottom', () => {
    expect(toSnapshot(room(1))).toMatchObject({ controls: [1], perspective: 1, names: ['Friend', 'You'] });
  });
  it('makes spectators read-only', () => {
    expect(toSnapshot(room(null))).toMatchObject({ controls: [], perspective: 0, names: ['Gold', 'Carnelian'], spectator: true });
  });
});
```

Run: `npx vitest run client/src/game/online.test.ts`
Expected: FAIL — cannot resolve `./online`.

- [ ] **Step 2: Implement the online controller**

`client/src/game/online.ts`:
```ts
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
```

Run: `npx vitest run client/src/game/online.test.ts`
Expected: PASS.

- [ ] **Step 3: Invite panel, online screen and route**

`client/src/ui/InvitePanel.svelte`:
```svelte
<script lang="ts">
  let { gameId }: { gameId: string } = $props();

  const url = $derived(`${location.origin}/g/${gameId}`);
  const canShare = typeof navigator.share === 'function';
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'The Royal Game of Ur', text: 'Play the Royal Game of Ur with me', url });
    } catch {
      /* share sheet dismissed */
    }
  }
</script>

<div class="invite" data-testid="invite">
  <p class="eyebrow">Waiting for your friend</p>
  <h2>Send them this link</h2>
  <p class="code" aria-label="Game code {gameId}">{gameId}</p>
  <input class="link" readonly value={url} aria-label="Invite link" onfocus={(e) => e.currentTarget.select()} />
  <div class="actions">
    <button class="btn" onclick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
    {#if canShare}<button class="btn ghost" onclick={share}>Share…</button>{/if}
  </div>
  <p class="hint">The game begins as soon as they open it.</p>
</div>

<style>
  .invite { display: grid; justify-items: center; gap: 10px; text-align: center; }
  h2 { margin: 0; font-size: 1.6rem; }
  .code { margin: 4px 0; font-family: var(--font-display); font-size: 2.2rem; letter-spacing: 0.3em; color: var(--gold-pale); }
  .link { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid #e2bf6366; border-radius: 8px; background: #060a1f; color: var(--shell); font: inherit; font-size: 1rem; text-align: center; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .hint { margin: 0; font-style: italic; opacity: 0.85; }
</style>
```

`client/src/screens/OnlineGame.svelte`:
```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, gameInfo, joinGame } from '../game/api';
  import { OnlineController } from '../game/online';
  import { seatTokens } from '../game/storage';
  import InvitePanel from '../ui/InvitePanel.svelte';
  import GameScreen from './GameScreen.svelte';
  import NotFound from './NotFound.svelte';

  let { gameId }: { gameId: string } = $props();
  let controller = $state<OnlineController | null>(null);
  let failure = $state<string | null>(null);

  async function start() {
    failure = null;
    try {
      let token = seatTokens.get(gameId);
      if (!token) {
        const info = await gameInfo(gameId);
        if (!info.seated[1]) {
          try {
            token = (await joinGame(gameId)).seatToken;
            seatTokens.set(gameId, token);
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 409)) throw e;
          }
        }
      }
      controller = new OnlineController(gameId, token);
    } catch (e) {
      failure = e instanceof ApiError && e.status === 404 ? 'notFound' : e instanceof Error ? e.message : 'Something went wrong.';
    }
  }

  onMount(start);
  onDestroy(() => controller?.dispose());
</script>

{#snippet goneView()}
  <NotFound title="This game no longer exists" message="Games are cleared away after a week without moves. Start a new one and send your friend the link." />
{/snippet}

{#if failure === 'notFound'}
  {@render goneView()}
{:else if failure}
  <main class="failure">
    <p role="alert">{failure}</p>
    <button class="btn" onclick={start}>Try again</button>
  </main>
{:else if controller}
  <GameScreen {controller} gone={goneView}>
    {#snippet invite()}<InvitePanel {gameId} />{/snippet}
  </GameScreen>
{:else}
  <p class="loading">Opening the game…</p>
{/if}

<style>
  .failure, .loading { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 16px; padding: 24px; text-align: center; }
  .loading { font-style: italic; }
</style>
```

`client/src/App.svelte` — add the import and route. Add to the `<script>`:
```ts
  import OnlineGame from './screens/OnlineGame.svelte';

  const gameMatch = $derived(route.path.match(/^\/g\/([a-z0-9]{4,12})\/?$/i));
```
and insert before `{:else if aiMatch}`:
```svelte
{:else if gameMatch}
  {#key gameMatch[1].toUpperCase()}<OnlineGame gameId={gameMatch[1].toUpperCase()} />{/key}
```

- [ ] **Step 4: Check and play across two browsers**

Run: `npm run check -w client && npx vitest run`
Expected: 0 errors; all tests PASS.

With `npm run dev` running, use Playwright MCP: open `http://localhost:5173/`, click "Play a Friend" → invite panel shows the code, link and Copy button, dice disabled. Open the link in a second tab with a fresh context (or `browser_evaluate` to clear `localStorage` first). Confirm: the casting-lots intro plays on both, moves appear on both, the opponent HUD says "Their turn", closing one tab shows "Disconnected — waiting…" on the other, reopening restores the seat, and a third visitor sees "You are watching this game." Finish a game with `/g/<id>` lowercase in the URL to confirm case-insensitivity.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat: online play with invite links, reconnection and spectators

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Teaching the rules — How to Play and first-game coaching

**Files:**
- Create: `client/src/game/coach.svelte.ts`, `client/src/ui/Coach.svelte`, `client/src/screens/HowToPlay.svelte`
- Modify: `client/src/screens/GameScreen.svelte`, `client/src/App.svelte`

**Interfaces:**
- Consumes: `MiniBoard`, `Piece`, `Dice`, geometry (Task 7/8); `GameScreen` internals (Task 8).
- Produces: `type TipKey = 'roll' | 'move' | 'rosette' | 'central' | 'danger' | 'capture' | 'pass'`; `coach.current`, `coach.text`, `coach.enabled`, `coach.trigger(key)`, `coach.dismiss()`, `coach.disable()`, `coach.enable()` (localStorage keys `ur.coach.seen`, `ur.coach.off`); `<HowToPlay onclose? />` with exactly nine `<h2>` sections; in-game help dialog `role="dialog"` labelled "How to play".

- [ ] **Step 1: Coach state and component**

`client/src/game/coach.svelte.ts`:
```ts
export type TipKey = 'roll' | 'move' | 'rosette' | 'central' | 'danger' | 'capture' | 'pass';

const hoverCapable = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;

const TIPS: Record<TipKey, () => string> = {
  roll: () => 'Tap the dice to throw them. Count the marked tips facing up — that is how far you move.',
  move: () =>
    hoverCapable()
      ? 'Glowing pieces can move. Hover to see where one would land, then click to move it.'
      : 'Glowing pieces can move. Tap one to see where it would land, then tap again to move it.',
  rosette: () => 'A rosette! Landing on one gives you another throw.',
  central: () => 'The central rosette is a safe haven — a piece resting there cannot be captured.',
  danger: () => 'Careful: a rival piece is up to four squares behind yours in the shared row and could capture it.',
  capture: () => 'Capture! Landing on a rival in the shared row sends that piece back to the start.',
  pass: () => 'A throw of zero, or a throw with no legal move, passes the turn.',
};

const OFF_KEY = 'ur.coach.off';
const SEEN_KEY = 'ur.coach.seen';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode */ }
}

let enabled = $state(read(OFF_KEY) !== '1');
let current = $state<TipKey | null>(null);
let seen = new Set<string>(JSON.parse(read(SEEN_KEY) ?? '[]') as string[]);

export const coach = {
  get current() { return current; },
  get text() { return current ? TIPS[current]() : ''; },
  get enabled() { return enabled; },
  /** Shows a tip once ever, and only when no other tip is showing. */
  trigger(key: TipKey) {
    if (!enabled || current || seen.has(key)) return;
    seen.add(key);
    write(SEEN_KEY, JSON.stringify([...seen]));
    current = key;
  },
  dismiss() { current = null; },
  disable() {
    enabled = false;
    current = null;
    write(OFF_KEY, '1');
  },
  enable() {
    enabled = true;
    seen = new Set();
    write(SEEN_KEY, '[]');
    write(OFF_KEY, null);
  },
};
```

`client/src/ui/Coach.svelte`:
```svelte
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { coach } from '../game/coach.svelte';
</script>

{#if coach.current}
  <aside class="coach" aria-live="polite" transition:fly={{ y: -14, duration: 250 }}>
    <span class="glyph" aria-hidden="true">✦</span>
    <p>{coach.text}</p>
    <div class="actions">
      <button class="btn small" onclick={() => coach.dismiss()}>Got it</button>
      <button class="quiet" onclick={() => coach.disable()}>Turn off tips</button>
    </div>
  </aside>
{/if}

<style>
  .coach { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); z-index: 20; display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; width: min(94%, 520px); padding: 12px 16px; border: 1px solid var(--gold); border-radius: 12px; background: #060a1ff2; box-shadow: 0 16px 40px #000c; }
  .glyph { color: var(--gold); font-size: 1.3rem; line-height: 1.2; }
  p { margin: 0; font-size: 1.05rem; }
  .actions { grid-column: 2; display: flex; align-items: center; gap: 14px; }
  .quiet { min-height: 44px; border: 0; background: none; color: var(--gold); text-decoration: underline; cursor: pointer; }
</style>
```

- [ ] **Step 2: How to Play page**

`client/src/screens/HowToPlay.svelte`:
```svelte
<script lang="ts">
  import { cellFor, type Player } from '@ur/shared';
  import Dice from '../board/Dice.svelte';
  import MiniBoard from '../board/MiniBoard.svelte';
  import Piece from '../board/Piece.svelte';
  import { G, S, cellCenter, cellOrigin } from '../board/geometry';
  import { coach } from '../game/coach.svelte';
  import { link } from '../lib/router.svelte';

  let { onclose }: { onclose?: () => void } = $props();

  const at = (player: Player, pos: number) => {
    const c = cellFor(player, pos)!;
    return cellCenter(c.row, c.col, 0);
  };
  const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');

  const start = cellCenter(0, 4.15, 0);
  const finish = cellCenter(0, 5.0, 0);
  const route = pts([start, ...Array.from({ length: 14 }, (_, i) => at(0, i + 1)), finish]);
  const squares = Array.from({ length: 14 }, (_, i) => ({ n: i + 1, ...at(0, i + 1) }));
  const shared = cellOrigin(1, 0, 0);
  const rosettes = ([[0, 0], [0, 6], [1, 3], [2, 0], [2, 6]] as const).map(([r, c]) => cellCenter(r, c, 0));
  const central = cellCenter(1, 3, 0);
  const odds = [1, 4, 6, 4, 1];
  let tipsReset = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose?.()} />

<main class="rules">
  <div class="bar">
    {#if onclose}
      <button class="btn small ghost" onclick={onclose}>Back to the game</button>
    {:else}
      <a class="btn small ghost" href="/" use:link>Home</a>
    {/if}
  </div>

  <header>
    <p class="eyebrow">How to play</p>
    <h1>The Royal Game of Ur</h1>
    <p class="lede">A race for two, played across the ancient Near East for three thousand years.</p>
  </header>

  <section>
    <h2>1 · The goal</h2>
    <p>Each player has seven pieces — gold or carnelian. Race all seven along your route and off the board before your rival does.</p>
    <MiniBoard label="Gold and carnelian pieces racing along the board">
      <Piece {...at(0, 3)} player={0} />
      <Piece {...at(0, 9)} player={0} />
      <Piece {...at(1, 6)} player={1} />
      <Piece {...at(1, 13)} player={1} />
    </MiniBoard>
  </section>

  <section>
    <h2>2 · The dice</h2>
    <p>Throw the four pyramid-shaped dice. Each has one marked tip. Count the marked tips facing up — that is your move, from 0 to 4.</p>
    <div class="center"><Dice dice={[1, 0, 1, 1]} total={3} rolling={false} enabled={false} testid="dice-example" /></div>
    <p>The numbers are not equally likely: two comes up most often, while zero and four are rare.</p>
    <svg class="odds" viewBox="0 0 300 140" role="img" aria-label="Chances out of 16: zero 1, one 4, two 6, three 4, four 1">
      {#each odds as o, i}
        <rect x={20 + i * 56} y={110 - o * 14} width="40" height={o * 14} rx="3" />
        <text x={40 + i * 56} y="132">{i}</text>
        <text class="small" x={40 + i * 56} y={102 - o * 14}>{o}/16</text>
      {/each}
    </svg>
  </section>

  <section>
    <h2>3 · The route</h2>
    <p>Pieces enter on your own side, run the length of the shared middle row, then turn back onto your side and leave the board. The first four squares and the last two are yours alone; the eight in the middle are the battleground.</p>
    <MiniBoard label="Your route: four private squares, eight shared squares, two private squares, then off the board">
      <rect class="shared" x={shared.x - 5} y={shared.y - 5} width={8 * S + 7 * G + 10} height={S + 10} rx="8" />
      <polyline class="route" points={route} />
      {#each squares as s}
        <g class="num" transform="translate({s.x + 30} {s.y - 30})"><circle r="14" /><text dy="5">{s.n}</text></g>
      {/each}
      <text class="label" x={start.x + 10} y={start.y - 16}>Start</text>
      <text class="label" x={finish.x} y={finish.y + 36}>Off</text>
    </MiniBoard>
  </section>

  <section>
    <h2>4 · Moving</h2>
    <p>Move one piece exactly the number you threw — either a new piece onto the board, or one already on its way.</p>
    <ul>
      <li>You cannot land on a square holding your own piece.</li>
      <li>Bearing a piece off needs the exact number to step just past your last square.</li>
    </ul>
    <MiniBoard label="A gold piece moving three squares">
      <circle class="target" cx={at(0, 5).x} cy={at(0, 5).y} r="34" />
      <polyline class="route short" points={pts([at(0, 2), at(0, 3), at(0, 4), at(0, 5)])} />
      <Piece {...at(0, 2)} player={0} />
    </MiniBoard>
  </section>

  <section>
    <h2>5 · Capturing</h2>
    <p>Land on a rival’s piece in the shared row and it is knocked back to the start, to begin its journey again. Pieces on your private squares are always safe.</p>
    <MiniBoard label="A gold piece capturing a carnelian piece">
      <polyline class="route short" points={pts([at(0, 6), at(0, 7), at(0, 8), at(0, 9)])} />
      <Piece {...at(0, 6)} player={0} />
      <Piece {...at(1, 9)} player={1} />
      <circle class="hit" cx={at(1, 9).x} cy={at(1, 9).y} r="44" />
    </MiniBoard>
  </section>

  <section>
    <h2>6 · Rosettes</h2>
    <p>Land on any of the five rosettes and you throw again. The central rosette is a safe haven: a piece resting there cannot be captured, and no rival may land on it.</p>
    <MiniBoard label="The five rosettes, with the safe central rosette">
      {#each rosettes as r}<circle class="glow" cx={r.x} cy={r.y} r="46" />{/each}
      <text class="label" x={central.x} y={central.y + 76}>Safe</text>
    </MiniBoard>
  </section>

  <section>
    <h2>7 · Passing</h2>
    <p>A throw of zero — or a throw with no legal move — passes your turn. The game will always tell you when this happens.</p>
    <div class="center"><Dice dice={[0, 0, 0, 0]} total={0} rolling={false} enabled={false} testid="dice-example-zero" /></div>
  </section>

  <section>
    <h2>8 · Strategy</h2>
    <ul>
      <li>Hold the central rosette: it is safe, it blocks your rival, and it grants another throw.</li>
      <li>Don’t linger one to four squares ahead of a rival piece in the shared row — two is the likeliest throw.</li>
      <li>Keep several pieces in play so a single throw always has a good option.</li>
      <li>Move through the battleground quickly; your last two squares are safe.</li>
    </ul>
  </section>

  <section>
    <h2>9 · History</h2>
    <p>Two of these boards were excavated by Sir Leonard Woolley in the Royal Cemetery at Ur, in present-day Iraq, in the 1920s. They date to around 2600 BCE, which makes this one of the oldest board games ever found.</p>
    <p>The rules were lost for millennia. In the 1980s Irving Finkel of the British Museum reconstructed them from a cuneiform tablet written by a Babylonian scribe in 177 BCE. This game follows his reconstruction.</p>
  </section>

  <footer>
    {#if tipsReset}
      <p>Beginner tips will appear again in your next game.</p>
    {:else}
      <button class="btn small ghost" onclick={() => { coach.enable(); tipsReset = true; }}>Show beginner tips again</button>
    {/if}
  </footer>
</main>

<style>
  .rules { max-width: 760px; margin: 0 auto; padding: max(12px, env(safe-area-inset-top)) 20px 48px; }
  .bar { position: sticky; top: 0; z-index: 2; padding: 8px 0; }
  header { text-align: center; margin-bottom: 24px; }
  h1 { margin: 0.2em 0; font-size: clamp(2rem, 6vw, 3rem); }
  .lede { margin: 0; font-style: italic; font-size: 1.2rem; }
  section { margin: 28px 0; padding: 20px; border: 1px solid #e2bf6333; border-radius: 14px; background: #0b143866; }
  h2 { margin: 0 0 8px; font-size: 1.4rem; }
  p, li { font-size: 1.15rem; }
  ul { padding-left: 1.2em; }
  .center { display: flex; justify-content: center; margin: 12px 0; }
  .odds { display: block; width: min(100%, 360px); margin: 0 auto; }
  .odds rect { fill: var(--gold); }
  .odds text { fill: var(--shell); font-family: var(--font-display); font-size: 16px; text-anchor: middle; }
  .odds text.small { font-size: 12px; fill: var(--gold-pale); }
  .shared { fill: #c7512f22; stroke: var(--carnelian); stroke-width: 3; stroke-dasharray: 10 6; }
  .route { fill: none; stroke: var(--gold-pale); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 2600; stroke-dashoffset: 2600; animation: draw 5s ease-in-out infinite; filter: drop-shadow(0 0 6px #f3d27a); }
  .route.short { stroke-dasharray: 600; stroke-dashoffset: 600; animation-duration: 2.5s; }
  .num circle { fill: #060a1f; stroke: var(--gold); stroke-width: 2; }
  .num text, .label { fill: var(--gold-pale); font-family: var(--font-display); font-size: 16px; font-weight: 700; text-anchor: middle; }
  .label { font-size: 24px; }
  .target { fill: #e2bf6333; stroke: var(--gold-pale); stroke-width: 3; stroke-dasharray: 8 7; }
  .hit { fill: none; stroke: #ff9b74; stroke-width: 4; animation: pulse 1.4s ease-in-out infinite; }
  .glow { fill: none; stroke: var(--gold-pale); stroke-width: 5; animation: pulse 2s ease-in-out infinite; }
  footer { text-align: center; }
  @keyframes draw { 0% { stroke-dashoffset: 2600; } 70%, 100% { stroke-dashoffset: 0; } }
  @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
</style>
```

`client/src/board/Dice.svelte` — add a `testid` prop so example dice don't collide with the real one. Change the props to:
```ts
  interface Props { dice: Dice | null; total: number | null; rolling: boolean; enabled: boolean; onroll?: () => void; testid?: string }
  let { dice, total, rolling, enabled, onroll, testid = 'dice' }: Props = $props();
```
and the button attribute `data-testid="dice"` to `data-testid={testid}`.

- [ ] **Step 3: Wire coaching and the help dialog into the game screen**

In `client/src/screens/GameScreen.svelte`:

1. Change the shared import to:
```ts
  import { CENTRAL_ROSETTE, OFF, START, isShared, legalMoves, other, whyCannotMove, type GameEvent, type GameState, type Player } from '@ur/shared';
```
and add:
```ts
  import { coach } from '../game/coach.svelte';
  import Coach from '../ui/Coach.svelte';
  import HowToPlay from './HowToPlay.svelte';
```

2. Add next to the other `$state` declarations:
```ts
  let helpOpen = $state(false);
```

3. Add these functions after `say(...)`:
```ts
  function coachForEvent(e: GameEvent) {
    const mine = snap!.controls.includes(e.player);
    if (e.type === 'passed' && mine) coach.trigger('pass');
    if (e.type === 'rosette' && mine) coach.trigger(e.at === CENTRAL_ROSETTE ? 'central' : 'rosette');
    if (e.type === 'captured' && (mine || snap!.controls.includes(e.victim))) coach.trigger('capture');
  }

  function coachForPosition() {
    if (!display || !snap || !bothSeated || display.phase === 'finished' || !snap.controls.includes(display.current)) return;
    coach.trigger(display.phase === 'awaitingRoll' ? 'roll' : 'move');
    const theirs = display.pieces[other(display.current)];
    const threatened = display.pieces[display.current].some(
      (pos) => isShared(pos) && pos !== CENTRAL_ROSETTE && theirs.some((o) => o >= 1 && o < pos && pos - o <= 4),
    );
    if (threatened) coach.trigger('danger');
  }
```

4. In `animate`, make `coachForEvent(e);` the first statement (before `switch`).

5. In `pump`, call `coachForPosition();` immediately before `controller.idle();`.

6. In `doRoll`, before `pending = true;` add `if (coach.current === 'roll') coach.dismiss();`. In `doMove`, before `pending = true;` add `if (coach.current === 'move') coach.dismiss();`.

7. Make the first line of `onKey`:
```ts
    if (helpOpen) {
      if (e.key === 'Escape') helpOpen = false;
      return;
    }
```

8. Replace `<TopBar />` with `<TopBar onhelp={() => (helpOpen = true)} />`.

9. Inside `.board-wrap`, after the `{#if introText}` block, add `<Coach />`.

10. After `<Toasts />`, add:
```svelte
    {#if helpOpen}
      <div class="help" role="dialog" aria-modal="true" aria-label="How to play">
        <HowToPlay onclose={() => (helpOpen = false)} />
      </div>
    {/if}
```
and to the `<style>` block:
```css
  .help { position: fixed; inset: 0; z-index: 50; overflow-y: auto; background: radial-gradient(ellipse at 50% 20%, #1b2f74f5, #060a1ffa); }
```

`client/src/App.svelte` — import `HowToPlay from './screens/HowToPlay.svelte'` and add before `{:else}`:
```svelte
{:else if route.path === '/how-to-play'}
  <HowToPlay />
```

- [ ] **Step 4: Check and review visually**

Run: `npm run check -w client && npx vitest run`
Expected: 0 errors; all tests PASS.

With `npm run dev`, use Playwright MCP to screenshot `/how-to-play` at 1280×800 and 390×844: nine sections, route line animates through squares 1→14 from "Start" to "Off" with the shared row outlined, rosettes glow, odds bars read 1/4/6/4/1. In `/play/local` (with `localStorage` cleared) the coach card appears for the first roll and first move, "Turn off tips" stops them, "?" opens the rules over the game and Escape closes it without losing the game.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat: illustrated how-to-play, in-game rules overlay and first-game coaching

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Installable app (PWA manifest and icons)

**Files:**
- Create: `client/public/icon.svg`, `client/public/manifest.webmanifest`, `client/scripts/make-icons.mjs`
- Generate: `client/public/icon-180.png`, `icon-192.png`, `icon-512.png`
- Modify: `client/index.html`

**Interfaces:**
- Produces: `/manifest.webmanifest`, `/icon.svg`, `/icon-{180,192,512}.png` served from the client root.

- [ ] **Step 1: Icon and manifest**

`client/public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.4" r="0.75">
      <stop offset="0" stop-color="#1b2f74"/>
      <stop offset="1" stop-color="#060a1f"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <rect x="44" y="44" width="424" height="424" rx="60" fill="none" stroke="#e2bf63" stroke-width="10"/>
  <g transform="translate(256 256)">
    <circle r="150" fill="none" stroke="#e2bf63" stroke-width="12"/>
    <ellipse cy="-78" rx="30" ry="62" fill="#c7512f" stroke="#f3d27a" stroke-width="5"/>
    <ellipse cy="-78" rx="30" ry="62" fill="#e2bf63" stroke="#f3d27a" stroke-width="5" transform="rotate(45)"/>
    <ellipse cy="-78" rx="30" ry="62" fill="#c7512f" stroke="#f3d27a" stroke-width="5" transform="rotate(90)"/>
    <ellipse cy="-78" rx="30" ry="62" fill="#e2bf63" stroke="#f3d27a" stroke-width="5" transform="rotate(135)"/>
    <ellipse cy="-78" rx="30" ry="62" fill="#c7512f" stroke="#f3d27a" stroke-width="5" transform="rotate(180)"/>
    <ellipse cy="-78" rx="30" ry="62" fill="#e2bf63" stroke="#f3d27a" stroke-width="5" transform="rotate(225)"/>
    <ellipse cy="-78" rx="30" ry="62" fill="#c7512f" stroke="#f3d27a" stroke-width="5" transform="rotate(270)"/>
    <ellipse cy="-78" rx="30" ry="62" fill="#e2bf63" stroke="#f3d27a" stroke-width="5" transform="rotate(315)"/>
    <circle r="28" fill="#c7512f" stroke="#f3d27a" stroke-width="6"/>
  </g>
</svg>
```

`client/public/manifest.webmanifest`:
```json
{
  "name": "The Royal Game of Ur",
  "short_name": "Ur",
  "description": "Play the 4,500-year-old Royal Game of Ur with a friend, against the computer, or pass and play.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#060a1f",
  "theme_color": "#0b1438",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

`client/scripts/make-icons.mjs` (full-bleed PNGs so iOS and maskable icons have no transparent corners):
```js
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const svg = (await readFile(path.join(pub, 'icon.svg'), 'utf8')).replace('rx="96"', 'rx="0"');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: path.join(pub, `icon-${size}.png`) });
}
await browser.close();
console.log('icons written to', pub);
```

- [ ] **Step 2: Generate icons and link them**

Run: `npx playwright install chromium && npm run icons -w client && ls client/public`
Expected: `icon-180.png icon-192.png icon-512.png icon.svg manifest.webmanifest`.

In `client/index.html`, add after the `theme-color` meta:
```html
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Ur" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icon-180.png" />
```

- [ ] **Step 3: Verify**

Run: `npm run build && PORT=3999 DATA_DIR=/tmp/ur-pwa node server/dist/index.js & sleep 1; curl -s localhost:3999/manifest.webmanifest | head -3; curl -sI localhost:3999/icon-512.png | head -1; kill %1`
Expected: manifest JSON and `HTTP/1.1 200 OK`. Look at `icon-512.png` with the Read tool: gold rosette on lapis.

- [ ] **Step 4: Commit**

```bash
git add client
git commit -m "feat: installable web app manifest and icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: End-to-end tests (desktop, Android, iPhone)

**Files:**
- Create: `playwright.config.ts`, `e2e/helpers.ts`, `e2e/online.spec.ts`, `e2e/modes.spec.ts`
- Modify: `.gitignore` (add `.e2e-data/`, `test-results/`, `playwright-report/`)

**Interfaces:**
- Consumes: DOM hooks from Tasks 8–10 (`data-testid="dice"`, `[data-movable]`, `data-testid="victory"`, `data-testid="invite"`, "Invite link" input, `.ghost`, "How to play" button/dialog, "You are watching this game." banner, button names "Play a Friend", "Rematch", "Waiting for rival…", "Accept rematch", "Play again").

- [ ] **Step 1: Config and helpers**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'npm run build && rm -rf .e2e-data && PORT=4173 DATA_DIR=.e2e-data node server/dist/index.js',
    url: 'http://127.0.0.1:4173/healthz',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
```

`.gitignore` — append:
```
.e2e-data/
test-results/
playwright-report/
```

`e2e/helpers.ts`:
```ts
import type { Browser, BrowserContextOptions, Page, TestInfo } from '@playwright/test';

/** Silence sound and beginner tips so they don't interfere with automation. */
export async function quiet(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ur.coach.off', '1');
    localStorage.setItem('ur.muted', '1');
  });
}

function contextOptions(info: TestInfo): BrowserContextOptions {
  const u = info.project.use;
  return {
    baseURL: u.baseURL,
    viewport: u.viewport,
    userAgent: u.userAgent,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    reducedMotion: 'reduce',
  };
}

/** A separate browser profile — a separate player. */
export async function newPlayer(browser: Browser, info: TestInfo) {
  const ctx = await browser.newContext(contextOptions(info));
  const page = await ctx.newPage();
  await quiet(page);
  return { ctx, page };
}

/** Takes one action (roll or move) if this page may act right now. */
export async function act(page: Page): Promise<boolean> {
  try {
    const dice = page.getByTestId('dice');
    if (await dice.isEnabled({ timeout: 1000 })) {
      await dice.click({ timeout: 1000 });
      return true;
    }
    const piece = page.locator('[data-movable]').first();
    if (await piece.count()) {
      await piece.click({ timeout: 1000, force: true });
      return true;
    }
  } catch {
    /* the state changed under us; try again next round */
  }
  return false;
}

export async function playUntilVictory(pages: Page[], maxRounds = 4000) {
  for (let i = 0; i < maxRounds; i++) {
    if (await pages[0].getByTestId('victory').isVisible()) return;
    let acted = false;
    for (const p of pages) acted = (await act(p)) || acted;
    if (!acted) await pages[0].waitForTimeout(40);
  }
  throw new Error('The game did not finish');
}
```

- [ ] **Step 2: Online test**

`e2e/online.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { act, newPlayer, playUntilVictory, quiet } from './helpers';

test('two friends play a full online game, survive a reconnect, and rematch', async ({ browser }, info) => {
  const a = await newPlayer(browser, info);
  await a.page.goto('/');
  await a.page.getByRole('button', { name: 'Play a Friend' }).click();
  await expect(a.page.getByTestId('invite')).toBeVisible();
  await expect(a.page.getByTestId('dice')).toBeDisabled();
  const link = await a.page.getByLabel('Invite link').inputValue();

  // The friend opens the link with the code in lowercase.
  const b = await newPlayer(browser, info);
  await b.page.goto(link.replace(/\/g\/(\w+)$/, (_m, id: string) => `/g/${id.toLowerCase()}`));
  await expect(a.page.getByTestId('invite')).toBeHidden();
  await expect(b.page.getByTestId('dice')).toBeVisible();
  await expect(b.page.getByText('You are watching this game.')).toHaveCount(0);

  for (let i = 0; i < 30; i++) {
    await act(a.page);
    await act(b.page);
  }

  // Network blip, then a full reload: the friend gets their seat back.
  await b.ctx.setOffline(true);
  await b.page.waitForTimeout(500);
  await b.ctx.setOffline(false);
  await b.page.reload();
  await expect(b.page.getByTestId('dice')).toBeVisible();
  await expect(b.page.getByText('You are watching this game.')).toHaveCount(0);

  await playUntilVictory([a.page, b.page]);
  await expect(b.page.getByTestId('victory')).toBeVisible();

  const c = await newPlayer(browser, info);
  await c.page.goto(link);
  await expect(c.page.getByText('You are watching this game.')).toBeVisible();

  await a.page.getByRole('button', { name: 'Rematch' }).click();
  await expect(a.page.getByRole('button', { name: 'Waiting for rival…' })).toBeDisabled();
  await b.page.getByRole('button', { name: 'Accept rematch' }).click();
  await expect(a.page.getByTestId('victory')).toBeHidden();
  await expect(b.page.getByTestId('victory')).toBeHidden();
});

test('an unknown game shows a friendly message', async ({ page }) => {
  await quiet(page);
  await page.goto('/g/ZZZZZZ');
  await expect(page.getByRole('heading', { name: 'This game no longer exists' })).toBeVisible();
});
```

- [ ] **Step 3: Local modes, touch, keyboard, rules and layout tests**

`e2e/modes.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { act, playUntilVictory, quiet } from './helpers';

test.beforeEach(async ({ page }) => quiet(page));

test('pass & play runs to victory and starts again', async ({ page }) => {
  await page.goto('/play/local');
  await playUntilVictory([page]);
  await expect(page.getByRole('heading', { name: /wins$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByTestId('victory')).toBeHidden();
});

test('the computer takes its own turns', async ({ page }) => {
  await page.goto('/play/ai/easy');
  await expect(page.getByText('Computer · Easy')).toBeVisible();
  let mine = 0;
  for (let i = 0; i < 600 && mine < 8; i++) {
    if (await act(page)) mine++;
    else await page.waitForTimeout(100);
  }
  expect(mine).toBe(8);
  await expect.poll(() => page.getByRole('button', { name: /Carnelian piece on square/ }).count(), { timeout: 30_000 }).toBeGreaterThan(0);
});

test('touch: tap previews the destination, a second tap moves', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'touch devices only');
  await page.goto('/play/local');
  const movable = page.locator('[data-movable]');
  for (let i = 0; i < 200 && (await movable.count()) === 0; i++) {
    const dice = page.getByTestId('dice');
    if (await dice.isEnabled()) await dice.tap();
    else await page.waitForTimeout(50);
  }
  await movable.first().tap();
  await expect(page.locator('.ghost')).toBeVisible();
  await movable.first().tap();
  await expect(page.locator('.ghost')).toHaveCount(0);
});

test('keyboard: Space throws the dice', async ({ page }, info) => {
  test.skip(!!info.project.use.hasTouch, 'keyboard on desktop only');
  await page.goto('/play/local');
  await expect(page.getByTestId('dice')).toBeEnabled();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('dice').locator('.total')).toHaveText(/^[0-4]$/);
});

test('rules are explained on their own page and in-game', async ({ page }) => {
  await page.goto('/how-to-play');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(9);
  await page.goto('/play/local');
  await page.getByRole('button', { name: 'How to play' }).click();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('home fits the screen without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 4: Run all end-to-end tests**

Run: `npx playwright install chromium webkit && npx playwright test`
Expected: all tests pass on `desktop`, `android` and `iphone` (skips for the touch/keyboard-only tests are expected). If a test fails, open the trace (`npx playwright show-trace test-results/.../trace.zip`), fix the app — not the test — and re-run.

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: all unit/integration tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e .gitignore
git commit -m "test: end-to-end coverage for online, AI, pass & play, touch and keyboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Deploy to ur.moosha.org

**Files:**
- Create: `deploy/ur.service`, `deploy/Caddyfile`, `deploy/nginx-ur.conf`, `deploy/setup.sh`, `deploy/deploy.sh`, `DEPLOY.md`

**Interfaces:**
- Consumes: `npm run build`, `server/dist/index.js`, env `PORT`, `HOST`, `DATA_DIR` (Task 6).
- Produces: systemd unit `ur.service` (user `ur`, app in `/opt/ur/app`, data in `/var/lib/ur`), HTTPS at `https://ur.moosha.org` via Caddy (or nginx + certbot if nginx already owns ports 80/443).

- [ ] **Step 1: Confirm SSH access**

During planning, `ssh root@ur.moosha.org` got **"Connection refused" on port 22** (DNS resolves to 143.110.208.106). Ask the user to enable SSH (e.g. via the DigitalOcean console: `systemctl enable --now ssh`, and allow it in any DigitalOcean cloud firewall), or to give the right port. Then:

Run: `ssh -o BatchMode=yes root@ur.moosha.org true && echo ok`
Expected: `ok`. Do not continue until this works.

- [ ] **Step 2: Inspect the server (read-only)**

Run: `ssh root@ur.moosha.org 'cat /etc/os-release | head -2; node -v 2>&1; command -v caddy nginx; ss -tlnp | grep -E ":(80|443|3000) "'`
Expected: Ubuntu/Debian. Record (a) whether Caddy or nginx already owns 80/443, (b) whether port 3000 is free. If 3000 is taken, use `PORT=3100` in `ur.service` and in the proxy config below. If neither web server exists, use Caddy. **If other sites are already served, add to their config — never overwrite it.**

- [ ] **Step 3: Deployment files**

`deploy/ur.service`:
```ini
[Unit]
Description=The Royal Game of Ur
After=network.target

[Service]
Type=simple
User=ur
Group=ur
WorkingDirectory=/opt/ur/app
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=DATA_DIR=/var/lib/ur
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/ur

[Install]
WantedBy=multi-user.target
```

`deploy/Caddyfile`:
```
ur.moosha.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

`deploy/nginx-ur.conf` (only if nginx already serves this machine):
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ur.moosha.org;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
    }
}
```

`deploy/setup.sh`:
```bash
#!/usr/bin/env bash
# One-time preparation of the droplet (Debian/Ubuntu). Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg build-essential python3 sqlite3

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

id ur >/dev/null 2>&1 || useradd --system --home /opt/ur --shell /usr/sbin/nologin ur
mkdir -p /opt/ur/app /var/lib/ur
chown -R ur:ur /opt/ur /var/lib/ur

if ! command -v caddy >/dev/null && ! command -v nginx >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi
echo "setup complete: node $(node -v)"
```

`deploy/deploy.sh`:
```bash
#!/usr/bin/env bash
# Ship the working tree to the droplet, build there, and restart the service.
set -euo pipefail
HOST="${UR_HOST:-root@ur.moosha.org}"
cd "$(dirname "$0")/.."

rsync -az --delete \
  --exclude node_modules --exclude .git --exclude data --exclude .e2e-data \
  --exclude client/dist --exclude server/dist --exclude .superpowers --exclude .playwright-mcp \
  --exclude test-results --exclude playwright-report \
  ./ "$HOST:/opt/ur/app/"
scp deploy/ur.service "$HOST:/etc/systemd/system/ur.service"
ssh "$HOST" 'set -e
  cd /opt/ur/app
  npm ci --no-audit --no-fund
  npm run build
  chown -R ur:ur /opt/ur
  systemctl daemon-reload
  systemctl enable ur >/dev/null 2>&1
  systemctl restart ur
  sleep 1
  curl -fsS http://127.0.0.1:3000/healthz && echo " — ur is running"'
```

Run: `chmod +x deploy/*.sh`

- [ ] **Step 4: Prepare the server and the proxy**

Run: `ssh root@ur.moosha.org 'bash -s' < deploy/setup.sh`
Expected: ends with `setup complete: node v24…`.

If Caddy (new or existing) owns 80/443:
Run: `ssh root@ur.moosha.org 'grep -q "ur.moosha.org" /etc/caddy/Caddyfile || cat >> /etc/caddy/Caddyfile' < deploy/Caddyfile && ssh root@ur.moosha.org 'caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy'`
(If the stock Caddyfile only contains the default `:80` welcome site, replace it with `deploy/Caddyfile` instead of appending — check its content first.)

If nginx owns 80/443:
Run: `scp deploy/nginx-ur.conf root@ur.moosha.org:/etc/nginx/sites-available/ur && ssh root@ur.moosha.org 'ln -sf /etc/nginx/sites-available/ur /etc/nginx/sites-enabled/ur && nginx -t && systemctl reload nginx && apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d ur.moosha.org --non-interactive --agree-tos -m hriday@hriday.org --redirect'`

- [ ] **Step 5: Deploy**

Run: `./deploy/deploy.sh`
Expected: ends with `ok — ur is running`.

- [ ] **Step 6: Verify live**

Run: `curl -fsS https://ur.moosha.org/healthz && curl -s -o /dev/null -w '%{http_code}\n' https://ur.moosha.org/`
Expected: `ok` then `200`.

Then with Playwright MCP: open `https://ur.moosha.org`, create a friend game, open the invite link in a second context, play several turns, and confirm moves sync both ways over `wss://`. Also check `/play/ai/hard` and `/how-to-play` on a 390×844 viewport.

Do not point the automated E2E suite at production — it builds and starts its own local server.

- [ ] **Step 7: Write DEPLOY.md and commit**

`DEPLOY.md`:
````markdown
# Deploying the Royal Game of Ur

Production: **https://ur.moosha.org** on the DigitalOcean droplet `root@ur.moosha.org`.

## Layout on the server

| What | Where |
|---|---|
| App code (rsynced, built on the server) | `/opt/ur/app` |
| SQLite database | `/var/lib/ur/ur.sqlite` |
| Service | `systemctl status ur` (`/etc/systemd/system/ur.service`) |
| HTTPS proxy | Caddy (`/etc/caddy/Caddyfile`) or nginx (`/etc/nginx/sites-available/ur`) |

The Node server listens on `127.0.0.1:3000`; the proxy terminates TLS and forwards HTTP and WebSocket traffic.

## First-time setup

```bash
ssh root@ur.moosha.org 'bash -s' < deploy/setup.sh
# then add deploy/Caddyfile to /etc/caddy/Caddyfile (or install deploy/nginx-ur.conf + certbot)
./deploy/deploy.sh
```

## Deploying an update

```bash
npm test && npx playwright test   # optional but recommended
./deploy/deploy.sh
```

## Operations

- Logs: `ssh root@ur.moosha.org journalctl -u ur -f`
- Restart: `ssh root@ur.moosha.org systemctl restart ur`
- Backup: `ssh root@ur.moosha.org "sqlite3 /var/lib/ur/ur.sqlite \".backup '/root/ur-\$(date +%F).sqlite'\""`
- Games with no moves for 7 days are deleted automatically (hourly sweep).
````

```bash
git add deploy DEPLOY.md
git commit -m "chore: systemd, proxy configs and deploy scripts for ur.moosha.org

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
