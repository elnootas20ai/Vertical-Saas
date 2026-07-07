import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, X, Edit2, Trash2, Users, UserPlus, TrendingUp,
  DollarSign, Phone, Mail, Filter, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type Plan = string;
type MemberStatus = 'activo' | 'inactivo' | 'congelado';

interface MembershipPlan extends VerticalEntity {
  nombre: string;
  precioMensual: number;
}

interface Member extends VerticalEntity {
  nombre: string;
  email: string;
  telefono: string;
  plan: Plan;
  estado: MemberStatus;
  fechaAlta: string;
}

type MemberForm = Omit<Member, keyof VerticalEntity>;

const LEGACY_PLAN_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  basico:  { label: 'Básico',  bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
  premium: { label: 'Premium', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  vip:     { label: 'VIP',     bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
};

function planStyle(plan: string, memberships: MembershipPlan[]) {
  const match = memberships.find((m) => m.nombre === plan);
  if (match) {
    return { label: match.nombre, bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300' };
  }
  return LEGACY_PLAN_CONFIG[plan] || { label: plan || '—', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' };
}

function planMonthlyPrice(plan: string, memberships: MembershipPlan[]): number {
  const match = memberships.find((m) => m.nombre === plan);
  if (match) return Number(match.precioMensual || 0);
  if (plan === 'vip') return 79.99;
  if (plan === 'premium') return 49.99;
  if (plan === 'basico') return 29.99;
  return 0;
}

const STATUS_CONFIG: Record<MemberStatus, { label: string; dot: string }> = {
  activo:    { label: 'Activo',    dot: 'bg-emerald-500' },
  inactivo:  { label: 'Inactivo',  dot: 'bg-red-500' },
  congelado: { label: 'Congelado', dot: 'bg-blue-400' },
};

const EMPTY_FORM: MemberForm = { nombre: '', email: '', telefono: '', plan: '', estado: 'activo', fechaAlta: new Date().toISOString().slice(0, 10) };

export function GymMembers() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Member>('gym', 'members'), []);
  const membershipsApi = useMemo(() => createVerticalApi<MembershipPlan>('gym', 'memberships'), []);
  const userId = user?.user_id || user?.id || '';

  const [members, setMembers] = useState<Member[]>([]);
  const [memberships, setMemberships] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState<string | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<MemberStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, plans] = await Promise.all([
        api.list(userId),
        membershipsApi.list(userId).catch(() => [] as MembershipPlan[]),
      ]);
      setMembers(list);
      setMemberships(plans);
    } finally {
      setLoading(false);
    }
  }, [userId, api, membershipsApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'membership', label: 'Membresía' },
    { key: 'startDate', label: 'Fecha alta' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'membership', label: 'Membresía', example: '' },
    { key: 'startDate', label: 'Fecha alta', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
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
      nombre,
      email: entryStr(e, 'email') || '',
      telefono: entryStr(e, 'telefono', 'phone', 'tel') || '',
      plan: entryStr(e, 'plan', 'membership') || 'basico',
      estado: entryStr(e, 'estado', 'status') || 'activo',
      fechaAlta: entryStr(e, 'fechaAlta', 'startDate', 'date') || new Date().toISOString().slice(0, 10),
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} socio creado creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => {
    return members.filter(m => {
      if (search && !m.nombre.toLowerCase().includes(search.toLowerCase()) && !m.email.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPlan !== 'all' && m.plan !== filterPlan) return false;
      if (filterStatus !== 'all' && m.estado !== filterStatus) return false;
      return true;
    });
  }, [members, search, filterPlan, filterStatus]);

  const stats = useMemo(() => {
    const activos = members.filter(m => m.estado === 'activo').length;
    const thisMonth = members.filter(m => m.fechaAlta.startsWith(new Date().toISOString().slice(0, 7))).length;
    const ingresos = members.reduce((sum, m) => {
      if (m.estado !== 'activo') return sum;
      return sum + planMonthlyPrice(m.plan, memberships);
    }, 0);
    return { total: members.length, activos, thisMonth, ingresos };
  }, [members, memberships]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      plan: memberships[0]?.nombre || 'basico',
    });
    setShowModal(true);
  };
  const openEdit = (m: Member) => { setEditing(m); setForm({ nombre: m.nombre, email: m.email, telefono: m.telefono, plan: m.plan, estado: m.estado, fechaAlta: m.fechaAlta }); setShowModal(true); };

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

  const STAT_CARDS = [
    { label: 'Total Socios',          value: stats.total,                          icon: Users,      color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Activos',               value: stats.activos,                        icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Nuevos Este Mes',       value: stats.thisMonth,                      icon: UserPlus,   color: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-50 dark:bg-violet-900/30' },
    { label: 'Ingresos Membresías',   value: `€${stats.ingresos.toFixed(2)}`,     icon: DollarSign,  color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Socios del Gimnasio">
      {/* Stats */}
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

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm"
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterPlan} onChange={e => setFilterPlan(e.target.value)} disabled={loading}>
                <option value="all">Todos los planes</option>
                {memberships.map((p) => <option key={p._id} value={p.nombre}>{p.nombre}</option>)}
                {Object.entries(LEGACY_PLAN_CONFIG)
                  .filter(([k]) => !memberships.some((p) => p.nombre === k))
                  .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value as MemberStatus | 'all')} disabled={loading}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <AddButtonDropdown
                label="Nuevo Socio"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de socio"
              />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Teléfono</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Plan</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Fecha Alta</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(m => (
                <tr key={m._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{m.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{m.email}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{m.telefono}</span></td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${planStyle(m.plan, memberships).bg} ${planStyle(m.plan, memberships).text}`}>{planStyle(m.plan, memberships).label}</span></td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-sm"><span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[m.estado].dot}`} />{STATUS_CONFIG[m.estado].label}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.fechaAlta}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(m._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron socios con los filtros seleccionados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Socio' : 'Nuevo Socio'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                  <input type="email" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Plan</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                    {memberships.length > 0
                      ? memberships.map((p) => <option key={p._id} value={p.nombre}>{p.nombre} — €{p.precioMensual}/mes</option>)
                      : Object.entries(LEGACY_PLAN_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Estado</label>
                  <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as MemberStatus }))}>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha de Alta</label>
                <input type="date" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500" value={form.fechaAlta} onChange={e => setForm(f => ({ ...f, fechaAlta: e.target.value }))} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancelar</button>
              <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition">{editing ? 'Guardar Cambios' : 'Crear Socio'}</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="gym_members"
        moduleLabel="Socios"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Socios"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
