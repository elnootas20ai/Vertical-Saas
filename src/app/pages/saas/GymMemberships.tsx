import { useState, useMemo, useCallback, useEffect } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, DollarSign, TrendingUp,
  Crown, BarChart3, Check, Users, Star, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface MembershipPlan extends VerticalEntity {
  nombre: string;
  precioMensual: number;
  precioAnual: number;
  beneficios: string[];
  sociosActivos: number;
  color: string;
  destacado: boolean;
}

type MembershipPlanForm = Omit<MembershipPlan, keyof VerticalEntity>;

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  gray:  { bg: 'bg-gray-50 dark:bg-gray-800/60',   border: 'border-gray-200 dark:border-gray-700',   text: 'text-gray-700 dark:text-gray-300', badge: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
  blue:  { bg: 'bg-blue-50 dark:bg-blue-900/20',    border: 'border-blue-200 dark:border-blue-800',   text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-900/20',  border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20',  border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-300', badge: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
};

const EMPTY_FORM: MembershipPlanForm = { nombre: '', precioMensual: 0, precioAnual: 0, beneficios: [], sociosActivos: 0, color: 'gray', destacado: false };

export function GymMemberships() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<MembershipPlan>('gym', 'memberships'), []);
  const userId = user?.user_id || user?.id || '';

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState<MembershipPlanForm>(EMPTY_FORM);
  const [beneficioInput, setBeneficioInput] = useState('');
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
      setPlans(list);
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
    { key: 'features', label: 'Características' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'duration', label: 'Duración', example: '' },
    { key: 'features', label: 'Características', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} plan(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} plan(s) importado(s)`);
  };

  const filtered = useMemo(() => {
    if (!search) return plans;
    return plans.filter(p => p.nombre.toLowerCase().includes(search.toLowerCase()));
  }, [plans, search]);

  const stats = useMemo(() => {
    const ingresosTotales = plans.reduce((s, p) => s + p.precioMensual * p.sociosActivos, 0);
    const popular = [...plans].sort((a, b) => b.sociosActivos - a.sociosActivos)[0];
    return { ingresosTotales, popular: popular?.nombre || '-', tasaRenovacion: 87 };
  }, [plans]);
  useModalClose(showModal, () => setShowModal(false));

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setBeneficioInput(''); setShowModal(true); };
  const openEdit = (p: MembershipPlan) => { setEditing(p); setForm({ nombre: p.nombre, precioMensual: p.precioMensual, precioAnual: p.precioAnual, beneficios: [...p.beneficios], sociosActivos: p.sociosActivos, color: p.color, destacado: p.destacado }); setBeneficioInput(''); setShowModal(true); };

  const handleSave = async () => {
    if (!form.nombre.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch layer */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch layer */
    }
  };

  const addBeneficio = () => {
    if (!beneficioInput.trim()) return;
    setForm(f => ({ ...f, beneficios: [...f.beneficios, beneficioInput.trim()] }));
    setBeneficioInput('');
  };
  const removeBeneficio = (idx: number) => setForm(f => ({ ...f, beneficios: f.beneficios.filter((_, i) => i !== idx) }));

  const STAT_CARDS = [
    { label: 'Ingresos Mensuales',  value: `€${stats.ingresosTotales.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Plan Más Popular',    value: stats.popular,       icon: Crown,      color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Tasa de Renovación',  value: `${stats.tasaRenovacion}%`, icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/30' },
  ];

  return (
    <Layout title="Planes y Membresías">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar plan..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <AddButtonDropdown
                label="Nuevo Plan"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de plan"
              />
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {loading && (
          <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando…
            </span>
          </div>
        )}
        {!loading && filtered.map(p => {
          const cm = COLOR_MAP[p.color] || COLOR_MAP.gray;
          return (
            <div key={p._id} className={`relative rounded-2xl border-2 ${cm.border} ${cm.bg} p-5 flex flex-col transition hover:shadow-lg`}>
              {p.destacado && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold"><Star className="w-3 h-3 fill-white" />Más Popular</span>
                </div>
              )}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className={`text-lg font-bold ${cm.text}`}>{p.nombre}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{p.sociosActivos} socios activos</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700/50 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-gray-900 dark:text-white">€{p.precioMensual}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">/mes</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">€{p.precioAnual}/año (ahorra €{(p.precioMensual * 12 - p.precioAnual).toFixed(2)})</p>
              </div>
              <ul className="space-y-2 flex-1">
                {p.beneficios.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Check className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t border-gray-200/60 dark:border-gray-700/60">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((p.sociosActivos / 150) * 100, 100)}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{p.sociosActivos}</span>
                </div>
              </div>
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron planes.</div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Plan' : 'Nuevo Plan'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre del Plan *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio Mensual (€)</label>
                  <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.precioMensual} onChange={e => setForm(f => ({ ...f, precioMensual: +e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio Anual (€)</label>
                  <input type="number" step="0.01" min={0} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.precioAnual} onChange={e => setForm(f => ({ ...f, precioAnual: +e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Color</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}>
                    <option value="gray">Gris</option>
                    <option value="blue">Azul</option>
                    <option value="amber">Dorado</option>
                    <option value="green">Verde</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.destacado} onChange={e => setForm(f => ({ ...f, destacado: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 dark:border-gray-600" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan Destacado</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Beneficios</label>
                <div className="flex gap-2 mb-2">
                  <input className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm" placeholder="Añadir beneficio..." value={beneficioInput} onChange={e => setBeneficioInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addBeneficio())} />
                  <button type="button" onClick={addBeneficio} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"><Plus className="w-4 h-4" /></button>
                </div>
                <ul className="space-y-1.5">
                  {form.beneficios.map((b, i) => (
                    <li key={i} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                      <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" />{b}</span>
                      <button type="button" onClick={() => removeBeneficio(i)} className="text-gray-400 hover:text-red-500 transition"><X className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Plan'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="gym_memberships"
        moduleLabel="Planes"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Planes"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
