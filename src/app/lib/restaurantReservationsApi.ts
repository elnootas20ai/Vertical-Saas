import { createVerticalApi } from './verticalApiFactory';
import {
  changeTableStatusRequest,
  createDiningOrderRequest,
  listDiningTablesRequest,
  type DiningTable,
} from './salaApi';
import {
  ACTIVE_STATUSES,
  parseHistory,
  reservationDateTime,
  reservationTableIds,
  serializeHistory,
  timesOverlap,
  type ReservationFormData,
  type ReservationHistoryEntry,
  type RestaurantReservation,
  type ReservationStatus,
} from './restaurantReservationTypes';
import { ensureReservationCrmClient } from './restaurantReservationClientSync';
import { diningTableDisplayName } from './restaurantTableSelectUi';

const api = createVerticalApi<RestaurantReservation>('restaurant', 'reservations');

type ReservationClientScope = {
  businessId?: string;
  searchBusinessId?: string;
};

export function listReservations(userId: string) {
  return api.list(userId);
}

function appendHistory(
  reservation: RestaurantReservation,
  entry: Omit<ReservationHistoryEntry, 'at'> & { at?: string },
): string {
  const history = parseHistory(reservation.history);
  history.unshift({
    ...entry,
    at: entry.at || new Date().toISOString(),
  });
  return serializeHistory(history);
}

function isTableOccupied(table: DiningTable): boolean {
  return !['available', 'reserved'].includes(table.status);
}

function resolveTablesSelection(
  tables: DiningTable[],
  ids: string[],
): { tableId: string; tableName: string; tableNumber: string; tableIds: string[] } {
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  const selected = unique
    .map((id) => tables.find((t) => t._id === id))
    .filter((t): t is DiningTable => Boolean(t));
  if (selected.length === 0) {
    return { tableId: '', tableName: '', tableNumber: '', tableIds: [] };
  }
  return {
    tableId: selected[0]._id,
    tableName: selected.map((t) => diningTableDisplayName(t)).join(' + '),
    tableNumber: selected.map((t) => String(t.number)).join('+'),
    tableIds: selected.map((t) => t._id),
  };
}

function reservationUsesTable(
  reservation: Pick<RestaurantReservation, 'tableId' | 'tableIds'>,
  tableId: string,
): boolean {
  const tid = String(tableId || '').trim();
  if (!tid) return false;
  return reservationTableIds(reservation).includes(tid);
}

export function findCompatibleTable(
  tables: DiningTable[],
  reservations: RestaurantReservation[],
  partySize: number,
  date: string,
  time: string,
  preferredZone?: string,
  excludeReservationId?: string,
): DiningTable | null {
  const candidates = tables
    .filter((t) => t.active && t.status !== 'hidden' && t.status !== 'unavailable')
    .filter((t) => t.capacity >= partySize)
    .filter((t) => !isTableOccupied(t) || t.status === 'reserved')
    .filter((t) => {
      const overlaps = reservations.some((r) => {
        if (r._id === excludeReservationId) return false;
        if (!ACTIVE_STATUSES.includes(r.status as ReservationStatus) && r.status !== 'confirmed') return false;
        if (r.status === 'cancelled' || r.status === 'finished' || r.status === 'no_show' || r.status === 'seated') return false;
        if (!reservationUsesTable(r, t._id)) return false;
        return timesOverlap(r.date, r.time, date, time);
      });
      return !overlaps;
    })
    .sort((a, b) => {
      const zoneMatch = (table: DiningTable) =>
        preferredZone && table.zone.toLowerCase().includes(preferredZone.toLowerCase()) ? 0 : 1;
      const diff = zoneMatch(a) - zoneMatch(b);
      if (diff !== 0) return diff;
      return a.capacity - b.capacity;
    });

  return candidates[0] || null;
}

export function validateReservationTable(
  tables: DiningTable[],
  reservations: RestaurantReservation[],
  tableId: string,
  date: string,
  time: string,
  excludeReservationId?: string,
): string | null {
  const table = tables.find((t) => t._id === tableId);
  if (!table) return 'Mesa no encontrada';
  if (isTableOccupied(table) && table.status !== 'reserved') return 'La mesa está ocupada';
  if (table.status === 'unavailable') return 'La mesa no está disponible';

  const overlap = reservations.find((r) => {
    if (r._id === excludeReservationId) return false;
    if (!reservationUsesTable(r, tableId)) return false;
    if (['cancelled', 'finished', 'no_show', 'seated'].includes(r.status)) return false;
    return timesOverlap(r.date, r.time, date, time);
  });
  if (overlap) return `Solapamiento con reserva de ${overlap.guestName} a las ${overlap.time}`;

  return null;
}

async function syncTableReserved(
  userId: string,
  tableId: string,
  guestName: string,
  reserved: boolean,
) {
  if (!tableId) return;
  try {
    await changeTableStatusRequest(
      userId,
      tableId,
      reserved ? 'reserved' : 'available',
      reserved ? { occupiedBy: guestName } : undefined,
    );
  } catch {
    // Non-blocking: reservation saved even if sala sync fails
  }
}

async function syncTablesReserved(
  userId: string,
  tableIds: string[],
  guestName: string,
  reserved: boolean,
) {
  for (const id of tableIds) {
    await syncTableReserved(userId, id, guestName, reserved);
  }
}

export async function createReservation(
  userId: string,
  form: ReservationFormData,
  actor: { userId: string; userName: string },
  tables: DiningTable[],
  existing: RestaurantReservation[],
  clientScope: ReservationClientScope = {},
): Promise<{ item: RestaurantReservation; tableAssigned: boolean; clientLinked: boolean }> {
  let selection = resolveTablesSelection(tables, reservationTableIds(form));
  let tableAssigned = false;

  const partySize = parseInt(form.partySize, 10) || 2;

  if (selection.tableIds.length > 0) {
    for (const id of selection.tableIds) {
      const err = validateReservationTable(tables, existing, id, form.date, form.time);
      if (err) throw new Error(err);
    }
  } else {
    const auto = findCompatibleTable(tables, existing, partySize, form.date, form.time, form.preferredZone);
    if (auto) {
      selection = resolveTablesSelection(tables, [auto._id]);
      tableAssigned = true;
    }
  }

  const history = serializeHistory([
    {
      action: 'Creación',
      userId: actor.userId,
      userName: actor.userName,
      at: new Date().toISOString(),
      details: tableAssigned
        ? `${selection.tableName || `Mesa ${selection.tableNumber}`} asignada automáticamente`
        : selection.tableIds.length > 1
          ? `Mesas: ${selection.tableName}`
          : undefined,
    },
  ]);

  const clientId = await ensureReservationCrmClient({
    userId,
    businessId: clientScope.businessId,
    searchBusinessId: clientScope.searchBusinessId,
    guestName: form.guestName,
    phone: form.phone,
    email: form.email,
    clientId: form.clientId,
    actorName: actor.userName,
  }).catch(() => '');

  const item = await api.create(userId, {
    ...form,
    clientId,
    tableId: selection.tableId,
    tableName: selection.tableName,
    tableNumber: selection.tableNumber,
    tableIds: selection.tableIds,
    history,
    orderId: '',
  });

  if (selection.tableIds.length && ACTIVE_STATUSES.includes(form.status as ReservationStatus)) {
    await syncTablesReserved(userId, selection.tableIds, form.guestName, true);
  }

  return { item, tableAssigned, clientLinked: Boolean(clientId) };
}

export async function updateReservation(
  userId: string,
  reservation: RestaurantReservation,
  form: Partial<ReservationFormData>,
  actor: { userId: string; userName: string },
  tables: DiningTable[],
  allReservations: RestaurantReservation[],
  clientScope: ReservationClientScope = {},
): Promise<RestaurantReservation> {
  const mergedForIds = { ...reservation, ...form };
  const nextIds =
    form.tableIds !== undefined || form.tableId !== undefined
      ? reservationTableIds(mergedForIds)
      : reservationTableIds(reservation);
  const nextDate = form.date ?? reservation.date;
  const nextTime = form.time ?? reservation.time;
  const selection = resolveTablesSelection(tables, nextIds);

  for (const id of selection.tableIds) {
    const err = validateReservationTable(
      tables,
      allReservations,
      id,
      nextDate,
      nextTime,
      reservation._id,
    );
    if (err) throw new Error(err);
  }

  const oldIds = reservationTableIds(reservation);
  const history = appendHistory(reservation, {
    action: 'Edición',
    userId: actor.userId,
    userName: actor.userName,
    details:
      selection.tableId && selection.tableId !== reservation.tableId
        ? `Cambio de mesa → ${selection.tableName}`
        : undefined,
  });

  const mergedForm = { ...reservation, ...form };
  const clientId = await ensureReservationCrmClient({
    userId,
    businessId: clientScope.businessId,
    searchBusinessId: clientScope.searchBusinessId,
    guestName: mergedForm.guestName,
    phone: mergedForm.phone,
    email: mergedForm.email,
    clientId: mergedForm.clientId || reservation.clientId,
    actorName: actor.userName,
  }).catch(() => reservation.clientId || '');

  const item = await api.update(userId, reservation._id, {
    ...form,
    clientId,
    history,
    ...(form.tableIds !== undefined || form.tableId !== undefined
      ? {
          tableId: selection.tableId,
          tableName: selection.tableName,
          tableNumber: selection.tableNumber,
          tableIds: selection.tableIds,
        }
      : {}),
  });

  const nextSet = new Set(selection.tableIds);
  const oldSet = new Set(oldIds);
  for (const id of oldIds) {
    if (!nextSet.has(id)) await syncTableReserved(userId, id, reservation.guestName, false);
  }
  for (const id of selection.tableIds) {
    if (!oldSet.has(id)) await syncTableReserved(userId, id, item.guestName, true);
  }

  return item;
}

export async function confirmReservation(
  userId: string,
  reservation: RestaurantReservation,
  actor: { userId: string; userName: string },
): Promise<RestaurantReservation> {
  const history = appendHistory(reservation, {
    action: 'Confirmación',
    userId: actor.userId,
    userName: actor.userName,
  });
  const item = await api.update(userId, reservation._id, { status: 'confirmed', history });
  const ids = reservationTableIds(item);
  if (ids.length) {
    await syncTablesReserved(userId, ids, item.guestName, true);
  }
  return item;
}

export async function cancelReservation(
  userId: string,
  reservation: RestaurantReservation,
  actor: { userId: string; userName: string },
): Promise<RestaurantReservation> {
  const history = appendHistory(reservation, {
    action: 'Cancelación',
    userId: actor.userId,
    userName: actor.userName,
  });
  const ids = reservationTableIds(reservation);
  const item = await api.update(userId, reservation._id, { status: 'cancelled', history });
  if (ids.length) {
    await syncTablesReserved(userId, ids, item.guestName, false);
  }
  return item;
}

/** Cancela reservas activas de una mesa y la deja libre (Sala / TPV «Cancelar reserva»). */
export async function cancelActiveReservationsForTable(
  userId: string,
  tableId: string,
  actor: { userId: string; userName: string },
): Promise<{ cancelled: number }> {
  const tid = String(tableId || '').trim();
  if (!tid) return { cancelled: 0 };
  const all = await listReservations(userId);
  const active = all.filter(
    (r) =>
      reservationUsesTable(r, tid)
      && !['cancelled', 'finished', 'no_show', 'seated'].includes(String(r.status || '')),
  );
  for (const r of active) {
    await cancelReservation(userId, r, actor);
  }
  if (active.length === 0) {
    await syncTableReserved(userId, tid, '', false);
  }
  return { cancelled: active.length };
}

export async function finalizeReservation(
  userId: string,
  reservation: RestaurantReservation,
  actor: { userId: string; userName: string },
): Promise<RestaurantReservation> {
  const history = appendHistory(reservation, {
    action: 'Finalización',
    userId: actor.userId,
    userName: actor.userName,
  });
  return api.update(userId, reservation._id, { status: 'finished', history });
}

export async function deleteReservation(
  userId: string,
  reservation: RestaurantReservation,
): Promise<void> {
  if (reservation.status !== 'seated') {
    await syncTablesReserved(
      userId,
      reservationTableIds(reservation),
      reservation.guestName,
      false,
    );
  }
  await api.remove(userId, reservation._id);
}

export async function duplicateReservation(
  userId: string,
  reservation: RestaurantReservation,
  actor: { userId: string; userName: string },
  tables: DiningTable[],
  allReservations: RestaurantReservation[],
  clientScope: ReservationClientScope = {},
): Promise<RestaurantReservation> {
  const { item } = await createReservation(
    userId,
    {
      guestName: reservation.guestName,
      phone: reservation.phone,
      email: reservation.email,
      clientId: reservation.clientId || '',
      date: reservation.date,
      time: reservation.time,
      partySize: reservation.partySize,
      preferredZone: reservation.preferredZone,
      tableId: '',
      tableName: '',
      tableNumber: '',
      tableIds: [],
      notes: reservation.notes,
      status: 'pending',
    },
    actor,
    tables,
    allReservations,
    clientScope,
  );
  return item;
}

export async function assignTable(
  userId: string,
  reservation: RestaurantReservation,
  table: DiningTable,
  actor: { userId: string; userName: string },
  tables: DiningTable[],
  allReservations: RestaurantReservation[],
): Promise<RestaurantReservation> {
  return assignTables(userId, reservation, [table._id], actor, tables, allReservations);
}

/** Asigna una o varias mesas que cubren el aforo. */
export async function assignTables(
  userId: string,
  reservation: RestaurantReservation,
  tableIds: string[],
  actor: { userId: string; userName: string },
  tables: DiningTable[],
  allReservations: RestaurantReservation[],
): Promise<RestaurantReservation> {
  const selection = resolveTablesSelection(tables, tableIds);
  if (selection.tableIds.length === 0) {
    throw new Error('Elige al menos una mesa');
  }
  for (const id of selection.tableIds) {
    const err = validateReservationTable(
      tables,
      allReservations,
      id,
      reservation.date,
      reservation.time,
      reservation._id,
    );
    if (err) throw new Error(err);
  }

  const oldIds = reservationTableIds(reservation);
  const history = appendHistory(reservation, {
    action: 'Asignación de mesa',
    userId: actor.userId,
    userName: actor.userName,
    details: selection.tableName,
  });

  const item = await api.update(userId, reservation._id, {
    tableId: selection.tableId,
    tableName: selection.tableName,
    tableNumber: selection.tableNumber,
    tableIds: selection.tableIds,
    history,
  });

  const nextSet = new Set(selection.tableIds);
  const oldSet = new Set(oldIds);
  for (const id of oldIds) {
    if (!nextSet.has(id)) await syncTableReserved(userId, id, reservation.guestName, false);
  }
  for (const id of selection.tableIds) {
    if (!oldSet.has(id)) await syncTableReserved(userId, id, item.guestName, true);
  }
  return item;
}

export interface SeatGuestResult {
  reservation: RestaurantReservation;
  orderId: string;
  tableId: string;
}

export async function seatGuest(
  userId: string,
  reservation: RestaurantReservation,
  actor: { userId: string; userName: string },
  businessId: string,
): Promise<SeatGuestResult> {
  const seatIds = reservationTableIds(reservation);
  const primaryId = String(reservation.tableId || seatIds[0] || '').trim();
  if (!primaryId) {
    throw new Error('Asigna una mesa antes de sentar al cliente');
  }

  const tables = await listDiningTablesRequest(userId);
  const table = tables.find((t) => t._id === primaryId);
  if (!table) throw new Error('Mesa no encontrada');
  if (isTableOccupied(table) && table.status !== 'reserved') {
    throw new Error('La mesa está ocupada');
  }

  const partySize = parseInt(reservation.partySize, 10) || 2;
  const placeLabel =
    String(reservation.tableName || '').trim()
    || (seatIds.length > 1
      ? seatIds
          .map((id) => tables.find((t) => t._id === id))
          .filter((t): t is DiningTable => Boolean(t))
          .map((t) => diningTableDisplayName(t))
          .join(' + ')
      : diningTableDisplayName(table));

  const order = await createDiningOrderRequest(userId, {
    tableId: table._id,
    tableNumber: table.number,
    tableName: table.name,
    zone: table.zone,
    guests: partySize,
    businessId,
    createdBy: actor.userId,
    createdByName: actor.userName,
    clientName: reservation.guestName,
    notes: reservation.notes,
  });

  // Ocupar todas las mesas/taburetes de la reserva (aforo repartido).
  for (const id of seatIds.length ? seatIds : [primaryId]) {
    const guestsOnTable = id === primaryId ? partySize : 0;
    await changeTableStatusRequest(userId, id, 'occupied', {
      currentGuests: guestsOnTable,
      occupiedBy: reservation.guestName,
    }).catch(() => undefined);
  }

  const history = appendHistory(reservation, {
    action: 'Cliente sentado',
    userId: actor.userId,
    userName: actor.userName,
    details: `${placeLabel} · TPV abierto`,
  });

  const updated = await api.update(userId, reservation._id, {
    status: 'seated',
    history,
    orderId: order._id,
    tableId: primaryId,
    tableName: placeLabel,
  });

  return { reservation: updated, orderId: order._id, tableId: primaryId };
}

export function getUpcomingReservationsForTable(
  reservations: RestaurantReservation[],
  tableId: string,
  date?: string,
): RestaurantReservation[] {
  const today = date || new Date().toISOString().slice(0, 10);
  return reservations
    .filter((r) => reservationUsesTable(r, tableId))
    .filter((r) => ACTIVE_STATUSES.includes(r.status as ReservationStatus) || r.status === 'confirmed')
    .filter((r) => r.date >= today)
    .sort((a, b) => {
      const da = reservationDateTime(a.date, a.time).getTime();
      const db = reservationDateTime(b.date, b.time).getTime();
      return da - db;
    });
}

export function applyAutomationRules(
  reservations: RestaurantReservation[],
  settings: { delayAfterMinutes: number; noShowAfterMinutes: number; enabled: boolean },
): RestaurantReservation[] {
  if (!settings.enabled) return reservations;
  const now = Date.now();
  return reservations.map((r) => {
    if (!['pending', 'confirmed', 'delayed'].includes(r.status)) return r;
    const start = reservationDateTime(r.date, r.time).getTime();
    const minutesLate = (now - start) / 60_000;
    if (minutesLate >= settings.noShowAfterMinutes) {
      return { ...r, status: 'no_show' as ReservationStatus };
    }
    if (minutesLate >= settings.delayAfterMinutes) {
      return { ...r, status: 'delayed' as ReservationStatus };
    }
    return r;
  });
}

export { api as reservationsCrudApi };
