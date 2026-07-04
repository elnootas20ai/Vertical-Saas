import { describe, expect, it } from 'vitest';
import { resolveTerminalLoginFromDocs } from '../services/terminalLoginResolve.js';

describe('resolveTerminalLoginFromDocs', () => {
  const pdvs = [
    {
      _id: 'pdv1',
      type: 'point_of_sale',
      active: true,
      terminalCode: 'ABC123',
      code: 'TIENDA1',
      terminals: [
        { id: 't-salon', code: 'K7M2NP', name: 'Salón Principal', active: true, salaRoomId: 'room_1' },
        { id: 't-terraza', code: 'R4T8WX', name: 'Terraza', active: true, salaRoomId: 'room_2' },
      ],
    },
  ];

  it('resuelve código tablet del PDV', () => {
    const result = resolveTerminalLoginFromDocs(pdvs, 'abc123');
    expect(result?.pdv._id).toBe('pdv1');
    expect(result?.salaTerminalId).toBeNull();
  });

  it('resuelve código de terminal sala (6 caracteres)', () => {
    const result = resolveTerminalLoginFromDocs(pdvs, 'R4T8WX');
    expect(result?.pdv._id).toBe('pdv1');
    expect(result?.salaTerminalId).toBe('t-terraza');
  });

  it('ignora terminales inactivos', () => {
    const docs = [
      {
        ...pdvs[0],
        terminals: [{ id: 't-off', code: 'OFF123', name: 'Off', active: false }],
      },
    ];
    expect(resolveTerminalLoginFromDocs(docs, 'OFF123')).toBeNull();
  });
});
