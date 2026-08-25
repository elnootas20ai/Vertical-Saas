import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Archive,
  Briefcase,
  Building2,
  CalendarClock,
  Clock,
  Gavel,
  Receipt,
  RefreshCw,
  Scale,
  Timer,
  UserPlus,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { listWorkCenters, type WorkCenter } from '../../lib/workCentersApi';
import { formatDateEs } from '../../lib/formatDateEs';
import {
  buildLawyerDemoBundle,
  isLawyerDemoViewer,
  withLawyerDemoList,
} from '../../lib/lawyerOpsDemo';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

interface Lead extends VerticalEntity {
  nombre?: string;
  estado: string;
  urgencia?: string;
  fechaConsulta?: string;
}

interface Case extends VerticalEntity {
  estado: string;
  expediente: string;
  cliente: string;
  fechaApertura?: string;
  urgencia?: string;
  abogado?: string;
}

interface Deadline extends VerticalEntity {
  fechaLimite: string;
  estado: string;
  caso: string;
  tipoPlazo?: string;
  descripcion?: string;
  diasRestantes?: number;
  prioridad?: string;
}

interface Hearing extends VerticalEntity {
  caso: string;
  cliente: string;
  juzgado: string;
  fecha: string;
  hora: string;
  estado: string;
  tipo?: string;
}

interface Invoice extends VerticalEntity {
  cliente: string;
  caso: string;
  importe: number;
  estado: string;
  numero?: string;
}

type PipelineKey = 'leads' | 'abierto' | 'en_tramite' | 'vista_oral' | 'plazos' | 'cobro';

const PIPELINE: Array<{
  key: PipelineKey;
  label: string;
  href: string;
  tone: string;
}> = [
  {
    key: 'leads',
    label: 'Leads',
    href: '/saas/lawyer-captacion',
    tone: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300',
  },
  {
    key: 'abierto',
    label: 'Abiertos',
    href: '/saas/lawyer-cases',
    tone: 'bg-cyan-50 border-cyan-200 text-cyan-800 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-300',
  },
  {
    key: 'en_tramite',
    label: 'En trámite',
    href: '/saas/lawyer-cases',
    tone: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300',
  },
  {
    key: 'vista_oral',
    label: 'Vista oral',
    href: '/saas/lawyer-cases',
    tone: 'bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-300',
  },
  {
    key: 'plazos',
    label: 'Plazos',
    href: '/saas/lawyer-deadlines',
    tone: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300',
  },
  {
    key: 'cobro',
    label: 'Por cobrar',
    href: '/saas/lawyer-billing',
    tone: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300',
  },
];

const QUICK = [
  { label: 'Captación', to: '/saas/lawyer-captacion', icon: UserPlus },
  { label: 'Expedientes', to: '/saas/lawyer-cases', icon: Briefcase },
  { label: 'Gestión', to: '/saas/lawyer-gestion', icon: CalendarClock },
  { label: 'Plazos', to: '/saas/lawyer-deadlines', icon: Timer },
  { label: 'Vistas', to: '/saas/lawyer-hearings', icon: Gavel },
  { label: 'Facturas', to: '/saas/lawyer-billing', icon: Receipt },
  { label: 'Archivo', to: '/saas/lawyer-archivo', icon: Archive },
] as const;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : startOfDay(dt);
}

function daysUntil(fecha: string | undefined, today: Date): number | null {
  const d = parseDay(fecha);
  if (!d) return null;
  const ms = startOfDay(d).getTime() - startOfDay(today).getTime();
  return Math.round(ms / 86_400_000);
}

function formatDaysLabel(days: number | null): string {
  if (days == null) return '—';
  if (days < 0) return `Vencido hace ${Math.abs(days)} d`;
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} d`;
}

function eur(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function LawyerOpsCenter() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const navigate = useNavigate();
  const userId = user?.user_id || user?.id || '';
  const businessName = String(currentBusiness?.name || '').trim() || 'Despacho';

  const leadsApi = useMemo(() => createVerticalApi<Lead>('lawyer', 'leads'), []);
  const casesApi = useMemo(() => createVerticalApi<Case>('lawyer', 'cases'), []);
  const deadlinesApi = useMemo(() => createVerticalApi<Deadline>('lawyer', 'deadlines'), []);
  const hearingsApi = useMemo(() => createVerticalApi<Hearing>('lawyer', 'hearings'), []);
  const billingApi = useMemo(() => createVerticalApi<Invoice>('lawyer', 'billing'), []);

  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [despachos, setDespachos] = useState<WorkCenter[]>([]);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const demo = isLawyerDemoViewer(user?.email) ? buildLawyerDemoBundle(userId) : null;
      const [l, c, d, h, b, w] = await Promise.all([
        leadsApi.list(userId),
        casesApi.list(userId),
        deadlinesApi.list(userId),
        hearingsApi.list(userId),
        billingApi.list(userId),
        listWorkCenters(),
      ]);
      const leadsOut = withLawyerDemoList(l, (demo?.leads || []) as Lead[], user?.email);
      const casesOut = withLawyerDemoList(c, (demo?.cases || []) as Case[], user?.email);
      const deadlinesOut = withLawyerDemoList(d, (demo?.deadlines || []) as Deadline[], user?.email);
      const hearingsOut = withLawyerDemoList(h, (demo?.hearings || []) as Hearing[], user?.email);
      const invoicesOut = withLawyerDemoList(b, (demo?.invoices || []) as Invoice[], user?.email);
      const workCenters = w.filter((x) => x.active !== false);
      const despachosOut =
        workCenters.length > 0 || !demo
          ? workCenters
          : (demo.despachos as WorkCenter[]);
      setLeads(leadsOut);
      setCases(casesOut);
      setDeadlines(deadlinesOut);
      setHearings(hearingsOut);
      setInvoices(invoicesOut);
      setDespachos(despachosOut);
      setHasData(true);
    } finally {
      setLoading(false);
    }
  }, [userId, user?.email, leadsApi, casesApi, deadlinesApi, hearingsApi, billingApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot = useMemo(() => {
    const today = startOfDay(new Date());
    const leadsAbiertos = leads.filter((x) => x.estado !== 'aceptado' && x.estado !== 'descartado');
    const leadsUrgentes = leadsAbiertos.filter((x) => x.urgencia === 'alta');

    const abierto = cases.filter((x) => x.estado === 'abierto');
    const enTramite = cases.filter((x) => x.estado === 'en_tramite');
    const vistaOral = cases.filter((x) => x.estado === 'vista_oral');
    const activos = [...abierto, ...enTramite, ...vistaOral];

    const plazosAbiertos = deadlines
      .filter((x) => x.estado !== 'cumplido' && x.estado !== 'cerrado')
      .map((x) => {
        const computed = daysUntil(x.fechaLimite, today);
        const dias =
          typeof x.diasRestantes === 'number' && !Number.isNaN(x.diasRestantes)
            ? x.diasRestantes
            : computed;
        return { ...x, dias };
      })
      .sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999));

    const plazosVencidos = plazosAbiertos.filter((x) => (x.dias ?? 0) < 0);
    const plazos7d = plazosAbiertos.filter((x) => {
      const d = x.dias;
      return d != null && d >= 0 && d <= 7;
    });

    const vistasProgramadas = hearings
      .filter((x) => x.estado === 'programada' || x.estado === 'aplazada')
      .map((x) => ({ ...x, dias: daysUntil(x.fecha, today) }))
      .sort((a, b) => {
        const fa = `${a.fecha}${a.hora}`;
        const fb = `${b.fecha}${b.hora}`;
        return fa.localeCompare(fb);
      });

    const vistasHoy = vistasProgramadas.filter((x) => x.dias === 0);
    const vistasProximas = vistasProgramadas.filter((x) => x.dias != null && x.dias >= 0 && x.dias <= 14);

    const porCobrar = invoices.filter((x) => x.estado === 'enviada' || x.estado === 'impagada');
    const impagadas = invoices.filter((x) => x.estado === 'impagada');
    const pendienteEuro = porCobrar.reduce((s, x) => s + (Number(x.importe) || 0), 0);

    const alerts: Array<{ id: string; severity: 'danger' | 'warn'; title: string; detail: string; href: string }> = [];
    if (plazosVencidos.length > 0) {
      alerts.push({
        id: 'plazos-vencidos',
        severity: 'danger',
        title: `${plazosVencidos.length} plazo${plazosVencidos.length === 1 ? '' : 's'} vencido${plazosVencidos.length === 1 ? '' : 's'}`,
        detail: plazosVencidos.slice(0, 2).map((p) => `${p.caso} · ${formatDateEs(p.fechaLimite)}`).join(' · '),
        href: '/saas/lawyer-deadlines',
      });
    }
    if (plazos7d.length > 0) {
      alerts.push({
        id: 'plazos-7d',
        severity: 'warn',
        title: `${plazos7d.length} plazo${plazos7d.length === 1 ? '' : 's'} en 7 días`,
        detail: plazos7d.slice(0, 2).map((p) => `${p.caso} · ${formatDaysLabel(p.dias ?? null)}`).join(' · '),
        href: '/saas/lawyer-deadlines',
      });
    }
    if (vistasHoy.length > 0) {
      alerts.push({
        id: 'vistas-hoy',
        severity: 'warn',
        title: `${vistasHoy.length} vista${vistasHoy.length === 1 ? '' : 's'} hoy`,
        detail: vistasHoy.slice(0, 2).map((v) => `${v.caso} · ${v.hora || '—'}`).join(' · '),
        href: '/saas/lawyer-hearings',
      });
    }
    if (impagadas.length > 0) {
      alerts.push({
        id: 'impagadas',
        severity: 'danger',
        title: `${impagadas.length} factura${impagadas.length === 1 ? '' : 's'} impagada${impagadas.length === 1 ? '' : 's'}`,
        detail: eur(impagadas.reduce((s, x) => s + (Number(x.importe) || 0), 0)),
        href: '/saas/lawyer-billing',
      });
    }
    if (leadsUrgentes.length > 0) {
      alerts.push({
        id: 'leads-urgentes',
        severity: 'warn',
        title: `${leadsUrgentes.length} lead${leadsUrgentes.length === 1 ? '' : 's'} urgente${leadsUrgentes.length === 1 ? '' : 's'}`,
        detail: leadsUrgentes.slice(0, 2).map((l) => l.nombre || 'Lead').join(' · '),
        href: '/saas/lawyer-captacion',
      });
    }

    const pipeline: Record<PipelineKey, number> = {
      leads: leadsAbiertos.length,
      abierto: abierto.length,
      en_tramite: enTramite.length,
      vista_oral: vistaOral.length,
      plazos: plazosAbiertos.length,
      cobro: porCobrar.length,
    };

    return {
      pipeline,
      alerts,
      leadsAbiertos: leadsAbiertos.length,
      expedientesActivos: activos.length,
      plazosPendientes: plazosAbiertos.length,
      vistasProximasCount: vistasProximas.length,
      pendienteEuro,
      plazosCriticos: plazosAbiertos.slice(0, 8),
      vistasProximas: vistasProximas.slice(0, 8),
      casosCalientes: [...vistaOral, ...enTramite.filter((c) => c.urgencia === 'alta')].slice(0, 6),
    };
  }, [leads, cases, deadlines, hearings, invoices]);

  return (
    <Layout title="Centro operativo">
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Centro operativo</span>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold text-stone-900 dark:text-stone-50">
              {businessName}
            </h1>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
              Hoy · captación, expedientes, plazos y cobro
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            className="shrink-0 rounded-md border border-transparent p-2 text-stone-500 transition-colors hover:border-stone-200 hover:bg-white/80 hover:text-stone-800 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            title="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && !hasData ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900 dark:border-stone-600 dark:border-t-stone-100" />
          </div>
        ) : (
          <>
            {snapshot.alerts.length > 0 && (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {snapshot.alerts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(a.href)}
                    className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition hover:opacity-95 ${
                      a.severity === 'danger'
                        ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
                        : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate text-xs">
                      <span className="font-semibold">{a.title}</span>
                      <span className="opacity-75"> · {a.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {PIPELINE.map((p) => {
                const n = snapshot.pipeline[p.key];
                const hot = n > 0;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => navigate(p.href)}
                    className={`rounded-2xl border px-3 py-3 text-left transition hover:shadow-sm ${
                      hot
                        ? p.tone
                        : 'border-stone-100 bg-stone-50/80 text-stone-400 dark:border-stone-800 dark:bg-stone-800/50'
                    }`}
                  >
                    <div className={`font-mono text-2xl font-bold tabular-nums ${hot ? '' : 'text-stone-400'}`}>
                      {n}
                    </div>
                    <div className={`mt-0.5 text-[11px] font-semibold opacity-90 ${hot ? '' : 'text-stone-400'}`}>
                      {p.label}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Leads abiertos', value: String(snapshot.leadsAbiertos), icon: UserPlus },
                { label: 'Expedientes activos', value: String(snapshot.expedientesActivos), icon: Briefcase },
                { label: 'Vistas (14 d)', value: String(snapshot.vistasProximasCount), icon: Gavel },
                { label: 'Pendiente cobro', value: eur(snapshot.pendienteEuro), icon: Receipt },
              ].map((k) => (
                <div
                  key={k.label}
                  className="rounded-2xl border border-stone-200 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900"
                >
                  <div className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
                    <k.icon className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-semibold">{k.label}</span>
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-stone-900 dark:text-stone-50">{k.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <Timer className="h-3.5 w-3.5" />
                    Plazos críticos
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    onClick={() => navigate('/saas/lawyer-deadlines')}
                  >
                    Ver todos
                  </button>
                </div>
                {snapshot.plazosCriticos.length === 0 ? (
                  <p className="py-2 text-sm text-stone-400">Sin plazos pendientes.</p>
                ) : (
                  <ul className="space-y-1">
                    {snapshot.plazosCriticos.map((p) => {
                      const overdue = (p.dias ?? 0) < 0;
                      const soon = p.dias != null && p.dias >= 0 && p.dias <= 3;
                      return (
                        <li
                          key={p._id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                            overdue
                              ? 'border-rose-100 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20'
                              : soon
                                ? 'border-amber-100 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20'
                                : 'border-stone-100 bg-stone-50 dark:border-stone-800 dark:bg-stone-950/40'
                          }`}
                        >
                          <span className="min-w-0 truncate font-semibold text-stone-900 dark:text-stone-100">
                            {p.caso}
                            <span className="ml-1.5 text-[11px] font-normal text-stone-500">
                              {p.tipoPlazo || p.descripcion || 'Plazo'} · {formatDateEs(p.fechaLimite)}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 font-mono text-xs font-bold ${
                              overdue
                                ? 'text-rose-700 dark:text-rose-300'
                                : soon
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : 'text-stone-600 dark:text-stone-300'
                            }`}
                          >
                            {formatDaysLabel(p.dias ?? null)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <Clock className="h-3.5 w-3.5" />
                    Próximas vistas
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    onClick={() => navigate('/saas/lawyer-hearings')}
                  >
                    Ver todas
                  </button>
                </div>
                {snapshot.vistasProximas.length === 0 ? (
                  <p className="py-2 text-sm text-stone-400">Sin vistas en los próximos 14 días.</p>
                ) : (
                  <ul className="space-y-1">
                    {snapshot.vistasProximas.map((v) => (
                      <li
                        key={v._id}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                          v.dias === 0
                            ? 'border-rose-100 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20'
                            : 'border-stone-100 bg-stone-50 dark:border-stone-800 dark:bg-stone-950/40'
                        }`}
                      >
                        <span className="min-w-0 truncate font-semibold text-stone-900 dark:text-stone-100">
                          {v.caso}
                          <span className="ml-1.5 text-[11px] font-normal text-stone-500">
                            {v.cliente} · {formatDateEs(v.fecha)}
                            {v.hora ? `, ${v.hora}` : ''}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 font-mono text-xs font-bold ${
                            v.dias === 0
                              ? 'text-rose-700 dark:text-rose-300'
                              : 'text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          {formatDaysLabel(v.dias ?? null)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {snapshot.casosCalientes.length > 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <Scale className="h-3.5 w-3.5" />
                  En proceso ahora
                </div>
                <ul className="space-y-1">
                  {snapshot.casosCalientes.map((c) => (
                    <li
                      key={c._id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 bg-stone-50 px-2.5 py-1.5 text-sm dark:border-stone-800 dark:bg-stone-950/40"
                    >
                      <span className="min-w-0 truncate font-semibold text-stone-900 dark:text-stone-100">
                        {c.expediente}
                        <span className="ml-1.5 text-[11px] font-normal text-stone-500">
                          {c.cliente}
                          {c.abogado ? ` · ${c.abogado}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold capitalize text-stone-600 dark:text-stone-300">
                        {c.estado.replace('_', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    Despachos
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Unidad de trabajo del despacho (como el local en bar). Personalízalos en DPC.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={VERTIAL_BTN_SECONDARY}
                    onClick={() => navigate('/saas/settings/tienda')}
                  >
                    Personalizar DPC
                  </button>
                  <button
                    type="button"
                    className={VERTIAL_BTN_PRIMARY}
                    onClick={() => navigate('/saas/settings/tienda?action=new-despacho')}
                  >
                    Nuevo despacho
                  </button>
                </div>
              </div>
              {despachos.length === 0 ? (
                <p className="text-sm text-stone-400">Aún no hay despachos. Crea el primero para organizar el día a día.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {despachos.map((d) => (
                    <li
                      key={d._id}
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-800 dark:border-stone-700 dark:text-stone-200"
                    >
                      <Scale className="h-4 w-4 text-stone-400" />
                      {d.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <Clock className="h-3.5 w-3.5" />
                Accesos rápidos
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {QUICK.map(({ label, to, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-stone-100 bg-stone-50 px-2 py-3 text-center transition hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950/50 dark:hover:border-stone-600"
                  >
                    <Icon className="h-5 w-5 text-stone-700 dark:text-stone-200" />
                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-50">{label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <p className="text-center text-[11px] text-stone-400">
              {snapshot.plazosPendientes} plazos pendientes · {snapshot.expedientesActivos} expedientes activos
              {despachos.length > 0 ? ` · ${despachos.length} despacho${despachos.length === 1 ? '' : 's'}` : ''}
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
