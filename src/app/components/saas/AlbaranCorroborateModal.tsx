import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  PackageCheck,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseInvoice } from '../../lib/deliveryApi';
import {
  createPurchaseInvoiceRequest,
  updatePurchaseInvoiceRequest,
} from '../../lib/deliveryApi';
import {
  markOrderReceivedRequest,
  type PurchaseOrder,
} from '../../lib/purchaseOrderApi';
import {
  applyManualAlbaranQty,
  buildAlbaranCompareRows,
  buildPendingOrderLinesFromCompare,
  compareRowHasIssue,
  isAlbaranReceptionIncomplete,
  isCompareRowReceivable,
  pendingOrderQty,
  summarizeCompareIssues,
  toggleCompareRowExcluded,
  type AlbaranCompareRow,
} from '../../lib/albaranReceptionCompare';
import { nextPurchaseDocNumber } from '../../lib/purchaseDocNumber';
import { formatMoneyEs, formatQtyEs } from '../../lib/formatNumberEs';
import { toUserFacingMessage } from '../../lib/userFacingError';
import { VERTIAL_BTN_DANGER, VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { useModalClose } from '../../hooks/useModalClose';

const STATUS_LABEL: Record<AlbaranCompareRow['status'], string> = {
  ok: 'OK',
  qty_diff: 'Cantidad distinta',
  price_diff: 'Precio distinto',
  both_diff: 'Cant. y precio',
  missing_invoice: 'Falta en albarán',
  extra_invoice: 'Solo en albarán',
};

function statusClass(status: AlbaranCompareRow['status'], excluded: boolean): string {
  if (excluded) return 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400';
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (status === 'extra_invoice' || status === 'missing_invoice') {
    return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  }
  return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';
}

const inputClass =
  'w-full min-w-0 rounded-xl border-2 border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 px-2.5 py-2 text-sm text-right tabular-nums focus:border-blue-500 outline-none';

export function AlbaranCorroborateModal({
  userId,
  order,
  invoice,
  existingInvoiceNumbers = [],
  onClose,
  onDone,
}: {
  userId: string;
  order: PurchaseOrder;
  invoice?: PurchaseInvoice | null;
  existingInvoiceNumbers?: Array<string | undefined | null>;
  onClose: () => void;
  onDone: (result: { order: PurchaseOrder; invoice?: PurchaseInvoice | null }) => void;
}) {
  useModalClose(true, onClose);
  const [rows, setRows] = useState<AlbaranCompareRow[]>(() => buildAlbaranCompareRows(order, invoice));
  const [saving, setSaving] = useState(false);
  const [albaranNumber, setAlbaranNumber] = useState(
    () => invoice?.invoiceNumber || nextPurchaseDocNumber('albaran', existingInvoiceNumbers),
  );

  useEffect(() => {
    setRows(buildAlbaranCompareRows(order, invoice));
  }, [order, invoice]);

  const summary = useMemo(() => summarizeCompareIssues(rows), [rows]);
  const receivable = useMemo(() => rows.filter(isCompareRowReceivable), [rows]);
  const incomingRows = useMemo(
    () => rows.filter((r) => !r.excluded && r.status !== 'extra_invoice'),
    [rows],
  );
  const removedRows = useMemo(
    () => rows.filter((r) => r.excluded && r.status !== 'extra_invoice'),
    [rows],
  );
  const extraRows = useMemo(() => rows.filter((r) => r.status === 'extra_invoice'), [rows]);
  const orderIncomplete = useMemo(
    () => isAlbaranReceptionIncomplete(order, rows),
    [order, rows],
  );
  const pendingPreview = useMemo(
    () => buildPendingOrderLinesFromCompare(order, rows),
    [order, rows],
  );

  const pendingQtyForRow = (row: AlbaranCompareRow) => {
    const item = (order.items || []).find(
      (i) => i.catalogItemId === row.catalogItemId && i.name === row.name,
    );
    return item ? pendingOrderQty(item) : Math.max(0, row.orderedQty);
  };

  const updateRow = (catalogItemId: string, name: string, patch: Partial<AlbaranCompareRow>) => {
    setRows((prev) =>
      prev.map((r) =>
        r.catalogItemId === catalogItemId && r.name === name ? { ...r, ...patch } : r,
      ),
    );
  };

  const replaceRow = (catalogItemId: string, name: string, next: AlbaranCompareRow) => {
    setRows((prev) =>
      prev.map((r) => (r.catalogItemId === catalogItemId && r.name === name ? next : r)),
    );
  };

  const removeFromAlbaran = (row: AlbaranCompareRow) => {
    replaceRow(
      row.catalogItemId,
      row.name,
      toggleCompareRowExcluded(row, true, pendingQtyForRow(row)),
    );
  };

  const restoreToAlbaran = (row: AlbaranCompareRow) => {
    replaceRow(
      row.catalogItemId,
      row.name,
      toggleCompareRowExcluded(row, false, pendingQtyForRow(row)),
    );
  };

  const renderAlbaranQty = (row: AlbaranCompareRow) => {
    if (invoice) {
      return (
        <span className="tabular-nums font-medium text-stone-800 dark:text-stone-200">
          {formatQtyEs(row.invoiceQty)}
        </span>
      );
    }
    return (
      <input
        type="number"
        min={0}
        step="any"
        value={row.invoiceQty}
        onChange={(e) =>
          replaceRow(
            row.catalogItemId,
            row.name,
            applyManualAlbaranQty(row, Math.max(0, Number(e.target.value) || 0)),
          )
        }
        className={inputClass}
        title="Cantidad en el albarán físico"
      />
    );
  };

  const renderRowCard = (row: AlbaranCompareRow) => (
    <div
      key={`card-${row.catalogItemId}-${row.name}`}
      className={`rounded-xl border p-3 space-y-3 ${
        compareRowHasIssue(row)
          ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/10'
          : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-stone-900 dark:text-stone-100">{row.name}</p>
          {row.sku ? <p className="text-[11px] text-stone-400 mt-0.5">{row.sku}</p> : null}
        </div>
        <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${statusClass(row.status, false)}`}>
          {STATUS_LABEL[row.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-stone-50 dark:bg-stone-950/60 px-2.5 py-2">
          <p className="text-stone-500 mb-0.5">Pedido</p>
          <p className="font-semibold tabular-nums text-stone-800 dark:text-stone-200">
            {formatQtyEs(row.orderedQty)}
            <span className="text-stone-400 font-normal"> · {formatMoneyEs(row.orderedUnitCost)}€</span>
          </p>
        </div>
        <div className="rounded-lg bg-stone-50 dark:bg-stone-950/60 px-2.5 py-2">
          <p className="text-stone-500 mb-0.5">En albarán</p>
          <div className="font-semibold">{renderAlbaranQty(row)}</div>
          {invoice && row.invoiceUnitCost > 0 ? (
            <p className="text-stone-400 mt-0.5 tabular-nums">{formatMoneyEs(row.invoiceUnitCost)}€</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-stone-500 mb-1">Recibir</label>
          <input
            type="number"
            min={0}
            step="any"
            value={row.receiveQty}
            onChange={(e) => {
              const qty = Math.max(0, Number(e.target.value) || 0);
              if (qty <= 0) {
                removeFromAlbaran(row);
                return;
              }
              updateRow(row.catalogItemId, row.name, { receiveQty: qty, excluded: false });
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-stone-500 mb-1">Precio €</label>
          <input
            type="number"
            min={0}
            step="any"
            value={row.receiveUnitCost}
            onChange={(e) =>
              updateRow(row.catalogItemId, row.name, {
                receiveUnitCost: Math.max(0, Number(e.target.value) || 0),
              })
            }
            className={inputClass}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => removeFromAlbaran(row)}
        className={`${VERTIAL_BTN_DANGER} !min-h-0 w-full py-2 text-xs inline-flex items-center justify-center gap-1.5`}
        title="Quitar: no viene en este albarán"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Quitar del albarán
      </button>
    </div>
  );

  const renderIncomingRow = (row: AlbaranCompareRow) => (
    <tr
      key={`${row.catalogItemId}-${row.name}`}
      className={compareRowHasIssue(row) ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}
    >
      <td className="px-4 py-3 align-top">
        <p className="font-medium text-stone-900 dark:text-stone-100">{row.name}</p>
        {row.sku ? <p className="text-[11px] text-stone-400 mt-0.5">{row.sku}</p> : null}
      </td>
      <td className="px-3 py-3 align-top text-right tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap">
        <span className="font-medium text-stone-800 dark:text-stone-200">{formatQtyEs(row.orderedQty)}</span>
        <div className="text-[11px] text-stone-400">{formatMoneyEs(row.orderedUnitCost)}€</div>
      </td>
      <td className="px-3 py-3 align-top text-right whitespace-nowrap">
        <div className="inline-block min-w-[5rem]">{renderAlbaranQty(row)}</div>
        {invoice && row.invoiceUnitCost > 0 ? (
          <div className="text-[11px] text-stone-400 tabular-nums">{formatMoneyEs(row.invoiceUnitCost)}€</div>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        <input
          type="number"
          min={0}
          step="any"
          value={row.receiveQty}
          onChange={(e) => {
            const qty = Math.max(0, Number(e.target.value) || 0);
            if (qty <= 0) {
              removeFromAlbaran(row);
              return;
            }
            updateRow(row.catalogItemId, row.name, { receiveQty: qty, excluded: false });
          }}
          className={`${inputClass} w-24`}
        />
      </td>
      <td className="px-3 py-3 align-top">
        <input
          type="number"
          min={0}
          step="any"
          value={row.receiveUnitCost}
          onChange={(e) =>
            updateRow(row.catalogItemId, row.name, {
              receiveUnitCost: Math.max(0, Number(e.target.value) || 0),
            })
          }
          className={`${inputClass} w-28`}
        />
      </td>
      <td className="px-3 py-3 align-top">
        <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-lg whitespace-nowrap ${statusClass(row.status, false)}`}>
          {STATUS_LABEL[row.status]}
        </span>
      </td>
      <td className="px-3 py-3 align-top text-right">
        <button
          type="button"
          onClick={() => removeFromAlbaran(row)}
          className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          title="Quitar: no viene en este albarán"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );

  const handleConfirm = async () => {
    if (receivable.length === 0) {
      toast.error('Indica al menos una cantidad a recibir');
      return;
    }
    setSaving(true);
    try {
      const receivedItems = receivable.map((r) => ({
        catalogItemId: r.catalogItemId,
        quantity: r.receiveQty,
        unitCost: r.receiveUnitCost,
      }));

      const receiveResult = await markOrderReceivedRequest(userId, order._id, receivedItems);
      const updatedOrder = receiveResult.order;
      const pendingOrderLines = buildPendingOrderLinesFromCompare(order, rows);
      const incomplete = pendingOrderLines.length > 0;

      let savedInvoice: PurchaseInvoice | null | undefined = invoice || null;
      const invoiceLines = receivable.map((r, idx) => ({
        id: `pinvl-${idx}`,
        itemName: r.name,
        quantity: r.receiveQty,
        unitPrice: r.receiveUnitCost,
        total: Math.round(r.receiveQty * r.receiveUnitCost * 100) / 100,
        catalogItemId: r.catalogItemId,
        catalogItemName: r.name,
      }));

      const stockOk = (receiveResult.stockUpdated || 0) > 0 || receivable.every((r) => !r.catalogItemId);
      const receptionNote = incomplete
        ? `Pedido incompleto: pendiente ${pendingOrderLines.map((l) => `${l.name} (${l.pendingQty})`).join(', ')}`
        : '';
      const mergedNotes = [invoice?.notes, receptionNote].filter(Boolean).join('\n');

      if (invoice?._id) {
        savedInvoice = await updatePurchaseInvoiceRequest(userId, {
          ...invoice,
          linkedPurchaseOrderId: order._id,
          linkedPurchaseOrderNumber: order.orderNumber || '',
          lines: invoiceLines,
          ocrStockReceivedAt: stockOk ? new Date().toISOString() : '',
          documentKind: invoice.documentKind || 'albaran',
          pendingOrderLines,
          flags: { ...invoice.flags, orderIncomplete: incomplete },
          notes: mergedNotes || invoice.notes,
        } as PurchaseInvoice);
      } else {
        savedInvoice = await createPurchaseInvoiceRequest(userId, {
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          invoiceNumber:
            albaranNumber.trim()
            || invoice?.invoiceNumber
            || nextPurchaseDocNumber('albaran', existingInvoiceNumbers),
          date: invoice?.date || new Date().toISOString().slice(0, 10),
          status: 'pending',
          lines: invoiceLines,
          taxRate: invoice?.taxRate || order.taxRate || 21,
          notes: mergedNotes || `Comprobado con pedido ${order.orderNumber || order._id.slice(-8)}`,
          linkedPurchaseOrderId: order._id,
          linkedPurchaseOrderNumber: order.orderNumber || '',
          documentKind: 'albaran',
          entryMethod: invoice?.entryMethod || 'manual',
          ocrData: invoice?.ocrData,
          ocrImageBase64: invoice?.ocrImageBase64,
          loadToWarehouse: false,
          ocrStockReceivedAt: stockOk ? new Date().toISOString() : '',
          pendingOrderLines,
          flags: { orderIncomplete: incomplete },
        } as Partial<PurchaseInvoice> & { loadToWarehouse?: boolean });
      }

      if (!stockOk) {
        toast.message(
          'Pedido comprobado, pero el stock no entró. Abre el albarán y pulsa «Cargar al almacén».',
        );
      } else if (incomplete) {
        toast.message(
          `Pedido incompleto: ${pendingOrderLines.length} producto(s) pendientes de pedir de nuevo`,
        );
      } else {
        toast.success(
          `Comprobado: stock actualizado (${receiveResult.stockUpdated || 0} línea${(receiveResult.stockUpdated || 0) === 1 ? '' : 's'})`,
        );
      }
      onDone({ order: updatedOrder, invoice: savedInvoice });
      onClose();
    } catch (err) {
      toast.error(toUserFacingMessage(err, 'No se pudo comprobar la recepción'));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label="Cerrar" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-900 flex flex-col">
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Comprobar albarán
              </h2>
            </div>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
              <span className="font-mono font-semibold text-stone-700 dark:text-stone-300">
                {order.orderNumber || 'Pedido'}
              </span>
              {' · '}
              {order.supplierName || 'Proveedor'}
              {invoice?.invoiceNumber ? (
                <>
                  {' · Albarán '}
                  <span className="font-mono">{invoice.invoiceNumber}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/40 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">Correctos</p>
              <p className="text-lg font-bold text-emerald-600 tabular-nums flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                {summary.ok}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">Diferencias</p>
              <p className={`text-lg font-bold tabular-nums flex items-center gap-1 ${summary.issues > 0 ? 'text-amber-600' : 'text-stone-400'}`}>
                <AlertTriangle className="w-4 h-4" />
                {summary.issues}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">Quitados</p>
              <p className="text-lg font-bold text-stone-600 dark:text-stone-400 tabular-nums">{removedRows.length}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">Solo albarán</p>
              <p className="text-lg font-bold text-stone-600 dark:text-stone-400 tabular-nums">{summary.extras}</p>
            </div>
          </div>

          <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20 px-3 py-2.5 text-xs text-blue-900 dark:text-blue-200">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
            <p>
              Compara pedido y albarán. Ajusta <strong>Recibir</strong> si llegó distinto.
              Si un producto <strong>no viene</strong>, pulsa Quitar — no entra en stock.
            </p>
          </div>
        </div>

        {orderIncomplete ? (
          <div className="px-4 sm:px-6 py-3 border-b border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Este albarán deja el pedido incompleto
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
              Pendiente de pedir:{' '}
              {pendingPreview.map((l) => `${l.name} (${formatQtyEs(l.pendingQty)})`).join(' · ')}
            </p>
          </div>
        ) : null}

        {!invoice ? (
          <div className="px-4 sm:px-6 py-3 border-b border-stone-100 dark:border-stone-800">
            <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5">
              Nº albarán
            </label>
            <input
              value={albaranNumber}
              onChange={(e) => setAlbaranNumber(e.target.value)}
              className="w-full max-w-xs rounded-xl border-2 border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 py-2.5 text-sm font-mono focus:border-blue-500 outline-none"
              placeholder="A-0001"
            />
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto min-h-0">
          {incomingRows.length === 0 ? (
            <p className="px-4 sm:px-6 py-10 text-sm text-stone-500 text-center">
              No queda ningún producto en el albarán. Recupera alguno abajo o cancela.
            </p>
          ) : (
            <>
              <div className="md:hidden p-3 sm:p-4 space-y-3">
                {incomingRows.map((row) => renderRowCard(row))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-950 text-xs text-stone-500 border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-left">Producto</th>
                      <th className="px-3 py-3 font-semibold text-right">Pedido</th>
                      <th className="px-3 py-3 font-semibold text-right">En albarán</th>
                      <th className="px-3 py-3 font-semibold text-right w-28">Recibir</th>
                      <th className="px-3 py-3 font-semibold text-right w-32">Precio €</th>
                      <th className="px-3 py-3 font-semibold text-left">Estado</th>
                      <th className="px-3 py-3 w-12" aria-label="Quitar" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {incomingRows.map((row) => renderIncomingRow(row))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {removedRows.length > 0 ? (
            <div className="border-t border-stone-200 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-950/50 px-4 sm:px-6 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-3">
                Quitados del albarán ({removedRows.length})
              </p>
              <ul className="space-y-2">
                {removedRows.map((row) => (
                  <li
                    key={`removed-${row.catalogItemId}-${row.name}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-stone-500 line-through truncate">{row.name}</p>
                      <p className="text-[11px] text-stone-400">
                        Pedido {formatQtyEs(row.orderedQty)} · no viene en este albarán
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreToAlbaran(row)}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-1.5 text-xs inline-flex items-center gap-1 shrink-0`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Recuperar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {extraRows.length > 0 ? (
            <div className="border-t border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 sm:px-6 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-2">
                Solo en albarán, no en pedido ({extraRows.length})
              </p>
              <ul className="space-y-1.5 text-sm text-amber-900/90 dark:text-amber-200/90">
                {extraRows.map((row) => (
                  <li key={`extra-${row.name}`} className="flex justify-between gap-2 rounded-lg bg-white/60 dark:bg-stone-900/40 px-3 py-2">
                    <span className="truncate">{row.name}</span>
                    <span className="tabular-nums shrink-0 font-medium">{formatQtyEs(row.invoiceQty)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 px-4 sm:px-6 py-4 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <button type="button" onClick={onClose} className={`${VERTIAL_BTN_SECONDARY} w-full sm:w-auto`} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            className={`${VERTIAL_BTN_PRIMARY} w-full sm:w-auto inline-flex items-center justify-center gap-2`}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirmar recepción
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
