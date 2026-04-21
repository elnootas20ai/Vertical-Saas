import { useState, useMemo, useEffect, useCallback } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Edit3, Banknote, Clock, CheckCircle2, AlertTriangle, Wallet,
  Receipt, Hammer, Truck, FileText, Ban, CreditCard, MoreHorizontal, LayoutGrid,
  TableIcon, ChevronDown, Info,
} from 'lucide-react';
import type {
  ConstructionPayment, ConstructionProject, ConstructionGuild, PaymentInstallment, PaymentPhase,
} from '../../lib/constructionApi';
import {
  listPayments, createPayment, updatePayment, deletePayment, registerPaymentInstallment,
  cancelPaymentLine, updatePaymentPhases, getPaymentsSummary, listConstructionProjects, listConstructionGuilds,
  PAYMENT_STATUS_CONFIG, PAYMENT_LINE_TYPE_CONFIG,
} from '../../lib/constructionApi';
import type { PaymentGlobalSummary } from '../../lib/constructionApi';
import { toast } from 'sonner';

import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const ADMIN_ROLES = ['owner', 'admin', 'manager'];

const tipoIcons = { gremio: Hammer, proveedor: Truck, gasto_general: FileText } as const;
const estadoBadge = (estado: string) => {
  const cfg = PAYMENT_STATUS_CONFIG[estado as keyof typeof PAYMENT_STATUS_CONFIG] || PAYMENT_STATUS_CONFIG.pendiente;
  const colors: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    emerald: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    gray: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  };
  return { label: cfg.label, className: colors[cfg.color] || colors.gray };
};

export function ConstructionPayments() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const userRole = (user as Record<string, unknown>)?.role as string || 'owner';
  const isManager = ADMIN_ROLES.includes(userRole);

  const [payments, setPayments] = useState<ConstructionPayment[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [guilds, setGuilds] = useState<ConstructionGuild[]>([]);
  const [summary, setSummary] = useState<PaymentGlobalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterObra, setFilterObra] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionPayment | null>(null);
  const [payModal, setPayModal] = useState<ConstructionPayment | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000);
  };
  useModalClose(drawerOpen, () => setDrawerOpen(false));
  useModalClose(!!payModal, () => setPayModal(null));

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [p, proj, g, s] = await Promise.all([
        listPayments(userId, filterObra ? { projectId: filterObra } : undefined),
        listConstructionProjects(userId), listConstructionGuilds(userId),
        getPaymentsSummary(userId, filterObra || undefined),
      ]);
      setPayments(p); setProjects(proj); setGuilds(g); setSummary(s);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al cargar datos', 'error'); }
    setLoading(false);
  }, [userId, filterObra]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => payments.filter(p => {
    if (filterTipo && p.tipo !== filterTipo) return false;
    if (filterEstado && p.estado !== filterEstado) return false;
    if (search) {
      const q = search.toLowerCase();
      return [p.referencia, p.nombre, p.obraNombre, p.gremioNombre, p.proveedorNombre].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [payments, search, filterTipo, filterEstado]);

  const today = new Date().toISOString().slice(0, 10);

  if (!isManager) {
    return (
      <Layout title="Pagos internos">
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
          <Ban className="w-12 h-12 mb-4" />
          <p className="text-lg font-medium">Acceso restringido</p>
          <p className="text-sm">Solo los gerentes pueden ver pagos internos.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Pagos a gremios y subcontratas">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total pactado', value: fmt(summary?.totalPactado || 0), icon: Wallet, color: 'text-blue-500' },
          { label: 'Total pagado', value: fmt(summary?.totalPagado || 0), icon: CheckCircle2, color: 'text-emerald-500' },
          { label: 'Total pendiente', value: fmt(summary?.totalPendiente || 0), icon: Clock, color: (summary?.totalPendiente || 0) > 0 ? 'text-amber-500' : 'text-gray-400' },
          { label: 'Líneas vencidas', value: String(summary?.lineasVencidas || 0), icon: AlertTriangle, color: (summary?.lineasVencidas || 0) > 0 ? 'text-red-500' : 'text-gray-400' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por PAG-xxx, nombre, obra..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
        </div>
        <select value={filterObra} onChange={e => setFilterObra(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
          <option value="">Todas las obras</option>
          {projects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
        </select>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
          <option value="">Todos los tipos</option>
          {Object.entries(PAYMENT_LINE_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(PAYMENT_STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          <button onClick={() => setView('cards')} className={`p-2 ${view === 'cards' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'text-gray-500'}`}><LayoutGrid className="w-4 h-4" /></button>
          <button onClick={() => setView('table')} className={`p-2 ${view === 'table' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'text-gray-500'}`}><TableIcon className="w-4 h-4" /></button>
        </div>
        <AddButtonDropdown
                label="Nueva línea"
                onQuickAdd={() => { setEditing(null); setDrawerOpen(true); }}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de pago"
              />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Banknote className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay líneas de pago</p>
          <p className="text-sm mt-1">Crea la primera línea o acepta un presupuesto para generar automáticamente.</p>
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => {
            const badge = estadoBadge(p.estado);
            const TipoIcon = tipoIcons[p.tipo] || FileText;
            const isOverdue = p.fechaPrevista && p.fechaPrevista < today && p.estado !== 'pagado' && p.estado !== 'anulado';
            return (
              <div key={p._id} onClick={() => { setEditing(p); setDrawerOpen(true); }}
                className={`bg-white dark:bg-gray-800 rounded-xl border-2 p-4 cursor-pointer hover:shadow-md transition-all ${isOverdue ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-gray-500">{p.referencia}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>{badge.label}</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.nombre}</h3>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                  <TipoIcon className="w-3 h-3" /> {p.obraNombre || 'Sin obra'}
                </div>
                <div className="mt-3 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${p.importePactado > 0 ? Math.min(100, (p.totalPagado / p.importePactado) * 100) : 0}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>Pactado: {fmt(p.importePactado)}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Pend: {fmt(p.pendiente)}</span>
                </div>
                {isOverdue && <p className="text-xs text-red-500 mt-1 font-medium">⚠ Vencido el {p.fechaPrevista}</p>}
                {p.estado !== 'pagado' && p.estado !== 'anulado' && (
                  <button onClick={e => { e.stopPropagation(); setPayModal(p); }} className="mt-3 w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium">
                    Registrar pago
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border-2 border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                {['REF', 'Nombre', 'Tipo', 'Obra', 'Pactado', 'Pagado', 'Pendiente', 'Fecha', 'Estado', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.map(p => {
                const badge = estadoBadge(p.estado);
                const isOverdue = p.fechaPrevista && p.fechaPrevista < today && p.estado !== 'pagado' && p.estado !== 'anulado';
                return (
                  <tr key={p._id} onClick={() => { setEditing(p); setDrawerOpen(true); }}
                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isOverdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                    <td className="px-3 py-2 font-mono text-xs">{p.referencia}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">{p.nombre}</td>
                    <td className="px-3 py-2 text-xs">{PAYMENT_LINE_TYPE_CONFIG[p.tipo]?.label || p.tipo}</td>
                    <td className="px-3 py-2 text-xs">{p.obraNombre}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.importePactado)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{fmt(p.totalPagado)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(p.pendiente)}</td>
                    <td className={`px-3 py-2 text-xs ${isOverdue ? 'text-red-500 font-medium' : ''}`}>{p.fechaPrevista || '—'}</td>
                    <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span></td>
                    <td className="px-3 py-2">
                      {p.estado !== 'pagado' && p.estado !== 'anulado' && (
                        <button onClick={e => { e.stopPropagation(); setPayModal(p); }} className="text-xs text-blue-600 hover:underline">Pagar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800/50 font-medium text-sm">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right">Totales:</td>
                <td className="px-3 py-2 text-right">{fmt(filtered.reduce((s, p) => s + p.importePactado, 0))}</td>
                <td className="px-3 py-2 text-right text-emerald-600">{fmt(filtered.reduce((s, p) => s + p.totalPagado, 0))}</td>
                <td className="px-3 py-2 text-right">{fmt(filtered.reduce((s, p) => s + p.pendiente, 0))}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && <PaymentDrawer payment={editing} projects={projects} guilds={guilds} userId={userId}
        onClose={() => setDrawerOpen(false)} onSaved={() => { setDrawerOpen(false); load(); }} showToast={showToast} />}

      {/* Pay Modal */}
      {payModal && <RegisterPaymentModal payment={payModal} userId={userId}
        onClose={() => setPayModal(null)} onSaved={() => { setPayModal(null); load(); }} showToast={showToast} />}
    </Layout>
  );
}

// ─── DRAWER ────────────────────────────────────────────────────────────────────

function PaymentDrawer({ payment, projects, guilds, userId, onClose, onSaved, showToast }: {
  payment: ConstructionPayment | null; projects: ConstructionProject[]; guilds: ConstructionGuild[];
  userId: string; onClose: () => void; onSaved: () => void; showToast: (m: string, t: 'success' | 'error') => void;
}) {
  const isNew = !payment;
  const [tab, setTab] = useState<'datos' | 'fases' | 'pagos'>('datos');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: payment?.nombre || '', tipo: payment?.tipo || 'gremio',
    obraId: payment?.obraId || '', obraNombre: payment?.obraNombre || '',
    gremioId: payment?.gremioId || '', gremioNombre: payment?.gremioNombre || '',
    proveedorId: payment?.proveedorId || '', proveedorNombre: payment?.proveedorNombre || '',
    importePactado: payment?.importePactado || 0, fechaPrevista: payment?.fechaPrevista || '',
    observaciones: payment?.observaciones || '',
  });
  const [fases, setFases] = useState<PaymentPhase[]>(payment?.fases || []);

  const handleProjectChange = (id: string) => {
    const p = projects.find(pr => pr._id === id);
    setForm(f => ({ ...f, obraId: id, obraNombre: p?.nombre || '' }));
  };
  const handleGuildChange = (id: string) => {
    const g = guilds.find(gl => gl._id === id);
    setForm(f => ({ ...f, gremioId: id, gremioNombre: g?.nombre || '', nombre: f.nombre || `${g?.tipo || g?.nombre || ''} — ${g?.nombre || ''}` }));
  };

  const save = async () => {
    if (!form.nombre || !form.obraId || form.importePactado <= 0) { showToast('Completa nombre, obra e importe', 'error'); return; }
    setSaving(true);
    try {
      if (isNew) {
        await createPayment(userId, { ...form, fases } as Partial<ConstructionPayment>);
        showToast('Línea de pago creada');
      } else {
        await updatePayment(userId, { ...payment!, ...form, fases } as ConstructionPayment);
        showToast('Línea actualizada');
      }
      onSaved();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error', 'error'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!payment) return;
    if (!confirm('¿Eliminar esta línea de pago?')) return;
    try { await deletePayment(userId, payment._id); showToast('Línea eliminada'); onSaved(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Error', 'error'); }
  };

  const handleCancel = async () => {
    if (!payment) return;
    if (!confirm('¿Anular esta línea? Se conservará el histórico.')) return;
    try { await cancelPaymentLine(userId, payment._id); showToast('Línea anulada'); onSaved(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Error', 'error'); }
  };

  const saveFases = async () => {
    if (!payment) return;
    try { await updatePaymentPhases(userId, payment._id, fases); showToast('Fases actualizadas'); onSaved(); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Error', 'error'); }
  };

  const addFase = () => setFases(f => [...f, { id: `fase-${Date.now()}`, nombre: '', importe: 0, porcentaje: 0, completada: false, fechaPrevista: '' }]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{isNew ? 'Nueva línea de pago' : payment.referencia}</h2>
            {!isNew && <p className="text-sm text-gray-500">{payment.nombre}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
        </div>

        {!isNew && (
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-4 text-sm">
              <div><span className="text-gray-500">Pactado:</span> <span className="font-bold">{fmt(payment.importePactado)}</span></div>
              <div><span className="text-gray-500">Pagado:</span> <span className="font-bold text-emerald-600">{fmt(payment.totalPagado)}</span></div>
              <div><span className="text-gray-500">Pendiente:</span> <span className="font-bold text-amber-600">{fmt(payment.pendiente)}</span></div>
            </div>
            <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${payment.importePactado > 0 ? (payment.totalPagado / payment.importePactado) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['datos', ...(isNew ? [] : ['fases', 'pagos'])] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'datos' ? 'Datos' : t === 'fases' ? `Fases (${fases.length})` : `Pagos (${payment?.pagos?.length || 0})`}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'datos' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" placeholder="Ej: Fontanería — Instalación baños" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo *</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as ConstructionPayment['tipo'] }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    {Object.entries(PAYMENT_LINE_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Obra *</label>
                  <select value={form.obraId} onChange={e => handleProjectChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    <option value="">Seleccionar...</option>
                    {projects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
                  </select>
                </div>
              </div>
              {form.tipo === 'gremio' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Gremio</label>
                  <select value={form.gremioId} onChange={e => handleGuildChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    <option value="">Seleccionar...</option>
                    {guilds.map(g => <option key={g._id} value={g._id}>{g.nombre} ({g.tipo})</option>)}
                  </select>
                </div>
              )}
              {form.tipo === 'proveedor' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor</label>
                  <input value={form.proveedorNombre} onChange={e => setForm(f => ({ ...f, proveedorNombre: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" placeholder="Nombre del proveedor" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Importe pactado (€) *</label>
                  <input type="number" step="0.01" value={form.importePactado || ''} onChange={e => setForm(f => ({ ...f, importePactado: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha prevista</label>
                  <input type="date" value={form.fechaPrevista} onChange={e => setForm(f => ({ ...f, fechaPrevista: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
                <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
              </div>
            </div>
          )}

          {tab === 'fases' && payment && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Reparte el importe pactado ({fmt(payment.importePactado)}) por fases o hitos.</p>
              {fases.map((f, i) => (
                <div key={f.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={f.nombre} onChange={e => { const nf = [...fases]; nf[i] = { ...nf[i], nombre: e.target.value }; setFases(nf); }} placeholder={`Fase ${i + 1}`} className="flex-1 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                    <input type="number" step="0.01" value={f.importe || ''} onChange={e => { const nf = [...fases]; nf[i] = { ...nf[i], importe: Number(e.target.value) }; setFases(nf); }} className="w-28 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" placeholder="€" />
                    <button onClick={() => setFases(fases.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </div>
                  <input type="date" value={f.fechaPrevista} onChange={e => { const nf = [...fases]; nf[i] = { ...nf[i], fechaPrevista: e.target.value }; setFases(nf); }} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs" />
                  {f.completada && <span className="text-xs text-emerald-500 font-medium ml-2">✓ Completada</span>}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button onClick={addFase} className="text-sm text-blue-600 hover:underline">+ Añadir fase</button>
                <span className="text-xs text-gray-500">Total fases: {fmt(fases.reduce((s, f) => s + f.importe, 0))} / {fmt(payment.importePactado)}</span>
              </div>
              <button onClick={saveFases} className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Guardar fases</button>
            </div>
          )}

          {tab === 'pagos' && payment && (
            <div className="space-y-3">
              {(payment.pagos || []).length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No hay pagos registrados aún.</p>
              ) : (
                [...(payment.pagos || [])].reverse().map(inst => (
                  <div key={inst.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{fmt(inst.importe)}</p>
                        <p className="text-xs text-gray-500">{inst.concepto || 'Pago parcial'} · {inst.fechaPago || inst.fecha}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {inst.justificanteUrl || inst.facturaProveedorId ? (
                          <span className="text-xs text-emerald-500">✓ Justificante</span>
                        ) : (
                          <span className="text-xs text-amber-500">⚠ Sin justificante</span>
                        )}
                        <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">{inst.metodoPago || '—'}</span>
                      </div>
                    </div>
                    {inst.faseNombre && <p className="text-xs text-gray-400 mt-1">Fase: {inst.faseNombre}</p>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          {tab === 'datos' && (
            <>
              <button onClick={save} disabled={saving} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                {saving ? 'Guardando...' : isNew ? 'Crear' : 'Guardar'}
              </button>
              {!isNew && payment.estado !== 'pagado' && payment.estado !== 'anulado' && (
                <button onClick={handleCancel} className="py-2 px-4 border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm">Anular</button>
              )}
              {!isNew && payment.estado === 'pendiente' && !(payment.pagos || []).some(p => p.pagado) && (
                <button onClick={handleDelete} className="py-2 px-4 border border-gray-300 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-sm">Eliminar</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── REGISTER PAYMENT MODAL ────────────────────────────────────────────────────

function RegisterPaymentModal({ payment, userId, onClose, onSaved, showToast }: {
  payment: ConstructionPayment; userId: string;
  onClose: () => void; onSaved: () => void; showToast: (m: string, t: 'success' | 'error') => void;
}) {
  const [importe, setImporte] = useState(payment.pendiente);
  const [concepto, setConcepto] = useState('');
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPago, setMetodoPago] = useState('transferencia');
  const [faseId, setFaseId] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'supplier', label: 'Proveedor' },
    { key: 'project', label: 'Proyecto' },
    { key: 'amount', label: 'Importe' },
    { key: 'date', label: 'Fecha' },
    { key: 'concept', label: 'Concepto' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'supplier', label: 'Proveedor', example: '' },
    { key: 'project', label: 'Proyecto', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'concept', label: 'Concepto', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} pago(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} pago(s) importado(s)`);
  };


  const fases = (payment.fases || []).filter(f => !f.completada);

  const save = async () => {
    if (importe <= 0) { showToast('El importe debe ser mayor que 0', 'error'); return; }
    setSaving(true);
    try {
      const fase = payment.fases?.find(f => String(f.id) === faseId);
      await registerPaymentInstallment(userId, payment._id, {
        importe, concepto, fechaPago, metodoPago, faseId: faseId || '', faseNombre: fase?.nombre || '', notas,
      });
      const remaining = Number((payment.pendiente - importe).toFixed(2));
      showToast(remaining <= 0 ? '¡Línea completamente pagada!' : `Pago de ${fmt(importe)} registrado. Pendiente: ${fmt(remaining)}`);
      onSaved();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al registrar pago', 'error'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Registrar pago</h3>
            <p className="text-sm text-gray-500">{payment.referencia} — {payment.nombre}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Pactado:</span><span className="font-medium">{fmt(payment.importePactado)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Pagado:</span><span className="text-emerald-600">{fmt(payment.totalPagado)}</span></div>
          <div className="flex justify-between font-bold"><span>Pendiente:</span><span className="text-amber-600">{fmt(payment.pendiente)}</span></div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Importe (€) *</label>
            <input type="number" step="0.01" value={importe || ''} onChange={e => setImporte(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
            {importe > payment.pendiente && <p className="text-xs text-amber-500 mt-1">⚠ Supera el pendiente</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de pago</label>
              <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Método</label>
              <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                {['transferencia', 'efectivo', 'cheque', 'pagare', 'confirming', 'bizum', 'otro'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {fases.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fase</label>
              <select value={faseId} onChange={e => setFaseId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                <option value="">Sin fase específica</option>
                {fases.map(f => <option key={f.id} value={String(f.id)}>{f.nombre} ({fmt(f.importe)})</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Concepto</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Pago parcial fase 1" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">Cancelar</button>
          <button onClick={save} disabled={saving || importe <= 0} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
            {saving ? 'Registrando...' : `Pagar ${fmt(importe)}`}
          </button>
        </div>
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_payments"
        moduleLabel="Pagos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Pagos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
