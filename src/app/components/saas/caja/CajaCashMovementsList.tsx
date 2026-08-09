/**
 * Lista clara de entradas / salidas / devoluciones de una sesión TPV.
 * Reutilizable en timeline Caja y detalle de cierre.
 */
import type { ReactNode } from 'react';
import type { TpvRegisterSession, TpvRegisterTransaction, TpvVoidedCashMovement } from '../../../lib/deliveryApi';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import { sessionWorkDayKey, transactionOnCalendarDay } from '../../../lib/tpvCajaScope';

export type CajaCashMovementTone = 'in' | 'out' | 'return';

function isCashOutType(type: string): boolean {
  return type === 'cash_out' || type === 'expense';
}

function sortByDateAsc<T extends { date?: string }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-ES', { timeStyle: 'short' });
}

function movementLabel(tx: TpvRegisterTransaction): string {
  const desc = String(tx.description || '').trim();
  if (desc) return desc;
  if (tx.type === 'cash_in') return 'Entrada de efectivo';
  if (isCashOutType(tx.type)) return 'Salida de efectivo';
  if (tx.type === 'return') return 'Devolución';
  return tx.type;
}

function voidLabel(v: TpvVoidedCashMovement): string {
  const desc = String(v.originalDescription || '').trim();
  if (desc) return `${desc} · anulada`;
  if (v.type === 'cash_in') return 'Entrada · anulada';
  if (v.type === 'cash_out') return 'Salida · anulada';
  return 'Devolución · anulada';
}

function MovementRow({
  time,
  title,
  subtitle,
  amountText,
  amountClassName,
  compact,
}: {
  time: string;
  title: string;
  subtitle?: string;
  amountText: string;
  amountClassName: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-2 ${
        compact ? 'py-1.5 text-[12.5px]' : 'p-2 rounded-lg border border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50 text-xs'
      }`}
    >
      <div className="min-w-0">
        <p className={`font-medium break-words ${compact ? 'text-stone-700 dark:text-stone-200' : 'text-zinc-900 dark:text-zinc-100'}`}>
          {title}
        </p>
        <p className={`text-[10px] ${compact ? 'text-stone-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
          {time}
          {subtitle ? ` · ${subtitle}` : ''}
        </p>
      </div>
      <span className={`font-semibold tabular-nums shrink-0 ${amountClassName}`}>{amountText}</span>
    </div>
  );
}

function Section({
  title,
  total,
  totalPrefix,
  empty,
  children,
  compact,
}: {
  title: string;
  total: number;
  totalPrefix: '+' | '−';
  empty: boolean;
  children: ReactNode;
  compact?: boolean;
}) {
  if (empty) return null;
  return (
    <div className={compact ? 'mb-3' : 'space-y-1.5'}>
      <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-1' : 'mb-1.5'}`}>
        <p
          className={`m-0 font-semibold uppercase tracking-wide ${
            compact
              ? 'text-[11px] tracking-[0.08em] text-stone-400'
              : 'text-[10px] text-zinc-500 dark:text-zinc-400'
          }`}
        >
          {title}
        </p>
        <span
          className={`tabular-nums font-semibold ${
            compact ? 'text-[11px] text-stone-500' : 'text-[10px] text-zinc-600 dark:text-zinc-300'
          }`}
        >
          {totalPrefix}
          {formatMoneyEs(total)}
        </span>
      </div>
      <div className={compact ? 'border-t border-stone-100 dark:border-stone-800 pt-1' : 'space-y-1'}>
        {children}
      </div>
    </div>
  );
}

export function partitionCajaCashMovements(
  session: Pick<TpvRegisterSession, 'transactions' | 'voidedCashMovements' | 'status' | 'openedAt'>,
  options?: { dayKey?: string },
) {
  const dayKey = options?.dayKey?.trim() || '';
  const closedFullShift =
    String(session.status || '').toLowerCase() === 'closed'
    && dayKey
    && sessionWorkDayKey(session as TpvRegisterSession) === dayKey;

  const txs = (session.transactions || []).filter((tx) => {
    if (!dayKey || closedFullShift) return true;
    return transactionOnCalendarDay(tx, dayKey);
  });

  const entradas = sortByDateAsc(txs.filter((t) => t.type === 'cash_in'));
  const salidas = sortByDateAsc(txs.filter((t) => isCashOutType(t.type)));
  const devoluciones = sortByDateAsc(txs.filter((t) => t.type === 'return'));

  const voided = (session.voidedCashMovements || []).filter((v) => {
    if (!dayKey || closedFullShift) return true;
    return transactionOnCalendarDay({ date: v.originalDate || v.voidedAt }, dayKey);
  });

  const voidedIn = sortByDateAsc(
    voided.filter((v) => v.type === 'cash_in').map((v) => ({ ...v, date: v.voidedAt })),
  );
  const voidedOut = sortByDateAsc(
    voided.filter((v) => v.type === 'cash_out').map((v) => ({ ...v, date: v.voidedAt })),
  );
  const voidedReturn = sortByDateAsc(
    voided.filter((v) => v.type === 'return').map((v) => ({ ...v, date: v.voidedAt })),
  );

  const totalIn = entradas.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalOut = salidas.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalReturn = devoluciones.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  return {
    entradas,
    salidas,
    devoluciones,
    voidedIn,
    voidedOut,
    voidedReturn,
    totalIn,
    totalOut,
    totalReturn,
    isEmpty:
      entradas.length === 0
      && salidas.length === 0
      && devoluciones.length === 0
      && voidedIn.length === 0
      && voidedOut.length === 0
      && voidedReturn.length === 0,
  };
}

export type CajaCashMovementsListProps = {
  session: Pick<TpvRegisterSession, 'transactions' | 'voidedCashMovements' | 'status' | 'openedAt'>;
  /** Filtrar movimientos del día (timeline). En cierre suele omitirse. */
  dayKey?: string;
  /** Compacto para panel lateral del timeline. */
  compact?: boolean;
  /** Título superior opcional. */
  title?: string;
  className?: string;
};

export function CajaCashMovementsList({
  session,
  dayKey,
  compact,
  title = 'Entradas y salidas',
  className = '',
}: CajaCashMovementsListProps) {
  const data = partitionCajaCashMovements(session, { dayKey });

  if (data.isEmpty) {
    return (
      <div className={className}>
        {title ? (
          <p
            className={`m-0 mb-2 font-semibold uppercase tracking-wide ${
              compact
                ? 'text-[11px] tracking-[0.08em] text-stone-400'
                : 'text-xs text-zinc-500'
            }`}
          >
            {title}
          </p>
        ) : null}
        <p className={`text-center ${compact ? 'text-[12.5px] text-stone-400 py-2.5' : 'text-xs text-zinc-400 py-2'}`}>
          Sin entradas ni salidas en este turno
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {title ? (
        <p
          className={`m-0 mb-2 font-semibold uppercase tracking-wide ${
            compact
              ? 'text-[11px] tracking-[0.08em] text-stone-400'
              : 'text-xs text-zinc-500'
          }`}
        >
          {title}
        </p>
      ) : null}

      <Section
        title="Entradas"
        total={data.totalIn}
        totalPrefix="+"
        empty={data.entradas.length === 0 && data.voidedIn.length === 0}
        compact={compact}
      >
        {data.entradas.map((tx) => (
          <MovementRow
            key={tx.id || `${tx.date}-${tx.amount}-in`}
            time={formatTime(tx.date)}
            title={movementLabel(tx)}
            subtitle={[tx.registeredBy, tx.workerName].filter(Boolean).join(' · ') || undefined}
            amountText={`+${formatMoneyEs(tx.amount)}`}
            amountClassName={compact ? 'text-emerald-700 dark:text-emerald-400' : 'text-emerald-700 dark:text-emerald-300'}
            compact={compact}
          />
        ))}
        {data.voidedIn.length > 0 ? (
          <>
            <p className={`pt-1 font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400 ${compact ? 'text-[10px]' : 'text-[10px]'}`}>
              Entradas eliminadas
            </p>
            {data.voidedIn.map((v) => (
              <MovementRow
                key={v.id}
                time={formatTime(v.voidedAt)}
                title={voidLabel(v)}
                subtitle={v.voidReason ? `Motivo: ${v.voidReason}` : undefined}
                amountText={`+${formatMoneyEs(v.amount)}`}
                amountClassName="text-rose-700 dark:text-rose-300 line-through"
                compact={compact}
              />
            ))}
          </>
        ) : null}
      </Section>

      <Section
        title="Salidas"
        total={data.totalOut}
        totalPrefix="−"
        empty={data.salidas.length === 0 && data.voidedOut.length === 0}
        compact={compact}
      >
        {data.salidas.map((tx) => (
          <MovementRow
            key={tx.id || `${tx.date}-${tx.amount}-out`}
            time={formatTime(tx.date)}
            title={movementLabel(tx)}
            subtitle={[tx.registeredBy, tx.workerName].filter(Boolean).join(' · ') || undefined}
            amountText={`−${formatMoneyEs(tx.amount)}`}
            amountClassName={compact ? 'text-amber-800 dark:text-amber-300' : 'text-amber-800 dark:text-amber-300'}
            compact={compact}
          />
        ))}
        {data.voidedOut.length > 0 ? (
          <>
            <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
              Salidas eliminadas
            </p>
            {data.voidedOut.map((v) => (
              <MovementRow
                key={v.id}
                time={formatTime(v.voidedAt)}
                title={voidLabel(v)}
                subtitle={v.voidReason ? `Motivo: ${v.voidReason}` : undefined}
                amountText={`−${formatMoneyEs(v.amount)}`}
                amountClassName="text-rose-700 dark:text-rose-300 line-through"
                compact={compact}
              />
            ))}
          </>
        ) : null}
      </Section>

      <Section
        title="Devoluciones"
        total={data.totalReturn}
        totalPrefix="−"
        empty={data.devoluciones.length === 0 && data.voidedReturn.length === 0}
        compact={compact}
      >
        {data.devoluciones.map((tx) => (
          <MovementRow
            key={tx.id || `${tx.date}-${tx.amount}-ret`}
            time={formatTime(tx.date)}
            title={movementLabel(tx)}
            subtitle={[
              tx.paymentMethod ? String(tx.paymentMethod) : '',
              tx.orderNumber ? `#${tx.orderNumber}` : '',
              tx.registeredBy || '',
            ].filter(Boolean).join(' · ') || undefined}
            amountText={`−${formatMoneyEs(tx.amount)}`}
            amountClassName={compact ? 'text-stone-800 dark:text-stone-200' : 'text-zinc-800 dark:text-zinc-200'}
            compact={compact}
          />
        ))}
        {data.voidedReturn.length > 0 ? (
          <>
            <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
              Devoluciones eliminadas
            </p>
            {data.voidedReturn.map((v) => (
              <MovementRow
                key={v.id}
                time={formatTime(v.voidedAt)}
                title={voidLabel(v)}
                subtitle={v.voidReason ? `Motivo: ${v.voidReason}` : undefined}
                amountText={`−${formatMoneyEs(v.amount)}`}
                amountClassName="text-rose-700 dark:text-rose-300 line-through"
                compact={compact}
              />
            ))}
          </>
        ) : null}
      </Section>
    </div>
  );
}
