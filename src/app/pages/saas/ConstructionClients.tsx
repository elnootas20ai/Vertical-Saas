import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Edit3, Trash2, Users, Phone, Mail, MapPin,
  ScanLine, FileText, Upload, Eye, Loader2, CheckCircle2,
  HardHat, Wallet, ChevronDown, ChevronRight, Filter, Building2,
  Tag, Clock, AlertTriangle, ArrowUpDown, ExternalLink,
  PhoneCall, MailOpen, FileWarning, UserCheck, UserX,
  Receipt, TrendingUp, Activity, PenLine, MessageSquare,
  Home, Briefcase, Shield, Globe, Download, Link2,
} from 'lucide-react';
import type {
  ConstructionClient, ConstructionProject, ConstructionBudget, ClientDoc, OcrResult,
  ClienteDetalle, ClienteNota, ClienteHistorialEntry, ClienteDuplicado, ConstructionAlert,
  TipoCliente, EstadoComercial, ClienteDireccion, ClienteContacto, ClienteInmueble,
} from '../../lib/constructionApi';
import {
  listConstructionClients, createConstructionClient, updateConstructionClient,
  deleteConstructionClient, scanDocumentOcr, getClientDetail, createClientNote,
  getClientHistory, checkClientDuplicates, searchConstructionClients,
  getConstructionAlerts, importCrmClientToConstruction,
} from '../../lib/constructionApi';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { authFetch } from '../../lib/authApi';
import { getApiBase } from '../../lib/apiBase';

// ─── Constants ───────────────────────────────────────────────────────────────

const ESTADO_COMERCIAL_CONFIG: Record<EstadoComercial, { label: string; color: string; bg: string }> = {
  prospecto: { label: 'Prospecto', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700' },
  contactado: { label: 'Contactado', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  presupuestado: { label: 'Presupuestado', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
  en_obra: { label: 'En obra', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  fidelizado: { label: 'Fidelizado', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  inactivo: { label: 'Inactivo', color: 'text-gray-500 dark:text-gray-500', bg: 'bg-gray-100 dark:bg-gray-700/50' },
  perdido: { label: 'Perdido', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
};

const TIPO_CLIENTE_LABELS: Record<TipoCliente, string> = {
  particular: 'Particular', empresa: 'Empresa', autonomo: 'Autónomo',
  comunidad_propietarios: 'Comunidad', promotora: 'Promotora', administracion_publica: 'Admin. pública',
};

const NOTE_TYPES = [
  { value: 'llamada', label: 'Llamada', icon: PhoneCall },
  { value: 'visita', label: 'Visita', icon: MapPin },
  { value: 'email', label: 'Email', icon: MailOpen },
  { value: 'reunion', label: 'Reunión', icon: Users },
  { value: 'nota_interna', label: 'Nota interna', icon: PenLine },
  { value: 'otro', label: 'Otro', icon: MessageSquare },
];

const HISTORY_ICONS: Record<string, typeof Activity> = {
  nota: MessageSquare, obra_creada: HardHat, obra_estado: Activity,
  presupuesto_enviado: Receipt, presupuesto_aceptado: CheckCircle2,
  presupuesto_rechazado: X, pago_registrado: Wallet,
  estado_comercial: ArrowUpDown, documento_subido: FileText,
};

const HISTORY_COLORS: Record<string, string> = {
  nota: 'text-gray-500', obra_creada: 'text-amber-500', obra_estado: 'text-amber-500',
  presupuesto_enviado: 'text-indigo-500', presupuesto_aceptado: 'text-emerald-500',
  presupuesto_rechazado: 'text-red-500', pago_registrado: 'text-emerald-500',
  estado_comercial: 'text-blue-500', documento_subido: 'text-violet-500',
};

const DOC_OBLIGATORIOS: Record<string, string[]> = {
  empresa: ['CIF (tarjeta)', 'Escritura de constitución', 'Poder de representación'],
  autonomo: ['DNI/NIE', 'Alta autónomos (036/037)'],
  comunidad_propietarios: ['Acta constitución', 'CIF comunidad', 'Acta nombramiento presidente'],
  promotora: ['CIF', 'Escritura', 'Licencia promotora'],
  administracion_publica: ['CIF', 'Documento de adjudicación'],
};

const fmt = (n: number | null | undefined) => n != null ? n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—';
const fmtDate = (d: string) => d ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)) : '—';
const relDate = (d: string) => {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 30) return `Hace ${days} días`;
  return fmtDate(d);
};

const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function ConstructionClients() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isGerente = ['owner', 'admin', 'manager'].includes(user?.role || '');
  const [viewAsWorker, setViewAsWorker] = useState(false);
  const showAsGerente = isGerente && !viewAsWorker;

  const [clients, setClients] = useState<ConstructionClient[]>([]);
  const [alerts, setAlerts] = useState<ConstructionAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [filterEstado, setFilterEstado] = useState(searchParams.get('estado') || '');
  const [filterTipo, setFilterTipo] = useState(searchParams.get('tipo') || '');
  const [filterImpagos, setFilterImpagos] = useState(false);
  const [filterObrasActivas, setFilterObrasActivas] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConstructionClient | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClient, setDrawerClient] = useState<ClienteDetalle | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState('general');

  const [importModalOpen, setImportModalOpen] = useState(false);

  useModalClose(modalOpen, () => setModalOpen(false));
  useModalClose(importModalOpen, () => setImportModalOpen(false));

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (filterEstado) params.set('estadoComercial', filterEstado);
      if (filterTipo) params.set('tipoCliente', filterTipo);
      if (filterImpagos) params.set('conImpagos', 'true');
      if (filterObrasActivas) params.set('conObrasActivas', 'true');
      const qs = params.toString();

      const url = `/api/construction/clients/${encodeURIComponent(userId)}${qs ? '?' + qs : ''}`;
      const r = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      const data = await r.json();
      setClients(data.clients || []);

      const alertsData = await getConstructionAlerts(userId);
      setAlerts(alertsData.filter(a => a.entityType === 'client'));
    } catch { /* silently fail */ }
    setLoading(false);
  }, [userId, search, filterEstado, filterTipo, filterImpagos, filterObrasActivas]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId && userId && !drawerOpen) openDrawer(openId);
  }, [searchParams, userId]);

  const openDrawer = async (clientId: string) => {
    setDrawerLoading(true);
    setDrawerOpen(true);
    setDrawerTab(searchParams.get('tab') || 'general');
    try {
      const detail = await getClientDetail(userId, clientId);
      setDrawerClient(detail);
    } catch { /* silently fail */ }
    setDrawerLoading(false);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerClient(null);
    const p = new URLSearchParams(searchParams);
    p.delete('open');
    p.delete('tab');
    setSearchParams(p, { replace: true });
  };

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (c: ConstructionClient) => { setEditing(c); setModalOpen(true); };

  const handleDelete = async (id: string) => {
    if (!userId || !confirm('¿Eliminar este cliente?')) return;
    try { await deleteConstructionClient(userId, id); setClients(prev => prev.filter(c => c._id !== id)); } catch { /* silently fail */ }
  };

  const handleSaveFromModal = (c: ConstructionClient) => {
    if (editing) setClients(prev => prev.map(x => x._id === c._id ? c : x));
    else setClients(prev => [c, ...prev]);
    setModalOpen(false);
    load();
  };

  const handleUpdateEstado = async (client: ConstructionClient, estado: EstadoComercial) => {
    try {
      const updated = await updateConstructionClient(userId, { ...client, estadoComercial: estado } as ConstructionClient);
      setClients(prev => prev.map(c => c._id === updated._id ? updated : c));
      if (drawerClient?.client._id === updated._id) {
        setDrawerClient(prev => prev ? { ...prev, client: updated } : null);
      }
    } catch { /* silently fail */ }
  };

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = clients.length;
    const enObra = clients.filter(c => c.estadoComercial === 'en_obra').length;
    return { total, enObra };
  }, [clients]);

  const clientAlerts = useMemo(() => alerts.filter(a => a.entityType === 'client'), [alerts]);

  if (loading) return <Layout title="Clientes — Constructora"><div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mr-2" />Cargando...</div></Layout>;

  return (
    <Layout title="Clientes — Constructora">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clientes</h1>
          <span className="px-2.5 py-1 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">{clients.length}</span>
          {isGerente && (
            <button onClick={() => setViewAsWorker(!viewAsWorker)} className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${viewAsWorker ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 text-amber-700 dark:text-amber-400' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
              {viewAsWorker ? 'Vista trabajador' : 'Vista gerente'}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {showAsGerente && (
            <button onClick={() => setImportModalOpen(true)} className="flex items-center gap-1.5 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <Download className="w-4 h-4" /> Importar CRM
            </button>
          )}
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

      {/* KPIs */}
      <div className={`grid gap-3 mb-6 ${showAsGerente ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
        <KpiCard icon={Users} label="Total clientes" value={kpis.total} color="gray" />
        <KpiCard icon={HardHat} label="En obra" value={kpis.enObra} color="emerald" />
        {showAsGerente && <KpiCard icon={AlertTriangle} label="Alertas" value={clientAlerts.length} color={clientAlerts.length > 0 ? 'red' : 'gray'} />}
        {showAsGerente && <KpiCard icon={FileWarning} label="Sin datos fiscales" value={clientAlerts.filter(a => a.type === 'cliente_sin_datos_fiscales').length} color="amber" />}
      </div>

      {/* Alerts panel */}
      {clientAlerts.length > 0 && showAsGerente && (
        <div className="mb-6 border-2 border-amber-200 dark:border-amber-800/50 rounded-2xl overflow-hidden">
          <button onClick={() => setAlertsOpen(!alertsOpen)} className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20">
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" /> Alertas de clientes
              <span className="px-2 py-0.5 text-xs bg-amber-200 dark:bg-amber-800 rounded-full">{clientAlerts.length}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-amber-500 transition-transform ${alertsOpen ? 'rotate-180' : ''}`} />
          </button>
          {alertsOpen && (
            <div className="divide-y divide-amber-100 dark:divide-amber-800/30">
              {clientAlerts.slice(0, 8).map(a => (
                <div key={a.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${a.severity === 'high' ? 'border-l-4 border-red-500 bg-red-50/50 dark:bg-red-900/10' : 'border-l-4 border-amber-400'}`}>
                  <span className="flex-1 text-gray-700 dark:text-gray-300">{a.detail}</span>
                  {a.entityId && <button onClick={() => openDrawer(a.entityId)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Ver</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar por nombre, CIF, email, teléfono..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400 text-sm" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors sm:hidden">
          <Filter className="w-4 h-4" /> Filtros
        </button>
      </div>

      {/* Filter bar */}
      <div className={`flex flex-wrap gap-2 mb-6 ${showFilters ? '' : 'hidden sm:flex'}`}>
        <div className="flex flex-wrap gap-1">
          {(['', 'prospecto', 'contactado', 'presupuestado', 'en_obra', 'fidelizado', 'inactivo', 'perdido'] as const).map(e => (
            <button key={e || 'all'} onClick={() => setFilterEstado(e)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterEstado === e ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {e ? ESTADO_COMERCIAL_CONFIG[e].label : 'Todos'}
            </button>
          ))}
        </div>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-0 outline-none">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_CLIENTE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {showAsGerente && (
          <>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={filterImpagos} onChange={e => setFilterImpagos(e.target.checked)} className="rounded" /> Con impagos
            </label>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={filterObrasActivas} onChange={e => setFilterObrasActivas(e.target.checked)} className="rounded" /> Con obras activas
            </label>
          </>
        )}
        {(filterEstado || filterTipo || filterImpagos || filterObrasActivas) && (
          <button onClick={() => { setFilterEstado(''); setFilterTipo(''); setFilterImpagos(false); setFilterObrasActivas(false); }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Limpiar</button>
        )}
      </div>

      {/* Client table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Cliente</th>
              <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">CIF</th>
              <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
              <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tipo</th>
              {showAsGerente && <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Responsable</th>}
              <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actividad</th>
              <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {clients.map(c => {
              const ec = ESTADO_COMERCIAL_CONFIG[c.estadoComercial] || ESTADO_COMERCIAL_CONFIG.prospecto;
              return (
                <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors" onClick={() => openDrawer(c._id)}>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400">{(c.nombre || '?')[0].toUpperCase()}</div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{c.nombre}</div>
                        {c.telefono && <div className="text-xs text-gray-500">{c.telefono}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-sm text-gray-600 dark:text-gray-300">{c.cif || '—'}</td>
                  <td className="py-3 px-3"><span className={`px-2 py-1 rounded-lg text-xs font-medium ${ec.bg} ${ec.color}`}>{ec.label}</span></td>
                  <td className="py-3 px-3 text-sm text-gray-600 dark:text-gray-300">{TIPO_CLIENTE_LABELS[c.tipoCliente] || 'Particular'}</td>
                  {showAsGerente && <td className="py-3 px-3 text-sm text-right text-gray-600 dark:text-gray-300">{c.responsableNombre || '—'}</td>}
                  <td className="py-3 px-3 text-xs text-gray-500">{relDate(c.updatedAt)}</td>
                  <td className="py-3 px-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-3.5 h-3.5 text-gray-500" /></button>
                      {showAsGerente && <button onClick={() => handleDelete(c._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden grid gap-3">
        {clients.map(c => {
          const ec = ESTADO_COMERCIAL_CONFIG[c.estadoComercial] || ESTADO_COMERCIAL_CONFIG.prospecto;
          return (
            <div key={c._id} onClick={() => openDrawer(c._id)} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400">{(c.nombre || '?')[0].toUpperCase()}</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{c.nombre}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ec.bg} ${ec.color}`}>{ec.label}</span>
                  </div>
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><Edit3 className="w-3.5 h-3.5 text-gray-500" /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                {c.cif && <span>{c.cif}</span>}
                {c.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.telefono}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {clients.length === 0 && <div className="text-center py-16 text-gray-400 text-sm">No se encontraron clientes</div>}

      {/* Create/Edit Modal */}
      {modalOpen && <ClientModal client={editing} userId={userId} onClose={() => setModalOpen(false)} onSave={handleSaveFromModal} showAsGerente={showAsGerente} />}

      {/* Detail Drawer */}
      {drawerOpen && (
        <ClientDrawer
          detail={drawerClient}
          loading={drawerLoading}
          tab={drawerTab}
          onTabChange={setDrawerTab}
          onClose={closeDrawer}
          onUpdateEstado={handleUpdateEstado}
          userId={userId}
          showAsGerente={showAsGerente}
          onRefresh={() => drawerClient && openDrawer(drawerClient.client._id)}
          navigate={navigate}
        />
      )}

      {/* Import CRM Modal */}
      {importModalOpen && <ImportCrmModal userId={userId} onClose={() => setImportModalOpen(false)} onImported={load} />}
    </Layout>
  );
}

// ─── KPI CARD ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.gray}`}><Icon className="w-5 h-5" /></div>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      </div>
    </div>
  );
}

// ─── CLIENT MODAL (CC-09) ────────────────────────────────────────────────────

const emptyForm = {
  nombre: '', cif: '', telefono: '', email: '', direccion: '', notas: '',
  tipoCliente: 'particular' as TipoCliente, razonSocial: '', direccionFiscal: '',
  ciudadFiscal: '', cpFiscal: '', provinciaFiscal: '', paisFiscal: 'España',
  regimenIva: 'general', estadoComercial: 'prospecto' as EstadoComercial,
  responsableId: '', responsableNombre: '', origenCliente: 'directo', referidoPor: '',
  consentimientos: { proteccionDatos: false, comunicacionesComerciales: false, cesionTerceros: false },
};

function ClientModal({ client, userId, onClose, onSave, showAsGerente }: {
  client: ConstructionClient | null; userId: string; onClose: () => void; onSave: (c: ConstructionClient) => void; showAsGerente: boolean;
}) {
  const isEdit = !!client;
  const [form, setForm] = useState(() => client ? {
    nombre: client.nombre, cif: client.cif, telefono: client.telefono, email: client.email,
    direccion: client.direccion, notas: client.notas, tipoCliente: client.tipoCliente || 'particular' as TipoCliente,
    razonSocial: client.razonSocial || '', direccionFiscal: client.direccionFiscal || '',
    ciudadFiscal: client.ciudadFiscal || '', cpFiscal: client.cpFiscal || '',
    provinciaFiscal: client.provinciaFiscal || '', paisFiscal: client.paisFiscal || 'España',
    regimenIva: client.regimenIva || 'general', estadoComercial: client.estadoComercial || 'prospecto' as EstadoComercial,
    responsableId: client.responsableId || '', responsableNombre: client.responsableNombre || '',
    origenCliente: client.origenCliente || 'directo', referidoPor: client.referidoPor || '',
    consentimientos: client.consentimientos || { proteccionDatos: false, comunicacionesComerciales: false, cesionTerceros: false },
  } : { ...emptyForm });

  const [contactos, setContactos] = useState<ClienteContacto[]>(client?.contactos || []);
  const [duplicates, setDuplicates] = useState<ClienteDuplicado[]>([]);
  const [saving, setSaving] = useState(false);
  const [showFiscal, setShowFiscal] = useState(form.tipoCliente !== 'particular');
  const [showContactos, setShowContactos] = useState((client?.contactos?.length || 0) > 0);
  const [showOrigen, setShowOrigen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const checkDups = useCallback((field: string, value: string) => {
    if (!value || value.length < 3) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const dups = await checkClientDuplicates(userId, { [field]: value, excludeId: client?._id });
        setDuplicates(dups);
      } catch { /* ignore */ }
    }, 500);
  }, [userId, client]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, contactos };
      if (isEdit && client) {
        const updated = await updateConstructionClient(userId, { ...client, ...payload } as ConstructionClient);
        onSave(updated);
      } else {
        const created = await createConstructionClient(userId, payload as Partial<ConstructionClient>);
        onSave(created);
      }
    } catch { /* silently fail */ }
    setSaving(false);
  };

  const addContacto = () => setContactos(prev => [...prev, { id: `cnt-${Date.now()}`, nombre: '', cargo: '', telefono: '', email: '', notas: '', esPrincipal: prev.length === 0 }]);
  const removeContacto = (id: string) => setContactos(prev => prev.filter(c => c.id !== id));
  const updateContacto = (id: string, field: string, value: string | boolean) => setContactos(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Datos básicos */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo de cliente</label>
              <select className={inputClass} value={form.tipoCliente} onChange={e => { const v = e.target.value as TipoCliente; setForm(f => ({ ...f, tipoCliente: v })); setShowFiscal(v !== 'particular'); }}>
                {Object.entries(TIPO_CLIENTE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Estado comercial</label>
              <select className={inputClass} value={form.estadoComercial} onChange={e => setForm(f => ({ ...f, estadoComercial: e.target.value as EstadoComercial }))}>
                {Object.entries(ESTADO_COMERCIAL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Nombre / Razón social *</label>
            <input className={inputClass} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} onBlur={() => checkDups('nombre', form.nombre)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>CIF / NIF</label>
              <input className={inputClass} value={form.cif} onChange={e => setForm(f => ({ ...f, cif: e.target.value }))} onBlur={() => checkDups('cif', form.cif)} />
            </div>
            <div>
              <label className={labelClass}>Teléfono</label>
              <input className={inputClass} value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} onBlur={() => checkDups('telefono', form.telefono)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} onBlur={() => checkDups('email', form.email)} />
          </div>
          <div>
            <label className={labelClass}>Dirección</label>
            <input className={inputClass} value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>

          {/* Duplicates warning */}
          {duplicates.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">Posibles duplicados encontrados</p>
              {duplicates.map(d => (
                <div key={d.client._id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-gray-700 dark:text-gray-300">{d.client.nombre} — coincide por <strong>{d.matchField}</strong></span>
                </div>
              ))}
            </div>
          )}

          {/* Fiscal section */}
          <button type="button" onClick={() => setShowFiscal(!showFiscal)} className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
            {showFiscal ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Datos fiscales
          </button>
          {showFiscal && (
            <div className="space-y-3 pl-6 border-l-2 border-gray-200 dark:border-gray-700">
              <div><label className={labelClass}>Razón social</label><input className={inputClass} value={form.razonSocial} onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))} /></div>
              <div><label className={labelClass}>Dirección fiscal</label><input className={inputClass} value={form.direccionFiscal} onChange={e => setForm(f => ({ ...f, direccionFiscal: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelClass}>Ciudad</label><input className={inputClass} value={form.ciudadFiscal} onChange={e => setForm(f => ({ ...f, ciudadFiscal: e.target.value }))} /></div>
                <div><label className={labelClass}>C.P.</label><input className={inputClass} value={form.cpFiscal} onChange={e => setForm(f => ({ ...f, cpFiscal: e.target.value }))} /></div>
                <div><label className={labelClass}>Provincia</label><input className={inputClass} value={form.provinciaFiscal} onChange={e => setForm(f => ({ ...f, provinciaFiscal: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>País</label><input className={inputClass} value={form.paisFiscal} onChange={e => setForm(f => ({ ...f, paisFiscal: e.target.value }))} /></div>
                <div>
                  <label className={labelClass}>Régimen IVA</label>
                  <select className={inputClass} value={form.regimenIva} onChange={e => setForm(f => ({ ...f, regimenIva: e.target.value }))}>
                    <option value="general">General</option><option value="simplificado">Simplificado</option>
                    <option value="recargo_equivalencia">Recargo equivalencia</option><option value="exento">Exento</option>
                    <option value="intracomunitario">Intracomunitario</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Contactos section */}
          <button type="button" onClick={() => setShowContactos(!showContactos)} className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
            {showContactos ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Contactos adicionales ({contactos.length})
          </button>
          {showContactos && (
            <div className="space-y-3 pl-6 border-l-2 border-gray-200 dark:border-gray-700">
              {contactos.map(cnt => (
                <div key={cnt.id} className="grid grid-cols-4 gap-2 items-end">
                  <input className={inputClass} placeholder="Nombre" value={cnt.nombre} onChange={e => updateContacto(cnt.id, 'nombre', e.target.value)} />
                  <input className={inputClass} placeholder="Cargo" value={cnt.cargo} onChange={e => updateContacto(cnt.id, 'cargo', e.target.value)} />
                  <input className={inputClass} placeholder="Teléfono" value={cnt.telefono} onChange={e => updateContacto(cnt.id, 'telefono', e.target.value)} />
                  <div className="flex gap-1">
                    <input className={`${inputClass} flex-1`} placeholder="Email" value={cnt.email} onChange={e => updateContacto(cnt.id, 'email', e.target.value)} />
                    <button type="button" onClick={() => removeContacto(cnt.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addContacto} className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline">+ Añadir contacto</button>
            </div>
          )}

          {/* Origen */}
          {showAsGerente && (
            <>
              <button type="button" onClick={() => setShowOrigen(!showOrigen)} className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                {showOrigen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Origen y comercial
              </button>
              {showOrigen && (
                <div className="space-y-3 pl-6 border-l-2 border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Origen</label>
                      <select className={inputClass} value={form.origenCliente} onChange={e => setForm(f => ({ ...f, origenCliente: e.target.value }))}>
                        <option value="directo">Directo</option><option value="referido">Referido</option><option value="web">Web</option>
                        <option value="publicidad">Publicidad</option><option value="inmobiliaria">Inmobiliaria</option>
                        <option value="arquitecto">Arquitecto</option><option value="otro">Otro</option>
                      </select>
                    </div>
                    {form.origenCliente === 'referido' && (
                      <div><label className={labelClass}>Referido por</label><input className={inputClass} value={form.referidoPor} onChange={e => setForm(f => ({ ...f, referidoPor: e.target.value }))} /></div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Notas */}
          <div><label className={labelClass}>Notas</label><textarea className={inputClass} rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div>

          {/* Consentimientos */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Consentimientos</p>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"><input type="checkbox" checked={form.consentimientos.proteccionDatos} onChange={e => setForm(f => ({ ...f, consentimientos: { ...f.consentimientos, proteccionDatos: e.target.checked } }))} className="rounded" /> Protección de datos</label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"><input type="checkbox" checked={form.consentimientos.comunicacionesComerciales} onChange={e => setForm(f => ({ ...f, consentimientos: { ...f.consentimientos, comunicacionesComerciales: e.target.checked } }))} className="rounded" /> Comunicaciones comerciales</label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"><input type="checkbox" checked={form.consentimientos.cesionTerceros} onChange={e => setForm(f => ({ ...f, consentimientos: { ...f.consentimientos, cesionTerceros: e.target.checked } }))} className="rounded" /> Cesión a terceros</label>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── CLIENT DRAWER (CC-08) ───────────────────────────────────────────────────

const DRAWER_TABS = [
  { id: 'general', label: 'General', icon: Users },
  { id: 'obras', label: 'Obras', icon: HardHat },
  { id: 'presupuestos', label: 'Presupuestos', icon: Receipt },
  { id: 'economico', label: 'Económico', icon: Wallet },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'notas', label: 'Notas', icon: MessageSquare },
  { id: 'historico', label: 'Histórico', icon: Clock },
];

function ClientDrawer({ detail, loading, tab, onTabChange, onClose, onUpdateEstado, userId, showAsGerente, onRefresh, navigate }: {
  detail: ClienteDetalle | null; loading: boolean; tab: string; onTabChange: (t: string) => void;
  onClose: () => void; onUpdateEstado: (c: ConstructionClient, e: EstadoComercial) => void;
  userId: string; showAsGerente: boolean; onRefresh: () => void; navigate: (to: string) => void;
}) {
  const [estadoDropdown, setEstadoDropdown] = useState(false);

  const tabs = showAsGerente ? DRAWER_TABS : DRAWER_TABS.filter(t => t.id !== 'economico');

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative w-full md:w-1/2 xl:w-2/5 h-full bg-white dark:bg-gray-800 shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        {loading || !detail ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-400">
                    {(detail.client.nombre || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{detail.client.nombre}</h2>
                    {detail.client.razonSocial && detail.client.razonSocial !== detail.client.nombre && (
                      <p className="text-xs text-gray-500">{detail.client.razonSocial}</p>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg">{TIPO_CLIENTE_LABELS[detail.client.tipoCliente] || 'Particular'}</span>
                <div className="relative">
                  <button onClick={() => showAsGerente && setEstadoDropdown(!estadoDropdown)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium ${ESTADO_COMERCIAL_CONFIG[detail.client.estadoComercial]?.bg} ${ESTADO_COMERCIAL_CONFIG[detail.client.estadoComercial]?.color} ${showAsGerente ? 'cursor-pointer hover:opacity-80' : ''}`}>
                    {ESTADO_COMERCIAL_CONFIG[detail.client.estadoComercial]?.label || detail.client.estadoComercial}
                    {showAsGerente && <ChevronDown className="w-3 h-3 inline ml-1" />}
                  </button>
                  {estadoDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-700 rounded-xl shadow-lg border border-gray-200 dark:border-gray-600 py-1 z-20 min-w-[140px]">
                      {Object.entries(ESTADO_COMERCIAL_CONFIG).map(([k, v]) => (
                        <button key={k} onClick={() => { onUpdateEstado(detail.client, k as EstadoComercial); setEstadoDropdown(false); }}
                          className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-600 ${v.color}`}>{v.label}</button>
                      ))}
                    </div>
                  )}
                </div>
                {detail.client.tags?.map(t => <span key={t} className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">{t}</span>)}
              </div>
              {/* Quick stats */}
              <div className="grid grid-cols-4 gap-2 mt-4">
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl"><div className="text-lg font-bold text-gray-900 dark:text-gray-100">{detail.resumenEconomico.numObrasActivas}</div><div className="text-[10px] text-gray-500">Obras</div></div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl"><div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(detail.resumenEconomico.totalPresupuestado)}</div><div className="text-[10px] text-gray-500">Presupuestado</div></div>
                {showAsGerente && <div className="text-center p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl"><div className="text-lg font-bold text-emerald-600">{fmt(detail.resumenEconomico.totalCobrado)}</div><div className="text-[10px] text-gray-500">Cobrado</div></div>}
                {showAsGerente && <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded-xl"><div className="text-lg font-bold text-red-600">{fmt(detail.resumenEconomico.totalPendienteCobro)}</div><div className="text-[10px] text-gray-500">Pendiente</div></div>}
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-5 overflow-x-auto">
              <div className="flex gap-1">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => onTabChange(t.id)}
                    className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    <t.icon className="w-3.5 h-3.5 inline mr-1" />{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="p-5">
              {tab === 'general' && <TabGeneral client={detail.client} />}
              {tab === 'obras' && <TabObras obras={detail.obras} navigate={navigate} clientId={detail.client._id} />}
              {tab === 'presupuestos' && <TabPresupuestos presupuestos={detail.presupuestos} navigate={navigate} />}
              {tab === 'economico' && showAsGerente && <TabEconomico resumen={detail.resumenEconomico} presupuestos={detail.presupuestos} />}
              {tab === 'documentos' && <TabDocumentos client={detail.client} userId={userId} onRefresh={onRefresh} />}
              {tab === 'notas' && <TabNotas client={detail.client} userId={userId} onRefresh={onRefresh} />}
              {tab === 'historico' && <TabHistorico userId={userId} clientId={detail.client._id} entries={detail.ultimasInteracciones} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TAB: GENERAL ────────────────────────────────────────────────────────────

function TabGeneral({ client }: { client: ConstructionClient }) {
  return (
    <div className="space-y-6">
      {/* Contact info */}
      <Section title="Datos de contacto" icon={Phone}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Teléfono" value={client.telefono} link={client.telefono ? `tel:${client.telefono}` : undefined} />
          <InfoRow label="Email" value={client.email} link={client.email ? `mailto:${client.email}` : undefined} />
          <InfoRow label="Dirección" value={client.direccion} />
        </div>
        {client.contactos?.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">Personas de contacto</p>
            <div className="space-y-2">
              {client.contactos.map(c => (
                <div key={c.id} className="flex items-center gap-3 text-sm bg-gray-50 dark:bg-gray-700/30 rounded-xl p-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold">{(c.nombre || '?')[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{c.nombre} {c.esPrincipal && <span className="text-[10px] text-blue-500 ml-1">Principal</span>}</div>
                    <div className="text-xs text-gray-500">{[c.cargo, c.telefono, c.email].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Fiscal */}
      <Section title="Datos fiscales" icon={Building2}>
        {(!client.cif && !client.razonSocial && client.tipoCliente !== 'particular') && (
          <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs text-amber-700 dark:text-amber-400 mb-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Faltan datos fiscales
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="CIF/NIF" value={client.cif} />
          <InfoRow label="Razón social" value={client.razonSocial} />
          <InfoRow label="Dir. fiscal" value={client.direccionFiscal} />
          <InfoRow label="Ciudad" value={[client.ciudadFiscal, client.cpFiscal, client.provinciaFiscal].filter(Boolean).join(', ')} />
          <InfoRow label="País" value={client.paisFiscal} />
          <InfoRow label="Régimen IVA" value={client.regimenIva} />
        </div>
      </Section>

      {/* Inmuebles */}
      {client.inmuebles?.length > 0 && (
        <Section title="Inmuebles / Propiedades" icon={Home}>
          <div className="space-y-2">
            {client.inmuebles.map(inm => (
              <div key={inm.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{inm.descripcion || inm.tipo}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">{inm.tipo.replace('_', ' ')}</span>
                </div>
                <div className="text-xs text-gray-500">{[inm.direccion, inm.superficie ? `${inm.superficie}m²` : '', inm.referenciaCatastral].filter(Boolean).join(' · ')}</div>
                {inm.obraNombre && <div className="text-xs text-blue-500 mt-1">Obra: {inm.obraNombre}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Origin & commercial */}
      <Section title="Origen y comercial" icon={Globe}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Origen" value={client.origenCliente} />
          <InfoRow label="Referido por" value={client.referidoPor} />
          <InfoRow label="Responsable" value={client.responsableNombre} />
          {client.crmClientId && <InfoRow label="Vínculo CRM" value="Vinculado" />}
        </div>
      </Section>

      {/* Consents */}
      <Section title="Consentimientos (GDPR)" icon={Shield}>
        <div className="space-y-1 text-sm">
          <ConsentRow label="Protección de datos" value={client.consentimientos?.proteccionDatos} />
          <ConsentRow label="Comunicaciones comerciales" value={client.consentimientos?.comunicacionesComerciales} />
          <ConsentRow label="Cesión a terceros" value={client.consentimientos?.cesionTerceros} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3"><Icon className="w-4 h-4 text-gray-400" />{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value?: string; link?: string }) {
  const display = value || '—';
  return (
    <div>
      <span className="text-xs text-gray-500">{label}</span>
      <div className="font-medium text-gray-900 dark:text-gray-100">
        {link ? <a href={link} className="text-blue-600 dark:text-blue-400 hover:underline">{display}</a> : display}
      </div>
    </div>
  );
}

function ConsentRow({ label, value }: { label: string; value?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {value ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-red-400" />}
      <span className={value ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}>{label}</span>
    </div>
  );
}

// ─── TAB: OBRAS ──────────────────────────────────────────────────────────────

function TabObras({ obras, navigate, clientId }: { obras: Partial<ConstructionProject>[]; navigate: (to: string) => void; clientId: string }) {
  const estadoColors: Record<string, string> = { planificacion: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', en_obra: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', pausada: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', finalizada: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' };
  if (!obras.length) return <EmptyState text="No hay obras vinculadas" action="Crear obra" onAction={() => navigate('/saas/construction-projects')} />;
  return (
    <div className="space-y-3">
      {obras.map(o => (
        <div key={o._id} onClick={() => navigate(`/saas/construction-projects?open=${o._id}`)} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{o.nombre}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${estadoColors[o.estado || ''] || estadoColors.planificacion}`}>{o.estado}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{o.ubicacion || '—'}</span>
            <span>{o.tipoObra || ''}</span>
          </div>
          {typeof o.progreso === 'number' && (
            <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(o.progreso, 100)}%` }} />
            </div>
          )}
        </div>
      ))}
      <button onClick={() => navigate('/saas/construction-projects')} className="w-full text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline py-2">+ Nueva obra para este cliente</button>
    </div>
  );
}

// ─── TAB: PRESUPUESTOS ───────────────────────────────────────────────────────

function TabPresupuestos({ presupuestos, navigate }: { presupuestos: Partial<ConstructionBudget>[]; navigate: (to: string) => void }) {
  const estadoColors: Record<string, string> = { borrador: 'bg-gray-100 text-gray-500 dark:bg-gray-700', enviado: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', aceptado: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', rechazado: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' };
  if (!presupuestos.length) return <EmptyState text="No hay presupuestos" action="Crear presupuesto" onAction={() => navigate('/saas/construction-budgets')} />;
  return (
    <div className="space-y-3">
      {presupuestos.map(b => (
        <div key={b._id} onClick={() => navigate(`/saas/construction-budgets?open=${b._id}`)} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{b.referencia}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${estadoColors[b.estado || ''] || estadoColors.borrador}`}>{b.estado}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{b.proyectoNombre || '—'}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{fmt(b.totalConMargen)}</span>
          </div>
          {b.estado === 'aceptado' && (
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="text-emerald-600">Cobrado: {fmt(b.totalPagado)}</span>
              <span className="text-red-500">Pendiente: {fmt(b.pendientePago)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── TAB: ECONÓMICO ──────────────────────────────────────────────────────────

function TabEconomico({ resumen, presupuestos }: { resumen: ClienteResumenEconomico; presupuestos: Partial<ConstructionBudget>[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-center"><div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(resumen.totalPresupuestado)}</div><div className="text-xs text-gray-500">Presupuestado</div></div>
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center"><div className="text-lg font-bold text-blue-600">{fmt(resumen.totalAceptado)}</div><div className="text-xs text-gray-500">Aceptado</div></div>
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center"><div className="text-lg font-bold text-emerald-600">{fmt(resumen.totalCobrado)}</div><div className="text-xs text-gray-500">Cobrado</div></div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-center"><div className="text-lg font-bold text-red-600">{fmt(resumen.totalPendienteCobro)}</div><div className="text-xs text-gray-500">Pendiente cobro</div></div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Resumen por presupuesto</h4>
        {presupuestos.filter(b => b.estado === 'aceptado').map(b => (
          <div key={b._id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 text-sm">
            <span className="text-gray-700 dark:text-gray-300">{b.referencia}</span>
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-600">{fmt(b.totalPagado)}</span>
              <span className="text-red-500">{fmt(b.pendientePago)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div><div className="text-2xl font-bold text-amber-600">{resumen.numObrasActivas}</div><div className="text-xs text-gray-500">Obras activas</div></div>
        <div><div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{resumen.numObrasFinalizadas}</div><div className="text-xs text-gray-500">Finalizadas</div></div>
        <div><div className="text-2xl font-bold text-blue-600">{resumen.numPresupuestosPendientes}</div><div className="text-xs text-gray-500">Pres. pendientes</div></div>
      </div>
    </div>
  );
}

// ─── TAB: DOCUMENTOS (CC-14) ────────────────────────────────────────────────

function TabDocumentos({ client, userId, onRefresh }: { client: ConstructionClient; userId: string; onRefresh: () => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const obligatorios = DOC_OBLIGATORIOS[client.tipoCliente] || [];
  const existingNames = (client.documentos || []).map(d => d.nombre.toLowerCase());

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1] || '';
        const newDoc: ClientDoc = {
          id: `doc-${Date.now()}`, nombre: file.name, tipo: 'otro', url: '',
          fecha: new Date().toISOString().slice(0, 10), ocrData: null,
          fileBase64: base64, fileMimeType: file.type,
        };
        await updateConstructionClient(userId, { ...client, documentos: [...(client.documentos || []), newDoc] } as ConstructionClient);
        onRefresh();
      };
      reader.readAsDataURL(file);
    } catch { /* silently fail */ }
    setUploading(false);
  };

  return (
    <div className="space-y-6">
      {obligatorios.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Documentos obligatorios</h4>
          <div className="grid grid-cols-1 gap-2">
            {obligatorios.map(doc => {
              const found = existingNames.some(n => n.includes(doc.toLowerCase().slice(0, 5)));
              return (
                <div key={doc} className={`flex items-center justify-between p-3 rounded-xl text-sm ${found ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                  <span className="flex items-center gap-2">
                    {found ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <FileWarning className="w-4 h-4 text-red-500" />}
                    <span className={found ? 'text-gray-700 dark:text-gray-300' : 'text-red-700 dark:text-red-400'}>{doc}</span>
                  </span>
                  {!found && <button onClick={() => fileRef.current?.click()} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline">Subir</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Documentos ({(client.documentos || []).length})</h4>
          <button onClick={() => fileRef.current?.click()} className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1">
            <Upload className="w-3.5 h-3.5" /> Subir
          </button>
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
        <div className="space-y-2">
          {(client.documentos || []).map(d => (
            <div key={d.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/30 rounded-xl px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {d.ocrData ? <ScanLine className="w-4 h-4 text-violet-500 shrink-0" /> : <FileText className="w-4 h-4 text-gray-400 shrink-0" />}
                <span className="truncate font-medium text-gray-700 dark:text-gray-200">{d.nombre}</span>
                <span className="text-xs text-gray-400 capitalize shrink-0">{d.tipo}</span>
              </div>
              <span className="text-xs text-gray-400 shrink-0 ml-2">{d.fecha}</span>
            </div>
          ))}
          {(client.documentos || []).length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin documentos</p>}
        </div>
      </div>
    </div>
  );
}

// ─── TAB: NOTAS ──────────────────────────────────────────────────────────────

function TabNotas({ client, userId, onRefresh }: { client: ConstructionClient; userId: string; onRefresh: () => void }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [tipo, setTipo] = useState('nota_interna');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await createClientNote(userId, client._id, {
        texto: text, tipo: tipo as ClienteNota['tipo'],
        autor: user?.id || '', autorNombre: user?.fullName || user?.name || '',
      });
      setText('');
      onRefresh();
    } catch { /* silently fail */ }
    setSaving(false);
  };

  const notes = client.notasEstructuradas || [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${inputClass} w-auto`}>
            {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={handleCreate} disabled={saving || !text.trim()} className="px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors shrink-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
          </button>
        </div>
        <textarea className={inputClass} rows={2} placeholder="Escribe una nota..." value={text} onChange={e => setText(e.target.value)} />
      </div>

      <div className="space-y-3">
        {notes.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map(n => {
          const noteType = NOTE_TYPES.find(t => t.value === n.tipo);
          const NIcon = noteType?.icon || MessageSquare;
          return (
            <div key={n.id} className="flex gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0"><NIcon className="w-4 h-4 text-gray-500" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{n.autorNombre || 'Sistema'}</span>
                  <span className="text-xs text-gray-400">{relDate(n.fecha)}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500">{noteType?.label || n.tipo}</span>
                </div>
                <p className="text-gray-600 dark:text-gray-300">{n.texto}</p>
                {n.obraNombre && <p className="text-xs text-blue-500 mt-0.5">Obra: {n.obraNombre}</p>}
              </div>
            </div>
          );
        })}
        {notes.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin notas</p>}
      </div>
    </div>
  );
}

// ─── TAB: HISTÓRICO ──────────────────────────────────────────────────────────

function TabHistorico({ userId, clientId, entries }: { userId: string; clientId: string; entries: ClienteHistorialEntry[] }) {
  const [allEntries, setAllEntries] = useState(entries);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await getClientHistory(userId, clientId, 50, allEntries.length);
      setAllEntries(prev => [...prev, ...data.history]);
    } catch { /* silently fail */ }
    setLoadingMore(false);
  };

  return (
    <div className="space-y-1">
      {allEntries.map(e => {
        const Icon = HISTORY_ICONS[e.tipo] || Activity;
        const color = HISTORY_COLORS[e.tipo] || 'text-gray-500';
        return (
          <div key={e.id} className="flex gap-3 py-2.5 border-b border-gray-50 dark:border-gray-800 text-sm">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-gray-50 dark:bg-gray-700/50 ${color}`}><Icon className="w-3.5 h-3.5" /></div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-gray-100">{e.titulo}</div>
              {e.detalle && <div className="text-gray-500 text-xs">{e.detalle}</div>}
            </div>
            <span className="text-xs text-gray-400 shrink-0" title={fmtDate(e.fecha)}>{relDate(e.fecha)}</span>
          </div>
        );
      })}
      {allEntries.length >= 20 && (
        <button onClick={loadMore} disabled={loadingMore} className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline">
          {loadingMore ? 'Cargando...' : 'Cargar más'}
        </button>
      )}
      {allEntries.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin actividad registrada</p>}
    </div>
  );
}

// ─── IMPORT CRM MODAL (CC-15) ───────────────────────────────────────────────

function ImportCrmModal({ userId, onClose, onImported }: { userId: string; onClose: () => void; onImported: () => void }) {
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<Array<{ _id: string; id: string; name: string; phone: string; email: string; clientType: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImportedList] = useState<Set<string>>(new Set());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'cif', label: 'CIF/NIF' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'address', label: 'Dirección' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'cif', label: 'CIF/NIF', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, {
      create: (uid, data) => createConstructionClient(uid, data as Partial<ConstructionClient>),
    }, entries, (entry) => ({
      nombre: entryStr(entry, 'name', 'nombre'),
      email: entryStr(entry, 'email'),
      telefono: entryStr(entry, 'phone', 'telefono'),
      direccion: entryStr(entry, 'address', 'direccion'),
    }));
    if (created > 0) {
      toast.success(`${created} cliente(s) creado(s)`);
      void loadClients();
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  const searchCrm = async () => {
    if (!searchQ.trim() || searchQ.length < 2) return;
    setLoading(true);
    try {
      const r = await authFetch(
        `${getApiBase()}/api/clients/${encodeURIComponent(userId)}?q=${encodeURIComponent(searchQ)}&limit=20`,
        { headers: { 'Content-Type': 'application/json' } },
      );
      const data = await r.json();
      setResults(data.clients || []);
    } catch { setResults([]); }
    setLoading(false);
  };

  useEffect(() => { const t = setTimeout(searchCrm, 400); return () => clearTimeout(t); }, [searchQ]);

  const handleImport = async (crmClientId: string) => {
    setImporting(crmClientId);
    try {
      await importCrmClientToConstruction(userId, crmClientId);
      setImportedList(prev => new Set([...prev, crmClientId]));
      onImported();
    } catch { /* silently fail */ }
    setImporting(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Download className="w-5 h-5 text-blue-600" /> Importar desde CRM</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-5">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar cliente en CRM..." value={searchQ} onChange={e => setSearchQ(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400 text-sm" autoFocus />
          </div>
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {loading && <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>}
            {!loading && results.map(c => (
              <div key={c._id || c.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{c.name}</div>
                  <div className="text-xs text-gray-500">{[c.phone, c.email, c.clientType].filter(Boolean).join(' · ')}</div>
                </div>
                {imported.has(c._id || c.id) ? (
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Importado</span>
                ) : (
                  <button onClick={() => handleImport(c._id || c.id)} disabled={importing === (c._id || c.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors">
                    {importing === (c._id || c.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Importar'}
                  </button>
                )}
              </div>
            ))}
            {!loading && searchQ.length >= 2 && results.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No se encontraron clientes en el CRM</p>}
            {!loading && searchQ.length < 2 && <p className="text-sm text-gray-400 text-center py-4">Escribe al menos 2 caracteres para buscar</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────

function EmptyState({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-gray-400 mb-3">{text}</p>
      {action && onAction && <button onClick={onAction} className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline">{action}</button>}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_clients"
        moduleLabel="Clientes"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Clientes"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
