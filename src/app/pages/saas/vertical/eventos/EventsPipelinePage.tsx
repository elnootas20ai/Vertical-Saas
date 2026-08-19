import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { saasPathWithBusinessScope } from '../../../../lib/businessScopeUrl';
import { resolveBusinessScopeId } from '../../../../lib/deliverySetup';
import { loadEvents, resolveEventsUserId } from '../../../../lib/eventsFlow';
import { summarizeEventFinancials } from '../../../../lib/eventsFinance';
import {
  EVENT_CONTRACT_STAGES,
  EVENT_STAGE_CONFIG,
  EVENT_TYPE_LABELS,
  type EventContractStage,
  type EventRecord,
  type EventType,
} from '../../../../lib/eventsTypes';
import { EventStageBadge } from '../../../../components/saas/events/EventContractStepper';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_FOCUS_RING,
  VERTIAL_SURFACE,
} from '../../../../lib/vertialUiTokens';
import {
  Plus, Search, Loader2, ChevronRight, Banknote, AlertCircle, RefreshCw,
} from 'lucide-react';

type PayFilter = '' | 'pendiente' | 'parcial' | 'cobrado';

function fmtEuro(n: number): string {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES');
}

function paymentStatus(event: EventRecord): {
  kind: 'sin_importe' | 'sin_cobro' | 'parcial' | 'cobrado';
  label: string;
  cobrado: number;
  pendiente: number;
  presupuesto: number;
  pct: number;
} {
  const fin = summarizeEventFinancials(event);
  if (fin.presupuesto <= 0) {
    return { kind: 'sin_importe', label: 'Sin importe', cobrado: 0, pendiente: 0, presupuesto: 0, pct: 0 };
  }
  const pct = Math.min(100, Math.round((fin.cobradoTotal / fin.presupuesto) * 100));
  if (fin.pendiente <= 0.01) {
    return { kind: 'cobrado', label: 'Cobrado', cobrado: fin.cobradoTotal, pendiente: 0, presupuesto: fin.presupuesto, pct: 100 };
  }
  if (fin.cobradoTotal > 0) {
    return { kind: 'parcial', label: 'Parcial', cobrado: fin.cobradoTotal, pendiente: fin.pendiente, presupuesto: fin.presupuesto, pct };
  }
  return { kind: 'sin_cobro', label: 'Pendiente', cobrado: 0, pendiente: fin.pendiente, presupuesto: fin.presupuesto, pct: 0 };
}

function PaymentCell({ event }: { event: EventRecord }) {
  const pay = paymentStatus(event);
  if (pay.kind === 'sin_importe') {
    return <span className="text-xs text-stone-400">—</span>;
  }

  const fin = summarizeEventFinancials(event);
  const barClass =
    pay.kind === 'cobrado'
      ? 'bg-emerald-500'
      : pay.kind === 'parcial'
        ? 'bg-amber-500'
        : 'bg-stone-300 dark:bg-stone-600';

  const labelClass =
    pay.kind === 'cobrado'
      ? 'text-emerald-700 dark:text-emerald-300'
      : pay.kind === 'parcial'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-rose-700 dark:text-rose-300';

  return (
    <div className="min-w-[140px]">
      <div className="flex items-baseline justify-end gap-1.5">
        <span className={`text-[11px] font-semibold ${labelClass}`}>{pay.label}</span>
        <span className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
          {fmtEuro(pay.cobrado)}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pay.pct}%` }} />
      </div>
      <p className="mt-0.5 text-[10px] text-stone-500 text-right tabular-nums">
        {fin.depositoCobrado > 0 ? `Señal ${fmtEuro(fin.depositoCobrado)}` : 'Sin señal'}
        {fin.cobradoFinal > 0 ? ` · Resto ${fmtEuro(fin.cobradoFinal)}` : ''}
        {pay.pendiente > 0.01 ? ` · Falta ${fmtEuro(pay.pendiente)}` : ''}
      </p>
    </div>
  );
}

export function EventsPipelinePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const scoped = (path: string) => saasPathWithBusinessScope(path, businessId);
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState<EventContractStage | ''>('');
  const [filterPay, setFilterPay] = useState<PayFilter>('');

  const refresh = useCallback(async () => {
    if (!dataUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setEvents(await loadEvents(dataUserId));
    } catch {
      /* Conservar lista: un fallo no puede vaciar contrataciones. */
    } finally {
      setLoading(false);
    }
  }, [dataUserId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const stageCounts = useMemo(() => {
    const map = new Map<EventContractStage | '', number>();
    map.set('', events.length);
    for (const s of EVENT_CONTRACT_STAGES) map.set(s.id, 0);
    for (const e of events) {
      map.set(e.estado, (map.get(e.estado) || 0) + 1);
    }
    return map;
  }, [events]);

  const payCounts = useMemo(() => {
    let pendiente = 0;
    let parcial = 0;
    let cobrado = 0;
    for (const e of events) {
      const k = paymentStatus(e).kind;
      if (k === 'sin_cobro') pendiente += 1;
      else if (k === 'parcial') parcial += 1;
      else if (k === 'cobrado') cobrado += 1;
    }
    return { pendiente, parcial, cobrado };
  }, [events]);

  const filtered = useMemo(() => {
    return events
      .filter((e) => {
        const q = search.toLowerCase().trim();
        const matchQ = !q
          || String(e.nombre || '').toLowerCase().includes(q)
          || String(e.cliente || '').toLowerCase().includes(q)
          || String(e.lugar || '').toLowerCase().includes(q);
        const matchS = !filterStage || e.estado === filterStage;
        const pay = paymentStatus(e);
        const matchP =
          !filterPay
          || (filterPay === 'pendiente' && pay.kind === 'sin_cobro')
          || (filterPay === 'parcial' && pay.kind === 'parcial')
          || (filterPay === 'cobrado' && pay.kind === 'cobrado');
        return matchQ && matchS && matchP;
      })
      .sort((a, b) => {
        const payA = paymentStatus(a);
        const payB = paymentStatus(b);
        // Prioriza pendientes de cobro, luego fecha del evento
        const rank = (k: typeof payA.kind) => (k === 'sin_cobro' ? 0 : k === 'parcial' ? 1 : k === 'cobrado' ? 2 : 3);
        const byPay = rank(payA.kind) - rank(payB.kind);
        if (byPay !== 0) return byPay;
        return String(a.fecha || '').localeCompare(String(b.fecha || ''));
      });
  }, [events, search, filterStage, filterPay]);

  const totals = useMemo(() => {
    let presupuesto = 0;
    let cobrado = 0;
    let pendiente = 0;
    for (const e of filtered) {
      const p = paymentStatus(e);
      presupuesto += p.presupuesto;
      cobrado += p.cobrado;
      pendiente += p.pendiente;
    }
    return { presupuesto, cobrado, pendiente, count: filtered.length };
  }, [filtered]);

  const openEvent = (id: string) => navigate(scoped(`/saas/vertical/eventos/${id}`));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-4 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">Contrataciones</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              Fase, cobros y pendiente de cada evento
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-sm font-medium text-stone-700 dark:text-stone-200"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => navigate(scoped('/saas/vertical/eventos/nueva-contratacion'))}
              className={VERTIAL_BTN_PRIMARY}
            >
              <Plus className="w-4 h-4" /> Nueva
            </button>
          </div>
        </div>

        {/* Resumen rápido del filtro actual */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={`${VERTIAL_SURFACE} p-3.5`}>
            <p className="text-[11px] font-medium text-stone-500">Presupuesto (vista)</p>
            <p className="text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums mt-0.5">
              {fmtEuro(totals.presupuesto)}
            </p>
            <p className="text-[11px] text-stone-400 mt-0.5">{totals.count} evento{totals.count === 1 ? '' : 's'}</p>
          </div>
          <div className={`${VERTIAL_SURFACE} p-3.5`}>
            <p className="text-[11px] font-medium text-stone-500 inline-flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Cobrado
            </p>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
              {fmtEuro(totals.cobrado)}
            </p>
          </div>
          <div className={`${VERTIAL_SURFACE} p-3.5`}>
            <p className="text-[11px] font-medium text-stone-500 inline-flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Pendiente
            </p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-0.5">
              {fmtEuro(totals.pendiente)}
            </p>
          </div>
        </div>

        {/* Controles */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm ${VERTIAL_FOCUS_RING}`}
              placeholder="Buscar evento, cliente o lugar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={!filterStage}
              label="Todas"
              count={stageCounts.get('') || 0}
              onClick={() => setFilterStage('')}
            />
            {EVENT_CONTRACT_STAGES.filter((s) => s.id !== 'cancelado' || (stageCounts.get('cancelado') || 0) > 0).map((s) => (
              <FilterChip
                key={s.id}
                active={filterStage === s.id}
                label={s.label}
                count={stageCounts.get(s.id) || 0}
                onClick={() => setFilterStage(filterStage === s.id ? '' : s.id)}
                dotClass={EVENT_STAGE_CONFIG[s.id].bar}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] font-semibold text-stone-400 self-center mr-1">Cobro</span>
            <FilterChip active={!filterPay} label="Todos" onClick={() => setFilterPay('')} />
            <FilterChip
              active={filterPay === 'pendiente'}
              label="Sin cobrar"
              count={payCounts.pendiente}
              onClick={() => setFilterPay(filterPay === 'pendiente' ? '' : 'pendiente')}
              tone="rose"
            />
            <FilterChip
              active={filterPay === 'parcial'}
              label="Parcial"
              count={payCounts.parcial}
              onClick={() => setFilterPay(filterPay === 'parcial' ? '' : 'parcial')}
              tone="amber"
            />
            <FilterChip
              active={filterPay === 'cobrado'}
              label="Cobrado"
              count={payCounts.cobrado}
              onClick={() => setFilterPay(filterPay === 'cobrado' ? '' : 'cobrado')}
              tone="emerald"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
          </div>
        ) : (
          <div className={`${VERTIAL_SURFACE} overflow-hidden`}>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 dark:bg-stone-900/80 text-left text-[11px] uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Evento</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Fase</th>
                    <th className="px-4 py-3 font-semibold text-right">Presupuesto</th>
                    <th className="px-4 py-3 font-semibold text-right">Cobro</th>
                    <th className="px-2 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filtered.map((event) => {
                    const stageCfg = EVENT_STAGE_CONFIG[event.estado] || EVENT_STAGE_CONFIG.presupuesto;
                    const tipoLabel = EVENT_TYPE_LABELS[(event.tipo || 'otro') as EventType] || 'Evento';
                    return (
                      <tr
                        key={event._id}
                        className="group hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer transition-colors"
                        onClick={() => openEvent(event._id)}
                      >
                        <td className="px-0 py-0">
                          <div className="flex items-stretch min-h-[64px]">
                            <span className={`w-1 shrink-0 ${stageCfg.bar}`} aria-hidden />
                            <div className="px-4 py-3 min-w-0">
                              <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                                {event.nombre}
                              </p>
                              <p className="text-[11px] text-stone-500 mt-0.5">{tipoLabel}{event.lugar ? ` · ${event.lugar}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-stone-700 dark:text-stone-300">{event.cliente || '—'}</td>
                        <td className="px-4 py-3 text-stone-600 dark:text-stone-400 whitespace-nowrap tabular-nums">
                          {fmtDate(event.fecha)}
                        </td>
                        <td className="px-4 py-3"><EventStageBadge stage={event.estado} /></td>
                        <td className="px-4 py-3 text-right font-semibold text-stone-900 dark:text-stone-100 tabular-nums whitespace-nowrap">
                          {fmtEuro(Number(event.presupuesto) || 0)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <PaymentCell event={event} />
                        </td>
                        <td className="px-2 py-3 text-stone-300 group-hover:text-[var(--v-blue,#2563eb)]">
                          <ChevronRight className="w-4 h-4" />
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-stone-400">
                        {events.length === 0
                          ? 'Aún no hay contrataciones. Pulsa Nueva para crear la primera.'
                          : 'Sin contrataciones con estos filtros'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
              {filtered.map((event) => {
                const stageCfg = EVENT_STAGE_CONFIG[event.estado] || EVENT_STAGE_CONFIG.presupuesto;
                return (
                  <li key={event._id}>
                    <button
                      type="button"
                      onClick={() => openEvent(event._id)}
                      className="w-full flex text-left hover:bg-stone-50 dark:hover:bg-stone-900/40"
                    >
                      <span className={`w-1 shrink-0 ${stageCfg.bar}`} aria-hidden />
                      <div className="flex-1 min-w-0 px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">{event.nombre}</p>
                            <p className="text-xs text-stone-500 mt-0.5">{event.cliente} · {fmtDate(event.fecha)}</p>
                          </div>
                          <EventStageBadge stage={event.estado} />
                        </div>
                        <div className="flex items-end justify-between gap-3">
                          <span className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                            {fmtEuro(Number(event.presupuesto) || 0)}
                          </span>
                          <PaymentCell event={event} />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
              {!filtered.length && (
                <li className="px-4 py-12 text-center text-stone-400 text-sm">
                  {events.length === 0
                    ? 'Aún no hay contrataciones. Pulsa Nueva para crear la primera.'
                    : 'Sin contrataciones con estos filtros'}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </Layout>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
  dotClass,
  tone,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  dotClass?: string;
  tone?: 'rose' | 'amber' | 'emerald';
}) {
  const activeTone =
    tone === 'rose'
      ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
        : tone === 'emerald'
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800'
          : 'bg-blue-50 text-[var(--v-blue,#2563eb)] border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? activeTone
          : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
      }`}
    >
      {dotClass && <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />}
      {label}
      {typeof count === 'number' && (
        <span className={`tabular-nums ${active ? 'opacity-80' : 'text-stone-400'}`}>{count}</span>
      )}
    </button>
  );
}
