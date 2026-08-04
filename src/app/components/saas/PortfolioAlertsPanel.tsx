import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, Bell, RefreshCw } from 'lucide-react';
import {
  fetchAlertSummary,
  fetchAlerts,
  normalizeAlertSummary,
  SOURCE_LABELS,
  type AlertRecord,
  type AlertSource,
  type AlertSummary,
} from '../../lib/alertCenterApi';

type PortfolioAlertRow = {
  businessId: string;
  businessName: string;
  summary: AlertSummary;
};

type CriticalHit = {
  id: string;
  businessId: string;
  businessName: string;
  title: string;
  source: AlertSource;
  route?: string;
  priority: AlertRecord['priority'];
  createdAt: string;
};

interface PortfolioAlertsPanelProps {
  rows: { businessId: string; business: { name: string } }[];
}

export function PortfolioAlertsPanel({ rows }: PortfolioAlertsPanelProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PortfolioAlertRow[]>([]);
  const [critical, setCritical] = useState<CriticalHit[]>([]);
  const [loading, setLoading] = useState(true);

  const rowIdsKey = useMemo(
    () => rows.map((r) => r.businessId).filter(Boolean).sort().join('|'),
    [rows],
  );

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const load = useCallback(async () => {
    const snapshot = rowsRef.current;
    if (!snapshot.length) {
      setItems([]);
      setCritical([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        snapshot.map(async (r) => {
          try {
            const res = await fetchAlertSummary(r.businessId);
            return {
              businessId: r.businessId,
              businessName: r.business.name,
              summary: normalizeAlertSummary(res.summary),
            };
          } catch {
            return {
              businessId: r.businessId,
              businessName: r.business.name,
              summary: normalizeAlertSummary(null),
            };
          }
        }),
      );
      setItems(results);

      const hot = [...results]
        .filter((i) => i.summary.byPriority.high > 0 || i.summary.unresolved > 0)
        .sort(
          (a, b) =>
            b.summary.byPriority.high - a.summary.byPriority.high
            || b.summary.unresolved - a.summary.unresolved,
        )
        .slice(0, 5);

      const hits = (
        await Promise.all(
          hot.map(async (biz) => {
            try {
              const res = await fetchAlerts(biz.businessId, {
                priority: biz.summary.byPriority.high > 0 ? 'high' : undefined,
                status: 'new,seen',
                limit: 3,
                sort: 'createdAt',
                order: 'desc',
              });
              return (res.alerts || []).map((a) => ({
                id: a.id,
                businessId: biz.businessId,
                businessName: biz.businessName,
                title: a.title || a.message || 'Alerta',
                source: a.source,
                route: a.route,
                priority: a.priority,
                createdAt: a.createdAt,
              }));
            } catch {
              return [];
            }
          }),
        )
      )
        .flat()
        .sort((a, b) => {
          const p = (x: CriticalHit) => (x.priority === 'high' ? 0 : x.priority === 'medium' ? 1 : 2);
          return p(a) - p(b) || String(b.createdAt).localeCompare(String(a.createdAt));
        })
        .slice(0, 6);

      setCritical(hits);
    } finally {
      setLoading(false);
    }
  }, [rowIdsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const aggregate = useMemo(() => {
    let unresolved = 0;
    let high = 0;
    let newest = 0;
    const bySource: Partial<Record<AlertSource, number>> = {};
    for (const item of items) {
      unresolved += item.summary.unresolved;
      high += item.summary.byPriority.high;
      newest += item.summary.byStatus.new;
      for (const [src, count] of Object.entries(item.summary.bySource || {})) {
        const key = src as AlertSource;
        bySource[key] = (bySource[key] || 0) + (Number(count) || 0);
      }
    }
    return { unresolved, high, newest, bySource };
  }, [items]);

  const openAlert = (hit: CriticalHit) => {
    if (hit.route) {
      navigate(hit.route);
      return;
    }
    navigate('/saas/alerts');
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3.5 sm:px-5 dark:border-slate-800">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Bell className="h-4 w-4 text-amber-500" />
            Sala de alertas
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Críticas del grupo · acción rápida</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="vsaas-btn-ghost !min-h-9 !py-1.5 !text-[11px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => navigate('/saas/alerts')}
            className="vsaas-btn-ghost !min-h-9 !py-1.5 !text-[11px]"
          >
            Centro
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : aggregate.unresolved === 0 ? (
        <div className="px-4 py-8 text-center sm:px-5">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Sin alertas activas</p>
          <p className="mt-1 text-xs text-slate-400">
            {rows.length} empresa{rows.length !== 1 ? 's' : ''} revisada{rows.length !== 1 ? 's' : ''}
          </p>
        </div>
      ) : (
        <div className="px-4 py-4 sm:px-5">
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <StatChip
              label="Activas"
              value={aggregate.unresolved}
              tone="rose"
            />
            <StatChip
              label="Urgentes"
              value={aggregate.high}
              tone="amber"
            />
            <StatChip
              label="Sin leer"
              value={aggregate.newest}
              tone="blue"
            />
          </div>

          {critical.length > 0 ? (
            <div className="mb-3 overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
              {critical.map((hit) => (
                <button
                  key={`${hit.businessId}:${hit.id}`}
                  type="button"
                  onClick={() => openAlert(hit)}
                  className="flex w-full items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      hit.priority === 'high' ? 'text-rose-500' : 'text-amber-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-slate-900 dark:text-white">
                      {hit.title}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {hit.businessName}
                      {hit.source ? ` · ${SOURCE_LABELS[hit.source] || hit.source}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold text-[var(--v-blue,#2563eb)]">
                    Ver
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => navigate('/saas/alerts')}
            className="vsaas-btn-advance w-full !min-h-10 !text-[12px]"
          >
            Abrir centro de alertas
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'rose' | 'amber' | 'blue';
}) {
  const tones = {
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300',
  };
  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
