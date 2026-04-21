import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  ChevronDown,
  ChevronUp,
  Euro,
  Filter,
  HardHat,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useConstructionSSE } from '../../hooks/useConstructionSSE';
import {
  getConstructionOpsCenter,
  type ConstructionOpsAlert,
  type ConstructionOpsCenterData,
} from '../../lib/constructionApi';

function num(n: unknown): number {
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

export function ConstructionOpsCenter() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.user_id || user?.id || null;

  const [data, setData] = useState<ConstructionOpsCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [obraId, setObraId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [estado, setEstado] = useState('');
  const [trabajadorId, setTrabajadorId] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await getConstructionOpsCenter(userId, {
        obraId: obraId || undefined,
        clienteId: clienteId || undefined,
        estado: estado || undefined,
        trabajadorId: trabajadorId || undefined,
        dateFrom,
        dateTo,
      });
      setData(r);
    } catch (e) {
      toast.error((e as Error)?.message || 'No se pudo cargar el centro operativo');
    } finally {
      setLoading(false);
    }
  }, [userId, obraId, clienteId, estado, trabajadorId, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSse = useCallback(() => {
    void load();
  }, [load]);

  useConstructionSSE({
    userId,
    token: token || null,
    businessId: currentBusiness?.id || null,
    enabled: !!userId,
    onConstructionUpdate: onSse,
  });

  const resumen = data?.resumen || {};
  const alertas = data?.alertas || [];
  const obras = data?.obras || [];
  const incidencias = data?.incidencias || [];

  const kpis = useMemo(
    () => [
      {
        label: 'Obras activas',
        value: String(num(resumen.obrasActivas)),
        icon: HardHat,
        tone: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-950/30',
      },
      {
        label: 'Cobrado (acept.)',
        value: eur(num(resumen.totalCobrado)),
        icon: Euro,
        tone: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      },
      {
        label: 'Pendiente cobro',
        value: eur(num(resumen.totalPendienteCobro)),
        icon: Activity,
        tone: 'text-sky-600 dark:text-sky-400',
        bg: 'bg-sky-50 dark:bg-sky-950/30',
      },
      {
        label: 'Incidencias abiertas',
        value: String(num(resumen.totalIncidenciasAbiertas)),
        icon: AlertTriangle,
        tone: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-950/30',
      },
    ],
    [resumen]
  );

  const activeFilterCount = [obraId, clienteId, estado, trabajadorId].filter(Boolean).length;

  const clearFilters = () => {
    setObraId('');
    setClienteId('');
    setEstado('');
    setTrabajadorId('');
  };

  const sel =
    'px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500/40 outline-none';

  return (
    <Layout title="Centro operativo — Construcción">
      <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Centro operativo</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Vista unificada de obras, cobros, incidencias y documentación
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </header>

        {/* Filtros */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 md:mb-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Filtros
            </span>
            <div className="flex md:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40"
              >
                <Filter className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full text-xs font-bold">
                    {activeFilterCount}
                  </span>
                )}
                {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className={`${filtersOpen ? 'block' : 'hidden'} md:block`}>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Obra (id)</label>
                <input
                  className={sel}
                  placeholder="_id CouchDB"
                  value={obraId}
                  onChange={(e) => setObraId(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Cliente (id)</label>
                <input
                  className={sel}
                  placeholder="clienteId"
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Estado obra</label>
                <select className={sel} value={estado} onChange={(e) => setEstado(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="planificación">Planificación</option>
                  <option value="en_obra">En obra</option>
                  <option value="pausada">Pausada</option>
                  <option value="finalizada">Finalizada</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Trabajador (id)</label>
                <input
                  className={sel}
                  value={trabajadorId}
                  onChange={(e) => setTrabajadorId(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Desde</label>
                <input
                  type="date"
                  className={sel}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Hasta</label>
                <input
                  type="date"
                  className={sel}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  <X className="w-3.5 h-3.5" /> Limpiar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div
                key={k.label}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${k.bg}`}>
                    <Icon className={`w-5 h-5 ${k.tone}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{k.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{k.label}</p>
              </div>
            );
          })}
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <OpsAlertsPanel alerts={alertas} onNavigate={(r) => navigate(r)} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-600" />
              Obras ({obras.length})
            </h2>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-700">
                    <th className="pb-2 pr-3">Nombre</th>
                    <th className="pb-2 pr-3">Estado</th>
                    <th className="pb-2 pr-3">Avance</th>
                    <th className="pb-2">Incid.</th>
                  </tr>
                </thead>
                <tbody>
                  {obras.slice(0, 20).map((o) => (
                    <tr
                      key={String(o._id)}
                      onClick={() => navigate(`/saas/construction-projects/${String(o._id)}`)}
                      className="border-b border-gray-50 dark:border-gray-700/80 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <td className="py-2 pr-3 font-medium text-gray-900 dark:text-gray-100 hover:text-amber-600 dark:hover:text-amber-400">
                        {String(o.nombre || '—')}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">{String(o.estado || '—')}</td>
                      <td className="py-2 pr-3">{num(o.progreso)}%</td>
                      <td className="py-2">{num(o.incidenciasAbiertas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!obras.length && !loading && (
                <p className="text-sm text-gray-500 py-6 text-center">No hay obras con los filtros actuales.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Incidencias recientes
            </h2>
            <ul className="space-y-3 max-h-80 overflow-y-auto">
              {incidencias.map((i, idx) => (
                <li
                  key={String(i._id || idx)}
                  className="text-sm border-b border-gray-100 dark:border-gray-700/80 pb-3 last:border-0"
                >
                  <p className="font-medium text-gray-900 dark:text-gray-100">{String(i.titulo || '—')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{String(i.obraNombre || '')}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {String(i.gravedad || '')} · {String(i.estado || '')}
                  </p>
                </li>
              ))}
            </ul>
            {!incidencias.length && !loading && (
              <p className="text-sm text-gray-500 py-6 text-center">Sin incidencias abiertas listadas.</p>
            )}
          </section>
        </div>

        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-600" />
            Trabajadores activos
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="pb-2 pr-3">Nombre</th>
                  <th className="pb-2 pr-3">Gremio</th>
                  <th className="pb-2 pr-3">Obra</th>
                  <th className="pb-2">Horas hoy</th>
                </tr>
              </thead>
              <tbody>
                {(data?.trabajadores || []).slice(0, 24).map((w) => (
                  <tr key={String(w._id)} className="border-b border-gray-50 dark:border-gray-700/80">
                    <td className="py-2 pr-3 font-medium">{String(w.nombre || '—')}</td>
                    <td className="py-2 pr-3">{String(w.gremio || '—')}</td>
                    <td className="py-2 pr-3">{String(w.obraNombre || '—')}</td>
                    <td className="py-2">{num(w.horasHoy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {data?.generatedAt && (
          <p className="text-xs text-gray-400 text-center">
            Datos generados: {new Date(data.generatedAt).toLocaleString('es-ES')}
          </p>
        )}
      </div>
    </Layout>
  );
}

function OpsAlertsPanel({
  alerts,
  onNavigate,
}: {
  alerts: ConstructionOpsAlert[];
  onNavigate: (path: string) => void;
}) {
  const [exp, setExp] = useState(true);
  const hasErr = alerts.some((a) => a.gravedad === 'error');
  const bg = hasErr
    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';

  return (
    <div className={`rounded-xl border-2 ${bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExp(!exp)}
        className="w-full px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Bell className={`w-4 h-4 ${hasErr ? 'text-red-600' : 'text-amber-600'}`} />
          <span
            className={`text-sm font-bold ${hasErr ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}`}
          >
            {alerts.length} alerta{alerts.length !== 1 ? 's' : ''}
          </span>
        </div>
        {exp ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {exp && (
        <div className="px-4 pb-3 space-y-2">
          {alerts.slice(0, 12).map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700"
            >
              <AlertTriangle
                className={`w-4 h-4 mt-0.5 shrink-0 ${a.gravedad === 'error' ? 'text-red-500' : 'text-amber-500'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{a.titulo}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{a.mensaje}</p>
              </div>
              {a.ruta ? (
                <button
                  type="button"
                  onClick={() => onNavigate(a.ruta!)}
                  className="px-2 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg shrink-0"
                >
                  Ir
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
