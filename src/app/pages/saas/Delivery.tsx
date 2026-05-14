import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import type { Client } from '../../context/AppContext';
import { useClientPhoneSearch } from '../../hooks/useClientPhoneSearch';
import {
  listDeliveryOrdersRequest,
  createDeliveryOrderRequest,
  updateDeliveryOrderRequest,
  deleteDeliveryOrderRequest,
  listCatalogItemsRequest,
  listPointsOfSaleRequest,
  mergePointsOfSaleWithRetailWorkCenters,
  pointOfSaleDisplayLabel,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryOrderItem,
  type CatalogItem,
} from '../../lib/deliveryApi';
import {
  DELIVERY_ACTIVE_STORE_CHANGED,
  readDeliveryOpsSelectedPdvId,
  resolvePreferenceToPdvId,
} from '../../lib/deliveryOpsPdvSelection';
import {
  Plus,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Search,
  X,
  ChefHat,
  Package,
  Truck,
  ShoppingBag,
  CreditCard,
  AlertCircle,
  History,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Phone,
  MapPin,
  User,
  FileText,
  MessageSquare,
  Download,
  Eye,
  Check,
  Home,
  Briefcase,
} from 'lucide-react';

const STATUS_CONFIG: Record<DeliveryOrderStatus, { label: string; badgeClass: string }> = {
  nuevo: { label: 'Nuevo', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  cocina: { label: 'En cocina', badgeClass: 'bg-orange-100 text-orange-700 border-orange-200' },
  listo: { label: 'Montaje', badgeClass: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  en_reparto: { label: 'En reparto', badgeClass: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  entregado: { label: 'Entregado', badgeClass: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelado', badgeClass: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
  incident: { label: 'Incidencia', badgeClass: 'bg-red-100 text-red-700 border-red-200' },
};

const PRIORITY_CONFIG: Record<string, { label: string; badgeClass: string; dot: string }> = {
  normal: { label: 'Normal', badgeClass: 'bg-blue-100 text-blue-600', dot: 'bg-blue-500' },
  high: { label: 'Alta', badgeClass: 'bg-orange-100 text-orange-600', dot: 'bg-orange-500' },
  urgent: { label: 'Urgente', badgeClass: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

const CHANNEL_LABELS: Record<string, string> = { direct: 'Directo', phone: 'Teléfono', web: 'Web', app: 'App', tpv: 'TPV', glovo: 'Glovo', justeat: 'Just Eat', ubereats: 'Uber Eats' };

/** Tabs en `/saas/delivery` — sincronizadas con `?tab=` */
const DELIVERY_MAIN_TAB_IDS = new Set(['orders', 'history']);

const NEXT_STATUS: Partial<Record<DeliveryOrderStatus, DeliveryOrderStatus>> = {
  nuevo: 'cocina', cocina: 'listo', listo: 'en_reparto', en_reparto: 'entregado',
};
const NEXT_STATUS_LABEL: Partial<Record<DeliveryOrderStatus, string>> = {
  nuevo: 'A cocina', cocina: 'Marcar listo', listo: 'Salida repartidor', en_reparto: 'Entregado',
};

function formatDateES(dateStr: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── Create Order Wizard (5 steps) ───────────────────────────────────────────

type OrderType = 'domicilio' | 'recogida';
type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'otros';

interface CartItem { catalogItem: CatalogItem; quantity: number }

interface CustomerAddress {
  id: string;
  label: string;
  street: string;
  city: string;
}

function formatCustomerAddressLine(a: CustomerAddress): string {
  return [a.street, a.city].filter(Boolean).join(', ');
}

function isValidDeliveryCustomerPhone(phone: string): boolean {
  const t = phone.trim();
  if (!t) return false;
  const digits = t.replace(/\D/g, '');
  if (digits.length < 9) return false;
  return /^[\d\s+\-().]+$/.test(t);
}

const ADDRESS_PRESETS: { value: string; label: string; icon: typeof Home }[] = [
  { value: 'Casa', label: 'Casa', icon: Home },
  { value: 'Trabajo', label: 'Trabajo', icon: Briefcase },
];

interface WizardData {
  orderType: OrderType;
  clientId: string;
  customerName: string;
  customerPhone: string;
  customerAddresses: CustomerAddress[];
  selectedAddressId: string;
  channel: string;
  priority: string;
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  initialStatus: 'nuevo' | 'cocina';
  notes: string;
}

function mapWizardAddressesFromClient(client: Client): CustomerAddress[] {
  const raw = client.addresses || [];
  return raw
    .map((a, idx) => ({
      id: String(a.id || `addr-${client.id}-${idx}`),
      label: (a.label && String(a.label).trim()) || 'Casa',
      street: (a.street || '').trim() || (idx === 0 ? (client.address || '').trim() : ''),
      city: (a.city || '').trim() || (idx === 0 ? (client.city || '').trim() : ''),
    }))
    .filter((x) => x.street.length > 0 && x.city.length > 0);
}

const WIZARD_STEPS = [
  { num: 1, label: 'Cliente', icon: User },
  { num: 2, label: 'Tipo', icon: Truck },
  { num: 3, label: 'Productos', icon: ShoppingBag },
  { num: 4, label: 'Pago', icon: CreditCard },
  { num: 5, label: 'Confirmar', icon: CheckCircle2 },
];

const PAYMENT_METHOD_CONFIG: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: 'efectivo', label: 'Efectivo', icon: CreditCard },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  { value: 'bizum', label: 'Bizum', icon: Phone },
  { value: 'otros', label: 'Otros', icon: CreditCard },
];

function CreateOrderModal({ userId, isOpen, onClose, onCreate, catalogItems }: {
  userId: string;
  isOpen: boolean; onClose: () => void; onCreate: (d: Partial<DeliveryOrder>) => void; catalogItems: CatalogItem[];
}) {
  const [step, setStep] = useState(1);
  const initialData: WizardData = {
    orderType: 'domicilio', clientId: '', customerName: '', customerPhone: '',
    customerAddresses: [], selectedAddressId: '',
    channel: 'direct', priority: 'normal', cart: [], paymentMethod: 'efectivo',
    initialStatus: 'nuevo', notes: '',
  };
  const [data, setData] = useState<WizardData>(initialData);
  const [productSearch, setProductSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState('Casa');
  const [newAddrCustomLabel, setNewAddrCustomLabel] = useState('');
  const [newAddrStreet, setNewAddrStreet] = useState('');
  const [newAddrCity, setNewAddrCity] = useState('');
  const [clientLookup, setClientLookup] = useState('');
  const [phoneEditing, setPhoneEditing] = useState(true);

  const { results, isSearching, selectedClient, selectClient, clearSelection } = useClientPhoneSearch({
    userId,
    phone: clientLookup,
    enabled: isOpen && !!userId && step === 1 && phoneEditing,
    matchByName: true,
    minQueryLength: 2,
  });

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setData({ ...initialData });
      setProductSearch('');
      setCatFilter('all');
      setShowAddAddress(false);
      setNewAddrLabel('Casa');
      setNewAddrCustomLabel('');
      setNewAddrStreet('');
      setNewAddrCity('');
      setClientLookup('');
      setPhoneEditing(true);
      clearSelection();
    }
  }, [isOpen, clearSelection]);

  if (!isOpen) return null;

  const update = (partial: Partial<WizardData>) => setData(prev => ({ ...prev, ...partial }));

  const applyClient = (client: Client) => {
    selectClient(client);
    setPhoneEditing(false);
    setClientLookup('');
    const mapped = mapWizardAddressesFromClient(client);
    setData((prev) => ({
      ...prev,
      clientId: client.id,
      customerName: client.name || '',
      customerPhone: `${client.phonePrefix || ''} ${client.phone || ''}`.trim() || client.phone || '',
      customerAddresses: mapped.length > 0 ? mapped : prev.customerAddresses,
      selectedAddressId: mapped.length > 0 ? mapped[0].id : prev.selectedAddressId,
    }));
  };

  const clearClient = () => {
    clearSelection();
    setPhoneEditing(true);
    setClientLookup('');
    update({ clientId: '' });
  };
  const cartTotal = data.cart.reduce((s, i) => s + i.catalogItem.unitPrice * i.quantity, 0);
  const cartCount = data.cart.reduce((s, i) => s + i.quantity, 0);

  const selectedAddress = data.customerAddresses.find(a => a.id === data.selectedAddressId);

  const canNext = () => {
    if (step === 1) {
      return (
        data.customerName.trim().length >= 2 &&
        isValidDeliveryCustomerPhone(data.customerPhone) &&
        data.customerAddresses.length > 0 &&
        data.customerAddresses.every((a) => a.street.trim().length > 0 && a.city.trim().length > 0)
      );
    }
    if (step === 2) return data.orderType === 'recogida' || (data.customerAddresses.length > 0 && !!data.selectedAddressId);
    if (step === 3) return data.cart.length > 0;
    return true;
  };

  const handleAddAddress = () => {
    const label = newAddrLabel === 'Otro' ? newAddrCustomLabel.trim() : newAddrLabel;
    const street = newAddrStreet.trim();
    const city = newAddrCity.trim();
    if (!label || !street || !city) return;
    const newAddr: CustomerAddress = { id: `addr-${Date.now()}`, label, street, city };
    const updatedAddresses = [...data.customerAddresses, newAddr];
    update({ customerAddresses: updatedAddresses, selectedAddressId: data.selectedAddressId || newAddr.id });
    setNewAddrLabel('Casa');
    setNewAddrCustomLabel('');
    setNewAddrStreet('');
    setNewAddrCity('');
    setShowAddAddress(false);
  };

  const handleRemoveAddress = (addrId: string) => {
    const remaining = data.customerAddresses.filter(a => a.id !== addrId);
    update({
      customerAddresses: remaining,
      selectedAddressId: data.selectedAddressId === addrId ? (remaining[0]?.id || '') : data.selectedAddressId,
    });
  };

  const addToCart = (item: CatalogItem) => {
    const existing = data.cart.find(c => c.catalogItem._id === item._id);
    if (existing) {
      update({ cart: data.cart.map(c => c.catalogItem._id === item._id ? { ...c, quantity: c.quantity + 1 } : c) });
    } else {
      update({ cart: [...data.cart, { catalogItem: item, quantity: 1 }] });
    }
  };

  const removeFromCart = (itemId: string) => {
    const existing = data.cart.find(c => c.catalogItem._id === itemId);
    if (!existing) return;
    if (existing.quantity <= 1) {
      update({ cart: data.cart.filter(c => c.catalogItem._id !== itemId) });
    } else {
      update({ cart: data.cart.map(c => c.catalogItem._id === itemId ? { ...c, quantity: c.quantity - 1 } : c) });
    }
  };

  const getQty = (id: string) => data.cart.find(c => c.catalogItem._id === id)?.quantity || 0;

  const categories = [...new Set(catalogItems.filter(i => i.active).map(i => i.category).filter(Boolean))].sort();
  const filteredProducts = catalogItems.filter(i => i.active).filter(i => {
    if (catFilter !== 'all' && i.category !== catFilter) return false;
    if (productSearch) {
      const q = productSearch.toLowerCase();
      return i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCreate = () => {
    const orderItems: DeliveryOrderItem[] = data.cart.map((c, i) => ({
      id: `item-${Date.now()}-${i}`, name: c.catalogItem.name, quantity: c.quantity,
      unitPrice: c.catalogItem.unitPrice, total: c.catalogItem.unitPrice * c.quantity,
      catalogItemId: c.catalogItem._id,
      category: c.catalogItem.category,
      brandIds: Array.isArray(c.catalogItem.brandIds) ? c.catalogItem.brandIds : [],
    }));
    const status: DeliveryOrderStatus = data.initialStatus === 'cocina' ? 'cocina' : 'nuevo';
    const resolvedAddress = data.orderType === 'domicilio' && selectedAddress
      ? `[${selectedAddress.label}] ${formatCustomerAddressLine(selectedAddress)}` : '';
    onCreate({
      clientId: data.clientId || '',
      customerName: data.customerName, customerPhone: data.customerPhone,
      customerAddress: resolvedAddress,
      channel: data.channel, priority: data.priority, notes: data.notes, items: orderItems,
      totalAmount: cartTotal, status,
      stageHistory: [{ status, date: new Date().toISOString(), user: 'Sistema', notes: 'Pedido creado' }],
    });
  };

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelCls = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ height: '88vh', maxHeight: 700 }}>
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo pedido</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{WIZARD_STEPS[step - 1].label} — Paso {step} de 5</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
          <div className="flex items-center">
            {WIZARD_STEPS.map((s, idx) => (
              <div key={s.num} className="flex items-center flex-1">
                <button onClick={() => step > s.num && setStep(s.num)} className="flex flex-col items-center gap-0.5 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s.num ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 scale-110' : step > s.num ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                    {step > s.num ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.num}
                  </div>
                  <span className={`text-[9px] font-semibold hidden sm:block ${step === s.num ? 'text-gray-900 dark:text-gray-100' : step > s.num ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>{s.label}</span>
                </button>
                {idx < WIZARD_STEPS.length - 1 && <div className={`h-0.5 flex-1 max-w-6 mx-1 rounded-full ${step > s.num ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-700'}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Step 1: Cliente + Direcciones */}
          {step === 1 && (
            <div className="p-6 space-y-4">
              {phoneEditing && (
                <div>
                  <label className={labelCls}>Buscar cliente (teléfono o nombre)</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      className={`${inputCls} pl-10`}
                      placeholder="Ej. 612… o Iván Ortega"
                      value={clientLookup}
                      onChange={(e) => {
                        setClientLookup(e.target.value);
                        update({ clientId: '' });
                      }}
                      autoComplete="off"
                      autoFocus
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    Misma búsqueda que en TPV rápido y en nuevo pedido (pedidos).
                  </p>
                </div>
              )}
              {phoneEditing && results.length > 0 && (
                <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  {results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => applyClient(c)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {c.name || c.fullName || c.email || 'Cliente'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(c.phonePrefix || '+34') + ' ' + (c.phone || '')}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {selectedClient && !phoneEditing && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20">
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
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200 hover:bg-white/60 dark:hover:bg-gray-900/30 shrink-0"
                  >
                    Cambiar
                  </button>
                </div>
              )}
              <div>
                <label className={labelCls}>Nombre del cliente *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="Nombre y apellido"
                    value={data.customerName}
                    onChange={(e) => {
                      setPhoneEditing(true);
                      clearSelection();
                      update({ customerName: e.target.value, clientId: '' });
                    }}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Teléfono *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    className={`${inputCls} pl-10`}
                    placeholder="+34 6XX XXX XXX"
                    value={data.customerPhone}
                    onChange={(e) => {
                      setPhoneEditing(true);
                      clearSelection();
                      update({ customerPhone: e.target.value, clientId: '' });
                    }}
                  />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Mínimo 9 dígitos.</p>
              </div>

              {/* Direcciones */}
              <div>
                <label className={labelCls}>Direcciones *</label>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">Al menos una dirección con calle y ciudad.</p>
                {data.customerAddresses.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {data.customerAddresses.map(addr => {
                      const preset = ADDRESS_PRESETS.find(p => p.value === addr.label);
                      const Icon = preset?.icon || MapPin;
                      return (
                        <div key={addr.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl group">
                          <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">{addr.label}</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{formatCustomerAddressLine(addr)}</p>
                          </div>
                          <button onClick={() => handleRemoveAddress(addr.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <X className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {showAddAddress ? (
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Nombre de la dirección</label>
                      <div className="flex gap-2 flex-wrap">
                        {ADDRESS_PRESETS.map(p => (
                          <button key={p.value} onClick={() => { setNewAddrLabel(p.value); setNewAddrCustomLabel(''); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-all ${newAddrLabel === p.value ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>
                            <p.icon className="w-3.5 h-3.5" /> {p.label}
                          </button>
                        ))}
                        <button onClick={() => setNewAddrLabel('Otro')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-all ${newAddrLabel === 'Otro' ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>
                          <MapPin className="w-3.5 h-3.5" /> Otro
                        </button>
                      </div>
                      {newAddrLabel === 'Otro' && (
                        <input className={`${inputCls} mt-2`} placeholder="Nombre personalizado (ej: Oficina, Gym...)" value={newAddrCustomLabel} onChange={e => setNewAddrCustomLabel(e.target.value)} />
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Calle y número *</label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                          <input className={`${inputCls} pl-10`} placeholder="Calle, número, piso…" value={newAddrStreet} onChange={e => setNewAddrStreet(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Ciudad *</label>
                        <input className={inputCls} placeholder="Ciudad" value={newAddrCity} onChange={e => setNewAddrCity(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowAddAddress(false); setNewAddrLabel('Casa'); setNewAddrCustomLabel(''); setNewAddrStreet(''); setNewAddrCity(''); }}
                        className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-xs font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">Cancelar</button>
                      <button onClick={handleAddAddress}
                        disabled={!newAddrStreet.trim() || !newAddrCity.trim() || (newAddrLabel === 'Otro' && !newAddrCustomLabel.trim())}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${newAddrStreet.trim() && newAddrCity.trim() && (newAddrLabel !== 'Otro' || newAddrCustomLabel.trim()) ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                        <Check className="w-3.5 h-3.5" /> Guardar dirección
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddAddress(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                    <PlusCircle className="w-4 h-4" /> Añadir dirección
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Tipo + Canal/Prioridad */}
          {step === 2 && (
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">¿Cómo se entregará este pedido?</p>
              <div className="grid grid-cols-2 gap-4" style={{ minHeight: 160 }}>
                {([
                  { value: 'domicilio' as const, icon: Truck, title: 'A domicilio', desc: 'El repartidor lleva el pedido' },
                  { value: 'recogida' as const, icon: ShoppingBag, title: 'Recogida en local', desc: 'El cliente recoge aquí' },
                ] as const).map(opt => (
                  <button key={opt.value} onClick={() => update({ orderType: opt.value })}
                    className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all h-full ${data.orderType === opt.value ? 'border-gray-900 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'}`}>
                    <opt.icon className="w-10 h-10" />
                    <span className="font-bold text-base">{opt.title}</span>
                    <span className={`text-xs text-center leading-snug ${data.orderType === opt.value ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'}`}>{opt.desc}</span>
                  </button>
                ))}
              </div>

              {data.orderType === 'domicilio' && data.customerAddresses.length > 0 && (
                <div>
                  <label className={labelCls}>Dirección de entrega *</label>
                  <div className="space-y-2">
                    {data.customerAddresses.map(addr => {
                      const preset = ADDRESS_PRESETS.find(p => p.value === addr.label);
                      const Icon = preset?.icon || MapPin;
                      const isSelected = data.selectedAddressId === addr.id;
                      return (
                        <button key={addr.id} onClick={() => update({ selectedAddressId: addr.id })}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${isSelected ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400'}`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100' : 'border-gray-300 dark:border-gray-600'}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-gray-900" />}
                          </div>
                          <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">{addr.label}</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{formatCustomerAddressLine(addr)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.orderType === 'domicilio' && data.customerAddresses.length === 0 && (
                <div className="flex items-center gap-3 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">No hay direcciones añadidas. Vuelve al paso anterior para añadir al menos una dirección.</p>
                </div>
              )}

              {data.orderType === 'recogida' && (
                <div className="flex items-center gap-3 p-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <ShoppingBag className="w-4 h-4 text-gray-400 shrink-0" />
                  <p className="text-xs text-gray-600 dark:text-gray-400">Sin dirección necesaria. El cliente recogerá el pedido en local.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Canal</label>
                  <select className={inputCls} value={data.channel} onChange={e => update({ channel: e.target.value })}>
                    {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Prioridad</label>
                  <select className={inputCls} value={data.priority} onChange={e => update({ priority: e.target.value })}>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Productos del catálogo */}
          {step === 3 && (
            <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
              <div className="flex-shrink-0 px-6 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={`${inputCls} pl-10 pr-9`} placeholder="Buscar producto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                  {productSearch && <button onClick={() => setProductSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><X className="w-3.5 h-3.5 text-gray-400" /></button>}
                </div>
                {!productSearch && categories.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => setCatFilter('all')} className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${catFilter === 'all' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>Todos</button>
                    {categories.map(c => (
                      <button key={c} onClick={() => setCatFilter(c)} className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${catFilter === c ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{c}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-8"><Package className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">Sin productos</p></div>
                ) : filteredProducts.map(item => {
                  const qty = getQty(item._id);
                  return (
                    <div key={item._id} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${qty > 0 ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-900' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                      {item.image ? <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" /> : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-gray-400" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{item.name}</p>
                          {item.category && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full shrink-0">{item.category}</span>}
                        </div>
                        {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>}
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{item.unitPrice.toFixed(2)}€</p>
                      </div>
                      {qty === 0 ? (
                        <button onClick={() => addToCart(item)} className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center hover:opacity-80 transition-all shrink-0"><Plus className="w-4 h-4" /></button>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => removeFromCart(item._id)} className="w-8 h-8 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 flex items-center justify-center hover:border-gray-900 dark:hover:border-gray-100 transition-all"><span className="text-lg leading-none">-</span></button>
                          <span className="w-6 text-center font-bold text-gray-900 dark:text-gray-100">{qty}</span>
                          <button onClick={() => addToCart(item)} className="w-8 h-8 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center hover:opacity-80 transition-all"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {data.cart.length > 0 && (
                <div className="flex-shrink-0 px-6 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Pedido ({cartCount} {cartCount === 1 ? 'producto' : 'productos'})</p>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {data.cart.map(c => (
                      <div key={c.catalogItem._id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300"><span className="font-bold text-gray-900 dark:text-gray-100">{c.quantity}x</span> {c.catalogItem.name}</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{(c.catalogItem.unitPrice * c.quantity).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Pago */}
          {step === 4 && (
            <div className="p-6 space-y-5">
              <div>
                <label className={labelCls}>Método de pago</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {PAYMENT_METHOD_CONFIG.map(pm => (
                    <button key={pm.value} onClick={() => update({ paymentMethod: pm.value })}
                      className={`flex flex-col items-start gap-2 p-3.5 rounded-xl border-2 text-left transition-all ${data.paymentMethod === pm.value ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'}`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${data.paymentMethod === pm.value ? 'bg-white/20 dark:bg-gray-900/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
                        <pm.icon className="w-5 h-5" />
                      </div>
                      <p className="font-bold text-sm">{pm.label}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Estado inicial del pedido</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { value: 'nuevo' as const, label: 'Nuevo', desc: 'En espera de confirmación', icon: Clock },
                    { value: 'cocina' as const, label: 'A cocina', desc: 'Empieza a prepararse ya', icon: ChefHat },
                  ]).map(opt => (
                    <button key={opt.value} onClick={() => update({ initialStatus: opt.value })}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${data.initialStatus === opt.value ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${data.initialStatus === opt.value ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                        <opt.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${data.initialStatus === opt.value ? 'text-gray-900 dark:text-gray-100' : ''}`}>{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Notas del pedido <span className="font-normal text-gray-400 ml-1">(opcional)</span></label>
                <textarea rows={2} className={`${inputCls} resize-none`} placeholder="Indicaciones para cocina, entrega, alérgenos..." value={data.notes} onChange={e => update({ notes: e.target.value })} />
              </div>
            </div>
          )}

          {/* Step 5: Confirmación */}
          {step === 5 && (
            <div className="p-6 space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 space-y-0 divide-y divide-gray-200 dark:divide-gray-700">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3">Resumen del pedido</p>
                <div className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-full bg-gray-900 dark:bg-gray-100 flex items-center justify-center text-white dark:text-gray-900 font-bold text-xs shrink-0">
                    {data.customerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{data.customerName || 'Sin nombre'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{data.customerPhone || 'Sin teléfono'}</p>
                  </div>
                </div>
                <div className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Entrega</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{data.orderType === 'domicilio' ? 'A domicilio' : 'Recogida en local'}</span>
                  </div>
                  {data.orderType === 'domicilio' && selectedAddress && (
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">{selectedAddress.label}</span>
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatCustomerAddressLine(selectedAddress)}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="py-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Pago</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{PAYMENT_METHOD_CONFIG.find(p => p.value === data.paymentMethod)?.label}</span>
                </div>
                <div className="py-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Estado inicial</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{data.initialStatus === 'nuevo' ? 'Nuevo' : 'A cocina'}</span>
                </div>
                {data.notes && (
                  <div className="py-3"><span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notas</span><p className="text-xs text-gray-900 dark:text-gray-100">{data.notes}</p></div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Productos</p>
                <div className="space-y-1.5">
                  {data.cart.map(c => (
                    <div key={c.catalogItem._id} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-900 dark:text-gray-100 shrink-0">{c.quantity}</span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{c.catalogItem.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{(c.catalogItem.unitPrice * c.quantity).toFixed(2)}€</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-900 dark:bg-gray-100 rounded-xl text-white dark:text-gray-900">
                <span className="font-bold text-base">Total</span>
                <span className="font-bold text-2xl">{cartTotal.toFixed(2)}€</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {step >= 3 && cartCount > 0 && step < 5 && (
            <div className="mb-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">{cartCount} {cartCount === 1 ? 'producto' : 'productos'}</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">{cartTotal.toFixed(2)}€</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Atrás</button>
            ) : (
              <button onClick={onClose} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
            )}
            {step < 5 ? (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${canNext() ? 'bg-gray-900 dark:bg-gray-100 hover:opacity-90 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                {step === 4 ? 'Ver resumen' : 'Continuar'} <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleCreate}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Crear pedido
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Drawer ─────────────────────────────────────────────────────

function OrderDetailDrawer({ order, onClose, onAdvance, onSetStatus, onOpenResolve }: {
  order: DeliveryOrder | null; onClose: () => void;
  onAdvance: (o: DeliveryOrder) => void; onSetStatus: (o: DeliveryOrder, s: DeliveryOrderStatus, n?: string) => void;
  onOpenResolve?: () => void;
}) {
  if (!order) return null;
  const timeline = [...(order.stageHistory || [])].reverse();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-5 flex items-center justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${STATUS_CONFIG[order.status]?.badgeClass || ''}`}>{STATUS_CONFIG[order.status]?.label}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{formatDateES(order.createdAt)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Cliente */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><User className="w-4 h-4" /> Cliente</h4>
            <div className="text-sm text-gray-700 dark:text-gray-300">{order.customerName || '—'}</div>
            {order.customerPhone && <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {order.customerPhone}</div>}
            {order.customerAddress && <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {order.customerAddress}</div>}
          </div>

          {/* Productos */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Productos ({order.items?.length || 0})</h4>
            <div className="space-y-1.5">
              {(order.items || []).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded-lg min-w-[2rem] text-center">{item.quantity}x</span>
                    <span className="text-sm text-gray-800 dark:text-gray-200">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.total?.toFixed(2)}€</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Total</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{(order.totalAmount || 0).toFixed(2)}€</span>
            </div>
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="text-xs text-gray-500 dark:text-gray-400">Canal</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{CHANNEL_LABELS[order.channel] || order.channel}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="text-xs text-gray-500 dark:text-gray-400">Prioridad</div>
              <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[order.priority]?.dot || 'bg-gray-400'}`} /><span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{PRIORITY_CONFIG[order.priority]?.label || order.priority}</span></div>
            </div>
            {order.assignedDriver && <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl col-span-2"><div className="text-xs text-gray-500 dark:text-gray-400">Repartidor</div><div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.assignedDriver}</div></div>}
          </div>

          {order.notes && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-300">
              <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />{order.notes}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 flex-wrap">
            {NEXT_STATUS[order.status] && (
              <button onClick={() => onAdvance(order)} className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                <ArrowRight className="w-4 h-4" /> {NEXT_STATUS_LABEL[order.status]}
              </button>
            )}
            {order.status === 'incident' && onOpenResolve && (
              <button type="button" onClick={onOpenResolve} className="flex-1 min-w-[8rem] py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Resolver incidencia
              </button>
            )}
            {order.status !== 'incident' && order.status !== 'entregado' && order.status !== 'cancelled' && (
              <button onClick={() => onSetStatus(order, 'incident')} className="px-4 py-2.5 border-2 border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Incidencia
              </button>
            )}
            {order.status !== 'cancelled' && order.status !== 'entregado' && (
              <button onClick={() => onSetStatus(order, 'cancelled', 'Pedido cancelado')} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl text-sm font-medium">
                Cancelar
              </button>
            )}
          </div>

          {/* Timeline */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2"><History className="w-4 h-4" /> Timeline</h4>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Sin historial de estados</p>
            ) : (
              <div className="space-y-0">
                {timeline.map((ev, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full mt-1 ${idx === 0 ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-300 dark:bg-gray-600'}`} />
                      {idx < timeline.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 my-1" />}
                    </div>
                    <div className="pb-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-xs font-semibold rounded ${STATUS_CONFIG[ev.status]?.badgeClass || 'bg-gray-100 text-gray-600'}`}>{STATUS_CONFIG[ev.status]?.label || ev.status}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateES(ev.date)}</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ev.user}{ev.notes ? ` — ${ev.notes}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Incident Modal ──────────────────────────────────────────────────────────

function IncidentModal({ isOpen, onClose, onSubmit }: { isOpen: boolean; onClose: () => void; onSubmit: (type: string, notes: string) => void }) {
  const [incType, setIncType] = useState('general');
  const [notes, setNotes] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> Reportar incidencia</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo de incidencia</label>
            <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" value={incType} onChange={e => setIncType(e.target.value)}>
              <option value="general">General</option>
              <option value="producto_incorrecto">Producto incorrecto</option>
              <option value="producto_dañado">Producto dañado</option>
              <option value="retraso">Retraso</option>
              <option value="cliente_ausente">Cliente ausente</option>
              <option value="direccion_incorrecta">Dirección incorrecta</option>
              <option value="cobro">Problema de cobro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Descripción *</label>
            <textarea rows={3} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none" placeholder="Describe la incidencia..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
            <button onClick={() => { if (!notes.trim()) { toast.error('Describe la incidencia'); return; } onSubmit(incType, notes); setNotes(''); setIncType('general'); }} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors">Reportar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Resolve Incident Modal ──────────────────────────────────────────────────

function ResolveIncidentModal({ isOpen, onClose, onResolve }: { isOpen: boolean; onClose: () => void; onResolve: (notes: string) => void }) {
  const [notes, setNotes] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-500" /> Resolver incidencia</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas de resolución</label>
            <textarea rows={3} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none" placeholder="¿Cómo se resolvió la incidencia?" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
            <button onClick={() => { onResolve(notes); setNotes(''); }} className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors">Resolver</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════

export interface DeliveryProps {
  /** Sin Layout global (p. ej. embebido en Centro Operativo) */
  embedded?: boolean;
  /** Al pulsar «Volver» en modo embebido */
  onEmbeddedBack?: () => void;
}

export function Delivery({ embedded, onEmbeddedBack }: DeliveryProps = {}) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = resolveBusinessDataUserId(user, currentBusiness);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** Tienda activa (sidebar / centro ops): solo pedidos de ese PDV en esta vista. */
  const [activeStoreScope, setActiveStoreScope] = useState<{ pdvId: string; label: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<DeliveryOrderStatus | 'all'>('all');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [incidentOrder, setIncidentOrder] = useState<DeliveryOrder | null>(null);
  const [resolveOrder, setResolveOrder] = useState<DeliveryOrder | null>(null);

  const tabParam = searchParams.get('tab');
  const activeTab =
    tabParam && DELIVERY_MAIN_TAB_IDS.has(tabParam) ? tabParam : 'orders';

  const setActiveTab = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === 'orders') next.delete('tab');
          else next.set('tab', tabId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && !DELIVERY_MAIN_TAB_IDS.has(t)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('tab');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useModalClose(showCreate, () => setShowCreate(false));
  useModalClose(!!selectedOrder, () => setSelectedOrder(null));
  useModalClose(!!incidentOrder, () => setIncidentOrder(null));
  useModalClose(!!resolveOrder, () => setResolveOrder(null));

  const syncActiveStoreFromPreference = useCallback(async () => {
    if (!userId) {
      setActiveStoreScope(null);
      return;
    }
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    if (!bid) {
      setActiveStoreScope(null);
      return;
    }
    const raw = readDeliveryOpsSelectedPdvId(bid, userId);
    try {
      const pdvRaw = await listPointsOfSaleRequest(userId);
      const merged = await mergePointsOfSaleWithRetailWorkCenters(userId, pdvRaw, { business: currentBusiness });
      const pdvId = resolvePreferenceToPdvId(merged, raw);
      const p = merged.find((x) => x._id === pdvId);
      if (pdvId && p) {
        setActiveStoreScope({ pdvId, label: pointOfSaleDisplayLabel(p) });
      } else {
        setActiveStoreScope(null);
      }
    } catch {
      setActiveStoreScope(null);
    }
  }, [userId, currentBusiness]);

  useEffect(() => {
    void syncActiveStoreFromPreference();
  }, [syncActiveStoreFromPreference]);

  useEffect(() => {
    const onStore = () => {
      void syncActiveStoreFromPreference();
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
  }, [syncActiveStoreFromPreference]);

  const loadOrders = useCallback(async () => {
    if (!userId) return;
    try {
      const [ordersData, catalogData] = await Promise.all([
        listDeliveryOrdersRequest(userId),
        listCatalogItemsRequest(userId),
      ]);
      setOrders(ordersData);
      setCatalogItems(catalogData);
    } catch {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleCreate = async (data: Partial<DeliveryOrder>) => {
    if (!userId) return;
    try {
      const created = await createDeliveryOrderRequest(userId, data);
      setOrders(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success(`Pedido ${created.orderNumber} creado`);
    } catch {
      toast.error('Error al crear el pedido');
    }
  };

  const handleDelete = async (order: DeliveryOrder) => {
    if (!userId) return;
    if (!confirm(`¿Eliminar el pedido ${order.orderNumber}?`)) return;
    try {
      await deleteDeliveryOrderRequest(userId, order._id);
      setOrders(prev => prev.filter(o => o._id !== order._id));
      toast.success('Pedido eliminado');
    } catch {
      toast.error('Error al eliminar el pedido');
    }
  };

  const handleAdvanceStatus = async (order: DeliveryOrder) => {
    if (!userId) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      const now = new Date().toISOString();
      const extras: Partial<DeliveryOrder> = {};
      if (next === 'cocina') extras.kitchenStartedAt = now;
      if (next === 'listo') { extras.kitchenCompletedAt = now; extras.assemblyStartedAt = now; }
      if (next === 'entregado') { extras.assemblyCompletedAt = now; extras.deliveredAt = now; }

      const updated = await updateDeliveryOrderRequest(userId, {
        ...order, ...extras, status: next,
        stageHistory: [...(order.stageHistory || []), { status: next, date: now, user: user.fullName || 'Sistema' }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success(`Estado actualizado a: ${STATUS_CONFIG[next].label}`);
    } catch {
      toast.error('Error al actualizar el estado');
    }
  };

  const handleSetStatus = async (order: DeliveryOrder, status: DeliveryOrderStatus, notes?: string) => {
    if (!userId) return;
    try {
      const updated = await updateDeliveryOrderRequest(userId, {
        ...order, status,
        incidentNotes: status === 'incident' ? (notes || order.incidentNotes) : order.incidentNotes,
        incidentType: status === 'incident' ? (order.incidentType || 'general') : order.incidentType,
        stageHistory: [...(order.stageHistory || []), { status, date: new Date().toISOString(), user: user.fullName || 'Sistema', notes }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success(`Estado actualizado a: ${STATUS_CONFIG[status].label}`);
    } catch {
      toast.error('Error al actualizar el estado');
    }
  };

  const handleIncident = async (order: DeliveryOrder, incType: string, notes: string) => {
    if (!userId) return;
    try {
      const updated = await updateDeliveryOrderRequest(userId, {
        ...order, status: 'incident' as DeliveryOrderStatus, incidentNotes: notes, incidentType: incType,
        stageHistory: [...(order.stageHistory || []), { status: 'incident' as DeliveryOrderStatus, date: new Date().toISOString(), user: user.fullName || 'Sistema', notes: `[${incType}] ${notes}` }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setIncidentOrder(null);
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success('Incidencia reportada');
    } catch {
      toast.error('Error al reportar incidencia');
    }
  };

  const handleResolveIncident = async (order: DeliveryOrder, notes: string) => {
    if (!userId) return;
    try {
      const updated = await updateDeliveryOrderRequest(userId, {
        ...order, status: 'nuevo' as DeliveryOrderStatus,
        stageHistory: [...(order.stageHistory || []), { status: 'nuevo' as DeliveryOrderStatus, date: new Date().toISOString(), user: user.fullName || 'Sistema', notes: `Incidencia resuelta${notes ? `: ${notes}` : ''}` }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setResolveOrder(null);
      if (selectedOrder?._id === updated._id) setSelectedOrder(updated);
      toast.success('Incidencia resuelta');
    } catch {
      toast.error('Error al resolver incidencia');
    }
  };

  const ordersForScope = useMemo(() => {
    if (!activeStoreScope?.pdvId) return orders;
    return orders.filter((o) => o.salesPointId === activeStoreScope.pdvId);
  }, [orders, activeStoreScope?.pdvId]);

  const filtered = useMemo(() => {
    return ordersForScope.filter(o => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return o.orderNumber?.toLowerCase().includes(q) || o.customerName?.toLowerCase().includes(q) || o.customerAddress?.toLowerCase().includes(q) || o.customerPhone?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [ordersForScope, search, filterStatus]);

  const kpis = useMemo(() => ({
    pending: ordersForScope.filter(o => o.status === 'nuevo').length,
    kitchen: ordersForScope.filter(o => o.status === 'cocina').length,
    assembly: ordersForScope.filter(o => o.status === 'listo').length,
    delivery: ordersForScope.filter(o => o.status === 'listo' && o.deliveryType === 'domicilio').length,
    delivered: ordersForScope.filter(o => o.status === 'entregado').length,
    incidents: ordersForScope.filter(o => o.status === 'incident').length,
  }), [ordersForScope]);

  const historyTabCount = useMemo(
    () => ordersForScope.filter(o => o.status === 'entregado' || o.status === 'cancelled').length,
    [ordersForScope],
  );

  const tabsConfig = [
    { id: 'orders', label: 'Pedidos', count: ordersForScope.filter(o => !['entregado', 'cancelled'].includes(o.status)).length || undefined },
    { id: 'history', label: 'Historial', count: historyTabCount || undefined },
  ];

  // ═══ TAB: Pedidos ═══
  const renderOrdersTab = () => (
    <div className="space-y-5">
      {embedded && activeStoreScope && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/90 dark:bg-teal-950/40 px-4 py-3 text-sm text-teal-900 dark:text-teal-100">
          <span className="font-semibold">Tienda activa:</span>{' '}
          <span className="font-bold">{activeStoreScope.label}</span>
          <span className="text-teal-800/90 dark:text-teal-200/90"> — solo ves pedidos de esta sede. Cambia de tienda desde el menú lateral (Centros de trabajo).</span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Pendientes', value: kpis.pending, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', num: 'text-amber-900', icon: <Clock className="w-5 h-5" /> },
          { label: 'En cocina', value: kpis.kitchen, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', num: 'text-orange-900', icon: <ChefHat className="w-5 h-5" /> },
          { label: 'En montaje', value: kpis.assembly, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', num: 'text-indigo-900', icon: <Package className="w-5 h-5" /> },
          { label: 'En reparto', value: kpis.delivery, bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', num: 'text-cyan-900', icon: <Truck className="w-5 h-5" /> },
          { label: 'Entregados', value: kpis.delivered, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', num: 'text-green-900', icon: <CheckCircle2 className="w-5 h-5" /> },
          { label: 'Incidencias', value: kpis.incidents, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', num: 'text-red-900', icon: <AlertTriangle className="w-5 h-5" /> },
        ].map(kpi => (
          <div key={kpi.label} className={`p-4 ${kpi.bg} border-2 ${kpi.border} rounded-xl`}>
            <div className={`${kpi.text} mb-2`}>{kpi.icon}</div><div className={`text-2xl font-bold ${kpi.num}`}>{kpi.value}</div><div className={`text-xs ${kpi.text} mt-0.5`}>{kpi.label}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Buscar pedido, cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl flex items-center gap-2 font-medium transition-colors shrink-0"><Plus className="w-5 h-5" /> Nuevo pedido</button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as DeliveryOrderStatus | 'all')}>
          <option value="all">Todos los estados</option>{Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400"><div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />Cargando pedidos...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <ShoppingBag className="w-12 h-12 text-gray-300 mb-3" /><p className="font-semibold">No hay pedidos</p><p className="text-sm mt-1">Crea el primer pedido de delivery</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium">+ Nuevo pedido</button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {['Pedido#', 'Cliente', 'Dirección', 'Canal', 'Estado', 'Prioridad', 'Total', 'Acciones'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(order => (
                <tr key={order._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer" onClick={() => setSelectedOrder(order)}>
                  <td className="px-4 py-3"><div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</div><div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleDateString('es-ES')}</div></td>
                  <td className="px-4 py-3"><div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.customerName || '—'}</div>{order.customerPhone && <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {order.customerPhone}</div>}</td>
                  <td className="px-4 py-3"><div className="text-sm text-gray-700 dark:text-gray-300 max-w-48 truncate">{order.customerAddress || '—'}</div></td>
                  <td className="px-4 py-3"><span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">{CHANNEL_LABELS[order.channel] || order.channel}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full border ${STATUS_CONFIG[order.status]?.badgeClass || ''}`}>{STATUS_CONFIG[order.status]?.label || order.status}</span></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[order.priority]?.dot || 'bg-gray-400'}`} /><span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PRIORITY_CONFIG[order.priority]?.badgeClass || ''}`}>{PRIORITY_CONFIG[order.priority]?.label || order.priority}</span></div></td>
                  <td className="px-4 py-3"><div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{order.totalAmount > 0 ? `${order.totalAmount.toFixed(2)}€` : '—'}</div></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedOrder(order)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Ver detalle"><Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button>
                      {NEXT_STATUS[order.status] && <button onClick={() => handleAdvanceStatus(order)} className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg" title={NEXT_STATUS_LABEL[order.status]}><ArrowRight className="w-4 h-4 text-blue-600" /></button>}
                      {!['incident', 'entregado', 'cancelled'].includes(order.status) && <button onClick={() => setIncidentOrder(order)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg" title="Incidencia"><AlertCircle className="w-4 h-4 text-red-500" /></button>}
                      <button onClick={() => handleDelete(order)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg" title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ═══ TAB: Historial (con exportar CSV) ═══
  const renderHistoryTab = () => {
    const historyOrders = ordersForScope
      .filter(o => o.status === 'entregado' || o.status === 'cancelled')
      .filter(o => {
        if (historyFrom && new Date(o.createdAt) < new Date(historyFrom)) return false;
        if (historyTo) { const to = new Date(historyTo); to.setHours(23, 59, 59, 999); if (new Date(o.createdAt) > to) return false; }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalDelivered = historyOrders.filter(o => o.status === 'entregado').length;
    const totalRevenue = historyOrders.filter(o => o.status === 'entregado').reduce((s, o) => s + (o.totalAmount || 0), 0);

    const exportCSV = () => {
      const header = 'Pedido;Cliente;Canal;Estado;Total;Creado;Entregado;Duración\n';
      const rows = historyOrders.map(o => {
        const created = new Date(o.createdAt);
        const delivered = o.deliveredAt ? new Date(o.deliveredAt) : null;
        const diffMs = delivered ? delivered.getTime() - created.getTime() : 0;
        const mins = Math.round(diffMs / 60000);
        const dur = delivered ? (mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`) : '';
        return `${o.orderNumber};${o.customerName};${CHANNEL_LABELS[o.channel] || o.channel};${STATUS_CONFIG[o.status]?.label};${o.totalAmount?.toFixed(2)}€;${created.toLocaleString('es-ES')};${delivered ? delivered.toLocaleString('es-ES') : ''};${dur}`;
      }).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `delivery-historial-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Historial exportado a CSV');
    };

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center"><History className="w-5 h-5 text-gray-600 dark:text-gray-400" /></div><div><h3 className="font-bold text-gray-900 dark:text-gray-100">Historial de pedidos</h3><p className="text-sm text-gray-500 dark:text-gray-400">Pedidos entregados y cancelados</p></div></div>
          <button onClick={exportCSV} className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"><Download className="w-4 h-4" /> Exportar CSV</button>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div><label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Desde</label><input type="date" className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" value={historyFrom} onChange={e => setHistoryFrom(e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Hasta</label><input type="date" className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" value={historyTo} onChange={e => setHistoryTo(e.target.value)} /></div>
          {(historyFrom || historyTo) && <button onClick={() => { setHistoryFrom(''); setHistoryTo(''); }} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-1"><X className="w-4 h-4" /> Limpiar</button>}
          <div className="sm:ml-auto flex gap-4">
            <div className="text-center"><div className="text-2xl font-bold text-green-700">{totalDelivered}</div><div className="text-xs text-gray-500 dark:text-gray-400">Entregados</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalRevenue.toFixed(2)}€</div><div className="text-xs text-gray-500 dark:text-gray-400">Facturado</div></div>
          </div>
        </div>
        {historyOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><FileText className="w-12 h-12 text-gray-300 mb-3" /><p className="font-semibold">Sin historial</p></div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead><tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {['Pedido#', 'Cliente', 'Canal', 'Estado', 'Total', 'Creado', 'Entregado', 'Duración', ''].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {historyOrders.map(order => {
                  const created = new Date(order.createdAt);
                  const delivered = order.deliveredAt ? new Date(order.deliveredAt) : null;
                  let duration = '—';
                  if (delivered) { const mins = Math.round((delivered.getTime() - created.getTime()) / 60000); duration = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`; }
                  return (
                    <tr key={order._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-4 py-3"><span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{order.customerName || '—'}</td>
                      <td className="px-4 py-3"><span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">{CHANNEL_LABELS[order.channel] || order.channel}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full border ${STATUS_CONFIG[order.status]?.badgeClass || ''}`}>{STATUS_CONFIG[order.status]?.label}</span></td>
                      <td className="px-4 py-3"><span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{order.totalAmount > 0 ? `${order.totalAmount.toFixed(2)}€` : '—'}</span></td>
                      <td className="px-4 py-3"><span className="text-xs text-gray-500 dark:text-gray-400">{created.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span></td>
                      <td className="px-4 py-3"><span className="text-xs text-gray-500 dark:text-gray-400">{delivered ? delivered.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span></td>
                      <td className="px-4 py-3"><span className={`text-sm font-semibold ${delivered ? 'text-green-700' : 'text-gray-400'}`}>{duration}</span></td>
                      <td className="px-4 py-3"><button onClick={() => setSelectedOrder(order)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Ver detalle"><Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const body = (
    <>
      {embedded && onEmbeddedBack && (
        <div className="mb-4">
          <button
            type="button"
            onClick={onEmbeddedBack}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" /> Volver al Centro Operativo
          </button>
        </div>
      )}
      {!embedded && (
        <div className="mb-4">
          <Link
            to="/saas/delivery-ops"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" /> Centro Operativo
          </Link>
        </div>
      )}
      <div className="space-y-6">
        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />
        {activeTab === 'orders' && renderOrdersTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </div>

      <CreateOrderModal userId={userId} isOpen={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} catalogItems={catalogItems} />
      <OrderDetailDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onAdvance={handleAdvanceStatus}
        onSetStatus={handleSetStatus}
        onOpenResolve={() => { if (selectedOrder?.status === 'incident') setResolveOrder(selectedOrder); }}
      />
      <IncidentModal isOpen={!!incidentOrder} onClose={() => setIncidentOrder(null)} onSubmit={(type, notes) => incidentOrder && handleIncident(incidentOrder, type, notes)} />
      <ResolveIncidentModal isOpen={!!resolveOrder} onClose={() => setResolveOrder(null)} onResolve={(notes) => resolveOrder && handleResolveIncident(resolveOrder, notes)} />
    </>
  );

  if (embedded) return body;

  return (
    <Layout title="Pedidos delivery" subtitle="Vista secundaria · el Centro Operativo es tu hub principal">
      {body}
    </Layout>
  );
}
