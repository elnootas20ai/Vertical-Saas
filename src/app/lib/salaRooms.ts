import type { DiningFloorConfig, DiningTable, DiningZone } from './salaApi';
import type {
  ExtendedDiningTable,
  RestaurantSummary,
  RoomStats,
  SalaRoom,
  SalaRoomType,
} from './salaStudioTypes';
import { SALA_ROOM_COLORS } from './salaStudioTypes';

export const DEFAULT_SALON_ROOM_ID = 'room_salon_principal';

export const DEFAULT_ROOM: Omit<SalaRoom, 'id'> = {
  name: 'Salón Principal',
  color: SALA_ROOM_COLORS[0],
  roomType: 'salon',
  sortOrder: 0,
};

export function createDefaultRooms(): SalaRoom[] {
  return [{ id: DEFAULT_SALON_ROOM_ID, ...DEFAULT_ROOM }];
}

export function createRoomId(): string {
  return `room_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeRooms(raw: unknown, fallbackName = 'Salón Principal'): SalaRoom[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return createDefaultRooms();
  }
  return raw
    .map((item, index) => {
      const row = item as Partial<SalaRoom>;
      return {
        id: String(row.id || createRoomId()),
        name: String(row.name || `Sala ${index + 1}`),
        color: String(row.color || SALA_ROOM_COLORS[index % SALA_ROOM_COLORS.length]),
        roomType: (row.roomType as SalaRoomType) || 'salon',
        sortOrder: Number(row.sortOrder ?? index),
        pdvId: row.pdvId ? String(row.pdvId) : undefined,
        workCenterId: row.workCenterId ? String(row.workCenterId) : undefined,
        terminalId: row.terminalId ? String(row.terminalId) : undefined,
        terminalLabel: row.terminalLabel ? String(row.terminalLabel).trim() : undefined,
        terminalCode: row.terminalCode ? String(row.terminalCode).trim().toUpperCase() : undefined,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function roomsFromFloorConfig(config: DiningFloorConfig | null): SalaRoom[] {
  const cfg = config as DiningFloorConfig & { rooms?: SalaRoom[] };
  if (Array.isArray(cfg?.rooms) && cfg.rooms.length > 0) {
    return normalizeRooms(cfg.rooms);
  }
  return normalizeRooms([]);
}

export function assignDefaultRoomIds(
  tables: ExtendedDiningTable[],
  rooms: SalaRoom[],
): ExtendedDiningTable[] {
  const defaultRoomId = rooms[0]?.id;
  if (!defaultRoomId) return tables;
  return tables.map((t) => ({
    ...t,
    roomId: t.roomId || defaultRoomId,
  }));
}

export function tablesForRoom(tables: ExtendedDiningTable[], roomId: string): ExtendedDiningTable[] {
  return tables.filter((t) => (t.roomId || '') === roomId);
}

export function nextTableNumber(tables: ExtendedDiningTable[]): number {
  if (tables.length === 0) return 1;
  return Math.max(...tables.map((t) => t.number || 0)) + 1;
}

export function computeRestaurantSummary(
  rooms: SalaRoom[],
  tables: ExtendedDiningTable[],
): RestaurantSummary {
  const visible = tables.filter((t) => t.status !== 'hidden' && t.visible !== false);
  const occupied = visible.filter((t) =>
    !['available', 'unavailable', 'hidden', 'reserved'].includes(t.status),
  );
  return {
    roomCount: rooms.length,
    tableCount: visible.length,
    capacity: visible.reduce((s, t) => s + (t.capacity || 0), 0),
    availableCount: visible.filter((t) => t.status === 'available').length,
    occupiedCount: occupied.length,
  };
}

export function computeRoomStats(tables: ExtendedDiningTable[], roomId: string): RoomStats {
  const roomTables = tablesForRoom(tables, roomId).filter((t) => t.status !== 'hidden');
  const occupied = roomTables.filter((t) =>
    !['available', 'unavailable', 'hidden', 'reserved'].includes(t.status),
  );
  return {
    tableCount: roomTables.length,
    capacity: roomTables.reduce((s, t) => s + (t.capacity || 0), 0),
    occupiedCount: occupied.length,
  };
}

export function duplicateRoom(
  room: SalaRoom,
  rooms: SalaRoom[],
  index: number,
): SalaRoom {
  const usedColors = new Set(rooms.map((r) => r.color));
  const color =
    SALA_ROOM_COLORS.find((c) => !usedColors.has(c)) ||
    SALA_ROOM_COLORS[rooms.length % SALA_ROOM_COLORS.length];
  return {
    ...room,
    id: createRoomId(),
    name: `${room.name} (copia)`,
    color,
    sortOrder: index + 1,
    pdvId: undefined,
    workCenterId: undefined,
    terminalCode: undefined,
  };
}

export function extendTable(raw: DiningTable): ExtendedDiningTable {
  const row = raw as ExtendedDiningTable;
  return {
    ...raw,
    roomId: row.roomId,
    shape: row.shape,
    rotation: row.rotation ?? 0,
    locked: row.locked ?? false,
    notes: row.notes ?? '',
    qrCode: row.qrCode ?? '',
    visible: row.visible !== false,
    sizePreset: (row.sizePreset as ExtendedDiningTable['sizePreset']) || undefined,
  };
}
