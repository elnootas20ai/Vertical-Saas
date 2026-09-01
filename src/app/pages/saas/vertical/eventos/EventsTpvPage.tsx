import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, Loader2, Monitor, Plus, RefreshCw } from 'lucide-react';
import { Layout } from '../../../../components/saas/Layout';
import { EventsPortablePdvModal } from '../../../../components/saas/events/EventsPortablePdvModal';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import {
  ensureTabletCodesForPointsOfSale,
  listPointsOfSaleRequest,
} from '../../../../lib/deliveryApi';
import {
  filterWorkCentersForBusinessScope,
  resolveBusinessScopeId,
} from '../../../../lib/deliverySetup';
import { resolveEventsUserId } from '../../../../lib/eventsFlow';
import { saasPathWithBusinessScope } from '../../../../lib/businessScopeUrl';
import {
  listSalesPoints,
  type EventsPdvKind,
  type WorkCenter,
} from '../../../../lib/workCentersApi';
import {
  clearAllRetailScopeCaches,
} from '../../../../verticals/retailScopeRegistry';
import {
  notifyDeliveryActiveStoreChanged,
  writeDeliveryOpsSelectedPdvId,
} from '../../../../lib/deliveryOpsPdvSelection';
import { EVENTS_CEO_TPV_PATH } from '../../../../lib/retailOpsPaths';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../../../lib/vertialUiTokens';

type TpvTile = {
  wc: WorkCenter;
  kind: EventsPdvKind;
  terminalCode: string;
  pdvId: string;
};

function resolveKind(wc: WorkCenter): EventsPdvKind {
  return wc.eventsPdvKind === 'temporary' ? 'temporary' : 'fixed';
}

export function EventsTpvPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const accountBusinessCount = businessesFetchSettled ? businesses.length : undefined;
  const businessId = resolveBusinessScopeId(currentBusiness);
  const scoped = (path: string) => saasPathWithBusinessScope(path, businessId);
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [tiles, setTiles] = useState<TpvTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createKind, setCreateKind] = useState<EventsPdvKind>('fixed');
  const selectedId = String(searchParams.get('pdv') || '').trim();

  const refresh = useCallback(async () => {
    if (!dataUserId) {
      setTiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sps = await listSalesPoints(dataUserId);
      const scopedWcs = filterWorkCentersForBusinessScope(sps, businessId, {
        accountBusinessCount,
        includeTemporaryEventPdvs: true,
      }).filter(
        (sp) => sp.active !== false && sp.centerType === 'punto_de_venta',
      );

      let pdvs = await listPointsOfSaleRequest(dataUserId, { includeInactive: false });
      if (businessId) {
        pdvs = pdvs.filter((p) => {
          const bid = String(p.businessId || (p as { business_id?: string }).business_id || '')
            .replace(/^business:/, '')
            .trim();
          return !bid || bid === businessId;
        });
      }
      pdvs = await ensureTabletCodesForPointsOfSale(dataUserId, pdvs);
      const byWc: Record<string, { code: string; pdvId: string }> = {};
      for (const pdv of pdvs) {
        const wcId = String(pdv.workCenterId || '').trim();
        const code = String(pdv.terminalCode || '').trim().toUpperCase();
        const pdvId = String(pdv._id || pdv.id || '').trim();
        if (wcId && (code || pdvId)) {
          byWc[wcId] = { code: code || byWc[wcId]?.code || '', pdvId: pdvId || byWc[wcId]?.pdvId || '' };
        }
      }

      setTiles(
        scopedWcs
          .map((wc) => {
            const hit = byWc[wc._id] || byWc[wc.id] || { code: '', pdvId: '' };
            return {
              wc,
              kind: resolveKind(wc),
              terminalCode: hit.code,
              pdvId: hit.pdvId,
            };
          })
          .sort((a, b) => a.wc.name.localeCompare(b.wc.name, 'es')),
      );
    } catch {
      toast.error('No se pudieron cargar los PDV');
      setTiles([]);
    } finally {
      setLoading(false);
    }
  }, [accountBusinessCount, businessId, dataUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fixedTiles = tiles.filter((t) => t.kind === 'fixed');
  const temporaryTiles = tiles.filter((t) => t.kind === 'temporary');
  const selected = tiles.find((t) => t.wc._id === selectedId || t.wc.id === selectedId) || null;

  const openCreate = (kind: EventsPdvKind) => {
    setCreateKind(kind);
    setShowCreate(true);
  };

  const selectTile = (wcId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('pdv', wcId);
      return next;
    }, { replace: true });
  };

  const copyCode = async (code: string) => {
    if (!code) {
      toast.error('Este PDV aún no tiene código TPV');
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Código TPV copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const openCeoTpv = (tile: TpvTile) => {
    const pdvId = String(tile.pdvId || '').trim();
    if (!pdvId) {
      toast.error('Este PDV aún no está listo. Pulsa Actualizar o crea de nuevo el código.');
      return;
    }
    if (businessId) {
      // Caché antigua sin PDV temporales → el TPV pedía «crear tienda».
      clearAllRetailScopeCaches(businessId);
    }
    if (businessId && dataUserId) {
      writeDeliveryOpsSelectedPdvId(businessId, dataUserId, pdvId);
      notifyDeliveryActiveStoreChanged();
    }
    navigate(scoped(EVENTS_CEO_TPV_PATH));
  };

  const renderGrid = (list: TpvTile[], emptyLabel: string) => {
    if (list.length === 0) {
      return (
        <p className="text-sm text-stone-500 dark:text-stone-400 py-2">{emptyLabel}</p>
      );
    }
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {list.map((tile) => {
          const id = tile.wc._id;
          const active = selectedId === id || selectedId === tile.wc.id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTile(id)}
              className={`aspect-square max-w-[7.5rem] w-full rounded-xl border p-2 flex flex-col items-center justify-center gap-1 text-center transition-colors ${
                active
                  ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30'
                  : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-600'
              }`}
            >
              <Monitor
                className={`w-4 h-4 shrink-0 ${active ? 'text-[#2563EB]' : 'text-stone-400'}`}
              />
              <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 line-clamp-2 leading-tight">
                {tile.wc.name || 'Sin nombre'}
              </span>
              {tile.terminalCode ? (
                <span className="text-[9px] font-mono tracking-wide text-stone-500 tabular-nums">
                  {tile.terminalCode}
                </span>
              ) : (
                <span className="text-[9px] text-amber-600">Sin código</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Layout
      title="TPV evento"
      subtitle="PDV portátiles: fijos arriba, temporales abajo. Toca uno para entrar."
    >
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className={VERTIAL_BTN_SECONDARY}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </button>
          <button type="button" onClick={() => openCreate('fixed')} className={VERTIAL_BTN_PRIMARY}>
            <Plus className="w-4 h-4" />
            Nuevo PDV
          </button>
        </div>

        {selected ? (
          <div className={`${VERTIAL_SURFACE} p-3 sm:p-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
                  {selected.kind === 'fixed' ? 'Evento fijo' : 'Evento temporal'}
                </p>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 truncate">
                  {selected.wc.name}
                </h2>
                <p className="text-xs text-stone-500">
                  Código TPV{' '}
                  <span className="font-mono font-semibold tracking-wider text-stone-800 dark:text-stone-200 tabular-nums">
                    {selected.terminalCode || '—'}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void copyCode(selected.terminalCode)}
                  className={VERTIAL_BTN_SECONDARY}
                >
                  <Copy className="w-4 h-4" />
                  Copiar código
                </button>
                <button
                  type="button"
                  onClick={() => openCeoTpv(selected)}
                  className={VERTIAL_BTN_PRIMARY}
                >
                  <Monitor className="w-4 h-4" />
                  Ir a TPV
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-stone-200">
              Eventos fijos
            </h3>
            <button
              type="button"
              onClick={() => openCreate('fixed')}
              className="text-xs font-semibold text-[#2563EB] hover:underline"
            >
              + Fijo
            </button>
          </div>
          {loading && tiles.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-stone-500 py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando PDV…
            </div>
          ) : (
            renderGrid(fixedTiles, 'Aún no hay PDV fijos. Crea uno para verlo aquí siempre.')
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-stone-200">
              Eventos temporales
            </h3>
            <button
              type="button"
              onClick={() => openCreate('temporary')}
              className="text-xs font-semibold text-[#2563EB] hover:underline"
            >
              + Temporal
            </button>
          </div>
          {loading && tiles.length === 0 ? null : (
            renderGrid(temporaryTiles, 'Sin PDV temporales por ahora.')
          )}
        </section>
      </div>

      <EventsPortablePdvModal
        open={showCreate}
        userId={dataUserId || ''}
        business={currentBusiness}
        defaultKind={createKind}
        onClose={() => setShowCreate(false)}
        onCreated={(pdv) => {
          const wcId = String(pdv.workCenterId || '').trim();
          void refresh().then(() => {
            if (wcId) {
              navigate(scoped(`/saas/vertical/eventos/tpv?pdv=${encodeURIComponent(wcId)}`), {
                replace: true,
              });
            }
          });
        }}
      />
    </Layout>
  );
}
