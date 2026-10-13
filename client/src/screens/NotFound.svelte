<script lang="ts">
  import { link } from '../lib/router.svelte';

  let {
    title = 'This path leads nowhere',
    message = 'The page you were looking for is not here.',
  }: { title?: string; message?: string } = $props();
</script>

<main class="lost">
  <p class="eyebrow">Lost in the sands</p>
  <h1>{title}</h1>
  <p>{message}</p>
  <a class="btn" href="/" use:link>Return home</a>
</main>

<style>
  .lost { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 24px; text-align: center; }
  h1 { margin: 0; font-size: clamp(1.8rem, 5vw, 2.8rem); }
  p { margin: 0 0 12px; max-width: 32ch; }
</style>
