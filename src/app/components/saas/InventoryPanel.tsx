import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  ChevronDown,
  Loader2,
  PackagePlus,
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
import { restaurantWarehouseViaExcelOnly } from '../../verticals/restaurant/restaurantWarehousePolicy';
import { listBrandsRequest } from '../../lib/brandsApi';
import { unifyStoreIngredientsFromConfig, normalizeStoreIngredients, type StoreIngredient } from '../../lib/catalogCustomization';
import { runVertialStockAutomationPipeline } from '../../lib/stockAutomationPipeline';
import { commercialLineBrands, ensureStoreIngredientsForStockSync } from '../../lib/deliveryCatalogImport';
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
        title="Escanear factura, añadir artículo o registrar entrada"
      >
        <ScanLine className="w-4 h-4" />
        Acciones
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
              disabled={scanDisabled}
              onClick={() => run(onScanInvoice)}
              className={`${itemClass} bg-blue-50/60 dark:bg-blue-950/30`}
            >
              <ScanLine className="w-4 h-4 text-[var(--v-blue,#2563eb)]" />
              Escanear factura
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => run(onAddArticle)}
              className={itemClass}
            >
              <PackagePlus className="w-4 h-4 text-gray-500" />
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
  businessType,
  commercialBrands,
  productBrands,
  defaultOrganizerId,
  inUseOrganizerIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  userId: string;
  businessType: string;
  commercialBrands: InventoryCommercialBrand[];
  /** Marcas activas de la empresa (las que hayas creado en Marcas). */
  productBrands: { id: string; name: string }[];
  defaultOrganizerId?: string | null;
  /** Organizadores con artículos: los genéricos sin uso van a «Crear otro tipo». */
  inUseOrganizerIds?: string[];
}) {
  const { config: verticalConfig } = useVerticalCatalog();
  const unitOptions = verticalConfig.units.length > 0 ? verticalConfig.units : DEFAULT_UNITS;
  const organizerChoices = useMemo(
    () => listInventoryOrganizerChoices(commercialBrands, { inUseOrganizerIds }),
    [commercialBrands, inUseOrganizerIds],
  );
  const myOrganizers = useMemo(() => organizerChoices.filter((c) => c.inUse), [organizerChoices]);
  const otherOrganizers = useMemo(() => organizerChoices.filter((c) => !c.inUse), [organizerChoices]);
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
        : myOrganizers[0]?.id || organizerChoices[0]?.id || '';
    setForm({
      name: '',
      productBrand: '',
      organizerId: preferred,
      unit: unitOptions[0]?.value || 'kg',
      minStock: '',
      costPrice: '',
    });
  }, [isOpen, unitOptions, organizerChoices, myOrganizers, defaultOrganizerId]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!form.organizerId.trim()) {
      toast.error('Elige una categoría');
      return;
    }
    const fields = stockFieldsForOrganizer(form.organizerId);
    setSubmitting(true);
    try {
      await createCatalogItemRequest(userId, {
        name: form.name.trim(),
        category: fields.category,
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
          <Field label="Categoría *">
            <select
              value={form.organizerId}
              onChange={(e) => setForm((f) => ({ ...f, organizerId: e.target.value }))}
              className={inputClass}
            >
              {organizerChoices.length === 0 ? (
                <option value="">Sin categorías</option>
              ) : (
                organizerChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))
              )}
            </select>
          </Field>
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

type StockEntryModalMode = 'pick' | 'new';

function StockEntryPickerModal({
  items,
  userId,
  warehouseId,
  businessType,
  commercialBrands,
  defaultOrganizerId,
  inUseOrganizerIds,
  onClose,
  onSelect,
  onDone,
}: {
  items: CatalogItem[];
  userId: string;
  warehouseId: string;
  businessType: string;
  commercialBrands: InventoryCommercialBrand[];
  defaultOrganizerId?: string | null;
  inUseOrganizerIds?: string[];
  onClose: () => void;
  onSelect: (item: CatalogItem) => void;
  onDone: () => void;
}) {
  useModalClose(true, onClose);
  const { config: verticalConfig } = useVerticalCatalog();
  const unitOptions = verticalConfig.units.length > 0 ? verticalConfig.units : DEFAULT_UNITS;
  const organizerChoices = useMemo(
    () => listInventoryOrganizerChoices(commercialBrands, { inUseOrganizerIds }),
    [commercialBrands, inUseOrganizerIds],
  );
  const myOrganizers = useMemo(() => organizerChoices.filter((c) => c.inUse), [organizerChoices]);
  const [mode, setMode] = useState<StockEntryModalMode>(() => (items.length === 0 ? 'new' : 'pick'));
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newForm, setNewForm] = useState({
    name: '',
    organizerId: '',
    unit: unitOptions[0]?.value || 'kg',
    quantity: '',
    costPrice: '',
    notes: '',
  });

  useEffect(() => {
    const preferred =
      defaultOrganizerId &&
      defaultOrganizerId !== ORGANIZER_TOTAL &&
      defaultOrganizerId !== 'all' &&
      organizerChoices.some((c) => c.id === defaultOrganizerId)
        ? defaultOrganizerId
        : myOrganizers[0]?.id || organizerChoices[0]?.id || '';
    setMode(items.length === 0 ? 'new' : 'pick');
    setQuery('');
    setNewForm({
      name: '',
      organizerId: preferred,
      unit: unitOptions[0]?.value || 'kg',
      quantity: '',
      costPrice: '',
      notes: '',
    });
  }, [items.length, unitOptions, organizerChoices, myOrganizers, defaultOrganizerId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es')).slice(0, 100);
  }, [items, query]);

  const openNewMode = () => {
    const nameFromQuery = query.trim();
    setNewForm((f) => ({
      ...f,
      name: nameFromQuery || f.name,
    }));
    setMode('new');
  };

  const submitNewIngredient = async () => {
    if (!newForm.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!newForm.organizerId.trim()) {
      toast.error('Elige una categoría');
      return;
    }
    const qty = Number(newForm.quantity.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Indica la cantidad que entra en almacén');
      return;
    }
    const fields = stockFieldsForOrganizer(newForm.organizerId);
    setSubmitting(true);
    try {
      const created = await createCatalogItemRequest(userId, {
        name: newForm.name.trim(),
        category: fields.category,
        module: 'stock',
        itemType: 'product',
        vertical: businessType,
        stockCategory: fields.stockCategory,
        isStockItem: true,
        unit: newForm.unit,
        minStock: 0,
        costPrice: Number(newForm.costPrice.replace(',', '.')) || 0,
        stockQuantity: 0,
        active: true,
        available: true,
        webVisible: false,
        customFields: {
          inventoryOrganizerId: newForm.organizerId.trim(),
        },
      });
      await createAdjustmentRequest(userId, {
        catalogItemId: created._id,
        quantity: qty,
        type: 'in',
        warehouseId: warehouseId || undefined,
        notes:
          newForm.notes.trim() ||
          `Alta + entrada: +${qty} ${newForm.unit || 'ud'}`,
      });
      toast.success('Ingrediente creado y entrada registrada');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar la entrada');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Añadir entrada</h3>
          <p className="text-sm text-gray-500 mt-1">
            Registra la llegada de mercancía en un artículo existente o crea un ingrediente nuevo.
          </p>
          <div className="mt-3 flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-900/60 p-1">
            <button
              type="button"
              onClick={() => setMode('pick')}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'pick'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Existente
            </button>
            <button
              type="button"
              onClick={() => openNewMode()}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'new'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Nuevo ingrediente
            </button>
          </div>
        </div>

        {mode === 'pick' ? (
          <>
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <SaasTabSearch value={query} onChange={setQuery} placeholder="Buscar artículo…" className="relative w-full" />
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 min-h-[120px]">
              {filtered.length === 0 ? (
                <li className="px-4 py-8 text-sm text-gray-500 text-center space-y-3">
                  <p>{query.trim() ? 'Ningún artículo coincide.' : 'No hay artículos en el almacén.'}</p>
                  <SaasTabSecondaryButton onClick={openNewMode} className="!min-h-0 px-3 py-1.5 text-xs">
                    <PackagePlus className="w-3.5 h-3.5" />
                    Crear ingrediente nuevo
                  </SaasTabSecondaryButton>
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
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
              <SaasTabSecondaryButton onClick={openNewMode} className="!min-h-0 px-3 py-1.5 text-xs">
                <PackagePlus className="w-3.5 h-3.5" />
                Nuevo ingrediente
              </SaasTabSecondaryButton>
              <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <Field label="Nombre *">
              <input
                autoFocus
                value={newForm.name}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
                placeholder="Ej: Mozzarella, Harina, Aceite…"
              />
            </Field>
            <Field label="Categoría *">
              <select
                value={newForm.organizerId}
                onChange={(e) => setNewForm((f) => ({ ...f, organizerId: e.target.value }))}
                className={inputClass}
              >
                {organizerChoices.length === 0 ? (
                  <option value="">Sin categorías</option>
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
              <Field label="Unidad">
                <select
                  value={newForm.unit}
                  onChange={(e) => setNewForm((f) => ({ ...f, unit: e.target.value }))}
                  className={inputClass}
                >
                  {unitOptions.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad entrada *">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newForm.quantity}
                  onChange={(e) => setNewForm((f) => ({ ...f, quantity: e.target.value }))}
                  className={inputClass}
                  placeholder="0"
                />
              </Field>
            </div>
            <Field label="Coste unitario (opcional)">
              <input
                type="number"
                min="0"
                step="any"
                value={newForm.costPrice}
                onChange={(e) => setNewForm((f) => ({ ...f, costPrice: e.target.value }))}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field label="Notas (opcional)">
              <input
                value={newForm.notes}
                onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
                className={inputClass}
                placeholder="Ej: Albarán Makro 1234"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
              <SaasTabPrimaryButton onClick={() => void submitNewIngredient()} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar entrada'}
              </SaasTabPrimaryButton>
            </div>
          </div>
        )}
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

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
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

      <div className="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
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
  const [showEntryPicker, setShowEntryPicker] = useState(false);
  const [entryItem, setEntryItem] = useState<CatalogItem | null>(null);
  const [localItems, setLocalItems] = useState<CatalogItem[]>([]);
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>([]);
  const [commercialBrands, setCommercialBrands] = useState<InventoryCommercialBrand[]>([]);
  const [productBrands, setProductBrands] = useState<{ id: string; name: string }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncDetail, setSyncDetail] = useState('');
  const autoSyncStartedRef = useRef(false);
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
        setProductBrands([]);
        setStoreIngredients([]);
        return;
      }
      try {
        const brandList = await listBrandsRequest(businessId).catch(() => []);
        if (cancelled) return;
        const commercial = commercialLineBrands(brandList);
        setCommercialBrands(
          brandList.map((b) => ({
            _id: b._id,
            name: b.name,
            deliveryLineKind: b.deliveryLineKind,
          })),
        );
        setProductBrands(
          brandList
            .filter((b) => b.active !== false && !b.deletedAt)
            .map((b) => ({ id: b._id || b.id, name: String(b.name || '').trim() }))
            .filter((b) => b.id && b.name),
        );
        if (dataUserId) {
          const cfg = await getDeliveryConfigRequest(dataUserId).catch(() => null);
          if (cancelled) return;
          const brandIds = commercial.map((b) => b._id);
          setStoreIngredients(
            normalizeStoreIngredients(unifyStoreIngredientsFromConfig(cfg, brandIds)),
          );
        }
      } catch {
        if (!cancelled) {
          setCommercialBrands([]);
          setProductBrands([]);
          setStoreIngredients([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, dataUserId]);

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
    () => buildInventoryOrganizerGroups(scopedItems, storeIngredients, commercialBrands).filter((g) => g.id !== ORGANIZER_TOTAL || g.total > 0),
    [scopedItems, storeIngredients, commercialBrands],
  );

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

  if (loading && scopedItems.length === 0) {
    return <CatalogCoreLoadingState kind="stock" />;
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
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <p className="text-stone-600 dark:text-stone-300 min-w-0">
                Stock de <strong className="text-stone-900 dark:text-white">{storeLabel || 'Almacén'}</strong>
                {' · '}mismo catálogo; cantidades por tienda.
              </p>
              <SaasTabSecondaryButton
                onClick={() => void runInventorySync(false, true)}
                disabled={syncing || !dataUserId || bulkDeleting}
                title="Inventario + escandallo + recetas (puede tardar un minuto)"
                className="shrink-0"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sincronizar
              </SaasTabSecondaryButton>
            </div>
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
              <InventoryWarehouseActionsMenu
                disabled={bulkDeleting || selectMode}
                scanDisabled={!dataUserId || bulkDeleting || selectMode}
                entryDisabled={!dataUserId || bulkDeleting || selectMode}
                onScanInvoice={() => setShowInvoiceOcr(true)}
                onAddArticle={() => setShowAdd(true)}
                onAddEntry={() => setShowEntryPicker(true)}
              />
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
                <InventoryWarehouseActionsMenu
                  disabled={!dataUserId}
                  scanDisabled={!dataUserId}
                  entryDisabled={!dataUserId}
                  onScanInvoice={() => setShowInvoiceOcr(true)}
                  onAddArticle={() => setShowAdd(true)}
                  onAddEntry={() => setShowEntryPicker(true)}
                />
                <SaasTabSecondaryButton onClick={() => void runInventorySync(false, false)} disabled={syncing || !dataUserId}>
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sincronizar ingredientes
                </SaasTabSecondaryButton>
              </div>
            }
          />
        ) : (
          <>
            <div className="px-3 pt-3 pb-2 space-y-2.5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 min-w-0">
                <Tabs
                  tabs={statusTabs}
                  activeTab={statusFilter === 'all' ? '' : statusFilter}
                  onChange={(id) => {
                    setStatusFilter((prev) => (prev === id ? 'all' : (id as StatusFilter)));
                  }}
                />
                <div className="flex items-center gap-1.5 shrink-0">
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
                </div>
              </div>
              {typeGroups.length > 0 ? (
                <InventoryTypeFilterRow
                  groups={typeGroups}
                  activeId={typeFilter}
                  onSelect={(id) => setTypeFilter((prev) => (prev === id ? '' : id))}
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
        productBrands={productBrands}
        defaultOrganizerId={typeFilter}
        inUseOrganizerIds={typeGroups.map((g) => g.id)}
      />

      {showEntryPicker && dataUserId ? (
        <StockEntryPickerModal
          items={scopedItems}
          userId={dataUserId}
          warehouseId={storeWarehouseId}
          businessType={businessType}
          commercialBrands={commercialBrands}
          defaultOrganizerId={typeFilter}
          inUseOrganizerIds={typeGroups.map((g) => g.id)}
          onClose={() => setShowEntryPicker(false)}
          onDone={() => void refreshAll()}
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
          onClose={() => setEntryItem(null)}
          onDone={() => void refreshAll()}
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
