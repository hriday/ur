import { describe, expect, it } from 'vitest';
import { newGame, type RoomSnapshot } from '@ur/shared';
import { toSnapshot } from './online';

const room = (seat: 0 | 1 | null): RoomSnapshot => ({
  gameId: 'ABC234', state: newGame(0), seat, seated: [true, true], connected: [true, false], rematch: [false, true],
});

describe('toSnapshot', () => {
  it('maps the creator’s view', () => {
    expect(toSnapshot(room(0))).toMatchObject({
      mode: 'online', gameId: 'ABC234', controls: [0], perspective: 0, names: ['You', 'Friend'],
      spectator: false, connected: [true, false], rematch: [false, true],
    });
  });
  it('puts the joiner at the bottom', () => {
    expect(toSnapshot(room(1))).toMatchObject({ controls: [1], perspective: 1, names: ['Friend', 'You'] });
  });
  it('makes spectators read-only', () => {
    expect(toSnapshot(room(null))).toMatchObject({ controls: [], perspective: 0, names: ['Gold', 'Carnelian'], spectator: true });
  });
});
