import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, Trash2, Filter, DollarSign, TrendingUp,
  Clock, Award, FileText, Users, Receipt, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type Periodo = 'semanal' | 'quincenal' | 'mensual';
type BillingStatus = 'pendiente' | 'liquidada' | 'pagada';

interface Billing extends VerticalEntity {
  conductor: string;
  periodo: Periodo;
  carrerasRealizadas: number;
  kmTotales: number;
  recaudacionBruta: number;
  comisionEmpresaPct: number;
  importeEmpresa: number;
  importeConductor: number;
  estado: BillingStatus;
}

const PERIODO_CFG: Record<Periodo, { label: string; bg: string; text: string }> = {
  semanal:    { label: 'Semanal',    bg: 'bg-blue-100 dark:bg-blue-900/40',    text: 'text-blue-700 dark:text-blue-300' },
  quincenal:  { label: 'Quincenal',  bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300' },
  mensual:    { label: 'Mensual',    bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-300' },
};

const STATUS_CFG: Record<BillingStatus, { label: string; dot: string }> = {
  pendiente: { label: 'Pendiente', dot: 'bg-amber-500' },
  liquidada: { label: 'Liquidada', dot: 'bg-blue-500' },
  pagada:    { label: 'Pagada',    dot: 'bg-emerald-500' },
};

type BillingForm = Omit<Billing, keyof VerticalEntity>;

const EMPTY_FORM: BillingForm = {
  conductor: '', periodo: 'mensual', carrerasRealizadas: 0, kmTotales: 0,
  recaudacionBruta: 0, comisionEmpresaPct: 20, importeEmpresa: 0, importeConductor: 0, estado: 'pendiente',
};

export function TaxiBilling() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Billing>('taxi', 'billing'), []);
  const userId = user?.id || user?._id || '';

  const [items, setItems] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState<Periodo | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<BillingStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  useModalClose(showModal, () => setShowModal(false));
  const [editing, setEditing] = useState<Billing | null>(null);
  const [form, setForm] = useState<BillingForm>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'driver', label: 'Conductor' },
    { key: 'date', label: 'Fecha' },
    { key: 'amount', label: 'Importe' },
    { key: 'trips', label: 'Carreras' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'driver', label: 'Conductor', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'trips', label: 'Carreras', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} liquidación(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} liquidación(s) importado(s)`);
  };

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => items.filter(b => {
    if (search && !b.conductor.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPeriodo !== 'all' && b.periodo !== filterPeriodo) return false;
    if (filterStatus !== 'all' && b.estado !== filterStatus) return false;
    return true;
  }), [items, search, filterPeriodo, filterStatus]);

  const stats = useMemo(() => {
    const recaudacionMes = items.reduce((s, b) => s + b.recaudacionBruta, 0);
    const pendientes = items.filter(b => b.estado === 'pendiente').length;
    const comisionMedia = items.length ? items.reduce((s, b) => s + b.comisionEmpresaPct, 0) / items.length : 0;
    const top = [...items].sort((a, b) => b.recaudacionBruta - a.recaudacionBruta)[0]?.conductor || 'N/A';
    return { recaudacionMes, pendientes, comisionMedia, top };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (b: Billing) => {
    setEditing(b);
    setForm({ conductor: b.conductor, periodo: b.periodo, carrerasRealizadas: b.carrerasRealizadas, kmTotales: b.kmTotales, recaudacionBruta: b.recaudacionBruta, comisionEmpresaPct: b.comisionEmpresaPct, importeEmpresa: b.importeEmpresa, importeConductor: b.importeConductor, estado: b.estado });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.conductor.trim() || !userId) return;
    const importeEmpresa = (form.recaudacionBruta * form.comisionEmpresaPct) / 100;
    const importeConductor = form.recaudacionBruta - importeEmpresa;
    const final = { ...form, importeEmpresa, importeConductor };
    try {
      if (editing) {
        await api.update(userId, editing._id, final);
      } else {
        await api.create(userId, final);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error shown by fetch layer / consola */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer / consola */
    }
  };

  const STAT_CARDS = [
    { label: 'Recaudación Mes', value: `€${stats.recaudacionMes.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Liquidaciones Pendientes', value: stats.pendientes, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Comisión Media', value: `${stats.comisionMedia.toFixed(1)}%`, icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Conductor Top', value: stats.top, icon: Award, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Facturación y Liquidaciones">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por conductor..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterPeriodo} onChange={e => setFilterPeriodo(e.target.value as Periodo | 'all')} disabled={loading}>
                <option value="all">Todos los períodos</option>
                {Object.entries(PERIODO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as BillingStatus | 'all')} disabled={loading}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva Liquidación"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de liquidación"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Conductor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Período</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Carreras</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Km</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Recaud. Bruta</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Comisión %</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Imp. Empresa</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Imp. Conductor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(b => (
                <tr key={b._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white"><span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gray-400" />{b.conductor}</span></td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PERIODO_CFG[b.periodo].bg} ${PERIODO_CFG[b.periodo].text}`}>{PERIODO_CFG[b.periodo].label}</span></td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{b.carrerasRealizadas}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{b.kmTotales.toLocaleString('es-ES')}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">€{b.recaudacionBruta.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{b.comisionEmpresaPct}%</td>
                  <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">€{b.importeEmpresa.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">€{b.importeConductor.toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CFG[b.estado].dot}`} />{STATUS_CFG[b.estado].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(b._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron liquidaciones con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Liquidación' : 'Nueva Liquidación'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Conductor *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.conductor} onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Período</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value as Periodo }))}>
                    {Object.entries(PERIODO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as BillingStatus }))}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Carreras Realizadas</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.carrerasRealizadas} onChange={e => setForm(f => ({ ...f, carrerasRealizadas: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Km Totales</label>
                  <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.kmTotales} onChange={e => setForm(f => ({ ...f, kmTotales: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Recaudación Bruta (€)</label>
                  <input type="number" step="0.01" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.recaudacionBruta} onChange={e => setForm(f => ({ ...f, recaudacionBruta: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Comisión Empresa (%)</label>
                  <input type="number" min="0" max="100" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.comisionEmpresaPct} onChange={e => setForm(f => ({ ...f, comisionEmpresaPct: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Importe Empresa:</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">€{((form.recaudacionBruta * form.comisionEmpresaPct) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500 dark:text-gray-400">Importe Conductor:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">€{(form.recaudacionBruta - (form.recaudacionBruta * form.comisionEmpresaPct) / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Liquidación'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="taxi_billing"
        moduleLabel="Liquidaciones"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Liquidaciones"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
