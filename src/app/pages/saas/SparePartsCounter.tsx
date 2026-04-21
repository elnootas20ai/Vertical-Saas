import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, ShoppingCart, Receipt,
  CreditCard, Banknote, ArrowRightLeft, Trash2,
  Clock, Euro, Minus, Loader2,
} from 'lucide-react';

type FormaPago = 'efectivo' | 'tarjeta' | 'transferencia';

interface CartItem {
  referencia: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

interface CounterTicket extends VerticalEntity {
  numTicket: string;
  hora: string;
  cliente: string;
  articulos: CartItem[];
  total: number;
  formaPago: FormaPago;
  vendedor: string;
}

/** Misma forma que el catálogo spareparts (para precios en TPV). */
interface CatalogProduct extends VerticalEntity {
  referencia: string;
  nombre: string;
  marca: string;
  categoria: string;
  precioPVP: number;
  precioCoste: number;
  referenciaOE: string;
  foto: string;
}

const FORMA_PAGO_CONFIG: Record<FormaPago, { label: string; icon: typeof Banknote; color: string }> = {
  efectivo: { label: 'Efectivo', icon: Banknote, color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  tarjeta: { label: 'Tarjeta', icon: CreditCard, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  transferencia: { label: 'Transferencia', icon: ArrowRightLeft, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
};

const VENDEDORES = ['Carlos M.', 'Ana P.', 'Javier R.', 'Laura S.'];
const CLIENTES = ['Mostrador', 'Talleres García S.L.', 'Antonio López', 'FlotaCar Logistics', 'Taller Mecánico Rápido', 'María Sánchez'];

export function SparePartsCounter() {
  const { user } = useAuth();
  const ticketApi = useMemo(() => createVerticalApi<CounterTicket>('spareparts', 'counterTickets'), []);
  const catalogApi = useMemo(() => createVerticalApi<CatalogProduct>('spareparts', 'catalog'), []);
  const userId = user?.user_id || user?.id || '';

  const [tickets, setTickets] = useState<CounterTicket[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCliente, setSelectedCliente] = useState('Mostrador');
  const [selectedPago, setSelectedPago] = useState<FormaPago>('efectivo');
  const [selectedVendedor, setSelectedVendedor] = useState(VENDEDORES[0]);
  const [productSearch, setProductSearch] = useState('');
  const [showTicketModal, setShowTicketModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ticketList, catList] = await Promise.all([
        ticketApi.list(userId),
        catalogApi.list(userId),
      ]);
      setTickets(ticketList);
      setCatalogProducts(catList);
    } finally {
      setLoading(false);
    }
  }, [userId, ticketApi, catalogApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProducts = catalogProducts.filter(p => {
    const s = productSearch.toLowerCase();
    return s && (p.referencia.toLowerCase().includes(s) || p.nombre.toLowerCase().includes(s));
  });

  const addToCart = (product: CatalogProduct) => {
    setCart(prev => {
      const existing = prev.find(c => c.referencia === product.referencia);
      if (existing) {
        return prev.map(c => c.referencia === product.referencia ? { ...c, cantidad: c.cantidad + 1 } : c);
      }
      return [...prev, { referencia: product.referencia, nombre: product.nombre, cantidad: 1, precioUnitario: product.precioPVP }];
    });
    setProductSearch('');
  };

  const updateQty = (ref: string, delta: number) => {
    setCart(prev => prev.map(c => c.referencia === ref ? { ...c, cantidad: Math.max(1, c.cantidad + delta) } : c));
  };

  const removeFromCart = (ref: string) => setCart(prev => prev.filter(c => c.referencia !== ref));

  const cartTotal = cart.reduce((s, c) => s + c.cantidad * c.precioUnitario, 0);

  const finalizeSale = async () => {
    if (!userId || cart.length === 0) return;
    const maxNum = tickets.reduce((m, t) => {
      const p = t.numTicket.match(/T-(\d+)/);
      return p ? Math.max(m, parseInt(p[1], 10)) : m;
    }, 0);
    const numTicket = `T-${String(maxNum + 1).padStart(4, '0')}`;
    try {
      await ticketApi.create(userId, {
        numTicket,
        hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        cliente: selectedCliente,
        articulos: [...cart],
        total: cartTotal,
        formaPago: selectedPago,
        vendedor: selectedVendedor,
      });
      await loadData();
      setCart([]);
      setProductSearch('');
    } catch {
      /* error from fetch */
    }
  };

  const ventasHoy = tickets.reduce((s, t) => s + t.total, 0);
  const ticketsHoy = tickets.length;
  const ticketMedio = ticketsHoy > 0 ? ventasHoy / ticketsHoy : 0;

  const stats = [
    { label: 'Ventas Hoy', value: `${ventasHoy.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: <Euro className="w-5 h-5 text-green-500" />, bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: 'Tickets Hoy', value: ticketsHoy, icon: <Receipt className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Caja Total', value: `${ventasHoy.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: <Banknote className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ticket Medio', value: `${ticketMedio.toFixed(2)} €`, icon: <ShoppingCart className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  return (
    <Layout title="Mostrador / TPV">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* POS Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product search + cart */}
          <div className="lg:col-span-2 space-y-4">
            {/* Product search */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Search className="w-4 h-4 text-blue-500" /> Buscar Producto</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Referencia o nombre del producto..." disabled={loading} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 dark:text-gray-100" />
              </div>
              {loading && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando catálogo…
                </div>
              )}
              {!loading && filteredProducts.length > 0 && (
                <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg max-h-48 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button key={p._id} type="button" onClick={() => addToCart(p)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left border-b last:border-b-0 border-gray-100 dark:border-gray-700/50">
                      <div>
                        <span className="font-mono text-xs text-blue-600 dark:text-blue-400 mr-2">{p.referencia}</span>
                        <span className="text-sm text-gray-900 dark:text-gray-100">{p.nombre}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.precioPVP.toFixed(2)} €</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-emerald-500" /> Carrito ({cart.length})</h3>
              {cart.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">Busca y añade productos al carrito</p>
              ) : (
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.referencia} className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.nombre}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{item.referencia} · {item.precioUnitario.toFixed(2)} €/ud</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => updateQty(item.referencia, -1)} className="p-1 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500"><Minus className="w-3 h-3" /></button>
                        <span className="text-sm font-bold w-8 text-center text-gray-900 dark:text-gray-100">{item.cantidad}</span>
                        <button type="button" onClick={() => updateQty(item.referencia, 1)} className="p-1 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500"><Plus className="w-3 h-3" /></button>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 w-20 text-right">{(item.cantidad * item.precioUnitario).toFixed(2)} €</span>
                      <button type="button" onClick={() => removeFromCart(item.referencia)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: payment */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente</label>
                <select value={selectedCliente} onChange={e => setSelectedCliente(e.target.value)} disabled={loading} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {CLIENTES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Vendedor</label>
                <select value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)} disabled={loading} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {VENDEDORES.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Forma de Pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(FORMA_PAGO_CONFIG) as [FormaPago, typeof FORMA_PAGO_CONFIG[FormaPago]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button key={key} type="button" onClick={() => setSelectedPago(key)} disabled={loading} className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 text-xs font-medium transition-colors disabled:opacity-50 ${selectedPago === key ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
                        <Icon className="w-5 h-5" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{cartTotal.toFixed(2)} €</span>
                </div>
                <button type="button" onClick={() => void finalizeSale()} disabled={cart.length === 0 || loading} className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:dark:bg-gray-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                  <Receipt className="w-5 h-5" /> Cobrar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Today's sales table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Ventas de Hoy</h3>
          </div>
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nº Ticket</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Hora</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Cliente</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Artículos</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Total</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Forma Pago</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : tickets.map(t => {
                const PagoIcon = FORMA_PAGO_CONFIG[t.formaPago].icon;
                return (
                  <tr key={t._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{t.numTicket}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.hora}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{t.cliente}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{t.articulos.reduce((s, a) => s + a.cantidad, 0)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{t.total.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-center"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${FORMA_PAGO_CONFIG[t.formaPago].color}`}><PagoIcon className="w-3 h-3" />{FORMA_PAGO_CONFIG[t.formaPago].label}</span></td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-xs">{t.vendedor}</td>
                  </tr>
                );
              })}
              {!loading && tickets.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No hay ventas hoy</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
