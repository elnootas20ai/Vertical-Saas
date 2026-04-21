import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Layout } from '../../components/saas/Layout';
import {
  HardHat, ClipboardList, CheckCircle, FileText, Plus, Search, Filter,
  Trash2, Edit2, Layers, DollarSign, AlertTriangle, CalendarClock, FolderOpen,
  FileWarning, Bell, ChevronDown, ChevronRight, Download, Upload, Copy,
  ArrowRight, Wallet, Clock, X, Save, Eye, EyeOff, BarChart3,
  TrendingUp, Package, Percent,
} from 'lucide-react';
import type {
  ConstructionConfig, ConstructionGuild, ConstructionPredefinedPartida,
  BudgetTemplate, PartidaAlert, PartidaAlertSummary, BudgetTemplatePartida,
} from '../../lib/constructionApi';
import {
  getConstructionConfig, listConstructionGuilds, createConstructionGuild,
  updateConstructionGuild, deleteConstructionGuild,
  listPredefinedPartidas as apiListPartidas, createPredefinedPartida,
  updatePredefinedPartida as apiUpdatePartida, deletePredefinedPartida,
  bulkImportPartidas,
  listBudgetTemplates, createBudgetTemplate, updateBudgetTemplate,
  deleteBudgetTemplate, applyBudgetTemplateApi, createTemplateFromBudgetApi,
  getPartidaAlertsApi,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';

const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

const MANAGER_ROLES = ['owner', 'admin', 'manager', 'gerente'];

const TABS = [
  { id: 'gremios', label: 'Gremios', icon: HardHat },
  { id: 'partidas', label: 'Partidas', icon: ClipboardList },
  { id: 'precios', label: 'Precios', icon: DollarSign },
  { id: 'plantillas', label: 'Plantillas', icon: FileText },
  { id: 'alertas', label: 'Alertas', icon: Bell },
];

const WORKER_TABS = ['gremios', 'partidas'];

/* ═══════════════════════════════════════════════════════════════════════════ */

export function ConstructionPartidasGremios() {
  const { user, userId } = useAuth() as { user: { role?: string; fullName?: string } | null; userId: string };
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'gremios';
  const filterGremio = searchParams.get('gremio') || '';

  const isManagerRole = MANAGER_ROLES.includes(user?.role || '');

  const [config, setConfig] = useState<ConstructionConfig | null>(null);
  const [guilds, setGuilds] = useState<ConstructionGuild[]>([]);
  const [partidas, setPartidas] = useState<ConstructionPredefinedPartida[]>([]);
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [alerts, setAlerts] = useState<PartidaAlert[]>([]);
  const [alertSummary, setAlertSummary] = useState<PartidaAlertSummary>({ sinPrecio: 0, sinPartidas: 0, desactualizados: 0, incompletas: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [guildModal, setGuildModal] = useState(false);
  const [editingGuild, setEditingGuild] = useState<ConstructionGuild | null>(null);
  const [partidaModal, setPartidaModal] = useState(false);
  const [editingPartida, setEditingPartida] = useState<ConstructionPredefinedPartida | null>(null);
  const [templateModal, setTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BudgetTemplate | null>(null);

  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const setTab = useCallback((tab: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', tab);
    if (tab !== 'partidas') p.delete('gremio');
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [cfg, g, p, t, a] = await Promise.all([
        getConstructionConfig(),
        listConstructionGuilds(userId),
        apiListPartidas(userId, { activa: true }),
        isManagerRole ? listBudgetTemplates(userId) : Promise.resolve([]),
        isManagerRole ? getPartidaAlertsApi(userId) : Promise.resolve({ alerts: [], summary: { sinPrecio: 0, sinPartidas: 0, desactualizados: 0, incompletas: 0 } }),
      ]);
      setConfig(cfg);
      setGuilds(g);
      setPartidas(p);
      setTemplates(t);
      setAlerts(a.alerts || []);
      setAlertSummary(a.summary || { sinPrecio: 0, sinPartidas: 0, desactualizados: 0, incompletas: 0 });
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId, isManagerRole]);

  useEffect(() => { loadData(); }, [loadData]);

  const visibleTabs = isManagerRole ? TABS : TABS.filter(t => WORKER_TABS.includes(t.id));
  const totalAlerts = alerts.length;

  const kpis = useMemo(() => [
    { label: 'Gremios', value: guilds.length, icon: HardHat, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Partidas', value: partidas.length, icon: ClipboardList, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Con precio', value: partidas.length > 0 ? Math.round((partidas.filter(p => p.precioUnitario > 0).length / partidas.length) * 100) + '%' : '—', icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Plantillas', value: templates.filter(t => t.activa).length, icon: FileText, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  ], [guilds, partidas, templates]);

  const inputClass = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none';
  const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
  const btnPrimary = 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2';
  const btnSecondary = 'px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2';
  const cardClass = 'bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-5 hover:shadow-sm transition-all';

  /* ─── Guild CRUD ──────────────────────────────────────────────────────── */
  const [guildForm, setGuildForm] = useState({ nombre: '', tipo: '', contacto: '', telefono: '', email: '', descripcion: '', precioMateriales: 0, precioManoObra: 0, precioEstructural: 0, tarifaHora: 0, margenDefecto: 0, notas: '' });

  const openGuildModal = (g?: ConstructionGuild) => {
    if (g) {
      setEditingGuild(g);
      setGuildForm({ nombre: g.nombre, tipo: g.tipo, contacto: g.contacto, telefono: g.telefono, email: g.email, descripcion: g.descripcion || '', precioMateriales: g.precioMateriales, precioManoObra: g.precioManoObra, precioEstructural: g.precioEstructural, tarifaHora: g.tarifaHora || 0, margenDefecto: g.margenDefecto || 0, notas: g.notas });
    } else {
      setEditingGuild(null);
      setGuildForm({ nombre: '', tipo: '', contacto: '', telefono: '', email: '', descripcion: '', precioMateriales: 0, precioManoObra: 0, precioEstructural: 0, tarifaHora: 0, margenDefecto: 0, notas: '' });
    }
    setGuildModal(true);
  };

  const saveGuild = async () => {
    if (!guildForm.nombre.trim() || !userId) return;
    try {
      if (editingGuild) {
        const updated = await updateConstructionGuild(userId, { ...editingGuild, ...guildForm } as ConstructionGuild);
        setGuilds(prev => prev.map(g => g._id === updated._id ? updated : g));
        showToast('Gremio actualizado');
      } else {
        const created = await createConstructionGuild(userId, guildForm);
        setGuilds(prev => [created, ...prev]);
        showToast('Gremio creado');
      }
      setGuildModal(false);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Error'); }
  };

  const deleteGuild = async (id: string) => {
    if (!confirm('¿Eliminar gremio?')) return;
    try { await deleteConstructionGuild(userId, id); setGuilds(prev => prev.filter(g => g._id !== id)); showToast('Eliminado'); } catch { showToast('Error al eliminar'); }
  };

  /* ─── Partida CRUD ────────────────────────────────────────────────────── */
  const [partidaForm, setPartidaForm] = useState({ nombre: '', descripcion: '', gremio: filterGremio || '', categoria: '', unidad: 'ud', precioMateriales: 0, precioManoObra: 0, precioEstructural: 0, orden: 0, notas: '' });

  const openPartidaModal = (p?: ConstructionPredefinedPartida) => {
    if (p) {
      setEditingPartida(p);
      setPartidaForm({ nombre: p.nombre, descripcion: p.descripcion, gremio: p.gremio, categoria: p.categoria, unidad: p.unidad, precioMateriales: p.precioMateriales, precioManoObra: p.precioManoObra, precioEstructural: p.precioEstructural, orden: p.orden, notas: p.notas });
    } else {
      setEditingPartida(null);
      setPartidaForm({ nombre: '', descripcion: '', gremio: filterGremio || '', categoria: '', unidad: 'ud', precioMateriales: 0, precioManoObra: 0, precioEstructural: 0, orden: 0, notas: '' });
    }
    setPartidaModal(true);
  };

  const savePartida = async () => {
    if (!partidaForm.nombre.trim() || !userId) return;
    try {
      if (editingPartida) {
        const updated = await apiUpdatePartida(userId, { ...editingPartida, ...partidaForm } as ConstructionPredefinedPartida);
        setPartidas(prev => prev.map(p => p._id === updated._id ? updated : p));
        showToast('Partida actualizada');
      } else {
        const created = await createPredefinedPartida(userId, partidaForm);
        setPartidas(prev => [created, ...prev]);
        showToast('Partida creada');
      }
      setPartidaModal(false);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Error'); }
  };

  const deletePartidaItem = async (id: string) => {
    if (!confirm('¿Eliminar partida?')) return;
    try { await deletePredefinedPartida(userId, id); setPartidas(prev => prev.filter(p => p._id !== id)); showToast('Eliminada'); } catch { showToast('Error al eliminar'); }
  };

  /* ─── Template CRUD ───────────────────────────────────────────────────── */
  const [tplForm, setTplForm] = useState({ nombre: '', descripcion: '', tipoObra: '', margenDefecto: 15, notas: '' });

  const openTemplateModal = (t?: BudgetTemplate) => {
    if (t) {
      setEditingTemplate(t);
      setTplForm({ nombre: t.nombre, descripcion: t.descripcion || '', tipoObra: t.tipoObra || '', margenDefecto: t.margenDefecto || 15, notas: t.notas || '' });
    } else {
      setEditingTemplate(null);
      setTplForm({ nombre: '', descripcion: '', tipoObra: '', margenDefecto: 15, notas: '' });
    }
    setTemplateModal(true);
  };

  const saveTemplate = async () => {
    if (!tplForm.nombre.trim() || !userId) return;
    try {
      if (editingTemplate) {
        const updated = await updateBudgetTemplate(userId, { ...editingTemplate, ...tplForm } as BudgetTemplate);
        setTemplates(prev => prev.map(t => t._id === updated._id ? updated : t));
        showToast('Plantilla actualizada');
      } else {
        const created = await createBudgetTemplate(userId, { ...tplForm, partidas: [] });
        setTemplates(prev => [created, ...prev]);
        showToast('Plantilla creada');
      }
      setTemplateModal(false);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Error'); }
  };

  /* ─── Filtered data ───────────────────────────────────────────────────── */
  const guildLabels = config?.guildLabels || {};
  const units = config?.units || [];

  const filteredPartidas = useMemo(() => {
    let r = partidas;
    if (filterGremio) r = r.filter(p => p.gremio === filterGremio);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(p => p.nombre.toLowerCase().includes(s) || p.descripcion.toLowerCase().includes(s) || p.codigo.toLowerCase().includes(s));
    }
    return r;
  }, [partidas, filterGremio, search]);

  const partidasByGremio = useMemo(() => {
    const map: Record<string, ConstructionPredefinedPartida[]> = {};
    for (const p of filteredPartidas) {
      const k = p.gremio || 'sin_gremio';
      if (!map[k]) map[k] = [];
      map[k].push(p);
    }
    return Object.entries(map).sort(([a], [b]) => (guildLabels[a] || a).localeCompare(guildLabels[b] || b));
  }, [filteredPartidas, guildLabels]);

  const [collapsedGremios, setCollapsedGremios] = useState<Set<string>>(new Set());
  const toggleCollapse = (g: string) => setCollapsedGremios(prev => { const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s; });

  /* ─── Price analysis ──────────────────────────────────────────────────── */
  const pricesByGremio = useMemo(() => {
    const map: Record<string, { count: number; total: number; min: number; max: number; lastUpdate: string }> = {};
    for (const p of partidas) {
      const k = p.gremio || 'sin_gremio';
      if (!map[k]) map[k] = { count: 0, total: 0, min: Infinity, max: 0, lastUpdate: '' };
      map[k].count++;
      map[k].total += p.precioUnitario;
      if (p.precioUnitario < map[k].min) map[k].min = p.precioUnitario;
      if (p.precioUnitario > map[k].max) map[k].max = p.precioUnitario;
      if (p.precioActualizado > map[k].lastUpdate) map[k].lastUpdate = p.precioActualizado;
    }
    return map;
  }, [partidas]);

  /* ─── Bulk price editing ──────────────────────────────────────────────── */
  const [editedPrices, setEditedPrices] = useState<Record<string, { mat: number; mo: number; est: number }>>({});
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'type', label: 'Tipo' },
    { key: 'category', label: 'Categoría' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} partida/gremio(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} partida/gremio(s) importado(s)`);
  };
  const hasEdited = Object.keys(editedPrices).length > 0;

  const saveBulkPrices = async () => {
    for (const [id, prices] of Object.entries(editedPrices)) {
      const p = partidas.find(pp => pp._id === id);
      if (!p) continue;
      try {
        const updated = await apiUpdatePartida(userId, { ...p, precioMateriales: prices.mat, precioManoObra: prices.mo, precioEstructural: prices.est } as ConstructionPredefinedPartida);
        setPartidas(prev => prev.map(pp => pp._id === updated._id ? updated : pp));
      } catch { /* continue */ }
    }
    setEditedPrices({});
    showToast(`${Object.keys(editedPrices).length} precios actualizados`);
  };

  /* ═══════════════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <Layout title="Partidas, Gremios y Precios">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Partidas, Gremios y Precios">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Layers className="w-7 h-7 text-blue-600" />
              Partidas, Gremios y Precios
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isManagerRole ? 'Configura tu catálogo de partidas y precios base para acelerar presupuestos' : 'Consulta de partidas y gremios (solo lectura)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isManagerRole ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
              {isManagerRole ? 'Gerente' : 'Consulta'}
            </span>
            <button onClick={() => navigate('/saas/construction-budgets')} className={btnSecondary}>
              <ArrowRight className="w-4 h-4" /> Presupuestos
            </button>
          </div>
        </div>

        {/* Alerts banner */}
        {isManagerRole && totalAlerts > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-800 dark:text-amber-300">Alertas de catálogo ({totalAlerts})</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {alertSummary.sinPrecio > 0 && <span className="px-2 py-1 bg-amber-100 dark:bg-amber-800/40 rounded-lg text-amber-700 dark:text-amber-300">{alertSummary.sinPrecio} sin precio</span>}
              {alertSummary.sinPartidas > 0 && <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800/40 rounded-lg text-blue-700 dark:text-blue-300">{alertSummary.sinPartidas} gremios vacíos</span>}
              {alertSummary.desactualizados > 0 && <span className="px-2 py-1 bg-orange-100 dark:bg-orange-800/40 rounded-lg text-orange-700 dark:text-orange-300">{alertSummary.desactualizados} desactualizados</span>}
              {alertSummary.incompletas > 0 && <span className="px-2 py-1 bg-red-100 dark:bg-red-800/40 rounded-lg text-red-700 dark:text-red-300">{alertSummary.incompletas} plantillas incompletas</span>}
            </div>
          </div>
        )}

        {/* KPIs */}
        {isManagerRole && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(k => (
              <div key={k.label} className={`${cardClass} flex items-center gap-4`}>
                <div className={`w-11 h-11 rounded-xl ${k.bg} flex items-center justify-center`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{k.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{k.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700 pb-px">
          {visibleTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-white dark:bg-gray-900 border-2 border-b-0 border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 -mb-px' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.id === 'alertas' && totalAlerts > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full">{totalAlerts}</span>}
            </button>
          ))}
        </div>

        {/* ═══ TAB: GREMIOS ═══════════════════════════════════════════════ */}
        {activeTab === 'gremios' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className={`${inputClass} pl-10`} placeholder="Buscar gremio..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {isManagerRole && <AddButtonDropdown
                label="Nuevo"
                onQuickAdd={() => openGuildModal()}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de partida/gremio"
              />}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {guilds.filter(g => !search || g.nombre.toLowerCase().includes(search.toLowerCase()) || (guildLabels[g.tipo] || g.tipo).toLowerCase().includes(search.toLowerCase())).map(g => (
                <div key={g._id} className={`${cardClass} cursor-pointer group`} onClick={() => { const p = new URLSearchParams(); p.set('tab', 'partidas'); p.set('gremio', g.tipo); setSearchParams(p); }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold rounded-lg mb-1">
                        {guildLabels[g.tipo] || g.tipo}
                      </span>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{g.nombre}</h3>
                    </div>
                    {isManagerRole && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); openGuildModal(g); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                        <button onClick={e => { e.stopPropagation(); deleteGuild(g._id); }} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    )}
                  </div>
                  {g.contacto && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{g.contacto} {g.telefono ? `· ${g.telefono}` : ''}</p>}
                  {isManagerRole && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Materiales</span><span className="font-semibold">{fmt(g.precioMateriales)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Mano de obra</span><span className="font-semibold">{fmt(g.precioManoObra)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Estructural</span><span className="font-semibold">{fmt(g.precioEstructural)}</span></div>
                      <div className="flex justify-between pt-1 border-t border-gray-100 dark:border-gray-700/50"><span className="font-semibold flex items-center gap-1"><Wallet className="w-3 h-3" />Total</span><span className="font-bold text-purple-600 dark:text-purple-400">{fmt(g.precioTotal)}</span></div>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{g.totalPartidas || 0} partidas</span>
                    {g.preciosActualizados ? (
                      <span className={`flex items-center gap-1 ${new Date().getTime() - new Date(g.preciosActualizados).getTime() < 180 * 86400000 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        <CheckCircle className="w-3 h-3" />{g.preciosActualizados.slice(0, 10)}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-[10px]">Sin precios</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ TAB: PARTIDAS ══════════════════════════════════════════════ */}
        {activeTab === 'partidas' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={`${inputClass} pl-10`} placeholder="Buscar partida..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select className={`${inputClass} w-48`} value={filterGremio} onChange={e => { const p = new URLSearchParams(searchParams); if (e.target.value) p.set('gremio', e.target.value); else p.delete('gremio'); setSearchParams(p, { replace: true }); }}>
                  <option value="">Todos los gremios</option>
                  {(config?.guilds || []).map(g => <option key={g} value={g}>{guildLabels[g] || g}</option>)}
                </select>
              </div>
              {isManagerRole && <button onClick={() => openPartidaModal()} className={btnPrimary}><Plus className="w-4 h-4" />Nueva partida</button>}
            </div>

            {partidasByGremio.length === 0 ? (
              <div className={`${cardClass} text-center py-12`}>
                <ClipboardList className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No hay partidas {filterGremio ? `para ${guildLabels[filterGremio] || filterGremio}` : ''}</p>
                {isManagerRole && <button onClick={() => openPartidaModal()} className="mt-4 text-blue-600 hover:underline text-sm">Crear primera partida</button>}
              </div>
            ) : partidasByGremio.map(([gremio, items]) => (
              <div key={gremio} className="border-2 border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <button onClick={() => toggleCollapse(gremio)} className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex items-center gap-3">
                    {collapsedGremios.has(gremio) ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <HardHat className="w-4 h-4 text-amber-600" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{guildLabels[gremio] || gremio}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{items.length} partidas</span>
                    {isManagerRole && <span className="font-semibold">{fmt(items.reduce((s, p) => s + p.precioUnitario, 0))}</span>}
                  </div>
                </button>
                {!collapsedGremios.has(gremio) && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                        <th className="px-4 py-2 w-24">Código</th>
                        <th className="px-4 py-2">Nombre</th>
                        <th className="px-4 py-2 w-16">Ud</th>
                        {isManagerRole && <><th className="px-4 py-2 w-24 text-right">Mat.</th><th className="px-4 py-2 w-24 text-right">M.O.</th><th className="px-4 py-2 w-24 text-right">Estr.</th><th className="px-4 py-2 w-28 text-right">P.U. Total</th></>}
                        <th className="px-4 py-2 w-24">Actualiz.</th>
                        {isManagerRole && <th className="px-4 py-2 w-20"></th>}
                      </tr></thead>
                      <tbody>
                        {items.map(p => {
                          const daysSince = p.precioActualizado ? (Date.now() - new Date(p.precioActualizado).getTime()) / 86400000 : 999;
                          const dateColor = daysSince < 90 ? 'text-emerald-600' : daysSince < 180 ? 'text-amber-600' : 'text-red-500';
                          return (
                            <tr key={p._id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-4 py-2 text-xs font-mono text-gray-400">{p.codigo}</td>
                              <td className="px-4 py-2">
                                <span className="font-medium text-gray-900 dark:text-gray-100">{p.nombre}</span>
                                {p.descripcion && <span className="block text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</span>}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">{p.unidad}</td>
                              {isManagerRole && <>
                                <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">{fmt(p.precioMateriales)}</td>
                                <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">{fmt(p.precioManoObra)}</td>
                                <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">{fmt(p.precioEstructural)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">{fmt(p.precioUnitario)}</td>
                              </>}
                              <td className={`px-4 py-2 text-xs ${dateColor}`}>{p.precioActualizado?.slice(0, 10) || '—'}</td>
                              {isManagerRole && (
                                <td className="px-4 py-2">
                                  <div className="flex gap-1">
                                    <button onClick={() => openPartidaModal(p)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                                    <button onClick={() => deletePartidaItem(p._id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══ TAB: PRECIOS ═══════════════════════════════════════════════ */}
        {activeTab === 'precios' && isManagerRole && (
          <div className="space-y-6">
            <div className={cardClass}>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-600" />Resumen de precios por gremio</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-2">Gremio</th><th className="px-4 py-2 text-right">Partidas</th><th className="px-4 py-2 text-right">P.U. Medio</th><th className="px-4 py-2 text-right">Mínimo</th><th className="px-4 py-2 text-right">Máximo</th><th className="px-4 py-2">Última actualiz.</th><th className="px-4 py-2 w-16">Estado</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(pricesByGremio).sort(([a], [b]) => (guildLabels[a] || a).localeCompare(guildLabels[b] || b)).map(([g, d]) => {
                      const avg = d.count > 0 ? d.total / d.count : 0;
                      const daysSince = d.lastUpdate ? (Date.now() - new Date(d.lastUpdate).getTime()) / 86400000 : 999;
                      return (
                        <tr key={g} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => { const p = new URLSearchParams(); p.set('tab', 'partidas'); p.set('gremio', g); setSearchParams(p); }}>
                          <td className="px-4 py-2 font-medium">{guildLabels[g] || g}</td>
                          <td className="px-4 py-2 text-right">{d.count}</td>
                          <td className="px-4 py-2 text-right">{fmt(avg)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{d.min === Infinity ? '—' : fmt(d.min)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{fmt(d.max)}</td>
                          <td className="px-4 py-2 text-xs text-gray-500">{d.lastUpdate?.slice(0, 10) || '—'}</td>
                          <td className="px-4 py-2 text-center">{daysSince < 180 ? <CheckCircle className="w-4 h-4 text-emerald-500 inline" /> : <AlertTriangle className="w-4 h-4 text-amber-500 inline" />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={cardClass}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Edit2 className="w-5 h-5 text-blue-600" />Edición masiva de precios</h3>
                {hasEdited && (
                  <button onClick={saveBulkPrices} className={btnPrimary}><Save className="w-4 h-4" />Guardar cambios ({Object.keys(editedPrices).length})</button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-3 py-2 w-24">Código</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2 w-32">Gremio</th><th className="px-3 py-2 w-14">Ud</th>
                    <th className="px-3 py-2 w-28">Mat. €/ud</th><th className="px-3 py-2 w-28">M.O. €/ud</th><th className="px-3 py-2 w-28">Estr. €/ud</th><th className="px-3 py-2 w-28 text-right">P.U. Total</th>
                  </tr></thead>
                  <tbody>
                    {partidas.map(p => {
                      const edited = editedPrices[p._id];
                      const mat = edited?.mat ?? p.precioMateriales;
                      const mo = edited?.mo ?? p.precioManoObra;
                      const est = edited?.est ?? p.precioEstructural;
                      const isEdited = !!edited;
                      return (
                        <tr key={p._id} className={`border-b border-gray-50 dark:border-gray-800 ${isEdited ? 'bg-blue-50 dark:bg-blue-900/10 border-l-4 border-l-blue-500' : ''}`}>
                          <td className="px-3 py-1.5 text-xs font-mono text-gray-400">{p.codigo}</td>
                          <td className="px-3 py-1.5 text-xs">{p.nombre}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-500">{guildLabels[p.gremio] || p.gremio}</td>
                          <td className="px-3 py-1.5 text-xs">{p.unidad}</td>
                          <td className="px-3 py-1.5"><input type="number" className="w-full px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" value={mat} onChange={e => setEditedPrices(prev => ({ ...prev, [p._id]: { mat: Number(e.target.value), mo: prev[p._id]?.mo ?? p.precioManoObra, est: prev[p._id]?.est ?? p.precioEstructural } }))} /></td>
                          <td className="px-3 py-1.5"><input type="number" className="w-full px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" value={mo} onChange={e => setEditedPrices(prev => ({ ...prev, [p._id]: { mat: prev[p._id]?.mat ?? p.precioMateriales, mo: Number(e.target.value), est: prev[p._id]?.est ?? p.precioEstructural } }))} /></td>
                          <td className="px-3 py-1.5"><input type="number" className="w-full px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-xs text-right" value={est} onChange={e => setEditedPrices(prev => ({ ...prev, [p._id]: { mat: prev[p._id]?.mat ?? p.precioMateriales, mo: prev[p._id]?.mo ?? p.precioManoObra, est: Number(e.target.value) } }))} /></td>
                          <td className="px-3 py-1.5 text-right font-semibold text-xs">{fmt(mat + mo + est)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: PLANTILLAS ════════════════════════════════════════════ */}
        {activeTab === 'plantillas' && isManagerRole && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className={`${inputClass} pl-10`} placeholder="Buscar plantilla..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button onClick={() => openTemplateModal()} className={btnPrimary}><Plus className="w-4 h-4" />Nueva plantilla</button>
            </div>

            {templates.length === 0 ? (
              <div className={`${cardClass} text-center py-12`}>
                <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No hay plantillas de presupuesto</p>
                <button onClick={() => openTemplateModal()} className="mt-4 text-blue-600 hover:underline text-sm">Crear primera plantilla</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.filter(t => !search || t.nombre.toLowerCase().includes(search.toLowerCase())).map(t => (
                  <div key={t._id} className={cardClass}>
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t.nombre}</h3>
                      <div className="flex gap-1">
                        <button onClick={() => openTemplateModal(t)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                        <button onClick={async () => { if (!confirm('¿Eliminar?')) return; await deleteBudgetTemplate(userId, t._id); setTemplates(prev => prev.filter(x => x._id !== t._id)); showToast('Eliminada'); }} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </div>
                    {t.descripcion && <p className="text-xs text-gray-500 mb-2">{t.descripcion}</p>}
                    {t.tipoObra && <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] rounded-lg mb-2">{t.tipoObra}</span>}
                    <div className="text-xs text-gray-500 space-y-1 mb-3">
                      <div>{(t.partidas || []).length} partidas · {(t.gremiosIncluidos || []).length} gremios</div>
                      <div>Estimado: <strong className="text-gray-900 dark:text-gray-100">{fmt(t.totalEstimado || 0)}</strong></div>
                      <div>Con margen {t.margenDefecto || 15}%: <strong className="text-purple-600">{fmt(t.totalConMargen || 0)}</strong></div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-400">
                      <span>Usada {t.vecesUsada || 0} veces</span>
                      <button onClick={async () => { try { const r = await applyBudgetTemplateApi(userId, t._id); navigate('/saas/construction-budgets?fromTemplate=1'); showToast('Plantilla aplicada'); } catch { showToast('Error'); } }} className="text-blue-600 hover:underline font-semibold flex items-center gap-1"><ArrowRight className="w-3 h-3" />Aplicar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: ALERTAS ═══════════════════════════════════════════════ */}
        {activeTab === 'alertas' && isManagerRole && (
          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className={`${cardClass} text-center py-12`}>
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">Catálogo completo y actualizado</p>
                <p className="text-sm text-gray-500 mt-1">No hay alertas pendientes</p>
              </div>
            ) : alerts.map(a => (
              <div key={a.id} className={`${cardClass} flex items-center gap-4 border-l-4 ${a.type === 'gremio_sin_partidas' ? 'border-l-blue-400' : a.severity === 'warning' ? 'border-l-amber-400' : 'border-l-red-400'}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.type === 'partida_sin_precio' ? 'bg-amber-100 dark:bg-amber-900/30' : a.type === 'gremio_sin_partidas' ? 'bg-blue-100 dark:bg-blue-900/30' : a.type === 'precio_desactualizado' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  {a.type === 'partida_sin_precio' && <DollarSign className="w-4 h-4 text-amber-600" />}
                  {a.type === 'gremio_sin_partidas' && <FolderOpen className="w-4 h-4 text-blue-600" />}
                  {a.type === 'precio_desactualizado' && <CalendarClock className="w-4 h-4 text-orange-600" />}
                  {a.type === 'plantilla_incompleta' && <FileWarning className="w-4 h-4 text-red-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.detail}</p>
                </div>
                <button onClick={() => {
                  if (a.type === 'partida_sin_precio' || a.type === 'precio_desactualizado') setTab('precios');
                  else if (a.type === 'gremio_sin_partidas') { const p = new URLSearchParams(); p.set('tab', 'partidas'); p.set('gremio', a.gremio); setSearchParams(p); }
                  else if (a.type === 'plantilla_incompleta') setTab('plantillas');
                }} className="text-xs text-blue-600 hover:underline font-semibold whitespace-nowrap">Resolver →</button>
              </div>
            ))}
          </div>
        )}

        {/* ═══ MODALS ═════════════════════════════════════════════════════ */}

        {/* Guild Modal */}
        {guildModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setGuildModal(false)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">{editingGuild ? 'Editar gremio' : 'Nuevo gremio'}</h2>
                <button onClick={() => setGuildModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div><label className={labelClass}>Tipo de gremio</label>
                  <select className={inputClass} value={guildForm.tipo} onChange={e => setGuildForm(f => ({ ...f, tipo: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {(config?.guilds || []).map(g => <option key={g} value={g}>{guildLabels[g] || g}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Nombre empresa / subcontrata</label><input className={inputClass} value={guildForm.nombre} onChange={e => setGuildForm(f => ({ ...f, nombre: e.target.value }))} /></div>
                <div><label className={labelClass}>Descripción</label><textarea className={inputClass} rows={2} value={guildForm.descripcion} onChange={e => setGuildForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Contacto</label><input className={inputClass} value={guildForm.contacto} onChange={e => setGuildForm(f => ({ ...f, contacto: e.target.value }))} /></div>
                  <div><label className={labelClass}>Teléfono</label><input className={inputClass} value={guildForm.telefono} onChange={e => setGuildForm(f => ({ ...f, telefono: e.target.value }))} /></div>
                </div>
                <div><label className={labelClass}>Email</label><input type="email" className={inputClass} value={guildForm.email} onChange={e => setGuildForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">Precios de referencia</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={labelClass}>Materiales</label><input type="number" className={inputClass} value={guildForm.precioMateriales} onChange={e => setGuildForm(f => ({ ...f, precioMateriales: Number(e.target.value) }))} /></div>
                    <div><label className={labelClass}>Mano de obra</label><input type="number" className={inputClass} value={guildForm.precioManoObra} onChange={e => setGuildForm(f => ({ ...f, precioManoObra: Number(e.target.value) }))} /></div>
                    <div><label className={labelClass}>Estructural</label><input type="number" className={inputClass} value={guildForm.precioEstructural} onChange={e => setGuildForm(f => ({ ...f, precioEstructural: Number(e.target.value) }))} /></div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Tarifa €/h</label><input type="number" className={inputClass} value={guildForm.tarifaHora} onChange={e => setGuildForm(f => ({ ...f, tarifaHora: Number(e.target.value) }))} /></div>
                    <div><label className={labelClass}>Margen defecto %</label><input type="number" className={inputClass} value={guildForm.margenDefecto} onChange={e => setGuildForm(f => ({ ...f, margenDefecto: Number(e.target.value) }))} /></div>
                  </div>
                  <div className="mt-3 text-right text-lg font-bold text-purple-600">{fmt(guildForm.precioMateriales + guildForm.precioManoObra + guildForm.precioEstructural)}</div>
                </div>
                <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={guildForm.notas} onChange={e => setGuildForm(f => ({ ...f, notas: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setGuildModal(false)} className={btnSecondary}>Cancelar</button>
                <button onClick={saveGuild} className={btnPrimary}><Save className="w-4 h-4" />{editingGuild ? 'Guardar' : 'Crear'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Partida Modal */}
        {partidaModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPartidaModal(false)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">{editingPartida ? 'Editar partida' : 'Nueva partida'}</h2>
                <button onClick={() => setPartidaModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div><label className={labelClass}>Nombre</label><input className={inputClass} value={partidaForm.nombre} onChange={e => setPartidaForm(f => ({ ...f, nombre: e.target.value }))} /></div>
                <div><label className={labelClass}>Descripción</label><textarea className={inputClass} rows={2} value={partidaForm.descripcion} onChange={e => setPartidaForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Gremio</label>
                    <select className={inputClass} value={partidaForm.gremio} onChange={e => setPartidaForm(f => ({ ...f, gremio: e.target.value }))}>
                      <option value="">— Gremio —</option>
                      {(config?.guilds || []).map(g => <option key={g} value={g}>{guildLabels[g] || g}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Unidad de medida</label>
                    <select className={inputClass} value={partidaForm.unidad} onChange={e => setPartidaForm(f => ({ ...f, unidad: e.target.value }))}>
                      {units.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className={labelClass}>Categoría</label><input className={inputClass} value={partidaForm.categoria} onChange={e => setPartidaForm(f => ({ ...f, categoria: e.target.value }))} /></div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">Precios por unidad</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={labelClass}>Materiales €/ud</label><input type="number" className={inputClass} value={partidaForm.precioMateriales} onChange={e => setPartidaForm(f => ({ ...f, precioMateriales: Number(e.target.value) }))} /></div>
                    <div><label className={labelClass}>Mano obra €/ud</label><input type="number" className={inputClass} value={partidaForm.precioManoObra} onChange={e => setPartidaForm(f => ({ ...f, precioManoObra: Number(e.target.value) }))} /></div>
                    <div><label className={labelClass}>Estructural €/ud</label><input type="number" className={inputClass} value={partidaForm.precioEstructural} onChange={e => setPartidaForm(f => ({ ...f, precioEstructural: Number(e.target.value) }))} /></div>
                  </div>
                  <div className="mt-3 text-right text-lg font-bold text-purple-600">P.U. Total: {fmt(partidaForm.precioMateriales + partidaForm.precioManoObra + partidaForm.precioEstructural)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Orden</label><input type="number" className={inputClass} value={partidaForm.orden} onChange={e => setPartidaForm(f => ({ ...f, orden: Number(e.target.value) }))} /></div>
                </div>
                <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={partidaForm.notas} onChange={e => setPartidaForm(f => ({ ...f, notas: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setPartidaModal(false)} className={btnSecondary}>Cancelar</button>
                <button onClick={savePartida} className={btnPrimary}><Save className="w-4 h-4" />{editingPartida ? 'Guardar' : 'Crear'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Template Modal */}
        {templateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setTemplateModal(false)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">{editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
                <button onClick={() => setTemplateModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div><label className={labelClass}>Nombre</label><input className={inputClass} value={tplForm.nombre} onChange={e => setTplForm(f => ({ ...f, nombre: e.target.value }))} /></div>
                <div><label className={labelClass}>Descripción</label><textarea className={inputClass} rows={2} value={tplForm.descripcion} onChange={e => setTplForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Tipo de obra</label>
                    <select className={inputClass} value={tplForm.tipoObra} onChange={e => setTplForm(f => ({ ...f, tipoObra: e.target.value }))}>
                      <option value="">— Tipo —</option>
                      {(config?.projectTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Margen defecto %</label><input type="number" className={inputClass} value={tplForm.margenDefecto} onChange={e => setTplForm(f => ({ ...f, margenDefecto: Number(e.target.value) }))} /></div>
                </div>
                <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={tplForm.notas} onChange={e => setTplForm(f => ({ ...f, notas: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setTemplateModal(false)} className={btnSecondary}>Cancelar</button>
                <button onClick={saveTemplate} className={btnPrimary}><Save className="w-4 h-4" />{editingTemplate ? 'Guardar' : 'Crear'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2">{toast}</div>
        )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_partidas"
        moduleLabel="Partidas/Gremios"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Partidas/Gremios"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
