/**
 * Persistencia del asistente de sala (nuevo núcleo restaurant).
 * Usa API sala para datos; no monta la UI legacy SalaManager.
 */

import {
  bulkCreateDiningTablesRequest,
  deleteDiningTableRequest,
  getFloorConfigRequest,
  listDiningTablesRequest,
  saveFloorConfigRequest,
  type DiningTable,
} from '../../lib/salaApi';
import { createRoomId } from '../../lib/salaRooms';
import { ensureRoomTpvDetailed } from '../../lib/salaRoomPdv';
import type { SalaQuickSetupRoomDraft } from '../../lib/salaQuickSetup';
import { SALA_ROOM_COLORS, type SalaRoom } from '../../lib/salaStudioTypes';
import { applyTableSizePreset } from '../../lib/salaTableSize';
import type { PointOfSale } from '../../lib/deliveryApi';
import type { WorkCenter } from '../../lib/workCentersApi';
import type { RestaurantBusinessRef } from './retailScope';

export const RESTAURANT_SALA_SETUP_VERSION = 3;

function tablePayload(
  number: number,
  capacity: number,
  roomId: string,
  roomName: string,
  businessId: string,
  indexInRoom: number,
) {
  const preset = capacity <= 2 ? 'bar' : capacity <= 4 ? 'medium' : 'large';
  const dims = applyTableSizePreset(preset);
  // Grid inicial para el plano visual (evita migrar el esquema después).
  const cols = 4;
  const gapX = 140;
  const gapY = 120;
  const originX = 80;
  const originY = 80;
  const col = indexInRoom % cols;
  const row = Math.floor(indexInRoom / cols);
  return {
    number,
    name: `Mesa ${number}`,
    // Capacidad de comensales ≠ tamaño visual del plano (gridW×gridH).
    capacity: Math.max(1, Math.round(Number(capacity)) || 4),
    roomId,
    zone: roomName,
    gridW: dims.gridW,
    gridH: dims.gridH,
    sizePreset: preset as typeof preset,
    shape: capacity <= 2 ? ('high' as const) : ('square' as const),
    x: originX + col * gapX,
    y: originY + row * gapY,
    /** Libre: sin servicio en curso (no rojo/ámbar). */
    status: 'available' as const,
    currentGuests: 0,
    occupiedAt: '',
    occupiedBy: '',
    businessId,
    notes: '',
    qrCode: '',
    visible: true,
    sortOrder: number,
  };
}

export type ApplyRestaurantSalaQuickSetupParams = {
  userId: string;
  businessId: string;
  parentPdvId: string;
  drafts: SalaQuickSetupRoomDraft[];
  business?: RestaurantBusinessRef | null;
  businesses?: RestaurantBusinessRef[];
  workCenters?: WorkCenter[];
  pointsOfSale?: PointOfSale[];
};

export async function applyRestaurantSalaQuickSetup(
  params: ApplyRestaurantSalaQuickSetupParams,
): Promise<{ rooms: SalaRoom[]; tables: DiningTable[]; tableCount: number }> {
  const {
    userId,
    businessId,
    parentPdvId,
    drafts,
    business = null,
    businesses = [],
    workCenters = [],
    pointsOfSale = [],
  } = params;

  if (!userId || drafts.length === 0) {
    throw new Error('Faltan datos para configurar la sala');
  }

  const existingTables = await listDiningTablesRequest(userId).catch(() => []);
  for (const t of existingTables) {
    const id = String(t._id || '').trim();
    if (id && !id.startsWith('temp_')) {
      await deleteDiningTableRequest(userId, id).catch(() => undefined);
    }
  }

  const floorConfig = await getFloorConfigRequest(userId).catch(() => null);
  const tpvOptions = {
    parentPdvId: String(parentPdvId || '').trim() || undefined,
    business,
    businesses,
    workCenters,
    pointsOfSale,
  };

  const newRooms: SalaRoom[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    let room: SalaRoom = {
      id: createRoomId(),
      name: d.name,
      roomType: d.roomType,
      color: SALA_ROOM_COLORS[i % SALA_ROOM_COLORS.length],
      sortOrder: i,
    };
    const result = await ensureRoomTpvDetailed(userId, businessId, room, tpvOptions);
    room = result.room;
    newRooms.push(room);
  }

  let num = 1;
  const tablePayloads = [];
  for (let i = 0; i < newRooms.length; i++) {
    const room = newRooms[i];
    const d = drafts[i];
    for (let j = 0; j < d.tableCount; j++) {
      const perTable =
        Array.isArray(d.capacities) && d.capacities[j] != null
          ? Number(d.capacities[j])
          : d.defaultCapacity;
      tablePayloads.push(
        tablePayload(num, perTable, room.id, room.name, businessId, j),
      );
      num += 1;
    }
  }

  const created = await bulkCreateDiningTablesRequest(userId, tablePayloads);
  await saveFloorConfigRequest(userId, {
    ...(floorConfig || {}),
    businessId,
    rooms: newRooms,
    zones: [],
    layoutDecor: [],
    salaSetupVersion: RESTAURANT_SALA_SETUP_VERSION,
    salaQuickSetupComplete: true,
  });

  return {
    rooms: newRooms,
    tables: created,
    tableCount: created.length,
  };
}
