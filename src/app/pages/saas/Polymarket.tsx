import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import {
  fetchPolymarketEvents,
  fetchPriceHistory,
  getYesAssetId,
  parseOutcomePrices,
  type PolymarketEvent,
  type PolymarketMarket,
} from '../../lib/polymarketApi';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Info,
  Zap,
  Filter,
} from 'lucide-react';
import { PeriodBadge } from '../../components/ui/PeriodBadge';
import { LiveMarketSidebar, LiveMarketButton, type PolymarketEventSummary } from '../../components/saas/LiveMarketSidebar';
import { format, formatDistanceToNow, parseISO, isPast } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SortField = 'endDate' | 'volume' | 'liquidity' | 'volume24hr';
type SortDir = 'asc' | 'desc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M $`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k $`;
  return `${n.toFixed(0)} $`;
}

function formatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function timeUntilEnd(endDate?: string): string | null {
  if (!endDate) return null;
  const end = parseISO(endDate);
  if (isPast(end)) return 'Finalizado';
  return formatDistanceToNow(end, { addSuffix: true, locale: es });
}

// ─── Modal de invertir ───────────────────────────────────────────────────────

interface InvestModalProps {
  event: PolymarketEvent | null;
  onClose: () => void;
}

function InvestModal({ event, onClose }: InvestModalProps) {
  useModalClose(!!event, onClose);
  const [priceHistory, setPriceHistory] = useState<{ t: number; p: number }[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

  const primaryMarket = event?.markets?.[0];
  const canTrade = primaryMarket?.enableOrderBook ?? false;
  const prices = primaryMarket?.outcomePrices
    ? parseOutcomePrices(primaryMarket.outcomePrices)
    : { yes: 0.5, no: 0.5 };

  useEffect(() => {
    if (!event || !primaryMarket) return;
    const assetId = getYesAssetId(primaryMarket);
    if (!assetId) return;
    setLoadingChart(true);
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - 7 * 24 * 3600; // 7 días
    fetchPriceHistory(assetId, { interval: '1d', startTs, endTs })
      .then(setPriceHistory)
      .finally(() => setLoadingChart(false));
  }, [event, primaryMarket]);

  const chartData = priceHistory.map(({ t, p }) => ({
    date: format(new Date(t * 1000), 'd MMM', { locale: es }),
    price: p,
    full: format(new Date(t * 1000), "d MMM yyyy HH:mm", { locale: es }),
  }));

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              {event.title || 'Mercado'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {event.subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <XCircle className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Estado: ¿Se puede invertir? */}
          <div
            className={`rounded-xl border-2 p-4 flex items-center gap-4 ${
              canTrade
                ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800'
                : 'border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800'
            }`}
          >
            {canTrade ? (
              <>
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                    Acepta órdenes
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Este mercado tiene order book activo. Puedes comprar/vender en Polymarket.
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="w-10 h-10 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-200">
                    No acepta órdenes
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    El order book no está habilitado. Las órdenes no aparecerán en el libro.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Precios actuales */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Sí
              </p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatPercent(prices.yes)}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                No
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatPercent(prices.no)}
              </p>
            </div>
          </div>

          {/* Gráfica de precios */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative">
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Historial de precios (Sí)
                </p>
              </div>
              <div className="h-48 p-4 relative">
                <div className="absolute top-2 right-4 z-10"><PeriodBadge period="7d" variant="glass" className="text-[9px] tracking-[0.2em] opacity-75 dark:opacity-80" /></div>
                {loadingChart ? (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: number) => [`${formatPercent(v)}`, 'Precio Sí']}
                        labelFormatter={l => l}
                      />
                      <Area type="monotone" dataKey="price" stroke="#10b981" fill="url(#priceGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Info extra */}
          <div className="flex flex-wrap gap-2 text-sm">
            {event.volume != null && (
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                Volumen: {formatVolume(event.volume)}
              </span>
            )}
            {event.liquidity != null && (
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                Liquidez: {formatVolume(event.liquidity)}
              </span>
            )}
            {event.endDate && (
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                Cierra: {format(parseISO(event.endDate), "d MMM yyyy", { locale: es })}
              </span>
            )}
          </div>

          {/* Botón a Polymarket */}
          <a
            href={`https://polymarket.com/event/${event.slug || event.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir en Polymarket para invertir
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de evento ───────────────────────────────────────────────────────

interface EventCardProps {
  event: PolymarketEvent;
  onInvest: (e: PolymarketEvent) => void;
}

function EventCard({ event, onInvest }: EventCardProps) {
  const primaryMarket = event.markets?.[0];
  const canTrade = primaryMarket?.enableOrderBook ?? false;
  const prices = primaryMarket?.outcomePrices
    ? parseOutcomePrices(primaryMarket.outcomePrices)
    : { yes: 0.5, no: 0.5 };
  const timeLeft = timeUntilEnd(event.endDate);

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
      onClick={() => onInvest(event)}
    >
      <div className="flex flex-col sm:flex-row">
        {event.image && (
          <div className="sm:w-40 h-32 sm:h-auto shrink-0 bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <img
              src={event.image}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
        <div className="flex-1 p-4 sm:p-5 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
              {event.title || 'Sin título'}
            </h3>
            {canTrade ? (
              <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Acepta órdenes
              </span>
            ) : (
              <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                <XCircle className="w-3 h-3" /> Sin order book
              </span>
            )}
          </div>
          {event.subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
              {event.subtitle}
            </p>
          )}

          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                Sí {formatPercent(prices.yes)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-sm font-bold text-red-600 dark:text-red-400">
                No {formatPercent(prices.no)}
              </span>
            </div>
            {timeLeft && (
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <Clock className="w-4 h-4" />
                <span className="text-sm">{timeLeft}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {event.volume != null && (
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Vol: {formatVolume(event.volume)}
              </span>
            )}
            {event.liquidity != null && (
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Liq: {formatVolume(event.liquidity)}
              </span>
            )}
            {event.volume24hr != null && event.volume24hr > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                24h: {formatVolume(event.volume24hr)}
              </span>
            )}
          </div>

          <button
            onClick={e => {
              e.stopPropagation();
              onInvest(event);
            }}
            className="mt-4 w-full sm:w-auto flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            <Zap className="w-4 h-4" />
            Invertir / Ver detalles
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function Polymarket() {
  const [events, setEvents] = useState<PolymarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('endDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedEvent, setSelectedEvent] = useState<PolymarketEvent | null>(null);
  const [filterActive, setFilterActive] = useState(true);
  const [liveMarketOpen, setLiveMarketOpen] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPolymarketEvents({
        limit: 60,
        order: sortField,
        ascending: sortDir === 'asc',
        active: filterActive ? true : undefined,
        closed: filterActive ? false : undefined,
        end_date_min: filterActive ? new Date().toISOString() : undefined,
      });
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar mercados');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortDir, filterActive]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Resúmenes para el sidebar de Polymarket
  const polymarketSummaries: PolymarketEventSummary[] = events.map(ev => {
    const m = ev.markets?.[0];
    const prices = m?.outcomePrices
      ? parseOutcomePrices(m.outcomePrices)
      : { yes: 0.5, no: 0.5 };
    return {
      id: ev.id,
      title: ev.title ?? 'Sin título',
      slug: ev.slug,
      endDate: ev.endDate,
      yesPrice: prices.yes,
      noPrice: prices.no,
      volume: ev.volume,
      volume24hr: ev.volume24hr,
      liquidity: ev.liquidity,
      enableOrderBook: m?.enableOrderBook ?? false,
    };
  });

  const sortedEvents = [...events].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (sortField === 'endDate') {
      const aDate = aVal ? new Date(aVal as string).getTime() : 0;
      const bDate = bVal ? new Date(bVal as string).getTime() : 0;
      return sortDir === 'asc' ? aDate - bDate : bDate - aDate;
    }
    const aNum = Number(aVal) ?? 0;
    const bNum = Number(bVal) ?? 0;
    return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortLabels: Record<SortField, string> = {
    endDate: 'Tiempo hasta cierre',
    volume: 'Volumen',
    liquidity: 'Liquidez',
    volume24hr: 'Vol. 24h',
  };

  return (
    <Layout title="Mercados Polymarket" subtitle="Mercados de predicción · Invierte en eventos">
      <div className="space-y-6">
        {/* Barra de controles */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ordenar por:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(sortLabels) as SortField[]).map(field => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                    sortField === field
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {sortLabels[field]}
                  {sortField === field && (
                    sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <LiveMarketButton onClick={() => setLiveMarketOpen(true)} />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterActive}
                onChange={e => setFilterActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">Solo activos</span>
            </label>
            <button
              onClick={loadEvents}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={loadEvents}
              className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/70"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <RefreshCw className="w-12 h-12 animate-spin mb-4" />
            <p>Cargando mercados de Polymarket...</p>
          </div>
        )}

        {/* Lista de eventos */}
        {!loading && events.length > 0 && (
          <div className="grid gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {sortedEvents.length} mercados · Ordenados por {sortLabels[sortField]} (
              {sortDir === 'asc' ? 'ascendente' : 'descendente'})
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedEvents.map(event => (
                <EventCard key={event.id} event={event} onInvest={setSelectedEvent} />
              ))}
            </div>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No hay mercados disponibles</p>
            <p className="text-sm mt-1">Prueba cambiar los filtros o actualizar más tarde.</p>
          </div>
        )}
      </div>

      {/* Modal de invertir */}
      <InvestModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />

      {/* Mercado en Vivo + datos Polymarket */}
      <LiveMarketSidebar
        isOpen={liveMarketOpen}
        onClose={() => setLiveMarketOpen(false)}
        polymarketEvents={polymarketSummaries}
        onPolymarketEventClick={id => {
          const ev = events.find(e => e.id === id);
          if (ev) {
            setSelectedEvent(ev);
            setLiveMarketOpen(false);
          }
        }}
      />
    </Layout>
  );
}
