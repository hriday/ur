export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now: () => number;
  /** Most keys tracked at once; the least recently seen are evicted first. */
  maxKeys?: number;
}

/** Sliding-window limiter: at most `limit` hits per key within `windowMs`. */
export function createRateLimiter({ limit, windowMs, now, maxKeys = 10_000 }: RateLimiterOptions) {
  // Map iteration order is insertion order; every hit re-inserts its key, so the front is the stalest.
  const hits = new Map<string, number[]>();
  const limiter = (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(t);
    hits.delete(key);
    hits.set(key, recent);
    for (const [k, times] of hits) {
      const expired = times.every((x) => t - x >= windowMs);
      if (!expired && hits.size <= maxKeys) break;
      if (k !== key) hits.delete(k);
      else break;
    }
    return allowed;
  };
  limiter.size = () => hits.size;
  return limiter;
}

/** Token bucket: refills `rate` tokens per second up to `burst`; each take() costs one token. */
export function createTokenBucket({ rate, burst, now }: { rate: number; burst: number; now: () => number }) {
  let tokens = burst;
  let last = now();
  return {
    take(): boolean {
      const t = now();
      tokens = Math.min(burst, tokens + ((t - last) / 1000) * rate);
      last = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

const isLoopback = (ip: string) =>
  ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.');

/**
 * The client address, mirroring Express's `trust proxy 'loopback'`: X-Forwarded-For is only
 * believed while the hop that reported it is loopback (Caddy on this host).
 */
export function clientIp(remote: string | undefined, forwardedFor: string | string[] | undefined): string {
  let ip = remote ?? 'unknown';
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  const chain = (header ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  while (isLoopback(ip) && chain.length) ip = chain.pop()!;
  return ip;
}

/** Rate-limit key for an address: IPv4 as-is, IPv6 by its /64 (one subscriber's whole allocation). */
export function addressKey(ip: string): string {
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4) return v4[1];
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('%')[0].toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`;
}
