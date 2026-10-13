import { OFF, START, type GameEvent } from '@ur/shared';

const isYou = (name: string) => name === 'You';
/** "you roll" / "Gold rolls" */
const subjectVerb = (name: string, verb: string) => (isYou(name) ? `you ${verb}` : `${name} ${verb}s`);

/** Short toast for rules-driven moments; null when nothing needs explaining. */
export function eventToast(e: GameEvent, names: [string, string]): string | null {
  const who = names[e.player];
  switch (e.type) {
    case 'passed':
      return e.reason === 'zero'
        ? `${who} rolled 0 — turn passes`
        : `No legal move for ${isYou(who) ? 'you' : who} — turn passes`;
    case 'rosette':
      return e.at === 8
        ? `Central rosette — safe, and ${subjectVerb(who, 'roll')} again`
        : `Rosette — ${subjectVerb(who, 'roll')} again`;
    case 'captured':
      return `${who} captured a piece!`;
    default:
      return null;
  }
}

/** Full sentence for the screen-reader live region. */
export function describeEvent(e: GameEvent, names: [string, string]): string {
  const who = names[e.player];
  switch (e.type) {
    case 'rolled':
      return `${who} rolled ${e.roll}.`;
    case 'passed':
      return `${eventToast(e, names)}.`;
    case 'moved':
      if (e.from === START) return `${who} entered a piece onto square ${e.to}.`;
      if (e.to === OFF) return `${who} bore a piece off the board.`;
      return `${who} moved a piece from square ${e.from} to square ${e.to}.`;
    case 'captured':
      return `${who} captured a piece on square ${e.at}; it returns to the start.`;
    case 'rosette':
      return `${who} landed on a rosette — ${subjectVerb(who, 'roll')} again.`;
    case 'borneOff':
      return `${who} brought a piece home.`;
    case 'won':
      return `${who} ${isYou(who) ? 'win' : 'wins'} the game!`;
  }
}
