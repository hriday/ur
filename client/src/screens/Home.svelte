<script lang="ts">
  import { slide } from 'svelte/transition';
  import MiniBoard from '../board/MiniBoard.svelte';
  import Piece from '../board/Piece.svelte';
  import { piecePoint } from '../board/geometry';
  import { ApiError, createGame } from '../game/api';
  import { seatTokens } from '../game/storage';
  import { link, navigate } from '../lib/router.svelte';

  const levels = [
    { id: 'easy', name: 'Easy', blurb: 'A gentle opponent for learning the game.' },
    { id: 'medium', name: 'Medium', blurb: 'Thinks a roll ahead.' },
    { id: 'hard', name: 'Hard', blurb: 'Weighs every throw of the dice.' },
  ];
  const heroPieces = [
    { player: 0 as const, ...piecePoint(0, 3, 0, 0) },
    { player: 0 as const, ...piecePoint(0, 8, 0, 0) },
    { player: 1 as const, ...piecePoint(1, 6, 0, 0) },
    { player: 1 as const, ...piecePoint(1, 13, 0, 0) },
  ];

  let choosingLevel = $state(false);
  let creating = $state(false);
  let error = $state<string | null>(null);

  async function playFriend() {
    creating = true;
    error = null;
    try {
      const { gameId, seatToken } = await createGame();
      seatTokens.set(gameId, seatToken);
      navigate(`/g/${gameId}`);
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Could not start a game.';
    } finally {
      creating = false;
    }
  }
</script>

<main class="home">
  <div class="frieze" aria-hidden="true"></div>
  <header>
    <p class="eyebrow">Sumer · c. 2600 BCE</p>
    <h1>The Royal Game <span>of</span> Ur</h1>
    <p class="lede">The oldest playable board game in the world, unearthed in the Royal Cemetery at Ur.</p>
  </header>

  <div class="hero" aria-hidden="true">
    <MiniBoard label="The board of the Royal Game of Ur">
      {#each heroPieces as p}<Piece x={p.x} y={p.y} player={p.player} />{/each}
    </MiniBoard>
  </div>

  <nav class="modes" aria-label="Choose how to play">
    <button class="btn" onclick={playFriend} disabled={creating}>{creating ? 'Preparing…' : 'Play a Friend'}</button>
    <button class="btn" onclick={() => (choosingLevel = !choosingLevel)} aria-expanded={choosingLevel}>Play the Computer</button>
    {#if choosingLevel}
      <div class="levels" transition:slide={{ duration: 220 }}>
        {#each levels as l}
          <a class="level" href="/play/ai/{l.id}" use:link><strong>{l.name}</strong><span>{l.blurb}</span></a>
        {/each}
      </div>
    {/if}
    <a class="btn ghost" href="/play/local" use:link>Pass &amp; Play</a>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </nav>

  <footer>
    <a href="/how-to-play" use:link>How to play</a>
    <span aria-hidden="true">·</span>
    <span>Rules after Irving Finkel’s reconstruction</span>
  </footer>
  <div class="frieze bottom" aria-hidden="true"></div>
</main>

<style>
  .home { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; gap: clamp(16px, 3vh, 32px); text-align: center; }
  .frieze { align-self: stretch; }
  .frieze.bottom { margin-top: auto; }
  header { padding: 0 20px; }
  h1 {
    margin: 0.15em 0;
    font-size: clamp(2.3rem, 7.5vw, 4.6rem);
    font-weight: 700;
    line-height: 1.05;
    background: linear-gradient(100deg, var(--gold-deep) 0%, var(--gold-pale) 25%, var(--gold) 45%, #fff3c4 50%, var(--gold) 55%, var(--gold-deep) 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: gild 9s ease-in-out infinite;
  }
  h1 span { font-size: 0.55em; font-weight: 500; }
  .lede { margin: 0 auto; max-width: 34ch; font-size: 1.2rem; font-style: italic; color: #e9dcc0; }
  .hero { width: min(92vw, 680px, 70dvh); animation: float 7s ease-in-out infinite; filter: drop-shadow(0 30px 40px #000b); }
  .modes { display: grid; gap: 12px; width: min(88vw, 360px); }
  .levels { display: grid; gap: 8px; overflow: hidden; }
  .level { display: grid; gap: 2px; padding: 12px 16px; min-height: 44px; border: 1px solid #e2bf6355; border-radius: 8px; background: #0b1438aa; text-align: left; text-decoration: none; color: var(--shell); }
  .level:hover { border-color: var(--gold); }
  .level strong { font-family: var(--font-display); color: var(--gold); letter-spacing: 0.1em; }
  .level span { font-size: 0.95rem; opacity: 0.85; }
  .error { margin: 0; color: #ffb59c; }
  footer { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 0 20px; font-size: 1rem; opacity: 0.9; }
  @keyframes gild { 0%, 100% { background-position: 100% 0; } 50% { background-position: 0 0; } }
  @keyframes float { 0%, 100% { transform: translateY(0) rotate(-0.4deg); } 50% { transform: translateY(-8px) rotate(0.4deg); } }
</style>
