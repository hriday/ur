const key = (gameId: string) => `ur.seat.${gameId.toUpperCase()}`;

export const seatTokens = {
  get(gameId: string): string | null {
    try { return localStorage.getItem(key(gameId)); } catch { return null; }
  },
  set(gameId: string, token: string) {
    try { localStorage.setItem(key(gameId), token); } catch { /* private mode: seat lasts this tab only */ }
  },
};
