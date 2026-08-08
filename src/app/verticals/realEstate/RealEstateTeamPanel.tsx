/**
 * Dashboard inmobiliaria — rendimiento por comercial (equipo).
 * Mismo patrón que el panel por tienda de Delivery: fila resumen destacada
 * + acordeón por agente con métricas del período y comparativa.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Users, UserRound } from 'lucide-react';
import { formatNumberEs } from '../../lib/formatNumberEs';
import { monthOverMonthPct } from '../../lib/portfolioMetrics';
import type { TeamAgentOption } from '../../lib/realEstateTeamAgents';

export type RePropertyLike = {
  _id: string;
  estado?: string;
  exclusividad?: string;
  agente?: string;
  agenteUserId?: string;
};

export type ReVisitLike = {
  _id: string;
  fecha?: string;
  fechaSeguimiento?: string;
  resultado?: string;
  siguienteAccion?: string;
  agente?: string;
  agenteUserId?: string;
};

export type ReContractLike = {
  _id: string;
  estado?: string;
  propiedadId?: string;
};

type Props = {
  agents: TeamAgentOption[];
  properties: RePropertyLike[];
  visits: ReVisitLike[];
  contracts: ReContractLike[];
  loading?: boolean;
};

type TeamRange = 'day' | 'month';

const SIN_ASIGNAR = '__sin_asignar__';

type AgentStats = {
  key: string;
  name: string;
  role?: string;
  visitas: number;
  visitasPrev: number;
  visitasPct: number | null;
  seguimientos: number;
  carteraActiva: number;
  exclusivas: number;
  contratosActivos: number;
};

function normalizeUserId(id: unknown): string {
  return String(id || '').trim().replace(/^account:/, '');
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Asigna cada doc a un agente del equipo (por userId, si no por nombre); '' = sin asignar. */
function agentKeyFor(
  doc: { agente?: string; agenteUserId?: string },
  agents: TeamAgentOption[],
): string {
  const uid = normalizeUserId(doc.agenteUserId);
  if (uid && agents.some((a) => a.userId === uid)) return uid;
  const name = String(doc.agente || '').trim().toLowerCase();
  if (name) {
    const byName = agents.find((a) => a.name.toLowerCase() === name);
    if (byName) return byName.userId;
  }
  return SIN_ASIGNAR;
}

function agentInitials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return `${first}${last}`.toUpperCase();
}

function VsBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex rounded px-1 py-0.5 text-[9px] font-bold tabular-nums ${
        up
          ? 'bg-[rgba(34,197,94,0.12)] text-[var(--v-green,#22c55e)]'
          : 'bg-[rgba(225,29,72,0.1)] text-[var(--v-rose,#e11d48)]'
      }`}
    >
      {up ? '+' : ''}{formatNumberEs(pct, { maxFraction: 1 })}%
    </span>
  );
}

function StatTile({
  label,
  value,
  sub,
  badge,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: React.ReactNode;
  tone?: 'ok' | 'warn';
}) {
  const toneCls =
    tone === 'warn'
      ? 'border-amber-100 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20'
      : tone === 'ok'
        ? 'border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20'
        : 'border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/40';
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${toneCls}`}>
      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <span className="text-[13px] font-black tabular-nums text-gray-900 dark:text-gray-100">
          {value}
        </span>
        {badge}
      </div>
      {sub ? <p className="text-[9px] leading-tight text-gray-400">{sub}</p> : null}
    </div>
  );
}

function AgentBlock({
  stats,
  highlight,
  defaultOpen,
  vsLabel,
}: {
  stats: AgentStats;
  highlight?: boolean;
  defaultOpen?: boolean;
  vsLabel: string;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const empty =
    stats.visitas === 0
    && stats.seguimientos === 0
    && stats.carteraActiva === 0
    && stats.contratosActivos === 0;

  return (
    <div
      className={`rounded-lg border ${
        highlight
          ? 'border-blue-100 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/20'
          : 'border-gray-100 dark:border-gray-800'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
      >
        <div className="flex w-full min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            {highlight ? (
              <Users className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-600 text-[8px] font-bold text-white">
                {agentInitials(stats.name)}
              </span>
            )}
            <span className="truncate text-[11px] font-semibold text-gray-900 dark:text-gray-100">
              {stats.name}
            </span>
            {stats.role ? (
              <span className="hidden shrink-0 text-[9px] text-gray-400 capitalize sm:inline">
                {stats.role}
              </span>
            ) : null}
            {empty ? (
              <span className="shrink-0 text-[9px] text-gray-400">Sin actividad</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="rounded bg-[rgba(37,99,235,0.1)] px-1 py-0.5 text-[9px] font-bold tabular-nums text-[var(--v-blue,#2563eb)]">
              {formatNumberEs(stats.visitas, { maxFraction: 0 })} visita{stats.visitas === 1 ? '' : 's'}
            </span>
            {stats.seguimientos > 0 ? (
              <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] font-bold tabular-nums text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {formatNumberEs(stats.seguimientos, { maxFraction: 0 })} seguim.
              </span>
            ) : null}
            <span className="hidden shrink-0 text-[9px] font-bold text-[var(--v-blue,#2563eb)] sm:inline">
              {open ? 'Ocultar' : 'Ver detalle'}
            </span>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          </div>
        </div>
      </button>
      {open ? (
        <div className="px-2 pb-2">
          <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <StatTile
              label="Visitas"
              value={formatNumberEs(stats.visitas, { maxFraction: 0 })}
              sub={`${vsLabel}: ${formatNumberEs(stats.visitasPrev, { maxFraction: 0 })}`}
              badge={<VsBadge pct={stats.visitasPct} />}
              tone={stats.visitas > 0 ? 'ok' : undefined}
            />
            <StatTile
              label="Seguimientos"
              value={formatNumberEs(stats.seguimientos, { maxFraction: 0 })}
              sub="pendientes de hacer"
              tone={stats.seguimientos > 0 ? 'warn' : undefined}
            />
            <StatTile
              label="Cartera activa"
              value={formatNumberEs(stats.carteraActiva, { maxFraction: 0 })}
              sub={
                stats.exclusivas > 0
                  ? `${formatNumberEs(stats.exclusivas, { maxFraction: 0 })} en exclusiva`
                  : 'inmuebles que lleva'
              }
            />
            <StatTile
              label="Contratos activos"
              value={formatNumberEs(stats.contratosActivos, { maxFraction: 0 })}
              sub="vía sus inmuebles"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RealEstateTeamPanel({ agents, properties, visits, contracts, loading = false }: Props) {
  const navigate = useNavigate();
  const [range, setRange] = useState<TeamRange>('month');

  const vsLabel = range === 'day' ? 'ayer' : 'mes anterior';

  const { overall, rows } = useMemo(() => {
    const now = new Date();
    const today = localDayKey(now);
    const yesterday = localDayKey(new Date(now.getTime() - 86400000));
    const monthStart = `${today.slice(0, 7)}-01`;
    const prevMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStart = localDayKey(prevMonthRef);
    // Mismos días del mes anterior (1 → día de hoy), sin desbordar meses cortos.
    const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const prevMonthEnd = localDayKey(
      new Date(prevMonthRef.getFullYear(), prevMonthRef.getMonth(), Math.min(now.getDate(), daysInPrevMonth)),
    );

    const inRange = (fecha: string): boolean => {
      if (!fecha) return false;
      if (range === 'day') return fecha === today;
      return fecha >= monthStart && fecha <= today;
    };
    const inPrevRange = (fecha: string): boolean => {
      if (!fecha) return false;
      if (range === 'day') return fecha === yesterday;
      return fecha >= prevMonthStart && fecha <= prevMonthEnd;
    };

    const propertyAgentById = new Map<string, string>();
    for (const p of properties) {
      propertyAgentById.set(p._id, agentKeyFor(p, agents));
    }

    const mkStats = (key: string, name: string, role?: string): AgentStats => ({
      key,
      name,
      role,
      visitas: 0,
      visitasPrev: 0,
      visitasPct: null,
      seguimientos: 0,
      carteraActiva: 0,
      exclusivas: 0,
      contratosActivos: 0,
    });

    const byKey = new Map<string, AgentStats>();
    for (const a of agents) byKey.set(a.userId, mkStats(a.userId, a.name, a.role));
    const sinAsignar = mkStats(SIN_ASIGNAR, 'Sin asignar');
    const overallStats = mkStats('overall', 'Todo el equipo');

    const bump = (key: string, fn: (s: AgentStats) => void) => {
      fn(overallStats);
      const s = key === SIN_ASIGNAR ? sinAsignar : byKey.get(key);
      if (s) fn(s);
    };

    for (const v of visits) {
      const key = agentKeyFor(v, agents);
      const fecha = String(v.fecha || '').slice(0, 10);
      if (inRange(fecha)) bump(key, (s) => { s.visitas += 1; });
      if (inPrevRange(fecha)) bump(key, (s) => { s.visitasPrev += 1; });
      const fs = String(v.fechaSeguimiento || '').slice(0, 10);
      if (fs && fs <= today && v.resultado !== 'descartado' && v.siguienteAccion !== 'descartar') {
        bump(key, (s) => { s.seguimientos += 1; });
      }
    }

    for (const p of properties) {
      const estado = String(p.estado || '');
      const activa = estado === 'disponible' || estado === 'reservado' || !estado;
      if (!activa) continue;
      const key = propertyAgentById.get(p._id) || SIN_ASIGNAR;
      bump(key, (s) => { s.carteraActiva += 1; });
      if (String(p.exclusividad || '').toLowerCase() === 'si') {
        bump(key, (s) => { s.exclusivas += 1; });
      }
    }

    for (const c of contracts) {
      if (String(c.estado || '') !== 'activo') continue;
      const pid = String(c.propiedadId || '').trim();
      const key = (pid && propertyAgentById.get(pid)) || SIN_ASIGNAR;
      bump(key, (s) => { s.contratosActivos += 1; });
    }

    const finalize = (s: AgentStats) => {
      s.visitasPct = monthOverMonthPct(s.visitas, s.visitasPrev);
    };
    finalize(overallStats);
    byKey.forEach(finalize);
    finalize(sinAsignar);

    const agentRows = [...byKey.values()].sort((a, b) => b.visitas - a.visitas || b.carteraActiva - a.carteraActiva);
    const hasSinAsignar =
      sinAsignar.visitas > 0
      || sinAsignar.seguimientos > 0
      || sinAsignar.carteraActiva > 0
      || sinAsignar.contratosActivos > 0;

    return {
      overall: overallStats,
      rows: hasSinAsignar ? [...agentRows, sinAsignar] : agentRows,
    };
  }, [agents, properties, visits, contracts, range]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex items-center gap-2">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
          <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">
            Equipo comercial · {range === 'day' ? 'día' : 'mes'}
          </p>
          <span className="hidden text-[10px] text-gray-400 sm:inline">
            visitas, seguimientos y cartera por comercial · comparado con {vsLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-600 dark:bg-gray-900/50">
            {(['day', 'month'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  range === key
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {key === 'day' ? 'Día' : 'Mes'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/saas/team')}
            className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Equipo
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-gray-500">Cargando…</p>
      ) : agents.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">
          Aún no hay comerciales en el equipo.{' '}
          <button
            type="button"
            onClick={() => navigate('/saas/team')}
            className="font-bold text-[var(--v-blue,#2563eb)] hover:underline"
          >
            Añadir en Equipo
          </button>
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          <AgentBlock stats={overall} highlight defaultOpen vsLabel={vsLabel} />
          {rows.map((s) => (
            <AgentBlock key={s.key} stats={s} vsLabel={vsLabel} />
          ))}
        </div>
      )}
    </section>
  );
}
