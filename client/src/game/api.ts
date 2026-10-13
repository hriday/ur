export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method });
  } catch {
    throw new ApiError(0, 'Could not reach the server — check your connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.message ?? 'Something went wrong.');
  return body as T;
}

export const createGame = () => call<{ gameId: string; seatToken: string }>('/api/games', 'POST');
export const gameInfo = (id: string) =>
  call<{ gameId: string; seated: [boolean, boolean] }>(`/api/games/${encodeURIComponent(id)}`);
export const joinGame = (id: string) =>
  call<{ seatToken: string }>(`/api/games/${encodeURIComponent(id)}/join`, 'POST');
