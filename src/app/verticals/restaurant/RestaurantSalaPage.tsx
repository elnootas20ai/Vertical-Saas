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
import type { SalaRoom } from '../../lib/salaStudioTypes';
import { RestaurantSalaQuickSetup } from './RestaurantSalaQuickSetup';
import { RestaurantSalaLiveView } from './RestaurantSalaLiveView';
import { applyRestaurantSalaQuickSetup } from './applyRestaurantSalaQuickSetup';
import { clearRestaurantClientCaches } from './clearRestaurantClientCaches';
import { clearOnboardingDraft } from './onboarding/draftStorage';
import { wipeRestaurantSalaSetup } from './wipeRestaurantSalaSetup';
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
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const bootRef = useRef('');

  useEffect(() => {
    if (!businessId) return;
    clearRestaurantClientCaches(businessId);
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

      const hasPdvInScope = allPointsOfSale.some((p) => p.active !== false);
      const hasPending = Boolean(pendingPdvId || urlPdvId || peekSalaSetupPending(businessId));

      if (!hasPdvInScope && !hasPending && retailWorkCenters.length === 0) {
        setView('no_pdv');
        return;
      }

      const [config, listed] = await Promise.all([
        getFloorConfigRequest(userId).catch(() => null),
        listDiningTablesRequest(userId).catch(() => []),
      ]);

      const tablesHere = tablesForBusiness(listed || [], businessId);
      const nextRooms = Array.isArray(config?.rooms) ? config.rooms : [];
      // Ya tiene mapa (zonas o mesas) → servicio en vivo, sin asistente.
      const ready =
        isSalaQuickSetupComplete(config)
        || tablesHere.length > 0
        || nextRooms.length > 0;

      if (ready) {
        enterLive(nextRooms, tablesHere);
        return;
      }
      // Solo primera vez / local vacío → asistente.
      setView('setup');
    } catch {
      setView(parentPdvId || pendingPdvId ? 'setup' : 'no_pdv');
    }
  }, [
    userId,
    businessId,
    allPointsOfSale,
    retailWorkCenters.length,
    pendingPdvId,
    urlPdvId,
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
            Primero crea el local
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Ajustes → Tienda → crea el bar/restaurante. Al guardar te traemos al asistente de
            zonas y mesas.
          </p>
          <button
            type="button"
            onClick={() => navigate('/saas/settings/tienda?action=new-pdv')}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
          >
            Crear local
            <ArrowRight className="h-4 w-4" />
          </button>
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
          onTablesChange={setTables}
          onAddFirstTable={() => {
            bootRef.current = '';
            void runFreshStart({ clearDraft: true });
          }}
          onRemount={() => {
            bootRef.current = '';
            void runFreshStart({ clearDraft: true });
          }}
        />
      </div>
    </Layout>
  );
}
