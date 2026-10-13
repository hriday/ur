import { describe, expect, it } from 'vitest';
import { parseClientMsg } from './protocol';

describe('parseClientMsg', () => {
  it('accepts valid messages', () => {
    expect(parseClientMsg('{"type":"roll"}')).toEqual({ type: 'roll' });
    expect(parseClientMsg('{"type":"rematch"}')).toEqual({ type: 'rematch' });
    expect(parseClientMsg('{"type":"move","piece":6}')).toEqual({ type: 'move', piece: 6 });
  });
  it('rejects junk', () => {
    for (const raw of ['', 'nope', 'null', '[]', '{"type":"move","piece":7}', '{"type":"move","piece":"1"}', '{"type":"move","piece":1.5}', '{"type":"hack"}']) {
      expect(parseClientMsg(raw)).toBeNull();
    }
  });
});
