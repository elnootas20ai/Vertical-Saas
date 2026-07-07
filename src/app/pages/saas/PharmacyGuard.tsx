import { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import {
  Search, X, Edit2, Trash2, Filter,
  Calendar, Sun, Moon, CheckCircle2, Loader2,
} from 'lucide-react';

type ShiftSlot = 'mañana' | 'tarde' | 'noche' | '24h';
type GuardType = 'ordinaria' | 'festivo' | 'nocturna';
type GuardStatus = 'programada' | 'en_curso' | 'completada';

interface GuardShift extends VerticalEntity {
  fecha: string;
  turno: ShiftSlot;
  farmaceutico: string;
  tipo: GuardType;
  estado: GuardStatus;
}

type GuardShiftFormFields = Omit<
  GuardShift,
  '_id' | '_rev' | 'type' | 'user_id' | 'createdAt' | 'updatedAt'
>;

const TURNO_LABEL: Record<ShiftSlot, string> = {
  mañana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
  '24h': '24 h',
};

const TIPO_LABEL: Record<GuardType, string> = {
  ordinaria: 'Ordinaria',
  festivo: 'Festivo',
  nocturna: 'Nocturna',
};

const ESTADO_CFG: Record<GuardStatus, { label: string; dot: string }> = {
  programada: { label: 'Programada', dot: 'bg-blue-500' },
  en_curso: { label: 'En curso', dot: 'bg-amber-500' },
  completada: { label: 'Completada', dot: 'bg-emerald-500' },
};

const MES = '2026-04';
const HOY = '2026-04-01';

const EMPTY_FORM: GuardShiftFormFields = {
  fecha: '', turno: 'mañana', farmaceutico: '', tipo: 'ordinaria', estado: 'programada',
};

export function PharmacyGuard() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<GuardShift>('pharmacy', 'guardShifts'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<GuardShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<GuardStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GuardShift | null>(null);
  const [form, setForm] = useState<GuardShiftFormFields>(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'date', label: 'Fecha' },
    { key: 'shift', label: 'Turno' },
    { key: 'pharmacist', label: 'Farmacéutico' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'shift', label: 'Turno', example: '' },
    { key: 'pharmacist', label: 'Farmacéutico', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const fecha = entryStr(e, 'fecha', 'date');
    if (!fecha) return null;
    return {
      fecha,
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} guardia creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await api.list(userId);
      setItems(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(g => {
    const q = search.toLowerCase();
    if (search && !g.farmaceutico.toLowerCase().includes(q) && !g.fecha.includes(q)) return false;
    if (filterEstado !== 'all' && g.estado !== filterEstado) return false;
    return true;
  }), [items, search, filterEstado]);

  const stats = useMemo(() => {
    const mes = items.filter(g => g.fecha.startsWith(MES));
    const guardiasMes = mes.length;
    const completadas = mes.filter(g => g.estado === 'completada').length;
    const nocturnas = mes.filter(g => g.tipo === 'nocturna' || g.turno === 'noche' || g.turno === '24h').length;
    const futuras = items.filter(g => g.fecha >= HOY && g.estado !== 'completada').sort((a, b) => a.fecha.localeCompare(b.fecha));
    const proxima = futuras[0];
    const proximaStr = proxima ? `${proxima.fecha} · ${TURNO_LABEL[proxima.turno]}` : '—';
    return { guardiasMes, proximaStr, completadas, nocturnas };
  }, [items]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (g: GuardShift) => {
    setEditing(g);
    setForm({ fecha: g.fecha, turno: g.turno, farmaceutico: g.farmaceutico, tipo: g.tipo, estado: g.estado });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.fecha.trim() || !form.farmaceutico.trim()) return;
    if (!userId) return;
    try {
      const formData = { ...form } as Partial<GuardShift>;
      if (editing) {
        await api.update(userId, editing._id, formData);
      } else {
        await api.create(userId, formData);
      }
      await loadData();
      setShowModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const STAT_CARDS = [
    { label: 'Guardias este mes', value: stats.guardiasMes, icon: Calendar, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Próxima guardia', value: stats.proximaStr, icon: Sun, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Completadas (mes)', value: stats.completadas, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Nocturnas / 24 h (mes)', value: stats.nocturnas, icon: Moon, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Guardias">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate" title={String(s.value)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar por farmacéutico o fecha..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterEstado} onChange={e => setFilterEstado(e.target.value as GuardStatus | 'all')}>
                <option value="all">Todos los estados</option>
                {Object.entries(ESTADO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nueva guardia"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de guardia"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Turno</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Farmacéutico</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 animate-spin" />
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map(g => (
                    <tr key={g._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{g.fecha}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{TURNO_LABEL[g.turno]}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{g.farmaceutico}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{TIPO_LABEL[g.tipo]}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${ESTADO_CFG[g.estado].dot}`} />{ESTADO_CFG[g.estado].label}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                          <button type="button" onClick={() => handleDelete(g._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay guardias que coincidan con los filtros.</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar guardia' : 'Nueva guardia'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha *</label>
                  <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Turno</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.turno} onChange={e => setForm(f => ({ ...f, turno: e.target.value as ShiftSlot }))}>
                    {(Object.keys(TURNO_LABEL) as ShiftSlot[]).map(k => <option key={k} value={k}>{TURNO_LABEL[k]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Farmacéutico de guardia *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.farmaceutico} onChange={e => setForm(f => ({ ...f, farmaceutico: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as GuardType }))}>
                    {(Object.keys(TIPO_LABEL) as GuardType[]).map(k => <option key={k} value={k}>{TIPO_LABEL[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as GuardStatus }))}>
                    {Object.entries(ESTADO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Programar guardia'}</button>
            </div>
          </div>
        </div>
      )}

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="pharmacy_guard"
        moduleLabel="Guardias"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Guardias"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
