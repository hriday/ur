<script lang="ts">
  import { sound } from '../audio/sound.svelte';
  import { link } from '../lib/router.svelte';

  let { onhelp }: { onhelp?: () => void } = $props();
</script>

<header class="topbar">
  <a class="home" href="/" use:link aria-label="Back to the home page">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    <span>Ur</span>
  </a>
  <div class="actions">
    {#if onhelp}
      <button class="icon" onclick={onhelp} aria-label="How to play">?</button>
    {/if}
    <button class="icon" onclick={() => sound.toggle()} aria-label={sound.muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={sound.muted}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" class="fill" />
        {#if sound.muted}<path d="M16 9l5 6M21 9l-5 6" />{:else}<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />{/if}
      </svg>
    </button>
  </div>
</header>

<style>
  .topbar { display: flex; align-items: center; justify-content: space-between; }
  .home { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding-right: 8px; font-family: var(--font-display); font-size: 1.2rem; letter-spacing: 0.15em; text-decoration: none; }
  .actions { display: flex; gap: 8px; }
  .icon { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid #e2bf6355; border-radius: 50%; background: #0b143888; color: var(--gold); font-family: var(--font-display); font-size: 1.2rem; cursor: pointer; }
  .icon:hover { border-color: var(--gold); }
  svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .fill { fill: currentColor; }
</style>
