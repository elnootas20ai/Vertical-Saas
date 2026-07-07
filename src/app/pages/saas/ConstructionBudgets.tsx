import { useState, useMemo, useEffect, useCallback } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Edit3, Filter, Receipt, Clock, CheckCircle2,
  Send, XCircle, TrendingUp, Trash2, CreditCard, Banknote, Eye, Zap, MessageSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ClienteAutocomplete } from '../../components/saas/ClienteAutocomplete';
import type {
  ConstructionBudget, BudgetPartida, ConstructionGuild, ConstructionClient,
  ConstructionPredefinedPartida, ConstructionConfig,
} from '../../lib/constructionApi';
import {
  listConstructionBudgets, createConstructionBudget, updateConstructionBudget,
  deleteConstructionBudget, acceptConstructionBudget, registerConstructionPayment,
  sendConstructionBudget, rejectConstructionBudget,
  listConstructionGuilds, listConstructionClients,
  getConstructionConfig, listPredefinedPartidas,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';

const TIPOS_OBRA = ['casa', 'local', 'piso', 'nave', 'promoción', 'colegio', 'gimnasio', 'oficina', 'otro'];

const estadoConfig: Record<string, { color: string; icon: typeof Clock }> = {
  borrador: { color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: Clock },
  enviado: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Send },
  aceptado: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  rechazado: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

const emptyPartida = (): BudgetPartida => ({
  id: `bp-${Date.now()}`, partidaPredefinidaId: '', gremio: '', nombre: '', descripcion: '', unidad: 'ud',
  cantidad: 1, precioUnitarioMateriales: 0, precioUnitarioManoObra: 0, precioUnitarioEstructural: 0, precioUnitario: 0,
  materiales: 0, manoObra: 0, estructural: 0, subtotal: 0,
});

const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

export function ConstructionBudgets() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';

  const [budgets, setBudgets] = useState<ConstructionBudget[]>([]);
  const [guilds, setGuilds] = useState<ConstructionGuild[]>([]);
  const [clients, setClients] = useState<ConstructionClient[]>([]);
  const [config, setConfig] = useState<ConstructionConfig | null>(null);
  const [catalogo, setCatalogo] = useState<ConstructionPredefinedPartida[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionBudget | null>(null);
  const [form, setForm] = useState({ proyectoNombre: '', clienteId: '', clienteNombre: '', tipoObra: 'casa', fecha: '', estado: 'borrador', margen: 15, notas: '' });
  const [partidas, setPartidas] = useState<BudgetPartida[]>([emptyPartida()]);

  const [acceptModal, setAcceptModal] = useState<ConstructionBudget | null>(null);
  const [metodoPago, setMetodoPago] = useState<'contado' | 'plazos'>('contado');
  const [numPlazos, setNumPlazos] = useState(3);

  const [detailModal, setDetailModal] = useState<ConstructionBudget | null>(null);
  const [rejectModal, setRejectModal] = useState<ConstructionBudget | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'project', label: 'Proyecto' },
    { key: 'client', label: 'Cliente' },
    { key: 'amount', label: 'Importe' },
    { key: 'date', label: 'Fecha' },
    { key: 'status', label: 'Estado' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'project', label: 'Proyecto', example: '' },
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'status', label: 'Estado', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, {
      create: (uid, data) => createConstructionBudget(uid, data as Partial<ConstructionBudget>),
    }, entries, (entry) => ({
      proyectoNombre: entryStr(entry, 'name', 'nombre', 'proyecto'),
      clienteNombre: entryStr(entry, 'client', 'cliente'),
      direccionObra: entryStr(entry, 'address', 'direccion'),
      fecha: entryStr(entry, 'date', 'fecha') || new Date().toISOString().slice(0, 10),
      estado: 'borrador',
      partidas: [],
    }));
    if (created > 0) {
      toast.success(`${created} presupuesto(s) creado(s)`);
      void load();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);
  const navigate = useNavigate();

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useModalClose(modalOpen, () => setModalOpen(false));
  useModalClose(!!acceptModal, () => setAcceptModal(null));
  useModalClose(!!detailModal, () => setDetailModal(null));
  useModalClose(!!rejectModal, () => setRejectModal(null));

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [b, g, c, cfg, cat] = await Promise.all([
        listConstructionBudgets(userId),
        listConstructionGuilds(userId),
        listConstructionClients(userId),
        getConstructionConfig(),
        listPredefinedPartidas(userId, { activa: true }),
      ]);
      setBudgets(b); setGuilds(g); setClients(c); setConfig(cfg); setCatalogo(cat);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al cargar datos', 'error'); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => budgets.filter(b => {
    const q = `${b.proyectoNombre} ${b.referencia} ${b.clienteNombre} ${b.tipoObra}`.toLowerCase();
    const matchSearch = q.includes(search.toLowerCase());
    const matchEstado = filterEstado === 'todos' || b.estado === filterEstado;
    return matchSearch && matchEstado;
  }), [budgets, search, filterEstado]);

  const stats = useMemo(() => ({
    pendientes: budgets.filter(b => b.estado === 'enviado' || b.estado === 'borrador').length,
    aceptados: budgets.filter(b => b.estado === 'aceptado').length,
    valorTotal: budgets.filter(b => b.estado === 'aceptado').reduce((s, b) => s + b.totalConMargen, 0),
    totalPagado: budgets.reduce((s, b) => s + b.totalPagado, 0),
  }), [budgets]);

  const openCreate = () => {
    setEditing(null);
    setForm({ proyectoNombre: '', clienteId: '', clienteNombre: '', tipoObra: 'casa', fecha: new Date().toISOString().slice(0, 10), estado: 'borrador', margen: 15, notas: '' });
    setPartidas([emptyPartida()]);
    setModalOpen(true);
  };

  const openEdit = (b: ConstructionBudget) => {
    setEditing(b);
    setForm({ proyectoNombre: b.proyectoNombre, clienteId: b.clienteId, clienteNombre: b.clienteNombre, tipoObra: b.tipoObra, fecha: b.fecha, estado: b.estado, margen: b.margen, notas: b.notas });
    setPartidas(b.partidas.length ? [...b.partidas] : [emptyPartida()]);
    setModalOpen(true);
  };

  const addPartida = () => setPartidas(prev => [...prev, emptyPartida()]);
  const removePartida = (id: number | string) => setPartidas(prev => prev.filter(p => p.id !== id));
  const updatePartida = (id: number | string, field: string, value: string | number) => {
    setPartidas(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      const qty = Number(updated.cantidad ?? 1);
      const puMat = Number(updated.precioUnitarioMateriales ?? 0);
      const puMo = Number(updated.precioUnitarioManoObra ?? 0);
      const puEst = Number(updated.precioUnitarioEstructural ?? 0);
      updated.precioUnitario = puMat + puMo + puEst;
      updated.materiales = qty * puMat;
      updated.manoObra = qty * puMo;
      updated.estructural = qty * puEst;
      updated.subtotal = qty * (puMat + puMo + puEst);
      return updated;
    }));
  };

  const fillFromCatalogo = (partidaId: number | string, catalogoId: string) => {
    const cat = catalogo.find(c => c._id === catalogoId);
    if (!cat) return;
    setPartidas(prev => prev.map(p => {
      if (p.id !== partidaId) return p;
      const qty = Number(p.cantidad ?? 1);
      return {
        ...p,
        partidaPredefinidaId: cat._id,
        gremio: cat.gremio,
        nombre: cat.nombre,
        descripcion: cat.descripcion,
        unidad: cat.unidad,
        precioUnitarioMateriales: cat.precioMateriales,
        precioUnitarioManoObra: cat.precioManoObra,
        precioUnitarioEstructural: cat.precioEstructural,
        precioUnitario: cat.precioUnitario,
        materiales: qty * cat.precioMateriales,
        manoObra: qty * cat.precioManoObra,
        estructural: qty * cat.precioEstructural,
        subtotal: qty * cat.precioUnitario,
      };
    }));
  };

  const autoFillFromGuild = (partidaId: number | string, gremioTipo: string) => {
    const guild = guilds.find(g => g.tipo === gremioTipo);
    if (!guild) {
      updatePartida(partidaId, 'gremio', gremioTipo);
      return;
    }
    setPartidas(prev => prev.map(p => {
      if (p.id !== partidaId) return p;
      const qty = Number(p.cantidad ?? 1);
      return {
        ...p,
        gremio: gremioTipo,
        descripcion: guild.nombre,
        precioUnitarioMateriales: guild.precioMateriales,
        precioUnitarioManoObra: guild.precioManoObra,
        precioUnitarioEstructural: guild.precioEstructural,
        precioUnitario: guild.precioTotal,
        materiales: qty * guild.precioMateriales,
        manoObra: qty * guild.precioManoObra,
        estructural: qty * guild.precioEstructural,
        subtotal: qty * guild.precioTotal,
      };
    }));
  };

  const guildLabels = config?.guildLabels || {};
  const guildTypes = config?.guilds || [];

  const totalPartidas = partidas.reduce((s, p) => s + (Number(p.materiales) + Number(p.manoObra) + Number(p.estructural)), 0);
  const totalConMargen = totalPartidas * (1 + form.margen / 100);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.proyectoNombre.trim() || !userId) return;
    try {
      const payload = { ...form, partidas };
      if (editing) {
        const updated = await updateConstructionBudget(userId, { ...editing, ...payload } as ConstructionBudget);
        setBudgets(prev => prev.map(b => b._id === updated._id ? updated : b));
      } else {
        const created = await createConstructionBudget(userId, payload);
        setBudgets(prev => [created, ...prev]);
      }
      setModalOpen(false);
      showToast(editing ? 'Presupuesto actualizado' : 'Presupuesto creado');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al guardar presupuesto', 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try {
      await deleteConstructionBudget(userId, id);
      setBudgets(prev => prev.filter(b => b._id !== id));
      showToast('Presupuesto eliminado');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al eliminar presupuesto', 'error'); }
  };

  const handleAccept = async () => {
    if (!acceptModal || !userId) return;
    try {
      const updated = await acceptConstructionBudget(userId, acceptModal._id, metodoPago, numPlazos);
      setBudgets(prev => prev.map(b => b._id === updated._id ? updated : b));
      setAcceptModal(null);
      showToast('Presupuesto aceptado');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al aceptar presupuesto', 'error'); }
  };

  const handlePay = async (budgetId: string, pagoId: number) => {
    if (!userId) return;
    try {
      const updated = await registerConstructionPayment(userId, budgetId, pagoId);
      setBudgets(prev => prev.map(b => b._id === updated._id ? updated : b));
      setDetailModal(updated);
      showToast('Pago registrado');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al registrar pago', 'error'); }
  };

  const onClientChange = (clienteId: string) => {
    const c = clients.find(cl => cl._id === clienteId);
    setForm(prev => ({ ...prev, clienteId, clienteNombre: c?.nombre || '' }));
  };

  const handleSend = async (budgetId: string) => {
    if (!userId) return;
    try {
      const updated = await sendConstructionBudget(userId, budgetId);
      setBudgets(prev => prev.map(b => b._id === updated._id ? updated : b));
      showToast('Presupuesto enviado');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al enviar', 'error'); }
  };

  const handleReject = async () => {
    if (!rejectModal || !userId) return;
    try {
      const updated = await rejectConstructionBudget(userId, rejectModal._id, motivoRechazo);
      setBudgets(prev => prev.map(b => b._id === updated._id ? updated : b));
      setRejectModal(null);
      setMotivoRechazo('');
      showToast('Presupuesto rechazado');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al rechazar', 'error'); }
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  if (loading) return <Layout title="Presupuestos de Obra"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;

  return (
    <Layout title="Presupuestos de Obra">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Pendientes / Borrador', value: stats.pendientes, icon: Clock, color: 'text-amber-600' },
          { label: 'Aceptados', value: stats.aceptados, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Valor total aceptado', value: fmt(stats.valorTotal), icon: TrendingUp, color: 'text-purple-600' },
          { label: 'Total cobrado', value: fmt(stats.totalPagado), icon: Banknote, color: 'text-emerald-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2"><s.icon className={`w-5 h-5 ${s.color}`} /><span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span></div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar presupuestos..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="todos">Todos</option>
              <option value="borrador">Borrador</option>
              <option value="enviado">Enviado</option>
              <option value="aceptado">Aceptado</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
          <button onClick={() => navigate('/saas/vertical/construccion/presupuestos')} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors"><Zap className="w-5 h-5" /> Presupuesto rápido</button>
          <AddButtonDropdown
                label="Nuevo presupuesto"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de presupuesto"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Ref.', 'Tipo obra', 'Proyecto', 'Cliente', 'Fecha', 'Partidas', 'Total', 'Con margen', 'Pagado', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => {
              const cfg = estadoConfig[b.estado] || estadoConfig.borrador;
              const Icon = cfg.icon;
              return (
                <tr key={b._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Receipt className="w-4 h-4 text-gray-400 shrink-0" />{b.referencia}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{b.tipoObra}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">{b.proyectoNombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{b.clienteNombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{b.fecha}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{b.partidas.length}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt(b.totalPartidas)}</td>
                  <td className="px-4 py-3 font-semibold text-purple-700 dark:text-purple-400 whitespace-nowrap">{fmt(b.totalConMargen)}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{fmt(b.totalPagado)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.color}`}><Icon className="w-3.5 h-3.5" />{b.estado}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setDetailModal(b)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Ver detalle"><Eye className="w-4 h-4 text-gray-500" /></button>
                      {b.estado !== 'aceptado' && b.estado !== 'rechazado' && <button onClick={() => openEdit(b)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar"><Edit3 className="w-4 h-4 text-gray-500" /></button>}
                      {b.estado === 'borrador' && <button onClick={() => handleSend(b._id)} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Enviar"><Send className="w-4 h-4 text-blue-600" /></button>}
                      {(b.estado === 'enviado' || b.estado === 'borrador') && <button onClick={() => { setAcceptModal(b); setMetodoPago('contado'); setNumPlazos(3); }} className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors" title="Aceptar"><CheckCircle2 className="w-4 h-4 text-green-600" /></button>}
                      {(b.estado === 'enviado' || b.estado === 'borrador') && <button onClick={() => { setRejectModal(b); setMotivoRechazo(''); }} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Rechazar"><XCircle className="w-4 h-4 text-red-500" /></button>}
                      {b.estado !== 'aceptado' && <button onClick={() => handleDelete(b._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">No se encontraron presupuestos</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal crear / editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className={labelClass}>Proyecto / Obra</label><input className={inputClass} value={form.proyectoNombre} onChange={e => setForm({ ...form, proyectoNombre: e.target.value })} required /></div>
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
                <div>
                  <label className={labelClass}>Tipo de obra</label>
                  <select className={inputClass} value={form.tipoObra} onChange={e => setForm({ ...form, tipoObra: e.target.value })}>
                    {TIPOS_OBRA.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Fecha</label><input type="date" className={inputClass} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
                <div><label className={labelClass}>Margen (%)</label><input type="number" className={inputClass} value={form.margen} onChange={e => setForm({ ...form, margen: Number(e.target.value) })} /></div>
                <div>
                  <label className={labelClass}>Estado</label>
                  <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}>
                    <option value="borrador">Borrador</option><option value="enviado">Enviado</option>
                  </select>
                </div>
              </div>

              {/* Partidas por gremio */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Partidas por gremio</label>
                  <button type="button" onClick={addPartida} className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"><Plus className="w-4 h-4" />Añadir partida</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                        <th className="pb-2 pr-2">Gremio</th>
                        <th className="pb-2 pr-2">Descripción</th>
                        <th className="pb-2 pr-2 w-28">Materiales</th>
                        <th className="pb-2 pr-2 w-28">Mano obra</th>
                        <th className="pb-2 pr-2 w-28">Estructural</th>
                        <th className="pb-2 pr-2 w-28 text-right">Subtotal</th>
                        <th className="pb-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {partidas.map(p => (
                        <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700/50">
                          <td className="py-2 pr-2">
                            <select className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" value={p.gremio} onChange={e => autoFillFromGuild(p.id, e.target.value)}>
                              <option value="">— Gremio —</option>
                              {guildTypes.map(g => (
                                <option key={g} value={g}>{guildLabels[g] || g}</option>
                              ))}
                            </select>
                            {catalogo.filter(c => !p.gremio || c.gremio === p.gremio).length > 0 && (
                              <select className="w-full mt-1 px-2 py-1.5 border border-blue-200 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs" value={p.partidaPredefinidaId || ''} onChange={e => fillFromCatalogo(p.id, e.target.value)}>
                                <option value="">📋 Del catálogo…</option>
                                {catalogo.filter(c => !p.gremio || c.gremio === p.gremio).map(c => (
                                  <option key={c._id} value={c._id}>{c.codigo} – {c.nombre} ({fmt(c.precioUnitario)}/{c.unidad})</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="py-2 pr-2"><input className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} /></td>
                          <td className="py-2 pr-2"><input type="number" className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" value={p.materiales} onChange={e => updatePartida(p.id, 'materiales', Number(e.target.value))} /></td>
                          <td className="py-2 pr-2"><input type="number" className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" value={p.manoObra} onChange={e => updatePartida(p.id, 'manoObra', Number(e.target.value))} /></td>
                          <td className="py-2 pr-2"><input type="number" className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" value={p.estructural} onChange={e => updatePartida(p.id, 'estructural', Number(e.target.value))} /></td>
                          <td className="py-2 pr-2 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt(Number(p.materiales) + Number(p.manoObra) + Number(p.estructural))}</td>
                          <td className="py-2"><button type="button" onClick={() => removePartida(p.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex justify-end gap-6 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Subtotal: <strong className="text-gray-900 dark:text-gray-100">{fmt(totalPartidas)}</strong></span>
                  <span className="text-gray-500 dark:text-gray-400">Margen {form.margen}%: <strong className="text-gray-900 dark:text-gray-100">{fmt(totalConMargen - totalPartidas)}</strong></span>
                  <span className="text-purple-600 dark:text-purple-400 font-bold text-base">Total: {fmt(totalConMargen)}</span>
                </div>
              </div>

              <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal aceptar presupuesto */}
      {acceptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setAcceptModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Aceptar presupuesto</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{acceptModal.referencia} — {fmt(acceptModal.totalConMargen)}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelClass}>Método de pago</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setMetodoPago('contado')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold transition-colors ${metodoPago === 'contado' ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    <Banknote className="w-5 h-5" /> Al contado
                  </button>
                  <button type="button" onClick={() => setMetodoPago('plazos')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold transition-colors ${metodoPago === 'plazos' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    <CreditCard className="w-5 h-5" /> Por plazos
                  </button>
                </div>
              </div>
              {metodoPago === 'plazos' && (
                <div>
                  <label className={labelClass}>Número de plazos</label>
                  <input type="number" min={2} max={24} className={inputClass} value={numPlazos} onChange={e => setNumPlazos(Number(e.target.value))} />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{numPlazos} pagos de {fmt(acceptModal.totalConMargen / numPlazos)}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setAcceptModal(null)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button onClick={handleAccept} className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors">Aceptar presupuesto</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle con pagos */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetailModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{detailModal.referencia}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{detailModal.proyectoNombre} — {detailModal.clienteNombre} — {detailModal.tipoObra}</p>
              </div>
              <button onClick={() => setDetailModal(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Resumen partidas */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Partidas</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="pb-1">Gremio</th><th className="pb-1">Descripción</th><th className="pb-1 text-right">Mat.</th><th className="pb-1 text-right">M.O.</th><th className="pb-1 text-right">Estr.</th><th className="pb-1 text-right">Subtotal</th></tr></thead>
                  <tbody>
                    {detailModal.partidas.map(p => (
                      <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700/50">
                        <td className="py-1.5 capitalize">{p.gremio}</td>
                        <td className="py-1.5">{p.descripcion}</td>
                        <td className="py-1.5 text-right">{fmt(p.materiales)}</td>
                        <td className="py-1.5 text-right">{fmt(p.manoObra)}</td>
                        <td className="py-1.5 text-right">{fmt(p.estructural)}</td>
                        <td className="py-1.5 text-right font-semibold">{fmt(p.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex justify-end gap-6 text-sm">
                  <span>Subtotal: <strong>{fmt(detailModal.totalPartidas)}</strong></span>
                  <span>Margen {detailModal.margen}%</span>
                  <span className="text-purple-600 dark:text-purple-400 font-bold">Total: {fmt(detailModal.totalConMargen)}</span>
                </div>
              </div>

              {detailModal.motivoRechazo && detailModal.estado === 'rechazado' && (
                <div className="flex items-start gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                  <MessageSquare className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div><p className="text-xs font-semibold text-red-600 dark:text-red-400">Motivo de rechazo</p><p className="text-sm text-red-700 dark:text-red-300">{detailModal.motivoRechazo}</p></div>
                </div>
              )}

              {/* Pagos */}
              {detailModal.estado === 'aceptado' && detailModal.pagos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Repartición de pagos ({detailModal.metodoPago})</h3>
                  <div className="space-y-2">
                    {detailModal.pagos.map(p => (
                      <div key={p.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 ${p.pagado ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                        <div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{p.concepto}</span>
                          {p.fecha && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{p.fecha}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gray-900 dark:text-gray-100">{fmt(p.importe)}</span>
                          {p.pagado ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="w-3.5 h-3.5" />Pagado</span>
                          ) : (
                            <button onClick={() => handlePay(detailModal._id, p.id)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors">Marcar pagado</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between text-sm font-semibold">
                    <span className="text-emerald-600">Pagado: {fmt(detailModal.totalPagado)}</span>
                    <span className="text-red-600">Pendiente: {fmt(detailModal.pendientePago)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal rechazar */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setRejectModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Rechazar presupuesto</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{rejectModal.referencia} — {fmt(rejectModal.totalConMargen)}</p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className={labelClass}>Motivo del rechazo</label><textarea className={inputClass} rows={3} value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Indica el motivo..." /></div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setRejectModal(null)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button onClick={handleReject} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors">Rechazar</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_budgets"
        moduleLabel="Presupuestos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Presupuestos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
