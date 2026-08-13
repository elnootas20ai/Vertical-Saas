import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import type { DeliveryInformeEntry } from './deliveryInformesCatalog';
import { loadDeliveryInforme } from './loaders/loadDeliveryInforme';
import {
  VertialInformeProgress,
  VertialInformeReadyCard,
  VertialInformeUnavailableCard,
  downloadInforme,
} from './VertialInformeProgress';

type Phase = 'loading' | 'ready' | 'unavailable' | 'error';

export function DeliveryInformeRunner({
  entry,
  onBack,
}: {
  entry: DeliveryInformeEntry;
  onBack: () => void;
}) {
  const { user: authUser } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(authUser, currentBusiness);
  const businessId = currentBusiness?.business_id || currentBusiness?.id;

  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState(8);
  const [label, setLabel] = useState('Preparando informe…');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
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

      if (!dataUserId) {
        setPhase('error');
        setError('No hay usuario de datos.');
        return;
      }

      try {
        setLabel(`Generando «${entry.title}»…`);
        const result = await loadDeliveryInforme(entry.id, {
          userId: dataUserId,
          businessId,
          businessName: currentBusiness?.name,
          signal: ctrl.signal,
          onProgress: (pct, msg) => {
            setProgress(Math.max(12, Math.min(95, pct)));
            if (msg) setLabel(msg);
          },
        });
        if (ctrl.signal.aborted) return;

        setRows(result.rows);
        setSummary(result.summary);
        setProgress(100);
        setLabel('Informe generado');
        setPhase(/aún no tiene cargador/i.test(result.summary) ? 'unavailable' : 'ready');
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
  }, [entry.id, entry.title, dataUserId, businessId, currentBusiness?.name]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
      >
        ← Volver al catálogo
      </button>

      {phase === 'loading' && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
          <h2 className="mb-4 text-lg font-bold text-stone-900 dark:text-stone-100">{entry.title}</h2>
          <VertialInformeProgress progress={progress} label={label} />
        </div>
      )}

      {phase === 'ready' && (
        <VertialInformeReadyCard
          title={entry.title}
          summary={summary}
          rowCount={rows.length}
          onBack={onBack}
          onDownload={async (format) => {
            if (!rows.length) return;
            const stamp = new Date().toISOString().slice(0, 10);
            await downloadInforme(format, entry.title, rows, `${entry.id}_${stamp}`, {
              summary,
              businessName: currentBusiness?.name,
            });
          }}
        />
      )}

      {phase === 'unavailable' && (
        <VertialInformeUnavailableCard title={entry.title} onBack={onBack} />
      )}

      {phase === 'error' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-900 dark:bg-rose-950/30">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{entry.title}</h2>
          <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 text-sm font-semibold text-stone-700 underline dark:text-stone-200"
          >
            Volver
          </button>
        </div>
      )}
    </div>
  );
}
