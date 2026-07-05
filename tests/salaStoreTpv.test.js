import { describe, expect, it } from 'vitest';
import {
  resolveParentPdvFromScope,
  resolveSalaTpvDisplay,
} from '../src/app/lib/salaStoreTpv.ts';

describe('salaStoreTpv', () => {
  const pdv = {
    _id: 'pdv1',
    name: 'Centro',
    code: 'CTR-01',
    terminalCode: 'K7M2NP',
    terminals: [
      { id: 't1', code: 'K7M2NP', name: 'Principal', active: true },
      { id: 't2', code: 'R8N3QW', name: 'Terraza', active: true, salaRoomId: 'room_terraza' },
    ],
  };

  it('resuelve PDV activo o enlazado en salas', () => {
    expect(resolveParentPdvFromScope('pdv1', [], [pdv])).toMatchObject({ _id: 'pdv1' });
    expect(resolveParentPdvFromScope('', [{ id: 'r1', pdvId: 'pdv1' }], [pdv])).toMatchObject({ _id: 'pdv1' });
    expect(resolveParentPdvFromScope('', [], [pdv])).toMatchObject({ _id: 'pdv1' });
  });

  it('muestra TPV compartido cuando la sala no tiene terminal propio', () => {
    const display = resolveSalaTpvDisplay(pdv, { id: 'room_salon' }, []);
    expect(display.terminalCode).toBe('K7M2NP');
    expect(display.sharedWithStore).toBe(true);
    expect(display.cajaOpen).toBe(false);
  });

  it('usa terminal de sala si existe en el PDV', () => {
    const display = resolveSalaTpvDisplay(
      pdv,
      { id: 'room_terraza', terminalCode: 'OLD' },
      [{ _id: 's1', pointOfSaleId: 'pdv1', status: 'open', openedAt: '2026-07-04T10:00:00.000Z' }],
    );
    expect(display.terminalCode).toBe('R8N3QW');
    expect(display.sharedWithStore).toBe(false);
    expect(display.cajaOpen).toBe(true);
  });

  it('empareja sesión por PDV o centro de trabajo', () => {
    const pdv = {
      _id: 'pdv1',
      workCenterId: 'wc1',
      name: 'Centro',
      code: 'CTR-01',
      terminalCode: 'K7M2NP',
      terminals: [{ id: 't1', code: 'K7M2NP', name: 'Principal', active: true }],
    };
    const display = resolveSalaTpvDisplay(
      pdv,
      null,
      [{ pointOfSaleId: 'wc1', status: 'open', openedAt: '2026-07-04T10:00:00.000Z' }],
    );
    expect(display.cajaOpen).toBe(true);
  });

  it('prefiere código tablet del PDV frente a identificadores internos del terminal', () => {
    const pdvWithInternalCode = {
      _id: 'pdv1',
      name: 'bodegeta',
      code: 'BOD-01',
      terminalCode: 'K7M2NP',
      terminals: [{ id: 't1', code: 'TPV-1', name: 'Principal', active: true }],
    };
    const display = resolveSalaTpvDisplay(pdvWithInternalCode, { id: 'room_salon' }, []);
    expect(display.terminalCode).toBe('K7M2NP');
  });
});
