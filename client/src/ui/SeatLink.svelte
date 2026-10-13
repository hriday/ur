<script lang="ts">
  import { seatLink, seatTokens } from '../game/storage';

  /** Offers the seated player a private link that restores their seat in another browser. */
  let { gameId, compact = false }: { gameId: string; compact?: boolean } = $props();

  let open = $state(false);
  let copied = $state(false);
  let link = $state('');
  const panelId = `seat-link-${Math.random().toString(36).slice(2, 8)}`;

  function toggle() {
    const token = seatTokens.get(gameId);
    if (!token) return;
    link = seatLink(location.origin, gameId, token);
    open = !open;
    copied = false;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

{#if seatTokens.get(gameId)}
  <div class="seat-link" class:compact>
    <button
      class={compact ? 'icon' : 'text'}
      onclick={toggle}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={compact ? 'Continue on another device' : undefined}
      title="Continue on another device"
    >
      {#if compact}
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="13" height="10" rx="1.5" /><path d="M1.5 17h16" /><rect x="16" y="9" width="6.5" height="11" rx="1.5" /></svg>
      {:else}
        Continue on another device
      {/if}
    </button>
    {#if open}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="panel" id={panelId} role="group" aria-label="Continue on another device" onkeydown={(e) => e.key === 'Escape' && (open = false)}>
        <p>Open this private link in another browser or on another device to keep playing from there.</p>
        <input readonly value={link} aria-label="Private link" onfocus={(e) => e.currentTarget.select()} />
        <button class="btn" onclick={copy}>{copied ? 'Copied ✓' : 'Copy private link'}</button>
        <p class="warn">Keep it to yourself — anyone with this link can take your seat.</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .seat-link { position: relative; display: grid; justify-items: center; }
  .icon { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid #e2bf6355; border-radius: 50%; background: #0b143888; color: var(--gold); cursor: pointer; }
  .icon:hover, .icon[aria-expanded='true'] { border-color: var(--gold); }
  .text { min-height: 44px; padding: 0 8px; border: 0; background: none; color: var(--gold-pale); font: inherit; font-size: 0.95rem; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .panel { display: grid; gap: 8px; width: min(88vw, 340px); margin-top: 6px; padding: 14px; border: 1px solid var(--gold); border-radius: 12px; background: linear-gradient(180deg, #16307e, #0b1438); box-shadow: 0 20px 50px #000b; text-align: center; }
  /* In the top bar the panel hangs from the bar's right edge, so it never runs off a narrow screen. */
  .compact { position: static; }
  .compact .panel { position: absolute; top: 100%; right: 0; z-index: 40; }
  .panel p { margin: 0; font-size: 0.95rem; }
  .panel input { min-height: 40px; padding: 6px 10px; border: 1px solid #e2bf6366; border-radius: 8px; background: #060a1f; color: var(--shell); font: inherit; font-size: 0.85rem; text-align: center; }
  .warn { font-style: italic; color: #ffcf9c; }
</style>
