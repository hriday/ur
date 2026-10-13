<script lang="ts">
  import type { AiLevel } from '@ur/shared';
  import { onDestroy } from 'svelte';
  import { AiController } from '../game/aiController';
  import GameScreen from './GameScreen.svelte';

  let { level }: { level: AiLevel } = $props();
  // Keyed on level in App, so the level never changes for this instance.
  /* svelte-ignore state_referenced_locally */
  const controller = new AiController(level);
  onDestroy(() => controller.dispose());
</script>

<GameScreen {controller} />
