import { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import {
  Search, Filter, Package, AlertTriangle, TrendingDown, Euro,
  ArrowUpCircle, ArrowDownCircle, RefreshCw, Trash2, X, Plus,
  BarChart3, Scissors, ShoppingCart, Eye,
  CheckCircle2, XCircle, AlertCircle, Clock, Scale, ArrowRightLeft,
} from 'lucide-react';
import {
  listButcherProductsRequest, listButcherBatchesRequest,
  getButcherAlertsSummaryRequest, getButcherSalesStatsRequest,
  type ButcherProduct, type ButcherBatch, type ButcherCategory, type ButcherAlertSummary,
  type SalesStats,
} from '../../lib/butcherApi';
import {
  listStockMovementsRequest, createAdjustmentRequest, getMovementsSummaryRequest,
  type StockMovement, type MovementsSummary,
} from '../../lib/stockMovementApi';
import {
  listButcherWasteRequest, createButcherWasteRequest, getButcherWasteSummaryRequest,
  type ButcherWasteRecord, type WasteSummary,
  WASTE_TYPE_LABELS, WASTE_TYPE_COLORS, REVIEW_STATUS_LABELS, REVIEW_STATUS_COLORS,
  type WasteType, type ReviewStatus,
} from '../../lib/butcherWasteApi';

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ButcherCategory, string> = {
  vacuno: 'Vacuno', cerdo: 'Cerdo', pollo: 'Pollo', cordero: 'Cordero', elaborados: 'Elaborados', otros: 'Otros',
};

const CATEGORY_COLORS: Record<ButcherCategory, string> = {
  vacuno: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  cerdo: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
  pollo: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  cordero: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  elaborados: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  otros: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
};

const MOVEMENT_LABELS: Record<string, { label: string; color: string; sign: string }> = {
  purchase_reception: { label: 'Compra', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', sign: '+' },
  sale: { label: 'Venta', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', sign: '-' },
  adjustment_in: { label: 'Ajuste +', color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300', sign: '+' },
  adjustment_out: { label: 'Ajuste -', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', sign: '-' },
  internal_consumption: { label: 'Consumo', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300', sign: '-' },
  transfer: { label: 'Transferencia', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300', sign: '~' },
  return_supplier: { label: 'Dev. proveedor', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', sign: '-' },
  return_customer: { label: 'Dev. cliente', color: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300', sign: '+' },
  initial: { label: 'Inicial', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', sign: '=' },
};

type Tab = 'resumen' | 'movimientos' | 'alertas' | 'merma';
type StockStatus = 'all' | 'normal' | 'bajo' | 'agotado' | 'negativo';

function fmtKg(n: number) { return `${n.toFixed(1)} kg`; }
function fmtEur(n: number) { return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('es-ES') : '—'; }
function fmtDateTime(d: string) { return d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }

function daysUntil(date: string) {
  if (!date) return Infinity;
  return Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function getStockStatus(p: ButcherProduct): { label: string; color: string; dot: string } {
  const stock = Number(p.stockKg || 0);
  const min = Number(p.minStockKg || 0);
  if (stock < 0) return { label: 'Negativo', color: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' };
  if (stock === 0) return { label: 'Agotado', color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
  if (min > 0 && stock <= min) return { label: 'Bajo', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' };
  return { label: 'Normal', color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
}

function getExpiryBadge(date: string) {
  const d = daysUntil(date);
  if (d < 0) return { label: 'Caducado', cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' };
  if (d <= 2) return { label: `${d}d`, cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' };
  if (d <= 5) return { label: `${d}d`, cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
  return { label: `${d}d`, cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, bg }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string; bg: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${bg}`}><Icon className={`w-5 h-5 ${color}`} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Tab Button ─────────────────────────────────────────────────────────────

function TabBtn({ active, label, badge, onClick }: { active: boolean; label: string; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition whitespace-nowrap ${active ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white min-w-[18px]">{badge}</span>
      )}
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ButcherStock() {
  const { user } = useAuth();
  const userId = user?.id || user?.user_id || '';

  const [tab, setTab] = useState<Tab>('resumen');
  const [loading, setLoading] = useState(true);

  // Data
  const [products, setProducts] = useState<ButcherProduct[]>([]);
  const [batches, setBatches] = useState<ButcherBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movSummary, setMovSummary] = useState<MovementsSummary | null>(null);
  const [alerts, setAlerts] = useState<ButcherAlertSummary | null>(null);
  const [waste, setWaste] = useState<ButcherWasteRecord[]>([]);
  const [wasteSummary, setWasteSummary] = useState<WasteSummary | null>(null);
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null);

  // Filters – Resumen
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<ButcherCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<StockStatus>('all');

  // Filters – Movimientos
  const [movSearch, setMovSearch] = useState('');
  const [movType, setMovType] = useState<string>('all');
  const [movDateFrom, setMovDateFrom] = useState('');
  const [movDateTo, setMovDateTo] = useState('');

  // Filters – Merma
  const [wasteType, setWasteType] = useState<string>('all');
  const [wasteReview, setWasteReview] = useState<string>('all');

  // Modals
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<ButcherProduct | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('in');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);

  const [showWaste, setShowWaste] = useState(false);
  const [wasteProduct, setWasteProduct] = useState('');
  const [wasteKg, setWasteKg] = useState('');
  const [wasteReason, setWasteReason] = useState<WasteType>('recortes');
  const [wasteNotes, setWasteNotes] = useState('');
  const [wasteSaving, setWasteSaving] = useState(false);

  useModalClose(showAdjust, () => setShowAdjust(false));
  useModalClose(showWaste, () => setShowWaste(false));

  // ─── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [prodRes, batchRes, movRes, movSumRes, alertRes, wasteRes, wasteSumRes, salesRes] = await Promise.all([
        listButcherProductsRequest(userId).catch(() => ({ products: [] })),
        listButcherBatchesRequest(userId).catch(() => ({ batches: [] })),
        listStockMovementsRequest(userId).catch(() => []),
        getMovementsSummaryRequest(userId).catch(() => null),
        getButcherAlertsSummaryRequest(userId).catch(() => null),
        listButcherWasteRequest(userId).catch(() => ({ waste: [] })),
        getButcherWasteSummaryRequest(userId).catch(() => null),
        getButcherSalesStatsRequest(userId).catch(() => null),
      ]);
      setProducts((prodRes as { products: ButcherProduct[] }).products || []);
      setBatches((batchRes as { batches: ButcherBatch[] }).batches || []);
      setMovements(Array.isArray(movRes) ? movRes : []);
      setMovSummary(movSumRes);
      setAlerts(alertRes);
      setWaste((wasteRes as { waste: ButcherWasteRecord[] }).waste || []);
      setWasteSummary((wasteSumRes as { summary: WasteSummary } | null)?.summary || null);
      setSalesStats(salesRes);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Derived data ───────────────────────────────────────────────────────────

  const activeProducts = useMemo(() => products.filter(p => p.active !== false), [products]);
  const activeBatches = useMemo(() => batches.filter(b => b.status === 'active'), [batches]);

  const batchByProduct = useMemo(() => {
    const map: Record<string, ButcherBatch> = {};
    for (const b of activeBatches) {
      if (!map[b.productId] || b.receptionDate > map[b.productId].receptionDate) {
        map[b.productId] = b;
      }
    }
    return map;
  }, [activeBatches]);

  const kpis = useMemo(() => {
    const totalKg = activeProducts.reduce((s, p) => s + Number(p.stockKg || 0), 0);
    const totalValue = activeProducts.reduce((s, p) => s + Number(p.stockKg || 0) * Number(p.costPricePerKg || p.pricePerKg || 0), 0);
    const alertCount = activeProducts.filter(p => {
      const st = getStockStatus(p);
      return st.label !== 'Normal';
    }).length;
    const wasteMonthKg = wasteSummary?.totalWasteKg || 0;
    const wasteMonthEur = wasteSummary?.totalCost || 0;
    return { totalKg, totalValue, alertCount, wasteMonthKg, wasteMonthEur };
  }, [activeProducts, wasteSummary]);

  // Resumen table
  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.sku || '').toLowerCase().includes(q)) return false;
      }
      if (filterCategory !== 'all' && p.category !== filterCategory) return false;
      if (filterStatus !== 'all') {
        const st = getStockStatus(p);
        const stMap: Record<StockStatus, string> = { all: '', normal: 'Normal', bajo: 'Bajo', agotado: 'Agotado', negativo: 'Negativo' };
        if (st.label !== stMap[filterStatus]) return false;
      }
      return true;
    });
  }, [activeProducts, search, filterCategory, filterStatus]);

  // Movimientos table
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (movSearch) {
        const q = movSearch.toLowerCase();
        if (!(m.catalogItemName || '').toLowerCase().includes(q) && !(m.sku || '').toLowerCase().includes(q)) return false;
      }
      if (movType !== 'all' && m.movementType !== movType) return false;
      if (movDateFrom && m.createdAt < movDateFrom) return false;
      if (movDateTo && m.createdAt < movDateTo + 'T23:59:59') return false;
      return true;
    }).slice(0, 200);
  }, [movements, movSearch, movType, movDateFrom, movDateTo]);

  // Merma table
  const filteredWaste = useMemo(() => {
    return waste.filter(w => {
      if (wasteType !== 'all' && w.wasteType !== wasteType) return false;
      if (wasteReview !== 'all' && w.reviewStatus !== wasteReview) return false;
      return true;
    });
  }, [waste, wasteType, wasteReview]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const openAdjust = (p: ButcherProduct) => {
    setAdjustProduct(p);
    setAdjustQty('');
    setAdjustType('in');
    setAdjustNotes('');
    setShowAdjust(true);
  };

  const handleAdjust = async () => {
    if (!adjustProduct || !adjustQty || !adjustNotes.trim()) return;
    setAdjustSaving(true);
    try {
      await createAdjustmentRequest(userId, {
        catalogItemId: adjustProduct._id,
        quantity: Number(adjustQty),
        type: adjustType,
        notes: adjustNotes,
      });
      toast.success('Ajuste registrado correctamente');
      setShowAdjust(false);
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar ajuste');
    } finally { setAdjustSaving(false); }
  };

  const openWasteModal = () => {
    setWasteProduct(activeProducts[0]?._id || '');
    setWasteKg('');
    setWasteReason('recortes');
    setWasteNotes('');
    setShowWaste(true);
  };

  const handleWaste = async () => {
    if (!wasteProduct || !wasteKg) return;
    setWasteSaving(true);
    const prod = activeProducts.find(p => p._id === wasteProduct);
    try {
      await createButcherWasteRequest(userId, {
        productId: wasteProduct,
        productName: prod?.name || '',
        catalogItemId: wasteProduct,
        catalogItemName: prod?.name || '',
        wasteKg: Number(wasteKg),
        wasteType: wasteReason,
        reason: wasteReason,
        notes: wasteNotes,
        date: new Date().toISOString().slice(0, 10),
      });
      toast.success('Merma registrada correctamente');
      setShowWaste(false);
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar merma');
    } finally { setWasteSaving(false); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout title="Stock Automático" subtitle="Control de inventario en tiempo real">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Stock total" value={fmtKg(kpis.totalKg)} sub={`${activeProducts.length} productos activos`} icon={Package} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/30" />
        <StatCard label="Valor de stock" value={fmtEur(kpis.totalValue)} sub="Coste de inventario" icon={Euro} color="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-900/30" />
        <StatCard label="Productos en alerta" value={kpis.alertCount} sub="Bajo, agotado o negativo" icon={AlertTriangle} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/30" />
        <StatCard label="Merma del período" value={fmtKg(kpis.wasteMonthKg)} sub={fmtEur(kpis.wasteMonthEur)} icon={TrendingDown} color="text-red-600 dark:text-red-400" bg="bg-red-50 dark:bg-red-900/30" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        <TabBtn active={tab === 'resumen'} label="Resumen" onClick={() => setTab('resumen')} />
        <TabBtn active={tab === 'movimientos'} label="Movimientos" badge={movSummary?.totalMovements} onClick={() => setTab('movimientos')} />
        <TabBtn active={tab === 'alertas'} label="Alertas" badge={alerts?.totals.total} onClick={() => setTab('alertas')} />
        <TabBtn active={tab === 'merma'} label="Merma" onClick={() => setTab('merma')} />
      </div>

      {/* TAB: RESUMEN */}
      {tab === 'resumen' && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
              <div className="relative flex-1 w-full lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar producto o SKU..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-gray-400" />
                <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterCategory} onChange={e => setFilterCategory(e.target.value as ButcherCategory | 'all')}>
                  <option value="all">Todas las categorías</option>
                  {(Object.keys(CATEGORY_LABELS) as ButcherCategory[]).map(k => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
                </select>
                <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as StockStatus)}>
                  <option value="all">Todos los estados</option>
                  <option value="normal">Normal</option>
                  <option value="bajo">Bajo stock</option>
                  <option value="agotado">Agotado</option>
                  <option value="negativo">Negativo</option>
                </select>
                <button type="button" onClick={loadData} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition" title="Refrescar"><RefreshCw className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Producto</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Categoría</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Kg disponibles</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Valor stock</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Stock mín.</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Lote</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Caducidad</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Cargando stock...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">{activeProducts.length === 0 ? 'No hay productos registrados. Añade productos desde la sección Productos.' : 'No hay productos que coincidan con los filtros.'}</td></tr>
                  ) : filteredProducts.map(p => {
                    const st = getStockStatus(p);
                    const batch = batchByProduct[p._id];
                    const stockVal = Number(p.stockKg || 0) * Number(p.costPricePerKg || p.pricePerKg || 0);
                    const minKg = Number(p.minStockKg || 0);
                    const pct = minKg > 0 ? Math.min(100, (Number(p.stockKg || 0) / minKg) * 100) : 100;
                    const barColor = pct <= 25 ? 'bg-red-500' : pct <= 60 ? 'bg-amber-500' : 'bg-emerald-500';
                    const expBadge = batch ? getExpiryBadge(batch.expirationDate) : null;
                    return (
                      <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900 dark:text-white">{p.name}</div>
                          {p.sku && <div className="text-xs text-gray-400 font-mono">{p.sku}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_COLORS[p.category] || CATEGORY_COLORS.otros}`}>{CATEGORY_LABELS[p.category] || p.category}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-semibold text-gray-900 dark:text-white">{fmtKg(Number(p.stockKg || 0))}</div>
                          {minKg > 0 && (
                            <div className="mt-1 w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                              <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{fmtEur(stockVal)}</td>
                        <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{minKg > 0 ? fmtKg(minKg) : '—'}</td>
                        <td className="px-4 py-3">
                          {batch ? <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{batch.batchNumber}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {expBadge ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(batch!.expirationDate)}</span>
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${expBadge.cls}`}>{expBadge.label}</span>
                            </div>
                          ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                            <span className={st.color}>{st.label}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button type="button" onClick={() => openAdjust(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition" title="Ajustar stock"><Scale className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB: MOVIMIENTOS */}
      {tab === 'movimientos' && (
        <>
          {/* Movement KPIs */}
          {movSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total movimientos" value={movSummary.totalMovements} icon={ArrowRightLeft} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/30" />
              <StatCard label="Entradas" value={fmtKg(movSummary.totalIn)} sub={fmtEur(movSummary.totalInValue)} icon={ArrowUpCircle} color="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-900/30" />
              <StatCard label="Salidas" value={fmtKg(movSummary.totalOut)} sub={fmtEur(movSummary.totalOutValue)} icon={ArrowDownCircle} color="text-red-600 dark:text-red-400" bg="bg-red-50 dark:bg-red-900/30" />
              <StatCard label="Saldo neto" value={fmtKg(movSummary.netChange)} sub={fmtEur(movSummary.netValue)} icon={BarChart3} color="text-violet-600 dark:text-violet-400" bg="bg-violet-50 dark:bg-violet-900/30" />
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
              <div className="relative flex-1 w-full lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar producto..." value={movSearch} onChange={e => setMovSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={movType} onChange={e => setMovType(e.target.value)}>
                  <option value="all">Todos los tipos</option>
                  {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input type="date" className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={movDateFrom} onChange={e => setMovDateFrom(e.target.value)} />
                <input type="date" className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={movDateTo} onChange={e => setMovDateTo(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Producto</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Cantidad</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Stock anterior</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Stock nuevo</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Notas</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Cargando movimientos...</td></tr>
                  ) : filteredMovements.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay movimientos registrados.</td></tr>
                  ) : filteredMovements.map(m => {
                    const ml = MOVEMENT_LABELS[m.movementType] || { label: m.movementType, color: 'bg-gray-100 text-gray-700', sign: '?' };
                    const isIn = ml.sign === '+';
                    return (
                      <tr key={m._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{m.catalogItemName || '—'}</td>
                        <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${ml.color}`}>{ml.label}</span></td>
                        <td className={`px-4 py-3 text-right font-semibold ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {ml.sign}{m.quantity.toFixed(1)} kg
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{m.previousStock != null ? fmtKg(m.previousStock) : '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{m.newStock != null ? fmtKg(m.newStock) : '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[200px] truncate" title={m.notes}>{m.notes || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.performedBy || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB: ALERTAS */}
      {tab === 'alertas' && (
        <>
          {!alerts ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-400">
              {loading ? 'Cargando alertas...' : 'No se pudieron cargar las alertas.'}
            </div>
          ) : (
            <>
              {/* Alert totals */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard label="Alertas críticas" value={alerts.totals.critical} icon={XCircle} color="text-red-600 dark:text-red-400" bg="bg-red-50 dark:bg-red-900/30" />
                <StatCard label="Advertencias" value={alerts.totals.warning} icon={AlertCircle} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/30" />
                <StatCard label="Todo en orden" value={alerts.totals.total === 0 ? 'Sí' : 'No'} icon={CheckCircle2} color={alerts.totals.total === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'} bg={alerts.totals.total === 0 ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-gray-50 dark:bg-gray-800'} />
              </div>

              <div className="space-y-4">
                {/* Stock alerts */}
                {(alerts.stock.outOfStock.length > 0 || alerts.stock.critical.length > 0 || alerts.stock.lowStock.length > 0) && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Package className="w-4 h-4" /> Alertas de stock</h3>
                    <div className="space-y-2">
                      {alerts.stock.outOfStock.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                          <div className="flex items-center gap-3">
                            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                            <div><span className="font-semibold text-gray-900 dark:text-white">{p.name}</span><span className="text-sm text-red-600 dark:text-red-400 ml-2">AGOTADO</span></div>
                          </div>
                          <span className="text-sm text-gray-500">Mín: {fmtKg(p.minStockKg)}</span>
                        </div>
                      ))}
                      {alerts.stock.critical.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                          <div className="flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
                            <div><span className="font-semibold text-gray-900 dark:text-white">{p.name}</span><span className="text-sm text-orange-600 dark:text-orange-400 ml-2">CRÍTICO — {fmtKg(p.stockKg)}</span></div>
                          </div>
                          <span className="text-sm text-gray-500">Mín: {fmtKg(p.minStockKg)}</span>
                        </div>
                      ))}
                      {alerts.stock.lowStock.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                            <div><span className="font-semibold text-gray-900 dark:text-white">{p.name}</span><span className="text-sm text-amber-600 dark:text-amber-400 ml-2">{fmtKg(p.stockKg)} / {fmtKg(p.minStockKg)}</span></div>
                          </div>
                          <button type="button" className="text-xs px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3" /> Pedir
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Batch alerts */}
                {(alerts.batches.expired.length > 0 || alerts.batches.expiringSoon.length > 0) && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> Caducidad de lotes</h3>
                    <div className="space-y-2">
                      {alerts.batches.expired.map(b => (
                        <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                          <div className="flex items-center gap-3">
                            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                            <div><span className="font-semibold text-gray-900 dark:text-white">Lote {b.batchNumber}</span><span className="text-sm text-gray-500 ml-2">{b.product}</span><span className="text-sm text-red-600 dark:text-red-400 ml-2">Caducado hace {b.daysExpired}d</span></div>
                          </div>
                        </div>
                      ))}
                      {alerts.batches.expiringSoon.map(b => (
                        <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                            <div><span className="font-semibold text-gray-900 dark:text-white">Lote {b.batchNumber}</span><span className="text-sm text-gray-500 ml-2">{b.product}</span><span className="text-sm text-amber-600 dark:text-amber-400 ml-2">Caduca en {b.daysLeft}d</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Waste anomaly */}
                {alerts.waste.isAnomaly && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Scissors className="w-4 h-4" /> Merma anómala</h3>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                      <div>
                        <span className="font-semibold text-gray-900 dark:text-white">Merma hoy: {fmtKg(alerts.waste.todayKg)} ({alerts.waste.todayPct}%)</span>
                        <span className="text-sm text-gray-500 ml-2">Umbral: {alerts.waste.threshold}% — Media semanal: {fmtKg(alerts.waste.weekAvgKg)}/día</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Inventory discrepancies */}
                {alerts.inventory.discrepancies.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Eye className="w-4 h-4" /> Diferencias de inventario</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Último conteo: {alerts.inventory.lastCountDate ? fmtDate(alerts.inventory.lastCountDate) : 'nunca'}</p>
                    <div className="space-y-2">
                      {alerts.inventory.discrepancies.map(d => (
                        <div key={d.productId} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                            <div>
                              <span className="font-semibold text-gray-900 dark:text-white">{d.name}</span>
                              <span className="text-sm text-gray-500 ml-2">Esperado: {fmtKg(d.expectedKg)} → Contado: {fmtKg(d.countedKg)}</span>
                              <span className={`text-sm ml-2 font-medium ${d.differencePct > 0 ? 'text-emerald-600' : 'text-red-600'}`}>({d.differencePct > 0 ? '+' : ''}{d.differencePct.toFixed(1)}%)</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {alerts.totals.total === 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">Todo en orden</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">No hay alertas activas en este momento.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* TAB: MERMA */}
      {tab === 'merma' && (
        <>
          {/* Waste KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Merma total" value={fmtKg(wasteSummary?.totalWasteKg || 0)} sub={fmtEur(wasteSummary?.totalCost || 0)} icon={Scissors} color="text-red-600 dark:text-red-400" bg="bg-red-50 dark:bg-red-900/30" />
            <StatCard label="Registros" value={wasteSummary?.recordCount || 0} icon={Trash2} color="text-gray-600 dark:text-gray-400" bg="bg-gray-50 dark:bg-gray-800" />
            <StatCard label="% sobre recepción" value={`${(wasteSummary?.wastePct || 0).toFixed(1)}%`} icon={BarChart3} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/30" />
            <StatCard label="Recepción total" value={fmtKg(wasteSummary?.totalReceptionKg || 0)} icon={ArrowUpCircle} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/30" />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-gray-400" />
                <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={wasteType} onChange={e => setWasteType(e.target.value)}>
                  <option value="all">Todos los tipos</option>
                  {(Object.keys(WASTE_TYPE_LABELS) as WasteType[]).map(k => <option key={k} value={k}>{WASTE_TYPE_LABELS[k]}</option>)}
                </select>
                <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={wasteReview} onChange={e => setWasteReview(e.target.value)}>
                  <option value="all">Todos los estados</option>
                  {(Object.keys(REVIEW_STATUS_LABELS) as ReviewStatus[]).map(k => <option key={k} value={k}>{REVIEW_STATUS_LABELS[k]}</option>)}
                </select>
              </div>
              <button type="button" onClick={openWasteModal} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">
                <Plus className="w-4 h-4" /> Registrar merma
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Producto</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Kg</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Coste est.</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Revisión</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Registrado por</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Cargando merma...</td></tr>
                  ) : filteredWaste.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay registros de merma.</td></tr>
                  ) : filteredWaste.map(w => (
                    <tr key={w._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmtDate(w.date)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{w.catalogItemName || w.productName || '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${WASTE_TYPE_COLORS[w.wasteType] || 'bg-gray-100 text-gray-700'}`}>{WASTE_TYPE_LABELS[w.wasteType] || w.wasteType}</span></td>
                      <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 font-semibold">-{Number(w.wasteKg).toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{fmtEur(Number(w.estimatedCost || 0))}</td>
                      <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${REVIEW_STATUS_COLORS[w.reviewStatus] || ''}`}>{REVIEW_STATUS_LABELS[w.reviewStatus] || w.reviewStatus}</span></td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{w.registeredByName || w.registeredBy || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[160px] truncate" title={w.notes}>{w.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL: Ajuste de stock */}
      {showAdjust && adjustProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAdjust(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ajustar stock</h2>
              <button type="button" onClick={() => setShowAdjust(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Producto</label>
                <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl text-gray-900 dark:text-white font-medium">{adjustProduct.name}</div>
                <p className="text-xs text-gray-400 mt-1">Stock actual: <strong>{fmtKg(Number(adjustProduct.stockKg || 0))}</strong></p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none" value={adjustType} onChange={e => setAdjustType(e.target.value as 'in' | 'out')}>
                    <option value="in">Entrada (+)</option>
                    <option value="out">Salida (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cantidad (kg)</label>
                  <input type="number" step="0.1" min="0.1" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Motivo del ajuste *</label>
                <textarea className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-none" rows={2} placeholder="Ej. Inventario físico, corrección de error..." value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setShowAdjust(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleAdjust} disabled={adjustSaving || !adjustQty || !adjustNotes.trim()} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">{adjustSaving ? 'Guardando...' : 'Aplicar ajuste'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Registrar merma */}
      {showWaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowWaste(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Registrar merma</h2>
              <button type="button" onClick={() => setShowWaste(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Producto *</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none" value={wasteProduct} onChange={e => setWasteProduct(e.target.value)}>
                  {activeProducts.map(p => <option key={p._id} value={p._id}>{p.name} ({fmtKg(Number(p.stockKg || 0))})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cantidad (kg) *</label>
                  <input type="number" step="0.1" min="0.1" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={wasteKg} onChange={e => setWasteKg(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo de merma</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none" value={wasteReason} onChange={e => setWasteReason(e.target.value as WasteType)}>
                    {(Object.keys(WASTE_TYPE_LABELS) as WasteType[]).map(k => <option key={k} value={k}>{WASTE_TYPE_LABELS[k]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
                <textarea className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-none" rows={2} value={wasteNotes} onChange={e => setWasteNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setShowWaste(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleWaste} disabled={wasteSaving || !wasteProduct || !wasteKg} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">{wasteSaving ? 'Guardando...' : 'Registrar merma'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
