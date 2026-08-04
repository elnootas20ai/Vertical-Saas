import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plug, Save, Loader2, Eye, EyeOff, ToggleLeft, ToggleRight, ExternalLink, Copy, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBusiness } from '../../context/BusinessContext';
import { getApiBase } from '../../lib/apiBase';
import {
  getDeliveryIntegrationsRequest,
  saveDeliveryIntegrationsRequest,
  type DeliveryIntegrations,
} from '../../lib/webApi';
import { Layout } from '../../components/saas/Layout';
import { DEFAULT_DELIVERY_INTEGRATIONS, AGGREGATOR_PLATFORMS } from '../../lib/deliveryIntegrationsUi';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';

export function DeliveryIntegrations() {
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const isRestaurant = isRestaurantBusinessType(currentBusiness?.businessType);

  const [integrations, setIntegrations] = useState<DeliveryIntegrations>(DEFAULT_DELIVERY_INTEGRATIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);
  const buildWebhookUrl = useCallback(
    (urlSlug: string): string => `${apiBase}/api/delivery-webhooks/${urlSlug}/${businessId}`,
    [apiBase, businessId],
  );

  const copyWebhookUrl = useCallback(async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      toast.success('URL copiada al portapapeles');
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      toast.error('No se pudo copiar la URL');
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

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

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

  const activeCount = AGGREGATOR_PLATFORMS.filter((p) => integrations[p.integrationKey]?.enabled).length;

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
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${colorClass}`}>{label}</span>
                      {integrations[key].enabled && (
                        <span className="text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                          Activo
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
                        onClick={() => copyWebhookUrl(key, webhookUrl)}
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
                      Token secreto <span className="font-normal text-gray-400">(opcional para caja; necesario para pedidos automáticos)</span>
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
