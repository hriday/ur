<script lang="ts">
  import { onDestroy } from 'svelte';
  import { LocalController } from '../game/local';
  import GameScreen from './GameScreen.svelte';

  const controller = new LocalController('local', ['Gold', 'Carnelian'], [0, 1], Math.random, 'local');
  onDestroy(() => controller.dispose());
</script>

<GameScreen {controller} />
