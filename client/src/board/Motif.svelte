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
