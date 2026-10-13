<script lang="ts">
  import { fly } from 'svelte/transition';
  import { coach } from '../game/coach.svelte';
</script>

{#if coach.current}
  <aside class="coach" aria-live="polite" transition:fly={{ y: -14, duration: 250 }}>
    <span class="glyph" aria-hidden="true">✦</span>
    <p>{coach.text}</p>
    <div class="actions">
      <button class="btn small" onclick={() => coach.dismiss()}>Got it</button>
      <button class="quiet" onclick={() => coach.disable()}>Turn off tips</button>
    </div>
  </aside>
{/if}

<style>
  .coach { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); z-index: 20; display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; width: min(94%, 520px); padding: 12px 16px; border: 1px solid var(--gold); border-radius: 12px; background: #060a1ff2; box-shadow: 0 16px 40px #000c; }
  .glyph { color: var(--gold); font-size: 1.3rem; line-height: 1.2; }
  p { margin: 0; font-size: 1.05rem; }
  .actions { grid-column: 2; display: flex; align-items: center; gap: 14px; }
  .quiet { min-height: 44px; border: 0; background: none; color: var(--gold); text-decoration: underline; cursor: pointer; }
</style>
