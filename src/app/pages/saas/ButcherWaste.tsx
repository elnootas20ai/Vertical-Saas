import { useState, useEffect, useCallback, useMemo } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Filter, Eye, CheckCircle2,
  TrendingDown, Scale, AlertTriangle, CalendarDays, Percent, Loader2,
} from 'lucide-react';
import {
  type ButcherWasteRecord,
  type WasteType,
  type ReviewStatus,
  type WasteSummary,
  WASTE_TYPE_LABELS,
  WASTE_TYPE_COLORS,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLORS,
  listButcherWasteRequest,
  createButcherWasteRequest,
  reviewButcherWasteRequest,
  getButcherWasteSummaryRequest,
} from '../../lib/butcherWasteApi';

const HOY = new Date().toISOString().slice(0, 10);

const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-green-500',
  medium: 'text-yellow-500',
  high: 'text-orange-500',
  critical: 'text-red-500',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

interface WasteForm {
  date: string;
  productName: string;
  catalogItemName: string;
  batchId: string;
  wasteKg: number;
  wasteType: WasteType;
  reason: string;
  category: string;
  estimatedCost: number;
  notes: string;
}

const EMPTY_FORM: WasteForm = {
  date: HOY, productName: '', catalogItemName: '', batchId: '', wasteKg: 0,
  wasteType: 'hueso', reason: '', category: '', estimatedCost: 0, notes: '',
};

function fmt(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function ButcherWaste() {
  const { user } = useAuth();
  const userId = user?.user_id || '';

  const [items, setItems] = useState<ButcherWasteRecord[]>([]);
  const [summary, setSummary] = useState<WasteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<WasteType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<WasteForm>(EMPTY_FORM);

  const [showReview, setShowReview] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ButcherWasteRecord | null>(null);
  const [reviewForm, setReviewForm] = useState<{ reviewStatus: ReviewStatus; reviewNotes: string }>({ reviewStatus: 'approved', reviewNotes: '' });

  useModalClose(showModal, () => setShowModal(false));
  useModalClose(showReview, () => setShowReview(false));

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const params: { wasteType?: string; reviewStatus?: string; dateFrom?: string; dateTo?: string } = {};
      if (filterType !== 'all') params.wasteType = filterType;
      if (filterStatus !== 'all') params.reviewStatus = filterStatus;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const [wasteRes, summaryRes] = await Promise.all([
        listButcherWasteRequest(userId, params),
        getButcherWasteSummaryRequest(userId, dateFrom || undefined, dateTo || undefined),
      ]);
      setItems(wasteRes.waste || wasteRes.records || []);
      setSummary(summaryRes.summary || summaryRes || null);
    } catch {
      setError('Error al cargar los datos de merma.');
    } finally {
      setLoading(false);
    }
  }, [userId, filterType, filterStatus, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(e =>
      e.productName?.toLowerCase().includes(q) ||
      e.batchId?.toLowerCase().includes(q) ||
      e.registeredByName?.toLowerCase().includes(q) ||
      e.catalogItemName?.toLowerCase().includes(q),
    );
  }, [items, search]);

  const todayItems = useMemo(() => items.filter(e => e.date?.startsWith(HOY)), [items]);
  const todayKg = useMemo(() => todayItems.reduce((s, e) => s + (e.wasteKg || 0), 0), [todayItems]);
  const todayCost = useMemo(() => todayItems.reduce((s, e) => s + (e.estimatedCost || 0), 0), [todayItems]);

  const openCreate = () => { setForm(EMPTY_FORM); setShowModal(true); };

  const handleSave = async () => {
    if (!form.productName.trim()) return;
    setSaving(true);
    try {
      await createButcherWasteRequest(userId, {
        date: form.date,
        productName: form.productName,
        catalogItemName: form.catalogItemName,
        batchId: form.batchId,
        wasteKg: form.wasteKg,
        wasteType: form.wasteType,
        reason: form.reason,
        category: form.category,
        estimatedCost: form.estimatedCost,
        notes: form.notes,
        registeredBy: userId,
        registeredByName: user?.fullName || '',
      });
      setShowModal(false);
      loadData();
    } catch {
      setError('Error al registrar la merma.');
    } finally {
      setSaving(false);
    }
  };

  const openReview = (record: ButcherWasteRecord) => {
    setReviewTarget(record);
    setReviewForm({ reviewStatus: 'approved', reviewNotes: '' });
    setShowReview(true);
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setSaving(true);
    try {
      await reviewButcherWasteRequest(userId, reviewTarget._id || reviewTarget.id, {
        reviewStatus: reviewForm.reviewStatus,
        reviewNotes: reviewForm.reviewNotes,
        reviewedBy: userId,
        reviewedByName: user?.fullName || '',
      });
      setShowReview(false);
      loadData();
    } catch {
      setError('Error al revisar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const STAT_CARDS = [
    { label: 'Merma hoy', value: `${todayKg.toFixed(1)} kg`, icon: Scale, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Coste hoy', value: fmt(todayCost), icon: TrendingDown, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Merma periodo', value: `${(summary?.totalWasteKg ?? 0).toFixed(1)} kg`, icon: CalendarDays, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Coste periodo', value: fmt(summary?.totalCost ?? 0), icon: AlertTriangle, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30' },
    { label: '% Merma', value: `${(summary?.wastePct ?? 0).toFixed(1)}%`, icon: Percent, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  ];

  return (
    <Layout title="Merma y Pérdidas">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{loading ? '—' : s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
          <button type="button" onClick={() => setError('')} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
          <div className="relative flex-1 w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm"
              placeholder="Buscar producto, lote, responsable..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                value={filterType}
                onChange={e => setFilterType(e.target.value as WasteType | 'all')}
              >
                <option value="all">Todos los tipos</option>
                {(Object.keys(WASTE_TYPE_LABELS) as WasteType[]).map(k => <option key={k} value={k}>{WASTE_TYPE_LABELS[k]}</option>)}
              </select>
            </div>
            <select
              className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as ReviewStatus | 'all')}
            >
              <option value="all">Todos los estados</option>
              {(Object.keys(REVIEW_STATUS_LABELS) as ReviewStatus[]).map(k => <option key={k} value={k}>{REVIEW_STATUS_LABELS[k]}</option>)}
            </select>
            <input
              type="date"
              className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="Desde"
            />
            <input
              type="date"
              className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              title="Hasta"
            />
            <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">
              <Plus className="w-4 h-4" /> Registrar merma
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando registros...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Producto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Lote</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Peso (kg)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Coste</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo merma</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado revisión</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Responsable</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e._id || e.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{e.date?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <span className="text-gray-900 dark:text-white font-semibold">{e.productName}</span>
                      {e.severity && (
                        <span className={`ml-2 text-[11px] font-semibold ${SEVERITY_COLORS[e.severity] || 'text-gray-400'}`} title={`Severidad: ${SEVERITY_LABELS[e.severity] || e.severity}`}>
                          ● {SEVERITY_LABELS[e.severity] || e.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400">{e.batchId || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{(e.wasteKg ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">{fmt(e.estimatedCost ?? 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${WASTE_TYPE_COLORS[e.wasteType] || 'bg-gray-100 text-gray-700'}`}>
                        {WASTE_TYPE_LABELS[e.wasteType] || e.wasteType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${REVIEW_STATUS_COLORS[e.reviewStatus] || 'bg-gray-100 text-gray-700'}`}>
                        {REVIEW_STATUS_LABELS[e.reviewStatus] || e.reviewStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{e.registeredByName || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {e.reviewStatus === 'pending' && (
                          <button type="button" onClick={() => openReview(e)} className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-gray-500 hover:text-green-600 transition" title="Revisar">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button type="button" onClick={() => openReview(e)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition" title="Ver detalle">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay registros de merma.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Registrar merma</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo de merma</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.wasteType} onChange={e => setForm(f => ({ ...f, wasteType: e.target.value as WasteType }))}>
                    {(Object.keys(WASTE_TYPE_LABELS) as WasteType[]).map(k => <option key={k} value={k}>{WASTE_TYPE_LABELS[k]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Producto *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="Ej. Solomillo de ternera" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Categoría</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Ej. Vacuno" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Lote</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.batchId} onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))} placeholder="Ej. LOT-2026-0412" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Peso (kg)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.wasteKg} onChange={e => setForm(f => ({ ...f, wasteKg: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Coste est. (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Motivo</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Descripción del motivo de merma" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Observaciones</label>
                <textarea className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 inline-flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Registrar merma
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      {showReview && reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowReview(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Revisar registro de merma</h2>
              <button type="button" onClick={() => setShowReview(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Producto</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{reviewTarget.productName}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Fecha</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{reviewTarget.date?.slice(0, 10)}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Peso</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{(reviewTarget.wasteKg ?? 0).toFixed(2)} kg</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Coste estimado</span>
                  <p className="font-semibold text-red-600 dark:text-red-400">{fmt(reviewTarget.estimatedCost ?? 0)}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Tipo</span>
                  <p><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${WASTE_TYPE_COLORS[reviewTarget.wasteType] || ''}`}>{WASTE_TYPE_LABELS[reviewTarget.wasteType] || reviewTarget.wasteType}</span></p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Lote</span>
                  <p className="font-mono text-gray-900 dark:text-white">{reviewTarget.batchId || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Registrado por</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{reviewTarget.registeredByName || '—'}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Severidad</span>
                  <p className={`font-semibold ${SEVERITY_COLORS[reviewTarget.severity] || 'text-gray-500'}`}>{SEVERITY_LABELS[reviewTarget.severity] || reviewTarget.severity || '—'}</p>
                </div>
              </div>
              {reviewTarget.reason && (
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Motivo</span>
                  <p className="text-gray-900 dark:text-white">{reviewTarget.reason}</p>
                </div>
              )}
              {reviewTarget.notes && (
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Observaciones</span>
                  <p className="text-gray-900 dark:text-white">{reviewTarget.notes}</p>
                </div>
              )}

              {reviewTarget.reviewStatus === 'pending' && (
                <>
                  <hr className="border-gray-200 dark:border-gray-700" />
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Decisión</label>
                    <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={reviewForm.reviewStatus} onChange={e => setReviewForm(f => ({ ...f, reviewStatus: e.target.value as ReviewStatus }))}>
                      <option value="approved">Aprobar</option>
                      <option value="rejected">Rechazar</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas de revisión</label>
                    <textarea className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 resize-none" rows={2} value={reviewForm.reviewNotes} onChange={e => setReviewForm(f => ({ ...f, reviewNotes: e.target.value }))} placeholder="Notas opcionales sobre la revisión..." />
                  </div>
                </>
              )}

              {reviewTarget.reviewStatus !== 'pending' && reviewTarget.reviewedByName && (
                <div className="text-sm border-t border-gray-200 dark:border-gray-700 pt-4">
                  <span className="text-gray-500 dark:text-gray-400">Revisado por</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{reviewTarget.reviewedByName} — {reviewTarget.reviewedAt?.slice(0, 10)}</p>
                  {reviewTarget.reviewNotes && <p className="text-gray-600 dark:text-gray-400 mt-1">{reviewTarget.reviewNotes}</p>}
                </div>
              )}
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowReview(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cerrar</button>
              {reviewTarget.reviewStatus === 'pending' && (
                <button type="button" onClick={handleReview} disabled={saving} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 inline-flex items-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar revisión
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
