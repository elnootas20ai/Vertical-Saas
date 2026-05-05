import { useState, useEffect, useCallback } from 'react';
import {
  Globe, Eye, Settings2, Save, Loader2, ExternalLink, Copy, CheckCircle,
  Palette, MessageSquare, Truck, Store, Tag, Plus, Trash2, ToggleLeft,
  ToggleRight, Clock, MapPin, Phone, DollarSign, ImageIcon, AlertCircle, X,
  Layers, Package, MapPinned,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import {
  getWebConfigRequest,
  saveWebConfigRequest,
  type WebConfig as WebConfigType,
  type WebPromo,
  type VolumeDiscountRule,
  type ShippingZone,
  type ShippingOption,
} from '../../lib/webApi';
import { Layout } from '../../components/saas/Layout';

type Tab = 'preview' | 'config';

const DEFAULT_CONFIG: Partial<WebConfigType> = {
  slug: '',
  enabled: false,
  storeName: '',
  storeDescription: '',
  storeLogo: '',
  bannerImage: '',
  primaryColor: '#f59e0b',
  secondaryColor: '#1f2937',
  accentColor: '#10b981',
  backgroundColor: '#ffffff',
  welcomeMessage: '¡Bienvenido a nuestra tienda!',
  orderConfirmMessage: 'Tu pedido ha sido recibido. Te contactaremos pronto.',
  closedMessage: 'Estamos cerrados en este momento.',
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryFee: 0,
  minimumOrder: 0,
  estimatedDeliveryTime: '30-45 min',
  deliveryRadius: '',
  shippingMode: 'fixed',
  shippingZones: [],
  categories: [],
  promos: [],
  volumeDiscounts: [],
  isOpen: true,
  phone: '',
  address: '',
  currency: 'EUR',
  taxRate: 21,
};

export function WebConfig() {
  const { currentBusiness } = useBusiness();
  const [tab, setTab] = useState<Tab>('config');
  const [config, setConfig] = useState<Partial<WebConfigType>>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const businessId = currentBusiness?.business_id || '';

  const loadConfig = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await getWebConfigRequest(businessId);
      if (res.config) {
        setConfig(res.config);
      } else {
        setConfig({ ...DEFAULT_CONFIG, storeName: currentBusiness?.name || '', slug: slugify(currentBusiness?.name || '') });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Error al cargar configuración';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [businessId, currentBusiness?.name]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    if (!businessId) return;
    setSaving(true);
    setError('');
    try {
      const res = await saveWebConfigRequest(businessId, config);
      setConfig(res.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Error al guardar';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: string, value: unknown) => setConfig((prev) => ({ ...prev, [key]: value }));

  const addPromo = () => {
    const promos = [...(config.promos || [])];
    promos.push({
      id: `promo-${Date.now()}`,
      code: '',
      label: '',
      discountType: 'percentage',
      discountValue: 10,
      active: true,
    });
    updateConfig('promos', promos);
  };

  const updatePromo = (index: number, field: string, value: unknown) => {
    const promos = [...(config.promos || [])];
    promos[index] = { ...promos[index], [field]: value };
    updateConfig('promos', promos);
  };

  const removePromo = (index: number) => {
    const promos = [...(config.promos || [])];
    promos.splice(index, 1);
    updateConfig('promos', promos);
  };

  const addVolumeDiscount = () => {
    const rules = [...(config.volumeDiscounts || [])];
    rules.push({
      id: `vd-${Date.now()}`,
      minQuantity: 5,
      maxQuantity: null,
      discountType: 'percentage',
      discountValue: 5,
      label: '',
      active: true,
    });
    updateConfig('volumeDiscounts', rules);
  };

  const updateVolumeDiscount = (index: number, field: string, value: unknown) => {
    const rules = [...(config.volumeDiscounts || [])];
    rules[index] = { ...rules[index], [field]: value };
    updateConfig('volumeDiscounts', rules);
  };

  const removeVolumeDiscount = (index: number) => {
    const rules = [...(config.volumeDiscounts || [])];
    rules.splice(index, 1);
    updateConfig('volumeDiscounts', rules);
  };

  const addCategory = () => {
    if (!newCategory.trim()) return;
    const cats = [...(config.categories || [])];
    if (!cats.includes(newCategory.trim())) {
      cats.push(newCategory.trim());
      updateConfig('categories', cats);
    }
    setNewCategory('');
  };

  const removeCategory = (index: number) => {
    const cats = [...(config.categories || [])];
    cats.splice(index, 1);
    updateConfig('categories', cats);
  };

  const addShippingZone = () => {
    const zones = [...(config.shippingZones || [])];
    zones.push({
      id: `zone-${Date.now()}`,
      name: '',
      postalCodes: [],
      options: [{ id: `opt-${Date.now()}`, carrier: 'Envío estándar', rate: 0, estimatedTime: '' }],
      active: true,
    });
    updateConfig('shippingZones', zones);
  };

  const updateShippingZone = (index: number, field: string, value: unknown) => {
    const zones = [...(config.shippingZones || [])];
    zones[index] = { ...zones[index], [field]: value };
    updateConfig('shippingZones', zones);
  };

  const removeShippingZone = (index: number) => {
    const zones = [...(config.shippingZones || [])];
    zones.splice(index, 1);
    updateConfig('shippingZones', zones);
  };

  const addShippingOption = (zoneIndex: number) => {
    const zones = [...(config.shippingZones || [])];
    const options = [...(zones[zoneIndex].options || [])];
    options.push({ id: `opt-${Date.now()}`, carrier: '', rate: 0, estimatedTime: '' });
    zones[zoneIndex] = { ...zones[zoneIndex], options };
    updateConfig('shippingZones', zones);
  };

  const updateShippingOption = (zoneIndex: number, optIndex: number, field: string, value: unknown) => {
    const zones = [...(config.shippingZones || [])];
    const options = [...(zones[zoneIndex].options || [])];
    options[optIndex] = { ...options[optIndex], [field]: value };
    zones[zoneIndex] = { ...zones[zoneIndex], options };
    updateConfig('shippingZones', zones);
  };

  const removeShippingOption = (zoneIndex: number, optIndex: number) => {
    const zones = [...(config.shippingZones || [])];
    const options = [...(zones[zoneIndex].options || [])];
    options.splice(optIndex, 1);
    zones[zoneIndex] = { ...zones[zoneIndex], options };
    updateConfig('shippingZones', zones);
  };

  const storeUrl = config.slug
    ? `${window.location.origin}/web/${config.slug}`
    : '';

  const copyUrl = () => {
    if (!storeUrl) return;
    navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Layout title="Web Pedidos">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Web Pedidos">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Globe className="w-6 h-6 text-amber-600" />
              Tu Web de Pedidos
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Configura tu tienda online y recibe pedidos directamente
            </p>
          </div>
          <div className="flex items-center gap-2">
            {storeUrl && (
              <a
                href={storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Ver tienda
              </a>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 font-medium"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* URL preview */}
        {storeUrl && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <code className="text-sm text-amber-800 dark:text-amber-300 flex-1 truncate">{storeUrl}</code>
            <button onClick={copyUrl} className="text-amber-600 hover:text-amber-700 flex-shrink-0">
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
          <button
            onClick={() => setTab('config')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              tab === 'config'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Settings2 className="w-4 h-4" /> Configuración
          </button>
          <button
            onClick={() => setTab('preview')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              tab === 'preview'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Eye className="w-4 h-4" /> Vista Previa
          </button>
        </div>

        {tab === 'config' && (
          <div className="space-y-6">
            {/* General */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-gray-400" /> General
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">URL de la tienda *</label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">/web/</span>
                    <input
                      type="text"
                      value={config.slug || ''}
                      onChange={(e) => updateConfig('slug', slugify(e.target.value))}
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                      placeholder="mi-tienda"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Nombre de la tienda</label>
                  <input
                    type="text"
                    value={config.storeName || ''}
                    onChange={(e) => updateConfig('storeName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    placeholder="Nombre del negocio"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Descripción</label>
                  <textarea
                    value={config.storeDescription || ''}
                    onChange={(e) => updateConfig('storeDescription', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Teléfono</label>
                  <input type="tel" value={config.phone || ''} onChange={(e) => updateConfig('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Dirección</label>
                  <input type="text" value={config.address || ''} onChange={(e) => updateConfig('address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Tienda activa</p>
                    <p className="text-xs text-gray-500">Activa para que los clientes puedan ver tu tienda y hacer pedidos</p>
                  </div>
                  <button onClick={() => updateConfig('enabled', !config.enabled)} className="text-gray-500">
                    {config.enabled ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8" />}
                  </button>
                </div>
                <div className="sm:col-span-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Tienda abierta</p>
                    <p className="text-xs text-gray-500">Cuando está cerrada, los clientes ven un mensaje pero no pueden pedir</p>
                  </div>
                  <button onClick={() => updateConfig('isOpen', !config.isOpen)} className="text-gray-500">
                    {config.isOpen ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8" />}
                  </button>
                </div>
              </div>
            </section>

            {/* Colores */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Palette className="w-5 h-5 text-gray-400" /> Colores
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { key: 'primaryColor', label: 'Principal' },
                  { key: 'secondaryColor', label: 'Secundario' },
                  { key: 'accentColor', label: 'Acento' },
                  { key: 'backgroundColor', label: 'Fondo' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(config as Record<string, unknown>)[key] as string || '#000000'}
                        onChange={(e) => updateConfig(key, e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-gray-200 dark:border-gray-600"
                      />
                      <input
                        type="text"
                        value={(config as Record<string, unknown>)[key] as string || ''}
                        onChange={(e) => updateConfig(key, e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Mensajes */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-gray-400" /> Mensajes
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Mensaje de bienvenida</label>
                  <input type="text" value={config.welcomeMessage || ''} onChange={(e) => updateConfig('welcomeMessage', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Confirmación de pedido</label>
                  <input type="text" value={config.orderConfirmMessage || ''} onChange={(e) => updateConfig('orderConfirmMessage', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Mensaje de tienda cerrada</label>
                  <input type="text" value={config.closedMessage || ''} onChange={(e) => updateConfig('closedMessage', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
              </div>
            </section>

            {/* Entrega */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Truck className="w-5 h-5 text-gray-400" /> Opciones de entrega
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-gray-400" /><span className="text-sm">Envío a domicilio</span></div>
                  <button onClick={() => updateConfig('deliveryEnabled', !config.deliveryEnabled)}>
                    {config.deliveryEnabled ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Store className="w-4 h-4 text-gray-400" /><span className="text-sm">Recogida en tienda</span></div>
                  <button onClick={() => updateConfig('pickupEnabled', !config.pickupEnabled)}>
                    {config.pickupEnabled ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
                  </button>
                </div>

                {config.deliveryEnabled && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1.5 block">Modo de tarifa de envío</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateConfig('shippingMode', 'fixed')}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                            config.shippingMode !== 'zones'
                              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <DollarSign className="w-4 h-4" /> Tarifa fija
                        </button>
                        <button
                          onClick={() => updateConfig('shippingMode', 'zones')}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                            config.shippingMode === 'zones'
                              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <MapPinned className="w-4 h-4" /> Por zonas (C.P.)
                        </button>
                      </div>
                    </div>

                    {config.shippingMode !== 'zones' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Coste de envío (€)</label>
                          <input type="number" min="0" step="0.5" value={config.deliveryFee || 0} onChange={(e) => updateConfig('deliveryFee', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Pedido mínimo (€)</label>
                          <input type="number" min="0" step="0.5" value={config.minimumOrder || 0} onChange={(e) => updateConfig('minimumOrder', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Tiempo estimado</label>
                          <input type="text" value={config.estimatedDeliveryTime || ''} onChange={(e) => updateConfig('estimatedDeliveryTime', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                            placeholder="30-45 min"
                          />
                        </div>
                      </div>
                    )}

                    {config.shippingMode === 'zones' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Pedido mínimo (€)</label>
                            <input type="number" min="0" step="0.5" value={config.minimumOrder || 0} onChange={(e) => updateConfig('minimumOrder', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Tarifa por defecto (€)</label>
                            <input type="number" min="0" step="0.5" value={config.deliveryFee || 0} onChange={(e) => updateConfig('deliveryFee', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">Se aplica si el C.P. no coincide con ninguna zona</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <MapPinned className="w-4 h-4 text-gray-400" /> Zonas de envío
                          </h3>
                          <button onClick={addShippingZone} className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-medium">
                            <Plus className="w-4 h-4" /> Añadir zona
                          </button>
                        </div>

                        {(config.shippingZones || []).length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-4">No hay zonas configuradas. Añade una zona para empezar.</p>
                        )}

                        {(config.shippingZones || []).map((zone: ShippingZone, zi: number) => (
                          <div key={zone.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateShippingZone(zi, 'active', !zone.active)}>
                                  {zone.active ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                                </button>
                                <span className="text-xs text-gray-400">{zone.active ? 'Activa' : 'Inactiva'}</span>
                              </div>
                              <button onClick={() => removeShippingZone(zi)} className="text-gray-400 hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Nombre de la zona</label>
                                <input type="text" value={zone.name} onChange={(e) => updateShippingZone(zi, 'name', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                                  placeholder="Ej: Madrid Centro"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">Códigos postales</label>
                                <input
                                  type="text"
                                  value={(zone.postalCodes || []).join(', ')}
                                  onChange={(e) => updateShippingZone(zi, 'postalCodes', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                                  className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                                  placeholder="28*, 28001-28050, 08001"
                                />
                                <p className="text-[10px] text-gray-400 mt-0.5">Separados por coma. Usa * para prefijos y - para rangos</p>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Opciones de envío / transportistas</label>
                                <button onClick={() => addShippingOption(zi)} className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-0.5">
                                  <Plus className="w-3 h-3" /> Añadir
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(zone.options || []).map((opt: ShippingOption, oi: number) => (
                                  <div key={opt.id} className="flex items-center gap-2">
                                    <input type="text" value={opt.carrier} onChange={(e) => updateShippingOption(zi, oi, 'carrier', e.target.value)}
                                      className="flex-1 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                                      placeholder="Transportista"
                                    />
                                    <input type="number" min="0" step="0.5" value={opt.rate} onChange={(e) => updateShippingOption(zi, oi, 'rate', parseFloat(e.target.value) || 0)}
                                      className="w-20 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                                      placeholder="€"
                                    />
                                    <input type="text" value={opt.estimatedTime} onChange={(e) => updateShippingOption(zi, oi, 'estimatedTime', e.target.value)}
                                      className="w-24 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                                      placeholder="24-48h"
                                    />
                                    <button onClick={() => removeShippingOption(zi, oi)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* Categorías */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Tag className="w-5 h-5 text-gray-400" /> Categorías (filtros del menú)
              </h2>
              <div className="flex flex-wrap gap-2 mb-3">
                {(config.categories || []).map((cat, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm rounded-full">
                    {cat}
                    <button onClick={() => removeCategory(i)} className="hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  placeholder="Nueva categoría"
                />
                <button onClick={addCategory} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">Los productos del catálogo con estas categorías se mostrarán como filtros en la tienda</p>
            </section>

            {/* Promos */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-gray-400" /> Promociones
                </h2>
                <button onClick={addPromo} className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-medium">
                  <Plus className="w-4 h-4" /> Añadir
                </button>
              </div>
              {(config.promos || []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No hay promociones configuradas</p>
              )}
              <div className="space-y-3">
                {(config.promos || []).map((promo: WebPromo, i: number) => (
                  <div key={promo.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updatePromo(i, 'active', !promo.active)}>
                          {promo.active ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                        </button>
                        <span className="text-xs text-gray-400">{promo.active ? 'Activa' : 'Inactiva'}</span>
                      </div>
                      <button onClick={() => removePromo(i)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input type="text" value={promo.code} onChange={(e) => updatePromo(i, 'code', e.target.value.toUpperCase())}
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                        placeholder="CÓDIGO"
                      />
                      <input type="text" value={promo.label} onChange={(e) => updatePromo(i, 'label', e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                        placeholder="Descripción"
                      />
                      <select value={promo.discountType} onChange={(e) => updatePromo(i, 'discountType', e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                      >
                        <option value="percentage">% Descuento</option>
                        <option value="fixed">€ Fijo</option>
                      </select>
                      <input type="number" min="0" value={promo.discountValue} onChange={(e) => updatePromo(i, 'discountValue', parseFloat(e.target.value) || 0)}
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                        placeholder="Valor"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {/* Volume Discounts */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-gray-400" /> Descuentos por volumen
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Descuentos automáticos según la cantidad total de artículos en el pedido
                  </p>
                </div>
                <button onClick={addVolumeDiscount} className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-medium">
                  <Plus className="w-4 h-4" /> Añadir
                </button>
              </div>
              {(config.volumeDiscounts || []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No hay descuentos por volumen configurados</p>
              )}
              <div className="space-y-3">
                {(config.volumeDiscounts || []).map((rule: VolumeDiscountRule, i: number) => (
                  <div key={rule.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateVolumeDiscount(i, 'active', !rule.active)}>
                          {rule.active ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                        </button>
                        <span className="text-xs text-gray-400">{rule.active ? 'Activa' : 'Inactiva'}</span>
                      </div>
                      <button onClick={() => removeVolumeDiscount(i)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Mín. uds.</label>
                        <input type="number" min="1" value={rule.minQuantity} onChange={(e) => updateVolumeDiscount(i, 'minQuantity', parseInt(e.target.value) || 1)}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Máx. uds.</label>
                        <input type="number" min="0" value={rule.maxQuantity ?? ''} onChange={(e) => updateVolumeDiscount(i, 'maxQuantity', e.target.value === '' ? null : parseInt(e.target.value) || null)}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                          placeholder="∞"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Tipo</label>
                        <select value={rule.discountType} onChange={(e) => updateVolumeDiscount(i, 'discountType', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                        >
                          <option value="percentage">% Descuento</option>
                          <option value="fixed">€ Fijo</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Valor</label>
                        <input type="number" min="0" step="0.5" value={rule.discountValue} onChange={(e) => updateVolumeDiscount(i, 'discountValue', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Etiqueta</label>
                        <input type="text" value={rule.label} onChange={(e) => updateVolumeDiscount(i, 'label', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 dark:text-white focus:outline-none"
                          placeholder="Ej: -5% por 5+ uds."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'preview' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-2 bg-gray-50 dark:bg-gray-900">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-white dark:bg-gray-700 rounded-md px-3 py-1 text-xs text-gray-400 text-center truncate">
                  {storeUrl || 'vertialapp.com/web/tu-tienda'}
                </div>
              </div>
            </div>
            <div style={{ minHeight: '500px' }}>
              {config.slug ? (
                <iframe
                  src={`/web/${config.slug}`}
                  className="w-full border-0"
                  style={{ height: '600px' }}
                  title="Vista previa de la tienda"
                />
              ) : (
                <div className="flex items-center justify-center h-96 text-gray-400">
                  <div className="text-center">
                    <Globe className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Configura la URL de tu tienda para ver la vista previa</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
