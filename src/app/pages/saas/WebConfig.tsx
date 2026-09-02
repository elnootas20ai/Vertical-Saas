/**
 * Web Pedidos — configuración SaaS.
 * Dos puertas: (1) Web de pedir con elección de tienda (2) QR de mesa (solo QR).
 * Plantilla Vertial fija; productos = catálogo SaaS.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe, Save, Loader2, ExternalLink, Copy, CheckCircle,
  Store, AlertCircle, QrCode, Truck, ShoppingBag, ChevronRight, ImageIcon, Palette, Printer, RefreshCw,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  getWebConfigRequest,
  saveWebConfigRequest,
  type WebConfig as WebConfigType,
} from '../../lib/webApi';
import {
  listPointsOfSaleRequest,
  pointOfSaleDisplayLabel,
  type PointOfSale,
} from '../../lib/deliveryApi';
import type { DiningTable } from '../../lib/salaApi';
import {
  buildMesaPublicUrl,
  buildMesaQrImageUrl,
  ensureMesaQrTokensRequest,
  printMesaQrSheet,
  regenerateMesaQrTokenRequest,
} from '../../lib/mesaQr';
import { Layout } from '../../components/saas/Layout';
import {
  normalizeWebCustomDomain,
  WebDnsSettingsModal,
} from '../../components/saas/WebDnsSettingsModal';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../lib/vertialUiTokens';
import { HOYPECAMOS_THEME } from '../../lib/webBrandThemes';

type Door = 'pedir' | 'mesas';

const COLOR_PRESETS = [
  {
    label: 'Hoy Pecamos',
    primary: HOYPECAMOS_THEME.primaryColor,
    secondary: HOYPECAMOS_THEME.secondaryColor,
    accent: HOYPECAMOS_THEME.accentColor,
    logo: HOYPECAMOS_THEME.storeLogo,
    storeName: HOYPECAMOS_THEME.storeName,
    welcomeMessage: HOYPECAMOS_THEME.welcomeMessage,
    storeDescription: HOYPECAMOS_THEME.storeDescription,
    backgroundColor: HOYPECAMOS_THEME.backgroundColor,
  },
  { label: 'Vertial', primary: '#2563EB', secondary: '#0B1220', accent: '#14B8A6' },
  { label: 'Verde', primary: '#16A34A', secondary: '#14532D', accent: '#22C55E' },
  { label: 'Negro', primary: '#0F172A', secondary: '#020617', accent: '#38BDF8' },
] as const;

const DEFAULT_CONFIG: Partial<WebConfigType> = {
  slug: '',
  customDomain: '',
  enabled: false,
  storeName: '',
  storeDescription: '',
  storeLogo: '',
  bannerImage: '',
  primaryColor: '#2563EB',
  secondaryColor: '#0B1220',
  accentColor: '#14B8A6',
  backgroundColor: '#ffffff',
  welcomeMessage: '¡Bienvenido!',
  orderConfirmMessage: 'Pedido recibido. Te contactaremos pronto.',
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
  salesPointIds: [],
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function WebConfig() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const [door, setDoor] = useState<Door>('pedir');
  const [config, setConfig] = useState<Partial<WebConfigType>>(DEFAULT_CONFIG);
  const [pdvs, setPdvs] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [mesaTables, setMesaTables] = useState<DiningTable[]>([]);
  const [mesaQrLoading, setMesaQrLoading] = useState(false);
  const [mesaQrBusyId, setMesaQrBusyId] = useState('');
  const [dnsOpen, setDnsOpen] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const businessId = currentBusiness?.business_id || '';
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const mesaOwnerUserId = String(user?.user_id || dataUserId || '').trim();

  const loadMesaQrTables = useCallback(async () => {
    if (!businessId || !mesaOwnerUserId) {
      setMesaTables([]);
      return;
    }
    setMesaQrLoading(true);
    try {
      const res = await ensureMesaQrTokensRequest(mesaOwnerUserId, businessId);
      setMesaTables(res.tables || []);
      if (res.created > 0) {
        toast.success(`${res.created} QR generados`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron cargar los QR');
      setMesaTables([]);
    } finally {
      setMesaQrLoading(false);
    }
  }, [businessId, mesaOwnerUserId]);

  useEffect(() => {
    if (door !== 'mesas') return;
    void loadMesaQrTables();
  }, [door, loadMesaQrTables]);

  const load = useCallback(async () => {
    if (!businessId || !dataUserId) return;
    setLoading(true);
    setError('');
    try {
      const [res, points] = await Promise.all([
        getWebConfigRequest(businessId),
        listPointsOfSaleRequest(dataUserId, { includeInactive: false }).catch(() => [] as PointOfSale[]),
      ]);
      const scoped = (points || []).filter((p) => {
        const bid = String(p.business_id || p.businessId || '').replace(/^business:/, '');
        const cur = String(businessId).replace(/^business:/, '');
        return !bid || bid === cur;
      });
      setPdvs(scoped);

      if (res.config) {
        const ids = Array.isArray(res.config.salesPointIds) ? res.config.salesPointIds : [];
        setConfig({
          ...DEFAULT_CONFIG,
          ...res.config,
          salesPointIds: ids.length > 0 ? ids : scoped.map((p) => p._id),
        });
      } else {
        setConfig({
          ...DEFAULT_CONFIG,
          storeName: currentBusiness?.name || '',
          slug: slugify(currentBusiness?.name || 'tienda'),
          salesPointIds: scoped.map((p) => p._id),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [businessId, dataUserId, currentBusiness?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateConfig = (key: string, value: unknown) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const selectedIds = useMemo(
    () => new Set((config.salesPointIds || []).map(String)),
    [config.salesPointIds],
  );

  const togglePdv = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateConfig('salesPointIds', [...next]);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('El logo no puede superar 2 MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Sube una imagen (JPG, PNG o WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateConfig('storeLogo', String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('El banner no puede superar 3 MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Sube una imagen (JPG, PNG o WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateConfig('bannerImage', String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!businessId) return false;
    if (!String(config.slug || '').trim()) {
      setError('Indica el enlace público (slug), ej. modomio');
      return false;
    }
    if ((config.salesPointIds || []).length === 0) {
      setError('Elige al menos una tienda para la web de pedir');
      return false;
    }
    setSaving(true);
    setError('');
    try {
      const res = await saveWebConfigRequest(businessId, {
        ...config,
        customDomain: normalizeWebCustomDomain(String(config.customDomain || '')),
        salesPointIds: config.salesPointIds || [],
      });
      setConfig((prev) => ({ ...prev, ...res.config }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const storeUrl = config.slug
    ? `${window.location.origin}/web/${config.slug}`
    : '';

  const copyUrl = () => {
    if (!storeUrl) return;
    void navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Layout title="Web Pedidos">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Web Pedidos">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-50">
              Web y QR
            </h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Plantilla Vertial fija. Dos puertas: pedir online (elige tienda) o QR de mesa.
              La carta es la del SaaS.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDnsOpen(true)}
              className={`${VERTIAL_BTN_SECONDARY} shrink-0`}
            >
              <Settings2 className="h-4 w-4" />
              DNS
              {config.customDomain ? (
                <span className="hidden max-w-[9rem] truncate font-mono text-[10px] text-stone-500 sm:inline">
                  {config.customDomain}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className={`${VERTIAL_BTN_PRIMARY} shrink-0`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="flex gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
          <button
            type="button"
            onClick={() => setDoor('pedir')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              door === 'pedir'
                ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-900 dark:text-stone-50'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
            }`}
          >
            <ShoppingBag className="h-4 w-4" /> Pedir (web)
          </button>
          <button
            type="button"
            onClick={() => setDoor('mesas')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              door === 'mesas'
                ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-900 dark:text-stone-50'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
            }`}
          >
            <QrCode className="h-4 w-4" /> Mesas (QR)
          </button>
        </div>

        {door === 'pedir' ? (
          <div className="space-y-4">
            <section className={`${VERTIAL_SURFACE} space-y-4 p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-50">Web de pedir activa</p>
                  <p className="text-xs text-stone-500">Si está off, el enlace público no abre la tienda</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(config.enabled)}
                  onClick={() => updateConfig('enabled', !config.enabled)}
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    config.enabled ? 'bg-[var(--v-blue,#2563eb)]' : 'bg-stone-300 dark:bg-stone-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      config.enabled ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
                <div>
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-50">Aceptando pedidos ahora</p>
                  <p className="text-xs text-stone-500">Off = ven el mensaje de cerrado</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(config.isOpen)}
                  onClick={() => updateConfig('isOpen', !config.isOpen)}
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    config.isOpen ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      config.isOpen ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </section>

            <section className={`${VERTIAL_SURFACE} space-y-3 p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-stone-400" />
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-50">Enlace público (Vertial)</h2>
              </div>
              <p className="text-xs text-stone-500">
                No hace falta dominio propio. Queda bajo Vertial: /web/tu-nombre
              </p>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-stone-400">/web/</span>
                <input
                  type="text"
                  value={config.slug || ''}
                  onChange={(e) => updateConfig('slug', slugify(e.target.value))}
                  placeholder="modomio"
                  className="min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold tabular-nums text-stone-900 focus:border-[var(--v-blue,#2563eb)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              {storeUrl ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-900/50">
                  <code className="min-w-0 flex-1 truncate text-xs text-stone-700 dark:text-stone-300">{storeUrl}</code>
                  <button type="button" onClick={copyUrl} className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !px-3 !text-xs`}>
                    {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    Copiar
                  </button>
                  <a
                    href={storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !px-3 !text-xs`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </a>
                </div>
              ) : null}
            </section>

            <section className={`${VERTIAL_SURFACE} space-y-4 p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-stone-400" />
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-50">
                  Apariencia de la web
                </h2>
              </div>
              <p className="text-xs text-stone-500">
                Misma estructura Vertial para todos. Aquí solo tocas marca: nombre, logo, color y mensaje.
              </p>

              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Nombre en la web
                </label>
                <input
                  type="text"
                  value={config.storeName || ''}
                  onChange={(e) => updateConfig('storeName', e.target.value)}
                  placeholder="Nombre del negocio"
                  className="min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-900 focus:border-[var(--v-blue,#2563eb)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Mensaje de bienvenida (claim del hero)
                </label>
                <input
                  type="text"
                  value={config.welcomeMessage || ''}
                  onChange={(e) => updateConfig('welcomeMessage', e.target.value)}
                  placeholder="Un buen pecado siempre merece la pena."
                  className="min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 focus:border-[var(--v-blue,#2563eb)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Texto “quiénes somos”
                </label>
                <textarea
                  value={config.storeDescription || ''}
                  onChange={(e) => updateConfig('storeDescription', e.target.value)}
                  placeholder="Grupo, marcas, estilo, actitud…"
                  rows={3}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-[var(--v-blue,#2563eb)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600 dark:text-stone-300">
                    Teléfono (pie)
                  </label>
                  <input
                    type="text"
                    value={config.phone || ''}
                    onChange={(e) => updateConfig('phone', e.target.value)}
                    placeholder="934 00 00 00"
                    className="min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 focus:border-[var(--v-blue,#2563eb)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600 dark:text-stone-300">
                    Dirección (pie)
                  </label>
                  <input
                    type="text"
                    value={config.address || ''}
                    onChange={(e) => updateConfig('address', e.target.value)}
                    placeholder="Badalona / Tiana…"
                    className="min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 focus:border-[var(--v-blue,#2563eb)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">Logo</p>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
                      {config.storeLogo ? (
                        <img src={config.storeLogo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-stone-300" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !px-3 !text-xs`}
                      >
                        Subir logo
                      </button>
                      {config.storeLogo ? (
                        <button
                          type="button"
                          onClick={() => updateConfig('storeLogo', '')}
                          className="text-left text-[11px] font-semibold text-rose-600"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">Banner (opcional)</p>
                  <input
                    id="web-banner-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleBannerUpload}
                  />
                  <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
                    {config.bannerImage ? (
                      <img src={config.bannerImage} alt="" className="h-20 w-full object-cover" />
                    ) : (
                      <div className="flex h-20 items-center justify-center text-[11px] text-stone-400">
                        Sin banner
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => document.getElementById('web-banner-input')?.click()}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !px-3 !text-xs`}
                    >
                      Subir banner
                    </button>
                    {config.bannerImage ? (
                      <button
                        type="button"
                        onClick={() => updateConfig('bannerImage', '')}
                        className="text-[11px] font-semibold text-rose-600"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">Color principal</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={config.primaryColor || '#2563EB'}
                    onChange={(e) => updateConfig('primaryColor', e.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-stone-200 bg-white p-1 dark:border-stone-700"
                    title="Color principal"
                  />
                  <input
                    type="text"
                    value={config.primaryColor || '#2563EB'}
                    onChange={(e) => updateConfig('primaryColor', e.target.value)}
                    className="min-h-11 w-28 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold tabular-nums dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                  />
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          primaryColor: p.primary,
                          secondaryColor: p.secondary,
                          accentColor: p.accent,
                          ...('logo' in p && p.logo ? { storeLogo: p.logo } : {}),
                          ...('storeName' in p && p.storeName ? { storeName: p.storeName } : {}),
                          ...('welcomeMessage' in p && p.welcomeMessage
                            ? { welcomeMessage: p.welcomeMessage }
                            : {}),
                          ...('storeDescription' in p && p.storeDescription
                            ? { storeDescription: p.storeDescription }
                            : {}),
                          ...('backgroundColor' in p && p.backgroundColor
                            ? { backgroundColor: p.backgroundColor }
                            : {}),
                        }))
                      }
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 text-[11px] font-bold text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: p.primary }}
                      />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="rounded-xl px-3 py-3 text-white"
                style={{
                  background: `linear-gradient(135deg, ${config.primaryColor || '#2563EB'}, ${config.secondaryColor || '#0B1220'})`,
                }}
              >
                <div className="flex items-center gap-3">
                  {config.storeLogo ? (
                    <img src={config.storeLogo} alt="" className="h-10 w-10 rounded-lg bg-white/20 object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-sm font-black">
                      {(config.storeName || 'V').charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold">{config.storeName || 'Tu tienda'}</p>
                    <p className="text-[11px] text-white/80">Vista rápida del color / logo</p>
                  </div>
                </div>
              </div>
            </section>

            <section className={`${VERTIAL_SURFACE} space-y-3 p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-stone-400" />
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-50">
                  Tiendas en la web
                </h2>
              </div>
              <p className="text-xs text-stone-500">
                El cliente entra al enlace y elige tienda (ej. Tiana o Badalona). Solo las marcadas.
              </p>
              {pdvs.length === 0 ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  No hay puntos de venta. Créalos en el SaaS y vuelve.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {pdvs.map((p) => {
                    const on = selectedIds.has(p._id);
                    return (
                      <li key={p._id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-50">
                            {pointOfSaleDisplayLabel(p)}
                          </p>
                          {p.address ? (
                            <p className="truncate text-[11px] text-stone-500">{p.address}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() => togglePdv(p._id)}
                          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                            on ? 'bg-[var(--v-blue,#2563eb)]' : 'bg-stone-300 dark:bg-stone-600'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                              on ? 'left-5' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={`${VERTIAL_SURFACE} space-y-3 p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-stone-400" />
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-50">Cómo pide</h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
                  <input
                    type="checkbox"
                    checked={Boolean(config.deliveryEnabled)}
                    onChange={(e) => updateConfig('deliveryEnabled', e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-[var(--v-blue,#2563eb)]"
                  />
                  Envío a domicilio
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
                  <input
                    type="checkbox"
                    checked={Boolean(config.pickupEnabled)}
                    onChange={(e) => updateConfig('pickupEnabled', e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-[var(--v-blue,#2563eb)]"
                  />
                  Recogida en tienda
                </label>
              </div>
              <p className="text-xs text-stone-500">
                Productos = catálogo del SaaS (visibles en web). No se diseña otra carta aquí.
              </p>
            </section>
          </div>
        ) : null}

        {door === 'mesas' ? (
          <div className="space-y-4">
            <section className={`${VERTIAL_SURFACE} space-y-3 p-4 sm:p-5`}>
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-stone-400" />
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-50">
                  Pedido en mesa (solo QR)
                </h2>
              </div>
              <ul className="list-inside list-disc space-y-1.5 text-sm text-stone-600 dark:text-stone-300">
                <li>Cada mesa tiene su QR de esa tienda.</li>
                <li>El cliente escanea → pide a esa mesa. Listo.</li>
                <li>Sin QR no se entra. La web de pedir no abre mesas.</li>
              </ul>
            </section>

            <section className={`${VERTIAL_SURFACE} p-4 sm:p-5`}>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                Dónde están las mesas
              </p>
              <p className="mt-1 text-xs text-stone-500">
                El plano se gestiona en Sala. Aquí generas e imprimes el QR de cada mesa.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/saas/sala')}
                  className={`${VERTIAL_BTN_SECONDARY} w-full sm:w-auto`}
                >
                  Abrir Sala
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void loadMesaQrTables()}
                  disabled={mesaQrLoading}
                  className={`${VERTIAL_BTN_SECONDARY} w-full sm:w-auto`}
                >
                  {mesaQrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Actualizar QR
                </button>
              </div>
            </section>

            <section className={`${VERTIAL_SURFACE} space-y-3 p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-50">
                  QR por mesa
                </h2>
                {mesaTables.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      mesaTables.forEach((t, i) => {
                        const token = String(t.qrCode || '').trim();
                        if (!token) return;
                        window.setTimeout(() => {
                          printMesaQrSheet({
                            tableName: t.name || `Mesa ${t.number}`,
                            storeLabel: config.storeName || currentBusiness?.name || '',
                            publicUrl: buildMesaPublicUrl(token),
                          });
                        }, i * 400);
                      });
                    }}
                    className={`${VERTIAL_BTN_SECONDARY} text-xs`}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir todos
                  </button>
                ) : null}
              </div>

              {mesaQrLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
                </div>
              ) : mesaTables.length === 0 ? (
                <p className="text-sm text-stone-500">
                  No hay mesas. Monta el salón en Sala y vuelve aquí.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {mesaTables.map((table) => {
                    const token = String(table.qrCode || '').trim();
                    const publicUrl = token ? buildMesaPublicUrl(token) : '';
                    const qrSrc = publicUrl ? buildMesaQrImageUrl(publicUrl, 160) : '';
                    const label = table.name || `Mesa ${table.number}`;
                    return (
                      <li key={table._id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          {qrSrc ? (
                            <img
                              src={qrSrc}
                              alt={`QR ${label}`}
                              className="h-16 w-16 shrink-0 rounded-lg border border-stone-200 bg-white p-1 dark:border-stone-700"
                            />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-stone-300 text-stone-400">
                              <QrCode className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-50">
                              {label}
                            </p>
                            <p className="truncate text-xs text-stone-500">
                              {table.zone || 'Sin zona'}
                              {token ? ` · ${token.slice(0, 10)}…` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!publicUrl}
                            onClick={() => {
                              void navigator.clipboard.writeText(publicUrl);
                              toast.success('Enlace copiado');
                            }}
                            className={`${VERTIAL_BTN_SECONDARY} text-xs`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copiar
                          </button>
                          <button
                            type="button"
                            disabled={!publicUrl}
                            onClick={() =>
                              printMesaQrSheet({
                                tableName: label,
                                storeLabel: config.storeName || currentBusiness?.name || '',
                                publicUrl,
                              })
                            }
                            className={`${VERTIAL_BTN_SECONDARY} text-xs`}
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Imprimir
                          </button>
                          <button
                            type="button"
                            disabled={!mesaOwnerUserId || mesaQrBusyId === table._id}
                            onClick={() => {
                              void (async () => {
                                setMesaQrBusyId(table._id);
                                try {
                                  const next = await regenerateMesaQrTokenRequest(mesaOwnerUserId, table._id);
                                  setMesaTables((prev) =>
                                    prev.map((row) => (row._id === next._id ? next : row)),
                                  );
                                  toast.success('QR regenerado');
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : 'Error al regenerar');
                                } finally {
                                  setMesaQrBusyId('');
                                }
                              })();
                            }}
                            className={`${VERTIAL_BTN_SECONDARY} text-xs`}
                          >
                            {mesaQrBusyId === table._id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />}
                            Nuevo QR
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-[11px] text-stone-400">
                Enlace opaco tipo /m/… — no se adivina el número de mesa. Activa la Web de pedir
                para que al escanear abra la carta de esa tienda.
              </p>
            </section>
          </div>
        ) : null}
      </div>

      <WebDnsSettingsModal
        open={dnsOpen}
        onClose={() => setDnsOpen(false)}
        domain={String(config.customDomain || '')}
        onChangeDomain={(value) => updateConfig('customDomain', value)}
        saving={saving}
        onSave={async () => {
          const ok = await handleSave();
          if (ok) {
            toast.success('Dominio guardado');
            setDnsOpen(false);
          }
        }}
      />
    </Layout>
  );
}
