import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listCleaningMaterialsRequest,
  createCleaningMaterialRequest,
  updateCleaningMaterialRequest,
  deleteCleaningMaterialRequest,
  getCleaningMaterialsSummaryRequest,
  listDeliveriesRequest,
  createDeliveryRequest,
  updateDeliveryRequest,
  confirmDeliveryRequest,
  deleteDeliveryRequest,
  listReturnsRequest,
  createReturnRequest,
  acceptReturnRequest,
  listMaterialRequestsRequest,
  approveMaterialRequestRequest,
  rejectMaterialRequestRequest,
  type CleaningMaterial,
  type MaterialDelivery,
  type MaterialReturn,
  type MaterialRequest,
  type MaterialsSummary,
  type MaterialType,
  type DeliveryLine,
} from '../../lib/cleaningMaterialsApi';
import {
  Boxes, Package, Truck, ArrowLeftRight, BarChart3, ShoppingCart,
  History, LayoutDashboard, Plus, Search, X, Trash2, Edit3,
  AlertCircle, CheckCircle, Clock, User, Filter, Download,
  ChevronDown, Loader2, Eye, Send, ArrowRight, RefreshCw,
  TrendingDown, TrendingUp, AlertTriangle, PackageCheck,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const TABS = [
  { id: 'resumen',       label: 'Resumen',       icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'catalogo',      label: 'Catálogo',      icon: <Package className="w-4 h-4" /> },
  { id: 'stock',         label: 'Stock',          icon: <Boxes className="w-4 h-4" /> },
  { id: 'entregas',      label: 'Entregas',       icon: <Truck className="w-4 h-4" /> },
  { id: 'devoluciones',  label: 'Devoluciones',   icon: <ArrowLeftRight className="w-4 h-4" /> },
  { id: 'solicitudes',   label: 'Solicitudes',    icon: <Send className="w-4 h-4" /> },
  { id: 'historial',     label: 'Historial',      icon: <History className="w-4 h-4" /> },
] as const;

type TabId = typeof TABS[number]['id'];

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  detergent: 'Detergente', disinfectant: 'Desinfectante', degreaser: 'Desengrasante',
  glass_cleaner: 'Limpiacristales', floor_cleaner: 'Fregasuelos', utensil: 'Utensilio',
  consumable: 'Consumible', protective: 'Protección', other: 'Otro',
};

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  draft:          { bg: 'bg-gray-100',    text: 'text-gray-600',    label: 'Borrador' },
  delivered:      { bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'Entregado' },
  partial_return: { bg: 'bg-amber-50',    text: 'text-amber-700',   label: 'Dev. parcial' },
  returned:       { bg: 'bg-blue-50',     text: 'text-blue-700',    label: 'Devuelto' },
  cancelled:      { bg: 'bg-red-50',      text: 'text-red-600',     label: 'Cancelado' },
  pending:        { bg: 'bg-amber-50',    text: 'text-amber-700',   label: 'Pendiente' },
  inspected:      { bg: 'bg-indigo-50',   text: 'text-indigo-700',  label: 'Inspeccionado' },
  accepted:       { bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'Aceptado' },
  partial:        { bg: 'bg-amber-50',    text: 'text-amber-700',   label: 'Parcial' },
  rejected:       { bg: 'bg-red-50',      text: 'text-red-600',     label: 'Rechazado' },
  approved:       { bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'Aprobado' },
};

function Badge({ status }: { status: string }) {
  const cfg = STATUS_BADGES[status] || STATUS_BADGES.pending;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
}

function KpiCard({ title, value, subtitle, icon, color }: { title: string; value: string | number; subtitle?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color} flex items-start gap-3`}>
      <div className="p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{title}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function StockSemaphore({ qty, min }: { qty: number; min: number }) {
  if (qty <= 0) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Agotado" />;
  if (min > 0 && qty <= min) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" title="Bajo mínimo" />;
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" title="OK" />;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function CleaningMaterialsPage() {
  const { user } = useAuth();
  const userId = user?.userId || user?.id || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabId) || 'resumen';

  const [materials, setMaterials] = useState<CleaningMaterial[]>([]);
  const [deliveries, setDeliveries] = useState<MaterialDelivery[]>([]);
  const [returns, setReturns] = useState<MaterialReturn[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [summary, setSummary] = useState<MaterialsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const setTab = useCallback((tab: TabId) => {
    setSearchParams({ tab });
  }, [setSearchParams]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [mats, dels, rets, reqs, sum] = await Promise.all([
        listCleaningMaterialsRequest(userId),
        listDeliveriesRequest(userId),
        listReturnsRequest(userId),
        listMaterialRequestsRequest(userId),
        getCleaningMaterialsSummaryRequest(userId),
      ]);
      setMaterials(mats);
      setDeliveries(dels);
      setReturns(rets);
      setRequests(reqs);
      setSummary(sum);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const pendingDeliveries = useMemo(() => deliveries.filter(d => d.status === 'draft').length, [deliveries]);
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);

  const filteredMaterials = useMemo(() => {
    if (!search.trim()) return materials;
    const q = search.toLowerCase();
    return materials.filter(m => m.name.toLowerCase().includes(q) || m.sku?.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q));
  }, [materials, search]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Boxes className="w-7 h-7 text-sky-500" />
              Materiales y Consumos
            </h1>
            <p className="text-sm text-gray-500 mt-1">Control de productos de limpieza, entregas y stock</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} className="p-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition" title="Actualizar">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b overflow-x-auto">
          <nav className="flex gap-1 -mb-px min-w-max">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.id === 'solicitudes' && pendingRequests > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded-full font-bold">{pendingRequests}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : (
          <>
            {activeTab === 'resumen' && (
              <ResumenTab summary={summary} materials={materials} deliveries={deliveries} pendingRequests={pendingRequests} pendingDeliveries={pendingDeliveries} onNavigate={setTab} />
            )}
            {activeTab === 'catalogo' && (
              <CatalogoTab materials={filteredMaterials} search={search} onSearchChange={setSearch} userId={userId} onReload={loadData} />
            )}
            {activeTab === 'stock' && (
              <StockTab materials={materials} />
            )}
            {activeTab === 'entregas' && (
              <EntregasTab deliveries={deliveries} userId={userId} onReload={loadData} />
            )}
            {activeTab === 'devoluciones' && (
              <DevolucionesTab returns={returns} userId={userId} onReload={loadData} />
            )}
            {activeTab === 'solicitudes' && (
              <SolicitudesTab requests={requests} userId={userId} onReload={loadData} />
            )}
            {activeTab === 'historial' && (
              <HistorialTab deliveries={deliveries} returns={returns} />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

// ─── Tab: Resumen ────────────────────────────────────────────────────────────

function ResumenTab({ summary, materials, deliveries, pendingRequests, pendingDeliveries, onNavigate }: {
  summary: MaterialsSummary | null; materials: CleaningMaterial[]; deliveries: MaterialDelivery[];
  pendingRequests: number; pendingDeliveries: number; onNavigate: (tab: TabId) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Materiales activos" value={summary?.totalMaterials ?? 0} icon={<Package className="w-5 h-5 text-sky-600" />} color="border-sky-200 bg-sky-50/50 dark:bg-sky-950/20" />
        <KpiCard title="Valor stock" value={formatCurrency(summary?.stockValue ?? 0)} icon={<Boxes className="w-5 h-5 text-emerald-600" />} color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" />
        <KpiCard title="Bajo mínimo" value={summary?.lowStockCount ?? 0} subtitle={`${summary?.outOfStockCount ?? 0} agotados`} icon={<TrendingDown className="w-5 h-5 text-amber-600" />} color="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20" />
        <KpiCard title="Entregas pendientes" value={pendingDeliveries} subtitle={`${pendingRequests} solicitudes`} icon={<Truck className="w-5 h-5 text-indigo-600" />} color="border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Nueva entrega', icon: <Truck className="w-4 h-4" />, tab: 'entregas' as TabId },
          { label: 'Registrar devolución', icon: <ArrowLeftRight className="w-4 h-4" />, tab: 'devoluciones' as TabId },
          { label: 'Ver stock', icon: <Boxes className="w-4 h-4" />, tab: 'stock' as TabId },
          { label: 'Ver solicitudes', icon: <Send className="w-4 h-4" />, tab: 'solicitudes' as TabId },
        ].map((a) => (
          <button key={a.tab} onClick={() => onNavigate(a.tab)} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm font-medium">
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {/* Low stock alerts */}
      {(summary?.lowStockCount ?? 0) + (summary?.outOfStockCount ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4" /> Alertas de stock
          </h3>
          <div className="space-y-1">
            {materials.filter(m => m.active && m.minStock > 0 && Number(m.stockQuantity) <= m.minStock).slice(0, 8).map(m => (
              <div key={m._id} className="flex items-center gap-2 text-sm">
                <StockSemaphore qty={Number(m.stockQuantity)} min={m.minStock} />
                <span className="font-medium">{m.name}</span>
                <span className="text-gray-500">— {m.stockQuantity} {m.unit} (mín: {m.minStock})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Catálogo ───────────────────────────────────────────────────────────

function CatalogoTab({ materials, search, onSearchChange, userId, onReload }: {
  materials: CleaningMaterial[]; search: string; onSearchChange: (v: string) => void;
  userId: string; onReload: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'stock', label: 'Stock' },
    { key: 'unit', label: 'Unidad' },
    { key: 'price', label: 'Precio' },
    { key: 'supplier', label: 'Proveedor' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'stock', label: 'Stock', example: '' },
    { key: 'unit', label: 'Unidad', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'supplier', label: 'Proveedor', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!user?.id) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(user?.id, {
      create: (uid, data) => createCleaningMaterialRequest(uid, data),
    }, entries, (entry) => ({
      name: entryStr(entry, 'name', 'nombre'),
      category: entryStr(entry, 'category', 'categoria') || 'general',
      unit: entryStr(entry, 'unit', 'unidad') || 'ud',
      stock: entryNum(entry, 'stock'),
    }));
    if (created > 0) {
      toast.success(`${created} material(s) creado(s)`);
      void loadData();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Buscar material…" value={search} onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
        </div>
        <AddButtonDropdown
                label="Nuevo material"
                onQuickAdd={() => setShowForm(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de material"
              />
      </div>

      {materials.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Boxes className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay materiales de limpieza</p>
          <p className="text-sm mt-1">Añade tu primer producto para empezar a controlar el stock</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Material</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Stock</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Mínimo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Coste</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Proveedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {materials.map((m) => (
                <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StockSemaphore qty={Number(m.stockQuantity)} min={m.minStock} />
                      <span className="font-medium text-gray-900 dark:text-white">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{MATERIAL_TYPE_LABELS[m.materialType] || m.materialType}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.sku}</td>
                  <td className="px-4 py-3 text-right font-medium">{m.stockQuantity} {m.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{m.minStock > 0 ? `${m.minStock} ${m.unit}` : '—'}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(m.costPrice)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.supplierName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Stock ──────────────────────────────────────────────────────────────

function StockTab({ materials }: { materials: CleaningMaterial[] }) {
  const activeMaterials = useMemo(() => materials.filter(m => m.active !== false), [materials]);
  const totalValue = useMemo(() => activeMaterials.reduce((s, m) => s + Number(m.stockQuantity || 0) * Number(m.costPrice || 0), 0), [activeMaterials]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Total productos" value={activeMaterials.length} icon={<Package className="w-5 h-5 text-sky-600" />} color="border-sky-200 bg-sky-50/50" />
        <KpiCard title="Valor total" value={formatCurrency(totalValue)} icon={<Boxes className="w-5 h-5 text-emerald-600" />} color="border-emerald-200 bg-emerald-50/50" />
        <KpiCard title="Alertas" value={activeMaterials.filter(m => m.minStock > 0 && Number(m.stockQuantity) <= m.minStock).length} icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="border-amber-200 bg-amber-50/50" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Material</th>
              <th className="text-right px-4 py-3 font-medium">Stock actual</th>
              <th className="text-right px-4 py-3 font-medium">Mínimo</th>
              <th className="text-right px-4 py-3 font-medium">Valor</th>
              <th className="text-right px-4 py-3 font-medium">Cobertura est.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {activeMaterials
              .sort((a, b) => {
                const aq = Number(a.stockQuantity), am = a.minStock;
                const bq = Number(b.stockQuantity), bm = b.minStock;
                if (aq <= 0 && bq > 0) return -1;
                if (bq <= 0 && aq > 0) return 1;
                if (am > 0 && aq <= am && (bm <= 0 || bq > bm)) return -1;
                if (bm > 0 && bq <= bm && (am <= 0 || aq > am)) return 1;
                return String(a.name).localeCompare(String(b.name), 'es');
              })
              .map((m) => {
                const qty = Number(m.stockQuantity);
                const val = qty * Number(m.costPrice || 0);
                const avg = m.averageConsumptionPerService || 0;
                const coverage = avg > 0 ? Math.round(qty / avg) : null;
                return (
                  <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3"><StockSemaphore qty={qty} min={m.minStock} /></td>
                    <td className="px-4 py-3 font-medium">{m.name}</td>
                    <td className="px-4 py-3 text-right font-medium">{qty} {m.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{m.minStock > 0 ? m.minStock : '—'}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(val)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{coverage !== null ? `~${coverage} servicios` : '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Entregas ───────────────────────────────────────────────────────────

function EntregasTab({ deliveries, userId, onReload }: { deliveries: MaterialDelivery[]; userId: string; onReload: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Entregas de material</h3>
        {/* TODO: open create delivery modal */}
      </div>

      {deliveries.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay entregas registradas</p>
          <p className="text-sm mt-1">Crea una entrega para asignar material a un trabajador</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nº</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 font-medium">Trabajador</th>
                <th className="text-left px-4 py-3 font-medium">Servicio</th>
                <th className="text-center px-4 py-3 font-medium">Líneas</th>
                <th className="text-center px-4 py-3 font-medium">Estado</th>
                <th className="text-center px-4 py-3 font-medium">Confirmado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {deliveries.map((d) => (
                <tr key={d._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{d.deliveryNumber}</td>
                  <td className="px-4 py-3">{d.date}</td>
                  <td className="px-4 py-3 font-medium">{d.workerName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{d.serviceNumber || '—'}</td>
                  <td className="px-4 py-3 text-center">{d.lines.length}</td>
                  <td className="px-4 py-3 text-center"><Badge status={d.status} /></td>
                  <td className="px-4 py-3 text-center">
                    {d.receivedConfirmation ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" /> : <Clock className="w-4 h-4 text-gray-400 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Devoluciones ───────────────────────────────────────────────────────

function DevolucionesTab({ returns, userId, onReload }: { returns: MaterialReturn[]; userId: string; onReload: () => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Devoluciones de material</h3>

      {returns.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ArrowLeftRight className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay devoluciones registradas</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nº</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 font-medium">Trabajador</th>
                <th className="text-left px-4 py-3 font-medium">Entrega orig.</th>
                <th className="text-center px-4 py-3 font-medium">Líneas</th>
                <th className="text-center px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {returns.map((r) => (
                <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{r.returnNumber}</td>
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3 font-medium">{r.workerName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{r.deliveryNumber || '—'}</td>
                  <td className="px-4 py-3 text-center">{r.lines.length}</td>
                  <td className="px-4 py-3 text-center"><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Solicitudes ────────────────────────────────────────────────────────

function SolicitudesTab({ requests, userId, onReload }: { requests: MaterialRequest[]; userId: string; onReload: () => void }) {
  const handleApprove = async (requestId: string) => {
    try {
      await approveMaterialRequestRequest(userId, requestId);
      toast.success('Solicitud aprobada');
      onReload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectMaterialRequestRequest(userId, requestId);
      toast.success('Solicitud rechazada');
      onReload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Solicitudes de material</h3>

      {requests.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Send className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay solicitudes</p>
          <p className="text-sm mt-1">Los trabajadores pueden solicitar material desde su app</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r._id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                <User className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{r.workerName}</p>
                <p className="text-sm text-gray-500">{r.materialName} — {r.quantity} {r.unit}</p>
                {r.reason && <p className="text-xs text-gray-400 mt-0.5">Motivo: {r.reason}</p>}
              </div>
              <Badge status={r.status} />
              {r.status === 'pending' && (
                <div className="flex items-center gap-2">
                  <button onClick={() => handleApprove(r._id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition">Aprobar</button>
                  <button onClick={() => handleReject(r._id)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition">Rechazar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Historial ──────────────────────────────────────────────────────────

function HistorialTab({ deliveries, returns }: { deliveries: MaterialDelivery[]; returns: MaterialReturn[] }) {
  const events = useMemo(() => {
    const items: { date: string; type: string; label: string; detail: string; status: string }[] = [];
    for (const d of deliveries) {
      items.push({ date: d.date, type: 'entrega', label: d.deliveryNumber, detail: `→ ${d.workerName} (${d.lines.length} líneas)`, status: d.status });
    }
    for (const r of returns) {
      items.push({ date: r.date, type: 'devolución', label: r.returnNumber, detail: `← ${r.workerName} (${r.lines.length} líneas)`, status: r.status });
    }
    return items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [deliveries, returns]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Historial de movimientos</h3>

      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin movimientos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
              <div className={`p-1.5 rounded-lg ${e.type === 'entrega' ? 'bg-sky-50 text-sky-600' : 'bg-purple-50 text-purple-600'}`}>
                {e.type === 'entrega' ? <Truck className="w-4 h-4" /> : <ArrowLeftRight className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{e.label}</span>
                <span className="text-sm text-gray-500 ml-2">{e.detail}</span>
              </div>
              <span className="text-xs text-gray-400">{e.date}</span>
              <Badge status={e.status} />
            </div>
          ))}
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="cleaning_materials"
        moduleLabel="Materiales"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Materiales"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
