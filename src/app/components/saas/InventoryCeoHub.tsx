import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  History,
  Loader2,
  Package,
  ShoppingCart,
} from 'lucide-react';
import type { CatalogItem } from '../../lib/deliveryApi';
import type { StockCount } from '../../lib/stockCountApi';
import { countDiscrepancies, formatStockDate, formatStockTime } from '../../lib/stockRevisionUtils';
import { formatMoneyEs, formatQtyEs } from '../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { StockPurchaseListPreview } from './StockPurchaseListPreview';

function stockStatus(item: CatalogItem): 'ok' | 'low' | 'out' | 'negative' {
  const qty = Number(item.stockQuantity || 0);
  const min = Number(item.minStock || 0);
  if (qty < 0) return 'negative';
  if (qty === 0) return 'out';
  if (min > 0 && qty <= min) return 'low';
  return 'ok';
}

export function InventoryCeoHub({
  items,
  activeCount,
  completedCounts,
  loading,
  userId,
  canPreparePurchase,
  resolveUserName,
  onGoOperations,
  onGoHistory,
}: {
  items: CatalogItem[];
  activeCount: StockCount | null;
  completedCounts: StockCount[];
  loading?: boolean;
  userId: string;
  canPreparePurchase: boolean;
  resolveUserName: (uid: string) => string;
  onGoOperations: () => void;
  onGoHistory: () => void;
}) {
  const [purchaseCountId, setPurchaseCountId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let ok = 0;
    let low = 0;
    let out = 0;
    let negative = 0;
    let value = 0;
    for (const item of items) {
      if (!item.active || item.deletedAt) continue;
      const s = stockStatus(item);
      if (s === 'ok') ok += 1;
      else if (s === 'low') low += 1;
      else if (s === 'out') out += 1;
      else negative += 1;
      value += Number(item.stockQuantity || 0) * Number(item.costPrice || 0);
    }
    return { ok, low, out, negative, missing: low + out + negative, value, total: ok + low + out + negative };
  }, [items]);

  const lastCompleted = completedCounts[0] || null;
  const lastDiffs = lastCompleted ? countDiscrepancies(lastCompleted) : 0;
  const reviewedInActive = activeCount
    ? activeCount.lines.filter((l) => l.countedStock !== null).length
    : 0;
  const totalInActive = activeCount?.lines.length ?? 0;
  const progressPct = totalInActive > 0 ? Math.round((reviewedInActive / totalInActive) * 100) : 0;

  const missingPreview = useMemo(() => {
    return items
      .filter((i) => i.active && !i.deletedAt)
      .filter((i) => {
        const s = stockStatus(i);
        return s === 'low' || s === 'out' || s === 'negative';
      })
      .sort((a, b) => {
        const rank = (x: CatalogItem) => {
          const s = stockStatus(x);
          if (s === 'negative') return 0;
          if (s === 'out') return 1;
          return 2;
        };
        return rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || ''), 'es');
      })
      .slice(0, 8);
  }, [items]);

  const purchaseTargetId = purchaseCountId || lastCompleted?._id || '';

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">Cargando inventario…</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Artículos</p>
          <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {stats.total.toLocaleString('es-ES')}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Faltantes</p>
          <p
            className={`text-xl font-bold tabular-nums ${
              stats.missing > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {stats.missing.toLocaleString('es-ES')}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Correctos</p>
          <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {stats.ok.toLocaleString('es-ES')}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Valor</p>
          <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {formatMoneyEs(Math.round(stats.value))}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Revisión de stock</p>
            {activeCount ? (
              <>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                  En curso · {activeCount.name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {reviewedInActive}/{totalInActive} · {progressPct}% ·{' '}
                  {resolveUserName(activeCount.startedBy)}
                </p>
              </>
            ) : lastCompleted ? (
              <>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-1">
                  Última cerrada · {formatStockDate(lastCompleted.completedAt)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {resolveUserName(lastCompleted.completedBy || lastCompleted.startedBy)} ·{' '}
                  {formatStockTime(lastCompleted.completedAt)} ·{' '}
                  {lastDiffs === 0 ? 'sin desvíos' : `${lastDiffs} desvío(s)`}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Aún no hay revisiones. El equipo cuenta desde el TPV.</p>
            )}
          </div>
          <ClipboardCheck className="w-5 h-5 text-blue-600 shrink-0" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onGoOperations} className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs`}>
            {activeCount ? 'Abrir revisión' : 'Operaciones'}
          </button>
          <button type="button" onClick={onGoHistory} className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}>
            <History className="w-3.5 h-3.5" />
            Historial
          </button>
          {canPreparePurchase && lastCompleted ? (
            <button
              type="button"
              onClick={() => setPurchaseCountId(lastCompleted._id)}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Preparar compra
            </button>
          ) : null}
        </div>
      </div>

      {canPreparePurchase && purchaseTargetId && purchaseCountId ? (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
              Preparar compra
            </p>
            <button
              type="button"
              onClick={() => setPurchaseCountId(null)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800"
            >
              Cerrar
            </button>
          </div>
          <StockPurchaseListPreview
            userId={userId}
            countId={purchaseTargetId}
            canCreateOrders={canPreparePurchase}
          />
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Qué falta
          </p>
          <span className="text-xs tabular-nums text-gray-400">
            {stats.low.toLocaleString('es-ES')} bajo · {stats.out.toLocaleString('es-ES')} sin stock
          </span>
        </div>
        {missingPreview.length === 0 ? (
          <p className="px-4 py-8 text-sm text-center text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Nada bajo mínimo ni sin stock
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {missingPreview.map((item) => {
              const s = stockStatus(item);
              return (
                <li key={item._id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                    <p className="text-[11px] text-gray-500 tabular-nums">
                      Stock {formatQtyEs(Number(item.stockQuantity || 0))} {item.unit || 'ud'}
                      {Number(item.minStock) > 0 ? ` · mín. ${formatQtyEs(Number(item.minStock))}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      s === 'out' || s === 'negative'
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                    }`}
                  >
                    {s === 'out' || s === 'negative' ? 'Sin stock' : 'Bajo'}
                  </span>
                </li>
              );
            })}
            {stats.missing > missingPreview.length ? (
              <li className="px-4 py-2 text-[11px] text-gray-400">
                +{(stats.missing - missingPreview.length).toLocaleString('es-ES')} más en Almacén / Ingredientes
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {completedCounts.length > 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              Últimas revisiones
            </p>
            <button type="button" onClick={onGoHistory} className="text-xs font-semibold text-blue-600">
              Ver todo
            </button>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {completedCounts.slice(0, 5).map((count) => {
              const diffs = countDiscrepancies(count);
              return (
                <li key={count._id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{count.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {resolveUserName(count.completedBy || count.startedBy)} · {formatStockDate(count.completedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {diffs === 0 ? (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        OK
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        {diffs} dif.
                      </span>
                    )}
                    {canPreparePurchase ? (
                      <button
                        type="button"
                        onClick={() => setPurchaseCountId(count._id)}
                        className="text-[11px] font-semibold text-blue-600"
                      >
                        Compra
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
