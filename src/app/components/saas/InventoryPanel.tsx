import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  ScanLine,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { CatalogCoreLoadingState } from './CatalogCoreLoadingState';
import { CatalogDeleteGuardModal } from './CatalogDeleteGuardModal';
import { useModalClose } from '../../hooks/useModalClose';
import type { CatalogItem } from '../../lib/deliveryApi';
import {
  createCatalogItemRequest,
  deleteCatalogItemRequest,
  getDeliveryConfigRequest,
  listCatalogItemsRequest,
  updateCatalogItemRequest,
} from '../../lib/deliveryApi';
import { deleteCatalogItemsRelentlessly } from '../../lib/catalogBulkDelete';
import { filterStockInventoryItems } from '../../lib/stockInventoryScope';
import {
  createAdjustmentRequest,
  getMovementsByItemRequest,
  type StockMovement,
} from '../../lib/stockMovementApi';
import { useStockWorkspace } from '../../hooks/useStockWorkspace';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import { useBusiness } from '../../context/BusinessContext';
import { listBrandsRequest } from '../../lib/brandsApi';
import { unifyStoreIngredientsFromConfig, normalizeStoreIngredients } from '../../lib/catalogCustomization';
import { runVertialStockAutomationPipeline } from '../../lib/stockAutomationPipeline';
import {
  buildInventoryOrganizerGroups,
  computeInventoryStats,
  filterItemsByOrganizer,
  formatInventoryMoney,
  inventoryStatus,
  inventoryStatusClass,
  inventoryStatusLabel,
  listInventoryOrganizerChoices,
  movementTypeLabel,
  readInventoryCategoryLabel,
  readInventoryProductBrand,
  stockFieldsForOrganizer,
  ORGANIZER_TOTAL,
  type InventoryCommercialBrand,
} from '../../lib/inventoryUtils';
import { quantityForWarehouse } from '../../lib/warehouseStockQty';
import { CatalogUnitChip, StockQtyWithUnit } from './CatalogUnitChip';
import {
  SaasTabEmpty,
  SaasTabPrimaryButton,
  SaasTabSearch,
  SaasTabSecondaryButton,
  SaasTabToolbarRow,
  SaasTabWorkspace,
} from './SaasTabWorkspace';
import { Tabs } from './Tabs';
import { VERTIAL_BTN_DANGER, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { InventoryTypeFilterRow } from './InventoryTypeFilterRow';
import { SAAS__OcrScanModal } from '../design-system/SAAS__OcrScanModal';

type StatusFilter = 'all' | 'ok' | 'low' | 'out';
type MovementMode = 'in' | 'out' | 'adjust';

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
  businessType,
  commercialBrands,
  defaultOrganizerId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  userId: string;
  businessType: string;
  commercialBrands: InventoryCommercialBrand[];
  defaultOrganizerId?: string | null;
}) {
  const { config: verticalConfig } = useVerticalCatalog();
  const unitOptions = verticalConfig.units.length > 0 ? verticalConfig.units : DEFAULT_UNITS;
  const organizerChoices = useMemo(
    () => listInventoryOrganizerChoices(commercialBrands),
    [commercialBrands],
  );
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    productBrand: '',
    category: '',
    organizerId: '',
    unit: unitOptions[0]?.value || 'kg',
    minStock: '',
    costPrice: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    const preferred =
      defaultOrganizerId &&
      defaultOrganizerId !== ORGANIZER_TOTAL &&
      defaultOrganizerId !== 'all' &&
      organizerChoices.some((c) => c.id === defaultOrganizerId)
        ? defaultOrganizerId
        : organizerChoices[0]?.id || '';
    setForm({
      name: '',
      productBrand: '',
      category: '',
      organizerId: preferred,
      unit: unitOptions[0]?.value || 'kg',
      minStock: '',
      costPrice: '',
    });
  }, [isOpen, unitOptions, organizerChoices, defaultOrganizerId]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!form.organizerId.trim()) {
      toast.error('Elige en qué organizador colocarlo');
      return;
    }
    const fields = stockFieldsForOrganizer(form.organizerId);
    setSubmitting(true);
    try {
      await createCatalogItemRequest(userId, {
        name: form.name.trim(),
        category: form.category.trim() || fields.category,
        module: 'stock',
        itemType: 'product',
        vertical: businessType,
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
          inventoryOrganizerId: form.organizerId.trim(),
          ...(form.productBrand.trim() ? { productBrand: form.productBrand.trim() } : {}),
        },
      });
      toast.success('Artículo añadido al inventario');
      onClose();
      onCreated();
    } catch (err) {
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
          <Field label="Organizador *">
            <select
              value={form.organizerId}
              onChange={(e) => setForm((f) => ({ ...f, organizerId: e.target.value }))}
              className={inputClass}
            >
              {organizerChoices.length === 0 ? (
                <option value="">Sin organizadores</option>
              ) : (
                organizerChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))
              )}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className={inputClass}
                placeholder="Ej: Lácteos"
              />
            </Field>
            <Field label="Marca">
              <input
                value={form.productBrand}
                onChange={(e) => setForm((f) => ({ ...f, productBrand: e.target.value }))}
                className={inputClass}
                placeholder="Ej: Galbani"
              />
            </Field>
          </div>
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

function MovementModal({
  item,
  mode,
  warehouseId,
  userId,
  onClose,
  onDone,
}: {
  item: CatalogItem;
  mode: MovementMode;
  warehouseId: string;
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const current = Number(item.stockQuantity || 0);
  const [quantity, setQuantity] = useState('');
  const [targetStock, setTargetStock] = useState(String(current));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

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
        await createAdjustmentRequest(userId, {
          catalogItemId: item._id,
          quantity: Math.abs(delta),
          type: delta > 0 ? 'in' : 'out',
          warehouseId: warehouseId || undefined,
          notes: notes.trim() || `Ajuste a ${target} ${item.unit || 'ud'}`,
        });
      } else {
        const qty = Number(quantity.replace(',', '.'));
        if (!Number.isFinite(qty) || qty <= 0) {
          toast.error('Indica una cantidad válida');
          return;
        }
        await createAdjustmentRequest(userId, {
          catalogItemId: item._id,
          quantity: qty,
          type: mode,
          warehouseId: warehouseId || undefined,
          notes:
            notes.trim() ||
            (mode === 'in'
              ? `Entrada manual: +${qty} ${item.unit || 'ud'}`
              : `Salida manual: -${qty} ${item.unit || 'ud'}`),
        });
      }
      toast.success('Movimiento registrado');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar el movimiento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-500 mt-1 mb-4">{item.name}</p>
        <p className="text-xs text-gray-400 mb-4">
          Stock actual: <strong>{current}</strong> {item.unit || 'ud'}
        </p>
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

function InventoryItemDetailModal({
  item,
  userId,
  warehouseId,
  onUpdated,
  onDeleted,
  onClose,
}: {
  item: CatalogItem;
  userId: string;
  warehouseId: string;
  onUpdated: () => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  useModalClose(true, onClose);
  const status = inventoryStatus(item);
  const brand = readInventoryProductBrand(item);
  const category = readInventoryCategoryLabel(item);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementMode, setMovementMode] = useState<MovementMode | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [minStock, setMinStock] = useState(String(item.minStock ?? 0));
  const [costPrice, setCostPrice] = useState(String(item.costPrice ?? 0));
  const [trackStock, setTrackStock] = useState(item.isStockItem !== false);

  useEffect(() => {
    setMinStock(String(item.minStock ?? 0));
    setCostPrice(String(item.costPrice ?? 0));
    setTrackStock(item.isStockItem !== false);
  }, [item._id, item.minStock, item.costPrice, item.isStockItem]);

  const loadMovements = useCallback(async () => {
    if (!userId || !item._id) return;
    setLoadingMovements(true);
    try {
      const rows = await getMovementsByItemRequest(userId, item._id);
      setMovements([...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    } catch {
      setMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  }, [userId, item._id]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      await updateCatalogItemRequest(userId, {
        ...item,
        minStock: Number(minStock.replace(',', '.')) || 0,
        costPrice: Number(costPrice.replace(',', '.')) || 0,
        isStockItem: trackStock,
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
      toast.success('Artículo eliminado del Almacén');
      onDeleted();
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
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{item.name}</h2>
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

      <div className="overflow-y-auto px-4 py-3 space-y-3">
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Stock mínimo">
              <input type="number" min="0" step="any" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Coste (€)">
              <input type="number" min="0" step="any" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">
            Unidad: <CatalogUnitChip unit={item.unit} />
            {category ? <span className="text-gray-500"> · {category}</span> : null}
            {brand ? <span className="text-gray-500"> · {brand}</span> : null}
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} className="rounded" />
            Controlar inventario
          </label>
          <button
            type="button"
            onClick={() => void saveMeta()}
            disabled={savingMeta || deleting}
            className={`${VERTIAL_BTN_SECONDARY} !min-h-0 mt-2 px-3 py-1.5 text-xs`}
          >
            {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => void deleteItem()}
            disabled={deleting || savingMeta}
            className={`${VERTIAL_BTN_DANGER} !min-h-0 mt-2 ml-2 px-3 py-1.5 text-xs`}
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Eliminar
          </button>
        </section>

        <section>
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
        </section>

        <section>
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Historial</h3>
            <button type="button" onClick={() => void loadMovements()} className="p-1 text-gray-400 hover:text-gray-700" aria-label="Actualizar">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {loadingMovements ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : movements.length === 0 ? (
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
          )}
        </section>
      </div>

      {movementMode ? (
        <MovementModal
          item={item}
          mode={movementMode}
          warehouseId={warehouseId}
          userId={userId}
          onClose={() => setMovementMode(null)}
          onDone={() => {
            onUpdated();
            void loadMovements();
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
    loading,
    loadDetail,
    reload,
  } = useStockWorkspace({ seedStockItems });
  const { currentBusiness } = useBusiness();
  const businessId = String(
    currentBusiness?.business_id || currentBusiness?.id || '',
  ).trim();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showInvoiceOcr, setShowInvoiceOcr] = useState(false);
  const [localItems, setLocalItems] = useState<CatalogItem[]>([]);
  const [commercialBrands, setCommercialBrands] = useState<InventoryCommercialBrand[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncDetail, setSyncDetail] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirmStep, setBulkDeleteConfirmStep] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  type InventoryDeleteOp = { mode: 'bulk'; items: CatalogItem[] } | null;
  const [deleteGuard, setDeleteGuard] = useState<InventoryDeleteOp>(null);
  const deleteOpRef = useRef<InventoryDeleteOp>(null);
  deleteOpRef.current = deleteGuard;

  useEffect(() => {
    setLocalItems(stockItems);
  }, [stockItems]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!businessId) {
        setCommercialBrands([]);
        return;
      }
      try {
        const brandList = await listBrandsRequest(businessId).catch(() => []);
        if (cancelled) return;
        setCommercialBrands(
          brandList.map((b) => ({
            _id: b._id,
            name: b.name,
            deliveryLineKind: b.deliveryLineKind,
          })),
        );
      } catch {
        if (!cancelled) setCommercialBrands([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

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

  const typeGroups = useMemo(
    () => buildInventoryOrganizerGroups(scopedItems, [], commercialBrands).filter((g) => g.id !== ORGANIZER_TOTAL || g.total > 0),
    [scopedItems, commercialBrands],
  );

  const statusTabs = useMemo(
    () => [
      { id: 'all', label: 'Todos', count: stats.total },
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
    const byType = filterItemsByOrganizer(scopedItems, typeFilter || 'all', [], commercialBrands);
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
  }, [scopedItems, search, typeFilter, brandFilter, statusFilter, commercialBrands]);

  const selectedItem = useMemo(
    () => filteredItems.find((i) => i._id === selectedId) ?? scopedItems.find((i) => i._id === selectedId) ?? null,
    [filteredItems, scopedItems, selectedId],
  );

  useEffect(() => {
    if (selectedId && !selectedItem) setSelectedId(null);
  }, [selectedId, selectedItem]);

  const refreshAll = useCallback(async () => {
    await reload();
    if (!dataUserId) return;
    try {
      const catalog = await listCatalogItemsRequest(dataUserId, 'stock');
      setLocalItems(filterStockInventoryItems(catalog));
    } catch {
      /* reload already updated stockItems */
    }
  }, [reload, dataUserId]);

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

  const handleDeleteAllFiltered = useCallback(() => {
    if (!dataUserId || bulkDeleting || filteredItems.length === 0) return;
    setSelectMode(true);
    setSelectedIds(new Set(filteredItems.map((item) => item._id)));
    setBulkDeleteConfirmStep(true);
    toast.warning(
      search.trim()
        ? `Almacén: ${filteredItems.length} artículo(s) visibles. Pulsa «Estoy seguro» y confirma.`
        : `Almacén: ${filteredItems.length} artículo(s). Pulsa «Estoy seguro» y confirma.`,
      { duration: 8000 },
    );
  }, [dataUserId, bulkDeleting, filteredItems, search]);

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
  }, [dataUserId, exitSelectMode, refreshAll]);

  const runInventorySync = useCallback(
    async (silent = false, full = false) => {
      if (!dataUserId) return null;
      setSyncing(true);
      setSyncDetail(full ? 'Inventario + escandallo + recetas…' : 'Sincronizando artículos de almacén…');
      try {
        setSyncDetail('Leyendo marcas e ingredientes…');
        const commercialBrands = businessId
          ? await listBrandsRequest(businessId).catch(() => [])
          : [];
        const cfg = await getDeliveryConfigRequest(dataUserId);
        const brandIds = commercialBrands.map((b) => b._id);
        const storeIngredients = normalizeStoreIngredients(
          unifyStoreIngredientsFromConfig(cfg, brandIds),
        );
        setSyncDetail(
          full
            ? 'Creando/actualizando stock y recetas (puede tardar)…'
            : 'Creando/actualizando stock desde carta…',
        );
        const pipeline = await runVertialStockAutomationPipeline(dataUserId, {
          businessType: businessType || 'delivery',
          businessId: businessId || undefined,
          storeIngredients,
          brands: commercialBrands,
          mode: full ? 'full' : 'inventory',
          onAfterInventory: () => refreshAll(),
          updateCatalogItem: (item) => updateCatalogItemRequest(dataUserId, item),
        });
        const result = pipeline.inventory;
        if (full) {
          setSyncDetail('Refrescando lista…');
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

  if (loading && scopedItems.length === 0) {
    return (
      <CatalogCoreLoadingState kind="stock" detail={loadDetail || undefined} />
    );
  }

  return (
    <>
      <SaasTabWorkspace
        stats={[
          { label: 'artículos', value: stats.total },
          { label: 'correcto', value: stats.ok, tone: 'emerald' },
          { label: 'bajo', value: stats.low, tone: stats.low > 0 ? 'amber' : 'default' },
          { label: 'sin stock', value: stats.out, tone: stats.out > 0 ? 'red' : 'default' },
          { label: 'valor €', value: stats.estimatedValue.toFixed(0), tone: 'indigo' },
        ]}
        banner={
          <div className="space-y-1">
            <p className="text-stone-600 dark:text-stone-300">
              Stock de <strong className="text-stone-900 dark:text-white">{storeLabel || 'Almacén'}</strong>
              {' · '}mismo catálogo; cantidades por tienda.
            </p>
            {syncing ? (
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                {syncDetail || 'Sincronizando inventario…'}
              </p>
            ) : null}
          </div>
        }
        toolbar={
          <SaasTabToolbarRow
            left={
              <>
                <SaasTabSearch value={search} onChange={setSearch} placeholder="Buscar artículo…" className="relative w-full sm:w-52" />
                {brands.length > 0 ? (
                  <select className={selectClass} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
                    <option value="">Todas las marcas</option>
                    {brands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                ) : null}
              </>
            }
            right={
              <>
                {!selectMode ? (
                  <SaasTabSecondaryButton
                    onClick={handleDeleteAllFiltered}
                    disabled={bulkDeleting || filteredItems.length === 0 || !dataUserId}
                    className="!border-red-300 !text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    {search.trim()
                      ? `Eliminar (${filteredItems.length})`
                      : `Eliminar todo (${filteredItems.length})`}
                  </SaasTabSecondaryButton>
                ) : (
                  <>
                    <SaasTabSecondaryButton onClick={exitSelectMode} disabled={bulkDeleting}>
                      Cancelar
                    </SaasTabSecondaryButton>
                    <SaasTabSecondaryButton
                      onClick={handleBulkDeleteSelected}
                      disabled={bulkDeleting || selectedCount === 0}
                      className={
                        bulkDeleteConfirmStep
                          ? '!bg-red-700 !text-white !border-red-800 hover:!bg-red-800'
                          : '!border-red-300 !text-red-700'
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                      {bulkDeleting
                        ? 'Eliminando…'
                        : bulkDeleteConfirmStep
                          ? `Estoy seguro (${selectedCount})`
                          : `Eliminar (${selectedCount})`}
                    </SaasTabSecondaryButton>
                  </>
                )}
                <SaasTabSecondaryButton
                  onClick={() => void runInventorySync(false, true)}
                  disabled={syncing || !dataUserId || bulkDeleting}
                  title="Inventario + escandallo + recetas (puede tardar un minuto)"
                >
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sincronizar
                </SaasTabSecondaryButton>
                <SaasTabSecondaryButton
                  onClick={() => setShowInvoiceOcr(true)}
                  disabled={!dataUserId || bulkDeleting}
                  title="Escanea factura o albarán de proveedor para subir stock"
                >
                  <ScanLine className="w-4 h-4" />
                  Escanear factura
                </SaasTabSecondaryButton>
                <SaasTabPrimaryButton onClick={() => setShowAdd(true)} disabled={bulkDeleting}>
                  <Plus className="w-4 h-4" /> Nuevo artículo
                </SaasTabPrimaryButton>
              </>
            }
          />
        }
      >
        {scopedItems.length === 0 ? (
          <SaasTabEmpty
            icon={<Boxes className="w-10 h-10" />}
            title="Sin artículos en inventario"
            description="Se sincronizan automáticamente desde Ingredientes y la columna ingredientes del catálogo. También puedes crearlos a mano."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <SaasTabSecondaryButton onClick={() => void runInventorySync(false, false)} disabled={syncing || !dataUserId}>
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sincronizar ingredientes
                </SaasTabSecondaryButton>
                <SaasTabPrimaryButton onClick={() => setShowAdd(true)}>
                  <PackagePlus className="w-4 h-4" /> Crear artículo
                </SaasTabPrimaryButton>
              </div>
            }
          />
        ) : (
          <>
            <div className="px-3 pt-3 pb-2 space-y-2.5 border-b border-gray-100 dark:border-gray-700">
              <Tabs
                tabs={statusTabs}
                activeTab={statusFilter}
                onChange={(id) => setStatusFilter(id as StatusFilter)}
              />
              {typeGroups.length > 0 ? (
                <InventoryTypeFilterRow
                  groups={typeGroups}
                  activeId={typeFilter}
                  onSelect={setTypeFilter}
                  totalAll={scopedItems.length}
                />
              ) : null}
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
          </>
        )}
      </SaasTabWorkspace>

      {selectedItem ? (
        <InventoryItemDetailModal
          key={selectedItem._id}
          item={selectedItem}
          userId={dataUserId}
          warehouseId={storeWarehouseId}
          onUpdated={() => void refreshAll()}
          onDeleted={() => {
            setSelectedId(null);
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
        onCreated={() => void refreshAll()}
        userId={dataUserId}
        businessType={businessType}
        commercialBrands={commercialBrands}
        defaultOrganizerId={typeFilter}
      />

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
