import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { saasPathWithBusinessScope } from '../../../../lib/businessScopeUrl';
import { resolveBusinessScopeId } from '../../../../lib/deliverySetup';
import {
  buildEventQuoteListRows,
  loadAllEventQuotes,
  loadEvents,
  resolveEventsUserId,
  type EventQuoteListKind,
} from '../../../../lib/eventsFlow';
import { EVENT_TYPE_LABELS, type EventRecord, type EventType } from '../../../../lib/eventsTypes';
import { formatMoneyEs } from '../../../../lib/formatNumberEs';
import { Plus, Search, Loader2, ChevronRight, RefreshCw, Settings } from 'lucide-react';
import { EventsQuoteSettingsModal } from '../../../../components/saas/events/EventsQuoteSettingsModal';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_FOCUS_RING,
  VERTIAL_SURFACE,
} from '../../../../lib/vertialUiTokens';

const QUOTE_KIND_CONFIG: Record<EventQuoteListKind, { label: string; bg: string; text: string; bar: string }> = {
  borrador: {
    label: 'Borrador',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    bar: 'bg-slate-400',
  },
  enviado: {
    label: 'Enviado',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-800 dark:text-sky-300',
    bar: 'bg-sky-500',
  },
  aceptado: {
    label: 'Aceptado',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-800 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  rechazado: {
    label: 'Rechazado',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
};

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES');
}

function QuoteBadge({ kind }: { kind: EventQuoteListKind }) {
  const cfg = QUOTE_KIND_CONFIG[kind];
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

export function EventsQuotesPage() {
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
  const [quotesLoaded, setQuotesLoaded] = useState(false);
  const [quoteDocs, setQuoteDocs] = useState<Awaited<ReturnType<typeof loadAllEventQuotes>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<EventQuoteListKind | ''>('');
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(async () => {
    if (!dataUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, quotes] = await Promise.all([
        loadEvents(dataUserId),
        loadAllEventQuotes(dataUserId).catch(() => []),
      ]);
      setEvents(list);
      setQuoteDocs(quotes);
      setQuotesLoaded(true);
    } catch {
      /* Conservar lista */
    } finally {
      setLoading(false);
    }
  }, [dataUserId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const quotes = useMemo(
    () => (quotesLoaded ? buildEventQuoteListRows(events, quoteDocs) : []),
    [events, quoteDocs, quotesLoaded],
  );

  const kindCounts = useMemo(() => {
    const map = new Map<EventQuoteListKind | '', number>();
    map.set('', quotes.length);
    for (const k of Object.keys(QUOTE_KIND_CONFIG) as EventQuoteListKind[]) map.set(k, 0);
    for (const row of quotes) {
      map.set(row.kind, (map.get(row.kind) || 0) + 1);
    }
    return map;
  }, [quotes]);

  const filtered = useMemo(() => {
    return quotes
      .filter((row) => {
        const q = search.toLowerCase().trim();
        const matchQ = !q
          || row.nombre.toLowerCase().includes(q)
          || row.cliente.toLowerCase().includes(q)
          || row.lugar.toLowerCase().includes(q);
        const matchK = !filterKind || row.kind === filterKind;
        return matchQ && matchK;
      })
      .sort((a, b) => {
        const order: Record<EventQuoteListKind, number> = { borrador: 0, enviado: 1, rechazado: 2, aceptado: 3 };
        const byKind = order[a.kind] - order[b.kind];
        if (byKind !== 0) return byKind;
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
  }, [quotes, search, filterKind]);

  const totals = useMemo(() => {
    let importe = 0;
    for (const row of filtered) importe += row.importe;
    return { importe, count: filtered.length };
  }, [filtered]);

  const openEvent = (id: string) => navigate(scoped(`/saas/vertical/eventos/${id}`));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-4 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">Presupuestos</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              Borradores, enviados, aceptados y rechazados
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className={VERTIAL_BTN_SECONDARY}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className={`${VERTIAL_BTN_SECONDARY} !px-3`}
              title="Ajustes de eventos"
              aria-label="Ajustes de eventos"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate(scoped('/saas/vertical/eventos/nueva-contratacion'))}
              className={VERTIAL_BTN_PRIMARY}
            >
              <Plus className="w-4 h-4" /> Nuevo
            </button>
          </div>
        </div>

        <EventsQuoteSettingsModal
          open={showSettings}
          businessId={businessId || ''}
          onClose={() => setShowSettings(false)}
        />

        <div className={`${VERTIAL_SURFACE} p-3.5`}>
          <p className="text-[11px] font-medium text-stone-500">Importe (vista)</p>
          <p className="text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums mt-0.5">
            {formatMoneyEs(totals.importe)}
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">
            {totals.count} presupuesto{totals.count === 1 ? '' : 's'}
          </p>
        </div>

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
              active={!filterKind}
              label="Todos"
              count={kindCounts.get('') || 0}
              onClick={() => setFilterKind('')}
            />
            {(Object.keys(QUOTE_KIND_CONFIG) as EventQuoteListKind[]).map((k) => (
              <FilterChip
                key={k}
                active={filterKind === k}
                label={QUOTE_KIND_CONFIG[k].label}
                count={kindCounts.get(k) || 0}
                onClick={() => setFilterKind(filterKind === k ? '' : k)}
                dotClass={QUOTE_KIND_CONFIG[k].bar}
              />
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
          </div>
        ) : (
          <div className={`${VERTIAL_SURFACE} overflow-hidden`}>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 dark:bg-stone-900/80 text-left text-[11px] uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Evento</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold text-right">Importe</th>
                    <th className="px-2 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filtered.map((row) => {
                    const cfg = QUOTE_KIND_CONFIG[row.kind];
                    const tipoLabel = EVENT_TYPE_LABELS[(row.tipo || 'otro') as EventType] || 'Evento';
                    return (
                      <tr
                        key={row.id}
                        className="group hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer transition-colors"
                        onClick={() => openEvent(row.eventId)}
                      >
                        <td className="px-0 py-0">
                          <div className="flex items-stretch min-h-[64px]">
                            <span className={`w-1 shrink-0 ${cfg.bar}`} aria-hidden />
                            <div className="px-4 py-3 min-w-0">
                              <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                                {row.nombre}
                              </p>
                              <p className="text-[11px] text-stone-500 mt-0.5">
                                {tipoLabel}{row.lugar ? ` · ${row.lugar}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-stone-700 dark:text-stone-300">{row.cliente || '—'}</td>
                        <td className="px-4 py-3"><QuoteBadge kind={row.kind} /></td>
                        <td className="px-4 py-3 text-stone-600 dark:text-stone-400 whitespace-nowrap tabular-nums">
                          {fmtDate(row.date)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-stone-900 dark:text-stone-100 tabular-nums whitespace-nowrap">
                          {formatMoneyEs(row.importe)}
                        </td>
                        <td className="px-2 py-3 text-stone-300 group-hover:text-[var(--v-blue,#2563eb)]">
                          <ChevronRight className="w-4 h-4" />
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-stone-400">
                        {quotes.length === 0
                          ? 'Aún no hay presupuestos. Pulsa Nuevo para crear el primero.'
                          : 'Sin presupuestos con estos filtros'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <ul className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
              {filtered.map((row) => {
                const cfg = QUOTE_KIND_CONFIG[row.kind];
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => openEvent(row.eventId)}
                      className="w-full flex text-left hover:bg-stone-50 dark:hover:bg-stone-900/40"
                    >
                      <span className={`w-1 shrink-0 ${cfg.bar}`} aria-hidden />
                      <div className="flex-1 min-w-0 px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">{row.nombre}</p>
                            <p className="text-xs text-stone-500 mt-0.5">{row.cliente} · {fmtDate(row.date)}</p>
                          </div>
                          <QuoteBadge kind={row.kind} />
                        </div>
                        <p className="text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                          {formatMoneyEs(row.importe)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
              {!filtered.length && (
                <li className="px-4 py-12 text-center text-stone-400 text-sm">
                  {quotes.length === 0
                    ? 'Aún no hay presupuestos. Pulsa Nuevo para crear el primero.'
                    : 'Sin presupuestos con estos filtros'}
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
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'bg-blue-50 text-[var(--v-blue,#2563eb)] border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
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
