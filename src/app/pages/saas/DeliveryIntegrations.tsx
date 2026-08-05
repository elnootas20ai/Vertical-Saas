import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plug, Save, Loader2, Eye, EyeOff, ToggleLeft, ToggleRight, ExternalLink, Copy, Check, Link2, Store,
} from 'lucide-react';
import { toast } from 'sonner';
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
  type DeliveryIntegrations,
  type UberEatsOAuthConfig,
  type UberEatsStoreOption,
} from '../../lib/webApi';
import { Layout } from '../../components/saas/Layout';
import { DEFAULT_DELIVERY_INTEGRATIONS, AGGREGATOR_PLATFORMS } from '../../lib/deliveryIntegrationsUi';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';

const UBER_PRIMARY_WEBHOOK = 'https://vertialapp.com/api/delivery-webhooks/ubereats';

export function DeliveryIntegrations() {
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const isRestaurant = isRestaurantBusinessType(currentBusiness?.businessType);
  const [searchParams, setSearchParams] = useSearchParams();
  const oauthHandledRef = useRef<string | null>(null);

  const [integrations, setIntegrations] = useState<DeliveryIntegrations>(DEFAULT_DELIVERY_INTEGRATIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectingUber, setConnectingUber] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);
  const [selectingStoreId, setSelectingStoreId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uberCfg, setUberCfg] = useState<UberEatsOAuthConfig | null>(null);
  const [uberStores, setUberStores] = useState<UberEatsStoreOption[]>([]);

  const apiBase = useMemo(() => getApiBase(), []);
  const buildWebhookUrl = useCallback(
    (urlSlug: string): string => `${apiBase}/api/delivery-webhooks/${urlSlug}/${businessId}`,
    [apiBase, businessId],
  );

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
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await getDeliveryIntegrationsRequest(businessId);
      if (res.integrations) setIntegrations(res.integrations);
    } catch {
      toast.error('No se pudieron cargar las integraciones');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

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
      toast.error(`Uber OAuth: ${err}`);
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
        if (res.integrations) setIntegrations(res.integrations);
        if (Array.isArray(res.stores)) setUberStores(res.stores);
        toast.success(
          res.stores?.length
            ? `Uber conectado. Elige la tienda (${res.stores.length}).`
            : 'Uber Eats conectado. Si no ves tiendas, la cuenta merchant aún no tiene locales.',
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo completar OAuth de Uber');
      } finally {
        setConnectingUber(false);
        setSearchParams({}, { replace: true });
      }
    })();
  }, [businessId, searchParams, setSearchParams]);

  const saveIntegrations = async () => {
    if (!businessId) return;
    setSaving(true);
    try {
      const res = await saveDeliveryIntegrationsRequest(businessId, integrations);
      if (res.integrations) setIntegrations(res.integrations);
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
      toast.error(e instanceof Error ? e.message : 'No se pudo iniciar OAuth de Uber');
    }
  };

  const selectStore = async (store: UberEatsStoreOption) => {
    if (!businessId) return;
    setSelectingStoreId(store.storeId);
    try {
      const res = await selectUberEatsStoreRequest(businessId, store.storeId, store.name);
      if (res.integrations) setIntegrations(res.integrations);
      toast.success(`Tienda vinculada: ${store.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo vincular la tienda');
    } finally {
      setSelectingStoreId(null);
    }
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
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Plug className="w-6 h-6 text-purple-600" />
            {isRestaurant ? 'Integradores' : 'Integraciones'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isRestaurant
              ? 'Conecta Glovo, Uber Eats, Just Eat y Flipdish si también recibes pedidos de plataformas en el local.'
              : 'Conecta Glovo, Uber Eats, Just Eat y Flipdish. Activa cada plataforma para recibir pedidos automáticos.'}
            {activeCount > 0 && (
              <span className="ml-1 text-green-600 font-medium">{activeCount} activa{activeCount === 1 ? '' : 's'}.</span>
            )}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {platformCards.map(({ key, urlSlug, label, colorClass, accentClass, devUrl }) => {
              const webhookUrl = buildWebhookUrl(urlSlug);
              const isCopied = copiedKey === key;
              return (
                <div key={key} className={`rounded-xl border ${accentClass} bg-white dark:bg-gray-800 p-5 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${colorClass}`}>{label}</span>
                      {integrations[key].enabled && (
                        <span className="text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                          Activo
                        </span>
                      )}
                      {key === 'uber' && uberOauth && (
                        <span className="text-[10px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                          OAuth
                        </span>
                      )}
                      {key === 'uber' && uberStoreLinked && (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                          Tienda vinculada
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIntegrations((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], enabled: !prev[key].enabled },
                      }))}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      {integrations[key].enabled
                        ? <ToggleRight className="w-8 h-8 text-green-500" />
                        : <ToggleLeft className="w-8 h-8" />}
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      URL de webhook (registra esta URL en {label})
                    </label>
                    <div className="flex items-stretch gap-2">
                      <code className="flex-1 px-3 py-2 text-[11px] font-mono break-all border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 select-all">
                        {businessId ? webhookUrl : 'Selecciona un negocio activo para ver la URL'}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyText(key, webhookUrl, 'URL copiada')}
                        disabled={!businessId}
                        className="shrink-0 inline-flex items-center justify-center w-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                        title="Copiar URL"
                      >
                        {isCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                      Autenticación con header <code className="text-[10px]">x-webhook-token</code> o query <code className="text-[10px]">?token=</code>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Token secreto <span className="font-normal text-gray-400">(webhook / caja; no es el OAuth de Uber)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showTokens[key] ? 'text' : 'password'}
                        placeholder={`Token de ${label}`}
                        value={integrations[key].token}
                        onChange={(e) => setIntegrations((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], token: e.target.value },
                        }))}
                        className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showTokens[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {key === 'uber' && (
                    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-3 space-y-3 bg-gray-50/80 dark:bg-gray-900/40">
                      <p className="text-[11px] text-gray-600 dark:text-gray-400">
                        Flujo Uber: <strong>1)</strong> Conectar cuenta merchant → <strong>2)</strong> Elegir tienda → pedidos al webhook.
                        {uberCfg?.env ? ` Entorno: ${uberCfg.env}.` : ''}
                        {uberCfg?.configured === false ? ' Faltan claves UBER_EATS_* en el servidor.' : ''}
                      </p>

                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Webhook primario (portal Uber)</p>
                        <div className="flex gap-2">
                          <code className="flex-1 text-[10px] font-mono break-all px-2 py-1.5 rounded bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700">
                            {UBER_PRIMARY_WEBHOOK}
                          </code>
                          <button
                            type="button"
                            onClick={() => void copyText('uber-primary', UBER_PRIMARY_WEBHOOK, 'Webhook primario copiado')}
                            className="shrink-0 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700"
                          >
                            {copiedKey === 'uber-primary' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void connectUberOAuth()}
                        disabled={!businessId || connectingUber || uberCfg?.configured === false}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-50"
                      >
                        {connectingUber ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                        {uberOauth ? 'Reconectar cuenta Uber' : '1. Conectar Uber Eats (OAuth)'}
                      </button>

                      {uberOauth && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1">
                              <Store className="w-3.5 h-3.5" />
                              2. Tienda Uber
                            </p>
                            <button
                              type="button"
                              onClick={() => void refreshUberStores()}
                              disabled={loadingStores}
                              className="text-[10px] font-semibold text-purple-600 hover:underline disabled:opacity-50"
                            >
                              {loadingStores ? 'Cargando…' : 'Actualizar lista'}
                            </button>
                          </div>

                          {uberStoreLinked ? (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                              Vinculada: <strong>{integrations.uber.storeName || integrations.uber.storeId}</strong>
                              {integrations.uber.provisionedAt
                                ? ` · ${new Date(integrations.uber.provisionedAt).toLocaleString('es-ES')}`
                                : ''}
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400">
                              Aún no hay tienda vinculada. Entra con la cuenta del restaurante en Conectar y elige local.
                            </p>
                          )}

                          {loadingStores ? (
                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando tiendas…
                            </div>
                          ) : uberStores.length === 0 ? (
                            <p className="text-[11px] text-gray-500">
                              No hay tiendas en esta cuenta Uber. Pide acceso merchant o tienda TEST a Uber.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {uberStores.map((store) => {
                                const selected = integrations.uber.storeId === store.storeId;
                                const busy = selectingStoreId === store.storeId;
                                return (
                                  <li
                                    key={store.storeId}
                                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
                                      selected
                                        ? 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/40'
                                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{store.name}</p>
                                      <p className="text-[10px] text-gray-500 truncate">
                                        {[store.address, store.city].filter(Boolean).join(', ') || store.storeId}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={busy || selected}
                                      onClick={() => void selectStore(store)}
                                      className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-black text-white disabled:opacity-50"
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
                  )}

                  <a
                    href={devUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Documentación de {label}
                  </a>
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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar integraciones
          </button>
        </div>
      </div>
    </Layout>
  );
}
