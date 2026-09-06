import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plug, Save, Loader2, Eye, EyeOff, ToggleLeft, ToggleRight, ExternalLink, Copy, Check, Link2, Store, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { getApiBase } from '../../lib/apiBase';
import {
  completeUberEatsOAuthRequest,
  getDeliveryIntegrationsRequest,
  getUberEatsOAuthConfigRequest,
  listUberEatsStoresRequest,
  saveDeliveryIntegrationsRequest,
  selectUberEatsStoreRequest,
  startUberEatsOAuthRequest,
  pushUberEatsMenuRequest,
  setUberEatsStoreStatusRequest,
  type DeliveryIntegrations,
  type UberEatsOAuthConfig,
  type UberEatsStoreOption,
} from '../../lib/webApi';
import { Layout } from '../../components/saas/Layout';
import {
  DEFAULT_DELIVERY_INTEGRATIONS,
  AGGREGATOR_PLATFORMS,
  normalizeDeliveryIntegrations,
} from '../../lib/deliveryIntegrationsUi';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { isVertialSuperAdminEmail } from '../../lib/superAdmin';
import { VERTIAL_BTN_PRIMARY, VERTIAL_SURFACE } from '../../lib/vertialUiTokens';

const UBER_PRIMARY_WEBHOOK = 'https://vertialapp.com/api/delivery-webhooks/ubereats';

export function DeliveryIntegrations() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const isRestaurant = isRestaurantBusinessType(currentBusiness?.businessType);
  const pageTitle = isRestaurant ? 'Integradores' : 'Integraciones';
  const canSeeTechSetup = isVertialSuperAdminEmail(user?.email);
  const [searchParams, setSearchParams] = useSearchParams();
  const oauthHandledRef = useRef<string | null>(null);

  const [integrations, setIntegrations] = useState<DeliveryIntegrations>(DEFAULT_DELIVERY_INTEGRATIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectingUber, setConnectingUber] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);
  const [selectingStoreId, setSelectingStoreId] = useState<string | null>(null);
  const [pushingMenu, setPushingMenu] = useState(false);
  const [settingUberStatus, setSettingUberStatus] = useState(false);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uberCfg, setUberCfg] = useState<UberEatsOAuthConfig | null>(null);
  const [uberStores, setUberStores] = useState<UberEatsStoreOption[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const apiBase = useMemo(() => getApiBase(), []);
  const buildWebhookUrl = useCallback(
    (urlSlug: string): string => `${apiBase}/api/delivery-webhooks/${urlSlug}/${businessId}`,
    [apiBase, businessId],
  );

  const applyIntegrations = useCallback((raw: DeliveryIntegrations | null | undefined) => {
    setIntegrations(normalizeDeliveryIntegrations(raw));
  }, []);

  const copyText = useCallback(async (key: string, url: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      toast.success(okMsg);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      toast.error('No se pudo copiar');
    }
  }, []);

  const loadIntegrations = useCallback(async () => {
    if (!businessId) {
      setIntegrations(DEFAULT_DELIVERY_INTEGRATIONS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getDeliveryIntegrationsRequest(businessId);
      applyIntegrations(res.integrations);
    } catch {
      applyIntegrations(DEFAULT_DELIVERY_INTEGRATIONS);
      toast.error('No se pudieron cargar las integraciones');
    } finally {
      setLoading(false);
    }
  }, [businessId, applyIntegrations]);

  const refreshUberStores = useCallback(async () => {
    if (!businessId || !integrations.uber?.oauth) return;
    setLoadingStores(true);
    try {
      const res = await listUberEatsStoresRequest(businessId);
      setUberStores(Array.isArray(res.stores) ? res.stores : []);
    } catch {
      setUberStores([]);
    } finally {
      setLoadingStores(false);
    }
  }, [businessId, integrations.uber?.oauth]);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await getUberEatsOAuthConfigRequest();
        if (!cancelled) {
          setUberCfg({
            configured: Boolean(cfg.configured),
            env: String(cfg.env || 'sandbox'),
            redirectUri: String(cfg.redirectUri || ''),
            scopes: String(cfg.scopes || ''),
            clientIdPreview: cfg.clientIdPreview,
          });
        }
      } catch {
        if (!cancelled) setUberCfg({ configured: false, env: 'sandbox', redirectUri: '', scopes: '' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (integrations.uber?.oauth) void refreshUberStores();
  }, [integrations.uber?.oauth, refreshUberStores]);

  useEffect(() => {
    if (!businessId) return;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const err = searchParams.get('error');
    if (err) {
      toast.error(`No se pudo conectar Uber: ${err}`);
      setSearchParams({}, { replace: true });
      return;
    }
    if (!code || !state) return;
    const key = `${code}:${state}`;
    if (oauthHandledRef.current === key) return;
    oauthHandledRef.current = key;

    void (async () => {
      setConnectingUber(true);
      try {
        const res = await completeUberEatsOAuthRequest(code, state);
        if (res.integrations) applyIntegrations(res.integrations);
        if (Array.isArray(res.stores)) setUberStores(res.stores);
        toast.success(
          res.stores?.length
            ? 'Uber conectado. Elige tu tienda abajo.'
            : 'Uber conectado. Si no ves tiendas, revisa la cuenta del restaurante.',
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo completar la conexión con Uber');
      } finally {
        setConnectingUber(false);
        setSearchParams({}, { replace: true });
      }
    })();
  }, [businessId, searchParams, setSearchParams, applyIntegrations]);

  const saveIntegrations = async () => {
    if (!businessId) return;
    setSaving(true);
    try {
      const res = await saveDeliveryIntegrationsRequest(businessId, integrations);
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success('Integraciones guardadas');
    } catch {
      toast.error('Error al guardar integraciones');
    } finally {
      setSaving(false);
    }
  };

  const connectUberOAuth = async () => {
    if (!businessId) return;
    setConnectingUber(true);
    try {
      const res = await startUberEatsOAuthRequest(businessId);
      if (!res.authorizeUrl) throw new Error('Sin URL de autorización');
      window.location.href = res.authorizeUrl;
    } catch (e) {
      setConnectingUber(false);
      toast.error(e instanceof Error ? e.message : 'No se pudo iniciar la conexión con Uber');
    }
  };

  const selectStore = async (store: UberEatsStoreOption) => {
    if (!businessId) return;
    setSelectingStoreId(store.storeId);
    try {
      const res = await selectUberEatsStoreRequest(businessId, store.storeId, store.name);
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success(`Tienda vinculada: ${store.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo vincular la tienda');
    } finally {
      setSelectingStoreId(null);
    }
  };

  const pushUberMenu = async () => {
    if (!businessId) return;
    setPushingMenu(true);
    try {
      const res = await pushUberEatsMenuRequest(businessId);
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success(`Menú Uber subido (${res.itemCount || 0} productos)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el menú');
    } finally {
      setPushingMenu(false);
    }
  };

  const setUberOnline = async (online: boolean) => {
    if (!businessId) return;
    setSettingUberStatus(true);
    try {
      const res = await setUberEatsStoreStatusRequest(businessId, online ? 'ONLINE' : 'PAUSED', {
        reason: online ? 'Opened by Vertial' : 'Paused by Vertial',
      });
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success(online ? 'Tienda Uber ONLINE' : 'Tienda Uber en pausa');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado Uber');
    } finally {
      setSettingUberStatus(false);
    }
  };

  const toggleEnabled = (key: keyof DeliveryIntegrations) => {
    setIntegrations((prev) => {
      const current = prev[key] ?? DEFAULT_DELIVERY_INTEGRATIONS[key];
      return {
        ...normalizeDeliveryIntegrations(prev),
        [key]: { ...current, enabled: !current.enabled },
      };
    });
  };

  const activeCount = AGGREGATOR_PLATFORMS.filter((p) => integrations[p.integrationKey]?.enabled).length;
  const uberOauth = Boolean(integrations.uber?.oauth);
  const uberStoreLinked = Boolean(integrations.uber?.storeId);

  const platformCards = [
    { key: 'uber' as const, urlSlug: 'ubereats', devUrl: 'https://developer.uber.com/docs/eats' },
    { key: 'globo' as const, urlSlug: 'glovo', devUrl: 'https://developers.glovoapp.com/' },
    { key: 'justead' as const, urlSlug: 'justeat', devUrl: 'https://developers.just-eat.com/' },
    { key: 'flipdish' as const, urlSlug: 'flipdish', devUrl: 'https://api-docs.flipdish.com/' },
  ].map(({ key, urlSlug, devUrl }) => {
    const def = AGGREGATOR_PLATFORMS.find((p) => p.integrationKey === key)!;
    return { key, urlSlug, devUrl, ...def };
  });

  return (
    <Layout backTo="/saas/delivery-ops" title={pageTitle}>
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Plug className="w-5 h-5 text-[var(--v-blue,#2563eb)]" />
            {pageTitle}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Conecta tus plataformas para recibir pedidos en Vertial.
            {activeCount > 0 && (
              <span className="ml-1 text-emerald-600 font-medium">
                {activeCount} activa{activeCount === 1 ? '' : 's'}.
              </span>
            )}
          </p>
          {!businessId && !loading && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              Selecciona un negocio activo para conectar.
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-stone-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {platformCards.map(({ key, urlSlug, label, colorClass, accentClass, devUrl }) => {
              const entry = integrations[key] ?? DEFAULT_DELIVERY_INTEGRATIONS[key];
              const uberReady = key === 'uber' && uberOauth && uberStoreLinked;

              return (
                <div key={key} className={`${VERTIAL_SURFACE} border ${accentClass} p-3.5 space-y-2.5`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${colorClass}`}>{label}</span>
                      {key === 'uber' ? (
                        <>
                          {uberReady ? (
                            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                              Conectada
                            </span>
                          ) : uberOauth ? (
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                              Elige tienda
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-full">
                              Sin conectar
                            </span>
                          )}
                        </>
                      ) : (
                        entry.enabled && (
                          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                            Activa
                          </span>
                        )
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleEnabled(key)}
                      className="text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors shrink-0"
                      title={entry.enabled ? 'Desactivar' : 'Activar'}
                    >
                      {entry.enabled
                        ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                        : <ToggleLeft className="w-7 h-7" />}
                    </button>
                  </div>

                  {key === 'uber' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-stone-600 dark:text-stone-400">
                        {uberReady
                          ? `Pedidos de ${integrations.uber.storeName || 'tu tienda Uber'} llegarán a Vertial.`
                          : uberOauth
                            ? 'Cuenta conectada. Elige el local que quieres vincular.'
                            : 'Inicia sesión con la cuenta Uber del restaurante y elige la tienda.'}
                      </p>

                      <button
                        type="button"
                        onClick={() => void connectUberOAuth()}
                        disabled={!businessId || connectingUber || uberCfg?.configured === false}
                        className={VERTIAL_BTN_PRIMARY}
                      >
                        {connectingUber ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        {uberOauth ? 'Cambiar cuenta Uber' : 'Conectar con Uber'}
                      </button>

                      {uberCfg?.configured === false && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Uber aún no está listo en el servidor. Contacta con Vertial.
                        </p>
                      )}

                      {uberOauth && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-stone-800 dark:text-stone-100 flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5" />
                              Tu tienda
                            </p>
                            <button
                              type="button"
                              onClick={() => void refreshUberStores()}
                              disabled={loadingStores}
                              className="text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline disabled:opacity-50"
                            >
                              {loadingStores ? 'Cargando…' : 'Actualizar'}
                            </button>
                          </div>

                          {uberStoreLinked && (
                            <p className="text-xs text-emerald-700 dark:text-emerald-400">
                              Vinculada: <strong>{integrations.uber.storeName || integrations.uber.storeId}</strong>
                            </p>
                          )}

                          {uberStoreLinked && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void pushUberMenu()}
                                disabled={pushingMenu}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-stone-900 text-white disabled:opacity-50"
                              >
                                {pushingMenu ? 'Subiendo menú…' : 'Subir menú a Uber'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void setUberOnline(true)}
                                disabled={settingUberStatus}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white disabled:opacity-50"
                              >
                                ONLINE
                              </button>
                              <button
                                type="button"
                                onClick={() => void setUberOnline(false)}
                                disabled={settingUberStatus}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-600 text-white disabled:opacity-50"
                              >
                                Pausar
                              </button>
                            </div>
                          )}

                          {loadingStores ? (
                            <div className="flex items-center gap-2 text-xs text-stone-500">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando tiendas…
                            </div>
                          ) : uberStores.length === 0 ? (
                            <p className="text-xs text-stone-500">
                              No hay tiendas en esta cuenta. Conecta con la cuenta del restaurante.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {uberStores.map((store) => {
                                const selected = integrations.uber.storeId === store.storeId;
                                const busy = selectingStoreId === store.storeId;
                                return (
                                  <li
                                    key={store.storeId}
                                    className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 ${
                                      selected
                                        ? 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/40'
                                        : 'border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-950'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">{store.name}</p>
                                      <p className="text-[10px] text-stone-500 truncate">
                                        {[store.address, store.city].filter(Boolean).join(', ') || store.storeId}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={busy || selected}
                                      onClick={() => void selectStore(store)}
                                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-50 ${
                                        selected
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-[var(--v-blue,#2563eb)] text-white hover:bg-[#1d4ed8]'
                                      }`}
                                    >
                                      {busy ? '…' : selected ? 'Activa' : 'Vincular'}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      Activa la plataforma cuando Vertial te lo indique. Los pedidos llegarán solos.
                    </p>
                  )}

                  {canSeeTechSetup && (
                    <div className="border-t border-stone-100 dark:border-stone-800 pt-2">
                      <button
                        type="button"
                        onClick={() => setAdvancedOpen((open) => !open)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                        Técnico (solo Vertial)
                      </button>

                      {advancedOpen && (
                        <div className="mt-3 space-y-3 rounded-xl border border-dashed border-stone-200 dark:border-stone-700 p-3 bg-stone-50/80 dark:bg-stone-900/40">
                          {key === 'uber' && uberCfg?.env && (
                            <p className="text-[11px] text-stone-500">
                              Entorno servidor: <strong>{uberCfg.env}</strong>
                              {uberCfg.configured === false ? ' · Faltan claves UBER_EATS_*' : ''}
                            </p>
                          )}

                          <div>
                            <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                              URL de webhook
                            </label>
                            <div className="flex items-stretch gap-2">
                              <code className="flex-1 px-3 py-2 text-[11px] font-mono break-all border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-950 text-stone-700 dark:text-stone-300">
                                {businessId ? buildWebhookUrl(urlSlug) : '—'}
                              </code>
                              <button
                                type="button"
                                onClick={() => void copyText(key, buildWebhookUrl(urlSlug), 'URL copiada')}
                                disabled={!businessId}
                                className="shrink-0 inline-flex items-center justify-center w-10 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 disabled:opacity-50"
                                title="Copiar URL"
                              >
                                {copiedKey === key ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {key === 'uber' && (
                            <div>
                              <p className="text-[10px] font-semibold text-stone-500 mb-1">Webhook primario</p>
                              <div className="flex gap-2">
                                <code className="flex-1 text-[10px] font-mono break-all px-2 py-1.5 rounded bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700">
                                  {UBER_PRIMARY_WEBHOOK}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => void copyText('uber-primary', UBER_PRIMARY_WEBHOOK, 'Webhook primario copiado')}
                                  className="shrink-0 w-9 inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-stone-700"
                                >
                                  {copiedKey === 'uber-primary' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                              Token secreto
                            </label>
                            <div className="relative">
                              <input
                                type={showTokens[key] ? 'text' : 'password'}
                                placeholder={`Token de ${label}`}
                                value={entry.token}
                                onChange={(e) => setIntegrations((prev) => {
                                  const current = prev[key] ?? DEFAULT_DELIVERY_INTEGRATIONS[key];
                                  return {
                                    ...normalizeDeliveryIntegrations(prev),
                                    [key]: { ...current, token: e.target.value },
                                  };
                                })}
                                className="w-full px-3 py-2 pr-10 text-sm border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-950 text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }))}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                              >
                                {showTokens[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          <a
                            href={devUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[var(--v-blue,#2563eb)] hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Documentación de {label}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => void saveIntegrations()}
            disabled={saving || loading || !businessId}
            className={VERTIAL_BTN_PRIMARY}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>
    </Layout>
  );
}
