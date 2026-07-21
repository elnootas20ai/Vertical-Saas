/**
 * Edición incremental de sala en servicio (zonas + mesas) sin wipe.
 * Pensado para operativa de bar/restaurante: Salón, Terraza, Barra, VIP…
 */

import {
  bulkCreateDiningTablesRequest,
  deleteDiningTableRequest,
  getFloorConfigRequest,
  saveFloorConfigRequest,
  updateDiningTableRequest,
  type DiningFloorConfig,
  type DiningTable,
} from '../../lib/salaApi';
import { createRoomId, nextTableNumber } from '../../lib/salaRooms';
import { ensureRoomTpvDetailed, type EnsureRoomTpvOptions } from '../../lib/salaRoomPdv';
import { applyTableSizePreset } from '../../lib/salaTableSize';
import {
  SALA_ROOM_COLORS,
  type SalaRoom,
  type SalaRoomType,
} from '../../lib/salaStudioTypes';
import { RESTAURANT_SALA_SETUP_VERSION } from './applyRestaurantSalaQuickSetup';

function isOccupiedLike(status: string): boolean {
  return (
    status === 'occupied'
    || status === 'pending_order'
    || status === 'served'
    || status === 'pending_payment'
  );
}

function presetForCapacity(capacity: number) {
  if (capacity <= 2) return 'bar' as const;
  if (capacity <= 4) return 'medium' as const;
  return 'large' as const;
}

/** Nombre operativo: en barra → "Barra N"; resto → "Mesa N". */
export function tableLabelForRoom(roomType: SalaRoomType, number: number): string {
  if (roomType === 'barra') return `Barra ${number}`;
  return `Mesa ${number}`;
}

/** Capacidad por defecto según tipo de zona (uso típico en un bar). */
export function defaultCapacityForRoomType(roomType: SalaRoomType): number {
  switch (roomType) {
    case 'barra':
      return 2;
    case 'vip':
    case 'privado':
      return 6;
    default:
      return 4;
  }
}

/** Nº de mesas sugerido al crear una zona nueva. */
export function defaultTableCountForRoomType(roomType: SalaRoomType): number {
  switch (roomType) {
    case 'barra':
      return 6;
    case 'terraza':
    case 'patio':
      return 6;
    case 'vip':
    case 'privado':
      return 2;
    default:
      return 4;
  }
}

function buildTablePayload(
  number: number,
  capacity: number,
  room: Pick<SalaRoom, 'id' | 'name' | 'roomType'>,
  businessId: string,
  indexInRoom: number,
): Partial<DiningTable> {
  const cap = Math.max(1, Math.round(Number(capacity)) || 4);
  const preset = presetForCapacity(cap);
  const dims = applyTableSizePreset(preset);
  const cols = 4;
  const gapX = 140;
  const gapY = 120;
  const col = indexInRoom % cols;
  const row = Math.floor(indexInRoom / cols);
  return {
    number,
    name: tableLabelForRoom(room.roomType, number),
    capacity: cap,
    roomId: room.id,
    zone: room.name,
    gridW: dims.gridW,
    gridH: dims.gridH,
    sizePreset: preset,
    shape: cap <= 2 ? 'high' : 'square',
    x: 80 + col * gapX,
    y: 80 + row * gapY,
    status: 'available',
    currentGuests: 0,
    occupiedAt: '',
    occupiedBy: '',
    businessId,
    notes: '',
    qrCode: '',
    visible: true,
    sortOrder: number,
  } as Partial<DiningTable>;
}

async function persistRooms(
  userId: string,
  businessId: string,
  rooms: SalaRoom[],
  floorConfig: DiningFloorConfig | null,
): Promise<DiningFloorConfig> {
  return saveFloorConfigRequest(userId, {
    ...(floorConfig || {}),
    businessId,
    rooms,
    zones: floorConfig?.zones || [],
    layoutDecor: floorConfig?.layoutDecor || [],
    salaSetupVersion: RESTAURANT_SALA_SETUP_VERSION,
    salaQuickSetupComplete: true,
  });
}

export type AddZoneParams = {
  userId: string;
  businessId: string;
  rooms: SalaRoom[];
  tables: DiningTable[];
  name: string;
  roomType: SalaRoomType;
  tableCount: number;
  defaultCapacity: number;
  tpvOptions?: EnsureRoomTpvOptions;
};

export async function addZoneWithTables(params: AddZoneParams): Promise<{
  rooms: SalaRoom[];
  tables: DiningTable[];
  room: SalaRoom;
}> {
  const {
    userId,
    businessId,
    rooms,
    tables,
    name,
    roomType,
    tableCount,
    defaultCapacity,
    tpvOptions,
  } = params;

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Pon un nombre a la zona');
  const count = Math.max(0, Math.min(40, Math.round(Number(tableCount) || 0)));
  const capacity = Math.max(1, Math.min(20, Math.round(Number(defaultCapacity) || 4)));

  let room: SalaRoom = {
    id: createRoomId(),
    name: trimmed,
    roomType,
    color: SALA_ROOM_COLORS[rooms.length % SALA_ROOM_COLORS.length],
    sortOrder: rooms.length,
  };

  const linked = await ensureRoomTpvDetailed(userId, businessId, room, tpvOptions);
  room = linked.room;

  const floorConfig = await getFloorConfigRequest(userId, { businessId }).catch(() => null);
  const nextRooms = [...rooms, room];
  await persistRooms(userId, businessId, nextRooms, floorConfig);

  let created: DiningTable[] = [];
  if (count > 0) {
    let num = nextTableNumber(tables as Parameters<typeof nextTableNumber>[0]);
    const payloads = Array.from({ length: count }, (_, i) =>
      buildTablePayload(num + i, capacity, room, businessId, i),
    );
    created = await bulkCreateDiningTablesRequest(userId, payloads);
  }

  return {
    rooms: nextRooms,
    tables: [...tables, ...created],
    room,
  };
}

export type AddTablesParams = {
  userId: string;
  businessId: string;
  room: SalaRoom;
  tables: DiningTable[];
  count: number;
  capacity: number;
};

export async function addTablesToZone(params: AddTablesParams): Promise<DiningTable[]> {
  const { userId, businessId, room, tables, count, capacity } = params;
  const n = Math.max(1, Math.min(40, Math.round(Number(count) || 1)));
  const cap = Math.max(1, Math.min(20, Math.round(Number(capacity) || 4)));

  const roomTables = tables.filter((t) => {
    if (t.active === false || t.status === 'hidden') return false;
    const roomId = String(t.roomId || '').trim();
    if (roomId) return roomId === room.id;
    return String(t.zone || '').trim() === room.name;
  });

  let num = nextTableNumber(tables as Parameters<typeof nextTableNumber>[0]);
  const payloads = Array.from({ length: n }, (_, i) =>
    buildTablePayload(num + i, cap, room, businessId, roomTables.length + i),
  );
  const created = await bulkCreateDiningTablesRequest(userId, payloads);
  return [...tables, ...created];
}

export async function removeFreeTable(params: {
  userId: string;
  tables: DiningTable[];
  tableId: string;
}): Promise<DiningTable[]> {
  const { userId, tables, tableId } = params;
  const table = tables.find((t) => String(t._id || t.id) === tableId);
  if (!table) throw new Error('Mesa no encontrada');
  if (isOccupiedLike(table.status) || table.status === 'reserved') {
    throw new Error('Solo puedes quitar mesas libres o por limpiar');
  }
  const id = String(table._id || '').trim();
  if (id && !id.startsWith('temp_')) {
    await deleteDiningTableRequest(userId, id);
  }
  return tables.filter((t) => String(t._id || t.id) !== tableId);
}

export async function updateTablePeople(params: {
  userId: string;
  tables: DiningTable[];
  tableId: string;
  capacity?: number;
  currentGuests?: number;
}): Promise<DiningTable[]> {
  const { userId, tables, tableId, capacity, currentGuests } = params;
  const table = tables.find((t) => String(t._id || t.id) === tableId);
  if (!table) throw new Error('Mesa no encontrada');
  const id = String(table._id || table.id || '').trim();
  if (!id) throw new Error('Mesa no encontrada');

  const patch: Partial<DiningTable> = {};
  if (capacity !== undefined) {
    const cap = Math.max(1, Math.min(40, Math.round(Number(capacity) || 1)));
    patch.capacity = cap;
    const preset = presetForCapacity(cap);
    const dims = applyTableSizePreset(preset);
    patch.sizePreset = preset;
    patch.gridW = dims.gridW;
    patch.gridH = dims.gridH;
    patch.shape = cap <= 2 ? 'high' : 'square';
  }
  if (currentGuests !== undefined) {
    const guests = Math.max(0, Math.min(40, Math.round(Number(currentGuests) || 0)));
    patch.currentGuests = guests;
  }

  const updated = await updateDiningTableRequest(userId, id, patch);
  return tables.map((t) => (String(t._id || t.id) === tableId ? { ...t, ...updated } : t));
}

export async function removeZoneIfIdle(params: {
  userId: string;
  businessId: string;
  rooms: SalaRoom[];
  tables: DiningTable[];
  roomId: string;
}): Promise<{ rooms: SalaRoom[]; tables: DiningTable[] }> {
  const { userId, businessId, rooms, tables, roomId } = params;
  if (rooms.length <= 1) {
    throw new Error('Debe quedar al menos una zona');
  }
  const room = rooms.find((r) => r.id === roomId);
  if (!room) throw new Error('Zona no encontrada');

  const roomTables = tables.filter((t) => {
    const rid = String(t.roomId || '').trim();
    if (rid) return rid === roomId;
    return String(t.zone || '').trim() === room.name;
  });

  const busy = roomTables.some(
    (t) => isOccupiedLike(t.status) || t.status === 'reserved',
  );
  if (busy) {
    throw new Error('Hay mesas ocupadas o reservadas en esta zona');
  }

  for (const t of roomTables) {
    const id = String(t._id || '').trim();
    if (id && !id.startsWith('temp_')) {
      await deleteDiningTableRequest(userId, id).catch(() => undefined);
    }
  }

  const nextRooms = rooms.filter((r) => r.id !== roomId);
  const nextTables = tables.filter((t) => {
    const rid = String(t.roomId || '').trim();
    if (rid) return rid !== roomId;
    return String(t.zone || '').trim() !== room.name;
  });

  const floorConfig = await getFloorConfigRequest(userId, { businessId }).catch(() => null);
  await persistRooms(userId, businessId, nextRooms, floorConfig);

  return { rooms: nextRooms, tables: nextTables };
}
