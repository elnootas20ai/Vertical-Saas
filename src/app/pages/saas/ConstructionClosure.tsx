import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  Lock, Unlock, AlertTriangle, CheckCircle2, X, FileText, ListTodo,
  Wallet, CreditCard, Building2, Clock, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Printer, Shield, Info, Search, Filter,
} from 'lucide-react';
import type {
  ConstructionProject, ClosureSummary, ClosureChecklist, ClosureChecklistItem,
} from '../../lib/constructionApi';
import {
  listConstructionProjects, getClosureSummary,
  closeConstructionProject, reopenConstructionProject,
  ESTADO_OBRA_CONFIG,
} from '../../lib/constructionApi';

type CheckSection = 'cobros' | 'incidencias' | 'documentos' | 'tareas';

export function ConstructionClosure() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const userRole = (user as Record<string, unknown>)?.role as string || 'owner';
  const isManager = ['owner', 'admin', 'manager', 'gerente'].includes(userRole);

  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdParam = searchParams.get('projectId') || '';

  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [selectedId, setSelectedId] = useState(projectIdParam);
  const [project, setProject] = useState<ConstructionProject | null>(null);
  const [summary, setSummary] = useState<ClosureSummary | null>(null);
  const [checklist, setChecklist] = useState<ClosureChecklist | null>(null);
  const [canClose, setCanClose] = useState(false);
  const [alreadyClosed, setAlreadyClosed] = useState(false);
  const [blockingReasons, setBlockingReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [expanded, setExpanded] = useState<Record<CheckSection, boolean>>({ cobros: false, incidencias: false, documentos: false, tareas: false });

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [motivoCierre, setMotivoCierre] = useState('');
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterState, setFilterState] = useState<string>('all');

  const loadProjects = useCallback(async () => {
    if (!userId) return;
    try {
      const p = await listConstructionProjects(userId);
      setProjects(p);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const loadClosure = useCallback(async (pid: string) => {
    if (!userId || !pid) { setProject(null); setSummary(null); setChecklist(null); return; }
    setLoadingSummary(true);
    try {
      const r = await getClosureSummary(userId, pid);
      setProject(r.project);
      setSummary(r.summary);
      setChecklist(r.checklist);
      setCanClose(r.canClose);
      setAlreadyClosed(r.alreadyClosed);
      setBlockingReasons(r.blockingReasons);
    } catch { setProject(null); setSummary(null); setChecklist(null); }
    setLoadingSummary(false);
  }, [userId]);

  useEffect(() => {
    if (selectedId) loadClosure(selectedId);
  }, [selectedId, loadClosure]);

  const handleSelectProject = (pid: string) => {
    setSelectedId(pid);
    setSearchParams(pid ? { projectId: pid } : {});
  };

  const handleClose = async (force: boolean) => {
    if (!userId || !selectedId) return;
    setActionLoading(true);
    try {
      const r = await closeConstructionProject(userId, selectedId, { motivoCierre, forzarCierre: force });
      setProject(r.project);
      setSummary(r.summary);
      setAlreadyClosed(true);
      setCanClose(false);
      setCloseModalOpen(false);
      setMotivoCierre('');
      loadProjects();
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handleReopen = async () => {
    if (!userId || !selectedId || !motivoReapertura.trim()) return;
    setActionLoading(true);
    try {
      const r = await reopenConstructionProject(userId, selectedId, motivoReapertura);
      setProject(r.project);
      setAlreadyClosed(false);
      setReopenModalOpen(false);
      setMotivoReapertura('');
      loadClosure(selectedId);
      loadProjects();
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const closureCandidates = useMemo(() => {
    let list = projects;
    if (filterState === 'finalizada') list = list.filter(p => p.estado === 'finalizada');
    else if (filterState === 'cerrada') list = list.filter(p => p.estado === 'cerrada');
    else list = list.filter(p => ['finalizada', 'cerrada'].includes(p.estado));
    if (filterSearch) list = list.filter(p => `${p.nombre} ${p.ubicacion} ${p.clienteNombre}`.toLowerCase().includes(filterSearch.toLowerCase()));
    return list;
  }, [projects, filterSearch, filterState]);

  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const toggleSection = (s: CheckSection) => setExpanded(prev => ({ ...prev, [s]: !prev[s] }));

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';

  if (loading) return <Layout title="Cierre de Obra"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;

  return (
    <Layout title="Cierre de Obra">
      <div className="space-y-6">

        {/* ── Selector de obra ─────────────────────────────────────────── */}
        {!selectedId && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="text" placeholder="Buscar obra..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select value={filterState} onChange={e => setFilterState(e.target.value)} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
                  <option value="all">Finalizadas + Cerradas</option>
                  <option value="finalizada">Solo finalizadas</option>
                  <option value="cerrada">Solo cerradas</option>
                </select>
              </div>
            </div>

            {closureCandidates.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                <Lock className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No hay obras disponibles para cierre</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Las obras deben estar en estado "Finalizada" para poder cerrarlas</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {closureCandidates.map(p => {
                  const cfg = ESTADO_OBRA_CONFIG[p.estado] || ESTADO_OBRA_CONFIG.finalizada;
                  const isClosed = p.estado === 'cerrada';
                  return (
                    <button key={p._id} onClick={() => handleSelectProject(p._id)} className={`text-left bg-white dark:bg-gray-800 rounded-2xl border-2 p-5 transition-all hover:shadow-lg ${isClosed ? 'border-gray-300 dark:border-gray-600 opacity-75' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-gray-400" />
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{p.nombre}</h3>
                        </div>
                        {isClosed ? <Lock className="w-4 h-4 text-gray-400 shrink-0" /> : <Unlock className="w-4 h-4 text-amber-500 shrink-0" />}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{p.ubicacion || 'Sin ubicacion'}</p>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Vista de cierre con obra seleccionada ────────────────────── */}
        {selectedId && (
          <>
            {/* Back button */}
            <button onClick={() => { setSelectedId(''); setSearchParams({}); setProject(null); setSummary(null); }} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 mb-2">
              <ChevronUp className="w-4 h-4 rotate-[-90deg]" /> Volver al listado
            </button>

            {loadingSummary ? (
              <div className="flex items-center justify-center py-20 text-gray-400">Cargando resumen de cierre...</div>
            ) : !project ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No se pudo cargar el proyecto</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  {alreadyClosed && (
                    <div className="flex items-center gap-3 mb-4 p-4 rounded-xl bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                      <Lock className="w-5 h-5 text-gray-500 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Obra cerrada y archivada</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Cerrada el {project.fechaCierre ? new Date(project.fechaCierre).toLocaleDateString('es-ES') : '—'} por {project.cerradoPorNombre || '—'}
                          {project.motivoCierre ? ` — "${project.motivoCierre}"` : ''}
                        </p>
                      </div>
                      {isManager && (
                        <button onClick={() => setReopenModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors">
                          <Unlock className="w-4 h-4" /> Reabrir
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <Building2 className="w-6 h-6 text-gray-400" />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{project.nombre}</h2>
                        {(() => { const c = ESTADO_OBRA_CONFIG[project.estado] || ESTADO_OBRA_CONFIG.finalizada; return <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${c.bg} ${c.color}`}>{c.label}</span>; })()}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{project.tipoObra} &middot; {project.ubicacion} &middot; {project.clienteNombre || 'Sin cliente'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <Printer className="w-4 h-4" /> Imprimir
                      </button>
                      {!alreadyClosed && isManager && (
                        <button onClick={() => setCloseModalOpen(true)} className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors">
                          <Lock className="w-4 h-4" /> Cerrar obra
                        </button>
                      )}
                    </div>
                  </div>

                  {!isManager && !alreadyClosed && (
                    <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                      <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                      <p className="text-sm text-amber-700 dark:text-amber-400">Solo los gerentes pueden gestionar el cierre de obras</p>
                    </div>
                  )}
                </div>

                {/* ── Checklist Pre-Cierre ─────────────────────────────────── */}
                {checklist && !alreadyClosed && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Checklist Pre-Cierre</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ChecklistCard
                        title="Cobros pendientes" icon={<Wallet className="w-5 h-5" />}
                        items={checklist.cobrosPendientes} count={checklist.cobrosPendientes.length}
                        ok={checklist.cobrosPendientes.length === 0}
                        expanded={expanded.cobros} onToggle={() => toggleSection('cobros')}
                        renderItem={(item) => <span>{item.concepto} — <strong>{fmt(item.importe || 0)}</strong></span>}
                      />
                      <ChecklistCard
                        title="Incidencias abiertas" icon={<AlertTriangle className="w-5 h-5" />}
                        items={checklist.incidenciasAbiertas} count={checklist.incidenciasAbiertas.length}
                        ok={checklist.incidenciasAbiertas.length === 0}
                        expanded={expanded.incidencias} onToggle={() => toggleSection('incidencias')}
                        renderItem={(item) => <span>{item.referencia || item.titulo} — <span className="capitalize">{item.gravedad}</span></span>}
                      />
                      <ChecklistCard
                        title="Documentos pendientes" icon={<FileText className="w-5 h-5" />}
                        items={checklist.documentosPendientes} count={checklist.documentosPendientes.length}
                        ok={checklist.documentosPendientes.length === 0}
                        expanded={expanded.documentos} onToggle={() => toggleSection('documentos')}
                        renderItem={(item) => <span>{item.nombre} <span className="text-gray-400">({item.categoria})</span></span>}
                      />
                      <ChecklistCard
                        title="Tareas pendientes" icon={<ListTodo className="w-5 h-5" />}
                        items={checklist.tareasPendientes} count={checklist.tareasPendientes.length}
                        ok={checklist.tareasPendientes.length === 0}
                        expanded={expanded.tareas} onToggle={() => toggleSection('tareas')}
                        renderItem={(item) => <span>{item.titulo} — {item.trabajadorNombre || 'Sin asignar'}</span>}
                      />
                    </div>
                    {blockingReasons.length > 0 && (
                      <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                        <div className="flex items-center gap-2 mb-2">
                          <Info className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Pendientes antes del cierre</span>
                        </div>
                        <ul className="space-y-1">
                          {blockingReasons.map((r, i) => <li key={i} className="text-sm text-amber-600 dark:text-amber-400">&bull; {r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Resumen Economico Final ──────────────────────────────── */}
                {summary && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
                      {alreadyClosed ? 'Resumen Economico del Cierre' : 'Resumen Economico Actual'}
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <SummaryCard label="Presupuesto inicial" value={fmt(summary.presupuestoInicial)} icon={<Wallet className="w-5 h-5" />} color="blue" />
                      <SummaryCard label="Total cobrado" value={fmt(summary.totalCobrado)} icon={<TrendingUp className="w-5 h-5" />} color="green" />
                      <SummaryCard label="Pendiente de cobro" value={fmt(summary.pendienteCobro)} icon={<CreditCard className="w-5 h-5" />} color={summary.pendienteCobro > 0 ? 'red' : 'green'} />
                      <SummaryCard label="Coste acumulado" value={fmt(summary.totalPagado)} icon={<TrendingDown className="w-5 h-5" />} color="gray" />
                      <SummaryCard label="Margen previsto" value={pct(summary.margenPrevisto)} icon={<TrendingUp className="w-5 h-5" />} color="blue" />
                      <SummaryCard label="Margen real" value={pct(summary.margenReal)} icon={<TrendingUp className="w-5 h-5" />} color={summary.margenReal >= summary.margenPrevisto ? 'green' : 'amber'} />
                      <SummaryCard label="Horas totales" value={`${summary.horasTotales.toLocaleString('es-ES')} h`} icon={<Clock className="w-5 h-5" />} color="purple" />
                      <SummaryCard label="Incidencias" value={`${summary.incidencias.total} (${summary.incidencias.abiertas} abiertas)`} icon={<AlertTriangle className="w-5 h-5" />} color={summary.incidencias.abiertas > 0 ? 'amber' : 'green'} />
                    </div>

                    {/* Detail tables */}
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Desglose economico</h4>
                        <table className="w-full text-sm">
                          <tbody>
                            {[
                              ['Presupuesto total', fmt(summary.presupuestoInicial)],
                              ['Cobrado', fmt(summary.totalCobrado)],
                              ['Pendiente de cobro', fmt(summary.pendienteCobro)],
                              ['Coste real (partes)', fmt(summary.totalPagado)],
                              ['Margen previsto', pct(summary.margenPrevisto)],
                              ['Margen real', pct(summary.margenReal)],
                            ].map(([label, val], i) => (
                              <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                                <td className="py-2.5 text-gray-500 dark:text-gray-400">{label}</td>
                                <td className="py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100">{val}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Desglose operativo</h4>
                        <table className="w-full text-sm">
                          <tbody>
                            {[
                              ['Horas totales', `${summary.horasTotales.toLocaleString('es-ES')} h`],
                              ['Tareas totales', String(summary.tareas.total)],
                              ['Tareas completadas', String(summary.tareas.completadas)],
                              ['Tareas pendientes', String(summary.tareas.pendientes)],
                              ['Incidencias totales', String(summary.incidencias.total)],
                              ['Incidencias resueltas', String(summary.incidencias.resueltas + summary.incidencias.cerradas)],
                            ].map(([label, val], i) => (
                              <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                                <td className="py-2.5 text-gray-500 dark:text-gray-400">{label}</td>
                                <td className="py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100">{val}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal: Cerrar obra ──────────────────────────────────────────── */}
      {closeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setCloseModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Lock className="w-5 h-5" /> Cerrar obra</h2>
              <button onClick={() => setCloseModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              {blockingReasons.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">Attencion: Hay pendientes</p>
                  <ul className="space-y-1">
                    {blockingReasons.map((r, i) => <li key={i} className="text-sm text-amber-600 dark:text-amber-400">&bull; {r}</li>)}
                  </ul>
                  <p className="text-xs text-amber-500 mt-2">Puedes forzar el cierre, pero quedar registrado.</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Motivo del cierre (opcional)</label>
                <textarea className={inputClass} rows={3} value={motivoCierre} onChange={e => setMotivoCierre(e.target.value)} placeholder="Ej: Obra finalizada correctamente..." />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setCloseModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button disabled={actionLoading} onClick={() => handleClose(blockingReasons.length > 0)} className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors disabled:opacity-50">
                {actionLoading ? 'Cerrando...' : blockingReasons.length > 0 ? 'Forzar cierre' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Reabrir obra ─────────────────────────────────────────── */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setReopenModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Unlock className="w-5 h-5" /> Reabrir obra</h2>
              <button onClick={() => setReopenModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                <p className="text-sm text-blue-700 dark:text-blue-400">La obra volvera al estado "Finalizada" y se desbloqueara la edicion operativa.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Motivo de reapertura *</label>
                <textarea className={inputClass} rows={3} value={motivoReapertura} onChange={e => setMotivoReapertura(e.target.value)} placeholder="Ej: Error en documentacion, cobro adicional..." required />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setReopenModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button disabled={actionLoading || !motivoReapertura.trim()} onClick={handleReopen} className="flex-1 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50">
                {actionLoading ? 'Reabriendo...' : 'Confirmar reapertura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

const colorMap: Record<string, { icon: string; bg: string; text: string }> = {
  blue:   { icon: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-300' },
  green:  { icon: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20',  text: 'text-green-700 dark:text-green-300' },
  red:    { icon: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20',      text: 'text-red-700 dark:text-red-300' },
  amber:  { icon: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-900/20',  text: 'text-amber-700 dark:text-amber-300' },
  purple: { icon: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300' },
  gray:   { icon: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-50 dark:bg-gray-900/20',    text: 'text-gray-700 dark:text-gray-300' },
};

function SummaryCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const c = colorMap[color] || colorMap.gray;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-xl ${c.bg}`}><span className={c.icon}>{icon}</span></div>
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${c.text}`}>{value}</p>
    </div>
  );
}

function ChecklistCard({ title, icon, items, count, ok, expanded, onToggle, renderItem }: {
  title: string; icon: React.ReactNode; items: ClosureChecklistItem[]; count: number;
  ok: boolean; expanded: boolean; onToggle: () => void;
  renderItem: (item: ClosureChecklistItem) => React.ReactNode;
}) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-5 transition-colors ${ok ? 'border-green-200 dark:border-green-800' : 'border-amber-200 dark:border-amber-800'}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${ok ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600'}`}>{icon}</div>
          <div className="text-left">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</p>
            <p className={`text-xs font-medium ${ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {ok ? 'Todo OK' : `${count} pendiente(s)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ok ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
          {count > 0 && (expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
        </div>
      </button>
      {expanded && items.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
          {items.map((item, i) => (
            <li key={item._id || i} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
