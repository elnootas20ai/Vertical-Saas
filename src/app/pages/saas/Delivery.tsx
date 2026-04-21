import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import {
  listDeliveryOrdersRequest,
  createDeliveryOrderRequest,
  updateDeliveryOrderRequest,
  deleteDeliveryOrderRequest,
  listCatalogItemsRequest,
  listDriverCashSessionsRequest,
  listPointsOfSaleRequest,
  createPointOfSaleRequest,
  updatePointOfSaleRequest,
  deletePointOfSaleRequest,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryOrderItem,
  type CatalogItem,
  type DriverCashSession,
  type PointOfSale,
  type TerminalConfig,
} from '../../lib/deliveryApi';
import { DriverCashModal } from '../../components/delivery/DriverCashModal';
import {
  Plus,
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
  ArrowRight,
  Phone,
  MapPin,
  User,
  Timer,
  FileText,
  MessageSquare,
  ChevronRight,
  Download,
  Eye,
  Edit3,
  RotateCcw,
  Check,
  Banknote,
  Wifi,
  ArrowUpRight,
  Home,
  Briefcase,
  PlusCircle,
  Wallet,
  Lock,
  Unlock,
  Receipt,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Store,
  Monitor,
  Smartphone,
  Printer,
} from 'lucide-react';

const STATUS_CONFIG: Record<DeliveryOrderStatus, { label: string; badgeClass: string }> = {
  nuevo: { label: 'Nuevo', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  cocina: { label: 'En cocina', badgeClass: 'bg-orange-100 text-orange-700 border-orange-200' },
  listo: { label: 'Listo', badgeClass: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
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

const NEXT_STATUS: Partial<Record<DeliveryOrderStatus, DeliveryOrderStatus>> = {
  nuevo: 'cocina', cocina: 'listo', listo: 'entregado',
};
const NEXT_STATUS_LABEL: Partial<Record<DeliveryOrderStatus, string>> = {
  nuevo: 'A cocina', cocina: 'Marcar listo', listo: 'Entregado',
};

const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'online', 'bizum'] as const;
const PAYMENT_LABELS: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', online: 'Online', bizum: 'Bizum' };

const MONTAJE_CHECKLIST = ['Bolsa/Caja', 'Platos principales', 'Bebidas', 'Complementos', 'Postres', 'Salsas/Cubiertos', 'Ticket'];

function timeSince(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

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
  address: string;
}

const ADDRESS_PRESETS: { value: string; label: string; icon: typeof Home }[] = [
  { value: 'Casa', label: 'Casa', icon: Home },
  { value: 'Trabajo', label: 'Trabajo', icon: Briefcase },
];

interface WizardData {
  orderType: OrderType;
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

function CreateOrderModal({ isOpen, onClose, onCreate, catalogItems }: {
  isOpen: boolean; onClose: () => void; onCreate: (d: Partial<DeliveryOrder>) => void; catalogItems: CatalogItem[];
}) {
  const [step, setStep] = useState(1);
  const initialData: WizardData = {
    orderType: 'domicilio', customerName: '', customerPhone: '',
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
  const [newAddrValue, setNewAddrValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setData({ ...initialData });
      setProductSearch('');
      setCatFilter('all');
      setShowAddAddress(false);
      setNewAddrLabel('Casa');
      setNewAddrCustomLabel('');
      setNewAddrValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const update = (partial: Partial<WizardData>) => setData(prev => ({ ...prev, ...partial }));
  const cartTotal = data.cart.reduce((s, i) => s + i.catalogItem.unitPrice * i.quantity, 0);
  const cartCount = data.cart.reduce((s, i) => s + i.quantity, 0);

  const selectedAddress = data.customerAddresses.find(a => a.id === data.selectedAddressId);

  const canNext = () => {
    if (step === 1) return data.customerName.trim().length > 0 && data.customerPhone.trim().length > 0;
    if (step === 2) return data.orderType === 'recogida' || (data.customerAddresses.length > 0 && !!data.selectedAddressId);
    if (step === 3) return data.cart.length > 0;
    return true;
  };

  const handleAddAddress = () => {
    const label = newAddrLabel === 'Otro' ? newAddrCustomLabel.trim() : newAddrLabel;
    if (!label || !newAddrValue.trim()) return;
    const newAddr: CustomerAddress = { id: `addr-${Date.now()}`, label, address: newAddrValue.trim() };
    const updatedAddresses = [...data.customerAddresses, newAddr];
    update({ customerAddresses: updatedAddresses, selectedAddressId: data.selectedAddressId || newAddr.id });
    setNewAddrLabel('Casa');
    setNewAddrCustomLabel('');
    setNewAddrValue('');
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
    }));
    const status: DeliveryOrderStatus = data.initialStatus === 'cocina' ? 'cocina' : 'nuevo';
    const resolvedAddress = data.orderType === 'domicilio' && selectedAddress
      ? `[${selectedAddress.label}] ${selectedAddress.address}` : '';
    onCreate({
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
              <div>
                <label className={labelCls}>Teléfono *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="tel" className={`${inputCls} pl-10`} placeholder="+34 6XX XXX XXX" value={data.customerPhone} onChange={e => update({ customerPhone: e.target.value })} autoFocus />
                </div>
              </div>
              <div>
                <label className={labelCls}>Nombre del cliente *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={`${inputCls} pl-10`} placeholder="Nombre y apellido" value={data.customerName} onChange={e => update({ customerName: e.target.value })} />
                </div>
              </div>

              {/* Direcciones */}
              <div>
                <label className={labelCls}>Direcciones</label>
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
                            <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{addr.address}</p>
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
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Dirección completa</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <input className={`${inputCls} pl-10`} placeholder="Calle, número, piso, CP..." value={newAddrValue} onChange={e => setNewAddrValue(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowAddAddress(false); setNewAddrLabel('Casa'); setNewAddrCustomLabel(''); setNewAddrValue(''); }}
                        className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-xs font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">Cancelar</button>
                      <button onClick={handleAddAddress}
                        disabled={!newAddrValue.trim() || (newAddrLabel === 'Otro' && !newAddrCustomLabel.trim())}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${newAddrValue.trim() && (newAddrLabel !== 'Otro' || newAddrCustomLabel.trim()) ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
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
                            <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{addr.address}</p>
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
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{selectedAddress.address}</p>
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

function OrderDetailDrawer({ order, onClose, onAdvance, onSetStatus }: {
  order: DeliveryOrder | null; onClose: () => void;
  onAdvance: (o: DeliveryOrder) => void; onSetStatus: (o: DeliveryOrder, s: DeliveryOrderStatus, n?: string) => void;
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
          <div className="flex gap-2">
            {NEXT_STATUS[order.status] && (
              <button onClick={() => onAdvance(order)} className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                <ArrowRight className="w-4 h-4" /> {NEXT_STATUS_LABEL[order.status]}
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

// ─── Assign Driver Modal ─────────────────────────────────────────────────────

function AssignDriverModal({ isOpen, onClose, onAssign, currentDriver }: { isOpen: boolean; onClose: () => void; onAssign: (name: string) => void; currentDriver: string }) {
  const [name, setName] = useState(currentDriver);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Asignar repartidor</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Nombre del repartidor" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
            <button onClick={() => { if (!name.trim()) { toast.error('Indica el nombre'); return; } onAssign(name.trim()); }} className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors">Asignar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function _LegacyOpenCashSessionForm({ onOpen, orders }: { onOpen: (name: string, amount: number) => void; orders: DeliveryOrder[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('50');

  const knownDrivers = [...new Set(orders.map(o => o.assignedDriver).filter(Boolean))].sort();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors">
        <Unlock className="w-4 h-4" /> Abrir caja de repartidor
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl p-5 space-y-4">
      <h4 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Unlock className="w-4 h-4 text-emerald-600" /> Abrir nueva caja</h4>
      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Repartidor *</label>
        <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="Nombre del repartidor" value={name} onChange={e => setName(e.target.value)} autoFocus />
        {knownDrivers.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {knownDrivers.map(d => (
              <button key={d} onClick={() => setName(d)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${name === d ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                {d}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Fondo de caja inicial (€) *</label>
        <div className="flex gap-2">
          {['20', '30', '50', '100'].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              className={`px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${amount === v ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>
              {v}€
            </button>
          ))}
          <input type="number" className="flex-1 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            placeholder="Otro" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.01" />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => { setOpen(false); setName(''); setAmount('50'); }}
          className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
        <button onClick={() => { if (!name.trim()) { toast.error('Indica el nombre del repartidor'); return; } onOpen(name.trim(), Number(amount) || 0); setOpen(false); setName(''); setAmount('50'); }}
          disabled={!name.trim() || !amount}
          className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${name.trim() && amount ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
          <Unlock className="w-4 h-4" /> Abrir caja con {Number(amount || 0).toFixed(2)}€
        </button>
      </div>
    </div>
  );
}

// ─── Driver Cash Session Card (active) ──────────────────────────────────────

function DriverCashSessionCard({ session, orders, onAddTransaction, onClose }: {
  session: DriverCashSession; orders: DeliveryOrder[];
  onAddTransaction: (s: DriverCashSession, tx: CashTransaction) => void;
  onClose: (s: DriverCashSession, actualCash: number, notes: string) => void;
}) {
  const [showAddTx, setShowAddTx] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [txType, setTxType] = useState<'cobro' | 'gasto' | 'ajuste'>('cobro');
  const [txMethod, setTxMethod] = useState<'efectivo' | 'tarjeta' | 'bizum' | 'online'>('efectivo');
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txOrderNumber, setTxOrderNumber] = useState('');
  const [closeCash, setCloseCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const cashIn = session.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'efectivo').reduce((s, t) => s + t.amount, 0);
  const cashOut = session.transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);
  const adjustments = session.transactions.filter(t => t.type === 'ajuste').reduce((s, t) => s + t.amount, 0);
  const expectedCash = session.initialFloat + cashIn - cashOut + adjustments;
  const totalSales = session.transactions.filter(t => t.type === 'cobro').reduce((s, t) => s + t.amount, 0);
  const cardSales = session.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'tarjeta').reduce((s, t) => s + t.amount, 0);
  const bizumSales = session.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'bizum').reduce((s, t) => s + t.amount, 0);
  const onlineSales = session.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'online').reduce((s, t) => s + t.amount, 0);

  const deliveredByDriver = orders.filter(o =>
    o.assignedDriver === session.driverName && o.status === 'entregado' &&
    o.deliveredAt && new Date(o.deliveredAt) >= new Date(session.openedAt)
  );

  const handleSubmitTx = () => {
    const amt = Number(txAmount);
    if (!amt || amt <= 0) { toast.error('Indica un importe válido'); return; }
    const tx: CashTransaction = {
      id: `tx-${Date.now()}`, type: txType, paymentMethod: txMethod, amount: amt,
      description: txDesc || `${txType === 'cobro' ? 'Cobro' : txType === 'gasto' ? 'Gasto' : 'Ajuste'} ${txOrderNumber ? `- ${txOrderNumber}` : ''}`.trim(),
      orderNumber: txOrderNumber || undefined, date: new Date().toISOString(),
    };
    onAddTransaction(session, tx);
    setTxAmount(''); setTxDesc(''); setTxOrderNumber(''); setShowAddTx(false);
  };

  const handleQuickCharge = (order: DeliveryOrder, method: 'efectivo' | 'tarjeta' | 'bizum' | 'online') => {
    const tx: CashTransaction = {
      id: `tx-${Date.now()}`, type: 'cobro', paymentMethod: method, amount: order.totalAmount,
      description: `Cobro ${order.orderNumber} — ${order.customerName}`,
      orderNumber: order.orderNumber, orderId: order._id, date: new Date().toISOString(),
    };
    onAddTransaction(session, tx);
  };

  const alreadyCharged = new Set(session.transactions.filter(t => t.orderId).map(t => t.orderId));
  const pendingOrders = deliveredByDriver.filter(o => !alreadyCharged.has(o._id));

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {session.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <div className="font-bold text-gray-900 dark:text-gray-100">{session.driverName}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Abierta {new Date(session.openedAt).toLocaleString('es-ES', { timeStyle: 'short', dateStyle: 'short' })}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 dark:text-gray-400">Efectivo esperado</div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{expectedCash.toFixed(2)}€</div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <div className="text-xs text-gray-500 dark:text-gray-400">Fondo inicial</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{session.initialFloat.toFixed(2)}€</div>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
            <div className="text-xs text-green-600 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Ventas totales</div>
            <div className="text-lg font-bold text-green-700 dark:text-green-400">{totalSales.toFixed(2)}€</div>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
            <div className="text-xs text-red-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Gastos</div>
            <div className="text-lg font-bold text-red-700 dark:text-red-400">{cashOut.toFixed(2)}€</div>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <div className="text-xs text-blue-600">Entregas</div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{deliveredByDriver.length}</div>
          </div>
        </div>

        {/* Desglose por método */}
        {totalSales > 0 && (
          <div className="flex gap-3 flex-wrap text-xs">
            {cashIn > 0 && <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg font-medium flex items-center gap-1"><Banknote className="w-3 h-3" /> Efectivo: {cashIn.toFixed(2)}€</span>}
            {cardSales > 0 && <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg font-medium flex items-center gap-1"><CreditCard className="w-3 h-3" /> Tarjeta: {cardSales.toFixed(2)}€</span>}
            {bizumSales > 0 && <span className="px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg font-medium flex items-center gap-1"><Phone className="w-3 h-3" /> Bizum: {bizumSales.toFixed(2)}€</span>}
            {onlineSales > 0 && <span className="px-2.5 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 rounded-lg font-medium flex items-center gap-1"><Wifi className="w-3 h-3" /> Online: {onlineSales.toFixed(2)}€</span>}
          </div>
        )}

        {/* Pedidos sin cobrar de este repartidor */}
        {pendingOrders.length > 0 && (
          <div>
            <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> Pedidos entregados sin cobrar ({pendingOrders.length})
            </h5>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingOrders.map(order => (
                <div key={order._id} className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
                      <span className="text-xs text-gray-500">{order.customerName}</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{order.totalAmount.toFixed(2)}€</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {(['efectivo', 'tarjeta', 'bizum'] as const).map(m => (
                      <button key={m} onClick={() => handleQuickCharge(order, m)}
                        className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors">
                        {m === 'efectivo' ? '💵' : m === 'tarjeta' ? '💳' : '📱'} {PAYMENT_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Movimientos */}
        {session.transactions.length > 0 && (
          <div>
            <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Movimientos ({session.transactions.length})</h5>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {[...session.transactions].reverse().map(tx => (
                <div key={tx.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'cobro' ? 'bg-green-100 text-green-600' : tx.type === 'gasto' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                    {tx.type === 'cobro' ? <TrendingUp className="w-3 h-3" /> : tx.type === 'gasto' ? <TrendingDown className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 dark:text-gray-100 truncate">{tx.description}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
                      <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-300">{PAYMENT_LABELS[tx.paymentMethod] || tx.paymentMethod}</span>
                    </div>
                  </div>
                  <span className={`font-bold shrink-0 ${tx.type === 'cobro' ? 'text-green-700 dark:text-green-400' : tx.type === 'gasto' ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>
                    {tx.type === 'gasto' ? '-' : '+'}{tx.amount.toFixed(2)}€
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Añadir movimiento */}
        {showAddTx ? (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
            <h5 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Nuevo movimiento</h5>
            <div className="flex gap-2">
              {(['cobro', 'gasto', 'ajuste'] as const).map(t => (
                <button key={t} onClick={() => setTxType(t)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border-2 ${txType === t ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                  {t === 'cobro' ? 'Cobro' : t === 'gasto' ? 'Gasto' : 'Ajuste'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {(['efectivo', 'tarjeta', 'bizum', 'online'] as const).map(m => (
                <button key={m} onClick={() => setTxMethod(m)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${txMethod === m ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                placeholder="Importe €" value={txAmount} onChange={e => setTxAmount(e.target.value)} min="0" step="0.01" />
              <input className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                placeholder="Nº pedido (opcional)" value={txOrderNumber} onChange={e => setTxOrderNumber(e.target.value)} />
            </div>
            <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              placeholder="Descripción (opcional)" value={txDesc} onChange={e => setTxDesc(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => { setShowAddTx(false); setTxAmount(''); setTxDesc(''); setTxOrderNumber(''); }}
                className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={handleSubmitTx}
                className="flex-1 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
                Registrar movimiento
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setShowAddTx(true)}
              className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Añadir movimiento
            </button>
            <button onClick={() => { setShowClose(true); setCloseCash(expectedCash.toFixed(2)); }}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              <Lock className="w-4 h-4" /> Cerrar caja
            </button>
          </div>
        )}

        {/* Cierre */}
        {showClose && (
          <div className="p-4 bg-red-50 dark:bg-red-900/10 border-2 border-red-200 dark:border-red-800 rounded-xl space-y-3">
            <h5 className="font-bold text-red-800 dark:text-red-300 flex items-center gap-2"><Lock className="w-4 h-4" /> Cerrar caja de {session.driverName}</h5>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500">Fondo inicial</div><div className="font-bold text-gray-900 dark:text-gray-100">{session.initialFloat.toFixed(2)}€</div></div>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500">Cobros efectivo</div><div className="font-bold text-green-700">{cashIn.toFixed(2)}€</div></div>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500">Gastos</div><div className="font-bold text-red-700">{cashOut.toFixed(2)}€</div></div>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500">Efectivo esperado</div><div className="font-bold text-emerald-700">{expectedCash.toFixed(2)}€</div></div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1.5">Efectivo real contado *</label>
              <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={closeCash} onChange={e => setCloseCash(e.target.value)} min="0" step="0.01" />
              {closeCash && (
                <div className={`mt-2 text-sm font-bold ${Number(closeCash) - expectedCash === 0 ? 'text-green-600' : Number(closeCash) - expectedCash > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  Diferencia: {(Number(closeCash) - expectedCash) >= 0 ? '+' : ''}{(Number(closeCash) - expectedCash).toFixed(2)}€
                  {Number(closeCash) - expectedCash === 0 && ' — Cuadra perfectamente'}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1.5">Notas de cierre</label>
              <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none text-sm"
                placeholder="Observaciones del cierre..." value={closeNotes} onChange={e => setCloseNotes(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowClose(false)}
                className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={() => { onClose(session, Number(closeCash) || 0, closeNotes); setShowClose(false); }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" /> Confirmar cierre
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Closed Session Summary ─────────────────────────────────────────────────

function ClosedSessionSummary({ session }: { session: DriverCashSession }) {
  const [expanded, setExpanded] = useState(false);
  const totalSales = session.transactions.filter(t => t.type === 'cobro').reduce((s, t) => s + t.amount, 0);
  const cashSales = session.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'efectivo').reduce((s, t) => s + t.amount, 0);
  const expenses = session.transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 font-bold text-xs shrink-0">
          {session.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{session.driverName}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(session.openedAt).toLocaleDateString('es-ES', { dateStyle: 'short' })} · {new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })} → {session.closedAt ? new Date(session.closedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' }) : '—'}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-xs text-gray-500">Ventas</div>
            <div className="text-sm font-bold text-green-700 dark:text-green-400">{totalSales.toFixed(2)}€</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Diferencia</div>
            <div className={`text-sm font-bold ${session.difference === 0 ? 'text-green-600' : session.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {session.difference >= 0 ? '+' : ''}{session.difference.toFixed(2)}€
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-5 pt-0 border-t border-gray-100 dark:border-gray-700 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
            <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><div className="text-xs text-gray-500">Fondo</div><div className="font-bold text-sm text-gray-900 dark:text-gray-100">{session.initialFloat.toFixed(2)}€</div></div>
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg"><div className="text-xs text-green-600">Efectivo cobrado</div><div className="font-bold text-sm text-green-700">{cashSales.toFixed(2)}€</div></div>
            <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><div className="text-xs text-gray-500">Esperado</div><div className="font-bold text-sm text-gray-900 dark:text-gray-100">{session.expectedCash.toFixed(2)}€</div></div>
            <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><div className="text-xs text-gray-500">Real contado</div><div className="font-bold text-sm text-gray-900 dark:text-gray-100">{session.actualCash.toFixed(2)}€</div></div>
          </div>
          {expenses > 0 && <div className="text-xs text-red-600">Gastos: {expenses.toFixed(2)}€</div>}
          {session.closingNotes && <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg"><MessageSquare className="w-3 h-3 inline mr-1" /> {session.closingNotes}</div>}
          {session.transactions.length > 0 && (
            <div>
              <h5 className="text-xs font-bold text-gray-500 uppercase mb-1.5">Movimientos ({session.transactions.length})</h5>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {session.transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between text-xs py-1.5 px-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <span className="text-gray-700 dark:text-gray-300">{tx.description}</span>
                    <span className={`font-bold ${tx.type === 'cobro' ? 'text-green-700' : tx.type === 'gasto' ? 'text-red-700' : 'text-blue-700'}`}>
                      {tx.type === 'gasto' ? '-' : '+'}{tx.amount.toFixed(2)}€
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════

export function Delivery() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [cashSessions, setCashSessions] = useState<DriverCashSession[]>([]);
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<DeliveryOrderStatus | 'all'>('all');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [incidentOrder, setIncidentOrder] = useState<DeliveryOrder | null>(null);
  const [resolveOrder, setResolveOrder] = useState<DeliveryOrder | null>(null);
  const [assignDriverOrder, setAssignDriverOrder] = useState<DeliveryOrder | null>(null);
  const [checklistState, setChecklistState] = useState<Record<string, boolean[]>>({});
  const [showCashModal, setShowCashModal] = useState(false);

  useModalClose(showCreate, () => setShowCreate(false));
  useModalClose(showCashModal, () => setShowCashModal(false));
  useModalClose(!!selectedOrder, () => setSelectedOrder(null));
  useModalClose(!!incidentOrder, () => setIncidentOrder(null));
  useModalClose(!!resolveOrder, () => setResolveOrder(null));
  useModalClose(!!assignDriverOrder, () => setAssignDriverOrder(null));

  const loadOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [ordersData, catalogData, sessionsData, pdvData] = await Promise.all([
        listDeliveryOrdersRequest(user.id),
        listCatalogItemsRequest(user.id),
        listDriverCashSessionsRequest(user.id),
        listPointsOfSaleRequest(user.id),
      ]);
      setOrders(ordersData);
      setCatalogItems(catalogData);
      setCashSessions(sessionsData);
      setPointsOfSale(pdvData);
    } catch {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleCreate = async (data: Partial<DeliveryOrder>) => {
    if (!user?.id) return;
    try {
      const created = await createDeliveryOrderRequest(user.id, data);
      setOrders(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success(`Pedido ${created.orderNumber} creado`);
    } catch {
      toast.error('Error al crear el pedido');
    }
  };

  const handleDelete = async (order: DeliveryOrder) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar el pedido ${order.orderNumber}?`)) return;
    try {
      await deleteDeliveryOrderRequest(user.id, order._id);
      setOrders(prev => prev.filter(o => o._id !== order._id));
      toast.success('Pedido eliminado');
    } catch {
      toast.error('Error al eliminar el pedido');
    }
  };

  const handleAdvanceStatus = async (order: DeliveryOrder) => {
    if (!user?.id) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      const now = new Date().toISOString();
      const extras: Partial<DeliveryOrder> = {};
      if (next === 'cocina') extras.kitchenStartedAt = now;
      if (next === 'listo') { extras.kitchenCompletedAt = now; extras.assemblyStartedAt = now; }
      if (next === 'entregado') { extras.assemblyCompletedAt = now; extras.deliveredAt = now; }

      const updated = await updateDeliveryOrderRequest(user.id, {
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
    if (!user?.id) return;
    try {
      const updated = await updateDeliveryOrderRequest(user.id, {
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
    if (!user?.id) return;
    try {
      const updated = await updateDeliveryOrderRequest(user.id, {
        ...order, status: 'incident' as DeliveryOrderStatus, incidentNotes: notes, incidentType: incType,
        stageHistory: [...(order.stageHistory || []), { status: 'incident' as DeliveryOrderStatus, date: new Date().toISOString(), user: user.fullName || 'Sistema', notes: `[${incType}] ${notes}` }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setIncidentOrder(null);
      toast.success('Incidencia reportada');
    } catch {
      toast.error('Error al reportar incidencia');
    }
  };

  const handleResolveIncident = async (order: DeliveryOrder, notes: string) => {
    if (!user?.id) return;
    try {
      const updated = await updateDeliveryOrderRequest(user.id, {
        ...order, status: 'nuevo' as DeliveryOrderStatus,
        stageHistory: [...(order.stageHistory || []), { status: 'nuevo' as DeliveryOrderStatus, date: new Date().toISOString(), user: user.fullName || 'Sistema', notes: `Incidencia resuelta${notes ? `: ${notes}` : ''}` }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setResolveOrder(null);
      toast.success('Incidencia resuelta');
    } catch {
      toast.error('Error al resolver incidencia');
    }
  };

  const handleAssignDriver = async (order: DeliveryOrder, driverName: string) => {
    if (!user?.id) return;
    try {
      const updated = await updateDeliveryOrderRequest(user.id, {
        ...order, assignedDriver: driverName,
        stageHistory: [...(order.stageHistory || []), { status: order.status, date: new Date().toISOString(), user: user.fullName || 'Sistema', notes: `Repartidor asignado: ${driverName}` }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setAssignDriverOrder(null);
      toast.success(`Repartidor "${driverName}" asignado`);
    } catch {
      toast.error('Error al asignar repartidor');
    }
  };

  const handlePayment = async (order: DeliveryOrder, method: string) => {
    if (!user?.id) return;
    try {
      const updated = await updateDeliveryOrderRequest(user.id, {
        ...order,
        stageHistory: [...(order.stageHistory || []), { status: order.status, date: new Date().toISOString(), user: user.fullName || 'Sistema', notes: `Cobro registrado: ${PAYMENT_LABELS[method] || method} — ${order.totalAmount?.toFixed(2)}€` }],
      });
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      toast.success(`Cobro de ${order.totalAmount?.toFixed(2)}€ registrado (${PAYMENT_LABELS[method]})`);
    } catch {
      toast.error('Error al registrar cobro');
    }
  };

  const toggleChecklist = (orderId: string, idx: number) => {
    setChecklistState(prev => {
      const current = prev[orderId] || MONTAJE_CHECKLIST.map(() => false);
      const copy = [...current];
      copy[idx] = !copy[idx];
      return { ...prev, [orderId]: copy };
    });
  };

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return o.orderNumber?.toLowerCase().includes(q) || o.customerName?.toLowerCase().includes(q) || o.customerAddress?.toLowerCase().includes(q) || o.customerPhone?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [orders, search, filterStatus]);

  const kpis = useMemo(() => ({
    pending: orders.filter(o => o.status === 'nuevo').length,
    kitchen: orders.filter(o => o.status === 'cocina').length,
    assembly: orders.filter(o => o.status === 'listo').length,
    delivery: orders.filter(o => o.status === 'listo' && o.deliveryType === 'domicilio').length,
    delivered: orders.filter(o => o.status === 'entregado').length,
    incidents: orders.filter(o => o.status === 'incident').length,
  }), [orders]);

  const openCashSessions = cashSessions.filter(s => s.status === 'open');

  const tabsConfig = [
    { id: 'orders', label: 'Pedidos', count: orders.filter(o => !['entregado', 'cancelled'].includes(o.status)).length || undefined },
    { id: 'kitchen', label: 'Cocina', count: kpis.kitchen || undefined },
    { id: 'assembly', label: 'Montaje', count: kpis.assembly || undefined },
    { id: 'delivery', label: 'Reparto', count: kpis.delivery || undefined },
    { id: 'driverCash', label: 'Caja', count: openCashSessions.length || undefined },
    { id: 'pointsOfSale', label: 'Puntos de Venta', count: pointsOfSale.length || undefined },
    { id: 'incidents', label: 'Incidencias', count: kpis.incidents || undefined },
    { id: 'history', label: 'Historial' },
  ];

  // ═══ TAB: Pedidos ═══
  const renderOrdersTab = () => (
    <div className="space-y-5">
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

  // ═══ TAB: Cocina ═══
  const renderKitchenTab = () => {
    const kitchenOrders = orders.filter(o => o.status === 'cocina').sort((a, b) => ({ urgent: 0, high: 1, normal: 2 }[a.priority] ?? 2) - ({ urgent: 0, high: 1, normal: 2 }[b.priority] ?? 2));
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><ChefHat className="w-5 h-5 text-orange-600" /></div><div><h3 className="font-bold text-gray-900 dark:text-gray-100">Vista de cocina</h3><p className="text-sm text-gray-500 dark:text-gray-400">{kitchenOrders.length} pedidos en preparación</p></div></div>
          <a href="/saas/delivery-kitchen" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-all shadow-sm no-underline"><ChefHat className="w-3.5 h-3.5" />Abrir KDS completo</a>
        </div>
        {kitchenOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><ChefHat className="w-12 h-12 text-gray-300 mb-3" /><p className="font-semibold">Sin pedidos en cocina</p><p className="text-sm mt-1">Los pedidos llegarán aquí cuando se envíen a cocina</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kitchenOrders.map(order => (
              <div key={order._id} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className={`px-4 py-3 flex items-center justify-between ${order.priority === 'urgent' ? 'bg-red-50 border-b-2 border-red-200' : order.priority === 'high' ? 'bg-orange-50 border-b-2 border-orange-200' : 'bg-orange-50/50 border-b border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
                    {order.priority === 'urgent' && <span className="text-xs font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">URGENTE</span>}
                    {order.priority === 'high' && <span className="text-xs font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">ALTA</span>}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400"><Timer className="w-3.5 h-3.5" /> {timeSince(order.kitchenStartedAt || order.createdAt)}</div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="space-y-1.5">
                    {(order.items || []).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg min-w-[2rem] text-center">{item.quantity}x</span>
                        <span className="text-gray-800 dark:text-gray-200">{item.name}</span>
                        {item.notes && <span className="text-xs text-gray-500 italic">({item.notes})</span>}
                      </div>
                    ))}
                  </div>
                  {order.notes && <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg"><MessageSquare className="w-3 h-3 inline mr-1" /> {order.notes}</div>}
                  <div className="flex gap-2">
                    <button onClick={() => handleAdvanceStatus(order)} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"><Package className="w-4 h-4" /> Listo para montaje</button>
                    <button onClick={() => setIncidentOrder(order)} className="px-3 py-2.5 border-2 border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm"><AlertCircle className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ═══ TAB: Montaje (con checklist) ═══
  const renderAssemblyTab = () => {
    const assemblyOrders = orders.filter(o => o.status === 'listo').sort((a, b) => ({ urgent: 0, high: 1, normal: 2 }[a.priority] ?? 2) - ({ urgent: 0, high: 1, normal: 2 }[b.priority] ?? 2));
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3"><div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center"><Package className="w-5 h-5 text-indigo-600" /></div><div><h3 className="font-bold text-gray-900 dark:text-gray-100">Montaje y empaquetado</h3><p className="text-sm text-gray-500 dark:text-gray-400">{assemblyOrders.length} pedidos en montaje</p></div></div>
        {assemblyOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><Package className="w-12 h-12 text-gray-300 mb-3" /><p className="font-semibold">Sin pedidos en montaje</p><p className="text-sm mt-1">Los pedidos llegarán aquí desde cocina</p></div>
        ) : (
          <div className="space-y-4">
            {assemblyOrders.map(order => {
              const cl = checklistState[order._id] || MONTAJE_CHECKLIST.map(() => false);
              const allChecked = cl.every(Boolean);
              return (
                <div key={order._id} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PRIORITY_CONFIG[order.priority]?.badgeClass || ''}`}>{PRIORITY_CONFIG[order.priority]?.label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-semibold">{order.customerName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 justify-end"><MapPin className="w-3 h-3" /> {order.customerAddress || '—'}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-2">Productos</h5>
                      <div className="space-y-1.5">
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <span className="font-bold text-gray-900 dark:text-gray-100 min-w-[2rem]">{item.quantity}x</span>
                            <span className="text-gray-800 dark:text-gray-200 flex-1">{item.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-2">Checklist de montaje</h5>
                      <div className="space-y-1.5">
                        {MONTAJE_CHECKLIST.map((item, idx) => (
                          <label key={idx} className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${cl[idx] ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${cl[idx] ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`} onClick={() => toggleChecklist(order._id, idx)}>
                              {cl[idx] && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={`text-sm ${cl[idx] ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>{item}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{cl.filter(Boolean).length}/{MONTAJE_CHECKLIST.length} completados</div>
                    </div>
                  </div>
                  {order.notes && <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg mb-4"><MessageSquare className="w-3 h-3 inline mr-1" /> {order.notes}</div>}
                  <div className="flex gap-2">
                    <button onClick={() => handleAdvanceStatus(order)} disabled={!allChecked} className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${allChecked ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}><Truck className="w-4 h-4" /> Listo para reparto</button>
                    <button onClick={() => setIncidentOrder(order)} className="px-3 py-2.5 border-2 border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm"><AlertCircle className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ═══ TAB: Reparto (con asignación, cobro, contacto) ═══
  const renderDeliveryTab = () => {
    const deliveryOrders = orders.filter(o => o.status === 'listo' && o.deliveryType === 'domicilio').sort((a, b) => ({ urgent: 0, high: 1, normal: 2 }[a.priority] ?? 2) - ({ urgent: 0, high: 1, normal: 2 }[b.priority] ?? 2));
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center"><Truck className="w-5 h-5 text-cyan-600" /></div><div><h3 className="font-bold text-gray-900 dark:text-gray-100">Reparto en curso</h3><p className="text-sm text-gray-500 dark:text-gray-400">{deliveryOrders.length} pedidos en reparto</p></div></div>
          <button onClick={() => setShowCashModal(true)} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"><Wallet className="w-4 h-4" /> Caja repartidor</button>
        </div>
        {deliveryOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><Truck className="w-12 h-12 text-gray-300 mb-3" /><p className="font-semibold">Sin pedidos en reparto</p></div>
        ) : (
          <div className="space-y-4">
            {deliveryOrders.map(order => (
              <div key={order._id} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PRIORITY_CONFIG[order.priority]?.badgeClass || ''}`}>{PRIORITY_CONFIG[order.priority]?.label}</span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{order.items?.length || 0} producto(s) · {order.totalAmount?.toFixed(2) || '0.00'}€</div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500"><Timer className="w-3.5 h-3.5" /> {timeSince(order.assemblyCompletedAt || order.createdAt)}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <User className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" /><div><div className="text-xs text-gray-500 dark:text-gray-400">Cliente</div><div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.customerName}</div>{order.customerPhone && <a href={`tel:${order.customerPhone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"><Phone className="w-3 h-3" /> {order.customerPhone}</a>}</div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <MapPin className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" /><div><div className="text-xs text-gray-500 dark:text-gray-400">Dirección</div><div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.customerAddress || '—'}</div>
                    {order.customerAddress && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customerAddress)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"><ArrowUpRight className="w-3 h-3" /> Ver mapa</a>}</div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => setAssignDriverOrder(order)}>
                    <Truck className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" /><div><div className="text-xs text-gray-500 dark:text-gray-400">Repartidor</div><div className={`text-sm font-semibold ${order.assignedDriver ? 'text-gray-900 dark:text-gray-100' : 'text-orange-600'}`}>{order.assignedDriver || 'Sin asignar — clic para asignar'}</div></div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 self-center mr-1">Cobro:</span>
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} onClick={() => handlePayment(order, m)} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1">
                      {m === 'efectivo' && <Banknote className="w-3.5 h-3.5" />}
                      {m === 'tarjeta' && <CreditCard className="w-3.5 h-3.5" />}
                      {m === 'online' && <Wifi className="w-3.5 h-3.5" />}
                      {m === 'bizum' && <Phone className="w-3.5 h-3.5" />}
                      {PAYMENT_LABELS[m]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAdvanceStatus(order)} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> Entregado</button>
                  <button onClick={() => setIncidentOrder(order)} className="px-4 py-2.5 border-2 border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-semibold text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Incidencia</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ═══ TAB: Incidencias (con timeline y resolución) ═══
  const renderIncidentsTab = () => {
    const incidentOrders = orders.filter(o => o.status === 'incident' || (o.incidentNotes && o.incidentNotes.trim()));
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3"><div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div><div><h3 className="font-bold text-gray-900 dark:text-gray-100">Incidencias</h3><p className="text-sm text-gray-500 dark:text-gray-400">{incidentOrders.filter(o => o.status === 'incident').length} incidencias activas</p></div></div>
        {incidentOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><CheckCircle2 className="w-12 h-12 text-green-300 mb-3" /><p className="font-semibold">Sin incidencias</p></div>
        ) : (
          <div className="space-y-4">
            {incidentOrders.map(order => {
              const incidentEvents = (order.stageHistory || []).filter(e => e.status === 'incident' || e.notes?.includes('Incidencia'));
              const lastIncident = [...incidentEvents].reverse()[0];
              return (
                <div key={order._id} className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-5 ${order.status === 'incident' ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2"><span className="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span><span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${STATUS_CONFIG[order.status]?.badgeClass}`}>{STATUS_CONFIG[order.status]?.label}</span></div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{order.customerName} · {order.customerPhone || '—'}</div>
                    </div>
                    {order.status === 'incident' && <button onClick={() => setResolveOrder(order)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Resolver</button>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                      <div className="text-xs font-bold text-red-700 dark:text-red-400 uppercase mb-1">Incidencia</div>
                      <div className="text-sm text-red-800 dark:text-red-300 font-medium">{order.incidentType || 'General'}</div>
                      <div className="text-sm text-red-700 dark:text-red-400 mt-1">{order.incidentNotes || lastIncident?.notes || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">Timeline</div>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {[...(order.stageHistory || [])].reverse().slice(0, 5).map((ev, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs">
                            <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${ev.status === 'incident' ? 'bg-red-500' : 'bg-gray-400'}`} />
                            <div><span className="font-semibold">{STATUS_CONFIG[ev.status]?.label}</span> <span className="text-gray-500">{formatDateES(ev.date)}</span>{ev.notes && <div className="text-gray-500 mt-0.5">{ev.notes}</div>}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ═══ TAB: Historial (con exportar CSV) ═══
  const renderHistoryTab = () => {
    const historyOrders = orders
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

  // ═══ TAB: Caja Repartidor ═══
  const renderDriverCashTab = () => (
    <DriverCashModal open embedded userId={user?.id || ''} orders={orders} userName={user?.fullName} />
  );

  // ═══ TAB: Puntos de Venta ═══
  const renderPointsOfSaleTab = () => {
    const [showForm, setShowForm] = useState(false);
    const [editPdv, setEditPdv] = useState<PointOfSale | null>(null);
    const [pdvName, setPdvName] = useState('');
    const [pdvCode, setPdvCode] = useState('');
    const [pdvAddress, setPdvAddress] = useState('');
    const [pdvTerminals, setPdvTerminals] = useState<TerminalConfig[]>([]);

    const resetForm = () => { setPdvName(''); setPdvCode(''); setPdvAddress(''); setPdvTerminals([]); setEditPdv(null); setShowForm(false); };
    const startEdit = (pdv: PointOfSale) => { setEditPdv(pdv); setPdvName(pdv.name); setPdvCode(pdv.code); setPdvAddress(pdv.address); setPdvTerminals([...pdv.terminals]); setShowForm(true); };
    const addTerminal = () => {
      const idx = pdvTerminals.length + 1;
      const prefix = pdvCode.toUpperCase() || 'TPV';
      setPdvTerminals([...pdvTerminals, { id: `term-${Date.now()}`, code: `${prefix}-${String(idx).padStart(3, '0')}`, name: `Terminal ${idx}`, datafonName: '', printerName: '', active: true }]);
    };
    const updateTerminal = (id: string, field: keyof TerminalConfig, value: string | boolean) => {
      setPdvTerminals(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    };
    const removeTerminal = (id: string) => setPdvTerminals(prev => prev.filter(t => t.id !== id));

    const handleSave = async () => {
      if (!user?.id || !pdvName.trim()) return;
      try {
        if (editPdv) {
          const updated = await updatePointOfSaleRequest(user.id, { ...editPdv, name: pdvName, code: pdvCode, address: pdvAddress, terminals: pdvTerminals });
          setPointsOfSale(prev => prev.map(p => p._id === updated._id ? updated : p));
          toast.success(`Punto de venta "${pdvName}" actualizado`);
        } else {
          const created = await createPointOfSaleRequest(user.id, { name: pdvName, code: pdvCode, address: pdvAddress, terminals: pdvTerminals } as Partial<PointOfSale>);
          setPointsOfSale(prev => [...prev, created]);
          toast.success(`Punto de venta "${pdvName}" creado con ${pdvTerminals.length} terminales`);
        }
        resetForm();
      } catch { toast.error('Error al guardar punto de venta'); }
    };

    const handleDelete = async (pdv: PointOfSale) => {
      if (!user?.id) return;
      if (!confirm(`¿Eliminar el punto de venta "${pdv.name}" y todos sus terminales?`)) return;
      try {
        await deletePointOfSaleRequest(user.id, pdv._id);
        setPointsOfSale(prev => prev.filter(p => p._id !== pdv._id));
        toast.success('Punto de venta eliminado');
      } catch { toast.error('Error al eliminar'); }
    };

    const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Puntos de Venta</h3>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nuevo PdV
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h4 className="font-bold text-gray-900 dark:text-gray-100">{editPdv ? 'Editar' : 'Nuevo'} Punto de Venta</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Nombre *</label>
                <input className={inputCls} placeholder="Badalona" value={pdvName} onChange={e => setPdvName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Código *</label>
                <input className={inputCls} placeholder="BDN" value={pdvCode} onChange={e => setPdvCode(e.target.value.toUpperCase())} maxLength={6} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Dirección</label>
                <input className={inputCls} placeholder="Calle Mayor, 10" value={pdvAddress} onChange={e => setPdvAddress(e.target.value)} />
              </div>
            </div>

            {/* Terminals */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Monitor className="w-3.5 h-3.5" /> Terminales ({pdvTerminals.length})</label>
                <button onClick={addTerminal} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"><PlusCircle className="w-3.5 h-3.5" /> Añadir terminal</button>
              </div>
              {pdvTerminals.length === 0 && (
                <p className="text-xs text-gray-400 py-3 text-center">Sin terminales. Añade al menos uno.</p>
              )}
              <div className="space-y-2">
                {pdvTerminals.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                    <input className="w-24 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="BDN-001" value={t.code} onChange={e => updateTerminal(t.id, 'code', e.target.value.toUpperCase())} />
                    <input className="flex-1 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Nombre terminal" value={t.name} onChange={e => updateTerminal(t.id, 'name', e.target.value)} />
                    <div className="flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5 text-gray-400" />
                      <input className="w-28 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="Datáfono" value={t.datafonName} onChange={e => updateTerminal(t.id, 'datafonName', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-1">
                      <Printer className="w-3.5 h-3.5 text-gray-400" />
                      <input className="w-28 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="Impresora" value={t.printerName} onChange={e => updateTerminal(t.id, 'printerName', e.target.value)} />
                    </div>
                    <button onClick={() => removeTerminal(t.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={resetForm} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={handleSave} disabled={!pdvName.trim() || !pdvCode.trim()}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 ${pdvName.trim() && pdvCode.trim() ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                <Check className="w-4 h-4" /> {editPdv ? 'Guardar cambios' : 'Crear punto de venta'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {pointsOfSale.length === 0 && !showForm ? (
          <div className="text-center py-16 text-gray-400">
            <Store className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-semibold text-gray-600 dark:text-gray-300">Sin puntos de venta</p>
            <p className="text-sm mt-1">Crea un punto de venta y añade terminales (TPVs) con datáfonos e impresoras</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pointsOfSale.map(pdv => (
              <div key={pdv._id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-5 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Store className="w-5 h-5 text-emerald-600" />
                      <h4 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{pdv.name}</h4>
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-bold">{pdv.code}</span>
                    </div>
                    {pdv.address && <p className="text-sm text-gray-500 mt-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{pdv.address}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(pdv)} className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1"><Edit3 className="w-3 h-3" /> Editar</button>
                    <button onClick={() => handleDelete(pdv)} className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar</button>
                  </div>
                </div>
                {pdv.terminals.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {pdv.terminals.map(t => (
                        <div key={t.id} className={`p-3 rounded-xl border ${t.active ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60'}`}>
                          <div className="flex items-center gap-2">
                            <Monitor className="w-4 h-4 text-gray-500" />
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{t.code}</span>
                            {t.name && t.code !== t.name && <span className="text-xs text-gray-500">({t.name})</span>}
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                            {t.datafonName && <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />{t.datafonName}</span>}
                            {t.printerName && <span className="flex items-center gap-1"><Printer className="w-3 h-3" />{t.printerName}</span>}
                            {!t.datafonName && !t.printerName && <span className="text-gray-400">Sin periféricos</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pdv.terminals.length === 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-4 text-center text-xs text-gray-400">
                    Sin terminales configurados — <button onClick={() => startEdit(pdv)} className="text-emerald-600 font-semibold hover:underline">añadir terminales</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout title="Delivery" subtitle="Gestión de pedidos y entregas a domicilio">
      <div className="space-y-6">
        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />
        {activeTab === 'orders' && renderOrdersTab()}
        {activeTab === 'kitchen' && renderKitchenTab()}
        {activeTab === 'assembly' && renderAssemblyTab()}
        {activeTab === 'delivery' && renderDeliveryTab()}
        {activeTab === 'driverCash' && renderDriverCashTab()}
        {activeTab === 'pointsOfSale' && renderPointsOfSaleTab()}
        {activeTab === 'incidents' && renderIncidentsTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </div>

      <CreateOrderModal isOpen={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} catalogItems={catalogItems} />
      <OrderDetailDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} onAdvance={handleAdvanceStatus} onSetStatus={handleSetStatus} />
      <IncidentModal isOpen={!!incidentOrder} onClose={() => setIncidentOrder(null)} onSubmit={(type, notes) => incidentOrder && handleIncident(incidentOrder, type, notes)} />
      <ResolveIncidentModal isOpen={!!resolveOrder} onClose={() => setResolveOrder(null)} onResolve={(notes) => resolveOrder && handleResolveIncident(resolveOrder, notes)} />
      <AssignDriverModal isOpen={!!assignDriverOrder} onClose={() => setAssignDriverOrder(null)} onAssign={(name) => assignDriverOrder && handleAssignDriver(assignDriverOrder, name)} currentDriver={assignDriverOrder?.assignedDriver || ''} />
      <DriverCashModal open={showCashModal} onClose={() => setShowCashModal(false)} userId={user?.id || ''} orders={orders} userName={user?.fullName} />
    </Layout>
  );
}
