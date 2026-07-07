import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Edit3, Building2, MapPin, Eye,
  CheckCircle2, Clock, HardHat, Filter, Trash2, AlertTriangle,
  Users, TrendingUp, Banknote, Send, Calculator, Lock,
  XCircle, ArrowRight, LayoutGrid, List, UserCircle, Receipt,
} from 'lucide-react';
import { ClienteAutocomplete } from '../../components/saas/ClienteAutocomplete';
import type { ConstructionProject, ConstructionClient, ConstructionWorker, EstadoObra } from '../../lib/constructionApi';
import {
  listConstructionProjects, createConstructionProject, updateConstructionProject,
  deleteConstructionProject, listConstructionClients, listConstructionWorkers,
  ESTADO_OBRA_CONFIG, ESTADO_OBRA_TRANSICIONES, normalizeEstadoObra,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { bulkCreateVerticalEntries, entryStr } from '../../lib/bulkVerticalImport';
import { toast } from 'sonner';

const TIPOS_OBRA = ['casa', 'local', 'piso', 'promoción', 'colegio', 'gimnasio', 'oficina', 'nave', 'reforma', 'otro'];

const ESTADO_ICONS: Record<EstadoObra, typeof Clock> = {
  borrador: Edit3,
  presupuesto_en_preparacion: Calculator,
  presupuesto_enviado: Send,
  presupuesto_aceptado: CheckCircle2,
  pendiente_de_planificacion: Clock,
  en_ejecucion: HardHat,
  pendiente_de_cobro: Banknote,
  finalizada: CheckCircle2,
  cerrada: Lock,
  cancelada: XCircle,
};

const fmt = (n: number) => (n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function timeAgo(dateStr: string): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  return `hace ${Math.floor(days / 30)}mes`;
}

export function ConstructionProjects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.user_id || user?.id || '';

  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [clients, setClients] = useState<ConstructionClient[]>([]);
  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterResponsable, setFilterResponsable] = useState<string>('todos');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionProject | null>(null);
  const [form, setForm] = useState({
    nombre: '', tipoObra: 'casa', direccion: '', ciudad: '', provincia: '', codigoPostal: '', ubicacion: '',
    clienteId: '', clienteNombre: '', responsableId: '', responsableNombre: '',
    fechaInicio: '', fechaFinPrevista: '', estado: 'borrador' as EstadoObra, notas: '',
  });
  const [loading, setLoading] = useState(true);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'client', label: 'Cliente' },
    { key: 'address', label: 'Dirección' },
    { key: 'startDate', label: 'Fecha inicio' },
    { key: 'budget', label: 'Presupuesto' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'startDate', label: 'Fecha inicio', example: '' },
    { key: 'budget', label: 'Presupuesto', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) return;
    const created = await bulkCreateVerticalEntries(userId, {
      create: (uid, data) => createConstructionProject(uid, data as Partial<ConstructionProject>),
    }, entries, (entry) => ({
      nombre: entryStr(entry, 'name', 'nombre'),
      direccion: entryStr(entry, 'address', 'direccion', 'address'),
      clienteNombre: entryStr(entry, 'client', 'cliente'),
      fechaInicio: entryStr(entry, 'startDate', 'fechaInicio', 'date'),
      estado: 'borrador' as EstadoObra,
    }));
    if (created > 0) {
      toast.success(`${created} proyecto(s) creado(s)`);
      void load();
    }
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    await handleAIEntries(entries);
  };

  useModalClose(modalOpen, () => setModalOpen(false));

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [p, c, w] = await Promise.all([
        listConstructionProjects(userId),
        listConstructionClients(userId),
        listConstructionWorkers(userId),
      ]);
      setProjects(p); setClients(c); setWorkers(w);
    } catch { /* silent */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => projects.filter(p => {
    const q = `${p.nombre} ${p.ubicacion} ${p.clienteNombre} ${p.tipoObra} ${p.responsableNombre || ''} ${p.direccion || ''} ${p.ciudad || ''}`.toLowerCase();
    const matchSearch = q.includes(search.toLowerCase());
    const estado = normalizeEstadoObra(p.estado);
    const matchEstado = filterEstado === 'todos' || estado === filterEstado;
    const matchResp = filterResponsable === 'todos' || p.responsableId === filterResponsable;
    return matchSearch && matchEstado && matchResp;
  }), [projects, search, filterEstado, filterResponsable]);

  const stats = useMemo(() => {
    const estados = projects.map(p => normalizeEstadoObra(p.estado));
    return {
      enEjecucion: estados.filter(e => e === 'en_ejecucion').length,
      pendienteCobro: estados.filter(e => e === 'pendiente_de_cobro').length,
      presupuestoActivo: projects.filter(p => ['en_ejecucion', 'pendiente_de_cobro', 'pendiente_de_planificacion', 'presupuesto_aceptado'].includes(normalizeEstadoObra(p.estado))).reduce((s, p) => s + (p.presupuestoTotal || p.importeTotal || 0), 0),
      sinResponsable: projects.filter(p => !p.responsableId && normalizeEstadoObra(p.estado) !== 'borrador' && normalizeEstadoObra(p.estado) !== 'cancelada' && normalizeEstadoObra(p.estado) !== 'cerrada').length,
      total: projects.length,
      rentabilidadMedia: (() => {
        const activas = projects.filter(p => (p.presupuestoTotal || p.importeTotal) && p.costesReales);
        if (!activas.length) return 0;
        return activas.reduce((s, p) => {
          const pres = p.presupuestoTotal || p.importeTotal || 0;
          return s + ((pres - (p.costesReales || 0)) / pres) * 100;
        }, 0) / activas.length;
      })(),
    };
  }, [projects]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      nombre: '', tipoObra: 'casa', direccion: '', ciudad: '', provincia: '', codigoPostal: '', ubicacion: '',
      clienteId: '', clienteNombre: '', responsableId: '', responsableNombre: '',
      fechaInicio: '', fechaFinPrevista: '', estado: 'borrador', notas: '',
    });
    setModalOpen(true);
  };

  const openEdit = (p: ConstructionProject) => {
    setEditing(p);
    setForm({
      nombre: p.nombre, tipoObra: p.tipoObra, direccion: p.direccion || '', ciudad: p.ciudad || '',
      provincia: p.provincia || '', codigoPostal: p.codigoPostal || '', ubicacion: p.ubicacion,
      clienteId: p.clienteId, clienteNombre: p.clienteNombre,
      responsableId: p.responsableId || '', responsableNombre: p.responsableNombre || '',
      fechaInicio: p.fechaInicio, fechaFinPrevista: p.fechaFinPrevista,
      estado: normalizeEstadoObra(p.estado), notas: p.notas,
    });
    setModalOpen(true);
  };

  const onClientChange = (clienteId: string) => {
    const c = clients.find(cl => cl._id === clienteId);
    setForm(prev => ({ ...prev, clienteId, clienteNombre: c?.nombre || '' }));
  };

  const onResponsableChange = (responsableId: string) => {
    const w = workers.find(wr => wr._id === responsableId);
    setForm(prev => ({ ...prev, responsableId, responsableNombre: w?.nombre || '' }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !userId) return;
    try {
      if (editing) {
        const updated = await updateConstructionProject(userId, { ...editing, ...form } as unknown as ConstructionProject);
        setProjects(prev => prev.map(p => p._id === updated._id ? updated : p));
      } else {
        const created = await createConstructionProject(userId, form as unknown as Partial<ConstructionProject>);
        setProjects(prev => [created, ...prev]);
      }
      setModalOpen(false);
    } catch { /* silent */ }
  };

  const handleDelete = async (id: string) => {
    if (!userId || !confirm('¿Eliminar esta obra?')) return;
    try {
      await deleteConstructionProject(userId, id);
      setProjects(prev => prev.filter(p => p._id !== id));
    } catch { /* silent */ }
  };

  const estadosDisponibles = useMemo(() => {
    if (!editing) return Object.keys(ESTADO_OBRA_CONFIG) as EstadoObra[];
    const actual = normalizeEstadoObra(editing.estado);
    return [actual, ...ESTADO_OBRA_TRANSICIONES[actual]];
  }, [editing]);

  const responsables = useMemo(() => {
    const ids = new Set(projects.map(p => p.responsableId).filter(Boolean));
    return workers.filter(w => ids.has(w._id));
  }, [projects, workers]);

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  if (loading) return <Layout title="Obras activas"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;

  return (
    <Layout title="Obras activas">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'En ejecución', value: stats.enEjecucion, icon: HardHat, color: 'text-green-600', bgIcon: 'bg-green-50 dark:bg-green-900/30' },
          { label: 'Pte. cobro', value: stats.pendienteCobro, icon: Banknote, color: 'text-orange-600', bgIcon: 'bg-orange-50 dark:bg-orange-900/30' },
          { label: 'Presup. activo', value: fmt(stats.presupuestoActivo), icon: TrendingUp, color: 'text-purple-600', bgIcon: 'bg-purple-50 dark:bg-purple-900/30' },
          { label: 'Rentabilidad media', value: `${stats.rentabilidadMedia.toFixed(1)}%`, icon: TrendingUp, color: stats.rentabilidadMedia >= 10 ? 'text-emerald-600' : 'text-red-600', bgIcon: stats.rentabilidadMedia >= 10 ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-red-50 dark:bg-red-900/30' },
          { label: 'Total obras', value: stats.total, icon: Building2, color: 'text-blue-600', bgIcon: 'bg-blue-50 dark:bg-blue-900/30' },
          { label: 'Sin responsable', value: stats.sinResponsable, icon: AlertTriangle, color: stats.sinResponsable > 0 ? 'text-red-600' : 'text-gray-400', bgIcon: stats.sinResponsable > 0 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-gray-50 dark:bg-gray-800' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2.5 mb-2">
              <div className={`p-2 rounded-xl ${s.bgIcon}`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
              <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{s.label}</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar obra, cliente, ubicación, responsable..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="pl-8 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none appearance-none cursor-pointer">
              <option value="todos">Todos los estados</option>
              {(Object.keys(ESTADO_OBRA_CONFIG) as EstadoObra[]).map(e => (
                <option key={e} value={e}>{ESTADO_OBRA_CONFIG[e].label}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <select value={filterResponsable} onChange={e => setFilterResponsable(e.target.value)} className="pl-8 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none appearance-none cursor-pointer">
              <option value="todos">Todos los responsables</option>
              {responsables.map(r => <option key={r._id} value={r._id}>{r.nombre}</option>)}
            </select>
          </div>
          <div className="flex border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button onClick={() => setViewMode('table')} className={`px-3 py-2 transition-colors ${viewMode === 'table' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-500'}`}><List className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('cards')} className={`px-3 py-2 transition-colors ${viewMode === 'cards' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-500'}`}><LayoutGrid className="w-4 h-4" /></button>
          </div>
          <AddButtonDropdown
                label="Nuevo proyecto"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de proyecto"
              />
        </div>
      </div>

      {/* Vista tabla */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                {['Obra', 'Cliente', 'Responsable', 'Estado', 'Presupuesto', 'Cobrado / Pte.', 'Progreso', 'Últ. actividad', ''].map(h => (
                  <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const estado = normalizeEstadoObra(p.estado);
                const cfg = ESTADO_OBRA_CONFIG[estado];
                const Icon = ESTADO_ICONS[estado];
                const presup = p.presupuestoTotal || p.importeTotal || 0;
                const cobrado = p.totalCobrado || 0;
                const pendiente = p.cobrosPendientes || (presup - cobrado);
                const lastActivity = p.actividad?.length ? p.actividad[p.actividad.length - 1]?.fecha : p.updatedAt;

                return (
                  <tr key={p._id} onClick={() => navigate(`/saas/construction-projects/${p._id}`)} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">{p.nombre}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{p.ciudad || p.ubicacion || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{p.clienteNombre || '—'}</td>
                    <td className="px-4 py-3">
                      {p.responsableNombre ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                          <UserCircle className="w-4 h-4 text-gray-400" />{p.responsableNombre}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="w-3 h-3" />Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                        <Icon className="w-3.5 h-3.5" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{presup ? fmt(presup) : '—'}</td>
                    <td className="px-4 py-3">
                      {presup > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min((cobrado / presup) * 100, 100)}%` }} />
                            </div>
                            <span className="text-xs font-medium text-gray-500 w-9 text-right">{Math.round((cobrado / presup) * 100)}%</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-emerald-600">{fmt(cobrado)}</span>
                            {pendiente > 0 && <span className="text-orange-500">{fmt(pendiente)} pte.</span>}
                          </div>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${p.progreso === 100 ? 'bg-green-500' : p.progreso > 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${p.progreso || 0}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300 w-8 text-right">{p.progreso || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{timeAgo(lastActivity)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => navigate(`/saas/construction-projects/${p._id}`)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Ver ficha"><Eye className="w-4 h-4 text-gray-500" /></button>
                        <button onClick={() => navigate(`/saas/vertical/construccion/presupuestos?obraId=${p._id}`)} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Nuevo presupuesto"><Receipt className="w-4 h-4 text-blue-600" /></button>
                        <button onClick={() => navigate(`/saas/construction-planning?projectId=${p._id}`)} className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors" title="Planificar obra"><CalendarRange className="w-4 h-4 text-amber-600" /></button>
                        <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                        <button onClick={() => handleDelete(p._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-16 text-center">
                  <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No se encontraron obras</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Crea tu primera obra para empezar</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Vista tarjetas */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => {
            const estado = normalizeEstadoObra(p.estado);
            const cfg = ESTADO_OBRA_CONFIG[estado];
            const Icon = ESTADO_ICONS[estado];
            const presup = p.presupuestoTotal || p.importeTotal || 0;

            return (
              <div key={p._id} onClick={() => navigate(`/saas/construction-projects/${p._id}`)} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-lg transition-all cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">{p.nombre}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.clienteNombre || 'Sin cliente'}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold shrink-0 ${cfg.bg} ${cfg.color}`}>
                    <Icon className="w-3 h-3" />{cfg.label}
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin className="w-3 h-3" /><span className="truncate">{p.ciudad || p.ubicacion || 'Sin ubicación'}</span>
                  </div>

                  {p.responsableNombre ? (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <UserCircle className="w-3 h-3" />{p.responsableNombre}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-red-500">
                      <AlertTriangle className="w-3 h-3" />Sin responsable
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500 dark:text-gray-400">Progreso</span>
                      <span className="font-bold text-gray-700 dark:text-gray-300">{p.progreso || 0}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${(p.progreso || 0) === 100 ? 'bg-green-500' : (p.progreso || 0) > 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${p.progreso || 0}%` }} />
                    </div>
                  </div>

                  {presup > 0 && (
                    <div className="flex justify-between text-xs pt-1 border-t border-gray-100 dark:border-gray-700/50">
                      <span className="text-gray-500 dark:text-gray-400">Presupuesto</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{fmt(presup)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(p.updatedAt)}</span>
                  <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-amber-500 transition-colors" />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center">
              <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No se encontraron obras</p>
            </div>
          )}
        </div>
      )}

      {/* Modal crear/editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar obra' : 'Nueva obra'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelClass}>Nombre de la obra</label><input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required placeholder="Ej: Reforma integral Calle Mayor 5" /></div>
                <div>
                  <label className={labelClass}>Tipo de obra</label>
                  <select className={inputClass} value={form.tipoObra} onChange={e => setForm({ ...form, tipoObra: e.target.value })}>
                    {TIPOS_OBRA.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Cliente</label>
                  <ClienteAutocomplete
                    userId={userId}
                    value={form.clienteId}
                    clienteNombre={form.clienteNombre}
                    onChange={(id, nombre) => setForm(prev => ({ ...prev, clienteId: id, clienteNombre: nombre }))}
                    onCreateNew={(nombre) => {
                      setForm(prev => ({ ...prev, clienteNombre: nombre }));
                      window.open('/saas/construction-clients?crear=1', '_blank');
                    }}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Dirección de la obra</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><input className={inputClass} value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} placeholder="Calle, número, piso..." /></div>
                  <div><input className={inputClass} value={form.ciudad} onChange={e => setForm({ ...form, ciudad: e.target.value })} placeholder="Ciudad" /></div>
                  <div className="flex gap-3">
                    <input className={inputClass} value={form.provincia} onChange={e => setForm({ ...form, provincia: e.target.value })} placeholder="Provincia" />
                    <input className={`${inputClass} max-w-[120px]`} value={form.codigoPostal} onChange={e => setForm({ ...form, codigoPostal: e.target.value })} placeholder="C.P." />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Responsable de obra</label>
                  <select className={inputClass} value={form.responsableId} onChange={e => onResponsableChange(e.target.value)}>
                    <option value="">— Sin asignar —</option>
                    {workers.filter(w => w.activo).map(w => <option key={w._id} value={w._id}>{w.nombre} ({w.gremio})</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Estado</label>
                  <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as EstadoObra })}>
                    {estadosDisponibles.map(e => <option key={e} value={e}>{ESTADO_OBRA_CONFIG[e].label}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Fecha inicio</label><input type="date" className={inputClass} value={form.fechaInicio} onChange={e => setForm({ ...form, fechaInicio: e.target.value })} /></div>
                <div><label className={labelClass}>Fecha fin prevista</label><input type="date" className={inputClass} value={form.fechaFinPrevista} onChange={e => setForm({ ...form, fechaFinPrevista: e.target.value })} /></div>
              </div>

              <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Observaciones generales..." /></div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar</button>
            </div>
          </form>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_projects"
        moduleLabel="Proyectos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Proyectos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
