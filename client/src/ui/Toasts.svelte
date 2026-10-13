<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { toasts } from './toastStore.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <div class="toast" in:fly={{ y: 16, duration: 200 }} out:fade={{ duration: 200 }}>{t.text}</div>
  {/each}
</div>

<style>
  .toasts { position: fixed; left: 50%; top: max(64px, env(safe-area-inset-top)); transform: translateX(-50%); display: grid; gap: 8px; width: min(92vw, 440px); z-index: 30; pointer-events: none; }
  .toast { padding: 10px 18px; border: 1px solid var(--gold); border-radius: 10px; background: #060a1fee; color: var(--shell); text-align: center; font-size: 1.05rem; box-shadow: 0 10px 30px #000a; }
</style>
