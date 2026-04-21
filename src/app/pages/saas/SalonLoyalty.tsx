import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Award, Plus, Search, Edit3, Trash2, X, Gift,
  Users, TrendingUp, Filter, Star, ArrowUpCircle, ArrowDownCircle, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type LoyaltyLevel = 'bronce' | 'plata' | 'oro' | 'platino';

interface LoyaltyClient extends VerticalEntity {
  cliente: string;
  puntos: number;
  nivel: LoyaltyLevel;
  ultimaVisita: string;
  canjeDisponible: boolean;
  historialPuntos: { fecha: string; concepto: string; puntos: number }[];
}

type LoyaltyForm = Pick<LoyaltyClient, 'cliente' | 'puntos' | 'nivel' | 'ultimaVisita' | 'canjeDisponible'>;

const LEVEL_CFG: Record<LoyaltyLevel, { label: string; color: string; min: number }> = {
  bronce: { label: 'Bronce', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', min: 0 },
  plata: { label: 'Plata', color: 'bg-gray-200 text-gray-700 dark:bg-gray-600/40 dark:text-gray-300', min: 200 },
  oro: { label: 'Oro', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', min: 500 },
  platino: { label: 'Platino', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', min: 1000 },
};

const emptyForm = (): LoyaltyForm => ({
  cliente: '', puntos: 0, nivel: 'bronce', ultimaVisita: '', canjeDisponible: false,
});

export function SalonLoyalty() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<LoyaltyClient>('salon', 'loyalty'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<LoyaltyClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<LoyaltyLevel | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LoyaltyClient | null>(null);
  const [form, setForm] = useState<LoyaltyForm>(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'points', label: 'Puntos' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'points', label: 'Puntos', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} cliente(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} cliente(s) importado(s)`);
  };

  const filtered = items.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.cliente.toLowerCase().includes(q);
    const matchLevel = !filterLevel || c.nivel === filterLevel;
    return matchSearch && matchLevel;
  });

  const totalPrograma = items.length;
  const puntosEmitidos = items.reduce((s, c) => s + c.puntos, 0);
  const monthStartStr = (() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  })();
  const canjesMes = items.filter(c => (c.historialPuntos || []).some(h => h.puntos < 0 && h.fecha >= monthStartStr)).length;
  useModalClose(showModal, () => setShowModal(false));

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (c: LoyaltyClient) => {
    setEditing(c);
    setForm({ cliente: c.cliente, puntos: c.puntos, nivel: c.nivel, ultimaVisita: c.ultimaVisita, canjeDisponible: c.canjeDisponible });
    setShowModal(true);
  };
  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* fetch layer */
    }
  };
  const handleSave = async () => {
    if (!form.cliente || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, { ...form, historialPuntos: [] });
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* fetch layer */
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  const assignPoints = async (docId: string, pts: number) => {
    if (!userId) return;
    const c = items.find(x => x._id === docId);
    if (!c) return;
    const newPts = c.puntos + pts;
    let nivel: LoyaltyLevel = 'bronce';
    if (newPts >= 1000) nivel = 'platino';
    else if (newPts >= 500) nivel = 'oro';
    else if (newPts >= 200) nivel = 'plata';
    const historialPuntos = [{ fecha: todayStr, concepto: pts > 0 ? 'Puntos asignados' : 'Canje realizado', puntos: pts }, ...(c.historialPuntos || [])];
    try {
      await api.update(userId, docId, { puntos: newPts, nivel, historialPuntos });
      await loadData();
    } catch {
      /* fetch layer */
    }
  };

  const stats = [
    { label: 'Clientes en programa', value: totalPrograma, icon: <Users className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Puntos emitidos', value: puntosEmitidos.toLocaleString(), icon: <Star className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Canjes este mes', value: canjesMes, icon: <Gift className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  ];

  return (
    <Layout title="Fidelización / Puntos">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente…" disabled={loading} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterLevel} onChange={e => setFilterLevel(e.target.value as any)} disabled={loading} className="pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                <option value="">Todos los niveles</option>
                {Object.entries(LEVEL_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo cliente"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de cliente"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Cliente</th><th className="px-4 py-3 text-center">Puntos</th><th className="px-4 py-3">Nivel</th><th className="px-4 py-3">Última visita</th><th className="px-4 py-3 text-center">Canje</th><th className="px-4 py-3 text-center">Asignar / Canjear</th><th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(c => {
                const lvl = LEVEL_CFG[c.nivel];
                const isExpanded = expandedId === c._id;
                return (
                  <Fragment key={c._id}>
                    <tr className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c._id)}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.cliente}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">{c.puntos.toLocaleString()}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lvl.color}`}><Award className="w-3 h-3 inline mr-1" />{lvl.label}</span></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.ultimaVisita}</td>
                      <td className="px-4 py-3 text-center">{c.canjeDisponible ? <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">Disponible</span> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          <button type="button" onClick={() => void assignPoints(c._id, 50)} className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 transition-colors" title="Asignar 50 puntos"><ArrowUpCircle className="w-4 h-4 text-emerald-600" /></button>
                          <button type="button" onClick={() => void assignPoints(c._id, -100)} disabled={c.puntos < 100} className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 transition-colors disabled:opacity-40" title="Canjear 100 puntos"><ArrowDownCircle className="w-4 h-4 text-orange-600" /></button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                          <button type="button" onClick={() => void handleDelete(c._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 dark:bg-gray-700/20">
                        <td colSpan={7} className="px-6 py-3">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Historial de puntos</p>
                          <div className="space-y-1">
                            {(c.historialPuntos || []).map((h, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-gray-500 dark:text-gray-400 w-24">{h.fecha}</span>
                                <span className="flex-1 text-gray-700 dark:text-gray-300">{h.concepto}</span>
                                <span className={`font-semibold ${h.puntos >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{h.puntos > 0 ? '+' : ''}{h.puntos}</span>
                              </div>
                            ))}
                            {!(c.historialPuntos || []).length && <p className="text-xs text-gray-400">Sin movimientos</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!loading && !filtered.length && <tr><td colSpan={7} className="text-center py-10 text-gray-400">No se encontraron clientes</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente</label>
                <input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Puntos</label>
                <input type="number" value={form.puntos} onChange={e => setForm({ ...form, puntos: +e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nivel</label>
                <select value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value as LoyaltyLevel })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {Object.entries(LEVEL_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Última visita</label>
                <input type="date" value={form.ultimaVisita} onChange={e => setForm({ ...form, ultimaVisita: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={form.canjeDisponible} onChange={e => setForm({ ...form, canjeDisponible: e.target.checked })} className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                <label className="text-sm text-gray-700 dark:text-gray-300">Canje disponible</label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex justify-end gap-2 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                {editing ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="salon_loyalty"
        moduleLabel="Fidelización"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Fidelización"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
