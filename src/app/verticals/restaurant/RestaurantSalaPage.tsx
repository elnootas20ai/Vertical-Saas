/**
 * Sala del vertical bar/restaurante — montaje + servicio en vivo.
 * Tras el wizard aterriza en la sala real (todas libres), sin pantalla intermedia.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Store } from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { TpvRegisterGate } from '../../components/saas/TpvRegisterGate';
import { TpvOfflineBanner } from '../../components/saas/TpvOfflineBanner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { TpvChromeScope } from '../../context/TpvChromeContext';
import { isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { needsCeoTpvStoreBootstrap } from '../../lib/ceoTpvStoreBootstrap';
import { coerceSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import type { PointOfSale } from '../../lib/deliveryApi';
import type { WorkCenter } from '../../lib/workCentersApi';
import {
  bootstrapRestaurantCeoTpvStores,
  buildRestaurantCeoTpvStoreRows,
} from './ceoTpvStores';
import { readRestaurantRetailCache } from './restaurantRetailCache';
import {
  consumeSalaSetupPending,
  peekSalaSetupPending,
  type SalaQuickSetupRoomDraft,
} from '../../lib/salaQuickSetup';
import {
  getDiningOrderRequest,
  getFloorConfigRequest,
  listDiningTablesRequest,
  type DiningOrder,
  type DiningTable,
} from '../../lib/salaApi';
import { loadOpenDiningOrderForTable } from '../../lib/restaurantDiningTpv';
import type { SalaRoom, SalaRoomType } from '../../lib/salaStudioTypes';
import { RestaurantSalaQuickSetup } from './RestaurantSalaQuickSetup';
import { RestaurantSalaLiveView } from './RestaurantSalaLiveView';
import { RestaurantTpvTableAccount } from './RestaurantTpvTableAccount';
import { applyRestaurantSalaQuickSetup } from './applyRestaurantSalaQuickSetup';
import { clearRestaurantClientCaches } from './clearRestaurantClientCaches';
import { clearOnboardingDraft } from './onboarding/draftStorage';
import { wipeRestaurantSalaSetup } from './wipeRestaurantSalaSetup';
import {
  addTablesToZone,
  addZoneWithTables,
  removeFreeTable,
  removeZoneIfIdle,
  updateTablePeople,
} from './restaurantSalaLiveEdit';
import {
  clearRestaurantSalaRemountDone,
  markRestaurantSalaRemountDone,
  markRestaurantSalaRemountWiped,
  shouldForceRestaurantSalaRemount,
} from './restaurantSalaRemount';
import { filterSalaTablesByBusinessScope } from '../../lib/salaBusinessScope';

type ViewState = 'loading' | 'no_pdv' | 'setup' | 'live';

function normalizeBusinessId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

export function RestaurantSalaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const {
    activeSalesPointId,
    displayLabelForActive,
    setActiveSalesPoint,
    loading: storeLoading,
    refresh: refreshStore,
    allPointsOfSale,
    retailWorkCenters,
  } = useActiveStoreScope();

  const userId = user?.user_id || '';
  const businessId = normalizeBusinessId(currentBusiness?.business_id);
  const accountBusinessCount = businesses.length || 1;
  const salaScope = useMemo(
    () => ({ businessId, accountBusinessCount }),
    [businessId, accountBusinessCount],
  );
  const urlPdvId = String(searchParams.get('pdv') || '').trim();
  const wantReset = searchParams.get('reset') === '1';

  const [pendingPdvId, setPendingPdvId] = useState(() => {
    if (urlPdvId) return urlPdvId;
    return peekSalaSetupPending(businessId) || '';
  });

  const [storeBootstrapLoading, setStoreBootstrapLoading] = useState(false);
  const [bootstrappedPdvs, setBootstrappedPdvs] = useState<PointOfSale[]>([]);
  const [bootstrappedRetail, setBootstrappedRetail] = useState<WorkCenter[]>([]);
  const storeBootstrapDoneRef = useRef(false);
  const storeBootstrapInflightRef = useRef(false);
  const lastStoreBootstrapBusinessRef = useRef('');

  const scopedActivePdvs = useMemo(() => {
    const fromScope = allPointsOfSale.filter((p) => p.active !== false);
    if (fromScope.length > 0) return fromScope;
    return bootstrappedPdvs.filter((p) => p.active !== false);
  }, [allPointsOfSale, bootstrappedPdvs]);

  const scopedRetail = useMemo(() => {
    if (retailWorkCenters.length > 0) return retailWorkCenters;
    return bootstrappedRetail;
  }, [retailWorkCenters, bootstrappedRetail]);

  const storeRows = useMemo(
    () =>
      buildRestaurantCeoTpvStoreRows(
        scopedRetail,
        scopedActivePdvs,
        currentBusiness,
        businesses,
      ),
    [scopedRetail, scopedActivePdvs, currentBusiness, businesses],
  );

  const parentPdvId = useMemo(() => {
    const pdvs = scopedActivePdvs;
    const preferred = activeSalesPointId || pendingPdvId || urlPdvId;
    const fromScope = pdvs.length > 0 ? coerceSelectedPdvId(pdvs, preferred) : '';
    return fromScope || pendingPdvId || urlPdvId || '';
  }, [scopedActivePdvs, activeSalesPointId, pendingPdvId, urlPdvId]);

  const [view, setView] = useState<ViewState>('loading');
  const [saving, setSaving] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [accountTable, setAccountTable] = useState<DiningTable | null>(null);
  const [accountOrder, setAccountOrder] = useState<DiningOrder | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const bootRef = useRef('');

  useEffect(() => {
    if (!businessId) return;
    if (lastStoreBootstrapBusinessRef.current === businessId) return;
    lastStoreBootstrapBusinessRef.current = businessId;
    storeBootstrapDoneRef.current = false;
    storeBootstrapInflightRef.current = false;
    setBootstrappedPdvs([]);
    setBootstrappedRetail([]);
  }, [businessId]);

  // Hidratar PDV/tienda desde caché local → no esperar bootstrap en red.
  useEffect(() => {
    if (!businessId || !currentBusiness) return;
    if (allPointsOfSale.length > 0 || retailWorkCenters.length > 0) return;
    if (bootstrappedPdvs.length > 0 || bootstrappedRetail.length > 0) return;
    const cached = readRestaurantRetailCache(businessId, currentBusiness, businesses);
    if (!cached) return;
    setBootstrappedPdvs(cached.allPointsOfSale.filter((p) => p.active !== false));
    setBootstrappedRetail(cached.retailWorkCenters);
  }, [
    businessId,
    currentBusiness,
    businesses,
    allPointsOfSale.length,
    retailWorkCenters.length,
    bootstrappedPdvs.length,
    bootstrappedRetail.length,
  ]);

  // Solo refrescar tiendas: force:false (como sidebar). force:true puede
  // pisar la lista buena con un fetch vacío → «No encontramos el local».
  useEffect(() => {
    if (!businessId) return;
    void refreshStore({ force: false });
  }, [businessId, refreshStore]);

  const shouldBootstrapStores = useMemo(() => {
    if (!businessesFetchSettled || !businessId || !user || !currentBusiness) return false;
    if (storeBootstrapDoneRef.current || storeBootstrapInflightRef.current) return false;
    if (scopedActivePdvs.length > 0) {
      return needsCeoTpvStoreBootstrap(scopedRetail, scopedActivePdvs, storeRows);
    }
    return true;
  }, [
    businessesFetchSettled,
    businessId,
    user,
    currentBusiness,
    scopedActivePdvs,
    scopedRetail,
    storeRows,
  ]);

  // Igual que TPV sala: enlazar PDV huérfano / tienda sin PDV (demo bar, WC sin enlace).
  useEffect(() => {
    if (!shouldBootstrapStores || !user || !currentBusiness) return;

    let cancelled = false;
    storeBootstrapInflightRef.current = true;
    setStoreBootstrapLoading(true);

    void (async () => {
      try {
        const state = await bootstrapRestaurantCeoTpvStores(user, currentBusiness, businesses, {
          accountBusinessCount: businesses.length,
        });
        if (cancelled) return;

        const nextRows = buildRestaurantCeoTpvStoreRows(
          state.workCenters || [],
          state.pointsOfSale || [],
          currentBusiness,
          businesses,
        );
        const rowPdvIds = new Set(
          nextRows.map((r) => String(r.pdvId || '').trim()).filter(Boolean),
        );
        const nextPdvs = (state.pointsOfSale || []).filter((p) => {
          if (p.active === false) return false;
          if (rowPdvIds.size === 0) return true;
          return rowPdvIds.has(String(p._id || '').trim());
        });

        setBootstrappedPdvs(nextPdvs);
        setBootstrappedRetail(state.workCenters || []);
        storeBootstrapDoneRef.current = true;

        const pick = coerceSelectedPdvId(
          nextPdvs,
          activeSalesPointId || pendingPdvId || urlPdvId,
        );
        if (pick) {
          setActiveSalesPoint(pick);
          if (!pendingPdvId && !urlPdvId) setPendingPdvId(pick);
        }

        void refreshStore({ force: false }).catch(() => null);
      } catch {
        storeBootstrapDoneRef.current = true;
      } finally {
        storeBootstrapInflightRef.current = false;
        if (!cancelled) setStoreBootstrapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    shouldBootstrapStores,
    user,
    currentBusiness,
    businesses,
    activeSalesPointId,
    pendingPdvId,
    urlPdvId,
    setActiveSalesPoint,
    refreshStore,
  ]);

  useEffect(() => {
    if (!businessId) return;
    const fromPending = peekSalaSetupPending(businessId);
    const next = urlPdvId || fromPending || '';
    if (next) {
      setPendingPdvId(next);
      setActiveSalesPoint(next);
    }
  }, [businessId, urlPdvId, setActiveSalesPoint]);

  useEffect(() => {
    if (storeLoading || !businessId) return;
    const pdvs = scopedActivePdvs;
    if (pdvs.length === 0) return;
    const pdvId = coerceSelectedPdvId(pdvs, activeSalesPointId || pendingPdvId);
    if (!pdvId || activeSalesPointId === pdvId) return;
    setActiveSalesPoint(pdvId);
  }, [
    storeLoading,
    businessId,
    scopedActivePdvs,
    activeSalesPointId,
    pendingPdvId,
    setActiveSalesPoint,
  ]);

  const stripResetParam = useCallback(() => {
    if (!wantReset) return;
    const next = new URLSearchParams(searchParams);
    next.delete('reset');
    setSearchParams(next, { replace: true });
  }, [wantReset, searchParams, setSearchParams]);

  const hasStoreInScope = useMemo(() => {
    const hasPdv = scopedActivePdvs.length > 0;
    const hasRetail = scopedRetail.some((wc) => !wc.deletedAt && wc.active !== false);
    const hasPending = Boolean(pendingPdvId || urlPdvId || peekSalaSetupPending(businessId));
    return hasPdv || hasRetail || hasPending;
  }, [scopedActivePdvs, scopedRetail, pendingPdvId, urlPdvId, businessId]);

  const runFreshStart = useCallback(async (opts?: { clearDraft?: boolean }) => {
    if (!userId || !businessId) return;
    setView('loading');
    const clearDraft = Boolean(opts?.clearDraft || wantReset);
    if (clearDraft) {
      clearRestaurantSalaRemountDone(businessId);
      clearOnboardingDraft(businessId);
    }
    clearRestaurantClientCaches(businessId);
    const { deletedTables } = await wipeRestaurantSalaSetup(userId, businessId);
    markRestaurantSalaRemountWiped(businessId);
    consumeSalaSetupPending(businessId);
    setRooms([]);
    setTables([]);
    setView('setup');
    stripResetParam();
    if (deletedTables > 0) {
      toast.message('Mapa anterior borrado. Empezamos de cero.');
    }
    void refreshStore({ force: false });
  }, [userId, businessId, wantReset, stripResetParam, refreshStore]);

  const enterLive = useCallback(
    (nextRooms: SalaRoom[], nextTables: DiningTable[]) => {
      markRestaurantSalaRemountDone(businessId);
      setRooms(nextRooms);
      setTables(nextTables);
      setView('live');
    },
    [businessId],
  );

  const reload = useCallback(async () => {
    if (!userId) {
      setView('no_pdv');
      return;
    }
    setView('loading');
    try {
      if (shouldForceRestaurantSalaRemount(businessId, wantReset)) {
        await runFreshStart({ clearDraft: true });
        return;
      }

      // Primero el mapa de ESTA empresa (no el del bar u otra vertical).
      const [config, listed] = await Promise.all([
        getFloorConfigRequest(userId, { businessId }).catch(() => null),
        listDiningTablesRequest(userId, salaScope).catch(() => []),
      ]);

      const tablesHere = filterSalaTablesByBusinessScope(listed || [], businessId, accountBusinessCount);
      const nextRooms = Array.isArray(config?.rooms) ? config.rooms : [];
      // Solo mapa real (mesas o zonas). El flag «setup complete» solo no basta:
      // si no hay mapa, hay que mostrar el asistente (alta de bar/restaurante).
      const hasMap = tablesHere.length > 0 || nextRooms.length > 0;

      if (hasMap) {
        enterLive(nextRooms, tablesHere);
        return;
      }

      if (!hasStoreInScope) {
        setView('no_pdv');
        return;
      }

      // Primera vez / local vacío → asistente (¿qué espacios tienes?).
      setView('setup');
    } catch {
      setView(parentPdvId || pendingPdvId || hasStoreInScope ? 'setup' : 'no_pdv');
    }
  }, [
    userId,
    businessId,
    hasStoreInScope,
    pendingPdvId,
    parentPdvId,
    wantReset,
    runFreshStart,
    enterLive,
    salaScope,
    accountBusinessCount,
  ]);

  useEffect(() => {
    if (storeLoading || !businessId) return;
    const blockForBootstrap =
      storeBootstrapLoading && scopedActivePdvs.length === 0 && !hasStoreInScope;
    if (blockForBootstrap) return;
    const force = shouldForceRestaurantSalaRemount(businessId, wantReset);
    const bootKey = `${businessId}:${force ? 'force' : 'keep'}:${parentPdvId || 'no-pdv'}`;
    if (bootRef.current === bootKey) return;
    bootRef.current = bootKey;
    void reload();
  }, [
    storeLoading,
    storeBootstrapLoading,
    scopedActivePdvs.length,
    hasStoreInScope,
    businessId,
    wantReset,
    reload,
    parentPdvId,
  ]);

  // Si caímos en “Crear local” por scope vacío y luego aparece el PDV, reintentar.
  useEffect(() => {
    if (view !== 'no_pdv' || storeLoading || !businessId) return;
    if (!hasStoreInScope) return;
    bootRef.current = '';
    void reload();
  }, [view, storeLoading, businessId, hasStoreInScope, reload]);

  const handleSubmit = async (drafts: SalaQuickSetupRoomDraft[]) => {
    if (!userId || !businessId || !currentBusiness) {
      toast.error('Falta sesión de empresa');
      return;
    }

    let effectivePdv = parentPdvId || pendingPdvId || urlPdvId;
    let submitRetail = scopedRetail;
    let submitPdvs = allPointsOfSale.length > 0 ? allPointsOfSale : bootstrappedPdvs;

    if (!effectivePdv) {
      try {
        const state = await bootstrapRestaurantCeoTpvStores(user, currentBusiness, businesses, {
          accountBusinessCount: businesses.length,
        });
        submitRetail = state.workCenters || [];
        submitPdvs = state.pointsOfSale || [];
        effectivePdv = coerceSelectedPdvId(
          submitPdvs.filter((p) => p.active !== false),
          pendingPdvId || urlPdvId || activeSalesPointId,
        );
        if (effectivePdv) {
          setBootstrappedPdvs(submitPdvs.filter((p) => p.active !== false));
          setBootstrappedRetail(submitRetail);
          setActiveSalesPoint(effectivePdv);
          setPendingPdvId(effectivePdv);
          void refreshStore({ force: false });
        }
      } catch {
        /* toast abajo */
      }
    }

    if (!effectivePdv) {
      toast.error('No encontramos el PDV del local. Revisa Ajustes → Tienda o pulsa Reintentar.');
      return;
    }

    setSaving(true);
    try {
      clearRestaurantClientCaches(businessId);
      const result = await applyRestaurantSalaQuickSetup({
        userId,
        businessId,
        parentPdvId: effectivePdv,
        drafts,
        business: currentBusiness,
        businesses,
        workCenters: submitRetail,
        pointsOfSale: submitPdvs,
      });
      consumeSalaSetupPending(businessId);
      setPendingPdvId('');
      enterLive(result.rooms, result.tables);
      void refreshStore({ force: false });
      navigate('/saas/sala', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el mapa de sala');
    } finally {
      setSaving(false);
    }
  };

  const tpvOptions = useMemo(
    () => ({
      parentPdvId: parentPdvId || pendingPdvId || urlPdvId || undefined,
      business: currentBusiness,
      businesses,
      workCenters: scopedRetail,
      pointsOfSale: allPointsOfSale.length > 0 ? allPointsOfSale : bootstrappedPdvs,
    }),
    [
      parentPdvId,
      pendingPdvId,
      urlPdvId,
      currentBusiness,
      businesses,
      scopedRetail,
      allPointsOfSale,
      bootstrappedPdvs,
    ],
  );

  const handleAddZone = async (input: {
    name: string;
    roomType: SalaRoomType;
    tableCount: number;
    defaultCapacity: number;
  }) => {
    if (!userId || !businessId) {
      toast.error('Sesión no lista');
      return;
    }
    setMapBusy(true);
    try {
      const result = await addZoneWithTables({
        userId,
        businessId,
        rooms,
        tables,
        name: input.name,
        roomType: input.roomType,
        tableCount: input.tableCount,
        defaultCapacity: input.defaultCapacity,
        tpvOptions,
      });
      setRooms(result.rooms);
      setTables(result.tables);
      toast.success(
        input.tableCount > 0
          ? `Zona «${result.room.name}» · ${input.tableCount} mesas`
          : `Zona «${result.room.name}» creada`,
      );
      return result.room;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear la zona');
    } finally {
      setMapBusy(false);
    }
  };

  const handleAddTables = async (input: {
    roomId: string;
    count: number;
    capacity: number;
  }) => {
    const room = rooms.find((r) => r.id === input.roomId);
    if (!userId || !businessId || !room) {
      toast.error('Zona no encontrada');
      return;
    }
    setMapBusy(true);
    try {
      const next = await addTablesToZone({
        userId,
        businessId,
        room,
        tables,
        count: input.count,
        capacity: input.capacity,
      });
      setTables(next);
      const unit = room.roomType === 'barra' ? 'puestos' : 'mesas';
      toast.success(`+${input.count} ${unit} en «${room.name}»`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron añadir mesas');
    } finally {
      setMapBusy(false);
    }
  };

  const handleRemoveTable = async (tableId: string) => {
    if (!userId) return;
    setMapBusy(true);
    try {
      const next = await removeFreeTable({ userId, tables, tableId });
      setTables(next);
      toast.success('Mesa eliminada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la mesa');
    } finally {
      setMapBusy(false);
    }
  };

  const handleUpdateTablePeople = async (input: {
    tableId: string;
    capacity?: number;
    currentGuests?: number;
  }) => {
    if (!userId) return;
    setMapBusy(true);
    try {
      const next = await updateTablePeople({
        userId,
        tables,
        tableId: input.tableId,
        capacity: input.capacity,
        currentGuests: input.currentGuests,
      });
      setTables(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la mesa');
      throw err;
    } finally {
      setMapBusy(false);
    }
  };

  const handleRemoveZone = async (roomId: string) => {
    if (!userId || !businessId) return;
    setMapBusy(true);
    try {
      const result = await removeZoneIfIdle({
        userId,
        businessId,
        rooms,
        tables,
        roomId,
      });
      setRooms(result.rooms);
      setTables(result.tables);
      toast.success('Zona eliminada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la zona');
    } finally {
      setMapBusy(false);
    }
  };

  const closeTableAccount = useCallback(() => {
    setAccountTable(null);
    setAccountOrder(null);
    setAccountLoading(false);
    if (!userId || !businessId) return;
    void listDiningTablesRequest(userId, salaScope)
      .then((listed) => {
        setTables(filterSalaTablesByBusinessScope(listed || [], businessId, accountBusinessCount));
      })
      .catch(() => undefined);
  }, [userId, businessId, salaScope, accountBusinessCount]);

  const handleOpenTableAccount = useCallback(
    async (table: DiningTable, orderId?: string) => {
      const tableId = String(table._id || table.id || '').trim();
      if (!tableId || !userId) {
        toast.error('No se puede abrir el pedido de la mesa');
        return;
      }
      const pdvId = parentPdvId || activeSalesPointId || '';
      if (!pdvId) {
        toast.error('Falta el local de esta sala. Revisa Ajustes → Tienda.');
        return;
      }
      if (activeSalesPointId !== pdvId) {
        setActiveSalesPoint(pdvId);
      }

      setAccountTable(table);
      setAccountOrder(null);
      setAccountLoading(true);
      try {
        let order: DiningOrder | null = null;
        const wantedId = String(orderId || '').trim();
        if (wantedId) {
          try {
            order = await getDiningOrderRequest(userId, wantedId);
          } catch {
            order = null;
          }
        }
        if (!order) {
          order = await loadOpenDiningOrderForTable(userId, tableId);
        }
        setAccountOrder(order);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar el pedido');
        setAccountTable(null);
      } finally {
        setAccountLoading(false);
      }
    },
    [userId, parentPdvId, activeSalesPointId, setActiveSalesPoint],
  );

  const accountPdvId = parentPdvId || activeSalesPointId || undefined;

  const blockUiForBootstrap =
    storeBootstrapLoading && scopedActivePdvs.length === 0 && !hasStoreInScope;

  if (view === 'loading' || storeLoading || blockUiForBootstrap) {
    return (
      <Layout title="Sala" noPadding>
        <div className="flex min-h-[50vh] items-center justify-center gap-3 text-stone-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Preparando sala…
        </div>
      </Layout>
    );
  }

  if (view === 'no_pdv') {
    return (
      <Layout title="Sala" noPadding>
        <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">
            No encontramos el local
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Si ya tienes tienda en Ajustes → Tienda, pulsa reintentar. Si aún no existe, créala
            y vuelve a Sala.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                bootRef.current = '';
                void refreshStore().then(() => reload());
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/settings/tienda?action=new-pdv')}
              className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
            >
              Crear local
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (view === 'setup') {
    return (
      <Layout title="Sala" noPadding>
        <div className="min-h-[calc(100vh-4rem)] bg-stone-50/80 dark:bg-stone-950">
          <RestaurantSalaQuickSetup
            businessId={businessId}
            storeLabel={displayLabelForActive || currentBusiness?.name}
            saving={saving}
            verticalTone={
              isStrictDeliveryBusinessType(currentBusiness?.businessType)
                ? 'delivery'
                : 'restaurant'
            }
            onSubmit={(drafts) => void handleSubmit(drafts)}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Sala" noPadding>
      <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
        <RestaurantSalaLiveView
          rooms={rooms}
          tables={tables}
          storeLabel={displayLabelForActive || currentBusiness?.name}
          userId={userId}
          businessId={businessId}
          actorName={user?.fullName || user?.email || 'Sala'}
          mapBusy={mapBusy}
          onTablesChange={setTables}
          onAddZone={handleAddZone}
          onAddTables={handleAddTables}
          onUpdateTablePeople={handleUpdateTablePeople}
          onRemoveTable={handleRemoveTable}
          onRemoveZone={handleRemoveZone}
          onRemount={() => {
            bootRef.current = '';
            void runFreshStart({ clearDraft: true });
          }}
          onOpenTableAccount={(table, orderId) => {
            void handleOpenTableAccount(table, orderId);
          }}
        />
      </div>

      {accountTable
        && createPortal(
          <div className="fixed inset-0 z-[90] flex min-h-0 flex-col overflow-hidden bg-stone-100 dark:bg-stone-950">
            <TpvChromeScope insetBottomBar bottomBar={null}>
              <TpvOfflineBanner />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <TpvRegisterGate
                  fillParent
                  initialManagerPdvId={accountPdvId}
                  onDismissWithoutSession={closeTableAccount}
                >
                  {accountLoading ? (
                    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
                      <p className="text-sm text-stone-500">Abriendo pedido de mesa…</p>
                    </div>
                  ) : (
                    <RestaurantTpvTableAccount
                      userId={userId}
                      table={accountTable}
                      order={accountOrder}
                      tabletMode={false}
                      onBack={closeTableAccount}
                      onOrderChange={setAccountOrder}
                      onTableChange={(nextTable, order) => {
                        if ('_id' in nextTable || 'type' in nextTable) {
                          const t = nextTable as DiningTable;
                          setAccountTable(t);
                          setTables((prev) => {
                            const id = String(t._id || t.id || '');
                            if (!id) return prev;
                            return prev.map((row) =>
                              String(row._id || row.id) === id ? { ...row, ...t } : row,
                            );
                          });
                        }
                        setAccountOrder(order);
                      }}
                    />
                  )}
                </TpvRegisterGate>
              </div>
            </TpvChromeScope>
          </div>,
          document.body,
        )}
    </Layout>
  );
}
