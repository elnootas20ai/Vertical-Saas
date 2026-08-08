import { describe, expect, it } from 'vitest';
import { computeClockinMinutes } from '../services/clockinsAccess.js';

describe('computeClockinMinutes — salida fantasma al día siguiente', () => {
  it('no cuenta ~24 h si cerraron al fichar al día (sin horario)', () => {
    const entries = [
      { type: 'clock_in', time: '2026-08-05T16:07:00.000Z' }, // 18:07 Madrid (UTC+2)
      { type: 'clock_out', time: '2026-08-06T17:02:00.000Z' }, // 19:02 Madrid día siguiente
    ];
    const { totalMinutes } = computeClockinMinutes(entries, undefined, undefined, '2026-08-05');
    // Tope seguridad 4 h desde entrada, no 24h55m
    expect(totalMinutes).toBeLessThanOrEqual(4 * 60);
    expect(totalMinutes).toBeGreaterThan(0);
  });

  it('con fin de turno recorta a la hora programada', () => {
    const entries = [
      { type: 'clock_in', time: '2026-08-05T16:07:00.000Z' },
      { type: 'clock_out', time: '2026-08-06T17:02:00.000Z' },
    ];
    const { totalMinutes } = computeClockinMinutes(entries, '18:00', '19:00', '2026-08-05');
    // De 18:07 → 19:00 = 53 min
    expect(totalMinutes).toBe(53);
  });
});
