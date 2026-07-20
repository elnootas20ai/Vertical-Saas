/**
 * Sala del vertical bar/restaurante — montaje + servicio en vivo.
 * Tras el wizard aterriza en la sala real (todas libres), sin pantalla intermedia.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Store } from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { coerceSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import {
  consumeSalaSetupPending,
  peekSalaSetupPending,
  type SalaQuickSetupRoomDraft,
} from '../../lib/salaQuickSetup';
import {
  getFloorConfigRequest,
  listDiningTablesRequest,
  type DiningTable,
} from '../../lib/salaApi';
import { isSalaQuickSetupComplete } from '../../lib/salaQuickSetup';
import type { SalaRoom, SalaRoomType } from '../../lib/salaStudioTypes';
import { RestaurantSalaQuickSetup } from './RestaurantSalaQuickSetup';
import { RestaurantSalaLiveView } from './RestaurantSalaLiveView';
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

type ViewState = 'loading' | 'no_pdv' | 'setup' | 'live';

function normalizeBusinessId(value: string | null | undefined): string {
  return String(value || '').replace(/^business:/, '').trim();
}

function tablesForBusiness(
  tables: DiningTable[],
  businessId: string,
): DiningTable[] {
  return (tables || []).filter((t) => {
    const bid = normalizeBusinessId(t.businessId);
    return !bid || bid === businessId;
  });
}

export function RestaurantSalaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
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
  const urlPdvId = String(searchParams.get('pdv') || '').trim();
  const wantReset = searchParams.get('reset') === '1';

  const [pendingPdvId, setPendingPdvId] = useState(() => {
    if (urlPdvId) return urlPdvId;
    return peekSalaSetupPending(businessId) || '';
  });

  const parentPdvId = useMemo(() => {
    const pdvs = allPointsOfSale.filter((p) => p.active !== false);
    const fromScope = pdvs.length > 0 ? coerceSelectedPdvId(pdvs, activeSalesPointId) : '';
    return fromScope || pendingPdvId || urlPdvId || '';
  }, [allPointsOfSale, activeSalesPointId, pendingPdvId, urlPdvId]);

  const [view, setView] = useState<ViewState>('loading');
  const [saving, setSaving] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const bootRef = useRef('');

  // Solo refrescar tiendas: no vaciar caché de retail al abrir Sala
  // (eso provocaba “Crear local” aunque el PDV ya existiera).
  useEffect(() => {
    if (!businessId) return;
    void refreshStore();
  }, [businessId, refreshStore]);

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
    const pdvs = allPointsOfSale.filter((p) => p.active !== false);
    if (pdvs.length === 0) return;
    const pdvId = coerceSelectedPdvId(pdvs, activeSalesPointId || pendingPdvId);
    if (!pdvId || activeSalesPointId === pdvId) return;
    setActiveSalesPoint(pdvId);
  }, [
    storeLoading,
    businessId,
    allPointsOfSale,
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
    const hasPdv = allPointsOfSale.some((p) => p.active !== false);
    const hasRetail = retailWorkCenters.some((wc) => !wc.deletedAt && wc.active !== false);
    const hasPending = Boolean(pendingPdvId || urlPdvId || peekSalaSetupPending(businessId));
    return hasPdv || hasRetail || hasPending;
  }, [allPointsOfSale, retailWorkCenters, pendingPdvId, urlPdvId, businessId]);

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
    void refreshStore();
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

      // Primero el mapa: si ya hay zonas/mesas, entrar en vivo aunque el scope
      // de tiendas aún no haya terminado de hidratarse.
      const [config, listed] = await Promise.all([
        getFloorConfigRequest(userId).catch(() => null),
        listDiningTablesRequest(userId).catch(() => []),
      ]);

      const tablesHere = tablesForBusiness(listed || [], businessId);
      const nextRooms = Array.isArray(config?.rooms) ? config.rooms : [];
      const ready =
        isSalaQuickSetupComplete(config)
        || tablesHere.length > 0
        || nextRooms.length > 0;

      if (ready) {
        enterLive(nextRooms, tablesHere);
        return;
      }

      if (!hasStoreInScope) {
        setView('no_pdv');
        return;
      }

      // Solo primera vez / local vacío → asistente.
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
  ]);

  useEffect(() => {
    if (storeLoading || !businessId) return;
    const force = shouldForceRestaurantSalaRemount(businessId, wantReset);
    const bootKey = `${businessId}:${force ? 'force' : 'keep'}`;
    if (bootRef.current === bootKey) return;
    bootRef.current = bootKey;
    void reload();
  }, [storeLoading, businessId, wantReset, reload]);

  // Si caímos en “Crear local” por scope vacío y luego aparece el PDV, reintentar.
  useEffect(() => {
    if (view !== 'no_pdv' || storeLoading || !businessId) return;
    if (!hasStoreInScope) return;
    bootRef.current = '';
    void reload();
  }, [view, storeLoading, businessId, hasStoreInScope, reload]);

  const handleSubmit = async (drafts: SalaQuickSetupRoomDraft[]) => {
    const effectivePdv = parentPdvId || pendingPdvId || urlPdvId;
    if (!userId || !businessId || !effectivePdv) {
      toast.error('No encontramos el PDV del local. Créalo en Ajustes → Tienda.');
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
        workCenters: retailWorkCenters,
        pointsOfSale: allPointsOfSale,
      });
      consumeSalaSetupPending(businessId);
      setPendingPdvId('');
      enterLive(result.rooms, result.tables);
      void refreshStore();
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
      workCenters: retailWorkCenters,
      pointsOfSale: allPointsOfSale,
    }),
    [
      parentPdvId,
      pendingPdvId,
      urlPdvId,
      currentBusiness,
      businesses,
      retailWorkCenters,
      allPointsOfSale,
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

  if (view === 'loading' || storeLoading) {
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
        />
      </div>
    </Layout>
  );
}
