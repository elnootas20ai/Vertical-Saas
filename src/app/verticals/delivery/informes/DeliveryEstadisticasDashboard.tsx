/**
 * Dashboard de 5 estadísticas (%) en Informes → Estadísticas.
 * Datos reales del periodo (30 días) vía delivery-reports.
 */
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Percent,
  RefreshCw,
  Store,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  fetchDeliveryCanales,
  fetchDeliveryIncidencias,
  fetchDeliveryReportKpis,
} from '../../../lib/deliveryReportsApi';

type StatCard = {
  id: string;
  title: string;
  value: number | null;
  sub: string;
  tone: 'emerald' | 'rose' | 'indigo' | 'amber' | 'violet';
  icon: typeof Percent;
};

function pct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${pct(n).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}

function periodRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

const TONE: Record<StatCard['tone'], string> = {
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
};

export function DeliveryEstadisticasDashboard({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatCard[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setStats([]);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const range = periodRange();

    void (async () => {
      try {
        const [kpiRes, incRes, canalRes] = await Promise.all([
          fetchDeliveryReportKpis(userId, range, ac.signal),
          fetchDeliveryIncidencias(userId, range, ac.signal),
          fetchDeliveryCanales(userId, range, ac.signal),
        ]);

        const kpis = (kpiRes as { kpis?: any })?.kpis || {};
        const incPayload = (incRes as {
          entregados?: number;
          resumen?: {
            total?: number;
            cancelados?: number;
            tasaIncidenciaPct?: number;
          };
        }) || {};
        const canalesPayload = (canalRes as { canales?: any[]; resumen?: any }) || {};

        const entregados =
          Number(incPayload.entregados ?? kpis.ventasPeriodo?.pedidos ?? 0) || 0;
        const cancelados =
          Number(incPayload.resumen?.cancelados ?? kpis.incidencias?.cancelados ?? 0) || 0;
        const incidenciasTotal =
          Number(incPayload.resumen?.total ?? kpis.incidencias?.total ?? 0) || 0;
        const basePedidos = entregados + cancelados;
        const entregaOkPct = basePedidos > 0 ? (entregados / basePedidos) * 100 : null;
        const cancelPct = basePedidos > 0 ? (cancelados / basePedidos) * 100 : null;
        const incidenciasPct =
          incPayload.resumen?.tasaIncidenciaPct != null
            ? Number(incPayload.resumen.tasaIncidenciaPct)
            : basePedidos > 0
              ? (incidenciasTotal / Math.max(basePedidos, 1)) * 100
              : null;

        const vsPrev = kpis.ventasPeriodo?.vsPrevPeriod;
        const variacionPct =
          vsPrev == null || vsPrev === '' ? null : Number(vsPrev);

        const canales = Array.isArray(canalesPayload.canales) ? canalesPayload.canales : [];
        const propio = canales.find((c: any) => {
          const key = String(c.canal || c.label || '').toLowerCase();
          return key.includes('propio') || key.includes('web') || key.includes('tpv') || key === 'own';
        });
        const topCanal = [...canales].sort(
          (a: any, b: any) => Number(b.pctVentas || 0) - Number(a.pctVentas || 0),
        )[0];
        const canalPropioPct =
          propio?.pctVentas != null
            ? Number(propio.pctVentas)
            : topCanal?.pctVentas != null
              ? Number(topCanal.pctVentas)
              : null;
        const canalLabel = propio
          ? 'Canal propio / web'
          : topCanal
            ? `Top canal (${topCanal.label || topCanal.canal || '—'})`
            : 'Peso del canal principal';

        setStats([
          {
            id: 'entrega-ok',
            title: 'Entregas OK',
            value: entregaOkPct,
            sub: `${entregados.toLocaleString('es-ES')} entregados · 30 días`,
            tone: 'emerald',
            icon: Truck,
          },
          {
            id: 'cancelacion',
            title: 'Cancelaciones',
            value: cancelPct,
            sub: `${cancelados.toLocaleString('es-ES')} cancelados`,
            tone: 'rose',
            icon: AlertTriangle,
          },
          {
            id: 'variacion-ventas',
            title: 'Variación ventas',
            value: variacionPct,
            sub: 'vs periodo anterior',
            tone: 'indigo',
            icon: TrendingUp,
          },
          {
            id: 'canal',
            title: canalLabel,
            value: canalPropioPct,
            sub: 'Sobre ingresos del periodo',
            tone: 'amber',
            icon: Store,
          },
          {
            id: 'incidencias',
            title: 'Tasa de incidencias',
            value: incidenciasPct,
            sub: `${incidenciasTotal.toLocaleString('es-ES')} incidencias`,
            tone: 'violet',
            icon: Percent,
          },
        ]);
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas');
        setStats([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [userId, tick]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Dashboard · 5 estadísticas
          </p>
          <p className="text-xs text-stone-500">Porcentajes del negocio · últimos 30 días</p>
        </div>
        <button
          type="button"
          onClick={() => setTick((n) => n + 1)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(loading && stats.length === 0
          ? Array.from({ length: 5 }, (_, i) => ({ id: `sk-${i}` }) as { id: string })
          : stats
        ).map((s, idx) => {
          if (loading && stats.length === 0) {
            return (
              <div
                key={s.id}
                className="h-28 animate-pulse rounded-2xl border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
              />
            );
          }
          const card = stats[idx];
          if (!card) return null;
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {card.title}
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
                    {formatPct(card.value)}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">{card.sub}</p>
                </div>
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[card.tone]}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div
                  className="h-full rounded-full bg-current opacity-70"
                  style={{
                    width: `${Math.max(0, Math.min(100, Math.abs(card.value ?? 0)))}%`,
                    color:
                      card.tone === 'emerald'
                        ? '#059669'
                        : card.tone === 'rose'
                          ? '#e11d48'
                          : card.tone === 'indigo'
                            ? '#4f46e5'
                            : card.tone === 'amber'
                              ? '#d97706'
                              : '#7c3aed',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
