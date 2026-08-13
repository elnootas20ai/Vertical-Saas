import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Minus, Plus, Search, ShoppingCart, User, X,
} from 'lucide-react';
import { DELIVERY_ACTIVE_STORE_CHANGED } from '../../lib/deliveryOpsPdvSelection';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import type { Warehouse } from '../../lib/warehouseApi';
import {
  completeStockCountRequest,
  createStockCountRequest,
  listStockCountsRequest,
  updateCountLineRequest,
  type StockCount,
} from '../../lib/stockCountApi';
import type { StockPurchaseList } from '../../lib/stockPurchaseListApi';
import { countDiscrepancies, formatStockTime, isSameLocalDay } from '../../lib/stockRevisionUtils';
import { StockPurchaseListPreview } from './StockPurchaseListPreview';

export type StockRevisionRole = 'manager' | 'worker';

type RevisionFilter = 'pending' | 'reviewed' | 'all';

type CompletionReport = {
  count: StockCount;
  adjustmentsCreated: number;
  purchaseList?: StockPurchaseList;
};

export interface StockRevisionPanelProps {
  userId: string;
  storeLabel: string;
  storeWarehouseId?: string;
  warehouses: Warehouse[];
  stockedCount: number;
  role?: StockRevisionRole;
  onRevisionCompleted?: () => void;
  onActiveCountChange?: (count: StockCount | null) => void;
  /** Si el padre ya cargó la revisión activa, evita peticiones duplicadas a stock-counts */
  controlledActiveCount?: StockCount | null;
  skipCountsFetch?: boolean;
  onRequestRefresh?: () => void;
}

function RevisionLineCard({
  line,
  lineIdx,
  isBusy,
  isMismatchOpen,
  mismatchQty,
  onMarkOk,
  onOpenMismatch,
  onCloseMismatch,
  onMismatchQtyChange,
  onSubmitMismatch,
  onStepCounted,
  resolveUserName,
}: {
  line: StockCount['lines'][number];
  lineIdx: number;
  isBusy: boolean;
  isMismatchOpen: boolean;
  mismatchQty: string;
  onMarkOk: (idx: number) => void;
  onOpenMismatch: (idx: number) => void;
  onCloseMismatch: () => void;
  onMismatchQtyChange: (value: string) => void;
  onSubmitMismatch: (idx: number) => void;
  onStepCounted: (idx: number, delta: 1 | -1) => void;
  resolveUserName: (uid: string) => string;
}) {
  const isReviewed = line.countedStock !== null;
  const hasDiff = isReviewed && line.difference !== 0;
  const displayQty = isReviewed
    ? Number(line.countedStock)
    : isMismatchOpen
      ? Number(mismatchQty.replace(',', '.') || line.theoreticalStock)
      : Number(line.theoreticalStock);
  const unit = line.unit || 'ud';

  return (
    <div
      id={`revision-line-${lineIdx}`}
      className={`rounded-xl border p-4 transition-colors ${
        isReviewed
          ? hasDiff
            ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10'
            : 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-900/10'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white leading-snug">{line.catalogItemName}</p>
          {line.sku && <p className="text-xs font-mono text-gray-400 mt-0.5">{line.sku}</p>}
        </div>
        {isReviewed ? (
          hasDiff ? (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          )
        ) : (
          <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-gray-300 mt-1.5" />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-gray-500">
          Sistema:{' '}
          <strong className="text-gray-900 dark:text-white tabular-nums">
            {line.theoreticalStock} {unit}
          </strong>
        </span>
        {isReviewed && hasDiff ? (
          <span className={`font-bold tabular-nums ${(line.difference ?? 0) < 0 ? 'text-red-600' : 'text-blue-600'}`}>
            {(line.difference ?? 0) > 0 ? '+' : ''}
            {line.difference} {unit}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={isBusy || displayQty <= 0}
          onClick={() => {
            if (isMismatchOpen) {
              const next = Math.max(0, displayQty - 1);
              onMismatchQtyChange(String(next));
              return;
            }
            onStepCounted(lineIdx, -1);
          }}
          className="w-12 h-12 touch-manipulation inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-red-600 disabled:opacity-40"
          aria-label="Restar 1"
        >
          <Minus className="w-5 h-5" />
        </button>
        <div className="min-w-[5.5rem] text-center">
          <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{displayQty}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{unit}</p>
        </div>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            if (isMismatchOpen) {
              onMismatchQtyChange(String(displayQty + 1));
              return;
            }
            onStepCounted(lineIdx, 1);
          }}
          className="w-12 h-12 touch-manipulation inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-emerald-700 disabled:opacity-40"
          aria-label="Sumar 1"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {isReviewed && line.countedBy && (
        <p className="mt-2 text-xs text-gray-500 flex items-center gap-1 justify-center">
          <User className="w-3 h-3" />
          {resolveUserName(line.countedBy)}
          {line.countedAt && <> · {formatStockTime(line.countedAt)}</>}
        </p>
      )}

      {!isReviewed && !isMismatchOpen && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onMarkOk(lineIdx)}
            className="min-h-[52px] touch-manipulation select-none inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white text-base font-bold hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            Cuadra
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onOpenMismatch(lineIdx)}
            className="min-h-[52px] touch-manipulation select-none inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white text-base font-bold hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            <X className="w-5 h-5" />
            No cuadra
          </button>
        </div>
      )}

      {!isReviewed && isMismatchOpen && (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase text-center">
            Cantidad real · usa + / − o escribe
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={mismatchQty}
            onChange={(e) => onMismatchQtyChange(e.target.value)}
            placeholder={`Ej: ${line.theoreticalStock}`}
            className="w-full min-h-[48px] px-4 text-lg text-center font-bold bg-gray-50 dark:bg-gray-900 border-2 border-amber-300 dark:border-amber-700 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onSubmitMismatch(lineIdx)}
              className="min-h-[48px] touch-manipulation rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50"
            >
              {isBusy ? 'Guardando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={onCloseMismatch}
              className="min-h-[48px] touch-manipulation rounded-xl border border-gray-200 dark:border-gray-600 font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isReviewed && (
        <p className="mt-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400 text-center">Revisado</p>
      )}
    </div>
  );
}

function RevisionReportModal({
  report,
  userId,
  onClose,
}: {
  report: CompletionReport;
  userId: string;
  onClose: () => void;
}) {
  const diffs = report.count.lines.filter((l) => l.countedStock !== null && l.difference !== 0);
  const purchaseCount = report.purchaseList?.itemCount ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-emerald-600" />
              Reporte de revisión
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {report.count.name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] font-semibold uppercase text-gray-400">Ajustes</p>
              <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                {report.adjustmentsCreated}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] font-semibold uppercase text-gray-400">No cuadran</p>
              <p className="text-2xl font-bold tabular-nums text-amber-600">{diffs.length}</p>
            </div>
          </div>

          {diffs.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Desvíos</p>
              <ul className="space-y-2">
                {diffs.map((line) => (
                  <li
                    key={line.catalogItemId}
                    className="flex items-center justify-between gap-3 text-sm border-b border-gray-50 dark:border-gray-700/50 pb-2"
                  >
                    <span className="font-medium text-gray-900 dark:text-white truncate">{line.catalogItemName}</span>
                    <span className={`shrink-0 font-bold tabular-nums ${(line.difference ?? 0) < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                      {(line.difference ?? 0) > 0 ? '+' : ''}
                      {line.difference} {line.unit || 'ud'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Todo cuadra. Stock sin desvíos.
            </p>
          )}

          {purchaseCount > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 mb-2 flex items-center gap-1.5">
                <ShoppingCart className="w-3.5 h-3.5" />
                Lista de compra sugerida
              </p>
              <StockPurchaseListPreview
                userId={userId}
                countId={report.count._id}
                countName={report.count.name}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500">Tras esta revisión no hace falta pedido automático.</p>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] touch-manipulation rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

export function StockRevisionPanel({
  userId,
  storeLabel,
  storeWarehouseId = '',
  warehouses,
  stockedCount,
  role = 'manager',
  onRevisionCompleted,
  onActiveCountChange,
  controlledActiveCount,
  skipCountsFetch = false,
  onRequestRefresh,
}: StockRevisionPanelProps) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const actorUserId = String(user?.user_id || user?.id || '').trim();
  void role; // abierto para todos; se mantiene la prop por compatibilidad

  const [activeCount, setActiveCount] = useState<StockCount | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [startingCount, setStartingCount] = useState(false);
  const [completingCount, setCompletingCount] = useState(false);
  const [lineBusy, setLineBusy] = useState<number | null>(null);
  const [mismatchIdx, setMismatchIdx] = useState<number | null>(null);
  const [mismatchQty, setMismatchQty] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [revisionFilter, setRevisionFilter] = useState<RevisionFilter>('pending');
  const [revisionSearch, setRevisionSearch] = useState('');
  const [completionReport, setCompletionReport] = useState<CompletionReport | null>(null);
  const autoEnsureKeyRef = useRef('');

  const teamMembers = useMemo(
    () => (currentBusiness?.members || []).map((m) => ({
      user_id: m.user_id,
      fullName: String(m.fullName || m.email || '').trim(),
    })),
    [currentBusiness?.members],
  );

  const resolveUserName = useCallback((uid: string) => {
    if (!uid) return '—';
    const normalized = uid.replace(/^account:/, '');
    const member = teamMembers.find((m) => m.user_id === normalized || m.user_id === uid);
    if (member?.fullName) return member.fullName;
    if (actorUserId && (actorUserId === normalized || actorUserId === uid)) {
      return user?.fullName || 'Tú';
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(normalized)) return 'Miembro del equipo';
    return uid;
  }, [teamMembers, actorUserId, user?.fullName]);

  const defaultWarehouse = useMemo(() => {
    const active = warehouses.filter((w) => w.active);
    if (warehouseId) return active.find((w) => w._id === warehouseId) || null;
    if (storeWarehouseId) return active.find((w) => w._id === storeWarehouseId) || null;
    return active.find((w) => w.isDefault) || active[0] || null;
  }, [warehouses, warehouseId, storeWarehouseId]);

  useEffect(() => {
    if (!warehouseId && (storeWarehouseId || defaultWarehouse)) {
      setWarehouseId(storeWarehouseId || defaultWarehouse?._id || '');
    }
  }, [warehouseId, storeWarehouseId, defaultWarehouse]);

  const syncActiveCount = useCallback((count: StockCount | null) => {
    setActiveCount(count);
    onActiveCountChange?.(count);
  }, [onActiveCountChange]);

  const pickOpenCount = useCallback((counts: StockCount[], wh: string) => {
    const open = counts.filter(
      (c) =>
        (c.status === 'draft' || c.status === 'in_progress') &&
        (!wh || !c.warehouseId || c.warehouseId === wh),
    );
    if (open.length === 0) return null;
    const today = open.find((c) => isSameLocalDay(c.startedAt || c.createdAt));
    return today || open[0];
  }, []);

  const loadStockCounts = useCallback(async () => {
    if (!userId) return;
    setLoadingCount(true);
    try {
      const counts = await listStockCountsRequest(userId);
      const wh = warehouseId || storeWarehouseId;
      syncActiveCount(pickOpenCount(counts, wh));
    } catch {
      syncActiveCount(null);
    } finally {
      setLoadingCount(false);
    }
  }, [userId, warehouseId, storeWarehouseId, syncActiveCount, pickOpenCount]);

  useEffect(() => {
    if (skipCountsFetch) return;
    void loadStockCounts();
  }, [loadStockCounts, skipCountsFetch]);

  useEffect(() => {
    if (skipCountsFetch) return;
    autoEnsureKeyRef.current = '';
    syncActiveCount(null);
    void loadStockCounts();
  }, [storeWarehouseId, storeLabel, loadStockCounts, syncActiveCount, skipCountsFetch]);

  useEffect(() => {
    if (skipCountsFetch) return;
    const onStoreChange = () => {
      autoEnsureKeyRef.current = '';
      void (onRequestRefresh?.() ?? loadStockCounts());
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStoreChange);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStoreChange);
  }, [loadStockCounts, skipCountsFetch, onRequestRefresh]);

  const resolvedActiveCount = skipCountsFetch ? (controlledActiveCount ?? null) : activeCount;
  const resolvedLoading = skipCountsFetch ? false : loadingCount;

  const refreshCounts = useCallback(() => {
    if (skipCountsFetch) onRequestRefresh?.();
    else void loadStockCounts();
  }, [skipCountsFetch, onRequestRefresh, loadStockCounts]);

  const scrollToNextPendingLine = useCallback((count: StockCount, afterIdx: number) => {
    const nextIdx = count.lines.findIndex((l, i) => i > afterIdx && l.countedStock === null);
    const targetIdx = nextIdx >= 0 ? nextIdx : count.lines.findIndex((l) => l.countedStock === null);
    if (targetIdx < 0) return;
    requestAnimationFrame(() => {
      document.getElementById(`revision-line-${targetIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  const ensureTodayRevision = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) return null;
    if (stockedCount === 0) {
      if (!opts?.silent) toast.error('Carga el stock inicial antes de hacer una revisión');
      return null;
    }
    const wh = warehouses.find((w) => w._id === warehouseId) || defaultWarehouse;
    setStartingCount(true);
    try {
      const name = `Revisión ${new Date().toLocaleDateString('es-ES')} — ${wh?.name || storeLabel}`;
      const count = await createStockCountRequest(userId, {
        name,
        countType: 'full',
        warehouseId: wh?._id || '',
        warehouseName: wh?.name || storeLabel,
      });
      syncActiveCount(count);
      setRevisionFilter('pending');
      setRevisionSearch('');
      if (!opts?.silent) toast.success('Revisión de hoy lista');
      return count;
    } catch (err) {
      if (!opts?.silent) {
        toast.error(err instanceof Error ? err.message : 'No se pudo iniciar la revisión');
      }
      return null;
    } finally {
      setStartingCount(false);
    }
  }, [userId, stockedCount, warehouses, warehouseId, defaultWarehouse, storeLabel, syncActiveCount]);

  // Revisión del día: se activa sola (trabajador o encargado), sin permiso previo.
  // Tras cerrar la de hoy no se vuelve a crear sola hasta mañana (o hasta pulsar el botón).
  useEffect(() => {
    if (resolvedLoading || startingCount || resolvedActiveCount) return;
    if (!userId || stockedCount === 0) return;
    const wh = warehouseId || storeWarehouseId || 'default';
    const key = `${userId}:${wh}:${new Date().toLocaleDateString('es-ES')}`;
    if (autoEnsureKeyRef.current === key) return;
    autoEnsureKeyRef.current = key;
    void ensureTodayRevision({ silent: true }).then((count) => {
      if (!count && autoEnsureKeyRef.current === key) autoEnsureKeyRef.current = '';
    });
  }, [
    resolvedLoading,
    startingCount,
    resolvedActiveCount,
    userId,
    stockedCount,
    warehouseId,
    storeWarehouseId,
    ensureTodayRevision,
  ]);

  const markLineOk = async (lineIdx: number) => {
    if (!resolvedActiveCount || !userId) return;
    const line = resolvedActiveCount.lines[lineIdx];
    if (!line) return;
    setLineBusy(lineIdx);
    try {
      const updated = await updateCountLineRequest(userId, resolvedActiveCount._id, lineIdx, {
        countedStock: line.theoreticalStock,
        countedBy: actorUserId || undefined,
      });
      syncActiveCount(updated);
      scrollToNextPendingLine(updated, lineIdx);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al marcar');
    } finally {
      setLineBusy(null);
    }
  };

  const submitMismatch = async (lineIdx: number) => {
    if (!resolvedActiveCount || !userId) return;
    const qty = Number(mismatchQty.replace(',', '.'));
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Cantidad no válida');
      return;
    }
    setLineBusy(lineIdx);
    try {
      const updated = await updateCountLineRequest(userId, resolvedActiveCount._id, lineIdx, {
        countedStock: qty,
        countedBy: actorUserId || undefined,
      });
      syncActiveCount(updated);
      setMismatchIdx(null);
      setMismatchQty('');
      scrollToNextPendingLine(updated, lineIdx);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLineBusy(null);
    }
  };

  const stepCounted = async (lineIdx: number, delta: 1 | -1) => {
    if (!resolvedActiveCount || !userId) return;
    const line = resolvedActiveCount.lines[lineIdx];
    if (!line) return;
    if (mismatchIdx === lineIdx) {
      const base = Number(mismatchQty.replace(',', '.') || line.theoreticalStock);
      setMismatchQty(String(Math.max(0, base + delta)));
      return;
    }
    const base = line.countedStock != null ? Number(line.countedStock) : Number(line.theoreticalStock);
    const next = Math.max(0, base + delta);
    setLineBusy(lineIdx);
    try {
      const updated = await updateCountLineRequest(userId, resolvedActiveCount._id, lineIdx, {
        countedStock: next,
        countedBy: actorUserId || undefined,
      });
      syncActiveCount(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al ajustar');
    } finally {
      setLineBusy(null);
    }
  };

  const handleCompleteRevision = async () => {
    if (!resolvedActiveCount || !userId) return;
    setCompletingCount(true);
    try {
      const result = await completeStockCountRequest(userId, resolvedActiveCount._id);
      setCompletionReport({
        count: result.stockCount,
        adjustmentsCreated: result.adjustmentsCreated ?? 0,
        purchaseList: result.purchaseList,
      });
      syncActiveCount(null);
      // Bloquear auto-crear otra del mismo día; el botón manual sí permite otra.
      const wh = warehouseId || storeWarehouseId || 'default';
      autoEnsureKeyRef.current = `${userId}:${wh}:${new Date().toLocaleDateString('es-ES')}`;
      refreshCounts();
      onRevisionCompleted?.();
      const adj = result.adjustmentsCreated ?? 0;
      const diffs = countDiscrepancies(result.stockCount);
      toast.success(
        adj > 0
          ? `Revisión cerrada. ${adj} ajuste(s), ${diffs} desvío(s).`
          : diffs > 0
            ? `Revisión cerrada. ${diffs} desvío(s).`
            : 'Revisión cerrada. Todo cuadra.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cerrar la revisión');
    } finally {
      setCompletingCount(false);
    }
  };

  const pendingRevisionCount = useMemo(
    () => resolvedActiveCount?.lines.filter((l) => l.countedStock === null).length ?? 0,
    [resolvedActiveCount],
  );

  const revisionEntries = useMemo(() => {
    if (!resolvedActiveCount) return [];
    const search = revisionSearch.toLowerCase().trim();
    return resolvedActiveCount.lines
      .map((line, lineIdx) => ({ line, lineIdx }))
      .filter(({ line }) => {
        if (revisionFilter === 'pending' && line.countedStock !== null) return false;
        if (revisionFilter === 'reviewed' && line.countedStock === null) return false;
        if (!search) return true;
        return line.catalogItemName?.toLowerCase().includes(search) || line.sku?.toLowerCase().includes(search);
      });
  }, [resolvedActiveCount, revisionFilter, revisionSearch]);

  const reviewedCount = resolvedActiveCount?.lines.filter((l) => l.countedStock !== null).length ?? 0;
  const totalReviewLines = resolvedActiveCount?.lines.length ?? 0;
  const progressPct = totalReviewLines > 0 ? Math.round((reviewedCount / totalReviewLines) * 100) : 0;

  if ((resolvedLoading || startingCount) && !resolvedActiveCount) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-500">Preparando revisión de hoy…</p>
      </div>
    );
  }

  if (!resolvedActiveCount) {
    return (
      <>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            Revisión de hoy
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            {stockedCount === 0
              ? 'Primero carga el stock inicial para poder pasar lista.'
              : `Pasa lista de los productos con stock (${stockedCount}): Cuadra o No cuadra.`}
          </p>
          {warehouses.length > 1 && (
            <div className="mb-4 max-w-xs mx-auto text-left">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Almacén</label>
              <select
                value={warehouseId}
                onChange={(e) => {
                  autoEnsureKeyRef.current = '';
                  setWarehouseId(e.target.value);
                }}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {warehouses.filter((w) => w.active).map((w) => (
                  <option key={w._id} value={w._id}>{w.name}{w.isDefault ? ' (principal)' : ''}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => void ensureTodayRevision()}
            disabled={startingCount || stockedCount === 0}
            className="inline-flex items-center gap-2 min-h-[52px] touch-manipulation px-6 py-3 bg-emerald-600 text-white rounded-xl text-base font-semibold hover:bg-emerald-700 disabled:opacity-60"
          >
            {startingCount ? <Loader2 className="w-5 h-5 animate-spin" /> : <ClipboardCheck className="w-5 h-5" />}
            Empezar revisión de hoy
          </button>
          {stockedCount === 0 && (
            <p className="mt-4 text-sm text-amber-600 flex items-center justify-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Primero carga el stock inicial
            </p>
          )}
        </div>
        {completionReport && (
          <RevisionReportModal
            report={completionReport}
            userId={userId}
            onClose={() => setCompletionReport(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">{resolvedActiveCount.name}</h3>
          <p className="text-sm text-gray-500">
            {resolvedActiveCount.warehouseName || storeLabel} · {reviewedCount}/{totalReviewLines} revisados
            {pendingRevisionCount > 0 && (
              <> · <span className="text-amber-600 font-semibold">{pendingRevisionCount} pendientes</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 sm:w-32 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">{progressPct}%</span>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={revisionSearch}
          onChange={(e) => setRevisionSearch(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {([
          { id: 'pending' as const, label: 'Pendientes', count: pendingRevisionCount },
          { id: 'reviewed' as const, label: 'Revisados', count: reviewedCount },
          { id: 'all' as const, label: 'Todos', count: totalReviewLines },
        ]).map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setRevisionFilter(chip.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] touch-manipulation rounded-xl text-sm font-semibold border shrink-0 transition-colors ${
              revisionFilter === chip.id
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            {chip.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${revisionFilter === chip.id ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      {revisionEntries.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          <p className="font-medium text-gray-600 dark:text-gray-300">
            {revisionFilter === 'pending' ? '¡Todos revisados!' : 'Ningún producto en este filtro'}
          </p>
          {revisionFilter === 'pending' && reviewedCount === totalReviewLines && (
            <p className="text-sm text-gray-400 mt-2">Puedes cerrar la revisión abajo.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto overscroll-contain pr-1 -mr-1">
          {revisionEntries.map(({ line, lineIdx }) => (
            <RevisionLineCard
              key={`${line.catalogItemId}-${lineIdx}`}
              line={line}
              lineIdx={lineIdx}
              isBusy={lineBusy === lineIdx}
              isMismatchOpen={mismatchIdx === lineIdx}
              mismatchQty={mismatchQty}
              onMarkOk={markLineOk}
              onOpenMismatch={(idx) => {
                const lineItem = resolvedActiveCount?.lines[idx];
                setMismatchIdx(idx);
                setMismatchQty(String(lineItem?.theoreticalStock ?? 0));
              }}
              onCloseMismatch={() => { setMismatchIdx(null); setMismatchQty(''); }}
              onMismatchQtyChange={setMismatchQty}
              onSubmitMismatch={submitMismatch}
              onStepCounted={stepCounted}
              resolveUserName={resolveUserName}
            />
          ))}
        </div>
      )}

      <div className="sticky bottom-0 pt-3 pb-1 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent dark:from-gray-900 dark:via-gray-900">
        <button
          type="button"
          onClick={() => void handleCompleteRevision()}
          disabled={completingCount || reviewedCount < totalReviewLines}
          className="w-full sm:w-auto sm:float-right inline-flex items-center justify-center gap-2 min-h-[52px] touch-manipulation px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-base font-semibold disabled:opacity-50"
        >
          {completingCount ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          Cerrar revisión y corregir stock
        </button>
        {reviewedCount < totalReviewLines && (
          <p className="text-sm text-gray-500 sm:text-right mt-2 clear-both">
            Faltan {totalReviewLines - reviewedCount} producto{totalReviewLines - reviewedCount === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {completionReport && (
        <RevisionReportModal
          report={completionReport}
          userId={userId}
          onClose={() => setCompletionReport(null)}
        />
      )}
    </div>
  );
}
