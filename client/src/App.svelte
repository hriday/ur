<script lang="ts">
  import type { AiLevel } from '@ur/shared';
  import SvgDefs from './board/SvgDefs.svelte';
  import { route } from './lib/router.svelte';
  import AiGame from './screens/AiGame.svelte';
  import Home from './screens/Home.svelte';
  import LocalGame from './screens/LocalGame.svelte';
  import NotFound from './screens/NotFound.svelte';

  const aiMatch = $derived(route.path.match(/^\/play\/ai\/(easy|medium|hard)\/?$/));
</script>

<SvgDefs />
{#if route.path === '/'}
  <Home />
{:else if aiMatch}
  {#key aiMatch[1]}<AiGame level={aiMatch[1] as AiLevel} />{/key}
{:else if route.path === '/play/local'}
  <LocalGame />
{:else}
  <NotFound />
{/if}
