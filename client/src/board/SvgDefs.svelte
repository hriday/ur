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
