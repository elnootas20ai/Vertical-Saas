/**
 * Dashboard empresa delivery — debajo de marcas:
 * pagos a trabajadores desde caja (salida TPV) del mes + a descontar de nómina.
 */
import { useNavigate } from 'react-router';
import { Wallet, Users } from 'lucide-react';
import { formatMoneyEs, formatNumberEs } from '../../lib/formatNumberEs';
import { DELIVERY_CAJA_PATH } from '../../lib/retailOpsPaths';
import type { WorkerPayMonthSummary } from './workerPayFromTpv';
import { DashboardWorkerPaySkeleton } from '../../components/saas/DashboardSectionSkeleton';

type Props = {
  summary: WorkerPayMonthSummary | null;
  loading?: boolean;
  /** Layout denso para CeoMobileHome / pantallas estrechas. */
  compact?: boolean;
};

function monthLabelEs(monthKey: string): string {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return 'Mes en curso';
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function WorkerPayMonthPanel({ summary, loading = false, compact = false }: Props) {
  const navigate = useNavigate();
  const titleMonth = summary ? monthLabelEs(summary.monthKey) : 'Mes en curso';
  const empty = !loading && (!summary || (summary.payCount === 0 && summary.payrollDeductionTotal <= 0));

  if (loading && !summary) {
    return <DashboardWorkerPaySkeleton />;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-gray-100">
            <Wallet className="h-3.5 w-3.5 shrink-0 text-[var(--v-blue,#2563eb)]" />
            <span className="truncate">Pagos a trabajadores · {titleMonth}</span>
          </p>
          {!compact ? (
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              Salidas TPV «Pago trabajador» · lo adelantado antes de cerrar el mes
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              Adelantos caja · mes en curso
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate(DELIVERY_CAJA_PATH)}
          className="min-h-11 shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Ver caja
        </button>
      </div>

      {loading ? (
        <div className="mt-2.5 grid animate-pulse grid-cols-1 gap-2 sm:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2.5 dark:border-gray-800 dark:bg-gray-800/40"
            >
              <div className="h-2 w-20 rounded bg-gray-100 dark:bg-gray-700" />
              <div className="mt-2 h-5 w-16 rounded bg-gray-100 dark:bg-gray-700" />
              <div className="mt-1.5 h-2 w-14 rounded bg-gray-100 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : empty ? (
        <p className="mt-3 rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-700">
          Aún no hay pagos a trabajadores este mes desde el TPV.
        </p>
      ) : summary ? (
        <>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2.5 dark:border-gray-800 dark:bg-gray-800/40">
              <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
                Pagado desde caja
              </p>
              <p className="mt-0.5 text-base font-black tabular-nums text-gray-900 dark:text-gray-100 sm:text-sm">
                {formatMoneyEs(summary.paidTotal)}
              </p>
              <p className="text-[10px] text-gray-500">
                {formatNumberEs(summary.payCount, { maxFraction: 0 })} salida
                {summary.payCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2.5 dark:border-gray-800 dark:bg-gray-800/40">
              <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">
                A descontar nómina
              </p>
              <p className="mt-0.5 text-base font-black tabular-nums text-gray-900 dark:text-gray-100 sm:text-sm">
                {formatMoneyEs(summary.payrollDeductionTotal)}
              </p>
              <p className="text-[10px] text-gray-500">Consumos de equipo</p>
            </div>
            <div className="rounded-lg border border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.06)] px-2.5 py-2.5 sm:col-span-1 dark:border-blue-900/40 dark:bg-blue-950/30">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--v-blue,#2563eb)]">
                Neto adelantado
              </p>
              <p className="mt-0.5 text-base font-black tabular-nums text-gray-900 dark:text-gray-100 sm:text-sm">
                {formatMoneyEs(summary.netAdvanced)}
              </p>
              <p className="text-[10px] text-gray-500">Pagado − descuentos</p>
            </div>
          </div>

          {summary.byWorker.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                <Users className="h-3 w-3" />
                Por trabajador
              </p>
              {summary.byWorker.map((row) => (
                <div
                  key={row.workerKey}
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2.5 dark:border-gray-800 dark:bg-gray-800/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {row.workerName}
                    </p>
                    <p className="text-[10px] text-gray-500 leading-snug">
                      {row.payCount > 0
                        ? `${formatNumberEs(row.payCount, { maxFraction: 0 })} pago${row.payCount === 1 ? '' : 's'} caja`
                        : 'Sin pagos caja'}
                      {row.payrollDeductionTotal > 0
                        ? ` · −${formatMoneyEs(row.payrollDeductionTotal)} nómina`
                        : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {formatMoneyEs(row.paidTotal)}
                    </p>
                    <p className="text-[10px] tabular-nums text-gray-500">
                      neto {formatMoneyEs(row.netAdvanced)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {summary.recent.length > 0 ? (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Últimos movimientos
              </p>
              <ul className="space-y-1.5">
                {(compact ? summary.recent.slice(0, 5) : summary.recent).map((item) => {
                  const when = item.date
                    ? new Date(item.date).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—';
                  return (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded-lg bg-gray-50/60 px-2 py-1.5 text-[11px] text-gray-600 dark:bg-gray-800/40 dark:text-gray-300"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-800 dark:text-gray-100">
                          {item.workerName}
                        </span>
                        <span className="text-gray-400">
                          {when}
                          {item.pointOfSaleName ? ` · ${item.pointOfSaleName}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-gray-900 dark:text-gray-100">
                        {formatMoneyEs(item.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
