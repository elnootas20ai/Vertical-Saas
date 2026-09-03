import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  Boxes,
  ChevronDown,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  ScanLine,
  SlidersHorizontal,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { CatalogDeleteGuardModal } from './CatalogDeleteGuardModal';
import { useModalClose } from '../../hooks/useModalClose';
import type { CatalogItem, Supplier } from '../../lib/deliveryApi';
import {
  createCatalogItemRequest,
  createPurchaseInvoiceRequest,
  deleteCatalogItemRequest,
  getDeliveryConfigRequest,
  isCatalogDuplicateError,
  listCatalogItemsRequest,
  listSuppliersRequest,
  pointOfSaleDisplayLabel,
  updateCatalogItemRequest,
  updatePurchaseInvoiceRequest,
} from '../../lib/deliveryApi';
import { deleteCatalogItemsRelentlessly } from '../../lib/catalogBulkDelete';
import { invalidateCatalogListCache } from '../../lib/catalogListCache';
import { normalizeBusinessScopeId, notifyDeliveryCatalogChanged } from '../../lib/deliverySetup';
import { filterStockInventoryItems } from '../../lib/stockInventoryScope';
import {
  createAdjustmentRequest,
  getMovementsByItemRequest,
  stockMovementSaveMessage,
  type StockMovement,
} from '../../lib/stockMovementApi';
import { InventoryStoreHistoryButton } from './InventoryStoreHistoryStrip';
import { CatalogTabShell } from './CatalogTabShell';
import { useStockWorkspace } from '../../hooks/useStockWorkspace';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { restaurantWarehouseViaExcelOnly } from '../../verticals/restaurant/restaurantWarehousePolicy';
import { listBrandsRequest } from '../../lib/brandsApi';
import { unifyStoreIngredientsFromConfig, normalizeStoreIngredients, type StoreIngredient } from '../../lib/catalogCustomization';
import { runVertialStockAutomationPipeline } from '../../lib/stockAutomationPipeline';
import { commercialLineBrands, ensureStoreIngredientsForStockSync } from '../../lib/deliveryCatalogImport';
import { filterPointsOfSaleStrictlyForBusiness } from '../../lib/businessStoreScope';
import {
  buildInventoryOrganizerGroups,
  computeInventoryStats,
  filterItemsByOrganizer,
  formatInventoryMoney,
  inventoryStatus,
  inventoryStatusClass,
  inventoryStatusLabel,
  listInventoryWarehouseCategoryLabels,
  listCartaCategoriesForInventory,
  movementTypeLabel,
  readInventoryCategoryLabel,
  readInventoryProductBrand,
  stockFieldsForWarehouseCategory,
  ORGANIZER_TOTAL,
  type InventoryCommercialBrand,
} from '../../lib/inventoryUtils';
import { quantityForWarehouse, normalizeWarehouseStockRows, sumWarehouseStockQuantities } from '../../lib/warehouseStockQty';
import {
  buildFabricationEntryNotes,
  buildManualStockPurchaseInvoicePayload,
  buildPurchaseEntryNotes,
  computeFabricationConsumptions,
  improvisedPurchaseWarning,
  resolveStoreIngredientForStockItem,
} from '../../lib/inventoryEntryLogic';
import { CatalogUnitChip, StockQtyWithUnit } from './CatalogUnitChip';
import {
  SaasTabEmpty,
  SaasTabPrimaryButton,
  SaasTabSearch,
  SaasTabSecondaryButton,
} from './SaasTabWorkspace';
import { Tabs } from './Tabs';
import { VERTIAL_BTN_DANGER, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { InventoryTypeFilterRow } from './InventoryTypeFilterRow';
import { SAAS__OcrScanModal } from '../design-system/SAAS__OcrScanModal';

type StatusFilter = 'all' | 'ok' | 'low' | 'out';
type MovementMode = 'in' | 'out' | 'adjust';

function InventoryWarehouseActionsMenu({
  disabled,
  scanDisabled,
  entryDisabled,
  onScanInvoice,
  onAddArticle,
  onAddEntry,
}: {
  disabled?: boolean;
  scanDisabled?: boolean;
  entryDisabled?: boolean;
  onScanInvoice: () => void;
  onAddArticle: () => void;
  onAddEntry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const itemClass =
    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  return (
    <div ref={ref} className="relative shrink-0">
      <SaasTabPrimaryButton
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Añadir: artículo, entrada o escanear factura"
      >
        <ScanLine className="w-4 h-4" />
        Añadir
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </SaasTabPrimaryButton>
      {open ? (
        <>
          <div className="fixed inset-0 z-[30]" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-full z-[40] mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => run(onAddArticle)}
              className={`${itemClass} bg-blue-50/60 dark:bg-blue-950/30`}
            >
              <PackagePlus className="w-4 h-4 text-[var(--v-blue,#2563eb)]" />
              Añadir artículo
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={entryDisabled}
              onClick={() => run(onAddEntry)}
              className={itemClass}
            >
              <ArrowDownCircle className="w-4 h-4 text-gray-500" />
              Añadir entrada
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={scanDisabled}
              onClick={() => run(onScanInvoice)}
              className={itemClass}
            >
              <ScanLine className="w-4 h-4 text-gray-500" />
              Escanear factura
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

const DEFAULT_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'L', label: 'L' },
  { value: 'ml', label: 'ml' },
  { value: 'ud', label: 'ud' },
];

function AddInventoryItemModal({
  isOpen,
  onClose,
  onCreated,
  userId,
  businessId,
  businessType,
  productBrands,
  warehouseCategoryLabels,
  cartaCategoryLabels,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (item?: CatalogItem) => void;
  userId: string;
  businessId?: string;
  businessType: string;
  /** Marcas activas de la empresa (las que hayas creado en Marcas). */
  productBrands: { id: string; name: string }[];
  /** Categorías solo-almacén (presets + invcat). */
  warehouseCategoryLabels: string[];
  /** Categorías creadas en la carta (sí deben salir aquí). */
  cartaCategoryLabels: string[];
}) {
  const { config: verticalConfig } = useVerticalCatalog();
  const unitOptions = verticalConfig.units.length > 0 ? verticalConfig.units : DEFAULT_UNITS;
  const cartaCategoryKeys = useMemo(
    () => new Set(cartaCategoryLabels.map((l) => l.toLowerCase())),
    [cartaCategoryLabels],
  );
  const brandChoices = useMemo(() => {
    const byName = new Map<string, { id: string; name: string }>();
    for (const b of productBrands) {
      const name = String(b.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byName.has(key)) byName.set(key, { id: b.id, name });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [productBrands]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    productBrand: '',
    categoryLabel: '',
    unit: unitOptions[0]?.value || 'kg',
    minStock: '',
    costPrice: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      name: '',
      productBrand: '',
      categoryLabel: '',
      unit: unitOptions[0]?.value || 'kg',
      minStock: '',
      costPrice: '',
    });
  }, [isOpen, unitOptions]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!form.categoryLabel.trim()) {
      toast.error('Elige o añade una categoría');
      return;
    }
    const fields = stockFieldsForWarehouseCategory(form.categoryLabel, { cartaCategoryKeys });
    setSubmitting(true);
    try {
      const created = await createCatalogItemRequest(userId, {
        name: form.name.trim(),
        category: fields.category,
        module: 'stock',
        itemType: 'product',
        vertical: businessType,
        business_id: businessId || undefined,
        stockCategory: fields.stockCategory,
        isStockItem: true,
        unit: form.unit,
        minStock: Number(form.minStock.replace(',', '.')) || 0,
        costPrice: Number(form.costPrice.replace(',', '.')) || 0,
        stockQuantity: 0,
        active: true,
        available: true,
        webVisible: false,
        customFields: {
          inventoryOrganizerId: fields.organizerId,
          ...(form.productBrand.trim() ? { productBrand: form.productBrand.trim() } : {}),
        },
      });
      toast.success('Artículo añadido al inventario');
      onClose();
      onCreated(created);
    } catch (err) {
      if (isCatalogDuplicateError(err) && err.existingItem) {
        toast.message(`«${err.existingItem.name}» ya estaba en el almacén. Lo mostramos.`);
        onClose();
        onCreated(err.existingItem);
        return;
      }
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el artículo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Nuevo artículo</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Artículo físico de almacén. Independiente del TPV y del escandallo.
        </p>
        <div className="space-y-3">
          <Field label="Nombre *">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
              placeholder="Ej: Mozzarella, Agua 50cl, Bolsas delivery…"
            />
          </Field>
          <InventoryWarehouseCategoryField
            value={form.categoryLabel}
            onChange={(categoryLabel) => setForm((f) => ({ ...f, categoryLabel }))}
            cartaLabels={cartaCategoryLabels}
            warehouseLabels={warehouseCategoryLabels}
          />
          <Field label="Marca">
            <select
              value={form.productBrand}
              onChange={(e) => setForm((f) => ({ ...f, productBrand: e.target.value }))}
              className={inputClass}
            >
              <option value="">Sin marca</option>
              {brandChoices.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
            {brandChoices.length === 0 ? (
              <p className="mt-1 text-[11px] text-gray-400">No hay marcas activas.</p>
            ) : null}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unidad">
              <select
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className={inputClass}
              >
                {unitOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stock mínimo">
              <input
                type="number"
                min="0"
                step="any"
                value={form.minStock}
                onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Coste base (€)">
            <input
              type="number"
              min="0"
              step="any"
              value={form.costPrice}
              onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
          <SaasTabPrimaryButton onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear'}
          </SaasTabPrimaryButton>
        </div>
      </div>
    </div>
  );
}

type StockMovementDone = {
  movement: StockMovement;
  warehouseId: string;
  createdItem?: CatalogItem;
  relatedMovements?: StockMovement[];
};

function applyMovementToCatalogItem(
  item: CatalogItem,
  movement: StockMovement,
  warehouseId: string,
): CatalogItem {
  const wh = String(warehouseId || movement.warehouseId || '').trim();
  const now = new Date().toISOString();
  if (!wh) {
    return {
      ...item,
      stockQuantity: movement.newStock,
      updatedAt: now,
    };
  }
  const rows = normalizeWarehouseStockRows(item.warehouseStock);
  const idx = rows.findIndex((row) => row.warehouseId === wh);
  let nextRows;
  if (idx >= 0) {
    nextRows = rows.map((row, i) =>
      i === idx ? { ...row, quantity: movement.newStock } : row,
    );
  } else if (rows.length === 0) {
    nextRows = [
      {
        warehouseId: wh,
        warehouseName: '',
        quantity: movement.newStock,
        minStock: Number(item.minStock || 0),
      },
    ];
  } else {
    nextRows = [
      ...rows,
      {
        warehouseId: wh,
        warehouseName: '',
        quantity: movement.newStock,
        minStock: Number(item.minStock || 0),
      },
    ];
  }
  return {
    ...item,
    warehouseStock: nextRows,
    stockQuantity: sumWarehouseStockQuantities(nextRows),
    updatedAt: now,
  };
}

function MovementModal({
  item,
  mode,
  warehouseId,
  userId,
  businessId,
  storeIngredients = [],
  stockItems = [],
  suppliers = [],
  onClose,
  onDone,
}: {
  item: CatalogItem;
  mode: MovementMode;
  warehouseId: string;
  userId: string;
  businessId?: string;
  storeIngredients?: StoreIngredient[];
  stockItems?: CatalogItem[];
  suppliers?: Supplier[];
  onClose: () => void;
  onDone: (result?: StockMovementDone) => void;
}) {
  const current = Number(item.stockQuantity || 0);
  const [quantity, setQuantity] = useState('');
  const [targetStock, setTargetStock] = useState(String(current));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [entryKind, setEntryKind] = useState<'purchase' | 'fabrication'>('purchase');
  const [supplierId, setSupplierId] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');

  const recipeIngredient = useMemo(
    () => (mode === 'in' ? resolveStoreIngredientForStockItem(item, storeIngredients) : null),
    [mode, item, storeIngredients],
  );
  const canFabricate = Boolean(recipeIngredient?.recipeLines && recipeIngredient.recipeLines.length > 0);

  useEffect(() => {
    if (!canFabricate && entryKind === 'fabrication') setEntryKind('purchase');
  }, [canFabricate, entryKind]);

  const producedQty = Number(String(quantity).replace(',', '.'));
  const fabricationPreview = useMemo(() => {
    if (!canFabricate || entryKind !== 'fabrication' || !(producedQty > 0) || !recipeIngredient?.recipeLines) {
      return { lines: [], missingNames: [] as string[] };
    }
    return computeFabricationConsumptions(recipeIngredient.recipeLines, producedQty, stockItems);
  }, [canFabricate, entryKind, producedQty, recipeIngredient, stockItems]);

  const title =
    mode === 'in' ? 'Entrada de stock' : mode === 'out' ? 'Salida manual' : 'Ajuste de inventario';

  const submit = async () => {
    setSaving(true);
    try {
      if (mode === 'adjust') {
        const target = Number(targetStock.replace(',', '.'));
        if (!Number.isFinite(target) || target < 0) {
          toast.error('Indica un stock válido');
          return;
        }
        const delta = target - current;
        if (delta === 0) {
          toast.message('Sin cambios');
          onClose();
          return;
        }
        const movement = await createAdjustmentRequest(userId, {
          catalogItemId: item._id,
          quantity: Math.abs(delta),
          type: delta > 0 ? 'in' : 'out',
          warehouseId: warehouseId || undefined,
          notes: notes.trim() || `Ajuste a ${target} ${item.unit || 'ud'}`,
        });
        toast.success('Movimiento registrado');
        onDone({ movement, warehouseId });
        onClose();
        return;
      }

      const qty = Number(quantity.replace(',', '.'));
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error('Indica una cantidad válida');
        return;
      }

      if (mode === 'out') {
        const movement = await createAdjustmentRequest(userId, {
          catalogItemId: item._id,
          quantity: qty,
          type: 'out',
          warehouseId: warehouseId || undefined,
          notes: notes.trim() || `Salida manual: -${qty} ${item.unit || 'ud'}`,
        });
        toast.success('Movimiento registrado');
        onDone({ movement, warehouseId });
        onClose();
        return;
      }

      // mode === 'in'
      if (entryKind === 'fabrication' && canFabricate && recipeIngredient) {
        if (fabricationPreview.missingNames.length > 0) {
          toast.warning(
            `Sin artículo de almacén para: ${fabricationPreview.missingNames.join(', ')}. Se suma el elaborado y se resta lo que se pueda.`,
          );
        }
        const lowStockNames: string[] = [];
        for (const line of fabricationPreview.lines) {
          if (!line.catalogItemId) continue;
          const stockItem = stockItems.find((s) => s._id === line.catalogItemId);
          if (!stockItem) continue;
          const available = quantityForWarehouse(stockItem, warehouseId);
          if (available + 1e-9 < line.quantity) {
            lowStockNames.push(
              `${line.name} (hay ${available} ${line.unit}, hace falta ${line.quantity})`,
            );
          }
        }
        if (lowStockNames.length > 0) {
          toast.warning(`Stock bajo en bases: ${lowStockNames.join('; ')}. Se descuenta igual.`);
        }

        const movement = await createAdjustmentRequest(userId, {
          catalogItemId: item._id,
          quantity: qty,
          type: 'in',
          warehouseId: warehouseId || undefined,
          notes: buildFabricationEntryNotes({
            quantity: qty,
            unit: item.unit || 'ud',
            recipeName: recipeIngredient.name,
            extraNotes: notes,
          }),
        });
        let consumed = 0;
        const relatedMovements: StockMovement[] = [];
        for (const line of fabricationPreview.lines) {
          if (!line.catalogItemId) continue;
          const outMovement = await createAdjustmentRequest(userId, {
            catalogItemId: line.catalogItemId,
            quantity: line.quantity,
            type: 'out',
            warehouseId: warehouseId || undefined,
            notes: `Fabricación «${recipeIngredient.name}»: -${line.quantity} ${line.unit} (${line.name})`,
          });
          relatedMovements.push(outMovement);
          consumed += 1;
        }
        toast.success(
          consumed > 0
            ? `Fabricación registrada: +${qty} ${item.unit || 'ud'} · −${consumed} base(s)`
            : 'Entrada registrada',
        );
        onDone({ movement, warehouseId, relatedMovements });
        onClose();
        return;
      }

      const supplierName = suppliers.find((s) => s._id === supplierId)?.name || '';
      const improvisedWarn = improvisedPurchaseWarning({ supplierId, supplierName });
      if (improvisedWarn) toast.warning(improvisedWarn);

      const movement = await createAdjustmentRequest(userId, {
        catalogItemId: item._id,
        quantity: qty,
        type: 'in',
        warehouseId: warehouseId || undefined,
        notes: buildPurchaseEntryNotes({
          quantity: qty,
          unit: item.unit || 'ud',
          supplierName,
          ticketNumber,
          extraNotes: notes,
        }),
      });

      try {
        const invoicePayload = buildManualStockPurchaseInvoicePayload({
          item,
          quantity: qty,
          supplierId,
          supplierName,
          ticketNumber,
          extraNotes: notes,
          businessId,
          warehouseId,
        });
        const invoice = await createPurchaseInvoiceRequest(userId, invoicePayload as any);
        await updatePurchaseInvoiceRequest(userId, {
          ...invoice,
          ocrStockReceivedAt: invoice.ocrStockReceivedAt || new Date().toISOString(),
          ocrStockLinesReceived: Math.max(1, Number(invoice.ocrStockLinesReceived) || 1),
          flags: {
            ...(invoice.flags || {}),
            stockPending: false,
            noAttachment: Boolean(improvisedWarn) || !ticketNumber.trim(),
            manualReview: Boolean(improvisedWarn),
          },
        });
        toast.success(
          improvisedWarn
            ? 'Compra + stock · doc. en Compras (sin proveedor — revisar)'
            : 'Compra registrada · documento en Compras',
        );
      } catch {
        toast.warning('Stock guardado, pero no se pudo crear el documento en Compras');
      }

      onDone({ movement, warehouseId });
      onClose();
    } catch (err) {
      toast.error(stockMovementSaveMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-500 mt-1 mb-4">{item.name}</p>
        <p className="text-xs text-gray-400 mb-4">
          Stock actual: <strong>{current}</strong> {item.unit || 'ud'}
        </p>

        {mode === 'in' ? (
          <div className="mb-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Tipo de entrada</p>
            <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-900/60 p-1">
              <button
                type="button"
                onClick={() => setEntryKind('purchase')}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  entryKind === 'purchase'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                Compra
              </button>
              <button
                type="button"
                disabled={!canFabricate}
                title={
                  canFabricate
                    ? 'Usa la subreceta y resta bases'
                    : 'Este artículo no tiene subreceta de fabricación'
                }
                onClick={() => canFabricate && setEntryKind('fabrication')}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                  entryKind === 'fabrication'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                Fabricación
              </button>
            </div>
          </div>
        ) : null}

        {mode === 'adjust' ? (
          <Field label={`Stock real (${item.unit || 'ud'})`}>
            <input
              autoFocus
              type="number"
              min="0"
              step="any"
              value={targetStock}
              onChange={(e) => setTargetStock(e.target.value)}
              className={inputClass}
            />
          </Field>
        ) : (
          <Field label={`Cantidad (${item.unit || 'ud'})`}>
            <input
              autoFocus
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        {mode === 'in' && entryKind === 'purchase' ? (
          <>
            <Field label="Proveedor (opcional)">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={inputClass}
              >
                <option value="">Sin pedido / sin proveedor</option>
                {suppliers
                  .filter((s) => s.active !== false)
                  .map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              {!supplierId ? (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  Sin proveedor = compra improvisada: al confirmar se avisará y quedará en Compras.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-stone-500">
                  No hace falta haber hecho un pedido antes. Si viene de factura/OCR, ya sube solo.
                </p>
              )}
            </Field>
            <Field label="Nº ticket / albarán (opcional)">
              <input
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                className={inputClass}
                placeholder="Si lo tienes, mejor"
              />
            </Field>
          </>
        ) : null}

        {mode === 'in' && entryKind === 'fabrication' && producedQty > 0 ? (
          <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/80 p-2.5 dark:border-stone-700 dark:bg-stone-900/40">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mb-1.5">
              Se restará (subreceta)
            </p>
            {fabricationPreview.lines.length === 0 ? (
              <p className="text-xs text-stone-500">Sin líneas de consumo.</p>
            ) : (
              <ul className="space-y-1">
                {fabricationPreview.lines.map((line) => {
                  const stockItem = line.catalogItemId
                    ? stockItems.find((s) => s._id === line.catalogItemId)
                    : null;
                  const available = stockItem ? quantityForWarehouse(stockItem, warehouseId) : null;
                  const low =
                    available != null && Number.isFinite(available) && available + 1e-9 < line.quantity;
                  return (
                    <li key={`${line.storeIngredientId}-${line.name}`} className="flex justify-between gap-2 text-xs">
                      <span className="text-stone-700 dark:text-stone-200">{line.name}</span>
                      <span
                        className={`tabular-nums ${
                          !line.catalogItemId || low ? 'text-amber-600 dark:text-amber-400' : 'text-stone-500'
                        }`}
                      >
                        −{line.quantity} {line.unit}
                        {!line.catalogItemId
                          ? ' · sin almacén'
                          : low
                            ? ` · hay ${available}`
                            : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {fabricationPreview.missingNames.length > 0 ||
            fabricationPreview.lines.some((line) => {
              if (!line.catalogItemId) return false;
              const stockItem = stockItems.find((s) => s._id === line.catalogItemId);
              if (!stockItem) return false;
              return quantityForWarehouse(stockItem, warehouseId) + 1e-9 < line.quantity;
            }) ? (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                Aviso: faltan bases o hay poco stock. Se descuenta igual (puede quedar negativo).
              </p>
            ) : null}
          </div>
        ) : null}

        <Field label="Notas (opcional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex justify-end gap-2 mt-6">
          <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
          <SaasTabPrimaryButton onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
          </SaasTabPrimaryButton>
        </div>
      </div>
    </div>
  );
}

function StockEntryPickerModal({
  items,
  storeIngredients = [],
  commercialBrands = [],
  onClose,
  onSelect,
}: {
  items: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  commercialBrands?: InventoryCommercialBrand[];
  onClose: () => void;
  onSelect: (item: CatalogItem) => void;
}) {
  useModalClose(true, onClose);
  const [query, setQuery] = useState('');
  const [organizerId, setOrganizerId] = useState('');

  const typeGroups = useMemo(
    () =>
      buildInventoryOrganizerGroups(items, storeIngredients, commercialBrands).filter(
        (g) => g.id !== ORGANIZER_TOTAL || g.total > 0,
      ),
    [items, storeIngredients, commercialBrands],
  );

  const searchActive = Boolean(query.trim());

  useEffect(() => {
    if (searchActive) setOrganizerId('');
  }, [searchActive]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (!q && organizerId) {
      list = filterItemsByOrganizer(items, organizerId, storeIngredients, commercialBrands);
    } else if (q) {
      list = items.filter((item) => item.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es')).slice(0, 100);
  }, [items, query, organizerId, storeIngredients, commercialBrands]);

  const showOrganizerGrid = !searchActive && !organizerId && typeGroups.length > 0;
  const activeOrganizerLabel = typeGroups.find((g) => g.id === organizerId)?.label || '';

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Añadir entrada</h3>
          <p className="text-sm text-gray-500 mt-1">
            Elige organizador y artículo. Si aún no existe, créalo con «Añadir artículo».
          </p>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 space-y-2">
          <SaasTabSearch value={query} onChange={setQuery} placeholder="Buscar artículo…" className="relative w-full" />
          {!searchActive && organizerId ? (
            <div className="flex items-center gap-2 min-w-0">
              <SaasTabSecondaryButton
                type="button"
                onClick={() => setOrganizerId('')}
                title="Retroceder a organizadores"
                className="shrink-0 !border-[var(--v-blue,#2563eb)] !text-[var(--v-blue,#2563eb)] hover:!bg-blue-50 dark:hover:!bg-blue-950/40"
              >
                <ArrowLeft className="w-4 h-4" />
                Retroceder
              </SaasTabSecondaryButton>
              <span className="text-stone-300 dark:text-stone-600" aria-hidden>
                /
              </span>
              <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                {activeOrganizerLabel || 'Almacén'}
              </p>
            </div>
          ) : null}
          {searchActive ? (
            <p className="text-xs font-semibold text-stone-500">Resultados de «{query.trim()}»</p>
          ) : null}
        </div>

        {showOrganizerGrid ? (
          <div className="flex-1 overflow-y-auto p-3 min-h-[120px]">
            <InventoryTypeFilterRow groups={typeGroups} onSelect={setOrganizerId} />
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 min-h-[120px]">
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-sm text-gray-500 text-center">
                {searchActive ? 'Ningún artículo coincide.' : 'No hay artículos en este organizador.'}
              </li>
            ) : (
              filtered.map((item) => (
                <li key={item._id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                  >
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>
                        Stock: <strong className="tabular-nums">{item.stockQuantity ?? 0}</strong>
                      </span>
                      <CatalogUnitChip unit={item.unit} size="sm" />
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
        </div>
      </div>
    </div>
  );
}

function InventoryItemDetailModal({
  item,
  userId,
  warehouseId,
  businessId,
  warehouseCategoryLabels,
  cartaCategoryLabels,
  storeIngredients = [],
  stockItems = [],
  suppliers = [],
  onUpdated,
  onDeleted,
  onClose,
}: {
  item: CatalogItem;
  userId: string;
  warehouseId: string;
  businessId?: string;
  warehouseCategoryLabels: string[];
  cartaCategoryLabels: string[];
  storeIngredients?: StoreIngredient[];
  stockItems?: CatalogItem[];
  suppliers?: Supplier[];
  onUpdated: (result?: StockMovementDone) => void;
  onDeleted: (deletedId: string) => void;
  onClose: () => void;
}) {
  useModalClose(true, onClose);
  const status = inventoryStatus(item);
  const brand = readInventoryProductBrand(item);
  const cartaCategoryKeys = useMemo(
    () => new Set(cartaCategoryLabels.map((l) => l.toLowerCase())),
    [cartaCategoryLabels],
  );
  const initialCategoryLabel = useMemo(() => {
    const fromItem = String(item.category || '').trim();
    if (fromItem && fromItem !== 'Ingredientes') return fromItem;
    return readInventoryCategoryLabel(item);
  }, [item]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [movementMode, setMovementMode] = useState<MovementMode | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(item.name || '');
  const [categoryLabel, setCategoryLabel] = useState(initialCategoryLabel);
  const [minStock, setMinStock] = useState(String(item.minStock ?? 0));
  const [costPrice, setCostPrice] = useState(String(item.costPrice ?? 0));
  const [trackStock, setTrackStock] = useState(item.isStockItem !== false);

  useEffect(() => {
    setName(item.name || '');
    setCategoryLabel(initialCategoryLabel);
    setMinStock(String(item.minStock ?? 0));
    setCostPrice(String(item.costPrice ?? 0));
    setTrackStock(item.isStockItem !== false);
    setMovements([]);
    setHistoryLoaded(false);
  }, [item._id, item.name, item.minStock, item.costPrice, item.isStockItem, initialCategoryLabel]);

  const loadMovements = useCallback(async () => {
    if (!userId || !item._id) return;
    setLoadingMovements(true);
    try {
      const rows = await getMovementsByItemRequest(userId, item._id);
      setMovements([...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
      setHistoryLoaded(true);
    } catch {
      setMovements([]);
      setHistoryLoaded(true);
    } finally {
      setLoadingMovements(false);
    }
  }, [userId, item._id]);

  const saveMeta = async () => {
    const nextName = name.trim();
    if (!nextName) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!categoryLabel.trim()) {
      toast.error('Elige o añade una categoría');
      return;
    }
    const fields = stockFieldsForWarehouseCategory(categoryLabel, { cartaCategoryKeys });
    setSavingMeta(true);
    try {
      await updateCatalogItemRequest(userId, {
        ...item,
        name: nextName,
        category: fields.category,
        stockCategory: fields.stockCategory,
        minStock: Number(minStock.replace(',', '.')) || 0,
        costPrice: Number(costPrice.replace(',', '.')) || 0,
        isStockItem: trackStock,
        customFields: {
          ...(item.customFields || {}),
          inventoryOrganizerId: fields.organizerId,
        },
      });
      toast.success('Artículo actualizado');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSavingMeta(false);
    }
  };

  const deleteItem = async () => {
    if (!userId || !item._id) return;
    if (
      !window.confirm(
        `¿Eliminar «${item.name}» del Almacén? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteCatalogItemRequest(userId, item._id);
      invalidateCatalogListCache(userId);
      toast.success('Artículo eliminado del Almacén');
      onDeleted(item._id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setDeleting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-black/45"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{name.trim() || item.name}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span className={`inline-flex text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${inventoryStatusClass(status)}`}>
              {inventoryStatusLabel(status)}
            </span>
            <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100 inline-flex items-center gap-2">
              <span>{item.stockQuantity ?? 0}</span>
              <CatalogUnitChip unit={item.unit} />
            </span>
            <span className="text-xs tabular-nums text-gray-500">
              {formatInventoryMoney(Number(item.stockQuantity || 0) * Number(item.costPrice || 0))}
            </span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0" aria-label="Cerrar">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <Field label="Nombre">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Nombre del artículo"
            />
          </Field>
          <InventoryWarehouseCategoryField
            value={categoryLabel}
            onChange={setCategoryLabel}
            cartaLabels={cartaCategoryLabels}
            warehouseLabels={warehouseCategoryLabels}
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Field label="Stock mínimo">
              <input type="number" min="0" step="any" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Coste (€)">
              <input type="number" min="0" step="any" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">
            Unidad: <CatalogUnitChip unit={item.unit} />
            {brand ? <span className="text-gray-500"> · {brand}</span> : null}
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} className="rounded" />
            Controlar inventario
          </label>
        </section>

        {loadingMovements ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : historyLoaded ? (
          movements.length === 0 ? (
            <p className="text-xs text-gray-500 py-1">Sin movimientos.</p>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold">Fecha</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Tipo</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Cant.</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mov) => (
                    <tr key={mov._id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatMovementDate(mov.createdAt)}</td>
                      <td className="px-2 py-1.5">{movementTypeLabel(mov.movementType)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                        {mov.quantity}{' '}
                        <CatalogUnitChip unit={item.unit} size="sm" />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">
                        {mov.previousStock} → {mov.newStock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800 space-y-2.5">
        <button
          type="button"
          onClick={() => void loadMovements()}
          disabled={loadingMovements}
          className={`${opBtnClass} w-full justify-center`}
        >
          {loadingMovements ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {historyLoaded ? 'Actualizar historial' : 'Historial'}
        </button>

        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setMovementMode('in')} className={opBtnClass}>
            <ArrowDownCircle className="w-3.5 h-3.5" /> Entrada
          </button>
          <button type="button" onClick={() => setMovementMode('out')} className={opBtnClass}>
            <ArrowUpCircle className="w-3.5 h-3.5" /> Salida
          </button>
          <button type="button" onClick={() => setMovementMode('adjust')} className={opBtnClass}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Ajuste
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void deleteItem()}
            disabled={deleting || savingMeta}
            className={`${VERTIAL_BTN_DANGER} !min-h-0 px-3 py-2 text-xs`}
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => void saveMeta()}
            disabled={savingMeta || deleting}
            className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
          >
            {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>

      {movementMode ? (
        <MovementModal
          item={item}
          mode={movementMode}
          warehouseId={warehouseId}
          userId={userId}
          businessId={businessId}
          storeIngredients={storeIngredients}
          stockItems={stockItems}
          suppliers={suppliers}
          onClose={() => setMovementMode(null)}
          onDone={(result) => {
            onUpdated(result);
            if (historyLoaded) void loadMovements();
          }}
        />
      ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function InventoryPanel({ seedStockItems }: { seedStockItems?: CatalogItem[] } = {}) {
  const {
    dataUserId,
    businessType,
    storeLabel,
    storeWarehouseId,
    stockItems,
    catalogItems,
    loading: _loadingUnused,
    refreshing,
    loadDetail,
    reload,
    patchStockItem,
  } = useStockWorkspace({ seedStockItems });
  void _loadingUnused;
  const { currentBusiness, businesses } = useBusiness();
  const businessId = String(
    currentBusiness?.business_id || currentBusiness?.id || '',
  ).trim();
  const {
    pointsOfSale,
    retailWorkCenters,
    activeSalesPointId,
    setActiveSalesPoint,
    displayLabelForActive,
  } = useActiveStoreScope();

  const storeOptions = useMemo(() => {
    const bid = normalizeBusinessScopeId(businessId);
    const foreignBusinessNames = (businesses || [])
      .filter((b) => {
        const id = normalizeBusinessScopeId(
          String((b as { business_id?: string; id?: string }).business_id || b.id || ''),
        );
        return Boolean(id && bid && id !== bid);
      })
      .map((b) => String((b as { name?: string }).name || '').trim())
      .filter(Boolean);

    const filtered = filterPointsOfSaleStrictlyForBusiness(pointsOfSale || [], {
      businessId: bid,
      workCenters: retailWorkCenters || [],
      foreignBusinessNames,
    });
    // No ocultar la tienda activa del sidebar aunque el filtro sea estricto.
    const cur = String(activeSalesPointId || '').trim();
    if (cur && !filtered.some((s) => String(s._id || '').trim() === cur)) {
      const fromPool = (pointsOfSale || []).find((p) => String(p._id || '').trim() === cur);
      if (fromPool && fromPool.active !== false && !(fromPool as { deletedAt?: string }).deletedAt) {
        return [fromPool, ...filtered];
      }
    }
    return filtered;
  }, [pointsOfSale, retailWorkCenters, businessId, businesses, activeSalesPointId]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showInvoiceOcr, setShowInvoiceOcr] = useState(false);
  const [showEntryPicker, setShowEntryPicker] = useState(false);
  const [entryItem, setEntryItem] = useState<CatalogItem | null>(null);
  const [localItems, setLocalItems] = useState<CatalogItem[]>([]);
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [commercialBrands, setCommercialBrands] = useState<InventoryCommercialBrand[]>([]);
  const [productBrands, setProductBrands] = useState<{ id: string; name: string }[]>([]);
  const [organizerMetaReady, setOrganizerMetaReady] = useState(() => !businessId);
  const [syncing, setSyncing] = useState(false);
  const [syncDetail, setSyncDetail] = useState('');
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyStale, setHistoryStale] = useState(false);
  const autoSyncStartedRef = useRef(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirmStep, setBulkDeleteConfirmStep] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  type InventoryDeleteOp = { mode: 'bulk'; items: CatalogItem[] } | null;
  const [deleteGuard, setDeleteGuard] = useState<InventoryDeleteOp>(null);
  const deleteOpRef = useRef<InventoryDeleteOp>(null);
  deleteOpRef.current = deleteGuard;

  const stockPatchRef = useRef(new Map<string, CatalogItem>());
  const reloadDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalItems((prev) => {
      const prevById = new Map(prev.map((i) => [i._id, i]));
      const merged = stockItems.map((serverItem) => {
        const id = serverItem._id;
        const patched = stockPatchRef.current.get(id);
        const local = prevById.get(id);
        const candidate = patched || local;
        if (!candidate) return serverItem;

        const serverTs = Date.parse(String(serverItem.updatedAt || '')) || 0;
        const localTs = Date.parse(String(candidate.updatedAt || '')) || 0;
        const serverQ = quantityForWarehouse(serverItem, storeWarehouseId);
        const localQ = quantityForWarehouse(candidate, storeWarehouseId);
        // Mantener parche solo si el listado del servidor aún no refleja la entrada.
        if (localTs > serverTs && Math.abs(localQ - serverQ) > 1e-9) {
          return candidate;
        }
        stockPatchRef.current.delete(id);
        return serverItem;
      });
      const mergedIds = new Set(merged.map((i) => i._id));
      for (const item of prev) {
        if (!mergedIds.has(item._id) && stockPatchRef.current.has(item._id)) {
          merged.push(item);
        }
      }
      return merged;
    });
  }, [stockItems, storeWarehouseId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!businessId) {
        setCommercialBrands([]);
        setProductBrands([]);
        setStoreIngredients([]);
        setOrganizerMetaReady(true);
        return;
      }
      setOrganizerMetaReady(false);
      try {
        const [brandList, cfg] = await Promise.all([
          listBrandsRequest(businessId).catch(() => []),
          dataUserId ? getDeliveryConfigRequest(dataUserId).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const commercial = commercialLineBrands(brandList);
        setCommercialBrands(
          commercial.map((b) => ({
            _id: b._id,
            name: b.name,
            deliveryLineKind: b.deliveryLineKind,
            primaryColor: String(b.primaryColor || '').trim() || undefined,
          })),
        );
        setProductBrands(
          brandList
            .filter((b) => b.active !== false && !b.deletedAt)
            .map((b) => ({ id: b._id || b.id, name: String(b.name || '').trim() }))
            .filter((b) => b.id && b.name),
        );
        if (cfg) {
          const brandIds = commercial.map((b) => b._id);
          setStoreIngredients(
            normalizeStoreIngredients(unifyStoreIngredientsFromConfig(cfg, brandIds)),
          );
        } else {
          setStoreIngredients([]);
        }
      } catch {
        if (!cancelled) {
          setCommercialBrands([]);
          setProductBrands([]);
          setStoreIngredients([]);
        }
      } finally {
        if (!cancelled) setOrganizerMetaReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, dataUserId]);

  useEffect(() => {
    let cancelled = false;
    if (!dataUserId) {
      setSuppliers([]);
      return;
    }
    void listSuppliersRequest(dataUserId)
      .then((rows) => {
        if (!cancelled) setSuppliers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUserId]);

  const activeItems = useMemo(
    () => localItems.filter((i) => i.active !== false && !i.deletedAt),
    [localItems],
  );

  const scopedItems = useMemo(
    () =>
      activeItems.map((item) => ({
        ...item,
        stockQuantity: quantityForWarehouse(item, storeWarehouseId),
      })),
    [activeItems, storeWarehouseId],
  );

  const stats = useMemo(() => computeInventoryStats(scopedItems), [scopedItems]);

  const typeGroups = useMemo(() => {
    // No pintar chips hasta tener marcas/config: si no, salen «Ingredientes» genéricos y luego saltan.
    if (!organizerMetaReady) return [];
    return buildInventoryOrganizerGroups(scopedItems, storeIngredients, commercialBrands).filter(
      (g) => g.id !== ORGANIZER_TOTAL || g.total > 0,
    );
  }, [organizerMetaReady, scopedItems, storeIngredients, commercialBrands]);

  /**
   * Misma lógica progresiva que el resto: no pintar la lista plana de productos
   * mientras faltan organizadores (marcas/config). Si no, hay un flash de «todos
   * los artículos» y luego saltan los chips.
   */
  const inventoryBootLoading =
    !organizerMetaReady || (refreshing && scopedItems.length === 0);
  const inventoryBootDetail = !organizerMetaReady
    ? 'Cargando organizadores…'
    : loadDetail || 'Cargando artículos del almacén…';

  const warehouseCategoryLabels = useMemo(
    () => listInventoryWarehouseCategoryLabels(scopedItems),
    [scopedItems],
  );

  const cartaCategoryLabels = useMemo(
    () => listCartaCategoriesForInventory(catalogItems),
    [catalogItems],
  );

  useEffect(() => {
    if (!typeFilter) return;
    if (typeGroups.some((g) => g.id === typeFilter)) return;
    setTypeFilter('');
  }, [typeFilter, typeGroups]);

  const statusTabs = useMemo(
    () => [
      { id: 'ok', label: 'Correctos', count: stats.ok },
      { id: 'low', label: 'Stock bajo', count: stats.low },
      { id: 'out', label: 'Sin stock', count: stats.out + stats.negative },
    ],
    [stats],
  );

  const brands = useMemo(() => {
    const set = new Set<string>();
    scopedItems.forEach((i) => {
      const brand = readInventoryProductBrand(i);
      if (brand) set.add(brand);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [scopedItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byType = filterItemsByOrganizer(scopedItems, typeFilter || 'all', storeIngredients, commercialBrands);
    return byType
      .filter((item) => {
        const status = inventoryStatus(item);
        if (statusFilter === 'out') {
          if (status !== 'out' && status !== 'negative') return false;
        } else if (statusFilter !== 'all' && status !== statusFilter) {
          return false;
        }
        const brand = readInventoryProductBrand(item);
        if (brandFilter && brand !== brandFilter) return false;
        if (!q) return true;
        const cat = readInventoryCategoryLabel(item);
        return (
          item.name?.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q) ||
          brand.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const rank = (item: CatalogItem) => {
          const s = inventoryStatus(item);
          if (s === 'negative') return 0;
          if (s === 'out') return 1;
          if (s === 'low') return 2;
          return 3;
        };
        const diff = rank(a) - rank(b);
        return diff !== 0 ? diff : (a.name || '').localeCompare(b.name || '', 'es');
      });
  }, [scopedItems, search, typeFilter, brandFilter, statusFilter, commercialBrands, storeIngredients]);

  const selectedItem = useMemo(
    () => filteredItems.find((i) => i._id === selectedId) ?? scopedItems.find((i) => i._id === selectedId) ?? null,
    [filteredItems, scopedItems, selectedId],
  );

  useEffect(() => {
    if (selectedId && !selectedItem) setSelectedId(null);
  }, [selectedId, selectedItem]);

  const applyLocalStockFromMovement = useCallback((result: StockMovementDone) => {
    const { movement, warehouseId: wh, createdItem, relatedMovements } = result;
    const whId = wh || storeWarehouseId;
    const allMovements = [movement, ...(relatedMovements || [])];

    setLocalItems((prev) => {
      let next = prev;
      for (const mov of allMovements) {
        const itemId = mov.catalogItemId || '';
        if (!itemId) continue;
        const idx = next.findIndex((item) => item._id === itemId);
        let nextItem: CatalogItem;
        if (idx < 0) {
          if (mov === movement && createdItem) {
            nextItem = createdItem;
            stockPatchRef.current.set(itemId, nextItem);
            patchStockItem(itemId, nextItem);
            next = [...next, nextItem];
          }
          continue;
        }
        nextItem = applyMovementToCatalogItem(next[idx], mov, whId);
        stockPatchRef.current.set(itemId, nextItem);
        patchStockItem(itemId, nextItem);
        if (next === prev) next = [...prev];
        next[idx] = nextItem;
      }
      return next;
    });
    setEntryItem((prev) => {
      if (!prev) return prev;
      const mov = allMovements.find((m) => m.catalogItemId === prev._id);
      if (!mov) return prev;
      return applyMovementToCatalogItem(prev, mov, whId);
    });
  }, [patchStockItem, storeWarehouseId]);

  const refreshAll = useCallback(async () => {
    invalidateCatalogListCache(dataUserId);
    await reload();
  }, [reload, dataUserId]);

  const scheduleStockReload = useCallback(() => {
    invalidateCatalogListCache(dataUserId);
    if (reloadDebounceRef.current != null) {
      window.clearTimeout(reloadDebounceRef.current);
    }
    // Debounce: varias entradas seguidas → un solo refresh, sin pisar stock local.
    reloadDebounceRef.current = window.setTimeout(() => {
      reloadDebounceRef.current = null;
      void reload();
    }, 450);
  }, [dataUserId, reload]);

  const onMovementDone = useCallback(
    (result?: StockMovementDone) => {
      if (result) applyLocalStockFromMovement(result);
      scheduleStockReload();
      setHistoryRefreshToken((n) => n + 1);
    },
    [applyLocalStockFromMovement, scheduleStockReload],
  );

  const selectedCount = selectedIds.size;

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setBulkDeleteConfirmStep(false);
    setSelectedIds(new Set());
  }, []);

  const toggleItemSelected = useCallback((itemId: string) => {
    setBulkDeleteConfirmStep(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const enterSelectModeForDelete = useCallback(() => {
    setSelectedId(null);
    setSelectMode(true);
    setBulkDeleteConfirmStep(false);
    setSelectedIds(new Set());
  }, []);

  const handleDeleteAllFiltered = useCallback(() => {
    if (!dataUserId || bulkDeleting || filteredItems.length === 0) return;
    if (!selectMode) {
      enterSelectModeForDelete();
      return;
    }
    if (!bulkDeleteConfirmStep) {
      setSelectedIds(new Set(filteredItems.map((item) => item._id)));
      setBulkDeleteConfirmStep(true);
      toast.warning(
        search.trim()
          ? `Vas a borrar ${filteredItems.length} artículo(s) visibles. Pulsa «Estoy seguro» y confirma.`
          : `Vas a borrar ${filteredItems.length} artículo(s). Pulsa «Estoy seguro» y confirma.`,
        { duration: 8000 },
      );
      return;
    }
    setDeleteGuard({ mode: 'bulk', items: filteredItems });
    setBulkDeleteConfirmStep(false);
  }, [
    dataUserId,
    bulkDeleting,
    filteredItems,
    search,
    selectMode,
    bulkDeleteConfirmStep,
    enterSelectModeForDelete,
  ]);

  const handleBulkDeleteSelected = useCallback(() => {
    if (!dataUserId || bulkDeleting) return;
    const items = filteredItems.filter((item) => selectedIds.has(item._id));
    if (items.length === 0) {
      toast.error('Selecciona al menos un artículo');
      return;
    }
    if (!bulkDeleteConfirmStep) {
      setBulkDeleteConfirmStep(true);
      return;
    }
    setDeleteGuard({ mode: 'bulk', items });
    setBulkDeleteConfirmStep(false);
  }, [dataUserId, bulkDeleting, filteredItems, selectedIds, bulkDeleteConfirmStep]);

  const executeBulkDeleteAfterGuard = useCallback(async () => {
    const op = deleteOpRef.current;
    setDeleteGuard(null);
    if (!dataUserId || !op || op.mode !== 'bulk') return;
    const list = op.items;
    setBulkDeleting(true);
    const toastId = toast.loading(`Eliminando ${list.length} artículo(s) del Almacén…`, {
      duration: Infinity,
    });
    try {
      const result = await deleteCatalogItemsRelentlessly(
        dataUserId,
        list.map((item) => item._id),
        {
          maxRounds: 6,
          onProgress: ({ pending, deleted }) => {
            toast.loading(`Eliminando… ${pending} pendiente(s) · ${deleted} ok`, { id: toastId });
          },
        },
      );
      await refreshAll();
      notifyDeliveryCatalogChanged(dataUserId, businessId || undefined);
      toast.dismiss(toastId);
      exitSelectMode();
      if (result.failed === 0) {
        toast.success(
          `Almacén: ${result.deleted} artículo${result.deleted !== 1 ? 's' : ''} eliminado${result.deleted !== 1 ? 's' : ''}`,
        );
      } else {
        toast.error(
          `Almacén: eliminados ${result.deleted}, fallaron ${result.failed}. Revisa e inténtalo de nuevo.`,
        );
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : 'No se pudo completar el borrado masivo');
    } finally {
      setBulkDeleting(false);
    }
  }, [dataUserId, businessId, exitSelectMode, refreshAll]);

  const runInventorySync = useCallback(
    async (silent = false, full = false) => {
      if (!dataUserId) return null;
      setSyncing(true);
      setSyncDetail(full ? 'Inventario + escandallo + recetas…' : 'Sincronizando artículos de almacén…');
      try {
        setSyncDetail('Leyendo marcas e ingredientes…');
        const deliveryCfg = await getDeliveryConfigRequest(dataUserId).catch(() => null);
        const inventorySyncExcludedKeys = Array.isArray(deliveryCfg?.inventorySyncExcludedKeys)
          ? deliveryCfg.inventorySyncExcludedKeys
          : [];
        const prepared = businessId
          ? await ensureStoreIngredientsForStockSync(dataUserId, businessId)
          : null;
        const commercialBrandsList = prepared?.brands ?? (businessId
          ? commercialLineBrands(await listBrandsRequest(businessId).catch(() => []))
          : []);
        const storeIngredientsForSync = prepared?.storeIngredients ?? normalizeStoreIngredients(
          unifyStoreIngredientsFromConfig(
            await getDeliveryConfigRequest(dataUserId),
            commercialBrandsList.map((b) => b._id),
          ),
        );
        if (prepared?.storeIngredients) {
          setStoreIngredients(prepared.storeIngredients);
        }
        setSyncDetail(
          full
            ? 'Creando/actualizando stock y recetas (puede tardar)…'
            : 'Creando/actualizando stock desde carta…',
        );
        const pipeline = await runVertialStockAutomationPipeline(dataUserId, {
          businessType: prepared?.businessType || businessType || 'delivery',
          businessId: businessId || undefined,
          storeIngredients: storeIngredientsForSync,
          brands: commercialBrandsList,
          inventorySyncExcludedKeys,
          mode: full ? 'full' : 'inventory',
          onAfterInventory: () => refreshAll(),
          updateCatalogItem: (item) => updateCatalogItemRequest(dataUserId, item),
        });
        const result = pipeline.inventory;
        if (full) {
          setSyncDetail('Refrescando lista…');
          await refreshAll();
        } else {
          await refreshAll();
        }
        if (!silent) {
          if (full && (pipeline.recipes.created > 0 || pipeline.recipes.updated > 0)) {
            toast.message(
              `Stock completo: inventario + ${pipeline.recipes.created + pipeline.recipes.updated} receta(s) para descontar al vender.`,
            );
          } else if (result.created > 0) {
            toast.message(
              `Inventario: ${result.created} artículo(s) sincronizados (cocina, bebidas, envases…).`,
            );
          } else if (result.updated > 0) {
            toast.message(`Inventario: ${result.updated} artículo(s) actualizados.`);
          } else if (result.candidates > 0) {
            toast.message('Inventario ya está sincronizado con carta e ingredientes.');
          } else {
            toast.message('No hay datos de carta o ingredientes para sincronizar.');
          }
        } else if (result.created > 0) {
          toast.message(
            `Almacén actualizado: ${result.created} ingrediente(s) creados automáticamente.`,
            { duration: 5000 },
          );
        }
        return pipeline;
      } catch {
        if (!silent) toast.error('No se pudo sincronizar el inventario');
        return null;
      } finally {
        setSyncing(false);
        setSyncDetail('');
      }
    },
    [dataUserId, businessId, businessType, refreshAll],
  );

  return (
    <>
      <CatalogTabShell
        hideStoreLabel
        hideStoreStrip
        dataUserId={dataUserId}
        storeWarehouseId={storeWarehouseId}
        historyOpen={historyOpen}
        onHistoryOpenChange={setHistoryOpen}
        historyRefreshToken={historyRefreshToken}
        onHistoryStaleChange={setHistoryStale}
        hideChromeWhenHistoryOpen
        toolbarLeftExtra={
          <label className="inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 dark:border-stone-700 dark:bg-stone-900">
            <Store className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
            {storeOptions.length > 0 ? (
              <select
                value={
                  storeOptions.some((s) => String(s._id || '').trim() === String(activeSalesPointId || '').trim())
                    ? String(activeSalesPointId || '')
                    : String(storeOptions[0]?._id || '')
                }
                onChange={(e) => setActiveSalesPoint(e.target.value)}
                aria-label="Tienda"
                className="min-w-[10rem] max-w-[16rem] truncate border-0 bg-transparent py-0 pl-0 pr-1 text-xs font-semibold text-stone-800 outline-none dark:text-stone-100"
              >
                {storeOptions.map((s) => {
                  const id = String(s._id || '').trim();
                  const label = pointOfSaleDisplayLabel(s);
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            ) : (
              <span className="truncate text-xs font-semibold text-stone-600 dark:text-stone-300">
                {displayLabelForActive || storeLabel || 'Tienda'}
              </span>
            )}
          </label>
        }
        toolbarRight={
          <>
            <SaasTabSecondaryButton
              onClick={() => void runInventorySync(false, true)}
              disabled={syncing || !dataUserId || bulkDeleting}
              title="Inventario + escandallo + recetas (puede tardar un minuto)"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar
            </SaasTabSecondaryButton>
            <InventoryWarehouseActionsMenu
              disabled={bulkDeleting || selectMode}
              scanDisabled={!dataUserId || bulkDeleting || selectMode}
              entryDisabled={!dataUserId || bulkDeleting || selectMode}
              onScanInvoice={() => setShowInvoiceOcr(true)}
              onAddArticle={() => setShowAdd(true)}
              onAddEntry={() => setShowEntryPicker(true)}
            />
          </>
        }
        toolbarBelow={
          syncing ? (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              {syncDetail || 'Sincronizando inventario…'}
            </p>
          ) : inventoryBootLoading ? (
            <p className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              {inventoryBootDetail}
            </p>
          ) : null
        }
      >
        {inventoryBootLoading ? (
          <div className="px-3 py-6 space-y-3" aria-busy="true" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              {inventoryBootDetail}
            </div>
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-11 rounded-xl bg-stone-100 dark:bg-gray-800/80 animate-pulse"
                  style={{ opacity: 1 - i * 0.12 }}
                />
              ))}
            </div>
          </div>
        ) : scopedItems.length === 0 ? (
          <SaasTabEmpty
            icon={<Boxes className="w-10 h-10" />}
            title="Sin artículos en inventario"
            description="Se sincronizan automáticamente desde Ingredientes y la columna ingredientes del catálogo. También puedes crearlos a mano."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <InventoryWarehouseActionsMenu
                  disabled={!dataUserId}
                  scanDisabled={!dataUserId}
                  entryDisabled={!dataUserId}
                  onAddArticle={() => setShowAdd(true)}
                  onAddEntry={() => setShowEntryPicker(true)}
                  onScanInvoice={() => setShowInvoiceOcr(true)}
                />
                <SaasTabSecondaryButton onClick={() => void runInventorySync(false, false)} disabled={syncing || !dataUserId}>
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sincronizar ingredientes
                </SaasTabSecondaryButton>
                <InventoryStoreHistoryButton
                  open={historyOpen}
                  onOpenChange={setHistoryOpen}
                  stale={historyStale}
                />
              </div>
            }
          />
        ) : (
          <div className="p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SaasTabSearch
                value={search}
                onChange={setSearch}
                placeholder="Buscar artículo…"
                className="relative w-full min-w-0 flex-1"
              />
              {brands.length > 0 ? (
                <select
                  className={selectClass}
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                >
                  <option value="">Todas las marcas</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {!search.trim() && !typeFilter && typeGroups.length > 0 ? (
              <InventoryTypeFilterRow
                groups={typeGroups}
                onSelect={(id) => {
                  setTypeFilter(id);
                  setStatusFilter('all');
                  exitSelectMode();
                }}
              />
            ) : (
              <>
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-3 pt-3 pb-2 space-y-2.5 border-b border-gray-100 dark:border-gray-700">
              {!search.trim() && typeFilter ? (
                <div className="flex items-center gap-2 min-w-0">
                  <SaasTabSecondaryButton
                    type="button"
                    onClick={() => {
                      setTypeFilter('');
                      setStatusFilter('all');
                      exitSelectMode();
                    }}
                    title="Retroceder a organizadores"
                    className="shrink-0 !border-[var(--v-blue,#2563eb)] !text-[var(--v-blue,#2563eb)] hover:!bg-blue-50 dark:hover:!bg-blue-950/40"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Retroceder
                  </SaasTabSecondaryButton>
                  <span className="text-stone-300 dark:text-stone-600" aria-hidden>
                    /
                  </span>
                  <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {typeGroups.find((g) => g.id === typeFilter)?.label || 'Almacén'}
                  </p>
                  <span className="shrink-0 text-xs tabular-nums text-stone-400">
                    {typeGroups.find((g) => g.id === typeFilter)?.total ?? filteredItems.length}
                  </span>
                </div>
              ) : search.trim() ? (
                <p className="text-xs font-semibold text-stone-500">
                  Resultados de «{search.trim()}»
                </p>
              ) : null}
              <div className="flex items-center gap-2 min-w-0">
                <Tabs
                  tabs={statusTabs}
                  activeTab={statusFilter === 'all' ? '' : statusFilter}
                  onChange={(id) => {
                    setStatusFilter((prev) => (prev === id ? 'all' : (id as StatusFilter)));
                  }}
                />
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  {selectMode ? (
                    <>
                      <button
                        type="button"
                        onClick={exitSelectMode}
                        disabled={bulkDeleting}
                        className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-2.5 py-1.5 text-xs rounded-xl shadow-none`}
                        title="Salir del modo selección"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      {selectedCount > 0 && selectedCount < filteredItems.length ? (
                        <button
                          type="button"
                          onClick={handleBulkDeleteSelected}
                          disabled={bulkDeleting}
                          className={`${VERTIAL_BTN_DANGER} !min-h-0 px-3 py-1.5 text-xs rounded-xl shadow-none inline-flex items-center gap-1.5`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {bulkDeleting
                            ? 'Eliminando…'
                            : bulkDeleteConfirmStep
                              ? `Estoy seguro (${selectedCount})`
                              : `Eliminar (${selectedCount})`}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleDeleteAllFiltered}
                        disabled={bulkDeleting || filteredItems.length === 0 || !dataUserId}
                        className={`${
                          bulkDeleteConfirmStep
                            ? '!bg-red-700 !text-white !border-red-800 hover:!bg-red-800'
                            : VERTIAL_BTN_DANGER
                        } !min-h-0 px-3 py-1.5 text-xs rounded-xl shadow-none inline-flex items-center gap-1.5 disabled:opacity-50`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {bulkDeleting
                          ? 'Eliminando…'
                          : bulkDeleteConfirmStep
                            ? `Estoy seguro (${filteredItems.length})`
                            : search.trim()
                              ? `Eliminar (${filteredItems.length})`
                              : `Eliminar todo (${filteredItems.length})`}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={enterSelectModeForDelete}
                      disabled={bulkDeleting || filteredItems.length === 0 || !dataUserId}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-0 p-2 rounded-xl shadow-none text-slate-500 hover:!border-red-300 hover:!text-red-700 hover:!bg-red-50/80 dark:hover:!bg-red-950/30 disabled:opacity-50`}
                      title="Seleccionar artículos para borrar"
                      aria-label="Seleccionar artículos para borrar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <InventoryStoreHistoryButton
                    open={historyOpen}
                    onOpenChange={setHistoryOpen}
                    stale={historyStale}
                  />
                </div>
              </div>
            </div>
          <div className="max-h-[640px] overflow-y-auto">
            {filteredItems.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">Ningún artículo coincide con los filtros.</p>
            ) : (
              <>
                {selectMode && selectedCount > 0 && bulkDeleteConfirmStep ? (
                  <p className="px-4 py-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900/40">
                    Vas a borrar {selectedCount} artículo(s) del Almacén. Pulsa «Estoy seguro» otra vez y confirma con la frase.
                  </p>
                ) : null}
                <ul className="divide-y divide-gray-100 dark:divide-gray-800 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:divide-y-0 sm:gap-px sm:bg-gray-100 dark:sm:bg-gray-800">
                  {filteredItems.map((item) => {
                    const status = inventoryStatus(item);
                    const isChecked = selectedIds.has(item._id);
                    return (
                      <li key={item._id} className="sm:bg-white dark:sm:bg-gray-900">
                        <div
                          className={`flex items-stretch gap-0 ${
                            selectMode && isChecked ? 'bg-red-50/60 dark:bg-red-950/20' : ''
                          }`}
                        >
                          {selectMode ? (
                            <label className="flex items-center px-3 shrink-0 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={bulkDeleting}
                                onChange={() => toggleItemSelected(item._id)}
                                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                aria-label={`Seleccionar ${item.name}`}
                              />
                            </label>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              if (selectMode) {
                                toggleItemSelected(item._id);
                                return;
                              }
                              setSelectedId(item._id);
                            }}
                            title={selectMode ? 'Seleccionar para borrar' : 'Ver ficha: stock, operaciones e historial'}
                            className="w-full min-w-0 text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{item.name}</p>
                                <p className="text-[11px] text-gray-500 truncate">
                                  {readInventoryCategoryLabel(item)}
                                  {readInventoryProductBrand(item) ? ` · ${readInventoryProductBrand(item)}` : ''}
                                </p>
                              </div>
                              <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${inventoryStatusClass(status)}`}>
                                {inventoryStatusLabel(status)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <StockQtyWithUnit
                                quantity={item.stockQuantity ?? 0}
                                unit={item.unit}
                                low={status === 'low' || status === 'out' || status === 'negative'}
                              />
                              {Number(item.minStock) > 0 ? (
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                  mín {item.minStock}
                                </span>
                              ) : null}
                              {Number(item.costPrice) > 0 ? (
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                                  {formatInventoryMoney(Number(item.costPrice))}/
                                  <CatalogUnitChip unit={item.unit} size="sm" />
                                </span>
                              ) : null}
                            </div>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
            </div>
              </>
            )}
          </div>
        )}
        {!historyOpen ? (
          <div className="flex flex-wrap items-center gap-y-1.5 px-3 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-y-1.5 divide-x divide-gray-200/80 dark:divide-gray-700">
              {(
                [
                  { label: 'artículos', value: stats.total, tone: 'default' as const },
                  { label: 'correcto', value: stats.ok, tone: 'emerald' as const },
                  {
                    label: 'bajo',
                    value: stats.low,
                    tone: (stats.low > 0 ? 'amber' : 'default') as 'amber' | 'default',
                  },
                  {
                    label: 'sin stock',
                    value: stats.out,
                    tone: (stats.out > 0 ? 'red' : 'default') as 'red' | 'default',
                  },
                  {
                    label: 'valor €',
                    value: stats.estimatedValue.toFixed(0),
                    tone: 'indigo' as const,
                  },
                ] as const
              ).map((s) => {
                const toneClass =
                  s.tone === 'amber'
                    ? 'text-amber-700 dark:text-amber-400'
                    : s.tone === 'emerald'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : s.tone === 'red'
                        ? 'text-red-700 dark:text-red-400'
                        : s.tone === 'indigo'
                          ? 'text-indigo-700 dark:text-indigo-400'
                          : 'text-gray-900 dark:text-gray-100';
                return (
                  <div key={s.label} className="flex items-baseline gap-1.5 px-3 first:pl-0">
                    <span className={`text-sm font-bold tabular-nums ${toneClass}`}>{s.value}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </CatalogTabShell>

      {selectedItem ? (
        <InventoryItemDetailModal
          key={selectedItem._id}
          item={selectedItem}
          userId={dataUserId}
          warehouseId={storeWarehouseId}
          businessId={businessId}
          warehouseCategoryLabels={warehouseCategoryLabels}
          cartaCategoryLabels={cartaCategoryLabels}
          storeIngredients={storeIngredients}
          stockItems={localItems}
          suppliers={suppliers}
          onUpdated={(result) => onMovementDone(result)}
          onDeleted={(deletedId) => {
            setSelectedId(null);
            setLocalItems((prev) => prev.filter((i) => i._id !== deletedId));
            notifyDeliveryCatalogChanged(dataUserId, businessId || undefined);
            void refreshAll();
          }}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      <SAAS__OcrScanModal
        isOpen={showInvoiceOcr}
        onClose={() => setShowInvoiceOcr(false)}
        userId={dataUserId}
        targetModule="compras"
        onDocumentCreated={async (payload) => {
          setShowInvoiceOcr(false);
          await refreshAll();
          const fx = payload?.sideEffects as {
            stockUpdated?: number;
            matchedLines?: number;
            totalLines?: number;
            financeMovementId?: string;
          } | undefined;
          const unmatched =
            fx?.totalLines != null && fx?.matchedLines != null
              ? Math.max(0, fx.totalLines - fx.matchedLines)
              : 0;
          if (fx?.stockUpdated && fx.stockUpdated > 0) {
            if (unmatched > 0) {
              toast.warning(
                `Factura guardada: ${fx.stockUpdated} artículo(s) en stock. ${unmatched} línea(s) sin vínculo — no subieron stock.`,
              );
            } else {
              toast.success(`Factura procesada: ${fx.stockUpdated} artículo(s) en stock y pago en Finanzas`);
            }
          } else if (fx?.financeMovementId) {
            toast.warning(
              'Factura y pago en Finanzas registrados, pero ninguna línea subió stock. Revisa el inventario y vincula los artículos.',
            );
          } else {
            toast.success('Factura procesada. Revisa Compras, Finanzas e Inventario.');
          }
        }}
      />

      <AddInventoryItemModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(item) => {
          if (item?._id) {
            patchStockItem(item._id, item);
            stockPatchRef.current.set(item._id, item);
            setLocalItems((prev) => {
              if (prev.some((p) => p._id === item._id)) {
                return prev.map((p) => (p._id === item._id ? { ...p, ...item } : p));
              }
              return [...prev, item];
            });
            setSelectedId(item._id);
          }
          scheduleStockReload();
        }}
        userId={dataUserId}
        businessId={businessId}
        businessType={businessType}
        productBrands={productBrands}
        warehouseCategoryLabels={warehouseCategoryLabels}
        cartaCategoryLabels={cartaCategoryLabels}
      />

      {showEntryPicker && dataUserId ? (
        <StockEntryPickerModal
          items={scopedItems}
          storeIngredients={storeIngredients}
          commercialBrands={commercialBrands}
          onClose={() => setShowEntryPicker(false)}
          onSelect={(item) => {
            setShowEntryPicker(false);
            setEntryItem(item);
          }}
        />
      ) : null}

      {entryItem && dataUserId ? (
        <MovementModal
          item={entryItem}
          mode="in"
          warehouseId={storeWarehouseId}
          userId={dataUserId}
          businessId={businessId}
          storeIngredients={storeIngredients}
          stockItems={localItems}
          suppliers={suppliers}
          onClose={() => setEntryItem(null)}
          onDone={(result) => onMovementDone(result)}
        />
      ) : null}

      <CatalogDeleteGuardModal
        open={deleteGuard !== null}
        payload={
          deleteGuard?.mode === 'bulk'
            ? { mode: 'bulk', kind: 'almacen', count: deleteGuard.items.length }
            : null
        }
        onClose={() => {
          setDeleteGuard(null);
          setBulkDeleteConfirmStep(false);
        }}
        onVerified={() => {
          void executeBulkDeleteAfterGuard();
        }}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{label}</label>
      {children}
    </div>
  );
}

/** Categorías: las de la carta salen aquí; «Nueva» = solo almacén (nunca TPV). */
function InventoryWarehouseCategoryField({
  value,
  onChange,
  cartaLabels,
  warehouseLabels,
}: {
  value: string;
  onChange: (label: string) => void;
  cartaLabels: string[];
  warehouseLabels: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const cartaChips = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const raw of cartaLabels) {
      const label = String(raw || '').trim();
      if (!label) continue;
      byKey.set(label.toLowerCase(), label);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [cartaLabels]);

  const warehouseChips = useMemo(() => {
    const cartaKeys = new Set(cartaChips.map((l) => l.toLowerCase()));
    const byKey = new Map<string, string>();
    for (const raw of warehouseLabels) {
      const label = String(raw || '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      // No duplicar si ya es categoría de carta (p. ej. Bebidas)
      if (cartaKeys.has(key)) continue;
      byKey.set(key, label);
    }
    const selected = String(value || '').trim();
    if (
      selected
      && !cartaKeys.has(selected.toLowerCase())
      && !byKey.has(selected.toLowerCase())
    ) {
      byKey.set(selected.toLowerCase(), selected);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [warehouseLabels, cartaChips, value]);

  const selectedKey = value.trim().toLowerCase();

  const commitNew = () => {
    const next = draft.trim().replace(/\s+/g, ' ');
    if (!next) return;
    // Si el nombre ya es de carta, enlaza a esa (no inventa invcat)
    const cartaHit = cartaChips.find((c) => c.toLowerCase() === next.toLowerCase());
    if (cartaHit) {
      onChange(cartaHit);
    } else {
      const whHit = warehouseChips.find((c) => c.toLowerCase() === next.toLowerCase());
      onChange(whHit || next.replace(/^\w/u, (c) => c.toUpperCase()));
    }
    setDraft('');
    setAdding(false);
  };

  const renderChip = (cat: string) => {
    const selected = cat.toLowerCase() === selectedKey;
    return (
      <button
        key={cat}
        type="button"
        onClick={() => {
          onChange(cat);
          setAdding(false);
          setDraft('');
        }}
        className={`inline-flex items-center rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold leading-none transition-colors ${
          selected
            ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white'
            : 'border-stone-200 bg-white text-stone-700 hover:border-blue-300 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-blue-700'
        }`}
      >
        {cat}
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 space-y-3 dark:border-stone-700 dark:bg-stone-900/40">
      <label className="block text-xs font-bold text-stone-900 dark:text-stone-100">
        Categoría *
      </label>

      {cartaChips.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            De la carta (ingredientes…)
          </p>
          <div className="flex flex-wrap gap-1.5">{cartaChips.map(renderChip)}</div>
        </div>
      ) : (
        <p className="text-xs text-stone-500">
          Aún no hay categorías en la carta. Créalas ahí y saldrán aquí.
        </p>
      )}

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          Solo almacén
        </p>
        <div className="flex flex-wrap gap-1.5">
          {warehouseChips.map(renderChip)}
          {!adding ? (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setDraft('');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-blue-300 hover:text-[var(--v-blue,#2563eb)] dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300"
            >
              <Plus className="w-3 h-3" />
              Nueva categoría
            </button>
          ) : null}
        </div>
      </div>

      {adding ? (
        <div className="rounded-lg border border-dashed border-blue-200 bg-white p-2.5 space-y-2 dark:border-blue-800 dark:bg-stone-900">
          <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
            Nueva categoría de almacén
          </p>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitNew();
              }
              if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
            className={`${inputClass} !py-2 text-sm`}
            placeholder="Ej: Frío, Droguería…"
            aria-label="Añadir categoría de almacén"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft('');
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={commitNew}
              disabled={!draft.trim()}
              className="rounded-lg bg-[var(--v-blue,#2563eb)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
          <p className="text-[11px] text-gray-400">No aparecerá en el TPV ni en la carta</p>
        </div>
      ) : null}
    </div>
  );
}

function formatMovementDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const inputClass =
  'w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500';

const selectClass =
  'px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 outline-none';

const opBtnClass =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700';
