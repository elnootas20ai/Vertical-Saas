import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plug, Save, Loader2, Eye, EyeOff, ToggleLeft, ToggleRight, ExternalLink, Copy, Check, Link2, Store, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { getApiBase } from '../../lib/apiBase';
import {
  completeUberEatsOAuthRequest,
  activateUberEatsPosRequest,
  getDeliveryIntegrationsRequest,
  getUberCertStatusRequest,
  getUberEatsOAuthConfigRequest,
  listUberEatsStoresRequest,
  saveDeliveryIntegrationsRequest,
  selectUberEatsStoreRequest,
  selectUberEatsSalesPointRequest,
  startUberEatsOAuthRequest,
  pushUberEatsMenuRequest,
  setUberEatsStoreStatusRequest,
  updateUberEatsMenuItemRequest,
  disconnectUberEatsRequest,
  type DeliveryIntegrations,
  type UberEatsOAuthConfig,
  type UberEatsStoreOption,
  type UberCertStatus,
} from '../../lib/webApi';
import { Layout } from '../../components/saas/Layout';
import { ConfirmDestroyModal } from '../../components/saas/ConfirmDestroyModal';
import {
  DEFAULT_DELIVERY_INTEGRATIONS,
  AGGREGATOR_PLATFORMS,
  normalizeDeliveryIntegrations,
} from '../../lib/deliveryIntegrationsUi';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { isVertialSuperAdminEmail } from '../../lib/superAdmin';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_BTN_DANGER, VERTIAL_SURFACE } from '../../lib/vertialUiTokens';

const UBER_PRIMARY_WEBHOOK = 'https://vertialapp.com/api/delivery-webhooks/ubereats';

export function DeliveryIntegrations() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
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
  const [showDisconnectUberConfirm, setShowDisconnectUberConfirm] = useState(false);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uberCfg, setUberCfg] = useState<UberEatsOAuthConfig | null>(null);
  const [uberStores, setUberStores] = useState<UberEatsStoreOption[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualStoreId, setManualStoreId] = useState('');
  const [manualStoreName, setManualStoreName] = useState('');
  const [linkingManualStore, setLinkingManualStore] = useState(false);
  const [activatingUberPos, setActivatingUberPos] = useState(false);
  const [selectingUberPdv, setSelectingUberPdv] = useState(false);
  const [loadingUberCert, setLoadingUberCert] = useState(false);
  const [uberCertOpen, setUberCertOpen] = useState(true);
  const [uberCert, setUberCert] = useState<UberCertStatus | null>(null);
  const [uberTestItemId, setUberTestItemId] = useState('');
  const [updatingUberItem, setUpdatingUberItem] = useState(false);

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

  const loadUberCert = useCallback(async () => {
    if (!businessId || !integrations.uber?.oauth) {
      setUberCert(null);
      return;
    }
    setLoadingUberCert(true);
    try {
      const status = await getUberCertStatusRequest(businessId);
      setUberCert(
        status && Array.isArray(status.checks) && status.progress
          ? status
          : null,
      );
    } catch {
      setUberCert(null);
    } finally {
      setLoadingUberCert(false);
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
    void loadUberCert();
  }, [loadUberCert, integrations.uber?.storeId, integrations.uber?.menuPushedAt, integrations.uber?.lastStoreStatus]);

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
          res.storeSelectionRequired || res.stores?.length
            ? 'Cuenta Uber conectada. Elige ahora la tienda que devuelve Uber.'
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

  const connectUberOAuth = async (forceLogin = false) => {
    if (!businessId) return;
    setConnectingUber(true);
    setUberStores([]);
    try {
      try { sessionStorage.removeItem('vertial_uber_oauth_block'); } catch { /* ignore */ }
      const res = await startUberEatsOAuthRequest(businessId, forceLogin);
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
      await loadUberCert();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el menú');
    } finally {
      setPushingMenu(false);
    }
  };

  const activateUberPos = async () => {
    if (!businessId) return;
    setActivatingUberPos(true);
    try {
      const res = await activateUberEatsPosRequest(businessId);
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success('Integración POS de Uber activa');
      await loadUberCert();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo activar la integración POS');
      await loadUberCert();
    } finally {
      setActivatingUberPos(false);
    }
  };

  const selectUberPdv = async (salesPointId: string) => {
    if (!businessId || !salesPointId) return;
    setSelectingUberPdv(true);
    try {
      const res = await selectUberEatsSalesPointRequest(businessId, salesPointId);
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success(`Pedidos Uber asignados a ${res.salesPointName || 'este PDV'}`);
      await loadUberCert();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo asociar el PDV');
    } finally {
      setSelectingUberPdv(false);
    }
  };

  const testUberItemAvailability = async (suspended: boolean) => {
    if (!businessId || !uberTestItemId.trim()) {
      toast.error('Escribe el SKU/ID de un producto del menú test');
      return;
    }
    setUpdatingUberItem(true);
    try {
      const res = await updateUberEatsMenuItemRequest(
        businessId,
        uberTestItemId.trim(),
        suspended,
      );
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success(suspended ? 'Producto marcado sin stock en Uber' : 'Producto disponible en Uber');
      await loadUberCert();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el producto');
    } finally {
      setUpdatingUberItem(false);
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
      await loadUberCert();
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
    setUberStores([]);
    setUberCert(null);
    applyIntegrations({
      ...integrations,
      uber: {
        ...DEFAULT_DELIVERY_INTEGRATIONS.uber,
        enabled: false,
        oauth: false,
        env: integrations.uber?.env || uberCfg?.env || 'sandbox',
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
      setShowDisconnectUberConfirm(false);
      toast.success('Uber apagado / desconectado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo desconectar en el servidor (ya está limpio en pantalla)');
    } finally {
      setDisconnectingUber(false);
    }
  };

  const reconnectUber = async () => {
    // Renovar OAuth no debe borrar Store, PDV, menú ni evidencias.
    // La desconexión completa ya tiene su propio botón explícito.
    await connectUberOAuth(true);
  };

  const turnUberOn = async () => {
    if (!businessId) return;
    const uber = integrations.uber;
    if (!uber?.oauth) {
      await connectUberOAuth();
      return;
    }
    if (uber.storeSelectionRequired) {
      toast.error('Elige primero una de las tiendas devueltas por Uber');
      return;
    }
    if (!uber.storeId) {
      toast.error('Elige primero la tienda Uber');
      return;
    }
    if (!uber.salesPointId) {
      toast.error('Elige el PDV que recibirá los pedidos');
      return;
    }
    setSettingUberStatus(true);
    try {
      const posOk = Boolean(uberCert?.posIntegrationEnabled || uber.posIntegrationEnabled);
      if (!posOk) {
        const pos = await activateUberEatsPosRequest(businessId);
        if (pos.integrations) applyIntegrations(pos.integrations);
      }
      if (!uber.menuPushedAt) {
        const menu = await pushUberEatsMenuRequest(businessId);
        if (menu.integrations) applyIntegrations(menu.integrations);
      }
      const res = await setUberEatsStoreStatusRequest(businessId, 'ONLINE', {
        reason: 'Opened by Vertial',
      });
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success('Uber ONLINE');
      await loadUberCert();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo encender Uber';
      toast.error(
        /scope|not allowed|user_not_allowed|eats\.store/i.test(msg)
          ? 'Faltan permisos. Pulsa Reconectar Uber y vuelve a intentar.'
          : msg,
      );
      await loadUberCert();
    } finally {
      setSettingUberStatus(false);
    }
  };

  const turnUberOff = async () => {
    if (!businessId) return;
    setSettingUberStatus(true);
    try {
      const res = await setUberEatsStoreStatusRequest(businessId, 'PAUSED', {
        reason: 'Paused by Vertial',
      });
      if (res.integrations) applyIntegrations(res.integrations);
      toast.success('Uber en pausa');
      await loadUberCert();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo pausar Uber');
    } finally {
      setSettingUberStatus(false);
    }
  };

  const toggleEnabled = (key: keyof DeliveryIntegrations) => {
    if (key === 'uber') return;
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
  const uberStoreSelectionRequired = Boolean(integrations.uber?.storeSelectionRequired);
  const uberPdvReady = Boolean(integrations.uber?.salesPointId);
  const uberPosReady = Boolean(
    uberCert?.posIntegrationEnabled
    || integrations.uber?.posIntegrationEnabled,
  );
  const uberMenuPushed = Boolean(integrations.uber?.menuPushedAt);
  const uberOnline = String(integrations.uber?.lastStoreStatus || '').toUpperCase() === 'ONLINE';
  const uberReceivingOrders = uberOnline && uberPosReady;
  const businessPdvs = (activeStoreScope?.pointsOfSale || []).filter((pdv) => pdv.active !== false);
  const soleBusinessPdv = businessPdvs.length === 1 ? businessPdvs[0] : null;
  const linkedPdvName = businessPdvs.find((pdv) => pdv._id === integrations.uber?.salesPointId)?.name
    || soleBusinessPdv?.name
    || '';

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
                          {uberCfg?.env === 'sandbox' && (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                              SANDBOX
                            </span>
                          )}
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            uberStoreSelectionRequired
                              ? 'text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300'
                              : uberReceivingOrders
                              ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30'
                              : uberOnline && !uberPosReady
                                ? 'text-amber-700 bg-amber-50 dark:bg-amber-900/30'
                              : uberOauth
                                ? 'text-amber-700 bg-amber-50 dark:bg-amber-900/30'
                                : 'text-stone-500 bg-stone-100 dark:bg-stone-800'
                          }`}>
                            {uberStoreSelectionRequired
                              ? 'Elige tienda'
                              : uberReceivingOrders
                              ? 'ONLINE'
                              : uberOnline && !uberPosReady
                                ? 'POS pendiente'
                                : uberOauth ? 'Conectada · pausa' : 'Apagada'}
                          </span>
                        </>
                      ) : (
                        entry.enabled && (
                          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                            Activa
                          </span>
                        )
                      )}
                    </div>
                    {key === 'uber' ? (
                      <button
                        type="button"
                        onClick={() => void (uberReceivingOrders ? turnUberOff() : turnUberOn())}
                        disabled={
                          disconnectingUber
                          || settingUberStatus
                          || activatingUberPos
                          || pushingMenu
                          || connectingUber
                          || (!uberOauth && uberCfg?.configured === false)
                        }
                        className="text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors shrink-0 disabled:opacity-40"
                        title={uberReceivingOrders ? 'Pausar pedidos Uber' : 'Activar pedidos Uber'}
                      >
                        {settingUberStatus || activatingUberPos || pushingMenu || connectingUber
                          ? <Loader2 className="w-7 h-7 animate-spin text-[var(--v-blue,#2563eb)]" />
                          : uberReceivingOrders
                            ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                            : <ToggleLeft className="w-7 h-7" />}
                      </button>
                    ) : (
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
                    )}
                  </div>

                  {key === 'uber' ? (
                    <div className="space-y-3">
                      <p className="text-[11px] text-stone-500">
                        {!uberOauth && 'Conecta Uber. El interruptor enciende/apaga esta cuenta.'}
                        {uberOauth && uberStoreSelectionRequired && 'Cuenta conectada. Elige debajo la tienda que quieres asociar.'}
                        {uberOauth && !uberStoreSelectionRequired && !uberStoreLinked && businessPdvs.length === 0 && 'Crea un PDV en esta empresa y vuelve a conectar.'}
                        {uberOauth && !uberStoreSelectionRequired && !uberStoreLinked && businessPdvs.length > 1 && 'Hay varios PDV: elige cuál recibe los pedidos Uber.'}
                        {uberOauth && !uberStoreSelectionRequired && !uberStoreLinked && soleBusinessPdv && uberStores.length > 1 && 'Hay varias tiendas Uber: elige la de esta cuenta.'}
                        {uberOauth && !uberStoreSelectionRequired && !uberStoreLinked && soleBusinessPdv && uberStores.length <= 1 && (loadingStores ? 'Cargando tiendas de Uber…' : 'Elige la tienda de esta cuenta.')}
                        {uberOauth && !uberStoreSelectionRequired && uberStoreLinked && !uberPosReady && 'Cuenta y tienda conectadas. Pulsa el interruptor para activar el POS.'}
                        {uberOauth && !uberStoreSelectionRequired && uberStoreLinked && uberPosReady && !uberOnline && 'Todo conectado. Pulsa el interruptor para recibir pedidos.'}
                        {!uberStoreSelectionRequired && uberReceivingOrders && 'Recibiendo pedidos. Pausa con el interruptor cuando quieras.'}
                      </p>

                      {uberCfg?.configured === false && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Uber aún no está listo en el servidor. Contacta con Vertial.
                        </p>
                      )}

                      {!uberOauth && (
                        <button
                          type="button"
                          onClick={() => void connectUberOAuth()}
                          disabled={!businessId || connectingUber || uberCfg?.configured === false}
                          className={VERTIAL_BTN_PRIMARY}
                        >
                          {connectingUber ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                          Conectar Uber
                        </button>
                      )}

                      {uberOauth && (!uberStoreLinked || uberStoreSelectionRequired) && (
                        <div className="space-y-2.5">
                          {soleBusinessPdv && (
                            <p className="text-xs text-stone-700 dark:text-stone-300">
                              PDV de esta cuenta: <strong>{soleBusinessPdv.name}</strong>
                            </p>
                          )}
                          {loadingStores ? (
                            <div className="flex items-center gap-2 text-xs text-stone-500">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enlazando…
                            </div>
                          ) : uberStores.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-stone-800 dark:text-stone-100">
                                {uberStores.length === 1
                                  ? 'Tienda devuelta por Uber'
                                  : 'Tiendas devueltas por Uber — elige una'}
                              </p>
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
                                        <p className="text-[10px] text-stone-500 truncate font-mono">{store.storeId}</p>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={busy || linkingManualStore}
                                        onClick={() => void selectStore(store)}
                                        className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--v-blue,#2563eb)] text-white disabled:opacity-50"
                                      >
                                        {busy ? '…' : 'Usar'}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : uberStores.length === 0 && !soleBusinessPdv ? (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              Esta empresa necesita exactamente un PDV (o elige uno si hay varios).
                            </p>
                          ) : uberStores.length === 0 ? (
                            <div className="space-y-2">
                              <p className="text-xs text-stone-600 dark:text-stone-400">
                                Uber no listó tiendas. Pega el Store ID de esta cuenta TEST.
                              </p>
                              <input
                                type="text"
                                value={manualStoreId}
                                onChange={(e) => setManualStoreId(e.target.value)}
                                placeholder="Store ID"
                                className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-950"
                              />
                              <button
                                type="button"
                                onClick={() => void linkManualStore()}
                                disabled={!businessId || linkingManualStore || !manualStoreId.trim()}
                                className={VERTIAL_BTN_PRIMARY}
                              >
                                {linkingManualStore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                                Enlazar Store ID
                              </button>
                            </div>
                          ) : null}
                          {businessPdvs.length > 1 && (
                            <label className="block">
                              <span className="block text-[10px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                                PDV de esta cuenta
                              </span>
                              <select
                                value={integrations.uber?.salesPointId || ''}
                                onChange={(event) => void selectUberPdv(event.target.value)}
                                disabled={selectingUberPdv}
                                className="w-full px-2.5 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                              >
                                <option value="">Selecciona el PDV</option>
                                {businessPdvs.map((pdv) => (
                                  <option key={pdv._id} value={pdv._id}>{pdv.name}</option>
                                ))}
                              </select>
                            </label>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowDisconnectUberConfirm(true)}
                            disabled={disconnectingUber}
                            className="text-xs font-semibold text-stone-500 hover:underline disabled:opacity-50"
                          >
                            Desvincular esta cuenta
                          </button>
                        </div>
                      )}

                      {uberOauth && uberStoreLinked && !uberStoreSelectionRequired && (
                        <div className="space-y-2.5">
                          <p className="text-xs text-stone-700 dark:text-stone-300">
                            Cuenta: <strong>{linkedPdvName || integrations.uber.storeName || 'PDV'}</strong>
                          </p>
                          {businessPdvs.length > 1 ? (
                            <label className="block">
                              <span className="block text-[10px] font-bold uppercase tracking-wide text-stone-500 mb-1">
                                PDV de pedidos
                              </span>
                              <select
                                value={integrations.uber?.salesPointId || ''}
                                onChange={(event) => void selectUberPdv(event.target.value)}
                                disabled={selectingUberPdv}
                                className="w-full px-2.5 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                              >
                                <option value="">Selecciona un PDV</option>
                                {businessPdvs.map((pdv) => (
                                  <option key={pdv._id} value={pdv._id}>{pdv.name}</option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <p className="text-[11px] text-stone-500">
                              PDV: {linkedPdvName || 'el de esta empresa'}
                            </p>
                          )}
                          {!uberPdvReady && businessPdvs.length > 1 && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400">
                              Elige el PDV de esta cuenta antes de encender.
                            </p>
                          )}
                          {!uberPosReady && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400">
                              Si al encender falla el POS, pulsa Reconectar y luego el interruptor.
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void pushUberMenu()}
                              disabled={pushingMenu || !uberPosReady}
                              className={VERTIAL_BTN_SECONDARY}
                            >
                              {pushingMenu ? 'Subiendo…' : 'Actualizar menú'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void reconnectUber()}
                              disabled={disconnectingUber || connectingUber}
                              className={VERTIAL_BTN_SECONDARY}
                            >
                              Reconectar Uber
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      Activa la plataforma cuando Vertial te lo indique. Los pedidos llegarán solos.
                    </p>
                  )}

                  {key === 'uber' && uberOauth && (
                    <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/40 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setUberCertOpen((open) => !open)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                      >
                        <div>
                          <p className="text-xs font-bold text-stone-900 dark:text-stone-100">
                            Estado de certificación Uber
                          </p>
                          <p className="text-[10px] text-stone-500 mt-0.5">
                            {loadingUberCert
                              ? 'Comprobando sandbox…'
                              : uberCert?.progress
                                ? `${uberCert.progress.completed}/${uberCert.progress.total} pruebas verificadas`
                                : 'Sin datos de comprobación'}
                          </p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-stone-500 transition-transform ${uberCertOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {uberCertOpen && (
                        <div className="border-t border-stone-200 dark:border-stone-700 px-3 py-2.5">
                          {uberCert?.liveError && (
                            <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">
                              Uber: {uberCert.liveError}
                            </p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {(uberCert?.checks || []).map((check) => (
                              <div
                                key={check.key}
                                className="flex items-start gap-2 rounded-lg bg-white dark:bg-stone-950 border border-stone-100 dark:border-stone-800 px-2 py-1.5"
                              >
                                <span className={`mt-0.5 w-4 h-4 rounded-full inline-flex items-center justify-center shrink-0 ${
                                  check.status === 'ok'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : 'bg-stone-100 text-stone-400 dark:bg-stone-800'
                                }`}>
                                  {check.status === 'ok' ? <Check className="w-3 h-3" /> : '·'}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-stone-800 dark:text-stone-200">
                                    {check.label}
                                  </p>
                                  {check.detail && (
                                    <p className="text-[9px] text-stone-500 truncate" title={check.detail}>
                                      {check.detail}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {uberCfg?.env === 'sandbox' && uberMenuPushed && (
                            <div className="mt-2 rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/20 p-2">
                              <p className="text-[10px] font-bold text-blue-800 dark:text-blue-300">
                                Prueba de producto sandbox
                              </p>
                              <div className="mt-1.5 flex flex-col sm:flex-row gap-1.5">
                                <input
                                  value={uberTestItemId}
                                  onChange={(event) => setUberTestItemId(event.target.value)}
                                  placeholder="SKU/ID, p. ej. UBER-BURGER"
                                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-stone-950"
                                />
                                <button
                                  type="button"
                                  onClick={() => void testUberItemAvailability(true)}
                                  disabled={updatingUberItem}
                                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-amber-600 text-white disabled:opacity-50"
                                >
                                  Marcar sin stock
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void testUberItemAvailability(false)}
                                  disabled={updatingUberItem}
                                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-blue-300 text-blue-700 dark:text-blue-300 disabled:opacity-50"
                                >
                                  Restaurar
                                </button>
                              </div>
                            </div>
                          )}
                          {uberCfg?.env === 'sandbox' && uberPosReady && uberMenuPushed && uberOnline && (
                            <div className="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 p-2">
                              <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                                Siguiente: pedido real sandbox
                              </p>
                              <p className="mt-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                                Haz un pedido con la cuenta Uber de test. Llegará al TPV en Montaje:
                                primero Aceptar (o Denegar), después Enviar a Reparto.
                              </p>
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => void loadUberCert()}
                              disabled={loadingUberCert}
                              className="text-[11px] font-semibold text-[var(--v-blue,#2563eb)] hover:underline disabled:opacity-50"
                            >
                              {loadingUberCert ? 'Comprobando…' : 'Volver a comprobar'}
                            </button>
                            {Array.isArray(uberCert?.checks) && uberCert.checks.length > 0 && (
                              <button
                                type="button"
                                onClick={() => void copyText(
                                  'uber-cert',
                                  uberCert.checks
                                    .map((check) => `${check.status === 'ok' ? 'OK' : 'PENDIENTE'} · ${check.label}${check.detail ? ` · ${check.detail}` : ''}${check.at ? ` · ${check.at}` : ''}`)
                                    .join('\n'),
                                  'Evidencias Uber copiadas',
                                )}
                                className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 hover:underline"
                              >
                                {copiedKey === 'uber-cert' ? 'Evidencias copiadas' : 'Copiar evidencias'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </section>
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

                          {key === 'uber' && uberOauth && (
                            <div className="border-t border-stone-200 dark:border-stone-700 pt-3">
                              <button
                                type="button"
                                onClick={() => setShowDisconnectUberConfirm(true)}
                                disabled={disconnectingUber}
                                className={`${VERTIAL_BTN_DANGER} text-xs`}
                              >
                                {disconnectingUber ? 'Desvinculando…' : 'Desvincular cuenta Uber'}
                              </button>
                              <p className="mt-1.5 text-[10px] text-stone-500">
                                Solo para cambiar de comercio. El interruptor superior pausa los pedidos sin borrar la conexión.
                              </p>
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
      <ConfirmDestroyModal
        isOpen={showDisconnectUberConfirm}
        onClose={() => {
          if (!disconnectingUber) setShowDisconnectUberConfirm(false);
        }}
        onConfirm={disconnectUber}
        title="Desvincular cuenta Uber"
        description="Esto elimina la conexión OAuth, la tienda y el PDV asociados. Para dejar de recibir pedidos usa el interruptor, no desvincules la cuenta."
        itemName="DESCONECTAR"
        confirmLabel="Escribe DESCONECTAR para confirmar"
        destructiveLabel="Desvincular Uber"
        isDeleting={disconnectingUber}
        caseInsensitive
      />
    </Layout>
  );
}
