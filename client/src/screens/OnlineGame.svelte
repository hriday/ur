<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, gameInfo, joinGame } from '../game/api';
  import { OnlineController } from '../game/online';
  import { adoptSeatFromUrl, seatTokens } from '../game/storage';
  import InvitePanel from '../ui/InvitePanel.svelte';
  import SeatLink from '../ui/SeatLink.svelte';
  import GameScreen from './GameScreen.svelte';
  import NotFound from './NotFound.svelte';

  let { gameId }: { gameId: string } = $props();
  let controller = $state<OnlineController | null>(null);
  let failure = $state<string | null>(null);
  /** A browser with no seat may take the open second seat — but only once the visitor confirms. */
  let offerSeat = $state(false);
  let joining = $state(false);
  let destroyed = false;

  // A private "continue on another device" link carries the seat in the fragment; adopt it first.
  /* svelte-ignore state_referenced_locally */
  adoptSeatFromUrl(gameId);

  const fail = (e: unknown) => {
    if (destroyed) return;
    failure = e instanceof ApiError && e.status === 404 ? 'notFound' : e instanceof Error ? e.message : 'Something went wrong.';
  };

  function open(token: string | null) {
    if (destroyed) return;
    offerSeat = false;
    controller = new OnlineController(gameId, token);
  }

  async function start() {
    failure = null;
    try {
      const token = seatTokens.get(gameId);
      if (token) return open(token);
      const info = await gameInfo(gameId);
      if (destroyed) return;
      if (info.seated[1]) open(null);
      else offerSeat = true;
    } catch (e) {
      fail(e);
    }
  }

  async function join() {
    joining = true;
    try {
      const token = (await joinGame(gameId)).seatToken;
      seatTokens.set(gameId, token);
      open(token);
    } catch (e) {
      // Someone else took the seat a moment ago: watch instead.
      if (e instanceof ApiError && e.status === 409) open(null);
      else fail(e);
    } finally {
      joining = false;
    }
  }

  onMount(start);
  onDestroy(() => {
    destroyed = true;
    controller?.dispose();
  });
</script>

{#snippet goneView()}
  <NotFound title="This game no longer exists" message="Games are cleared away after a week without moves. Start a new one and send your friend the link." />
{/snippet}

{#if failure === 'notFound'}
  {@render goneView()}
{:else if failure}
  <main class="failure">
    <p role="alert">{failure}</p>
    <button class="btn" onclick={start}>Try again</button>
  </main>
{:else if controller}
  <GameScreen {controller} gone={goneView}>
    {#snippet invite()}<InvitePanel {gameId} />{/snippet}
    {#snippet seatLink()}<SeatLink {gameId} compact />{/snippet}
  </GameScreen>
{:else if offerSeat}
  <main class="offer">
    <div class="card" data-testid="join-offer">
      <p class="eyebrow">A game of Ur awaits</p>
      <h1>Join this game as the second player?</h1>
      <p class="hint">If you started this game in another browser, choose “Just watch” — or open your private link there instead.</p>
      <div class="actions">
        <button class="btn" onclick={join} disabled={joining}>{joining ? 'Joining…' : 'Join'}</button>
        <button class="btn ghost" onclick={() => open(null)} disabled={joining}>Just watch</button>
      </div>
    </div>
  </main>
{:else}
  <p class="loading">Opening the game…</p>
{/if}

<style>
  .offer { min-height: 100dvh; display: grid; place-items: center; padding: 20px; }
  .card { display: grid; justify-items: center; gap: 12px; width: min(92vw, 460px); padding: 24px; border: 1px solid var(--gold); border-radius: 16px; background: linear-gradient(180deg, #16307e, #0b1438); box-shadow: 0 30px 80px #000c; text-align: center; }
  .card h1 { margin: 0; font-size: 1.6rem; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .hint { margin: 0; font-style: italic; opacity: 0.85; }
  .failure, .loading { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 16px; padding: 24px; text-align: center; }
  .loading { font-style: italic; }
</style>
