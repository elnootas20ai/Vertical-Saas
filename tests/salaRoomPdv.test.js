import { describe, expect, it } from 'vitest';
import {
  findTerminalForRoom,
  generateSalaTerminalLoginCode,
  isLegacySalaTerminalCode,
  isSalaManagedWorkCenter,
  needsLegacyTerminalCodeMigration,
  salaTerminalCodeForRoom,
  stripSalaRoomNoteFromWorkCenter,
} from '../src/app/lib/salaRoomTerminal.ts';

describe('salaRoomPdv', () => {
  it('genera códigos de activación de 6 caracteres', () => {
    const code = generateSalaTerminalLoginCode();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('detecta códigos legacy SALA-*', () => {
    expect(isLegacySalaTerminalCode('SALA-ROOM_ABC')).toBe(true);
    expect(isLegacySalaTerminalCode('K7M2NP')).toBe(false);
    expect(needsLegacyTerminalCodeMigration({ code: 'SALA-ROOM_Q6W' })).toBe(true);
  });

  it('genera código legacy estable por sala (solo migración)', () => {
    expect(salaTerminalCodeForRoom('room_abc12345')).toBe('SALA-ROOM_ABC');
  });

  it('detecta centros creados por sala', () => {
    expect(isSalaManagedWorkCenter({ notes: 'sala_room:room_1' })).toBe(true);
    expect(isSalaManagedWorkCenter({ notes: 'tienda principal' })).toBe(false);
  });

  it('quita marca sala_room de notas', () => {
    expect(stripSalaRoomNoteFromWorkCenter('sala_room:room_1\nTienda real')).toBe('Tienda real');
  });

  it('encuentra terminal por id o código', () => {
    const pdv = {
      _id: 'pdv1',
      terminals: [
        { id: 't1', code: 'K7M2NP', name: 'Salón', active: true, salaRoomId: 'room_1' },
      ],
    };
    expect(findTerminalForRoom(pdv, { id: 'room_1', terminalCode: 'K7M2NP' })).toMatchObject({ id: 't1' });
    expect(findTerminalForRoom(pdv, { id: 'room_x', terminalId: 't1', terminalCode: 'K7M2NP' })).toMatchObject({ id: 't1' });
  });
});
