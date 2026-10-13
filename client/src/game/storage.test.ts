import { afterEach, describe, expect, it, vi } from 'vitest';
import { adoptSeatFromUrl, parseSeatFragment, seatLink, seatTokens } from './storage';

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF12';

describe('seat fragment', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses only well-formed seat tokens', () => {
    expect(parseSeatFragment(`#seat=${TOKEN}`)).toBe(TOKEN);
    expect(parseSeatFragment(`seat=${TOKEN}`)).toBe(TOKEN);
    expect(parseSeatFragment('#seat=short')).toBeNull();
    expect(parseSeatFragment('#seat=<script>alert(1)</script>xxxxxxxx')).toBeNull();
    expect(parseSeatFragment('')).toBeNull();
  });

  it('round-trips through the private link', () => {
    const url = new URL(seatLink('https://ur.example', 'ABCDEF', TOKEN));
    expect(url.pathname).toBe('/g/ABCDEF');
    expect(parseSeatFragment(url.hash)).toBe(TOKEN);
  });

  it('adopts the seat and strips the fragment from the address bar', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', { hash: `#seat=${TOKEN}`, pathname: '/g/ABCDEF', search: '' });
    vi.stubGlobal('history', { state: null, replaceState });
    expect(adoptSeatFromUrl('ABCDEF')).toBe(true);
    expect(seatTokens.get('abcdef')).toBe(TOKEN);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/g/ABCDEF');
  });

  it('leaves the URL alone when there is no fragment', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', { hash: '', pathname: '/g/ZZZZZZ', search: '' });
    vi.stubGlobal('history', { state: null, replaceState });
    expect(adoptSeatFromUrl('ZZZZZZ')).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
    expect(seatTokens.get('ZZZZZZ')).toBeNull();
  });
});
