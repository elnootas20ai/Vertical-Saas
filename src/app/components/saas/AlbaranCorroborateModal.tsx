import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
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
  buildAlbaranCompareRows,
  compareRowHasIssue,
  summarizeCompareIssues,
  type AlbaranCompareRow,
} from '../../lib/albaranReceptionCompare';
import { formatMoneyEs, formatQtyEs } from '../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { useModalClose } from '../../hooks/useModalClose';

const STATUS_LABEL: Record<AlbaranCompareRow['status'], string> = {
  ok: 'OK',
  qty_diff: 'Cantidad',
  price_diff: 'Precio',
  both_diff: 'Cant. + precio',
  missing_invoice: 'Falta en albarán',
  extra_invoice: 'Solo en albarán',
};

function statusClass(status: AlbaranCompareRow['status']): string {
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (status === 'extra_invoice' || status === 'missing_invoice') {
    return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  }
  return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';
}

export function AlbaranCorroborateModal({
  userId,
  order,
  invoice,
  onClose,
  onDone,
}: {
  userId: string;
  order: PurchaseOrder;
  invoice?: PurchaseInvoice | null;
  onClose: () => void;
  onDone: (result: { order: PurchaseOrder; invoice?: PurchaseInvoice | null }) => void;
}) {
  useModalClose(true, onClose);
  const [rows, setRows] = useState<AlbaranCompareRow[]>(() => buildAlbaranCompareRows(order, invoice));
  const [saving, setSaving] = useState(false);
  const [albaranNumber, setAlbaranNumber] = useState(
    () => invoice?.invoiceNumber || `ALB-${order.orderNumber || order._id.slice(-6)}`,
  );

  useEffect(() => {
    setRows(buildAlbaranCompareRows(order, invoice));
  }, [order, invoice]);

  const summary = useMemo(() => summarizeCompareIssues(rows), [rows]);
  const receivable = useMemo(
    () => rows.filter((r) => r.catalogItemId && r.receiveQty > 0 && r.status !== 'extra_invoice'),
    [rows],
  );

  const updateRow = (catalogItemId: string, name: string, patch: Partial<AlbaranCompareRow>) => {
    setRows((prev) =>
      prev.map((r) =>
        r.catalogItemId === catalogItemId && r.name === name ? { ...r, ...patch } : r,
      ),
    );
  };

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

      const updatedOrder = await markOrderReceivedRequest(userId, order._id, receivedItems);

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

      if (invoice) {
        savedInvoice = await updatePurchaseInvoiceRequest(userId, {
          ...invoice,
          linkedPurchaseOrderId: order._id,
          linkedPurchaseOrderNumber: order.orderNumber || '',
          lines: invoiceLines,
          ocrStockReceivedAt: new Date().toISOString(),
          documentKind: invoice.documentKind || 'albaran',
        } as PurchaseInvoice);
      } else {
        savedInvoice = await createPurchaseInvoiceRequest(userId, {
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          invoiceNumber: albaranNumber.trim() || `ALB-${Date.now().toString(36).toUpperCase()}`,
          date: new Date().toISOString().slice(0, 10),
          status: 'pending',
          lines: invoiceLines,
          taxRate: order.taxRate || 21,
          notes: `Corroborado con pedido ${order.orderNumber || order._id.slice(-8)}`,
          linkedPurchaseOrderId: order._id,
          linkedPurchaseOrderNumber: order.orderNumber || '',
          documentKind: 'albaran',
          entryMethod: 'manual',
          loadToWarehouse: false,
          ocrStockReceivedAt: new Date().toISOString(),
        } as Partial<PurchaseInvoice> & { loadToWarehouse?: boolean });
      }

      toast.success(
        `Corroborado: stock + costes de factura actualizados (${receivable.length} línea${receivable.length === 1 ? '' : 's'})`,
      );
      onDone({ order: updatedOrder, invoice: savedInvoice });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo corroborar la recepción');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Cerrar" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900 flex flex-col">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Corroborar albarán
            </h2>
            <p className="text-xs text-stone-500 mt-0.5 truncate">
              Pedido {order.orderNumber || '—'} · {order.supplierName || 'Proveedor'}
              {invoice?.invoiceNumber ? ` · Albarán ${invoice.invoiceNumber}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className={VERTIAL_BTN_SECONDARY + ' !min-h-0 px-2.5 py-2'}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 flex flex-wrap gap-2 text-xs border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/40">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> {summary.ok} OK
          </span>
          {summary.issues > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> {summary.issues} diferencias
            </span>
          )}
          {summary.extras > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-800">
              {summary.extras} solo en albarán
            </span>
          )}
          <span className="text-stone-500 self-center">
            Al confirmar: entra stock y se actualiza el coste (escandallo) con el precio de factura.
          </span>
        </div>

        {!invoice && (
          <div className="px-4 py-2 border-b border-stone-100 dark:border-stone-800">
            <label className="block text-xs font-medium text-stone-600 mb-1">Nº albarán</label>
            <input
              value={albaranNumber}
              onChange={(e) => setAlbaranNumber(e.target.value)}
              className="w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 py-2 text-sm"
              placeholder="ALB-001"
            />
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-stone-900 text-left text-xs text-stone-500 border-b border-stone-100 dark:border-stone-800">
              <tr>
                <th className="px-3 py-2 font-semibold">Producto</th>
                <th className="px-2 py-2 font-semibold text-right">Pedido</th>
                <th className="px-2 py-2 font-semibold text-right">Albarán</th>
                <th className="px-2 py-2 font-semibold text-right">Recibir</th>
                <th className="px-2 py-2 font-semibold text-right">€ factura</th>
                <th className="px-2 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {rows.map((row) => (
                <tr
                  key={`${row.catalogItemId}-${row.name}`}
                  className={compareRowHasIssue(row) ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-stone-900 dark:text-stone-100">{row.name}</p>
                    {row.sku ? <p className="text-[11px] text-stone-400">{row.sku}</p> : null}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-stone-600">
                    {formatQtyEs(row.orderedQty)}
                    <div className="text-[11px] text-stone-400">{formatMoneyEs(row.orderedUnitCost)}€</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-stone-600">
                    {invoice ? formatQtyEs(row.invoiceQty) : '—'}
                    <div className="text-[11px] text-stone-400">
                      {invoice && row.invoiceUnitCost > 0 ? `${formatMoneyEs(row.invoiceUnitCost)}€` : '—'}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {row.status === 'extra_invoice' ? (
                      <span className="text-xs text-stone-400">—</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={row.receiveQty}
                        onChange={(e) =>
                          updateRow(row.catalogItemId, row.name, {
                            receiveQty: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-20 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 px-2 py-1.5 text-right tabular-nums"
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {row.status === 'extra_invoice' ? (
                      <span className="text-xs text-stone-400">—</span>
                    ) : (
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
                        className="w-24 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 px-2 py-1.5 text-right tabular-nums"
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-lg ${statusClass(row.status)}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-100 dark:border-stone-800">
          <button type="button" onClick={onClose} className={VERTIAL_BTN_SECONDARY} disabled={saving}>
            Cancelar
          </button>
          <button type="button" onClick={() => void handleConfirm()} className={VERTIAL_BTN_PRIMARY} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirmar recepción
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
