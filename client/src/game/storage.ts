const key = (gameId: string) => `ur.seat.${gameId.toUpperCase()}`;
/** Fallback when localStorage is unavailable (private mode): the seat lasts this tab only. */
const memory = new Map<string, string>();

export const seatTokens = {
  get(gameId: string): string | null {
    try {
      const t = localStorage.getItem(key(gameId));
      if (t) return t;
    } catch { /* fall through to memory */ }
    return memory.get(key(gameId)) ?? null;
  },
  set(gameId: string, token: string) {
    memory.set(key(gameId), token);
    try { localStorage.setItem(key(gameId), token); } catch { /* memory only */ }
  },
};

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

/** The seat token in a private "continue on another device" fragment (`#seat=<token>`), if any. */
export function parseSeatFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('seat');
  return token && TOKEN.test(token) ? token : null;
}

/** The private link that hands this seat to another browser. The fragment never reaches the server. */
export const seatLink = (origin: string, gameId: string, token: string) =>
  `${origin}/g/${gameId}#seat=${encodeURIComponent(token)}`;

/**
 * Adopts a seat handed over in the URL fragment, then strips the fragment from the address bar
 * (and history) so it is not left lying around. Returns true when a seat was imported.
 */
export function adoptSeatFromUrl(gameId: string): boolean {
  if (!location.hash) return false;
  const token = parseSeatFragment(location.hash);
  if (token) seatTokens.set(gameId, token);
  history.replaceState(history.state, '', location.pathname + location.search);
  return token !== null;
}
