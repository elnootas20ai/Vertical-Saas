import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  Beef,
  ShoppingCart,
  ClipboardList,
  Search,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Smartphone,
  Scale,
  CheckCircle2,
  Clock,
  Package,
} from 'lucide-react';

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

type CutCategory = 'vacuno' | 'cerdo' | 'pollo' | 'cordero' | 'elaborados';
type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum';
type OrderStatus = 'pendiente' | 'preparando' | 'listo';

const CAT_LABEL: Record<CutCategory, string> = {
  vacuno: 'Vacuno', cerdo: 'Cerdo', pollo: 'Pollo', cordero: 'Cordero', elaborados: 'Elaborados',
};

const CAT_COLOR: Record<CutCategory, string> = {
  vacuno: 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  cerdo: 'border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-800 dark:text-pink-200',
  pollo: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200',
  cordero: 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200',
  elaborados: 'border-violet-400 bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200',
};

const ESTADO_ORDER: Record<OrderStatus, { label: string; dot: string }> = {
  pendiente: { label: 'Pendiente', dot: 'bg-amber-500' },
  preparando: { label: 'Preparando', dot: 'bg-blue-500' },
  listo: { label: 'Listo', dot: 'bg-emerald-500' },
};

interface CatalogProduct {
  id: string;
  nombre: string;
  categoria: CutCategory;
  precioKg: number;
  stock: number;
}

interface TicketLine {
  id: string;
  productoId: string;
  nombre: string;
  categoria: CutCategory;
  pesoKg: number;
  precioKg: number;
  total: number;
}

interface CompletedSale {
  id: string;
  ticketNo: string;
  lines: TicketLine[];
  total: number;
  method: PaymentMethod;
  time: Date;
}

interface PendingOrder {
  id: string;
  cliente: string;
  telefono: string;
  productos: string;
  pesoKg: number;
  total: number;
  fechaEntrega: string;
  estado: OrderStatus;
  createdAt: Date;
}

const INITIAL_CATALOG: CatalogProduct[] = [
  { id: 'p-chuleton', nombre: 'Chuletón de ternera', categoria: 'vacuno', precioKg: 24.90, stock: 15 },
  { id: 'p-solomillo', nombre: 'Solomillo de ternera', categoria: 'vacuno', precioKg: 32.50, stock: 8 },
  { id: 'p-entrecot', nombre: 'Entrecot', categoria: 'vacuno', precioKg: 22.00, stock: 12 },
  { id: 'p-picada', nombre: 'Carne picada mixta', categoria: 'vacuno', precioKg: 8.90, stock: 20 },
  { id: 'p-costillas-cerdo', nombre: 'Costillas de cerdo', categoria: 'cerdo', precioKg: 7.50, stock: 18 },
  { id: 'p-lomo', nombre: 'Lomo de cerdo', categoria: 'cerdo', precioKg: 9.80, stock: 14 },
  { id: 'p-panceta', nombre: 'Panceta fresca', categoria: 'cerdo', precioKg: 6.20, stock: 10 },
  { id: 'p-secreto', nombre: 'Secreto ibérico', categoria: 'cerdo', precioKg: 15.90, stock: 6 },
  { id: 'p-pechuga', nombre: 'Pechuga de pollo', categoria: 'pollo', precioKg: 7.40, stock: 25 },
  { id: 'p-muslos', nombre: 'Muslos de pollo', categoria: 'pollo', precioKg: 4.50, stock: 30 },
  { id: 'p-pierna-cordero', nombre: 'Pierna de cordero', categoria: 'cordero', precioKg: 18.50, stock: 5 },
  { id: 'p-chuletas-cordero', nombre: 'Chuletas de cordero', categoria: 'cordero', precioKg: 22.00, stock: 7 },
  { id: 'p-chorizo', nombre: 'Chorizo casero', categoria: 'elaborados', precioKg: 12.50, stock: 10 },
  { id: 'p-morcilla', nombre: 'Morcilla de cebolla', categoria: 'elaborados', precioKg: 8.90, stock: 8 },
  { id: 'p-hamburguesa', nombre: 'Hamburguesas (pack 4)', categoria: 'elaborados', precioKg: 10.50, stock: 15 },
];

function nextTicketNo(seq: number) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `CARN-${y}${m}${day}-${String(seq).padStart(4, '0')}`;
}

export function WorkerTpvButcherShop() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Carnicero';

  const [mainTab, setMainTab] = useState<'mostrador' | 'pedidos'>('mostrador');

  const [catalog, setCatalog] = useState<CatalogProduct[]>(INITIAL_CATALOG);
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [salesHistory, setSalesHistory] = useState<CompletedSale[]>([]);
  const [ticketSeq, setTicketSeq] = useState(1);
  const [filterCat, setFilterCat] = useState<CutCategory | 'all'>('all');
  const [searchProduct, setSearchProduct] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [pesoInput, setPesoInput] = useState('1');

  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [searchOrder, setSearchOrder] = useState('');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [orderForm, setOrderForm] = useState({ cliente: '', telefono: '', productos: '', pesoKg: 0, total: 0, fechaEntrega: new Date().toISOString().slice(0, 10) });

  const filteredCatalog = useMemo(() => {
    const q = searchProduct.toLowerCase().trim();
    return catalog.filter(p => {
      if (filterCat !== 'all' && p.categoria !== filterCat) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, filterCat, searchProduct]);

  const ticketTotal = useMemo(() => lines.reduce((s, l) => s + l.total, 0), [lines]);
  const ticketWeight = useMemo(() => lines.reduce((s, l) => s + l.pesoKg, 0), [lines]);

  const salesStats = useMemo(() => {
    const ventasHoy = salesHistory.length;
    const ingresosHoy = salesHistory.reduce((s, r) => s + r.total, 0);
    const pedidosPendientes = orders.filter(o => o.estado !== 'listo').length;
    return { ventasHoy, ingresosHoy, pedidosPendientes };
  }, [salesHistory, orders]);

  const addToTicket = useCallback((product: CatalogProduct) => {
    const peso = parseFloat(pesoInput.replace(',', '.'));
    if (!Number.isFinite(peso) || peso <= 0) {
      toast.error('Indica un peso válido');
      return;
    }
    if (peso > product.stock) {
      toast.error('Stock insuficiente');
      return;
    }
    setLines(prev => [...prev, {
      id: uuidv4(),
      productoId: product.id,
      nombre: product.nombre,
      categoria: product.categoria,
      pesoKg: peso,
      precioKg: product.precioKg,
      total: +(peso * product.precioKg).toFixed(2),
    }]);
    setCatalog(prev => prev.map(p => p.id === product.id ? { ...p, stock: +(p.stock - peso).toFixed(2) } : p));
    toast.success(`${product.nombre} — ${peso} kg`);
  }, [pesoInput]);

  const updateLineWeight = (lineId: string, delta: number) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const newWeight = Math.max(0.1, +(l.pesoKg + delta).toFixed(2));
      return { ...l, pesoKg: newWeight, total: +(newWeight * l.precioKg).toFixed(2) };
    }));
  };

  const removeLine = (lineId: string) => {
    const line = lines.find(l => l.id === lineId);
    if (line) {
      setCatalog(prev => prev.map(p => p.id === line.productoId ? { ...p, stock: +(p.stock + line.pesoKg).toFixed(2) } : p));
    }
    setLines(prev => prev.filter(l => l.id !== lineId));
  };

  const processPayment = () => {
    if (lines.length === 0) return;
    const ticketNo = nextTicketNo(ticketSeq);
    setTicketSeq(s => s + 1);
    setSalesHistory(prev => [{
      id: uuidv4(), ticketNo, lines: [...lines], total: ticketTotal, method: paymentMethod, time: new Date(),
    }, ...prev]);
    setLines([]);
    setShowPayment(false);
    toast.success(`Venta registrada — ${ticketNo}`);
  };

  const filteredOrders = useMemo(() => {
    const q = searchOrder.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter(o => o.cliente.toLowerCase().includes(q) || o.productos.toLowerCase().includes(q));
  }, [orders, searchOrder]);

  const saveNewOrder = () => {
    if (!orderForm.cliente.trim() || !orderForm.productos.trim()) return;
    setOrders(prev => [{
      id: uuidv4(), ...orderForm, estado: 'pendiente' as OrderStatus, createdAt: new Date(),
    }, ...prev]);
    setOrderForm({ cliente: '', telefono: '', productos: '', pesoKg: 0, total: 0, fechaEntrega: new Date().toISOString().slice(0, 10) });
    setShowNewOrder(false);
    toast.success('Pedido creado');
  };

  const advanceOrder = (orderId: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      if (o.estado === 'pendiente') return { ...o, estado: 'preparando' as OrderStatus };
      if (o.estado === 'preparando') return { ...o, estado: 'listo' as OrderStatus };
      return o;
    }));
  };

  const removeOrder = (orderId: string) => setOrders(prev => prev.filter(o => o.id !== orderId));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-2xl border-2 border-red-200 dark:border-red-800 flex items-center justify-center shrink-0">
              <Beef className="w-5 h-5 text-red-700 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                Mi Puesto - Carnicería
              </h1>
              <p className="text-xs text-gray-500 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-red-700 dark:text-red-400">{salesStats.ventasHoy}</p>
            <p className="text-[10px] font-semibold uppercase text-red-600 dark:text-red-500">Ventas hoy</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(salesStats.ingresosHoy)}</p>
            <p className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-500">Ingresos hoy</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{salesStats.pedidosPendientes}</p>
            <p className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-500">Pedidos pend.</p>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMainTab('mostrador')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
              mainTab === 'mostrador'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            Mostrador
          </button>
          <button
            type="button"
            onClick={() => setMainTab('pedidos')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
              mainTab === 'pedidos'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Pedidos
          </button>
        </div>
      </div>

      {mainTab === 'mostrador' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 p-3 bg-white/80 dark:bg-gray-900/80 space-y-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={searchProduct}
                    onChange={e => setSearchProduct(e.target.value)}
                    placeholder="Buscar producto..."
                    className="w-full pl-9 pr-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Scale className="w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={pesoInput}
                    onChange={e => setPesoInput(e.target.value)}
                    className="w-20 px-2 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-center font-bold outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <span className="text-xs text-gray-500 font-semibold">kg</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(['all', ...Object.keys(CAT_LABEL)] as ('all' | CutCategory)[]).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCat(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
                      filterCat === cat
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {cat === 'all' ? 'Todos' : CAT_LABEL[cat]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredCatalog.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToTicket(p)}
                  disabled={p.stock <= 0}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    p.stock <= 0
                      ? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 dark:border-gray-600 hover:border-red-400 dark:hover:border-red-600 hover:shadow-md active:scale-[0.99] bg-white dark:bg-gray-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{p.nombre}</p>
                      <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${CAT_COLOR[p.categoria]}`}>
                        {CAT_LABEL[p.categoria]}
                      </span>
                    </div>
                    <Package className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-red-700 dark:text-red-400 font-bold">{formatCurrency(p.precioKg)}/kg</span>
                    <span className="text-xs text-gray-500">Stock: {p.stock} kg</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:w-[min(100%,380px)] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col max-h-[50vh] lg:max-h-none">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-red-600" />
                <h2 className="font-bold text-gray-900 dark:text-gray-100">Ticket</h2>
              </div>
              <span className="text-xs text-gray-500">{ticketWeight.toFixed(2)} kg</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {lines.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Pulsa un producto para añadirlo al ticket.</p>
              ) : (
                lines.map(l => (
                  <div key={l.id} className="flex items-center gap-2 p-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate text-gray-900 dark:text-gray-100">{l.nombre}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(l.precioKg)}/kg × {l.pesoKg} kg</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => updateLineWeight(l.id, -0.1)} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-12 text-center text-sm font-bold">{l.pesoKg.toFixed(1)}</span>
                      <button type="button" onClick={() => updateLineWeight(l.id, 0.1)} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <Plus className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => removeLine(l.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t-2 border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Total</span>
                <span className="text-xl font-bold text-red-700 dark:text-red-400">{formatCurrency(ticketTotal)}</span>
              </div>
              <button
                type="button"
                disabled={lines.length === 0}
                onClick={() => setShowPayment(true)}
                className="w-full py-3 rounded-2xl border-2 border-red-500 bg-red-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700"
              >
                Cobrar venta
              </button>
            </div>
          </div>
        </div>
      )}

      {mainTab === 'pedidos' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchOrder}
                onChange={e => setSearchOrder(e.target.value)}
                placeholder="Buscar por cliente o productos..."
                className="w-full pl-9 pr-3 py-2.5 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowNewOrder(true)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border-2 border-red-500 bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
            >
              <Plus className="w-4 h-4" /> Nuevo pedido
            </button>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
              <ClipboardList className="w-10 h-10 mb-2" />
              <p className="text-sm">Sin pedidos pendientes.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredOrders.map(o => {
                const cfg = ESTADO_ORDER[o.estado];
                return (
                  <div key={o.id} className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{o.cliente}</p>
                        <p className="text-xs text-gray-500">{o.telefono}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{o.productos}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      <span>{o.pesoKg} kg</span>
                      <span>·</span>
                      <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(o.total)}</span>
                      <span>·</span>
                      <span>Entrega: {o.fechaEntrega}</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      {o.estado !== 'listo' && (
                        <button
                          type="button"
                          onClick={() => advanceOrder(o.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-blue-500 bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                        >
                          {o.estado === 'pendiente' ? <><Clock className="w-3.5 h-3.5" /> Preparar</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Listo</>}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeOrder(o.id)}
                        className="px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {salesHistory.length > 0 && (
            <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Últimas ventas de mostrador</h3>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {salesHistory.slice(0, 8).map(s => (
                  <li key={s.id} className="flex justify-between text-xs font-mono text-gray-600 dark:text-gray-400">
                    <span>{s.ticketNo}</span>
                    <span>{formatCurrency(s.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPayment(false)} aria-label="Cerrar" />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm border-2 border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Confirmar pago</h2>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">{formatCurrency(ticketTotal)}</p>
            <p className="text-xs font-semibold text-gray-500 mb-2">Método</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { id: 'efectivo' as const, label: 'Efectivo', icon: Banknote },
                { id: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
                { id: 'bizum' as const, label: 'Bizum', icon: Smartphone },
              ]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPaymentMethod(id)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 text-xs font-semibold ${
                    paymentMethod === id
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={processPayment}
              className="w-full py-3 rounded-2xl border-2 border-red-500 bg-red-600 text-white font-semibold"
            >
              Registrar venta
            </button>
          </div>
        </div>
      )}

      {showNewOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewOrder(false)} aria-label="Cerrar" />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col border-2 border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo pedido</h2>
              <button type="button" onClick={() => setShowNewOrder(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <span className="sr-only">Cerrar</span>✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500">Cliente *</label>
                  <input className="mt-1 w-full px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm" value={orderForm.cliente} onChange={e => setOrderForm(f => ({ ...f, cliente: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Teléfono</label>
                  <input className="mt-1 w-full px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm" value={orderForm.telefono} onChange={e => setOrderForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Productos *</label>
                <input className="mt-1 w-full px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm" value={orderForm.productos} onChange={e => setOrderForm(f => ({ ...f, productos: e.target.value }))} placeholder="Ej. 3kg chuletón, 1kg chorizos" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500">Peso (kg)</label>
                  <input type="number" step="0.1" className="mt-1 w-full px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm" value={orderForm.pesoKg || ''} onChange={e => setOrderForm(f => ({ ...f, pesoKg: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Total (€)</label>
                  <input type="number" step="0.01" className="mt-1 w-full px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm" value={orderForm.total || ''} onChange={e => setOrderForm(f => ({ ...f, total: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Entrega</label>
                  <input type="date" className="mt-1 w-full px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm" value={orderForm.fechaEntrega} onChange={e => setOrderForm(f => ({ ...f, fechaEntrega: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button type="button" onClick={() => setShowNewOrder(false)} className="flex-1 py-2.5 rounded-2xl border-2 border-gray-200 dark:border-gray-600 text-sm font-semibold">Cancelar</button>
              <button type="button" onClick={saveNewOrder} className="flex-1 py-2.5 rounded-2xl border-2 border-red-500 bg-red-600 text-white text-sm font-semibold">Crear pedido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
