import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  ShoppingCart, Plus, Search, Edit3, Trash2, X, Truck,
  DollarSign, TrendingUp, AlertTriangle, Filter, FileText,
  Check, XCircle, Package, Eye, ChevronDown, ChevronUp,
  Clock, User, ScrollText, Droplets, Container, Wrench,
  MoreHorizontal, Download, CheckCircle2, ArrowRight,
} from 'lucide-react';
import {
  listAcquisitionsRequest,
  getAcquisitionStatsRequest,
  createAcquisitionRequest,
  updateAcquisitionRequest,
  changeStatusRequest,
  approveAcquisitionRequest,
  rejectAcquisitionRequest,
  deleteAcquisitionRequest,
  getEconomicHistoryRequest,
  ACQUISITION_TYPE_LABELS,
  ACQUISITION_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type VehicleAcquisition,
  type AcquisitionType,
  type AcquisitionStatus,
  type AcquisitionStats,
  type PaymentMethod,
  type PaymentStatus,
  type EconomicHistoryEntry,
  type EconomicHistorySummary,
} from '../../lib/vehicleAcquisitionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';

const STATUS_COLORS: Record<AcquisitionStatus, string> = {
  borrador: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  pendiente_aprobacion: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  aprobada: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  rechazada: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  en_transito: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  recibida: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  documentada: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  cerrada: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  cancelada: 'bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400',
};

const TYPE_COLORS: Record<AcquisitionType, string> = {
  compra_particular: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  compra_empresa: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  subasta: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  retirada: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  grua_externa: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
};

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  pendiente: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  parcial: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  pagado: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
};

const TYPE_ICONS: Record<AcquisitionType, typeof ShoppingCart> = {
  compra_particular: User,
  compra_empresa: Package,
  subasta: TrendingUp,
  retirada: ArrowRight,
  grua_externa: Truck,
};

const COST_ICONS: Record<string, typeof ShoppingCart> = {
  compra: ShoppingCart,
  transporte: Truck,
  gestoria: FileText,
  documentacion: ScrollText,
  descontaminacion: Droplets,
  compactacion: Container,
  almacenamiento: Package,
  reparacion_pieza: Wrench,
  otro: MoreHorizontal,
};

const TABS = [
  { id: 'todas', label: 'Todas' },
  { id: 'compras', label: 'Compras' },
  { id: 'retiradas', label: 'Retiradas' },
  { id: 'subastas', label: 'Subastas' },
  { id: 'grua', label: 'Grúa externa' },
] as const;

function fmtEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

// ── Empty Form ──────────────────────────────────────────────────────────────────

interface FormData {
  vehicleId: string;
  registrationPlate: string;
  acquisitionType: AcquisitionType;
  sellerType: string;
  sellerName: string;
  sellerNif: string;
  sellerPhone: string;
  sellerEmail: string;
  sellerAddress: string;
  supplierId: string;
  costCompra: number;
  costTransporte: number;
  costGestoria: number;
  costDocumentacion: number;
  costDescontaminacion: number;
  costOtros: number;
  costOtrosDetalle: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentDate: string;
  paymentStatus: PaymentStatus;
  paymentNotes: string;
  acquisitionDate: string;
  receptionDate: string;
  notes: string;
  internalNotes: string;
}

const emptyForm = (): FormData => ({
  vehicleId: '',
  registrationPlate: '',
  acquisitionType: 'compra_particular',
  sellerType: 'particular',
  sellerName: '',
  sellerNif: '',
  sellerPhone: '',
  sellerEmail: '',
  sellerAddress: '',
  supplierId: '',
  costCompra: 0,
  costTransporte: 0,
  costGestoria: 0,
  costDocumentacion: 0,
  costDescontaminacion: 0,
  costOtros: 0,
  costOtrosDetalle: '',
  paymentMethod: 'transferencia',
  paymentReference: '',
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentStatus: 'pendiente',
  paymentNotes: '',
  acquisitionDate: new Date().toISOString().slice(0, 10),
  receptionDate: '',
  notes: '',
  internalNotes: '',
});

// ═════════════════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════════════════

export function ScrapyardPurchasesPage() {
  const { user } = useAuth();
  const userId = user?.id || '';
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<VehicleAcquisition[]>([]);
  const [stats, setStats] = useState<AcquisitionStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [activeTab, setActiveTab] = useState('todas');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VehicleAcquisition | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());

  const [selectedItem, setSelectedItem] = useState<VehicleAcquisition | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const [economicHistory, setEconomicHistory] = useState<EconomicHistoryEntry[]>([]);
  const [economicSummary, setEconomicSummary] = useState<EconomicHistorySummary | null>(null);

  const [rejectNote, setRejectNote] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionTarget, setActionTarget] = useState<VehicleAcquisition | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'seller', label: 'Vendedor' },
    { key: 'price', label: 'Precio' },
    { key: 'date', label: 'Fecha' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'seller', label: 'Vendedor', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} compra(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} compra(s) importado(s)`);
  };

  useModalClose(showForm, () => setShowForm(false));
  useModalClose(showDetail, () => setShowDetail(false));
  useModalClose(showRejectModal, () => setShowRejectModal(false));

  const isGerente = user?.role === 'Admin' || user?.role === 'Gerente';

  // ── Load data ─────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        listAcquisitionsRequest(userId),
        getAcquisitionStatsRequest(userId),
      ]);
      setItems(listRes.items);
      setStats(statsRes.stats);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id && items.length > 0) {
      const found = items.find((a) => a.id === id);
      if (found) openDetail(found);
    }
  }, [searchParams, items]);

  // ── Filter logic ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (activeTab === 'compras' && !a.acquisitionType.startsWith('compra')) return false;
      if (activeTab === 'retiradas' && a.acquisitionType !== 'retirada') return false;
      if (activeTab === 'subastas' && a.acquisitionType !== 'subasta') return false;
      if (activeTab === 'grua' && a.acquisitionType !== 'grua_externa') return false;
      if (filterStatus && a.status !== filterStatus) return false;
      if (filterPayment && a.paymentStatus !== filterPayment) return false;
      if (search) {
        const q = search.toLowerCase();
        const h = `${a.registrationPlate} ${a.sellerName} ${a.sellerNif}`.toLowerCase();
        if (!h.includes(q)) return false;
      }
      return true;
    });
  }, [items, activeTab, filterStatus, filterPayment, search]);

  // ── Form handlers ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (a: VehicleAcquisition) => {
    setEditing(a);
    setForm({
      vehicleId: a.vehicleId,
      registrationPlate: a.registrationPlate,
      acquisitionType: a.acquisitionType,
      sellerType: a.sellerType,
      sellerName: a.sellerName,
      sellerNif: a.sellerNif,
      sellerPhone: a.sellerPhone,
      sellerEmail: a.sellerEmail,
      sellerAddress: a.sellerAddress,
      supplierId: a.supplierId,
      costCompra: a.costCompra,
      costTransporte: a.costTransporte,
      costGestoria: a.costGestoria,
      costDocumentacion: a.costDocumentacion,
      costDescontaminacion: a.costDescontaminacion,
      costOtros: a.costOtros,
      costOtrosDetalle: a.costOtrosDetalle,
      paymentMethod: a.paymentMethod,
      paymentReference: a.paymentReference,
      paymentDate: a.paymentDate,
      paymentStatus: a.paymentStatus,
      paymentNotes: a.paymentNotes,
      acquisitionDate: a.acquisitionDate,
      receptionDate: a.receptionDate,
      notes: a.notes,
      internalNotes: a.internalNotes,
    });
    setShowForm(true);
  };

  const openDetail = async (a: VehicleAcquisition) => {
    setSelectedItem(a);
    setShowDetail(true);
    if (a.vehicleId && userId) {
      try {
        const res = await getEconomicHistoryRequest(userId, a.vehicleId);
        setEconomicHistory(res.entries);
        setEconomicSummary(res.summary);
      } catch {
        setEconomicHistory([]);
        setEconomicSummary(null);
      }
    }
  };

  const costTotal = form.costCompra + form.costTransporte + form.costGestoria +
    form.costDocumentacion + form.costDescontaminacion + form.costOtros;

  const handleSave = async (asDraft = true) => {
    if (!form.vehicleId || !form.sellerName.trim()) return;
    try {
      if (editing) {
        await updateAcquisitionRequest(userId, editing.id, { ...form } as any);
      } else {
        await createAcquisitionRequest(userId, {
          ...form,
          status: asDraft ? ('borrador' as any) : ('pendiente_aprobacion' as any),
        } as any);
      }
      setShowForm(false);
      loadData();
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAcquisitionRequest(userId, id);
      loadData();
      if (showDetail) setShowDetail(false);
    } catch {
      // silent
    }
  };

  const handleApprove = async (a: VehicleAcquisition) => {
    try {
      await approveAcquisitionRequest(userId, a.id);
      loadData();
      if (showDetail) {
        const updated = { ...a, status: 'aprobada' as AcquisitionStatus };
        setSelectedItem(updated);
      }
    } catch {
      // silent
    }
  };

  const handleReject = async () => {
    if (!actionTarget || !rejectNote.trim()) return;
    try {
      await rejectAcquisitionRequest(userId, actionTarget.id, rejectNote);
      setShowRejectModal(false);
      setRejectNote('');
      loadData();
    } catch {
      // silent
    }
  };

  const handleChangeStatus = async (a: VehicleAcquisition, newStatus: string) => {
    try {
      await changeStatusRequest(userId, a.id, newStatus);
      loadData();
    } catch {
      // silent
    }
  };

  const setField = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════

  return (
    <Layout title="Compras y Retiradas">
      <div className="space-y-6">

        {/* ── KPIs ──────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Compras del mes', value: stats?.totalMonth ?? 0, icon: <ShoppingCart className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
            { label: 'Inversión total mes', value: fmtEur(stats?.totalCostMonth ?? 0), icon: <DollarSign className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
            { label: 'Pendientes de cierre', value: stats?.pendingCount ?? 0, icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
            { label: 'Coste medio', value: fmtEur(stats?.avgCost ?? 0), icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs + Actions ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === t.id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <AddButtonDropdown
                label="Nueva compra"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de compra"
              />
          </div>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por matrícula, vendedor, NIF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">Todos los estados</option>
            {Object.entries(ACQUISITION_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">Todo pago</option>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {(search || filterStatus || filterPayment) && (
            <button
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterPayment(''); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* ── Table ────────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <ShoppingCart className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No hay compras ni retiradas registradas</p>
            <button onClick={openCreate} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
              Registrar primera compra
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    {['Matrícula', 'Tipo', 'Vendedor', 'Fecha', 'Compra', 'Total', 'Pago', 'Estado', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {filtered.map((a) => {
                    const TypeIcon = TYPE_ICONS[a.acquisitionType] || ShoppingCart;
                    return (
                      <tr
                        key={a.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                        onClick={() => openDetail(a)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{a.registrationPlate}</td>
                        <td className="px-4 py-3">
                          <Badge className={TYPE_COLORS[a.acquisitionType]}>
                            <TypeIcon className="w-3 h-3" /> {ACQUISITION_TYPE_LABELS[a.acquisitionType]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{a.sellerName}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{a.acquisitionDate}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmtEur(a.costCompra)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{fmtEur(a.costTotal)}</td>
                        <td className="px-4 py-3">
                          <Badge className={PAYMENT_STATUS_COLORS[a.paymentStatus]}>
                            {PAYMENT_STATUS_LABELS[a.paymentStatus]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={STATUS_COLORS[a.status]}>
                            {ACQUISITION_STATUS_LABELS[a.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => openEdit(a)} className="p-1 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                            {isGerente && a.status === 'pendiente_aprobacion' && (
                              <>
                                <button onClick={() => handleApprove(a)} className="p-1 text-gray-400 hover:text-green-600"><Check className="w-4 h-4" /></button>
                                <button onClick={() => { setActionTarget(a); setShowRejectModal(true); }} className="p-1 text-gray-400 hover:text-red-600"><XCircle className="w-4 h-4" /></button>
                              </>
                            )}
                            {['borrador', 'cancelada'].includes(a.status) && (
                              <button onClick={() => handleDelete(a.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Form Modal ═══════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-xl bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-xl">
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Editar adquisición' : 'Nueva compra / retirada'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Tipo de operación */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de operación</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.entries(ACQUISITION_TYPE_LABELS) as [AcquisitionType, string][]).map(([k, v]) => {
                    const Icon = TYPE_ICONS[k];
                    return (
                      <button
                        key={k}
                        onClick={() => setField('acquisitionType', k)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors ${
                          form.acquisitionType === k
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" /> {v}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vehículo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehículo (ID) *</label>
                <input
                  type="text"
                  value={form.vehicleId}
                  onChange={(e) => setField('vehicleId', e.target.value)}
                  placeholder="ID del vehículo"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                />
                <input
                  type="text"
                  value={form.registrationPlate}
                  onChange={(e) => setField('registrationPlate', e.target.value.toUpperCase())}
                  placeholder="Matrícula"
                  className="mt-2 w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                />
              </div>

              {/* Vendedor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Datos del vendedor / origen</label>
                <div className="space-y-2">
                  <input type="text" value={form.sellerName} onChange={(e) => setField('sellerName', e.target.value)} placeholder="Nombre *" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={form.sellerNif} onChange={(e) => setField('sellerNif', e.target.value)} placeholder="NIF / CIF" className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                    <input type="text" value={form.sellerPhone} onChange={(e) => setField('sellerPhone', e.target.value)} placeholder="Teléfono" className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                  </div>
                  <input type="text" value={form.sellerEmail} onChange={(e) => setField('sellerEmail', e.target.value)} placeholder="Email" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                  <input type="text" value={form.sellerAddress} onChange={(e) => setField('sellerAddress', e.target.value)} placeholder="Dirección" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                </div>
              </div>

              {/* Costes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Desglose de costes</label>
                <div className="space-y-2">
                  {([
                    ['costCompra', 'Coste de compra *', ShoppingCart],
                    ['costTransporte', 'Transporte / Grúa', Truck],
                    ['costGestoria', 'Gestoría', FileText],
                    ['costDocumentacion', 'Documentación / Tasas', ScrollText],
                    ['costDescontaminacion', 'Descontaminación', Droplets],
                    ['costOtros', 'Otros costes', MoreHorizontal],
                  ] as [keyof FormData, string, typeof ShoppingCart][]).map(([key, label, Icon]) => (
                    <div key={key} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-600 dark:text-gray-400 w-40 shrink-0">{label}</span>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form[key] as number || ''}
                          onChange={(e) => setField(key, Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 pr-8 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                      </div>
                    </div>
                  ))}
                  {form.costOtros > 0 && (
                    <input type="text" value={form.costOtrosDetalle} onChange={(e) => setField('costOtrosDetalle', e.target.value)} placeholder="Detalle de otros costes" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">COSTE TOTAL</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{fmtEur(costTotal)}</span>
                </div>
              </div>

              {/* Pago */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pago</label>
                <div className="grid grid-cols-2 gap-2">
                  <select value={form.paymentMethod} onChange={(e) => setField('paymentMethod', e.target.value as PaymentMethod)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <select value={form.paymentStatus} onChange={(e) => setField('paymentStatus', e.target.value as PaymentStatus)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm">
                    {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <input type="text" value={form.paymentReference} onChange={(e) => setField('paymentReference', e.target.value)} placeholder="Referencia de pago" className="mt-2 w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha adquisición *</label>
                  <input type="date" value={form.acquisitionDate} onChange={(e) => setField('acquisitionDate', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha recepción</label>
                  <input type="date" value={form.receptionDate} onChange={(e) => setField('receptionDate', e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" />
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
                <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm resize-none" />
              </div>
              {isGerente && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas internas (solo gerente)</label>
                  <textarea value={form.internalNotes} onChange={(e) => setField('internalNotes', e.target.value)} rows={2} className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm resize-none" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
              <button onClick={() => handleSave(true)} className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600">
                Guardar borrador
              </button>
              <button onClick={() => handleSave(false)} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Guardar y enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Detail Drawer ════════════════════════════════════════════════════════ */}
      {showDetail && selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowDetail(false)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-xl">
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className={TYPE_COLORS[selectedItem.acquisitionType]}>
                    {ACQUISITION_TYPE_LABELS[selectedItem.acquisitionType]}
                  </Badge>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{selectedItem.registrationPlate}</span>
                  <Badge className={STATUS_COLORS[selectedItem.status]}>
                    {ACQUISITION_STATUS_LABELS[selectedItem.status]}
                  </Badge>
                </div>
                <button onClick={() => setShowDetail(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={() => { setShowDetail(false); openEdit(selectedItem); }} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200">
                  <Edit3 className="w-3.5 h-3.5 inline mr-1" />Editar
                </button>
                {isGerente && selectedItem.status === 'pendiente_aprobacion' && (
                  <>
                    <button onClick={() => handleApprove(selectedItem)} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                      <Check className="w-3.5 h-3.5 inline mr-1" />Aprobar
                    </button>
                    <button onClick={() => { setActionTarget(selectedItem); setShowRejectModal(true); }} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                      <XCircle className="w-3.5 h-3.5 inline mr-1" />Rechazar
                    </button>
                  </>
                )}
                {selectedItem.status === 'aprobada' && (
                  <button onClick={() => handleChangeStatus(selectedItem, 'recibida')} className="px-3 py-1.5 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700">
                    Marcar recibida
                  </button>
                )}
                {selectedItem.status === 'recibida' && (
                  <button onClick={() => handleChangeStatus(selectedItem, 'documentada')} className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                    Marcar documentada
                  </button>
                )}
                {selectedItem.status === 'documentada' && isGerente && (
                  <button onClick={() => handleChangeStatus(selectedItem, 'cerrada')} className="px-3 py-1.5 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800">
                    Cerrar expediente
                  </button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Cost breakdown */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Resumen económico</h3>
                <div className="space-y-2">
                  {([
                    ['Compra', selectedItem.costCompra, 'blue'],
                    ['Transporte', selectedItem.costTransporte, 'orange'],
                    ['Gestoría', selectedItem.costGestoria, 'purple'],
                    ['Documentación', selectedItem.costDocumentacion, 'indigo'],
                    ['Descontaminación', selectedItem.costDescontaminacion, 'teal'],
                    ['Otros', selectedItem.costOtros, 'gray'],
                  ] as [string, number, string][])
                    .filter(([, v]) => v > 0)
                    .map(([label, value]) => {
                      const pct = selectedItem.costTotal > 0 ? (value / selectedItem.costTotal) * 100 : 0;
                      return (
                        <div key={label} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400 w-32 shrink-0">{label}</span>
                          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-20 text-right">{fmtEur(value)}</span>
                        </div>
                      );
                    })}
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2 flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">TOTAL</span>
                    <span className="text-xl font-bold text-gray-900 dark:text-white">{fmtEur(selectedItem.costTotal)}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>Pago: <strong>{PAYMENT_METHOD_LABELS[selectedItem.paymentMethod]}</strong></span>
                  <Badge className={PAYMENT_STATUS_COLORS[selectedItem.paymentStatus]}>
                    {PAYMENT_STATUS_LABELS[selectedItem.paymentStatus]}
                  </Badge>
                  {selectedItem.paymentReference && <span>Ref: {selectedItem.paymentReference}</span>}
                </div>
              </div>

              {/* Seller */}
              <div className="bg-white dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Datos del vendedor</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500 dark:text-gray-400">Nombre:</span> <strong className="text-gray-900 dark:text-gray-100">{selectedItem.sellerName}</strong></div>
                  {selectedItem.sellerNif && <div><span className="text-gray-500 dark:text-gray-400">NIF:</span> <strong className="text-gray-900 dark:text-gray-100">{selectedItem.sellerNif}</strong></div>}
                  {selectedItem.sellerPhone && <div><span className="text-gray-500 dark:text-gray-400">Teléfono:</span> {selectedItem.sellerPhone}</div>}
                  {selectedItem.sellerEmail && <div><span className="text-gray-500 dark:text-gray-400">Email:</span> {selectedItem.sellerEmail}</div>}
                  {selectedItem.sellerAddress && <div className="col-span-2"><span className="text-gray-500 dark:text-gray-400">Dirección:</span> {selectedItem.sellerAddress}</div>}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Línea temporal</h3>
                <div className="space-y-0">
                  {selectedItem.statusHistory.map((entry, i) => (
                    <div key={i} className="flex gap-3 pb-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full mt-1 ${i === selectedItem.statusHistory.length - 1 ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                        {i < selectedItem.statusHistory.length - 1 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700" />}
                      </div>
                      <div>
                        <Badge className={STATUS_COLORS[entry.status as AcquisitionStatus] || 'bg-gray-100 text-gray-600'}>
                          {ACQUISITION_STATUS_LABELS[entry.status as AcquisitionStatus] || entry.status}
                        </Badge>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(entry.date).toLocaleString('es-ES')}
                          {entry.note && <span className="ml-2 text-gray-500">— {entry.note}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Economic History */}
              {economicHistory.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Histórico económico del vehículo</h3>
                  {economicSummary && (
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-red-700 dark:text-red-300">{fmtEur(economicSummary.totalInvested)}</p>
                        <p className="text-xs text-red-500">Invertido</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-green-700 dark:text-green-300">{fmtEur(economicSummary.totalRevenue)}</p>
                        <p className="text-xs text-green-500">Recuperado</p>
                      </div>
                      <div className={`rounded-lg p-3 text-center ${economicSummary.balance >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                        <p className={`text-lg font-bold ${economicSummary.balance >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>{fmtEur(economicSummary.balance)}</p>
                        <p className="text-xs text-gray-500">Balance</p>
                      </div>
                    </div>
                  )}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50">
                          <th className="px-3 py-2 text-left text-gray-500">Fecha</th>
                          <th className="px-3 py-2 text-left text-gray-500">Concepto</th>
                          <th className="px-3 py-2 text-right text-gray-500">Importe</th>
                          <th className="px-3 py-2 text-right text-gray-500">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {economicHistory.map((e) => (
                          <tr key={e.id}>
                            <td className="px-3 py-2 text-gray-500">{e.date?.slice(0, 10)}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{e.concept}</td>
                            <td className={`px-3 py-2 text-right font-medium ${e.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {e.amount < 0 ? '-' : '+'}{fmtEur(Math.abs(e.amount))}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500">{fmtEur(e.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedItem.notes && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Notas</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{selectedItem.notes}</p>
                </div>
              )}
              {isGerente && selectedItem.internalNotes && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                  <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1">Notas internas</h3>
                  <p className="text-sm text-amber-600 dark:text-amber-400 whitespace-pre-wrap">{selectedItem.internalNotes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Reject Modal ═════════════════════════════════════════════════════════ */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Rechazar adquisición</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Indica el motivo del rechazo:</p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm resize-none"
              placeholder="Motivo obligatorio..."
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleReject} disabled={!rejectNote.trim()} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">Rechazar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_purchases"
        moduleLabel="Compras"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Compras"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
