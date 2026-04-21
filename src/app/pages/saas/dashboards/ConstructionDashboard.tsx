import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import {
  HardHat,
  Wallet,
  LineChart,
  AlertTriangle,
  Activity,
  Milestone,
  Truck,
  Users,
  LayoutGrid,
  FolderKanban,
  ClipboardCheck,
  Clock,
  Euro,
  BarChart3,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Lock,
  FileX,
  ArrowRight,
} from 'lucide-react';
import {
  listConstructionProjects, listDailyReports, listConstructionIncidents,
  getConstructionAlerts, listConstructionCollections, getPaymentsSummary,
  getObraDocumentStats, getConstructionOpsCenter,
} from '../../../lib/constructionApi';
import type {
  ConstructionProject, ConstructionDailyReport, ConstructionIncident, ConstructionAlert,
  ConstructionCollection, PaymentGlobalSummary, ObraDocStats, ConstructionOpsCenterData,
} from '../../../lib/constructionApi';

type ConstructionDashboardProps = { onSelectGeneral?: () => void };

export function ConstructionDashboard({ onSelectGeneral }: ConstructionDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const businessName = user?.companyName?.trim() || 'Mi empresa';

  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [reports, setReports] = useState<ConstructionDailyReport[]>([]);
  const [incidents, setIncidents] = useState<ConstructionIncident[]>([]);
  const [alerts, setAlerts] = useState<ConstructionAlert[]>([]);
  const [collections, setCollections] = useState<ConstructionCollection[]>([]);
  const [paymentsSummary, setPaymentsSummary] = useState<PaymentGlobalSummary | null>(null);
  const [docStats, setDocStats] = useState<ObraDocStats | null>(null);
  const [opsData, setOpsData] = useState<ConstructionOpsCenterData | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const d0 = new Date();
      const monthStart = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-01`;
      const today = d0.toISOString().slice(0, 10);
      const [p, r, inc, a, col, ops] = await Promise.all([
        listConstructionProjects(userId),
        listDailyReports(userId),
        listConstructionIncidents(userId),
        getConstructionAlerts(userId),
        listConstructionCollections(userId),
        getConstructionOpsCenter(userId, { dateFrom: monthStart, dateTo: today }).catch(() => null),
      ]);
      setProjects(p); setReports(r); setIncidents(inc); setAlerts(a); setCollections(col);
      setOpsData(ops && ops.ok ? ops : null);
      try { const ps = await getPaymentsSummary(userId); setPaymentsSummary(ps); } catch { /* */ }
      try { const ds = await getObraDocumentStats(userId); setDocStats(ds); } catch { /* */ }
    } catch { /* */ }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const proyectosActivos = projects.filter(p => p.estado === 'en_obra').length;
  const reportsMes = reports.filter(r => r.fecha.startsWith(mesActual));
  const horasMes = reportsMes.reduce((s, r) => s + r.horasTrabajadas, 0);
  const costeMes = reportsMes.reduce((s, r) => s + r.costeTotal, 0);
  const pendientesValidacion = reports.filter(r => r.estado === 'enviado').length;
  const incAbiertas = incidents.filter(i => i.estado === 'abierta').length;
  const avanceMedio = projects.length > 0 ? Math.round(projects.reduce((s, p) => s + (p.progreso || 0), 0) / projects.length) : 0;

  const resumen = opsData?.resumen || {};
  const num = (k: string, fallback: number) => {
    const v = resumen[k];
    return typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
  };
  const kpiObrasActivas = num('obrasActivas', proyectosActivos);
  const kpiAvanceMedio = num('avanceMedioObras', avanceMedio);
  const kpiIncidenciasAbiertas = num('totalIncidenciasAbiertas', incAbiertas);

  const cobrosStats = useMemo(() => {
    const saldoPendiente = collections.reduce((s, c) => s + c.saldoPendiente, 0);
    const totalCobrado = collections.reduce((s, c) => s + c.importeCobrado, 0);
    const vencidos = collections.filter(c => c.estadoCobro === 'vencido').length;
    const today = new Date().toISOString().slice(0, 10);
    const sevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const proximos = collections.flatMap(c =>
      (c.entregas || []).filter(e => e.estado === 'pendiente' && e.fechaPrevista >= today && e.fechaPrevista <= sevenDays)
        .map(e => ({ ...e, obraNombre: c.obraNombre, referencia: c.referencia, collectionId: c._id }))
    ).sort((a, b) => a.fechaPrevista.localeCompare(b.fechaPrevista)).slice(0, 5);
    const vencidosList = collections.flatMap(c =>
      (c.entregas || []).filter(e => e.estado !== 'cobrado' && e.fechaPrevista && e.fechaPrevista < today)
        .map(e => ({ ...e, obraNombre: c.obraNombre, referencia: c.referencia }))
    ).slice(0, 5);
    return { saldoPendiente, totalCobrado, vencidos, proximos, vencidosList };
  }, [collections]);

  const recentReports = useMemo(() =>
    [...reports].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [reports]
  );

  const activities = useMemo(
    () => recentReports.map(r => ({
      id: r._id,
      icon: ClipboardCheck,
      tone: 'text-blue-500',
      title: `Parte ${r.referencia} — ${r.obraNombre || 'Sin obra'}`,
      meta: `${r.trabajadorNombre || 'Sin trabajador'} · ${r.horasTrabajadas}h · ${r.fecha}`,
    })),
    [recentReports]
  );

  const partesPendKpi = num('totalPartesPendientes', pendientesValidacion);

  const monthSummary = useMemo(() => {
    const lines: string[] = [];
    lines.push(`${reportsMes.length} partes registrados este mes`);
    lines.push(`${horasMes.toFixed(1)} horas totales trabajadas`);
    lines.push(`${costeMes.toFixed(0)} € en mano de obra`);
    if (partesPendKpi > 0) lines.push(`${partesPendKpi} partes pendientes de validación`);
    if (kpiIncidenciasAbiertas > 0) {
      lines.push(`${kpiIncidenciasAbiertas} incidencia${kpiIncidenciasAbiertas !== 1 ? 's' : ''} abierta${kpiIncidenciasAbiertas !== 1 ? 's' : ''} (según centro operativo)`);
    }
    return { title: 'Resumen del mes', lines };
  }, [reportsMes, horasMes, costeMes, partesPendKpi, kpiIncidenciasAbiertas]);

  const closureAlerts = useMemo(() => {
    const alertList: { id: string; icon: typeof AlertTriangle; color: string; bg: string; message: string; projectId: string }[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    for (const p of projects) {
      if (p.estado === 'finalizada') {
        const projIncidents = incidents.filter(i => i.obraId === p._id && !['cerrada', 'resuelta'].includes(i.estado));
        if (projIncidents.length > 0) {
          alertList.push({ id: `fin-inc-${p._id}`, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', message: `"${p.nombre}" finalizada con ${projIncidents.length} incidencia(s) abierta(s)`, projectId: p._id });
        }
        if (p.updatedAt && p.updatedAt < sevenDaysAgo) {
          alertList.push({ id: `fin-old-${p._id}`, icon: Clock, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', message: `"${p.nombre}" lleva más de 7 días finalizada sin cerrar`, projectId: p._id });
        }
      }
    }
    return alertList.slice(0, 5);
  }, [projects, incidents]);

  return (
    <Layout title="Dashboard">
      <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{businessName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Panel del sector construcción
              {opsData?.generatedAt ? (
                <span className="block text-xs mt-0.5 text-gray-400 dark:text-gray-500">
                  KPIs agregados (centro operativo): {new Date(opsData.generatedAt).toLocaleString('es-ES')}
                </span>
              ) : null}
            </p>
          </div>
          {onSelectGeneral ? (
            <button
              type="button"
              onClick={() => onSelectGeneral()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              Vista general
            </button>
          ) : null}
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="p-2 rounded-xl bg-yellow-50 dark:bg-yellow-900/30 w-fit mb-2">
              <HardHat className="w-5 h-5 text-yellow-700 dark:text-yellow-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpiObrasActivas}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Obras activas</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 w-fit mb-2">
              <ClipboardCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportsMes.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Partes (mes)</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-900/30 w-fit mb-2">
              <Clock className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{horasMes.toFixed(0)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Horas (mes)</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 w-fit mb-2">
              <Euro className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{costeMes.toFixed(0)} €</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Coste (mes)</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 w-fit mb-2">
              <LineChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpiAvanceMedio}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Avance medio</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/30 w-fit mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpiIncidenciasAbiertas}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Incidencias abiertas</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-2">
            Acciones rápidas
          </span>
          <button
            type="button"
            onClick={() => navigate('/saas/vertical/construccion')}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500 px-3 py-2 text-sm font-medium text-white transition-colors"
          >
            <Activity className="w-4 h-4" />
            Centro operativo
          </button>
          <button
            type="button"
            onClick={() => navigate('/saas/construction-projects')}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400 px-3 py-2 text-sm font-medium text-white transition-colors"
          >
            <FolderKanban className="w-4 h-4" />
            Nuevo proyecto
          </button>
          <button
            type="button"
            onClick={() => navigate('/saas/construction-execution')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 transition-colors"
          >
            <LineChart className="w-4 h-4" />
            Registrar avance
          </button>
          <button
            type="button"
            onClick={() => navigate('/saas/construction-reports')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Informes y rentabilidad
          </button>
        </div>

        {/* Cobros Widget */}
        {collections.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total cobrado</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{cobrosStats.totalCobrado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </div>
            <div className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${cobrosStats.saldoPendiente > 0 ? 'border-amber-200 dark:border-amber-800' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${cobrosStats.saldoPendiente > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-700'}`}>
                  <CalendarClock className={`w-5 h-5 ${cobrosStats.saldoPendiente > 0 ? 'text-amber-600' : 'text-gray-500'}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Saldo pendiente</p>
                  <p className={`text-lg font-bold ${cobrosStats.saldoPendiente > 0 ? 'text-amber-600' : 'text-gray-900 dark:text-white'}`}>
                    {cobrosStats.saldoPendiente.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>
            <div className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${cobrosStats.vencidos > 0 ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${cobrosStats.vencidos > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-700'}`}>
                  <AlertTriangle className={`w-5 h-5 ${cobrosStats.vencidos > 0 ? 'text-red-600' : 'text-gray-500'}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Cobros vencidos</p>
                  <p className={`text-lg font-bold ${cobrosStats.vencidos > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{cobrosStats.vencidos}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pagos internos Widget */}
        {paymentsSummary && paymentsSummary.totalLineas > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Banknote className="w-4 h-4 text-gray-400" /> Pagos internos</h3>
              <button onClick={() => navigate('/saas/construction-payments')} className="text-xs text-blue-600 hover:underline">Ver todo →</button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500">Pactado</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{paymentsSummary.totalPactado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pagado</p>
                <p className="text-lg font-bold text-emerald-600">{paymentsSummary.totalPagado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pendiente</p>
                <p className={`text-lg font-bold ${paymentsSummary.totalPendiente > 0 ? 'text-amber-600' : 'text-gray-900 dark:text-white'}`}>{paymentsSummary.totalPendiente.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</p>
              </div>
            </div>
            {paymentsSummary.lineasVencidas > 0 && (
              <div className="mt-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-600 font-medium text-center">
                ⚠ {paymentsSummary.lineasVencidas} línea(s) de pago vencida(s)
              </div>
            )}
          </div>
        )}

        {/* Closure Alerts */}
        {closureAlerts.length > 0 && (
          <div className="space-y-2">
            {closureAlerts.map(a => {
              const Icon = a.icon;
              return (
                <button key={a.id} onClick={() => navigate(`/saas/construction-closure?projectId=${a.projectId}`)} className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all hover:shadow-md ${a.bg}`}>
                  <Icon className={`w-5 h-5 shrink-0 ${a.color}`} />
                  <span className={`text-sm font-medium flex-1 ${a.color}`}>{a.message}</span>
                  <ArrowRight className={`w-4 h-4 shrink-0 ${a.color}`} />
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Próximos cobros */}
          {cobrosStats.proximos.length > 0 && (
            <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                Próximos cobros
              </h2>
              <ul className="space-y-3">
                {cobrosStats.proximos.map((e, i) => (
                  <li key={`prox-${i}`} className="flex justify-between items-center text-sm border-b border-gray-100 dark:border-gray-700/80 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{e.concepto}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{e.obraNombre}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 dark:text-white">{e.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                      <p className="text-xs text-gray-500">{e.fechaPrevista}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => navigate('/saas/construction-collections')} className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                Ver todos los cobros →
              </button>
            </section>
          )}

          {/* Cobros vencidos */}
          {cobrosStats.vencidosList.length > 0 && (
            <section className="rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 p-5">
              <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Cobros vencidos
              </h2>
              <ul className="space-y-3">
                {cobrosStats.vencidosList.map((e, i) => (
                  <li key={`venc-${i}`} className="flex justify-between items-center text-sm border-b border-red-50 dark:border-red-900/30 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{e.concepto}</p>
                      <p className="text-xs text-gray-500">{e.obraNombre}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{e.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                      <p className="text-xs text-red-500">Vencido {e.fechaPrevista}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Documentation widget */}
        {docStats && (docStats.obligatoriosFaltantes > 0 || docStats.firmasPendientes > 0 || docStats.licenciasCaducadas > 0 || docStats.total > 0) && (
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileX className="w-4 h-4 text-blue-600" />
                Documentación de obras
              </h2>
              <button onClick={() => navigate('/saas/construction-documents')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                Ver todo <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{docStats.total}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total docs</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${docStats.obligatoriosFaltantes > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
                <p className={`text-xl font-bold ${docStats.obligatoriosFaltantes > 0 ? 'text-red-600' : 'text-green-600'}`}>{docStats.obligatoriosFaltantes}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Obligatorios faltantes</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${docStats.firmasPendientes > 0 ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
                <p className={`text-xl font-bold ${docStats.firmasPendientes > 0 ? 'text-orange-600' : 'text-green-600'}`}>{docStats.firmasPendientes}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Firmas pendientes</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${docStats.licenciasCaducadas > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
                <p className={`text-xl font-bold ${docStats.licenciasCaducadas > 0 ? 'text-red-600' : 'text-green-600'}`}>{docStats.licenciasCaducadas}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Licencias caducadas</p>
              </div>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              Actividad reciente
            </h2>
            <ul className="space-y-3">
              {activities.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.id}
                    className="flex gap-3 text-sm border-b border-gray-100 dark:border-gray-700/80 pb-3 last:border-0 last:pb-0"
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${item.tone}`} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.meta}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <HardHat className="w-4 h-4 text-amber-600" />
              {monthSummary.title}
            </h2>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              {monthSummary.lines.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <Milestone className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
