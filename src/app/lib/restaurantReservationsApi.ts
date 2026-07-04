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
  serializeHistory,
  timesOverlap,
  type ReservationFormData,
  type ReservationHistoryEntry,
  type RestaurantReservation,
  type ReservationStatus,
} from './restaurantReservationTypes';

const api = createVerticalApi<RestaurantReservation>('restaurant', 'reservations');

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
        if (r.tableId !== t._id) return false;
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
    if (r.tableId !== tableId) return false;
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

export async function createReservation(
  userId: string,
  form: ReservationFormData,
  actor: { userId: string; userName: string },
  tables: DiningTable[],
  existing: RestaurantReservation[],
): Promise<{ item: RestaurantReservation; tableAssigned: boolean }> {
  let tableId = form.tableId;
  let tableName = form.tableName;
  let tableNumber = form.tableNumber;
  let tableAssigned = false;

  const partySize = parseInt(form.partySize, 10) || 2;

  if (tableId) {
    const err = validateReservationTable(tables, existing, tableId, form.date, form.time);
    if (err) throw new Error(err);
  } else {
    const auto = findCompatibleTable(tables, existing, partySize, form.date, form.time, form.preferredZone);
    if (auto) {
      tableId = auto._id;
      tableName = auto.name;
      tableNumber = String(auto.number);
      tableAssigned = true;
    }
  }

  const history = serializeHistory([
    {
      action: 'Creación',
      userId: actor.userId,
      userName: actor.userName,
      at: new Date().toISOString(),
      details: tableAssigned ? `Mesa ${tableNumber} asignada automáticamente` : undefined,
    },
  ]);

  const item = await api.create(userId, {
    ...form,
    tableId,
    tableName,
    tableNumber,
    history,
    orderId: '',
  });

  if (tableId && ACTIVE_STATUSES.includes(form.status as ReservationStatus)) {
    await syncTableReserved(userId, tableId, form.guestName, true);
  }

  return { item, tableAssigned };
}

export async function updateReservation(
  userId: string,
  reservation: RestaurantReservation,
  form: Partial<ReservationFormData>,
  actor: { userId: string; userName: string },
  tables: DiningTable[],
  allReservations: RestaurantReservation[],
): Promise<RestaurantReservation> {
  const nextTableId = form.tableId !== undefined ? form.tableId : reservation.tableId;
  const nextDate = form.date ?? reservation.date;
  const nextTime = form.time ?? reservation.time;

  if (nextTableId) {
    const err = validateReservationTable(
      tables,
      allReservations,
      nextTableId,
      nextDate,
      nextTime,
      reservation._id,
    );
    if (err) throw new Error(err);
  }

  const oldTableId = reservation.tableId;
  const history = appendHistory(reservation, {
    action: 'Edición',
    userId: actor.userId,
    userName: actor.userName,
    details: form.tableId && form.tableId !== oldTableId ? 'Cambio de mesa' : undefined,
  });

  const item = await api.update(userId, reservation._id, { ...form, history });

  if (oldTableId && oldTableId !== nextTableId) {
    await syncTableReserved(userId, oldTableId, reservation.guestName, false);
  }
  if (nextTableId && nextTableId !== oldTableId) {
    await syncTableReserved(userId, nextTableId, item.guestName, true);
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
  if (item.tableId) {
    await syncTableReserved(userId, item.tableId, item.guestName, true);
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
  const item = await api.update(userId, reservation._id, { status: 'cancelled', history });
  if (item.tableId) {
    await syncTableReserved(userId, item.tableId, item.guestName, false);
  }
  return item;
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
  if (reservation.tableId && reservation.status !== 'seated') {
    await syncTableReserved(userId, reservation.tableId, reservation.guestName, false);
  }
  await api.remove(userId, reservation._id);
}

export async function duplicateReservation(
  userId: string,
  reservation: RestaurantReservation,
  actor: { userId: string; userName: string },
  tables: DiningTable[],
  allReservations: RestaurantReservation[],
): Promise<RestaurantReservation> {
  const { item } = await createReservation(
    userId,
    {
      guestName: reservation.guestName,
      phone: reservation.phone,
      email: reservation.email,
      date: reservation.date,
      time: reservation.time,
      partySize: reservation.partySize,
      preferredZone: reservation.preferredZone,
      tableId: '',
      tableName: '',
      tableNumber: '',
      notes: reservation.notes,
      status: 'pending',
    },
    actor,
    tables,
    allReservations,
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
  const err = validateReservationTable(
    tables,
    allReservations,
    table._id,
    reservation.date,
    reservation.time,
    reservation._id,
  );
  if (err) throw new Error(err);

  const oldTableId = reservation.tableId;
  const history = appendHistory(reservation, {
    action: 'Asignación de mesa',
    userId: actor.userId,
    userName: actor.userName,
    details: `Mesa ${table.number}`,
  });

  const item = await api.update(userId, reservation._id, {
    tableId: table._id,
    tableName: table.name,
    tableNumber: String(table.number),
    history,
  });

  if (oldTableId && oldTableId !== table._id) {
    await syncTableReserved(userId, oldTableId, reservation.guestName, false);
  }
  await syncTableReserved(userId, table._id, item.guestName, true);
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
  if (!reservation.tableId) {
    throw new Error('Asigna una mesa antes de sentar al cliente');
  }

  const tables = await listDiningTablesRequest(userId);
  const table = tables.find((t) => t._id === reservation.tableId);
  if (!table) throw new Error('Mesa no encontrada');
  if (isTableOccupied(table) && table.status !== 'reserved') {
    throw new Error('La mesa está ocupada');
  }

  const partySize = parseInt(reservation.partySize, 10) || 2;

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

  await changeTableStatusRequest(userId, table._id, 'occupied', {
    currentGuests: partySize,
    occupiedBy: reservation.guestName,
  });

  const history = appendHistory(reservation, {
    action: 'Cliente sentado',
    userId: actor.userId,
    userName: actor.userName,
    details: `Mesa ${table.number} · TPV abierto`,
  });

  const updated = await api.update(userId, reservation._id, {
    status: 'seated',
    history,
    orderId: order._id,
  });

  return { reservation: updated, orderId: order._id, tableId: table._id };
}

export function getUpcomingReservationsForTable(
  reservations: RestaurantReservation[],
  tableId: string,
  date?: string,
): RestaurantReservation[] {
  const today = date || new Date().toISOString().slice(0, 10);
  return reservations
    .filter((r) => r.tableId === tableId)
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
