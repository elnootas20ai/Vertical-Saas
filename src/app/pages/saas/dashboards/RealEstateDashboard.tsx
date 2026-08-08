import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import { useBusiness } from '../../../context/BusinessContext';
import { useAuth } from '../../../context/AuthContext';
import { listTeamAgentOptions } from '../../../lib/realEstateTeamAgents';
import { RealEstateTeamPanel } from '../../../verticals/realEstate/RealEstateTeamPanel';
import {
  Building2,
  Footprints,
  FileSignature,
  ClipboardList,
  LayoutDashboard,
  Clock,
  Home,
  CalendarPlus,
  FilePlus2,
  Loader2,
  CalendarDays,
  MapPin,
  Eye,
  Euro,
  TrendingUp,
  Phone,
  ChevronRight,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { createVerticalApi, type VerticalEntity } from '../../../lib/verticalApiFactory';
import { useRealEstateScope } from '../../../lib/realEstateScope';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import {
  RE_SITUACION_LABEL,
  RE_SIGUIENTE_ACCION_LABEL,
  type ReSituacion,
  type ReSiguienteAccion,
} from '../../../verticals/realEstate';

type RealEstateDashboardProps = {
  onSelectGeneral?: () => void;
};

interface ReProperty extends VerticalEntity {
  estado?: string;
  direccion?: string;
  referencia?: string;
  exclusividad?: string;
  agente?: string;
  agenteUserId?: string;
  precio?: number;
  operacion?: string;
}

interface ReVisit extends VerticalEntity {
  fecha?: string;
  hora?: string;
  fechaSeguimiento?: string;
  resultado?: string;
  siguienteAccion?: string;
  direccion?: string;
  propiedad?: string;
  propiedadId?: string;
  cliente?: string;
  situacion?: string;
  agente?: string;
  agenteUserId?: string;
}

function startOfWeekMondayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

interface ReContract extends VerticalEntity {
  estado?: string;
  propiedad?: string;
  propiedadId?: string;
  cliente?: string;
  referencia?: string;
  tipo?: string;
  importeMensual?: number;
  importeTotal?: number;
  honorarios?: number;
  fechaFin?: string;
}

interface ReAppraisal extends VerticalEntity {
  estado?: string;
  propiedad?: string;
  valorTasado?: number;
}

/** Tabla densa estilo panel delivery: etiqueta minúscula + número tabular. */
function MiniStat({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
  warn,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
        warn
          ? 'border-amber-100 bg-amber-50/70 hover:border-amber-200 dark:border-amber-900/40 dark:bg-amber-950/20'
          : 'border-gray-100 bg-gray-50/60 hover:border-gray-200 dark:border-gray-800 dark:bg-gray-800/40 dark:hover:border-gray-700'
      }`}
    >
      <p className="flex items-center gap-1 truncate text-[9px] font-bold uppercase tracking-wide text-gray-500">
        <Icon className={`h-3 w-3 shrink-0 ${iconClass}`} />
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-black tabular-nums leading-tight text-gray-900 dark:text-gray-100">
        {value}
      </p>
      {sub ? <p className="text-[9px] leading-tight text-gray-400">{sub}</p> : null}
    </button>
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Importe compacto para KPI (sin decimales): 2.450.000 € */
function moneyShort(value: number): string {
  return `${formatNumberEs(Math.round(value), { maxFraction: 0 })} €`;
}

export function RealEstateDashboard({ onSelectGeneral }: RealEstateDashboardProps) {
  const { userId, listOptions, ready } = useRealEstateScope();
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const { listUsers } = useAuth();
  const [accountDirectory, setAccountDirectory] = useState<
    { user_id?: string; fullName?: string; name?: string; email?: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void listUsers()
      .then((users) => {
        if (!cancelled && Array.isArray(users)) setAccountDirectory(users as typeof accountDirectory);
      })
      .catch(() => {
        if (!cancelled) setAccountDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listUsers]);

  const agents = useMemo(
    () => listTeamAgentOptions(currentBusiness?.members, accountDirectory),
    [currentBusiness?.members, accountDirectory],
  );

  const propsApi = useMemo(() => createVerticalApi<ReProperty>('realestate', 'properties'), []);
  const visitsApi = useMemo(() => createVerticalApi<ReVisit>('realestate', 'visits'), []);
  const contractsApi = useMemo(() => createVerticalApi<ReContract>('realestate', 'contracts'), []);
  const appraisalsApi = useMemo(() => createVerticalApi<ReAppraisal>('realestate', 'appraisals'), []);

  const [properties, setProperties] = useState<ReProperty[]>([]);
  const [visits, setVisits] = useState<ReVisit[]>([]);
  const [contracts, setContracts] = useState<ReContract[]>([]);
  const [appraisals, setAppraisals] = useState<ReAppraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityScope, setActivityScope] = useState<'todos' | 'hoy'>('todos');

  const loadData = useCallback(async () => {
    if (!userId || !ready) {
      setProperties([]);
      setVisits([]);
      setContracts([]);
      setAppraisals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, v, c, a] = await Promise.all([
        propsApi.list(userId, listOptions),
        visitsApi.list(userId, listOptions),
        contractsApi.list(userId, listOptions),
        appraisalsApi.list(userId, listOptions),
      ]);
      setProperties(p);
      setVisits(v);
      setContracts(c);
      setAppraisals(a);
    } catch {
      setProperties([]);
      setVisits([]);
      setContracts([]);
      setAppraisals([]);
    } finally {
      setLoading(false);
    }
  }, [userId, ready, listOptions, propsApi, visitsApi, contractsApi, appraisalsApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const hoy = todayISO();
  const inicioSemana = startOfWeekMondayISO();

  const kpis = useMemo(() => {
    const pisosActivos = properties.filter((p) => {
      const e = String(p.estado || '');
      return e === 'disponible' || e === 'reservado' || !e;
    }).length;
    const disponibles = properties.filter((p) => String(p.estado || 'disponible') === 'disponible').length;
    const visitasHoy = visits.filter((v) => String(v.fecha || '').slice(0, 10) === hoy).length;
    const visitasSemana = visits.filter((v) => String(v.fecha || '').slice(0, 10) >= inicioSemana).length;
    const seguimientos = visits.filter((v) => {
      const fs = String(v.fechaSeguimiento || '').slice(0, 10);
      return fs && fs <= hoy && v.resultado !== 'descartado' && v.siguienteAccion !== 'descartar';
    }).length;
    const conVisitaHoy = new Set(
      visits
        .filter((v) => String(v.fecha || '').slice(0, 10) === hoy && v.propiedadId)
        .map((v) => String(v.propiedadId)),
    ).size;
    const visitedWeek = new Set(
      visits
        .filter((v) => String(v.fecha || '').slice(0, 10) >= inicioSemana && v.propiedadId)
        .map((v) => String(v.propiedadId)),
    );
    const sinVisitaSemana = properties.filter((p) => !visitedWeek.has(p._id)).length;
    const contratosActivos = contracts.filter((c) => String(c.estado || '') === 'activo').length;
    const tasacionesAbiertas = appraisals.filter((a) => {
      const e = String(a.estado || '');
      return e === 'solicitada' || e === 'en_proceso';
    }).length;
    return {
      pisosActivos,
      disponibles,
      visitasHoy,
      visitasSemana,
      seguimientos,
      conVisitaHoy,
      sinVisitaSemana,
      contratosActivos,
      tasacionesAbiertas,
    };
  }, [properties, visits, contracts, appraisals, hoy, inicioSemana]);

  const cartera = useMemo(() => {
    let valorVenta = 0;
    let rentaMensual = 0;
    for (const p of properties) {
      const e = String(p.estado || 'disponible');
      if (e !== 'disponible' && e !== 'reservado') continue;
      const precio = Number(p.precio) || 0;
      if (String(p.operacion || 'venta') === 'alquiler') rentaMensual += precio;
      else valorVenta += precio;
    }
    let honorarios = 0;
    let rentaContratada = 0;
    for (const c of contracts) {
      if (String(c.estado || '') !== 'activo') continue;
      honorarios += Number(c.honorarios) || 0;
      if (String(c.tipo || '') === 'alquiler') rentaContratada += Number(c.importeMensual) || 0;
    }
    return { valorVenta, rentaMensual, honorarios, rentaContratada };
  }, [properties, contracts]);

  const agendaHoy = useMemo(
    () =>
      visits
        .filter((v) => String(v.fecha || '').slice(0, 10) === hoy)
        .sort((a, b) => String(a.hora || '99:99').localeCompare(String(b.hora || '99:99')))
        .slice(0, 6),
    [visits, hoy],
  );

  const seguimientosPendientes = useMemo(
    () =>
      visits
        .filter((v) => {
          const fs = String(v.fechaSeguimiento || '').slice(0, 10);
          return fs && fs <= hoy && v.resultado !== 'descartado' && v.siguienteAccion !== 'descartar';
        })
        .sort((a, b) =>
          String(a.fechaSeguimiento || '').localeCompare(String(b.fechaSeguimiento || '')),
        )
        .slice(0, 6),
    [visits, hoy],
  );

  const funnel = useMemo(() => {
    const counts = { pendiente: 0, interesado: 0, oferta: 0, descartado: 0 };
    for (const v of visits) {
      const r = String(v.resultado || 'pendiente') as keyof typeof counts;
      counts[r in counts ? r : 'pendiente'] += 1;
    }
    const total = visits.length || 1;
    return [
      { key: 'pendiente', label: 'Pendientes', count: counts.pendiente, pct: (counts.pendiente / total) * 100, bar: 'bg-slate-400' },
      { key: 'interesado', label: 'Interesados', count: counts.interesado, pct: (counts.interesado / total) * 100, bar: 'bg-blue-500' },
      { key: 'oferta', label: 'Con oferta', count: counts.oferta, pct: (counts.oferta / total) * 100, bar: 'bg-emerald-500' },
      { key: 'descartado', label: 'Descartados', count: counts.descartado, pct: (counts.descartado / total) * 100, bar: 'bg-rose-400' },
    ];
  }, [visits]);

  const estadoCartera = useMemo(() => {
    const counts: Record<string, number> = { disponible: 0, reservado: 0, vendido: 0, alquilado: 0, otro: 0 };
    for (const p of properties) {
      const e = String(p.estado || 'disponible');
      counts[e in counts ? e : 'otro'] += 1;
    }
    const total = properties.length || 1;
    return [
      { key: 'disponible', label: 'Disponibles', count: counts.disponible, pct: (counts.disponible / total) * 100, bar: 'bg-emerald-500' },
      { key: 'reservado', label: 'Reservados', count: counts.reservado, pct: (counts.reservado / total) * 100, bar: 'bg-amber-500' },
      { key: 'vendido', label: 'Vendidos', count: counts.vendido, pct: (counts.vendido / total) * 100, bar: 'bg-blue-500' },
      { key: 'alquilado', label: 'Alquilados', count: counts.alquilado, pct: (counts.alquilado / total) * 100, bar: 'bg-violet-500' },
      ...(counts.otro > 0
        ? [{ key: 'otro', label: 'Otros', count: counts.otro, pct: (counts.otro / total) * 100, bar: 'bg-slate-400' }]
        : []),
    ];
  }, [properties]);

  const contratosPorVencer = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    const limiteISO = limite.toISOString().slice(0, 10);
    return contracts
      .filter((c) => {
        if (String(c.estado || '') !== 'activo') return false;
        const fin = String(c.fechaFin || '').slice(0, 10);
        return fin && fin <= limiteISO;
      })
      .sort((a, b) => String(a.fechaFin || '').localeCompare(String(b.fechaFin || '')))
      .slice(0, 5);
  }, [contracts]);

  const allActivities = useMemo(() => {
    type Act = { id: string; text: string; time: string; ts: number; today: boolean };
    const out: Act[] = [];

    for (const v of visits) {
      const ts = new Date(v.updatedAt || v.createdAt || v.fecha || 0).getTime();
      const d = new Date(ts);
      const addr = String(v.direccion || v.propiedad || 'Visita');
      out.push({
        id: `v-${v._id}`,
        text: `Visita · ${addr}${v.situacion ? ` (${v.situacion})` : ''}`,
        time: Number.isFinite(ts) ? d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—',
        ts: Number.isFinite(ts) ? ts : 0,
        today: d.toDateString() === new Date().toDateString(),
      });
    }
    for (const c of contracts) {
      const ts = new Date(c.updatedAt || c.createdAt || 0).getTime();
      const d = new Date(ts);
      out.push({
        id: `c-${c._id}`,
        text: `Contrato · ${c.referencia || c.propiedad || 'sin ref.'} (${c.estado || '—'})`,
        time: Number.isFinite(ts) ? d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—',
        ts: Number.isFinite(ts) ? ts : 0,
        today: d.toDateString() === new Date().toDateString(),
      });
    }
    for (const a of appraisals) {
      const ts = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const d = new Date(ts);
      out.push({
        id: `a-${a._id}`,
        text: `Tasación · ${a.propiedad || '—'} (${a.estado || '—'})`,
        time: Number.isFinite(ts) ? d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—',
        ts: Number.isFinite(ts) ? ts : 0,
        today: d.toDateString() === new Date().toDateString(),
      });
    }

    return out.sort((x, y) => y.ts - x.ts).slice(0, 20);
  }, [visits, contracts, appraisals]);

  const activities = useMemo(
    () => (activityScope === 'hoy' ? allActivities.filter((a) => a.today) : allActivities),
    [activityScope, allActivities],
  );

  const monthSummary = useMemo(
    () => [
      { label: 'Pisos en cartera', value: String(properties.length) },
      { label: 'Valor cartera en venta', value: formatMoneyEs(cartera.valorVenta) },
      { label: 'Renta mensual contratada', value: `${formatMoneyEs(cartera.rentaContratada)}/mes` },
      { label: 'Honorarios en vigor', value: formatMoneyEs(cartera.honorarios) },
      { label: 'Visitas registradas', value: String(visits.length) },
      { label: 'Contratos activos', value: String(kpis.contratosActivos) },
      { label: 'Tasaciones abiertas', value: String(kpis.tasacionesAbiertas) },
    ],
    [properties.length, visits.length, kpis.contratosActivos, kpis.tasacionesAbiertas, cartera],
  );

  return (
    <Layout title="Dashboard">
      <div className="pb-8 relative">
        {loading ? (
          <div className="flex justify-center items-center py-16 mb-6" aria-busy="true">
            <Loader2 className="w-10 h-10 animate-spin text-teal-500" />
          </div>
        ) : null}
        {onSelectGeneral ? (
          <div className="flex justify-end mb-6">
            <button
              type="button"
              onClick={onSelectGeneral}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Vista general
            </button>
          </div>
        ) : null}

        <section className="mb-4 rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="min-w-0 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
              <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                Hoy en la agencia
              </p>
              <span className="hidden text-[10px] text-gray-400 sm:inline">
                cartera, visitas y contratos en tiempo real
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
            <MiniStat
              icon={Building2}
              iconClass="text-sky-600 dark:text-sky-400"
              label="Pisos activos"
              value={String(kpis.pisosActivos)}
              onClick={() => navigate('/saas/realestate-properties')}
            />
            <MiniStat
              icon={Footprints}
              iconClass="text-blue-600 dark:text-blue-400"
              label="Visitas hoy"
              value={String(kpis.visitasHoy)}
              onClick={() => navigate('/saas/realestate-visits')}
            />
            <MiniStat
              icon={ClipboardList}
              iconClass="text-amber-600 dark:text-amber-400"
              label="Seguimientos"
              value={String(kpis.seguimientos)}
              sub="pendientes de hacer"
              warn={kpis.seguimientos > 0}
              onClick={() => navigate('/saas/realestate-visits')}
            />
            <MiniStat
              icon={FileSignature}
              iconClass="text-rose-600 dark:text-rose-400"
              label="Contratos activos"
              value={String(kpis.contratosActivos)}
              onClick={() => navigate('/saas/realestate-contracts')}
            />
            <MiniStat
              icon={ClipboardList}
              iconClass="text-emerald-600 dark:text-emerald-400"
              label="Tasaciones abiertas"
              value={String(kpis.tasacionesAbiertas)}
              onClick={() => navigate('/saas/realestate-appraisals')}
            />
          </div>
        </section>

        <section className="mb-4 rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="min-w-0 flex items-center gap-2">
              <Euro className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
              <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                Valor de cartera
              </p>
              <span className="hidden text-[10px] text-gray-400 sm:inline">
                calculado sobre inmuebles y contratos reales
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
            <MiniStat
              icon={Euro}
              iconClass="text-emerald-600 dark:text-emerald-400"
              label="Cartera en venta"
              value={moneyShort(cartera.valorVenta)}
              sub="disponibles + reservados"
              onClick={() => navigate('/saas/realestate-properties')}
            />
            <MiniStat
              icon={Home}
              iconClass="text-violet-600 dark:text-violet-400"
              label="Renta en oferta"
              value={`${moneyShort(cartera.rentaMensual)}/mes`}
              sub="alquileres en cartera"
              onClick={() => navigate('/saas/realestate-properties')}
            />
            <MiniStat
              icon={TrendingUp}
              iconClass="text-blue-600 dark:text-blue-400"
              label="Renta contratada"
              value={`${moneyShort(cartera.rentaContratada)}/mes`}
              sub="contratos de alquiler activos"
              onClick={() => navigate('/saas/realestate-contracts')}
            />
            <MiniStat
              icon={FileSignature}
              iconClass="text-teal-600 dark:text-teal-400"
              label="Honorarios activos"
              value={moneyShort(cartera.honorarios)}
              sub="de contratos en vigor"
              onClick={() => navigate('/saas/realestate-contracts')}
            />
          </div>
        </section>

        <section className="mb-4 rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="min-w-0 flex items-center gap-2">
              <Footprints className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
              <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                Operativa comercial · semana
              </p>
              <span className="hidden text-[10px] text-gray-400 sm:inline">
                ritmo de visitas y cobertura de cartera
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/saas/realestate-visits')}
              className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Visitas
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
            <MiniStat
              icon={CalendarDays}
              iconClass="text-blue-600 dark:text-blue-400"
              label="Visitas semana"
              value={String(kpis.visitasSemana)}
              onClick={() => navigate('/saas/realestate-visits')}
            />
            <MiniStat
              icon={Home}
              iconClass="text-emerald-600 dark:text-emerald-400"
              label="Disponibles"
              value={String(kpis.disponibles)}
              onClick={() => navigate('/saas/realestate-properties')}
            />
            <MiniStat
              icon={Eye}
              iconClass="text-teal-600 dark:text-teal-400"
              label="Pisos con visita hoy"
              value={String(kpis.conVisitaHoy)}
              onClick={() => navigate('/saas/realestate-visits')}
            />
            <MiniStat
              icon={MapPin}
              iconClass="text-amber-600 dark:text-amber-400"
              label="Sin visita (semana)"
              value={String(kpis.sinVisitaSemana)}
              sub="inmuebles sin enseñar"
              warn={kpis.sinVisitaSemana > 0}
              onClick={() => navigate('/saas/realestate-properties')}
            />
          </div>
        </section>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
                <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                  Agenda de hoy
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/saas/realestate-visits')}
                className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Ver todas
              </button>
            </div>
            {agendaHoy.length === 0 ? (
              <div className="py-5 text-center">
                <p className="text-xs text-gray-400">Sin visitas programadas para hoy</p>
                <button
                  type="button"
                  onClick={() => navigate('/saas/realestate-visits')}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Agendar visita
                </button>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {agendaHoy.map((v) => (
                  <li key={v._id}>
                    <button
                      type="button"
                      onClick={() => navigate('/saas/realestate-visits')}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-2 text-left hover:border-gray-200 dark:border-gray-800 dark:bg-gray-800/40 dark:hover:border-gray-700"
                    >
                      <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        {v.hora || '—'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
                          {v.direccion || v.propiedad || 'Visita'}
                        </span>
                        <span className="block truncate text-[10px] text-gray-400">
                          {[v.cliente, v.agente].filter(Boolean).join(' · ') || 'sin contacto'}
                          {v.situacion && v.situacion !== 'pendiente'
                            ? ` · ${RE_SITUACION_LABEL[v.situacion as ReSituacion] || v.situacion}`
                            : ''}
                        </span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                  Seguimientos pendientes
                </p>
                {seguimientosPendientes.length > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {kpis.seguimientos}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => navigate('/saas/realestate-visits')}
                className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Gestionar
              </button>
            </div>
            {seguimientosPendientes.length === 0 ? (
              <p className="py-5 text-center text-xs text-gray-400">
                Al día: ningún seguimiento vencido
              </p>
            ) : (
              <ul className="space-y-1.5">
                {seguimientosPendientes.map((v) => {
                  const accion = v.siguienteAccion
                    ? RE_SIGUIENTE_ACCION_LABEL[v.siguienteAccion as Exclude<ReSiguienteAccion, ''>] ||
                      v.siguienteAccion
                    : 'Contactar';
                  return (
                    <li key={v._id}>
                      <button
                        type="button"
                        onClick={() => navigate('/saas/realestate-visits')}
                        className="flex w-full items-center gap-2.5 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-2 text-left hover:border-amber-200 dark:border-amber-900/40 dark:bg-amber-950/20 dark:hover:border-amber-800"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
                            {v.direccion || v.propiedad || 'Seguimiento'}
                          </span>
                          <span className="block truncate text-[10px] text-gray-500 dark:text-gray-400">
                            {accion}
                            {v.cliente ? ` · ${v.cliente}` : ''}
                            {v.fechaSeguimiento
                              ? ` · desde ${new Date(v.fechaSeguimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`
                              : ''}
                          </span>
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
              <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                Embudo comercial
              </p>
              <span className="text-[10px] text-gray-400">({visits.length} visitas)</span>
            </div>
            {visits.length === 0 ? (
              <p className="py-5 text-center text-xs text-gray-400">Aún no hay visitas registradas</p>
            ) : (
              <ul className="space-y-2">
                {funnel.map((row) => (
                  <li key={row.key}>
                    <div className="mb-0.5 flex items-center justify-between text-[10px]">
                      <span className="font-bold uppercase tracking-wide text-gray-500">{row.label}</span>
                      <span className="font-black tabular-nums text-gray-800 dark:text-gray-200">
                        {row.count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className={`h-full rounded-full ${row.bar}`}
                        style={{ width: `${Math.max(row.pct, row.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
              <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                Estado de la cartera
              </p>
              <span className="text-[10px] text-gray-400">({properties.length} inmuebles)</span>
            </div>
            {properties.length === 0 ? (
              <p className="py-5 text-center text-xs text-gray-400">Todavía no hay inmuebles</p>
            ) : (
              <ul className="space-y-2">
                {estadoCartera.map((row) => (
                  <li key={row.key}>
                    <div className="mb-0.5 flex items-center justify-between text-[10px]">
                      <span className="font-bold uppercase tracking-wide text-gray-500">{row.label}</span>
                      <span className="font-black tabular-nums text-gray-800 dark:text-gray-200">
                        {row.count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className={`h-full rounded-full ${row.bar}`}
                        style={{ width: `${Math.max(row.pct, row.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
                Contratos por vencer
              </p>
              <span className="text-[10px] text-gray-400">próximos 30 días</span>
            </div>
            {contratosPorVencer.length === 0 ? (
              <p className="py-5 text-center text-xs text-gray-400">
                Ningún contrato vence en los próximos 30 días
              </p>
            ) : (
              <ul className="space-y-1.5">
                {contratosPorVencer.map((c) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      onClick={() => navigate('/saas/realestate-contracts')}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-2 text-left hover:border-gray-200 dark:border-gray-800 dark:bg-gray-800/40 dark:hover:border-gray-700"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
                          {c.referencia || c.propiedad || 'Contrato'}
                        </span>
                        <span className="block truncate text-[10px] text-gray-400">
                          {c.cliente || 'sin cliente'}
                          {c.fechaFin
                            ? ` · vence ${new Date(c.fechaFin).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                            : ''}
                        </span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mb-4">
          <RealEstateTeamPanel
            agents={agents}
            properties={properties}
            visits={visits}
            contracts={contracts}
            loading={loading}
          />
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Acciones rápidas
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/saas/realestate-properties')}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white text-sm font-medium px-4 py-2.5 transition-colors"
            >
              <Home className="w-4 h-4" />
              Nueva propiedad
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/realestate-visits')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <CalendarPlus className="w-4 h-4" />
              Agendar visita
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/realestate-contracts')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FilePlus2 className="w-4 h-4" />
              Nuevo contrato
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/realestate-appraisals')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              Nueva tasación
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/clients')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Users className="w-4 h-4" />
              Ver clientes
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Actividad reciente
              </h2>
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-900/50">
                <button
                  type="button"
                  onClick={() => setActivityScope('todos')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activityScope === 'todos'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setActivityScope('hoy')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activityScope === 'hoy'
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  Hoy
                </button>
              </div>
            </div>
            {activities.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">Sin actividad registrada</p>
            ) : (
              <ul className="space-y-3">
                {activities.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-3"
                  >
                    <Clock className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200">{item.text}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{item.time}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Resumen
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Datos reales de tu cartera inmobiliaria.
            </p>
            <ul className="space-y-3">
              {monthSummary.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-300">{row.label}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Layout>
  );
}
