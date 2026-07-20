import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Monitor, Printer, RefreshCw, Save, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import {
  dedupePointsOfSale,
  listPointsOfSaleRequest,
  pointOfSaleDisplayLabel,
  type PointOfSale,
} from '../../../lib/deliveryApi';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { loadRetailStoresForBusiness } from '../../../verticals/retailScopeRegistry';
import type { Business } from '../../../lib/businessApi';
import {
  DEFAULT_PRINTER_CONFIG,
  cachePdvPrinterConfig,
  loadPdvPrinterCache,
  type VertialPrinterConfig,
  type VertialPrinterConnectionType,
} from '../../../lib/vertialPrint/printerConfig';
import { normalizeVertialPrinterConfig } from '../../../lib/vertialPrint/printerConfigNormalize';
import { isValidIpv4, sanitizeIpv4Input } from '../../../lib/vertialPrint/printerSetupStatus';
import { savePrinterConfigToPdv } from '../../../lib/vertialPrint/printerPdvSync';
import { setActivePrinterScope } from '../../../lib/vertialPrint/printerActiveScope';

type DraftByPdv = Record<string, VertialPrinterConfig>;

const CONNECTION_OPTIONS: Array<{
  id: VertialPrinterConnectionType;
  device: 'tablet' | 'pc';
  label: string;
  hint: string;
}> = [
  {
    id: 'network',
    device: 'tablet',
    label: 'Tablet / TPV — WiFi (IP)',
    hint: 'Impresora térmica en la misma WiFi. Sirve en tablet y también en PC si imprime por red.',
  },
  {
    id: 'system',
    device: 'pc',
    label: 'PC — Impresora del sistema',
    hint: 'Impresora instalada en Windows/macOS. No aplica en iPad.',
  },
  {
    id: 'browser',
    device: 'pc',
    label: 'PC — Ventana del navegador',
    hint: 'Diálogo de impresión del navegador en el PC. Respaldo rápido.',
  },
];

function configFromPdv(pdv: PointOfSale): VertialPrinterConfig {
  const fromServer = pdv.printerConfig
    ? normalizeVertialPrinterConfig({
        ...DEFAULT_PRINTER_CONFIG,
        ...pdv.printerConfig,
        connectionType: pdv.printerConfig.connectionType || 'network',
      })
    : null;
  if (fromServer && isValidIpv4(String(fromServer.networkHost || '').trim())) {
    return fromServer;
  }
  // Si se guardó en el TPV de esta tablet y el servidor aún no refleja, usar caché local.
  const cached = loadPdvPrinterCache(pdv._id);
  if (cached && isValidIpv4(String(cached.networkHost || '').trim())) {
    return normalizeVertialPrinterConfig({ ...cached, connectionType: 'network' });
  }
  return normalizeVertialPrinterConfig({
    ...DEFAULT_PRINTER_CONFIG,
    ...pdv.printerConfig,
    connectionType: pdv.printerConfig?.connectionType || 'network',
  });
}

function statusLabel(cfg: VertialPrinterConfig): string {
  if (cfg.connectionType === 'network') {
    const host = String(cfg.networkHost || '').trim();
    if (isValidIpv4(host)) return `WiFi ${host}:${cfg.networkPort || 9100}`;
    return 'Sin IP';
  }
  if (cfg.connectionType === 'system') {
    return String(cfg.systemPrinterName || '').trim() || 'Sin nombre';
  }
  return 'Navegador (PC)';
}

/**
 * Gestión de impresora por tienda (PC y tablet).
 * Guarda en el PDV; el TPV de esa tienda carga esta config.
 */
export function StorePrintersManager({
  variant = 'settings',
}: {
  /** admin = Panel administración; settings = Ajustes → Impresora (PC). */
  variant?: 'admin' | 'settings';
}) {
  const { user } = useAuth();
  const { currentBusiness, businesses, switchBusiness } = useBusiness();
  const {
    pointsOfSale: scopePointsOfSale,
    allPointsOfSale,
    refresh: refreshScope,
  } = useActiveStoreScope();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);

  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [drafts, setDrafts] = useState<DraftByPdv>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const businessOptions = useMemo(
    () => (Array.isArray(businesses) ? businesses : []).filter((b) => b?.business_id || b?.id),
    [businesses],
  );

  const applyStores = useCallback((list: PointOfSale[]) => {
    const unique = dedupePointsOfSale(list.filter((p) => p.active !== false));
    setStores(unique);
    const next: DraftByPdv = {};
    for (const pdv of unique) next[pdv._id] = configFromPdv(pdv);
    setDrafts(next);
  }, []);

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      await refreshScope().catch(() => undefined);

      // 1) Tiendas del negocio actual (mismo filtro que Ajustes → Tienda / TPV)
      const fromScope = dedupePointsOfSale(
        (scopePointsOfSale.length > 0 ? scopePointsOfSale : allPointsOfSale)
          .filter((p) => p.active !== false),
      );
      if (fromScope.length > 0) {
        applyStores(fromScope);
        return;
      }

      // 2) Carga retail del negocio (evita mezclar PDVs de otras empresas / duplicados)
      if (user && currentBusiness) {
        try {
          const state = await loadRetailStoresForBusiness(
            user,
            currentBusiness as Business,
            businesses as Business[],
            {
              includeInactivePdvs: false,
              tpvBootstrap: false,
              skipPdvMerge: true,
              ensureTabletCodes: false,
            },
          );
          const retail = dedupePointsOfSale(state.pointsOfSale || []);
          if (retail.length > 0) {
            applyStores(retail);
            return;
          }
        } catch {
          /* sigue al fallback API */
        }
      }

      if (!dataUserId) {
        applyStores([]);
        return;
      }
      const list = await listPointsOfSaleRequest(dataUserId, { includeInactive: false });
      applyStores(dedupePointsOfSale(list || []));
    } catch {
      toast.error('No se pudieron cargar las tiendas');
      applyStores([]);
    } finally {
      setLoading(false);
    }
  }, [
    applyStores,
    allPointsOfSale,
    businesses,
    currentBusiness,
    dataUserId,
    refreshScope,
    scopePointsOfSale,
    user,
  ]);

  useEffect(() => {
    const fromScope = dedupePointsOfSale(
      (scopePointsOfSale.length > 0 ? scopePointsOfSale : allPointsOfSale)
        .filter((p) => p.active !== false),
    );
    if (fromScope.length > 0) {
      applyStores(fromScope);
      return;
    }
    void loadStores();
    // Solo al montar / cambiar negocio o lista de tiendas del scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentBusiness?.business_id,
    currentBusiness?.id,
    scopePointsOfSale,
    allPointsOfSale,
    applyStores,
  ]);

  const updateDraft = useCallback((pdvId: string, patch: Partial<VertialPrinterConfig>) => {
    setDrafts((prev) => {
      const base = prev[pdvId] || { ...DEFAULT_PRINTER_CONFIG, connectionType: 'network' };
      return {
        ...prev,
        [pdvId]: normalizeVertialPrinterConfig({ ...base, ...patch }),
      };
    });
  }, []);

  const handleSave = useCallback(
    async (pdv: PointOfSale) => {
      if (!dataUserId) return;
      const draft = drafts[pdv._id];
      if (!draft) return;

      const next = normalizeVertialPrinterConfig(draft);
      if (next.connectionType === 'network' && !isValidIpv4(String(next.networkHost || '').trim())) {
        toast.error('Pon una IP válida (ej. 192.168.1.20) o cambia el modo de conexión');
        return;
      }
      if (next.connectionType === 'system' && !String(next.systemPrinterName || '').trim()) {
        toast.error('Indica el nombre de la impresora del sistema');
        return;
      }

      setSavingId(pdv._id);
      try {
        const saved = await savePrinterConfigToPdv(dataUserId, pdv, next, 'store');
        cachePdvPrinterConfig(saved._id, next);
        // Solo caché por tienda — NO pisar la config legacy del dispositivo (mezclaba IPs entre PDVs).
        setActivePrinterScope({ pdvId: saved._id, pdv: saved });
        setStores((prev) => prev.map((p) => (p._id === saved._id ? saved : p)));
        setDrafts((prev) => ({ ...prev, [saved._id]: configFromPdv(saved) }));
        toast.success(`Impresora guardada en «${pointOfSaleDisplayLabel(saved)}»`, {
          description: 'Queda en esa tienda. El TPV de esa tienda usa esta IP.',
        });
        void refreshScope().catch(() => undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar';
        toast.error(message);
      } finally {
        setSavingId(null);
      }
    },
    [dataUserId, drafts, refreshScope],
  );

  const bannerClass =
    variant === 'admin'
      ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20'
      : 'border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/20';
  const bannerIconClass =
    variant === 'admin'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-blue-600 dark:text-blue-400';
  const bannerTextClass =
    variant === 'admin'
      ? 'text-amber-950 dark:text-amber-100'
      : 'text-blue-950 dark:text-blue-100';
  const bannerBodyClass =
    variant === 'admin'
      ? 'text-amber-900/90 dark:text-amber-200/90'
      : 'text-blue-900/90 dark:text-blue-200/90';

  return (
    <div className="space-y-5 max-w-4xl">
      <div className={`rounded-2xl border px-4 py-3 ${bannerClass}`}>
        <div className="flex items-start gap-3">
          <Printer className={`w-5 h-5 shrink-0 mt-0.5 ${bannerIconClass}`} />
          <div className={`text-sm leading-relaxed ${bannerTextClass}`}>
            <p className="font-semibold">Impresora por tienda (tablet + PC)</p>
            <p className={`mt-1 ${bannerBodyClass}`}>
              Elige cómo imprime cada tienda. Lo guardado aquí llega al TPV de esa tienda.
              {' '}
              <strong>Tablet</strong>: WiFi con IP.
              {' '}
              <strong>PC</strong>: impresora del sistema o ventana del navegador.
              {' '}
              Si tablet y PC usan la misma térmica por red, elige WiFi (IP).
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {businessOptions.length > 1 ? (
          <label className="min-w-[14rem] flex-1">
            <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Negocio</span>
            <select
              value={String(currentBusiness?.business_id || currentBusiness?.id || '')}
              onChange={(e) => {
                const id = e.target.value;
                if (id) switchBusiness(id);
              }}
              className="w-full min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              {businessOptions.map((b) => {
                const id = String(b.business_id || b.id);
                return (
                  <option key={id} value={id}>
                    {b.name || id}
                  </option>
                );
              })}
            </select>
          </label>
        ) : (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Negocio</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
              {currentBusiness?.name || 'Sin negocio'}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => void loadStores()}
          disabled={loading || !dataUserId}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-100 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar tiendas
        </button>
      </div>

      {loading && stores.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando tiendas…
        </p>
      ) : null}

      {!loading && stores.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-sm text-gray-600 dark:text-gray-300">
          No hay tiendas en este negocio. Créalas en Ajustes → Empresa → Tienda.
        </div>
      ) : null}

      <div className="space-y-4">
        {stores.map((pdv) => {
          const draft = drafts[pdv._id] || configFromPdv(pdv);
          const saving = savingId === pdv._id;
          const mode = CONNECTION_OPTIONS.find((o) => o.id === draft.connectionType) || CONNECTION_OPTIONS[0];
          return (
            <section
              key={pdv._id}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    {pointOfSaleDisplayLabel(pdv)}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Estado: {statusLabel(draft)}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 px-2.5 py-1 rounded-lg">
                  {mode.device === 'tablet' ? (
                    <Smartphone className="w-3.5 h-3.5" />
                  ) : (
                    <Monitor className="w-3.5 h-3.5" />
                  )}
                  {mode.label}
                </span>
              </div>

              <fieldset>
                <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                  Cómo se conecta
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CONNECTION_OPTIONS.map((opt) => {
                    const selected = draft.connectionType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateDraft(pdv._id, { connectionType: opt.id })}
                        className={`text-left rounded-xl border px-3 py-3 min-h-[72px] touch-manipulation transition-colors ${
                          selected
                            ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-900/80 ring-1 ring-gray-900/10 dark:ring-gray-100/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {opt.device === 'tablet' ? (
                            <Smartphone className="w-4 h-4 shrink-0" />
                          ) : (
                            <Monitor className="w-4 h-4 shrink-0" />
                          )}
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {mode.hint}
                </p>
              </fieldset>

              {draft.connectionType === 'network' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="sm:col-span-2 block">
                    <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      IP de la impresora
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="192.168.1.20"
                      value={draft.networkHost || ''}
                      onChange={(e) =>
                        updateDraft(pdv._id, { networkHost: sanitizeIpv4Input(e.target.value) })
                      }
                      className="w-full min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm font-mono text-gray-900 dark:text-gray-100"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      Puerto
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={draft.networkPort || 9100}
                      onChange={(e) =>
                        updateDraft(pdv._id, {
                          networkPort: Math.max(1, Math.min(65535, Number(e.target.value) || 9100)),
                        })
                      }
                      className="w-full min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm font-mono text-gray-900 dark:text-gray-100"
                    />
                  </label>
                  <label className="sm:col-span-3 block">
                    <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      PC del mostrador (opcional, puente Vertial Print)
                    </span>
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder="Vacío = imprimir desde este dispositivo"
                      value={draft.bridgeHost || ''}
                      onChange={(e) => updateDraft(pdv._id, { bridgeHost: e.target.value.trim() })}
                      className="w-full min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm font-mono text-gray-900 dark:text-gray-100"
                    />
                  </label>
                </div>
              ) : null}

              {draft.connectionType === 'system' ? (
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Nombre de la impresora del sistema
                  </span>
                  <input
                    type="text"
                    value={draft.systemPrinterName || ''}
                    onChange={(e) => updateDraft(pdv._id, { systemPrinterName: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                    placeholder="Ej. EPSON TM-T20"
                  />
                </label>
              ) : null}

              <label className="block max-w-xs">
                <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  Ancho de papel
                </span>
                <select
                  value={draft.paperWidthMm === 58 ? 58 : 80}
                  onChange={(e) =>
                    updateDraft(pdv._id, {
                      paperWidthMm: Number(e.target.value) === 58 ? 58 : 80,
                    })
                  }
                  className="w-full min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value={80}>80 mm</option>
                  <option value={58}>58 mm</option>
                </select>
              </label>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => void handleSave(pdv)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Guardando…' : 'Guardar impresora de esta tienda'}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
