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
  disconnectUberEatsRequest,
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
  const [disconnectingUber, setDisconnectingUber] = useState(false);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uberCfg, setUberCfg] = useState<UberEatsOAuthConfig | null>(null);
  const [uberStores, setUberStores] = useState<UberEatsStoreOption[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualStoreId, setManualStoreId] = useState('');
  const [manualStoreName, setManualStoreName] = useState('');
  const [linkingManualStore, setLinkingManualStore] = useState(false);

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
    if (!businessId || !integrations.uber?.oauth) {
      setUberStores([]);
      return;
    }
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

  // Al cambiar de empresa Vertial: no arrastrar tiendas Uber de la anterior.
  useEffect(() => {
    setUberStores([]);
  }, [businessId]);

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

    // Si el usuario acaba de desconectar, no rearmar OAuth con ?code= viejo en la URL.
    try {
      if (sessionStorage.getItem('vertial_uber_oauth_block') === '1') {
        sessionStorage.removeItem('vertial_uber_oauth_block');
        setSearchParams({}, { replace: true });
        return;
      }
    } catch { /* ignore */ }

    const key = `${code}:${state}`;
    if (oauthHandledRef.current === key) {
      setSearchParams({}, { replace: true });
      return;
    }
    oauthHandledRef.current = key;
    // Limpiar URL YA para que un F5 / atrás no vuelva a conectar solo.
    setSearchParams({}, { replace: true });

    void (async () => {
      setConnectingUber(true);
      try {
        const res = await completeUberEatsOAuthRequest(code, state);
        if (res.integrations) applyIntegrations(res.integrations);
        if (Array.isArray(res.stores)) setUberStores(res.stores);
        toast.success(
          res.stores?.length
            ? 'Cuenta Uber conectada. Elige tu tienda (paso 2).'
            : 'Cuenta Uber conectada. Si no hay tiendas, pega el Store ID de TEST.',
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo completar la conexión con Uber');
      } finally {
        setConnectingUber(false);
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
    setUberStores([]);
    try {
      try { sessionStorage.removeItem('vertial_uber_oauth_block'); } catch { /* ignore */ }
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

  const linkManualStore = async () => {
    if (!businessId) return;
    const sid = manualStoreId.trim();
    if (!sid) {
      toast.error('Pega el Store ID de tu tienda TEST de Uber');
      return;
    }
    setLinkingManualStore(true);
    setSelectingStoreId(sid);
    try {
      const res = await selectUberEatsStoreRequest(businessId, sid, manualStoreName.trim() || sid);
      if (res.integrations) applyIntegrations(res.integrations);
      setManualStoreId('');
      setManualStoreName('');
      toast.success('Tienda vinculada. Siguiente: subir menú.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo vincular el Store ID');
    } finally {
      setLinkingManualStore(false);
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

  const disconnectUber = async () => {
    if (!businessId) {
      toast.error('No hay empresa activa');
      return;
    }
    setDisconnectingUber(true);
    // UI primero: quitar Modomio de pantalla aunque el servidor tarde.
    setUberStores([]);
    applyIntegrations({
      ...integrations,
      uber: {
        ...integrations.uber,
        enabled: false,
        oauth: false,
        connectedAt: '',
        expiresAt: '',
        storeId: '',
        storeName: '',
        provisionedAt: '',
      },
    });
    try {
      try { sessionStorage.setItem('vertial_uber_oauth_block', '1'); } catch { /* ignore */ }
      setSearchParams({}, { replace: true });
      oauthHandledRef.current = null;
      const res = await disconnectUberEatsRequest(businessId);
      if (res.integrations) applyIntegrations(res.integrations);
      setUberStores([]);
      setManualStoreId('');
      setManualStoreName('');
      toast.success('Uber desconectado');
      await loadIntegrations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo desconectar Uber');
      await loadIntegrations();
    } finally {
      setDisconnectingUber(false);
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
  const uberMenuPushed = Boolean(integrations.uber?.menuPushedAt);
  const uberOnline = String(integrations.uber?.lastStoreStatus || '').toUpperCase() === 'ONLINE';
  /** 0 sin conectar · 1 elige tienda · 2 menú/ONLINE · 3 listo */
  const uberStep = !uberOauth ? 0 : !uberStoreLinked ? 1 : !uberMenuPushed || !uberOnline ? 2 : 3;

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
          {businessId && currentBusiness?.name && (
            <p className="mt-1 text-[11px] text-stone-600 dark:text-stone-400">
              Empresa: <strong>{currentBusiness.name}</strong>
            </p>
          )}
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

              return (
                <div key={key} className={`${VERTIAL_SURFACE} border ${accentClass} p-3.5 space-y-2.5`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${colorClass}`}>{label}</span>
                      {key === 'uber' ? (
                        <>
                          {uberStep === 3 ? (
                            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                              Conectada
                            </span>
                          ) : uberStep === 2 ? (
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                              Paso 3 · Menú
                            </span>
                          ) : uberStep === 1 ? (
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                              Paso 2 · Tienda
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-full">
                              Paso 1 · Conectar
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
                    <div className="space-y-3">
                      <p className="text-[11px] text-stone-500">
                        {uberStep === 0 && 'Paso 1 de 3 · Conecta la cuenta Uber de esta empresa.'}
                        {uberStep === 1 && 'Paso 2 de 3 · Elige o pega la tienda TEST de este negocio.'}
                        {uberStep === 2 && 'Paso 3 de 3 · Sube el menú y pon la tienda ONLINE.'}
                        {uberStep === 3 && 'Uber listo: los pedidos llegarán a Vertial.'}
                      </p>

                      {uberCfg?.configured === false && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Uber aún no está listo en el servidor. Contacta con Vertial.
                        </p>
                      )}

                      {/* Estado 0: solo Conectar */}
                      {uberStep === 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-stone-600 dark:text-stone-400">
                            Al conectar, Vertial abre el login de Uber para esta empresa. No se arrastran tiendas de otros clientes.
                          </p>
                          <button
                            type="button"
                            onClick={() => void connectUberOAuth()}
                            disabled={!businessId || connectingUber || uberCfg?.configured === false}
                            className={VERTIAL_BTN_PRIMARY}
                          >
                            {connectingUber ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                            Conectar con Uber
                          </button>
                        </div>
                      )}

                      {/* Estado 1: lista o Store ID manual */}
                      {uberStep === 1 && (
                        <div className="space-y-2.5">
                          <p className="text-xs text-stone-600 dark:text-stone-400">
                            Solo aparecen tiendas disponibles para este negocio Vertial.
                          </p>

                          {loadingStores ? (
                            <div className="flex items-center gap-2 text-xs text-stone-500">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando tiendas…
                            </div>
                          ) : uberStores.length > 0 ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-stone-800 dark:text-stone-100 flex items-center gap-1.5">
                                  <Store className="w-3.5 h-3.5" />
                                  Elige tienda
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void refreshUberStores()}
                                  disabled={loadingStores}
                                  className="text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline disabled:opacity-50"
                                >
                                  Actualizar
                                </button>
                              </div>
                              <ul className="space-y-1.5">
                                {uberStores.map((store) => {
                                  const busy = selectingStoreId === store.storeId;
                                  return (
                                    <li
                                      key={store.storeId}
                                      className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-950 px-2.5 py-1.5"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">{store.name}</p>
                                        <p className="text-[10px] text-stone-500 truncate">
                                          {[store.address, store.city].filter(Boolean).join(', ') || store.storeId}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={busy || linkingManualStore}
                                        onClick={() => void selectStore(store)}
                                        className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--v-blue,#2563eb)] text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                                      >
                                        {busy ? '…' : 'Vincular'}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : (
                            <div className="space-y-2 rounded-xl border border-dashed border-stone-300 dark:border-stone-600 p-3 bg-stone-50/60 dark:bg-stone-900/30">
                              <p className="text-xs text-stone-700 dark:text-stone-300">
                                No hay tiendas Uber disponibles para este negocio. Pega el <strong>Store ID</strong> de tu tienda TEST del panel Uber.
                              </p>
                              <div>
                                <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                                  Store ID
                                </label>
                                <input
                                  type="text"
                                  value={manualStoreId}
                                  onChange={(e) => setManualStoreId(e.target.value)}
                                  placeholder="p. ej. abc123-…"
                                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-950 text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                                  Nombre (opcional)
                                </label>
                                <input
                                  type="text"
                                  value={manualStoreName}
                                  onChange={(e) => setManualStoreName(e.target.value)}
                                  placeholder="Nombre de la tienda TEST"
                                  className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-950 text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => void linkManualStore()}
                                disabled={!businessId || linkingManualStore || !manualStoreId.trim()}
                                className={VERTIAL_BTN_PRIMARY}
                              >
                                {linkingManualStore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                                Usar este Store ID
                              </button>
                              <button
                                type="button"
                                onClick={() => void refreshUberStores()}
                                disabled={loadingStores}
                                className="text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline disabled:opacity-50"
                              >
                                Volver a buscar tiendas
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => void disconnectUber()}
                            disabled={disconnectingUber}
                            className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline-offset-2 hover:underline disabled:opacity-50"
                          >
                            {disconnectingUber ? 'Desconectando…' : 'Desconectar y empezar de nuevo'}
                          </button>
                        </div>
                      )}

                      {/* Estado 2: menú + ONLINE */}
                      {uberStep === 2 && (
                        <div className="space-y-2.5">
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">
                            Tienda: <strong>{integrations.uber.storeName || integrations.uber.storeId}</strong>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void pushUberMenu()}
                              disabled={pushingMenu}
                              className={VERTIAL_BTN_PRIMARY}
                            >
                              {pushingMenu ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                              {uberMenuPushed ? 'Volver a subir menú' : 'Subir menú a Uber'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void setUberOnline(true)}
                              disabled={settingUberStatus || !uberMenuPushed}
                              className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white disabled:opacity-50"
                              title={!uberMenuPushed ? 'Sube el menú antes' : undefined}
                            >
                              {settingUberStatus ? '…' : 'Poner ONLINE'}
                            </button>
                          </div>
                          {!uberMenuPushed && (
                            <p className="text-[11px] text-stone-500">Primero sube el menú; después ONLINE.</p>
                          )}
                          {uberMenuPushed && !uberOnline && (
                            <p className="text-[11px] text-stone-500">Menú listo. Pulsa ONLINE para recibir pedidos de prueba.</p>
                          )}
                          <button
                            type="button"
                            onClick={() => void disconnectUber()}
                            disabled={disconnectingUber}
                            className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline-offset-2 hover:underline disabled:opacity-50"
                          >
                            {disconnectingUber ? 'Desconectando…' : 'Desconectar Uber'}
                          </button>
                        </div>
                      )}

                      {/* Estado 3: listo */}
                      {uberStep === 3 && (
                        <div className="space-y-2.5">
                          <p className="text-xs text-stone-600 dark:text-stone-400">
                            Pedidos de <strong>{integrations.uber.storeName || 'tu tienda Uber'}</strong> llegarán a Vertial.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void pushUberMenu()}
                              disabled={pushingMenu}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 disabled:opacity-50"
                            >
                              {pushingMenu ? 'Subiendo…' : 'Actualizar menú'}
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
                          <button
                            type="button"
                            onClick={() => void disconnectUber()}
                            disabled={disconnectingUber}
                            className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline-offset-2 hover:underline disabled:opacity-50"
                          >
                            {disconnectingUber ? 'Desconectando…' : 'Desconectar Uber'}
                          </button>
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
                              {uberOauth ? ' · OAuth OK' : ' · Sin OAuth'}
                              {integrations.uber?.storeId ? ` · store ${integrations.uber.storeId}` : ''}
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
