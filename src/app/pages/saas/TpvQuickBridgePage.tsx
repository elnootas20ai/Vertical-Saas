import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Copy,
  ExternalLink,
  Loader2,
  Monitor,
  Receipt,
  Store,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { buildCeoTpvStoreRows } from '../../components/saas/CeoTpvStorePicker';
import {
  pointOfSaleDisplayLabel,
  type PointOfSale,
} from '../../lib/deliveryApi';
import {
  notifyDeliveryActiveStoreChanged,
  writeDeliveryOpsSelectedPdvId,
} from '../../lib/deliveryOpsPdvSelection';
import { isDeliveryOpsBusinessType, isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { resolveRetailCeoTpvPath } from '../../lib/retailOpsPaths';
import { getRetailOpsUiCopy } from '../../lib/retailUiCopy';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { bootstrapCeoTpvStores } from '../../lib/ceoTpvStoreBootstrap';
import type { Business } from '../../lib/businessApi';

type BridgeStoreRow = {
  business: Business;
  businessId: string;
  pdv: PointOfSale;
  title: string;
  pdvCode: string;
  terminalCode: string;
};

async function copyText(label: string, value: string) {
  const text = String(value || '').trim();
  if (!text) {
    toast.error('No hay nada que copiar');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  } catch {
    toast.error('No se pudo copiar');
  }
}

export function TpvQuickBridgePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    businesses,
    businessesFetchSettled,
    currentBusiness,
    switchBusiness,
  } = useBusiness();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BridgeStoreRow[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [openingPdvId, setOpeningPdvId] = useState<string | null>(null);

  const opsBusinesses = useMemo(
    () => businesses.filter((b) => isDeliveryOpsBusinessType(b.businessType)),
    [businesses],
  );
  const bridgeCopy = useMemo(
    () => getRetailOpsUiCopy(
      isRestaurantBusinessType(currentBusiness?.businessType) ? 'restaurant' : currentBusiness?.businessType,
    ),
    [currentBusiness?.businessType],
  );

  const tabletActivationUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${AUTH_PATHS.tpvTabletLogin}`
    : AUTH_PATHS.tpvTabletLogin;

  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      if (!businessesFetchSettled || !user) {
        setLoading(true);
        return;
      }
      if (opsBusinesses.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const accountBusinessCount = businesses.length;
        const results = await Promise.all(
          opsBusinesses.map(async (business) => {
            const businessId = resolveBusinessScopeId(business);
            if (!businessId) return [] as BridgeStoreRow[];

            const state = await bootstrapCeoTpvStores(
              user,
              business,
              businesses,
              { accountBusinessCount },
            ).catch(() => null);

            if (!state) return [] as BridgeStoreRow[];

            const retail = state.workCenters || [];
            const pdvs = (state.pointsOfSale || []).filter((p) => p.active !== false);
            const storeRows = buildCeoTpvStoreRows(retail, pdvs, businessId, {
              business,
              businesses,
            });

            return storeRows
              .filter((row) => row.pdvId && !row.needsPdv && !row.inactive)
              .map((row) => {
                const pdv = pdvs.find((p) => p._id === row.pdvId);
                if (!pdv) return null;
                return {
                  business,
                  businessId,
                  pdv,
                  title: row.title || pointOfSaleDisplayLabel(pdv),
                  pdvCode: String(row.code || pdv.code || '').trim(),
                  terminalCode: String(pdv.terminalCode || '').trim().toUpperCase(),
                } satisfies BridgeStoreRow;
              })
              .filter(Boolean) as BridgeStoreRow[];
          }),
        );

        if (cancelled) return;
        setRows(results.flat());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadAll();
    return () => { cancelled = true; };
  }, [businesses, businessesFetchSettled, opsBusinesses, user]);

  const openTpvForStore = useCallback(
    async (row: BridgeStoreRow) => {
      const pdvId = String(row.pdv._id || '').trim();
      if (!pdvId) return;

      setOpeningPdvId(pdvId);
      try {
        const dataUserId = resolveBusinessDataUserId(user, row.business);
        const currentId = resolveBusinessScopeId(currentBusiness);
        if (currentId !== row.businessId) {
          switchBusiness(row.businessId);
        }
        if (dataUserId) {
          writeDeliveryOpsSelectedPdvId(row.businessId, dataUserId, pdvId);
          notifyDeliveryActiveStoreChanged();
        }
        const path = resolveRetailCeoTpvPath(row.business.businessType);
        navigate(path);
      } finally {
        setOpeningPdvId(null);
      }
    },
    [currentBusiness, navigate, switchBusiness, user],
  );

  const openTabletLoginWithCode = useCallback((code?: string) => {
    const normalized = String(code ?? manualCode).trim().toUpperCase();
    if (!normalized) {
      toast.error(`Introduce un ${bridgeCopy.storeCountLabel} válido`);
      return;
    }
    navigate(AUTH_PATHS.tpvTabletLogin, { state: { terminalCode: normalized } });
  }, [manualCode, navigate]);

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        <header className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            Acceso rápido
          </p>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Puente TPV
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Consulta códigos de tienda, copia el enlace para tablets y abre el TPV sin salir del
                panel. Misma vía rápida que usar el código en la tablet.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Activar tablet con cualquier código
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Pega el código del {bridgeCopy.storeCountLabel} o ábrelo directamente en la pantalla de activación.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="Código tablet (ej. AB12CD)"
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-3 py-2.5 text-sm font-mono uppercase tracking-wider"
            />
            <ACCESO__Button variant="secondary" onClick={() => openTabletLoginWithCode()}>
              <ExternalLink className="w-4 h-4" />
              Probar activación
            </ACCESO__Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyText('Enlace de activación', tabletActivationUrl)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar enlace tablet
            </button>
            <button
              type="button"
              onClick={() => navigate(resolveRetailCeoTpvPath(currentBusiness?.businessType))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              <Zap className="w-3.5 h-3.5" />
              Ir al TPV operativo
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {bridgeCopy.storesSectionTitle}
            </h2>
            {!loading && (
              <span className="text-xs text-gray-400">
                {rows.length} {bridgeCopy.storeCountLabel}{rows.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-7 h-7 animate-spin mb-3" />
              <p className="text-sm">{bridgeCopy.loadingStoresLabel}</p>
            </div>
          ) : opsBusinesses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Sin negocios con TPV
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
                El puente TPV está pensado para bar/restaurante y reparto a domicilio. Cambia a una empresa
                operativa o créala en Configuración.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
              <Store className="w-8 h-8 mx-auto mb-3 text-gray-400" />
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Aún no hay {bridgeCopy.storeCountLabel}s activos
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-5">
                Crea un centro de venta en Ajustes para obtener códigos y abrir caja.
              </p>
              <ACCESO__Button variant="primary" onClick={() => navigate('/saas/settings/tienda')}>
                Configurar tienda
              </ACCESO__Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {rows.map((row) => {
                const busy = openingPdvId === row.pdv._id;
                return (
                  <article
                    key={`${row.businessId}:${row.pdv._id}`}
                    className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                        <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
                            {row.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {row.business.name || 'Empresa'}
                            {row.pdvCode ? ` · PDV ${row.pdvCode}` : ''}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {row.terminalCode ? (
                            <button
                              type="button"
                              onClick={() => void copyText('Código tablet', row.terminalCode)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-2.5 py-1.5 text-xs font-mono font-semibold text-gray-800 dark:text-gray-100"
                            >
                              <Monitor className="w-3.5 h-3.5" />
                              {row.terminalCode}
                              <Copy className="w-3 h-3 opacity-60" />
                            </button>
                          ) : (
                            <span className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 rounded-lg">
                              Sin código tablet — regénéralo en Ajustes
                            </span>
                          )}
                          {row.pdvCode && (
                            <button
                              type="button"
                              onClick={() => void copyText('Código PDV', row.pdvCode)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-mono text-gray-600 dark:text-gray-300"
                            >
                              PDV {row.pdvCode}
                              <Copy className="w-3 h-3 opacity-60" />
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {row.terminalCode && (
                            <button
                              type="button"
                              onClick={() => openTabletLoginWithCode(row.terminalCode)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Probar código
                            </button>
                          )}
                          <ACCESO__Button
                            variant="primary"
                            disabled={busy}
                            onClick={() => void openTpvForStore(row)}
                          >
                            {busy ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ArrowRight className="w-4 h-4" />
                            )}
                            Abrir TPV
                          </ACCESO__Button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
