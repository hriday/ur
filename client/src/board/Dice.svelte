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
