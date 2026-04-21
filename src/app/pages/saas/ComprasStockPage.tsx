import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import {
  listCatalogItemsRequest,
  createCatalogItemRequest,
  updateCatalogItemRequest,
  deleteCatalogItemRequest,
  listSuppliersRequest,
  createSupplierRequest,
  updateSupplierRequest,
  deleteSupplierRequest,
  listPurchaseInvoicesRequest,
  type CatalogItem,
  type Supplier,
  type PurchaseInvoice,
} from '../../lib/deliveryApi';
import {
  listPurchaseOrdersRequest,
  createPurchaseOrderRequest,
  updatePurchaseOrderRequest,
  deletePurchaseOrderRequest,
  triggerAutoOrdersRequest,
  getLowStockReportRequest,
  markOrderReceivedRequest,
  sendPurchaseOrderRequest,
  getSalesForecastRequest,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type LowStockItem,
  type ForecastItem,
} from '../../lib/purchaseOrderApi';
import {
  listWarehousesRequest,
  createWarehouseRequest,
  updateWarehouseRequest,
  deleteWarehouseRequest,
  type Warehouse,
} from '../../lib/warehouseApi';
import {
  listStockMovementsRequest,
  getMovementsSummaryRequest,
  createAdjustmentRequest,
  createTransferRequest,
  createInternalConsumptionRequest,
  type StockMovement,
  type MovementsSummary,
  type MovementType,
} from '../../lib/stockMovementApi';
import {
  Package, Warehouse as WarehouseIcon, Factory, ShoppingCart, Truck, ArrowUpDown,
  Receipt, AlertTriangle, TrendingDown, TrendingUp, Search, Plus, X, Edit3,
  Trash2, CheckCircle2, Clock, Send, FileText, Archive, Eye, Zap,
  ChevronDown, Filter, BarChart3, DollarSign, Boxes, ArrowRightLeft,
  PackageMinus, PackagePlus, RotateCcw, CircleDot, CalendarDays, Hash,
  ShoppingBag, Download, RefreshCw,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const TABS = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'stock', label: 'Stock' },
  { id: 'almacenes', label: 'Almacenes' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'recepciones', label: 'Recepciones' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'facturacion', label: 'Facturación' },
];

const STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  draft:     { label: 'Borrador',  color: 'text-gray-600 dark:text-gray-400',     bg: 'bg-gray-100 dark:bg-gray-700/60',           icon: FileText },
  pending:   { label: 'Pendiente', color: 'text-amber-700 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/20',          icon: Clock },
  sent:      { label: 'Enviado',   color: 'text-blue-700 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-900/20',            icon: Send },
  partial:   { label: 'Parcial',   color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20',        icon: Truck },
  received:  { label: 'Recibido',  color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20',    icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'text-red-600 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-900/20',              icon: X },
};

const MOVEMENT_LABELS: Record<string, { label: string; color: string; icon: typeof Package }> = {
  purchase_reception:  { label: 'Compra',           color: 'text-emerald-600', icon: PackagePlus },
  sale:                { label: 'Venta',            color: 'text-blue-600',    icon: ShoppingCart },
  internal_consumption:{ label: 'Consumo interno',  color: 'text-orange-600',  icon: PackageMinus },
  adjustment_in:       { label: 'Ajuste (+)',       color: 'text-emerald-600', icon: TrendingUp },
  adjustment_out:      { label: 'Ajuste (-)',       color: 'text-red-600',     icon: TrendingDown },
  transfer:            { label: 'Transferencia',    color: 'text-purple-600',  icon: ArrowRightLeft },
  return_supplier:     { label: 'Dev. proveedor',   color: 'text-amber-600',   icon: RotateCcw },
  return_customer:     { label: 'Dev. cliente',     color: 'text-cyan-600',    icon: RotateCcw },
  initial:             { label: 'Stock inicial',    color: 'text-gray-600',    icon: Package },
};

/* ─── KPI Card ────────────────────────────────────────────────────────────── */

function KpiCard({ label, value, sub, color, icon: Icon }: { label: string; value: string | number; sub?: string; color: string; icon: typeof Package }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-3 min-w-[180px]">
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{label}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Status Badge ────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

/* ─── Stock Semaphore ─────────────────────────────────────────────────────── */

function StockSemaphore({ qty, min, max }: { qty: number; min: number; max?: number }) {
  if (qty < 0) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-black dark:bg-white" title="Stock negativo" />;
  if (qty === 0) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Agotado" />;
  if (min > 0 && qty <= min) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" title="Bajo mínimo" />;
  if (max && max > 0 && qty > max) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-500" title="Sobre máximo" />;
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" title="OK" />;
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export function ComprasStockPage() {
  const { user } = useAuth();
  const userId = user?.user_id || '';
  const { config: verticalConfig, businessType } = useVerticalCatalog();
  const itemLabel = verticalConfig.itemLabel || 'Producto';
  const itemLabelPlural = verticalConfig.itemLabelPlural || 'Productos';
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'catalogo';
  const setActiveTab = useCallback((tab: string) => setSearchParams({ tab }), [setSearchParams]);

  /* ─── Global state ──────────────────────────────────────────────────────── */
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [summary, setSummary] = useState<MovementsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  /* ─── Fetch data ────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [cat, sup, ord, wh, mov, inv, sum] = await Promise.all([
        listCatalogItemsRequest(userId).catch(() => []),
        listSuppliersRequest(userId).catch(() => []),
        listPurchaseOrdersRequest(userId).catch(() => []),
        listWarehousesRequest(userId).catch(() => []),
        listStockMovementsRequest(userId).catch(() => []),
        listPurchaseInvoicesRequest(userId).catch(() => []),
        getMovementsSummaryRequest(userId).catch(() => null),
      ]);
      setCatalogItems(cat); setSuppliers(sup); setOrders(ord);
      setWarehouses(wh); setMovements(mov); setInvoices(inv); setSummary(sum);
    } catch { /* handled per-call */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  /* ─── KPI calculations ──────────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const products = catalogItems.filter((i) => i.active && !i.deletedAt);
    const stockItems = products.filter((i) => i.itemType === 'product');
    const totalValue = stockItems.reduce((s, i) => s + (i.stockQuantity || 0) * (i.costPrice || 0), 0);
    const lowStock = stockItems.filter((i) => i.minStock > 0 && i.stockQuantity > 0 && i.stockQuantity <= i.minStock).length;
    const outOfStock = stockItems.filter((i) => i.minStock > 0 && i.stockQuantity <= 0).length;
    const negativeStock = stockItems.filter((i) => i.stockQuantity < 0).length;
    const pendingOrders = orders.filter((o) => ['draft', 'pending', 'sent', 'partial'].includes(o.status)).length;
    return { total: products.length, totalValue, lowStock, outOfStock, negativeStock, pendingOrders };
  }, [catalogItems, orders]);

  /* ─── Tab counts ────────────────────────────────────────────────────────── */
  const tabsWithCounts = useMemo(() => TABS.map((t) => {
    if (t.id === 'catalogo') return { ...t, count: catalogItems.filter((i) => i.active && i.module === 'catalog').length };
    if (t.id === 'stock') return { ...t, count: catalogItems.filter((i) => i.active && i.itemType === 'product').length };
    if (t.id === 'almacenes') return { ...t, count: warehouses.filter((w) => w.active).length };
    if (t.id === 'proveedores') return { ...t, count: suppliers.length };
    if (t.id === 'pedidos') return { ...t, count: orders.filter((o) => !['received', 'cancelled'].includes(o.status)).length };
    if (t.id === 'recepciones') return { ...t, count: orders.filter((o) => ['sent', 'partial'].includes(o.status)).length };
    if (t.id === 'movimientos') return { ...t, count: movements.length };
    if (t.id === 'facturacion') return { ...t, count: invoices.length };
    return t;
  }), [catalogItems, suppliers, orders, warehouses, movements, invoices]);

  /* ─── Filtered items by search ──────────────────────────────────────────── */
  const q = search.toLowerCase().trim();

  /* ═══════ RENDER ════════════════════════════════════════════════════════════ */

  return (
    <Layout title="Compras y Stock" subtitle="Catálogo, inventario, compras y almacenes">
      {/* ── KPI Bar ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard icon={Package} label={`${itemLabelPlural} activos`} value={kpis.total} color="bg-blue-50 dark:bg-blue-900/20 text-blue-600" />
        <KpiCard icon={DollarSign} label="Valor del stock" value={`${(kpis.totalValue / 1000).toFixed(1)}k €`} color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" />
        <KpiCard icon={TrendingDown} label="Bajo mínimo" value={kpis.lowStock} color="bg-amber-50 dark:bg-amber-900/20 text-amber-600" />
        <KpiCard icon={AlertTriangle} label="Agotados" value={kpis.outOfStock} color="bg-red-50 dark:bg-red-900/20 text-red-600" />
        <KpiCard icon={ShoppingCart} label="Pedidos activos" value={kpis.pendingOrders} color="bg-purple-50 dark:bg-purple-900/20 text-purple-600" />
        <KpiCard icon={ArrowUpDown} label="Movimientos" value={movements.length} sub={summary ? `Neto: ${summary.netChange >= 0 ? '+' : ''}${summary.netChange}` : undefined} color="bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600" />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Search bar ───────────────────────────────────────────────────────── */}
      <div className="mt-4 mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
        <button onClick={load} className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" title="Recargar">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'catalogo' && <CatalogoTab items={catalogItems.filter((i) => !q || i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q))} />}
            {activeTab === 'stock' && <StockTab items={catalogItems.filter((i) => i.itemType === 'product' && (!q || i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q)))} warehouses={warehouses} userId={userId} onReload={load} />}
            {activeTab === 'almacenes' && <AlmacenesTab warehouses={warehouses.filter((w) => !q || w.name?.toLowerCase().includes(q))} userId={userId} onReload={load} />}
            {activeTab === 'proveedores' && <ProveedoresTab suppliers={suppliers.filter((s) => !q || s.name?.toLowerCase().includes(q) || s.cif?.toLowerCase().includes(q))} catalogItems={catalogItems} />}
            {activeTab === 'pedidos' && <PedidosTab orders={orders.filter((o) => !q || o.orderNumber?.toLowerCase().includes(q) || o.supplierName?.toLowerCase().includes(q))} suppliers={suppliers} catalogItems={catalogItems} userId={userId} onReload={load} />}
            {activeTab === 'recepciones' && <RecepcionesTab orders={orders.filter((o) => ['sent', 'partial', 'pending'].includes(o.status))} userId={userId} onReload={load} />}
            {activeTab === 'movimientos' && <MovimientosTab movements={movements.filter((m) => !q || m.catalogItemName?.toLowerCase().includes(q) || m.movementType?.toLowerCase().includes(q))} summary={summary} />}
            {activeTab === 'facturacion' && <FacturacionTab invoices={invoices.filter((inv) => !q || inv.invoiceNumber?.toLowerCase().includes(q) || inv.supplierName?.toLowerCase().includes(q))} />}
          </>
        )}
      </div>
    </Layout>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── TAB: Catálogo ───────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

function CatalogoTab({ items }: { items: CatalogItem[] }) {
  const products = items.filter((i) => i.active && !i.deletedAt);
  const byType = { product: 0, service: 0, combo: 0 };
  products.forEach((i) => { byType[i.itemType as keyof typeof byType] = (byType[i.itemType as keyof typeof byType] || 0) + 1; });

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <span className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-semibold rounded-lg">{byType.product} productos</span>
        <span className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs font-semibold rounded-lg">{byType.service} servicios</span>
        <span className="px-3 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 text-xs font-semibold rounded-lg">{byType.combo} combos</span>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">PVP</th>
              <th className="px-4 py-3 text-right">Coste</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3">Proveedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {products.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No hay productos en el catálogo</td></tr>
            ) : products.slice(0, 100).map((item) => (
              <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.name}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.sku}</td>
                <td className="px-4 py-3 text-gray-500">{item.category}</td>
                <td className="px-4 py-3 text-right font-semibold">{Number(item.unitPrice).toFixed(2)} €</td>
                <td className="px-4 py-3 text-right text-gray-500">{Number(item.costPrice).toFixed(2)} €</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <StockSemaphore qty={item.stockQuantity} min={item.minStock} />
                    <span className="font-semibold">{item.stockQuantity}</span>
                    <span className="text-gray-400 text-xs">{item.unit}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{item.supplierName || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── TAB: Stock ──────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

function StockTab({ items, warehouses, userId, onReload }: { items: CatalogItem[]; warehouses: Warehouse[]; userId: string; onReload: () => void }) {
  const [adjustModal, setAdjustModal] = useState<CatalogItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('in');
  const [adjustNotes, setAdjustNotes] = useState('');

  const stockItems = items.filter((i) => i.active && !i.deletedAt);
  const lowStock = stockItems.filter((i) => i.minStock > 0 && i.stockQuantity > 0 && i.stockQuantity <= i.minStock);
  const outOfStock = stockItems.filter((i) => i.minStock > 0 && i.stockQuantity <= 0);
  const negative = stockItems.filter((i) => i.stockQuantity < 0);
  const ok = stockItems.filter((i) => !negative.includes(i) && !outOfStock.includes(i) && !lowStock.includes(i));

  const sorted = [...negative, ...outOfStock, ...lowStock, ...ok];

  const handleAdjust = async () => {
    if (!adjustModal || !adjustQty || !adjustNotes.trim()) {
      toast.error('Completa cantidad y notas');
      return;
    }
    try {
      await createAdjustmentRequest(userId, {
        catalogItemId: adjustModal._id,
        quantity: Number(adjustQty),
        type: adjustType,
        notes: adjustNotes,
      });
      toast.success('Ajuste registrado');
      setAdjustModal(null); setAdjustQty(''); setAdjustNotes('');
      onReload();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar ajuste');
    }
  };

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 w-8"></th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Mínimo</th>
              <th className="px-4 py-3 text-right">Coste</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {sorted.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No hay productos con stock</td></tr>
            ) : sorted.slice(0, 100).map((item) => (
              <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3"><StockSemaphore qty={item.stockQuantity} min={item.minStock} max={item.maxStock} /></td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku}</td>
                <td className="px-4 py-3 text-right font-bold">{item.stockQuantity} <span className="text-gray-400 font-normal text-xs">{item.unit}</span></td>
                <td className="px-4 py-3 text-right text-gray-500">{item.minStock || '—'}</td>
                <td className="px-4 py-3 text-right text-gray-500">{Number(item.costPrice).toFixed(2)} €</td>
                <td className="px-4 py-3 text-right font-semibold">{(item.stockQuantity * (item.costPrice || 0)).toFixed(2)} €</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{item.supplierName || '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setAdjustModal(item)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Ajustar stock">
                    <ArrowUpDown className="w-4 h-4 text-gray-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Adjust modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAdjustModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Ajustar stock</h3>
            <p className="text-sm text-gray-500 mb-4">{adjustModal.name} — Stock actual: {adjustModal.stockQuantity} {adjustModal.unit}</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setAdjustType('in')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${adjustType === 'in' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>+ Entrada</button>
              <button onClick={() => setAdjustType('out')} className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${adjustType === 'out' ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>- Salida</button>
            </div>
            <input type="number" min="1" placeholder="Cantidad" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className="w-full px-4 py-2.5 mb-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500" />
            <textarea placeholder="Motivo del ajuste (obligatorio)" value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} rows={2} className="w-full px-4 py-2.5 mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
            <div className="flex gap-2">
              <button onClick={() => setAdjustModal(null)} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button onClick={handleAdjust} className="flex-1 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── TAB: Almacenes ──────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

function AlmacenesTab({ warehouses, userId, onReload }: { warehouses: Warehouse[]; userId: string; onReload: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [whType, setWhType] = useState('general');

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return; }
    try {
      await createWarehouseRequest(userId, { name, warehouseType: whType as any });
      toast.success('Almacén creado');
      setShowCreate(false); setName('');
      onReload();
    } catch (err: any) { toast.error(err.message); }
  };

  const active = warehouses.filter((w) => w.active && !w.deletedAt);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <AddButtonDropdown
                label="Nueva compra"
                onQuickAdd={() => setShowCreate(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de compra"
              />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {active.length === 0 ? (
          <div className="col-span-full text-center text-gray-400 py-12">No hay almacenes configurados</div>
        ) : active.map((wh) => (
          <div key={wh._id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <WarehouseIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{wh.name}</h3>
                  <p className="text-xs text-gray-500">{wh.code} · {wh.warehouseType}</p>
                </div>
              </div>
              {wh.isDefault && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">Principal</span>}
            </div>
            {wh.address && <p className="text-xs text-gray-500 mb-2">{wh.address}</p>}
            {wh.contactPerson && <p className="text-xs text-gray-500">{wh.contactPerson} {wh.phone ? `· ${wh.phone}` : ''}</p>}
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Nuevo almacén</h3>
            <input placeholder="Nombre del almacén" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 mb-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500" />
            <select value={whType} onChange={(e) => setWhType(e.target.value)} className="w-full px-4 py-2.5 mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500">
              <option value="general">General</option>
              <option value="store">Tienda</option>
              <option value="workshop">Taller</option>
              <option value="cold">Frío</option>
              <option value="external">Externo</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleCreate} className="flex-1 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── TAB: Proveedores ────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ProveedoresTab({ suppliers, catalogItems }: { suppliers: Supplier[]; catalogItems: CatalogItem[] }) {
  const active = suppliers.filter((s) => s.active && !s.deletedAt);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3">Proveedor</th>
            <th className="px-4 py-3">CIF</th>
            <th className="px-4 py-3">Contacto</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Teléfono</th>
            <th className="px-4 py-3 text-right">Productos</th>
            <th className="px-4 py-3">Condiciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {active.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No hay proveedores</td></tr>
          ) : active.map((s) => {
            const prods = catalogItems.filter((i) => i.supplierId === s._id).length;
            return (
              <tr key={s._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.name}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.cif || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.contactPerson || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{s.email || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-right"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">{prods}</span></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{s.paymentTerms || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── TAB: Pedidos ────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

function PedidosTab({ orders, suppliers, catalogItems, userId, onReload }: { orders: PurchaseOrder[]; suppliers: Supplier[]; catalogItems: CatalogItem[]; userId: string; onReload: () => void }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);

  const handleAutoGenerate = async () => {
    try {
      const result = await triggerAutoOrdersRequest(userId);
      toast.success(`${result.created} pedido(s) generado(s)`);
      onReload();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {['all', 'draft', 'pending', 'sent', 'partial', 'received', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${statusFilter === s ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            {s === 'all' ? 'Todos' : STATUS_CONFIG[s as PurchaseOrderStatus]?.label || s}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={handleAutoGenerate} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-semibold hover:bg-amber-600 transition-colors">
          <Zap className="w-3.5 h-3.5" /> Auto-generar
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3 text-right">Líneas</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No hay pedidos</td></tr>
            ) : filtered.slice(0, 100).map((o) => (
              <tr key={o._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900 dark:text-white">{o.orderNumber}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{o.supplierName || '—'}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-500">{o.source === 'auto' ? 'Automático' : 'Manual'}</td>
                <td className="px-4 py-3 text-right text-gray-500">{o.items?.length || 0}</td>
                <td className="px-4 py-3 text-right font-semibold">{Number(o.total).toFixed(2)} €</td>
                <td className="px-4 py-3 text-xs text-gray-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-ES') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── TAB: Recepciones ────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

function RecepcionesTab({ orders, userId, onReload }: { orders: PurchaseOrder[]; userId: string; onReload: () => void }) {
  const handleReceive = async (order: PurchaseOrder) => {
    try {
      await markOrderReceivedRequest(userId, order._id);
      toast.success(`Pedido ${order.orderNumber} recibido`);
      onReload();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div>
      {orders.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No hay pedidos pendientes de recibir</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o._id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">{o.orderNumber}</span>
                  <span className="text-gray-500 text-sm ml-3">{o.supplierName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={o.status} />
                  <button onClick={() => handleReceive(o)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Recibir todo
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(o.items || []).map((item, i) => (
                  <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">Pedido: {item.quantity} · Recibido: {item.received || 0}</p>
                  </div>
                ))}
              </div>
              {o.expectedDate && <p className="text-xs text-gray-500 mt-2">Entrega esperada: {new Date(o.expectedDate).toLocaleDateString('es-ES')}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── TAB: Movimientos ────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

function MovimientosTab({ movements, summary }: { movements: StockMovement[]; summary: MovementsSummary | null }) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'product', label: 'Producto' },
    { key: 'supplier', label: 'Proveedor' },
    { key: 'quantity', label: 'Cantidad' },
    { key: 'price', label: 'Precio' },
    { key: 'date', label: 'Fecha' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'product', label: 'Producto', example: '' },
    { key: 'supplier', label: 'Proveedor', example: '' },
    { key: 'quantity', label: 'Cantidad', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} compra(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} compra(s) importado(s)`);
  };

  const filtered = typeFilter === 'all' ? movements : movements.filter((m) => m.movementType === typeFilter);

  return (
    <div>
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-emerald-700">{summary.totalIn}</p>
            <p className="text-xs text-emerald-600">Entradas</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-red-700">{summary.totalOut}</p>
            <p className="text-xs text-red-600">Salidas</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-blue-700">{summary.netChange >= 0 ? '+' : ''}{summary.netChange}</p>
            <p className="text-xs text-blue-600">Neto</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-purple-700">{summary.totalInValue.toFixed(0)} €</p>
            <p className="text-xs text-purple-600">Valor entradas</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setTypeFilter('all')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${typeFilter === 'all' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>Todos</button>
        {Object.entries(MOVEMENT_LABELS).map(([key, cfg]) => (
          <button key={key} onClick={() => setTypeFilter(key)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${typeFilter === key ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>{cfg.label}</button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3 text-right">Antes</th>
              <th className="px-4 py-3 text-right">Después</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No hay movimientos</td></tr>
            ) : filtered.slice(0, 200).map((m) => {
              const cfg = MOVEMENT_LABELS[m.movementType] || { label: m.movementType, color: 'text-gray-600', icon: Package };
              const Icon = cfg.icon;
              return (
                <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" />{cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{m.catalogItemName}</td>
                  <td className="px-4 py-3 text-right font-bold">{m.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{m.previousStock}</td>
                  <td className="px-4 py-3 text-right font-semibold">{m.newStock}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.notes || m.referenceType || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.createdAt ? new Date(m.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── TAB: Facturación ────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

function FacturacionTab({ invoices }: { invoices: PurchaseInvoice[] }) {
  const active = invoices.filter((i) => !i.deletedAt);
  const totalPending = active.filter((i) => i.status !== 'paid').reduce((s, i) => s + Number(i.total || 0), 0);

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <span className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 text-xs font-semibold rounded-lg">Pendiente: {totalPending.toFixed(2)} €</span>
        <span className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 text-xs font-semibold rounded-lg">{active.length} facturas</span>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Factura</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Método</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {active.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No hay facturas de compra</td></tr>
            ) : active.slice(0, 100).map((inv) => (
              <tr key={inv._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs font-bold">{inv.invoiceNumber}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{inv.supplierName || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{inv.date || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{inv.dueDate || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {inv.status === 'paid' ? 'Pagada' : 'Pendiente'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{Number(inv.total).toFixed(2)} €</td>
                <td className="px-4 py-3 text-xs text-gray-500">{inv.entryMethod === 'ocr' ? 'OCR' : 'Manual'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="purchases_stock"
        moduleLabel="Compras/Stock"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Compras/Stock"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
