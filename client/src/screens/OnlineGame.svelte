<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ApiError, gameInfo, joinGame } from '../game/api';
  import { OnlineController } from '../game/online';
  import { seatTokens } from '../game/storage';
  import InvitePanel from '../ui/InvitePanel.svelte';
  import GameScreen from './GameScreen.svelte';
  import NotFound from './NotFound.svelte';

  let { gameId }: { gameId: string } = $props();
  let controller = $state<OnlineController | null>(null);
  let failure = $state<string | null>(null);
  let destroyed = false;

  async function start() {
    failure = null;
    try {
      let token = seatTokens.get(gameId);
      if (!token) {
        const info = await gameInfo(gameId);
        if (!info.seated[1]) {
          try {
            token = (await joinGame(gameId)).seatToken;
            seatTokens.set(gameId, token);
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 409)) throw e;
          }
        }
      }
      if (destroyed) return;
      controller = new OnlineController(gameId, token);
    } catch (e) {
      if (destroyed) return;
      failure = e instanceof ApiError && e.status === 404 ? 'notFound' : e instanceof Error ? e.message : 'Something went wrong.';
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
  </GameScreen>
{:else}
  <p class="loading">Opening the game…</p>
{/if}

<style>
  .failure, .loading { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 16px; padding: 24px; text-align: center; }
  .loading { font-style: italic; }
</style>
