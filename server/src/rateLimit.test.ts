import { describe, expect, it } from 'vitest';
import { addressKey, clientIp, createRateLimiter, createTokenBucket } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows `limit` hits per window per key', () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
    t = 1000;
    expect(allow('a')).toBe(true);
  });

  it('evicts expired and least-recent keys instead of forgetting everyone', () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t, maxKeys: 3 });
    allow('abuser');
    expect(allow('abuser')).toBe(false);
    t = 10;
    allow('x1');
    allow('x2');
    allow('abuser'); // still limited, and now the most recent key
    allow('x3'); // over the cap: the stalest key (x1) goes, the abuser stays
    expect(allow.size()).toBeLessThanOrEqual(3);
    expect(allow('abuser')).toBe(false);
    // Once their window has passed, idle keys are swept as new ones arrive.
    t = 5000;
    allow('fresh');
    expect(allow.size()).toBe(1);
  });

  it('stays bounded under a flood of distinct keys', () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 30, windowMs: 60_000, now: () => t, maxKeys: 100 });
    allow('victim-of-clear');
    allow('victim-of-clear');
    for (let i = 0; i < 1000; i++) { t++; allow(`k${i}`); }
    expect(allow.size()).toBeLessThanOrEqual(100);
  });
});

describe('createTokenBucket', () => {
  it('allows a burst, then refills at the rate', () => {
    let t = 0;
    const b = createTokenBucket({ rate: 20, burst: 40, now: () => t });
    for (let i = 0; i < 40; i++) expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    t = 100; // 2 tokens
    expect([b.take(), b.take(), b.take()]).toEqual([true, true, false]);
    t = 100_000;
    for (let i = 0; i < 40; i++) expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });
});

describe('clientIp', () => {
  it('believes X-Forwarded-For only from a loopback peer', () => {
    expect(clientIp('127.0.0.1', '203.0.113.5')).toBe('203.0.113.5');
    expect(clientIp('::ffff:127.0.0.1', '203.0.113.5')).toBe('203.0.113.5');
    expect(clientIp('::1', 'spoofed, 203.0.113.5')).toBe('203.0.113.5');
    expect(clientIp('198.51.100.1', '203.0.113.5')).toBe('198.51.100.1');
    expect(clientIp('127.0.0.1', undefined)).toBe('127.0.0.1');
  });
});

describe('addressKey', () => {
  it('keeps IPv4 and unwraps IPv4-mapped IPv6', () => {
    expect(addressKey('203.0.113.5')).toBe('203.0.113.5');
    expect(addressKey('::ffff:203.0.113.5')).toBe('203.0.113.5');
  });
  it('groups IPv6 by /64', () => {
    const k = addressKey('2001:db8:1:2::1');
    expect(addressKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe(k);
    expect(addressKey('2001:db8:1:3::1')).not.toBe(k);
    expect(k).toBe('2001:db8:1:2::/64');
    expect(addressKey('::1')).toBe('0:0:0:0::/64');
    expect(addressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });
});
