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
