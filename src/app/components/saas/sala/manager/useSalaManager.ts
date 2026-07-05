import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  bulkCreateDiningTablesRequest,
  bulkUpdateDiningTablesRequest,
  deleteDiningTableRequest,
  getFloorConfigRequest,
  listDiningTablesRequest,
  saveFloorConfigRequest,
  type DiningFloorConfig,
  type DiningTableStatus,
} from '../../../../lib/salaApi';
import {
  assignDefaultRoomIds,
  computeRestaurantSummary,
  computeRoomStats,
  createDefaultRooms,
  createRoomId,
  duplicateRoom,
  extendTable,
  nextTableNumber,
  roomsFromFloorConfig,
  tablesForRoom,
  DEFAULT_SALON_ROOM_ID,
} from '../../../../lib/salaRooms';
import type { ExtendedDiningTable, SalaRoom, SalaRoomType } from '../../../../lib/salaStudioTypes';
import type { TableSizePreset } from '../../../../lib/salaTableSize';
import { applyTableSizePreset } from '../../../../lib/salaTableSize';
import { ensureAllRoomsTpv, ensureRoomTpvDetailed, type EnsureRoomTpvOptions } from '../../../../lib/salaRoomPdv';
import {
  TPV_SESSION_SYNC_EVENT,
  listTpvRegisterSessionsRequest,
  type PointOfSale,
  type TpvRegisterSession,
} from '../../../../lib/deliveryApi';
import {
  resolveParentPdvFromScope,
  resolveSalaTpvDisplay,
  type SalaTpvDisplay,
} from '../../../../lib/salaStoreTpv';
import type { WorkCenter } from '../../../../lib/workCentersApi';
import { isSalaQuickSetupComplete, type SalaQuickSetupRoomDraft } from '../../../../lib/salaQuickSetup';
import { SALA_ROOM_COLORS } from '../../../../lib/salaStudioTypes';
import { notifyDeliveryActiveStoreChanged } from '../../../../lib/deliveryOpsPdvSelection';
import { notifyDeliveryWorkCentersChanged } from '../../../../lib/deliverySetup';
import { clearAllRetailScopeCaches } from '../../../../verticals/retailScopeRegistry';
import type { RestaurantBusinessRef } from '../../../../verticals/restaurant/retailScope';

const MAX_HISTORY = 40;
export const SALA_SETUP_VERSION = 3;

function notifyRetailScopeRefresh(businessId: string) {
  clearAllRetailScopeCaches(businessId);
  notifyDeliveryWorkCentersChanged(businessId);
  notifyDeliveryActiveStoreChanged();
}

type ManagerSnapshot = {
  rooms: SalaRoom[];
  tables: ExtendedDiningTable[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultTablePayload(
  number: number,
  capacity: number,
  roomId: string,
  roomName: string,
  businessId: string,
  sizePreset?: TableSizePreset,
): Partial<ExtendedDiningTable> {
  const preset = sizePreset || (capacity <= 2 ? 'bar' : capacity <= 4 ? 'medium' : 'large');
  const dims = applyTableSizePreset(preset);
  return {
    number,
    name: `Mesa ${number}`,
    capacity: dims.capacity,
    roomId,
    zone: roomName,
    gridW: dims.gridW,
    gridH: dims.gridH,
    sizePreset: preset,
    x: 0,
    y: 0,
    status: 'available',
    businessId,
    notes: '',
    qrCode: '',
    visible: true,
  };
}

export function roomSetupStatus(tableCount: number): 'configured' | 'pending' {
  return tableCount > 0 ? 'configured' : 'pending';
}

export function useSalaManager(
  userId: string,
  businessId: string,
  parentPdvId = '',
  business: RestaurantBusinessRef | null = null,
  businesses: RestaurantBusinessRef[] = [],
  retailScope?: { workCenters?: WorkCenter[]; pointsOfSale?: PointOfSale[] },
) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [tables, setTables] = useState<ExtendedDiningTable[]>([]);
  const [floorConfig, setFloorConfig] = useState<DiningFloorConfig | null>(null);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [history, setHistory] = useState<ManagerSnapshot[]>([]);
  const [future, setFuture] = useState<ManagerSnapshot[]>([]);
  const [tpvSessions, setTpvSessions] = useState<TpvRegisterSession[]>([]);

  const businessIdRef = useRef(businessId);
  businessIdRef.current = businessId;
  const parentPdvIdRef = useRef(parentPdvId);
  parentPdvIdRef.current = parentPdvId;
  const businessRef = useRef(business);
  businessRef.current = business;
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;
  const retailScopeRef = useRef(retailScope);
  retailScopeRef.current = retailScope;

  const lastSyncedParentPdvRef = useRef('');

  const loadedForUser = useRef<string | null>(null);
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const floorConfigRef = useRef(floorConfig);
  floorConfigRef.current = floorConfig;

  const snapshot = useCallback((): ManagerSnapshot => ({ rooms, tables }), [rooms, tables]);

  const pushHistory = useCallback(() => {
    setHistory((prev) => [...prev.slice(-MAX_HISTORY + 1), clone(snapshot())]);
    setFuture([]);
  }, [snapshot]);

  const restore = useCallback((snap: ManagerSnapshot) => {
    setRooms(snap.rooms);
    setTables(snap.tables);
    setDirty(true);
  }, []);

  const buildTpvOptions = (): EnsureRoomTpvOptions => ({
    parentPdvId: parentPdvIdRef.current,
    business: businessRef.current,
    businesses: businessesRef.current,
    workCenters: retailScopeRef.current?.workCenters,
    pointsOfSale: retailScopeRef.current?.pointsOfSale,
  });

  const applyTpvSyncResult = useCallback((
    tpvSync: Awaited<ReturnType<typeof ensureAllRoomsTpv>>,
    config: DiningFloorConfig,
    silent: boolean,
  ) => {
    const hasParentPdv = Boolean(String(parentPdvIdRef.current || '').trim());
    if (
      !silent &&
      hasParentPdv &&
      tpvSync.rooms.length > 0 &&
      tpvSync.errors.includes('no_parent_pdv')
    ) {
      toast.message('Selecciona un centro de trabajo arriba para enlazar las salas');
    }
    if (
      !silent &&
      tpvSync.cleanup &&
      (tpvSync.cleanup.archivedWorkCenters > 0 || tpvSync.cleanup.removedPdvs > 0 || tpvSync.cleanup.promotedWorkCenters > 0)
    ) {
      notifyRetailScopeRefresh(businessIdRef.current);
      if (tpvSync.cleanup.promotedWorkCenters > 0) {
        toast.success('Centro principal conservado; duplicados de sala archivados');
      } else {
        toast.success(
          `Centros duplicados de sala archivados (${tpvSync.cleanup.archivedWorkCenters} centro${tpvSync.cleanup.archivedWorkCenters !== 1 ? 's' : ''})`,
        );
      }
    }
    if (tpvSync.changed) {
      const nextConfig = { ...config, rooms: tpvSync.rooms };
      saveFloorConfigRequest(userId, nextConfig).catch(() => undefined);
      setFloorConfig(nextConfig);
      floorConfigRef.current = nextConfig;
      setRooms(tpvSync.rooms);
      roomsRef.current = tpvSync.rooms;
    }
  }, [userId]);

  const syncRoomsTpv = useCallback(async (
    loadedRooms: SalaRoom[],
    config: DiningFloorConfig,
    silent: boolean,
  ) => {
    if (!userId) return;
    const hasParentPdv = Boolean(String(parentPdvIdRef.current || '').trim());
    if (loadedRooms.length === 0 && !hasParentPdv) return;

    try {
      const tpvSync = await ensureAllRoomsTpv(
        userId,
        businessIdRef.current,
        loadedRooms,
        buildTpvOptions(),
      );
      applyTpvSyncResult(tpvSync, config, silent);
    } catch {
      if (!silent) toast.error('Error al sincronizar la tienda');
    }
  }, [userId, applyTpvSyncResult]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) return;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [tablesData, configData] = await Promise.all([
        listDiningTablesRequest(userId),
        getFloorConfigRequest(userId),
      ]);

      let config = configData;
      const setupVersion = Number(config?.salaSetupVersion || 0);

      if (!config || setupVersion < SALA_SETUP_VERSION) {
        const cfg = config as DiningFloorConfig & { rooms?: SalaRoom[] };
        const migrated: DiningFloorConfig = {
          ...(config || {}),
          businessId: businessIdRef.current,
          rooms: Array.isArray(cfg?.rooms) ? cfg.rooms : [],
          zones: [],
          layoutDecor: [],
          sections: [],
          salaSetupVersion: SALA_SETUP_VERSION,
        };
        config = migrated;
        saveFloorConfigRequest(userId, migrated).catch(() => undefined);
      }

      const loadedRooms = roomsFromFloorConfig(config);
      const extended = assignDefaultRoomIds(tablesData.map(extendTable), loadedRooms);
      setRooms(loadedRooms);
      roomsRef.current = loadedRooms;
      setTables(extended);
      setFloorConfig(config);
      floorConfigRef.current = config;
      setActiveRoomId((prev) => {
        if (prev && loadedRooms.some((r) => r.id === prev)) return prev;
        return loadedRooms[0]?.id || DEFAULT_SALON_ROOM_ID;
      });
      setDirty(false);
      setHistory([]);
      setFuture([]);
    } catch {
      if (!silent) toast.error('Error al cargar la configuración de sala');
    } finally {
      if (!silent) setLoading(false);
    }

    const roomsToSync = roomsRef.current;
    const configToSync = floorConfigRef.current;
    if (roomsToSync && configToSync) {
      const parentId = String(parentPdvIdRef.current || '').trim();
      if (parentId) lastSyncedParentPdvRef.current = parentId;
      void syncRoomsTpv(roomsToSync, configToSync, silent);
    }
  }, [userId, syncRoomsTpv]);

  useEffect(() => {
    loadedForUser.current = null;
    lastSyncedParentPdvRef.current = '';
  }, [businessId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    if (loadedForUser.current === userId) return;
    loadedForUser.current = userId;
    load();
  }, [userId, businessId, load]);

  /** Re-enlazar terminales cuando el usuario elige centro arriba (sin recargar mesas/config). */
  useEffect(() => {
    const parentId = String(parentPdvId || '').trim();
    if (!userId || !parentId || loading) return;
    if (lastSyncedParentPdvRef.current === parentId) return;
    if (loadedForUser.current !== userId) return;
    lastSyncedParentPdvRef.current = parentId;
    const config = floorConfigRef.current;
    if (!config) return;
    void syncRoomsTpv(roomsRef.current, config, true);
  }, [userId, parentPdvId, loading, syncRoomsTpv]);

  /** PDV listo: centro activo arriba, primera tienda disponible o sala ya enlazada. */
  const pdvLinked = useMemo(() => {
    if (String(parentPdvId || '').trim()) return true;
    return rooms.some((r) => String(r.pdvId || '').trim());
  }, [rooms, parentPdvId]);

  const needsQuickSetup = useMemo(() => {
    if (!pdvLinked) return false;
    if (isSalaQuickSetupComplete(floorConfig)) return false;
    return tables.length === 0;
  }, [pdvLinked, floorConfig, tables.length]);

  const applyQuickSetup = useCallback(async (drafts: SalaQuickSetupRoomDraft[]) => {
    if (!userId || drafts.length === 0) return;
    setSaving(true);
    try {
      for (const t of tables) {
        if (!t._id.startsWith('temp_')) {
          await deleteDiningTableRequest(userId, t._id).catch(() => undefined);
        }
      }

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
        const result = await ensureRoomTpvDetailed(userId, businessId, room, buildTpvOptions());
        room = result.room;
        if (result.error) {
          toast.error('No se pudo enlazar la sala a la tienda');
        }
        newRooms.push(room);
      }

      let num = 1;
      const tablePayloads: Partial<ExtendedDiningTable>[] = [];
      for (let i = 0; i < newRooms.length; i++) {
        const room = newRooms[i];
        const d = drafts[i];
        for (let j = 0; j < d.tableCount; j++) {
          tablePayloads.push({
            ...defaultTablePayload(num, d.defaultCapacity, room.id, room.name, businessId),
            number: num,
            name: `Mesa ${num}`,
            sortOrder: j,
          });
          num += 1;
        }
      }

      const created = await bulkCreateDiningTablesRequest(userId, tablePayloads);
      const mergedTables = created.map(extendTable);
      const saved = await saveFloorConfigRequest(userId, {
        ...(floorConfig || {}),
        businessId,
        rooms: newRooms,
        zones: [],
        layoutDecor: [],
        salaSetupVersion: SALA_SETUP_VERSION,
        salaQuickSetupComplete: true,
      });

      setRooms(newRooms);
      setTables(mergedTables);
      setFloorConfig(saved);
      setActiveRoomId(newRooms[0]?.id || '');
      setDirty(false);
      setHistory([]);
      setFuture([]);
      toast.success(`${newRooms.length} salas · ${mergedTables.length} mesas listas`);
    } catch {
      toast.error('Error al crear la configuración');
    } finally {
      setSaving(false);
    }
  }, [userId, businessId, tables, floorConfig]);

  const summary = useMemo(() => computeRestaurantSummary(rooms, tables), [rooms, tables]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) || null,
    [rooms, activeRoomId],
  );

  const activeRoomTables = useMemo(
    () => tablesForRoom(tables, activeRoomId).sort((a, b) => a.number - b.number),
    [tables, activeRoomId],
  );

  const lastModified = useMemo(() => {
    const dates = [
      floorConfig?.updatedAt,
      ...tables.map((t) => t.updatedAt),
    ].filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.sort().reverse()[0];
  }, [floorConfig?.updatedAt, tables]);

  const persist = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const tpvSync = await ensureAllRoomsTpv(userId, businessId, rooms, buildTpvOptions());
      const roomsToSave = tpvSync.rooms;
      if (tpvSync.changed) setRooms(roomsToSave);
      if (tpvSync.errors.includes('no_parent_pdv')) {
        toast.error('Selecciona un centro de trabajo antes de guardar');
      }
      if (tpvSync.cleanup && (tpvSync.cleanup.archivedWorkCenters > 0 || tpvSync.cleanup.removedPdvs > 0)) {
        notifyRetailScopeRefresh(businessId);
      }

      const pending = tables.filter((t) => t._id.startsWith('temp_'));
      const existing = tables.filter((t) => !t._id.startsWith('temp_'));
      let merged = [...existing];

      if (pending.length > 0) {
        const created = await bulkCreateDiningTablesRequest(
          userId,
          pending.map(({ _id, _rev, ...rest }) => rest),
        );
        merged = [...merged, ...created.map(extendTable)];
        setTables(merged);
      }

      if (merged.length > 0) {
        await bulkUpdateDiningTablesRequest(userId, merged);
      }

      const saved = await saveFloorConfigRequest(userId, {
        ...(floorConfig || {}),
        businessId,
        rooms: roomsToSave,
        zones: [],
        layoutDecor: [],
        salaSetupVersion: SALA_SETUP_VERSION,
      });
      setFloorConfig(saved);
      setDirty(false);
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [userId, businessId, tables, floorConfig, rooms]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setFuture((f) => [clone(snapshot()), ...f]);
      restore(last);
      return prev.slice(0, -1);
    });
  }, [restore, snapshot]);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      setHistory((h) => [...h, clone(snapshot())]);
      restore(next);
      return rest;
    });
  }, [restore, snapshot]);

  const createRoomWithTables = useCallback(async (
    name: string,
    roomType: SalaRoomType,
    tableCount: number,
    defaultCapacity: number,
  ) => {
    pushHistory();
    let room: SalaRoom = {
      id: createRoomId(),
      name,
      roomType,
      color: '#6366f1',
      sortOrder: rooms.length,
    };
    try {
      const result = await ensureRoomTpvDetailed(userId, businessId, room, buildTpvOptions());
      room = result.room;
      if (result.error === 'no_parent_pdv') {
        toast.error('Selecciona un centro de trabajo arriba antes de crear salas');
      }
    } catch {
      toast.error('Sala creada, pero no se pudo enlazar a la tienda');
    }
    let num = nextTableNumber(tables);
    const newTables: ExtendedDiningTable[] = Array.from({ length: tableCount }, (_, i) => ({
      ...defaultTablePayload(num + i, defaultCapacity, room.id, name, businessId),
      _id: `temp_${Math.random().toString(36).slice(2, 10)}`,
      id: '',
      type: 'dining_table',
      userId,
      name: `Mesa ${num + i}`,
      zoneResponsible: '',
      currentGuests: 0,
      occupiedAt: '',
      occupiedBy: '',
      sortOrder: i,
      active: true,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ExtendedDiningTable));

    const nextRooms = [...rooms, room];
    setRooms(nextRooms);
    setTables((prev) => [...prev, ...newTables]);
    setActiveRoomId(room.id);
    setDirty(true);
    if (room.pdvId) {
      saveFloorConfigRequest(userId, {
        ...(floorConfig || {}),
        businessId,
        rooms: nextRooms,
        zones: [],
        layoutDecor: [],
        salaSetupVersion: SALA_SETUP_VERSION,
      }).then(setFloorConfig).catch(() => undefined);
    }
    toast.success(`${name} creada con ${tableCount} mesas`);
  }, [pushHistory, rooms, tables, businessId, userId, floorConfig, parentPdvId]);

  const updateRoom = useCallback((roomId: string, patch: Partial<SalaRoom>) => {
    pushHistory();
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...patch } : r)));
    if (patch.name) {
      setTables((prev) => prev.map((t) => (t.roomId === roomId ? { ...t, zone: patch.name! } : t)));
    }
    setDirty(true);
  }, [pushHistory]);

  const duplicateRoomById = useCallback(async (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    pushHistory();
    let copy = duplicateRoom(room, rooms, rooms.length);
    try {
      const result = await ensureRoomTpvDetailed(userId, businessId, copy, buildTpvOptions());
      copy = result.room;
      if (result.error === 'no_parent_pdv') {
        toast.error('Selecciona un centro de trabajo arriba');
      }
    } catch {
      toast.error('Sala duplicada, pero no se pudo enlazar a la tienda');
    }
    const sourceTables = tablesForRoom(tables, roomId);
    let num = nextTableNumber(tables);
    const copiedTables = sourceTables.map((t, i) => ({
      ...t,
      _id: `temp_${Math.random().toString(36).slice(2, 10)}`,
      _rev: undefined,
      roomId: copy.id,
      number: num + i,
      name: `Mesa ${num + i}`,
      zone: copy.name,
    }));
    const nextRooms = [...rooms, copy];
    setRooms(nextRooms);
    setTables((prev) => [...prev, ...copiedTables]);
    setActiveRoomId(copy.id);
    setDirty(true);
    if (copy.pdvId) {
      saveFloorConfigRequest(userId, {
        ...(floorConfig || {}),
        businessId,
        rooms: nextRooms,
        zones: [],
        layoutDecor: [],
        salaSetupVersion: SALA_SETUP_VERSION,
      }).then(setFloorConfig).catch(() => undefined);
    }
    toast.success('Sala duplicada');
  }, [pushHistory, rooms, tables, businessId, userId, floorConfig, parentPdvId]);

  const deleteRoomById = useCallback(async (roomId: string) => {
    if (rooms.length <= 1) {
      toast.error('Debe existir al menos una sala');
      return;
    }
    pushHistory();
    const toRemove = tablesForRoom(tables, roomId);
    for (const t of toRemove) {
      if (!t._id.startsWith('temp_')) {
        await deleteDiningTableRequest(userId, t._id).catch(() => undefined);
      }
    }
    setTables((prev) => prev.filter((t) => t.roomId !== roomId));
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    setActiveRoomId((prev) => (prev === roomId ? rooms.find((r) => r.id !== roomId)?.id || '' : prev));
    setDirty(true);
    toast.success('Sala eliminada');
  }, [pushHistory, rooms, tables, userId]);

  const setRoomTableCount = useCallback((roomId: string, targetCount: number) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room || targetCount < 0) return;
    pushHistory();
    const current = tablesForRoom(tables, roomId).sort((a, b) => a.number - b.number);
    if (targetCount === current.length) return;

    if (targetCount > current.length) {
      let num = nextTableNumber(tables);
      const defaultCap = current[0]?.capacity || 4;
      const added = Array.from({ length: targetCount - current.length }, (_, i) => ({
        ...defaultTablePayload(num + i, defaultCap, roomId, room.name, businessId),
        _id: `temp_${Math.random().toString(36).slice(2, 10)}`,
        id: '',
        type: 'dining_table' as const,
        userId,
        name: `Mesa ${num + i}`,
        zoneResponsible: '',
        currentGuests: 0,
        occupiedAt: '',
        occupiedBy: '',
        sortOrder: current.length + i,
        active: true,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as ExtendedDiningTable));
      setTables((prev) => [...prev, ...added]);
    } else {
      const toRemove = current.slice(targetCount);
      setTables((prev) => prev.filter((t) => !toRemove.some((r) => r._id === t._id)));
      for (const t of toRemove) {
        if (!t._id.startsWith('temp_')) {
          deleteDiningTableRequest(userId, t._id).catch(() => undefined);
        }
      }
    }
    setDirty(true);
  }, [pushHistory, rooms, tables, businessId, userId]);

  const updateTable = useCallback((tableId: string, patch: Partial<ExtendedDiningTable> & { sizePreset?: TableSizePreset }) => {
    pushHistory();
    setTables((prev) => prev.map((t) => {
      if (t._id !== tableId) return t;
      if (patch.sizePreset) {
        const dims = applyTableSizePreset(patch.sizePreset);
        return { ...t, ...patch, ...dims, capacity: patch.capacity ?? dims.capacity };
      }
      return { ...t, ...patch };
    }));
    setDirty(true);
  }, [pushHistory]);

  const addTableToRoom = useCallback((roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    pushHistory();
    const num = nextTableNumber(tables);
    const cap = activeRoomTables[0]?.capacity || 4;
    const table = {
      ...defaultTablePayload(num, cap, roomId, room.name, businessId),
      _id: `temp_${Math.random().toString(36).slice(2, 10)}`,
      id: '',
      type: 'dining_table' as const,
      userId,
      zoneResponsible: '',
      currentGuests: 0,
      occupiedAt: '',
      occupiedBy: '',
      sortOrder: activeRoomTables.length,
      active: true,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ExtendedDiningTable;
    setTables((prev) => [...prev, table]);
    setDirty(true);
  }, [pushHistory, rooms, tables, businessId, userId, activeRoomTables]);

  const duplicateTable = useCallback((tableId: string) => {
    const table = tables.find((t) => t._id === tableId);
    if (!table) return;
    pushHistory();
    const num = nextTableNumber(tables);
    setTables((prev) => [...prev, {
      ...table,
      _id: `temp_${Math.random().toString(36).slice(2, 10)}`,
      _rev: undefined,
      number: num,
      name: `Mesa ${num}`,
      qrCode: '',
    }]);
    setDirty(true);
  }, [pushHistory, tables]);

  const deleteTable = useCallback(async (tableId: string) => {
    pushHistory();
    const table = tables.find((t) => t._id === tableId);
    if (table && !table._id.startsWith('temp_')) {
      await deleteDiningTableRequest(userId, tableId).catch(() => undefined);
    }
    setTables((prev) => prev.filter((t) => t._id !== tableId));
    setDirty(true);
  }, [pushHistory, tables, userId]);

  const roomStatsFor = useCallback((roomId: string) => computeRoomStats(tables, roomId), [tables]);

  const parentPdv = useMemo(
    () => resolveParentPdvFromScope(parentPdvId, rooms, retailScope?.pointsOfSale || []),
    [parentPdvId, rooms, retailScope?.pointsOfSale],
  );

  const refreshTpvSessions = useCallback(async () => {
    if (!userId) return;
    try {
      const bid = String(businessIdRef.current || '').trim();
      const sessions = await listTpvRegisterSessionsRequest(userId, bid ? { businessId: bid } : undefined);
      setTpvSessions(sessions);
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    void refreshTpvSessions();
  }, [refreshTpvSessions, parentPdvId]);

  useEffect(() => {
    const onSessionSync = () => { void refreshTpvSessions(); };
    window.addEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
    return () => window.removeEventListener(TPV_SESSION_SYNC_EVENT, onSessionSync);
  }, [refreshTpvSessions]);

  const storeTpv = useMemo((): SalaTpvDisplay | null => {
    if (!parentPdv) return null;
    return resolveSalaTpvDisplay(parentPdv, null, tpvSessions);
  }, [parentPdv, tpvSessions]);

  const tpvForRoom = useCallback((roomId: string): SalaTpvDisplay | null => {
    if (!parentPdv) return null;
    const room = rooms.find((r) => r.id === roomId) || null;
    return resolveSalaTpvDisplay(parentPdv, room, tpvSessions);
  }, [parentPdv, rooms, tpvSessions]);

  const activeRoomTpv = useMemo((): SalaTpvDisplay | null => {
    if (!parentPdv || !activeRoomId) return storeTpv;
    return tpvForRoom(activeRoomId);
  }, [parentPdv, activeRoomId, storeTpv, tpvForRoom]);

  return {
    loading,
    saving,
    dirty,
    rooms,
    tables,
    activeRoomId,
    setActiveRoomId,
    activeRoom,
    activeRoomTables,
    summary,
    lastModified,
    pdvLinked,
    needsQuickSetup,
    parentPdvId,
    parentPdv,
    storeTpv,
    activeRoomTpv,
    tpvForRoom,
    applyQuickSetup,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    load,
    persist,
    undo,
    redo,
    createRoomWithTables,
    updateRoom,
    duplicateRoomById,
    deleteRoomById,
    setRoomTableCount,
    updateTable,
    addTableToRoom,
    duplicateTable,
    deleteTable,
    roomStatsFor,
  };
}

export type SalaManagerState = ReturnType<typeof useSalaManager>;

export const STATUS_LABELS: Record<DiningTableStatus, string> = {
  available: 'Disponible',
  occupied: 'Ocupada',
  pending_order: 'Esperando',
  served: 'Servida',
  pending_payment: 'Pendiente cobro',
  unavailable: 'No disponible',
  reserved: 'Reservada',
  hidden: 'Oculta',
};
