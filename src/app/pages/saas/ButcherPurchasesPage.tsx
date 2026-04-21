import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listPurchaseEntriesRequest,
  createPurchaseEntryRequest,
  updatePurchaseEntryRequest,
  deletePurchaseEntryRequest,
  confirmPurchaseEntryRequest,
  validatePurchaseEntryRequest,
  getPurchaseEntryStatsRequest,
  previewBatchCodeRequest,
  createFromOcrRequest,
  createFinanceFromEntryRequest,
  searchSuppliersRequest,
  searchProductsRequest,
  type PurchaseEntry,
  type PurchaseEntryStatus,
  type PurchaseStats,
  type AnimalType,
  type SupplierOption,
  type ProductOption,
} from '../../lib/butcherPurchaseApi';
import {
  ShoppingCart, Plus, Search, X, Filter, Trash2, Edit3, CheckCircle2,
  Clock, AlertTriangle, Package, Eye, ChevronDown, Camera,
  TrendingUp, TrendingDown, Euro, Scale, Boxes, FileText, Wallet,
  Factory, Beef, ScanBarcode, Truck, BarChart3, Calendar, Upload,
  ArrowUpDown, LayoutList, Download, ShieldCheck, Minus, Loader2,
} from 'lucide-react';

// ─── Tabs ───────────────────────────────────────────────────────────────────

type TabId = 'registro' | 'historial' | 'lotes' | 'facturas';

const TABS: { id: TabId; label: string; icon: typeof ShoppingCart }[] = [
  { id: 'registro', label: 'Nueva entrada', icon: Plus },
  { id: 'historial', label: 'Historial', icon: LayoutList },
  { id: 'lotes', label: 'Lotes', icon: ScanBarcode },
  { id: 'facturas', label: 'Facturas compra', icon: FileText },
];

// ─── Status config ──────────────────────────────────────────────────────────

const STATUS_CFG: Record<PurchaseEntryStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  draft:     { label: 'Borrador',   color: 'text-gray-600 dark:text-gray-400',     bg: 'bg-gray-100 dark:bg-gray-700/60',        icon: FileText },
  confirmed: { label: 'Confirmada', color: 'text-blue-700 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-900/20',          icon: CheckCircle2 },
  validated: { label: 'Validada',   color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20',  icon: ShieldCheck },
};

const ANIMAL_LABEL: Record<string, string> = {
  vacuno: 'Vacuno', cerdo: 'Cerdo', pollo: 'Pollo', cordero: 'Cordero', elaborados: 'Elaborados', otro: 'Otro',
};

const ZONE_LABEL: Record<string, string> = {
  camara_frio: 'Cámara de frío', congelador: 'Congelador', mostrador: 'Mostrador', obrador: 'Obrador',
};

function StatusBadge({ status }: { status: PurchaseEntryStatus }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

function CostIndicator({ current, avg }: { current: number; avg: number }) {
  if (!avg || avg === 0) return null;
  const pct = Math.round(((current - avg) / avg) * 100);
  if (Math.abs(pct) < 1) return null;
  const isUp = pct > 0;
  const isAnomaly = Math.abs(pct) > 20;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isAnomaly ? 'text-red-600 dark:text-red-400' : isUp ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{pct}%
    </span>
  );
}

// ─── Empty form ─────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_FORM: Partial<PurchaseEntry> = {
  supplierId: '', supplierName: '', supplierCif: '',
  productId: '', productName: '', productSku: '',
  quantityPurchased: 0, quantityReceived: 0, unit: 'kg',
  costPerUnit: 0, totalCost: 0,
  entryDate: TODAY, purchaseDate: '',
  batchId: '', batchCode: '',
  expirationDate: '', expirationRequired: false,
  warehouseId: '', warehouseName: '', zone: '',
  invoiceId: '', invoiceNumber: '',
  purchaseOrderId: '', purchaseOrderNumber: '',
  animalType: '', origin: '', slaughterhouse: '',
  healthGuideNumber: '', slaughterDate: '',
  temperatureOnArrival: null,
  notes: '',
};

// ─── Autocomplete dropdown ──────────────────────────────────────────────────

function Autocomplete<T extends { _id: string }>({
  value, onSelect, onSearch, renderItem, placeholder, labelKey,
}: {
  value: string;
  onSelect: (item: T) => void;
  onSearch: (q: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
  placeholder: string;
  labelKey: keyof T;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const doSearch = (q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 1) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const items = await onSearch(q);
        setResults(items);
        setOpen(items.length > 0);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
  };

  return (
    <div className="relative">
      <input type="text" placeholder={placeholder} value={query} onChange={(e) => doSearch(e.target.value)} onFocus={() => { if (results.length > 0) setOpen(true); }}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((item) => (
            <button key={item._id} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm" onClick={() => { onSelect(item); setQuery(String(item[labelKey])); setOpen(false); }}>
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page component ────────────────────────────────────────────────────

export function ButcherPurchasesPage() {
  const { user } = useAuth();
  const userId = user?.id || '';
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = (searchParams.get('tab') as TabId) || 'registro';
  const setTab = (t: TabId) => setSearchParams({ tab: t });

  const [entries, setEntries] = useState<PurchaseEntry[]>([]);
  const [stats, setStats] = useState<PurchaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [ocrLoading, setOcrLoading] = useState(false);

  // Filters for history tab
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<PurchaseEntryStatus | 'all'>('all');
  const [sortField, setSortField] = useState<'entryDate' | 'totalCost' | 'supplierName'>('entryDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [entriesRes, statsRes] = await Promise.all([
        listPurchaseEntriesRequest(userId),
        getPurchaseEntryStatsRequest(userId),
      ]);
      if (entriesRes.ok) setEntries(entriesRes.entries);
      if (statsRes.ok) setStats(statsRes.stats);
    } catch { /* handled by API */ } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Form handlers ───────────────────────────────────────────────────────

  const updateForm = (field: string, value: unknown) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'costPerUnit' || field === 'quantityReceived') {
        next.totalCost = Number(next.costPerUnit || 0) * Number(next.quantityReceived || 0);
      }
      return next;
    });
  };

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const handleSaveDraft = async () => {
    if (!form.supplierName && !form.supplierId) return toast.error('Selecciona un proveedor');
    if (!form.productName && !form.productId) return toast.error('Selecciona un producto');
    if (!form.quantityReceived || Number(form.quantityReceived) <= 0) return toast.error('La cantidad debe ser mayor que 0');
    if (!form.costPerUnit || Number(form.costPerUnit) <= 0) return toast.error('El coste por unidad debe ser mayor que 0');

    try {
      if (editingId) {
        const res = await updatePurchaseEntryRequest(userId, editingId, form);
        if (!res.ok) throw new Error((res as { error?: string }).error || 'Error');
        toast.success('Entrada actualizada');
      } else {
        const res = await createPurchaseEntryRequest(userId, form);
        if (!res.ok) throw new Error((res as { error?: string }).error || 'Error');
        toast.success('Borrador guardado');
      }
      resetForm();
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    }
  };

  const handleConfirm = async () => {
    if (!form.supplierName && !form.supplierId) return toast.error('Selecciona un proveedor');
    if (!form.productName && !form.productId) return toast.error('Selecciona un producto');
    if (!form.quantityReceived || Number(form.quantityReceived) <= 0) return toast.error('La cantidad debe ser mayor que 0');
    if (!form.costPerUnit || Number(form.costPerUnit) <= 0) return toast.error('El coste por unidad debe ser mayor que 0');

    try {
      let entryId = editingId;
      if (!entryId) {
        const createRes = await createPurchaseEntryRequest(userId, form);
        if (!createRes.ok) throw new Error((createRes as { error?: string }).error || 'Error');
        entryId = createRes.entry._id;
      } else {
        const updateRes = await updatePurchaseEntryRequest(userId, entryId, form);
        if (!updateRes.ok) throw new Error((updateRes as { error?: string }).error || 'Error');
      }

      const confirmRes = await confirmPurchaseEntryRequest(userId, entryId!);
      if (!confirmRes.ok) throw new Error((confirmRes as { error?: string }).error || 'Error');

      const entry = confirmRes.entry;
      const msgs: string[] = [`✓ Entrada confirmada: ${entry.quantityReceived}${entry.unit} de ${entry.productName}`];
      if (entry.batchCode) msgs.push(`Lote generado: ${entry.batchCode}`);
      if (entry.costAnomaly) msgs.push(`⚠ Coste anómalo: +${entry.costAnomalyPct}% sobre media`);
      if (!entry.isComplete) msgs.push(`⚠ Mercancía incompleta`);

      toast.success(msgs.join('\n'), { duration: 5000 });
      resetForm();
      loadData();
      setTab('historial');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al confirmar');
    }
  };

  const handleValidate = async (entryId: string) => {
    try {
      const res = await validatePurchaseEntryRequest(userId, entryId);
      if (!res.ok) throw new Error((res as { error?: string }).error || 'Error');
      toast.success('Entrada validada por gerente');
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al validar');
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!confirm('¿Eliminar esta entrada?')) return;
    try {
      await deletePurchaseEntryRequest(userId, entryId);
      toast.success('Entrada eliminada');
      loadData();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleEdit = (entry: PurchaseEntry) => {
    setForm(entry);
    setEditingId(entry._id);
    setTab('registro');
  };

  const handleGenerateBatchCode = async () => {
    try {
      const res = await previewBatchCodeRequest(userId, form.entryDate, form.animalType as string);
      if (res.ok) updateForm('batchCode', res.batchCode);
    } catch { /* ignore */ }
  };

  // ─── OCR Scan ─────────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOcrScan = async (file: File) => {
    setOcrLoading(true);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const API = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('token') || '';
      const scanRes = await fetch(`${API}/api/ocr/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type, context: 'factura_proveedor' }),
      });
      const scanData = await scanRes.json();
      if (!scanData.ok) throw new Error(scanData.error || 'Error en OCR');

      const ocrResult = scanData.data;
      const createRes = await createFromOcrRequest(userId, ocrResult);
      if (!createRes.ok) throw new Error('Error creando entradas desde OCR');

      toast.success(`OCR completado: ${createRes.entries.length} entrada(s) creada(s) desde factura`);
      loadData();
      setTab('historial');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error procesando factura con OCR');
    } finally { setOcrLoading(false); }
  };

  // ─── Finance ──────────────────────────────────────────────────────────────

  const handleCreateFinance = async (entryId: string) => {
    try {
      const res = await createFinanceFromEntryRequest(userId, entryId);
      if (!res.ok) throw new Error((res as { error?: string }).error || 'Error');
      toast.success('Movimiento de pago creado en Finanzas');
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error creando movimiento');
    }
  };

  // ─── Supplier/product autocomplete ────────────────────────────────────────

  const handleSupplierSearch = async (q: string): Promise<SupplierOption[]> => {
    const res = await searchSuppliersRequest(userId, q);
    return res.ok ? res.suppliers : [];
  };

  const handleProductSearch = async (q: string): Promise<ProductOption[]> => {
    const res = await searchProductsRequest(userId, q);
    return res.ok ? res.products : [];
  };

  const handleSelectSupplier = (s: SupplierOption) => {
    setForm((prev) => ({ ...prev, supplierId: s._id, supplierName: s.name, supplierCif: s.cif || '' }));
  };

  const handleSelectProduct = (p: ProductOption) => {
    setForm((prev) => ({ ...prev, productId: p._id, productName: p.name, productSku: p.sku || '', unit: (p.unit as 'kg') || 'kg' }));
  };

  // ─── Filtered & sorted history ────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.productName.toLowerCase().includes(q) || e.supplierName.toLowerCase().includes(q)
        || e.batchCode.toLowerCase().includes(q) || e.invoiceNumber.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') result = result.filter((e) => e.status === filterStatus);
    result = [...result].sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === 'number' ? av - (bv as number) : String(av || '').localeCompare(String(bv || ''));
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [entries, search, filterStatus, sortField, sortDir]);

  // ─── KPIs ─────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Compras del mes', value: `${stats.totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`, icon: Euro, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
      { label: 'Kg recibidos', value: `${stats.totalKg.toLocaleString('es-ES')} kg`, icon: Scale, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
      { label: 'Coste medio/kg', value: `${stats.avgCostPerKg.toFixed(2)}€/kg`, icon: TrendingUp, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
      { label: 'Entradas', value: stats.entriesCount, icon: Boxes, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
      { label: 'Sin factura', value: stats.withoutInvoice, icon: AlertTriangle, color: stats.withoutInvoice > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400', bg: stats.withoutInvoice > 0 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-gray-50 dark:bg-gray-800' },
      { label: 'Pte. validar', value: stats.pendingValidation, icon: Clock, color: stats.pendingValidation > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400', bg: stats.pendingValidation > 0 ? 'bg-amber-50 dark:bg-amber-900/30' : 'bg-gray-50 dark:bg-gray-800' },
    ];
  }, [stats]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Layout title="Compras y Entrada de Mercancía">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {loading ? Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          </div>
        )) : kpis.map((k) => (
          <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className={`p-1.5 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{k.label}</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'registro' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editingId ? 'Editar entrada' : 'Registrar nueva entrada de mercancía'}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Registra la compra y entrada real de mercancía</p>
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOcrScan(f); e.target.value = ''; }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={ocrLoading} className="px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 text-sm font-medium hover:bg-violet-100 dark:hover:bg-violet-900/30 flex items-center gap-1.5 border border-violet-200 dark:border-violet-800 disabled:opacity-50">
                {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {ocrLoading ? 'Escaneando...' : 'Escanear factura (OCR)'}
              </button>
              <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                {showAdvanced ? 'Modo rápido' : 'Modo completo'}
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Section: Proveedor + Producto (autocomplete) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor *</label>
                <Autocomplete<SupplierOption>
                  value={form.supplierName || ''}
                  placeholder="Buscar proveedor..."
                  labelKey="name"
                  onSearch={handleSupplierSearch}
                  onSelect={handleSelectSupplier}
                  renderItem={(s) => (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">{s.name}</span>
                      {s.cif && <span className="text-xs text-gray-400 ml-2">{s.cif}</span>}
                    </div>
                  )}
                />
                {form.supplierCif && <p className="text-xs text-gray-400 mt-1">CIF: {form.supplierCif}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Producto *</label>
                <Autocomplete<ProductOption>
                  value={form.productName || ''}
                  placeholder="Buscar producto..."
                  labelKey="name"
                  onSearch={handleProductSearch}
                  onSelect={handleSelectProduct}
                  renderItem={(p) => (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {p.sku && <span>{p.sku}</span>}
                        {p.costPerKg > 0 && <span>{p.costPerKg.toFixed(2)}€/kg</span>}
                        <span>{p.stockKg.toFixed(1)}kg</span>
                      </div>
                    </div>
                  )}
                />
              </div>
            </div>

            {/* Section: Cantidades y costes */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kg comprados</label>
                <input type="number" step="0.01" min="0" placeholder="0" value={form.quantityPurchased || ''} onChange={(e) => updateForm('quantityPurchased', Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kg recibidos *</label>
                <input type="number" step="0.01" min="0" placeholder="0" value={form.quantityReceived || ''} onChange={(e) => updateForm('quantityReceived', Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                {form.quantityPurchased && form.quantityReceived && Number(form.quantityReceived) < Number(form.quantityPurchased) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Mercancía incompleta</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">€/kg *</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={form.costPerUnit || ''} onChange={(e) => updateForm('costPerUnit', Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Coste total</label>
                <div className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white text-sm font-semibold">
                  {(Number(form.totalCost) || 0).toFixed(2)}€
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad</label>
                <select value={form.unit || 'kg'} onChange={(e) => updateForm('unit', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="kg">kg</option><option value="unidades">Unidades</option><option value="litros">Litros</option><option value="cajas">Cajas</option>
                </select>
              </div>
            </div>

            {/* Section: Fecha, lote, caducidad */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de entrada *</label>
                <input type="date" value={form.entryDate || TODAY} onChange={(e) => updateForm('entryDate', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lote</label>
                <div className="flex gap-1">
                  <input type="text" placeholder="LOT-..." value={form.batchCode || ''} onChange={(e) => updateForm('batchCode', e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  <button onClick={handleGenerateBatchCode} className="px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs" title="Generar automáticamente">
                    <Zap className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de caducidad</label>
                <input type="date" value={form.expirationDate || ''} onChange={(e) => updateForm('expirationDate', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                {form.expirationRequired && !form.expirationDate && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Lote sin caducidad</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nº Factura</label>
                <input type="text" placeholder="FC-..." value={form.invoiceNumber || ''} onChange={(e) => updateForm('invoiceNumber', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>

            {/* Section: Destino */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tienda / Almacén destino</label>
                <input type="text" placeholder="Ej: Tienda Centro" value={form.warehouseName || ''} onChange={(e) => updateForm('warehouseName', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zona</label>
                <select value={form.zone || ''} onChange={(e) => updateForm('zone', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">Sin especificar</option>
                  <option value="camara_frio">Cámara de frío</option><option value="congelador">Congelador</option>
                  <option value="mostrador">Mostrador</option><option value="obrador">Obrador</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo animal</label>
                <select value={form.animalType || ''} onChange={(e) => updateForm('animalType', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">Sin especificar</option>
                  {Object.entries(ANIMAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Advanced: Trazabilidad carnicería */}
            {showAdvanced && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <ScanBarcode className="w-4 h-4" /> Trazabilidad
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Origen / Granja</label>
                    <input type="text" placeholder="Granja..." value={form.origin || ''} onChange={(e) => updateForm('origin', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Matadero</label>
                    <input type="text" placeholder="Matadero..." value={form.slaughterhouse || ''} onChange={(e) => updateForm('slaughterhouse', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nº Guía sanitaria</label>
                    <input type="text" placeholder="GS-..." value={form.healthGuideNumber || ''} onChange={(e) => updateForm('healthGuideNumber', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Temperatura recepción (°C)</label>
                    <input type="number" step="0.1" placeholder="2.0" value={form.temperatureOnArrival ?? ''} onChange={(e) => updateForm('temperatureOnArrival', e.target.value ? Number(e.target.value) : null)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fecha de sacrificio</label>
                    <input type="date" value={form.slaughterDate || ''} onChange={(e) => updateForm('slaughterDate', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">CIF Proveedor</label>
                    <input type="text" placeholder="B-..." value={form.supplierCif || ''} onChange={(e) => updateForm('supplierCif', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notas</label>
                    <input type="text" placeholder="Observaciones..." value={form.notes || ''} onChange={(e) => updateForm('notes', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions bar */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
            <button onClick={resetForm} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <div className="flex gap-2">
              <button onClick={handleSaveDraft} className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Guardar borrador
              </button>
              <button onClick={handleConfirm} className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 shadow-sm">
                <CheckCircle2 className="w-4 h-4" /> Confirmar entrada
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'historial' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          {/* Filters */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar producto, proveedor, lote..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as PurchaseEntryStatus | 'all')} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white">
              <option value="all">Todos los estados</option>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  {[
                    { key: 'entryDate', label: 'Fecha' },
                    { key: 'supplierName', label: 'Proveedor' },
                    { key: 'productName', label: 'Producto' },
                    { key: 'quantityReceived', label: 'Kg' },
                    { key: 'costPerUnit', label: '€/kg' },
                    { key: 'totalCost', label: 'Total' },
                  ].map((col) => (
                    <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200" onClick={() => { if (sortField === col.key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); else { setSortField(col.key as typeof sortField); setSortDir('desc'); } }}>
                      <span className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Lote</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Caducidad</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                )) : filteredEntries.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400 dark:text-gray-500">No hay entradas registradas</td></tr>
                ) : filteredEntries.map((e) => {
                  const expDays = e.expirationDate ? Math.ceil((new Date(e.expirationDate).getTime() - Date.now()) / 86400000) : null;
                  return (
                    <tr key={e._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{new Date(e.entryDate).toLocaleDateString('es-ES')}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        <div className="flex items-center gap-1.5">
                          <Factory className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          {e.supplierName || <span className="text-gray-400 italic">Sin proveedor</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        <div>{e.productName}</div>
                        {e.animalType && <span className="text-xs text-gray-400">{ANIMAL_LABEL[e.animalType]}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-semibold">
                        {e.quantityReceived} {e.unit}
                        {!e.isComplete && e.quantityPurchased > 0 && (
                          <span className="ml-1 text-xs text-amber-500" title={`Pedidos: ${e.quantityPurchased}`}>⚠</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-900 dark:text-white">{e.costPerUnit.toFixed(2)}€</span>
                          {e.previousAvgCost > 0 && <CostIndicator current={e.costPerUnit} avg={e.previousAvgCost} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{e.totalCost.toFixed(2)}€</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{e.batchCode || '—'}</td>
                      <td className="px-4 py-3">
                        {e.expirationDate ? (
                          <span className={`text-xs font-medium ${expDays !== null && expDays < 0 ? 'text-red-600 dark:text-red-400' : expDays !== null && expDays <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>
                            {new Date(e.expirationDate).toLocaleDateString('es-ES')}
                            {expDays !== null && <span className="ml-1">({expDays < 0 ? 'caducado' : `${expDays}d`})</span>}
                          </span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {e.status === 'draft' && (
                            <button onClick={() => handleEdit(e)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500" title="Editar">
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {e.status === 'confirmed' && (
                            <button onClick={() => handleValidate(e._id)} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600" title="Validar (gerente)">
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          )}
                          {e.status !== 'draft' && !(e as unknown as { linkedFinanceId?: string }).linkedFinanceId && (
                            <button onClick={() => handleCreateFinance(e._id)} className="p-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 text-violet-600" title="Crear pago en Finanzas">
                              <Wallet className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(e._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            {filteredEntries.length} entrada{filteredEntries.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {activeTab === 'lotes' && <LotsTab userId={userId} />}

      {activeTab === 'facturas' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Facturas de compra</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Escanea facturas de proveedor para crear entradas automáticamente</p>
              </div>
              <button onClick={() => fileInputRef.current?.click()} disabled={ocrLoading} className="px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50">
                {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {ocrLoading ? 'Procesando...' : 'Subir factura'}
              </button>
            </div>
          </div>
          <div className="p-8">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center hover:border-violet-400 dark:hover:border-violet-500 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-violet-500'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('border-violet-500'); }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-violet-500'); const f = e.dataTransfer.files[0]; if (f) handleOcrScan(f); }}
            >
              <Camera className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h4 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">Arrastra una factura o haz clic para seleccionar</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Formatos: JPG, PNG, PDF — Se extraerán automáticamente proveedor, líneas y totales</p>
              <div className="flex items-center justify-center gap-6 mt-6 text-xs text-gray-400">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Extracción automática</span>
                <span className="flex items-center gap-1"><Factory className="w-3.5 h-3.5 text-blue-500" /> Match con proveedores</span>
                <span className="flex items-center gap-1"><Boxes className="w-3.5 h-3.5 text-amber-500" /> Crea entradas de stock</span>
              </div>
            </div>
            {entries.filter((e) => e.ocrData).length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Entradas creadas desde OCR</h4>
                <div className="space-y-2">
                  {entries.filter((e) => e.ocrData).slice(0, 10).map((e) => (
                    <div key={e._id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20"><ScanBarcode className="w-4 h-4 text-violet-600 dark:text-violet-400" /></div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{e.productName || 'Sin producto'} — {e.supplierName}</p>
                          <p className="text-xs text-gray-500">{e.invoiceNumber || 'Sin nº factura'} · {new Date(e.entryDate).toLocaleDateString('es-ES')} · {e.totalCost.toFixed(2)}€</p>
                        </div>
                      </div>
                      <StatusBadge status={e.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

// ─── Lots tab (inline) ──────────────────────────────────────────────────────

function LotsTab({ userId }: { userId: string }) {
  const [batches, setBatches] = useState<Array<{
    _id: string; batchNumber: string; productName: string; supplierName?: string;
    receptionDate: string; expirationDate: string; receptionWeightKg: number;
    currentWeightKg: number; status: string; healthStatus: string; zone: string;
    origin: string; slaughterhouse: string; healthGuide: string; temperature: number | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        const API = import.meta.env.VITE_API_URL || '';
        const token = localStorage.getItem('token') || '';
        const r = await fetch(`${API}/api/butcher/batches/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        if (data.ok) setBatches(data.batches);
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, [userId]);

  const filtered = useMemo(() => {
    if (!search) return batches;
    const q = search.toLowerCase();
    return batches.filter((b) =>
      b.batchNumber.toLowerCase().includes(q) || b.productName.toLowerCase().includes(q) || (b.origin || '').toLowerCase().includes(q)
    );
  }, [batches, search]);

  const stats = useMemo(() => {
    const active = batches.filter((b) => b.status === 'active');
    const nearExpiry = active.filter((b) => {
      if (!b.expirationDate) return false;
      const days = (new Date(b.expirationDate).getTime() - Date.now()) / 86400000;
      return days >= 0 && days <= 7;
    });
    const expired = active.filter((b) => b.expirationDate && new Date(b.expirationDate).getTime() < Date.now());
    const totalKg = active.reduce((s, b) => s + b.currentWeightKg, 0);
    return { active: active.length, nearExpiry: nearExpiry.length, expired: expired.length, totalKg };
  }, [batches]);

  const HEALTH_CFG: Record<string, { label: string; dot: string }> = {
    approved: { label: 'Conforme', dot: 'bg-emerald-500' },
    incidencia: { label: 'Incidencia', dot: 'bg-amber-500' },
    rejected: { label: 'Retirado', dot: 'bg-red-500' },
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Lotes activos', value: stats.active, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
          { label: 'Próximos a caducar', value: stats.nearExpiry, color: stats.nearExpiry > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400', bg: stats.nearExpiry > 0 ? 'bg-amber-50 dark:bg-amber-900/30' : 'bg-gray-50 dark:bg-gray-800' },
          { label: 'Caducados', value: stats.expired, color: stats.expired > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400', bg: stats.expired > 0 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-gray-50 dark:bg-gray-800' },
          { label: 'Kg en lotes', value: `${stats.totalKg.toFixed(1)} kg`, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar lote, producto..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Lote</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Entrada</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Caducidad</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kg</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Zona</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Sanitario</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" /></td>
                  ))}
                </tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">No hay lotes</td></tr>
              ) : filtered.map((b) => {
                const expDays = b.expirationDate ? Math.ceil((new Date(b.expirationDate).getTime() - Date.now()) / 86400000) : null;
                const pct = b.receptionWeightKg > 0 ? Math.round((b.currentWeightKg / b.receptionWeightKg) * 100) : 0;
                const hcfg = HEALTH_CFG[b.healthStatus] || HEALTH_CFG.approved;
                return (
                  <tr key={b._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900 dark:text-white">{b.batchNumber}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{b.productName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{b.receptionDate ? new Date(b.receptionDate).toLocaleDateString('es-ES') : '—'}</td>
                    <td className="px-4 py-3">
                      {b.expirationDate ? (
                        <span className={`text-xs font-medium ${expDays !== null && expDays < 0 ? 'text-red-600' : expDays !== null && expDays <= 7 ? 'text-amber-600' : 'text-gray-600 dark:text-gray-400'}`}>
                          {new Date(b.expirationDate).toLocaleDateString('es-ES')}
                          {expDays !== null && <span className="ml-1">({expDays < 0 ? 'cad.' : `${expDays}d`})</span>}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{b.currentWeightKg.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">/ {b.receptionWeightKg.toFixed(1)}</span>
                      </div>
                      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1">
                        <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{ZONE_LABEL[b.zone] || b.zone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={`w-2 h-2 rounded-full ${hcfg.dot}`} />
                        {hcfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Zap icon used in form ──────────────────────────────────────────────────
function Zap(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}
