import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { useEffectivePlanTier } from '../../../hooks/useEffectivePlanTier';
import type { DeliveryInformeEntry } from './deliveryInformesCatalog';
import {
  canAccessDeliveryInforme,
  deliveryInformeMinPlanLabel,
} from './deliveryInformesPlanAccess';
import { DeliveryInformePeriodPicker } from './DeliveryInformePeriodPicker';
import {
  InformeDashboardView,
  InformePlanLockedCard,
} from './InformeDashboardView';
import { loadDeliveryInforme } from './loaders/loadDeliveryInforme';
import {
  informePeriodLabel,
  informePeriodRange,
  type InformeDashboard,
  type InformeFilters,
  type InformePeriod,
} from './loaders/informeTypes';
import {
  VertialInformeProgress,
  VertialInformeReadyCard,
  VertialInformeUnavailableCard,
  downloadInforme,
} from './VertialInformeProgress';

type Phase = 'locked' | 'period' | 'loading' | 'ready' | 'unavailable' | 'error';

function extraFiltersFor(entry: DeliveryInformeEntry) {
  if (entry.id === 'finanzas-ingresos') return { category: true, employee: true };
  if (entry.id === 'finanzas-gastos') return { category: true, provider: true };
  if (entry.id === 'finanzas-caja') return { employee: true };
  return undefined;
}

export function DeliveryInformeRunner({
  entry,
  onBack,
}: {
  entry: DeliveryInformeEntry;
  onBack: () => void;
}) {
  const { user: authUser } = useAuth();
  const { currentBusiness } = useBusiness();
  const planTier = useEffectivePlanTier();
  const dataUserId = resolveBusinessDataUserId(authUser, currentBusiness);
  const businessId = currentBusiness?.business_id || currentBusiness?.id;
  const allowed = canAccessDeliveryInforme(entry, planTier);

  const [period, setPeriod] = useState<InformePeriod | null>(null);
  const [filters, setFilters] = useState<InformeFilters>({ comparePrevious: true });
  const [phase, setPhase] = useState<Phase>(allowed ? 'period' : 'locked');
  const [progress, setProgress] = useState(8);
  const [label, setLabel] = useState('Preparando informe…');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState('');
  const [dashboard, setDashboard] = useState<InformeDashboard | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    if (!allowed) {
      setPhase('locked');
      return;
    }
    setPhase('period');
  }, [entry.id, allowed]);

  useEffect(() => {
    if (!period || !allowed) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let tick: ReturnType<typeof setInterval> | null = setInterval(() => {
      setProgress((p) => (p < 85 ? p + 2 : p));
    }, 200);

    const run = async () => {
      setPhase('loading');
      setProgress(10);
      setError(null);
      setRows([]);
      setSummary('');
      setDashboard(null);
      setUnavailableReason(null);

      if (!dataUserId) {
        setPhase('error');
        setError('No hay usuario de datos.');
        return;
      }

      try {
        const periodLabel = informePeriodLabel(period);
        setLabel(`Generando «${entry.title}» · ${periodLabel}…`);
        const result = await loadDeliveryInforme(entry.id, {
          userId: dataUserId,
          businessId,
          businessName: currentBusiness?.name,
          businessType: currentBusiness?.businessType,
          period,
          filters,
          signal: ctrl.signal,
          onProgress: (pct, msg) => {
            setProgress(Math.max(12, Math.min(95, pct)));
            if (msg) setLabel(msg);
          },
        });
        if (ctrl.signal.aborted) return;

        setRows(result.rows);
        setSummary(result.summary);
        setDashboard(result.dashboard || null);
        setProgress(100);
        setLabel('Informe generado');

        if (result.unavailable) {
          setUnavailableReason(result.unavailableReason || result.summary);
          setPhase('unavailable');
        } else if (/aún no tiene cargador/i.test(result.summary)) {
          setPhase('unavailable');
        } else {
          setPhase('ready');
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        setPhase('error');
        setError(e instanceof Error ? e.message : 'No se pudo generar el informe');
      } finally {
        if (tick) clearInterval(tick);
        tick = null;
      }
    };

    void run();
    return () => {
      ctrl.abort();
      if (tick) clearInterval(tick);
    };
  }, [
    entry.id,
    entry.title,
    dataUserId,
    businessId,
    currentBusiness?.name,
    currentBusiness?.businessType,
    period,
    filtersKey,
    allowed,
  ]);

  const handleBackToPeriod = () => {
    abortRef.current?.abort();
    setPeriod(null);
    setPhase('period');
    setProgress(8);
    setError(null);
    setRows([]);
    setSummary('');
    setDashboard(null);
    setUnavailableReason(null);
  };

  if (phase === 'locked' || !allowed) {
    return (
      <InformePlanLockedCard
        title={entry.title}
        requiredPlan={deliveryInformeMinPlanLabel(entry)}
        onBack={onBack}
      />
    );
  }

  if (phase === 'period' || !period) {
    return (
      <DeliveryInformePeriodPicker
        entry={entry}
        onBack={onBack}
        onConfirm={(next) => {
          const range = informePeriodRange(next);
          setFilters((f) => ({
            ...f,
            dateFrom: range.from,
            dateTo: range.to,
            comparePrevious: f.comparePrevious !== false,
          }));
          setPeriod(next);
          setPhase('loading');
        }}
      />
    );
  }

  const periodLabel = informePeriodLabel(period);
  const reportTitle = `${entry.title} · ${periodLabel}`;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleBackToPeriod}
        className="text-sm font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
      >
        ← Cambiar mes
      </button>

      {phase === 'loading' && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-1 text-lg font-bold text-stone-900 dark:text-stone-100">{reportTitle}</h2>
          <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">Periodo: {periodLabel}</p>
          <VertialInformeProgress progress={progress} label={label} />
        </div>
      )}

      {phase === 'ready' && dashboard && (
        <InformeDashboardView
          title={reportTitle}
          summary={summary}
          dashboard={dashboard}
          filters={filters}
          onFiltersChange={setFilters}
          extraFilters={extraFiltersFor(entry)}
          onBack={handleBackToPeriod}
          onDownload={async (format) => {
            if (!rows.length && !dashboard) return;
            const stamp = `${period.year}-${String(period.month).padStart(2, '0')}`;
            await downloadInforme(format, reportTitle, rows, `${entry.id}_${stamp}`, {
              summary,
              businessName: currentBusiness?.name,
              dashboard: dashboard || undefined,
              periodLabel,
            });
          }}
        />
      )}

      {phase === 'ready' && !dashboard && (
        <VertialInformeReadyCard
          title={reportTitle}
          summary={summary}
          rowCount={rows.length}
          rows={rows}
          onBack={handleBackToPeriod}
          onDownload={async (format) => {
            if (!rows.length) return;
            const stamp = `${period.year}-${String(period.month).padStart(2, '0')}`;
            await downloadInforme(format, reportTitle, rows, `${entry.id}_${stamp}`, {
              summary,
              businessName: currentBusiness?.name,
              periodLabel,
            });
          }}
        />
      )}

      {phase === 'unavailable' && (
        <VertialInformeUnavailableCard
          title={reportTitle}
          onBack={handleBackToPeriod}
          reason={unavailableReason || undefined}
        />
      )}

      {phase === 'error' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-900 dark:bg-rose-950/30">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{reportTitle}</h2>
          <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>
          <button
            type="button"
            onClick={handleBackToPeriod}
            className="mt-4 text-sm font-semibold text-stone-700 underline dark:text-stone-200"
          >
            Volver
          </button>
        </div>
      )}
    </div>
  );
}
