<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import { CENTRAL_ROSETTE, OFF, START, isShared, legalMoves, other, whyCannotMove, type GameEvent, type GameState, type Player } from '@ur/shared';
  import { sound } from '../audio/sound.svelte';
  import Board from '../board/Board.svelte';
  import Dice from '../board/Dice.svelte';
  import type { Effect } from '../board/effects';
  import { piecePoint, traySlot, type Point } from '../board/geometry';
  import type { ConnectionStatus, GameController, Snapshot, Update } from '../game/controller';
  import { coach } from '../game/coach.svelte';
  import { describeEvent, eventToast } from '../game/messages';
  import { reducedMotion, sleep } from '../lib/motion';
  import Coach from '../ui/Coach.svelte';
  import PlayerHud from '../ui/PlayerHud.svelte';
  import Toasts from '../ui/Toasts.svelte';
  import TopBar from '../ui/TopBar.svelte';
  import VictoryOverlay from '../ui/VictoryOverlay.svelte';
  import { toasts } from '../ui/toastStore.svelte';
  import HowToPlay from './HowToPlay.svelte';

  interface Props { controller: GameController; invite?: Snippet; gone?: Snippet }
  let { controller, invite, gone }: Props = $props();

  let snap = $state<Snapshot | null>(null);
  let display = $state<GameState | null>(null);
  let overrides = $state<Record<string, Point>>({});
  let flying = $state<Record<string, boolean>>({});
  let effects = $state<Effect[]>([]);
  let rolling = $state(false);
  let animating = $state(false);
  let pending = $state(false);
  let selected = $state<number | null>(null);
  let hovered = $state<number | null>(null);
  let introText = $state<string | null>(null);
  let status = $state<ConnectionStatus>('connecting');
  let announcement = $state('');
  let vertical = $state(false);
  let helpOpen = $state(false);

  const queue: Update[] = [];
  let introShown = false;
  let effectId = 0;

  const T = (ms: number) => (reducedMotion() ? 0 : ms);
  const keyOf = (p: Player, i: number) => `${p}-${i}`;
  const perspective = $derived<Player>(snap?.perspective ?? 0);
  const top = $derived<Player>(other(perspective));
  const bothSeated = $derived(!!snap && snap.seated[0] && snap.seated[1]);
  const canAct = $derived(
    !!display && !!snap && bothSeated && !animating && !pending && !introText &&
      display.phase !== 'finished' && snap.controls.includes(display.current),
  );
  const moves = $derived(canAct && display!.phase === 'awaitingMove' ? legalMoves(display!) : []);
  const movable = $derived(moves.map((m) => m.piece));
  const canRoll = $derived(canAct && display!.phase === 'awaitingRoll');
  const preview = $derived(selected ?? hovered);
  const finished = $derived(display?.phase === 'finished' && !animating);

  // The controller is fixed for the lifetime of this screen (callers do not swap it).
  /* svelte-ignore state_referenced_locally */
  const offUpdate = controller.subscribe((u) => { queue.push(u); void pump(); });
  /* svelte-ignore state_referenced_locally */
  const offError = controller.onError((code, message) => {
    pending = false;
    if (code !== 'badPhase' && code !== 'notYourTurn') toasts.push(message);
  });
  /* svelte-ignore state_referenced_locally */
  const offStatus = controller.onStatus((s) => { status = s; });

  const portrait = matchMedia('(max-width: 720px) and (orientation: portrait)');
  vertical = portrait.matches;
  const onPortrait = (e: MediaQueryListEvent) => { vertical = e.matches; };
  portrait.addEventListener('change', onPortrait);

  onDestroy(() => {
    offUpdate();
    offError();
    offStatus();
    portrait.removeEventListener('change', onPortrait);
  });

  async function pump() {
    if (animating) return;
    animating = true;
    try {
      while (queue.length) {
        const u = queue.shift()!;
        try {
          await play(u);
        } catch (err) {
          console.error('Animation failed; skipping to the final position', err);
          snap = u.snapshot;
          display = u.snapshot.state;
          overrides = {};
          flying = {};
          rolling = false;
          introText = null;
          selected = null;
          hovered = null;
          pending = false;
        }
      }
    } finally {
      animating = false;
      coachForPosition();
      controller.idle();
    }
  }

  async function play(u: Update) {
    const prev = display;
    const next = u.snapshot.state;
    const restarted = !!prev && next.turn < prev.turn;
    snap = u.snapshot;
    if (prev && !restarted && u.events.length) {
      for (const e of u.events) await animate(e);
    }
    display = next;
    overrides = {};
    flying = {};
    selected = null;
    hovered = null;
    pending = false;
    if (restarted) introShown = false;
    if (!introShown && next.turn === 0 && next.phase === 'awaitingRoll' && u.snapshot.seated[1]) {
      introShown = true;
      await intro();
    }
  }

  function setPos(p: Player, i: number, pos: number) {
    const pieces: [number[], number[]] = [[...display!.pieces[0]], [...display!.pieces[1]]];
    pieces[p][i] = pos;
    display = { ...display!, pieces };
  }

  function addEffect(kind: Effect['kind'], at: Point) {
    if (reducedMotion()) return;
    const id = effectId++;
    effects = [...effects, { id, kind, at }];
    setTimeout(() => { effects = effects.filter((f) => f.id !== id); }, 1200);
  }

  function say(e: GameEvent) {
    announcement = describeEvent(e, snap!.names);
    const t = eventToast(e, snap!.names);
    if (t) toasts.push(t);
  }

  function coachForEvent(e: GameEvent) {
    const mine = snap!.controls.includes(e.player);
    if (e.type === 'passed' && mine) coach.trigger('pass');
    if (e.type === 'rosette' && mine) coach.trigger(e.at === CENTRAL_ROSETTE ? 'central' : 'rosette');
    if (e.type === 'captured' && (mine || snap!.controls.includes(e.victim))) coach.trigger('capture');
  }

  function coachForPosition() {
    if (!display || !snap || !bothSeated || display.phase === 'finished' || !snap.controls.includes(display.current)) return;
    coach.trigger(display.phase === 'awaitingRoll' ? 'roll' : 'move');
    const theirs = display.pieces[other(display.current)];
    const threatened = display.pieces[display.current].some(
      (pos) => isShared(pos) && pos !== CENTRAL_ROSETTE && theirs.some((o) => o >= 1 && o < pos && pos - o <= 4),
    );
    if (threatened) coach.trigger('danger');
  }

  async function animate(e: GameEvent) {
    coachForEvent(e);
    switch (e.type) {
      case 'rolled':
        rolling = true;
        sound.dice();
        await sleep(T(700));
        display = { ...display!, dice: e.dice, roll: e.roll };
        rolling = false;
        say(e);
        await sleep(T(250));
        break;
      case 'passed':
        say(e);
        await sleep(T(1100));
        break;
      case 'moved': {
        const key = keyOf(e.player, e.piece);
        for (let pos = e.from + 1; pos < e.to && pos <= 14; pos++) {
          overrides = { ...overrides, [key]: piecePoint(e.player, pos, 0, perspective) };
          sound.step();
          await sleep(T(170));
        }
        const { [key]: _, ...rest } = overrides;
        overrides = rest;
        setPos(e.player, e.piece, e.to);
        sound.step();
        say(e);
        await sleep(T(200));
        break;
      }
      case 'captured':
        addEffect('capture', piecePoint(e.player, e.at, 0, perspective));
        sound.capture();
        flying = { ...flying, [keyOf(e.victim, e.piece)]: true };
        setPos(e.victim, e.piece, START);
        say(e);
        await sleep(T(650));
        break;
      case 'rosette':
        addEffect('rosette', piecePoint(e.player, e.at, 0, perspective));
        sound.rosette();
        say(e);
        await sleep(T(700));
        break;
      case 'borneOff': {
        const home = display!.pieces[e.player].filter((p) => p === OFF).length;
        addEffect('bearOff', traySlot(e.player, 'off', Math.max(0, home - 1), perspective));
        sound.bearOff();
        say(e);
        await sleep(T(350));
        break;
      }
      case 'won':
        sound.win();
        say(e);
        break;
    }
  }

  async function intro() {
    if (reducedMotion()) return;
    introText = 'Casting lots…';
    rolling = true;
    sound.dice();
    await sleep(1100);
    rolling = false;
    const first = display!.current;
    introText = snap!.controls.length === 1 && snap!.controls[0] === first ? 'You go first' : `${snap!.names[first]} goes first`;
    await sleep(1300);
    introText = null;
  }

  function doRoll() {
    if (!canRoll) return;
    if (coach.current === 'roll') coach.dismiss();
    pending = true;
    controller.roll();
  }

  function doMove(piece: number) {
    if (coach.current === 'move') coach.dismiss();
    pending = true;
    selected = null;
    controller.move(piece);
  }

  function onPiece(player: Player, piece: number, how: string) {
    if (!display || !snap || animating || pending || introText) return;
    if (!snap.controls.includes(player) || !bothSeated || display.phase === 'finished') return;
    if (display.current !== player) {
      toasts.push(`It is ${snap.names[display.current]}’s turn.`);
      return;
    }
    const why = whyCannotMove(display, piece);
    if (why) {
      toasts.push(why);
      return;
    }
    if (how === 'mouse' || selected === piece) doMove(piece);
    else selected = piece;
  }

  function onKey(e: KeyboardEvent) {
    if (helpOpen) {
      if (e.key === 'Escape') helpOpen = false;
      return;
    }
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.target instanceof Element && e.target.closest('button, a, input, textarea, [role="dialog"]')) return;
    if (e.key === ' ') {
      if (canRoll) { e.preventDefault(); doRoll(); }
      return;
    }
    if (!moves.length) return;
    const order = [...moves].sort((a, b) => a.from - b.from).map((m) => m.piece);
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= order.length) {
      selected = order[n - 1];
      return;
    }
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const i = selected === null ? (step > 0 ? -1 : 0) : order.indexOf(selected);
      selected = order[(i + step + order.length) % order.length];
      return;
    }
    if (e.key === 'Enter' && selected !== null && movable.includes(selected)) {
      e.preventDefault();
      doMove(selected);
    }
  }

  function noteFor(p: Player): string {
    if (!display || !snap) return '';
    if (snap.mode === 'online' && snap.seated[p] && !snap.connected[p] && !snap.controls.includes(p)) return 'Disconnected — waiting…';
    if (display.phase === 'finished' || display.current !== p || !bothSeated) return '';
    if (snap.controls.includes(p)) {
      const prefix = snap.controls.length > 1 ? `${snap.names[p]} — ` : '';
      return prefix + (display.phase === 'awaitingRoll' ? 'roll the dice' : 'choose a piece');
    }
    return snap.mode === 'ai' ? 'Thinking…' : 'Their turn';
  }

  const victoryTitle = $derived.by(() => {
    if (!display || display.winner === null || !snap) return '';
    if (snap.controls.length === 1) return snap.controls[0] === display.winner ? 'Victory' : 'Defeat';
    return `${snap.names[display.winner]} wins`;
  });

  const rematchUi = $derived.by(() => {
    if (!snap || snap.spectator) return null;
    if (snap.mode !== 'online') return { label: 'Play again', disabled: false };
    const me = snap.controls[0];
    if (snap.rematch[me]) return { label: 'Waiting for rival…', disabled: true };
    if (snap.rematch[other(me)]) return { label: 'Accept rematch', disabled: false };
    return { label: 'Rematch', disabled: false };
  });
</script>

<svelte:window onkeydown={onKey} />

{#if status === 'notFound' && gone}
  {@render gone()}
{:else}
  <div class="screen" class:vertical>
    <TopBar onhelp={() => (helpOpen = true)} />
    {#if status === 'reconnecting'}<div class="banner" role="status">Connection lost — reconnecting…</div>{/if}
    {#if snap?.spectator}<div class="banner subtle" role="status">You are watching this game.</div>{/if}

    {#if display && snap}
      <PlayerHud name={snap.names[top]} player={top} pieces={display.pieces[top]} active={display.current === top && display.phase !== 'finished'} note={noteFor(top)} />
      <div class="board-wrap">
        <Board
          state={display}
          {perspective}
          {vertical}
          {movable}
          {preview}
          {overrides}
          {flying}
          {effects}
          onpiece={onPiece}
          onhover={(p) => (hovered = p)}
          onselect={(p) => (selected = p)}
          onghost={() => selected !== null && doMove(selected)}
        />
        {#if introText}<div class="intro" role="status"><p>{introText}</p></div>{/if}
        <Coach />
      </div>
      <div class="bottom">
        <PlayerHud name={snap.names[perspective]} player={perspective} pieces={display.pieces[perspective]} active={display.current === perspective && display.phase !== 'finished'} note={noteFor(perspective)} />
        <Dice dice={rolling ? null : display.dice} total={display.roll} {rolling} enabled={canRoll} onroll={doRoll} />
      </div>

      {#if !bothSeated && invite}
        <div class="overlay"><div class="card">{@render invite()}</div></div>
      {/if}
      {#if finished && display.winner !== null}
        <VictoryOverlay
          title={victoryTitle}
          winner={display.winner}
          rematchLabel={rematchUi?.label}
          rematchDisabled={rematchUi?.disabled}
          onrematch={rematchUi ? () => controller.rematch() : undefined}
        />
      {/if}
    {:else}
      <p class="loading">Preparing the board…</p>
    {/if}
    <Toasts />
    {#if helpOpen}
      <div class="help" role="dialog" aria-modal="true" aria-label="How to play">
        <HowToPlay onclose={() => (helpOpen = false)} />
      </div>
    {/if}
    <p class="sr-only" aria-live="polite">{announcement}</p>
  </div>
{/if}

<style>
  .screen {
    min-height: 100dvh;
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    gap: 10px;
    padding: max(8px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }
  .board-wrap { position: relative; display: grid; place-items: center; min-height: 0; }
  .board-wrap :global(svg.board) { max-height: calc(100dvh - 250px); }
  .bottom { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
  .bottom > :global(.hud) { flex: 1 1 260px; }
  .vertical .board-wrap :global(svg.board) { max-height: calc(100dvh - 300px); }
  .vertical .bottom { flex-direction: column-reverse; align-items: stretch; }
  .vertical .bottom > :global(.hud) { flex: none; }
  .vertical .bottom :global(.dice) { justify-content: center; }
  .banner { padding: 8px 14px; border: 1px solid var(--carnelian); border-radius: 10px; background: #7a2a16cc; text-align: center; }
  .banner.subtle { border-color: #e2bf6355; background: #0b1438cc; }
  .intro { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
  .intro p { margin: 0; padding: 0.4em 1.1em; border: 1px solid var(--gold); border-radius: 12px; background: #060a1fdd; font-family: var(--font-display); font-size: clamp(1.5rem, 5vw, 2.5rem); color: var(--gold); box-shadow: 0 20px 50px #000b; animation: rise 0.45s ease-out; }
  .overlay { position: fixed; inset: 0; z-index: 35; display: grid; place-items: center; padding: 20px; background: #060a1fcc; }
  .card { width: min(92vw, 460px); padding: 24px; border: 1px solid var(--gold); border-radius: 16px; background: linear-gradient(180deg, #16307e, #0b1438); box-shadow: 0 30px 80px #000c; }
  .help { position: fixed; inset: 0; z-index: 50; overflow-y: auto; background: radial-gradient(ellipse at 50% 20%, #1b2f74f5, #060a1ffa); }
  .loading { place-self: center; font-style: italic; }
  @keyframes rise { from { opacity: 0; transform: translateY(12px); } }
</style>
