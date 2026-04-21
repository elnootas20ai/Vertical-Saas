import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, X, Filter, Clock, Euro, AlertTriangle, AlertCircle,
  LayoutGrid, TableIcon, Eye, EyeOff, Info, MoreVertical, Camera,
  ClipboardCheck, ChevronDown, ExternalLink, FileText,
} from 'lucide-react';
import type {
  ConstructionDailyReport, ConstructionProject, ConstructionWorker,
  ConstructionTask, ConstructionAlert, ConstructionIncident,
} from '../../lib/constructionApi';
import {
  listDailyReports, listConstructionProjects, listConstructionWorkers,
  listConstructionTasks, getConstructionAlerts, listConstructionIncidents,
  deleteDailyReport, submitDailyReport, validateDailyReport,
} from '../../lib/constructionApi';
import { DailyReportDrawer } from './components/DailyReportDrawer';
import { toast } from 'sonner';

import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
const ESTADOS = [
  { id: 'borrador', label: 'Borrador', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  { id: 'enviado', label: 'Enviado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'validado', label: 'Validado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { id: 'rechazado', label: 'Rechazado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
];

function getEstadoStyle(estado: string) {
  return ESTADOS.find(e => e.id === estado)?.color || ESTADOS[0].color;
}

function getEstadoLabel(estado: string) {
  return ESTADOS.find(e => e.id === estado)?.label || estado;
}

export function ConstructionExecution() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const [searchParams] = useSearchParams();

  const [reports, setReports] = useState<ConstructionDailyReport[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);
  const [tasks, setTasks] = useState<ConstructionTask[]>([]);
  const [alerts, setAlerts] = useState<ConstructionAlert[]>([]);
  const [incidents, setIncidents] = useState<ConstructionIncident[]>([]);
  const [loading, setLoading] = useState(true);

  const [vistaActual, setVistaActual] = useState<'cards' | 'tabla'>('cards');
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [mostrarAlertas, setMostrarAlertas] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string[]>([]);
  const [filtroObra, setFiltroObra] = useState<string[]>([]);
  const [filtroTrabajador, setFiltroTrabajador] = useState<string[]>([]);
  const [filtroGremio, setFiltroGremio] = useState<string[]>([]);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ConstructionDailyReport | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [r, p, w, t, a, inc] = await Promise.all([
        listDailyReports(userId),
        listConstructionProjects(userId),
        listConstructionWorkers(userId),
        listConstructionTasks(userId),
        getConstructionAlerts(userId),
        listConstructionIncidents(userId),
      ]);
      setReports(r); setProjects(p); setWorkers(w); setTasks(t); setAlerts(a); setIncidents(inc);
    } catch { /* fail silently */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Pre-filtros desde query params
  useEffect(() => {
    const obraId = searchParams.get('obraId');
    const trabajadorId = searchParams.get('trabajadorId');
    if (obraId) setFiltroObra([obraId]);
    if (trabajadorId) setFiltroTrabajador([trabajadorId]);
  }, [searchParams]);

  // Valores únicos para filtros
  const obrasUnicas = useMemo(() => [...new Set(reports.map(r => r.obraId))].map(id => ({
    id, nombre: reports.find(r => r.obraId === id)?.obraNombre || id,
  })), [reports]);

  const trabajadoresUnicos = useMemo(() => [...new Set(reports.map(r => r.trabajadorId))].map(id => ({
    id, nombre: reports.find(r => r.trabajadorId === id)?.trabajadorNombre || id,
  })), [reports]);

  const gremiosUnicos = useMemo(() => [...new Set(reports.map(r => r.gremio).filter(Boolean))], [reports]);

  // Filtrar partes
  const filtered = useMemo(() => reports.filter(r => {
    const q = `${r.referencia} ${r.obraNombre} ${r.trabajadorNombre} ${r.gremio} ${r.descripcion}`.toLowerCase();
    if (busqueda && !q.includes(busqueda.toLowerCase())) return false;
    if (filtroEstado.length && !filtroEstado.includes(r.estado)) return false;
    if (filtroObra.length && !filtroObra.includes(r.obraId)) return false;
    if (filtroTrabajador.length && !filtroTrabajador.includes(r.trabajadorId)) return false;
    if (filtroGremio.length && !filtroGremio.includes(r.gremio)) return false;
    return true;
  }), [reports, busqueda, filtroEstado, filtroObra, filtroTrabajador, filtroGremio]);

  // KPIs
  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const reportsMes = reports.filter(r => r.fecha.startsWith(mesActual));
  const horasMes = reportsMes.reduce((s, r) => s + r.horasTrabajadas, 0);
  const costeMes = reportsMes.reduce((s, r) => s + r.costeTotal, 0);
  const pendientes = reports.filter(r => r.estado === 'enviado').length;
  const incidenciasAbiertas = incidents.filter(i => i.estado === 'abierta').length;

  const hayFiltros = filtroEstado.length > 0 || filtroObra.length > 0 || filtroTrabajador.length > 0 || filtroGremio.length > 0;

  const limpiarFiltros = () => {
    setFiltroEstado([]); setFiltroObra([]); setFiltroTrabajador([]); setFiltroGremio([]);
  };

  const handleOpenNew = () => {
    setSelectedReport(null);
    setCreatingNew(true);
    setDrawerOpen(true);
  };

  const handleOpenReport = (r: ConstructionDailyReport) => {
    setSelectedReport(r);
    setCreatingNew(false);
    setDrawerOpen(true);
    setMenuAbierto(null);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedReport(null);
    setCreatingNew(false);
  };

  const handleSaved = () => {
    handleCloseDrawer();
    load();
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm('¿Eliminar este parte?')) return;
    try { await deleteDailyReport(userId, reportId); load(); } catch { /* */ }
    setMenuAbierto(null);
  };

  const handleSubmit = async (reportId: string) => {
    try { await submitDailyReport(userId, reportId); load(); } catch { /* */ }
    setMenuAbierto(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const toggleSelectAll = () => {
    const enviados = filtered.filter(r => r.estado === 'enviado');
    if (enviados.every(r => selectedIds.has(r._id))) setSelectedIds(new Set());
    else setSelectedIds(new Set(enviados.map(r => r._id)));
  };

  const handleBulkValidate = async () => {
    if (!confirm(`¿Validar ${selectedIds.size} partes seleccionados?`)) return;
    for (const id of selectedIds) {
      try { await validateDailyReport(userId, id, userId, ''); } catch { /* */ }
    }
    setSelectedIds(new Set());
    load();
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Partes de obra</h1>
            <div className="relative group">
              <button className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <Info className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <div className="hidden group-hover:block absolute left-0 top-7 z-50 w-72 bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                Registro diario de trabajo, horas, materiales e incidencias por obra y trabajador
              </div>
            </div>
            <button
              onClick={() => setMostrarResumen(!mostrarResumen)}
              className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {mostrarResumen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{mostrarResumen ? 'Ocultar resumen' : 'Ver resumen'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setVistaActual('cards')} className={`p-2 rounded transition-colors ${vistaActual === 'cards' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setVistaActual('tabla')} className={`p-2 rounded transition-colors ${vistaActual === 'tabla' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}>
              <TableIcon className="w-4 h-4" />
            </button>
            <button onClick={handleOpenNew} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuevo parte</span>
            </button>
          </div>
        </div>

        {/* Alertas */}
        {mostrarAlertas && alerts.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {alerts.length} alerta{alerts.length !== 1 ? 's' : ''}
              </h3>
              <button onClick={() => setMostrarAlertas(false)} className="text-amber-600 hover:text-amber-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5">
              {alerts.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${a.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span><strong>{a.label}:</strong> {a.detail}</span>
                </div>
              ))}
              {alerts.length > 5 && <p className="text-xs text-amber-600">+ {alerts.length - 5} más</p>}
            </div>
          </div>
        )}

        {/* KPIs */}
        {mostrarResumen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Horas (mes)</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{horasMes.toFixed(1)}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Coste mano de obra</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{costeMes.toFixed(0)} €</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                  <Euro className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Pendientes validación</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendientes}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Incidencias abiertas</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{incidenciasAbiertas}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Buscador + Filtros (vista cards) */}
        {vistaActual === 'cards' && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por PARTE-xxx, obra, trabajador o gremio…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <ChipFilter label="Estado" options={ESTADOS.map(e => ({ id: e.id, label: e.label }))} selected={filtroEstado} onChange={setFiltroEstado} />
              <ChipFilter label="Obra" options={obrasUnicas.map(o => ({ id: o.id, label: o.nombre }))} selected={filtroObra} onChange={setFiltroObra} searchable />
              <ChipFilter label="Trabajador" options={trabajadoresUnicos.map(t => ({ id: t.id, label: t.nombre }))} selected={filtroTrabajador} onChange={setFiltroTrabajador} searchable />
              <ChipFilter label="Gremio" options={gremiosUnicos.map(g => ({ id: g, label: g }))} selected={filtroGremio} onChange={setFiltroGremio} />
              {hayFiltros && (
                <button onClick={limpiarFiltros} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 whitespace-nowrap">
                  <X className="w-3.5 h-3.5" /> Limpiar todo
                </button>
              )}
            </div>
          </>
        )}

        {/* Loading */}
        {loading && <div className="text-center py-12 text-gray-500">Cargando partes…</div>}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <ClipboardCheck className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin partes de obra</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {hayFiltros ? 'No hay partes que coincidan con los filtros.' : 'Registra el primer parte de trabajo diario.'}
            </p>
            {!hayFiltros && (
              <AddButtonDropdown
                label="Nueva tarea"
                onQuickAdd={handleOpenNew}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de tarea"
              />
            )}
          </div>
        )}

        {/* Vista Cards */}
        {!loading && filtered.length > 0 && vistaActual === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(r => (
              <div
                key={r._id}
                onClick={() => handleOpenReport(r)}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:shadow-md transition-shadow space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{r.referencia}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getEstadoStyle(r.estado)}`}>{getEstadoLabel(r.estado)}</span>
                  </div>
                  <div className="relative">
                    <button onClick={e => { e.stopPropagation(); setMenuAbierto(menuAbierto === r._id ? null : r._id); }} className="text-gray-400 hover:text-gray-600">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {menuAbierto === r._id && (
                      <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                        <button onClick={e => { e.stopPropagation(); handleOpenReport(r); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Editar</button>
                        {r.estado === 'borrador' && <button onClick={e => { e.stopPropagation(); handleSubmit(r._id); }} className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700">Enviar</button>}
                        {r.estado === 'borrador' && <button onClick={e => { e.stopPropagation(); handleDelete(r._id); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700">Eliminar</button>}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">{r.descripcion || 'Sin descripción'}</p>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{r.obraNombre}</span>
                  {r.gremio && <> · {r.gremio}</>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {(r.trabajadorNombre || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 text-xs">{r.trabajadorNombre}</span>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-gray-500 text-xs">{new Date(r.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-gray-500 text-xs">{r.horasTrabajadas}h</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-base font-bold text-gray-900 dark:text-white">{r.costeTotal.toFixed(2)} €</span>
                  <div className="flex items-center gap-2">
                    {r.fotos.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-gray-500"><Camera className="w-3.5 h-3.5" />{r.fotos.length}</span>
                    )}
                    {r.tieneIncidencia && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Vista Tabla */}
        {!loading && filtered.length > 0 && vistaActual === 'tabla' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {selectedIds.size > 0 && (
              <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
                <span className="text-sm text-blue-700 dark:text-blue-400 font-medium">{selectedIds.size} parte{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
                <button onClick={handleBulkValidate} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg">Validar seleccionados</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-3 py-3 w-10"><input type="checkbox" onChange={toggleSelectAll} checked={filtered.filter(r => r.estado === 'enviado').length > 0 && filtered.filter(r => r.estado === 'enviado').every(r => selectedIds.has(r._id))} className="w-4 h-4 rounded border-gray-300 text-blue-600" /></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ref</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Obra</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Trabajador</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Gremio</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarea</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Horas</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Coste €</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Inc.</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filtered.map(r => (
                    <tr key={r._id} onClick={() => handleOpenReport(r)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        {r.estado === 'enviado' && <input type="checkbox" checked={selectedIds.has(r._id)} onChange={() => toggleSelect(r._id)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{r.referencia}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(r.fecha).toLocaleDateString('es-ES')}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white max-w-[180px] truncate">{r.obraNombre}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {(r.trabajadorNombre || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{r.trabajadorNombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{r.gremio || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[140px] truncate">{r.tareaNombre || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{r.horasTrabajadas}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{r.costeTotal.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getEstadoStyle(r.estado)}`}>{getEstadoLabel(r.estado)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.tieneIncidencia ? <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleOpenReport(r)} className="text-blue-600 hover:text-blue-700 text-xs font-medium">Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <DailyReportDrawer
          report={selectedReport}
          isNew={creatingNew}
          projects={projects}
          workers={workers}
          tasks={tasks}
          userId={userId}
          onClose={handleCloseDrawer}
          onSaved={handleSaved}
        />
      )}
    </Layout>
  );
}

// ─── Chip Filter ─────────────────────────────────────────────────────────────

interface ChipFilterProps {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}

function ChipFilter({ label, options, selected, onChange, searchable }: ChipFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'project', label: 'Proyecto' },
    { key: 'phase', label: 'Fase' },
    { key: 'assignee', label: 'Responsable' },
    { key: 'deadline', label: 'Fecha límite' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'project', label: 'Proyecto', example: '' },
    { key: 'phase', label: 'Fase', example: '' },
    { key: 'assignee', label: 'Responsable', example: '' },
    { key: 'deadline', label: 'Fecha límite', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} tarea(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} tarea(s) importado(s)`);
  };


  const shown = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          selected.length > 0
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
        }`}
      >
        <Filter className="w-3.5 h-3.5" />
        <span>{selected.length > 0 ? `${label}: ${selected.length}` : label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-3">
            {searchable && (
              <input
                type="text"
                placeholder={`Buscar ${label.toLowerCase()}…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
              />
            )}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {shown.map(o => (
                <label key={o.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1.5 rounded text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.id)}
                    onChange={e => {
                      if (e.target.checked) onChange([...selected, o.id]);
                      else onChange(selected.filter(v => v !== o.id));
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="capitalize">{o.label}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => { onChange([]); setSearch(''); }} className="text-xs text-gray-500 hover:text-gray-700">Limpiar</button>
              <button onClick={() => { setOpen(false); setSearch(''); }} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700">Aplicar</button>
            </div>
          </div>
        </>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_execution"
        moduleLabel="Ejecución"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Ejecución"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
