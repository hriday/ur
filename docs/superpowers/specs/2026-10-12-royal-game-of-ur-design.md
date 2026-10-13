# The Royal Game of Ur — Design Spec

**Date:** 2026-10-12
**Status:** Approved in brainstorming, pending written-spec review

## 1. Goal

A spectacularly beautiful, rules-faithful web app for the Royal Game of Ur, supporting:

- **Play a Friend** — online, turn-by-turn, two devices, joined by invite link.
- **Play the Computer** — single player vs. AI at Easy / Medium / Hard.
- **Pass & Play** — two players sharing one device.

Success: the game plays exactly by Finkel's rules everywhere, online play is cheat-proof and survives disconnects/restarts, and the visual experience feels like a crafted artefact on both desktop and mobile.

Out of scope: accounts, matchmaking with strangers, chat, rule variants (Masters, Blitz, Aseb), turn timers, a perfect-play solver.

## 2. Rules (Finkel reconstruction)

- Each player has **7 pieces**.
- **Dice:** four binary tetrahedral dice; roll = number of marked tips up, 0–4. Probabilities 1/16, 4/16, 6/16, 4/16, 1/16.
- **Path:** 14 squares, then off the board (position 15).
  - Squares 1–4: player's own row (enters at the right end of the left block, moves left).
  - Squares 5–12: shared middle row, moves right.
  - Squares 13–14: back on own row (right block), then bear off.
- Positions: 0 = waiting to enter, 1–14 = on board, 15 = borne off.
- A move advances exactly one piece by exactly the roll.
- Cannot land on a square occupied by one's own piece.
- Landing on an opponent piece in the shared row (5–12) **captures** it: it returns to position 0.
- Bearing off requires an **exact** roll (landing on 15 exactly; overshooting is illegal).
- **Rosettes** at squares 4, 8, 14 (per player path). Landing on any rosette grants **another roll**.
- The central rosette (square 8) is **safe**: a piece there cannot be captured, and an opponent may not land there while it is occupied.
- A roll of 0, or a roll with no legal move, **passes the turn** automatically, with an explanation shown.
- First player to bear off all 7 pieces wins.
- Starting player is decided by a random roll-off.

### Board geometry

3 rows × 8 columns; the outer rows have no squares at columns 4–5 (the "bridge" is middle-row only). Columns are 0–7 left to right.

| Path square | Own row column | Middle row column |
|---|---|---|
| 1–4 | 3, 2, 1, 0 | — |
| 5–12 | — | 0 … 7 |
| 13–14 | 7, 6 | — |

Player A owns the top row, Player B the bottom row (rendered so the local player is always nearest them).

Decorative square motifs follow the British Museum board: rosettes at (outer, col 0), (middle, col 3), (outer, col 6); remaining squares use the "eyes", five-dot, twelve-dot and four-panel motifs.

## 3. Architecture

TypeScript monorepo (npm workspaces):

```
shared/   rules engine (pure, deterministic, no I/O) + protocol message types
server/   Node + ws + better-sqlite3; serves built client; authoritative online games
client/   Vite + Svelte; SVG board; AI in a Web Worker
```

### 3.1 `shared/` — rules engine

Pure functions over an immutable `GameState`:

- `newGame(startingPlayer)` → `GameState`
- `legalMoves(state, roll)` → `Move[]`
- `applyRoll(state, roll)` → `GameState` (enters "must move" or auto-passes with a reason)
- `applyMove(state, move)` → `{ state, events }` where events describe what happened (`moved`, `captured`, `rosette`, `borneOff`, `won`) for the UI to animate.
- `rollDice(rng)` → `{ dice: [0|1, 0|1, 0|1, 0|1], total }`

`GameState` holds: piece positions for both players, current player, phase (`awaitingRoll` | `awaitingMove` | `finished`), last roll, winner, and a move counter. Randomness is injected, never global, so the engine is testable and the server owns real rolls.

### 3.2 `server/` — online play

- **Create:** `POST /api/games` → `{ gameId, seatToken }`. Game ID is a short, unambiguous code (e.g. `K7PQ2M`). Creator takes seat A.
- **Join:** client opens `/g/:gameId`; if it holds no token for that game and seat B is free, `POST /api/games/:id/join` → `{ seatToken }`. If both seats are taken, the visitor becomes a read-only spectator.
- **Tokens** are random 128-bit secrets stored in the browser's `localStorage`, keyed by game ID; the server stores only their hashes.
- **Live channel:** one WebSocket per client at `/ws?game=…&token=…`. Messages (typed in `shared/protocol.ts`):
  - client → server: `roll`, `move { pieceIndex }`, `rematch`
  - server → client: `state { gameState, seat, players: { connected } }`, `events [...]`, `error { code }`, `presence`
- **Authority:** server rejects out-of-turn or illegal actions, performs all dice rolls with a CSPRNG, applies via the shared engine, persists, then broadcasts.
- **Persistence:** SQLite table `games(id, state_json, seat_a_hash, seat_b_hash, created_at, updated_at)`; state written after every action. Games are rehydrated on demand after a restart.
- **Presence:** opponent connect/disconnect broadcast; UI shows "Rival disconnected — waiting…". Reopening the link reconnects to the same seat.
- **Rematch:** either player may offer; when both accept, a new game state replaces the old one in the same game ID with starting player alternated.
- **Cleanup:** games idle for 7 days are deleted by a periodic sweep.
- **Limits:** basic per-IP rate limiting on game creation; message size cap.

### 3.3 `client/`

- **Routes:** `/` home, `/g/:id` online game, `/play/ai`, `/play/local`, `/how-to-play`.
- A single `GameController` interface (`roll()`, `move(i)`, state store, event stream) with three implementations: `OnlineController` (WebSocket), `AiController` (local engine + worker), `LocalController` (pass & play). The board UI depends only on the interface.
- **AI Web Worker** receives `(state, roll, level)` and returns a move; the controller adds a ~600–900 ms "thinking" delay.

## 4. Visual design — "Stylized Mesopotamian"

- **Palette:** deep lapis blues (#060a1f → #1b2f74), gold leaf (#e2bf63 / #d9b45a), carnelian (#c7512f), with shell-cream for highlights.
- **Type:** Cinzel (display), Cormorant Garamond (body).
- **Board:** SVG, authentic layout and motifs rendered as gold inlay on lapis tiles, gold-framed silhouette following the real board shape; subtle gilded shimmer.
- **Pieces:** gold (player 1) and carnelian (player 2) discs with five-dot inlay.
- **Dice:** four tetrahedra that tumble and land; marked tips glow; total shown in large gilded numerals.
- **Ornament:** chevron friezes, faint cuneiform background texture.
- **Interaction:** movable pieces glow; hover/tap previews the destination as a ghost piece; pieces slide square-by-square along the path.
- **Moment animations:** capture (spark + piece flies home), rosette (bloom + "Roll again" banner), bear-off (piece rises into the finished tray), victory (gilded celebration).
- **Home:** lapis night sky, title, three mode buttons; AI difficulty chosen on selection.
- **How to Play:** illustrated rules plus brief history of the game.
- **Sound:** soft clay/stone sounds for dice, moves, captures, rosettes; mute toggle persisted.

### Mobile

- Mobile-first layout; in narrow portrait the board rotates vertical and fills the screen; roll button in thumb reach.
- Touch targets ≥ 44 px; tap-a-piece previews the destination (replacing hover); a second tap confirms.
- Tested on iOS Safari and Android Chrome; animations stay smooth on mid-range phones (transform/opacity only, no layout thrash).
- Installable PWA (manifest + icons), opens full screen.

### Accessibility

Full keyboard play (Space to roll, arrow/number keys to choose a piece, Enter to move), WCAG AA contrast for text, ARIA live region announcing rolls and moves, and `prefers-reduced-motion` replaces flourishes with simple fades.

## 5. Computer opponent

All levels use the shared engine.

- **Easy:** heuristic move scoring (capture, rosette, escape danger, progress) with ~25% random choice.
- **Medium:** one-ply expectimax: for each move, evaluate the position averaged over the opponent's next roll.
- **Hard:** expectimax to depth 3–4 plies with chance nodes weighted by the 1/4/6/4/1 distribution, alpha-beta-style pruning where safe, and a time budget (~500 ms) with iterative deepening.
- **Evaluation function:** pieces borne off, total progress, pieces in danger (opponent pieces 1–4 squares behind in the shared row, weighted by roll probability), rosette occupancy (central rosette weighted highest), pieces waiting.

## 6. Error handling

- Invalid or out-of-turn actions → server `error` message; client resyncs from the latest `state`.
- WebSocket drops → client auto-reconnects with backoff; shows a connection banner.
- Unknown or expired game ID → friendly "This game no longer exists" page with a button to start a new one.
- Server crash or restart → state reloaded from SQLite; clients reconnect transparently.

## 7. Testing

- **Rules engine (Vitest):** unit tests for every rule and edge case (exact bear-off, central rosette safety and blocking, own-piece blocking, captures only in the shared row, extra roll on all rosettes, auto-pass on 0 and on no legal moves, win detection); property tests running thousands of random games asserting invariants (7 pieces each, no two same-player pieces sharing a square, no illegal states).
- **AI:** each level always returns a legal move; Hard beats Easy in a large majority of simulated games.
- **Server:** create/join/spectate flows, token auth, out-of-turn rejection, reconnect, persistence across a simulated restart.
- **End-to-end (Playwright):** two browser contexts play a full online game; pass & play and AI smoke tests; mobile-viewport runs.

## 8. Deployment

- `npm run build` produces the client bundle and compiled server; the server serves the client statically.
- Runs on the user's DigitalOcean droplet as a **systemd** service (`ur.service`), with the SQLite file in a data directory.
- **Caddy** reverse proxy provides HTTPS and WebSocket upgrade.
- A `DEPLOY.md` documents setup, updating and backups (copying the SQLite file).
