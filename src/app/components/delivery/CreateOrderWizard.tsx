import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  X, ArrowLeft, ArrowRight, Home, Briefcase, Truck, ShoppingBag,
  Search, Plus, Minus, CreditCard, Banknote, Smartphone, Wallet,
  ChevronRight, Check, MapPin, User as UserIcon, Store,
  Loader2,
} from 'lucide-react';
import {
  pointOfSaleDisplayLabel,
  type DeliveryOrder,
  type DeliveryType,
  type CatalogItem,
  type PointOfSale,
} from '../../lib/deliveryApi';
import type { Client } from '../../context/AppContext';
import { useClientPhoneSearch } from '../../hooks/useClientPhoneSearch';
import { useSyncDeliveryPdvFilter } from '../../hooks/useSyncDeliveryPdvFilter';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveClientSearchBusinessId } from '../../lib/clientSearchScope';

type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'online' | '';

interface CartItem { catalogItem: CatalogItem; quantity: number }

interface WizardData {
  deliveryType: DeliveryType;
  channel: string;
  clientId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /** Calle y número (obligatorio en delivery) */
  customerStreet: string;
  /** Ciudad (obligatorio en delivery) */
  customerCity: string;
  salesPointId: string;
  salesPointName: string;
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  observations: string;
  notes: string;
  priority: string;
}

const INITIAL_DATA: WizardData = {
  deliveryType: 'domicilio', channel: 'direct', customerName: '', customerPhone: '',
  clientId: '',
  customerEmail: '', customerStreet: '', customerCity: '', salesPointId: '', salesPointName: '',
  cart: [], paymentMethod: '', observations: '', notes: '', priority: 'normal',
};

function isValidDeliveryPhone(phone: string): boolean {
  const t = phone.trim();
  if (!t) return false;
  const digits = t.replace(/\D/g, '');
  if (digits.length < 9) return false;
  return /^[\d\s+\-().]+$/.test(t);
}

const DELIVERY_TYPES: { value: DeliveryType; label: string; desc: string; icon: typeof Truck }[] = [
  { value: 'domicilio', label: 'A domicilio', desc: 'Entrega en dirección del cliente', icon: Truck },
  { value: 'recogida', label: 'Recogida', desc: 'Cliente recoge en local', icon: ShoppingBag },
  { value: 'sala', label: 'Sala', desc: 'Consumo en el establecimiento', icon: Store },
];

const CHANNELS = [
  { value: 'direct', label: 'Directo' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'web', label: 'Web' },
  { value: 'tpv', label: 'TPV' },
  { value: 'glovo', label: 'Glovo' },
  { value: 'justeat', label: 'Just Eat' },
  { value: 'ubereats', label: 'Uber Eats' },
  { value: 'flipdish', label: 'Flipdish' },
];

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  { value: 'bizum', label: 'Bizum', icon: Smartphone },
  { value: 'online', label: 'Online', icon: Wallet },
];

const STEPS = ['Tipo y canal', 'Cliente', 'PDV', 'Productos', 'Pago y confirmar'];

interface Props {
  userId: string;
  catalogItems: CatalogItem[];
  pointsOfSale: PointOfSale[];
  onSubmit: (data: Partial<DeliveryOrder>) => void;
  onClose: () => void;
}

export function CreateOrderWizard({ userId, catalogItems, pointsOfSale, onSubmit, onClose }: Props) {
  const { currentBusiness } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const clientSearchBusinessId = resolveClientSearchBusinessId(currentBusiness, businessId);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [phoneEditing, setPhoneEditing] = useState(true);
  /** Misma búsqueda que TPV rápido: teléfono o nombre (API sin acentos). */
  const [clientLookup, setClientLookup] = useState('');

  const update = (partial: Partial<WizardData>) => setData((prev) => ({ ...prev, ...partial }));
  const cartTotal = useMemo(() => data.cart.reduce((s, c) => s + c.catalogItem.unitPrice * c.quantity, 0), [data.cart]);

  const { results, isSearching, selectedClient, selectClient, clearSelection } = useClientPhoneSearch({
    userId,
    phone: clientLookup,
    businessId: clientSearchBusinessId,
    enabled: step === 1 && phoneEditing,
    matchByName: true,
    minQueryLength: 2,
  });

  const activePdvs = useMemo(() => pointsOfSale.filter((p) => p.active), [pointsOfSale]);

  const applyGlobalPdvToWizard = useCallback((pdvId: string | undefined) => {
    if (!pdvId) return;
    const p = activePdvs.find((x) => x._id === pdvId);
    if (!p) return;
    const label = pointOfSaleDisplayLabel(p);
    setData((prev) => {
      if (prev.salesPointId === pdvId && prev.salesPointName === label) return prev;
      return { ...prev, salesPointId: pdvId, salesPointName: label };
    });
  }, [activePdvs]);

  useSyncDeliveryPdvFilter(activePdvs, applyGlobalPdvToWizard);

  const applyClient = useCallback((client: Client) => {
    selectClient(client);
    setPhoneEditing(false);
    setClientLookup('');
    const primary = client.addresses?.find((a) => a.isPrimary) || client.addresses?.[0];
    const street = (primary?.street || '').trim() || (client.address || '').trim();
    const city = (primary?.city || '').trim() || (client.city || '').trim();
    update({
      clientId: client.id,
      customerName: client.name || client.fullName || client.email || '',
      customerPhone: `${client.phonePrefix || ''} ${client.phone || ''}`.trim() || client.phone || '',
      customerEmail: client.email || '',
      customerStreet: street,
      customerCity: city,
    });
  }, [selectClient, update]);

  const clearClient = useCallback(() => {
    clearSelection();
    setPhoneEditing(true);
    setClientLookup('');
    update({ clientId: '' });
  }, [clearSelection, update]);

  const addToCart = (item: CatalogItem) => {
    setData((prev) => {
      const existing = prev.cart.find((c) => c.catalogItem._id === item._id);
      if (existing) return { ...prev, cart: prev.cart.map((c) => c.catalogItem._id === item._id ? { ...c, quantity: c.quantity + 1 } : c) };
      return { ...prev, cart: [...prev.cart, { catalogItem: item, quantity: 1 }] };
    });
  };

  const updateCartQty = (itemId: string, delta: number) => {
    setData((prev) => ({
      ...prev,
      cart: prev.cart.map((c) => c.catalogItem._id === itemId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c).filter((c) => c.quantity > 0),
    }));
  };

  const canAdvance = () => {
    if (step === 1) {
      const nameOk = data.customerName.trim().length >= 2;
      const phoneOk = isValidDeliveryPhone(data.customerPhone);
      const streetOk = data.customerStreet.trim().length > 0;
      const cityOk = data.customerCity.trim().length > 0;
      return nameOk && phoneOk && streetOk && cityOk;
    }
    if (step === 2) return Boolean(data.salesPointId?.trim());
    if (step === 3) return data.cart.length > 0;
    return true;
  };

  const handleSubmit = () => {
    const items = data.cart.map((c, i) => ({
      id: `item-${i}-${Date.now()}`, name: c.catalogItem.name,
      quantity: c.quantity, unitPrice: c.catalogItem.unitPrice,
      total: c.catalogItem.unitPrice * c.quantity,
      catalogItemId: c.catalogItem._id,
      category: c.catalogItem.category,
      brandIds: Array.isArray(c.catalogItem.brandIds) ? c.catalogItem.brandIds : [],
    }));
    const customerAddress = [data.customerStreet.trim(), data.customerCity.trim()].filter(Boolean).join(', ');
    onSubmit({
      deliveryType: data.deliveryType, channel: data.channel as DeliveryOrder['channel'],
      clientId: data.clientId || '',
      customerName: data.customerName, customerPhone: data.customerPhone,
      customerEmail: data.customerEmail, customerAddress,
      salesPointId: data.salesPointId, salesPointName: data.salesPointName,
      items, paymentMethod: data.paymentMethod, observations: data.observations,
      notes: data.notes, priority: data.priority, status: 'nuevo',
    });
  };

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.toLowerCase();
    return catalogItems.filter((i) => i.active && i.webVisible !== false && (
      !q || i.name.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q)
    ));
  }, [catalogItems, catalogSearch]);

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-100 focus:outline-none transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Nuevo pedido</h3>
            <p className="text-sm text-gray-500 mt-0.5">{STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Progress */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-700'}`} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Tipo de entrega</label>
                <div className="grid grid-cols-3 gap-3">
                  {DELIVERY_TYPES.map((opt) => (
                    <button key={opt.value} onClick={() => update({ deliveryType: opt.value })}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${data.deliveryType === opt.value ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                      <opt.icon className="w-6 h-6" />
                      <span className="text-sm font-semibold">{opt.label}</span>
                      <span className={`text-xs text-center ${data.deliveryType === opt.value ? 'opacity-70' : 'text-gray-400'}`}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Canal de entrada</label>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((ch) => (
                    <button key={ch.value} onClick={() => update({ channel: ch.value })}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${data.channel === ch.value ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              {phoneEditing && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Buscar cliente (teléfono o nombre)
                  </label>
                  <form autoComplete="off" onSubmit={(e) => e.preventDefault()} role="search">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        id="delivery-order-client-search"
                        name="vertial-client-search"
                        type="search"
                        inputMode="search"
                        enterKeyHint="search"
                        className={`${inputCls} pl-9`}
                        value={clientLookup}
                        onChange={(e) => {
                          setClientLookup(e.target.value);
                          update({ clientId: '' });
                        }}
                        placeholder="Ej. 612… o Iván Ortega"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        data-1p-ignore
                        data-lpignore="true"
                      />
                      {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      )}
                    </div>
                  </form>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    Misma búsqueda que en TPV rápido (≥3 dígitos o ≥2 letras).
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre *</label>
                <input
                  className={inputCls}
                  value={data.customerName}
                  onChange={(e) => {
                    setPhoneEditing(true);
                    clearSelection();
                    update({ customerName: e.target.value, clientId: '' });
                  }}
                  placeholder="Nombre del cliente"
                  name="vertial-order-customer-name"
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono *</label>
                  <input
                    className={inputCls}
                    value={data.customerPhone}
                    onChange={(e) => {
                      setPhoneEditing(true);
                      clearSelection();
                      update({ customerPhone: e.target.value, clientId: '' });
                    }}
                    placeholder="600 000 000"
                  />
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Mínimo 9 dígitos.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email</label>
                  <input className={inputCls} type="email" value={data.customerEmail} onChange={(e) => update({ customerEmail: e.target.value })} placeholder="email@ejemplo.com" />
                </div>
              </div>
              {phoneEditing && results.length > 0 && (
                <div className="border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
                  {results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => applyClient(c)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {c.name || c.fullName || c.email || 'Cliente'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {(c.phonePrefix || '+34') + ' ' + (c.phone || '')}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-violet-600 dark:text-violet-400">Vincular</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedClient && !phoneEditing && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-violet-900 dark:text-violet-200 truncate">
                      Cliente vinculado: {selectedClient.name || selectedClient.fullName || selectedClient.email}
                    </p>
                    <p className="text-xs text-violet-700/80 dark:text-violet-300/80">
                      {selectedClient.phonePrefix || '+34'} {selectedClient.phone}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearClient}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200 hover:bg-white/60 dark:hover:bg-gray-900/30"
                  >
                    Cambiar
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Calle y número *</label>
                  <input
                    className={inputCls}
                    value={data.customerStreet}
                    onChange={(e) => update({ customerStreet: e.target.value })}
                    placeholder="Calle, número, piso…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ciudad *</label>
                  <input
                    className={inputCls}
                    value={data.customerCity}
                    onChange={(e) => update({ customerCity: e.target.value })}
                    placeholder="Ciudad"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Punto de venta</label>
              {pointsOfSale.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">No hay puntos de venta configurados</p>
              ) : (
                <div className="space-y-2">
                  {pointsOfSale.filter((p) => p.active).map((pdv) => (
                    <button key={pdv._id} onClick={() => update({ salesPointId: pdv._id, salesPointName: pointOfSaleDisplayLabel(pdv) })}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${data.salesPointId === pdv._id ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                      <Store className={`w-5 h-5 ${data.salesPointId === pdv._id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`} />
                      <div>
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{pointOfSaleDisplayLabel(pdv)}</p>
                        {pdv.address && <p className="text-xs text-gray-500">{pdv.address}</p>}
                      </div>
                      {data.salesPointId === pdv._id && <Check className="w-5 h-5 text-gray-900 dark:text-gray-100 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className={`${inputCls} pl-9`} value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Buscar productos..." />
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                {filteredCatalog.map((item) => {
                  const inCart = data.cart.find((c) => c.catalogItem._id === item._id);
                  return (
                    <div key={item._id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.category} · {item.unitPrice.toFixed(2)}€</p>
                      </div>
                      {inCart ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateCartQty(item._id, -1)} className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                          <span className="text-sm font-bold w-6 text-center">{inCart.quantity}</span>
                          <button onClick={() => updateCartQty(item._id, 1)} className="w-7 h-7 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(item)} className="px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-xs font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Añadir</button>
                      )}
                    </div>
                  );
                })}
              </div>
              {data.cart.length > 0 && (
                <div className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl p-4">
                  <div className="flex justify-between text-sm mb-2"><span>{data.cart.reduce((s, c) => s + c.quantity, 0)} productos</span><span className="font-bold">{cartTotal.toFixed(2)}€</span></div>
                  {data.cart.map((c) => (
                    <div key={c.catalogItem._id} className="flex justify-between text-xs opacity-70 mt-1">
                      <span>{c.quantity}x {c.catalogItem.name}</span><span>{(c.catalogItem.unitPrice * c.quantity).toFixed(2)}€</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Método de pago</label>
                <div className="grid grid-cols-2 gap-3">
                  {PAYMENT_OPTIONS.map((pm) => (
                    <button key={pm.value} onClick={() => update({ paymentMethod: pm.value })}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${data.paymentMethod === pm.value ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                      <pm.icon className="w-5 h-5" /><span className="text-sm font-semibold">{pm.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Observaciones del cliente</label>
                <textarea rows={2} className={`${inputCls} resize-none`} value={data.observations} onChange={(e) => update({ observations: e.target.value })} placeholder="Alérgenos, instrucciones especiales..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notas internas</label>
                <textarea rows={2} className={`${inputCls} resize-none`} value={data.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Notas para cocina, reparto..." />
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
                <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Resumen del pedido</h4>
                <div className="flex justify-between"><span className="text-gray-500">Tipo</span><span className="font-medium capitalize">{data.deliveryType}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Canal</span><span className="font-medium">{CHANNELS.find((c) => c.value === data.channel)?.label}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-medium">{data.customerName}</span></div>
                {data.salesPointName && <div className="flex justify-between"><span className="text-gray-500">PDV</span><span className="font-medium">{data.salesPointName}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Productos</span><span className="font-medium">{data.cart.reduce((s, c) => s + c.quantity, 0)} uds.</span></div>
                {data.paymentMethod && <div className="flex justify-between"><span className="text-gray-500">Pago</span><span className="font-medium">{PAYMENT_OPTIONS.find((p) => p.value === data.paymentMethod)?.label}</span></div>}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold text-gray-900 dark:text-gray-100">
                  <span>Total</span><span>{cartTotal.toFixed(2)}€</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-4 flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)}
              className="py-2.5 px-4 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800">
              <ArrowLeft className="w-4 h-4" /> Atrás
            </button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <button onClick={() => canAdvance() && setStep((s) => s + 1)} disabled={!canAdvance()}
              className="py-2.5 px-6 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
              Siguiente <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={data.cart.length === 0}
              className="py-2.5 px-6 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
              <Check className="w-4 h-4" /> Crear pedido
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
