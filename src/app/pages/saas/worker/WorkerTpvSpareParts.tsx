import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import { NuevoClienteModal } from '../../../components/saas/NuevoClienteModal';
import {
  ArrowLeft,
  Cog,
  Package,
  Search,
  ShoppingCart,
  Plus,
  X,
  User,
  Store,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  CreditCard,
  Smartphone,
  ArrowDownUp,
  Receipt,
  Minus,
  Trash2,
  Car,
} from 'lucide-react';

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

type ClienteTipo = 'cliente' | 'mostrador';
type StockEstadoLinea = 'en_stock' | 'bajo_stock' | 'sin_stock';
type OrderEstado = 'activo' | 'cobrado';

interface SpareArticle {
  id: string;
  referencia: string;
  nombre: string;
  stock: number;
  ubicacion: string;
  precio: number;
  /** Vehículos / plataformas compatibles */
  compatibilidad: string[];
  stockMinimo: number;
}

interface CounterLine {
  id: string;
  articleId: string;
  referencia: string;
  nombre: string;
  compatibilidad: string[];
  stockEstado: StockEstadoLinea;
  precioUnitario: number;
  cantidad: number;
}

interface CounterOrder {
  id: string;
  clienteNombre: string;
  clienteTipo: ClienteTipo;
  creadoEn: string;
  /** ISO cuando pasó a cobrado */
  cobradoEn?: string;
  items: CounterLine[];
  estado: OrderEstado;
}

type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum' | 'transferencia';

const STOCK_LINEA_CFG: Record<StockEstadoLinea, { label: string; dot: string; border: string }> = {
  en_stock: { label: 'En stock', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
  bajo_stock: { label: 'Stock bajo', dot: 'bg-amber-500', border: 'border-amber-200 dark:border-amber-800' },
  sin_stock: { label: 'Sin stock', dot: 'bg-red-500', border: 'border-red-200 dark:border-red-800' },
};

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: ReactNode }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: <Banknote className="w-4 h-4" /> },
  { id: 'tarjeta', label: 'Tarjeta', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'bizum', label: 'Bizum', icon: <Smartphone className="w-4 h-4" /> },
  { id: 'transferencia', label: 'Transferencia', icon: <ArrowDownUp className="w-4 h-4" /> },
];

function stockEstadoParaArticulo(a: SpareArticle): StockEstadoLinea {
  if (a.stock <= 0) return 'sin_stock';
  if (a.stock <= a.stockMinimo) return 'bajo_stock';
  return 'en_stock';
}

const ARTICULOS_INICIAL: SpareArticle[] = [
  {
    id: 'a1',
    referencia: 'FIL-OIL-01',
    nombre: 'Filtro de aceite Mann',
    stock: 24,
    ubicacion: 'Estant. B-04',
    precio: 12.5,
    compatibilidad: ['VAG 1.6 TDI', 'Skoda Octavia III', 'Seat León 5F'],
    stockMinimo: 8,
  },
  {
    id: 'a2',
    referencia: 'BRK-F-442',
    nombre: 'Pastillas freno delanteras',
    stock: 3,
    ubicacion: 'Zona F · F-12',
    precio: 56.9,
    compatibilidad: ['Peugeot 308 II', 'Citroën C4 Picasso'],
    stockMinimo: 5,
  },
  {
    id: 'a3',
    referencia: 'BAT-60AH',
    nombre: 'Batería 60 Ah',
    stock: 0,
    ubicacion: 'Almacén frío · C-01',
    precio: 89.0,
    compatibilidad: ['Universal poste estrecho', 'Hasta 2.0 gasolina'],
    stockMinimo: 4,
  },
  {
    id: 'a4',
    referencia: 'LMP-H7-55',
    nombre: 'Bombilla halógena H7 55W',
    stock: 48,
    ubicacion: 'Mostrador · cajón 2',
    precio: 8.9,
    compatibilidad: ['H7 estándar', 'ECE R37'],
    stockMinimo: 20,
  },
];

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

export function WorkerTpvSpareParts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Operario';

  const [mainTab, setMainTab] = useState<'mostrador' | 'stock'>('mostrador');
  const [articles, setArticles] = useState<SpareArticle[]>(ARTICULOS_INICIAL);
  const [orders, setOrders] = useState<CounterOrder[]>([]);

  const [searchMostrador, setSearchMostrador] = useState('');
  const [searchStock, setSearchStock] = useState('');
  const [filterOrderEstado, setFilterOrderEstado] = useState<'activos' | 'todos'>('activos');

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showNuevoPedido, setShowNuevoPedido] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<ClienteTipo>('mostrador');
  const [showNuevoClienteModal, setShowNuevoClienteModal] = useState(false);

  const [addItemQuery, setAddItemQuery] = useState('');
  const [showPago, setShowPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('efectivo');

  const pedidosHoy = useMemo(() => orders.filter(o => isToday(o.creadoEn)).length, [orders]);
  const ventasHoy = useMemo(
    () => orders.filter(o => o.estado === 'cobrado' && o.cobradoEn && isToday(o.cobradoEn)).length,
    [orders],
  );
  const bajoStockCount = useMemo(
    () => articles.filter(a => a.stock > 0 && a.stock <= a.stockMinimo).length,
    [articles],
  );

  const filteredOrders = useMemo(() => {
    const q = searchMostrador.toLowerCase();
    return orders.filter(o => {
      if (filterOrderEstado === 'activos' && o.estado !== 'activo') return false;
      if (!q) return true;
      return (
        o.clienteNombre.toLowerCase().includes(q) ||
        o.items.some(
          i =>
            i.referencia.toLowerCase().includes(q) ||
            i.nombre.toLowerCase().includes(q),
        )
      );
    });
  }, [orders, searchMostrador, filterOrderEstado]);

  const filteredArticles = useMemo(() => {
    const q = searchStock.toLowerCase().trim();
    if (!q) return articles;
    return articles.filter(
      a =>
        a.referencia.toLowerCase().includes(q) ||
        a.nombre.toLowerCase().includes(q) ||
        a.compatibilidad.some(c => c.toLowerCase().includes(q)),
    );
  }, [articles, searchStock]);

  const selectedOrder = useMemo(
    () => (selectedOrderId ? orders.find(o => o.id === selectedOrderId) ?? null : null),
    [orders, selectedOrderId],
  );

  const crearPedidoMostrador = useCallback(() => {
    const nombre = nuevoCliente.trim() || (nuevoTipo === 'mostrador' ? 'Cliente mostrador' : 'Cliente');
    const order: CounterOrder = {
      id: uuidv4(),
      clienteNombre: nombre,
      clienteTipo: nuevoTipo,
      creadoEn: new Date().toISOString(),
      items: [],
      estado: 'activo',
    };
    setOrders(prev => [order, ...prev]);
    setNuevoCliente('');
    setNuevoTipo('mostrador');
    setShowNuevoPedido(false);
    setSelectedOrderId(order.id);
  }, [nuevoCliente, nuevoTipo]);

  const addLineToOrder = useCallback(
    (orderId: string, art: SpareArticle) => {
      const estado = stockEstadoParaArticulo(art);
      setOrders(prev =>
        prev.map(o => {
          if (o.id !== orderId || o.estado !== 'activo') return o;
          const existing = o.items.find(l => l.articleId === art.id);
          if (existing) {
            return {
              ...o,
              items: o.items.map(l =>
                l.articleId === art.id ? { ...l, cantidad: l.cantidad + 1, stockEstado: estado } : l,
              ),
            };
          }
          return {
            ...o,
            items: [
              ...o.items,
              {
                id: uuidv4(),
                articleId: art.id,
                referencia: art.referencia,
                nombre: art.nombre,
                compatibilidad: art.compatibilidad,
                stockEstado: estado,
                precioUnitario: art.precio,
                cantidad: 1,
              },
            ],
          };
        }),
      );
    },
    [],
  );

  const updateLineQty = useCallback((orderId: string, lineId: string, delta: number) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          items: o.items
            .map(l => {
              if (l.id !== lineId) return l;
              const next = Math.max(1, l.cantidad + delta);
              return { ...l, cantidad: next };
            })
            .filter(l => l.cantidad > 0),
        };
      }),
    );
  }, []);

  const removeLine = useCallback((orderId: string, lineId: string) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, items: o.items.filter(l => l.id !== lineId) } : o)),
    );
  }, []);

  const totalPedido = useCallback((o: CounterOrder) => {
    return o.items.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  }, []);

  const confirmarPago = useCallback(() => {
    if (!selectedOrder || selectedOrder.estado !== 'activo') return;
    const consumo = new Map<string, number>();
    for (const l of selectedOrder.items) {
      consumo.set(l.articleId, (consumo.get(l.articleId) || 0) + l.cantidad);
    }
    setArticles(prev =>
      prev.map(a => {
        const take = consumo.get(a.id);
        if (!take) return a;
        return { ...a, stock: Math.max(0, a.stock - take) };
      }),
    );
    const ahora = new Date().toISOString();
    setOrders(prev =>
      prev.map(o =>
        o.id === selectedOrder.id
          ? {
              ...o,
              estado: 'cobrado',
              cobradoEn: ahora,
              items: o.items.map(l => {
                const art = articles.find(x => x.id === l.articleId);
                if (!art) return l;
                const nuevoStock = Math.max(0, art.stock - (consumo.get(l.articleId) || 0));
                const tmp = { ...art, stock: nuevoStock };
                return { ...l, stockEstado: stockEstadoParaArticulo(tmp) };
              }),
            }
          : o,
      ),
    );
    setShowPago(false);
    setSelectedOrderId(null);
  }, [selectedOrder, articles]);

  const articlesForAdd = useMemo(() => {
    const q = addItemQuery.toLowerCase().trim();
    if (!q) return articles.slice(0, 8);
    return articles.filter(
      a =>
        a.referencia.toLowerCase().includes(q) ||
        a.nombre.toLowerCase().includes(q) ||
        a.compatibilidad.some(c => c.toLowerCase().includes(q)),
    );
  }, [articles, addItemQuery]);

  // ── Vista detalle pedido ──
  if (mainTab === 'mostrador' && selectedOrder) {
    const o = selectedOrder;
    const total = totalPedido(o);
    const puedeCobrar = o.estado === 'activo' && o.items.length > 0;

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() => setSelectedOrderId(null)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{o.clienteNombre}</h1>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                    o.clienteTipo === 'cliente'
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300'
                  }`}
                >
                  {o.clienteTipo === 'cliente' ? (
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3" /> Cliente
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Store className="w-3 h-3" /> Mostrador
                    </span>
                  )}
                </span>
                {o.estado === 'cobrado' && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Cobrado
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 font-mono truncate">Pedido · {o.id.slice(0, 8)}…</p>
            </div>
          </div>

          {o.estado === 'activo' && (
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={addItemQuery}
                onChange={e => setAddItemQuery(e.target.value)}
                placeholder="Añadir por referencia, nombre o compatibilidad…"
                className="w-full pl-9 pr-8 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
              />
              {addItemQuery && (
                <button
                  type="button"
                  onClick={() => setAddItemQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          )}

          {o.estado === 'activo' && articlesForAdd.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {articlesForAdd.map(a => {
                const st = stockEstadoParaArticulo(a);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => addLineToOrder(o.id, a)}
                    className="shrink-0 flex flex-col items-start p-2.5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-violet-400 hover:shadow-md transition-all max-w-[200px]"
                  >
                    <span className="font-mono text-[10px] text-gray-400">{a.referencia}</span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 text-left line-clamp-2">
                      {a.nombre}
                    </span>
                    <span className="text-xs font-bold text-violet-600 dark:text-violet-400 mt-1">
                      {formatCurrency(a.precio)}
                    </span>
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                      <span className={`w-1.5 h-1.5 rounded-full ${STOCK_LINEA_CFG[st].dot}`} />
                      {a.stock} uds · {STOCK_LINEA_CFG[st].label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {o.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">Sin líneas en el pedido</p>
              <p className="text-xs">Busca arriba y añade recambios</p>
            </div>
          ) : (
            o.items.map(line => {
              const cfg = STOCK_LINEA_CFG[line.stockEstado];
              return (
                <div
                  key={line.id}
                  className={`rounded-2xl border-2 p-3 bg-white dark:bg-gray-900 ${cfg.border}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{line.nombre}</p>
                      <p className="font-mono text-xs text-gray-500">{line.referencia}</p>
                    </div>
                    <span className="text-sm font-bold shrink-0">
                      {formatCurrency(line.precioUnitario * line.cantidad)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400 mb-2 flex-wrap">
                    <Car className="w-3 h-3 shrink-0" />
                    {line.compatibilidad.slice(0, 2).join(' · ')}
                    {line.compatibilidad.length > 2 && <span>+{line.compatibilidad.length - 2}</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    {o.estado === 'activo' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateLineQty(o.id, line.id, -1)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold">{line.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => updateLineQty(o.id, line.id, 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLine(o.id, line.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">{line.cantidad} uds</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {o.estado === 'activo' && (
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-gray-500">Total</span>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(total)}</span>
            </div>
            <button
              type="button"
              disabled={!puedeCobrar}
              onClick={() => setShowPago(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md disabled:opacity-40 disabled:cursor-not-allowed border-2 border-transparent"
            >
              <Receipt className="w-4 h-4" /> Procesar pago
            </button>
          </div>
        )}

        {showPago && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              aria-label="Cerrar"
              onClick={() => setShowPago(false)}
            />
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-2xl max-w-sm w-full p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Cobrar pedido</h2>
              <p className="text-sm text-gray-500 mb-4">
                Total: <span className="font-bold text-violet-600">{formatCurrency(total)}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {PAYMENT_METHODS.map(pm => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setMetodoPago(pm.id)}
                    className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                      metodoPago === pm.id
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {pm.icon}
                    <span className="text-sm font-medium">{pm.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPago(false)}
                  className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarPago}
                  className="flex-[2] px-4 py-2.5 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 shadow-md"
                >
                  Confirmar cobro
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Principal ──
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/saas/worker/tasks')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/40 rounded-2xl flex items-center justify-center border-2 border-violet-200 dark:border-violet-800">
              <Cog className="w-5 h-5 text-violet-700 dark:text-violet-300" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi Puesto - Recambios</h1>
              <p className="text-xs text-gray-500">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => {
              setMainTab('mostrador');
              setSearchStock('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-semibold transition-all border-2 ${
              mainTab === 'mostrador'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300'
            }`}
          >
            <ShoppingCart className="w-4 h-4" /> Mostrador
          </button>
          <button
            type="button"
            onClick={() => {
              setMainTab('stock');
              setSearchMostrador('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-semibold transition-all border-2 ${
              mainTab === 'stock'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300'
            }`}
          >
            <Package className="w-4 h-4" /> Stock
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-2.5 text-center">
            <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{pedidosHoy}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-500">
              Pedidos hoy
            </p>
          </div>
          <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-2.5 text-center">
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{ventasHoy}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-500">
              Ventas hoy
            </p>
          </div>
          <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-2.5 text-center">
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{bajoStockCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-500">
              Bajo stock
            </p>
          </div>
        </div>

        {mainTab === 'mostrador' && (
          <>
            <div className="flex gap-1.5 mb-2">
              {(
                [
                  { id: 'activos' as const, label: 'Activos' },
                  { id: 'todos' as const, label: 'Todos' },
                ]
              ).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterOrderEstado(f.id)}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all border-2 ${
                    filterOrderEstado === f.id
                      ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchMostrador}
                onChange={e => setSearchMostrador(e.target.value)}
                placeholder="Buscar cliente, referencia o artículo…"
                className="w-full pl-9 pr-8 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
              />
              {searchMostrador && (
                <button type="button" onClick={() => setSearchMostrador('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </>
        )}

        {mainTab === 'stock' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchStock}
              onChange={e => setSearchStock(e.target.value)}
              placeholder="Referencia, nombre o vehículo compatible…"
              className="w-full pl-9 pr-8 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
            />
            {searchStock && (
              <button type="button" onClick={() => setSearchStock('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {mainTab === 'mostrador' ? (
          filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <ShoppingCart className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay pedidos en esta vista</p>
              <p className="text-xs text-center max-w-xs mt-1">Crea un pedido de mostrador para empezar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(o => {
                const total = totalPedido(o);
                const activo = o.estado === 'activo';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOrderId(o.id)}
                    className="w-full text-left p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-violet-400 hover:shadow-lg transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{o.clienteNombre}</span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(o.creadoEn).toLocaleString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {o.items.slice(0, 3).map(l => (
                        <span
                          key={l.id}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono"
                        >
                          {l.referencia} ×{l.cantidad}
                        </span>
                      ))}
                      {o.items.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{o.items.length - 3} más</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          activo ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {activo ? (
                          <>
                            <AlertTriangle className="w-3 h-3" /> Pendiente cobro
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> Cobrado
                          </>
                        )}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(total)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Search className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">Sin resultados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredArticles.map(a => {
              const st = stockEstadoParaArticulo(a);
              const cfg = STOCK_LINEA_CFG[st];
              return (
                <div
                  key={a.id}
                  className={`rounded-2xl border-2 p-4 bg-white dark:bg-gray-900 ${cfg.border}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-violet-600 dark:text-violet-400 font-semibold">{a.referencia}</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{a.nombre}</p>
                    </div>
                    <p className="text-sm font-bold shrink-0">{formatCurrency(a.precio)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
                    <div>
                      <span className="text-gray-400 uppercase text-[10px] font-semibold">Stock</span>
                      <p className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        {a.stock} uds · {cfg.label}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 uppercase text-[10px] font-semibold">Ubicación</span>
                      <p className="font-medium text-gray-800 dark:text-gray-200">{a.ubicacion}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 uppercase text-[10px] font-semibold">Vehículos compatibles</span>
                    <ul className="mt-1 space-y-0.5">
                      {a.compatibilidad.map((c, i) => (
                        <li key={i} className="text-xs flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                          <Car className="w-3 h-3 text-gray-400 shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {mainTab === 'mostrador' && (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
          <button
            type="button"
            onClick={() => setShowNuevoPedido(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl text-sm font-semibold hover:opacity-90 shadow-md transition border-2 border-transparent"
          >
            <Plus className="w-4 h-4" /> Nuevo pedido mostrador
          </button>
        </div>
      )}

      {showNuevoPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-label="Cerrar"
            onClick={() => setShowNuevoPedido(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-2xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Nuevo pedido</h2>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nombre cliente (opcional)</label>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={nuevoCliente}
                onChange={e => setNuevoCliente(e.target.value)}
                placeholder="Ej. García · taller colindante"
                className="flex-1 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-violet-500 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNuevoClienteModal(true)}
                className="px-3 py-2.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 text-xs font-semibold whitespace-nowrap hover:bg-emerald-100 transition-colors"
              >
                + CRM
              </button>
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tipo</p>
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setNuevoTipo('mostrador')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
                  nuevoTipo === 'mostrador'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-800'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600'
                }`}
              >
                <Store className="w-4 h-4" /> Walk-in / mostrador
              </button>
              <button
                type="button"
                onClick={() => setNuevoTipo('cliente')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
                  nuevoTipo === 'cliente'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-800'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600'
                }`}
              >
                <User className="w-4 h-4" /> Cliente
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNuevoPedido(false)}
                className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={crearPedidoMostrador}
                className="flex-[2] px-4 py-2.5 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"
              >
                Crear pedido
              </button>
            </div>
          </div>
        </div>
      )}

      <NuevoClienteModal
        open={showNuevoClienteModal}
        onClose={() => setShowNuevoClienteModal(false)}
        onClientCreated={(client) => {
          setNuevoCliente(client.name);
          setNuevoTipo('cliente');
          setShowNuevoClienteModal(false);
        }}
        contexto="tpv"
      />
    </div>
  );
}
