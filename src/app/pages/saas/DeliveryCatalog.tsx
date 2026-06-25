import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { isBrandSetupComplete, isDefaultCommercialBrand, sortBrandsForDisplay } from '../../lib/brandUtils';
import { DELIVERY_MARCA_SETTINGS_PATH } from '../../lib/deliveryActivationGates';
import { isDeliveryBusinessType, notifyDeliveryCatalogChanged, resolveBusinessScopeId } from '../../lib/deliverySetup';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { catalogItemOperatesAtWorkCenter } from '../../lib/pdvScope';
import { filterStockInventoryItems } from '../../lib/stockInventoryScope';
import { DELIVERY_ACTIVE_STORE_CHANGED } from '../../lib/deliveryOpsPdvSelection';
import { listWarehousesRequest, type Warehouse } from '../../lib/warehouseApi';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import { StockTabPanel } from '../../components/saas/StockTabPanel';
import { PurchaseOrdersPage } from './PurchaseOrdersPage';
import { EscandalloPanel } from './CostingPage';
import JSZip from 'jszip';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { listBrandsRequest, createBrandRequest, type Brand } from '../../lib/brandsApi';
import {
  formatUnmatchedCommercialBrandWarning,
  mapImportEntryToCatalogItem,
  normalizeImportCategory,
  readImportLineText,
  resolveBrandIdsFromImportText,
  resolveCatalogImportBrandIds,
  shouldClearBrandForCategory,
  activateCommercialLinesAfterCatalogImport,
  syncStoreIngredientsFromCatalogImport,
  syncTpvOrganizersAfterCatalogImport,
} from '../../lib/deliveryCatalogImport';
import { commercialLineBrands, organizerBrandsForCatalogTemplate } from '../../lib/deliveryCatalogImportLogic';
import {
  DELIVERY_CATALOG_IMPORT_FIELDS,
  DELIVERY_CATALOG_HEADER_ALIASES,
  downloadDeliveryCatalogImportTemplate,
  validateDeliveryCatalogImportEntries,
} from '../../lib/deliveryCatalogExcelTemplate';
import {
  catalogCategorySuggestions,
  defaultCategoryForSingleBrand,
  deliveryBrandLineKindLabel,
  getDeliveryBrandLinePreset,
  DELIVERY_BRAND_LINE_ICON_BOX,
} from '../../lib/deliveryBrandLineKinds';
import {
  listCatalogItemsRequest,
  createCatalogItemRequest,
  updateCatalogItemRequest,
  deleteCatalogItemRequest,
  bulkCreateCatalogItemsRequest,
  listSuppliersRequest,
  createSupplierRequest,
  updateSupplierRequest,
  deleteSupplierRequest,
  listPurchaseInvoicesRequest,
  createPurchaseInvoiceRequest,
  updatePurchaseInvoiceRequest,
  deletePurchaseInvoiceRequest,
  listDeliveryOrdersRequest,
  type CatalogItem,
  type CatalogComboRef,
  type DeliveryOrder,
  type Supplier,
  type PurchaseInvoice,
  type PurchaseInvoiceLine,
} from '../../lib/deliveryApi';
import {
  Plus,
  Search,
  X,
  Trash2,
  Eye,
  Edit3,
  Package,
  Layers,
  Truck,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  BarChart3,
  ArrowUpDown,
  Minus,
  Users,
  Tag,
  Upload,
  Download,
  Loader2,
  ArrowRight,
  ArrowRightLeft,
  Wallet,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { CatalogImportReportPanel } from '../../components/saas/CatalogImportReportPanel';
import {
  catalogImportReportFromBulkErrors,
  catalogImportReportFromValidation,
  catalogImportReportSimple,
  type CatalogImportReport,
  type CatalogImportRunResult,
} from '../../lib/catalogImportReport';
import { CatalogDeleteGuardModal } from '../../components/saas/CatalogDeleteGuardModal';
import { CatalogMoveModal } from '../../components/saas/CatalogMoveModal';
import { useActivationFocus } from '../../hooks/useActivationFocus';
import { ActivationFieldWrap } from '../../components/saas/ActivationGuideUi';
import { StaffConsumptionTabPanel } from '../../components/saas/StaffConsumptionTabPanel';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { createMovementFromInvoice, listFinanceMovements } from '../../lib/financeApi';
import {
  isCustomizableCatalogItem,
  isCatalogTpvConfigurable,
  mergeComboProductIngredients,
  normalizeCatalogSupplementsForSave,
  parseCatalogSupplements,
  parseIngredientsBulkText,
} from '../../lib/catalogCustomization';
import { StoreIngredientsPanel } from '../../components/saas/StoreIngredientsPanel';
import { CatalogItemDetailModal } from '../../components/saas/CatalogItemDetailModal';
import { CatalogComboCompositionEditor } from '../../components/saas/CatalogComboCompositionEditor';
import { COMBO_SLOT_META, DEFAULT_COMBO_STRUCTURE, comboStructureFromCustomFields, isComboStructureConfirmed, resolveComboRefSlotKind, type ComboStructureSlot } from '../../lib/catalogComboSlots';
import { buildCatalogSalesIndex, computeCatalogItemSalesStats } from '../../lib/catalogItemSalesStats';
import { applyCatalogMoveTarget, type CatalogMoveTargetInput } from '../../lib/catalogItemMove';

// ─── Unit options ─────────────────────────────────────────────────────────────

const UNIT_OPTIONS = [
  { value: 'ud', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'g', label: 'Gramo' },
  { value: 'l', label: 'Litro' },
  { value: 'ml', label: 'Mililitro' },
  { value: 'caja', label: 'Caja' },
  { value: 'pack', label: 'Pack' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'm', label: 'Metro' },
];

const INVOICE_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  pending: { label: 'Pendiente', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  paid: { label: 'Pagada', badgeClass: 'bg-green-100 text-green-700 border-green-200' },
  overdue: { label: 'Vencida', badgeClass: 'bg-red-100 text-red-700 border-red-200' },
};

// ─── Create Catalog Item Wizard (7 steps) ────────────────────────────────────

const ALLERGEN_OPTIONS = [
  'Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes', 'Soja',
  'Lácteos', 'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Moluscos', 'Altramuces',
];

const CREATE_STEP_LABELS = ['Marca y producto', 'Precios e inventario', 'Publicación'];

function defaultBrandIdForCatalog(brands: Brand[]): string {
  const sorted = sortBrandsForDisplay(brands.filter((b) => b.active !== false));
  const pick =
    sorted.find((b) => isDefaultCommercialBrand(b)) ??
    sorted[0];
  return pick?._id ?? '';
}

function catalogItemBrandNames(item: CatalogItem, brands: Brand[]): string {
  const ids = Array.isArray(item.brandIds) ? item.brandIds : [];
  if (ids.length === 0) return '';
  return ids
    .map((id) => brands.find((b) => b._id === id)?.name)
    .filter(Boolean)
    .join(', ');
}

function normalizeMediaKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pO7s/0AAAAASUVORK5CYII=';

interface CreateCatalogItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<CatalogItem>) => Promise<void>;
  editItem?: CatalogItem | null;
  brands: Brand[];
  businessId: string;
  onBrandsChange: (brands: Brand[]) => void;
  /** Categorías ya usadas en el catálogo (para sugerencias). */
  catalogCategoriesInUse?: string[];
  /** Catálogo completo (composición de combos). */
  catalogItems?: CatalogItem[];
}

function CreateCatalogItemModal({
  isOpen,
  onClose,
  onCreate,
  editItem,
  brands,
  businessId,
  onBrandsChange,
  catalogCategoriesInUse = [],
  catalogItems = [],
}: CreateCatalogItemModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const createModalWasOpenRef = useRef(false);
  const [comboItems, setComboItems] = useState<CatalogComboRef[]>([]);
  const [comboStructure, setComboStructure] = useState<ComboStructureSlot[]>(DEFAULT_COMBO_STRUCTURE);
  const [comboStructureConfirmed, setComboStructureConfirmed] = useState(false);
  const [form, setForm] = useState({
    itemType: 'product' as CatalogItem['itemType'],
    name: '',
    description: '',
    category: '',
    selectedBrandIds: [] as string[],
    newBrandName: '',
    showNewBrand: false,
    unit: 'ud',
    unitPrice: '',
    staffPrice: '',
    costPrice: '',
    stockQuantity: '',
    minStock: '',
    image: '',
    allergens: [] as string[],
    notes: '',
    webVisible: true,
    available: true,
    ingredients: '',
    supplements: [] as Array<{ id: string; name: string; price: string }>,
    halfHalf: false,
  });

  useEffect(() => {
    if (!isOpen) {
      createModalWasOpenRef.current = false;
      return;
    }

    const justOpened = !createModalWasOpenRef.current;
    createModalWasOpenRef.current = true;

    if (editItem) {
      setComboItems(Array.isArray(editItem.comboItems) ? [...editItem.comboItems] : []);
      const items = Array.isArray(editItem.comboItems) ? editItem.comboItems.length : 0;
      setComboStructure(comboStructureFromCustomFields(editItem.customFields, items));
      setComboStructureConfirmed(isComboStructureConfirmed(editItem.customFields, items));
      setForm({
        itemType: editItem.itemType || 'product',
        name: editItem.name,
        description: editItem.description,
        category: editItem.category,
        selectedBrandIds: Array.isArray(editItem.brandIds) ? [...editItem.brandIds] : [],
        newBrandName: '',
        showNewBrand: false,
        unit: editItem.unit || 'ud',
        unitPrice: String(editItem.unitPrice || ''),
        staffPrice: editItem.staffPrice != null && editItem.staffPrice > 0 ? String(editItem.staffPrice) : '',
        costPrice: String(editItem.costPrice || ''),
        stockQuantity: String(editItem.stockQuantity || ''),
        minStock: String(editItem.minStock || ''),
        image: editItem.image || '',
        allergens: editItem.allergens || [],
        notes: editItem.notes || '',
        webVisible: editItem.webVisible ?? true,
        available: editItem.available ?? true,
        ingredients: typeof editItem.customFields?.ingredients === 'string' ? editItem.customFields.ingredients : '',
        supplements: parseCatalogSupplements(editItem).map((s) => ({
          id: s.id,
          name: s.name,
          price: String(s.price),
        })),
        halfHalf: editItem.customFields?.halfHalf === true,
      });
      setStep(1);
      return;
    }

    if (!justOpened) return;

    setComboItems([]);
    setComboStructure(DEFAULT_COMBO_STRUCTURE.map((s) => ({ ...s })));
    setComboStructureConfirmed(true);
    const defaultId = defaultBrandIdForCatalog(brands);
    setForm({
      itemType: 'product', name: '', description: '', category: '', unit: 'ud',
      selectedBrandIds: defaultId ? [defaultId] : [],
      newBrandName: '',
      showNewBrand: false,
      unitPrice: '', staffPrice: '', costPrice: '', stockQuantity: '', minStock: '',
      image: '', allergens: [], notes: '', webVisible: true, available: true,
      ingredients: '', supplements: [], halfHalf: false,
    });
    setStep(1);
  }, [editItem, isOpen]);

  /** Si las marcas cargan después de abrir el modal, preselecciona la línea comercial por defecto. */
  useEffect(() => {
    if (!isOpen || editItem) return;
    const defaultId = defaultBrandIdForCatalog(brands);
    if (!defaultId) return;
    setForm((f) => (f.selectedBrandIds.length > 0 ? f : { ...f, selectedBrandIds: [defaultId] }));
  }, [isOpen, editItem, brands]);

  const categorySuggestions = useMemo(
    () => catalogCategorySuggestions(brands, form.selectedBrandIds, catalogCategoriesInUse),
    [brands, form.selectedBrandIds, catalogCategoriesInUse],
  );

  useEffect(() => {
    if (!isOpen || editItem) return;
    if (form.selectedBrandIds.length !== 1) return;
    const suggested = defaultCategoryForSingleBrand(brands, form.selectedBrandIds[0]);
    if (!suggested) return;
    setForm((f) => (f.category.trim() ? f : { ...f, category: suggested }));
  }, [isOpen, editItem, form.selectedBrandIds, brands]);

  useModalClose(isOpen, onClose);

  const activeBrands = useMemo(
    () => sortBrandsForDisplay(brands.filter((b) => b.active !== false)),
    [brands],
  );

  if (!isOpen) return null;

  const totalSteps = 3;
  const isEditMode = Boolean(editItem);

  const handleCreateBrand = async () => {
    const name = form.newBrandName.trim();
    if (!name || !businessId) return;
    try {
      const created = await createBrandRequest(businessId, { name, active: true });
      onBrandsChange([...brands, created]);
      setForm((f) => ({
        ...f,
        selectedBrandIds: [...f.selectedBrandIds, created._id],
        newBrandName: '',
        showNewBrand: false,
      }));
      toast.success(`Marca "${created.name}" creada`);
    } catch {
      toast.error('No se pudo crear la marca');
    }
  };

  const toggleBrand = (brandId: string) => {
    setForm((f) => ({
      ...f,
      selectedBrandIds: f.selectedBrandIds.includes(brandId)
        ? f.selectedBrandIds.filter((id) => id !== brandId)
        : [...f.selectedBrandIds, brandId],
    }));
  };

  const handleFinalSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      if (!isEditMode) setStep(1);
      return;
    }
    if (activeBrands.length > 0 && form.selectedBrandIds.length === 0) {
      toast.error('Selecciona la línea comercial (marca) del producto');
      if (!isEditMode) setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const category = normalizeImportCategory(form.category);
      const brandIds =
        shouldClearBrandForCategory(category) && form.selectedBrandIds.length === 0
          ? []
          : [...form.selectedBrandIds];
      const customizable = isCatalogTpvConfigurable(
        {
          category,
          name: form.name,
          brandIds,
          itemType: form.itemType,
          customFields: form.ingredients.trim()
            ? { ingredients: form.ingredients.trim() }
            : editItem?.customFields,
        },
        brands,
      );
      const customFields = {
        ...(editItem?.customFields || {}),
        ...(customizable
          ? {
              ingredients: form.ingredients.trim(),
              supplements: normalizeCatalogSupplementsForSave(form.supplements),
            }
          : {}),
        ...(form.itemType === 'combo' || /combo/i.test(category)
          ? { comboStructure, comboStructureConfirmed }
          : {}),
        ...(form.itemType === 'product' &&
        (form.halfHalf || /mitad\s*y\s*mitad/i.test(form.name.trim()))
          ? { halfHalf: true }
          : form.itemType === 'product'
            ? { halfHalf: false }
            : {}),
      };
      await onCreate({
        ...editItem,
        name: form.name,
        description: form.description,
        category,
        brandIds,
        itemType: form.itemType,
        comboItems: form.itemType === 'combo' || /combo/i.test(category) ? comboItems : [],
        unitPrice: Number(form.unitPrice) || 0,
        staffPrice: form.staffPrice.trim() ? Number(form.staffPrice) : null,
        costPrice: Number(form.costPrice) || 0,
        stockQuantity: form.itemType === 'service' ? 0 : Number(form.stockQuantity) || 0,
        minStock: form.itemType === 'service' ? 0 : Number(form.minStock) || 0,
        unit: form.unit,
        image: form.image,
        allergens: form.allergens,
        notes: form.notes,
        customFields,
        active: editItem?.active ?? true,
        webVisible: form.webVisible,
        available: form.available,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canNext = () => {
    if (step === 1) {
      if (!form.name.trim()) return false;
      if (activeBrands.length > 0 && form.selectedBrandIds.length === 0) return false;
      return true;
    }
    return true;
  };

  const handleGoNext = () => {
    if (step === 1) {
      if (!form.name.trim()) {
        toast.error('Indica el nombre del producto para continuar');
        return;
      }
      if (activeBrands.length > 0 && form.selectedBrandIds.length === 0) {
        toast.error('Selecciona la línea comercial (marca) del producto');
        return;
      }
    }
    if (!canNext()) return;
    setStep((s) => s + 1);
  };

  const renderBrandPicker = () => (
    <div>
      <label className={labelClass}>Marca comercial</label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Misma lógica que en Ajustes → Marca: define la línea de venta y las categorías sugeridas.
      </p>
      {activeBrands.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
          Crea al menos una marca en Ajustes antes de asignar productos.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
          {activeBrands.map((b) => {
            const selected = form.selectedBrandIds.includes(b._id);
            const preset = getDeliveryBrandLinePreset(b.deliveryLineKind);
            const accent = b.primaryColor || preset?.primaryColor || '#6366F1';
            const lineLabel = b.deliveryLineKind ? deliveryBrandLineKindLabel(b.deliveryLineKind) : null;
            return (
              <button
                key={b._id}
                type="button"
                onClick={() => toggleBrand(b._id)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  selected
                    ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-900/50 ring-1 ring-gray-900/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                {b.logo ? (
                  <img src={b.logo} alt="" className="w-10 h-10 rounded-lg object-contain border border-gray-200 dark:border-gray-700 shrink-0" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ background: `linear-gradient(145deg, ${accent}, ${accent}cc)` }}
                  >
                    {b.name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{b.name}</div>
                  {lineLabel ? (
                    <span className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${preset ? DELIVERY_BRAND_LINE_ICON_BOX[preset.id as keyof typeof DELIVERY_BRAND_LINE_ICON_BOX] : 'bg-gray-100 text-gray-600'}`}>
                      {lineLabel}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">Sin tipo de carta</span>
                  )}
                </div>
                {selected ? (
                  <CheckCircle2 className="w-5 h-5 text-gray-900 dark:text-gray-100 shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {form.showNewBrand ? (
        <div className="mt-3 flex gap-2">
          <input
            className={inputClass}
            placeholder="Nombre nueva marca"
            value={form.newBrandName}
            onChange={(e) => setForm((f) => ({ ...f, newBrandName: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleCreateBrand();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleCreateBrand()}
            disabled={!form.newBrandName.trim()}
            className="px-4 py-2.5 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, showNewBrand: false, newBrandName: '' }))}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, showNewBrand: true }))}
          className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:underline inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva marca
        </button>
      )}
    </div>
  );

  const renderCategoryUnit = () => (
    <>
      <div>
        <label className={labelClass}>Categoría</label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {categorySuggestions.map((cat) => {
            const active = normalizeImportCategory(form.category).toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setForm((f) => ({ ...f, category: cat }))}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
        <input
          className={inputClass}
          placeholder="O escribe otra categoría…"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        />
      </div>
      <div>
        <label className={labelClass}>Unidad de medida</label>
        <select className={inputClass} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
          {UNIT_OPTIONS.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
      </div>
    </>
  );

  const renderHalfHalfProductToggle = () => {
    if (form.itemType !== 'product') return null;
    return (
      <button
        type="button"
        onClick={() =>
          setForm((f) => ({
            ...f,
            halfHalf: !f.halfHalf,
            category: f.category || (/pizza/i.test(f.name) ? 'Pizzas' : f.category),
          }))
        }
        className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
          form.halfHalf
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/25'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100">Mitad y mitad (2 sabores)</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              En TPV se eligen 2 pizzas de la carta · un solo precio · badge ½½
            </p>
          </div>
          <div className={`w-11 h-6 rounded-full relative shrink-0 ${form.halfHalf ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.halfHalf ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </div>
      </button>
    );
  };

  const toggleAllergen = (a: string) => {
    setForm(f => ({
      ...f,
      allergens: f.allergens.includes(a) ? f.allergens.filter(x => x !== a) : [...f.allergens, a],
    }));
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  const margin = Number(form.unitPrice) - Number(form.costPrice);
  const marginPct = Number(form.costPrice) > 0 ? ((margin / Number(form.costPrice)) * 100).toFixed(0) : '—';
  const showCustomization = isCatalogTpvConfigurable(
    {
      category: form.category,
      name: form.name,
      brandIds: form.selectedBrandIds,
      itemType: form.itemType,
      customFields: form.ingredients.trim()
        ? { ingredients: form.ingredients.trim() }
        : editItem?.customFields,
    },
    brands,
  );
  const showComboBuilder =
    form.itemType === 'combo' || /combo/i.test(form.category.trim());

  const renderComboBuilderSection = () => {
    if (!showComboBuilder) return null;
    return (
      <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <CatalogComboCompositionEditor
          compact
          comboItems={comboItems}
          catalogItems={catalogItems}
          excludeItemId={editItem?._id}
          comboStructure={comboStructure}
          structureConfirmed={comboStructureConfirmed}
          onStructureChange={setComboStructure}
          onStructureConfirmedChange={setComboStructureConfirmed}
          onChange={setComboItems}
          onImportIngredients={() => {
            const merged = mergeComboProductIngredients(comboItems, catalogItems);
            if (merged.length === 0) {
              toast.error('Los productos seleccionados no tienen ingredientes');
              return;
            }
            setForm((f) => ({ ...f, ingredients: merged.join(', ') }));
            toast.success('Ingredientes importados desde el combo');
          }}
        />
      </section>
    );
  };

  const renderCustomizationSection = () => {
    if (!showCustomization) return null;
    return (
      <section className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Ingredientes TPV (quitar en venta)
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Lo que el cliente puede quitar sin coste. Extras de pago (+) → pestaña Ingredientes TPV del catálogo.
          </p>
        </div>
        <div>
          <label className={labelClass}>Ingredientes incluidos</label>
          <textarea
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder="Tomate, Mozzarella, Albahaca (separados por comas)"
            value={form.ingredients}
            onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass}>Suplementos de pago (solo web)</label>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  supplements: [
                    ...f.supplements,
                    { id: `sup-${Date.now()}`, name: '', price: '' },
                  ],
                }))
              }
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <Plus className="w-3 h-3" />
              Añadir
            </button>
          </div>
          {form.supplements.length === 0 ? (
            <p className="text-xs text-gray-400">Sin suplementos. Ej: Extra queso 1,50€</p>
          ) : (
            <div className="space-y-2">
              {form.supplements.map((row, idx) => (
                <div key={row.id || idx} className="flex gap-2 items-center">
                  <input
                    className={`${inputClass} flex-1`}
                    placeholder="Nombre suplemento"
                    value={row.name}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        supplements: f.supplements.map((s, i) =>
                          i === idx ? { ...s, name: e.target.value } : s,
                        ),
                      }))
                    }
                  />
                  <input
                    type="number"
                    step="0.01"
                    className={`${inputClass} w-24`}
                    placeholder="€"
                    value={row.price}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        supplements: f.supplements.map((s, i) =>
                          i === idx ? { ...s, price: e.target.value } : s,
                        ),
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        supplements: f.supplements.filter((_, i) => i !== idx),
                      }))
                    }
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${
          showComboBuilder ? 'max-w-3xl' : 'max-w-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editItem ? 'Editar artículo' : 'Nuevo artículo'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {editItem
                  ? 'Marca, categoría y precios vinculados a tus líneas comerciales'
                  : `Paso ${step} de ${totalSteps} — ${CREATE_STEP_LABELS[step - 1]}`}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
          {!isEditMode && (
            <>
              {/* Progress bar */}
              <div className="flex gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                      i + 1 <= step ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                    onClick={() => { if (i + 1 <= step) setStep(i + 1); }}
                  />
                ))}
              </div>
            </>
          )}
          {editItem && (
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Producto que estas editando
              </p>
              <div className="mt-1.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                    {form.name || editItem.name || 'Sin nombre'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                    {form.description || editItem.description || 'Sin descripcion'}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {form.category || editItem.category || 'Sin categoria'}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Precio</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{Number(form.unitPrice || 0).toFixed(2)}€</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Stock</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{Number(form.stockQuantity || 0)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Estado</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{form.available ? 'Disponible' : 'No disponible'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step content */}
        <div className="p-6 min-h-[280px]">
          {isEditMode ? (
            <div className="space-y-8">
              <section className="space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Marca y producto</h3>
                {renderBrandPicker()}
                <div>
                  <label className={labelClass}>Tipo de elemento</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'product', label: 'Producto', desc: 'Se vende y puede tener stock' },
                      { value: 'service', label: 'Servicio', desc: 'No descuenta inventario' },
                      { value: 'combo', label: 'Combo', desc: 'Paquete o menú compuesto' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, itemType: option.value as CatalogItem['itemType'] }))}
                        className={`rounded-xl border-2 p-3 text-left transition-colors ${
                          form.itemType === option.value
                            ? 'border-gray-900 dark:border-gray-100 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="text-sm font-bold">{option.label}</div>
                        <div className={`mt-1 text-xs ${form.itemType === option.value ? 'text-white/75 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>{option.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Nombre del producto *</label>
                  <input className={inputClass} placeholder="Ej: Hamburguesa clásica, Coca-Cola 33cl..." value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                {renderHalfHalfProductToggle()}
                <div>
                  <label className={labelClass}>Descripción</label>
                  <textarea rows={3} className={`${inputClass} resize-none`} placeholder="Descripción detallada del producto..." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                {renderCategoryUnit()}
              </section>
              {renderCustomizationSection()}
              {renderComboBuilderSection()}
              <section className="space-y-5 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Precios e inventario</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Precio venta (€)</label>
                    <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Precio empleado (€)</label>
                    <input type="number" step="0.01" className={inputClass} placeholder="Opcional" value={form.staffPrice} onChange={(e) => setForm((f) => ({ ...f, staffPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Precio coste (€)</label>
                    <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} />
                  </div>
                </div>
                {form.itemType !== 'service' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Stock actual</label>
                      <input type="number" className={inputClass} placeholder="0" value={form.stockQuantity} onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelClass}>Stock mínimo (alerta)</label>
                      <input type="number" className={inputClass} placeholder="0" value={form.minStock} onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))} />
                    </div>
                  </div>
                )}
              </section>
              <section className="space-y-5 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Publicación</h3>
                <div>
                  <label className={labelClass}>URL de imagen</label>
                  <input className={inputClass} placeholder="https://ejemplo.com/imagen.jpg" value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Alérgenos</label>
                  <div className="flex flex-wrap gap-2">
                    {ALLERGEN_OPTIONS.map((a) => (
                      <button key={a} type="button" onClick={() => toggleAllergen(a)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${form.allergens.includes(a) ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>{a}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Notas internas</label>
                  <textarea rows={2} className={`${inputClass} resize-none`} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <button type="button" onClick={() => setForm((f) => ({ ...f, webVisible: !f.webVisible }))} className={`w-full p-4 rounded-2xl border-2 text-left ${form.webVisible ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Visible en la web</span>
                    <div className={`w-11 h-6 rounded-full relative ${form.webVisible ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.webVisible ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                </button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, available: !f.available }))} className={`w-full p-4 rounded-2xl border-2 text-left ${form.available ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-red-300 bg-red-50 dark:bg-red-900/20'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{form.available ? 'Disponible' : 'Agotado'}</span>
                    <div className={`w-11 h-6 rounded-full relative ${form.available ? 'bg-blue-500' : 'bg-red-400'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                </button>
              </section>
            </div>
          ) : step === 1 ? (
            <div className="space-y-5">
              {renderBrandPicker()}
              {renderCategoryUnit()}
              <div>
                <label className={labelClass}>Tipo de elemento</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'product', label: 'Producto', desc: 'Se vende y puede tener stock' },
                    { value: 'service', label: 'Servicio', desc: 'No descuenta inventario' },
                    { value: 'combo', label: 'Combo', desc: 'Paquete o menú compuesto' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, itemType: option.value as CatalogItem['itemType'] }))}
                      className={`rounded-xl border-2 p-3 text-left transition-colors ${
                        form.itemType === option.value
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-sm font-bold">{option.label}</div>
                      <div className={`mt-1 text-xs ${form.itemType === option.value ? 'text-white/75 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Nombre del producto *</label>
                <input className={inputClass} placeholder="Ej: Mitad y mitad, Margarita, Coca-Cola 33cl..." value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              {renderHalfHalfProductToggle()}
              <div>
                <label className={labelClass}>Descripción</label>
                <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Opcional: ingredientes, tamaño, etc." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              {renderComboBuilderSection()}
            </div>
          ) : step === 2 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                <DollarSign className="w-6 h-6 text-green-600 shrink-0" />
                <p className="text-sm text-green-800 dark:text-green-300">Precio de venta y coste para calcular el margen del artículo.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Precio venta (€)</label>
                  <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label className={labelClass}>Precio empleado (€)</label>
                  <input type="number" step="0.01" className={inputClass} placeholder="Opcional" value={form.staffPrice} onChange={(e) => setForm((f) => ({ ...f, staffPrice: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Precio coste (€)</label>
                  <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} />
                </div>
              </div>
              {(Number(form.unitPrice) > 0 || Number(form.costPrice) > 0) && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Margen</span>
                    <span className={`font-bold ${margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {margin.toFixed(2)}€ ({marginPct}%)
                    </span>
                  </div>
                </div>
              )}
              {form.itemType !== 'service' && (
                <>
                  <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
                    <Archive className="w-6 h-6 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">Stock inicial y alerta de reposición.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Stock actual</label>
                      <input type="number" className={inputClass} placeholder="0" value={form.stockQuantity} onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelClass}>Stock mínimo (alerta)</label>
                      <input type="number" className={inputClass} placeholder="0" value={form.minStock} onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))} />
                    </div>
                  </div>
                </>
              )}
              {renderCustomizationSection()}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className={labelClass}>URL de imagen</label>
                <input className={inputClass} placeholder="https://ejemplo.com/imagen.jpg" value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} autoFocus />
              </div>
              {form.image ? (
                <div className="flex justify-center">
                  <div className="w-40 h-40 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-900">
                    <img src={form.image} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                </div>
              ) : null}
              <div>
                <label className={labelClass}>Alérgenos</label>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                  {ALLERGEN_OPTIONS.map((a) => (
                    <button key={a} type="button" onClick={() => toggleAllergen(a)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${form.allergens.includes(a) ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>{a}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Notas internas</label>
                <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Solo visible para el equipo" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <button type="button" onClick={() => setForm((f) => ({ ...f, webVisible: !f.webVisible }))} className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${form.webVisible ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-gray-100">Visible en la web</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{form.webVisible ? 'Aparece en la tienda online' : 'Oculto de la tienda'}</p>
                  </div>
                  <div className={`w-11 h-6 rounded-full relative transition-colors ${form.webVisible ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.webVisible ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              </button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, available: !f.available }))} className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${form.available ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-red-300 bg-red-50 dark:bg-red-900/20'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-gray-100">{form.available ? 'Disponible' : 'Agotado'}</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{form.available ? 'Se puede pedir' : 'No se aceptan pedidos'}</p>
                  </div>
                  <div className={`w-11 h-6 rounded-full relative transition-colors ${form.available ? 'bg-blue-500' : 'bg-red-400'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              </button>
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Resumen</h4>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{form.name || 'Sin nombre'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {[form.category, activeBrands.filter((b) => form.selectedBrandIds.includes(b._id)).map((b) => b.name).join(', ')].filter(Boolean).join(' · ')}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">{Number(form.unitPrice || 0).toFixed(2)}€</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          {isEditMode ? (
            <>
              <button type="button" onClick={onClose} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <>
              {step > 1 ? (
                <button type="button" onClick={() => setStep(s => s - 1)} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  Atrás
                </button>
              ) : (
                <button type="button" onClick={onClose} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  Cancelar
                </button>
              )}
              <div className="flex-1" />
              {step < totalSteps ? (
                <button
                  type="button"
                  onClick={handleGoNext}
                  disabled={!canNext()}
                  className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  {submitting ? 'Guardando…' : 'Crear artículo'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create Supplier Modal ────────────────────────────────────────────────────

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<Supplier>) => Promise<void>;
  editItem?: Supplier | null;
}

function CreateSupplierModal({ isOpen, onClose, onCreate, editItem }: CreateSupplierModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    cif: '',
    email: '',
    phone: '',
    address: '',
    contactPerson: '',
    category: '',
    paymentTerms: '',
    notes: '',
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        cif: editItem.cif || '',
        email: editItem.email || '',
        phone: editItem.phone || '',
        address: editItem.address || '',
        contactPerson: editItem.contactPerson || '',
        category: editItem.category || '',
        paymentTerms: editItem.paymentTerms || '',
        notes: editItem.notes || '',
      });
    } else {
      setForm({ name: '', cif: '', email: '', phone: '', address: '', contactPerson: '', category: '', paymentTerms: '', notes: '' });
    }
  }, [editItem, isOpen]);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        ...editItem,
        name: form.name,
        cif: form.cif,
        email: form.email,
        phone: form.phone,
        address: form.address,
        contactPerson: form.contactPerson,
        category: form.category,
        paymentTerms: form.paymentTerms,
        notes: form.notes,
        active: editItem?.active ?? true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar proveedor' : 'Nuevo proveedor'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {editItem ? 'Modifica los datos del proveedor' : 'Registra un nuevo proveedor'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Nombre del proveedor"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">CIF/NIF</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono uppercase"
                placeholder="B12345678"
                value={form.cif}
                onChange={e => setForm(f => ({ ...f, cif: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="proveedor@email.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="600 000 000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Dirección</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="Dirección del proveedor"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Persona de contacto</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Nombre del contacto"
                value={form.contactPerson}
                onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Categoría</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Ej: Alimentación, Limpieza..."
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Condiciones de pago</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="Ej: 30 días, contado..."
              value={form.paymentTerms}
              onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
              placeholder="Notas adicionales..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? 'Guardando…' : editItem ? 'Guardar cambios' : 'Crear proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create Purchase Invoice Modal ────────────────────────────────────────────

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<PurchaseInvoice>) => Promise<void>;
  suppliers: Supplier[];
  editItem?: PurchaseInvoice | null;
}

function CreateInvoiceModal({ isOpen, onClose, onCreate, suppliers, editItem }: CreateInvoiceModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    supplierName: '',
    supplierId: '',
    date: '',
    dueDate: '',
    taxRate: '21',
    notes: '',
  });
  const [lines, setLines] = useState<{ itemName: string; quantity: string; unitPrice: string }[]>([
    { itemName: '', quantity: '', unitPrice: '' },
  ]);

  useEffect(() => {
    if (editItem) {
      setForm({
        supplierName: editItem.supplierName || '',
        supplierId: editItem.supplierId || '',
        date: editItem.date ? editItem.date.slice(0, 10) : '',
        dueDate: editItem.dueDate ? editItem.dueDate.slice(0, 10) : '',
        taxRate: String(editItem.taxRate ?? 21),
        notes: editItem.notes || '',
      });
      setLines(
        editItem.lines.length > 0
          ? editItem.lines.map(l => ({ itemName: l.itemName, quantity: String(l.quantity), unitPrice: String(l.unitPrice) }))
          : [{ itemName: '', quantity: '', unitPrice: '' }],
      );
    } else {
      setForm({ supplierName: '', supplierId: '', date: '', dueDate: '', taxRate: '21', notes: '' });
      setLines([{ itemName: '', quantity: '', unitPrice: '' }]);
    }
  }, [editItem, isOpen]);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const addLine = () => setLines(prev => [...prev, { itemName: '', quantity: '', unitPrice: '' }]);

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: string, value: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const computedLines: PurchaseInvoiceLine[] = lines
    .filter(l => l.itemName.trim())
    .map((l, i) => ({
      id: editItem?.lines[i]?.id || `line-${Date.now()}-${i}`,
      itemName: l.itemName,
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      total: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    }));

  const subtotal = computedLines.reduce((s, l) => s + l.total, 0);
  const taxRate = Number(form.taxRate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find(s => s._id === supplierId);
    setForm(f => ({
      ...f,
      supplierId,
      supplierName: supplier?.name || '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName.trim()) {
      toast.error('Selecciona un proveedor');
      return;
    }
    if (computedLines.length === 0) {
      toast.error('Añade al menos una línea');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        ...editItem,
        supplierName: form.supplierName,
        supplierId: form.supplierId,
        date: form.date || new Date().toISOString().slice(0, 10),
        dueDate: form.dueDate,
        lines: computedLines,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: form.notes,
        status: editItem?.status || 'pending',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar factura' : 'Nueva factura de compra'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {editItem ? 'Modifica los datos de la factura' : 'Registra una nueva factura de proveedor'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Proveedor *</label>
              {suppliers.length > 0 ? (
                <select
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  value={form.supplierId}
                  onChange={e => handleSelectSupplier(e.target.value)}
                >
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.filter(s => s.active).map(s => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Nombre del proveedor"
                  value={form.supplierName}
                  onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">% IVA</label>
              <input
                type="number"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="21"
                value={form.taxRate}
                onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha factura</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha vencimiento</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Invoice lines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas de factura</label>
              <AddButtonDropdown
                label="Nuevo producto"
                onQuickAdd={addLine}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de producto"
              />
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <input
                    className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Artículo"
                    value={line.itemName}
                    onChange={e => updateLine(idx, 'itemName', e.target.value)}
                  />
                  <input
                    type="number"
                    className="w-24 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Cant."
                    value={line.quantity}
                    onChange={e => updateLine(idx, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="w-28 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Precio €"
                    value={line.unitPrice}
                    onChange={e => updateLine(idx, 'unitPrice', e.target.value)}
                  />
                  <div className="w-24 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">
                    {((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toFixed(2)}€
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="p-2 hover:bg-red-100 rounded-lg transition-colors shrink-0"
                    disabled={lines.length <= 1}
                  >
                    <Minus className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-sm space-y-1">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Subtotal</span>
                <span>{subtotal.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>IVA ({taxRate}%)</span>
                <span>{taxAmount.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 pt-1 border-t border-gray-200 dark:border-gray-700">
                <span>Total</span>
                <span>{total.toFixed(2)}€</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
              placeholder="Notas adicionales..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? 'Guardando…' : editItem ? 'Guardar cambios' : 'Crear factura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stock Adjustment Modal ───────────────────────────────────────────────────

interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CatalogItem | null;
  onAdjust: (item: CatalogItem, newQuantity: number) => void;
}

function StockAdjustModal({ isOpen, onClose, item, onAdjust }: StockAdjustModalProps) {
  const [adjustment, setAdjustment] = useState('');

  useEffect(() => { setAdjustment(''); }, [isOpen]);
  useModalClose(isOpen, onClose);

  if (!isOpen || !item) return null;

  const newQty = item.stockQuantity + (Number(adjustment) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Ajustar stock</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
            <span className="text-sm text-gray-600 dark:text-gray-400">Stock actual</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{item.stockQuantity} {item.unit}</span>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Ajuste (positivo para añadir, negativo para restar)
            </label>
            <input
              type="number"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-xl font-bold"
              placeholder="0"
              value={adjustment}
              onChange={e => setAdjustment(e.target.value)}
              autoFocus
            />
          </div>
          <div className={`flex items-center justify-between p-4 rounded-xl ${newQty < item.minStock ? 'bg-red-50 border-2 border-red-200' : 'bg-green-50 border-2 border-green-200'}`}>
            <span className={`text-sm ${newQty < item.minStock ? 'text-red-600' : 'text-green-600'}`}>Nuevo stock</span>
            <span className={`text-2xl font-bold ${newQty < item.minStock ? 'text-red-700' : 'text-green-700'}`}>{newQty} {item.unit}</span>
          </div>
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onAdjust(item, newQty)}
              disabled={!adjustment || Number(adjustment) === 0}
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Aplicar ajuste
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Loading state (progresivo por pasos) ─────────────────────────────────────

const CATALOG_LOAD_STEPS = [
  'Sesión',
  'Datos',
  'Listo',
] as const;

type CatalogLoadPhase = 'session' | 'catalog' | 'suppliers' | 'invoices' | 'pdv';

function CatalogTabLoadingState({ phase }: { phase: CatalogLoadPhase }) {
  const copy: Record<CatalogLoadPhase, { step: number; message: string }> = {
    session: { step: 0, message: 'Preparando tu espacio de trabajo…' },
    pdv: { step: 0, message: 'Comprobando tienda activa…' },
    catalog: { step: 1, message: 'Cargando artículos y almacenes…' },
    suppliers: { step: 1, message: 'Cargando proveedores…' },
    invoices: { step: 1, message: 'Cargando facturas de compra…' },
  };
  const { step, message } = copy[phase];

  return (
    <div className="py-16 flex flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500" aria-hidden />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{message}</p>
      <div className="flex items-center gap-2 mt-1">
        {CATALOG_LOAD_STEPS.map((label, idx) => (
          <span
            key={label}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
              idx < step
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : idx === step
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const TABS_NEED_CATALOG = new Set(['catalog', 'stock', 'staff-consumption']);

/** Orden de secciones en la pestaña Catálogo (delivery / TPV). */
const CATALOG_SECTION_ORDER = [
  'Combos',
  'Pizzas',
  'Top Burgers',
  'Burgers',
  'Hamburguesas',
  'Sides',
  'Complementos',
  'Entrantes',
  'Principales',
  'Bebidas',
  'Postres',
  'Extras',
  'Otros',
];

function sortCatalogSectionKeys(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const fold = (s: string) => s.trim().toLowerCase();
    const ia = CATALOG_SECTION_ORDER.findIndex((o) => fold(o) === fold(a));
    const ib = CATALOG_SECTION_ORDER.findIndex((o) => fold(o) === fold(b));
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b, 'es');
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const CATALOG_TABS = ['catalog', 'stock', 'staff-consumption', 'suppliers', 'purchase-orders', 'invoices', 'ingredientes', 'escandallo'] as const;
  const { user } = useAuth();
  const { currentBusiness, businessesFetchSettled } = useBusiness();
  const activeStore = useActiveStoreScope();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const pageReady = businessesFetchSettled && Boolean(dataUserId);
  const catalogDataReady = pageReady && Boolean(businessId);
  const { config: verticalConfig, businessType } = useVerticalCatalog();
  const itemLabelPlural = verticalConfig.itemLabelPlural || 'Productos';
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const retailStoreCount = useMemo(
    () => activeStore.retailWorkCenters.filter((wc) => wc.active !== false).length,
    [activeStore.retailWorkCenters],
  );
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceFinanceLinks, setInvoiceFinanceLinks] = useState<Set<string>>(new Set());
  const suppliersFetchedRef = useRef(false);
  const invoicesFetchedRef = useRef(false);
  const suppliersLoadStartedRef = useRef(false);
  const invoicesLoadStartedRef = useRef(false);
  const catalogLoadedRef = useRef(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const activeTab = useMemo(() => {
    const raw = searchParams.get('tab') || 'catalog';
    const tab = raw === 'tpv-templates' ? 'ingredientes' : raw;
    return (CATALOG_TABS as readonly string[]).includes(tab) ? tab : 'catalog';
  }, [searchParams]);
  const setActiveTab = useCallback((tab: string) => setSearchParams({ tab }), [setSearchParams]);

  const storeLabel = activeStore.displayLabelForActive || 'Tienda activa';
  const activeWorkCenterId = useMemo(() => {
    const pdv = activeStore.pointsOfSale.find((p) => p._id === activeStore.activeSalesPointId);
    return String(pdv?.workCenterId || activeStore.activeSalesPointId || '').trim();
  }, [activeStore.pointsOfSale, activeStore.activeSalesPointId]);

  const catalogForActiveStore = useMemo(() => {
    if (!activeWorkCenterId) return catalogItems;
    return catalogItems.filter((i) => catalogItemOperatesAtWorkCenter(i, brands, activeWorkCenterId));
  }, [catalogItems, brands, activeWorkCenterId]);

  const storeWarehouseId = useMemo(() => {
    const activeWh = warehouses.filter((w) => w.active);
    const label = storeLabel.toLowerCase();
    const byName = activeWh.find((w) => label && w.name.toLowerCase().includes(label.split(/\s+/)[0] || ''));
    return byName?._id || activeWh.find((w) => w.isDefault)?._id || activeWh[0]?._id || '';
  }, [warehouses, storeLabel]);

  // Catalog state
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [searchCatalog, setSearchCatalog] = useState('');
  /** Categorías desplegadas por el usuario; vacío = todas cerradas al cargar. */
  const [catalogSectionsOpen, setCatalogSectionsOpen] = useState<Set<string>>(() => new Set());
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(new Set());
  const [bulkDeletingCatalog, setBulkDeletingCatalog] = useState(false);
  const [bulkMovingCatalog, setBulkMovingCatalog] = useState(false);
  const [catalogMoveItems, setCatalogMoveItems] = useState<CatalogItem[] | null>(null);
  type CatalogDeleteOp =
    | null
    | { mode: 'single'; item: CatalogItem }
    | { mode: 'bulk'; items: CatalogItem[] };
  const [catalogDeleteGuard, setCatalogDeleteGuard] = useState<CatalogDeleteOp>(null);
  const catalogDeleteOpRef = useRef<CatalogDeleteOp>(null);
  useEffect(() => {
    catalogDeleteOpRef.current = catalogDeleteGuard;
  }, [catalogDeleteGuard]);
  const [catalogSelectMode, setCatalogSelectMode] = useState(false);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirmStep, setBulkDeleteConfirmStep] = useState(false);

  // Stock state
  const [stockAdjustItem, setStockAdjustItem] = useState<CatalogItem | null>(null);

  // Supplier state
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Invoice state
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [catalogImportReport, setCatalogImportReport] = useState<CatalogImportReport | null>(null);
  const [imageZipMap, setImageZipMap] = useState<Record<string, string>>({});
  const [loadingImageZip, setLoadingImageZip] = useState(false);
  const { focus: activationFocus, clearFocus: clearActivationFocus } = useActivationFocus();

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'itemType', label: 'Tipo (product/service/combo)' },
    { key: 'category', label: 'Categoría (bebidas, complementos…)' },
    { key: 'marca', label: 'Línea comercial (nombre en Ajustes → Marca)' },
    { key: 'price', label: 'Precio' },
    { key: 'description', label: 'Descripción' },
    { key: 'allergens', label: 'Alérgenos' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = DELIVERY_CATALOG_IMPORT_FIELDS;

  const commercialLines = useMemo(
    () => sortBrandsForDisplay(commercialLineBrands(brands)),
    [brands],
  );

  const templateOrganizerLines = useMemo(
    () => organizerBrandsForCatalogTemplate(brands),
    [brands],
  );

  const handleDownloadCatalogTemplate = useCallback(() => {
    downloadDeliveryCatalogImportTemplate(templateOrganizerLines);
    toast.success('Plantilla catálogo');
  }, [templateOrganizerLines]);

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!dataUserId) return;
    let brandCache = [...brands];
    const unmatchedCommercialBrands: string[] = [];
    const items: Partial<CatalogItem>[] = [];
    for (const entry of entries) {
      const mapped = await mapImportEntryToCatalogItem(entry as Record<string, string>, {
        businessId: businessId || '',
        brandCache,
      });
      if (!mapped) continue;
      brandCache = mapped.brandCache;
      unmatchedCommercialBrands.push(...mapped.unmatchedLineNames);
      items.push(mapped.item);
    }
    const brandImportWarn = formatUnmatchedCommercialBrandWarning(unmatchedCommercialBrands);
    if (brandImportWarn) toast.warning(brandImportWarn, { duration: 14000 });
    if (items.length === 0) {
      toast.error('No hay productos válidos para importar');
      return;
    }
    const result = await bulkCreateCatalogItemsRequest(dataUserId, items as Partial<CatalogItem>[]);
    if (result.created > 0) {
      if (businessId) {
        const sync = await syncTpvOrganizersAfterCatalogImport(businessId, items);
        const activation = await activateCommercialLinesAfterCatalogImport(businessId, items);
        if (sync.updatedBrands > 0 || activation.activated > 0) await loadBrands();
      }
      await loadCatalog();
      notifyDeliveryCatalogChanged(dataUserId, businessId);
      toast.success(`${result.created} producto(s) importado(s) con IA · TPV actualizado`);
    }
    if (result.errors > 0) {
      const firstError = result.errorDetails?.[0];
      toast.error(
        firstError
          ? `${result.errors} producto(s) no se pudieron importar. Ej: ${firstError.name || 'sin nombre'} -> ${firstError.error}`
          : `${result.errors} producto(s) no se pudieron importar`,
      );
    }
  };

  const handleImportEntries = async (entries: Record<string, string>[]): Promise<CatalogImportRunResult> => {
    const finish = (result: CatalogImportRunResult): CatalogImportRunResult => {
      if (result.report) setCatalogImportReport(result.report);
      return result;
    };

    if (!dataUserId) return finish({ count: 0, report: null });

    const productRows = entries.filter((entry) => {
      const name = String(entry.name || '').trim();
      if (!name) return false;
      if (/^ejemplo\s*[·\-–—]/i.test(name)) return false;
      return true;
    });

    if (productRows.length === 0) {
      const report = catalogImportReportSimple(
        'No hay productos para importar',
        [{ message: 'Borra las filas de ejemplo o revisa que nombre y precio estén rellenos.' }],
      );
      toast.error(report.summary);
      return finish({ count: 0, report });
    }

    const validation = validateDeliveryCatalogImportEntries(productRows, brands);
    if (!validation.ok) {
      const report = catalogImportReportFromValidation(validation);
      toast.error('Revisa la plantilla antes de importar');
      return finish({ count: 0, report });
    }
    const warnings = validation.issues.filter((i) => i.severity === 'warning');
    const warningLines = warnings.map((w) => ({
      row: w.row,
      field: w.field,
      message: w.message,
    }));

    const zipProvided = Object.keys(imageZipMap).length > 0;
    const unmatchedImageRefs: string[] = [];
    let brandCache = [...brands];
    const unmatchedCommercialBrands: string[] = [];
    const items: Partial<CatalogItem>[] = [];

    for (let index = 0; index < productRows.length; index += 1) {
      const entry = productRows[index];
      const mapped = await mapImportEntryToCatalogItem(entry, {
        businessId: businessId || '',
        brandCache,
      });
      if (!mapped) continue;
      brandCache = mapped.brandCache;
      unmatchedCommercialBrands.push(...mapped.unmatchedLineNames);

      const name = mapped.item.name || '';
      const sku = String(entry.sku || '').trim();
      const imageFromZip =
        imageZipMap[normalizeMediaKey(sku)] ||
        imageZipMap[normalizeMediaKey(name)] ||
        '';
      const image = String(entry.image || '').trim() || imageFromZip;
      if (zipProvided && !image) unmatchedImageRefs.push(sku || name || `fila ${index + 2}`);

      items.push({ ...mapped.item, image, sku: sku || mapped.item.sku });
    }

    const brandImportWarn = formatUnmatchedCommercialBrandWarning(unmatchedCommercialBrands);
    if (brandImportWarn) toast.warning(brandImportWarn, { duration: 14000 });

    if (items.length === 0) {
      const report = catalogImportReportSimple('No hay productos válidos para importar');
      toast.error(report.summary);
      return finish({ count: 0, report });
    }
    if (zipProvided && unmatchedImageRefs.length > 0) {
      const sample = unmatchedImageRefs.slice(0, 6).join(', ');
      toast.warning(`ZIP: ${unmatchedImageRefs.length} producto(s) sin imagen coincidente. Se importarán igual. Ej: ${sample}`);
    }
    let result = await bulkCreateCatalogItemsRequest(dataUserId, items);
    const suspiciousSingleCreate = items.length > 1 && result.created <= 1 && result.errors >= items.length - 1;
    if (suspiciousSingleCreate) {
      let recovered = 0;
      let recoveredErrors = 0;
      for (const item of items) {
        try {
          await createCatalogItemRequest(dataUserId, item);
          recovered += 1;
        } catch (error) {
          recoveredErrors += 1;
          const message = error instanceof Error ? error.message : '';
          if (!message.toLowerCase().includes('ya existe')) {
            console.warn('Import recovery failed for item', item?.name, message);
          }
        }
      }
      result = {
        ...result,
        created: recovered,
        errors: recoveredErrors,
      };
      toast.warning('Detectado fallo en bulk; se aplicó importación por ítem para recuperar el lote.');
    }
    const totalOk = (result.created || 0) + (result.updated ?? 0);
    if (totalOk > 0) {
      if (businessId) {
        const sync = await syncTpvOrganizersAfterCatalogImport(businessId, items);
        const activation = await activateCommercialLinesAfterCatalogImport(businessId, items);
        if (sync.updatedBrands > 0 || activation.activated > 0) await loadBrands();
      }
      const withIngredients = items.filter((i) => String(i.customFields?.ingredients || '').trim()).length;
      if (withIngredients > 0 && businessId) {
        const ingSync = await syncStoreIngredientsFromCatalogImport(dataUserId, businessId, items);
        if (ingSync.added > 0 || ingSync.promoted > 0) {
          const parts = [];
          if (ingSync.added > 0) parts.push(`${ingSync.added} nuevo(s)`);
          if (ingSync.promoted > 0) parts.push(`${ingSync.promoted} como extra de pago`);
          toast.message(`Ingredientes TPV: ${parts.join(' · ')}. Revisa el precio del extra si hace falta.`, {
            duration: 8000,
          });
        }
      }
      await loadCatalog();
      notifyDeliveryCatalogChanged(dataUserId, businessId);
      const importedWithImage = items.filter((i) => Boolean(i.image)).length;
      const parts = [];
      if (result.created > 0) parts.push(`${result.created} nuevo(s)`);
      if ((result.updated ?? 0) > 0) parts.push(`${result.updated} actualizado(s) con ingredientes`);
      toast.success(
        `${parts.join(' · ')}` +
          (importedWithImage > 0 ? ` · ${importedWithImage} con imagen` : '') +
          (withIngredients > 0 ? ` · ${withIngredients} fila(s) con ingredientes en Excel` : ''),
      );
    }

    const bulkReport = catalogImportReportFromBulkErrors(
      result.errorDetails,
      result.created,
      result.updated ?? 0,
    );
    const successReport: CatalogImportReport = {
      at: Date.now(),
      summary:
        totalOk > 0
          ? warningLines.length > 0
            ? `Importación completada con ${warningLines.length} aviso(s)`
            : 'Importación completada'
          : result.errors > 0
            ? `${result.errors} producto(s) no se importaron`
            : 'Importación sin cambios',
      errors: bulkReport?.errors ?? [],
      warnings: warningLines,
      created: result.created,
      updated: result.updated ?? 0,
      failed: result.errors,
    };

    if (result.errors > 0 && totalOk === 0) {
      toast.error(successReport.summary);
    } else if (result.errors > 0) {
      toast.warning(`${result.errors} producto(s) no se importaron`);
    }

    return finish({ count: totalOk, report: successReport });
  };

  const handleZipFileSelected = useCallback(async (file: File | null) => {
    if (!file) return;
    setLoadingImageZip(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const map: Record<string, string> = {};
      const entries = Object.values(zip.files).filter((entry) => {
        if (entry.dir) return false;
        const lower = entry.name.toLowerCase();
        return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
      });
      for (const entry of entries) {
        const blob = await entry.async('blob');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const filename = entry.name.split('/').pop() || entry.name;
        const basename = filename.replace(/\.[^.]+$/, '');
        const key = normalizeMediaKey(basename);
        if (key) map[key] = dataUrl;
      }
      setImageZipMap(map);
      toast.success(`ZIP cargado: ${Object.keys(map).length} imagen(es) lista(s) para mapear por nombre/SKU`);
    } catch {
      toast.error('No se pudo leer el ZIP de imágenes');
    } finally {
      setLoadingImageZip(false);
    }
  }, []);

  const handleDownloadSampleZip = useCallback(async () => {
    try {
      const zip = new JSZip();
      zip.file('SKU-001.png', SAMPLE_PNG_BASE64, { base64: true });
      zip.file('SKU-002.png', SAMPLE_PNG_BASE64, { base64: true });
      zip.file(
        'LEEME.txt',
        [
          'Ejemplo de ZIP de imagenes para Delivery Catalogo',
          '',
          '1) Nombra cada foto por SKU (recomendado) o por nombre del producto.',
          '2) Formatos soportados: .jpg, .jpeg, .png, .webp',
          '3) Usa los mismos valores que en las columnas sku o name del Excel.',
        ].join('\n'),
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ejemplo_zip_delivery_catalogo.zip';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('ZIP de ejemplo descargado');
    } catch {
      toast.error('No se pudo generar el ZIP de ejemplo');
    }
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadBrands = useCallback(async () => {
    if (!businessId) {
      setBrands([]);
      setBrandsLoading(false);
      return;
    }
    setBrandsLoading(true);
    try {
      setBrands(await listBrandsRequest(businessId));
    } catch {
      setBrands([]);
    } finally {
      setBrandsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!businessesFetchSettled) return;
    void loadBrands();
  }, [businessesFetchSettled, businessId, loadBrands]);

  const loadCatalog = useCallback(async () => {
    if (!dataUserId) return;
    try {
      const [items, wh] = await Promise.all([
        listCatalogItemsRequest(dataUserId),
        listWarehousesRequest(dataUserId).catch(() => [] as Warehouse[]),
      ]);
      setCatalogItems(items);
      setWarehouses(wh);
    } catch {
      toast.error('Error al cargar el catálogo');
    }
  }, [dataUserId]);

  const loadSuppliers = useCallback(async () => {
    if (!dataUserId) return;
    setSuppliersLoading(true);
    try {
      const data = await listSuppliersRequest(dataUserId);
      setSuppliers(data);
      suppliersFetchedRef.current = true;
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setSuppliersLoading(false);
    }
  }, [dataUserId]);

  const loadInvoices = useCallback(async () => {
    if (!dataUserId) return;
    setInvoicesLoading(true);
    try {
      const data = await listPurchaseInvoicesRequest(dataUserId);
      setInvoices(data);
      invoicesFetchedRef.current = true;
    } catch {
      toast.error('Error al cargar facturas');
    } finally {
      setInvoicesLoading(false);
    }
  }, [dataUserId]);

  const loadInvoiceFinanceLinks = useCallback(async () => {
    if (!dataUserId) return;
    try {
      const movements = await listFinanceMovements(dataUserId);
      const linked = new Set(
        movements
          .filter((m) => m.source === 'invoice' && m.sourceRef)
          .map((m) => String(m.sourceRef)),
      );
      setInvoiceFinanceLinks(linked);
    } catch {
      // no bloquea la pestaña de facturas
    }
  }, [dataUserId]);

  useEffect(() => {
    if (activeTab === 'invoices' && dataUserId) {
      void loadInvoiceFinanceLinks();
    }
  }, [activeTab, dataUserId, loadInvoiceFinanceLinks]);

  useEffect(() => {
    catalogLoadedRef.current = false;
    suppliersFetchedRef.current = false;
    invoicesFetchedRef.current = false;
    suppliersLoadStartedRef.current = false;
    invoicesLoadStartedRef.current = false;
    setCatalogItems([]);
    setSuppliers([]);
    setInvoices([]);
    setInvoiceFinanceLinks(new Set());
    setWarehouses([]);
    setLoading(false);
  }, [businessId, dataUserId]);

  useEffect(() => {
    if (!catalogDataReady) return;
    if (!TABS_NEED_CATALOG.has(activeTab)) return;
    if (catalogLoadedRef.current) return;

    let cancelled = false;
    setLoading(true);
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      toast.error('La carga está tardando mucho. Comprueba la conexión e inténtalo de nuevo.');
    }, 25_000);

    void loadCatalog().finally(() => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      catalogLoadedRef.current = true;
      setLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [catalogDataReady, activeTab, dataUserId, loadCatalog]);

  useEffect(() => {
    const onStoreChange = () => { void loadCatalog(); };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStoreChange);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStoreChange);
  }, [loadCatalog]);

  useEffect(() => {
    if (activeTab !== 'suppliers' && activeTab !== 'invoices') return;
    if (suppliersFetchedRef.current || suppliersLoadStartedRef.current) return;
    suppliersLoadStartedRef.current = true;
    void loadSuppliers();
  }, [activeTab, loadSuppliers]);

  useEffect(() => {
    if (activeTab !== 'invoices') return;
    if (invoicesFetchedRef.current || invoicesLoadStartedRef.current) return;
    invoicesLoadStartedRef.current = true;
    void loadInvoices();
  }, [activeTab, loadInvoices]);

  const loadDeliveryOrders = useCallback(async () => {
    if (!dataUserId) return;
    setOrdersLoading(true);
    try {
      const orders = await listDeliveryOrdersRequest(dataUserId);
      setDeliveryOrders(orders);
    } catch {
      setDeliveryOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [dataUserId]);

  useEffect(() => {
    if (activeTab !== 'catalog' || !dataUserId) return;
    void loadDeliveryOrders();
  }, [activeTab, dataUserId, loadDeliveryOrders]);

  const catalogSalesIndex = useMemo(
    () => buildCatalogSalesIndex(catalogForActiveStore, deliveryOrders),
    [catalogForActiveStore, deliveryOrders],
  );

  // ── CRUD: Catalog Items ─────────────────────────────────────────────────────

  const handleCreateItem = async (data: Partial<CatalogItem>) => {
    if (!dataUserId) {
      toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.');
      return;
    }
    const payload: Partial<CatalogItem> = {
      ...data,
      module: 'catalog',
      ...(isDelivery
        ? { vertical: 'delivery', business_id: businessId || undefined }
        : {}),
    };
    try {
      if (editingItem) {
        const updated = await updateCatalogItemRequest(dataUserId, { ...editingItem, ...payload } as CatalogItem);
        setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
        setDetailItem((prev) => (prev?._id === updated._id ? updated : prev));
        toast.success('Artículo actualizado');
      } else {
        const created = await createCatalogItemRequest(dataUserId, payload as CatalogItem);
        setCatalogItems(prev => [created, ...prev]);
        toast.success('Artículo creado');
        if (isDelivery && businessId && (created.brandIds?.length ?? 0) > 0) {
          void syncTpvOrganizersAfterCatalogImport(businessId, [created]).catch(() => null);
        }
      }
      setShowCreateItem(false);
      setEditingItem(null);
      notifyDeliveryCatalogChanged(dataUserId, businessId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el artículo');
    }
  };

  const handleDeleteItem = (item: CatalogItem) => {
    if (!dataUserId) return;
    if (bulkDeletingCatalog || deletingItemIds.has(item._id)) return;
    setCatalogDeleteGuard({ mode: 'single', item });
  };

  const exitCatalogSelectMode = useCallback(() => {
    setCatalogSelectMode(false);
    setBulkDeleteConfirmStep(false);
    setSelectedCatalogIds(new Set());
  }, []);

  const toggleCatalogItemSelected = useCallback((itemId: string) => {
    setBulkDeleteConfirmStep(false);
    setSelectedCatalogIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const handleBulkDeleteSelected = () => {
    if (!dataUserId || bulkDeletingCatalog || bulkMovingCatalog) return;
    const items = filteredCatalog.filter((item) => selectedCatalogIds.has(item._id));
    if (items.length === 0) {
      toast.error('Selecciona al menos un artículo');
      return;
    }
    if (!bulkDeleteConfirmStep) {
      setBulkDeleteConfirmStep(true);
      return;
    }
    setCatalogDeleteGuard({ mode: 'bulk', items });
    setBulkDeleteConfirmStep(false);
  };

  const handleDeleteAllFilteredCatalog = () => {
    if (!dataUserId || bulkDeletingCatalog || bulkMovingCatalog || filteredCatalog.length === 0) return;
    setCatalogSelectMode(true);
    setSelectedCatalogIds(new Set(filteredCatalog.map((item) => item._id)));
    setBulkDeleteConfirmStep(true);
    toast.warning(
      searchCatalog.trim()
        ? `${filteredCatalog.length} producto(s) visibles seleccionados. Pulsa «Estoy seguro» y confirma el borrado.`
        : `${filteredCatalog.length} producto(s) seleccionados. Pulsa «Estoy seguro» y confirma el borrado.`,
      { duration: 8000 },
    );
  };

  const executeCatalogDeleteAfterGuard = useCallback(async () => {
    const op = catalogDeleteOpRef.current;
    setCatalogDeleteGuard(null);
    if (!dataUserId || !op) return;

    if (op.mode === 'single') {
      const item = op.item;
      setDeletingItemIds((prev) => new Set(prev).add(item._id));
      try {
        await deleteCatalogItemRequest(dataUserId, item._id);
        setCatalogItems((prev) => prev.filter((i) => i._id !== item._id));
        notifyDeliveryCatalogChanged(dataUserId, businessId);
        toast.success('Artículo eliminado');
      } catch {
        toast.error('Error al eliminar el artículo');
      } finally {
        setDeletingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(item._id);
          return next;
        });
      }
      return;
    }

    const list = op.items;
    setBulkDeletingCatalog(true);
    let deleted = 0;
    let failed = 0;
    try {
      for (const item of list) {
        try {
          await deleteCatalogItemRequest(dataUserId, item._id);
          deleted += 1;
        } catch {
          failed += 1;
        }
      }
      await loadCatalog();
      notifyDeliveryCatalogChanged(dataUserId, businessId);
      if (deleted > 0) toast.success(`${deleted} artículo(s) eliminado(s)`);
      if (failed > 0) toast.error(`${failed} artículo(s) no se pudieron eliminar`);
    } finally {
      setBulkDeletingCatalog(false);
      exitCatalogSelectMode();
    }
  }, [dataUserId, loadCatalog, exitCatalogSelectMode, businessId]);

  const handleToggleField = async (item: CatalogItem, field: 'webVisible' | 'available' | 'active') => {
    if (!dataUserId) return;
    try {
      const updated = await updateCatalogItemRequest(dataUserId, { ...item, [field]: !item[field] });
      setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
      setDetailItem((prev) => (prev?._id === updated._id ? updated : prev));
      notifyDeliveryCatalogChanged(dataUserId, businessId);
      const labels: Record<string, [string, string]> = {
        webVisible: ['visible en web', 'oculto de la web'],
        available: ['disponible', 'no disponible'],
        active: ['activo', 'inactivo'],
      };
      const [on, off] = labels[field];
      toast.success(`"${item.name}" marcado como ${!item[field] ? on : off}`);
    } catch {
      toast.error('Error al actualizar el artículo');
    }
  };

  const handleSaveDetailTpvConfig = async (payload: {
    ingredients: string;
    comboItems: CatalogComboRef[];
    comboStructure?: ComboStructureSlot[];
    comboStructureConfirmed?: boolean;
  }) => {
    if (!dataUserId || !detailItem) throw new Error('missing item');
    const category = String(detailItem.category || '');
    const updated = await updateCatalogItemRequest(dataUserId, {
      ...detailItem,
      itemType:
        detailItem.itemType === 'combo' || /combo/i.test(category)
          ? detailItem.itemType || 'combo'
          : detailItem.itemType,
      comboItems:
        detailItem.itemType === 'combo' || /combo/i.test(category) ? payload.comboItems : detailItem.comboItems,
      customFields: {
        ...(detailItem.customFields || {}),
        ingredients: payload.ingredients,
        ...(payload.comboStructure ? { comboStructure: payload.comboStructure } : {}),
        ...(payload.comboStructureConfirmed !== undefined
          ? { comboStructureConfirmed: payload.comboStructureConfirmed }
          : {}),
      },
    });
    setCatalogItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
    setDetailItem(updated);
    notifyDeliveryCatalogChanged(dataUserId, businessId);
  };

  const handleStockAdjust = async (item: CatalogItem, newQuantity: number) => {
    if (!dataUserId) return;
    try {
      const updated = await updateCatalogItemRequest(dataUserId, { ...item, stockQuantity: newQuantity });
      setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
      setStockAdjustItem(null);
      toast.success(`Stock de "${item.name}" actualizado a ${newQuantity}`);
    } catch {
      toast.error('Error al ajustar el stock');
    }
  };

  // ── CRUD: Suppliers ─────────────────────────────────────────────────────────

  const handleCreateSupplier = async (data: Partial<Supplier>) => {
    if (!user?.id) { toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.'); return; }
    try {
      if (editingSupplier) {
        const updated = await updateSupplierRequest(user.id, { ...editingSupplier, ...data } as Supplier);
        setSuppliers(prev => prev.map(s => s._id === updated._id ? updated : s));
        toast.success('Proveedor actualizado');
      } else {
        const created = await createSupplierRequest(user.id, data);
        setSuppliers(prev => [created, ...prev]);
        toast.success('Proveedor creado');
      }
      setShowCreateSupplier(false);
      setEditingSupplier(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el proveedor');
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar "${supplier.name}"?`)) return;
    try {
      await deleteSupplierRequest(user.id, supplier._id);
      setSuppliers(prev => prev.filter(s => s._id !== supplier._id));
      toast.success('Proveedor eliminado');
    } catch {
      toast.error('Error al eliminar el proveedor');
    }
  };

  // ── CRUD: Invoices ──────────────────────────────────────────────────────────

  const handleCreateInvoice = async (data: Partial<PurchaseInvoice>) => {
    if (!dataUserId) { toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.'); return; }
    try {
      if (editingInvoice) {
        const updated = await updatePurchaseInvoiceRequest(dataUserId, { ...editingInvoice, ...data } as PurchaseInvoice);
        setInvoices(prev => prev.map(i => i._id === updated._id ? updated : i));
        toast.success('Factura actualizada');
      } else {
        const created = await createPurchaseInvoiceRequest(dataUserId, data);
        setInvoices(prev => [created, ...prev]);
        toast.success('Factura creada');
      }
      setShowCreateInvoice(false);
      setEditingInvoice(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar la factura');
    }
  };

  const handleDeleteInvoice = async (invoice: PurchaseInvoice) => {
    if (!dataUserId) return;
    if (!confirm(`¿Eliminar factura ${invoice.invoiceNumber}?`)) return;
    try {
      await deletePurchaseInvoiceRequest(dataUserId, invoice._id);
      setInvoices(prev => prev.filter(i => i._id !== invoice._id));
      toast.success('Factura eliminada');
    } catch {
      toast.error('Error al eliminar la factura');
    }
  };

  const handleToggleInvoiceStatus = async (invoice: PurchaseInvoice) => {
    if (!dataUserId) return;
    const newStatus = invoice.status === 'paid' ? 'pending' : 'paid';
    try {
      const updated = await updatePurchaseInvoiceRequest(dataUserId, {
        ...invoice,
        status: newStatus,
        paidAt: newStatus === 'paid' ? new Date().toISOString() : '',
      });
      setInvoices(prev => prev.map(i => i._id === updated._id ? updated : i));
      toast.success(`Factura marcada como ${INVOICE_STATUS_CONFIG[newStatus].label.toLowerCase()}`);
    } catch {
      toast.error('Error al actualizar la factura');
    }
  };

  const handleLinkInvoiceToFinance = async (invoice: PurchaseInvoice) => {
    if (!dataUserId) return;
    try {
      await createMovementFromInvoice(dataUserId, invoice._id, 'purchase_invoice');
      setInvoiceFinanceLinks((prev) => new Set(prev).add(invoice._id));
      toast.success('Gasto registrado en finanzas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar en finanzas');
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    return [...new Set(catalogItems.map(i => i.category).filter(Boolean))].sort();
  }, [catalogItems]);

  const openNewCatalogItemManual = useCallback(() => {
    setEditingItem(null);
    setShowCreateItem(true);
  }, []);

  useEffect(() => {
    if (!activationFocus) return;
    if (activationFocus === 'catalog-add') {
      openNewCatalogItemManual();
      clearActivationFocus();
    } else if (activationFocus === 'catalog-import') {
      setShowImportModal(true);
      clearActivationFocus();
    }
  }, [activationFocus, openNewCatalogItemManual, clearActivationFocus]);

  const filteredCatalog = useMemo(() => {
    return catalogItems.filter((item) => {
      if (!searchCatalog) return true;
      const q = searchCatalog.toLowerCase();
      const brandNames = catalogItemBrandNames(item, brands).toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        brandNames.includes(q)
      );
    });
  }, [catalogItems, searchCatalog, brands]);

  const catalogGroupedByCategory = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of filteredCatalog) {
      const cat = String(item.category || '').trim() || 'Sin categoría';
      const list = map.get(cat) || [];
      list.push(item);
      map.set(cat, list);
    }
    return sortCatalogSectionKeys([...map.keys()]).map((category) => ({
      category,
      items: map.get(category) || [],
    }));
  }, [filteredCatalog]);

  const toggleCatalogSection = useCallback((category: string) => {
    setCatalogSectionsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const selectedCatalogCount = useMemo(
    () => filteredCatalog.filter((item) => selectedCatalogIds.has(item._id)).length,
    [filteredCatalog, selectedCatalogIds],
  );

  const allFilteredCatalogSelected = useMemo(
    () => filteredCatalog.length > 0 && filteredCatalog.every((item) => selectedCatalogIds.has(item._id)),
    [filteredCatalog, selectedCatalogIds],
  );

  const toggleSelectAllFilteredCatalog = useCallback(() => {
    setBulkDeleteConfirmStep(false);
    setSelectedCatalogIds((prev) => {
      const next = new Set(prev);
      if (allFilteredCatalogSelected) {
        filteredCatalog.forEach((item) => next.delete(item._id));
      } else {
        filteredCatalog.forEach((item) => next.add(item._id));
      }
      return next;
    });
  }, [allFilteredCatalogSelected, filteredCatalog]);

  useEffect(() => {
    setBulkDeleteConfirmStep(false);
  }, [searchCatalog]);

  const openCatalogMoveModal = useCallback(
    (items?: CatalogItem[]) => {
      const list =
        items ??
        filteredCatalog.filter((item) => selectedCatalogIds.has(item._id));
      if (list.length === 0) {
        toast.error('Selecciona al menos un artículo');
        return;
      }
      setCatalogMoveItems(list);
    },
    [filteredCatalog, selectedCatalogIds],
  );

  const handleConfirmCatalogMove = useCallback(
    async (target: CatalogMoveTargetInput) => {
      if (!dataUserId || !catalogMoveItems?.length) return;
      setBulkMovingCatalog(true);
      let moved = 0;
      let failed = 0;
      try {
        for (const item of catalogMoveItems) {
          try {
            const patched = applyCatalogMoveTarget(item, target);
            const updated = await updateCatalogItemRequest(dataUserId, patched);
            setCatalogItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
            setDetailItem((prev) => (prev?._id === updated._id ? updated : prev));
            moved += 1;
          } catch {
            failed += 1;
          }
        }
        notifyDeliveryCatalogChanged(dataUserId, businessId);
        if (moved > 0) {
          toast.success(
            `${moved} producto${moved !== 1 ? 's' : ''} movido${moved !== 1 ? 's' : ''} a «${target.category}»`,
          );
        }
        if (failed > 0) toast.error(`${failed} producto(s) no se pudieron mover`);
        setCatalogMoveItems(null);
        if (catalogSelectMode) exitCatalogSelectMode();
      } finally {
        setBulkMovingCatalog(false);
      }
    },
    [
      dataUserId,
      catalogMoveItems,
      businessId,
      catalogSelectMode,
      exitCatalogSelectMode,
    ],
  );

  const catalogKpis = useMemo(() => ({
    totalItems: catalogItems.length,
    products: catalogItems.filter(i => (i.itemType || 'product') === 'product').length,
    services: catalogItems.filter(i => i.itemType === 'service').length,
    combos: catalogItems.filter(i => i.itemType === 'combo').length,
    lowStock: catalogItems.filter(i => i.active && (i.itemType || 'product') === 'product' && Number(i.minStock || 0) > 0 && Number(i.stockQuantity || 0) <= Number(i.minStock || 0)).length,
    categories: new Set(catalogItems.map(i => i.category).filter(Boolean)).size,
    inventoryValue: catalogItems.reduce((s, i) => {
      if (!i.active || (i.itemType || 'product') !== 'product') return s;
      const quantity = Math.max(0, Number(i.stockQuantity || 0));
      const cost = Number(i.costPrice || 0);
      return s + quantity * cost;
    }, 0),
  }), [catalogItems]);

  const supplierKpis = useMemo(() => ({
    total: suppliers.length,
    active: suppliers.filter(s => s.active).length,
  }), [suppliers]);

  const invoiceKpis = useMemo(() => ({
    total: invoices.length,
    pending: invoices.filter(i => i.status === 'pending').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    totalAmount: invoices.reduce((s, i) => s + (i.total || 0), 0),
  }), [invoices]);

  const stockTabCount = useMemo(() => {
    const scoped = filterStockInventoryItems(catalogForActiveStore);
    const pending = scoped.filter((i) => Number(i.stockQuantity || 0) === 0).length;
    return pending > 0 ? pending : scoped.filter((i) => Number(i.stockQuantity || 0) > 0).length;
  }, [catalogForActiveStore]);

  // ── Tab: Catálogo ───────────────────────────────────────────────────────────

  const renderCatalogTab = () => (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="text-blue-600 mb-2"><Package className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-blue-900">{catalogKpis.totalItems}</div>
          <div className="text-xs text-blue-700 mt-0.5">Total artículos</div>
        </div>
        <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
          <div className="text-red-600 mb-2"><AlertTriangle className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-red-900">{catalogKpis.lowStock}</div>
          <div className="text-xs text-red-700 mt-0.5">Stock bajo</div>
        </div>
        <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
          <div className="text-purple-600 mb-2"><Layers className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-purple-900">{catalogKpis.categories}</div>
          <div className="text-xs text-purple-700 mt-0.5">Categorías</div>
        </div>
        <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
          <div className="text-green-600 mb-2"><DollarSign className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-green-900">{catalogKpis.inventoryValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
          <div className="text-xs text-green-700 mt-0.5">Valor inventario</div>
        </div>
      </div>

      {/* Acciones + búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full sm:w-72"
            placeholder="Buscar en el catálogo..."
            value={searchCatalog}
            onChange={(e) => setSearchCatalog(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2.5 border-2 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-xl flex items-center gap-2 font-medium transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40"
          >
            <Upload className="w-5 h-5" />
            Importar
          </button>
          {catalogSelectMode ? (
            <>
              <button
                type="button"
                onClick={exitCatalogSelectMode}
                disabled={bulkDeletingCatalog || bulkMovingCatalog}
                className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl flex items-center gap-2 font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => openCatalogMoveModal()}
                disabled={bulkDeletingCatalog || bulkMovingCatalog || selectedCatalogCount === 0}
                className="px-4 py-2.5 border border-indigo-300 text-indigo-700 dark:text-indigo-300 rounded-xl flex items-center gap-2 font-medium transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRightLeft className="w-5 h-5" />
                {bulkMovingCatalog ? 'Moviendo…' : `Mover (${selectedCatalogCount})`}
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteSelected}
                disabled={bulkDeletingCatalog || bulkMovingCatalog || selectedCatalogCount === 0}
                className={`px-4 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  bulkDeleteConfirmStep
                    ? 'bg-red-700 hover:bg-red-800 text-white border border-red-800'
                    : 'border border-red-300 text-red-700 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-5 h-5" />
                {bulkDeletingCatalog
                  ? 'Eliminando...'
                  : bulkDeleteConfirmStep
                    ? `Estoy seguro (${selectedCatalogCount})`
                    : `Eliminar (${selectedCatalogCount})`}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setCatalogSelectMode(true);
                  setBulkDeleteConfirmStep(false);
                  setSelectedCatalogIds(new Set());
                }}
                disabled={bulkDeletingCatalog || bulkMovingCatalog || filteredCatalog.length === 0}
                className="px-4 py-2.5 border border-indigo-300 text-indigo-700 dark:text-indigo-300 rounded-xl flex items-center gap-2 font-medium transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRightLeft className="w-5 h-5" />
                Seleccionar
              </button>
              <button
                type="button"
                onClick={handleDeleteAllFilteredCatalog}
                disabled={bulkDeletingCatalog || bulkMovingCatalog || filteredCatalog.length === 0}
                className="px-4 py-2.5 border border-red-300 text-red-700 dark:text-red-300 rounded-xl flex items-center gap-2 font-medium transition-colors hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-5 h-5" />
                {searchCatalog.trim()
                  ? `Eliminar visibles (${filteredCatalog.length})`
                  : `Eliminar todo (${filteredCatalog.length})`}
              </button>
            </>
          )}
          <ActivationFieldWrap
            fieldKey="catalog-import"
            activeKey={
              activationFocus === 'catalog-import' || activationFocus === 'catalog-add'
                ? activationFocus
                : null
            }
          >
            <AddButtonDropdown
              label="Nuevo artículo"
              onQuickAdd={openNewCatalogItemManual}
              onAIAdd={() => setShowAIModal(true)}
              onImport={() => setShowImportModal(true)}
              quickAddLabel="Añadir manualmente"
              quickAddDesc="Marca, categoría, precios y stock en 3 pasos"
              aiAddLabel="Crear con IA"
              aiAddDesc="Describe productos en texto y se importan al catálogo"
            />
          </ActivationFieldWrap>
        </div>
      </div>

      {catalogSelectMode && filteredCatalog.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={allFilteredCatalogSelected}
              onChange={toggleSelectAllFilteredCatalog}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {allFilteredCatalogSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
          </label>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {selectedCatalogCount === 0
              ? 'Marca productos para mover de categoría/línea o eliminar'
              : `${selectedCatalogCount} seleccionado${selectedCatalogCount !== 1 ? 's' : ''}`}
          </span>
          {bulkDeleteConfirmStep && selectedCatalogCount > 0 && (
            <span className="text-xs font-medium text-red-700 dark:text-red-300">
              Pulsa «Estoy seguro» para confirmar el borrado
            </span>
          )}
        </div>
      )}

      {/* Secciones por categoría */}
      {loading && catalogItems.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Actualizando catálogo…
        </div>
      )}
      {!loading && filteredCatalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Package className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-semibold">No hay artículos en el catálogo</p>
          <p className="text-sm mt-1">Añade el primer artículo</p>
          <button
            onClick={openNewCatalogItemManual}
            className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium"
          >
            + Añadir manualmente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {catalogGroupedByCategory.map(({ category, items }) => {
            const isCollapsed = !catalogSectionsOpen.has(category);
            return (
              <div
                key={category}
                className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleCatalogSection(category)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
                  aria-expanded={!isCollapsed}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isCollapsed ? (
                      <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{category}</span>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                      {items.length} producto{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px]">
                      <thead>
                        <tr className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                          {catalogSelectMode && (
                            <th className="px-4 py-2.5 w-10">
                              <span className="sr-only">Seleccionar</span>
                            </th>
                          )}
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nombre</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Marca</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Tipo</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Precio</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Ventas</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Stock</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Web</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Disponible</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {items.map((item) => {
                          const itemType = item.itemType || 'product';
                          const isLowStock = itemType === 'product' && item.stockQuantity <= item.minStock;
                          const typeBadgeClass = itemType === 'service'
                            ? 'bg-purple-100 text-purple-700 border-purple-200'
                            : itemType === 'combo'
                              ? 'bg-amber-100 text-amber-700 border-amber-200'
                              : 'bg-blue-100 text-blue-700 border-blue-200';
                          const typeLabel = itemType === 'service' ? 'Servicio' : itemType === 'combo' ? 'Combo' : 'Producto';
                          const sales = catalogSalesIndex.get(item._id);
                          return (
                            <tr
                              key={item._id}
                              className={`transition-colors ${
                                catalogSelectMode && selectedCatalogIds.has(item._id)
                                  ? 'bg-indigo-50/70 dark:bg-indigo-950/20'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                              }`}
                            >
                              {catalogSelectMode && (
                                <td className="px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedCatalogIds.has(item._id)}
                                    onChange={() => toggleCatalogItemSelected(item._id)}
                                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    aria-label={`Seleccionar ${item.name}`}
                                  />
                                </td>
                              )}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {item.image ? (
                                    <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                      <Package className="w-4 h-4 text-gray-400" />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <button
                                      type="button"
                                      onClick={() => setDetailItem(item)}
                                      className="block w-full text-left group"
                                      title="Ver ficha, ventas e ingredientes"
                                    >
                                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-2">
                                        {item.name}
                                      </span>
                                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 opacity-80 group-hover:opacity-100 group-hover:underline">
                                        <Eye className="w-3 h-3 shrink-0" />
                                        Ver ficha
                                      </span>
                                    </button>
                                    {typeof item.customFields?.ingredients === 'string' && item.customFields.ingredients.trim() && (
                                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-1" title={item.customFields.ingredients}>
                                        {item.customFields.ingredients}
                                      </p>
                                    )}
                                    {(item.comboItems?.length ?? 0) > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {item.comboItems!.map((c) => {
                                          const slotKind = resolveComboRefSlotKind(c, catalogItems);
                                          const slotStyle = COMBO_SLOT_META[slotKind];
                                          return (
                                            <span
                                              key={c.productId}
                                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 max-w-full"
                                              title={`${slotStyle.label}: ${c.productName}`}
                                            >
                                              <span className="shrink-0">{slotStyle.emoji}</span>
                                              <span className="truncate">{c.productName}</span>
                                              {c.quantity > 1 ? (
                                                <span className="shrink-0 font-bold">×{c.quantity}</span>
                                              ) : null}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {isCatalogTpvConfigurable(item, brands) && (
                                      <p className="text-[10px] mt-1 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                                        <Zap className="w-3 h-3 shrink-0" />
                                        TPV
                                        {item.customFields?.ingredients
                                          ? ` · ${parseIngredientsBulkText(String(item.customFields.ingredients)).length} ing.`
                                          : ' · sin ingredientes'}
                                        {(item.comboItems?.length ?? 0) > 0
                                          ? ` · ${item.comboItems!.length} en combo`
                                          : ''}
                                      </p>
                                    )}
                                    {item.description && (
                                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[240px]">{item.description}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {(() => {
                                  const brandLabel = catalogItemBrandNames(item, brands);
                                  return brandLabel ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-300 text-xs font-medium rounded-lg border border-violet-200 dark:border-violet-800 max-w-[140px] truncate" title={brandLabel}>
                                      <Tag className="w-3 h-3 shrink-0" />
                                      {brandLabel}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 text-sm">—</span>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-lg border ${typeBadgeClass}`}>
                                  {typeLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{item.unitPrice.toFixed(2)}€</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Coste: {item.costPrice.toFixed(2)}€</div>
                              </td>
                              <td className="px-4 py-3">
                                {ordersLoading && !sales ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                ) : (
                                  <div>
                                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                      {sales?.totalUnits ?? 0} ud
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                      {(sales?.totalRevenue ?? 0).toFixed(2)}€
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {itemType === 'service' ? (
                                  <span className="text-sm text-gray-400">No aplica</span>
                                ) : (
                                  <div className={`text-sm font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                                    {item.stockQuantity} {item.unit}
                                  </div>
                                )}
                                {isLowStock && (
                                  <div className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                                    <AlertTriangle className="w-3 h-3" /> Min: {item.minStock}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleToggleField(item, 'webVisible')}
                                  title={item.webVisible ? 'Visible en web — clic para ocultar' : 'Oculto de la web — clic para mostrar'}
                                  className={`w-9 h-5 rounded-full transition-colors relative inline-block ${item.webVisible ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                >
                                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.webVisible ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                              </td>
                              <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleToggleField(item, 'available')}
                                  title={item.available ? 'Disponible — clic para marcar agotado' : 'No disponible — clic para habilitar'}
                                  className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
                                    item.available
                                      ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                                      : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                                  }`}
                                >
                                  {item.available ? 'Sí' : 'Agotado'}
                                </button>
                              </td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleToggleField(item, 'active')}
                                  className={`px-2 py-1 text-xs font-semibold rounded-full border cursor-pointer transition-colors ${
                                    item.active
                                      ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {item.active ? 'Activo' : 'Inactivo'}
                                </button>
                              </td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => { setDetailItem(item); }}
                                    className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                                    title="Configurar TPV (ingredientes y combo)"
                                  >
                                    <Zap className="w-4 h-4 text-emerald-600" />
                                  </button>
                                  <button
                                    onClick={() => { setDetailItem(item); }}
                                    className="p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                                    title="Ficha y estadísticas"
                                  >
                                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                                  </button>
                                  <button
                                    onClick={() => openCatalogMoveModal([item])}
                                    disabled={bulkDeletingCatalog || bulkMovingCatalog}
                                    className="p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 rounded-lg transition-colors disabled:opacity-40"
                                    title="Mover a otra categoría o línea"
                                  >
                                    <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
                                  </button>
                                  <button
                                    onClick={() => { setEditingItem(item); setShowCreateItem(true); }}
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                  </button>
                                  <button
                                    onClick={() => setStockAdjustItem(item)}
                                    className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
                                    title="Ajustar stock"
                                  >
                                    <ArrowUpDown className="w-4 h-4 text-blue-600" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item)}
                                    disabled={bulkDeletingCatalog || deletingItemIds.has(item._id)}
                                    className="p-1.5 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Tab: Proveedores ────────────────────────────────────────────────────────

  const renderSuppliersTab = () => (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="text-blue-600 mb-2"><Users className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-blue-900">{supplierKpis.total}</div>
          <div className="text-xs text-blue-700 mt-0.5">Total proveedores</div>
        </div>
        <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
          <div className="text-green-600 mb-2"><CheckCircle2 className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-green-900">{supplierKpis.active}</div>
          <div className="text-xs text-green-700 mt-0.5">Activos</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <button
          onClick={() => { setEditingSupplier(null); setShowCreateSupplier(true); }}
          className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo proveedor
        </button>
      </div>

      {/* Table */}
      {suppliersLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-3" />
          Cargando proveedores...
        </div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Truck className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-semibold">Sin proveedores registrados</p>
          <p className="text-sm mt-1">Añade el primer proveedor</p>
          <button
            onClick={() => { setEditingSupplier(null); setShowCreateSupplier(true); }}
            className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
          >
            + Nuevo proveedor
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">CIF</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Teléfono</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Contacto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {suppliers.map(supplier => (
                <tr key={supplier._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{supplier.name}</div>
                    {supplier.address && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{supplier.address}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{supplier.cif || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{supplier.email || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{supplier.phone || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{supplier.contactPerson || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {supplier.category ? (
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">
                        {supplier.category}
                      </span>
                    ) : <span className="text-gray-400 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${
                      supplier.active
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}>
                      {supplier.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingSupplier(supplier); setShowCreateSupplier(true); }}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(supplier)}
                        className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Tab: Facturas ───────────────────────────────────────────────────────────

  const renderInvoicesTab = () => {
    const invoicesWithOverdue = invoices.map(inv => {
      if (inv.status === 'pending' && inv.dueDate && new Date(inv.dueDate) < new Date()) {
        return { ...inv, status: 'overdue' };
      }
      return inv;
    });

    return (
      <div className="space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
            <div className="text-blue-600 mb-2"><FileText className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900">{invoiceKpis.total}</div>
            <div className="text-xs text-blue-700 mt-0.5">Total facturas</div>
          </div>
          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
            <div className="text-amber-600 mb-2"><Clock className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-amber-900">{invoiceKpis.pending}</div>
            <div className="text-xs text-amber-700 mt-0.5">Pendientes</div>
          </div>
          <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <div className="text-green-600 mb-2"><CheckCircle2 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900">{invoiceKpis.paid}</div>
            <div className="text-xs text-green-700 mt-0.5">Pagadas</div>
          </div>
          <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
            <div className="text-purple-600 mb-2"><BarChart3 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-purple-900">{invoiceKpis.totalAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-purple-700 mt-0.5">Total importe</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <button
            onClick={() => { setEditingInvoice(null); setShowCreateInvoice(true); }}
            className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva factura
          </button>
        </div>

        {/* Table */}
        {invoicesLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-3" />
            Cargando facturas...
          </div>
        ) : invoicesWithOverdue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <FileText className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin facturas de compra</p>
            <p className="text-sm mt-1">Registra la primera factura de proveedor</p>
            <button
              onClick={() => { setEditingInvoice(null); setShowCreateInvoice(true); }}
              className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
            >
              + Nueva factura
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nº Factura</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {invoicesWithOverdue.map(invoice => {
                  const statusCfg = INVOICE_STATUS_CONFIG[invoice.status] || INVOICE_STATUS_CONFIG.pending;
                  const originalInvoice = invoices.find(i => i._id === invoice._id)!;
                  return (
                    <tr key={invoice._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                          {invoice.invoiceNumber || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{invoice.supplierName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {invoice.date ? new Date(invoice.date).toLocaleDateString('es-ES') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${invoice.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                          {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('es-ES') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                          {(invoice.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                        </div>
                        {invoice.lines.length > 0 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{invoice.lines.length} línea{invoice.lines.length !== 1 ? 's' : ''}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {!invoiceFinanceLinks.has(originalInvoice._id) && (
                            <button
                              onClick={() => handleLinkInvoiceToFinance(originalInvoice)}
                              className="p-1.5 hover:bg-violet-100 rounded-lg transition-colors"
                              title="Registrar pago en finanzas"
                            >
                              <Wallet className="w-4 h-4 text-violet-600" />
                            </button>
                          )}
                          {originalInvoice.status !== 'paid' && (
                            <button
                              onClick={() => handleToggleInvoiceStatus(originalInvoice)}
                              className="p-1.5 hover:bg-green-100 rounded-lg transition-colors"
                              title="Marcar como pagada"
                            >
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            </button>
                          )}
                          {originalInvoice.status === 'paid' && (
                            <button
                              onClick={() => handleToggleInvoiceStatus(originalInvoice)}
                              className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors"
                              title="Marcar como pendiente"
                            >
                              <Clock className="w-4 h-4 text-amber-600" />
                            </button>
                          )}
                          <button
                            onClick={() => { setEditingInvoice(originalInvoice); setShowCreateInvoice(true); }}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(originalInvoice)}
                            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ── Tab: Ingredientes ─────────────────────────────────────────────────────────

  const renderIngredientesTab = () => (
    dataUserId && businessId ? <StoreIngredientsPanel userId={dataUserId} businessId={businessId} /> : null
  );

  // ── Tabs config ─────────────────────────────────────────────────────────────

  const tabsConfig = useMemo(() => [
    { id: 'catalog', label: 'Catálogo', count: catalogItems.filter((i) => i.active && i.module === 'catalog').length || undefined },
    { id: 'stock', label: 'Stock', count: stockTabCount || undefined },
    { id: 'staff-consumption', label: 'Consumos equipo' },
    { id: 'suppliers', label: 'Proveedores', count: supplierKpis.active || undefined },
    { id: 'purchase-orders', label: 'Órdenes de compra' },
    { id: 'invoices', label: 'Facturas', count: invoiceKpis.pending || undefined },
    { id: 'ingredientes', label: 'Ingredientes TPV' },
    { id: 'escandallo', label: 'Escandallo' },
  ], [stockTabCount, catalogItems, supplierKpis.active, invoiceKpis.pending]);

  const brandReady = useMemo(() => {
    if (!isDelivery) return true;
    if (catalogItems.length > 0) return true;
    if (brands.length === 0) return false;
    const primary =
      brands.find((b) => isDefaultCommercialBrand(b)) ??
      brands.find((b) => b.active !== false) ??
      brands[0];
    return primary
      ? isBrandSetupComplete(primary, { isDelivery: true, retailStoreCount })
      : false;
  }, [isDelivery, brands, catalogItems.length, retailStoreCount]);

  /** No mostrar el aviso hasta tener marcas + tiendas cargadas (evita flash al entrar). */
  const brandCheckReady =
    pageReady && Boolean(businessId) && !brandsLoading && !activeStore.loading;
  const showBrandIncompleteBanner = isDelivery && brandCheckReady && !brandReady;

  const catalogBusy = loading && catalogItems.length === 0;

  return (
    <Layout title="Catálogo" subtitle="Gestión de productos, proveedores y compras">
      <div className="space-y-6">
        {!pageReady && (
          <CatalogTabLoadingState phase="session" />
        )}

        {pageReady && (
          <>
        {showBrandIncompleteBanner && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-left">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold text-amber-950 dark:text-amber-100">Marca sin completar</p>
                <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
                  Puedes usar el catálogo igualmente. Completa la marca en Ajustes para carta, categorías y precios.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(DELIVERY_MARCA_SETTINGS_PATH)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
            >
              Ir a Marca
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {catalogImportReport && (
          <CatalogImportReportPanel
            report={catalogImportReport}
            onDismiss={() => setCatalogImportReport(null)}
          />
        )}

        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'catalog' && (
          catalogBusy ? <CatalogTabLoadingState phase="catalog" /> : renderCatalogTab()
        )}

        {activeTab === 'ingredientes' && renderIngredientesTab()}

        {activeTab === 'stock' && (
          catalogBusy ? (
            <CatalogTabLoadingState phase="catalog" />
          ) : dataUserId ? (
            <StockTabPanel
              items={filterStockInventoryItems(catalogForActiveStore)}
              warehouses={warehouses}
              userId={dataUserId}
              searchQuery=""
              itemLabelPlural={itemLabelPlural}
              storeLabel={storeLabel}
              warehouseId={storeWarehouseId}
              businessType={businessType}
              onReload={loadCatalog}
            />
          ) : null
        )}

        {activeTab === 'staff-consumption' && (
          catalogBusy ? (
            <CatalogTabLoadingState phase="catalog" />
          ) : dataUserId && user ? (
            <StaffConsumptionTabPanel
              userId={dataUserId}
              catalogItems={catalogItems}
              currentUser={user}
              onCatalogUpdated={loadCatalog}
            />
          ) : null
        )}

        {activeTab === 'suppliers' && (
          suppliersLoading && suppliers.length === 0
            ? <CatalogTabLoadingState phase="suppliers" />
            : renderSuppliersTab()
        )}

        {activeTab === 'purchase-orders' && <PurchaseOrdersPage />}

        {activeTab === 'invoices' && (
          (invoicesLoading || suppliersLoading) && invoices.length === 0
            ? <CatalogTabLoadingState phase="invoices" />
            : renderInvoicesTab()
        )}

        {activeTab === 'escandallo' && <EscandalloPanel />}
          </>
        )}
      </div>

      <CreateCatalogItemModal
        isOpen={showCreateItem}
        onClose={() => { setShowCreateItem(false); setEditingItem(null); }}
        onCreate={handleCreateItem}
        editItem={editingItem}
        brands={brands}
        businessId={businessId}
        onBrandsChange={setBrands}
        catalogCategoriesInUse={categories}
        catalogItems={catalogItems}
      />

      {detailItem && (
        <CatalogItemDetailModal
          item={detailItem}
          brands={brands}
          catalogItems={catalogItems}
          stats={catalogSalesIndex.get(detailItem._id) || computeCatalogItemSalesStats(detailItem, deliveryOrders)}
          statsLoading={ordersLoading}
          onClose={() => setDetailItem(null)}
          onEdit={() => {
            setEditingItem(detailItem);
            setShowCreateItem(true);
          }}
          onSaveTpvConfig={handleSaveDetailTpvConfig}
        />
      )}

      <CreateSupplierModal
        isOpen={showCreateSupplier}
        onClose={() => { setShowCreateSupplier(false); setEditingSupplier(null); }}
        onCreate={handleCreateSupplier}
        editItem={editingSupplier}
      />

      <CreateInvoiceModal
        isOpen={showCreateInvoice}
        onClose={() => { setShowCreateInvoice(false); setEditingInvoice(null); }}
        onCreate={handleCreateInvoice}
        suppliers={suppliers}
        editItem={editingInvoice}
      />

      <StockAdjustModal
        isOpen={!!stockAdjustItem}
        onClose={() => setStockAdjustItem(null)}
        item={stockAdjustItem}
        onAdjust={handleStockAdjust}
      />
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="delivery_catalog"
        moduleLabel="Catálogo"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <CatalogMoveModal
        open={catalogMoveItems !== null}
        items={catalogMoveItems ?? []}
        brands={brands}
        commercialLines={commercialLines}
        categoriesInUse={categories}
        submitting={bulkMovingCatalog}
        onClose={() => {
          if (!bulkMovingCatalog) setCatalogMoveItems(null);
        }}
        onConfirm={handleConfirmCatalogMove}
      />
      <CatalogDeleteGuardModal
        open={catalogDeleteGuard !== null}
        payload={
          catalogDeleteGuard?.mode === 'single'
            ? { mode: 'single', itemName: catalogDeleteGuard.item.name }
            : catalogDeleteGuard?.mode === 'bulk'
              ? { mode: 'bulk', count: catalogDeleteGuard.items.length }
              : null
        }
        onClose={() => {
          setCatalogDeleteGuard(null);
          setBulkDeleteConfirmStep(false);
        }}
        onVerified={() => {
          void executeCatalogDeleteAfterGuard();
        }}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Catálogo"
        templateFileName="plantilla_catalogo_delivery_tpv.xlsx"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
        onDownloadTemplate={handleDownloadCatalogTemplate}
        headerAliases={DELIVERY_CATALOG_HEADER_ALIASES}
        skipMappingWhenComplete
        extraFileUpload={{
          label: 'ZIP de imágenes (opcional)',
          helpText:
            'Sube un ZIP con fotos nombradas por SKU o nombre del producto (si falta match se bloquea la importación).',
          accept: '.zip,application/zip',
          loading: loadingImageZip,
          countLabel:
            Object.keys(imageZipMap).length > 0
              ? `${Object.keys(imageZipMap).length} imagen(es) preparadas para mapear`
              : '',
          sampleZipLabel: 'Descargar ZIP ejemplo',
          onDownloadSampleZip: handleDownloadSampleZip,
          onFileSelected: (file) => handleZipFileSelected(file),
        }}
      />
    </Layout>
  );
}
