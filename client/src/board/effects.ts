import type { Point } from './geometry';

export interface Effect { id: number; kind: 'capture' | 'rosette' | 'bearOff'; at: Point }
