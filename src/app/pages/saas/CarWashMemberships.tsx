import { useState, useMemo, useEffect, useCallback } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Filter,
  CreditCard, Users, Repeat, RefreshCw,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type PlanType = 'bono_lavados' | 'mensual' | 'trimestral' | 'anual';

interface MembershipPlan extends VerticalEntity {
  nombrePlan: string;
  tipo: PlanType;
  precio: number;
  lavadosIncluidos: number;
  suscriptoresActivos: number;
  activo: boolean;
  renovacionesEsteMes: number;
  ingresoRecurrenteRef: number;
}

type MembershipPlanForm = Omit<MembershipPlan, keyof VerticalEntity>;

const TYPE_CFG: Record<PlanType, { label: string; dot: string }> = {
  bono_lavados: { label: 'Bono lavados', dot: 'bg-sky-500' },
  mensual: { label: 'Mensual', dot: 'bg-emerald-500' },
  trimestral: { label: 'Trimestral', dot: 'bg-violet-500' },
  anual: { label: 'Anual', dot: 'bg-amber-500' },
};

const EMPTY_FORM: MembershipPlanForm = {
  nombrePlan: '', tipo: 'mensual', precio: 0, lavadosIncluidos: 4, suscriptoresActivos: 0, activo: true, renovacionesEsteMes: 0, ingresoRecurrenteRef: 0,
};

export function CarWashMemberships() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<MembershipPlan>('carwash', 'memberships'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<PlanType | 'all'>('all');
  const [filterActivo, setFilterActivo] = useState<'all' | 'si' | 'no'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState<MembershipPlanForm>(EMPTY_FORM);
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
    { key: 'price', label: 'Precio' },
    { key: 'duration', label: 'Duración' },
    { key: 'washes', label: 'Lavados incluidos' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'duration', label: 'Duración', example: '' },
    { key: 'washes', label: 'Lavados incluidos', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const nombre = entryStr(e, 'nombre', 'name');
    if (!nombre) return null;
    return {
      nombrePlan: entryStr(e, 'nombrePlan') || '', tipo: 'mensual', precio: 0, lavadosIncluidos: 4, suscriptoresActivos: 0, activo: true, renovacionesEsteMes: 0, ingresoRecurrenteRef: 0,
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} plan creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const filtered = useMemo(() => items.filter(p => {
    const q = search.toLowerCase();
    if (search && !p.nombrePlan.toLowerCase().includes(q)) return false;
    if (filterTipo !== 'all' && p.tipo !== filterTipo) return false;
    if (filterActivo === 'si' && !p.activo) return false;
    if (filterActivo === 'no' && p.activo) return false;
    return true;
  }), [items, search, filterTipo, filterActivo]);

  const stats = useMemo(() => {
    const suscriptores = items.reduce((s, p) => s + p.suscriptoresActivos, 0);
    const ingresosRecurrentes = items.reduce((s, p) => s + p.ingresoRecurrenteRef, 0);
    const renovaciones = items.reduce((s, p) => s + p.renovacionesEsteMes, 0);
    return { totalPlanes: items.length, suscriptores, ingresosRecurrentes, renovaciones };
  }, [items]);
  useModalClose(showModal, () => setShowModal(false));

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (p: MembershipPlan) => {
    setEditing(p);
    setForm({
      nombrePlan: p.nombrePlan, tipo: p.tipo, precio: p.precio, lavadosIncluidos: p.lavadosIncluidos,
      suscriptoresActivos: p.suscriptoresActivos, activo: p.activo, renovacionesEsteMes: p.renovacionesEsteMes,
      ingresoRecurrenteRef: p.ingresoRecurrenteRef,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombrePlan.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error shown by fetch layer */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const STAT_CARDS = [
    { label: 'Total planes', value: stats.totalPlanes, icon: CreditCard, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Suscriptores activos', value: stats.suscriptores, icon: Users, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ingresos recurrentes (ref.)', value: `${stats.ingresosRecurrentes.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, icon: Repeat, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Renovaciones este mes', value: stats.renovaciones, icon: RefreshCw, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Bonos y Abonos">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm"
              placeholder="Buscar por nombre del plan..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                value={filterTipo}
                onChange={e => setFilterTipo(e.target.value as PlanType | 'all')}
                disabled={loading}
              >
                <option value="all">Todos los tipos</option>
                {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select
                className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                value={filterActivo}
                onChange={e => setFilterActivo(e.target.value as 'all' | 'si' | 'no')}
                disabled={loading}
              >
                <option value="all">Estado: todos</option>
                <option value="si">Solo activos</option>
                <option value="no">Solo inactivos</option>
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo plan"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de plan"
              />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Plan</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Precio</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Lavados incl.</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Suscriptores</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Renov. mes</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(p => (
                <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.nombrePlan}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className={`w-2 h-2 rounded-full ${TYPE_CFG[p.tipo].dot}`} />
                      {TYPE_CFG[p.tipo].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{p.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{p.lavadosIncluidos === 999 ? 'Ilimitado*' : p.lavadosIncluidos}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{p.suscriptoresActivos}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{p.renovacionesEsteMes}</td>
                  <td className="px-4 py-3">
                    {p.activo
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Activo</span>
                      : <span className="text-gray-400">Inactivo</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay planes con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar plan' : 'Nuevo plan'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre del plan *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombrePlan} onChange={e => setForm(f => ({ ...f, nombrePlan: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tipo</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as PlanType }))}>
                  {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio (€)</label>
                  <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Lavados incluidos</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.lavadosIncluidos} onChange={e => setForm(f => ({ ...f, lavadosIncluidos: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Suscriptores activos</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.suscriptoresActivos} onChange={e => setForm(f => ({ ...f, suscriptoresActivos: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Renovaciones este mes</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.renovacionesEsteMes} onChange={e => setForm(f => ({ ...f, renovacionesEsteMes: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Ingreso recurrente ref. (€/mes)</label>
                <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.ingresoRecurrenteRef} onChange={e => setForm(f => ({ ...f, ingresoRecurrenteRef: Number(e.target.value) }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan activo (visible para venta)</span>
              </label>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar cambios' : 'Crear plan'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="carwash_memberships"
        moduleLabel="Membresías"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Membresías"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
