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
