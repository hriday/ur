<script lang="ts">
  import type { AiLevel } from '@ur/shared';
  import SvgDefs from './board/SvgDefs.svelte';
  import { route } from './lib/router.svelte';
  import AiGame from './screens/AiGame.svelte';
  import HowToPlay from './screens/HowToPlay.svelte';
  import Home from './screens/Home.svelte';
  import LocalGame from './screens/LocalGame.svelte';
  import NotFound from './screens/NotFound.svelte';
  import OnlineGame from './screens/OnlineGame.svelte';

  const aiMatch = $derived(route.path.match(/^\/play\/ai\/(easy|medium|hard)\/?$/));
  const gameMatch = $derived(route.path.match(/^\/g\/([a-z0-9]{4,12})\/?$/i));
</script>

<SvgDefs />
{#if route.path === '/'}
  <Home />
{:else if gameMatch}
  {#key gameMatch[1].toUpperCase()}<OnlineGame gameId={gameMatch[1].toUpperCase()} />{/key}
{:else if aiMatch}
  {#key aiMatch[1]}<AiGame level={aiMatch[1] as AiLevel} />{/key}
{:else if route.path === '/play/local'}
  <LocalGame />
{:else if route.path === '/how-to-play'}
  <HowToPlay />
{:else}
  <NotFound />
{/if}
