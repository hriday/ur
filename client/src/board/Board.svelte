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
  .ghost circle { fill: none; stroke: var(--gold-pale); stroke-width: 4; stroke-dasharray: 8 7; filter: drop-shadow(0 0 6px #000c); animation: spin 6s linear infinite; transform-box: fill-box; transform-origin: center; }
  .ghost.p0 circle { fill: #e2bf6366; }
  .ghost.p1 circle { fill: #c7512f77; }
  .ghost.capture circle { stroke: #ff9b74; }
  .ghost { cursor: pointer; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
