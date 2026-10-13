<script lang="ts">
  import { cellFor, type Player } from '@ur/shared';
  import Dice from '../board/Dice.svelte';
  import MiniBoard from '../board/MiniBoard.svelte';
  import Piece from '../board/Piece.svelte';
  import { G, S, cellCenter, cellOrigin } from '../board/geometry';
  import { coach } from '../game/coach.svelte';
  import { link } from '../lib/router.svelte';

  let { onclose }: { onclose?: () => void } = $props();

  const at = (player: Player, pos: number) => {
    const c = cellFor(player, pos)!;
    return cellCenter(c.row, c.col, 0);
  };
  const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');

  const start = cellCenter(0, 4.15, 0);
  const finish = cellCenter(0, 5.0, 0);
  const route = pts([start, ...Array.from({ length: 14 }, (_, i) => at(0, i + 1)), finish]);
  const squares = Array.from({ length: 14 }, (_, i) => ({ n: i + 1, ...at(0, i + 1) }));
  const shared = cellOrigin(1, 0, 0);
  const rosettes = ([[0, 0], [0, 6], [1, 3], [2, 0], [2, 6]] as const).map(([r, c]) => cellCenter(r, c, 0));
  const central = cellCenter(1, 3, 0);
  const odds = [1, 4, 6, 4, 1];
  let tipsReset = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose?.()} />

<main class="rules">
  <div class="bar">
    {#if onclose}
      <button class="btn small ghost" onclick={onclose}>Back to the game</button>
    {:else}
      <a class="btn small ghost" href="/" use:link>Home</a>
    {/if}
  </div>

  <header>
    <p class="eyebrow">How to play</p>
    <h1>The Royal Game of Ur</h1>
    <p class="lede">A race for two, played across the ancient Near East for three thousand years.</p>
  </header>

  <section>
    <h2>1 · The goal</h2>
    <p>Each player has seven pieces — gold or carnelian. Race all seven along your route and off the board before your rival does.</p>
    <MiniBoard label="Gold and carnelian pieces racing along the board">
      <Piece {...at(0, 3)} player={0} />
      <Piece {...at(0, 9)} player={0} />
      <Piece {...at(1, 6)} player={1} />
      <Piece {...at(1, 13)} player={1} />
    </MiniBoard>
  </section>

  <section>
    <h2>2 · The dice</h2>
    <p>Throw the four pyramid-shaped dice. Each has one marked tip. Count the marked tips facing up — that is your move, from 0 to 4.</p>
    <div class="center"><Dice dice={[1, 0, 1, 1]} total={3} rolling={false} enabled={false} testid="dice-example" /></div>
    <p>The numbers are not equally likely: two comes up most often, while zero and four are rare.</p>
    <svg class="odds" viewBox="0 0 300 140" role="img" aria-label="Chances out of 16: zero 1, one 4, two 6, three 4, four 1">
      {#each odds as o, i}
        <rect x={20 + i * 56} y={110 - o * 14} width="40" height={o * 14} rx="3" />
        <text x={40 + i * 56} y="132">{i}</text>
        <text class="small" x={40 + i * 56} y={102 - o * 14}>{o}/16</text>
      {/each}
    </svg>
  </section>

  <section>
    <h2>3 · The route</h2>
    <p>Pieces enter on your own side, run the length of the shared middle row, then turn back onto your side and leave the board. The first four squares and the last two are yours alone; the eight in the middle are the battleground.</p>
    <MiniBoard label="Your route: four private squares, eight shared squares, two private squares, then off the board">
      <rect class="shared" x={shared.x - 5} y={shared.y - 5} width={8 * S + 7 * G + 10} height={S + 10} rx="8" />
      <polyline class="route" points={route} />
      {#each squares as s}
        <g class="num" transform="translate({s.x + 30} {s.y - 30})"><circle r="14" /><text dy="5">{s.n}</text></g>
      {/each}
      <text class="label" x={start.x + 10} y={start.y - 16}>Start</text>
      <text class="label" x={finish.x} y={finish.y + 36}>Off</text>
    </MiniBoard>
  </section>

  <section>
    <h2>4 · Moving</h2>
    <p>Move one piece exactly the number you threw — either a new piece onto the board, or one already on its way.</p>
    <ul>
      <li>You cannot land on a square holding your own piece.</li>
      <li>Bearing a piece off needs the exact number to step just past your last square.</li>
    </ul>
    <MiniBoard label="A gold piece moving three squares">
      <circle class="target" cx={at(0, 5).x} cy={at(0, 5).y} r="34" />
      <polyline class="route short" points={pts([at(0, 2), at(0, 3), at(0, 4), at(0, 5)])} />
      <Piece {...at(0, 2)} player={0} />
    </MiniBoard>
  </section>

  <section>
    <h2>5 · Capturing</h2>
    <p>Land on a rival’s piece in the shared row and it is knocked back to the start, to begin its journey again. Pieces on your private squares are always safe.</p>
    <MiniBoard label="A gold piece capturing a carnelian piece">
      <polyline class="route short" points={pts([at(0, 6), at(0, 7), at(0, 8), at(0, 9)])} />
      <Piece {...at(0, 6)} player={0} />
      <Piece {...at(1, 9)} player={1} />
      <circle class="hit" cx={at(1, 9).x} cy={at(1, 9).y} r="44" />
    </MiniBoard>
  </section>

  <section>
    <h2>6 · Rosettes</h2>
    <p>Land on any of the five rosettes and you throw again. The central rosette is a safe haven: a piece resting there cannot be captured, and no rival may land on it.</p>
    <MiniBoard label="The five rosettes, with the safe central rosette">
      {#each rosettes as r}<circle class="glow" cx={r.x} cy={r.y} r="46" />{/each}
      <text class="label" x={central.x} y={central.y + 76}>Safe</text>
    </MiniBoard>
  </section>

  <section>
    <h2>7 · Passing</h2>
    <p>A throw of zero — or a throw with no legal move — passes your turn. The game will always tell you when this happens.</p>
    <div class="center"><Dice dice={[0, 0, 0, 0]} total={0} rolling={false} enabled={false} testid="dice-example-zero" /></div>
  </section>

  <section>
    <h2>8 · Strategy</h2>
    <ul>
      <li>Hold the central rosette: it is safe, it blocks your rival, and it grants another throw.</li>
      <li>Don’t linger one to four squares ahead of a rival piece in the shared row — two is the likeliest throw.</li>
      <li>Keep several pieces in play so a single throw always has a good option.</li>
      <li>Move through the battleground quickly; your last two squares are safe.</li>
    </ul>
  </section>

  <section>
    <h2>9 · History</h2>
    <p>Two of these boards were excavated by Sir Leonard Woolley in the Royal Cemetery at Ur, in present-day Iraq, in the 1920s. They date to around 2600 BCE, which makes this one of the oldest board games ever found.</p>
    <p>The rules were lost for millennia. In the 1980s Irving Finkel of the British Museum reconstructed them from a cuneiform tablet written by a Babylonian scribe in 177 BCE. This game follows his reconstruction.</p>
  </section>

  <footer>
    {#if tipsReset}
      <p>Beginner tips will appear again in your next game.</p>
    {:else}
      <button class="btn small ghost" onclick={() => { coach.enable(); tipsReset = true; }}>Show beginner tips again</button>
    {/if}
  </footer>
</main>

<style>
  .rules { max-width: 760px; margin: 0 auto; padding: max(12px, env(safe-area-inset-top)) 20px 48px; }
  .bar { position: sticky; top: 0; z-index: 2; padding: 8px 0; }
  header { text-align: center; margin-bottom: 24px; }
  h1 { margin: 0.2em 0; font-size: clamp(2rem, 6vw, 3rem); }
  .lede { margin: 0; font-style: italic; font-size: 1.2rem; }
  section { margin: 28px 0; padding: 20px; border: 1px solid #e2bf6333; border-radius: 14px; background: #0b143866; }
  h2 { margin: 0 0 8px; font-size: 1.4rem; }
  p, li { font-size: 1.15rem; }
  ul { padding-left: 1.2em; }
  .center { display: flex; justify-content: center; margin: 12px 0; }
  .odds { display: block; width: min(100%, 360px); margin: 0 auto; }
  .odds rect { fill: var(--gold); }
  .odds text { fill: var(--shell); font-family: var(--font-display); font-size: 16px; text-anchor: middle; }
  .odds text.small { font-size: 12px; fill: var(--gold-pale); }
  .shared { fill: #c7512f22; stroke: var(--carnelian); stroke-width: 3; stroke-dasharray: 10 6; }
  .route { fill: none; stroke: var(--gold-pale); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 2600; stroke-dashoffset: 2600; animation: draw 5s ease-in-out infinite; filter: drop-shadow(0 0 6px #f3d27a); }
  .route.short { stroke-dasharray: 600; stroke-dashoffset: 600; animation-duration: 2.5s; }
  .num circle { fill: #060a1f; stroke: var(--gold); stroke-width: 2; }
  .num text, .label { fill: var(--gold-pale); font-family: var(--font-display); font-size: 16px; font-weight: 700; text-anchor: middle; }
  .label { font-size: 24px; }
  .target { fill: #e2bf6333; stroke: var(--gold-pale); stroke-width: 3; stroke-dasharray: 8 7; }
  .hit { fill: none; stroke: #ff9b74; stroke-width: 4; animation: pulse 1.4s ease-in-out infinite; }
  .glow { fill: none; stroke: var(--gold-pale); stroke-width: 5; animation: pulse 2s ease-in-out infinite; }
  footer { text-align: center; }
  @keyframes draw { 0% { stroke-dashoffset: 2600; } 70%, 100% { stroke-dashoffset: 0; } }
  @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
</style>
