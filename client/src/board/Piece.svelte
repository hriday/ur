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
  role={movable ? 'button' : 'img'}
  tabindex={movable ? 0 : undefined}
  aria-label={label}
  onpointerup={(e) => onactivate?.(e.pointerType || 'mouse')}
  onpointerenter={(e) => e.pointerType === 'mouse' && onhover?.(true)}
  onpointerleave={(e) => e.pointerType === 'mouse' && onhover?.(false)}
  onfocus={() => onselect?.()}
>
  <circle class="hit" r={(r + 20) / scale} />
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
  .hit { fill: transparent; pointer-events: none; }
  .movable .hit { pointer-events: all; }
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
