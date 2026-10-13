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
