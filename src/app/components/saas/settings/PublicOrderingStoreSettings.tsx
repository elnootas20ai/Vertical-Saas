import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Save, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { updatePointOfSaleRequest, type PointOfSale } from '../../../lib/deliveryApi';
import { loadStoresForBusiness } from '../../../verticals/retailScopeRegistry';
import { VERTIAL_BTN_PRIMARY } from '../../../lib/vertialUiTokens';
import {
  createCustomerKioskRequest,
  listCustomerKiosksRequest,
  revokeCustomerKioskRequest,
  type CustomerKiosk,
} from '../../../lib/webApi';

type OrderingConfig = NonNullable<PointOfSale['publicOrderingConfig']>;

const DEFAULT_CONFIG: OrderingConfig = {
  pickupEnabled: true,
  deliveryEnabled: false,
  minimumOrder: 0,
  deliveryFee: 0,
  estimatedDeliveryTime: '30-45 min',
  deliveryRadius: '',
  shippingMode: 'fixed',
  shippingZones: [],
  customerKioskEnabled: false,
};

function postalCodesOf(config: OrderingConfig): string {
  const first = config.shippingZones?.[0] as { postalCodes?: unknown } | undefined;
  return Array.isArray(first?.postalCodes) ? first.postalCodes.map(String).join(', ') : '';
}

export function PublicOrderingStoreSettings() {
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '').trim();
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [drafts, setDrafts] = useState<Record<string, OrderingConfig>>({});
  const [postalCodes, setPostalCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [kiosks, setKiosks] = useState<CustomerKiosk[]>([]);
  const [issuedLinks, setIssuedLinks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user || !currentBusiness || !dataUserId || !businessId) return;
    setLoading(true);
    try {
      const [result, kioskResult] = await Promise.all([
        loadStoresForBusiness(user, currentBusiness, businesses, {
          accountBusinessCount: businesses.length || 1,
          knownBusinessIds: businesses.map((item) => item.business_id).filter(Boolean),
        }),
        listCustomerKiosksRequest(businessId).catch(() => ({ ok: true, kiosks: [] })),
      ]);
      const active = (result.pointsOfSale || []).filter((item) => item.active !== false);
      setStores(active);
      setKiosks(kioskResult.kiosks || []);
      setDrafts(Object.fromEntries(active.map((item) => [
        item._id,
        { ...DEFAULT_CONFIG, ...(item.publicOrderingConfig || {}) },
      ])));
      setPostalCodes(Object.fromEntries(active.map((item) => [
        item._id,
        postalCodesOf({ ...DEFAULT_CONFIG, ...(item.publicOrderingConfig || {}) }),
      ])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las tiendas');
    } finally {
      setLoading(false);
    }
  }, [businessId, businesses, currentBusiness, dataUserId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (storeId: string, patch: Partial<OrderingConfig>) => {
    setDrafts((current) => ({
      ...current,
      [storeId]: { ...(current[storeId] || DEFAULT_CONFIG), ...patch },
    }));
  };

  const save = async (store: PointOfSale) => {
    if (!dataUserId) return;
    const config = drafts[store._id] || DEFAULT_CONFIG;
    const codes = String(postalCodes[store._id] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const shippingZones = config.shippingMode === 'zones' && codes.length > 0
      ? [{
        id: 'local-zone',
        name: 'Zona de reparto',
        postalCodes: codes,
        active: true,
        options: [{
          id: 'local-delivery',
          carrier: 'Reparto local',
          rate: Number(config.deliveryFee || 0),
          estimatedTime: config.estimatedDeliveryTime,
        }],
      }]
      : [];
    setSavingId(store._id);
    try {
      const saved = await updatePointOfSaleRequest(dataUserId, {
        ...store,
        publicOrderingConfig: { ...config, shippingZones },
      });
      setStores((current) => current.map((item) => (item._id === saved._id ? saved : item)));
      update(store._id, saved.publicOrderingConfig || config);
      toast.success(`Pedidos online guardados en ${store.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la tienda');
    } finally {
      setSavingId('');
    }
  };

  const createKiosk = async (store: PointOfSale) => {
    setSavingId(store._id);
    try {
      const response = await createCustomerKioskRequest(businessId, {
        salesPointId: store._id,
        name: `Tablet clientes · ${store.name}`,
      });
      const url = `${window.location.origin}/k/${response.token}`;
      setKiosks((current) => [...current, response.kiosk]);
      setIssuedLinks((current) => ({ ...current, [response.kiosk.id]: url }));
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Enlace de tablet creado y copiado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la tablet');
    } finally {
      setSavingId('');
    }
  };

  const revokeKiosk = async (kiosk: CustomerKiosk) => {
    setSavingId(kiosk.id);
    try {
      await revokeCustomerKioskRequest(businessId, kiosk.id);
      setKiosks((current) => current.filter((item) => item.id !== kiosk.id));
      toast.success('Tablet revocada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo revocar la tablet');
    } finally {
      setSavingId('');
    }
  };

  const hasStores = useMemo(() => stores.length > 0, [stores.length]);
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando pedidos online…
      </div>
    );
  }
  if (!hasStores) return null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-3 flex items-start gap-2">
        <ShoppingBag className="mt-0.5 h-4 w-4 text-blue-600" />
        <div>
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-50">Pedidos online por tienda</h3>
          <p className="text-xs text-stone-500">Configura aquí recogida, reparto y tablet de autoservicio.</p>
        </div>
      </div>
      <div className="space-y-3">
        {stores.map((store) => {
          const config = drafts[store._id] || DEFAULT_CONFIG;
          return (
            <div key={store._id} className="rounded-xl border border-stone-200 p-3 dark:border-stone-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{store.name}</p>
                  <p className="text-xs text-stone-500">{store.address || store.code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void save(store)}
                  disabled={Boolean(savingId)}
                  className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !px-3 !text-xs`}
                >
                  {savingId === store._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
                  <input type="checkbox" checked={config.pickupEnabled} onChange={(event) => update(store._id, { pickupEnabled: event.target.checked })} />
                  Permitir recogida
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
                  <input type="checkbox" checked={config.deliveryEnabled} onChange={(event) => update(store._id, { deliveryEnabled: event.target.checked })} />
                  Permitir reparto
                </label>
                <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Pedido mínimo (€)
                  <input type="number" min="0" step="0.01" value={config.minimumOrder} onChange={(event) => update(store._id, { minimumOrder: Number(event.target.value) })} className="mt-1 min-h-10 w-full rounded-xl border border-stone-200 px-3 dark:border-stone-700 dark:bg-stone-950" />
                </label>
                <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Tarifa de reparto (€)
                  <input type="number" min="0" step="0.01" value={config.deliveryFee} onChange={(event) => update(store._id, { deliveryFee: Number(event.target.value) })} className="mt-1 min-h-10 w-full rounded-xl border border-stone-200 px-3 dark:border-stone-700 dark:bg-stone-950" />
                </label>
                <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Tiempo estimado
                  <input value={config.estimatedDeliveryTime} onChange={(event) => update(store._id, { estimatedDeliveryTime: event.target.value })} className="mt-1 min-h-10 w-full rounded-xl border border-stone-200 px-3 dark:border-stone-700 dark:bg-stone-950" />
                </label>
                <label className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Cobertura
                  <select value={config.shippingMode} onChange={(event) => update(store._id, { shippingMode: event.target.value as 'fixed' | 'zones' })} className="mt-1 min-h-10 w-full rounded-xl border border-stone-200 px-3 dark:border-stone-700 dark:bg-stone-950">
                    <option value="fixed">Tarifa fija</option>
                    <option value="zones">Por códigos postales</option>
                  </select>
                </label>
                {config.shippingMode === 'zones' ? (
                  <label className="text-xs font-semibold text-stone-600 dark:text-stone-300 sm:col-span-2">
                    Códigos postales admitidos, separados por comas
                    <input value={postalCodes[store._id] || ''} onChange={(event) => setPostalCodes((current) => ({ ...current, [store._id]: event.target.value }))} placeholder="08915, 08001" className="mt-1 min-h-10 w-full rounded-xl border border-stone-200 px-3 dark:border-stone-700 dark:bg-stone-950" />
                  </label>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200 sm:col-span-2">
                  <input type="checkbox" checked={Boolean(config.customerKioskEnabled)} onChange={(event) => update(store._id, { customerKioskEnabled: event.target.checked })} />
                  Permitir tablet de autoservicio para recogida
                </label>
                {config.customerKioskEnabled ? (
                  <div className="space-y-2 rounded-xl bg-stone-50 p-3 sm:col-span-2 dark:bg-stone-950/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-stone-700 dark:text-stone-200">
                        Tablets registradas: {kiosks.filter((item) => item.salesPointId === store._id).length}
                      </p>
                      <button
                        type="button"
                        onClick={() => void createKiosk(store)}
                        disabled={Boolean(savingId) || !config.pickupEnabled}
                        className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !px-3 !text-xs`}
                      >
                        Crear enlace tablet
                      </button>
                    </div>
                    {kiosks.filter((item) => item.salesPointId === store._id).map((kiosk) => (
                      <div key={kiosk.id} className="flex items-center justify-between gap-2 text-xs text-stone-600 dark:text-stone-300">
                        <span className="truncate">{kiosk.name}</span>
                        <div className="flex gap-1">
                          {issuedLinks[kiosk.id] ? (
                            <button type="button" onClick={() => void navigator.clipboard.writeText(issuedLinks[kiosk.id])} className="rounded-lg border border-stone-200 p-2 dark:border-stone-700" title="Copiar enlace">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button type="button" onClick={() => void revokeKiosk(kiosk)} className="rounded-lg border border-rose-200 p-2 text-rose-600 dark:border-rose-900" title="Revocar tablet">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
