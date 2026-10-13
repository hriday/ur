export function createRateLimiter({ limit, windowMs, now }: { limit: number; windowMs: number; now: () => number }) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    if (hits.size > 10_000) hits.clear();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(t);
    hits.set(key, recent);
    return allowed;
  };
}
