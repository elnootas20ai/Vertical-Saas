import {
  deletePointOfSaleRequest,
  listPointsOfSaleRequest,
  updatePointOfSaleRequest,
  type PointOfSale,
  type TerminalConfig,
} from './deliveryApi';
import { filterPointsOfSaleForWorkCenters } from './deliverySetup';
import { deleteWorkCenter, listWorkCenters, updateWorkCenter, type WorkCenter } from './workCentersApi';
import type { SalaRoom } from './salaStudioTypes';
import {
  scopeRestaurantPointsOfSale,
} from '../verticals/restaurant/loadRestaurantStores';
import type { RestaurantBusinessRef } from '../verticals/restaurant/retailScope';
import {
  isSalaManagedTerminal,
  isSalaManagedWorkCenter,
  stripSalaRoomNoteFromWorkCenter,
} from './salaRoomTerminal';

export {
  findTerminalForRoom,
  isSalaManagedWorkCenter,
  MAX_SALA_TERMINALS_PER_PDV,
  salaRoomWorkCenterNote,
  salaTerminalCodeForRoom,
  stripSalaRoomNoteFromWorkCenter,
} from './salaRoomTerminal';

async function resolveParentPdv(
  userId: string,
  options?: EnsureRoomTpvOptions,
  room?: Pick<SalaRoom, 'id' | 'pdvId' | 'terminalId' | 'terminalLabel' | 'terminalCode'>,
): Promise<PointOfSale | null> {
  const allPointsOfSale =
    options?.pointsOfSale ?? (await listPointsOfSaleRequest(userId).catch(() => []));
  const allWorkCenters = options?.workCenters ?? (await listWorkCenters(userId).catch(() => []));

  const pointsOfSale =
    options?.business && options?.businesses
      ? scopeRestaurantPointsOfSale(allPointsOfSale, allWorkCenters, options.business, options.businesses)
      : filterPointsOfSaleForWorkCenters(
          allPointsOfSale.filter((p) => p.active !== false),
          allWorkCenters.filter((wc) => !isSalaManagedWorkCenter(wc) && !wc.deletedAt),
        );

  const preferredId = String(options?.parentPdvId || '').trim();
  if (preferredId) {
    return pointsOfSale.find((p) => p._id === preferredId && p.active !== false) || null;
  }

  if (!room) return null;
  const linkedPdvId = String(room.pdvId || '').trim();
  if (!linkedPdvId) return null;
  const linked = pointsOfSale.find((p) => p._id === linkedPdvId && p.active !== false);
  return linked || null;
}

async function persistPdvTerminals(
  userId: string,
  pdv: PointOfSale,
  terminals: TerminalConfig[],
): Promise<PointOfSale> {
  const next = { ...pdv, terminals };
  try {
    return await updatePointOfSaleRequest(userId, next);
  } catch {
    return pdv;
  }
}

const STORE_SALA_TERMINALS_PURGED_PREFIX = 'vertial.sala.storeTerminalsPurged:';

function storeSalaTerminalsPurgedKey(pdvId: string): string {
  return `${STORE_SALA_TERMINALS_PURGED_PREFIX}${String(pdvId || '').trim()}`;
}

function isStoreSalaTerminalsPurged(pdvId: string): boolean {
  if (!pdvId || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(storeSalaTerminalsPurgedKey(pdvId)) === '1';
  } catch {
    return true;
  }
}

function markStoreSalaTerminalsPurged(pdvId: string): void {
  if (!pdvId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storeSalaTerminalsPurgedKey(pdvId), '1');
  } catch {
    /* ignore */
  }
}

function pdvHasActiveSalaTerminals(pdv: PointOfSale): boolean {
  return (pdv.terminals || []).some(
    (t) => t.active !== false && isSalaManagedTerminal(t),
  );
}

async function deactivateSalaTerminalsOnStorePdv(
  userId: string,
  pdv: PointOfSale,
): Promise<PointOfSale> {
  const terminals = Array.isArray(pdv.terminals) ? pdv.terminals : [];
  if (!pdvHasActiveSalaTerminals(pdv)) return pdv;
  const next = terminals.map((t) =>
    t.active !== false && isSalaManagedTerminal(t) ? { ...t, active: false } : t,
  );
  return persistPdvTerminals(userId, pdv, next);
}

/** Migra terminales sala → 1 TPV tienda (una sola vez por PDV). */
async function maybeDeactivateSalaTerminalsOnStorePdv(
  userId: string,
  pdv: PointOfSale,
): Promise<void> {
  const pdvId = String(pdv._id || '').trim();
  if (!pdvId || !userId) return;
  if (!pdvHasActiveSalaTerminals(pdv)) {
    markStoreSalaTerminalsPurged(pdvId);
    return;
  }
  if (isStoreSalaTerminalsPurged(pdvId)) return;
  try {
    await deactivateSalaTerminalsOnStorePdv(userId, pdv);
    markStoreSalaTerminalsPurged(pdvId);
  } catch {
    /* reintenta en la próxima carga */
  }
}

function buildStoreLinkedRoom(room: SalaRoom, pdv: PointOfSale): SalaRoom {
  const wcId = String(pdv.workCenterId || '').trim() || undefined;
  return {
    ...room,
    pdvId: pdv._id,
    workCenterId: wcId,
    terminalId: undefined,
    terminalLabel: undefined,
    terminalCode: undefined,
  };
}

export type EnsureRoomTpvOptions = {
  /** PDV activo del restaurante (barra superior). Todas las salas comparten este PDV. */
  parentPdvId?: string;
  workCenters?: WorkCenter[];
  pointsOfSale?: PointOfSale[];
  business?: RestaurantBusinessRef | null;
  businesses?: RestaurantBusinessRef[];
  /** Evita barrido legacy en cada carga (solo migración puntual). */
  skipLegacyCleanup?: boolean;
};

const LEGACY_CLEANUP_DONE_PREFIX = 'vertial.sala.legacyCleanupDone:';

function legacyCleanupDoneKey(businessId: string): string {
  return `${LEGACY_CLEANUP_DONE_PREFIX}${String(businessId || '').replace(/^business:/, '').trim()}`;
}

function isLegacyCleanupDone(businessId: string): boolean {
  if (!businessId || typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(legacyCleanupDoneKey(businessId)) === '1';
  } catch {
    return true;
  }
}

function markLegacyCleanupDone(businessId: string): void {
  if (!businessId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(legacyCleanupDoneKey(businessId), '1');
  } catch {
    /* ignore */
  }
}

function roomAlreadySynced(room: SalaRoom, pdvId: string): boolean {
  if (String(room.pdvId || '').trim() !== pdvId) return false;
  return !String(room.terminalId || '').trim() && !String(room.terminalCode || '').trim();
}

async function maybeCleanupLegacySalaRetail(
  userId: string,
  businessId: string,
  options: EnsureRoomTpvOptions,
): Promise<SalaLegacyCleanupResult | undefined> {
  if (options.skipLegacyCleanup || !String(options.parentPdvId || '').trim()) return undefined;
  if (isLegacyCleanupDone(businessId)) return undefined;

  const workCenters = options.workCenters ?? (await listWorkCenters(userId));
  const hasLegacySalaCenters = workCenters.some(
    (wc) => isSalaManagedWorkCenter(wc) && !wc.deletedAt,
  );
  if (!hasLegacySalaCenters) {
    markLegacyCleanupDone(businessId);
    return undefined;
  }

  const pointsOfSale =
    options.pointsOfSale ??
    (await listPointsOfSaleRequest(userId, { includeInactive: true }).catch(() => []));
  const cleanup = await cleanupLegacySalaRetail(userId, { ...options, workCenters, pointsOfSale });
  markLegacyCleanupDone(businessId);
  return cleanup;
}

export type EnsureRoomTpvError = 'no_parent_pdv';

export type EnsureRoomTpvResult = {
  room: SalaRoom;
  error?: EnsureRoomTpvError;
};

/** Enlaza la sala al PDV activo de la tienda (1 TPV por tienda; sin terminales por sala). */
export async function ensureRoomTpvDetailed(
  userId: string,
  _businessId: string,
  room: SalaRoom,
  options?: EnsureRoomTpvOptions,
): Promise<EnsureRoomTpvResult> {
  if (!userId || !room?.id) return { room };

  const parent = await resolveParentPdv(userId, options, room);
  if (!parent) {
    const waitingForStore = !String(options?.parentPdvId || '').trim() && !String(room.pdvId || '').trim();
    if (waitingForStore) return { room };
    return { room, error: 'no_parent_pdv' };
  }

  if (roomAlreadySynced(room, parent._id)) {
    return { room: buildStoreLinkedRoom(room, parent) };
  }

  return { room: buildStoreLinkedRoom(room, parent) };
}

export async function ensureRoomTpv(
  userId: string,
  businessId: string,
  room: SalaRoom,
  options?: EnsureRoomTpvOptions,
): Promise<SalaRoom> {
  const result = await ensureRoomTpvDetailed(userId, businessId, room, options);
  return result.room;
}

export type SalaLegacyCleanupResult = {
  archivedWorkCenters: number;
  removedPdvs: number;
  promotedWorkCenters: number;
};

async function promoteSalaWorkCenterToRetailStore(wc: WorkCenter): Promise<boolean> {
  const cleanedNotes = stripSalaRoomNoteFromWorkCenter(wc.notes);
  const needsPromote =
    isSalaManagedWorkCenter(wc) || Boolean(wc.deletedAt) || wc.active === false;
  if (!needsPromote && cleanedNotes === String(wc.notes || '').trim()) return false;
  try {
    await updateWorkCenter({
      ...wc,
      notes: cleanedNotes,
      active: true,
      deletedAt: null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Archiva centros/PDV creados por sala (1 PDV por sala) — obsoletos tras terminales compartidos. */
export async function cleanupLegacySalaRetail(
  userId: string,
  options?: EnsureRoomTpvOptions,
): Promise<SalaLegacyCleanupResult> {
  if (!userId) return { archivedWorkCenters: 0, removedPdvs: 0, promotedWorkCenters: 0 };

  const workCenters = options?.workCenters ?? (await listWorkCenters(userId));
  const pointsOfSale =
    options?.pointsOfSale ??
    (await listPointsOfSaleRequest(userId, { includeInactive: true }).catch(() => []));
  const keepPdvId = String(options?.parentPdvId || '').trim();
  const keepPdv = keepPdvId ? pointsOfSale.find((p) => p._id === keepPdvId) : null;
  const keepWcId = String(keepPdv?.workCenterId || '').trim();

  const salaWcs = workCenters.filter((wc) => isSalaManagedWorkCenter(wc) && !wc.deletedAt);
  const salaWcIds = new Set(salaWcs.map((wc) => wc._id));

  let promotedWorkCenters = 0;
  if (keepWcId) {
    const keepWc = workCenters.find((wc) => wc._id === keepWcId);
    if (keepWc && (await promoteSalaWorkCenterToRetailStore(keepWc))) {
      promotedWorkCenters += 1;
      salaWcIds.delete(keepWcId);
    }
  }

  const toArchive = salaWcs.filter((wc) => wc._id !== keepWcId);
  if (toArchive.length === 0 && promotedWorkCenters === 0) {
    return { archivedWorkCenters: 0, removedPdvs: 0, promotedWorkCenters: 0 };
  }

  let archivedWorkCenters = 0;
  for (const wc of toArchive) {
    try {
      await deleteWorkCenter(wc._id);
      archivedWorkCenters += 1;
    } catch {
      /* ignore */
    }
  }

  let removedPdvs = 0;
  for (const pdv of pointsOfSale) {
    if (keepPdvId && pdv._id === keepPdvId) continue;
    const wcId = String(pdv.workCenterId || '').trim();
    if (!wcId || wcId === keepWcId) continue;
    if (!salaWcIds.has(wcId) && !toArchive.some((wc) => wc._id === wcId)) continue;
    try {
      await deletePointOfSaleRequest(userId, pdv._id);
      removedPdvs += 1;
    } catch {
      try {
        await updatePointOfSaleRequest(userId, { ...pdv, active: false });
        removedPdvs += 1;
      } catch {
        /* ignore */
      }
    }
  }

  return { archivedWorkCenters, removedPdvs, promotedWorkCenters };
}

export async function ensureAllRoomsTpv(
  userId: string,
  businessId: string,
  rooms: SalaRoom[],
  options?: EnsureRoomTpvOptions,
): Promise<{
  rooms: SalaRoom[];
  changed: boolean;
  errors: EnsureRoomTpvError[];
  cleanup?: SalaLegacyCleanupResult;
}> {
  if (!userId || rooms.length === 0) {
    return { rooms, changed: false, errors: [] };
  }

  const workCenters =
    options?.workCenters && options.workCenters.length > 0
      ? options.workCenters
      : await listWorkCenters(userId);
  const pointsOfSale =
    options?.pointsOfSale && options.pointsOfSale.length > 0
      ? options.pointsOfSale
      : await listPointsOfSaleRequest(userId, { includeInactive: true }).catch(() => []);
  const sharedOptions: EnsureRoomTpvOptions = { ...options, workCenters, pointsOfSale };

  const parentPdvId = String(options?.parentPdvId || '').trim();
  const parentPdv = parentPdvId ? pointsOfSale.find((p) => p._id === parentPdvId) : null;
  if (parentPdv) {
    await maybeDeactivateSalaTerminalsOnStorePdv(userId, parentPdv);
  }
  if (
    parentPdv &&
    rooms.every((r) => roomAlreadySynced(r, parentPdvId)) &&
    isLegacyCleanupDone(businessId)
  ) {
    return { rooms, changed: false, errors: [] };
  }

  const next: SalaRoom[] = [];
  const errors: EnsureRoomTpvError[] = [];
  let changed = false;

  for (const room of rooms) {
    const result = await ensureRoomTpvDetailed(userId, businessId, room, sharedOptions);
    if (result.error) errors.push(result.error);
    const updated = result.room;
    if (
      updated.pdvId !== room.pdvId
      || updated.workCenterId !== room.workCenterId
      || updated.terminalId !== room.terminalId
      || updated.terminalLabel !== room.terminalLabel
      || updated.terminalCode !== room.terminalCode
    ) {
      changed = true;
    }
    next.push(updated);
  }

  const cleanup = await maybeCleanupLegacySalaRetail(userId, businessId, sharedOptions);

  return {
    rooms: next,
    changed,
    errors: [...new Set(errors)],
    cleanup,
  };
}

/** Obsoleto: 1 TPV por tienda; ya no hay terminales TPV por sala. */
export async function deactivateRoomTerminal(
  _userId: string,
  _room: SalaRoom,
  _options?: Pick<EnsureRoomTpvOptions, 'pointsOfSale'>,
): Promise<void> {
  /* no-op */
}
