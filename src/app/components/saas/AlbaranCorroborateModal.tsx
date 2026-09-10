import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { CatalogItem, PurchaseInvoice, Supplier } from '../../lib/deliveryApi';
import {
  createPurchaseInvoiceRequest,
  deletePurchaseInvoiceRequest,
  loadPurchaseInvoiceStockRequest,
  updatePurchaseInvoiceRequest,
} from '../../lib/deliveryApi';
import type { StoreIngredient } from '../../lib/catalogCustomization';
import type { InventoryCommercialBrand } from '../../lib/inventoryUtils';
import {
  markOrderReceivedRequest,
  type PurchaseOrder,
} from '../../lib/purchaseOrderApi';
import {
  applyManualAlbaranQty,
  buildAlbaranCompareRows,
  buildAlbaranRowsFromInvoiceOnly,
  buildPendingOrderLinesFromCompare,
  compareRowHasIssue,
  isAlbaranReceptionIncomplete,
  isCompareRowReceivable,
  pendingOrderQty,
  summarizeCompareIssues,
  toggleCompareRowExcluded,
  type AlbaranCompareRow,
} from '../../lib/albaranReceptionCompare';
import {
  ensureAlbaranSupplierFromOcr,
  rematchAlbaranLinesToCatalog,
} from '../../lib/albaranSupplierEnsure';
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

function buildRows(
  order: PurchaseOrder | null | undefined,
  invoice: PurchaseInvoice | null | undefined,
): AlbaranCompareRow[] {
  if (order) return buildAlbaranCompareRows(order, invoice);
  return buildAlbaranRowsFromInvoiceOnly(invoice);
}

export function AlbaranCorroborateModal({
  userId,
  order = null,
  invoice,
  existingInvoiceNumbers = [],
  warehouseId = '',
  salesPointId = '',
  workCenterId = '',
  suppliers = [],
  catalogItems = [],
  storeIngredients = [],
  commercialBrands = [],
  onClose,
  onDone,
  onSupplierEnsured,
}: {
  userId: string;
  order?: PurchaseOrder | null;
  invoice?: PurchaseInvoice | null;
  existingInvoiceNumbers?: Array<string | undefined | null>;
  warehouseId?: string;
  salesPointId?: string;
  workCenterId?: string;
  suppliers?: Supplier[];
  catalogItems?: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  commercialBrands?: InventoryCommercialBrand[];
  onClose: () => void;
  onDone: (result: {
    order?: PurchaseOrder | null;
    invoice?: PurchaseInvoice | null;
    revoked?: boolean;
  }) => void;
  onSupplierEnsured?: (supplier: Supplier, catalogUpdates: CatalogItem[]) => void;
}) {
  const [workingInvoice, setWorkingInvoice] = useState<PurchaseInvoice | null | undefined>(invoice);
  const [rows, setRows] = useState<AlbaranCompareRow[]>(() => buildRows(order, invoice));
  const [saving, setSaving] = useState(false);
  const [ensuringSupplier, setEnsuringSupplier] = useState(false);
  const [supplierLabel, setSupplierLabel] = useState(
    () => invoice?.supplierName || order?.supplierName || '',
  );
  const [albaranNumber, setAlbaranNumber] = useState(
    () => invoice?.invoiceNumber || nextPurchaseDocNumber('albaran', existingInvoiceNumbers),
  );
  const ensureRanRef = useRef(false);
  const leaveBusyRef = useRef(false);

  useEffect(() => {
    setWorkingInvoice(invoice);
    setRows(buildRows(order, invoice));
    setSupplierLabel(invoice?.supplierName || order?.supplierName || '');
    setAlbaranNumber(
      invoice?.invoiceNumber || nextPurchaseDocNumber('albaran', existingInvoiceNumbers),
    );
    ensureRanRef.current = false;
  }, [order, invoice, existingInvoiceNumbers]);

  useEffect(() => {
    if (ensureRanRef.current || !userId) return;
    const ocr = workingInvoice?.ocrData;
    const hasEmitter = Boolean(String(ocr?.emitter || workingInvoice?.supplierName || '').trim());
    if (!hasEmitter && workingInvoice?.supplierId) return;
    if (!ocr && workingInvoice?.supplierId) return;
    if (!ocr && !workingInvoice?.supplierId && order?.supplierId) return;

    ensureRanRef.current = true;
    let cancelled = false;
    (async () => {
      setEnsuringSupplier(true);
      try {
        const result = await ensureAlbaranSupplierFromOcr({
          userId,
          suppliers,
          catalogItems,
          storeIngredients,
          commercialBrands,
          emitter: ocr?.emitter || workingInvoice?.supplierName || order?.supplierName || '',
          emitterCif: ocr?.emitterCIF || workingInvoice?.supplierCif || '',
          ocrLines: (ocr?.lines || workingInvoice?.lines || []).map((l) => ({
            description: 'description' in l ? String((l as { description?: string }).description || '') : '',
            itemName: 'itemName' in l ? String((l as { itemName?: string }).itemName || '') : '',
            catalogItemName:
              'catalogItemName' in l
                ? String((l as { catalogItemName?: string }).catalogItemName || '')
                : '',
          })),
          existingSupplierId: workingInvoice?.supplierId || order?.supplierId || '',
        });
        if (cancelled || !result) return;
        const rematchedLines = rematchAlbaranLinesToCatalog(
          workingInvoice?.lines || [],
          result.catalogItemsUpdated.length
            ? catalogItems.map((c) => {
                const u = result.catalogItemsUpdated.find((x) => x._id === c._id);
                return u || c;
              })
            : catalogItems,
          result.supplier._id,
        );
        const nextInv: PurchaseInvoice = {
          ...(workingInvoice || ({} as PurchaseInvoice)),
          supplierId: result.supplier._id,
          supplierName: result.supplier.name,
          supplierCif: result.supplier.cif || workingInvoice?.supplierCif || '',
          lines: rematchedLines.length > 0 ? rematchedLines : workingInvoice?.lines || [],
          documentKind: 'albaran',
        };
        setWorkingInvoice(nextInv);
        setSupplierLabel(result.supplier.name);
        setRows(buildRows(order, nextInv));
        onSupplierEnsured?.(result.supplier, result.catalogItemsUpdated);
        if (result.created) {
          toast.success(`Proveedor «${result.supplier.name}» creado y productos vinculados`);
        }
      } catch (err) {
        toast.message(toUserFacingMessage(err, 'No se pudo auto-asignar proveedor'));
      } finally {
        if (!cancelled) setEnsuringSupplier(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al abrir / cambiar draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workingInvoice?._id, workingInvoice?.ocrData?.emitter, order?._id]);

  const allowExtras = !order;
  const summary = useMemo(() => summarizeCompareIssues(rows), [rows]);
  const receivable = useMemo(
    () => rows.filter((r) => isCompareRowReceivable(r, { allowExtras })),
    [rows, allowExtras],
  );
  const incomingRows = useMemo(
    () => rows.filter((r) => !r.excluded && (allowExtras || r.status !== 'extra_invoice')),
    [rows, allowExtras],
  );
  const removedRows = useMemo(
    () => rows.filter((r) => r.excluded && r.status !== 'extra_invoice'),
    [rows],
  );
  const extraRows = useMemo(
    () => (allowExtras ? [] : rows.filter((r) => r.status === 'extra_invoice')),
    [rows, allowExtras],
  );
  const orderIncomplete = useMemo(
    () => (order ? isAlbaranReceptionIncomplete(order, rows) : false),
    [order, rows],
  );
  const pendingPreview = useMemo(
    () => (order ? buildPendingOrderLinesFromCompare(order, rows) : []),
    [order, rows],
  );

  const pendingQtyForRow = (row: AlbaranCompareRow) => {
    if (!order) return Math.max(0, row.invoiceQty || row.receiveQty);
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

  const buildInvoiceLines = () =>
    receivable.map((r, idx) => ({
      id: `pinvl-${idx}`,
      itemName: r.name,
      quantity: r.receiveQty,
      unitPrice: r.receiveUnitCost,
      total: Math.round(r.receiveQty * r.receiveUnitCost * 100) / 100,
      catalogItemId: r.catalogItemId,
      catalogItemName: r.name,
    }));

  const buildDraftPayload = (opts?: { withStock?: boolean; stockOk?: boolean }) => {
    const lines =
      buildInvoiceLines().length > 0
        ? buildInvoiceLines()
        : (workingInvoice?.lines || []).map((l, idx) => ({
            id: l.id || `draft-${idx}`,
            itemName: l.itemName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            total: l.total,
            catalogItemId: l.catalogItemId,
            catalogItemName: l.catalogItemName,
          }));
    const pendingOrderLines = order ? buildPendingOrderLinesFromCompare(order, rows) : [];
    const incomplete = pendingOrderLines.length > 0;
    const number =
      albaranNumber.trim()
      || workingInvoice?.invoiceNumber
      || nextPurchaseDocNumber('albaran', existingInvoiceNumbers);
    return {
      supplierId: workingInvoice?.supplierId || order?.supplierId || '',
      supplierName: supplierLabel || workingInvoice?.supplierName || order?.supplierName || '',
      supplierCif: workingInvoice?.supplierCif || '',
      invoiceNumber: number,
      date: workingInvoice?.date || new Date().toISOString().slice(0, 10),
      status: 'pending' as const,
      lines,
      taxRate: workingInvoice?.taxRate || order?.taxRate || 21,
      notes: workingInvoice?.notes || '',
      linkedPurchaseOrderId: order?._id || workingInvoice?.linkedPurchaseOrderId || '',
      linkedPurchaseOrderNumber: order?.orderNumber || workingInvoice?.linkedPurchaseOrderNumber || '',
      documentKind: 'albaran' as const,
      entryMethod: workingInvoice?.entryMethod || (workingInvoice?.ocrData ? 'ocr' : 'manual'),
      ocrData: workingInvoice?.ocrData,
      ocrImageBase64: workingInvoice?.ocrImageBase64,
      loadToWarehouse: false,
      warehouseId: warehouseId || workingInvoice?.warehouseId || '',
      salesPointId: salesPointId || workingInvoice?.salesPointId || '',
      workCenterId: workCenterId || workingInvoice?.workCenterId || '',
      ocrStockReceivedAt: opts?.withStock && opts.stockOk ? new Date().toISOString() : '',
      pendingOrderLines,
      flags: {
        ...(workingInvoice?.flags || {}),
        orderIncomplete: incomplete,
        stockPending: !(opts?.withStock && opts.stockOk),
      },
    };
  };

  const persistDraft = async (): Promise<PurchaseInvoice> => {
    const payload = buildDraftPayload({ withStock: false });
    if (workingInvoice?._id) {
      return updatePurchaseInvoiceRequest(userId, {
        ...workingInvoice,
        ...payload,
        ocrStockReceivedAt: '',
      } as PurchaseInvoice);
    }
    return createPurchaseInvoiceRequest(userId, payload as Partial<PurchaseInvoice> & { loadToWarehouse?: boolean });
  };

  const handleLeaveWaiting = async () => {
    if (leaveBusyRef.current || saving) return;
    leaveBusyRef.current = true;
    setSaving(true);
    try {
      const hasContent =
        Boolean(workingInvoice?.ocrData)
        || (workingInvoice?.lines || []).length > 0
        || rows.some((r) => !r.excluded && r.receiveQty > 0)
        || Boolean(albaranNumber.trim());
      if (!hasContent && !workingInvoice?._id) {
        onClose();
        return;
      }
      const saved = await persistDraft();
      toast.message('Albarán guardado en «por comprobar»');
      onDone({ order: order || null, invoice: saved });
      onClose();
    } catch (err) {
      toast.error(toUserFacingMessage(err, 'No se pudo guardar el albarán'));
    } finally {
      leaveBusyRef.current = false;
      setSaving(false);
    }
  };

  useModalClose(true, () => {
    void handleLeaveWaiting();
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleRevoke = async () => {
    if (saving) return;
    if (workingInvoice?.ocrStockReceivedAt) {
      toast.error('El stock ya entró; no se puede revocar');
      return;
    }
    setSaving(true);
    try {
      if (workingInvoice?._id) {
        await deletePurchaseInvoiceRequest(userId, workingInvoice._id);
      }
      toast.message('Albarán revocado · no entró en almacén');
      onDone({ order: order || null, invoice: null, revoked: true });
      onClose();
    } catch (err) {
      toast.error(toUserFacingMessage(err, 'No se pudo revocar el albarán'));
    } finally {
      setSaving(false);
    }
  };

  const renderAlbaranQty = (row: AlbaranCompareRow) => {
    if (workingInvoice && (workingInvoice.lines || []).length > 0 && order) {
      return (
        <span className="tabular-nums font-medium text-stone-800 dark:text-stone-200">
          {formatQtyEs(row.invoiceQty)}
        </span>
      );
    }
    if (workingInvoice?.ocrData && order) {
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
        {order ? (
          <div className="rounded-lg bg-stone-50 dark:bg-stone-950/60 px-2.5 py-2">
            <p className="text-stone-500 mb-0.5">Pedido</p>
            <p className="font-semibold tabular-nums text-stone-800 dark:text-stone-200">
              {formatQtyEs(row.orderedQty)}
              <span className="text-stone-400 font-normal"> · {formatMoneyEs(row.orderedUnitCost)}€</span>
            </p>
          </div>
        ) : null}
        <div className={`rounded-lg bg-stone-50 dark:bg-stone-950/60 px-2.5 py-2 ${order ? '' : 'col-span-2'}`}>
          <p className="text-stone-500 mb-0.5">En albarán</p>
          <div className="font-semibold">{renderAlbaranQty(row)}</div>
          {row.invoiceUnitCost > 0 ? (
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
      {order ? (
        <td className="px-3 py-3 align-top text-right tabular-nums text-stone-600 dark:text-stone-400 whitespace-nowrap">
          <span className="font-medium text-stone-800 dark:text-stone-200">{formatQtyEs(row.orderedQty)}</span>
          <div className="text-[11px] text-stone-400">{formatMoneyEs(row.orderedUnitCost)}€</div>
        </td>
      ) : null}
      <td className="px-3 py-3 align-top text-right whitespace-nowrap">
        <div className="inline-block min-w-[5rem]">{renderAlbaranQty(row)}</div>
        {row.invoiceUnitCost > 0 ? (
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
      toast.error(
        allowExtras
          ? 'Vincula al menos una línea a un artículo de almacén (proveedor / catálogo)'
          : 'Indica al menos una cantidad a recibir',
      );
      return;
    }
    setSaving(true);
    try {
      const invoiceLines = buildInvoiceLines();
      let savedInvoice: PurchaseInvoice | null | undefined = workingInvoice || null;
      let updatedOrder: PurchaseOrder | null = order || null;
      let stockOk = false;
      let stockUpdated = 0;
      let resolvedWarehouseId = warehouseId || '';

      if (order) {
        const receivedItems = receivable.map((r) => ({
          catalogItemId: r.catalogItemId,
          quantity: r.receiveQty,
          unitCost: r.receiveUnitCost,
        }));
        const receiveResult = await markOrderReceivedRequest(userId, order._id, receivedItems, {
          warehouseId,
          salesPointId,
          workCenterId,
        });
        updatedOrder = receiveResult.order;
        stockOk = (receiveResult.stockUpdated || 0) > 0;
        stockUpdated = receiveResult.stockUpdated || 0;
        resolvedWarehouseId = receiveResult.warehouseId || warehouseId || '';
        const pendingOrderLines = buildPendingOrderLinesFromCompare(order, rows);
        const incomplete = pendingOrderLines.length > 0;
        const receptionNote = incomplete
          ? `Pedido incompleto: pendiente ${pendingOrderLines.map((l) => `${l.name} (${l.pendingQty})`).join(', ')}`
          : '';
        const mergedNotes = [workingInvoice?.notes, receptionNote].filter(Boolean).join('\n');
        const payload = {
          ...buildDraftPayload({ withStock: true, stockOk }),
          lines: invoiceLines,
          notes: mergedNotes || workingInvoice?.notes || '',
          warehouseId: resolvedWarehouseId || warehouseId,
          ocrStockReceivedAt: stockOk ? new Date().toISOString() : '',
          pendingOrderLines,
          flags: { orderIncomplete: incomplete, stockPending: !stockOk },
        };
        if (workingInvoice?._id) {
          savedInvoice = await updatePurchaseInvoiceRequest(userId, {
            ...workingInvoice,
            ...payload,
          } as PurchaseInvoice);
        } else {
          savedInvoice = await createPurchaseInvoiceRequest(
            userId,
            payload as Partial<PurchaseInvoice> & { loadToWarehouse?: boolean },
          );
        }
        if (!stockOk) {
          toast.message(
            resolvedWarehouseId
              ? 'Pedido comprobado, pero el stock no entró. Revisa vínculos de artículos.'
              : 'Pedido comprobado, pero no hay almacén de tienda.',
          );
        } else if (incomplete) {
          toast.message(
            `Pedido incompleto: ${pendingOrderLines.length} producto(s) pendientes de pedir de nuevo`,
          );
        } else {
          toast.success(
            `Entró en almacén (${stockUpdated} línea${stockUpdated === 1 ? '' : 's'})`,
          );
        }
      } else {
        const payload = buildDraftPayload({ withStock: false });
        if (workingInvoice?._id) {
          savedInvoice = await updatePurchaseInvoiceRequest(userId, {
            ...workingInvoice,
            ...payload,
            lines: invoiceLines,
            ocrStockReceivedAt: '',
          } as PurchaseInvoice);
        } else {
          savedInvoice = await createPurchaseInvoiceRequest(userId, {
            ...payload,
            lines: invoiceLines,
            ocrStockReceivedAt: '',
          } as Partial<PurchaseInvoice> & { loadToWarehouse?: boolean });
        }
        const loadResult = await loadPurchaseInvoiceStockRequest(userId, savedInvoice._id, {
          force: false,
          warehouseId: warehouseId || savedInvoice.warehouseId || '',
          salesPointId,
          workCenterId,
        });
        savedInvoice = loadResult.invoice;
        stockUpdated = loadResult.reconcile?.stockUpdated || 0;
        stockOk = stockUpdated > 0 || Boolean(savedInvoice.ocrStockReceivedAt);
        if (stockOk) {
          toast.success(
            stockUpdated > 0
              ? `Entró en almacén (${stockUpdated} artículo${stockUpdated === 1 ? '' : 's'})`
              : 'Albarán cargado en almacén',
          );
        } else {
          toast.message('Albarán guardado, pero no subió stock. Revisa vínculos de artículos.');
        }
      }

      onDone({ order: updatedOrder, invoice: savedInvoice });
      onClose();
    } catch (err) {
      toast.error(toUserFacingMessage(err, 'No se pudo confirmar la recepción'));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || ensuringSupplier;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-stone-50 dark:bg-stone-950">
      <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Comprobar albarán
              </h2>
              {ensuringSupplier ? (
                <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
              ) : null}
            </div>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
              {order ? (
                <>
                  <span className="font-mono font-semibold text-stone-700 dark:text-stone-300">
                    {order.orderNumber || 'Pedido'}
                  </span>
                  {' · '}
                </>
              ) : (
                <span className="text-amber-700 dark:text-amber-300">Sin pedido · </span>
              )}
              {supplierLabel || 'Proveedor'}
              {workingInvoice?.invoiceNumber || albaranNumber ? (
                <>
                  {' · Albarán '}
                  <span className="font-mono">{workingInvoice?.invoiceNumber || albaranNumber}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLeaveWaiting()}
            className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
            title="Dejar en espera"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/40 space-y-3 shrink-0">
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
              {order
                ? <>Compara pedido y albarán. Ajusta <strong>Recibir</strong> si llegó distinto. Si un producto <strong>no viene</strong>, pulsa Quitar.</>
                : <>Revisa líneas del albarán. <strong>Entrar a almacén</strong> carga stock; salir guarda en «por comprobar».</>}
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

        {!workingInvoice?._id || !workingInvoice.invoiceNumber ? (
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

        <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
          {incomingRows.length === 0 ? (
            <p className="px-4 sm:px-6 py-10 text-sm text-stone-500 text-center">
              {order
                ? 'No queda ningún producto en el albarán. Recupera alguno abajo o deja en espera.'
                : 'Sin líneas. Escanea un albarán o abre uno desde «por comprobar».'}
            </p>
          ) : (
            <>
              <div className="md:hidden p-3 sm:p-4 space-y-3">
                {incomingRows.map((row) => renderRowCard(row))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-950 text-xs text-stone-500 border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-left">Producto</th>
                      {order ? <th className="px-3 py-3 font-semibold text-right">Pedido</th> : null}
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
                        {order
                          ? `Pedido ${formatQtyEs(row.orderedQty)} · no viene en este albarán`
                          : 'Quitado · no entra en stock'}
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

        <div className="shrink-0 flex flex-col gap-2 px-4 sm:px-6 py-4 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void handleRevoke()}
              className={`${VERTIAL_BTN_DANGER} w-full sm:w-auto`}
              disabled={busy}
              title="No entrar a almacén (antes de cargar stock)"
            >
              Revocar
            </button>
            <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => void handleLeaveWaiting()}
                className={`${VERTIAL_BTN_SECONDARY} w-full sm:w-auto`}
                disabled={busy}
              >
                Dejar en espera
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                className={`${VERTIAL_BTN_PRIMARY} w-full sm:w-auto inline-flex items-center justify-center gap-2`}
                disabled={busy}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                Entrar a almacén
              </button>
            </div>
          </div>
        </div>
    </div>,
    document.body,
  );
}
