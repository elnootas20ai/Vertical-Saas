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
  countSalaTerminals,
  findTerminalForRoom,
  generateSalaTerminalLoginCode,
  isSalaManagedWorkCenter,
  MAX_SALA_TERMINALS_PER_PDV,
  needsLegacyTerminalCodeMigration,
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
  if (!linked || !findTerminalForRoom(linked, room)) return null;
  return linked;
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

function buildLinkedRoom(
  room: SalaRoom,
  pdv: PointOfSale,
  terminal: TerminalConfig,
): SalaRoom {
  const wcId = String(pdv.workCenterId || '').trim() || undefined;
  const termCode = String(terminal.code || '').trim().toUpperCase();
  return {
    ...room,
    pdvId: pdv._id,
    workCenterId: wcId,
    terminalId: terminal.id,
    terminalLabel: termCode || String(terminal.name || '').trim() || room.terminalLabel,
    terminalCode: termCode || room.terminalCode,
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

function roomAlreadySynced(room: SalaRoom, pdv: PointOfSale): boolean {
  const terminal = findTerminalForRoom(pdv, room);
  if (!terminal) return false;
  if (String(room.pdvId || '').trim() !== pdv._id) return false;
  if (String(room.terminalId || '').trim() !== terminal.id) return false;
  if (needsLegacyTerminalCodeMigration(terminal)) return false;
  const termCode = String(terminal.code || '').trim().toUpperCase();
  if (String(room.terminalCode || '').trim().toUpperCase() !== termCode) return false;
  return terminal.name === room.name;
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

export type EnsureRoomTpvError = 'no_parent_pdv' | 'max_terminals';

export type EnsureRoomTpvResult = {
  room: SalaRoom;
  error?: EnsureRoomTpvError;
};

/** Enlaza 1 terminal TPV dentro del PDV activo (idempotente; no crea PDV por sala). */
export async function ensureRoomTpvDetailed(
  userId: string,
  _businessId: string,
  room: SalaRoom,
  options?: EnsureRoomTpvOptions,
): Promise<EnsureRoomTpvResult> {
  if (!userId || !room?.id) return { room };

  const pointsOfSale =
    options?.pointsOfSale ?? (await listPointsOfSaleRequest(userId).catch(() => []));
  const parent = await resolveParentPdv(userId, { ...options, pointsOfSale }, room);
  if (!parent) {
    const waitingForStore = !String(options?.parentPdvId || '').trim() && !String(room.pdvId || '').trim();
    if (waitingForStore) return { room };
    return { room, error: 'no_parent_pdv' };
  }

  let pdv = pointsOfSale.find((p) => p._id === parent._id) || parent;
  const terminals = Array.isArray(pdv.terminals) ? [...pdv.terminals] : [];
  let terminal = findTerminalForRoom(pdv, room);

  if (terminal && roomAlreadySynced(room, pdv)) {
    return { room: buildLinkedRoom(room, pdv, terminal) };
  }

  if (!terminal) {
    if (countSalaTerminals(pdv) >= MAX_SALA_TERMINALS_PER_PDV) {
      return { room, error: 'max_terminals' };
    }
    const termId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    terminal = {
      id: termId,
      code: generateSalaTerminalLoginCode(),
      name: room.name,
      salaRoomId: room.id,
      datafonName: '',
      printerName: '',
      scaleDeviceId: '',
      scaleName: '',
      active: true,
    };
    terminals.push(terminal);
    pdv = await persistPdvTerminals(userId, pdv, terminals);
  } else {
    const idx = terminals.findIndex((t) => t.id === terminal!.id);
    if (idx >= 0) {
      let updated = { ...terminals[idx] };
      let dirty = false;
      if (updated.name !== room.name) {
        updated = { ...updated, name: room.name };
        dirty = true;
      }
      if (needsLegacyTerminalCodeMigration(updated)) {
        updated = {
          ...updated,
          code: generateSalaTerminalLoginCode(),
          salaRoomId: room.id,
        };
        dirty = true;
      } else if (!String(updated.salaRoomId || '').trim()) {
        updated = { ...updated, salaRoomId: room.id };
        dirty = true;
      }
      if (dirty) {
        terminals[idx] = updated;
        pdv = await persistPdvTerminals(userId, pdv, terminals);
        terminal = updated;
      }
    }
  }

  return { room: buildLinkedRoom(room, pdv, terminal!) };
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
  if (
    parentPdv &&
    rooms.every((r) => r.terminalId && roomAlreadySynced(r, parentPdv)) &&
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

/** Desactiva el terminal TPV de una sala al eliminarla (no borra el PDV compartido). */
export async function deactivateRoomTerminal(
  userId: string,
  room: SalaRoom,
  options?: Pick<EnsureRoomTpvOptions, 'pointsOfSale'>,
): Promise<void> {
  const pdvId = String(room.pdvId || '').trim();
  const terminalId = String(room.terminalId || '').trim();
  if (!userId || !pdvId || !terminalId) return;

  const pointsOfSale =
    options?.pointsOfSale ?? (await listPointsOfSaleRequest(userId).catch(() => []));
  const pdv = pointsOfSale.find((p) => p._id === pdvId);
  if (!pdv) return;

  const terminals = Array.isArray(pdv.terminals) ? [...pdv.terminals] : [];
  const idx = terminals.findIndex((t) => t.id === terminalId);
  if (idx < 0 || terminals[idx].active === false) return;

  terminals[idx] = { ...terminals[idx], active: false };
  await persistPdvTerminals(userId, pdv, terminals);
}
