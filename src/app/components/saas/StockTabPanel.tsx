import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, ClipboardCheck, PackagePlus, AlertTriangle, Loader2, MapPin,
  Boxes, Plus, LayoutDashboard, History, ChevronDown, ChevronRight, User, Calendar,
  ArrowRight, ShoppingCart,
} from 'lucide-react';
import { DELIVERY_ACTIVE_STORE_CHANGED } from '../../lib/deliveryOpsPdvSelection';
import type { CatalogItem, StockCategory } from '../../lib/deliveryApi';
import { bulkUpdateCatalogStockRequest, createCatalogItemRequest } from '../../lib/deliveryApi';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import type { Warehouse } from '../../lib/warehouseApi';
import {
  listStockCountsRequest,
  type StockCount,
} from '../../lib/stockCountApi';
import { filterStockInventoryItems } from '../../lib/stockInventoryScope';
import { StockRevisionPanel } from './StockRevisionPanel';
import { StockPurchaseListPreview } from './StockPurchaseListPreview';
import { SaasTabWorkspace } from './SaasTabWorkspace';
import {
  formatStockDate,
  formatStockTime,
  countDiscrepancies,
  groupCountsByDay,
} from '../../lib/stockRevisionUtils';

type StockSection = 'summary' | 'inventory' | 'operations' | 'history';
type OperationsMode = 'pending' | 'revision';
type InventoryFilter = 'all' | 'ok' | 'low' | 'out' | 'negative';

const STOCK_CATEGORY_LABELS: Record<StockCategory, string> = {
  ingredient: 'Ingrediente',
  beverage: 'Bebida',
  packaging: 'Envase',
  cleaning: 'Limpieza',
  consumable: 'Consumible',
  finished_product: 'Producto terminado',
  other: 'Otro',
};

const DEFAULT_UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'L', label: 'L' },
  { value: 'ml', label: 'ml' },
  { value: 'ud', label: 'ud' },
];

function stockStatus(item: CatalogItem): InventoryFilter | 'ok' {
  const qty = Number(item.stockQuantity || 0);
  const min = Number(item.minStock || 0);
  if (qty < 0) return 'negative';
  if (qty === 0) return 'out';
  if (min > 0 && qty <= min) return 'low';
  return 'ok';
}

function StockStatusBadge({ item }: { item: CatalogItem }) {
  const status = stockStatus(item);
  const cfg = {
    ok: { label: 'OK', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    low: { label: 'Bajo mínimo', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    out: { label: 'Sin stock', className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    negative: { label: 'Negativo', className: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold ${cfg.className}`}>
      <StockSemaphore qty={Number(item.stockQuantity || 0)} min={Number(item.minStock || 0)} />
      {cfg.label}
    </span>
  );
}

function AddIngredientModal({
  isOpen,
  onClose,
  onCreated,
  userId,
  businessType,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  userId: string;
  businessType: string;
}) {
  const { config: verticalConfig } = useVerticalCatalog();
  const unitOptions = verticalConfig.units.length > 0 ? verticalConfig.units : DEFAULT_UNIT_OPTIONS;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    stockCategory: 'ingredient' as StockCategory,
    unit: unitOptions[0]?.value || 'kg',
    minStock: '',
    costPrice: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      name: '',
      stockCategory: 'ingredient',
      unit: unitOptions[0]?.value || 'kg',
      minStock: '',
      costPrice: '',
    });
  }, [isOpen, unitOptions]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSubmitting(true);
    try {
      await createCatalogItemRequest(userId, {
        name: form.name.trim(),
        module: 'stock',
        itemType: 'product',
        vertical: businessType,
        stockCategory: form.stockCategory,
        isStockItem: true,
        unit: form.unit,
        minStock: Number(form.minStock.replace(',', '.')) || 0,
        costPrice: Number(form.costPrice.replace(',', '.')) || 0,
        stockQuantity: 0,
        active: true,
        available: true,
        webVisible: false,
      });
      toast.success(`"${form.name.trim()}" añadido al inventario`);
      onClose();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el ingrediente');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Añadir ingrediente</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Crea un artículo de almacén. Aparecerá en pendientes de cargar hasta que indiques la cantidad inicial.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nombre *</label>
            <input
              autoFocus
              placeholder="Ej: Queso mozzarella, Tomate triturado…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo</label>
              <select
                value={form.stockCategory}
                onChange={(e) => setForm((f) => ({ ...f, stockCategory: e.target.value as StockCategory }))}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500"
              >
                {(['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable', 'other'] as StockCategory[]).map((cat) => (
                  <option key={cat} value={cat}>{STOCK_CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Unidad</label>
              <select
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500"
              >
                {unitOptions.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Stock mínimo</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={form.minStock}
                onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Coste unitario (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex-1 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}

interface StockTabPanelProps {
  items: CatalogItem[];
  warehouses: Warehouse[];
  userId: string;
  searchQuery: string;
  itemLabelPlural: string;
  storeLabel: string;
  warehouseId: string;
  businessType: string;
  onReload: () => void;
  catalogLoading?: boolean;
}

function StockSemaphore({ qty, min }: { qty: number; min: number }) {
  if (qty < 0) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-black dark:bg-white" title="Stock negativo" />;
  if (qty === 0) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Sin stock" />;
  if (min > 0 && qty <= min) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" title="Bajo mínimo" />;
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" title="OK" />;
}

const SECTION_TABS: { id: StockSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'summary', label: 'Resumen', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventario', icon: Boxes },
  { id: 'operations', label: 'Operaciones', icon: ClipboardCheck },
  { id: 'history', label: 'Historial', icon: History },
];

export function StockTabPanel({
  items,
  warehouses,
  userId,
  searchQuery,
  itemLabelPlural,
  storeLabel,
  warehouseId: storeWarehouseId,
  businessType,
  onReload,
  catalogLoading = false,
}: StockTabPanelProps) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const actorUserId = String(user?.user_id || user?.id || '').trim();

  const [section, setSection] = useState<StockSection>('summary');
  const [operationsMode, setOperationsMode] = useState<OperationsMode>('pending');
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter | 'all'>('all');
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [savingPending, setSavingPending] = useState(false);

  const [allCounts, setAllCounts] = useState<StockCount[]>([]);
  const [activeCount, setActiveCount] = useState<StockCount | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [purchaseListHistoryId, setPurchaseListHistoryId] = useState<string | null>(null);

  const q = searchQuery.toLowerCase().trim();

  const teamMembers = useMemo(
    () => (currentBusiness?.members || []).map((m) => ({
      user_id: m.user_id,
      fullName: String(m.fullName || m.email || '').trim(),
      email: m.email,
    })),
    [currentBusiness?.members],
  );

  const resolveUserName = useCallback((uid: string) => {
    if (!uid) return '—';
    const normalized = uid.replace(/^account:/, '');
    const member = teamMembers.find((m) => m.user_id === normalized || m.user_id === uid);
    if (member?.fullName) return member.fullName;
    if (actorUserId && (actorUserId === normalized || actorUserId === uid)) {
      return user?.fullName || 'Tú';
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(normalized)) return 'Miembro del equipo';
    return uid;
  }, [teamMembers, actorUserId, user?.fullName]);

  const matchesWarehouse = useCallback((count: StockCount) => {
    const wh = warehouseId || storeWarehouseId;
    if (!wh) return true;
    return !count.warehouseId || count.warehouseId === wh;
  }, [warehouseId, storeWarehouseId]);

  useEffect(() => {
    if (storeWarehouseId) setWarehouseId(storeWarehouseId);
  }, [storeWarehouseId]);

  const scopedItems = useMemo(() => filterStockInventoryItems(items), [items]);

  const activeProducts = useMemo(
    () => scopedItems.filter((i) => i.active && !i.deletedAt),
    [scopedItems],
  );

  const pendingItems = useMemo(() => {
    return activeProducts
      .filter((i) => Number(i.stockQuantity || 0) === 0)
      .filter((i) => !q || i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
  }, [activeProducts, q]);

  const stockedCount = useMemo(
    () => activeProducts.filter((i) => Number(i.stockQuantity || 0) > 0).length,
    [activeProducts],
  );

  const defaultWarehouse = useMemo(() => {
    const active = warehouses.filter((w) => w.active);
    if (warehouseId) return active.find((w) => w._id === warehouseId) || null;
    return active.find((w) => w.isDefault) || active[0] || null;
  }, [warehouses, warehouseId]);

  useEffect(() => {
    if (!warehouseId && defaultWarehouse) {
      setWarehouseId(defaultWarehouse._id);
    }
  }, [warehouseId, defaultWarehouse]);

  const loadStockCounts = useCallback(async () => {
    if (!userId) return;
    setLoadingCount(true);
    try {
      const counts = await listStockCountsRequest(userId);
      setAllCounts(counts);
      const wh = warehouseId || storeWarehouseId;
      const open = counts.find(
        (c) =>
          (c.status === 'draft' || c.status === 'in_progress') &&
          (!wh || !c.warehouseId || c.warehouseId === wh),
      );
      setActiveCount(open || null);
    } catch {
      setAllCounts([]);
      setActiveCount(null);
    } finally {
      setLoadingCount(false);
    }
  }, [userId, warehouseId, storeWarehouseId]);

  useEffect(() => {
    void loadStockCounts();
  }, [loadStockCounts]);

  useEffect(() => {
    const onStoreChange = () => {
      setActiveCount(null);
      void loadStockCounts();
      onReload();
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStoreChange);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStoreChange);
  }, [onReload, loadStockCounts]);

  useEffect(() => {
    setActiveCount(null);
    setQuantities({});
  }, [storeWarehouseId, storeLabel]);

  useEffect(() => {
    if (activeCount) setOperationsMode('revision');
    else if (pendingItems.length > 0) setOperationsMode('pending');
  }, [activeCount, pendingItems.length]);

  const wh = warehouses.find((w) => w._id === warehouseId) || defaultWarehouse;

  const handleSavePending = async () => {
    const entries = pendingItems
      .map((item) => ({
        sku: item.sku,
        name: item.name,
        quantity: quantities[item._id]?.trim() ?? '',
        unit: item.unit,
      }))
      .filter((e) => e.quantity && Number(e.quantity) > 0);

    if (entries.length === 0) {
      toast.error('Introduce al menos una cantidad');
      return;
    }

    setSavingPending(true);
    try {
      const result = await bulkUpdateCatalogStockRequest(userId, entries);
      if (result.updated > 0) {
        toast.success(`${result.updated} producto(s) con stock cargado`);
        setQuantities({});
        onReload();
        setOperationsMode('revision');
        setSection('operations');
      }
      if (result.notFound > 0) toast.warning(`${result.notFound} fila(s) no encontradas`);
      if (result.errors > 0) toast.error(`${result.errors} fila(s) con error`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar stock');
    } finally {
      setSavingPending(false);
    }
  };

  const reviewedCount = activeCount?.lines.filter((l) => l.countedStock !== null).length ?? 0;
  const totalReviewLines = activeCount?.lines.length ?? 0;
  const progressPct = totalReviewLines > 0 ? Math.round((reviewedCount / totalReviewLines) * 100) : 0;

  const handleRevisionCompleted = () => {
    onReload();
    void loadStockCounts();
    setSection('summary');
  };

  const inventoryStats = useMemo(() => {
    let ok = 0;
    let low = 0;
    let out = 0;
    let negative = 0;
    activeProducts.forEach((item) => {
      const s = stockStatus(item);
      if (s === 'ok') ok += 1;
      else if (s === 'low') low += 1;
      else if (s === 'out') out += 1;
      else if (s === 'negative') negative += 1;
    });
    return { total: activeProducts.length, ok, low, out, negative };
  }, [activeProducts]);

  const inventoryRows = useMemo(() => {
    const sorted = [...activeProducts].sort((a, b) => {
      const rank = (item: CatalogItem) => {
        const s = stockStatus(item);
        if (s === 'negative') return 0;
        if (s === 'out') return 1;
        if (s === 'low') return 2;
        return 3;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
    if (inventoryFilter === 'all') return sorted;
    return sorted.filter((item) => stockStatus(item) === inventoryFilter);
  }, [activeProducts, inventoryFilter]);

  const handleIngredientCreated = () => {
    onReload();
    setOperationsMode('pending');
    setSection('operations');
  };

  const estimatedValue = useMemo(
    () => activeProducts.reduce(
      (sum, item) => sum + Number(item.stockQuantity || 0) * Number(item.costPrice || 0),
      0,
    ),
    [activeProducts],
  );

  const completedCounts = useMemo(
    () => allCounts
      .filter((c) => c.status === 'completed' && matchesWarehouse(c))
      .sort(
        (a, b) =>
          new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime(),
      ),
    [allCounts, matchesWarehouse],
  );

  const lastCompletedCount = completedCounts[0] ?? null;
  const historyByDay = useMemo(() => groupCountsByDay(completedCounts), [completedCounts]);

  const goToOperations = (sub: OperationsMode) => {
    setOperationsMode(sub);
    setSection('operations');
  };

  return (
    <div className="space-y-4">
      {catalogLoading && scopedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p className="text-sm font-medium">Cargando inventario…</p>
        </div>
      ) : (
      <SaasTabWorkspace
        stats={[
          { label: 'artículos', value: inventoryStats.total },
          {
            label: 'alertas',
            value: inventoryStats.low + inventoryStats.out,
            tone: inventoryStats.low + inventoryStats.out > 0 ? 'amber' : 'default',
          },
          { label: 'valor €', value: estimatedValue.toFixed(0) },
        ]}
        banner={
          <span className="inline-flex items-center gap-1.5 text-blue-900 dark:text-blue-100">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            Stock de <strong>{storeLabel}</strong>
            {wh?.name ? ` · ${wh.name}` : ''}
            <span className="text-blue-700/70 dark:text-blue-300/70">(cambia tienda arriba)</span>
          </span>
        }
        toolbar={
          <div className="flex gap-1 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {SECTION_TABS.map(({ id, label, icon: Icon }) => {
              const isActive = section === id;
              const badge =
                id === 'operations' && (pendingItems.length > 0 || activeCount)
                  ? (activeCount ? 'en curso' : pendingItems.length)
                  : id === 'inventory' && (inventoryStats.low + inventoryStats.out > 0)
                    ? inventoryStats.low + inventoryStats.out
                    : null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] touch-manipulation rounded-lg text-xs font-semibold border transition-colors shrink-0 ${
                    isActive
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {badge !== null ? (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-white/20 dark:bg-gray-900/20'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                      }`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        }
      >
      {/* ── Resumen ── */}
      {section === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Artículos', value: String(inventoryStats.total), sub: `${stockedCount} con stock`, color: 'text-gray-900 dark:text-white' },
              { label: 'OK', value: String(inventoryStats.ok), sub: 'dentro de mínimo', color: 'text-emerald-600' },
              { label: 'Alertas', value: String(inventoryStats.low + inventoryStats.out), sub: `${inventoryStats.low} bajo · ${inventoryStats.out} sin stock`, color: inventoryStats.low + inventoryStats.out > 0 ? 'text-amber-600' : 'text-gray-400' },
              { label: 'Valor estimado', value: `${estimatedValue.toFixed(0)} €`, sub: 'coste × cantidad', color: 'text-gray-900 dark:text-white' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Acciones pendientes */}
          {(activeCount || pendingItems.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {activeCount && (
                <button
                  type="button"
                  onClick={() => goToOperations('revision')}
                  className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-left hover:bg-emerald-100/60 transition-colors"
                >
                  <ClipboardCheck className="w-8 h-8 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-100">Revisión en curso</p>
                    <p className="text-sm text-emerald-700/80 dark:text-emerald-300/80 truncate">
                      {reviewedCount}/{totalReviewLines} revisados · {progressPct}%
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-emerald-600 shrink-0" />
                </button>
              )}
              {pendingItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => goToOperations('pending')}
                  className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-left hover:bg-amber-100/60 transition-colors"
                >
                  <PackagePlus className="w-8 h-8 text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-amber-900 dark:text-amber-100">Pendientes de cargar</p>
                    <p className="text-sm text-amber-700/80 dark:text-amber-300/80">
                      {pendingItems.length} artículo{pendingItems.length === 1 ? '' : 's'} sin stock inicial
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-600 shrink-0" />
                </button>
              )}
            </div>
          )}

          {/* Última revisión */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              Última revisión
            </h3>
            {lastCompletedCount ? (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{lastCompletedCount.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatStockDate(lastCompletedCount.completedAt)} · {formatStockTime(lastCompletedCount.completedAt)}
                  </p>
                  <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-2">
                    <User className="w-3.5 h-3.5" />
                    Cerrada por <strong>{resolveUserName(lastCompletedCount.completedBy || lastCompletedCount.startedBy)}</strong>
                  </p>
                </div>
                <div className="text-right">
                  {countDiscrepancies(lastCompletedCount) === 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
                      <CheckCircle2 className="w-4 h-4" /> Todo cuadró
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm font-semibold">
                      <AlertTriangle className="w-4 h-4" />
                      {countDiscrepancies(lastCompletedCount)} discrepancia{countDiscrepancies(lastCompletedCount) === 1 ? '' : 's'}
                    </span>
                  )}
                  {lastCompletedCount.totalDifferenceValue !== 0 && (
                    <p className="text-xs text-gray-400 mt-2 tabular-nums">
                      Dif. valor: {lastCompletedCount.totalDifferenceValue > 0 ? '+' : ''}{lastCompletedCount.totalDifferenceValue.toFixed(2)} €
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Aún no hay revisiones completadas en esta tienda.</p>
            )}
            {completedCounts.length > 0 && (
              <button
                type="button"
                onClick={() => setSection('history')}
                className="mt-4 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1"
              >
                Ver historial completo
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {lastCompletedCount && (
            <StockPurchaseListPreview
              userId={userId}
              countId={lastCompletedCount._id}
              countName={lastCompletedCount.name}
              compact
            />
          )}

          {/* Accesos rápidos */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSection('inventory')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Boxes className="w-4 h-4" /> Ver inventario
            </button>
            {!activeCount && stockedCount > 0 && (
              <button
                type="button"
                onClick={() => { setSection('operations'); setOperationsMode('revision'); }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700"
              >
                <ClipboardCheck className="w-4 h-4" />
                Iniciar revisión
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Operaciones ── */}
      {section === 'operations' && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <button
              type="button"
              onClick={() => setOperationsMode('pending')}
              className={`inline-flex items-center gap-2 px-4 py-3 min-h-[44px] touch-manipulation rounded-xl text-sm font-semibold border shrink-0 transition-colors ${
                operationsMode === 'pending'
                  ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <PackagePlus className="w-4 h-4" />
              Pendientes de cargar
              {pendingItems.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-xs font-bold">{pendingItems.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setOperationsMode('revision')}
              className={`inline-flex items-center gap-2 px-4 py-3 min-h-[44px] touch-manipulation rounded-xl text-sm font-semibold border shrink-0 transition-colors ${
                operationsMode === 'revision'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              Revisión de stock
              {activeCount && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-xs font-bold">en curso</span>
              )}
            </button>
          </div>

          {operationsMode === 'pending' && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Ingredientes, bebidas, envases y suministros sin stock cargado. Los platos de carta no van aquí.
              </p>
              {pendingItems.length === 0 ? (
                <div className="text-center py-16 text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
                  <p className="font-medium">Todo el inventario tiene stock cargado</p>
                  <button type="button" onClick={() => setOperationsMode('revision')} className="mt-4 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold">
                    Ir a revisión
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 uppercase tracking-wider">
                          <th className="px-4 py-3">Producto</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Unidad</th>
                          <th className="px-4 py-3 text-right w-36">Cantidad inicial</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {pendingItems.map((item) => (
                          <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.name}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku || '—'}</td>
                            <td className="px-4 py-3 text-gray-500">{item.unit || 'ud'}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={quantities[item._id] ?? ''}
                                onChange={(e) => setQuantities((prev) => ({ ...prev, [item._id]: e.target.value }))}
                                className="w-full px-3 py-2 text-right bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end mt-4">
                    <button type="button" onClick={handleSavePending} disabled={savingPending} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold disabled:opacity-60">
                      {savingPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
                      Guardar stock inicial
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {operationsMode === 'revision' && (
            <StockRevisionPanel
              userId={userId}
              storeLabel={storeLabel}
              storeWarehouseId={warehouseId || storeWarehouseId}
              warehouses={warehouses}
              stockedCount={stockedCount}
              role="manager"
              controlledActiveCount={activeCount}
              skipCountsFetch
              onRequestRefresh={loadStockCounts}
              onActiveCountChange={setActiveCount}
              onRevisionCompleted={handleRevisionCompleted}
            />
          )}
        </div>
      )}

      {/* ── Historial ── */}
      {section === 'history' && (
        <div className="space-y-4">
          {loadingCount && completedCounts.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : completedCounts.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
              <History className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-600 dark:text-gray-300">Sin revisiones completadas</p>
              <p className="text-sm text-gray-400 mt-2">Cuando cierres una revisión, aparecerá aquí con quién la hizo.</p>
            </div>
          ) : (
            historyByDay.map(({ dayKey, dayLabel, counts }) => (
              <div key={dayKey}>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  {dayLabel}
                </h3>
                <div className="space-y-2">
                  {counts.map((count) => {
                    const discrepancies = countDiscrepancies(count);
                    const isExpanded = expandedHistoryId === count._id;
                    const diffLines = count.lines.filter((l) => l.countedStock !== null && l.difference !== 0);
                    return (
                      <div key={count._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(isExpanded ? null : count._id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white truncate">{count.name}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1"><User className="w-3 h-3" />{resolveUserName(count.completedBy || count.startedBy)}</span>
                              <span>{formatStockTime(count.completedAt)}</span>
                              <span>{count.lines.length} productos</span>
                            </p>
                          </div>
                          {discrepancies === 0 ? (
                            <span className="shrink-0 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">OK</span>
                          ) : (
                            <span className="shrink-0 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                              {discrepancies} dif.
                            </span>
                          )}
                        </button>
                        {isExpanded && (
                          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
                            {diffLines.length === 0 ? (
                              <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" /> Todos los productos cuadraron
                              </p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-gray-400 uppercase">
                                    <th className="py-2 text-left">Producto</th>
                                    <th className="py-2 text-right">Sistema</th>
                                    <th className="py-2 text-right">Contado</th>
                                    <th className="py-2 text-right">Dif.</th>
                                    <th className="py-2 text-left">Contado por</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                  {diffLines.map((line, idx) => (
                                    <tr key={`${line.catalogItemId}-${idx}`}>
                                      <td className="py-2 font-medium">{line.catalogItemName}</td>
                                      <td className="py-2 text-right tabular-nums">{line.theoreticalStock} {line.unit}</td>
                                      <td className="py-2 text-right tabular-nums">{line.countedStock} {line.unit}</td>
                                      <td className={`py-2 text-right font-bold tabular-nums ${(line.difference ?? 0) < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                        {(line.difference ?? 0) > 0 ? '+' : ''}{line.difference}
                                      </td>
                                      <td className="py-2 text-xs text-gray-500">{line.countedBy ? resolveUserName(line.countedBy) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {count.totalDifferenceValue !== 0 && (
                              <p className="text-xs text-gray-400 mt-3 tabular-nums">
                                Impacto en valor: {count.totalDifferenceValue > 0 ? '+' : ''}{count.totalDifferenceValue.toFixed(2)} €
                              </p>
                            )}
                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                              <button
                                type="button"
                                onClick={() => setPurchaseListHistoryId(
                                  purchaseListHistoryId === count._id ? null : count._id,
                                )}
                                className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                              >
                                <ShoppingCart className="w-3.5 h-3.5" />
                                {purchaseListHistoryId === count._id ? 'Ocultar lista de compra' : 'Ver lista de compra sugerida'}
                              </button>
                              {purchaseListHistoryId === count._id && (
                                <div className="mt-3">
                                  <StockPurchaseListPreview
                                    userId={userId}
                                    countId={count._id}
                                    countName={count.name}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Inventario ── */}
      {section === 'inventory' && (
        <section>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Boxes className="w-5 h-5 text-gray-500" />
                Ingredientes y suministros
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Vista general del almacén · {inventoryStats.total} artículo{inventoryStats.total === 1 ? '' : 's'}
              </p>
            </div>
            <button type="button" onClick={() => setShowAddIngredient(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" /> Añadir ingrediente
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { id: 'all' as const, label: 'Todos', count: inventoryStats.total },
              { id: 'ok' as const, label: 'OK', count: inventoryStats.ok },
              { id: 'low' as const, label: 'Bajo mínimo', count: inventoryStats.low },
              { id: 'out' as const, label: 'Sin stock', count: inventoryStats.out },
              ...(inventoryStats.negative > 0 ? [{ id: 'negative' as const, label: 'Negativo', count: inventoryStats.negative }] : []),
            ].map((chip) => (
              <button key={chip.id} type="button" onClick={() => setInventoryFilter(chip.id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${inventoryFilter === chip.id ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                {chip.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${inventoryFilter === chip.id ? 'bg-white/20 dark:bg-gray-900/20' : 'bg-gray-100 dark:bg-gray-700'}`}>{chip.count}</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[640px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Mínimo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {inventoryRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      {activeProducts.length === 0 ? 'No hay ingredientes en esta tienda. Pulsa «Añadir ingrediente» para empezar.' : 'Ningún artículo coincide con este filtro.'}
                    </td>
                  </tr>
                ) : inventoryRows.map((item) => {
                  const qty = Number(item.stockQuantity || 0);
                  const min = Number(item.minStock || 0);
                  const isUnloaded = qty === 0;
                  const category = item.stockCategory && STOCK_CATEGORY_LABELS[item.stockCategory] ? STOCK_CATEGORY_LABELS[item.stockCategory] : item.category || '—';
                  return (
                    <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{category}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <StockSemaphore qty={qty} min={min} />
                          <span className="font-semibold">{qty}</span>
                          <span className="text-gray-400 text-xs">{item.unit || 'ud'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{min > 0 ? `${min} ${item.unit || 'ud'}` : '—'}</td>
                      <td className="px-4 py-3"><StockStatusBadge item={item} /></td>
                      <td className="px-4 py-3 text-right">
                        {isUnloaded && (
                          <button type="button" onClick={() => goToOperations('pending')} className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline">Cargar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        </section>
      )}

      <AddIngredientModal
        isOpen={showAddIngredient}
        onClose={() => setShowAddIngredient(false)}
        onCreated={handleIngredientCreated}
        userId={userId}
        businessType={businessType}
      />
      </SaasTabWorkspace>
      )}
    </div>
  );
}
