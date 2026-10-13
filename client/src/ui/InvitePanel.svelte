<script lang="ts">
  import SeatLink from './SeatLink.svelte';

  let { gameId }: { gameId: string } = $props();

  const url = $derived(`${location.origin}/g/${gameId}`);
  const canShare = typeof navigator.share === 'function';
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'The Royal Game of Ur', text: 'Play the Royal Game of Ur with me', url });
    } catch {
      /* share sheet dismissed */
    }
  }
</script>

<div class="invite" data-testid="invite">
  <p class="eyebrow">Waiting for your friend</p>
  <h2>Send them this link</h2>
  <p class="code" aria-label="Game code {gameId}">{gameId}</p>
  <input class="link" readonly value={url} aria-label="Invite link" onfocus={(e) => e.currentTarget.select()} />
  <div class="actions">
    <button class="btn" onclick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
    {#if canShare}<button class="btn ghost" onclick={share}>Share…</button>{/if}
  </div>
  <p class="hint">The game begins as soon as they open it and choose Join.</p>
  <SeatLink {gameId} />
</div>

<style>
  .invite { display: grid; justify-items: center; gap: 10px; text-align: center; }
  h2 { margin: 0; font-size: 1.6rem; }
  .code { margin: 4px 0; font-family: var(--font-display); font-size: 2.2rem; letter-spacing: 0.3em; color: var(--gold-pale); }
  .link { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid #e2bf6366; border-radius: 8px; background: #060a1f; color: var(--shell); font: inherit; font-size: 1rem; text-align: center; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .hint { margin: 0; font-style: italic; opacity: 0.85; }
</style>
