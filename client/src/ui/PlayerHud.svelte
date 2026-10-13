<script lang="ts">
  import { OFF, START, type Player } from '@ur/shared';

  interface Props { name: string; player: Player; pieces: number[]; active: boolean; note: string }
  let { name, player, pieces, active, note }: Props = $props();

  const waiting = $derived(pieces.filter((p) => p === START).length);
  const home = $derived(pieces.filter((p) => p === OFF).length);
</script>

<section class="hud p{player}" class:active aria-label="{name}: {waiting} waiting, {home} of 7 home">
  <span class="token" aria-hidden="true"></span>
  <div class="text">
    <strong>{name}</strong>
    <span class="note">{note}</span>
  </div>
  <ol class="pips" aria-hidden="true">
    {#each Array(7) as _, i}<li class:filled={i < home}></li>{/each}
  </ol>
</section>

<style>
  .hud { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 14px; border: 1px solid #e2bf6326; border-radius: 12px; background: #0b143888; transition: border-color 0.3s, box-shadow 0.3s; }
  .hud.active { border-color: var(--gold); box-shadow: 0 0 22px #e2bf6333; }
  .token { width: 22px; height: 22px; border-radius: 50%; flex: none; box-shadow: inset 0 -3px 6px #0006; }
  .p0 .token { background: radial-gradient(circle at 35% 30%, #fff0bd, #e2bf63 50%, #8f6720); }
  .p1 .token { background: radial-gradient(circle at 35% 30%, #f19a72, #c7512f 50%, #5e1f10); }
  .text { display: grid; line-height: 1.15; min-width: 0; }
  strong { font-family: var(--font-display); font-weight: 500; letter-spacing: 0.08em; color: var(--gold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { min-height: 1.15em; font-style: italic; font-size: 1rem; color: #e9dcc0; }
  .pips { display: flex; gap: 4px; margin: 0 0 0 auto; padding: 0; list-style: none; }
  .pips li { width: 9px; height: 14px; border: 1px solid #e2bf6366; transform: skewX(-12deg); }
  .p0 .pips li.filled { background: var(--gold); }
  .p1 .pips li.filled { background: var(--carnelian); border-color: var(--carnelian); }
</style>
