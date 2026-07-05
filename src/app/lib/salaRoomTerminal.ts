import type { PointOfSale, TerminalConfig } from './deliveryApi';
import type { SalaRoom } from './salaStudioTypes';
import type { WorkCenter } from './workCentersApi';

const SALA_ROOM_WC_NOTE_PREFIX = 'sala_room:';
/** Legacy — terminales antiguos con prefijo SALA- (demasiado largos para login). */
export const SALA_TERMINAL_CODE_PREFIX = 'SALA-';

const LOGIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOGIN_CODE_LENGTH = 6;

export function salaRoomWorkCenterNote(roomId: string): string {
  return `${SALA_ROOM_WC_NOTE_PREFIX}${roomId}`;
}

/** Código legacy derivado del id de sala (no usar en nuevos terminales). */
export function salaTerminalCodeForRoom(roomId: string): string {
  const short = String(roomId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${SALA_TERMINAL_CODE_PREFIX}${short || 'ROOM'}`;
}

/** Código de activación TPV (6 caracteres, mismo formato que tablet PDV). */
export function generateSalaTerminalLoginCode(): string {
  let code = '';
  for (let i = 0; i < LOGIN_CODE_LENGTH; i += 1) {
    code += LOGIN_CODE_CHARS[Math.floor(Math.random() * LOGIN_CODE_CHARS.length)];
  }
  return code;
}

export function isLegacySalaTerminalCode(code: string): boolean {
  const raw = String(code || '').trim().toUpperCase();
  return raw.startsWith(SALA_TERMINAL_CODE_PREFIX) || raw.length > 12;
}

export function needsLegacyTerminalCodeMigration(terminal: Pick<TerminalConfig, 'code'>): boolean {
  const code = String(terminal.code || '').trim();
  if (!code) return true;
  return isLegacySalaTerminalCode(code);
}

export function isSalaManagedWorkCenter(wc: Pick<WorkCenter, 'notes'>): boolean {
  return String(wc.notes || '').includes(SALA_ROOM_WC_NOTE_PREFIX);
}

/** Quita la marca interna `sala_room:*` — el centro pasa a ser tienda real del restaurante. */
export function stripSalaRoomNoteFromWorkCenter(notes: string | undefined): string {
  const raw = String(notes || '');
  if (!raw.includes(SALA_ROOM_WC_NOTE_PREFIX)) return raw.trim();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.includes(SALA_ROOM_WC_NOTE_PREFIX))
    .join('\n')
    .trim();
}

export function isSalaManagedTerminal(terminal: TerminalConfig): boolean {
  if (String(terminal.salaRoomId || '').trim()) return true;
  const code = String(terminal.code || '').trim().toUpperCase();
  if (code.startsWith(SALA_TERMINAL_CODE_PREFIX)) return true;
  if (code === 'TABLET') return false;
  return /^[A-Z2-9]{6}$/.test(code);
}

export function findTerminalForRoom(
  pdv: Pick<PointOfSale, 'terminals'>,
  room: Pick<SalaRoom, 'id' | 'terminalId' | 'terminalCode'>,
): TerminalConfig | undefined {
  const terminals = Array.isArray(pdv.terminals) ? pdv.terminals : [];
  const tid = String(room.terminalId || '').trim();
  if (tid) {
    const byId = terminals.find((t) => t.id === tid);
    if (byId) return byId;
  }
  const roomId = String(room.id || '').trim();
  if (roomId) {
    const bySalaRoom = terminals.find(
      (t) => t.active !== false && String(t.salaRoomId || '').trim() === roomId,
    );
    if (bySalaRoom) return bySalaRoom;
  }
  const roomCode = String(room.terminalCode || '').trim().toUpperCase();
  if (roomCode) {
    const byCode = terminals.find(
      (t) => String(t.code || '').trim().toUpperCase() === roomCode,
    );
    if (byCode) return byCode;
  }
  const legacyCode = salaTerminalCodeForRoom(room.id);
  return terminals.find(
    (t) => String(t.code || '').trim().toUpperCase() === legacyCode,
  );
}

export function countSalaTerminals(pdv: Pick<PointOfSale, 'terminals'>): number {
  return (pdv.terminals || []).filter((t) => t.active !== false && isSalaManagedTerminal(t)).length;
}

export const MAX_SALA_TERMINALS_PER_PDV = 12;
