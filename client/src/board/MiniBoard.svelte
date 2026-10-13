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
