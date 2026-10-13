<script lang="ts">
  import SvgDefs from './board/SvgDefs.svelte';
  import { route } from './lib/router.svelte';
  import Home from './screens/Home.svelte';
  import NotFound from './screens/NotFound.svelte';
</script>

<SvgDefs />
{#if route.path === '/'}
  <Home />
{:else}
  <NotFound />
{/if}
