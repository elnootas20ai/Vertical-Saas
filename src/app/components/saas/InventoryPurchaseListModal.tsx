import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpCircle,
  Loader2,
  PackagePlus,
  ScanLine,
  ShoppingCart,
  X,
} from 'lucide-react';
import type { CatalogItem } from '../../lib/deliveryApi';
import {
  computePurchaseSuggestion,
  formatInventoryMoney,
  inventoryStatus,
  readInventoryCategoryLabel,
} from '../../lib/inventoryUtils';
import { createAdjustmentRequest } from '../../lib/stockMovementApi';
import { SaasTabPrimaryButton, SaasTabSecondaryButton } from './SaasTabWorkspace';

type PurchaseListRow = {
  item: CatalogItem;
  suggestion: ReturnType<typeof computePurchaseSuggestion>;
};

export function InventoryPurchaseListModal({
  isOpen,
  onClose,
  items,
  userId,
  warehouseId,
  onStockUpdated,
  onScanInvoice,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: CatalogItem[];
  userId: string;
  warehouseId?: string;
  onStockUpdated?: () => void;
  onScanInvoice?: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [registering, setRegistering] = useState(false);

  const purchaseItems = useMemo((): PurchaseListRow[] => {
    return items
      .filter((item) => {
        const status = inventoryStatus(item);
        return status === 'low' || status === 'out';
      })
      .map((item) => ({
        item,
        suggestion: computePurchaseSuggestion(item),
      }))
      .sort((a, b) => {
        const rank = (row: PurchaseListRow) => {
          const s = inventoryStatus(row.item);
          if (s === 'out') return 0;
          return 1;
        };
        const diff = rank(a) - rank(b);
        return diff !== 0 ? diff : (a.item.name || '').localeCompare(b.item.name || '', 'es');
      });
  }, [items]);

  useEffect(() => {
    if (!isOpen) return;
    const nextQty: Record<string, string> = {};
    const nextSelected = new Set<string>();
    for (const row of purchaseItems) {
      nextQty[row.item._id] = String(row.suggestion.quantity);
      nextSelected.add(row.item._id);
    }
    setQuantities(nextQty);
    setSelectedIds(nextSelected);
  }, [isOpen, purchaseItems]);

  const readQuantity = useCallback(
    (itemId: string, fallback: number) => {
      const raw = quantities[itemId]?.trim().replace(',', '.') ?? '';
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    },
    [quantities],
  );

  const selectedRows = useMemo(
    () => purchaseItems.filter((row) => selectedIds.has(row.item._id)),
    [purchaseItems, selectedIds],
  );

  const estimatedTotal = useMemo(
    () =>
      selectedRows.reduce((sum, { item, suggestion }) => {
        const qty = readQuantity(item._id, suggestion.quantity);
        return sum + qty * Number(item.costPrice || 0);
      }, 0),
    [selectedRows, readQuantity],
  );

  const totalUnits = useMemo(
    () =>
      selectedRows.reduce(
        (sum, { item, suggestion }) => sum + readQuantity(item._id, suggestion.quantity),
        0,
      ),
    [selectedRows, readQuantity],
  );

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === purchaseItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(purchaseItems.map((row) => row.item._id)));
    }
  };

  const handleRegisterStock = async () => {
    if (!userId) return;
    if (selectedRows.length === 0) {
      toast.error('Selecciona al menos un artículo');
      return;
    }

    setRegistering(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const { item, suggestion } of selectedRows) {
        const qty = readQuantity(item._id, suggestion.quantity);
        try {
          await createAdjustmentRequest(userId, {
            catalogItemId: item._id,
            quantity: qty,
            type: 'in',
            warehouseId: warehouseId || undefined,
            notes: 'Entrada desde lista de compra',
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      if (ok > 0) {
        toast.success(`${ok} entrada${ok !== 1 ? 's' : ''} registrada${ok !== 1 ? 's' : ''}`);
        onStockUpdated?.();
      }
      if (fail > 0) toast.error(`${fail} artículo(s) no se pudieron actualizar`);
      if (ok > 0 && fail === 0) onClose();
    } finally {
      setRegistering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-amber-600" />
                Qué comprar hoy
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Según stock tras ventas · repón o escanea la factura
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {purchaseItems.length > 0 ? (
            <div className="px-5 py-2 border-b border-gray-50 dark:border-gray-700/50 flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === purchaseItems.length && purchaseItems.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                Seleccionar todos ({selectedIds.size}/{purchaseItems.length})
              </label>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto p-5">
            {purchaseItems.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No hay artículos con stock bajo o agotado. Todo correcto.
              </p>
            ) : (
              <ul className="space-y-2">
                {purchaseItems.map(({ item, suggestion }) => {
                  const status = inventoryStatus(item);
                  const unit = item.unit || 'ud';
                  const costPrice = Number(item.costPrice || 0);
                  const qty = readQuantity(item._id, suggestion.quantity);
                  const lineTotal = qty * costPrice;
                  const stockAfter = Number(item.stockQuantity || 0) + qty;
                  const selected = selectedIds.has(item._id);

                  return (
                    <li
                      key={item._id}
                      className={`flex items-start gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0 rounded-lg px-1 -mx-1 ${
                        selected ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRow(item._id)}
                        className="mt-1 rounded border-gray-300 text-amber-600 focus:ring-amber-500 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
                        <p className="text-[11px] text-gray-500">
                          {readInventoryCategoryLabel(item)}
                          {Number(item.minStock) > 0 ? ` · mín ${item.minStock} ${unit}` : ''}
                          {item.supplierName ? ` · ${item.supplierName}` : ''}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
                          Ahora:{' '}
                          <span className={status === 'out' ? 'text-red-500 font-semibold' : 'text-amber-600 font-semibold'}>
                            {item.stockQuantity ?? 0} {unit}
                          </span>
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <div className="inline-flex items-center gap-1">
                          <span className="text-[10px] font-semibold text-gray-400">+</span>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={quantities[item._id] ?? String(suggestion.quantity)}
                            onChange={(e) =>
                              setQuantities((prev) => ({ ...prev, [item._id]: e.target.value }))
                            }
                            className="w-16 px-1.5 py-0.5 text-sm font-bold tabular-nums text-center border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <span className="text-[10px] text-gray-400">{unit}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 flex items-center justify-end gap-0.5 tabular-nums">
                          <ArrowUpCircle className="w-3 h-3 shrink-0" />
                          {stockAfter} {unit} en stock
                        </p>
                        {costPrice > 0 ? (
                          <p className="text-[10px] text-gray-400 tabular-nums">~{formatInventoryMoney(lineTotal)}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="p-5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 rounded-b-2xl space-y-3">
            {purchaseItems.length > 0 ? (
              <p className="text-xs text-gray-500">
                {selectedRows.length} seleccionado{selectedRows.length !== 1 ? 's' : ''} · {totalUnits} ud ·{' '}
                {estimatedTotal > 0 ? `~${formatInventoryMoney(estimatedTotal)} estimado` : 'sin coste estimado'}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 justify-end">
              <SaasTabSecondaryButton onClick={onClose}>Cerrar</SaasTabSecondaryButton>
              {onScanInvoice ? (
                <SaasTabSecondaryButton
                  onClick={onScanInvoice}
                  title="Escanea factura o albarán de proveedor"
                >
                  <ScanLine className="w-4 h-4" />
                  Escanear factura
                </SaasTabSecondaryButton>
              ) : null}
              {purchaseItems.length > 0 ? (
                <SaasTabPrimaryButton
                  onClick={() => void handleRegisterStock()}
                  disabled={registering || selectedRows.length === 0 || !userId}
                >
                  {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
                  Registrar entrada
                </SaasTabPrimaryButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
