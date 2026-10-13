export type TipKey = 'roll' | 'move' | 'rosette' | 'central' | 'danger' | 'capture' | 'pass';

const hoverCapable = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;

const TIPS: Record<TipKey, () => string> = {
  roll: () => 'Tap the dice to throw them. Count the marked tips facing up — that is how far you move.',
  move: () =>
    hoverCapable()
      ? 'Glowing pieces can move. Hover to see where one would land, then click to move it.'
      : 'Glowing pieces can move. Tap one to see where it would land, then tap again to move it.',
  rosette: () => 'A rosette! Landing on one gives you another throw.',
  central: () => 'The central rosette is a safe haven — a piece resting there cannot be captured.',
  danger: () => 'Careful: a rival piece is up to four squares behind yours in the shared row and could capture it.',
  capture: () => 'Capture! Landing on a rival in the shared row sends that piece back to the start.',
  pass: () => 'A throw of zero, or a throw with no legal move, passes the turn.',
};

const OFF_KEY = 'ur.coach.off';
const SEEN_KEY = 'ur.coach.seen';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode */ }
}

let enabled = $state(read(OFF_KEY) !== '1');
let current = $state<TipKey | null>(null);
let seen = new Set<string>(JSON.parse(read(SEEN_KEY) ?? '[]') as string[]);

export const coach = {
  get current() { return current; },
  get text() { return current ? TIPS[current]() : ''; },
  get enabled() { return enabled; },
  /** Shows a tip once ever, and only when no other tip is showing. */
  trigger(key: TipKey) {
    if (!enabled || current || seen.has(key)) return;
    seen.add(key);
    write(SEEN_KEY, JSON.stringify([...seen]));
    current = key;
  },
  dismiss() { current = null; },
  disable() {
    enabled = false;
    current = null;
    write(OFF_KEY, '1');
  },
  enable() {
    enabled = true;
    seen = new Set();
    write(SEEN_KEY, '[]');
    write(OFF_KEY, null);
  },
};
