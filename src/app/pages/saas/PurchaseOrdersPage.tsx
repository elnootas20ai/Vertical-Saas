import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  ChevronDown,
  ClipboardList,
  Eye,
  Edit3,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Package,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import type { CatalogItem, Supplier } from '../../lib/deliveryApi';
import { listSuppliersRequest } from '../../lib/deliveryApi';
import type { StoreIngredient } from '../../lib/catalogCustomization';
import {
  createPurchaseOrderRequest,
  deletePurchaseOrderRequest,
  getSuggestionsRequest,
  listPurchaseOrdersRequest,
  sendPurchaseOrderRequest,
  updatePurchaseOrderRequest,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderStatus,
  type SuggestionItem,
} from '../../lib/purchaseOrderApi';
import {
  explicitMarkedStockItemsForSupplier,
  groupStockItemsByOrganizer,
  groupSuggestionsForVertial,
  suggestionOrderQuantity,
} from '../../lib/purchaseSuggestions';
import { pendingLinesFromPurchaseOrder } from '../../lib/albaranReceptionCompare';
import { CatalogUnitChip } from '../../components/saas/CatalogUnitChip';
import type { InventoryCommercialBrand } from '../../lib/inventoryUtils';
import { formatDateEs, formatDateTimeEs } from '../../lib/formatDateEs';
import { formatMoneyEs, formatQtyEs } from '../../lib/formatNumberEs';
import { toUserFacingMessage } from '../../lib/userFacingError';
import { filterPurchaseDocsByBusinessScope } from '../../lib/purchaseBusinessScope';
import { formatPurchaseOrderNumber, nextPurchaseOrderNumber, parsePurchaseOrderSequence } from '../../lib/purchaseOrderNumber';
import {
  SaasTabEmpty,
  SaasTabPrimaryButton,
  SaasTabSecondaryButton,
  SaasTabToolbarRow,
  SaasTabWorkspace,
} from '../../components/saas/SaasTabWorkspace';
const STATUS_META: Record<PurchaseOrderStatus, { label: string; className: string }> = {
  draft: {
    label: 'Borrador',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  pending: {
    label: 'Pendiente',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  sent: {
    label: 'Enviado',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  partial: {
    label: 'Incompleto',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  received: {
    label: 'Completo',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  },
};

function formatOrderDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(n: number): string {
  return formatMoneyEs(n);
}

function formatQty(n: number): string {
  return formatQtyEs(n);
}

function formatSentViaLabel(sentVia: string): string {
  const key = String(sentVia || '').trim().toLowerCase();
  if (key === 'email') return 'Correo electrónico';
  if (key === 'whatsapp') return 'WhatsApp';
  if (key === 'portal') return 'Marcado sin envío automático';
  if (key === 'manual') return 'Manual';
  return sentVia ? sentVia : '—';
}

function orderSourceLabel(source: PurchaseOrder['source']): string {
  return source === 'auto' ? 'Automático' : 'Manual';
}

type OrderMetaRow = { label: string; value: string };

function buildPurchaseOrderMetaRows(order: PurchaseOrder, supplier?: Supplier | null): OrderMetaRow[] {
  const rows: OrderMetaRow[] = [];
  const items = Array.isArray(order.items) ? order.items : [];

  if (order.createdAt) {
    rows.push({ label: 'Creado', value: formatDateTimeEs(order.createdAt) });
  }
  if (order.updatedAt && order.updatedAt !== order.createdAt) {
    rows.push({ label: 'Última actualización', value: formatDateTimeEs(order.updatedAt) });
  }
  if (order.expectedDate) {
    rows.push({ label: 'Entrega prevista', value: formatDateEs(order.expectedDate) });
  }
  if (order.sentAt) {
    const via = formatSentViaLabel(order.sentVia);
    const supplierEmail = String(supplier?.email || '').trim();
    const sentDetail =
      order.sentVia === 'email' && supplierEmail
        ? `${via} · ${supplierEmail}`
        : via;
    rows.push({ label: 'Enviado', value: `${formatDateTimeEs(order.sentAt)} · ${sentDetail}` });
  } else if (order.status === 'draft') {
    rows.push({ label: 'Envío', value: 'Aún no enviado al proveedor' });
  }
  if (order.receivedAt) {
    rows.push({ label: 'Albarán comprobado', value: formatDateTimeEs(order.receivedAt) });
  }
  rows.push({
    label: 'Resumen',
    value: `${items.length} línea${items.length === 1 ? '' : 's'} · ${formatMoney(order.total)} · ${orderSourceLabel(order.source)}`,
  });
  return rows;
}

function orderReceptionHint(order: PurchaseOrder): string | null {
  if (order.status === 'received') {
    return order.receivedAt
      ? `Albarán completo · ${formatDateTimeEs(order.receivedAt)}`
      : 'Albarán completo';
  }
  if (order.status === 'partial') {
    const pending = pendingLinesFromPurchaseOrder(order);
    if (pending.length > 0) {
      return `Albarán incompleto · faltan ${pending.length} línea${pending.length !== 1 ? 's' : ''}`;
    }
    return 'Albarán incompleto';
  }
  if (order.status === 'sent' || order.status === 'pending') {
    return 'Espera albarán';
  }
  return null;
}

// ─── Modal: nuevo pedido ──────────────────────────────────────────────────────

type DraftLine = {
  catalogItemId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
};

type SupplierDraftState = {
  lines: DraftLine[];
  suggestionsById: Map<string, SuggestionItem>;
  addItemId: string;
};

function draftLineFromItem(item: CatalogItem, quantity = '1'): DraftLine {
  return {
    catalogItemId: item._id,
    sku: item.sku || '',
    name: item.name || '',
    unit: item.unit || 'ud',
    quantity,
    unitCost: String(item.costPrice ?? 0),
  };
}

function buildSupplierDraft(
  supplier: Supplier,
  catalogItems: CatalogItem[],
  suggestions: SuggestionItem[],
  storeIngredients: StoreIngredient[] = [],
  commercialBrands: InventoryCommercialBrand[] = [],
): Pick<SupplierDraftState, 'lines' | 'suggestionsById'> {
  const marked = explicitMarkedStockItemsForSupplier(
    catalogItems,
    supplier,
    storeIngredients,
    commercialBrands,
  );
  const markedIds = new Set(marked.map((m) => m._id));
  const suggestionsById = new Map<string, SuggestionItem>();
  for (const s of suggestions) {
    if (!markedIds.has(s._id)) continue;
    suggestionsById.set(s._id, s);
  }
  return { lines: [], suggestionsById };
}

function parseDraftLines(lines: DraftLine[]) {
  return lines.map((l) => {
    const quantityNum = Math.max(0, Number(String(l.quantity).replace(',', '.')) || 0);
    const unitCostNum = Math.max(0, Number(String(l.unitCost).replace(',', '.')) || 0);
    return { ...l, quantityNum, unitCostNum, total: quantityNum * unitCostNum };
  });
}

function SupplierOrderDraftSection({
  supplier,
  draft,
  catalogItems,
  catalogById,
  onChange,
  defaultExpanded = false,
  storeIngredients = [],
  commercialBrands = [],
}: {
  supplier: Supplier;
  draft: SupplierDraftState;
  catalogItems: CatalogItem[];
  catalogById: Map<string, CatalogItem>;
  onChange: (next: SupplierDraftState) => void;
  defaultExpanded?: boolean;
  storeIngredients?: StoreIngredient[];
  commercialBrands?: InventoryCommercialBrand[];
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const markedStockItems = useMemo(
    () => explicitMarkedStockItemsForSupplier(catalogItems, supplier, storeIngredients, commercialBrands),
    [catalogItems, supplier, storeIngredients, commercialBrands],
  );
  const { lines, suggestionsById } = draft;

  const availableToAdd = useMemo(
    () => markedStockItems.filter((item) => !lines.some((l) => l.catalogItemId === item._id)),
    [markedStockItems, lines],
  );

  const pickerGroups = useMemo(
    () => groupStockItemsByOrganizer(availableToAdd, storeIngredients, commercialBrands),
    [availableToAdd, storeIngredients, commercialBrands],
  );

  const lowStockMarkedNotInLines = useMemo(() => {
    const inLines = new Set(lines.map((l) => l.catalogItemId));
    return markedStockItems.filter((item) => {
      if (inLines.has(item._id)) return false;
      const sug = suggestionsById.get(item._id);
      if (sug) return sug.needsReorder || Number(sug.stockQuantity) <= Number(sug.minStock);
      const stock = Number(item.stockQuantity) || 0;
      const min = Number(item.minStock) || 0;
      return min > 0 && stock <= min;
    });
  }, [markedStockItems, lines, suggestionsById]);

  const parsedLines = useMemo(() => parseDraftLines(lines), [lines]);
  const sectionSubtotal = parsedLines.reduce((s, l) => s + l.total, 0);

  const patchDraft = (patch: Partial<SupplierDraftState>) => onChange({ ...draft, ...patch });

  const suggestedQtyForItem = (item: CatalogItem) => {
    const sug = suggestionsById.get(item._id);
    if (sug && (sug.needsReorder || Number(sug.stockQuantity) <= Number(sug.minStock))) {
      return String(suggestionOrderQuantity(sug));
    }
    return '1';
  };

  const addItemToLines = (item: CatalogItem) => {
    patchDraft({ lines: [...lines, draftLineFromItem(item, suggestedQtyForItem(item))] });
  };

  const addAllLowStock = () => {
    const inLines = new Set(lines.map((l) => l.catalogItemId));
    const next = [...lines];
    for (const item of lowStockMarkedNotInLines) {
      if (inLines.has(item._id)) continue;
      next.push(draftLineFromItem(item, suggestedQtyForItem(item)));
      inLines.add(item._id);
    }
    patchDraft({ lines: next });
  };

  const updateLine = (catalogItemId: string, patch: Partial<DraftLine>) => {
    patchDraft({
      lines: lines.map((l) => (l.catalogItemId === catalogItemId ? { ...l, ...patch } : l)),
    });
  };

  const removeLine = (catalogItemId: string) => {
    patchDraft({ lines: lines.filter((l) => l.catalogItemId !== catalogItemId) });
  };

  if (markedStockItems.length === 0) {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-300 text-center py-4 px-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/30">
        Sin productos marcados. Edítalo en Proveedores → Qué te vende.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2.5 bg-gray-50/80 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 text-left hover:bg-gray-100/80 dark:hover:bg-gray-800/40 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {supplier.name}
            {supplier.code ? (
              <span className="ml-1.5 text-xs font-semibold text-gray-400">{supplier.code}</span>
            ) : null}
          </p>
          <p className="text-[11px] text-gray-500">
            {parsedLines.length} línea{parsedLines.length !== 1 ? 's' : ''} · {markedStockItems.length} marcado
            {markedStockItems.length !== 1 ? 's' : ''}
            {parsedLines.length > 0 ? (
              <span className="ml-1.5 font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                · {formatMoney(sectionSubtotal)}
              </span>
            ) : null}
          </p>
        </div>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <div>
            <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-gray-900">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Qué quieres pedir
              </p>
              {lowStockMarkedNotInLines.length > 0 ? (
                <button
                  type="button"
                  onClick={addAllLowStock}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 dark:text-amber-200 dark:bg-amber-950/40 dark:border-amber-900"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Bajo mínimo ({lowStockMarkedNotInLines.length})
                </button>
              ) : null}
            </div>

            {availableToAdd.length === 0 ? (
              <p className="px-3 pb-3 text-sm text-gray-500 dark:text-gray-400">
                Todos los marcados están en el pedido.
              </p>
            ) : (
              <div className="space-y-3 px-3 pb-3">
                {pickerGroups.map((group) => (
                  <div key={group.organizerId}>
                    {pickerGroups.length > 1 ? (
                      <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5 px-0.5">
                        {group.organizerLabel}
                      </p>
                    ) : null}
                    <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                      {group.items.map((item) => {
                        const stock = Number(item.stockQuantity) || 0;
                        const min = Number(item.minStock) || 0;
                        const low = min > 0 && stock <= min;
                        const sug = suggestionsById.get(item._id);
                        const suggested =
                          sug && (sug.needsReorder || Number(sug.stockQuantity) <= Number(sug.minStock))
                            ? suggestionOrderQuantity(sug)
                            : null;
                        return (
                          <div
                            key={item._id}
                            className="flex items-center gap-2 px-2.5 py-2 bg-white dark:bg-gray-900"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {item.name}
                              </p>
                              <p className="text-[11px] text-gray-500 tabular-nums">
                                Stock {formatQty(stock)}
                                {min > 0 ? (
                                  <>
                                    {' '}
                                    · mín. {formatQty(min)}
                                    {low ? (
                                      <span className="ml-1 font-semibold text-amber-700 dark:text-amber-300">
                                        bajo mínimo
                                      </span>
                                    ) : null}
                                  </>
                                ) : null}
                                {suggested ? (
                                  <span className="ml-1 text-gray-400">· sugerido {formatQty(suggested)}</span>
                                ) : null}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => addItemToLines(item)}
                              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--v-blue,#2563eb)] border border-blue-200 dark:border-blue-900 hover:bg-blue-50/80 dark:hover:bg-blue-950/30"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Añadir
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {parsedLines.length > 0 ? (
            <div>
              <div className="px-3 py-2 bg-white dark:bg-gray-900">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Cantidades y precios
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[36rem]">
                  <thead className="bg-gray-50/80 dark:bg-gray-900/60 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Artículo</th>
                      <th className="text-right px-2 py-2 font-semibold w-16">Stock</th>
                      <th className="text-right px-2 py-2 font-semibold w-14">Mín.</th>
                      <th className="text-right px-2 py-2 font-semibold w-28">Pedir</th>
                      <th className="text-right px-2 py-2 font-semibold w-24">Coste/u</th>
                      <th className="text-right px-3 py-2 font-semibold w-20">Total</th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {parsedLines.map((l) => {
                      const item = catalogById.get(l.catalogItemId);
                      const stock = Number(item?.stockQuantity) || 0;
                      const min = Number(item?.minStock) || 0;
                      const low = min > 0 && stock <= min;
                      return (
                        <tr key={l.catalogItemId}>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{l.name}</td>
                          <td
                            className={`px-2 py-2 text-right tabular-nums text-xs ${
                              low ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-gray-500'
                            }`}
                          >
                            {formatQty(stock)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-xs text-gray-400">
                            {min > 0 ? formatQty(min) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <span className="inline-flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={l.quantity}
                                onChange={(e) => updateLine(l.catalogItemId, { quantity: e.target.value })}
                                className="w-16 px-1.5 py-1 text-right text-sm tabular-nums rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                              />
                              <CatalogUnitChip unit={l.unit} size="sm" />
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.unitCost}
                              onChange={(e) => updateLine(l.catalogItemId, { unitCost: e.target.value })}
                              className="w-20 px-1.5 py-1 text-right text-sm tabular-nums rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(l.total)}</td>
                          <td className="px-1 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(l.catalogItemId)}
                              className="p-1 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                              title="Quitar línea"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              Añade artículos arriba para ver cantidades y precios.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function NewPurchaseOrderModal({
  userId,
  suppliers,
  catalogItems,
  storeIngredients = [],
  commercialBrands = [],
  initialSupplierId = '',
  nextOrderNumber,
  onClose,
  onCreate,
}: {
  userId: string;
  suppliers: Supplier[];
  catalogItems: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  commercialBrands?: InventoryCommercialBrand[];
  initialSupplierId?: string;
  nextOrderNumber: string;
  onClose: () => void;
  onCreate: (payloads: Partial<PurchaseOrder>[]) => Promise<void>;
}) {
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>(() =>
    initialSupplierId ? [initialSupplierId] : [],
  );
  const [draftsBySupplier, setDraftsBySupplier] = useState<Record<string, SupplierDraftState>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [allSuggestions, setAllSuggestions] = useState<SuggestionItem[]>([]);

  const activeSuppliers = useMemo(
    () =>
      [...suppliers]
        .filter((s) => s.active !== false)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es')),
    [suppliers],
  );
  const activeSupplierById = useMemo(
    () => new Map(activeSuppliers.map((s) => [s._id, s])),
    [activeSuppliers],
  );
  const catalogById = useMemo(() => new Map(catalogItems.map((i) => [i._id, i])), [catalogItems]);

  useEffect(() => {
    if (!userId) {
      setAllSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }
    let cancelled = false;
    setLoadingSuggestions(true);
    void getSuggestionsRequest(userId)
      .then((res) => {
        if (!cancelled) setAllSuggestions(res.suggestions || []);
      })
      .catch(() => {
        if (!cancelled) setAllSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (loadingSuggestions) return;
    setDraftsBySupplier((prev) => {
      const next: Record<string, SupplierDraftState> = {};
      for (const id of selectedSupplierIds) {
        if (prev[id]) {
          next[id] = prev[id];
          continue;
        }
        const supplier = activeSupplierById.get(id);
        if (!supplier) continue;
        next[id] = {
          ...buildSupplierDraft(
            supplier,
            catalogItems,
            allSuggestions,
            storeIngredients,
            commercialBrands,
          ),
          addItemId: '',
        };
      }
      return next;
    });
  }, [
    selectedSupplierIds,
    loadingSuggestions,
    allSuggestions,
    catalogItems,
    activeSupplierById,
    storeIngredients,
    commercialBrands,
  ]);

  const suppliersWithLowStock = useMemo(() => {
    return activeSuppliers.filter((supplier) => {
      const marked = explicitMarkedStockItemsForSupplier(
        catalogItems,
        supplier,
        storeIngredients,
        commercialBrands,
      );
      return marked.some((item) => {
        const sug = allSuggestions.find((s) => s._id === item._id);
        if (sug) return sug.needsReorder || Number(sug.stockQuantity) <= Number(sug.minStock);
        const stock = Number(item.stockQuantity) || 0;
        const min = Number(item.minStock) || 0;
        return min > 0 && stock <= min;
      });
    });
  }, [activeSuppliers, catalogItems, allSuggestions, storeIngredients, commercialBrands]);

  const toggleSupplier = (id: string) => {
    setSelectedSupplierIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllSuppliers = () => setSelectedSupplierIds(activeSuppliers.map((s) => s._id));
  const selectLowStockSuppliers = () => setSelectedSupplierIds(suppliersWithLowStock.map((s) => s._id));
  const clearSuppliers = () => setSelectedSupplierIds([]);

  const orderPayloads = useMemo(() => {
    const payloads: Partial<PurchaseOrder>[] = [];
    for (const supplierId of selectedSupplierIds) {
      const supplier = activeSupplierById.get(supplierId);
      const draft = draftsBySupplier[supplierId];
      if (!supplier || !draft?.lines.length) continue;
      const parsedLines = parseDraftLines(draft.lines);
      if (!parsedLines.every((l) => l.quantityNum > 0)) continue;
      const items: PurchaseOrderItem[] = parsedLines.map((l, idx) => ({
        id: `poi-${Date.now()}-${supplierId}-${idx}`,
        catalogItemId: l.catalogItemId,
        sku: l.sku,
        name: l.name,
        quantity: l.quantityNum,
        unitCost: l.unitCostNum,
        total: l.total,
        received: 0,
        notes: '',
      }));
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      const taxAmount = Math.round(subtotal * 0.21 * 100) / 100;
      payloads.push({
        supplierId: supplier._id,
        supplierName: supplier.name || 'Sin proveedor',
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: 21,
        taxAmount,
        total: Math.round((subtotal + taxAmount) * 100) / 100,
        status: 'draft',
        source: 'manual',
        urgency: 'normal',
        notes: notes.trim(),
      });
    }
    return payloads;
  }, [selectedSupplierIds, activeSupplierById, draftsBySupplier, notes]);

  const grandTotal = orderPayloads.reduce((s, p) => s + Number(p.total || 0), 0);
  const canSave = orderPayloads.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let seq = parsePurchaseOrderSequence(nextOrderNumber);
      const payloads = orderPayloads.map((payload) => {
        const withNumber = { ...payload, orderNumber: formatPurchaseOrderNumber(seq) };
        seq += 1;
        return withNumber;
      });
      await onCreate(payloads);
      onClose();
    } catch {
      toast.error('No se pudieron crear los pedidos');
    } finally {
      setSaving(false);
    }
  };

  const nextSeqPreview =
    orderPayloads.length <= 1
      ? nextOrderNumber
      : `${nextOrderNumber} … ${formatPurchaseOrderNumber(
          parsePurchaseOrderSequence(nextOrderNumber) + orderPayloads.length - 1,
        )}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevos pedidos a proveedores</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Nº{' '}
              <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">{nextSeqPreview}</span>
              <span className="text-xs font-semibold text-gray-400 ml-1.5">· automático</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Proveedores
                {activeSuppliers.length > 0 ? (
                  <span className="ml-1.5 font-normal text-gray-400">
                    ({selectedSupplierIds.length}/{activeSuppliers.length} seleccionado
                    {selectedSupplierIds.length !== 1 ? 's' : ''})
                  </span>
                ) : null}
              </label>
              {activeSuppliers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={selectAllSuppliers}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-[var(--v-blue,#2563eb)] border border-blue-200 dark:border-blue-900"
                  >
                    Todos
                  </button>
                  {suppliersWithLowStock.length > 0 ? (
                    <button
                      type="button"
                      onClick={selectLowStockSuppliers}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 dark:text-amber-200 dark:bg-amber-950/40 dark:border-amber-900"
                    >
                      Con bajo mínimo ({suppliersWithLowStock.length})
                    </button>
                  ) : null}
                  {selectedSupplierIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={clearSuppliers}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-500 border border-gray-200 dark:border-gray-700"
                    >
                      Ninguno
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {activeSuppliers.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No tienes proveedores dados de alta. Créalos en la pestaña Proveedores.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeSuppliers.map((s) => {
                  const selected = selectedSupplierIds.includes(s._id);
                  const lineCount = draftsBySupplier[s._id]?.lines.length || 0;
                  return (
                    <label
                      key={s._id}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-colors ${
                        selected
                          ? 'border-[var(--v-blue,#2563eb)] bg-blue-50/80 dark:bg-blue-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSupplier(s._id)}
                        className="rounded border-gray-300 text-[var(--v-blue,#2563eb)]"
                      />
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{s.name}</span>
                      {s.code ? <span className="text-[11px] text-gray-400">{s.code}</span> : null}
                      {selected && lineCount > 0 ? (
                        <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-white/80 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                          {lineCount}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Marca todos los proveedores a los que quieras pedir. Se crea un pedido (PC-0001, PC-0002…) por cada uno
              con líneas.
            </p>
          </div>

          {selectedSupplierIds.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
              Elige uno o más proveedores. Solo salen productos marcados en su ficha (Proveedores → Qué te vende).
            </p>
          ) : loadingSuggestions ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              Revisando stock y productos marcados…
            </div>
          ) : (
            <div className="space-y-3">
              {selectedSupplierIds.map((id) => {
                const supplier = activeSupplierById.get(id);
                const draft = draftsBySupplier[id];
                if (!supplier || !draft) return null;
                return (
                  <SupplierOrderDraftSection
                    key={id}
                    supplier={supplier}
                    draft={draft}
                    catalogItems={catalogItems}
                    catalogById={catalogById}
                    storeIngredients={storeIngredients}
                    commercialBrands={commercialBrands}
                    defaultExpanded={selectedSupplierIds.length === 1 || id === initialSupplierId}
                    onChange={(next) => setDraftsBySupplier((prev) => ({ ...prev, [id]: next }))}
                  />
                );
              })}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Notas (opcional, para todos los pedidos)
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: entregar antes del viernes"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            />
          </div>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
            {orderPayloads.length > 0 ? (
              <>
                {orderPayloads.length} pedido{orderPayloads.length !== 1 ? 's' : ''} ·{' '}
                <span className="font-bold text-gray-900 dark:text-gray-100">Total {formatMoney(grandTotal)}</span>
              </>
            ) : (
              'Añade líneas en al menos un proveedor'
            )}
          </p>
          <div className="flex gap-2 shrink-0">
            <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
            <SaasTabPrimaryButton onClick={() => void handleSave()} disabled={!canSave}>
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {orderPayloads.length <= 1
                ? 'Crear pedido'
                : `Crear ${orderPayloads.length} pedidos`}
            </SaasTabPrimaryButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EditPurchaseOrderModal({
  order,
  supplier,
  userId,
  catalogItems,
  onClose,
  onSaved,
}: {
  order: PurchaseOrder;
  supplier: Supplier | null;
  userId: string;
  catalogItems: CatalogItem[];
  onClose: () => void;
  onSaved: (order: PurchaseOrder) => void;
}) {
  useModalClose(true, onClose);
  const catalogById = useMemo(() => new Map(catalogItems.map((i) => [i._id, i])), [catalogItems]);
  const [draft, setDraft] = useState<SupplierDraftState>(() => ({
    lines: (order.items || []).map((item) => {
      const cat = catalogItems.find((c) => c._id === item.catalogItemId);
      return {
        catalogItemId: item.catalogItemId,
        sku: item.sku || cat?.sku || '',
        name: item.name || cat?.name || '',
        unit: cat?.unit || 'ud',
        quantity: String(item.quantity ?? 0),
        unitCost: String(item.unitCost ?? 0),
      };
    }),
    suggestionsById: new Map(),
    addItemId: '',
  }));
  const [notes, setNotes] = useState(order.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getSuggestionsRequest(userId)
      .then((res) => {
        if (cancelled) return;
        const sugMap = new Map<string, SuggestionItem>();
        for (const s of res.suggestions || []) sugMap.set(s._id, s);
        setDraft((prev) => ({ ...prev, suggestionsById: sugMap }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const parsedLines = useMemo(() => parseDraftLines(draft.lines), [draft.lines]);
  const subtotal = parsedLines.reduce((s, l) => s + l.total, 0);
  const taxAmount = Math.round(subtotal * 0.21 * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const canSave =
    parsedLines.length > 0 && parsedLines.every((l) => l.quantityNum > 0) && !saving && Boolean(supplier);

  const handleSave = async () => {
    if (!canSave || !supplier) return;
    setSaving(true);
    try {
      const items: PurchaseOrderItem[] = parsedLines.map((l, idx) => ({
        id: order.items[idx]?.id || `poi-${Date.now()}-${idx}`,
        catalogItemId: l.catalogItemId,
        sku: l.sku,
        name: l.name,
        quantity: l.quantityNum,
        unitCost: l.unitCostNum,
        total: l.total,
        received: order.items[idx]?.received || 0,
        notes: order.items[idx]?.notes || '',
      }));
      const updated = await updatePurchaseOrderRequest(userId, {
        ...order,
        supplierId: supplier._id,
        supplierName: supplier.name || order.supplierName,
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: order.taxRate || 21,
        taxAmount,
        total,
        notes: notes.trim(),
      });
      onSaved(updated);
      toast.success(`Pedido ${updated.orderNumber || ''} guardado`);
      onClose();
    } catch {
      toast.error('No se pudo guardar el pedido');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Editar pedido {order.orderNumber || ''}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {order.supplierName || 'Sin proveedor'} · borrador
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!supplier ? (
            <p className="text-sm text-amber-800 dark:text-amber-300 text-center py-6 px-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/30">
              No se encontró el proveedor de este pedido. Revisa Proveedores.
            </p>
          ) : (
            <SupplierOrderDraftSection
              supplier={supplier}
              draft={draft}
              catalogItems={catalogItems}
              catalogById={catalogById}
              defaultExpanded
              onChange={setDraft}
            />
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Notas</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            />
          </div>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
            Total <span className="font-bold text-gray-900 dark:text-gray-100">{formatMoney(total)}</span>
          </p>
          <div className="flex gap-2 shrink-0">
            <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
            <SaasTabPrimaryButton onClick={() => void handleSave()} disabled={!canSave}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar cambios'}
            </SaasTabPrimaryButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SendPurchaseOrderModal({
  order,
  supplier,
  userId,
  onClose,
  onSent,
}: {
  order: PurchaseOrder;
  supplier?: Supplier | null;
  userId: string;
  onClose: () => void;
  onSent: (order: PurchaseOrder) => void;
}) {
  useModalClose(true, onClose);
  const supplierEmail = String(supplier?.email || '').trim();
  const supplierPhone = String(supplier?.phone || '').trim();
  const [method, setMethod] = useState<'email' | 'whatsapp' | 'manual'>(() =>
    supplierEmail ? 'email' : supplierPhone ? 'whatsapp' : 'manual',
  );
  const [email, setEmail] = useState(supplierEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setMethod(supplierEmail ? 'email' : supplierPhone ? 'whatsapp' : 'manual');
    setEmail(supplierEmail);
  }, [order._id, supplierEmail, supplierPhone]);

  const submit = async () => {
    if (!userId) return;
    if (method === 'email') {
      const target = email.trim();
      if (!target) {
        toast.error('Indica el correo del proveedor');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
        toast.error('El correo no parece válido');
        return;
      }
    }
    if (method === 'whatsapp' && !supplierPhone) {
      toast.error('El proveedor no tiene teléfono configurado');
      return;
    }

    setSending(true);
    try {
      if (method === 'email') {
        const result = await sendPurchaseOrderRequest(userId, order._id, 'email', email.trim());
        toast.success(`Pedido enviado a ${email.trim()}`);
        onSent(result.order);
        onClose();
        return;
      }
      if (method === 'whatsapp') {
        const result = await sendPurchaseOrderRequest(userId, order._id, 'whatsapp');
        if (result.waUrl) window.open(result.waUrl, '_blank', 'noopener,noreferrer');
        toast.success('Pedido marcado como enviado. Revisa WhatsApp para enviar el texto.');
        onSent(result.order);
        onClose();
        return;
      }
      const result = await sendPurchaseOrderRequest(userId, order._id, 'portal');
      toast.success('Pedido marcado como enviado');
      onSent(result.order);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar el pedido');
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500/30';

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Enviar pedido</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {order.orderNumber || 'Pedido'} · {order.supplierName || supplier?.name || 'Proveedor'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Confirma cómo quieres enviar este pedido al proveedor.
          </p>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60">
            <input
              type="radio"
              name="send-method"
              checked={method === 'email'}
              onChange={() => setMethod('email')}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--v-blue,#2563eb)]" />
                Enviar por correo
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Se envía el pedido al email del proveedor.
              </p>
              {method === 'email' ? (
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@proveedor.com"
                  className={`${inputClass} mt-2`}
                />
              ) : null}
            </div>
          </label>

          {supplierPhone ? (
            <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60">
              <input
                type="radio"
                name="send-method"
                checked={method === 'whatsapp'}
                onChange={() => setMethod('whatsapp')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  Enviar por WhatsApp
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Abre WhatsApp con el texto del pedido a {supplierPhone}.
                </p>
              </div>
            </label>
          ) : null}

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60">
            <input
              type="radio"
              name="send-method"
              checked={method === 'manual'}
              onChange={() => setMethod('manual')}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Solo marcar como enviado</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Si ya lo pediste por teléfono, en persona u otro canal.
              </p>
            </div>
          </label>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <SaasTabSecondaryButton onClick={onClose} disabled={sending}>
            Cancelar
          </SaasTabSecondaryButton>
          <SaasTabPrimaryButton onClick={() => void submit()} disabled={sending}>
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : method === 'email' ? (
              <Mail className="w-4 h-4" />
            ) : method === 'whatsapp' ? (
              <MessageCircle className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {method === 'email'
              ? 'Enviar correo'
              : method === 'whatsapp'
                ? 'Abrir WhatsApp'
                : 'Marcar enviado'}
          </SaasTabPrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PurchaseOrderDetailModal({
  order,
  supplier,
  busy,
  onClose,
  onSend,
  onEdit,
  onGoToAlbaranes,
  onGoToInvoices,
}: {
  order: PurchaseOrder;
  supplier?: Supplier | null;
  busy: boolean;
  onClose: () => void;
  onSend: (order: PurchaseOrder) => void;
  onEdit?: (order: PurchaseOrder) => void;
  onGoToAlbaranes?: () => void;
  onGoToInvoices?: () => void;
}) {
  useModalClose(true, onClose);
  const status = STATUS_META[order.status] ?? STATUS_META.draft;
  const items = Array.isArray(order.items) ? order.items : [];
  const metaRows = useMemo(() => buildPurchaseOrderMetaRows(order, supplier), [order, supplier]);
  const showLineSupplier = items.some((item) => String(item.supplierName || '').trim());
  const canSend = order.status === 'draft';
  const waitingAlbaran = ['sent', 'pending', 'partial'].includes(order.status);
  const showInvoiceCta = order.status === 'received' && !order.purchaseInvoiceId && onGoToInvoices;
  const receptionHint = orderReceptionHint(order);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              Pedido {order.orderNumber || ''}
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 font-medium truncate">
              {order.supplierName || supplier?.name || 'Sin proveedor'}
            </p>
            <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {metaRows.map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {row.label}
                  </dt>
                  <dd className="text-xs text-gray-600 dark:text-gray-300 tabular-nums break-words">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            {receptionHint ? (
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mt-2">{receptionHint}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.className}`}>
              {status.label}
            </span>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Este pedido no tiene líneas.</p>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/80 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    <th className="px-3 py-2 text-left">Artículo</th>
                    {showLineSupplier ? <th className="px-3 py-2 text-left">Proveedor</th> : null}
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Recibido</th>
                    <th className="px-3 py-2 text-right">€/ud</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((item) => (
                    <tr key={item.id || item.catalogItemId}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                        {item.sku ? (
                          <p className="text-[11px] text-gray-400 font-mono">{item.sku}</p>
                        ) : null}
                      </td>
                      {showLineSupplier ? (
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                          {item.supplierName || order.supplierName || '—'}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">
                        {formatQty(item.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                        {formatQty(item.received || 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">
                        {formatMoney(item.unitCost)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                        {formatMoney(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {order.notes ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
              {order.notes}
            </p>
          ) : null}

          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm space-y-1">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>IVA ({order.taxRate || 21}%)</span>
              <span className="tabular-nums">{formatMoney(order.taxAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 pt-1 border-t border-gray-200 dark:border-gray-700">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(order.total)}</span>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-end gap-2">
          <SaasTabSecondaryButton onClick={onClose}>Cerrar</SaasTabSecondaryButton>
          {busy ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : null}
          {!busy && canSend && onEdit ? (
            <SaasTabSecondaryButton
              onClick={() => {
                onClose();
                onEdit(order);
              }}
            >
              <Edit3 className="w-4 h-4" />
              Editar
            </SaasTabSecondaryButton>
          ) : null}
          {!busy && canSend ? (
            <SaasTabPrimaryButton onClick={() => onSend(order)}>
              <Send className="w-4 h-4" />
              Enviar
            </SaasTabPrimaryButton>
          ) : null}
          {!busy && waitingAlbaran && onGoToAlbaranes ? (
            <SaasTabSecondaryButton
              onClick={() => {
                onClose();
                onGoToAlbaranes();
              }}
            >
              <Package className="w-4 h-4" />
              Ir a albarán
              <ArrowRight className="w-3.5 h-3.5" />
            </SaasTabSecondaryButton>
          ) : null}
          {!busy && showInvoiceCta ? (
            <SaasTabPrimaryButton onClick={onGoToInvoices}>
              <FileText className="w-4 h-4" />
              Factura
            </SaasTabPrimaryButton>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Sugerencia de pedido Vertial ─────────────────────────────────────────────

function PurchaseSuggestionsPanel({
  userId,
  suppliers,
  catalogItems,
  storeIngredients,
  commercialBrands,
  onCreateOrder,
}: {
  userId: string;
  suppliers: Supplier[];
  catalogItems: CatalogItem[];
  storeIngredients: StoreIngredient[];
  commercialBrands: InventoryCommercialBrand[];
  onCreateOrder: (payload: Partial<PurchaseOrder>) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [creating, setCreating] = useState(false);

  const groups = useMemo(
    () =>
      groupSuggestionsForVertial(
        suggestions,
        catalogItems,
        suppliers,
        storeIngredients,
        commercialBrands,
      ),
    [suggestions, catalogItems, suppliers, storeIngredients, commercialBrands],
  );

  const assignableGroups = useMemo(
    () => groups.filter((group) => group.matchedBy !== 'none' && group.items.length > 0),
    [groups],
  );

  const handleGenerate = async () => {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const result = await getSuggestionsRequest(userId);
      setSuggestions(result.suggestions || []);
      setLoaded(true);
      if ((result.suggestions || []).length === 0) {
        toast.message('Todo en orden: nada por debajo del stock mínimo ni consumo sin cubrir');
      }
    } catch {
      toast.error('No se pudo calcular la sugerencia de pedido');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUnifiedOrder = async () => {
    if (creating || assignableGroups.length === 0) return;
    setCreating(true);
    try {
      const seen = new Set<string>();
      const items: PurchaseOrderItem[] = [];
      let idx = 0;
      for (const group of assignableGroups) {
        for (const s of group.items) {
          if (seen.has(s._id)) continue;
          seen.add(s._id);
          const quantity = suggestionOrderQuantity(s);
          const unitCost = Number(s.costPrice) || 0;
          items.push({
            id: `poi-${Date.now()}-${idx}`,
            catalogItemId: s._id,
            sku: s.sku || '',
            name: s.name,
            quantity,
            unitCost,
            total: Math.round(quantity * unitCost * 100) / 100,
            received: 0,
            notes: '',
            supplierId: group.supplierId,
            supplierName: group.supplierName,
          });
          idx += 1;
        }
      }
      const supplierNames = [
        ...new Set(assignableGroups.map((group) => String(group.supplierName || '').trim()).filter(Boolean)),
      ];
      const subtotal = items.reduce((sum, item) => sum + item.total, 0);
      const taxAmount = Math.round(subtotal * 0.21 * 100) / 100;
      await onCreateOrder({
        supplierId: assignableGroups.length === 1 ? assignableGroups[0].supplierId : '',
        supplierName: supplierNames.join(' · '),
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: 21,
        taxAmount,
        total: Math.round((subtotal + taxAmount) * 100) / 100,
        status: 'draft',
        source: 'auto',
        urgency: 'normal',
        notes: 'Sugerencia de pedido Vertial',
      });
      setSuggestions((prev) => prev.filter((s) => !seen.has(s._id)));
      toast.success(
        assignableGroups.length === 1
          ? 'Pedido creado'
          : `Pedido creado con ${assignableGroups.length} proveedores`,
      );
    } catch {
      toast.error('No se pudo crear el pedido sugerido');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Sugerencia de pedido Vertial</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Un pedido con todos los proveedores; cada línea indica su proveedor
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {assignableGroups.length > 0 ? (
            <SaasTabPrimaryButton onClick={() => void handleCreateUnifiedOrder()} disabled={creating || loading}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Crear pedido
            </SaasTabPrimaryButton>
          ) : null}
          <SaasTabSecondaryButton onClick={() => void handleGenerate()} disabled={loading || creating}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loaded ? 'Actualizar sugerencia' : 'Generar sugerencia'}
        </SaasTabSecondaryButton>
        </div>
      </div>

      {loaded && groups.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
          Nada que reponer ahora mismo. Revisa que los artículos tengan stock mínimo configurado.
        </p>
      ) : null}

      {groups.length > 0 ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {groups.map((group, groupIdx) => {
            const key = group.supplierId || `group-${groupIdx}`;
            const canOrder = group.matchedBy !== 'none';
            return (
              <div key={key} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {group.supplierName}
                      {group.matchedBy === 'organizer' ? (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800 align-middle">
                          por «Qué suministra»
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {group.items.length} artículo{group.items.length !== 1 ? 's' : ''} · coste estimado {formatMoney(group.totalCost)}
                    </p>
                  </div>
                  {!canOrder ? (
                    <span className="text-xs text-gray-400 dark:text-gray-500 max-w-[240px] text-right">
                      Asigna proveedor al artículo o marca «Qué suministra» en un proveedor
                    </span>
                  ) : null}
                </div>
                <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  {group.items.map((item) => (
                    <li key={item._id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-gray-700 dark:text-gray-300">{item.name}</span>
                      <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                        {item.stockQuantity}/{item.minStock} →{' '}
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          pedir {suggestionOrderQuantity(item)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

/**
 * Pedidos a proveedores — flujo: crear borrador → enviar.
 * Recepción y comprobación de albarán solo en la pestaña Albarán.
 */
export function PurchaseOrdersPage({
  dataUserId,
  businessId,
  businessName,
  accountBusinessCount = 1,
  suppliers = [],
  catalogItems = [],
  storeIngredients = [],
  commercialBrands = [],
  onGoToAlbaranes,
  onGoToInvoices,
}: {
  /** Titular del negocio (misma clave que proveedores/facturas/catálogo). */
  dataUserId?: string;
  /** Empresa activa: pedidos solo de esta cuenta. */
  businessId?: string;
  businessName?: string;
  accountBusinessCount?: number;
  suppliers?: Supplier[];
  catalogItems?: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  commercialBrands?: InventoryCommercialBrand[];
  onGoToAlbaranes?: () => void;
  onGoToInvoices?: () => void;
}) {
  const { user } = useAuth();
  const userId = String(dataUserId || user?.id || '').trim();

  const [resolvedSuppliers, setResolvedSuppliers] = useState<Supplier[]>(suppliers);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createSupplierId, setCreateSupplierId] = useState('');
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrder | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [cleaningDrafts, setCleaningDrafts] = useState(false);
  const [sendOrder, setSendOrder] = useState<PurchaseOrder | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Llegada desde Proveedores («Pedir»): abre el modal con el proveedor preseleccionado.
  useEffect(() => {
    const supplierParam = searchParams.get('supplier');
    if (!supplierParam) return;
    setCreateSupplierId(supplierParam);
    setShowCreate(true);
    const next = new URLSearchParams(searchParams);
    next.delete('supplier');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setResolvedSuppliers(suppliers);
  }, [suppliers]);

  useEffect(() => {
    if (!userId) {
      setResolvedSuppliers([]);
      return;
    }
    if (suppliers.length > 0) return;
    let cancelled = false;
    void listSuppliersRequest(userId)
      .then((list) => {
        if (!cancelled) setResolvedSuppliers(list);
      })
      .catch(() => {
        /* el padre puede haber pasado proveedores ya */
      });
    return () => {
      cancelled = true;
    };
  }, [userId, suppliers.length]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await listPurchaseOrdersRequest(userId, {
        businessId: businessId || undefined,
        accountBusinessCount,
      });
      const scoped = filterPurchaseDocsByBusinessScope(list, businessId, accountBusinessCount);
      setOrders(
        [...scoped].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
      );
    } catch (err) {
      const msg = toUserFacingMessage(err, 'No se pudieron cargar los pedidos');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [userId, businessId, accountBusinessCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const markBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const stats = useMemo(() => {
    const drafts = orders.filter((o) => o.status === 'draft').length;
    const open = orders.filter((o) => ['pending', 'sent'].includes(o.status)).length;
    const complete = orders.filter((o) => o.status === 'received').length;
    const incomplete = orders.filter((o) => o.status === 'partial').length;
    return [
      { label: 'pedidos', value: orders.length },
      { label: 'borradores', value: drafts },
      { label: 'en curso', value: open, tone: 'amber' as const },
      { label: 'completos', value: complete, tone: 'emerald' as const },
      { label: 'incompletos', value: incomplete, tone: 'amber' as const },
    ];
  }, [orders]);

  const draftOrders = useMemo(
    () => orders.filter((o) => o.status === 'draft' && (o.source === 'auto' || !o.source)),
    [orders],
  );

  const nextOrderNumber = useMemo(
    () => nextPurchaseOrderNumber(orders.map((o) => o.orderNumber)),
    [orders],
  );

  const handleCreate = async (payloads: Partial<PurchaseOrder> | Partial<PurchaseOrder>[]) => {
    const list = Array.isArray(payloads) ? payloads : [payloads];
    if (!userId || list.length === 0) return;
    const scope = businessId
      ? { businessId, businessName: businessName || '' }
      : {};
    const created: PurchaseOrder[] = [];
    for (const payload of list) {
      created.push(await createPurchaseOrderRequest(userId, { ...payload, ...scope }));
    }
    setOrders((prev) =>
      [...created, ...prev].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    );
    if (created.length === 1) {
      toast.success(`Pedido ${created[0].orderNumber || ''} creado en borrador`);
    } else {
      toast.success(
        `${created.length} pedidos creados: ${created.map((o) => o.orderNumber || '').filter(Boolean).join(', ')}`,
      );
    }
  };

  const handleUpdate = (updated: PurchaseOrder) => {
    setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
    setViewingOrder((prev) => (prev && prev._id === updated._id ? updated : prev));
  };

  const handleOrderSent = (updated: PurchaseOrder) => {
    setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
    setViewingOrder((prev) => (prev && prev._id === updated._id ? updated : prev));
  };

  const handleDelete = async (order: PurchaseOrder) => {
    if (!userId) return;
    if (!window.confirm(`¿Eliminar el pedido ${order.orderNumber || ''} de ${order.supplierName || 'proveedor'}?`)) {
      return;
    }
    markBusy(order._id, true);
    try {
      await deletePurchaseOrderRequest(userId, order._id);
      setOrders((prev) => prev.filter((o) => o._id !== order._id));
      setViewingOrder((prev) => (prev && prev._id === order._id ? null : prev));
      toast.success('Pedido eliminado');
    } catch {
      toast.error('No se pudo eliminar el pedido');
    } finally {
      markBusy(order._id, false);
    }
  };

  const handleCleanDrafts = async () => {
    if (!userId || draftOrders.length === 0) return;
    if (!window.confirm(`¿Eliminar los ${draftOrders.length} borradores automáticos antiguos? Esta acción no se puede deshacer.`)) {
      return;
    }
    setCleaningDrafts(true);
    let ok = 0;
    let fail = 0;
    for (const order of draftOrders) {
      try {
        await deletePurchaseOrderRequest(userId, order._id);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    await load();
    if (ok > 0) toast.success(`${ok} borrador${ok !== 1 ? 'es' : ''} eliminado${ok !== 1 ? 's' : ''}`);
    if (fail > 0) toast.error(`${fail} no se pudieron eliminar`);
    setCleaningDrafts(false);
  };

  return (
    <SaasTabWorkspace
      stats={stats}
      toolbar={
        <SaasTabToolbarRow
          right={
            <>
              {draftOrders.length > 0 ? (
                <SaasTabSecondaryButton
                  onClick={() => void handleCleanDrafts()}
                  disabled={cleaningDrafts}
                  title="Elimina los borradores creados automáticamente por el flujo antiguo"
                >
                  {cleaningDrafts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Limpiar automáticos ({draftOrders.length})
                </SaasTabSecondaryButton>
              ) : null}
              <SaasTabPrimaryButton onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5" />
                Nuevo pedido
              </SaasTabPrimaryButton>
            </>
          }
        />
      }
    >
      {userId ? (
        <PurchaseSuggestionsPanel
          userId={userId}
          suppliers={resolvedSuppliers}
          catalogItems={catalogItems}
          storeIngredients={storeIngredients}
          commercialBrands={commercialBrands}
          onCreateOrder={handleCreate}
        />
      ) : null}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando pedidos…
        </div>
      ) : orders.length === 0 ? (
        <SaasTabEmpty
          icon={<ClipboardList className="w-10 h-10" />}
          title="Sin pedidos a proveedores"
          description="Crea un pedido y márcalo enviado. Cuando llegue la mercancía, comprueba el albarán: el pedido pasará a completo o incompleto y el stock se actualiza ahí."
          action={
            <SaasTabPrimaryButton onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />
              Nuevo pedido
            </SaasTabPrimaryButton>
          }
        />
      ) : (
        <>
        {/* Móvil: tarjetas de pedido */}
        <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
          {orders.map((order) => {
            const status = STATUS_META[order.status] ?? STATUS_META.draft;
            const receptionHint = orderReceptionHint(order);
            const busy = busyIds.has(order._id);
            return (
              <li key={order._id} className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setViewingOrder(order)}
                  className="w-full text-left flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {order.orderNumber || 'Pedido'}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {order.supplierName || 'Sin proveedor'} · {order.items.length} línea{order.items.length !== 1 ? 's' : ''} · {formatOrderDate(order.createdAt)}
                    </p>
                    {receptionHint ? (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{receptionHint}</p>
                    ) : null}
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                      {formatMoney(order.total)}
                    </p>
                  </div>
                  <Eye className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
                </button>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <>
                      {order.status === 'draft' ? (
                        <button
                          type="button"
                          onClick={() => setEditingOrder(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 border border-gray-200 dark:text-gray-300 dark:border-gray-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Editar
                        </button>
                      ) : null}
                      {order.status === 'draft' ? (
                        <button
                          type="button"
                          onClick={() => setSendOrder(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--v-blue,#2563eb)] border border-blue-200 dark:border-blue-900"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Enviar
                        </button>
                      ) : null}
                      {['sent', 'pending', 'partial'].includes(order.status) && onGoToAlbaranes ? (
                        <button
                          type="button"
                          onClick={onGoToAlbaranes}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-800 border border-amber-200 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-900 dark:hover:bg-amber-950/30"
                          title="Escanear y comprobar el albarán en la pestaña Albarán"
                        >
                          <Package className="w-3.5 h-3.5" />
                          Albarán
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ) : null}
                      {order.status === 'received' ? (
                        order.purchaseInvoiceId ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 px-2 py-1">
                            <FileText className="w-3.5 h-3.5" />
                            Factura ✓
                          </span>
                        ) : onGoToInvoices ? (
                          <button
                            type="button"
                            onClick={onGoToInvoices}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 dark:text-gray-300 dark:border-gray-700"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Factura
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : null
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleDelete(order)}
                        disabled={busy}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 disabled:opacity-40 shrink-0"
                        title="Eliminar pedido"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {/* Desktop: tabla completa */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Pedido</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Proveedor</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {orders.map((order) => {
                const status = STATUS_META[order.status] ?? STATUS_META.draft;
                const receptionHint = orderReceptionHint(order);
                const busy = busyIds.has(order._id);
                return (
                  <tr
                    key={order._id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    onClick={() => setViewingOrder(order)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        {order.orderNumber || '—'}
                      </span>
                      <span className="block text-[11px] text-gray-400 dark:text-gray-500" title={order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}>
                        {order.items.length} línea{order.items.length !== 1 ? 's' : ''}
                        {order.notes ? ` · ${order.notes}` : ''}
                      </span>
                      {receptionHint ? (
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{receptionHint}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {order.supplierName || 'Sin proveedor'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 tabular-nums">
                      {formatOrderDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                      {formatMoney(order.total)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setViewingOrder(order)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-[var(--v-blue,#2563eb)] hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                              title="Ver pedido"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {order.status === 'draft' ? (
                              <button
                                type="button"
                                onClick={() => setEditingOrder(order)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
                                title="Editar pedido"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            ) : null}
                            {order.status === 'draft' ? (
                              <button
                                type="button"
                                onClick={() => setSendOrder(order)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--v-blue,#2563eb)] border border-blue-200 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950/30 transition-colors"
                                title="Marcar como enviado al proveedor"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Enviar
                              </button>
                            ) : null}
                            {['sent', 'pending', 'partial'].includes(order.status) && onGoToAlbaranes ? (
                              <button
                                type="button"
                                onClick={onGoToAlbaranes}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-800 border border-amber-200 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-900 dark:hover:bg-amber-950/30 transition-colors"
                                title="Escanear y comprobar el albarán en la pestaña Albarán"
                              >
                                <Package className="w-3.5 h-3.5" />
                                Albarán
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : null}
                            {order.status === 'received' ? (
                              order.purchaseInvoiceId ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 px-2 py-1">
                                  <FileText className="w-3.5 h-3.5" />
                                  Factura ✓
                                </span>
                              ) : onGoToInvoices ? (
                                <button
                                  type="button"
                                  onClick={onGoToInvoices}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
                                  title="Registrar la factura de este pedido en la pestaña Facturas"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  Factura
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              ) : null
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleDelete(order)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                              title="Eliminar pedido"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showCreate ? (
        <NewPurchaseOrderModal
          userId={userId}
          suppliers={resolvedSuppliers}
          catalogItems={catalogItems}
          storeIngredients={storeIngredients}
          commercialBrands={commercialBrands}
          initialSupplierId={createSupplierId}
          nextOrderNumber={nextOrderNumber}
          onClose={() => {
            setShowCreate(false);
            setCreateSupplierId('');
          }}
          onCreate={handleCreate}
        />
      ) : null}

      {editingOrder ? (
        <EditPurchaseOrderModal
          order={editingOrder}
          supplier={resolvedSuppliers.find((s) => s._id === editingOrder.supplierId) || null}
          userId={userId}
          catalogItems={catalogItems}
          onClose={() => setEditingOrder(null)}
          onSaved={handleUpdate}
        />
      ) : null}

      {sendOrder && userId ? (
        <SendPurchaseOrderModal
          order={sendOrder}
          supplier={resolvedSuppliers.find((s) => s._id === sendOrder.supplierId) || null}
          userId={userId}
          onClose={() => setSendOrder(null)}
          onSent={handleOrderSent}
        />
      ) : null}

      {viewingOrder ? (
        <PurchaseOrderDetailModal
          order={viewingOrder}
          supplier={resolvedSuppliers.find((s) => s._id === viewingOrder.supplierId) || null}
          busy={busyIds.has(viewingOrder._id)}
          onClose={() => setViewingOrder(null)}
          onSend={(o) => setSendOrder(o)}
          onEdit={(o) => setEditingOrder(o)}
          onGoToAlbaranes={onGoToAlbaranes}
          onGoToInvoices={onGoToInvoices}
        />
      ) : null}
    </SaasTabWorkspace>
  );
}
