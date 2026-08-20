import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Mail,
  RefreshCw,
  Settings2,
  Shield,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import {
  dedupePointsOfSale,
  pointOfSaleDisplayLabel,
  type PointOfSale,
} from '../../lib/deliveryApi';
import {
  filterPointsOfSaleForWorkCenters,
  filterWorkCentersForBusinessScope,
  repairMissingRetailDeliveryPdvs,
  resolveBusinessScopeId,
} from '../../lib/deliverySetup';
import { coerceSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import { loadRetailStoresForBusiness } from '../../verticals/retailScopeRegistry';
import type { Business } from '../../lib/businessApi';
import {
  getSupplierInvoiceEmailConfig,
  listSupplierInvoicePdvEmailConfigs,
  pollSupplierInvoicesNow,
  saveSupplierInvoiceEmailConfig,
  testSupplierInvoiceImap,
  type SupplierInvoiceEmailConfig,
  type SupplierInvoicePdvEmailStatus,
} from '../../lib/supplierInvoiceApi';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

type PageTab = 'pdvs' | 'config';
type MailProvider = 'gmail' | 'outlook' | 'other';

const PROVIDER_PRESETS: Record<
  Exclude<MailProvider, 'other'>,
  { host: string; port: number; tls: boolean }
> = {
  gmail: { host: 'imap.gmail.com', port: 993, tls: true },
  outlook: { host: 'outlook.office365.com', port: 993, tls: true },
};

function detectProvider(host: string, user: string): MailProvider {
  const h = String(host || '').toLowerCase();
  const u = String(user || '').toLowerCase();
  if (h.includes('gmail') || u.endsWith('@gmail.com') || u.endsWith('@googlemail.com')) return 'gmail';
  if (
    h.includes('outlook')
    || h.includes('office365')
    || h.includes('hotmail')
    || u.endsWith('@outlook.com')
    || u.endsWith('@hotmail.com')
    || u.endsWith('@live.com')
  ) {
    return 'outlook';
  }
  return 'other';
}

/**
 * Correo de facturas por empresa: PDVs activos de la empresa actual + Configuración.
 */
export function SupplierInvoiceEmailPage() {
  const navigate = useNavigate();
  const { currentBusiness, businesses } = useBusiness();
  const { user } = useAuth();
  const { activeSalesPointId, activePreferenceRaw, setActiveSalesPoint, refresh } =
    useActiveStoreScope();

  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const currentBizId = resolveBusinessScopeId(currentBusiness as Business | null);
  const businessName = String(currentBusiness?.name || '').trim() || 'Empresa';

  const [pageTab, setPageTab] = useState<PageTab>('pdvs');
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [pdvStatuses, setPdvStatuses] = useState<SupplierInvoicePdvEmailStatus[]>([]);
  const [selectedPdvId, setSelectedPdvId] = useState('');

  const [imapDraft, setImapDraft] = useState<Partial<SupplierInvoiceEmailConfig>>({});
  const [imapLoading, setImapLoading] = useState(false);
  const [imapSaving, setImapSaving] = useState(false);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapPolling, setImapPolling] = useState(false);
  const [pollSummary, setPollSummary] = useState<string | null>(null);
  const [lastTestOk, setLastTestOk] = useState(false);
  const [provider, setProvider] = useState<MailProvider>('gmail');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const businessList = useMemo(
    () => (Array.isArray(businesses) ? businesses : []).filter((b) => b?.business_id || b?.id),
    [businesses],
  );

  const knownBusinessIds = useMemo(
    () => businessList.map((b) => resolveBusinessScopeId(b as Business)).filter(Boolean),
    [businessList],
  );

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      await refresh().catch(() => undefined);
      if (!user || !currentBusiness || !currentBizId) {
        setStores([]);
        return;
      }
      let state = await loadRetailStoresForBusiness(
        user,
        currentBusiness as Business,
        businesses as Business[],
        {
          includeInactivePdvs: false,
          tpvBootstrap: false,
          skipPdvMerge: false,
          ensureTabletCodes: false,
          accountBusinessCount: businessList.length,
          knownBusinessIds,
        },
      );
      if (state.dataUserId) {
        state = {
          ...state,
          pointsOfSale: await repairMissingRetailDeliveryPdvs(
            state.dataUserId,
            state.workCenters,
            state.pointsOfSale,
            currentBusiness as Business,
          ),
        };
      }
      const centers = filterWorkCentersForBusinessScope(state.workCenters || [], currentBizId, {
        accountBusinessCount: businessList.length,
      });
      const scoped = dedupePointsOfSale(
        filterPointsOfSaleForWorkCenters(state.pointsOfSale || [], centers, {
          businessId: currentBizId,
        }).filter((p) => p.active !== false),
      );
      setStores(scoped);
    } catch {
      setStores([]);
    } finally {
      setLoadingStores(false);
    }
  }, [
    user,
    currentBusiness,
    currentBizId,
    businesses,
    businessList.length,
    knownBusinessIds,
    refresh,
  ]);

  const reloadPdvStatuses = useCallback(async () => {
    if (!dataUserId) {
      setPdvStatuses([]);
      return;
    }
    try {
      const { pdvs } = await listSupplierInvoicePdvEmailConfigs(dataUserId);
      setPdvStatuses(
        currentBizId
          ? pdvs.filter((p) => !p.businessId || p.businessId === currentBizId)
          : pdvs,
      );
    } catch {
      setPdvStatuses([]);
    }
  }, [dataUserId, currentBizId]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    void reloadPdvStatuses();
  }, [reloadPdvStatuses]);

  const resolvedPdvId = useMemo(() => {
    if (selectedPdvId && stores.some((s) => s._id === selectedPdvId)) return selectedPdvId;
    return coerceSelectedPdvId(stores, activeSalesPointId || activePreferenceRaw) || stores[0]?._id || '';
  }, [selectedPdvId, stores, activeSalesPointId, activePreferenceRaw]);

  const selectedPdv = useMemo(
    () => stores.find((s) => s._id === resolvedPdvId) || null,
    [stores, resolvedPdvId],
  );

  const statusById = useMemo(() => {
    const m = new Map<string, SupplierInvoicePdvEmailStatus>();
    for (const s of pdvStatuses) m.set(s.pdvId, s);
    return m;
  }, [pdvStatuses]);

  const connectedCount = useMemo(
    () => stores.filter((s) => statusById.get(s._id)?.connected).length,
    [stores, statusById],
  );

  useEffect(() => {
    if (!dataUserId || !resolvedPdvId || pageTab !== 'pdvs') {
      return;
    }
    let cancelled = false;
    setImapLoading(true);
    setLastTestOk(false);
    setPollSummary(null);
    getSupplierInvoiceEmailConfig(dataUserId, resolvedPdvId)
      .then((cfg) => {
        if (cancelled) return;
        setImapDraft(cfg);
        const detected = detectProvider(cfg.imapHost || '', cfg.imapUser || '');
        setProvider(detected);
        setShowAdvanced(
          Boolean(
            cfg.imapHost
            && cfg.imapHost !== PROVIDER_PRESETS.gmail.host
            && cfg.imapHost !== PROVIDER_PRESETS.outlook.host,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setImapDraft({});
      })
      .finally(() => {
        if (!cancelled) setImapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUserId, resolvedPdvId, pageTab]);

  useEffect(() => {
    if (provider === 'other') return;
    const preset = PROVIDER_PRESETS[provider];
    setImapDraft((p) => {
      if (p.imapHost === preset.host && Number(p.imapPort) === preset.port) return p;
      return {
        ...p,
        imapHost: preset.host,
        imapPort: preset.port,
        imapTls: preset.tls,
      };
    });
  }, [provider]);

  const isConnected = Boolean(
    String(imapDraft.imapHost || '').trim()
    && String(imapDraft.imapUser || '').trim()
    && imapDraft.enabled
    && (statusById.get(resolvedPdvId)?.connected || String(imapDraft.imapPassword || '').trim()),
  );

  const handleSelectPdv = (pdvId: string) => {
    const id = String(pdvId || '').trim();
    if (!id) return;
    setSelectedPdvId(id);
    setActiveSalesPoint(id);
    setPageTab('pdvs');
  };

  const handleSaveAndEnable = useCallback(async () => {
    if (!dataUserId || !resolvedPdvId) return;
    const userMail = String(imapDraft.imapUser || '').trim();
    if (!userMail) {
      toast.error('Pon el correo de este PDV');
      return;
    }
    if (!String(imapDraft.imapHost || '').trim()) {
      toast.error('Elige Gmail, Outlook u Otro');
      return;
    }
    const passRaw = String(imapDraft.imapPassword || '');
    const alreadySavedPass = passRaw === '••••••••' || Boolean(statusById.get(resolvedPdvId)?.connected);
    const passClean = passRaw === '••••••••' ? '' : passRaw.replace(/\s+/g, '').trim();
    if (!passClean && !alreadySavedPass) {
      toast.error('Pon la contraseña de aplicación (no la normal del correo)');
      return;
    }
    setImapSaving(true);
    try {
      const saved = await saveSupplierInvoiceEmailConfig(
        dataUserId,
        {
          ...imapDraft,
          imapUser: userMail,
          // Máscara → el backend conserva la contraseña ya guardada.
          imapPassword: passClean || '••••••••',
          enabled: true,
        },
        resolvedPdvId,
      );
      setImapDraft({
        ...saved,
        imapPassword: passClean || '••••••••',
      });
      await reloadPdvStatuses();
      toast.success('Correo del PDV guardado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar correo');
    } finally {
      setImapSaving(false);
    }
  }, [dataUserId, imapDraft, resolvedPdvId, reloadPdvStatuses, statusById]);

  const handleTestImap = useCallback(async () => {
    setImapTesting(true);
    setPollSummary(null);
    setLastTestOk(false);
    try {
      const passRaw = String(imapDraft.imapPassword || '');
      const passClean =
        passRaw === '••••••••' ? undefined : passRaw.replace(/\s+/g, '').trim() || undefined;
      const result = await testSupplierInvoiceImap({
        imapHost: imapDraft.imapHost,
        imapPort: imapDraft.imapPort,
        imapUser: imapDraft.imapUser,
        imapPassword: passClean,
        imapTls: imapDraft.imapTls,
        userId: dataUserId || undefined,
        pdvId: resolvedPdvId || undefined,
      });
      if (result.ok) {
        setLastTestOk(true);
        const n = Number(result.totalMessages) || 0;
        // Probar OK → guardar y activar (con pass nueva o máscara si ya estaba guardada).
        if (dataUserId && resolvedPdvId && (passClean || passRaw === '••••••••')) {
          try {
            const saved = await saveSupplierInvoiceEmailConfig(
              dataUserId,
              {
                ...imapDraft,
                imapUser: String(imapDraft.imapUser || '').trim(),
                imapPassword: passClean || '••••••••',
                enabled: true,
              },
              resolvedPdvId,
            );
            setImapDraft({
              ...saved,
              imapPassword: passClean || '••••••••',
            });
            await reloadPdvStatuses();
            toast.success(
              n > 0
                ? `Correo conectado y activo · Inbox: ${n.toLocaleString('es-ES')} mensajes`
                : 'Correo conectado y activo. Ya puede leer facturas solo.',
              { duration: 7000 },
            );
          } catch (saveErr) {
            toast.error(
              saveErr instanceof Error
                ? `Conexión OK, pero no se pudo guardar: ${saveErr.message}`
                : 'Conexión OK, pero no se pudo guardar el correo',
            );
          }
        } else if (!imapDraft.enabled) {
          toast.success(
            n > 0
              ? `Conexión OK (${n.toLocaleString('es-ES')} msgs). Pulsa «Guardar y activar».`
              : 'Conexión OK. Pulsa «Guardar y activar».',
            { duration: 8000 },
          );
        } else {
          toast.success(
            n > 0
              ? `Conexión OK · Inbox: ${n.toLocaleString('es-ES')} mensajes`
              : 'Conexión OK',
            { duration: 5000 },
          );
        }
      } else {
        toast.error(
          /no password configured/i.test(String(result.error || ''))
            ? 'Falta la contraseña de aplicación. Guárdala y prueba otra vez.'
            : result.error || 'No se pudo conectar',
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al probar conexión');
    } finally {
      setImapTesting(false);
    }
  }, [imapDraft, dataUserId, resolvedPdvId, reloadPdvStatuses]);

  const handlePollInvoicesNow = useCallback(async () => {
    if (!dataUserId || !resolvedPdvId) return;
    setImapPolling(true);
    setPollSummary(null);
    try {
      const summary = await pollSupplierInvoicesNow(dataUserId, resolvedPdvId);
      const processed = Number(summary.processed) || 0;
      const created = Number(summary.created) || 0;
      if (summary.baselined || summary.message) {
        const msg = String(
          summary.message || 'Punto de partida listo. Envía un correo nuevo y sincroniza.',
        );
        setPollSummary(msg);
        toast.message(msg, { duration: 8000 });
        return;
      }
      let msg = `${processed} emails · ${created} facturas nuevas`;
      if (processed === 0) {
        msg = '0 emails nuevos. Envía un PDF a este buzón y vuelve a sincronizar.';
        setPollSummary(msg);
        toast.message(msg, { duration: 7000 });
      } else if (created === 0) {
        msg = `${processed} emails revisados, 0 facturas creadas.`;
        setPollSummary(msg);
        toast.warning(msg);
      } else {
        setPollSummary(msg);
        toast.success(msg);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al sincronizar');
    } finally {
      setImapPolling(false);
    }
  }, [dataUserId, resolvedPdvId]);

  const inputClass =
    'mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

  const pageTabs: { id: PageTab; label: string; icon: typeof Store }[] = [
    { id: 'pdvs', label: 'PDVs', icon: Store },
    { id: 'config', label: 'Configuración', icon: Settings2 },
  ];

  return (
    <Layout
      title="Correo de facturas"
      subtitle={`${businessName} · un buzón por PDV activo`}
    >
      <div className="mx-auto max-w-4xl space-y-4 pb-10">
        {/* Tabs principales */}
        <div className="flex gap-1 border-b border-stone-200 dark:border-stone-800">
          {pageTabs.map((tab) => {
            const Icon = tab.icon;
            const active = pageTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPageTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-[var(--v-blue,#2563eb)] text-[var(--v-blue,#2563eb)]'
                    : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab PDVs ── */}
        {pageTab === 'pdvs' ? (
          <div className="space-y-4">
            {loadingStores ? (
              <p className="text-sm text-stone-400">Cargando PDVs de la empresa…</p>
            ) : stores.length === 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900 space-y-3">
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  Esta empresa no tiene PDVs activos. Créalos en Ajustes → Tienda.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/saas/settings')}
                  className={VERTIAL_BTN_SECONDARY}
                >
                  Ir a ajustes
                </button>
              </div>
            ) : (
              <>
                {/* Títulos PDV arriba */}
                <div className="flex flex-wrap gap-2">
                  {stores.map((pdv) => {
                    const st = statusById.get(pdv._id);
                    const active = pdv._id === resolvedPdvId;
                    return (
                      <button
                        key={pdv._id}
                        type="button"
                        onClick={() => handleSelectPdv(pdv._id)}
                        className={`inline-flex items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-semibold transition-colors ${
                          active
                            ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                            : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200'
                        }`}
                      >
                        {pointOfSaleDisplayLabel(pdv)}
                        {st?.connected ? (
                          <CheckCircle2
                            className={`h-3.5 w-3.5 shrink-0 ${
                              active ? 'text-emerald-300 dark:text-emerald-700' : 'text-emerald-600'
                            }`}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {/* Contenido del PDV seleccionado */}
                <section className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 p-4 sm:p-5 space-y-4">
                  {!selectedPdv ? (
                    <p className="text-sm text-stone-400">Elige un PDV arriba.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                            {pointOfSaleDisplayLabel(selectedPdv)}
                          </h2>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Correo y sincronización de facturas de este PDV
                          </p>
                        </div>
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            <Shield className="h-3.5 w-3.5" />
                            Configurado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                            Sin correo
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowHelp((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                      >
                        {showHelp ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        Cómo conectar (Gmail / Outlook)
                      </button>
                      {showHelp ? (
                        <ol className="text-xs text-stone-600 dark:text-stone-400 space-y-1.5 list-decimal pl-4 leading-relaxed">
                          <li>
                            Usa el correo donde llegan las facturas de <strong>esta</strong> tienda.
                          </li>
                          <li>
                            Crea una <strong>contraseña de aplicación</strong> (no la normal).
                          </li>
                          <li>Guarda, prueba y sincroniza. Revisa en Compras → Facturas.</li>
                        </ol>
                      ) : null}

                      {imapLoading ? (
                        <p className="text-sm text-stone-400">Cargando…</p>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-400">
                              Proveedor
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {(
                                [
                                  { id: 'gmail' as const, label: 'Gmail' },
                                  { id: 'outlook' as const, label: 'Outlook' },
                                  { id: 'other' as const, label: 'Otro' },
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => {
                                    setProvider(opt.id);
                                    setLastTestOk(false);
                                    setShowAdvanced(opt.id === 'other');
                                  }}
                                  className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors ${
                                    provider === opt.id
                                      ? 'border-blue-300 bg-blue-50 text-[var(--v-blue,#2563eb)] dark:border-blue-800 dark:bg-blue-950/40'
                                      : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <label className="block">
                              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                                Correo
                              </span>
                              <input
                                type="email"
                                value={imapDraft.imapUser || ''}
                                onChange={(e) => {
                                  setImapDraft((p) => ({ ...p, imapUser: e.target.value }));
                                  setLastTestOk(false);
                                }}
                                placeholder="facturas@tienda.com"
                                className={inputClass}
                                autoComplete="username"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                                Contraseña de aplicación
                              </span>
                              <input
                                type="password"
                                value={imapDraft.imapPassword || ''}
                                onChange={(e) => {
                                  setImapDraft((p) => ({ ...p, imapPassword: e.target.value }));
                                  setLastTestOk(false);
                                }}
                                placeholder="Contraseña de aplicación"
                                className={inputClass}
                                autoComplete="new-password"
                              />
                              <p className="mt-1 text-[11px] text-stone-500">
                                {provider === 'gmail' ? (
                                  <>
                                    Gmail → Seguridad → Contraseñas de aplicaciones.{' '}
                                    <a
                                      href="https://myaccount.google.com/apppasswords"
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-0.5 font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
                                    >
                                      Guía <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </>
                                ) : provider === 'outlook' ? (
                                  <>Outlook: Seguridad → Contraseñas de aplicación (con 2FA).</>
                                ) : (
                                  <>Si hace falta, abre Avanzado para host/puerto.</>
                                )}
                              </p>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowAdvanced((v) => !v)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                          >
                            {showAdvanced ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            Avanzado (IMAP)
                          </button>
                          {showAdvanced ? (
                            <div className="grid grid-cols-1 gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-950/50 sm:grid-cols-2">
                              <label className="block">
                                <span className="text-[10px] font-bold uppercase text-stone-400">
                                  Servidor
                                </span>
                                <input
                                  type="text"
                                  value={imapDraft.imapHost || ''}
                                  onChange={(e) =>
                                    setImapDraft((p) => ({ ...p, imapHost: e.target.value }))
                                  }
                                  className={inputClass}
                                />
                              </label>
                              <label className="block">
                                <span className="text-[10px] font-bold uppercase text-stone-400">
                                  Puerto
                                </span>
                                <input
                                  type="number"
                                  value={imapDraft.imapPort ?? 993}
                                  onChange={(e) =>
                                    setImapDraft((p) => ({
                                      ...p,
                                      imapPort: Number(e.target.value) || 993,
                                    }))
                                  }
                                  className={inputClass}
                                />
                              </label>
                            </div>
                          ) : provider !== 'other' ? (
                            <p className="text-xs text-stone-500 font-mono">
                              {imapDraft.imapHost || '—'} · {imapDraft.imapPort ?? 993}
                            </p>
                          ) : null}

                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap pt-1">
                            <button
                              type="button"
                              onClick={() => void handleSaveAndEnable()}
                              disabled={imapSaving || !dataUserId}
                              className={VERTIAL_BTN_PRIMARY}
                            >
                              {imapSaving ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4" />
                              )}
                              Guardar y activar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleTestImap()}
                              disabled={imapTesting}
                              className={VERTIAL_BTN_SECONDARY}
                            >
                              {imapTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                              Probar conexión
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePollInvoicesNow()}
                              disabled={imapPolling || !isConnected}
                              className={VERTIAL_BTN_SECONDARY}
                            >
                              {imapPolling ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              Sincronizar ahora
                            </button>
                          </div>
                          {pollSummary ? (
                            <p className="text-xs text-stone-600 dark:text-stone-400 rounded-xl bg-stone-50 dark:bg-stone-950/50 border border-stone-200 dark:border-stone-700 px-3 py-2">
                              {pollSummary}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </>
                  )}
                </section>
              </>
            )}
          </div>
        ) : null}

        {/* ── Tab Configuración ── */}
        {pageTab === 'config' ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Resumen · {businessName}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 dark:border-stone-800 dark:bg-stone-950/50">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    PDVs activos
                  </p>
                  <p className="mt-1 text-xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                    {stores.length}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 dark:border-stone-800 dark:bg-stone-950/50">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Con correo
                  </p>
                  <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {connectedCount}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 dark:border-stone-800 dark:bg-stone-950/50 col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Pendientes
                  </p>
                  <p className="mt-1 text-xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {Math.max(0, stores.length - connectedCount)}
                  </p>
                </div>
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                Cada PDV activo de esta empresa puede tener su propio buzón. Las facturas que entren
                por ese correo se asocian a esa tienda.
              </p>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Estado por PDV
                </h3>
              </div>
              {loadingStores ? (
                <p className="p-4 text-sm text-stone-400">Cargando…</p>
              ) : stores.length === 0 ? (
                <p className="p-4 text-sm text-stone-500">Sin PDVs activos en esta empresa.</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {stores.map((pdv) => {
                    const st = statusById.get(pdv._id);
                    return (
                      <li
                        key={pdv._id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                            {pointOfSaleDisplayLabel(pdv)}
                          </p>
                          <p className="text-xs text-stone-500 truncate mt-0.5">
                            {st?.connected ? st.imapUser || 'Conectado' : 'Sin correo configurado'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectPdv(pdv._id)}
                          className={VERTIAL_BTN_SECONDARY}
                        >
                          {st?.connected ? 'Editar' : 'Configurar'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 p-4 sm:p-5 space-y-2">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Notas</h3>
              <ul className="text-sm text-stone-600 dark:text-stone-400 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>Un buzón distinto por PDV evita mezclar facturas entre tiendas.</li>
                <li>Usa siempre contraseña de aplicación, no la contraseña normal del correo.</li>
                <li>
                  Tras conectar, las facturas aparecen en Compras → Facturas para confirmar.
                </li>
              </ul>
            </section>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
