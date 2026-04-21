import { useState, useMemo, useEffect, useCallback } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Edit3, Filter, Eye, Trash2, Banknote,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, ChevronDown, ChevronRight,
  CreditCard, ArrowDownCircle, Building2, Users, CalendarClock, Receipt,
} from 'lucide-react';
import type {
  ConstructionCollection, CollectionEntrega, ConstructionProject, ConstructionClient,
  CollectionTipoCobro, CollectionEstado, EntregaTipo,
} from '../../lib/constructionApi';
import {
  listConstructionCollections, createConstructionCollection, updateConstructionCollection,
  deleteConstructionCollection, collectConstructionPayment, collectConstructionPartialPayment,
  listConstructionProjects, listConstructionClients,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';

const TIPOS_COBRO: { value: CollectionTipoCobro; label: string; desc: string }[] = [
  { value: 'contado', label: 'Contado', desc: 'Pago único al formalizar' },
  { value: 'plazos', label: 'Plazos', desc: 'Importes iguales divididos' },
  { value: 'fases', label: 'Fases', desc: 'Por fases de obra personalizables' },
  { value: 'hitos', label: 'Hitos', desc: 'Vinculados a hitos de la obra' },
  { value: 'anticipo_parciales_cierre', label: 'Anticipo + Parciales + Cierre', desc: 'Anticipo inicial, parciales y cierre' },
];

const ESTADO_CONFIG: Record<CollectionEstado, { color: string; icon: typeof Clock; label: string }> = {
  pendiente: { color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', icon: Clock, label: 'Pendiente' },
  parcial: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: ArrowDownCircle, label: 'Parcial' },
  cobrado: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2, label: 'Cobrado' },
  vencido: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertTriangle, label: 'Vencido' },
};

const TIPO_COBRO_LABELS: Record<CollectionTipoCobro, string> = {
  contado: 'Contado', plazos: 'Plazos', fases: 'Fases', hitos: 'Hitos',
  anticipo_parciales_cierre: 'Anticipo+Parciales+Cierre',
};

const fmt = (n: number) => (n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

type ViewTab = 'todos' | 'por-obra' | 'por-cliente';

export function ConstructionCollections() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';

  const [collections, setCollections] = useState<ConstructionCollection[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [clients, setClients] = useState<ConstructionClient[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [viewTab, setViewTab] = useState<ViewTab>('todos');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionCollection | null>(null);
  const [detailModal, setDetailModal] = useState<ConstructionCollection | null>(null);
  const [collectModal, setCollectModal] = useState<{ collection: ConstructionCollection; entrega: CollectionEntrega } | null>(null);

  const [form, setForm] = useState({
    obraId: '', obraNombre: '', clienteId: '', clienteNombre: '', presupuestoId: '',
    tipoCobro: 'contado' as CollectionTipoCobro, importeTotal: 0, observaciones: '',
    numPlazos: 3, anticipoPct: 30,
  });
  const [entregas, setEntregas] = useState<Partial<CollectionEntrega>[]>([]);
  const [collectForm, setCollectForm] = useState({ tipo: 'total' as 'total' | 'parcial', importeParcial: 0, fechaCobro: '', observaciones: '' });

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'client', label: 'Cliente' },
    { key: 'project', label: 'Proyecto' },
    { key: 'amount', label: 'Importe' },
    { key: 'date', label: 'Fecha' },
    { key: 'method', label: 'Forma de pago' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'project', label: 'Proyecto', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'method', label: 'Forma de pago', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} cobro(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} cobro(s) importado(s)`);
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useModalClose(modalOpen, () => setModalOpen(false));
  useModalClose(!!detailModal, () => setDetailModal(null));
  useModalClose(!!collectModal, () => setCollectModal(null));

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [col, prj, cli] = await Promise.all([
        listConstructionCollections(userId),
        listConstructionProjects(userId),
        listConstructionClients(userId),
      ]);
      setCollections(col); setProjects(prj); setClients(cli);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al cargar datos', 'error'); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => collections.filter(c => {
    const q = `${c.obraNombre} ${c.clienteNombre} ${c.referencia}`.toLowerCase();
    const matchSearch = q.includes(search.toLowerCase());
    const matchEstado = filterEstado === 'todos' || c.estadoCobro === filterEstado;
    const matchTipo = filterTipo === 'todos' || c.tipoCobro === filterTipo;
    return matchSearch && matchEstado && matchTipo;
  }), [collections, search, filterEstado, filterTipo]);

  const stats = useMemo(() => ({
    totalFacturado: collections.reduce((s, c) => s + c.importeTotal, 0),
    totalCobrado: collections.reduce((s, c) => s + c.importeCobrado, 0),
    saldoPendiente: collections.reduce((s, c) => s + c.saldoPendiente, 0),
    cobrosVencidos: collections.filter(c => c.estadoCobro === 'vencido').length,
  }), [collections]);

  const groupedByProject = useMemo(() => {
    const map = new Map<string, { obraId: string; obraNombre: string; items: ConstructionCollection[] }>();
    for (const c of filtered) {
      const key = c.obraId || 'sin-obra';
      if (!map.has(key)) map.set(key, { obraId: c.obraId, obraNombre: c.obraNombre || 'Sin obra', items: [] });
      map.get(key)!.items.push(c);
    }
    return Array.from(map.values());
  }, [filtered]);

  const groupedByClient = useMemo(() => {
    const map = new Map<string, { clienteId: string; clienteNombre: string; items: ConstructionCollection[] }>();
    for (const c of filtered) {
      const key = c.clienteId || 'sin-cliente';
      if (!map.has(key)) map.set(key, { clienteId: c.clienteId, clienteNombre: c.clienteNombre || 'Sin cliente', items: [] });
      map.get(key)!.items.push(c);
    }
    return Array.from(map.values());
  }, [filtered]);

  function generateEntregas(tipoCobro: CollectionTipoCobro, importeTotal: number, numPlazos: number, anticipoPct: number): Partial<CollectionEntrega>[] {
    if (importeTotal <= 0) return [];
    switch (tipoCobro) {
      case 'contado':
        return [{ id: 1, concepto: 'Pago único al contado', tipo: 'contado' as EntregaTipo, importe: importeTotal, fechaPrevista: '', estado: 'pendiente' }];
      case 'plazos': {
        const n = Math.max(1, numPlazos);
        const each = Math.round((importeTotal / n) * 100) / 100;
        return Array.from({ length: n }, (_, i) => ({
          id: i + 1, concepto: `Plazo ${i + 1} de ${n}`, tipo: 'plazo' as EntregaTipo,
          importe: i === n - 1 ? Math.round((importeTotal - each * (n - 1)) * 100) / 100 : each,
          fechaPrevista: '', estado: 'pendiente' as const,
        }));
      }
      case 'fases':
        return [
          { id: 1, concepto: 'Fase 1 — Cimentación', tipo: 'fase' as EntregaTipo, importe: Math.round(importeTotal * 0.3 * 100) / 100, fechaPrevista: '', estado: 'pendiente' as const },
          { id: 2, concepto: 'Fase 2 — Estructura', tipo: 'fase' as EntregaTipo, importe: Math.round(importeTotal * 0.3 * 100) / 100, fechaPrevista: '', estado: 'pendiente' as const },
          { id: 3, concepto: 'Fase 3 — Acabados y cierre', tipo: 'fase' as EntregaTipo, importe: Math.round(importeTotal * 0.4 * 100) / 100, fechaPrevista: '', estado: 'pendiente' as const },
        ];
      case 'hitos':
        return [
          { id: 1, concepto: 'Hito 1', tipo: 'hito' as EntregaTipo, importe: Math.round(importeTotal * 0.5 * 100) / 100, fechaPrevista: '', estado: 'pendiente' as const },
          { id: 2, concepto: 'Hito 2', tipo: 'hito' as EntregaTipo, importe: Math.round(importeTotal * 0.5 * 100) / 100, fechaPrevista: '', estado: 'pendiente' as const },
        ];
      case 'anticipo_parciales_cierre': {
        const anticipo = Math.round(importeTotal * (anticipoPct / 100) * 100) / 100;
        const cierre = Math.round(importeTotal * 0.2 * 100) / 100;
        const parcial = Math.round((importeTotal - anticipo - cierre) * 100) / 100;
        return [
          { id: 1, concepto: `Anticipo ${anticipoPct}%`, tipo: 'anticipo' as EntregaTipo, importe: anticipo, fechaPrevista: '', estado: 'pendiente' as const },
          { id: 2, concepto: 'Parcial intermedio', tipo: 'parcial' as EntregaTipo, importe: parcial, fechaPrevista: '', estado: 'pendiente' as const },
          { id: 3, concepto: 'Cierre final', tipo: 'cierre' as EntregaTipo, importe: cierre, fechaPrevista: '', estado: 'pendiente' as const },
        ];
      }
    }
  }

  const openCreate = () => {
    setEditing(null);
    setForm({ obraId: '', obraNombre: '', clienteId: '', clienteNombre: '', presupuestoId: '', tipoCobro: 'contado', importeTotal: 0, observaciones: '', numPlazos: 3, anticipoPct: 30 });
    setEntregas([]);
    setModalOpen(true);
  };

  const openEdit = (c: ConstructionCollection) => {
    setEditing(c);
    setForm({
      obraId: c.obraId, obraNombre: c.obraNombre, clienteId: c.clienteId, clienteNombre: c.clienteNombre,
      presupuestoId: c.presupuestoId, tipoCobro: c.tipoCobro, importeTotal: c.importeTotal,
      observaciones: c.observaciones, numPlazos: c.entregas.length || 3, anticipoPct: 30,
    });
    setEntregas(c.entregas.map(e => ({ ...e })));
    setModalOpen(true);
  };

  const handleObraChange = (obraId: string) => {
    const prj = projects.find(p => p._id === obraId);
    if (prj) {
      setForm(f => ({
        ...f, obraId, obraNombre: prj.nombre,
        clienteId: prj.clienteId || f.clienteId,
        clienteNombre: prj.clienteNombre || f.clienteNombre,
      }));
    }
  };

  const handleTipoCobroChange = (tipoCobro: CollectionTipoCobro) => {
    setForm(f => ({ ...f, tipoCobro }));
    if (form.importeTotal > 0) {
      setEntregas(generateEntregas(tipoCobro, form.importeTotal, form.numPlazos, form.anticipoPct));
    }
  };

  const handleImporteChange = (importeTotal: number) => {
    setForm(f => ({ ...f, importeTotal }));
    if (importeTotal > 0) {
      setEntregas(generateEntregas(form.tipoCobro, importeTotal, form.numPlazos, form.anticipoPct));
    }
  };

  const handleSave = async () => {
    if (!form.obraId) return showToast('Selecciona una obra', 'error');
    if (form.importeTotal <= 0) return showToast('El importe debe ser mayor a 0', 'error');
    if (entregas.length === 0) return showToast('Añade al menos una entrega', 'error');

    try {
      const data = {
        obraId: form.obraId, obraNombre: form.obraNombre,
        clienteId: form.clienteId, clienteNombre: form.clienteNombre,
        presupuestoId: form.presupuestoId, tipoCobro: form.tipoCobro,
        importeTotal: form.importeTotal, observaciones: form.observaciones,
        entregas: entregas.map((e, i) => ({
          id: e.id || i + 1,
          concepto: e.concepto || '',
          tipo: e.tipo || 'plazo',
          importe: e.importe || 0,
          fechaPrevista: e.fechaPrevista || '',
          fechaCobro: e.fechaCobro || '',
          estado: e.estado || 'pendiente',
          cobradoParcial: e.cobradoParcial || 0,
          cobradoTotal: e.cobradoTotal || 0,
          observaciones: e.observaciones || '',
          financeMovementId: e.financeMovementId || '',
        })),
      };

      if (editing) {
        await updateConstructionCollection(userId, { ...editing, ...data } as ConstructionCollection);
        showToast('Cobro actualizado');
      } else {
        await createConstructionCollection(userId, data as Partial<ConstructionCollection>);
        showToast('Cobro creado');
      }
      setModalOpen(false);
      load();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al guardar', 'error'); }
  };

  const handleDelete = async (c: ConstructionCollection) => {
    if (!confirm(`¿Eliminar cobro ${c.referencia}?`)) return;
    try {
      await deleteConstructionCollection(userId, c._id);
      showToast('Cobro eliminado');
      load();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error', 'error'); }
  };

  const openCollect = (collection: ConstructionCollection, entrega: CollectionEntrega) => {
    setCollectModal({ collection, entrega });
    setCollectForm({ tipo: 'total', importeParcial: 0, fechaCobro: new Date().toISOString().slice(0, 10), observaciones: '' });
  };

  const handleCollect = async () => {
    if (!collectModal) return;
    const { collection, entrega } = collectModal;
    try {
      if (collectForm.tipo === 'total') {
        await collectConstructionPayment(userId, collection._id, entrega.id, collectForm.fechaCobro, collectForm.observaciones);
      } else {
        if (collectForm.importeParcial <= 0) return showToast('Importe parcial debe ser > 0', 'error');
        await collectConstructionPartialPayment(userId, collection._id, entrega.id, collectForm.importeParcial, collectForm.fechaCobro, collectForm.observaciones);
      }
      showToast('Cobro registrado correctamente');
      setCollectModal(null);
      load();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al registrar cobro', 'error'); }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const progressPct = (cobrado: number, total: number) => total > 0 ? Math.min(100, Math.round((cobrado / total) * 100)) : 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <Layout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div></Layout>;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Banknote className="w-7 h-7 text-emerald-600" /> Cobros de Obra
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Control de cobros por obra y cliente</p>
          </div>
          <AddButtonDropdown
                label="Nuevo cobro"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de cobro"
              />
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total facturado', value: fmt(stats.totalFacturado), icon: Receipt, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Total cobrado', value: fmt(stats.totalCobrado), icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
            { label: 'Saldo pendiente', value: fmt(stats.saldoPendiente), icon: CalendarClock, color: stats.saldoPendiente > 0 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-gray-600 bg-gray-50 dark:bg-gray-800' },
            { label: 'Cobros vencidos', value: String(stats.cobrosVencidos), icon: AlertTriangle, color: stats.cobrosVencidos > 0 ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 'text-gray-600 bg-gray-50 dark:bg-gray-800' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${kpi.color}`}><kpi.icon className="w-5 h-5" /></div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{kpi.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters + Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0 bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar obra, cliente, referencia…" className="bg-transparent text-sm w-full outline-none text-gray-700 dark:text-gray-200" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-gray-700 dark:text-gray-200">
                <option value="todos">Estado: Todos</option>
                {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-gray-700 dark:text-gray-200">
                <option value="todos">Tipo: Todos</option>
                {TIPOS_COBRO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* View tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-700">
            {([
              { key: 'todos', label: 'Todos', icon: CreditCard },
              { key: 'por-obra', label: 'Por obra', icon: Building2 },
              { key: 'por-cliente', label: 'Por cliente', icon: Users },
            ] as { key: ViewTab; label: string; icon: typeof CreditCard }[]).map(tab => (
              <button key={tab.key} onClick={() => setViewTab(tab.key)} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${viewTab === tab.key ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-4">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                <Banknote className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No hay cobros</p>
                <p className="text-sm mt-1">Crea un nuevo cobro para empezar a controlar los ingresos de tus obras</p>
              </div>
            ) : viewTab === 'todos' ? (
              <CollectionTable items={filtered} onDetail={setDetailModal} onEdit={openEdit} onDelete={handleDelete} onCollect={openCollect} />
            ) : viewTab === 'por-obra' ? (
              <GroupedView groups={groupedByProject} groupKey="obraId" groupLabel="obraNombre" expanded={expandedGroups} toggle={toggleGroup} onDetail={setDetailModal} onEdit={openEdit} onDelete={handleDelete} onCollect={openCollect} />
            ) : (
              <GroupedView groups={groupedByClient} groupKey="clienteId" groupLabel="clienteNombre" expanded={expandedGroups} toggle={toggleGroup} onDetail={setDetailModal} onEdit={openEdit} onDelete={handleDelete} onCollect={openCollect} />
            )}
          </div>
        </div>

        {/* Create/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar cobro' : 'Nuevo cobro'}</h2>
                <button onClick={() => setModalOpen(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-5">
                {/* Obra */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Obra *</label>
                  <select value={form.obraId} onChange={e => handleObraChange(e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-sm">
                    <option value="">Seleccionar obra…</option>
                    {projects.map(p => <option key={p._id} value={p._id}>{p.nombre} — {p.clienteNombre || 'Sin cliente'}</option>)}
                  </select>
                </div>

                {/* Cliente (auto) */}
                {form.clienteNombre && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Cliente</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{form.clienteNombre}</p>
                  </div>
                )}

                {/* Tipo cobro */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de cobro *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TIPOS_COBRO.map(t => (
                      <button key={t.value} onClick={() => handleTipoCobroChange(t.value)}
                        className={`text-left p-3 rounded-xl border-2 transition-all text-sm ${form.tipoCobro === t.value ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}>
                        <p className="font-medium text-gray-900 dark:text-white">{t.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Importe total */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Importe total *</label>
                  <div className="relative">
                    <input type="number" value={form.importeTotal || ''} onChange={e => handleImporteChange(Number(e.target.value))} placeholder="0.00" min="0" step="0.01"
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-sm pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                  </div>
                </div>

                {/* Config extra según tipo */}
                {form.tipoCobro === 'plazos' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número de plazos</label>
                    <input type="number" value={form.numPlazos} onChange={e => { setForm(f => ({ ...f, numPlazos: Number(e.target.value) })); if (form.importeTotal > 0) setEntregas(generateEntregas('plazos', form.importeTotal, Number(e.target.value), form.anticipoPct)); }} min="1" max="60"
                      className="w-24 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-sm" />
                  </div>
                )}
                {form.tipoCobro === 'anticipo_parciales_cierre' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">% Anticipo</label>
                    <input type="number" value={form.anticipoPct} onChange={e => { setForm(f => ({ ...f, anticipoPct: Number(e.target.value) })); if (form.importeTotal > 0) setEntregas(generateEntregas('anticipo_parciales_cierre', form.importeTotal, form.numPlazos, Number(e.target.value))); }} min="1" max="90"
                      className="w-24 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-sm" />
                  </div>
                )}

                {/* Entregas */}
                {entregas.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Entregas ({entregas.length})</label>
                      <button onClick={() => setEntregas([...entregas, { id: entregas.length + 1, concepto: '', tipo: 'plazo' as EntregaTipo, importe: 0, fechaPrevista: '', estado: 'pendiente' }])}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Añadir</button>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {entregas.map((e, i) => (
                        <div key={e.id || i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                          <input value={e.concepto || ''} onChange={ev => { const n = [...entregas]; n[i] = { ...n[i], concepto: ev.target.value }; setEntregas(n); }}
                            placeholder="Concepto" className="flex-1 min-w-0 text-sm bg-transparent border-b border-gray-200 dark:border-gray-600 outline-none px-1 py-0.5" />
                          <input type="number" value={e.importe || ''} onChange={ev => { const n = [...entregas]; n[i] = { ...n[i], importe: Number(ev.target.value) }; setEntregas(n); }}
                            placeholder="0" className="w-24 text-sm bg-transparent border-b border-gray-200 dark:border-gray-600 outline-none px-1 py-0.5 text-right" />
                          <span className="text-xs text-gray-400">€</span>
                          <input type="date" value={e.fechaPrevista || ''} onChange={ev => { const n = [...entregas]; n[i] = { ...n[i], fechaPrevista: ev.target.value }; setEntregas(n); }}
                            className="text-xs bg-transparent border-b border-gray-200 dark:border-gray-600 outline-none px-1 py-0.5" />
                          <button onClick={() => setEntregas(entregas.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Total entregas: <span className="font-semibold">{fmt(entregas.reduce((s, e) => s + (e.importe || 0), 0))}</span></p>
                  </div>
                )}

                {/* Observaciones */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
                  <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} rows={2} placeholder="Notas internas…"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-sm resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">Cancelar</button>
                <button onClick={handleSave} className="px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm">
                  {editing ? 'Guardar cambios' : 'Crear cobro'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {detailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-emerald-600" /> {detailModal.referencia}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{detailModal.obraNombre} — {detailModal.clienteNombre}</p>
                </div>
                <button onClick={() => setDetailModal(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-5">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                    <p className="text-xs text-blue-600 dark:text-blue-400">Importe total</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{fmt(detailModal.importeTotal)}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Cobrado</p>
                    <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{fmt(detailModal.importeCobrado)}</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${detailModal.saldoPendiente > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-700'}`}>
                    <p className={`text-xs ${detailModal.saldoPendiente > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}`}>Pendiente</p>
                    <p className={`text-lg font-bold ${detailModal.saldoPendiente > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>{fmt(detailModal.saldoPendiente)}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progreso de cobro</span>
                    <span>{progressPct(detailModal.importeCobrado, detailModal.importeTotal)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${progressPct(detailModal.importeCobrado, detailModal.importeTotal)}%` }} />
                  </div>
                </div>

                {/* Info row */}
                <div className="flex flex-wrap gap-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${ESTADO_CONFIG[detailModal.estadoCobro]?.color || ''}`}>
                    {(() => { const Ic = ESTADO_CONFIG[detailModal.estadoCobro]?.icon || Clock; return <Ic className="w-3.5 h-3.5" />; })()}
                    {ESTADO_CONFIG[detailModal.estadoCobro]?.label || detailModal.estadoCobro}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {TIPO_COBRO_LABELS[detailModal.tipoCobro] || detailModal.tipoCobro}
                  </span>
                </div>

                {/* Entregas */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Entregas</h3>
                  <div className="space-y-2">
                    {(detailModal.entregas || []).map(e => {
                      const ec = ESTADO_CONFIG[e.estado] || ESTADO_CONFIG.pendiente;
                      const EcIcon = ec.icon;
                      const pct = e.importe > 0 ? Math.round(((e.cobradoTotal || 0) + (e.cobradoParcial || 0)) / e.importe * 100) : 0;
                      return (
                        <div key={e.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ec.color}`}>
                                  <EcIcon className="w-3 h-3" /> {ec.label}
                                </span>
                                <span className="text-xs text-gray-400">{e.tipo}</span>
                              </div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{e.concepto}</p>
                              <div className="flex gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                <span>Importe: <strong>{fmt(e.importe)}</strong></span>
                                <span>Previsto: {fmtDate(e.fechaPrevista)}</span>
                                {e.fechaCobro && <span>Cobrado: {fmtDate(e.fechaCobro)}</span>}
                              </div>
                              {e.cobradoParcial > 0 && e.estado === 'parcial' && (
                                <div className="mt-2">
                                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                                    <span>Parcial: {fmt(e.cobradoParcial)}</span>
                                    <span>{pct}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                    <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              )}
                              {e.observaciones && <p className="text-xs text-gray-400 mt-1 italic">{e.observaciones}</p>}
                            </div>
                            {e.estado !== 'cobrado' && (
                              <button onClick={() => openCollect(detailModal, e)}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                                <Banknote className="w-3.5 h-3.5" /> Cobrar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {detailModal.observaciones && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Observaciones</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{detailModal.observaciones}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Collect Modal */}
        {collectModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Registrar cobro</h2>
                <button onClick={() => setCollectModal(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{collectModal.entrega.concepto}</p>
                  <p className="text-xs text-gray-500 mt-1">Importe: <strong>{fmt(collectModal.entrega.importe)}</strong></p>
                  {collectModal.entrega.cobradoParcial > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">Ya cobrado parcial: {fmt(collectModal.entrega.cobradoParcial)}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  {(['total', 'parcial'] as const).map(t => (
                    <button key={t} onClick={() => setCollectForm(f => ({ ...f, tipo: t }))}
                      className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border-2 transition-all ${collectForm.tipo === t ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700' : 'border-gray-200 dark:border-gray-600 text-gray-600'}`}>
                      {t === 'total' ? 'Cobro total' : 'Cobro parcial'}
                    </button>
                  ))}
                </div>

                {collectForm.tipo === 'parcial' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Importe parcial *</label>
                    <div className="relative">
                      <input type="number" value={collectForm.importeParcial || ''} onChange={e => setCollectForm(f => ({ ...f, importeParcial: Number(e.target.value) }))}
                        placeholder="0.00" min="0" step="0.01" className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-sm pr-8" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de cobro</label>
                  <input type="date" value={collectForm.fechaCobro} onChange={e => setCollectForm(f => ({ ...f, fechaCobro: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
                  <textarea value={collectForm.observaciones} onChange={e => setCollectForm(f => ({ ...f, observaciones: e.target.value }))} rows={2} placeholder="Notas…"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-sm resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
                <button onClick={() => setCollectModal(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">Cancelar</button>
                <button onClick={handleCollect} className="px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Confirmar cobro
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-[70] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function CollectionTable({ items, onDetail, onEdit, onDelete, onCollect }: {
  items: ConstructionCollection[];
  onDetail: (c: ConstructionCollection) => void;
  onEdit: (c: ConstructionCollection) => void;
  onDelete: (c: ConstructionCollection) => void;
  onCollect: (c: ConstructionCollection, e: CollectionEntrega) => void;
}) {
  const nextPending = (c: ConstructionCollection) => {
    const today = new Date().toISOString().slice(0, 10);
    return c.entregas
      .filter(e => e.estado !== 'cobrado')
      .sort((a, b) => (a.fechaPrevista || '9999').localeCompare(b.fechaPrevista || '9999'))[0] || null;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            <th className="pb-3 font-medium">Referencia</th>
            <th className="pb-3 font-medium">Obra</th>
            <th className="pb-3 font-medium">Cliente</th>
            <th className="pb-3 font-medium">Tipo</th>
            <th className="pb-3 font-medium text-right">Total</th>
            <th className="pb-3 font-medium text-right">Cobrado</th>
            <th className="pb-3 font-medium text-right">Pendiente</th>
            <th className="pb-3 font-medium">Estado</th>
            <th className="pb-3 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {items.map(c => {
            const ec = ESTADO_CONFIG[c.estadoCobro] || ESTADO_CONFIG.pendiente;
            const EcIcon = ec.icon;
            const next = nextPending(c);
            return (
              <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="py-3 font-medium text-gray-900 dark:text-white">{c.referencia}</td>
                <td className="py-3 text-gray-700 dark:text-gray-300 max-w-[160px] truncate">{c.obraNombre}</td>
                <td className="py-3 text-gray-600 dark:text-gray-400 max-w-[140px] truncate">{c.clienteNombre}</td>
                <td className="py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{TIPO_COBRO_LABELS[c.tipoCobro]}</span></td>
                <td className="py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(c.importeTotal)}</td>
                <td className="py-3 text-right text-emerald-600 dark:text-emerald-400">{fmt(c.importeCobrado)}</td>
                <td className="py-3 text-right text-amber-600 dark:text-amber-400 font-medium">{fmt(c.saldoPendiente)}</td>
                <td className="py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ec.color}`}>
                    <EcIcon className="w-3 h-3" /> {ec.label}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onDetail(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 hover:text-blue-600" title="Ver detalle"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => onEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 hover:text-blue-600" title="Editar"><Edit3 className="w-4 h-4" /></button>
                    {next && (
                      <button onClick={() => onCollect(c, next)} className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg text-gray-500 hover:text-emerald-600" title="Cobrar siguiente">
                        <Banknote className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => onDelete(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 hover:text-red-600" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupedView({ groups, groupKey, groupLabel, expanded, toggle, onDetail, onEdit, onDelete, onCollect }: {
  groups: { items: ConstructionCollection[]; [k: string]: unknown }[];
  groupKey: string;
  groupLabel: string;
  expanded: Set<string>;
  toggle: (key: string) => void;
  onDetail: (c: ConstructionCollection) => void;
  onEdit: (c: ConstructionCollection) => void;
  onDelete: (c: ConstructionCollection) => void;
  onCollect: (c: ConstructionCollection, e: CollectionEntrega) => void;
}) {
  return (
    <div className="space-y-3">
      {groups.map(g => {
        const key = String(g[groupKey] || 'unknown');
        const label = String(g[groupLabel] || 'Sin nombre');
        const isOpen = expanded.has(key);
        const total = g.items.reduce((s: number, c: ConstructionCollection) => s + c.importeTotal, 0);
        const cobrado = g.items.reduce((s: number, c: ConstructionCollection) => s + c.importeCobrado, 0);
        const pendiente = total - cobrado;
        const pct = total > 0 ? Math.round((cobrado / total) * 100) : 0;

        return (
          <div key={key} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden">
            <button onClick={() => toggle(key)} className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
                  <p className="text-xs text-gray-500">{g.items.length} cobro{g.items.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Cobrado</p>
                  <p className="text-sm font-semibold text-emerald-600">{fmt(cobrado)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Pendiente</p>
                  <p className={`text-sm font-semibold ${pendiente > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{fmt(pendiente)}</p>
                </div>
                <div className="w-24">
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 text-right mt-0.5">{pct}%</p>
                </div>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <CollectionTable items={g.items} onDetail={onDetail} onEdit={onEdit} onDelete={onDelete} onCollect={onCollect} />
              </div>
            )}
          </div>
        );
      })}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_collections"
        moduleLabel="Cobros"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Cobros"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
