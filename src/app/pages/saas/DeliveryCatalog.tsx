import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { isDeliveryBrandActivationComplete, isDefaultBrandNamePlaceholder, isDefaultCommercialBrand, resolveBrandSetupContext, sortBrandsForDisplay } from '../../lib/brandUtils';
import { DELIVERY_MARCA_SETTINGS_PATH } from '../../lib/deliveryActivationGates';
import {
  DELIVERY_OPS_HOME_PATH,
  HELADERIA_OPS_HOME_PATH,
} from '../../lib/retailOpsPaths';
import { notifyDeliveryBrandsChanged, notifyDeliveryCatalogChanged, notifyDeliveryConfigChanged, resolveBusinessScopeId, normalizeBusinessScopeId, DELIVERY_CONFIG_CHANGED, DELIVERY_CATALOG_CHANGED } from '../../lib/deliverySetup';
import { invalidateCatalogListCache } from '../../lib/catalogListCache';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import { formatDateEs, parseDateEsToIso } from '../../lib/formatDateEs';
import { toUserFacingMessage } from '../../lib/userFacingError';
import { canDeletePurchaseDocuments } from '../../lib/accountOwnerPrecedence';
import {
  isDeliveryOpsBusinessType,
  isEventsBusinessType,
  isIceCreamShopBusinessType,
  isRestaurantBusinessType,
  usesTpvCatalogOpsBusinessType,
} from '../../lib/deliveryOpsTypes';
import { resolveTpvCatalogBusinessId } from '../../lib/tpvRegisterScope';
import { getRetailOpsUiCopy } from '../../lib/retailUiCopy';
import { filterCatalogItemsForBusinessScope, dedupeCatalogItemsForDisplay, expandCatalogItemsForDeletion, findCatalogDuplicateByName, formatCatalogDuplicateNameError } from '../../lib/catalogBusinessScope';
import { deleteCatalogItemsRelentlessly } from '../../lib/catalogBulkDelete';
import { wipeCatalogLeftoversAfterEmptyCarta } from '../../lib/catalogFullWipe';
import { resolveCatalogProductImage, resolveCatalogProductPlaceholderUrl } from '../../lib/catalogProductPlaceholders';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { catalogItemOperatesAtWorkCenter } from '../../lib/pdvScope';
import { filterStockInventoryItems, summarizeCatalogDeleteScope, isStockInventoryItem } from '../../lib/stockInventoryScope';
import { DELIVERY_ACTIVE_STORE_CHANGED } from '../../lib/deliveryOpsPdvSelection';
import { listWarehousesRequest, type Warehouse } from '../../lib/warehouseApi';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import { InventoryPanel } from '../../components/saas/InventoryPanel';
import { CatalogServiceRulesFields } from '../../components/saas/CatalogServiceRulesFields';
import {
  brandIdsForCatalogServiceSave,
  CATALOG_SERVICE_CATEGORY,
  DEFAULT_CATALOG_SERVICE_RULES,
  mergeCatalogServiceRulesIntoCustomFields,
  readCatalogServiceRules,
  summarizeCatalogServiceRules,
  validateCatalogServiceRules,
  type CatalogServiceRules,
} from '../../lib/catalogServiceRules';
import { CatalogCoreLoadingState } from '../../components/saas/CatalogCoreLoadingState';
import { CatalogUnitChip, StockQtyWithUnit } from '../../components/saas/CatalogUnitChip';
import { SupplierPaymentTermsField } from '../../components/saas/SupplierPaymentTermsField';
import {
  initialSupplierCatalogItemIds,
  initialSupplierItemCosts,
  initialSupplierOrganizerIds,
  parseSupplierItemCosts,
  resolveSupplierOrganizerIdsForSave,
  labelsForSupplierOrganizerIds,
  supplierFormInitFingerprint,
  SupplierOrganizersField,
  supplierOrganizerFieldSessionKey,
} from '../../components/saas/SupplierOrganizersField';
import { syncSupplierCatalogItemLinks, resolveSupplierSelectedStockIds } from '../../lib/supplierCatalogLinks';
import { explicitMarkedStockItemsForSupplier } from '../../lib/purchaseSuggestions';
import {
  detectSupplierPriceVariance,
  type SupplierPriceVariance,
} from '../../lib/supplierPriceVariance';
import {
  normalizeSupplierCode,
  sanitizeSupplierCodeInput,
  suggestNextSupplierCode,
  suggestSupplierCodeFromName,
  supplierCodeAlreadyUsed,
  SUPPLIER_CODE_MAX_LEN,
} from '../../lib/supplierCode';
import { PurchaseOrdersPage } from './PurchaseOrdersPage';
import { EscandalloPanel } from './CostingPage';
import { AlbaranCorroborateModal } from '../../components/saas/AlbaranCorroborateModal';
import { AlbaranEsperaList } from '../../components/saas/AlbaranEsperaList';
import { purchaseInvoiceFromAlbaranOcr } from '../../lib/albaranOcrDraft';
import { scanDocument } from '../../lib/ocrApi';
import { downscaleImageFileToBase64, fileToRawBase64 } from '../../lib/ocrImagePrepare';
import {
  listPurchaseOrdersRequest,
  createPurchaseOrderRequest,
  type PurchaseOrder,
} from '../../lib/purchaseOrderApi';
import {
  invoiceIsAlbaran,
  isAlbaranInvoiceIncomplete,
  isPurchaseOrderWaitingAlbaran,
  buildReplenishPurchaseOrderPayload,
  pendingLinesFromPurchaseOrder,
  resolveAlbaranPendingLines,
  type PendingOrderLine,
} from '../../lib/albaranReceptionCompare';
import { VERTIAL_ACCENT_BG, VERTIAL_ACCENT_BORDER, VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_FOCUS_RING } from '../../lib/vertialUiTokens';
import JSZip from 'jszip';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import {
  SaasTabEmpty,
  SaasTabPrimaryButton,
  SaasTabSearch,
  SaasTabSecondaryButton,
  SaasTabToolbarRow,
} from '../../components/saas/SaasTabWorkspace';
import { CatalogTabShell } from '../../components/saas/CatalogTabShell';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { listBrandsRequest, deleteBrandRequest, type Brand } from '../../lib/brandsApi';
import { countCommercialBrands, useTenantEntitlements } from '../../hooks/useTenantEntitlements';
import { writeBillingSelection } from '../../lib/billingSelection';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import {
  formatUnmatchedCommercialBrandWarning,
  mapImportEntryToCatalogItem,
  normalizeImportCategory,
  readImportLineText,
  resolveBrandIdsFromImportText,
  resolveCatalogImportBrandIds,
  shouldClearBrandForCategory,
  activateCommercialLinesAfterCatalogImport,
  syncFullStockAutomationAfterCatalogImport,
  syncStoreIngredientsFromCatalogImport,
  syncTpvOrganizersAfterCatalogImport,
  removeCatalogCategoryFromBrands,
} from '../../lib/deliveryCatalogImport';
import { commercialLineBrands, isWarehouseImportCategory, organizerBrandsForCatalogTemplate } from '../../lib/deliveryCatalogImportLogic';
import {
  catalogImportFieldsForVertical,
  catalogHeaderAliasesForVertical,
  catalogTemplateFilenameForVertical,
  downloadDeliveryCatalogImportTemplate,
  partitionDeliveryCatalogImportEntries,
} from '../../lib/deliveryCatalogExcelTemplate';
import {
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
  loadPurchaseInvoiceStockRequest,
  filterDeliveryOrdersRequest,
  getDeliveryConfigRequest,
  updateDeliveryConfigRequest,
  type CatalogItem,
  type CatalogComboRef,
  type DeliveryOrder,
  type Supplier,
  type PurchaseInvoice,
  type PurchaseInvoiceLine,
} from '../../lib/deliveryApi';
import { localCalendarDayKey, localDayBoundsForKey } from '../../lib/tpvCajaScope';
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
  PackageCheck,
  BarChart3,
  ArrowUpDown,
  Minus,
  Users,
  Tag,
  Upload,
  Download,
  Loader2,
  RefreshCw,
  ArrowRight,
  ArrowRightLeft,
  Wallet,
  Mail,
  ChevronDown,
  ChevronRight,
  Zap,
  Globe,
  ArrowLeft,
  ImagePlus,
  ScanLine,
  Receipt,
  Settings2,
} from 'lucide-react';
import { SAAS__OcrScanModal } from '../../components/design-system/SAAS__OcrScanModal';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { CatalogImportReportPanel } from '../../components/saas/CatalogImportReportPanel';
import {
  catalogImportReportFromBulkErrors,
  catalogImportReportFromValidation,
  catalogImportReportSimple,
  consolidateCatalogImportWarnings,
  type CatalogImportProgressReporter,
  type CatalogImportReport,
  type CatalogImportRunResult,
} from '../../lib/catalogImportReport';
import { MISSING_BRAND_IMPORT_CODE } from '../../lib/deliveryCatalogImportLogic';
import { throwIfAborted, yieldToUi, isImportAbortError } from '../../lib/importAbort';
import { CatalogDeleteGuardModal } from '../../components/saas/CatalogDeleteGuardModal';
import { CatalogMoveModal } from '../../components/saas/CatalogMoveModal';
import { CatalogSectionsModal } from '../../components/saas/CatalogSectionsModal';
import { VehicleConfirmDialog } from '../../components/saas/vehicles/VehicleConfirmDialog';
import { useActivationFocus } from '../../hooks/useActivationFocus';
import { ActivationFieldWrap } from '../../components/saas/ActivationGuideUi';
import { StaffConsumptionTabPanel } from '../../components/saas/StaffConsumptionTabPanel';
import { resolveBusinessDataUserId, normalizeTenantUserId } from '../../lib/tenantUserId';
import { filterPurchaseDocsByBusinessScope } from '../../lib/purchaseBusinessScope';
import { pollSupplierInvoicesNow, listSupplierInvoicePdvEmailConfigs, type SupplierInvoicePdvEmailStatus } from '../../lib/supplierInvoiceApi';
import { createMovementFromInvoice, listFinanceMovements } from '../../lib/financeApi';
import {
  isCatalogTpvConfigurable,
  catalogBuildYourOwnIngredientOptions,
  catalogHalfHalfFlavorCandidates,
  isBuildYourOwnIngredientSelectionInvalid,
  isHalfHalfFlavorSelectionInvalid,
  mergeComboProductIngredients,
  normalizeBuildYourOwnAllowedIngredientIds,
  normalizeHalfHalfAllowedProductIds,
  normalizeHalfHalfBrandId,
  productBrandIdsFromItem,
  parseIngredientsBulkText,
  normalizeCatalogFichaIngredientsForSave,
  normalizeCatalogIngredientsForSave,
  unifyStoreIngredientsFromConfig,
  resolveTpvBrandConfigFromDeliveryConfig,
  ingredientChargesExtra,
  normalizeTpvDefaultExtraPrice,
  inferTpvDefaultExtraPrice,
  normalizeStoreIngredients,
  withStoreIngredientTpvFlags,
  resolveBrandTpvCategoryKeys,
  type StoreIngredient,
  type TpvBrandIngredientSelection,
  type TpvCategoryTemplateKey,
} from '../../lib/catalogCustomization';
import { withVertialDefaultBaseCost } from '../../lib/vertialDefaultCosts';
import { ORGANIZER_PACKAGING } from '../../lib/inventoryUtils';
import { StoreIngredientsPanel } from '../../components/saas/StoreIngredientsPanel';
import { CatalogItemDetailModal } from '../../components/saas/CatalogItemDetailModal';
import { CatalogComboCompositionEditor } from '../../components/saas/CatalogComboCompositionEditor';
import {
  CatalogProductRecipePicker,
  CatalogProductPackagingPicker,
  recipePicksToLines,
  recipePicksToTpvIngredientsText,
  packagingPicksToLines,
  type CatalogRecipePick,
  type CatalogPackagingPick,
} from '../../components/saas/CatalogProductRecipePicker';
import {
  calculateRecipeTotalCost,
  isCatalogCostingProduct,
  readProductRecipeLines,
  storeIngredientsById,
  withProductCosting,
} from '../../lib/catalogCosting';
import { syncInventoryCatalogFromSources } from '../../lib/inventorySync';
import { syncRecipesFromCostingCatalog } from '../../lib/recipeSyncFromCosting';
import {
  COMBO_SLOT_META,
  comboStructureFromCustomFields,
  defaultComboStructureForCatalog,
  isComboStructureConfirmed,
  resolveComboRefSlotKind,
  type ComboStructureSlot,
} from '../../lib/catalogComboSlots';
import { buildCatalogSalesIndex, computeCatalogItemSalesStats } from '../../lib/catalogItemSalesStats';
import {
  applyCatalogMoveTarget,
  commercialLinesWithoutCatalogItems,
  type CatalogMoveTargetInput,
} from '../../lib/catalogItemMove';

const INVOICE_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  pending_validation: { label: 'Pte. validar', badgeClass: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
  pending: { label: 'Pte. validar', badgeClass: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
  validated: { label: 'Validada', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
  pending_payment: { label: 'Pte. pago', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
  paid: { label: 'Pagada', badgeClass: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
  overdue: { label: 'Vencida', badgeClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
};

function invoiceDisplayStatus(inv: PurchaseInvoice): string {
  const vs = inv.validationStatus || (inv.status === 'paid' ? 'paid' : inv.status === 'overdue' ? 'overdue' : 'pending_validation');
  if ((vs === 'validated' || vs === 'pending_payment' || vs === 'pending') && inv.dueDate && new Date(inv.dueDate) < new Date() && vs !== 'paid') {
    return 'overdue';
  }
  if (inv.status === 'overdue') return 'overdue';
  if (inv.status === 'paid') return 'paid';
  return vs || inv.status || 'pending_validation';
}

// ─── Create Catalog Item Wizard (7 steps) ────────────────────────────────────

const ALLERGEN_OPTIONS = [
  'Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes', 'Soja',
  'Lácteos', 'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Moluscos', 'Altramuces',
];

const CREATE_STEP_LABELS = ['Producto', 'Ingredientes y composición', 'Foto y publicación'];
/** Cuadrado recomendado para carta / web / TPV (calidad). */
const CATALOG_PRODUCT_IMAGE_PX = 1024;

function CatalogEmptyActions({
  onManualAdd,
  onImport,
}: {
  onManualAdd: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-4 opacity-35">
        <Package className="w-12 h-12 text-gray-400" />
      </div>
      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Tu catálogo está vacío</h3>
      <p className="mt-1.5 max-w-md text-sm text-gray-500 dark:text-gray-400">
        Empieza con productos y precios para el TPV. Puedes añadirlos uno a uno o importar un Excel.
      </p>
      <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onManualAdd}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 px-4 py-4 text-white dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm font-bold">Añadir manualmente</span>
          <span className="text-[11px] font-normal opacity-80">Marca, categoría y precio</span>
        </button>
        <button
          type="button"
          onClick={onImport}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-4 text-blue-900 dark:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
        >
          <Upload className="w-5 h-5" />
          <span className="text-sm font-bold">Importar Excel</span>
          <span className="text-[11px] font-normal opacity-80">Plantilla con muchos productos</span>
        </button>
      </div>
    </div>
  );
}

/** Fusiona listados sin perder filas recién creadas en UI (race con reload). */
function mergeCatalogItemsById(prev: CatalogItem[], incoming: CatalogItem[]): CatalogItem[] {
  const byId = new Map(incoming.map((item) => [item._id, item]));
  for (const item of prev) {
    if (!item.deletedAt && !byId.has(item._id)) byId.set(item._id, item);
  }
  return [...byId.values()];
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
  onCreate: (data: Partial<CatalogItem>, options?: { keepOpen?: boolean }) => Promise<void>;
  editItem?: CatalogItem | null;
  /** Al crear: arranca como combo con este producto ya metido en la composición. */
  seedFromProduct?: CatalogItem | null;
  brands: Brand[];
  businessId: string;
  dataUserId?: string;
  onBrandsChange: (brands: Brand[]) => void;
  /** Categorías ya usadas en el catálogo (para sugerencias). */
  catalogCategoriesInUse?: string[];
  /** Catálogo completo (composición de combos). */
  catalogItems?: CatalogItem[];
  /** Carta visible (validación nombre duplicado). */
  catalogMenuItemsForDuplicateCheck?: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  brandIngredientSelection?: TpvBrandIngredientSelection;
  /** Envases de almacén (stockCategory packaging) para descontar al vender. */
  packagingStockItems?: CatalogItem[];
  /** Bar/restaurante: el paso 2 no es escandallo (eso va en Escandallo). */
  isRestaurantCatalog?: boolean;
}

function CreateCatalogItemModal({
  isOpen,
  onClose,
  onCreate,
  editItem,
  seedFromProduct = null,
  brands,
  businessId,
  dataUserId,
  onBrandsChange,
  catalogCategoriesInUse = [],
  catalogItems = [],
  catalogMenuItemsForDuplicateCheck = [],
  storeIngredients = [],
  brandIngredientSelection = {},
  packagingStockItems = [],
  isRestaurantCatalog = false,
}: CreateCatalogItemModalProps) {
  const navigate = useNavigate();
  const commercialBrandCount = useMemo(() => countCommercialBrands(brands), [brands]);
  const brandEntitlements = useTenantEntitlements({ commercialBrandCount });
  const canAddCommercialBrand =
    brands.length === 0 || brandEntitlements.canCreateCommercialBrand;
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [sessionCreated, setSessionCreated] = useState<Array<{ name: string; price: number }>>([]);
  const createModalWasOpenRef = useRef(false);
  /** Evita rehidratar (y pisar precios) cuando solo refrescan marcas/categorías. */
  const formHydrateKeyRef = useRef('');
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [modalStoreIngredients, setModalStoreIngredients] = useState<StoreIngredient[]>([]);
  const [modalBrandIngredientSelection, setModalBrandIngredientSelection] =
    useState<TpvBrandIngredientSelection>({});
  const [modalIngredientsLoading, setModalIngredientsLoading] = useState(false);
  const [comboItems, setComboItems] = useState<CatalogComboRef[]>([]);
  const defaultComboStructure = useMemo(
    () => defaultComboStructureForCatalog({ restaurant: isRestaurantCatalog }),
    [isRestaurantCatalog],
  );
  const [comboStructure, setComboStructure] = useState<ComboStructureSlot[]>(() =>
    defaultComboStructureForCatalog({ restaurant: false }),
  );
  const [comboStructureConfirmed, setComboStructureConfirmed] = useState(false);
  const [recipePicks, setRecipePicks] = useState<CatalogRecipePick[]>([]);
  const [packagingPicks, setPackagingPicks] = useState<CatalogPackagingPick[]>([]);
  const [modalPackagingItems, setModalPackagingItems] = useState<CatalogItem[]>([]);
  const [creatingPackaging, setCreatingPackaging] = useState(false);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryDraft, setNewCategoryDraft] = useState('');
  const [dismissedCategoryKeys, setDismissedCategoryKeys] = useState<Set<string>>(() => new Set());
  const [showCreateByoIngredient, setShowCreateByoIngredient] = useState(false);
  const [newByoIngredientName, setNewByoIngredientName] = useState('');
  const [creatingByoIngredient, setCreatingByoIngredient] = useState(false);
  const [creatingRecipeIngredient, setCreatingRecipeIngredient] = useState(false);
  const [fieldErrorsShown, setFieldErrorsShown] = useState(false);
  const emptyCreateForm = useCallback(
    () => ({
      itemType: 'product' as CatalogItem['itemType'],
      name: '',
      description: '',
      category: '',
      selectedBrandIds: [] as string[],
      newBrandName: '',
      showNewBrand: false,
      unit: 'ud',
      unitPrice: '',
      taxRate: '',
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
      halfHalf: false,
      buildYourOwn: false,
      halfHalfAllowedProductIds: [] as string[],
      halfHalfBrandId: '',
      buildYourOwnAllowedIngredientIds: [] as string[],
      serviceRules: { ...DEFAULT_CATALOG_SERVICE_RULES } as CatalogServiceRules,
    }),
    [],
  );

  const [form, setForm] = useState(emptyCreateForm);

  useEffect(() => {
    if (!isOpen) {
      createModalWasOpenRef.current = false;
      formHydrateKeyRef.current = '';
      setSessionCreated([]);
      setExtraCategories([]);
      setAddingCategory(false);
      setNewCategoryDraft('');
      setDismissedCategoryKeys(new Set());
      setShowCreateByoIngredient(false);
      setNewByoIngredientName('');
      setCreatingByoIngredient(false);
      setFieldErrorsShown(false);
      setRecipePicks([]);
      setPackagingPicks([]);
      setModalPackagingItems([]);
      setCreatingPackaging(false);
      // Limpiar precios al cerrar: evita flash del producto anterior al reabrir.
      setForm(emptyCreateForm());
      return;
    }

    const justOpened = !createModalWasOpenRef.current;
    createModalWasOpenRef.current = true;

    const hydrateKey = editItem
      ? `edit:${editItem._id}`
      : seedFromProduct
        ? `seed:${seedFromProduct._id}`
        : 'create';

    // Marcas/categorías refrescan en vivo: no volver a setForm (pisaba precio/paso).
    if (!justOpened && formHydrateKeyRef.current === hydrateKey) {
      return;
    }
    formHydrateKeyRef.current = hydrateKey;

    if (justOpened) {
      setShowCreateByoIngredient(false);
      setNewByoIngredientName('');
      setCreatingByoIngredient(false);
      setFieldErrorsShown(false);
    }

    if (editItem) {
      const editCategory = normalizeImportCategory(String(editItem.category || '').trim());
      setExtraCategories(editCategory ? [editCategory] : []);
      setAddingCategory(false);
      setNewCategoryDraft('');
      setComboItems(Array.isArray(editItem.comboItems) ? [...editItem.comboItems] : []);
      const items = Array.isArray(editItem.comboItems) ? editItem.comboItems.length : 0;
      setComboStructure(comboStructureFromCustomFields(editItem.customFields, items));
      setComboStructureConfirmed(isComboStructureConfirmed(editItem.customFields, items));
      const existingRecipe = readProductRecipeLines(editItem);
      const removableNames = new Set(
        parseIngredientsBulkText(
          typeof editItem.customFields?.ingredients === 'string'
            ? editItem.customFields.ingredients
            : '',
        ).map((n) => n.toLowerCase()),
      );
      setRecipePicks(
        existingRecipe
          .filter((line) => line.storeIngredientId)
          .map((line) => ({
            storeIngredientId: String(line.storeIngredientId),
            name: line.name,
            quantity: line.quantity,
            unit: line.unit || 'ud',
            tpvRemovable:
              removableNames.size === 0
                ? true
                : removableNames.has(line.name.toLowerCase()),
          })),
      );
      setPackagingPicks(
        existingRecipe
          .filter((line) => line.catalogItemId && line.stockCategory === 'packaging')
          .map((line) => ({
            catalogItemId: String(line.catalogItemId),
            name: line.name,
            quantity: line.quantity,
            unit: line.unit || 'ud',
          })),
      );
      const sale = Number(editItem.unitPrice);
      const cost = Number(editItem.costPrice);
      setForm({
        itemType: editItem.itemType || 'product',
        name: editItem.name,
        description: editItem.description,
        category: editItem.category,
        selectedBrandIds: (() => {
          const ids = Array.isArray(editItem.brandIds) ? editItem.brandIds.filter(Boolean) : [];
          return ids.length > 0 ? [ids[0]] : [];
        })(),
        newBrandName: '',
        showNewBrand: false,
        unit: editItem.unit || 'ud',
        unitPrice: Number.isFinite(sale) && sale > 0 ? String(sale) : '',
        taxRate: (() => {
          const n = Number(editItem.taxRate);
          // 21% es el default histórico de BD: en UI = Apagado (no parece forzado).
          if (Number.isFinite(n) && n !== 21) return String(n);
          return '';
        })(),
        staffPrice: editItem.staffPrice != null && editItem.staffPrice > 0 ? String(editItem.staffPrice) : '',
        costPrice: Number.isFinite(cost) && cost > 0 ? String(cost) : '',
        stockQuantity: String(editItem.stockQuantity || ''),
        minStock: String(editItem.minStock || ''),
        image: editItem.image || '',
        allergens: editItem.allergens || [],
        notes: editItem.notes || '',
        webVisible: editItem.webVisible ?? true,
        available: editItem.available ?? true,
        ingredients: typeof editItem.customFields?.ingredients === 'string' ? editItem.customFields.ingredients : '',
        halfHalf: editItem.customFields?.halfHalf === true,
        buildYourOwn: editItem.customFields?.buildYourOwn === true,
        halfHalfAllowedProductIds: normalizeHalfHalfAllowedProductIds(
          editItem.customFields?.halfHalfAllowedProductIds,
        ),
        halfHalfBrandId:
          normalizeHalfHalfBrandId(editItem.customFields?.halfHalfBrandId) ||
          productBrandIdsFromItem(editItem)[0] ||
          '',
        buildYourOwnAllowedIngredientIds: normalizeBuildYourOwnAllowedIngredientIds(
          editItem.customFields?.buildYourOwnAllowedIngredientIds,
        ),
        serviceRules: readCatalogServiceRules(editItem.customFields),
      });
      setStep(1);
      return;
    }

    if (!justOpened) return;

    setSessionCreated([]);
    setRecipePicks([]);
    setPackagingPicks([]);
    setExtraCategories([]);
    setDismissedCategoryKeys(new Set());
    setAddingCategory(catalogCategoriesInUse.length === 0);
    setNewCategoryDraft('');

    if (seedFromProduct) {
      const seedRef: CatalogComboRef = {
        productId: seedFromProduct._id,
        productName: seedFromProduct.name,
        quantity: 1,
        slotKind: 'main',
      };
      setComboItems([seedRef]);
      setComboStructure(defaultComboStructure.map((s) => ({ ...s })));
      setComboStructureConfirmed(true);
      setForm({
        ...emptyCreateForm(),
        itemType: 'combo',
        name: `Menú con ${seedFromProduct.name}`,
        category: 'Combos',
        selectedBrandIds: (() => {
          const seedBrands = Array.isArray(seedFromProduct.brandIds)
            ? seedFromProduct.brandIds.filter(Boolean)
            : [];
          return seedBrands.length > 0 ? [seedBrands[0]] : [];
        })(),
      });
      setStep(1);
      return;
    }

    setComboItems([]);
    setComboStructure(defaultComboStructure.map((s) => ({ ...s })));
    setComboStructureConfirmed(true);
    setForm(emptyCreateForm());
    setStep(1);
  }, [editItem, seedFromProduct, isOpen, defaultComboStructure, catalogCategoriesInUse.length, emptyCreateForm]);

  const reloadModalTpvIngredients = useCallback(async () => {
    if (!dataUserId) {
      setModalStoreIngredients([]);
      setModalBrandIngredientSelection({});
      return;
    }
    setModalIngredientsLoading(true);
    try {
      const config = await getDeliveryConfigRequest(dataUserId);
      const lineBrands = sortBrandsForDisplay(
        businessId
          ? commercialLineBrands(
              brands.length > 0 ? brands : await listBrandsRequest(businessId).catch(() => []),
            )
          : brands,
      );
      const brandIds = lineBrands.map((b) => b._id);
      const unified = unifyStoreIngredientsFromConfig(config, brandIds);
      const { ingredientSelection } = resolveTpvBrandConfigFromDeliveryConfig(config, brandIds);
      setModalStoreIngredients(unified);
      setModalBrandIngredientSelection(ingredientSelection);
    } catch {
      setModalStoreIngredients([]);
      setModalBrandIngredientSelection({});
    } finally {
      setModalIngredientsLoading(false);
    }
  }, [dataUserId, businessId, brands]);

  useEffect(() => {
    if (!isOpen) return;
    if (storeIngredients.length > 0) return;
    void reloadModalTpvIngredients();
  }, [isOpen, storeIngredients.length, reloadModalTpvIngredients]);

  useEffect(() => {
    if (!isOpen) return;
    const onConfigChanged = () => {
      void reloadModalTpvIngredients();
    };
    window.addEventListener(DELIVERY_CONFIG_CHANGED, onConfigChanged);
    return () => window.removeEventListener(DELIVERY_CONFIG_CHANGED, onConfigChanged);
  }, [isOpen, reloadModalTpvIngredients]);

  const effectiveStoreIngredients =
    modalStoreIngredients.length > 0 ? modalStoreIngredients : storeIngredients;
  const effectiveBrandIngredientSelection =
    Object.keys(modalBrandIngredientSelection).length > 0
      ? modalBrandIngredientSelection
      : brandIngredientSelection;

  useEffect(() => {
    if (!isOpen) return;
    setModalPackagingItems(packagingStockItems);
  }, [isOpen, packagingStockItems]);

  useEffect(() => {
    if (recipePicks.length === 0) return;
    const byId = storeIngredientsById(effectiveStoreIngredients);
    const cost = calculateRecipeTotalCost(recipePicksToLines(recipePicks), byId, brands);
    const tpvText = recipePicksToTpvIngredientsText(recipePicks);
    setForm((f) => {
      const prev = Number(f.costPrice) || 0;
      const hasStoredCost = String(f.costPrice || '').trim() !== '' && prev > 0;
      const nextCost = cost > 0 ? cost.toFixed(2) : f.costPrice;
      // No pisar coste de venta/guardado al cargar ingredientes en edición.
      const costChanged =
        cost > 0 && Math.abs(prev - cost) >= 0.005 && (!editItem || !hasStoredCost);
      const ingredientsChanged = f.ingredients !== tpvText;
      if (!costChanged && !ingredientsChanged) return f;
      return {
        ...f,
        ...(costChanged ? { costPrice: nextCost } : {}),
        ...(ingredientsChanged ? { ingredients: tpvText } : {}),
      };
    });
  }, [recipePicks, effectiveStoreIngredients, brands, editItem]);

  const pinCategoryChip = useCallback((raw: string) => {
    const cat = normalizeImportCategory(String(raw || '').trim());
    if (!cat) return;
    const key = cat.toLowerCase();
    setExtraCategories((prev) => {
      if (prev.some((c) => c.toLowerCase() === key)) return prev;
      return [...prev, cat];
    });
  }, []);

  const selectCategoryChip = useCallback((cat: string) => {
    pinCategoryChip(cat);
    setForm((f) => ({ ...f, category: cat }));
  }, [pinCategoryChip]);

  const categoryChips = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: string) => {
      const cat = normalizeImportCategory(String(raw || '').trim());
      if (!cat) return;
      if (isWarehouseImportCategory(cat)) return;
      const key = cat.toLowerCase();
      if (seen.has(key) || dismissedCategoryKeys.has(key)) return;
      seen.add(key);
      out.push(cat);
    };

    // Solo categorías reales: las que ya tienen productos o las creadas en esta sesión.
    for (const raw of catalogCategoriesInUse) push(raw);
    for (const raw of extraCategories) push(raw);
    return out.sort((a, b) => a.localeCompare(b, 'es'));
  }, [catalogCategoriesInUse, extraCategories, dismissedCategoryKeys]);

  const startAddCategory = useCallback(() => {
    setAddingCategory(true);
    setNewCategoryDraft('');
    setForm((f) => ({ ...f, category: '' }));
  }, []);

  const commitNewCategoryChip = () => {
    const raw = newCategoryDraft.trim().replace(/\s+/g, ' ');
    if (!raw) {
      toast.error('Escribe el nombre de la categoría');
      return;
    }
    const cat = raw.replace(/^\w/u, (c) => c.toUpperCase());
    pinCategoryChip(cat);
    setForm((f) => ({ ...f, category: cat }));
    setNewCategoryDraft('');
    setAddingCategory(false);
    const brandIds = form.selectedBrandIds.filter(Boolean);
    if (businessId && brandIds.length > 0 && !isWarehouseImportCategory(cat)) {
      void syncTpvOrganizersAfterCatalogImport(businessId, [{ brandIds, category: cat }]).then(async (r) => {
        if (r.updatedBrands <= 0) return;
        const next = await listBrandsRequest(businessId).catch(() => null);
        if (next) {
          onBrandsChange(next);
          notifyDeliveryBrandsChanged();
        }
      });
    }
  };

  const categoriesInUseKeys = useMemo(
    () =>
      new Set(
        catalogCategoriesInUse
          .map((c) => normalizeImportCategory(String(c || '')).toLowerCase())
          .filter(Boolean),
      ),
    [catalogCategoriesInUse],
  );

  const [deletingCategoryKey, setDeletingCategoryKey] = useState<string | null>(null);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<string | null>(null);

  const handleDeleteCategoryChip = (cat: string) => {
    const key = cat.toLowerCase();
    if (categoriesInUseKeys.has(key)) {
      toast.error(
        `No se puede eliminar «${cat}»: hay productos en esa categoría. Elimínalos o muévelos primero.`,
      );
      return;
    }
    setCategoryPendingDelete(cat);
  };

  const confirmDeleteCategoryChip = async () => {
    const cat = categoryPendingDelete;
    if (!cat) return;
    const key = cat.toLowerCase();
    setDeletingCategoryKey(key);
    try {
      setExtraCategories((prev) => prev.filter((c) => c.toLowerCase() !== key));
      setDismissedCategoryKeys((prev) => new Set(prev).add(key));
      if (normalizeImportCategory(form.category).toLowerCase() === key) {
        setForm((f) => ({ ...f, category: '' }));
      }
      if (businessId) {
        const updated = await removeCatalogCategoryFromBrands(businessId, cat);
        if (updated > 0) {
          const next = await listBrandsRequest(businessId).catch(() => null);
          if (next) {
            onBrandsChange(next);
            notifyDeliveryBrandsChanged();
          }
        }
      }
      toast.success(`Categoría «${cat}» eliminada`);
      setCategoryPendingDelete(null);
    } catch {
      toast.error('No se pudo eliminar la categoría. Inténtalo de nuevo.');
    } finally {
      setDeletingCategoryKey(null);
    }
  };

  const activeBrands = useMemo(
    () => sortBrandsForDisplay(brands.filter((b) => b.active !== false)),
    [brands],
  );

  const normalizedCategory = useMemo(
    () => normalizeImportCategory(form.category),
    [form.category],
  );
  const isSharedCatalogCategory = shouldClearBrandForCategory(normalizedCategory);

  useEffect(() => {
    if (!isOpen || editItem || !isSharedCatalogCategory) return;
    if (form.selectedBrandIds.length === 0) return;
    setForm((f) => ({ ...f, selectedBrandIds: [] }));
  }, [isOpen, editItem, isSharedCatalogCategory, form.selectedBrandIds.length]);

  const halfHalfCommercialBrands = useMemo(
    () => sortBrandsForDisplay(commercialLineBrands(brands.filter((b) => b.active !== false))),
    [brands],
  );

  const halfHalfFlavorCandidates = useMemo(
    () =>
      catalogHalfHalfFlavorCandidates(
        catalogItems,
        editItem?._id,
        form.halfHalfBrandId,
      ),
    [catalogItems, editItem?._id, form.halfHalfBrandId],
  );

  const formCatalogPreview = useMemo(
    () => ({
      category: form.category,
      name: form.name,
      brandIds: form.selectedBrandIds,
      itemType: form.itemType,
      customFields: editItem?.customFields,
    }),
    [form.category, form.name, form.selectedBrandIds, form.itemType, editItem?.customFields],
  );

  const duplicateCatalogItemByName = useMemo(
    () =>
      findCatalogDuplicateByName(catalogMenuItemsForDuplicateCheck, form.name.trim(), {
        excludeId: editItem?._id,
      }),
    [catalogMenuItemsForDuplicateCheck, form.name, editItem?._id],
  );

  const isSalePriceMissing = useMemo(() => {
    const raw = form.unitPrice.trim();
    if (!raw) return true;
    const value = Number(raw);
    return !Number.isFinite(value) || value <= 0;
  }, [form.unitPrice]);

  const showNameRequiredError = fieldErrorsShown && !form.name.trim();
  const showNameDuplicateError = fieldErrorsShown && Boolean(duplicateCatalogItemByName);
  const showSalePriceError = fieldErrorsShown && isSalePriceMissing;

  const buildYourOwnIngredientCandidates = useMemo(
    () =>
      form.buildYourOwn
        ? catalogBuildYourOwnIngredientOptions(
            formCatalogPreview,
            effectiveStoreIngredients,
            effectiveBrandIngredientSelection,
            brands,
          )
        : [],
    [
      form.buildYourOwn,
      formCatalogPreview,
      effectiveStoreIngredients,
      effectiveBrandIngredientSelection,
      brands,
    ],
  );

  const validateBuildYourOwnSelection = (): boolean => {
    if (!form.buildYourOwn || form.itemType !== 'product') return true;
    if (
      isBuildYourOwnIngredientSelectionInvalid(
        form.buildYourOwnAllowedIngredientIds,
        buildYourOwnIngredientCandidates.length,
      )
    ) {
      toast.error(
        'Producto al gusto: crea antes los ingredientes base en Catálogo → Ingredientes (sin precio extra).',
      );
      return false;
    }
    return true;
  };

  useModalClose(isOpen, onClose);

  // Modal alto + items-center dejaba el título fuera de vista (parecía abrir abajo).
  useEffect(() => {
    if (!isOpen) return;
    const scrollTop = () => {
      modalOverlayRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      const panel = modalPanelRef.current;
      if (!panel) return;
      panel.scrollTo({ top: 0, behavior: 'auto' });
      const body = panel.querySelector('[data-create-catalog-body]');
      if (body instanceof HTMLElement) body.scrollTo({ top: 0, behavior: 'auto' });
    };
    scrollTop();
    const raf = requestAnimationFrame(scrollTop);
    // autoFocus puede hacer scrollIntoView después del primer paint
    const t = window.setTimeout(scrollTop, 50);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [isOpen, step, editItem?._id]);

  const showComboBuilder =
    form.itemType === 'combo' || /combo/i.test(form.category.trim());
  const isServiceWizard = form.itemType === 'service' && !showComboBuilder;
  const createStepLabels = isServiceWizard
    ? ['Servicio', 'Foto y publicación']
    : showComboBuilder
      ? ['Producto', 'Qué incluye el menú', 'Foto y publicación']
      : CREATE_STEP_LABELS;
  const totalSteps = createStepLabels.length;
  const isEditMode = Boolean(editItem);
  const isCompositionStep = !isEditMode && !isServiceWizard && step === 2;

  useEffect(() => {
    if (isEditMode) return;
    if (step > totalSteps) setStep(totalSteps);
  }, [isEditMode, step, totalSteps]);

  /** Crear marca con el asistente de Ajustes; si el plan no da, CTA a facturación. */
  const handleNuevaMarcaCta = () => {
    if (!canAddCommercialBrand) {
      if (isIosCustomerAccessOnlyApp()) {
        toast.info(
          `Tu plan ${brandEntitlements.planLabel} no incluye más líneas comerciales. En iOS no se contratan ampliaciones.`,
        );
        return;
      }
      if (dataUserId) {
        writeBillingSelection(dataUserId, {
          selectedPlanId: 'pro',
          billingMode: 'monthly',
          requestedAddon: brandEntitlements.needsCommercialBrandAddon ? 'extra_brand' : null,
        });
      }
      onClose();
      navigate('/saas/settings/facturacion');
      return;
    }
    onClose();
    navigate('/saas/settings/marca?action=new-brand');
  };

  const selectBrand = (brandId: string) => {
    setForm((f) => ({
      ...f,
      selectedBrandIds: [brandId],
    }));
  };

  const selectItemType = (itemType: CatalogItem['itemType']) => {
    setForm((f) => ({
      ...f,
      itemType,
      ...(itemType === 'service'
        ? {
            category: f.category.trim() || CATALOG_SERVICE_CATEGORY,
            selectedBrandIds: [],
            buildYourOwn: false,
            buildYourOwnAllowedIngredientIds: [],
          }
        : {}),
      ...(itemType !== 'product'
        ? {
            buildYourOwn: false,
            buildYourOwnAllowedIngredientIds: [],
          }
        : {}),
    }));
  };

  const itemTypeOptions = isRestaurantCatalog
    ? [
        { value: 'product' as const, label: 'Producto', desc: 'Plato / bebida' },
        { value: 'service' as const, label: 'Servicio', desc: 'Cargo o suplemento' },
        { value: 'combo' as const, label: 'Combo', desc: 'Menú' },
      ]
    : [
        { value: 'product' as const, label: 'Producto', desc: 'Con stock' },
        { value: 'service' as const, label: 'Servicio', desc: 'Sin stock' },
        { value: 'combo' as const, label: 'Combo', desc: 'Menú' },
      ];

  const renderItemTypePicker = () => (
    <div>
      <label className={labelClass}>Qué es *</label>
      <div className="grid grid-cols-3 gap-2">
        {itemTypeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => selectItemType(option.value)}
            className={`rounded-xl border px-2.5 py-2.5 text-left transition-colors ${
              form.itemType === option.value
                ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white'
                : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:border-blue-200'
            }`}
          >
            <div className="text-xs font-bold leading-tight">{option.label}</div>
            <div
              className={`mt-0.5 text-[10px] leading-tight ${
                form.itemType === option.value ? 'text-white/80' : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              {option.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const handleFinalSubmit = async (keepOpen = false) => {
    setFieldErrorsShown(true);
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      if (!isEditMode) setStep(1);
      return;
    }
    if (!normalizedCategory.trim()) {
      toast.error('Indica la categoría del producto');
      if (!isEditMode) setStep(1);
      return;
    }
    if (form.halfHalf && !form.halfHalfBrandId.trim()) {
      toast.error('Elige la marca comercial para mitad y mitad');
      if (!isEditMode) setStep(1);
      return;
    }
    if (form.halfHalf && isHalfHalfFlavorSelectionInvalid(form.halfHalfAllowedProductIds)) {
      toast.error('Selecciona al menos 2 productos como sabores, o pulsa «Todas»');
      if (!isEditMode) setStep(1);
      return;
    }
    if (!validateBuildYourOwnSelection()) {
      if (!isEditMode) setStep(1);
      return;
    }
    const duplicateByName = findCatalogDuplicateByName(
      catalogMenuItemsForDuplicateCheck,
      form.name.trim(),
      { excludeId: editItem?._id },
    );
    if (duplicateByName) {
      toast.error(formatCatalogDuplicateNameError(duplicateByName));
      if (!isEditMode) setStep(1);
      return;
    }
    if (isSalePriceMissing) {
      toast.error('Indica el precio de venta del producto');
      if (!isEditMode) setStep(1);
      return;
    }
    if (form.itemType === 'service') {
      const serviceErr = validateCatalogServiceRules(form.serviceRules);
      if (serviceErr) {
        toast.error(serviceErr);
        if (!isEditMode) setStep(1);
        return;
      }
    }
    setSubmitting(true);
    try {
      const category =
        form.itemType === 'service'
          ? normalizeImportCategory(form.category.trim() || CATALOG_SERVICE_CATEGORY)
          : normalizedCategory;
      const brandIds =
        form.itemType === 'service'
          ? brandIdsForCatalogServiceSave(form.serviceRules)
          : resolveCatalogImportBrandIds(form.selectedBrandIds, category, brands, form.name.trim());
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
      const halfHalfAllowedIds = normalizeHalfHalfAllowedProductIds(form.halfHalfAllowedProductIds);
      const buildYourOwnAllowedIds = normalizeBuildYourOwnAllowedIngredientIds(
        form.buildYourOwnAllowedIngredientIds,
      );
      const rawIngredients = form.ingredients.trim();
      const normalizedIngredients =
        customizable && !form.buildYourOwn ? normalizeCatalogIngredientsForSave(rawIngredients) : '';
      if (customizable && !form.buildYourOwn && rawIngredients && !normalizedIngredients) {
        toast.warning(
          '«Ver carta» u otro texto no vale como ingrediente. Escribe los incluidos separados por comas (ej. Beyond, Queso vegano).',
          { duration: 8000 },
        );
      }
      const customFields = {
        ...(editItem?.customFields || {}),
        ...(customizable && !form.buildYourOwn
          ? {
              ingredients:
                recipePicks.length > 0
                  ? recipePicksToTpvIngredientsText(recipePicks)
                  : normalizedIngredients,
            }
          : {}),
        ...(form.itemType === 'combo' || /combo/i.test(category)
          ? {
              comboStructure:
                comboStructure.length > 0 ? comboStructure : defaultComboStructure.map((s) => ({ ...s })),
              comboStructureConfirmed: true,
            }
          : {}),
        ...(form.itemType === 'product' &&
        (form.halfHalf || /mitad\s*y\s*mitad/i.test(form.name.trim()))
          ? {
              halfHalf: true,
              buildYourOwn: false,
              halfHalfBrandId: normalizeHalfHalfBrandId(form.halfHalfBrandId),
              ...(halfHalfAllowedIds.length > 0
                ? { halfHalfAllowedProductIds: halfHalfAllowedIds }
                : { halfHalfAllowedProductIds: undefined }),
            }
          : form.itemType === 'product' && form.buildYourOwn
            ? {
                buildYourOwn: true,
                halfHalf: false,
                halfHalfAllowedProductIds: undefined,
                halfHalfBrandId: undefined,
                ...(buildYourOwnAllowedIds.length > 0
                  ? { buildYourOwnAllowedIngredientIds: buildYourOwnAllowedIds }
                  : { buildYourOwnAllowedIngredientIds: undefined }),
              }
            : form.itemType === 'product'
              ? {
                  halfHalf: false,
                  buildYourOwn: false,
                  halfHalfAllowedProductIds: undefined,
                  halfHalfBrandId: undefined,
                  buildYourOwnAllowedIngredientIds: undefined,
                }
              : {}),
      };
      // Extras de pago: solo Catálogo → Ingredientes (ya no por producto).
      delete customFields.supplements;
      if (form.itemType === 'service') {
        Object.assign(
          customFields,
          mergeCatalogServiceRulesIntoCustomFields({}, form.serviceRules),
        );
        delete customFields.ingredients;
        delete customFields.supplements;
        delete customFields.halfHalf;
        delete customFields.buildYourOwn;
        delete customFields.halfHalfAllowedProductIds;
        delete customFields.buildYourOwnAllowedIngredientIds;
        delete customFields.comboStructure;
        delete customFields.comboStructureConfirmed;
      }
      if (customFields.halfHalfAllowedProductIds === undefined) {
        delete customFields.halfHalfAllowedProductIds;
      }
      if (customFields.halfHalfBrandId === undefined) {
        delete customFields.halfHalfBrandId;
      }
      if (customFields.buildYourOwnAllowedIngredientIds === undefined) {
        delete customFields.buildYourOwnAllowedIngredientIds;
      }

      let payload: Partial<CatalogItem> = {
        ...editItem,
        name: form.name,
        description: form.description,
        category,
        brandIds,
        itemType: form.itemType,
        comboItems: form.itemType === 'combo' || /combo/i.test(category) ? comboItems : [],
        unitPrice: Number(form.unitPrice) || 0,
        taxRate: form.taxRate.trim() === '' ? (editItem?.taxRate ?? 21) : Number(form.taxRate),
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
      };

      if (form.itemType !== 'service') {
        const recipeLines = [
          ...recipePicksToLines(recipePicks),
          ...packagingPicksToLines(packagingPicks),
        ];
        if (recipeLines.length > 0) {
          const byId = storeIngredientsById(effectiveStoreIngredients);
          const inventoryCostByCatalogId = new Map<string, number>();
          for (const stock of modalPackagingItems) {
            inventoryCostByCatalogId.set(stock._id, Number(stock.costPrice) || 0);
          }
          payload = withProductCosting(
            payload as CatalogItem,
            { costingType: 'recipe', recipeLines },
            byId,
            brands,
            inventoryCostByCatalogId,
          );
        }
      }

      await onCreate(payload, keepOpen ? { keepOpen: true } : undefined);

      if (keepOpen && !isEditMode) {
        const savedName = form.name.trim();
        const savedPrice = Number(form.unitPrice) || 0;
        setSessionCreated((prev) => [...prev, { name: savedName, price: savedPrice }]);
        setComboItems([]);
        setComboStructure(defaultComboStructure.map((s) => ({ ...s })));
        setComboStructureConfirmed(true);
        setRecipePicks([]);
        setPackagingPicks([]);
        setFieldErrorsShown(false);
        setForm((f) => ({
          ...f,
          name: '',
          description: '',
          unitPrice: '',
          taxRate: '',
          staffPrice: '',
          costPrice: '',
          stockQuantity: '',
          minStock: '',
          image: '',
          allergens: [],
          notes: '',
          ingredients: '',
          halfHalf: false,
          buildYourOwn: false,
          halfHalfAllowedProductIds: [],
          halfHalfBrandId: '',
          buildYourOwnAllowedIngredientIds: [],
          serviceRules: { ...DEFAULT_CATALOG_SERVICE_RULES },
          webVisible: true,
          available: true,
        }));
        setStep(1);
        toast.success(`«${savedName}» guardado. Añade otro producto a «${category}».`);
      }
    } catch {
      // onCreate ya muestra el error al usuario
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoNext = () => {
    if (step === 1) {
      setFieldErrorsShown(true);
      if (!form.name.trim()) {
        toast.error('Indica el nombre del producto para continuar');
        return;
      }
      if (duplicateCatalogItemByName) {
        toast.error(formatCatalogDuplicateNameError(duplicateCatalogItemByName));
        return;
      }
      if (isSalePriceMissing) {
        toast.error('Indica el precio de venta para continuar');
        return;
      }
      if (form.itemType === 'service') {
        const serviceErr = validateCatalogServiceRules(form.serviceRules);
        if (serviceErr) {
          toast.error(serviceErr);
          return;
        }
      } else if (!normalizedCategory.trim()) {
        toast.error('Indica la categoría del producto para continuar');
        return;
      }
      if (form.halfHalf && !form.halfHalfBrandId.trim()) {
      toast.error('Elige la marca comercial para mitad y mitad');
      if (!isEditMode) setStep(1);
      return;
    }
    if (form.halfHalf && isHalfHalfFlavorSelectionInvalid(form.halfHalfAllowedProductIds)) {
        toast.error('Selecciona al menos 2 productos como sabores, o pulsa «Todas»');
        return;
      }
      if (!validateBuildYourOwnSelection()) return;
      if (
        form.buildYourOwn &&
        isBuildYourOwnIngredientSelectionInvalid(
          form.buildYourOwnAllowedIngredientIds,
          buildYourOwnIngredientCandidates.length,
        )
      ) {
        return;
      }
    }
    setFieldErrorsShown(false);
    setStep((s) => s + 1);
  };

  const renderBrandPicker = () => {
    if (isSharedCatalogCategory) {
      return (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
            Categoría compartida del TPV
          </p>
          <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 mt-0.5">
            «{normalizedCategory}» aparece en la pestaña compartida del TPV (sin línea comercial).
          </p>
        </div>
      );
    }
    return (
    <div>
      <label className={labelClass}>Marca comercial (opcional)</label>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
        Para platos de línea (pizza, burger, tacos…). Bebidas, complementos y postres van a su pestaña del TPV sin elegir marca aquí.
      </p>
      {activeBrands.length === 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
          Crea al menos una marca en Ajustes antes de asignar productos.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
          {activeBrands.map((b) => {
            const selected = form.selectedBrandIds.includes(b._id);
            const preset = getDeliveryBrandLinePreset(b.deliveryLineKind);
            const accent = b.primaryColor || preset?.primaryColor || '#2563eb';
            const lineLabel = b.deliveryLineKind ? deliveryBrandLineKindLabel(b.deliveryLineKind) : null;
            return (
              <button
                key={b._id}
                type="button"
                onClick={() => selectBrand(b._id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                  selected
                    ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500/20'
                    : 'border-stone-200 dark:border-stone-700 hover:border-blue-200 dark:hover:border-blue-700'
                }`}
              >
                {b.logo ? (
                  <img src={b.logo} alt="" className="w-7 h-7 rounded-md object-contain border border-stone-200 dark:border-stone-700 shrink-0" />
                ) : (
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ background: `linear-gradient(145deg, ${accent}, ${accent}cc)` }}
                  >
                    {b.name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-stone-900 dark:text-stone-100 truncate leading-tight">{b.name}</div>
                  {lineLabel ? (
                    <span className={`inline-block mt-0.5 text-[9px] font-semibold px-1 py-px rounded ${preset ? DELIVERY_BRAND_LINE_ICON_BOX[preset.id as keyof typeof DELIVERY_BRAND_LINE_ICON_BOX] : 'bg-stone-100 text-stone-600'}`}>
                      {lineLabel}
                    </span>
                  ) : (
                    <span className="text-[9px] text-stone-400">Sin tipo</span>
                  )}
                </div>
                {selected ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--v-blue,#2563eb)] shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={handleNuevaMarcaCta}
        className={`mt-1.5 text-[11px] font-semibold hover:underline inline-flex items-center gap-1 ${
          canAddCommercialBrand
            ? 'text-stone-600 dark:text-stone-300'
            : 'text-violet-700 dark:text-violet-300'
        }`}
      >
        <Plus className="w-3 h-3" />
        {canAddCommercialBrand
          ? 'Nueva marca'
          : brandEntitlements.needsCommercialBrandAddon
            ? 'Mejorar plan · nueva marca'
            : 'Pasar a PRO · nueva marca'}
      </button>
    </div>
    );
  };

  const renderCategoryUnit = () => {
    const selectedCategory = normalizeImportCategory(form.category);
    const selectedKey = selectedCategory.toLowerCase();
    const categoryFieldLabel = isRestaurantCatalog ? 'Organizador en la carta' : 'Categoría';

    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 space-y-2 dark:border-stone-700 dark:bg-stone-900/40">
        <label className="block text-xs font-bold text-stone-900 dark:text-stone-100">
          {categoryFieldLabel} *
        </label>

        {categoryChips.length > 0 || selectedCategory ? (
          <div className="flex flex-wrap gap-1.5">
            {categoryChips.map((cat) => {
              const key = cat.toLowerCase();
              const selected = key === selectedKey;
              const deleting = deletingCategoryKey === key;
              const canDelete = !categoriesInUseKeys.has(key);
              return (
                <span
                  key={cat}
                  className={`inline-flex items-center rounded-lg border text-stone-700 transition-colors dark:text-stone-300 ${
                    selected
                      ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white dark:text-white'
                      : 'border-stone-200 bg-white hover:border-blue-300 dark:border-stone-600 dark:bg-stone-900 dark:hover:border-blue-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectCategoryChip(cat)}
                    className={`py-1.5 pl-2.5 text-[11px] font-semibold leading-none ${
                      canDelete ? 'pr-1' : 'pr-2.5'
                    } ${selected ? 'text-white' : ''}`}
                  >
                    {cat}
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategoryChip(cat);
                      }}
                      title={`Quitar «${cat}» de la lista`}
                      aria-label={`Quitar categoría «${cat}»`}
                      className={`mr-1 flex h-4 w-4 items-center justify-center rounded transition-colors disabled:opacity-50 ${
                        selected
                          ? 'text-white/80 hover:bg-white/20 hover:text-white'
                          : 'text-stone-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400'
                      }`}
                    >
                      {deleting ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <X className="h-2.5 w-2.5" />
                      )}
                    </button>
                  ) : null}
                </span>
              );
            })}
            {!addingCategory ? (
              <button
                type="button"
                onClick={startAddCategory}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-blue-300 hover:text-[var(--v-blue,#2563eb)] dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300"
              >
                <Plus className="w-3 h-3" />
                Nueva categoría
              </button>
            ) : null}
          </div>
        ) : !addingCategory ? (
          <div className="flex flex-wrap gap-1.5">
            <p className="w-full text-xs text-stone-500 dark:text-stone-400">
              {isRestaurantCatalog
                ? 'Crea la primera categoría o impórtala con Excel.'
                : 'Crea la primera categoría.'}
            </p>
            <button
              type="button"
              onClick={startAddCategory}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-blue-300 hover:text-[var(--v-blue,#2563eb)] dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300"
            >
              <Plus className="w-3 h-3" />
              Nueva categoría
            </button>
          </div>
        ) : null}

        {addingCategory ? (
          <div className="rounded-lg border border-dashed border-blue-200 bg-white p-2.5 space-y-2 dark:border-blue-800 dark:bg-stone-900">
            <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">Nueva categoría</p>
            <input
              className={`${inputClass} !py-2 text-sm ${VERTIAL_FOCUS_RING}`}
              placeholder={isRestaurantCatalog ? 'Ej. Tapas, Bebidas, Combos…' : 'Nombre de la categoría…'}
              value={newCategoryDraft}
              autoFocus
              onChange={(e) => setNewCategoryDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitNewCategoryChip();
                }
                if (e.key === 'Escape') {
                  setAddingCategory(false);
                  setNewCategoryDraft('');
                }
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={commitNewCategoryChip} className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-1.5 text-xs`}>
                Crear y usar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingCategory(false);
                  setNewCategoryDraft('');
                }}
                className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-1.5 text-xs`}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderHalfHalfProductToggle = () => {
    if (form.itemType !== 'product') return null;
    return (
      <button
        type="button"
        onClick={() =>
          setForm((f) => {
            const enabling = !f.halfHalf;
            const defaultBrand =
              normalizeHalfHalfBrandId(f.halfHalfBrandId) ||
              f.selectedBrandIds[0] ||
              halfHalfCommercialBrands[0]?._id ||
              '';
            return {
              ...f,
              halfHalf: enabling,
              buildYourOwn: false,
              buildYourOwnAllowedIngredientIds: [],
              halfHalfBrandId: enabling ? defaultBrand : '',
              halfHalfAllowedProductIds: enabling ? f.halfHalfAllowedProductIds : [],
            };
          })
        }
        className={`w-full px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
          form.halfHalf
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/25'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Mitad y mitad
              <span className="ml-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">½½</span>
            </p>
            <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400 mt-0.5">
              En TPV se eligen 2 productos de la carta · un solo precio
            </p>
          </div>
          <div
            className={`w-9 h-5 rounded-full relative shrink-0 ${
              form.halfHalf ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                form.halfHalf ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </div>
        </div>
      </button>
    );
  };

  const toggleHalfHalfFlavor = (productId: string) => {
    setForm((f) => {
      const selected = f.halfHalfAllowedProductIds.includes(productId);
      const next = selected
        ? f.halfHalfAllowedProductIds.filter((id) => id !== productId)
        : [...f.halfHalfAllowedProductIds, productId];
      return { ...f, halfHalfAllowedProductIds: next };
    });
  };

  const renderHalfHalfPizzaPicker = () => {
    if (!form.halfHalf || form.itemType !== 'product') return null;

    const selectedCount = form.halfHalfAllowedProductIds.length;
    const usingAll = selectedCount === 0;
    const scopeBrand = halfHalfCommercialBrands.find((b) => b._id === form.halfHalfBrandId);

    return (
      <section className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
        <div>
          <p className="font-bold text-gray-900 dark:text-gray-100">Mitad y mitad · marca y productos</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Elige la marca comercial y qué productos de esa línea puede combinar el cliente en TPV. Si no
            marcas ninguno, se usarán todos los de la marca.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Marca comercial</label>
          {halfHalfCommercialBrands.length === 0 ? (
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
              Crea al menos una marca comercial en Ajustes antes de configurar mitad y mitad.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 mt-1.5 max-h-32 overflow-y-auto">
              {halfHalfCommercialBrands.map((b) => {
                const selected = form.halfHalfBrandId === b._id;
                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        halfHalfBrandId: b._id,
                        halfHalfAllowedProductIds: [],
                      }))
                    }
                    className={`rounded-lg border-2 px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                      selected
                        ? 'border-amber-600 bg-white dark:bg-gray-900 text-amber-950 dark:text-amber-100'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!form.halfHalfBrandId.trim() ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">Selecciona una marca para ver sus productos.</p>
        ) : halfHalfFlavorCandidates.length === 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {scopeBrand
              ? `Aún no hay productos de «${scopeBrand.name}» en el catálogo. Créalos o asígnalos a esa marca primero.`
              : 'No hay productos disponibles para esta marca.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, halfHalfAllowedProductIds: [] }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${
                  usingAll
                    ? 'border-amber-600 bg-amber-200 dark:bg-amber-900/50 text-amber-950 dark:text-amber-100'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                Todas ({halfHalfFlavorCandidates.length})
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    halfHalfAllowedProductIds: halfHalfFlavorCandidates.map((p) => p._id),
                  }))
                }
                className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
              >
                Seleccionar todas
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, halfHalfAllowedProductIds: [] }))}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
              >
                Limpiar
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto grid grid-cols-2 gap-2">
              {halfHalfFlavorCandidates.map((product) => {
                const checked =
                  usingAll || form.halfHalfAllowedProductIds.includes(product._id);
                return (
                  <button
                    key={product._id}
                    type="button"
                    onClick={() => {
                      if (usingAll) {
                        setForm((f) => ({
                          ...f,
                          halfHalfAllowedProductIds: halfHalfFlavorCandidates
                            .map((p) => p._id)
                            .filter((id) => id !== product._id),
                        }));
                        return;
                      }
                      toggleHalfHalfFlavor(product._id);
                    }}
                    className={`rounded-xl border-2 p-2.5 text-left text-sm transition-colors ${
                      checked
                        ? 'border-amber-500 bg-white dark:bg-gray-900'
                        : 'border-gray-200 dark:border-gray-700 opacity-70'
                    }`}
                  >
                    <span className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                      {product.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {!usingAll && isHalfHalfFlavorSelectionInvalid(form.halfHalfAllowedProductIds) ? (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                Selecciona al menos 2 productos o pulsa «Todas».
              </p>
            ) : null}
          </>
        )}

        <p className="text-xs text-gray-600 dark:text-gray-400 border-t border-amber-200 dark:border-amber-800 pt-3">
          Stock: al vender mitad y mitad se descuenta el escandallo de este artículo, no el de los dos productos
          elegidos. Configúralo en la pestaña Escandallo.
        </p>
      </section>
    );
  };

  const renderBuildYourOwnProductToggle = () => {
    if (form.itemType !== 'product') return null;
    return (
      <button
        type="button"
        onClick={() =>
          setForm((f) => ({
            ...f,
            buildYourOwn: !f.buildYourOwn,
            halfHalf: false,
            halfHalfAllowedProductIds: [],
            halfHalfBrandId: '',
            buildYourOwnAllowedIngredientIds: [],
          }))
        }
        className={`w-full px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
          form.buildYourOwn
            ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/25'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Producto al gusto</p>
            <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400 mt-0.5">
              En TPV se eligen los ingredientes base · precio fijo del producto
            </p>
          </div>
          <div className={`w-9 h-5 rounded-full relative shrink-0 ${form.buildYourOwn ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.buildYourOwn ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </div>
      </button>
    );
  };

  const renderProductConfiguratorOptions = () => {
    if (form.itemType !== 'product') return null;
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          Opciones TPV (opcional)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {renderBuildYourOwnProductToggle()}
          {renderHalfHalfProductToggle()}
        </div>
      </div>
    );
  };

  const toggleBuildYourOwnIngredient = (ingredientId: string) => {
    setForm((f) => {
      const selected = f.buildYourOwnAllowedIngredientIds.includes(ingredientId);
      const next = selected
        ? f.buildYourOwnAllowedIngredientIds.filter((id) => id !== ingredientId)
        : [...f.buildYourOwnAllowedIngredientIds, ingredientId];
      return { ...f, buildYourOwnAllowedIngredientIds: next };
    });
  };

  const foldIngredientNameKey = (s: string) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

  /** Alta enlazada: config TPV + sync almacén. Devuelve el ingrediente creado. */
  const persistLinkedStoreIngredient = async (opts: {
    name: string;
    baseCost?: number;
    unit?: string;
    flags?: { chargeExtra: boolean; allowRemove: boolean };
    successToast?: string;
  }): Promise<StoreIngredient | null> => {
    const name = opts.name.trim().replace(/\s+/g, ' ');
    if (!name) {
      toast.error('Escribe el nombre del ingrediente');
      return null;
    }
    if (!dataUserId) {
      toast.error('No hay cuenta de datos para guardar el ingrediente');
      return null;
    }

    const lineBrands = commercialLineBrands(brands);
    const brandIds =
      form.selectedBrandIds.length > 0
        ? form.selectedBrandIds.filter(Boolean)
        : lineBrands.map((b) => b._id);
    if (lineBrands.length > 0 && brandIds.length === 0) {
      toast.error('Selecciona la marca del producto antes de crear el ingrediente');
      return null;
    }

    const nameKey = foldIngredientNameKey(name);
    const duplicate = effectiveStoreIngredients.some((ing) => {
      if (foldIngredientNameKey(ing.name) !== nameKey) return false;
      const assigned = Array.isArray(ing.brandIds) ? ing.brandIds.filter(Boolean) : [];
      if (assigned.length === 0 || brandIds.length === 0) return true;
      return brandIds.some((id) => assigned.includes(id));
    });
    if (duplicate) {
      toast.error(`Ya existe «${name}» en los ingredientes de esta línea`);
      return null;
    }

    const parts = new Set<TpvCategoryTemplateKey>();
    for (const id of brandIds) {
      const brand = brands.find((b) => b._id === id);
      if (!brand) continue;
      for (const key of resolveBrandTpvCategoryKeys(brand)) {
        if (key === 'pizzas' || key === 'hamburguesas') parts.add(key);
      }
    }
    const productParts: TpvCategoryTemplateKey[] =
      parts.size > 0 ? [...parts] : ['pizzas', 'hamburguesas'];

    const flags = opts.flags ?? { chargeExtra: false, allowRemove: true };
    const unit = String(opts.unit || 'kg').trim().toLowerCase() || 'kg';
    let created = withStoreIngredientTpvFlags(
      {
        id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        escandalloOnly: !flags.allowRemove && !flags.chargeExtra,
        unit,
        ...(brandIds.length > 0 ? { brandIds: [...brandIds] } : {}),
        productParts,
        ...(opts.baseCost != null && Number.isFinite(opts.baseCost) && opts.baseCost >= 0
          ? { baseCost: Math.round(opts.baseCost * 100) / 100 }
          : {}),
      },
      flags,
    );
    if (created.baseCost == null) {
      created = withVertialDefaultBaseCost(created, brands);
    }

    // UI al instante; CouchDB + almacén en segundo plano.
    setModalStoreIngredients((prev) => {
      const base = prev.length > 0 ? prev : storeIngredients;
      if (base.some((ing) => ing.id === created.id)) {
        return prev.length > 0 ? prev : normalizeStoreIngredients(base);
      }
      return normalizeStoreIngredients([...base, created]);
    });

    const createdId = created.id;
    const lineBrandIds = lineBrands.map((b) => b._id);
    void (async () => {
      try {
        const cfg = await getDeliveryConfigRequest(dataUserId);
        const current = unifyStoreIngredientsFromConfig(cfg, lineBrandIds);
        const nextRows = current.some((ing) => ing.id === createdId)
          ? normalizeStoreIngredients(current)
          : normalizeStoreIngredients([...current, created]);

        await updateDeliveryConfigRequest(dataUserId, {
          _id: cfg?._id || `dlvconf-${normalizeTenantUserId(dataUserId)}`,
          _rev: cfg?._rev,
          storeIngredients: nextRows,
        } as Parameters<typeof updateDeliveryConfigRequest>[1]);

        await syncInventoryCatalogFromSources(dataUserId, {
          businessType: isRestaurantCatalog ? 'restaurant' : 'delivery',
          businessId: businessId || undefined,
          storeIngredients: nextRows,
          brands: lineBrands.map((b) => ({ _id: b._id, deliveryLineKind: b.deliveryLineKind })),
          inventorySyncExcludedKeys: Array.isArray(cfg?.inventorySyncExcludedKeys)
            ? cfg.inventorySyncExcludedKeys
            : undefined,
        }).catch(() => null);

        notifyDeliveryConfigChanged();
        notifyDeliveryCatalogChanged(dataUserId, businessId);
        setModalStoreIngredients(nextRows);
        void reloadModalTpvIngredients();
        toast.success(opts.successToast || `«${name}» creado: TPV + almacén`);
      } catch (err) {
        setModalStoreIngredients((prev) => prev.filter((ing) => ing.id !== createdId));
        setRecipePicks((prev) => prev.filter((p) => p.storeIngredientId !== createdId));
        toast.error(err instanceof Error ? err.message : 'No se pudo guardar el ingrediente');
      }
    })();

    return created;
  };

  /** Alta base TPV + sync almacén (mismas conexiones que Catálogo → Ingredientes). */
  const createByoBaseIngredient = async () => {
    setCreatingByoIngredient(true);
    try {
      const created = await persistLinkedStoreIngredient({
        name: newByoIngredientName,
        flags: { chargeExtra: false, allowRemove: true },
        successToast: `«${newByoIngredientName.trim()}» creado: TPV (base) + almacén`,
      });
      if (!created) return;
      setNewByoIngredientName('');
      setShowCreateByoIngredient(false);
      setForm((f) => {
        if (f.buildYourOwnAllowedIngredientIds.length === 0) return f;
        if (f.buildYourOwnAllowedIngredientIds.includes(created.id)) return f;
        return {
          ...f,
          buildYourOwnAllowedIngredientIds: [...f.buildYourOwnAllowedIngredientIds, created.id],
        };
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el ingrediente');
    } finally {
      setCreatingByoIngredient(false);
    }
  };

  const createRecipeLinkedIngredient = async (input: {
    name: string;
    baseCost?: number;
    unit?: string;
  }): Promise<StoreIngredient | null> => {
    setCreatingRecipeIngredient(true);
    try {
      return await persistLinkedStoreIngredient({
        name: input.name,
        baseCost: input.baseCost,
        unit: input.unit || 'kg',
        flags: { chargeExtra: false, allowRemove: false },
        successToast: `«${input.name.trim()}» creado: escandallo + almacén`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el ingrediente');
      return null;
    } finally {
      setCreatingRecipeIngredient(false);
    }
  };

  const createLinkedPackaging = async (input: {
    name: string;
  }): Promise<{ _id: string; name: string; unit?: string } | null> => {
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (!name) {
      toast.error('Escribe el nombre del envase');
      return null;
    }
    if (!dataUserId) {
      toast.error('No hay cuenta de datos para guardar el envase');
      return null;
    }
    const nameKey = foldIngredientNameKey(name);
    const duplicate = modalPackagingItems.find(
      (item) => foldIngredientNameKey(item.name) === nameKey,
    );
    if (duplicate) {
      toast.message(`«${duplicate.name}» ya estaba en envases`);
      return { _id: duplicate._id, name: duplicate.name, unit: duplicate.unit || 'ud' };
    }

    setCreatingPackaging(true);
    try {
      const created = await createCatalogItemRequest(dataUserId, {
        name,
        category: 'Envases',
        module: 'stock',
        itemType: 'product',
        vertical: 'delivery',
        business_id: businessId || undefined,
        stockCategory: 'packaging',
        isStockItem: true,
        unit: 'ud',
        minStock: 0,
        costPrice: 0,
        stockQuantity: 0,
        active: true,
        available: true,
        webVisible: false,
        customFields: {
          inventoryOrganizerId: ORGANIZER_PACKAGING,
        },
      } as Partial<CatalogItem>);
      setModalPackagingItems((prev) => {
        if (prev.some((p) => p._id === created._id)) return prev;
        return [...prev, created];
      });
      notifyDeliveryCatalogChanged(dataUserId, businessId);
      toast.success(`Envase «${name}» creado en almacén`);
      return { _id: created._id, name: created.name, unit: created.unit || 'ud' };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el envase');
      return null;
    } finally {
      setCreatingPackaging(false);
    }
  };

  const renderBuildYourOwnIngredientPicker = () => {
    if (!form.buildYourOwn || form.itemType !== 'product') return null;

    const selectedCount = form.buildYourOwnAllowedIngredientIds.length;
    const usingAll = selectedCount === 0;

    return (
      <section className="rounded-2xl border-2 border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/20 p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-gray-900 dark:text-gray-100">Ingredientes disponibles en TPV</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Marca qué ingredientes base puede elegir el cliente. Si no marcas ninguno, se usarán todos los de la línea.
            </p>
          </div>
          {!showCreateByoIngredient ? (
            <button
              type="button"
              onClick={() => setShowCreateByoIngredient(true)}
              disabled={modalIngredientsLoading || creatingByoIngredient}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-dashed border-orange-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-orange-800 transition-colors hover:border-orange-500 hover:bg-orange-50 disabled:opacity-50 dark:border-orange-800 dark:bg-stone-900 dark:text-orange-200"
            >
              <Plus className="w-3 h-3" />
              Crear ingrediente
            </button>
          ) : null}
        </div>

        {showCreateByoIngredient ? (
          <div className="rounded-xl border border-dashed border-orange-300 bg-white p-3 space-y-2 dark:border-orange-800 dark:bg-stone-900">
            <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">Nuevo ingrediente base</p>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Se guarda en Catálogo → Ingredientes (TPV), se enlaza a la marca del producto y se crea en almacén.
            </p>
            <input
              className={`${inputClass} !py-2 text-sm`}
              placeholder="Ej. Mozzarella, Bacon…"
              value={newByoIngredientName}
              autoFocus
              disabled={creatingByoIngredient}
              onChange={(e) => setNewByoIngredientName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void createByoBaseIngredient();
                }
                if (e.key === 'Escape') {
                  setShowCreateByoIngredient(false);
                  setNewByoIngredientName('');
                }
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => void createByoBaseIngredient()}
                disabled={creatingByoIngredient || !newByoIngredientName.trim()}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-1.5 text-xs disabled:opacity-50 inline-flex items-center gap-1.5`}
              >
                {creatingByoIngredient ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {creatingByoIngredient ? 'Guardando…' : 'Crear y usar'}
              </button>
              <button
                type="button"
                disabled={creatingByoIngredient}
                onClick={() => {
                  setShowCreateByoIngredient(false);
                  setNewByoIngredientName('');
                }}
                className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-1.5 text-xs`}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {buildYourOwnIngredientCandidates.length === 0 ? (
          <p className="text-sm text-orange-800 dark:text-orange-300">
            {modalIngredientsLoading ? (
              'Cargando ingredientes del TPV…'
            ) : (
              <>
                Aún no hay ingredientes base. Crea uno aquí o en Catálogo → <strong>Ingredientes</strong>.
              </>
            )}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, buildYourOwnAllowedIngredientIds: [] }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${
                  usingAll
                    ? 'border-orange-600 bg-orange-200 dark:bg-orange-900/50 text-orange-950 dark:text-orange-100'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                Todos ({buildYourOwnIngredientCandidates.length})
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto grid grid-cols-2 gap-1.5">
              {buildYourOwnIngredientCandidates.map((ing) => {
                const checked =
                  usingAll || form.buildYourOwnAllowedIngredientIds.includes(ing.id);
                return (
                  <button
                    key={ing.id}
                    type="button"
                    onClick={() => {
                      if (usingAll) {
                        setForm((f) => ({
                          ...f,
                          buildYourOwnAllowedIngredientIds: buildYourOwnIngredientCandidates
                            .map((row) => row.id)
                            .filter((id) => id !== ing.id),
                        }));
                        return;
                      }
                      toggleBuildYourOwnIngredient(ing.id);
                    }}
                    className={`rounded-xl border-2 p-2 text-left text-sm transition-colors ${
                      checked
                        ? 'border-orange-500 bg-white dark:bg-gray-900'
                        : 'border-gray-200 dark:border-gray-700 opacity-70'
                    }`}
                  >
                    <span className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                      {ing.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <p className="text-xs text-gray-600 dark:text-gray-400 border-t border-orange-200 dark:border-orange-800 pt-2.5">
          En TPV el cliente toca los ingredientes que quiere añadir. Precio fijo del producto.
        </p>
      </section>
    );
  };

  const toggleAllergen = (a: string) => {
    setForm(f => ({
      ...f,
      allergens: f.allergens.includes(a) ? f.allergens.filter(x => x !== a) : [...f.allergens, a],
    }));
  };

  const inputClass = 'w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1';

  const renderComboBuilderSection = () => {
    if (!showComboBuilder) return null;
    return (
      <section>
        <CatalogComboCompositionEditor
          compact
          restaurantCatalog={isRestaurantCatalog}
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
    if (form.itemType === 'service') return null;
    if (form.buildYourOwn) {
      return (
        <section className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/20 px-3 py-2.5">
            <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">
              Producto al gusto
            </p>
            <p className="text-xs text-orange-800/90 dark:text-orange-300/90 mt-0.5">
              Los ingredientes base se eligen en el paso 1. Los extras de pago se configuran en{' '}
              <strong className="font-semibold">Catálogo → Ingredientes</strong>.
            </p>
          </div>
          {!isRestaurantCatalog ? (
            <CatalogProductPackagingPicker
              picks={packagingPicks}
              onChange={setPackagingPicks}
              packagingItems={modalPackagingItems}
              compact
              onCreatePackaging={createLinkedPackaging}
              creatingPackaging={creatingPackaging}
            />
          ) : null}
        </section>
      );
    }
    return (
      <section className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
        <CatalogProductRecipePicker
          picks={recipePicks}
          onChange={setRecipePicks}
          storeIngredients={effectiveStoreIngredients}
          brands={brands}
          brandIds={form.selectedBrandIds}
          salePrice={Number(form.unitPrice) || 0}
          compact
          onCreateIngredient={createRecipeLinkedIngredient}
          creatingIngredient={creatingRecipeIngredient}
        />
        {!isRestaurantCatalog ? (
          <CatalogProductPackagingPicker
            picks={packagingPicks}
            onChange={setPackagingPicks}
            packagingItems={modalPackagingItems}
            compact
            onCreatePackaging={createLinkedPackaging}
            creatingPackaging={creatingPackaging}
          />
        ) : null}
      </section>
    );
  };

  const catalogFormPreviewImage = useMemo(
    () =>
      resolveCatalogProductImage({
        name: form.name || editItem?.name || '',
        category: form.category || editItem?.category || '',
        itemType: form.itemType || editItem?.itemType,
        image: form.image || editItem?.image,
      }),
    [form.name, form.category, form.itemType, form.image, editItem],
  );

  const productPhotoInputRef = useRef<HTMLInputElement>(null);
  const hasCustomProductPhoto = Boolean(String(form.image || '').trim());

  const handleProductPhotoFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Elige una imagen (JPG, PNG o WebP)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La foto pesa más de 2 MB. Comprímela o usa una URL.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        toast.error('No se pudo leer la imagen');
        return;
      }
      setForm((f) => ({ ...f, image: dataUrl }));
    };
    reader.onerror = () => toast.error('No se pudo leer la imagen');
    reader.readAsDataURL(file);
  };

  const renderProductPhotoField = (opts?: { autoFocus?: boolean }) => (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Foto del producto</label>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-2">
          Cuadrado recomendado para web y TPV:{' '}
          <strong className="text-stone-800 dark:text-stone-200">
            {CATALOG_PRODUCT_IMAGE_PX} × {CATALOG_PRODUCT_IMAGE_PX} px
          </strong>
          . Puedes subir un archivo o pegar una URL.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
        <button
          type="button"
          onClick={() => productPhotoInputRef.current?.click()}
          className="relative w-44 h-44 shrink-0 rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-900/60 overflow-hidden hover:border-[var(--v-blue,#2563eb)] hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
          title={`Subir foto ${CATALOG_PRODUCT_IMAGE_PX}×${CATALOG_PRODUCT_IMAGE_PX} px`}
        >
          {hasCustomProductPhoto ? (
            <img src={catalogFormPreviewImage} alt="Vista previa" className="w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center">
              <ImagePlus className="w-8 h-8 text-stone-400" />
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">Añadir foto</span>
              <span className="text-[11px] font-bold tabular-nums text-stone-500 dark:text-stone-400">
                {CATALOG_PRODUCT_IMAGE_PX} × {CATALOG_PRODUCT_IMAGE_PX} px
              </span>
            </span>
          )}
          {hasCustomProductPhoto ? (
            <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold py-1 text-center tabular-nums">
              {CATALOG_PRODUCT_IMAGE_PX} × {CATALOG_PRODUCT_IMAGE_PX} px
            </span>
          ) : null}
        </button>
        <div className="flex-1 w-full space-y-2 min-w-0">
          <input
            ref={productPhotoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              handleProductPhotoFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => productPhotoInputRef.current?.click()}
            className={`${VERTIAL_BTN_SECONDARY} w-full sm:w-auto`}
          >
            <Upload className="w-4 h-4" />
            Elegir archivo
          </button>
          {hasCustomProductPhoto ? (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, image: '' }))}
              className="block text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              Quitar foto
            </button>
          ) : null}
          <div>
            <label className={`${labelClass} !mb-1`}>O URL de imagen</label>
            <input
              className={inputClass}
              placeholder="https://ejemplo.com/foto.jpg"
              value={form.image.startsWith('data:') ? '' : form.image}
              onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
              autoFocus={opts?.autoFocus}
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
    <div
      ref={modalOverlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-3 sm:pt-5 px-2 sm:px-4 pb-3 bg-black/40 backdrop-blur-sm"
    >
      <div
        ref={modalPanelRef}
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden ${
          showComboBuilder && (isEditMode || isCompositionStep) ? 'max-w-3xl' : 'max-w-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 bg-white dark:bg-gray-800 z-10 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editItem
                  ? form.itemType === 'service'
                    ? 'Editar servicio'
                    : 'Editar producto'
                  : form.itemType === 'service'
                    ? 'Nuevo servicio'
                    : 'Nuevo producto'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {editItem
                  ? form.itemType === 'service'
                    ? 'Nombre, precio y reglas de aplicación del servicio'
                    : 'Marca, categoría y precios vinculados a tus líneas comerciales'
                  : `Paso ${step} de ${totalSteps} — ${createStepLabels[step - 1]}`}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors shrink-0">
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
            <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Producto que estas editando
              </p>
              <div className="mt-1.5 flex items-start gap-3">
                <img
                  src={catalogFormPreviewImage}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                />
                <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
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
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Precio</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {String(form.unitPrice || '').trim()
                      ? `${Number(form.unitPrice).toFixed(2)}€`
                      : '—'}
                  </p>
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

        {/* Step content — solo el cuerpo hace scroll si hace falta */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4" data-create-catalog-body>
          {isEditMode ? (
            <div className="space-y-6">
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {form.itemType === 'service' ? 'Servicio' : 'Producto'}
                </h3>
                {renderItemTypePicker()}
                <div>
                  <label className={labelClass}>
                    {form.itemType === 'service' ? 'Nombre del servicio *' : 'Nombre del producto *'}
                  </label>
                  <input
                    className={`${inputClass}${showNameRequiredError || showNameDuplicateError ? ' border-red-400 dark:border-red-500 focus:border-red-500' : ''}`}
                    placeholder={
                      form.itemType === 'service'
                        ? 'Ej: Corte de pizza, Envío a domicilio…'
                        : 'Ej: Hamburguesa clásica, Coca-Cola 33cl...'
                    }
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  {showNameDuplicateError ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {formatCatalogDuplicateNameError(duplicateCatalogItemByName)}
                    </p>
                  ) : showNameRequiredError ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {form.itemType === 'service'
                        ? 'Indica el nombre del servicio.'
                        : 'Indica el nombre del producto.'}
                    </p>
                  ) : null}
                </div>
                {form.itemType === 'service' ? (
                  <>
                    <CatalogServiceRulesFields
                      rules={form.serviceRules}
                      onChange={(serviceRules) => setForm((f) => ({ ...f, serviceRules }))}
                      brands={brands}
                      showValidation={fieldErrorsShown}
                    />
                    <p className="text-[10px] text-stone-500 dark:text-stone-400">
                      Categoría en catálogo: «{form.category.trim() || CATALOG_SERVICE_CATEGORY}»
                    </p>
                  </>
                ) : (
                  <>
                    {renderCategoryUnit()}
                    {renderProductConfiguratorOptions()}
                    {renderBuildYourOwnIngredientPicker()}
                    {renderHalfHalfPizzaPicker()}
                    {renderBrandPicker()}
                  </>
                )}
              </section>
              {form.itemType !== 'service' ? renderCustomizationSection() : null}
              {form.itemType !== 'service' ? renderComboBuilderSection() : null}
              <section className="space-y-5 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Precios e inventario</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Precio venta (€) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={`${inputClass}${showSalePriceError ? ' border-red-400 dark:border-red-500 focus:border-red-500' : ''}`}
                      placeholder="0.00"
                      value={form.unitPrice}
                      onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                    />
                    {showSalePriceError ? (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        Indica el precio de venta para guardar.
                      </p>
                    ) : null}
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
                {renderProductPhotoField()}
                <div>
                  <label className={labelClass}>Descripción</label>
                  <textarea rows={3} className={`${inputClass} resize-none`} placeholder="Descripción detallada del producto..." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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
            <div className="space-y-3">
              {sessionCreated.length > 0 ? (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    {sessionCreated.length}{' '}
                    {form.itemType === 'service' ? 'servicio(s)' : 'producto(s)'} guardado(s) en «
                    {form.itemType === 'service'
                      ? CATALOG_SERVICE_CATEGORY
                      : normalizedCategory || form.category || 'esta sección'}
                    »
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-emerald-900 dark:text-emerald-200">
                    {sessionCreated.slice(-4).map((item) => (
                      <li key={`${item.name}-${item.price}`}>
                        {item.name} · {item.price.toFixed(2)}€
                      </li>
                    ))}
                    {sessionCreated.length > 4 ? (
                      <li className="text-emerald-700 dark:text-emerald-400">+{sessionCreated.length - 4} más</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {renderItemTypePicker()}

              <div>
                <label className={labelClass}>Nombre *</label>
                <input
                  className={`${inputClass}${showNameRequiredError || showNameDuplicateError ? ' border-red-400 dark:border-red-500 focus:border-red-500' : ''}`}
                  placeholder={
                    form.itemType === 'service'
                      ? 'Ej: Corte de pizza, Envío a domicilio, Servicio terraza…'
                      : 'Ej: Margarita, Coca-Cola 33cl…'
                  }
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
                {showNameDuplicateError ? (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {formatCatalogDuplicateNameError(duplicateCatalogItemByName)}
                  </p>
                ) : showNameRequiredError ? (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {form.itemType === 'service'
                      ? 'Indica el nombre del servicio para continuar.'
                      : 'Indica el nombre del producto para continuar.'}
                  </p>
                ) : null}
              </div>

              {form.itemType === 'service' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Precio (€) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className={`${inputClass}${showSalePriceError ? ' border-red-400 dark:border-red-500 focus:border-red-500' : ''}`}
                        placeholder="0.00"
                        value={form.unitPrice}
                        onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                      />
                      {showSalePriceError ? (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          Indica el precio para continuar.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className={labelClass}>Precio empleado (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass}
                        placeholder="Opcional"
                        value={form.staffPrice}
                        onChange={(e) => setForm((f) => ({ ...f, staffPrice: e.target.value }))}
                      />
                    </div>
                  </div>
                  <CatalogServiceRulesFields
                    rules={form.serviceRules}
                    onChange={(serviceRules) => setForm((f) => ({ ...f, serviceRules }))}
                    brands={brands}
                    showValidation={fieldErrorsShown}
                  />
                  <p className="text-[10px] text-stone-500 dark:text-stone-400">
                    Se listará en catálogo bajo «{CATALOG_SERVICE_CATEGORY}». El motor TPV aplicará las reglas en una
                    fase posterior.
                  </p>
                </>
              ) : (
                <>
                  {renderCategoryUnit()}
                  {renderProductConfiguratorOptions()}
                  {renderBuildYourOwnIngredientPicker()}
                  {renderHalfHalfPizzaPicker()}
                  {renderBrandPicker()}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Precio venta (€) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className={`${inputClass}${showSalePriceError ? ' border-red-400 dark:border-red-500 focus:border-red-500' : ''}`}
                        placeholder="0.00"
                        value={form.unitPrice}
                        onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                      />
                      {showSalePriceError ? (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          Indica el precio de venta para continuar.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className={labelClass}>Precio empleado (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass}
                        placeholder="Opcional"
                        value={form.staffPrice}
                        onChange={(e) => setForm((f) => ({ ...f, staffPrice: e.target.value }))}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-500 dark:text-stone-400 -mt-2">
                    Precio empleado solo si vendes más barato al personal. IVA como hasta ahora.
                  </p>
                </>
              )}
            </div>
          ) : isCompositionStep ? (
            <div className="space-y-4">
              {showComboBuilder ? (
                renderComboBuilderSection()
              ) : (
                renderCustomizationSection()
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {isServiceWizard ? (
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Foto, descripción y visibilidad. Las reglas ya quedaron en el paso anterior.
                </p>
              ) : null}
              {renderProductPhotoField({ autoFocus: true })}
              <div>
                <label className={labelClass}>Descripción</label>
                <textarea
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="Opcional: ingredientes, tamaño, etc."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
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
                {form.itemType === 'service' ? (
                  <p className="text-[11px] text-violet-700 dark:text-violet-300 mt-1">
                    {summarizeCatalogServiceRules(form.serviceRules)}
                  </p>
                ) : null}
                {form.description.trim() ? (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{form.description}</p>
                ) : null}
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                  {String(form.unitPrice || '').trim()
                    ? `${Number(form.unitPrice).toFixed(2)}€`
                    : 'Sin precio'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-gray-50 dark:bg-gray-900 px-3 py-3 sm:px-4 sm:py-3.5 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 sm:gap-3">
          {isEditMode ? (
            <>
              <button type="button" onClick={onClose} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => void handleFinalSubmit(false)}
                disabled={submitting}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <>
              {step > 1 ? (
                <button type="button" onClick={() => setStep(s => s - 1)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  Atrás
                </button>
              ) : (
                <button type="button" onClick={onClose} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  Cancelar
                </button>
              )}
              <div className="flex-1" />
              {step < totalSteps ? (
                <button
                  type="button"
                  onClick={handleGoNext}
                  className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors"
                >
                  Siguiente
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleFinalSubmit(true)}
                    disabled={submitting}
                    className="px-4 py-2.5 border-2 border-green-600 text-green-700 dark:text-green-400 rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait hover:bg-green-50 dark:hover:bg-green-950/30"
                  >
                    {submitting ? 'Guardando…' : 'Guardar y añadir otro'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFinalSubmit(false)}
                    disabled={submitting}
                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >
                    {submitting ? 'Guardando…' : sessionCreated.length > 0 ? 'Guardar y cerrar' : 'Crear producto'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
      <VehicleConfirmDialog
        open={Boolean(categoryPendingDelete)}
        title="Eliminar categoría"
        message={
          categoryPendingDelete
            ? `¿Seguro que quieres eliminar «${categoryPendingDelete}»? Se quitará de las sugerencias y de las pestañas del TPV de tus marcas.`
            : ''
        }
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={Boolean(deletingCategoryKey)}
        onConfirm={() => void confirmDeleteCategoryChip()}
        onCancel={() => {
          if (!deletingCategoryKey) setCategoryPendingDelete(null);
        }}
      />
    </>
  );
}

// ─── Create Supplier Modal ────────────────────────────────────────────────────

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<Supplier> & { catalogItemCosts?: Record<string, number> }) => Promise<void>;
  editItem?: Supplier | null;
  /** Mientras se recarga el proveedor del servidor antes de editar. */
  editHydrating?: boolean;
  brands?: Brand[];
  catalogItems?: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  /** Para sugerir PROV-001… y avisar si el código ya existe. */
  existingSuppliers?: Supplier[];
  businessType?: string | null;
}

function CreateSupplierModal({
  isOpen,
  onClose,
  onCreate,
  editItem,
  editHydrating = false,
  brands = [],
  catalogItems = [],
  storeIngredients = [],
  existingSuppliers = [],
  businessType = null,
}: CreateSupplierModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [formInitReady, setFormInitReady] = useState(false);
  const [organizersFieldKey, setOrganizersFieldKey] = useState(0);
  /** Si el usuario toca el código a mano, deja de regenerarlo al escribir el nombre. */
  const [codeManual, setCodeManual] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    cif: '',
    email: '',
    phone: '',
    address: '',
    contactPerson: '',
    category: '',
    paymentTerms: '',
    notes: '',
    organizerIds: [] as string[],
    catalogItemIds: [] as string[],
    itemCosts: {} as Record<string, string>,
  });
  const supplierFormSessionRef = useRef<{ fingerprint: string } | null>(null);
  const organizersTouchedRef = useRef(false);
  const formRef = useRef(form);
  const editItemRef = useRef(editItem);
  const catalogItemsRef = useRef(catalogItems);
  const brandsRef = useRef(brands);
  const storeIngredientsRef = useRef(storeIngredients);
  editItemRef.current = editItem;
  catalogItemsRef.current = catalogItems;
  brandsRef.current = brands;
  storeIngredientsRef.current = storeIngredients;

  const applyForm = (next: typeof form | ((prev: typeof form) => typeof form)) => {
    setForm((prev) => {
      const merged = typeof next === 'function' ? next(prev) : next;
      formRef.current = merged;
      return merged;
    });
  };
  formRef.current = form;

  const editSnapshot = supplierFormInitFingerprint(editItem, catalogItems.length);

  useEffect(() => {
    if (!isOpen) {
      supplierFormSessionRef.current = null;
      organizersTouchedRef.current = false;
      setFormInitReady(false);
      return;
    }
    if (editItem && (editHydrating || catalogItems.length === 0)) {
      setFormInitReady(false);
      return;
    }

    const edit = editItemRef.current;
    const items = catalogItemsRef.current;
    const fingerprint = supplierFormInitFingerprint(edit, items.length);
    if (organizersTouchedRef.current && supplierFormSessionRef.current?.fingerprint === fingerprint) {
      setFormInitReady(true);
      return;
    }
    if (supplierFormSessionRef.current?.fingerprint === fingerprint) {
      setFormInitReady(true);
      return;
    }

    supplierFormSessionRef.current = { fingerprint };

    setCodeManual(Boolean(edit?.code));
    if (edit) {
      const catalogItemIds = initialSupplierCatalogItemIds(edit, items);
      const nextForm = {
        name: edit.name,
        code: edit.code || '',
        cif: edit.cif || '',
        email: edit.email || '',
        phone: edit.phone || '',
        address: edit.address || '',
        contactPerson: edit.contactPerson || '',
        category: edit.category || '',
        paymentTerms: edit.paymentTerms || '',
        notes: edit.notes || '',
        organizerIds: initialSupplierOrganizerIds(
          edit,
          items,
          storeIngredientsRef.current,
          brandsRef.current,
        ),
        catalogItemIds,
        itemCosts: initialSupplierItemCosts(catalogItemIds, items),
      };
      formRef.current = nextForm;
      setForm(nextForm);
    } else {
      const nextForm = {
        name: '',
        code: suggestNextSupplierCode(existingSuppliers),
        cif: '',
        email: '',
        phone: '',
        address: '',
        contactPerson: '',
        category: '',
        paymentTerms: '',
        notes: '',
        organizerIds: [] as string[],
        catalogItemIds: [] as string[],
        itemCosts: {} as Record<string, string>,
      };
      formRef.current = nextForm;
      setForm(nextForm);
    }
    setOrganizersFieldKey((k) => k + 1);
    setFormInitReady(true);
  }, [isOpen, editSnapshot, editHydrating, catalogItems.length, existingSuppliers]);
  useModalClose(isOpen, onClose);

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      code: codeManual
        ? f.code
        : suggestSupplierCodeFromName(name, existingSuppliers, editItem?._id),
    }));
  };

  const handleCodeChange = (raw: string) => {
    setCodeManual(true);
    setForm((f) => ({ ...f, code: sanitizeSupplierCodeInput(raw) }));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const current = formRef.current;
    if (!current.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    const code = normalizeSupplierCode(current.code);
    if (!code) {
      toast.error('El código del proveedor es obligatorio');
      return;
    }
    if (supplierCodeAlreadyUsed(code, existingSuppliers, editItem?._id)) {
      toast.error(`Ya existe un proveedor con el código ${code}`);
      return;
    }
    const priorOrganizers = (editItem?.organizerIds || []).filter(Boolean).length;
    if (
      editItem &&
      priorOrganizers > 0 &&
      current.organizerIds.length === 0 &&
      !organizersTouchedRef.current
    ) {
      toast.error('Las categorías no se cargaron bien. Cierra y vuelve a abrir el proveedor.');
      return;
    }
    setSubmitting(true);
    try {
      const organizerIds = resolveSupplierOrganizerIdsForSave(
        current.organizerIds,
        current.catalogItemIds,
        catalogItemsRef.current,
        storeIngredientsRef.current,
        brandsRef.current,
      );
      await onCreate({
        name: current.name,
        code,
        cif: current.cif,
        email: current.email,
        phone: current.phone,
        address: current.address,
        contactPerson: current.contactPerson,
        category: current.category,
        paymentTerms: current.paymentTerms,
        notes: current.notes,
        organizerIds,
        catalogItemIds: current.catalogItemIds,
        catalogItemCosts: parseSupplierItemCosts(current.itemCosts),
        active: editItem?.active ?? true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
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

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Nombre del proveedor"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                autoFocus={!editItem}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Código *</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono uppercase"
                placeholder="MAK-001"
                maxLength={SUPPLIER_CODE_MAX_LEN}
                value={form.code}
                onChange={(e) => handleCodeChange(e.target.value)}
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                Se rellena solo con el nombre (ej. Makro → MAK-001). Puedes editarlo. Máx. {SUPPLIER_CODE_MAX_LEN} caracteres: A–Z, 0–9 y guión.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">CIF/NIF</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono uppercase"
                placeholder="B12345678"
                value={form.cif}
                onChange={e => setForm(f => ({ ...f, cif: e.target.value.toUpperCase() }))}
              />
            </div>
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="600 000 000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Persona de contacto</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Nombre del contacto"
                value={form.contactPerson}
                onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
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

          {formInitReady ? (
            <SupplierOrganizersField
              key={`supplier-organizers-${organizersFieldKey}`}
              organizerIds={form.organizerIds}
              catalogItemIds={form.catalogItemIds}
              itemCosts={form.itemCosts}
              onChange={({ organizerIds, catalogItemIds, itemCosts }) => {
                organizersTouchedRef.current = true;
                applyForm((f) => ({ ...f, organizerIds, catalogItemIds, itemCosts }));
              }}
              brands={brands}
              catalogItems={catalogItems}
              storeIngredients={storeIngredients}
              businessType={businessType}
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {editItem && (editHydrating || catalogItems.length === 0)
                ? 'Cargando categorías y productos del proveedor…'
                : 'Preparando el formulario…'}
            </div>
          )}

          <SupplierPaymentTermsField
            value={form.paymentTerms}
            onChange={(paymentTerms) => setForm((f) => ({ ...f, paymentTerms }))}
          />

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

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-4 px-4 -mb-4 pb-4 sm:-mx-6 sm:px-6 sm:-mb-6 sm:pb-6 pt-4 flex gap-3 rounded-b-2xl">
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
  invoices?: PurchaseInvoice[];
  editItem?: PurchaseInvoice | null;
  purchaseOrders?: PurchaseOrder[];
  onReloadInvoices?: () => Promise<PurchaseInvoice[] | void> | void;
  onSelectExisting?: (invoice: PurchaseInvoice) => void;
  onGoToPurchaseOrders?: () => void;
  onReplenishPending?: () => void | Promise<void>;
  replenishing?: boolean;
}

function normalizeInvoiceCode(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s.\-_/#+]+/g, '');
}

function invoiceDisplayNumber(inv: PurchaseInvoice): string {
  return String(inv.invoiceNumber || inv.ocrData?.documentNumber || '').trim();
}

/** Fragmentos OCR del PDF (p. ej. «tutra» leído de «factura»). */
function looksLikeRealInvoiceNumber(value: string): boolean {
  const v = String(value || '').trim();
  if (!v) return false;
  if (/^(factura|fac|tura|tutra|albaran|alb|iva|eur|total|neto)$/i.test(v)) return false;
  if (/^[AF]-\d{4}$/i.test(v)) return true;
  if (/\d/.test(v)) return v.length >= 3;
  return v.length >= 8;
}

function invoiceTableNumber(inv: PurchaseInvoice): { primary: string; hint?: string } {
  const raw = invoiceDisplayNumber(inv);
  const attachmentName = String(inv.attachments?.[0]?.filename || '')
    .replace(/\.(pdf|png|jpe?g)$/i, '')
    .trim();
  if (looksLikeRealInvoiceNumber(raw)) return { primary: raw };
  if (attachmentName) {
    return {
      primary: attachmentName,
      hint: raw && raw.toLowerCase() !== attachmentName.toLowerCase() ? `OCR leyó «${raw}»` : undefined,
    };
  }
  return {
    primary: raw || 'Sin número',
    hint: raw ? 'Número no fiable del OCR' : undefined,
  };
}

function invoiceMatchesCode(inv: PurchaseInvoice, code: string): boolean {
  const needle = normalizeInvoiceCode(code);
  if (!needle) return false;
  return (
    normalizeInvoiceCode(inv.invoiceNumber) === needle ||
    normalizeInvoiceCode(inv.ocrData?.documentNumber || '') === needle
  );
}

/** yyyy-mm-dd para <input type="date"> (ISO, DD/MM/YYYY o timestamp). */
function invoiceDateToInputValue(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const es = parseDateEsToIso(s.replace(/-/g, '/'));
  if (es) return es;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function invoiceDateLabel(
  inv: Pick<PurchaseInvoice, 'date' | 'ocrData' | 'sourceEmailDate'>,
): string {
  const iso = invoiceDateToInputValue(inv.date || inv.ocrData?.date || inv.sourceEmailDate);
  return iso ? formatDateEs(iso) : '—';
}

function isAlbaranInvoice(inv: PurchaseInvoice): boolean {
  return (
    inv.documentKind === 'albaran' ||
    inv.ocrData?.documentType === 'albaran'
  );
}

/** Líneas del documento, OCR o —si faltan— del pedido vinculado. */
function invoiceFormLinesFromDoc(
  inv: PurchaseInvoice,
  linkedOrder?: PurchaseOrder | null,
): { itemName: string; quantity: string; unitPrice: string }[] {
  const raw =
    Array.isArray(inv.lines) && inv.lines.length > 0
      ? inv.lines
      : Array.isArray(inv.ocrData?.lines)
        ? inv.ocrData!.lines!
        : [];
  const mapped = raw
    .map((l) => {
      const itemName = String(
        (l as { itemName?: string }).itemName ||
          (l as { catalogItemName?: string }).catalogItemName ||
          (l as { description?: string }).description ||
          '',
      ).trim();
      const quantity = Number((l as { quantity?: number | null }).quantity ?? 0);
      const unitPrice = Number(
        (l as { unitPrice?: number | null }).unitPrice ??
          (l as { unitCost?: number | null }).unitCost ??
          0,
      );
      const total = Number(
        (l as { total?: number | null }).total ??
          (l as { lineTotal?: number | null }).lineTotal ??
          0,
      );
      const qty = quantity > 0 ? quantity : total > 0 && unitPrice > 0 ? 1 : quantity || 1;
      const price =
        unitPrice > 0
          ? unitPrice
          : qty > 0 && total > 0
            ? total / qty
            : total > 0
              ? total
              : 0;
      return {
        itemName,
        quantity: String(qty || ''),
        unitPrice: price ? String(Math.round(price * 100) / 100) : '',
      };
    })
    .filter((l) => l.itemName || Number(l.unitPrice) > 0 || Number(l.quantity) > 0);
  if (mapped.length > 0) return mapped;
  const orderItems = Array.isArray(linkedOrder?.items) ? linkedOrder!.items : [];
  if (orderItems.length > 0) {
    return orderItems.map((item) => ({
      itemName: String(item.name || '').trim(),
      quantity: String(item.quantity || ''),
      unitPrice: item.unitCost ? String(Math.round(item.unitCost * 100) / 100) : '',
    }));
  }
  return [{ itemName: '', quantity: '', unitPrice: '' }];
}

function invoiceStoredTotalsFromDoc(inv: PurchaseInvoice) {
  return {
    subtotal: Number(inv.subtotal || inv.ocrData?.subtotal || 0),
    taxAmount: Number(inv.taxAmount || inv.ocrData?.taxAmount || 0),
    total: Number(inv.total || inv.ocrData?.total || 0),
  };
}

function CreateInvoiceModal({
  isOpen,
  onClose,
  onCreate,
  suppliers,
  invoices = [],
  editItem,
  purchaseOrders = [],
  onReloadInvoices,
  onSelectExisting,
  onGoToPurchaseOrders,
  onReplenishPending,
  replenishing = false,
}: CreateInvoiceModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [loadingAlbaran, setLoadingAlbaran] = useState(false);
  const [form, setForm] = useState({
    albaranNumber: '',
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
  const [linkedAlbaranId, setLinkedAlbaranId] = useState('');
  /** Totales guardados del doc (OCR/lista) por si las líneas van vacías. */
  const [storedTotals, setStoredTotals] = useState<{
    subtotal: number;
    taxAmount: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (editItem) {
      const linked = editItem.linkedPurchaseOrderId
        ? purchaseOrders.find((o) => o._id === editItem.linkedPurchaseOrderId) || null
        : null;
      const ocrDue = (editItem.ocrData as { dueDate?: string | null } | undefined)?.dueDate;
      setForm({
        albaranNumber: invoiceDisplayNumber(editItem),
        supplierName: editItem.supplierName || editItem.ocrData?.emitter || '',
        supplierId: editItem.supplierId || '',
        date: invoiceDateToInputValue(editItem.date || editItem.ocrData?.date || editItem.sourceEmailDate),
        dueDate: invoiceDateToInputValue(editItem.dueDate || ocrDue),
        taxRate: String(editItem.taxRate ?? editItem.ocrData?.taxRate ?? 21),
        notes: editItem.notes || editItem.ocrData?.notes || '',
      });
      setLines(invoiceFormLinesFromDoc(editItem, linked));
      setStoredTotals(invoiceStoredTotalsFromDoc(editItem));
      setLinkedAlbaranId(editItem._id || '');
    } else {
      setForm({
        albaranNumber: '',
        supplierName: '',
        supplierId: '',
        date: '',
        dueDate: '',
        taxRate: '21',
        notes: '',
      });
      setLines([{ itemName: '', quantity: '', unitPrice: '' }]);
      setStoredTotals(null);
      setLinkedAlbaranId('');
    }
  }, [editItem, isOpen, purchaseOrders]);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const applyAlbaranToForm = (inv: PurchaseInvoice) => {
    const linked = inv.linkedPurchaseOrderId
      ? purchaseOrders.find((o) => o._id === inv.linkedPurchaseOrderId) || null
      : null;
    const ocrDue = (inv.ocrData as { dueDate?: string | null } | undefined)?.dueDate;
    setForm({
      albaranNumber: invoiceDisplayNumber(inv),
      supplierName: inv.supplierName || inv.ocrData?.emitter || '',
      supplierId: inv.supplierId || '',
      date: invoiceDateToInputValue(inv.date || inv.ocrData?.date || inv.sourceEmailDate),
      dueDate: invoiceDateToInputValue(inv.dueDate || ocrDue),
      taxRate: String(inv.taxRate ?? inv.ocrData?.taxRate ?? 21),
      notes: inv.notes || inv.ocrData?.notes || '',
    });
    setLines(invoiceFormLinesFromDoc(inv, linked));
    setStoredTotals(invoiceStoredTotalsFromDoc(inv));
    setLinkedAlbaranId(inv._id);
  };

  const handleLoadAlbaran = async () => {
    const code = form.albaranNumber.trim();
    if (!code) {
      toast.error('Escribe el número de albarán');
      return;
    }
    setLoadingAlbaran(true);
    try {
      const fresh = onReloadInvoices ? await onReloadInvoices() : undefined;
      const pool = Array.isArray(fresh) && fresh.length ? fresh : invoices;
      if (editItem && invoiceMatchesCode(editItem, code)) {
        const self = pool.find((inv) => inv._id === editItem._id) || editItem;
        applyAlbaranToForm(self);
        onSelectExisting?.(self);
        toast.success('Datos del documento actualizados');
        return;
      }
      const match =
        pool.find(
          (inv) =>
            isAlbaranInvoice(inv) &&
            invoiceMatchesCode(inv, code) &&
            (!editItem || inv._id !== editItem._id),
        ) ||
        pool.find(
          (inv) =>
            invoiceMatchesCode(inv, code) &&
            (!editItem || inv._id !== editItem._id),
        );
      if (!match) {
        toast.error('No hay ningún albarán/factura con ese número. Revisa el código o la pestaña Albarán.');
        return;
      }
      applyAlbaranToForm(match);
      onSelectExisting?.(match);
      toast.success(
        `Albarán ${match.invoiceNumber || code} cargado · proveedor, líneas e importes actualizados`,
      );
    } finally {
      setLoadingAlbaran(false);
    }
  };

  const addLine = () => setLines((prev) => [...prev, { itemName: '', quantity: '', unitPrice: '' }]);

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: string, value: string) => {
    setStoredTotals(null);
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const computedLines: PurchaseInvoiceLine[] = lines
    .filter((l) => l.itemName.trim())
    .map((l, i) => {
      const prev = editItem?.lines?.[i];
      return {
        id: prev?.id || `line-${Date.now()}-${i}`,
        itemName: l.itemName,
        description: l.itemName,
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        total: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
        catalogItemId: String(prev?.catalogItemId || ''),
        catalogItemName: String(prev?.catalogItemName || ''),
        sku: String(prev?.sku || ''),
        matchMethod: String(prev?.matchMethod || ''),
        matchConfidence: prev?.matchConfidence ?? null,
      };
    });

  const computedSubtotal = computedLines.reduce((sum, l) => sum + l.total, 0);
  const taxRate = Number(form.taxRate) || 0;
  const useStored =
    computedSubtotal <= 0 &&
    storedTotals != null &&
    (storedTotals.total > 0 || storedTotals.subtotal > 0);
  const subtotal = useStored ? storedTotals!.subtotal : computedSubtotal;
  const taxAmount = useStored
    ? storedTotals!.taxAmount
    : subtotal * (taxRate / 100);
  const total = useStored ? storedTotals!.total : subtotal + taxAmount;

  const supplierInList = Boolean(
    form.supplierId && suppliers.some((s) => s._id === form.supplierId),
  );
  const linkedOrder = editItem?.linkedPurchaseOrderId
    ? purchaseOrders.find((o) => o._id === editItem.linkedPurchaseOrderId) || null
    : null;
  const albaranPendingLines =
    editItem && isAlbaranInvoice(editItem)
      ? resolveAlbaranPendingLines(editItem, linkedOrder)
      : [];
  const albaranIncomplete =
    editItem && isAlbaranInvoice(editItem)
      ? isAlbaranInvoiceIncomplete(editItem, linkedOrder)
      : false;

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find((s) => s._id === supplierId);
    setForm((f) => ({
      ...f,
      supplierId,
      supplierName: supplier?.name || '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.albaranNumber.trim()) {
      toast.error('Indica el número de albarán');
      return;
    }
    if (!form.supplierName.trim()) {
      toast.error('Selecciona un proveedor');
      return;
    }
    const linesToSave =
      computedLines.length > 0
        ? computedLines
        : Array.isArray(editItem?.lines) && editItem.lines.length > 0
          ? editItem.lines
          : [];
    if (linesToSave.length === 0 && !(useStored && total > 0)) {
      toast.error('Añade al menos una línea');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        ...editItem,
        invoiceNumber: form.albaranNumber.trim(),
        supplierName: form.supplierName,
        supplierId: form.supplierId,
        date: form.date || new Date().toISOString().slice(0, 10),
        dueDate: form.dueDate,
        lines: linesToSave,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: form.notes,
        status: editItem?.status || 'pending',
        documentKind: editItem?.documentKind || (linkedAlbaranId ? 'factura_proveedor' : editItem?.documentKind),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar factura' : 'Nueva factura de compra'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {editItem
                ? 'Modifica los datos de la factura'
                : 'Pon el nº de albarán arriba y carga para rellenar proveedor, líneas e importes'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          {albaranIncomplete && albaranPendingLines.length > 0 ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Pedido incompleto</p>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                  No han llegado (o falta cantidad) de estos productos del pedido
                  {editItem?.linkedPurchaseOrderNumber
                    ? ` ${editItem.linkedPurchaseOrderNumber}`
                    : ''}
                  :
                </p>
              </div>
              <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-100">
                {albaranPendingLines.map((line) => (
                  <li key={`${line.catalogItemId}-${line.name}`} className="flex justify-between gap-3">
                    <span className="truncate">{line.name}</span>
                    <span className="shrink-0 tabular-nums font-semibold">
                      pendiente {formatQtyEs(line.pendingQty)}
                    </span>
                  </li>
                ))}
              </ul>
              {onReplenishPending ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onReplenishPending()}
                    disabled={replenishing}
                    className={`${VERTIAL_BTN_PRIMARY} !min-h-0 w-full sm:w-auto inline-flex items-center gap-2`}
                  >
                    {replenishing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Generar pedido automático
                  </button>
                  {onGoToPurchaseOrders ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onGoToPurchaseOrders();
                      }}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-0 w-full sm:w-auto`}
                    >
                      Ver pedidos
                    </button>
                  ) : null}
                </div>
              ) : onGoToPurchaseOrders ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToPurchaseOrders();
                  }}
                  className={`${VERTIAL_BTN_PRIMARY} !min-h-0 w-full sm:w-auto`}
                >
                  Ir a pedidos para reponer
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border-2 border-gray-900/10 dark:border-gray-100/10 bg-gray-50 dark:bg-gray-900/40 p-3 sm:p-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {editItem ? 'Nº documento *' : 'Nº Albarán *'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="w-full flex-1 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono"
                placeholder={editItem ? 'Ej. FAC-2026-014' : 'Ej. ALB-2026-014'}
                value={form.albaranNumber}
                onChange={(e) => setForm((f) => ({ ...f, albaranNumber: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleLoadAlbaran();
                  }
                }}
                autoFocus={!editItem}
              />
              <button
                type="button"
                onClick={() => void handleLoadAlbaran()}
                disabled={loadingAlbaran || !form.albaranNumber.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-wait shrink-0"
              >
                {loadingAlbaran ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                {editItem ? 'Recargar datos' : 'Cargar albarán'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {editItem
                ? 'Vuelve a leer proveedor, fechas, IVA, líneas y totales del documento guardado.'
                : 'Al cargar, se refrescan proveedor, fechas, IVA, líneas y totales del albarán.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Proveedor *</label>
              {suppliers.length > 0 ? (
                <>
                  <select
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    value={supplierInList ? form.supplierId : ''}
                    onChange={(e) => handleSelectSupplier(e.target.value)}
                  >
                    <option value="">
                      {form.supplierName && !supplierInList
                        ? form.supplierName
                        : 'Seleccionar proveedor'}
                    </option>
                    {form.supplierName && !supplierInList ? (
                      <option value="" disabled>
                        {form.supplierName} (del documento)
                      </option>
                    ) : null}
                    {suppliers.filter((sup) => sup.active).map((sup) => (
                      <option key={sup._id} value={sup._id}>{sup.name}</option>
                    ))}
                  </select>
                  {form.supplierName && !supplierInList ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      Proveedor del documento: {form.supplierName}. Elige uno de la lista para enlazarlo.
                    </p>
                  ) : null}
                </>
              ) : (
                <input
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Nombre del proveedor"
                  value={form.supplierName}
                  onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha factura</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha vencimiento</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas de factura</label>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir línea
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                  <input
                    className="w-full sm:w-auto sm:flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Artículo"
                    value={line.itemName}
                    onChange={(e) => updateLine(idx, 'itemName', e.target.value)}
                  />
                  <input
                    type="number"
                    className="w-20 sm:w-24 px-2 sm:px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Cant."
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="w-24 sm:w-28 px-2 sm:px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Precio €"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                  />
                  <div className="flex-1 sm:flex-none sm:w-24 px-1 sm:px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right tabular-nums">
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
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-4 px-4 -mb-4 pb-4 sm:-mx-6 sm:px-6 sm:-mb-6 sm:pb-6 pt-4 flex gap-3 rounded-b-2xl">
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

// ─── Purchase invoice view (solo lectura) ─────────────────────────────────────

interface PurchaseInvoiceViewModalProps {
  invoice: PurchaseInvoice | null;
  isOpen: boolean;
  onClose: () => void;
  purchaseOrders?: PurchaseOrder[];
  catalogItems?: CatalogItem[];
  financeLinked?: boolean;
  canDelete?: boolean;
  onTogglePaid: (invoice: PurchaseInvoice) => void | Promise<void>;
  onLoadWarehouse?: (invoice: PurchaseInvoice, options?: { force?: boolean }) => void | Promise<void>;
  onLinkFinance?: (invoice: PurchaseInvoice) => void | Promise<void>;
  onDelete?: (invoice: PurchaseInvoice) => void | Promise<void>;
  onEditManual?: (invoice: PurchaseInvoice) => void;
}

function invoiceDetailLines(inv: PurchaseInvoice) {
  const raw =
    Array.isArray(inv.lines) && inv.lines.length > 0
      ? inv.lines
      : Array.isArray(inv.ocrData?.lines)
        ? inv.ocrData!.lines!
        : [];
  return raw
    .map((l) => {
      const name = String(
        (l as { itemName?: string }).itemName ||
          (l as { catalogItemName?: string }).catalogItemName ||
          (l as { description?: string }).description ||
          '',
      ).trim();
      const qty = Number((l as { quantity?: number }).quantity ?? 0);
      const unit = Number(
        (l as { unitPrice?: number }).unitPrice ??
          (l as { unitCost?: number }).unitCost ??
          0,
      );
      const total = Number((l as { total?: number }).total ?? 0) || qty * unit;
      const catalogItemId = String((l as { catalogItemId?: string }).catalogItemId || '').trim();
      return { name: name || '—', qty, unit, total, catalogItemId };
    })
    .filter((l) => l.name !== '—' || l.total > 0 || l.qty > 0);
}

function resolveInvoicePriceVariance(
  invoice: PurchaseInvoice,
  catalogItems: CatalogItem[],
  purchaseOrders: PurchaseOrder[],
): SupplierPriceVariance | null {
  const linkedOrder = invoice.linkedPurchaseOrderId
    ? purchaseOrders.find((o) => o._id === invoice.linkedPurchaseOrderId)
    : null;
  if (catalogItems.length > 0 || linkedOrder) {
    const detected = detectSupplierPriceVariance({
      lines: invoice.lines?.length ? invoice.lines : invoice.ocrData?.lines || [],
      catalogItems,
      orderItems: linkedOrder?.items || [],
    });
    if (detected.hasVariance) return detected;
  }
  if (invoice.priceVariance?.hasVariance && Array.isArray(invoice.priceVariance.lines)) {
    return invoice.priceVariance;
  }
  return null;
}

function PurchaseInvoiceViewModal({
  invoice,
  isOpen,
  onClose,
  purchaseOrders = [],
  catalogItems = [],
  financeLinked = false,
  canDelete = false,
  onTogglePaid,
  onLoadWarehouse,
  onLinkFinance,
  onDelete,
  onEditManual,
}: PurchaseInvoiceViewModalProps) {
  useModalClose(isOpen, onClose);
  if (!isOpen || !invoice) return null;

  const displayStatus = invoiceDisplayStatus(invoice);
  const statusCfg = INVOICE_STATUS_CONFIG[displayStatus] || INVOICE_STATUS_CONFIG.pending;
  const num = invoiceTableNumber(invoice);
  const lines = invoiceDetailLines(invoice);
  const linkedOrder = invoice.linkedPurchaseOrderId
    ? purchaseOrders.find((o) => o._id === invoice.linkedPurchaseOrderId) || null
    : null;
  const priceVariance = resolveInvoicePriceVariance(invoice, catalogItems, purchaseOrders);
  const varianceByKey = new Map<string, NonNullable<SupplierPriceVariance['lines']>[number]>();
  for (const vl of priceVariance?.lines || []) {
    const id = String(vl.catalogItemId || '').trim();
    if (id) varianceByKey.set(id, vl);
    const nameKey = String(vl.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim();
    if (nameKey) varianceByKey.set(`n:${nameKey}`, vl);
  }
  const totals = invoiceStoredTotalsFromDoc(invoice);
  const isManual = invoice.entryMethod === 'manual' && invoice.source !== 'email';
  const attachmentName = invoice.attachments?.[0]?.filename;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 font-mono truncate">
                {num.primary}
              </h2>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border shrink-0 ${statusCfg.badgeClass}`}>
                {statusCfg.label}
              </span>
            </div>
            {num.hint ? (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {num.hint}
              </p>
            ) : null}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Factura de compra · {invoice.supplierName || 'Proveedor sin nombre'}
            </p>
            {attachmentName ? (
              <p className="text-xs text-gray-400 mt-1 truncate flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                {attachmentName}
              </p>
            ) : null}
            {invoice.ocrStockReceivedAt ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 flex items-center gap-1">
                <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                Stock cargado en almacén
              </p>
            ) : null}
            {priceVariance?.hasVariance ? (
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {priceVariance.lines.length} precio
                {priceVariance.lines.length === 1 ? '' : 's'} distinto
                {priceVariance.lines.length === 1 ? '' : 's'} al coste esperado
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors shrink-0"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 flex-1">
          {priceVariance?.hasVariance ? (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 px-3 py-2.5 text-sm text-rose-900 dark:text-rose-100">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Precio distinto al coste del proveedor
              </p>
              <p className="text-xs text-rose-800/90 dark:text-rose-200/90 mt-1">
                El documento llega con precio unitario diferente al que tienes guardado en Proveedores
                (coste esperado). Revisa las líneas marcadas.
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Fecha</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{invoiceDateLabel(invoice)}</p>
            </div>
            {invoice.dueDate ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Vencimiento</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatDateEs(invoiceDateToInputValue(invoice.dueDate) || invoice.dueDate)}
                </p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">IVA</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{invoice.taxRate ?? 21}%</p>
            </div>
            {linkedOrder ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pedido</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100 font-mono text-xs">
                  {linkedOrder.orderNumber || invoice.linkedPurchaseOrderNumber || '—'}
                </p>
              </div>
            ) : null}
            {invoice.supplierCif || invoice.ocrData?.emitterCIF ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">CIF proveedor</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100 font-mono text-xs">
                  {invoice.supplierCif || invoice.ocrData?.emitterCIF}
                </p>
              </div>
            ) : null}
            {invoice.ocrData?.bankAccount ? (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">IBAN</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100 font-mono text-xs break-all">
                  {invoice.ocrData.bankAccount}
                </p>
              </div>
            ) : null}
            {invoice.ocrData?.paymentTerms ? (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">Pago</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-xs">
                  {invoice.ocrData.paymentTerms}
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Líneas</p>
            {lines.length > 0 ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Artículo</th>
                      <th className="text-right px-3 py-2 font-semibold w-16">Cant.</th>
                      <th className="text-right px-3 py-2 font-semibold w-28">Precio</th>
                      <th className="text-right px-3 py-2 font-semibold w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {lines.map((line, idx) => {
                      const nameKey = String(line.name || '')
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/\p{M}/gu, '')
                        .trim();
                      const variance =
                        (line.catalogItemId && varianceByKey.get(line.catalogItemId)) ||
                        (nameKey ? varianceByKey.get(`n:${nameKey}`) : undefined);
                      return (
                        <tr
                          key={idx}
                          className={
                            variance
                              ? 'bg-rose-50/70 dark:bg-rose-950/25'
                              : undefined
                          }
                        >
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                            <span>{line.name}</span>
                            {variance ? (
                              <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-md border border-rose-200 dark:border-rose-800 bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200">
                                Precio distinto
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {line.qty || '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {line.unit ? (
                              <div
                                className={
                                  variance
                                    ? 'font-semibold text-rose-800 dark:text-rose-200'
                                    : 'text-gray-700 dark:text-gray-300'
                                }
                              >
                                {formatMoneyEs(line.unit)}
                              </div>
                            ) : (
                              <span className="text-gray-700 dark:text-gray-300">—</span>
                            )}
                            {variance ? (
                              <div className="text-[10px] text-rose-700/90 dark:text-rose-300/90 mt-0.5">
                                esperado {formatMoneyEs(variance.expectedUnitCost)}
                              </div>
                            ) : null}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-semibold ${
                              variance
                                ? 'text-rose-900 dark:text-rose-100'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            {formatMoneyEs(line.total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-6 text-center">
                Sin líneas legibles en el documento
              </p>
            )}
          </div>

          <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-4 text-sm space-y-1">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Base imponible</span>
              <span className="tabular-nums">{formatMoneyEs(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>IVA</span>
              <span className="tabular-nums">{formatMoneyEs(totals.taxAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-700">
              <span>Total</span>
              <span className="tabular-nums">{formatMoneyEs(totals.total)}</span>
            </div>
          </div>

          {invoice.notes ? (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{invoice.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-6 flex flex-wrap gap-2 rounded-b-2xl">
          {invoice.status !== 'paid' ? (
            <button
              type="button"
              onClick={() => void onTogglePaid(invoice)}
              className={`${VERTIAL_BTN_PRIMARY} !min-h-0 inline-flex items-center gap-2`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Marcar como pagada
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onTogglePaid(invoice)}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-0 inline-flex items-center gap-2`}
            >
              <Clock className="w-4 h-4" />
              Marcar como pendiente
            </button>
          )}
          {onLoadWarehouse ? (
            <button
              type="button"
              onClick={() => {
                if (
                  invoice.ocrStockReceivedAt &&
                  !window.confirm(
                    '¿Forzar carga al almacén? Úsalo si el stock no subió. Si ya entró, se puede duplicar.',
                  )
                ) {
                  return;
                }
                void onLoadWarehouse(invoice, { force: Boolean(invoice.ocrStockReceivedAt) });
              }}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-0 inline-flex items-center gap-2`}
            >
              <PackageCheck className="w-4 h-4 text-emerald-600" />
              {invoice.ocrStockReceivedAt ? 'Forzar carga al almacén' : 'Cargar al almacén'}
            </button>
          ) : null}
          {!financeLinked && onLinkFinance ? (
            <button
              type="button"
              onClick={() => void onLinkFinance(invoice)}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-0 inline-flex items-center gap-2`}
            >
              <Wallet className="w-4 h-4 text-violet-600" />
              Registrar en finanzas
            </button>
          ) : null}
          {isManual && onEditManual ? (
            <button
              type="button"
              onClick={() => onEditManual(invoice)}
              className={`${VERTIAL_BTN_SECONDARY} !min-h-0 inline-flex items-center gap-2`}
            >
              <Edit3 className="w-4 h-4" />
              Corregir datos
            </button>
          ) : null}
          {canDelete && onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete(invoice)}
              className="ml-auto px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors inline-flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
          ) : null}
        </div>
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
            <StockQtyWithUnit quantity={item.stockQuantity} unit={item.unit} />
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
            <StockQtyWithUnit quantity={newQty} unit={item.unit} low={newQty < item.minStock} />
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

// ─── Loading state ────────────────────────────────────────────────────────────

type CatalogLoadPhase = 'session' | 'catalog' | 'suppliers' | 'pdv';

function CatalogTabLoadingState({ phase }: { phase: CatalogLoadPhase }) {
  const message =
    phase === 'session'
      ? 'Preparando tu espacio de trabajo…'
      : phase === 'pdv'
        ? 'Comprobando tienda activa…'
        : phase === 'suppliers'
          ? 'Cargando proveedores…'
          : 'Cargando carta…';

  return <CatalogCoreLoadingState message={message} />;
}

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

// ─── Navegación del módulo (grupos: Carta · Almacén · Compras · Equipo) ───────

type CatalogNavTab = { id: string; label: string; count?: number };
type CatalogNavGroup = { id: string; label: string; tabs: CatalogNavTab[] };

/**
 * Nav agrupada del catálogo TPV: misma mecánica que las tabs planas (?tab=…).
 * Cada sección es un botón visible (avance azul / outline secundario).
 */
function CatalogModuleNav({
  groups,
  activeTab,
  onChange,
}: {
  groups: CatalogNavGroup[];
  activeTab: string;
  onChange: (tab: string) => void;
}) {
  const items = groups.flatMap((group) => {
    const singleTab = group.tabs.length === 1;
    return group.tabs.map((tab) => ({
      id: tab.id,
      label: singleTab ? group.label : tab.label,
      count: tab.count,
    }));
  });

  return (
    <nav
      className="flex w-full items-center gap-1 rounded-xl border border-stone-200 bg-stone-100/80 p-1 dark:border-stone-700 dark:bg-stone-900/60"
      aria-label="Secciones del catálogo"
    >
      {items.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            title={tab.label}
            className={`inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold leading-tight transition-colors sm:text-xs ${
              isActive
                ? 'bg-[var(--v-blue,#2563eb)] text-white'
                : 'bg-white text-stone-700 hover:bg-blue-50/60 hover:text-[var(--v-blue,#2563eb)] dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
            }`}
          >
            <span className="truncate">{tab.label}</span>
            {tab.count !== undefined ? (
              <span
                className={`shrink-0 rounded px-1 py-px text-[9px] font-bold tabular-nums ${
                  isActive
                    ? 'bg-white/25 text-white'
                    : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const CATALOG_TABS = ['catalog', 'ingredientes', 'escandallo', 'stock', 'suppliers', 'purchase-orders', 'albaranes', 'invoices', 'staff-consumption'] as const;
  const COMPRAS_TAB_IDS = new Set(['suppliers', 'purchase-orders', 'albaranes', 'invoices']);

  type CatalogLoadModules = { carta?: boolean; stock?: boolean };

  const catalogModulesForTab = useCallback(
    (tab: string, createSupplierOpen: boolean): CatalogLoadModules => {
      // Proveedor: carta (secciones → ingredientes) + almacén (envases…).
      if (createSupplierOpen) return { carta: true, stock: true };
      if (tab === 'stock' || tab === 'ingredientes') return { carta: false, stock: true };
      if (tab === 'catalog' || tab === 'escandallo' || tab === 'staff-consumption') {
        return { carta: true, stock: false };
      }
      return { carta: false, stock: false };
    },
    [],
  );
  const { user } = useAuth();
  const { currentBusiness, businessesFetchSettled, businesses } = useBusiness();
  const activeStore = useActiveStoreScope();
  const scopeBusinessId = resolveBusinessScopeId(currentBusiness);
  const businessId = resolveTpvCatalogBusinessId(scopeBusinessId, businesses);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const pageReady = businessesFetchSettled && Boolean(dataUserId);
  const canDeletePurchaseDocs = canDeletePurchaseDocuments(currentBusiness, user);
  const catalogDataReady = pageReady && Boolean(businessId);
  const { config: verticalConfig, businessType } = useVerticalCatalog();
  const itemLabelPlural = verticalConfig.itemLabelPlural || 'Productos';
  const isDeliveryOps = isDeliveryOpsBusinessType(currentBusiness?.businessType);
  const isRestaurantCatalog = isRestaurantBusinessType(currentBusiness?.businessType);
  const isHeladeriaCatalog = isIceCreamShopBusinessType(currentBusiness?.businessType);
  const isEventsCatalog = isEventsBusinessType(currentBusiness?.businessType);
  /** Misma UI/flujo de catálogo TPV (delivery, bar/restaurante, heladería y eventos). */
  const usesTpvCatalogUi = isDeliveryOps || isRestaurantCatalog || isHeladeriaCatalog || isEventsCatalog;
  const catalogVertical = isEventsCatalog
    ? 'events'
    : isRestaurantCatalog
      ? 'restaurant'
      : isHeladeriaCatalog
        ? 'iceCreamShop'
        : 'delivery';
  const catalogImportTemplateFilename = catalogTemplateFilenameForVertical(catalogVertical);
  const retailStoreCount = useMemo(
    () => activeStore.retailWorkCenters.filter((wc) => wc.active !== false).length,
    [activeStore.retailWorkCenters],
  );
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>([]);
  const [brandIngredientSelection, setBrandIngredientSelection] = useState<TpvBrandIngredientSelection>({});
  const [tpvFreeSwapOnRemove, setTpvFreeSwapOnRemove] = useState(false);
  const [savingTpvFreeSwap, setSavingTpvFreeSwap] = useState(false);
  const [tpvDefaultExtraPrice, setTpvDefaultExtraPrice] = useState('');
  const [savingTpvExtraPrice, setSavingTpvExtraPrice] = useState(false);
  const accountBusinessCount = businesses.length;
  const [allCatalogItems, setAllCatalogItems] = useState<CatalogItem[]>([]);
  const catalogItems = useMemo(
    () =>
      filterCatalogItemsForBusinessScope(allCatalogItems, businessId, brands, {
        accountBusinessCount,
        activeBusinessType: currentBusiness?.businessType,
        brandsSettled: !brandsLoading,
      }),
    [allCatalogItems, businessId, brands, accountBusinessCount, currentBusiness?.businessType, brandsLoading],
  );

  /** Solo productos de carta TPV (excluye ingredientes/almacén module stock). */
  const catalogMenuItemsRaw = useMemo(
    () => catalogItems.filter((item) => (item.module || 'catalog') === 'catalog'),
    [catalogItems],
  );

  /** Una fila por producto en UI (oculta duplicados legacy del mismo código/nombre). */
  const catalogMenuItems = useMemo(
    () => dedupeCatalogItemsForDisplay(catalogMenuItemsRaw, businessId),
    [catalogMenuItemsRaw, businessId],
  );

  const escandalloSeedItems = useMemo(
    () =>
      dedupeCatalogItemsForDisplay(
        catalogMenuItemsRaw.filter(isCatalogCostingProduct),
        businessId,
      ),
    [catalogMenuItemsRaw, businessId],
  );

  const escandalloSeedBrands = useMemo(
    () =>
      sortBrandsForDisplay(commercialLineBrands(brands)).map((b) => ({
        _id: b._id,
        deliveryLineKind: b.deliveryLineKind,
      })),
    [brands],
  );
  const inventoryCommercialBrands = useMemo(() => commercialLineBrands(brands), [brands]);

  /** Catálogo de carta para armar menús/combos (sin ingredientes de almacén). */
  const catalogForComboEditor = useMemo(
    () =>
      catalogItems.filter(
        (item) => item.active !== false && (item.module || 'catalog') === 'catalog',
      ),
    [catalogItems],
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersSearch, setSuppliersSearch] = useState('');
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  /** Solo facturas/albaranes de la empresa activa (no mezclar otras verticales/empresas). */
  const scopedInvoices = useMemo(
    () => filterPurchaseDocsByBusinessScope(invoices, businessId, accountBusinessCount),
    [invoices, businessId, accountBusinessCount],
  );
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  /** Solo pedidos de compra de la empresa activa. */
  const scopedPurchaseOrders = useMemo(
    () => filterPurchaseDocsByBusinessScope(purchaseOrders, businessId, accountBusinessCount),
    [purchaseOrders, businessId, accountBusinessCount],
  );
  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(false);
  const [replenishingOrder, setReplenishingOrder] = useState(false);
  const [albaranCorroborate, setAlbaranCorroborate] = useState<{
    order: PurchaseOrder;
    invoice?: PurchaseInvoice | null;
  } | null>(null);
  const [waitingAlbaranOrderId, setWaitingAlbaranOrderId] = useState('');
  const [albaranOcrBusy, setAlbaranOcrBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [invoicesHydrating, setInvoicesHydrating] = useState(false);
  const [syncingEmailInvoices, setSyncingEmailInvoices] = useState(false);
  const [invoiceEmailPdvs, setInvoiceEmailPdvs] = useState<SupplierInvoicePdvEmailStatus[]>([]);
  const [invoiceFinanceLinks, setInvoiceFinanceLinks] = useState<Set<string>>(new Set());
  const suppliersFetchedRef = useRef(false);
  const invoicesFetchedRef = useRef(false);
  const suppliersLoadStartedRef = useRef(false);
  const invoicesLoadStartedRef = useRef(false);
  const purchaseOrdersLoadStartedRef = useRef(false);
  const purchaseOrdersFetchedRef = useRef(false);
  const catalogCartaLoadedRef = useRef(false);
  const catalogStockLoadedRef = useRef(false);
  const catalogLoadedRef = useRef(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const activeTab = useMemo(() => {
    const raw = searchParams.get('tab') || 'catalog';
    const tab = raw === 'tpv-templates' ? 'ingredientes' : raw;
    // Bar/restaurante: sin pestaña Ingredientes (stock vía Almacén + escandallo en Carta).
    if (isRestaurantCatalog && tab === 'ingredientes') return 'catalog';
    return (CATALOG_TABS as readonly string[]).includes(tab) ? tab : 'catalog';
  }, [searchParams, isRestaurantCatalog]);
  const setActiveTab = useCallback((tab: string) => setSearchParams({ tab }), [setSearchParams]);

  const reloadInvoiceEmailStatus = useCallback(async () => {
    if (!dataUserId) {
      setInvoiceEmailPdvs([]);
      return;
    }
    try {
      const bid = normalizeBusinessScopeId(businessId);
      const { pdvs } = await listSupplierInvoicePdvEmailConfigs(dataUserId, bid || undefined, {
        accountBusinessCount: 1,
      });
      const scoped = (Array.isArray(pdvs) ? pdvs : []).filter((p) => {
        if (!bid) return true;
        const pdvBid = normalizeBusinessScopeId(String(p.businessId || ''));
        return pdvBid === bid;
      });
      setInvoiceEmailPdvs(scoped);
    } catch {
      setInvoiceEmailPdvs([]);
    }
  }, [dataUserId, businessId]);

  const invoiceEmailConnectedCount = useMemo(
    () => invoiceEmailPdvs.filter((p) => p.connected).length,
    [invoiceEmailPdvs],
  );
  const storeLabel = activeStore.displayLabelForActive || 'Tienda activa';
  const activeWorkCenterId = useMemo(() => {
    const pdv = activeStore.pointsOfSale.find((p) => p._id === activeStore.activeSalesPointId);
    return String(pdv?.workCenterId || activeStore.activeSalesPointId || '').trim();
  }, [activeStore.pointsOfSale, activeStore.activeSalesPointId]);

  const activeWorkCenterName = useMemo(() => {
    const wc = activeStore.retailWorkCenters.find((w) => w._id === activeWorkCenterId);
    return wc?.name || storeLabel;
  }, [activeStore.retailWorkCenters, activeWorkCenterId, storeLabel]);

  const catalogForActiveStore = useMemo(() => {
    if (!activeWorkCenterId) return catalogItems;
    return catalogItems.filter((i) => catalogItemOperatesAtWorkCenter(i, brands, activeWorkCenterId));
  }, [catalogItems, brands, activeWorkCenterId]);

  const storeWarehouseId = useMemo(() => {
    const activeWh = warehouses.filter((w) => w.active !== false);
    const pdvId = String(activeStore.activeSalesPointId || '').trim();
    if (pdvId) {
      const linked = activeWh.find((w) => String(w.salesPointId || '').trim() === pdvId);
      if (linked) return linked._id;
    }
    const label = storeLabel.toLowerCase();
    const byName = activeWh.find((w) => label && w.name.toLowerCase().includes(label.split(/\s+/)[0] || ''));
    return byName?._id || activeWh.find((w) => w.isDefault)?._id || activeWh[0]?._id || '';
  }, [warehouses, storeLabel, activeStore.activeSalesPointId]);

  // Catalog state
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [comboSeedProduct, setComboSeedProduct] = useState<CatalogItem | null>(null);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  /** Organizador (categoría) activo en la pestaña Catálogo: una tabla a la vez, sin lista infinita. */
  const [activeCatalogCategory, setActiveCatalogCategory] = useState<string | null>(null);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [searchCatalog, setSearchCatalog] = useState('');
  /** Categorías desplegadas por el usuario; vacío = todas cerradas al cargar. */
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(new Set());
  const [bulkDeletingCatalog, setBulkDeletingCatalog] = useState(false);
  const [bulkMovingCatalog, setBulkMovingCatalog] = useState(false);
  const [catalogMoveItems, setCatalogMoveItems] = useState<CatalogItem[] | null>(null);
  const [catalogSectionsOpen, setCatalogSectionsOpen] = useState(false);
  /** Secciones creadas en esta sesión (aún sin productos) para «Editar secciones». */
  const [sessionCatalogSections, setSessionCatalogSections] = useState<string[]>([]);
  const [deletingOrganizerId, setDeletingOrganizerId] = useState<string | null>(null);
  type CatalogDeleteOp =
    | null
    | { mode: 'single'; item: CatalogItem }
    | { mode: 'bulk'; items: CatalogItem[]; categoryLabel?: string };
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
  const [supplierModalHydrating, setSupplierModalHydrating] = useState(false);

  const openSupplierEditor = useCallback(
    async (supplier: Supplier | null) => {
      setEditingSupplier(supplier);
      setShowCreateSupplier(true);
      if (!supplier?._id || !dataUserId) {
        setSupplierModalHydrating(false);
        return;
      }
      setSupplierModalHydrating(true);
      try {
        const freshSuppliers = await listSuppliersRequest(dataUserId);
        setSuppliers(freshSuppliers);
        const fresh = freshSuppliers.find((s) => s._id === supplier._id);
        if (fresh) setEditingSupplier(fresh);
      } catch {
        /* se usa el proveedor de la lista local */
      } finally {
        setSupplierModalHydrating(false);
      }
    },
    [dataUserId],
  );

  // Invoice state
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<PurchaseInvoice | null>(null);
  const [showInvoiceOcr, setShowInvoiceOcr] = useState(false);
  const [showInvoiceOcrStorePicker, setShowInvoiceOcrStorePicker] = useState(false);
  const [invoiceOcrWorkCenter, setInvoiceOcrWorkCenter] = useState<{ id: string; name: string } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [catalogImportReport, setCatalogImportReport] = useState<CatalogImportReport | null>(null);
  const [imageZipMap, setImageZipMap] = useState<Record<string, string>>({});
  const [loadingImageZip, setLoadingImageZip] = useState(false);
  const { focus: activationFocus, clearFocus: clearActivationFocus } = useActivationFocus();

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = catalogImportFieldsForVertical(catalogVertical);

  const commercialLines = useMemo(
    () => sortBrandsForDisplay(commercialLineBrands(brands)),
    [brands],
  );

  const emptyCommercialLines = useMemo(
    () => commercialLinesWithoutCatalogItems(commercialLines, catalogItems),
    [commercialLines, catalogItems],
  );

  const templateOrganizerLines = useMemo(
    () => organizerBrandsForCatalogTemplate(brands),
    [brands],
  );

  const handleDownloadCatalogTemplate = useCallback(() => {
    downloadDeliveryCatalogImportTemplate(templateOrganizerLines, catalogImportTemplateFilename, {
      vertical: catalogVertical,
    });
    toast.success(
      isEventsCatalog
        ? 'Plantilla productos TPV eventos (sin marcas)'
        : isHeladeriaCatalog
          ? 'Plantilla catálogo heladería'
          : isRestaurantCatalog
            ? 'Plantilla catálogo bar/restaurante'
            : 'Plantilla catálogo',
    );
  }, [templateOrganizerLines, catalogImportTemplateFilename, catalogVertical, isHeladeriaCatalog, isRestaurantCatalog, isEventsCatalog]);

  const handleImportEntries = async (
    entries: Record<string, string>[],
    onProgress?: CatalogImportProgressReporter,
    signal?: AbortSignal,
  ): Promise<CatalogImportRunResult> => {
    const progress = (phase: string, opts?: { detail?: string; current?: number; total?: number; percent?: number }) => {
      throwIfAborted(signal);
      onProgress?.({ phase, ...opts });
    };

    const finish = (result: CatalogImportRunResult): CatalogImportRunResult => {
      if (result.report) setCatalogImportReport(result.report);
      return result;
    };

    if (!dataUserId) return finish({ count: 0, report: null });

    progress('Validando filas del Excel…', { percent: 5, detail: `${entries.length} fila(s) leídas` });

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

    const { validEntries: importRows, issues: importIssues } = partitionDeliveryCatalogImportEntries(
      productRows,
      brands,
    );

    progress('Filas válidas listas', {
      percent: 10,
      current: importRows.length,
      total: productRows.length,
      detail: `${importRows.length} producto(s) a importar`,
    });

    if (importRows.length === 0) {
      const validation = { ok: false, issues: importIssues };
      const report = catalogImportReportFromValidation(validation, brands);
      toast.error(
        importIssues.some((i) => i.severity === 'error')
          ? 'Ninguna fila válida en el Excel — revisa nombre, categoría y precio'
          : 'No hay productos para importar',
      );
      return finish({ count: 0, report });
    }

    const warnings = importIssues.filter((i) => i.severity === 'warning');
    const errors = importIssues.filter((i) => i.severity === 'error');
    const warningLines = consolidateCatalogImportWarnings(
      warnings.map((w) => ({
        row: w.row,
        field: w.field,
        message: w.message,
        code: w.code,
        value: w.value,
      })),
      brands,
    );
    const missingBrandWarningCount = warningLines.filter((w) => w.code === MISSING_BRAND_IMPORT_CODE).length;
    if (errors.length > 0) {
      toast.message(
        `Se importan ${importRows.length} fila(s). ${errors.length} fila(s) omitida(s) por error (revisa el informe).`,
        { duration: 9000 },
      );
    }

    const zipProvided = Object.keys(imageZipMap).length > 0;
    const unmatchedImageRefs: string[] = [];
    let brandCache = [...brands];
    const unmatchedCommercialBrands: string[] = [];
    const items: Partial<CatalogItem>[] = [];

    for (let index = 0; index < importRows.length; index += 1) {
      throwIfAborted(signal);
      const entry = importRows[index];
      if (index === 0 || index === importRows.length - 1 || index % 8 === 0) {
        progress('Preparando productos…', {
          current: index + 1,
          total: importRows.length,
          percent: 10 + Math.round(((index + 1) / importRows.length) * 28),
          detail: entry.name ? String(entry.name).trim().slice(0, 48) : undefined,
        });
        await yieldToUi();
      }
      const mapped = await mapImportEntryToCatalogItem(entry, {
        businessId: businessId || '',
        brandCache,
        vertical: catalogVertical,
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
      const image =
        String(entry.image || '').trim() ||
        imageFromZip ||
        resolveCatalogProductPlaceholderUrl({
          name,
          category: mapped.item.category || '',
          itemType: mapped.item.itemType,
        });
      if (zipProvided && !image) unmatchedImageRefs.push(sku || name || `fila ${index + 2}`);

      items.push({ ...mapped.item, image, sku: sku || mapped.item.sku });
    }

    const brandImportWarn = formatUnmatchedCommercialBrandWarning(unmatchedCommercialBrands, brandCache);
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

    progress('Guardando catálogo en el servidor…', {
      percent: 42,
      current: items.length,
      total: items.length,
      detail: 'Un momento — no cierres la ventana',
    });

    let result: Awaited<ReturnType<typeof bulkCreateCatalogItemsRequest>>;
    let recoveredFromTimeout = false;
    try {
      result = await bulkCreateCatalogItemsRequest(dataUserId, items, signal);
    } catch (err) {
      if (isImportAbortError(err)) throw err;
      throwIfAborted(signal);
      // Timeout/red a menudo llega cuando Couch ya guardó: no asustar con error rojo.
      const refreshed = await listCatalogItemsRequest(dataUserId).catch(() => [] as CatalogItem[]);
      const skuSet = new Set(
        refreshed.map((row) => String(row.sku || '').trim().toLowerCase()).filter(Boolean),
      );
      const nameSet = new Set(
        refreshed.map((row) => String(row.name || '').trim().toLowerCase()).filter(Boolean),
      );
      let recovered = 0;
      for (const it of items) {
        const sku = String(it.sku || '').trim().toLowerCase();
        const name = String(it.name || '').trim().toLowerCase();
        if ((sku && skuSet.has(sku)) || (name && nameSet.has(name))) recovered += 1;
      }
      if (recovered <= 0) throw err;

      recoveredFromTimeout = true;
      setAllCatalogItems(refreshed);
      notifyDeliveryCatalogChanged(dataUserId, businessId);
      result = {
        ok: true,
        created: recovered,
        updated: 0,
        errors: Math.max(0, items.length - recovered),
        items: refreshed,
      };
      toast.warning(
        `La conexión falló a medias, pero hay ${recovered} producto(s) en Carta. Revisa el catálogo.`,
        { duration: 10000 },
      );
    }
    throwIfAborted(signal);
    const totalOk = (result.created || 0) + (result.updated ?? 0);
    const savedItems = Array.isArray(result.items) ? result.items : [];
    const withIngredients = items.filter((i) => String(i.customFields?.ingredients || '').trim()).length;

    if (totalOk > 0 && savedItems.length > 0 && !recoveredFromTimeout) {
      setAllCatalogItems((prev) => {
        const byId = new Map(prev.map((row) => [row._id, row]));
        for (const row of savedItems) byId.set(row._id, row);
        return Array.from(byId.values());
      });
      notifyDeliveryCatalogChanged(dataUserId, businessId);
      setCatalogSectionsOpen((prev) => {
        const next = new Set(prev);
        for (const item of items) {
          const cat = String(item.category || '').trim();
          if (cat) next.add(cat);
        }
        return next;
      });
    }

    const runPostImport = async (): Promise<{
      costing: { updated: number; recipe: number; fixed: number };
      inventory: { created: number; updated: number };
    } | null> => {
      if (!businessId || totalOk <= 0) return null;
      try {
        throwIfAborted(signal);
        progress('Actualizando marcas y organizadores…', { percent: 82 });
        await syncTpvOrganizersAfterCatalogImport(businessId, items);
        await activateCommercialLinesAfterCatalogImport(businessId, items);
        await loadBrands();

        progress('Sincronizando ingredientes…', { percent: 88 });
        await syncStoreIngredientsFromCatalogImport(dataUserId, businessId, items);

        progress('Generando escandallos y stock automático…', {
          percent: 94,
          detail: 'Recetas, costes y almacén — un momento',
        });
        const automation = await syncFullStockAutomationAfterCatalogImport(dataUserId, businessId);
        return {
          costing: {
            updated: automation.costing.updated,
            recipe: automation.costing.recipe,
            fixed: automation.costing.fixed,
          },
          inventory: {
            created: automation.inventory.created,
            updated: automation.inventory.updated,
          },
        };
      } catch (err) {
        if (!isImportAbortError(err)) {
          console.warn('[catalog-import] post-proceso:', err);
          toast.error(
            'El Excel se guardó, pero falló el escandallo automático. Abre Escandallo → «Generar escandallos».',
            { duration: 12000 },
          );
        }
        throw err;
      } finally {
        void loadCatalog();
      }
    };

    let postImportSummary: Awaited<ReturnType<typeof runPostImport>> = null;
    if (totalOk > 0) {
      if (!recoveredFromTimeout) {
        const importedWithImage = items.filter((i) => Boolean(i.image)).length;
        const parts = [];
        if (result.created > 0) parts.push(`${result.created} nuevo(s)`);
        if ((result.updated ?? 0) > 0) parts.push(`${result.updated} actualizado(s)`);
        toast.success(
          `${parts.join(' · ')}` +
            (importedWithImage > 0 ? ` · ${importedWithImage} con imagen` : '') +
            (withIngredients > 0 ? ` · ${withIngredients} fila(s) con ingredientes en Excel` : ''),
        );
      }
      try {
        postImportSummary = await runPostImport();
      } catch (err) {
        if (isImportAbortError(err)) throw err;
      }
    }

    progress('Importación completada', {
      percent: 100,
      detail:
        postImportSummary && postImportSummary.costing.updated > 0
          ? `${totalOk} producto(s) · escandallo: ${postImportSummary.costing.recipe} recetas, ${postImportSummary.costing.fixed} costes fijos`
          : `${totalOk} producto(s) procesados`,
    });

    if (postImportSummary && postImportSummary.costing.updated > 0) {
      toast.success(
        `Escandallo automático: ${postImportSummary.costing.recipe} recetas y ${postImportSummary.costing.fixed} costes fijos listos`,
        { duration: 9000 },
      );
    }

    const bulkReport = catalogImportReportFromBulkErrors(
      result.errorDetails,
      result.created,
      result.updated ?? 0,
    );
    // Filas del Excel omitidas (sin precio, etc.): si el resto se guardó, son avisos — no “error” rojo.
    const omittedRowNotices = errors.map((e) => ({
      row: e.row,
      field: e.field,
      message: `Fila omitida: ${e.message}`,
    }));
    const bulkErrors = bulkReport?.errors ?? [];
    const successReport: CatalogImportReport = {
      at: Date.now(),
      summary:
        totalOk > 0
          ? errors.length > 0
            ? `Importación completada: ${totalOk} producto(s) · ${errors.length} fila(s) omitida(s)${warningLines.length > 0 ? ` · ${warningLines.length} aviso(s)` : ''}`
            : missingBrandWarningCount > 0 && missingBrandWarningCount === warningLines.length
              ? `Importación completada (${totalOk} productos) — aviso: falta marca en Ajustes → Marca`
              : warningLines.length > 0
                ? `Importación completada (${totalOk} productos) · ${warningLines.length} aviso(s)`
                : 'Importación completada'
          : result.errors > 0
            ? result.errors > 0 &&
              (result.errorDetails || []).every((e) =>
                String(e.error || '').toLowerCase().includes('código duplicado') ||
                String(e.error || '').toLowerCase().includes('sku duplicado'),
              )
              ? 'Esos productos ya existen en el catálogo (mismo código). No se duplicaron.'
              : `${result.errors} producto(s) no se importaron`
            : 'Importación sin cambios',
      errors: totalOk > 0
        ? bulkErrors
        : [
            ...errors.map((e) => ({ row: e.row, field: e.field, message: e.message })),
            ...bulkErrors,
          ],
      warnings: totalOk > 0
        ? [...warningLines, ...omittedRowNotices]
        : warningLines,
      created: result.created,
      updated: result.updated ?? 0,
      failed: totalOk > 0 ? result.errors : result.errors + errors.length,
    };

    if (result.errors > 0 && totalOk === 0) {
      const allDuplicateSku = (result.errorDetails || []).every((e) => {
        const err = String(e.error || '').toLowerCase();
        return err.includes('código duplicado') || err.includes('sku duplicado');
      });
      if (allDuplicateSku) {
        toast.info(successReport.summary, { duration: 10000 });
      } else {
        toast.error(successReport.summary);
      }
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
      toast.success(`ZIP cargado: ${Object.keys(map).length} imagen(es) lista(s) para mapear por nombre o código`);
    } catch {
      toast.error('No se pudo leer el ZIP de imágenes');
    } finally {
      setLoadingImageZip(false);
    }
  }, []);

  const handleDownloadSampleZip = useCallback(async () => {
    const zipCopy = getRetailOpsUiCopy('delivery');
    try {
      const zip = new JSZip();
      zip.file('PIZ-001.png', SAMPLE_PNG_BASE64, { base64: true });
      zip.file('PIZ-002.png', SAMPLE_PNG_BASE64, { base64: true });
      zip.file(
        'LEEME.txt',
        [
          zipCopy.catalogZipReadmeTitle,
          '',
          '1) Nombra cada foto por código (recomendado) o por nombre del producto.',
          '2) Formatos soportados: .jpg, .jpeg, .png, .webp',
          '3) Usa los mismos valores que en las columnas codigo o nombre del Excel.',
        ].join('\n'),
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipCopy.catalogZipFilename;
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
      /* Mantener marcas previas: evita «Marca sin completar» por fallo de red/API. */
    } finally {
      setBrandsLoading(false);
    }
  }, [businessId]);

  const loadTpvIngredients = useCallback(async () => {
    if (!dataUserId) {
      setStoreIngredients([]);
      setBrandIngredientSelection({});
      setTpvFreeSwapOnRemove(false);
      setTpvDefaultExtraPrice('');
      return;
    }
    try {
      const config = await getDeliveryConfigRequest(dataUserId);
      const lineBrands = sortBrandsForDisplay(
        businessId
          ? commercialLineBrands(
              brands.length > 0 ? brands : await listBrandsRequest(businessId).catch(() => []),
            )
          : brands,
      );
      const brandIds = lineBrands.map((b) => b._id);
      const unified = unifyStoreIngredientsFromConfig(config, brandIds);
      const { ingredientSelection } = resolveTpvBrandConfigFromDeliveryConfig(config, brandIds);
      setStoreIngredients(unified);
      setBrandIngredientSelection(ingredientSelection);
      setTpvFreeSwapOnRemove(config?.tpvFreeSwapOnRemove === true);
      setTpvDefaultExtraPrice(
        String(inferTpvDefaultExtraPrice(unified, config?.tpvDefaultExtraPrice) || ''),
      );
    } catch {
      setStoreIngredients([]);
      setBrandIngredientSelection({});
      setTpvFreeSwapOnRemove(false);
      setTpvDefaultExtraPrice('');
    }
  }, [dataUserId, businessId, brands]);

  const handleToggleTpvFreeSwap = useCallback(
    async (next: boolean) => {
      if (!dataUserId || savingTpvFreeSwap) return;
      const prev = tpvFreeSwapOnRemove;
      setTpvFreeSwapOnRemove(next);
      setSavingTpvFreeSwap(true);
      try {
        await updateDeliveryConfigRequest(dataUserId, { tpvFreeSwapOnRemove: next });
        notifyDeliveryConfigChanged();
        toast.success(
          next
            ? 'Regla TPV activada: 1 quitado = 1 extra gratis'
            : 'Regla TPV desactivada',
        );
      } catch {
        setTpvFreeSwapOnRemove(prev);
        toast.error('No se pudo guardar la regla TPV');
      } finally {
        setSavingTpvFreeSwap(false);
      }
    },
    [dataUserId, savingTpvFreeSwap, tpvFreeSwapOnRemove],
  );

  const handleSaveTpvExtraPrice = useCallback(async () => {
    if (!dataUserId || savingTpvExtraPrice) return;
    const price = normalizeTpvDefaultExtraPrice(tpvDefaultExtraPrice);
    if (price == null) {
      toast.error('Indica un precio válido para los extras (ej. 1,50)');
      return;
    }
    setSavingTpvExtraPrice(true);
    try {
      await updateDeliveryConfigRequest(dataUserId, { tpvDefaultExtraPrice: price });
      setTpvDefaultExtraPrice(String(price));
      notifyDeliveryConfigChanged();
      toast.success(`Precio por extra: ${price.toFixed(2).replace('.', ',')} €`);
    } catch {
      toast.error('No se pudo guardar el precio del extra');
    } finally {
      setSavingTpvExtraPrice(false);
    }
  }, [dataUserId, savingTpvExtraPrice, tpvDefaultExtraPrice]);
  useEffect(() => {
    if (!pageReady) return;
    const onConfigChanged = () => {
      void loadTpvIngredients();
    };
    window.addEventListener(DELIVERY_CONFIG_CHANGED, onConfigChanged);
    return () => window.removeEventListener(DELIVERY_CONFIG_CHANGED, onConfigChanged);
  }, [pageReady, loadTpvIngredients]);

  useEffect(() => {
    if (!businessesFetchSettled) return;
    void loadBrands();
  }, [businessesFetchSettled, businessId, loadBrands]);

  useEffect(() => {
    if (!dataUserId) return;
    const onCatalogStockChanged = () => {
      invalidateCatalogListCache(dataUserId);
      void listCatalogItemsRequest(dataUserId, 'stock')
        .then((stockItems) => {
          setAllCatalogItems((prev) => {
            const kept = prev.filter((i) => (i.module || 'catalog') !== 'stock');
            return [...kept, ...stockItems];
          });
        })
        .catch(() => {});
    };
    window.addEventListener(DELIVERY_CATALOG_CHANGED, onCatalogStockChanged);
    return () => window.removeEventListener(DELIVERY_CATALOG_CHANGED, onCatalogStockChanged);
  }, [dataUserId]);

  useEffect(() => {
    if (!pageReady) return;
    void loadTpvIngredients();
  }, [pageReady, loadTpvIngredients]);

  const loadCatalog = useCallback(async (modules?: CatalogLoadModules): Promise<boolean> => {
    if (!dataUserId || !businessId) return false;
    const wantCarta = modules?.carta ?? true;
    const wantStock = modules?.stock ?? true;
    if (!wantCarta && !wantStock) return true;

    const requestUserId = dataUserId;
    const requestBusinessId = businessId;
    const stillSameScope = () =>
      requestUserId === resolveBusinessDataUserId(user, currentBusiness)
      && requestBusinessId === resolveBusinessScopeId(currentBusiness);
    try {
      const fetches: Promise<CatalogItem[]>[] = [];
      if (wantCarta) fetches.push(listCatalogItemsRequest(requestUserId, 'catalog'));
      if (wantStock) {
        fetches.push(listCatalogItemsRequest(requestUserId, 'stock').catch(() => [] as CatalogItem[]));
      }
      const results = await Promise.all(fetches);
      if (!stillSameScope()) return false;

      let idx = 0;
      const carta = wantCarta ? results[idx++] : [];
      const stock = wantStock ? results[idx++] : [];
      setAllCatalogItems((prev) => mergeCatalogItemsById(prev, [...carta, ...stock]));

      if (wantCarta) catalogCartaLoadedRef.current = true;
      if (wantStock) catalogStockLoadedRef.current = true;
      catalogLoadedRef.current =
        catalogCartaLoadedRef.current && catalogStockLoadedRef.current;

      if (wantStock) {
        void listWarehousesRequest(requestUserId)
          .then((wh) => {
            if (!stillSameScope()) return;
            setWarehouses(wh);
          })
          .catch(() => {
            if (!stillSameScope()) return;
            setWarehouses([]);
          });
      }

      return true;
    } catch {
      toast.error('Error al cargar el catálogo');
      return false;
    }
  }, [dataUserId, businessId, user, currentBusiness]);

  const loadSuppliers = useCallback(async () => {
    if (!dataUserId) return;
    setSuppliersLoading(true);
    const watchdog = window.setTimeout(() => {
      setSuppliersLoading(false);
      suppliersLoadStartedRef.current = false;
    }, 45_000);
    try {
      const data = await listSuppliersRequest(dataUserId);
      setSuppliers(data);
      suppliersFetchedRef.current = true;
    } catch {
      suppliersLoadStartedRef.current = false;
    } finally {
      window.clearTimeout(watchdog);
      setSuppliersLoading(false);
    }
  }, [dataUserId]);

  const loadInvoices = useCallback(async () => {
    if (!dataUserId) return;
    setInvoicesHydrating(true);
    const watchdog = window.setTimeout(() => {
      setInvoicesHydrating(false);
      invoicesLoadStartedRef.current = false;
    }, 45_000);
    try {
      const data = await listPurchaseInvoicesRequest(dataUserId, {
        businessId: businessId || undefined,
        accountBusinessCount,
      });
      setInvoices(data);
      invoicesFetchedRef.current = true;
    } catch {
      invoicesLoadStartedRef.current = false;
    } finally {
      window.clearTimeout(watchdog);
      setInvoicesHydrating(false);
    }
  }, [dataUserId, businessId, accountBusinessCount]);

  const loadInvoiceFinanceLinks = useCallback(async () => {
    if (!dataUserId) return;
    try {
      const movements = await listFinanceMovements(dataUserId, businessId || undefined);
      const linked = new Set(
        movements
          .filter((m) => m.type === 'pago' && m.sourceRef)
          .map((m) => String(m.sourceRef)),
      );
      setInvoiceFinanceLinks(linked);
    } catch {
      // no bloquea la pestaña de facturas
    }
  }, [dataUserId, businessId]);

  const syncInvoicesFromEmail = useCallback(async (opts?: { silent?: boolean }) => {
    if (!dataUserId) {
      if (!opts?.silent) toast.error('Selecciona una empresa');
      return;
    }
    const silent = opts?.silent === true;
    setSyncingEmailInvoices(true);
    try {
      const summary = await pollSupplierInvoicesNow(dataUserId);
      if (!silent) {
        if ((summary.errors || 0) > 0 && (summary.created || 0) === 0) {
          toast.warning(
            'Correo revisado con errores. Comprueba la contraseña de aplicación de cada PDV en Correo facturas.',
          );
        } else if (summary.baselined || summary.message) {
          toast.message(
            String(summary.message || 'Punto de partida del correo listo. Envía un PDF nuevo y sincroniza.'),
            { duration: 9000 },
          );
        } else if ((summary.created || 0) > 0) {
          toast.success(`${summary.created} factura(s) desde correo · ${summary.processed || 0} email(s)`);
        } else if ((summary.duplicates || 0) > 0) {
          toast.warning(
            `Correo revisado: ${summary.duplicates} PDF(s) ya estaban dados de alta (mismo nº de factura).`,
          );
        } else if ((summary.processed || 0) > 0) {
          toast.warning(
            `${summary.processed} email(s) revisados, 0 facturas nuevas (PDF sin importe legible o ya procesados)`,
          );
        } else {
          toast.message('0 emails nuevos desde que conectaste el correo.');
        }
      }
      await loadInvoices();
      await loadInvoiceFinanceLinks();
      await reloadInvoiceEmailStatus();
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : 'Error al sincronizar correo');
    } finally {
      setSyncingEmailInvoices(false);
    }
  }, [dataUserId, loadInvoices, loadInvoiceFinanceLinks, reloadInvoiceEmailStatus]);

  useEffect(() => {
    if (!catalogDataReady || !dataUserId) return;
    void reloadInvoiceEmailStatus();
  }, [catalogDataReady, dataUserId, reloadInvoiceEmailStatus]);

  useEffect(() => {
    if (activeTab === 'invoices' && dataUserId) {
      void loadInvoiceFinanceLinks();
    }
  }, [activeTab, dataUserId, loadInvoiceFinanceLinks]);

  useEffect(() => {
    catalogLoadedRef.current = false;
    catalogCartaLoadedRef.current = false;
    catalogStockLoadedRef.current = false;
    suppliersFetchedRef.current = false;
    invoicesFetchedRef.current = false;
    purchaseOrdersFetchedRef.current = false;
    suppliersLoadStartedRef.current = false;
    invoicesLoadStartedRef.current = false;
    purchaseOrdersLoadStartedRef.current = false;
    setAllCatalogItems([]);
    setSuppliers([]);
    setInvoices([]);
    setPurchaseOrders([]);
    setInvoicesHydrating(false);
    setInvoiceEmailPdvs([]);
    setInvoiceFinanceLinks(new Set());
    setWarehouses([]);
    setLoading(false);
  }, [businessId, dataUserId]);

  const loadPurchaseOrdersForAlbaran = useCallback(async () => {
    if (!dataUserId) return;
    setPurchaseOrdersLoading(true);
    try {
      const orders = await listPurchaseOrdersRequest(dataUserId, {
        businessId: businessId || undefined,
        accountBusinessCount,
      });
      setPurchaseOrders(orders);
      purchaseOrdersFetchedRef.current = true;
    } catch (err) {
      purchaseOrdersLoadStartedRef.current = false;
      toast.error(err instanceof Error ? err.message : 'Error al cargar pedidos de compra');
    } finally {
      setPurchaseOrdersLoading(false);
    }
  }, [dataUserId, businessId, accountBusinessCount]);

  useEffect(() => {
    if (!catalogDataReady) return;

    const modules = catalogModulesForTab(activeTab, showCreateSupplier);
    const needsCarta = modules.carta && !catalogCartaLoadedRef.current;
    const needsStock = modules.stock && !catalogStockLoadedRef.current;
    if (!needsCarta && !needsStock) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      // Solo desbloquea la UI (p. ej. Almacén vía InventoryPanel). Sin toast:
      // en prod la carta puede tardar >35s mientras stock/compras ya cargaron por otra ruta.
      setLoading(false);
    }, 52_000);

    void loadCatalog(modules).then((ok) => {
      if (cancelled) return;
      window.clearTimeout(timeoutId);
      if (ok) {
        if (modules.carta) catalogCartaLoadedRef.current = true;
        if (modules.stock) catalogStockLoadedRef.current = true;
        catalogLoadedRef.current =
          catalogCartaLoadedRef.current && catalogStockLoadedRef.current;
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    catalogDataReady,
    dataUserId,
    activeTab,
    showCreateSupplier,
    loadCatalog,
    catalogModulesForTab,
  ]);

  useEffect(() => {
    const onStoreChange = () => {
      void loadCatalog({ carta: true, stock: true });
    };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStoreChange);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStoreChange);
  }, [loadCatalog]);

  useEffect(() => {
    if (!dataUserId) return;

    const isComprasTab = COMPRAS_TAB_IDS.has(activeTab);

    if (
      isComprasTab
      && !suppliersFetchedRef.current
      && !suppliersLoadStartedRef.current
    ) {
      suppliersLoadStartedRef.current = true;
      void loadSuppliers();
    }

    if (
      isComprasTab
      && !invoicesFetchedRef.current
      && !invoicesLoadStartedRef.current
    ) {
      invoicesLoadStartedRef.current = true;
      void loadInvoices();
    }

    if (
      activeTab === 'albaranes'
      && !purchaseOrdersFetchedRef.current
      && !purchaseOrdersLoadStartedRef.current
    ) {
      purchaseOrdersLoadStartedRef.current = true;
      void loadPurchaseOrdersForAlbaran();
    }
  }, [
    dataUserId,
    activeTab,
    loadSuppliers,
    loadInvoices,
    loadPurchaseOrdersForAlbaran,
  ]);

  const handleAlbaranOcrFile = async (order: PurchaseOrder, file: File) => {
    setAlbaranOcrBusy(true);
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const prepared = isPdf
        ? { base64: await fileToRawBase64(file), mime: 'application/pdf' }
        : await downscaleImageFileToBase64(file);
      const scanRes = await scanDocument(prepared.base64, prepared.mime, { targetModule: 'compras' });
      if (scanRes.data?.parseError) {
        throw new Error('No se pudo leer el albarán. Prueba una foto más clara.');
      }
      const draft = purchaseInvoiceFromAlbaranOcr(order, scanRes.data, {
        imageBase64: prepared.mime.startsWith('image/') ? prepared.base64 : '',
      });
      setAlbaranCorroborate({ order, invoice: draft });
      toast.success('Albarán leído. Revisa cantidades y pulsa Confirmar pedido.');
    } catch (err) {
      toast.error(toUserFacingMessage(err, 'No se pudo escanear el albarán'));
    } finally {
      setAlbaranOcrBusy(false);
    }
  };

  const handleReplenishPendingOrder = useCallback(async (
    sourceOrder: PurchaseOrder,
    pendingLines?: PendingOrderLine[],
  ) => {
    if (!dataUserId) return;
    const pending = pendingLines?.length ? pendingLines : pendingLinesFromPurchaseOrder(sourceOrder);
    if (pending.length === 0) {
      toast.message('No hay productos pendientes de pedir');
      return;
    }
    const payload = buildReplenishPurchaseOrderPayload(sourceOrder, pending);
    if (!payload) {
      toast.error('No se pudo preparar el pedido de reposición');
      return;
    }
    setReplenishingOrder(true);
    try {
      const created = await createPurchaseOrderRequest(dataUserId, {
        ...payload,
        businessId: businessId || payload.businessId || '',
        businessName: currentBusiness?.name || payload.businessName || '',
      });
      setPurchaseOrders((prev) =>
        [created, ...prev].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
      );
      toast.success(
        `Pedido ${created.orderNumber || ''} creado con lo pendiente (${pending.length} producto(s))`,
      );
      setShowCreateInvoice(false);
      setEditingInvoice(null);
      setSearchParams({ tab: 'purchase-orders' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el pedido automático');
    } finally {
      setReplenishingOrder(false);
    }
  }, [dataUserId, setSearchParams]);

  const loadDeliveryOrders = useCallback(async () => {
    if (!dataUserId) return;
    setOrdersLoading(true);
    try {
      // Stats de ventas del catálogo: últimos ~60 días (no historial completo).
      const today = localCalendarDayKey();
      const from = (() => {
        const d = new Date(`${today}T12:00:00`);
        d.setDate(d.getDate() - 60);
        return localDayBoundsForKey(localCalendarDayKey(d)).from;
      })();
      const { orders } = await filterDeliveryOrdersRequest(dataUserId, {
        dateFrom: from,
        dateTo: `${today}T23:59:59.999Z`,
        limit: 1500,
        ...(businessId ? { businessId } : {}),
      });
      setDeliveryOrders(orders);
    } catch {
      setDeliveryOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [dataUserId, businessId]);

  useEffect(() => {
    if (activeTab !== 'catalog' || !dataUserId) return;
    // Sin productos no hace falta tirar de 60 días de pedidos (antes bloqueaba la sensación de “carta vacía lenta”).
    if (loading) return;
    if (catalogMenuItems.length === 0) {
      setDeliveryOrders([]);
      return;
    }
    void loadDeliveryOrders();
  }, [activeTab, dataUserId, loading, catalogMenuItems.length, loadDeliveryOrders]);

  const catalogSalesIndex = useMemo(
    () => buildCatalogSalesIndex(catalogForActiveStore, deliveryOrders),
    [catalogForActiveStore, deliveryOrders],
  );

  // ── CRUD: Catalog Items ─────────────────────────────────────────────────────

  const handleCreateItem = async (
    data: Partial<CatalogItem>,
    options?: { keepOpen?: boolean },
  ) => {
    if (!dataUserId) {
      toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.');
      throw new Error('Sesión no válida');
    }
    const payload: Partial<CatalogItem> = {
      ...data,
      module: 'catalog',
      ...(businessId
        ? { vertical: catalogVertical, business_id: businessId }
        : {}),
    };
    const duplicateByName = findCatalogDuplicateByName(
      catalogMenuItemsRaw,
      String(data.name || '').trim(),
      { excludeId: editingItem?._id },
    );
    if (duplicateByName) {
      toast.error(formatCatalogDuplicateNameError(duplicateByName));
      throw new Error('duplicate_name');
    }
    try {
      let savedItem: CatalogItem | null = null;
      if (editingItem) {
        const updated = await updateCatalogItemRequest(dataUserId, { ...editingItem, ...payload } as CatalogItem);
        savedItem = updated;
        setAllCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
        setDetailItem((prev) => (prev?._id === updated._id ? updated : prev));
        toast.success('Artículo actualizado');
      } else {
        const created = await createCatalogItemRequest(dataUserId, payload as CatalogItem);
        savedItem = created;
        setAllCatalogItems((prev) => [created, ...prev]);
        if (created.category?.trim()) {
          setActiveCatalogCategory(normalizeImportCategory(created.category));
        }
        if (!options?.keepOpen) {
          toast.success('Artículo creado');
        }
      }
      if (!options?.keepOpen) {
        setShowCreateItem(false);
        setEditingItem(null);
        setComboSeedProduct(null);
      }
      const uid = dataUserId;
      const bid = businessId;
      const createdOrUpdated = savedItem;
      const recipeLines = Array.isArray(createdOrUpdated?.customFields?.costingRecipe)
        ? (createdOrUpdated.customFields.costingRecipe as unknown[])
        : [];
      const needsRecipeStock =
        createdOrUpdated?.customFields?.costingType === 'recipe' && recipeLines.length > 0;
      void (async () => {
        try {
          if (usesTpvCatalogUi && bid && createdOrUpdated) {
            const sync = await syncTpvOrganizersAfterCatalogImport(bid, [createdOrUpdated]);
            const activation = await activateCommercialLinesAfterCatalogImport(bid, [createdOrUpdated]);
            if (sync.updatedBrands > 0 || activation.activated > 0) await loadBrands();
          }
          if (createdOrUpdated && needsRecipeStock && !isRestaurantCatalog) {
            const bizType = currentBusiness?.businessType || 'delivery';
            await syncInventoryCatalogFromSources(uid, {
              businessType: String(bizType),
              businessId: bid || undefined,
              storeIngredients,
              catalogItems: [createdOrUpdated, ...allCatalogItems],
              brands,
            });
            const refreshed = await listCatalogItemsRequest(uid).catch(() => null);
            if (refreshed) {
              const inventory = filterStockInventoryItems(refreshed);
              await syncRecipesFromCostingCatalog(uid, [createdOrUpdated], inventory);
              setAllCatalogItems((prev) => mergeCatalogItemsById(prev, refreshed));
            }
          }
        } catch {
          /* el producto ya está en carta; TPV/escandallo se pueden regenerar luego */
        } finally {
          notifyDeliveryCatalogChanged(uid, bid);
        }
      })();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el artículo');
      throw err;
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
    const visible = filteredCatalog.filter((item) => selectedCatalogIds.has(item._id));
    const items = expandCatalogItemsForDeletion(visible, catalogMenuItemsRaw);
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

  const catalogSectionRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of catalogMenuItems) {
      const cat = String(item.category || '').trim() || 'Sin categoría';
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    for (const raw of sessionCatalogSections) {
      const cat = String(raw || '').trim();
      if (!cat) continue;
      const hit = [...map.keys()].find((k) => k.toLowerCase() === cat.toLowerCase());
      if (hit) continue;
      map.set(cat, 0);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [catalogMenuItems, sessionCatalogSections]);

  const handleAddCatalogSection = useCallback(
    async (rawName: string) => {
      const cat = normalizeImportCategory(rawName.replace(/^\w/u, (c) => c.toUpperCase()));
      if (!cat) {
        toast.error('Escribe un nombre válido');
        return;
      }
      if (isWarehouseImportCategory(cat)) {
        toast.error('Esa categoría es de almacén, no de carta');
        return;
      }
      const exists = catalogSectionRows.some((s) => s.name.toLowerCase() === cat.toLowerCase());
      if (exists) {
        toast.message(`«${cat}» ya existe`);
        return;
      }
      setSessionCatalogSections((prev) =>
        prev.some((c) => c.toLowerCase() === cat.toLowerCase()) ? prev : [...prev, cat],
      );
      toast.success(`Sección «${cat}» lista · añade un producto para verla en la carta`);
    },
    [catalogSectionRows],
  );

  const handleRenameCatalogSection = useCallback(
    async (from: string, toRaw: string) => {
      if (!dataUserId) return;
      const to = normalizeImportCategory(toRaw.replace(/^\w/u, (c) => c.toUpperCase()));
      if (!to) {
        toast.error('Nombre no válido');
        return;
      }
      if (isWarehouseImportCategory(to)) {
        toast.error('Esa categoría es de almacén, no de carta');
        return;
      }
      if (to.toLowerCase() === from.toLowerCase()) return;
      const clash = catalogSectionRows.some(
        (s) => s.name.toLowerCase() === to.toLowerCase() && s.name.toLowerCase() !== from.toLowerCase(),
      );
      if (clash) {
        toast.error(`Ya existe «${to}»`);
        return;
      }

      const items = catalogMenuItemsRaw.filter(
        (i) => String(i.category || '').trim().toLowerCase() === from.toLowerCase(),
      );
      let ok = 0;
      let fail = 0;
      for (const item of items) {
        try {
          const updated = await updateCatalogItemRequest(dataUserId, { ...item, category: to });
          setAllCatalogItems((prev) => prev.map((row) => (row._id === updated._id ? updated : row)));
          ok += 1;
        } catch {
          fail += 1;
        }
      }

      setSessionCatalogSections((prev) => {
        const without = prev.filter((c) => c.toLowerCase() !== from.toLowerCase());
        if (items.length === 0) {
          return without.some((c) => c.toLowerCase() === to.toLowerCase())
            ? without
            : [...without, to];
        }
        return without;
      });

      if (activeCatalogCategory?.toLowerCase() === from.toLowerCase()) {
        setActiveCatalogCategory(to);
      }

      if (businessId && ok > 0) {
        try {
          if (fail === 0) {
            await removeCatalogCategoryFromBrands(businessId, from);
          }
          await syncTpvOrganizersAfterCatalogImport(
            businessId,
            items.map((i) => ({ brandIds: i.brandIds, category: to })),
          );
          setBrands(await listBrandsRequest(businessId));
          notifyDeliveryBrandsChanged();
        } catch {
          /* productos renombrados; TPV se puede sincronizar al recargar */
        }
      }

      notifyDeliveryCatalogChanged(dataUserId, businessId);
      if (fail > 0) toast.error(`Renombrados ${ok}, fallaron ${fail}`);
      else if (ok > 0) toast.success(`«${from}» → «${to}» (${ok} producto${ok !== 1 ? 's' : ''})`);
      else toast.success(`Sección renombrada a «${to}»`);
    },
    [dataUserId, catalogSectionRows, catalogMenuItemsRaw, businessId, activeCatalogCategory],
  );

  const handleDeleteCatalogSectionFromModal = useCallback(
    async (name: string, count: number) => {
      if (count > 0) {
        const visible = catalogMenuItems.filter(
          (i) => String(i.category || '').trim().toLowerCase() === name.toLowerCase(),
        );
        const items = expandCatalogItemsForDeletion(visible, catalogMenuItemsRaw);
        if (items.length === 0) {
          toast.error('No se encontraron productos de esa sección');
          return;
        }
        setCatalogSectionsOpen(false);
        setCatalogDeleteGuard({ mode: 'bulk', items, categoryLabel: name });
        return;
      }
      setSessionCatalogSections((prev) => prev.filter((c) => c.toLowerCase() !== name.toLowerCase()));
      if (activeCatalogCategory?.toLowerCase() === name.toLowerCase()) {
        setActiveCatalogCategory(null);
      }
      toast.success(`Sección «${name}» quitada`);
    },
    [catalogMenuItems, catalogMenuItemsRaw, activeCatalogCategory],
  );

  const executeCatalogDeleteAfterGuard = useCallback(async () => {
    const op = catalogDeleteOpRef.current;
    setCatalogDeleteGuard(null);
    if (!dataUserId || !op) return;

    if (op.mode === 'single') {
      const item = op.item;
      setDeletingItemIds((prev) => new Set(prev).add(item._id));
      try {
        await deleteCatalogItemRequest(dataUserId, item._id);
        setAllCatalogItems((prev) => prev.filter((i) => i._id !== item._id));
        notifyDeliveryCatalogChanged(dataUserId, businessId);

        // Último de carta → misma limpieza que el borrado masivo (recetas, almacén sync, ingredientes).
        const stillMenu = (await listCatalogItemsRequest(dataUserId, 'catalog').catch(() => []))
          .filter((row) => (row.module || 'catalog') === 'catalog' && !row.deletedAt && row._id !== item._id);
        const stillScoped = businessId
          ? filterCatalogItemsForBusinessScope(stillMenu, businessId, brands, {
              accountBusinessCount,
              activeBusinessType: businessType,
            })
          : stillMenu;
        if (stillScoped.length === 0) {
          await wipeCatalogLeftoversAfterEmptyCarta(dataUserId, businessId, {
            brands,
            accountBusinessCount,
            businessType,
          });
          setStoreIngredients([]);
        }

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
    const categoryLabel = op.categoryLabel;
    setBulkDeletingCatalog(true);
    const toastId = toast.loading(`Eliminando ${list.length} artículo(s)…`, { duration: Infinity });
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

      if (categoryLabel && businessId && result.deleted > 0 && result.failed === 0) {
        try {
          const updatedBrands = await removeCatalogCategoryFromBrands(businessId, categoryLabel);
          if (updatedBrands > 0) {
            setBrands(await listBrandsRequest(businessId));
            notifyDeliveryBrandsChanged();
          }
        } catch {
          /* productos ya borrados; fallo al limpiar pestaña TPV no bloquea */
        }
      }

      setSessionCatalogSections((prev) =>
        categoryLabel
          ? prev.filter((c) => c.toLowerCase() !== categoryLabel.toLowerCase())
          : prev,
      );
      if (
        categoryLabel
        && activeCatalogCategory
        && activeCatalogCategory.toLowerCase() === categoryLabel.toLowerCase()
      ) {
        setActiveCatalogCategory(null);
      }
      const deletedIds = new Set(list.map((i) => i._id));
      setDetailItem((prev) => (prev && deletedIds.has(prev._id) ? null : prev));
      setEditingItem((prev) => (prev && deletedIds.has(prev._id) ? null : prev));

      await loadCatalog();
      notifyDeliveryCatalogChanged(dataUserId, businessId);

      // Carta vacía → limpiar restos del Excel (almacén sync, ingredientes TPV, recetas, organizadores).
      let leftovers: Awaited<ReturnType<typeof wipeCatalogLeftoversAfterEmptyCarta>> | null = null;
      const stillMenu = (await listCatalogItemsRequest(dataUserId, 'catalog').catch(() => []))
        .filter((item) => (item.module || 'catalog') === 'catalog' && !item.deletedAt);
      const stillScoped = businessId
        ? filterCatalogItemsForBusinessScope(stillMenu, businessId, brands, {
            accountBusinessCount,
            activeBusinessType: businessType,
          })
        : stillMenu;

      if (stillScoped.length === 0 && result.failed === 0) {
        toast.loading('Limpiando almacén, ingredientes y restos…', { id: toastId });
        leftovers = await wipeCatalogLeftoversAfterEmptyCarta(dataUserId, businessId, {
          brands,
          accountBusinessCount,
          businessType,
        });
        setStoreIngredients([]);
        if (businessId) {
          try {
            setBrands(await listBrandsRequest(businessId));
          } catch {
            /* ignore */
          }
        }
        await loadCatalog();
      }

      toast.dismiss(toastId);

      if (result.failed === 0) {
        const extraParts: string[] = [];
        if (leftovers?.stockDeleted) extraParts.push(`${leftovers.stockDeleted} almacén`);
        if (leftovers?.ingredientsCleared) extraParts.push('ingredientes TPV');
        if (leftovers?.recipesDeleted) extraParts.push(`${leftovers.recipesDeleted} recetas`);
        if (leftovers?.organizersDeleted) extraParts.push(`${leftovers.organizersDeleted} organizadores`);
        const extra = extraParts.length > 0 ? ` · también ${extraParts.join(', ')}` : '';
        toast.success(
          categoryLabel
            ? `Organizador «${categoryLabel}» eliminado (${result.deleted} producto${result.deleted !== 1 ? 's' : ''})${extra}`
            : `${result.deleted} artículo(s) eliminado(s)${extra}`,
        );
      } else {
        toast.error(
          `Quedan ${result.failed} artículo(s) sin eliminar. Reintenta desde Editar o recarga la página.`,
          { duration: 12000 },
        );
      }
    } catch {
      toast.dismiss(toastId);
      toast.error('Error al eliminar el catálogo. Inténtalo de nuevo.');
    } finally {
      setBulkDeletingCatalog(false);
      exitCatalogSelectMode();
    }
  }, [
    dataUserId,
    loadCatalog,
    exitCatalogSelectMode,
    businessId,
    brands,
    accountBusinessCount,
    businessType,
    activeCatalogCategory,
  ]);

  const handleToggleField = async (item: CatalogItem, field: 'webVisible' | 'available' | 'active') => {
    if (!dataUserId) return;
    try {
      const updated = await updateCatalogItemRequest(dataUserId, { ...item, [field]: !item[field] });
      setAllCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
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

  const handleSaveDetailItem = async (payload: {
    name: string;
    unitPrice: number;
    costPrice: number;
    active: boolean;
    ingredients: string;
    comboItems: CatalogComboRef[];
    comboStructure?: ComboStructureSlot[];
    comboStructureConfirmed?: boolean;
  }) => {
    if (!dataUserId || !detailItem) throw new Error('missing item');
    const category = String(detailItem.category || '');
    const rawIngredients = payload.ingredients.trim();
    const normalizedIngredients = normalizeCatalogFichaIngredientsForSave(rawIngredients);
    if (rawIngredients && !normalizedIngredients) {
      toast.warning('«Ver carta» no cuenta como ingrediente. Escribe ingredientes reales separados por comas.');
    }
    const updated = await updateCatalogItemRequest(dataUserId, {
      ...detailItem,
      name: payload.name,
      unitPrice: payload.unitPrice,
      costPrice: payload.costPrice,
      active: payload.active,
      itemType:
        detailItem.itemType === 'combo' || /combo/i.test(category)
          ? detailItem.itemType || 'combo'
          : detailItem.itemType,
      comboItems:
        detailItem.itemType === 'combo' || /combo/i.test(category) ? payload.comboItems : detailItem.comboItems,
      customFields: {
        ...(detailItem.customFields || {}),
        ingredients: normalizedIngredients,
        ...(payload.comboStructure ? { comboStructure: payload.comboStructure } : {}),
        ...(payload.comboStructureConfirmed !== undefined
          ? { comboStructureConfirmed: payload.comboStructureConfirmed }
          : {}),
      },
    });
    setAllCatalogItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
    setDetailItem(updated);
    notifyDeliveryCatalogChanged(dataUserId, businessId);
  };

  /** Alias por si queda alguna referencia antigua al guardado TPV de la ficha. */
  const handleSaveDetailTpvConfig = handleSaveDetailItem;

  const handleStockAdjust = async (item: CatalogItem, newQuantity: number) => {
    if (!dataUserId) return;
    try {
      const updated = await updateCatalogItemRequest(dataUserId, { ...item, stockQuantity: newQuantity });
      setAllCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
      setStockAdjustItem(null);
      toast.success(`Stock de "${item.name}" actualizado a ${newQuantity}`);
    } catch {
      toast.error('Error al ajustar el stock');
    }
  };

  // ── CRUD: Suppliers ─────────────────────────────────────────────────────────

  const handleCreateSupplier = async (data: Partial<Supplier> & { catalogItemCosts?: Record<string, number> }) => {
    if (!dataUserId) { toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.'); return; }
    const { catalogItemCosts, ...rest } = data;
    const resolvedCatalogItemIds = resolveSupplierSelectedStockIds(
      rest.catalogItemIds || [],
      catalogItems,
      storeIngredients,
    );
    const resolvedCosts: Record<string, number> = {};
    for (const [rawId, cost] of Object.entries(catalogItemCosts || {})) {
      const mapped = resolveSupplierSelectedStockIds([rawId], catalogItems, storeIngredients)[0];
      if (mapped) resolvedCosts[mapped] = cost;
    }
    const organizerIds = [
      ...new Set(
        (Array.isArray(rest.organizerIds) ? rest.organizerIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean),
      ),
    ];
    const supplierData = {
      ...rest,
      organizerIds,
      catalogItemIds: resolvedCatalogItemIds,
    };
    try {
      if (editingSupplier) {
        const updated = await updateSupplierRequest(dataUserId, {
          ...editingSupplier,
          ...supplierData,
          organizerIds,
          catalogItemIds: resolvedCatalogItemIds,
        } as Supplier);
        const linked = await syncSupplierCatalogItemLinks(
          dataUserId,
          updated,
          supplierData.catalogItemIds || [],
          catalogItems,
          resolvedCosts,
          storeIngredients,
        );
        if (linked.length > 0) {
          const byId = new Map(linked.map((i) => [i._id, i]));
          setAllCatalogItems((prev) => prev.map((i) => byId.get(i._id) ?? i));
        }
        const freshSuppliers = await listSuppliersRequest(dataUserId);
        setSuppliers(freshSuppliers);
        toast.success('Proveedor actualizado');
      } else {
        const created = await createSupplierRequest(dataUserId, supplierData);
        const linked = await syncSupplierCatalogItemLinks(
          dataUserId,
          created,
          supplierData.catalogItemIds || [],
          catalogItems,
          resolvedCosts,
          storeIngredients,
        );
        if (linked.length > 0) {
          const byId = new Map(linked.map((i) => [i._id, i]));
          setAllCatalogItems((prev) => prev.map((i) => byId.get(i._id) ?? i));
        }
        const freshSuppliers = await listSuppliersRequest(dataUserId);
        setSuppliers(freshSuppliers);
        toast.success('Proveedor creado');
      }
      setShowCreateSupplier(false);
      setEditingSupplier(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el proveedor');
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!dataUserId) return;
    if (!confirm(`¿Eliminar "${supplier.name}"?`)) return;
    try {
      await deleteSupplierRequest(dataUserId, supplier._id);
      setSuppliers(prev => prev.filter(s => s._id !== supplier._id));
      toast.success('Proveedor eliminado');
    } catch {
      toast.error('Error al eliminar el proveedor');
    }
  };

  // ── OCR factura directa (proveedor + artículos + stock) ─────────────────────

  const invoiceOcrStores = useMemo(
    () =>
      activeStore.retailWorkCenters
        .filter((wc) => wc.active !== false)
        .map((wc) => ({ id: wc._id, name: wc.name || 'Tienda' })),
    [activeStore.retailWorkCenters],
  );

  const openInvoiceOcrFlow = useCallback(() => {
    if (!dataUserId) {
      toast.error('Sesión no válida. Recarga e inicia sesión de nuevo.');
      return;
    }
    if (invoiceOcrStores.length === 0) {
      toast.error('No hay tiendas. Crea una tienda antes de escanear facturas.');
      return;
    }
    if (invoiceOcrStores.length === 1) {
      setInvoiceOcrWorkCenter(invoiceOcrStores[0]);
      setShowInvoiceOcr(true);
      return;
    }
    setShowInvoiceOcrStorePicker(true);
  }, [dataUserId, invoiceOcrStores]);

  const confirmInvoiceOcrStore = useCallback((store: { id: string; name: string }) => {
    setInvoiceOcrWorkCenter(store);
    setShowInvoiceOcrStorePicker(false);
    setShowInvoiceOcr(true);
  }, []);

  // ── CRUD: Invoices ──────────────────────────────────────────────────────────

  const handleCreateInvoice = async (data: Partial<PurchaseInvoice>) => {
    if (!dataUserId) { toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.'); return; }
    const scope = {
      businessId: businessId || '',
      businessName: currentBusiness?.name || '',
      workCenterId: activeWorkCenterId,
      workCenterName: activeWorkCenterName,
      costCenterId: activeWorkCenterId,
      costCenterName: activeWorkCenterName,
    };
    try {
      if (editingInvoice) {
        const updated = await updatePurchaseInvoiceRequest(dataUserId, { ...editingInvoice, ...data, ...scope } as PurchaseInvoice);
        setInvoices(prev => prev.map(i => i._id === updated._id ? updated : i));
        toast.success('Factura actualizada');
      } else {
        const created = await createPurchaseInvoiceRequest(dataUserId, { ...data, ...scope });
        setInvoices(prev => [created, ...prev]);
        setInvoiceFinanceLinks((prev) => new Set(prev).add(created._id));
        toast.success('Factura creada · gasto registrado en finanzas');
      }
      setShowCreateInvoice(false);
      setEditingInvoice(null);
      void loadInvoiceFinanceLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar la factura');
    }
  };

  const handleDeleteInvoice = async (invoice: PurchaseInvoice, e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!dataUserId) return;
    if (!canDeletePurchaseDocuments(currentBusiness, user)) {
      toast.error('Solo el dueño de la cuenta o un admin puede borrar facturas y albaranes');
      return;
    }
    const isAlbaran = invoiceIsAlbaran(invoice);
    const label = isAlbaran ? 'albarán' : 'factura';
    const code = invoice.invoiceNumber || invoice._id;
    if (!window.confirm(`¿Eliminar ${label} ${code}? Esta acción no se puede deshacer.`)) return;
    try {
      await deletePurchaseInvoiceRequest(dataUserId, invoice._id);
      setInvoices((prev) => prev.filter((i) => i._id !== invoice._id));
      toast.success(isAlbaran ? 'Albarán eliminado' : 'Factura eliminada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Error al eliminar el ${label}`);
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
      if (newStatus === 'paid' && !invoiceFinanceLinks.has(invoice._id)) {
        try {
          await createMovementFromInvoice(dataUserId, invoice._id, 'purchase_invoice');
          setInvoiceFinanceLinks((prev) => new Set(prev).add(invoice._id));
        } catch {
          // puede existir por reconcile al crear
        }
      }
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

  const handleLoadInvoiceToWarehouse = async (invoice: PurchaseInvoice, options?: { force?: boolean }) => {
    if (!dataUserId) return;
    try {
      const result = await loadPurchaseInvoiceStockRequest(dataUserId, invoice._id, {
        force: Boolean(options?.force),
      });
      setInvoices((prev) => prev.map((i) => (i._id === result.invoice._id ? result.invoice : i)));
      if (result.skipped) {
        toast.message('Ya estaba cargado en almacén');
      } else {
        const n = result.reconcile?.stockUpdated || 0;
        toast.success(
          n > 0
            ? `Cargado al almacén: ${n} artículo(s)`
            : 'Sin líneas vinculadas a inventario (revisa catalogItemId en las líneas)',
        );
        void loadCatalog();
      }
    } catch (err) {
      toast.error(toUserFacingMessage(err, 'No se pudo cargar al almacén'));
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    return [
      ...new Set(
        catalogItems
          .filter((i) => String(i.module || 'catalog') !== 'stock')
          .map((i) => i.category)
          .filter((c): c is string => Boolean(c) && !isWarehouseImportCategory(c)),
      ),
    ].sort();
  }, [catalogItems]);

  const openNewCatalogItemManual = useCallback(() => {
    if (!dataUserId) {
      toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.');
      return;
    }
    setEditingItem(null);
    setComboSeedProduct(null);
    setShowCreateItem(true);
  }, [dataUserId]);

  const openCatalogImport = useCallback(() => {
    if (!dataUserId) {
      toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.');
      return;
    }
    setShowImportModal(true);
  }, [dataUserId]);

  useEffect(() => {
    if (!activationFocus || !pageReady) return;
    if (activationFocus === 'catalog-import') {
      openCatalogImport();
      clearActivationFocus();
    }
  }, [activationFocus, pageReady, openCatalogImport, clearActivationFocus]);

  const filteredCatalog = useMemo(() => {
    return catalogMenuItems.filter((item) => {
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
  }, [catalogMenuItems, searchCatalog, brands]);

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

  const startCatalogMoveMode = useCallback(() => {
    if (filteredCatalog.length === 0) {
      toast.error('No hay productos en el catálogo');
      return;
    }
    setCatalogSelectMode(true);
    setBulkDeleteConfirmStep(false);
    setSelectedCatalogIds(new Set());
    toast.info('Marca los productos y pulsa «Mover»', { duration: 6000 });
  }, [filteredCatalog.length]);

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

  const handleDeleteCategorySection = useCallback(
    (category: string, items: CatalogItem[]) => {
      if (!dataUserId || bulkDeletingCatalog || bulkMovingCatalog || items.length === 0) return;
      const expanded = expandCatalogItemsForDeletion(items, catalogMenuItemsRaw);
      setCatalogDeleteGuard({
        mode: 'bulk',
        items: expanded.length > 0 ? expanded : items,
        categoryLabel: category,
      });
    },
    [dataUserId, bulkDeletingCatalog, bulkMovingCatalog, catalogMenuItemsRaw],
  );

  const handleDeleteEmptyOrganizer = useCallback(
    async (brand: Brand) => {
      if (!businessId) return;
      if (!window.confirm(`¿Eliminar el organizador «${brand.name}»? No tiene productos asignados.`)) return;
      setDeletingOrganizerId(brand._id);
      try {
        await deleteBrandRequest(businessId, brand._id);
        setBrands((prev) => prev.filter((b) => b._id !== brand._id));
        notifyDeliveryBrandsChanged();
        notifyDeliveryCatalogChanged(dataUserId, businessId);
        toast.success(`Organizador «${brand.name}» eliminado`);
        setCatalogMoveItems((prev) => {
          if (!prev || prev.length > 0) return prev;
          const remaining = commercialLinesWithoutCatalogItems(
            commercialLines.filter((line) => line._id !== brand._id),
            catalogItems,
          );
          return remaining.length === 0 ? null : prev;
        });
      } catch {
        toast.error('No se pudo eliminar el organizador');
      } finally {
        setDeletingOrganizerId(null);
      }
    },
    [businessId, dataUserId, commercialLines, catalogItems],
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
            setAllCatalogItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
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
    totalItems: catalogMenuItems.length,
    rawTotalItems: catalogMenuItemsRaw.length,
    products: catalogMenuItems.filter(i => (i.itemType || 'product') === 'product').length,
    services: catalogMenuItems.filter(i => i.itemType === 'service').length,
    combos: catalogMenuItems.filter(i => i.itemType === 'combo').length,
    lowStock: catalogMenuItems.filter(i => i.active && (i.itemType || 'product') === 'product' && Number(i.minStock || 0) > 0 && Number(i.stockQuantity || 0) <= Number(i.minStock || 0)).length,
    categories: new Set(catalogMenuItems.map(i => i.category).filter(Boolean)).size,
    inventoryValue: catalogMenuItems.reduce((s, i) => {
      if (!i.active || (i.itemType || 'product') !== 'product') return s;
      const quantity = Math.max(0, Number(i.stockQuantity || 0));
      const cost = Number(i.costPrice || 0);
      return s + quantity * cost;
    }, 0),
  }), [catalogMenuItems, catalogMenuItemsRaw.length]);

  const catalogTabStats = useMemo(() => {
    const stats: Array<{ label: string; value: number | string; tone?: 'red' | 'default' }> = [
      { label: 'artículos', value: catalogKpis.totalItems },
    ];
    if (catalogKpis.lowStock > 0) {
      stats.push({ label: 'stock bajo', value: catalogKpis.lowStock, tone: 'red' });
    }
    if (catalogKpis.categories > 0) {
      stats.push({ label: 'categorías', value: catalogKpis.categories });
    }
    if (catalogKpis.inventoryValue > 0) {
      stats.push({
        label: 'valor €',
        value: catalogKpis.inventoryValue.toLocaleString('es-ES', { maximumFractionDigits: 0 }),
      });
    }
    return stats;
  }, [catalogKpis]);

  const supplierKpis = useMemo(() => ({
    total: suppliers.length,
    active: suppliers.filter(s => s.active).length,
  }), [suppliers]);

  const invoiceKpis = useMemo(() => {
    const docs = scopedInvoices.filter((i) => !invoiceIsAlbaran(i));
    const isPending = (i: PurchaseInvoice) => {
      const d = invoiceDisplayStatus(i);
      return d === 'pending' || d === 'pending_validation' || d === 'pending_payment' || d === 'validated' || d === 'overdue';
    };
    return {
      total: docs.length,
      pending: docs.filter(isPending).length,
      paid: docs.filter((i) => invoiceDisplayStatus(i) === 'paid').length,
      totalAmount: docs.reduce((s, i) => s + (Number(i.total) || 0), 0),
    };
  }, [scopedInvoices]);

  const stockTabCount = useMemo(() => {
    const scoped = filterStockInventoryItems(catalogForActiveStore);
    const pending = scoped.filter((i) => Number(i.stockQuantity || 0) === 0).length;
    return pending > 0 ? pending : scoped.filter((i) => Number(i.stockQuantity || 0) > 0).length;
  }, [catalogForActiveStore]);

  // ── Tab: Catálogo ───────────────────────────────────────────────────────────

  const isCatalogEmpty = !loading && catalogMenuItems.length === 0;
  const isSearchEmpty =
    !loading && catalogMenuItems.length > 0 && filteredCatalog.length === 0 && Boolean(searchCatalog.trim());

  const renderCatalogTab = () => (
    <CatalogTabShell
      stats={catalogTabStats}
      storeLabel={storeLabel}
      dataUserId={dataUserId}
      storeWarehouseId={storeWarehouseId}
      toolbarBelow={
        <SaasTabSearch
          value={searchCatalog}
          onChange={setSearchCatalog}
          placeholder="Buscar en el menú…"
          className="relative w-full"
        />
      }
      toolbarRight={
        <>
              {!isCatalogEmpty && !catalogSelectMode ? (
                <>
                  <SaasTabSecondaryButton
                    onClick={startCatalogMoveMode}
                    disabled={bulkDeletingCatalog || bulkMovingCatalog || filteredCatalog.length === 0}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Mover
                  </SaasTabSecondaryButton>
                  <SaasTabSecondaryButton
                    onClick={() => setCatalogSectionsOpen(true)}
                    disabled={bulkDeletingCatalog || bulkMovingCatalog}
                    title="Añadir, renombrar o quitar secciones de la carta"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar
                  </SaasTabSecondaryButton>
                </>
              ) : isCatalogEmpty && !catalogSelectMode ? (
                <SaasTabSecondaryButton
                  onClick={() => setCatalogSectionsOpen(true)}
                  title="Añadir secciones de la carta"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </SaasTabSecondaryButton>
              ) : !isCatalogEmpty && catalogSelectMode ? (
                <>
                  <SaasTabSecondaryButton
                    onClick={exitCatalogSelectMode}
                    disabled={bulkDeletingCatalog || bulkMovingCatalog}
                  >
                    Cancelar
                  </SaasTabSecondaryButton>
                  <SaasTabSecondaryButton
                    onClick={() => openCatalogMoveModal()}
                    disabled={bulkDeletingCatalog || bulkMovingCatalog || selectedCatalogCount === 0}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    {bulkMovingCatalog ? 'Moviendo…' : `Mover (${selectedCatalogCount})`}
                  </SaasTabSecondaryButton>
                  <SaasTabSecondaryButton
                    onClick={handleBulkDeleteSelected}
                    disabled={bulkDeletingCatalog || bulkMovingCatalog || selectedCatalogCount === 0}
                    className={
                      bulkDeleteConfirmStep
                        ? '!bg-red-700 !text-white !border-red-800 hover:!bg-red-800'
                        : '!border-red-300 !text-red-700'
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {bulkDeletingCatalog
                      ? 'Eliminando…'
                      : bulkDeleteConfirmStep
                        ? `Estoy seguro (${selectedCatalogCount})`
                        : `Eliminar (${selectedCatalogCount})`}
                  </SaasTabSecondaryButton>
                </>
              ) : null}
              {!isCatalogEmpty ? (
                <ActivationFieldWrap
                  fieldKey="catalog-import"
                  activeKey={
                    activationFocus === 'catalog-import' || activationFocus === 'catalog-add'
                      ? activationFocus
                      : null
                  }
                >
                  <AddButtonDropdown
                    label="Nuevo producto"
                    onQuickAdd={openNewCatalogItemManual}
                    onImport={openCatalogImport}
                    onPurchaseList={() => setSearchParams({ tab: 'purchase-orders' })}
                    quickAddLabel="Añadir manualmente"
                    quickAddDesc="Marca, categoría, precios y stock en 3 pasos"
                    importAddLabel="Importar Excel"
                    importAddDesc="Plantilla con productos, precios e imágenes opcionales"
                    purchaseListLabel="Lista de la compra"
                    purchaseListDesc="Pedido a proveedor con las categorías que te venden"
                  />
                </ActivationFieldWrap>
              ) : null}
            </>
      }
    >
      {/* Secciones por categoría */}
      {(loading || catalogBusy) && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          {brandsLoading && !loading
            ? 'Cargando marcas comerciales…'
            : catalogItems.length > 0
              ? 'Actualizando catálogo…'
              : 'Cargando productos…'}
        </div>
      )}
      {!loading && !catalogBusy && isCatalogEmpty ? (
        <ActivationFieldWrap
          fieldKey="catalog-import"
          activeKey={
            activationFocus === 'catalog-import' || activationFocus === 'catalog-add'
              ? activationFocus
              : null
          }
        >
          <CatalogEmptyActions
            onManualAdd={openNewCatalogItemManual}
            onImport={openCatalogImport}
          />
        </ActivationFieldWrap>
      ) : isSearchEmpty ? (
        <SaasTabEmpty
          icon={<Search className="w-10 h-10" />}
          title="Sin resultados"
          description={`No hay artículos que coincidan con «${searchCatalog.trim()}»`}
          action={
            <SaasTabSecondaryButton onClick={() => setSearchCatalog('')}>
              Limpiar búsqueda
            </SaasTabSecondaryButton>
          }
        />
      ) : catalogMenuItems.length > 0 || filteredCatalog.length > 0 ? (
        (() => {
          const searchActive = Boolean(searchCatalog.trim());
          const groups = (() => {
            const base = catalogGroupedByCategory;
            if (searchActive || sessionCatalogSections.length === 0) return base;
            const known = new Set(base.map((g) => g.category.toLowerCase()));
            const extras = sessionCatalogSections
              .filter((name) => name && !known.has(name.toLowerCase()))
              .map((category) => ({ category, items: [] as CatalogItem[] }));
            if (extras.length === 0) return base;
            return sortCatalogSectionKeys([...base.map((g) => g.category), ...extras.map((g) => g.category)]).map(
              (category) =>
                base.find((g) => g.category === category)
                || extras.find((g) => g.category === category)
                || { category, items: [] as CatalogItem[] },
            );
          })();
          const singleCategory = groups.length === 1 ? groups[0].category : null;
          const selectedCategory = searchActive
            ? null
            : activeCatalogCategory && groups.some((g) => g.category === activeCatalogCategory)
              ? activeCatalogCategory
              : singleCategory;
          const selectedGroup = selectedCategory
            ? groups.find((g) => g.category === selectedCategory) ?? null
            : null;
          const showGrid = !searchActive && !selectedGroup;
          const items = searchActive ? groups.flatMap((g) => g.items) : selectedGroup?.items ?? [];
          const shownTitle = searchActive ? `Resultados de «${searchCatalog.trim()}»` : selectedCategory ?? '';
          return (
        <div className="p-3 space-y-3">
              {showGrid ? (
                <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {groups.map(({ category, items: groupItems }) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCatalogCategory(category)}
                      className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex -space-x-3">
                          {groupItems.slice(0, 3).map((it) => (
                            <img
                              key={it._id}
                              src={resolveCatalogProductImage(it)}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
                            />
                          ))}
                          {groupItems.length > 3 && (
                            <span className="flex w-10 h-10 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[11px] font-bold text-gray-500 dark:border-gray-800 dark:bg-gray-700 dark:text-gray-300">
                              +{groupItems.length - 3}
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[var(--v-blue,#2563eb)] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                      <div className="min-w-0 w-full">
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate group-hover:text-[var(--v-blue,#2563eb)]">
                          {category}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 tabular-nums">
                          {groupItems.length} artículo{groupItems.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                {usesTpvCatalogUi ? (
                  <section className="rounded-2xl border-2 border-[var(--v-blue,#2563eb)]/35 bg-white dark:bg-gray-800 p-4 space-y-3 shadow-sm">
                    <div className="flex items-start gap-2 min-w-0">
                      <Zap className="w-5 h-5 text-[var(--v-blue,#2563eb)] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          Cómo se aplica en el TPV
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Precio de extras y regla de cambio gratis para todo el menú.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                          Precio por extra (ajustable)
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1 min-w-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={tpvDefaultExtraPrice}
                              onChange={(e) => setTpvDefaultExtraPrice(e.target.value)}
                              disabled={savingTpvExtraPrice || !dataUserId}
                              className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 pr-8 text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100 outline-none focus:border-[var(--v-blue,#2563eb)] disabled:opacity-50"
                              title="Precio que se suma en el TPV por cada extra"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">
                              €
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={savingTpvExtraPrice || !dataUserId}
                            onClick={() => void handleSaveTpvExtraPrice()}
                            className={`shrink-0 px-3 py-2.5 text-xs font-bold disabled:opacity-40 ${VERTIAL_BTN_PRIMARY}`}
                          >
                            {savingTpvExtraPrice ? '…' : 'Guardar'}
                          </button>
                        </div>
                        <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                          Se cobra al añadir un extra en caja. Aplica a todos los extras del menú.
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                          Extras de pago ({storeIngredients.filter((i) => ingredientChargesExtra(i)).length})
                        </p>
                        <p className="text-xs text-gray-800 dark:text-gray-200 mt-0.5 leading-snug">
                          {storeIngredients.filter((i) => ingredientChargesExtra(i)).length > 0
                            ? storeIngredients
                                .filter((i) => ingredientChargesExtra(i))
                                .slice(0, 12)
                                .map((i) => i.name)
                                .join(' · ') +
                              (storeIngredients.filter((i) => ingredientChargesExtra(i)).length > 12
                                ? '…'
                                : '')
                            : 'Aún no hay extras marcados. El precio de arriba ya queda listo para cuando los actives.'}
                        </p>
                        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                          Base / quitables:{' '}
                          <span className="font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                            {storeIngredients.filter((i) => !ingredientChargesExtra(i)).length}
                          </span>
                        </p>
                      </div>
                    </div>

                    <label
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-colors ${
                        tpvFreeSwapOnRemove
                          ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/40'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 hover:border-blue-300'
                      } ${savingTpvFreeSwap ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={tpvFreeSwapOnRemove}
                        disabled={savingTpvFreeSwap || !dataUserId}
                        onChange={(e) => {
                          void handleToggleTpvFreeSwap(e.target.checked);
                        }}
                        className="mt-1 rounded border-gray-300 text-[var(--v-blue,#2563eb)] focus:ring-[var(--v-blue,#2563eb)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">
                          Regla TPV · 1 quitado = 1 extra gratis
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-300 mt-1 leading-snug">
                          Ejemplo: quita mozzarella y pone bacon → bacon a 0 €. Dos quitados → dos extras gratis.
                          El resto se cobra. Aplica a todo el menú en caja.
                        </span>
                        <span
                          className={`mt-2 inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${
                            tpvFreeSwapOnRemove
                              ? 'bg-[var(--v-blue,#2563eb)] text-white'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {savingTpvFreeSwap
                            ? 'Guardando…'
                            : tpvFreeSwapOnRemove
                              ? 'Activada'
                              : 'Desactivada'}
                        </span>
                      </span>
                    </label>
                  </section>
                ) : null}
                </>
              ) : (
              <div
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
                  {!searchActive && groups.length > 1 ? (
                    <SaasTabSecondaryButton
                      type="button"
                      onClick={() => setActiveCatalogCategory(null)}
                      title="Retroceder a categorías"
                      className="shrink-0 !border-[var(--v-blue,#2563eb)] !text-[var(--v-blue,#2563eb)] hover:!bg-blue-50 dark:hover:!bg-blue-950/40"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Retroceder
                    </SaasTabSecondaryButton>
                  ) : null}
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{shownTitle}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                    {items.length}
                  </span>
                  {!searchActive && selectedGroup && !catalogSelectMode ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategorySection(selectedCategory!, selectedGroup.items)}
                      disabled={bulkDeletingCatalog || bulkMovingCatalog}
                      className="ml-auto p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 dark:text-gray-600 dark:hover:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-50 shrink-0 transition-colors"
                      title={`Eliminar organizador «${selectedCategory}» y todos sus productos`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
                  {/* Móvil: tarjetas táctiles (sin scroll horizontal) */}
                  <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map((item) => {
                      const itemType = item.itemType || 'product';
                      const isLowStock = itemType === 'product' && item.stockQuantity <= item.minStock;
                      const sales = catalogSalesIndex.get(item._id);
                      const brandLabel = catalogItemBrandNames(item, brands);
                      const subtitleParts = [
                        itemType === 'service' ? 'Servicio' : itemType === 'combo' ? `Combo · ${item.comboItems?.length ?? 0} art.` : null,
                        brandLabel || null,
                        !item.active ? 'Inactivo' : null,
                      ].filter(Boolean) as string[];
                      const selected = catalogSelectMode && selectedCatalogIds.has(item._id);
                      return (
                        <li
                          key={item._id}
                          className={`px-3 py-2.5 ${selected ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''}`}
                        >
                          <div className="flex items-start gap-2.5">
                            {catalogSelectMode && (
                              <input
                                type="checkbox"
                                checked={selectedCatalogIds.has(item._id)}
                                onChange={() => toggleCatalogItemSelected(item._id)}
                                className="mt-2.5 w-4 h-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                aria-label={`Seleccionar ${item.name}`}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => setDetailItem(item)}
                              className="flex items-start gap-2.5 min-w-0 flex-1 text-left"
                              title="Ver ficha: ventas, escandallo e ingredientes"
                            >
                              <img
                                src={resolveCatalogProductImage(item)}
                                alt=""
                                className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-200/80 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
                              />
                              <span className="min-w-0 flex-1">
                                <span className={`block font-semibold text-sm leading-snug line-clamp-2 ${
                                  item.active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
                                }`}>
                                  {item.name}
                                </span>
                                {subtitleParts.length > 0 && (
                                  <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                    {subtitleParts.join(' · ')}
                                  </span>
                                )}
                                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                                  <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums text-sm">
                                    {item.unitPrice.toFixed(2)}€
                                  </span>
                                  <span className="text-gray-500 dark:text-gray-400 tabular-nums inline-flex items-center gap-1.5">
                                    <span className="font-semibold text-gray-800 dark:text-gray-200">{sales?.totalUnits ?? 0}</span>
                                    <CatalogUnitChip unit="ud" size="sm" />
                                    <span className="text-gray-400">vendidas</span>
                                  </span>
                                  {itemType !== 'service' && (
                                    <span className={`inline-flex items-center gap-1.5 ${isLowStock ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'}`}>
                                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Stock</span>
                                      <StockQtyWithUnit
                                        quantity={item.stockQuantity}
                                        unit={item.unit}
                                        low={isLowStock}
                                      />
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 pl-[58px]" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleToggleField(item, 'available')}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors ${
                                item.available
                                  ? 'bg-green-100 text-green-700 border-green-200'
                                  : 'bg-red-100 text-red-700 border-red-200'
                              }`}
                            >
                              {item.available ? 'Disponible' : 'Agotado'}
                            </button>
                            {itemType !== 'service' && (
                              <button
                                onClick={() => setStockAdjustItem(item)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded-full border border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                              >
                                Ajustar stock
                              </button>
                            )}
                            <span className="flex-1" />
                            <button
                              onClick={() => handleToggleField(item, 'webVisible')}
                              title={item.webVisible ? 'Visible en web' : 'Oculto de la web'}
                              className={`p-2 rounded-lg ${
                                item.webVisible
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-300 dark:text-gray-600'
                              }`}
                            >
                              <Globe className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setEditingItem(item); setComboSeedProduct(null); setShowCreateItem(true); }}
                              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                              title="Editar"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item)}
                              disabled={bulkDeletingCatalog || deletingItemIds.has(item._id)}
                              className="p-2 rounded-lg text-gray-400 hover:text-red-600 disabled:opacity-40"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {/* Desktop: tabla completa */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead>
                        <tr className="bg-gray-50/80 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                          {catalogSelectMode && (
                            <th className="px-4 py-2.5 w-10">
                              <span className="sr-only">Seleccionar</span>
                            </th>
                          )}
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Producto</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Precio</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Ventas</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Stock</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Disponible</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {items.map((item) => {
                          const itemType = item.itemType || 'product';
                          const isLowStock = itemType === 'product' && item.stockQuantity <= item.minStock;
                          const sales = catalogSalesIndex.get(item._id);
                          const brandLabel = catalogItemBrandNames(item, brands);
                          const subtitleParts = [
                            itemType === 'service' ? 'Servicio' : itemType === 'combo' ? `Combo · ${item.comboItems?.length ?? 0} art.` : null,
                            brandLabel || null,
                            !item.active ? 'Inactivo' : null,
                          ].filter(Boolean) as string[];
                          return (
                            <tr
                              key={item._id}
                              className={`transition-colors ${
                                catalogSelectMode && selectedCatalogIds.has(item._id)
                                  ? 'bg-blue-50/70 dark:bg-blue-950/20'
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
                                <button
                                  type="button"
                                  onClick={() => setDetailItem(item)}
                                  className="flex items-center gap-3 w-full text-left group"
                                  title="Ver ficha: ventas, escandallo e ingredientes"
                                >
                                  <img
                                    src={resolveCatalogProductImage(item)}
                                    alt=""
                                    className="w-11 h-11 rounded-lg object-cover shrink-0 border border-gray-200/80 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className={`block font-semibold text-sm leading-snug group-hover:text-[var(--v-blue,#2563eb)] line-clamp-2 ${
                                      item.active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
                                    }`}>
                                      {item.name}
                                    </span>
                                    {subtitleParts.length > 0 && (
                                      <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                        {subtitleParts.join(' · ')}
                                      </span>
                                    )}
                                  </div>
                                </button>
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
                                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums inline-flex items-center gap-1.5">
                                      <span>{sales?.totalUnits ?? 0}</span>
                                      <CatalogUnitChip unit="ud" size="sm" />
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                      {(sales?.totalRevenue ?? 0).toFixed(2)}€
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {itemType === 'service' ? (
                                  <span className="text-sm text-gray-400">—</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setStockAdjustItem(item)}
                                    title="Clic para ajustar stock"
                                    className="text-left rounded-lg px-1.5 py-0.5 -mx-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    <span className={`block ${isLowStock ? '' : ''}`}>
                                      <StockQtyWithUnit
                                        quantity={item.stockQuantity}
                                        unit={item.unit}
                                        low={isLowStock}
                                      />
                                    </span>
                                    {isLowStock && (
                                      <span className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                                        <AlertTriangle className="w-3 h-3" /> Min: {item.minStock}
                                      </span>
                                    )}
                                  </button>
                                )}
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
                                <div className="flex items-center justify-end gap-0.5">
                                  <button
                                    onClick={() => handleToggleField(item, 'webVisible')}
                                    title={item.webVisible ? 'Visible en web — clic para ocultar' : 'Oculto de la web — clic para mostrar'}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      item.webVisible
                                        ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
                                        : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:text-gray-600 dark:hover:text-gray-400 dark:hover:bg-gray-700'
                                    }`}
                                  >
                                    <Globe className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => { setEditingItem(item); setComboSeedProduct(null); setShowCreateItem(true); }}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item)}
                                    disabled={bulkDeletingCatalog || deletingItemIds.has(item._id)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
              </div>
              )}
        </div>
          );
        })()
      ) : null}
    </CatalogTabShell>
  );

  // ── Tab: Proveedores ────────────────────────────────────────────────────────

  const renderSuppliersTab = () => {
    const purchaseHistory = [...scopedInvoices]
      .filter((inv) => !invoiceIsAlbaran(inv))
      .sort((a, b) => {
        const da = Date.parse(String(a.createdAt || a.date || 0)) || 0;
        const db = Date.parse(String(b.createdAt || b.date || 0)) || 0;
        return db - da;
      });
    const recentOrders = [...scopedPurchaseOrders]
      .sort((a, b) => {
        const da = Date.parse(String(a.createdAt || 0)) || 0;
        const db = Date.parse(String(b.createdAt || 0)) || 0;
        return db - da;
      })
      .slice(0, 30);
    const historyTotal = purchaseHistory.reduce((s, i) => s + Number(i.total || 0), 0);
    const q = suppliersSearch.trim().toLowerCase();
    const suppliersSorted = [...suppliers]
      .filter((s) => {
        if (!q) return true;
        return (
          String(s.name || '').toLowerCase().includes(q)
          || String(s.code || '').toLowerCase().includes(q)
          || String(s.cif || '').toLowerCase().includes(q)
          || String(s.category || '').toLowerCase().includes(q)
          || String(s.contactPerson || '').toLowerCase().includes(q)
          || String(s.email || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));

    return (
    <CatalogTabShell
      stats={[
        { label: 'proveedores', value: supplierKpis.total },
        { label: 'activos', value: supplierKpis.active, tone: 'emerald' },
        { label: 'compras', value: purchaseHistory.length },
        { label: 'importe', value: formatMoneyEs(historyTotal) },
      ]}
      storeLabel={storeLabel}
      dataUserId={dataUserId}
      storeWarehouseId={storeWarehouseId}
      toolbarLeftExtra={
        suppliers.length > 0 ? (
          <SaasTabSearch
            value={suppliersSearch}
            onChange={setSuppliersSearch}
            placeholder="Buscar proveedor…"
            className="relative w-full sm:w-64"
          />
        ) : null
      }
      toolbarRight={
        <SaasTabPrimaryButton onClick={() => { void openSupplierEditor(null); }}>
          <Plus className="w-3.5 h-3.5" />
          Nuevo proveedor
        </SaasTabPrimaryButton>
      }
    >
      {suppliersLoading && suppliers.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Actualizando proveedores…
        </div>
      ) : suppliers.length === 0 ? (
        <SaasTabEmpty
          icon={<Truck className="w-10 h-10" />}
          title="Sin proveedores registrados"
          description="Añade el primer proveedor"
          action={
            <SaasTabPrimaryButton onClick={() => { void openSupplierEditor(null); }}>
              <Plus className="w-3.5 h-3.5" />
              Nuevo proveedor
            </SaasTabPrimaryButton>
          }
        />
      ) : suppliersSorted.length === 0 ? (
        <SaasTabEmpty
          icon={<Search className="w-10 h-10" />}
          title="Sin coincidencias"
          description={`Ningún proveedor coincide con «${suppliersSearch.trim()}»`}
        />
      ) : (
        <>
        {/* Móvil: tarjetas de proveedor */}
        <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
          {suppliersSorted.map(supplier => (
            <li key={supplier._id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 break-words">{supplier.name}</p>
                    {supplier.code ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded-full border bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
                        {supplier.code}
                      </span>
                    ) : null}
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border shrink-0 ${
                      supplier.active
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}>
                      {supplier.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">
                    {[supplier.contactPerson, supplier.phone, supplier.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </p>
                  {(supplier.cif || supplier.category) && (
                    <p className="text-[11px] text-gray-400 mt-0.5 break-words">
                      {[supplier.cif, supplier.category].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center shrink-0">
                  <button
                    onClick={() => { void openSupplierEditor(supplier); }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteSupplier(supplier)}
                    className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {/* Desktop: tabla al ancho, sin scroll a la derecha */}
        <div className="hidden md:block">
          <table className="w-full table-fixed">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase w-[38%]">Proveedor</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase w-[34%]">Suministra</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase w-[12%]">Estado</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase w-[16%]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {suppliersSorted.map(supplier => (
                <tr key={supplier._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="px-3 py-2.5 align-middle">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate" title={supplier.name}>
                      {supplier.name}
                    </div>
                    {supplier.code ? (
                      <div className="text-[11px] font-mono font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{supplier.code}</div>
                    ) : null}
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={[supplier.cif, supplier.contactPerson, supplier.phone, supplier.email, supplier.category].filter(Boolean).join(' · ')}>
                      {[supplier.cif, supplier.contactPerson, supplier.phone, supplier.email, supplier.category]
                        .filter(Boolean)
                        .join(' · ') || 'Sin datos de contacto'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    {(() => {
                      const linked = explicitMarkedStockItemsForSupplier(
                        catalogItems,
                        supplier,
                        storeIngredients,
                        inventoryCommercialBrands,
                      );
                      const names = linked.map((i) => i.name).filter(Boolean);
                      const labels = labelsForSupplierOrganizerIds(supplier.organizerIds, brands, catalogItems);
                      if (linked.length === 0 && labels.length === 0) {
                        return <span className="text-gray-400 text-sm">—</span>;
                      }
                      return (
                        <div className="space-y-1 min-w-0">
                          {linked.length > 0 ? (
                            <p
                              className="text-xs font-semibold text-gray-800 dark:text-gray-200"
                              title={names.length > 0 ? names.join(', ') : undefined}
                            >
                              <span className="tabular-nums">{linked.length}</span>
                              {' '}
                              {linked.length === 1 ? 'artículo' : 'artículos'}
                            </p>
                          ) : null}
                          {labels.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-h-12 overflow-hidden">
                              {labels.slice(0, 4).map((label) => (
                                <span
                                  key={label}
                                  title={label}
                                  className="px-1.5 py-0.5 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 text-[10px] font-medium rounded-md border border-sky-200 dark:border-sky-800 max-w-[7rem] truncate"
                                >
                                  {label}
                                </span>
                              ))}
                              {labels.length > 4 ? (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                                  +{labels.length - 4}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                      supplier.active
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}>
                      {supplier.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        onClick={() => setSearchParams({ tab: 'purchase-orders', supplier: supplier._id })}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-[var(--v-blue,#2563eb)] border border-blue-200 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950/30 transition-colors"
                        title="Crear pedido a este proveedor"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        Pedir
                      </button>
                      <button
                        onClick={() => { void openSupplierEditor(supplier); }}
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
        </>
      )}

      {/* Historial de compras (facturas + pedidos recientes) */}
      <div className="border-t border-gray-200 dark:border-gray-700 mt-2">
        <div className="px-3 py-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Historial de compras</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Facturas y pedidos de tus proveedores
            </p>
          </div>
          <SaasTabSecondaryButton type="button" onClick={() => setActiveTab('invoices')}>
            <Receipt className="w-3.5 h-3.5" />
            Ver facturas
          </SaasTabSecondaryButton>
        </div>

        {invoicesHydrating && purchaseHistory.length === 0 ? (
          <p className="px-3 pb-4 text-xs text-gray-500">Cargando historial…</p>
        ) : purchaseHistory.length === 0 && recentOrders.length === 0 ? (
          <p className="px-3 pb-4 text-sm text-gray-500 dark:text-gray-400">
            Aún no hay compras. Cuando sincronicéis el correo o creéis pedidos, saldrán aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/80 border-y border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Fecha</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Tipo</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Documento</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Proveedor</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase">Importe</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {purchaseHistory.slice(0, 40).map((inv) => {
                  const status = invoiceDisplayStatus(inv);
                  const statusCfg = INVOICE_STATUS_CONFIG[status] || INVOICE_STATUS_CONFIG.pending;
                  const num = invoiceTableNumber(inv);
                  return (
                    <tr
                      key={`inv-${inv._id}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
                      onClick={() => setViewingInvoice(inv)}
                    >
                      <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {invoiceDateLabel(inv)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                          Factura
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {num.primary}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 truncate max-w-[12rem]">
                        {inv.supplierName || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-semibold tabular-nums text-right text-gray-900 dark:text-gray-100">
                        {formatMoneyEs(inv.total || 0)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full border ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {recentOrders.slice(0, 15).map((order) => (
                  <tr
                    key={`po-${order._id}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
                    onClick={() => setSearchParams({ tab: 'purchase-orders', order: order._id })}
                  >
                    <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {order.createdAt
                        ? formatDateEs(String(order.createdAt).slice(0, 10))
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700">
                        Pedido
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {order.orderNumber || order._id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 truncate max-w-[12rem]">
                      {order.supplierName || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-semibold tabular-nums text-right text-gray-900 dark:text-gray-100">
                      {formatMoneyEs(order.total || 0)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
                        {order.status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CatalogTabShell>
    );
  };

  // ── Tab: Albarán ────────────────────────────────────────────────────────────

  const renderAlbaranesTab = () => {
    const albaranes = scopedInvoices.filter((inv) => invoiceIsAlbaran(inv));
    const waitingOrders = scopedPurchaseOrders.filter(
      (o) => isPurchaseOrderWaitingAlbaran(o) && o.status !== 'received',
    );
    const pendingAlbaranes = albaranes.filter((a) => !a.ocrStockReceivedAt);
    const loadedAlbaranes = albaranes.filter((a) => a.ocrStockReceivedAt);

    const openInvoice = (inv: PurchaseInvoice) => {
      setEditingInvoice(inv);
      setShowCreateInvoice(true);
    };

    const openCorroborateForInvoice = (inv: PurchaseInvoice) => {
      const linked =
        scopedPurchaseOrders.find((o) => o._id === inv.linkedPurchaseOrderId) ||
        scopedPurchaseOrders.find(
          (o) =>
            isPurchaseOrderWaitingAlbaran(o) &&
            o.supplierId &&
            o.supplierId === inv.supplierId,
        ) ||
        null;
      if (!linked) {
        toast.message('Sin pedido vinculado: abre el albarán con Ver o carga stock con «Almacén»');
        openInvoice(inv);
        return;
      }
      setAlbaranCorroborate({ order: linked, invoice: inv });
    };

    const repairStock = (inv: PurchaseInvoice) => {
      if (
        !window.confirm(
          '¿Forzar carga al almacén? Úsalo si el albarán dice «Cargado» pero el stock no subió. Si el stock ya entró, se puede duplicar.',
        )
      ) {
        return;
      }
      void handleLoadInvoiceToWarehouse(inv, { force: true });
    };

    const empty = waitingOrders.length === 0 && albaranes.length === 0;

    return (
      <CatalogTabShell
        stats={[
          { label: 'en espera', value: waitingOrders.length, tone: 'amber' },
          { label: 'albaranes', value: albaranes.length },
          {
            label: 'pte. comprobar',
            value: pendingAlbaranes.length,
            tone: 'amber',
          },
        ]}
        storeLabel={storeLabel}
        dataUserId={dataUserId}
        storeWarehouseId={storeWarehouseId}
      >
        {empty ? (
          <SaasTabEmpty
            icon={<Package className="w-10 h-10" />}
            title="Sin albaranes ni pedidos en espera"
            description={
              invoicesHydrating || purchaseOrdersLoading
                ? 'Actualizando en segundo plano…'
                : 'Cuando crees un pedido de compra aparecerá aquí en espera. Ábrelo, escanea el albarán (OCR) y al comprobar queda en histórico.'
            }
          />
        ) : (
          <div className="space-y-4 p-3">
            {waitingOrders.length > 0 && (
              <AlbaranEsperaList
                orders={waitingOrders}
                selectedId={waitingAlbaranOrderId}
                ocrBusy={albaranOcrBusy}
                replenishing={replenishingOrder}
                onSelect={setWaitingAlbaranOrderId}
                onPickFile={(order, file) => void handleAlbaranOcrFile(order, file)}
                onComprobar={(order) => setAlbaranCorroborate({ order, invoice: null })}
                onReplenishPending={(order) => void handleReplenishPendingOrder(order)}
              />
            )}

            {pendingAlbaranes.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2 px-1">
                  Albarán llegado · por comprobar
                </h3>
                <ul className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden bg-white dark:bg-stone-900">
                  {pendingAlbaranes.map((inv) => (
                    <li key={inv._id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openInvoice(inv)}
                        className="min-w-0 text-left flex-1"
                      >
                        <p className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
                          {inv.invoiceNumber || 'Sin código'} · {inv.supplierName || 'Proveedor'}
                        </p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {invoiceDateLabel(inv)}
                          {inv.linkedPurchaseOrderNumber
                            ? ` · pedido ${inv.linkedPurchaseOrderNumber}`
                            : ' · sin pedido enlazado'}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={() => openInvoice(inv)}
                          className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => openCorroborateForInvoice(inv)}
                          className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs`}
                        >
                          Comprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadInvoiceToWarehouse(inv)}
                          className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
                          title="Sube stock sin comparación de pedido"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Almacén
                        </button>
                        {canDeletePurchaseDocs ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteInvoice(inv)}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            title="Eliminar albarán"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {loadedAlbaranes.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-2 px-1">
                  Histórico
                </h3>
                <ul className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden bg-white dark:bg-stone-900">
                  {loadedAlbaranes.map((inv) => {
                    const linkedOrder =
                      scopedPurchaseOrders.find((o) => o._id === inv.linkedPurchaseOrderId) || null;
                    const incomplete = isAlbaranInvoiceIncomplete(inv, linkedOrder);
                    const pendingLines = resolveAlbaranPendingLines(inv, linkedOrder);
                    return (
                    <li key={inv._id} className="px-4 py-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openInvoice(inv)}
                        className="min-w-0 text-left flex-1"
                      >
                        <p className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
                          {inv.invoiceNumber || 'Sin código'} · {inv.supplierName || 'Proveedor'}
                        </p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {invoiceDateLabel(inv)}
                          {inv.linkedPurchaseOrderNumber
                            ? ` · pedido ${inv.linkedPurchaseOrderNumber}`
                            : ''}
                          {incomplete
                            ? ` · ${pendingLines.length} producto(s) pendiente(s)`
                            : ''}
                        </p>
                      </button>
                      {incomplete ? (
                        <span className="hidden sm:inline-flex text-xs font-semibold text-amber-700 dark:text-amber-300 items-center gap-1 shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5" /> Incompleto
                        </span>
                      ) : (
                        <span className="hidden sm:inline-flex text-xs font-medium text-emerald-600 items-center gap-1 shrink-0">
                          <PackageCheck className="w-3.5 h-3.5" /> Cargado
                        </span>
                      )}
                      <div className="flex shrink-0 items-center gap-2 ml-auto">
                        {incomplete && linkedOrder ? (
                          <button
                            type="button"
                            disabled={replenishingOrder}
                            onClick={() => void handleReplenishPendingOrder(linkedOrder, pendingLines)}
                            className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs inline-flex items-center gap-1`}
                            title="Crear borrador con lo que falta"
                          >
                            {replenishingOrder ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : null}
                            Generar pedido
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openInvoice(inv)}
                          className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs`}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => repairStock(inv)}
                          className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
                          title="Si el stock no subió, fuerza la carga al almacén"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Reparar stock
                        </button>
                        {canDeletePurchaseDocs ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteInvoice(inv)}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            title="Eliminar albarán"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </CatalogTabShell>
    );
  };

  // ── Tab: Facturas ───────────────────────────────────────────────────────────

  const renderInvoicesTab = () => {
    const purchaseInvoices = scopedInvoices.filter((inv) => !invoiceIsAlbaran(inv));
    const invoicesWithDisplay = purchaseInvoices.map((inv) => ({
      ...inv,
      displayStatus: invoiceDisplayStatus(inv),
    }));
    const footerBase = invoicesWithDisplay.reduce((s, i) => s + (i.subtotal || 0), 0);
    const footerIva = invoicesWithDisplay.reduce((s, i) => s + (i.taxAmount || 0), 0);
    const footerTotal = invoicesWithDisplay.reduce((s, i) => s + (i.total || 0), 0);

    type InvRow = (typeof invoicesWithDisplay)[number];
    type InvGroup = {
      key: string;
      kind: 'email-batch' | 'single';
      label: string;
      subject: string;
      items: InvRow[];
    };

    const invoiceGroups = (() => {
      const byEmail = new Map<string, InvRow[]>();
      const loose: InvRow[] = [];
      for (const row of invoicesWithDisplay) {
        const emailId = String(row.sourceEmailId || '').trim();
        if (emailId) {
          const list = byEmail.get(emailId) || [];
          list.push(row);
          byEmail.set(emailId, list);
        } else {
          loose.push(row);
        }
      }
      const groups: InvGroup[] = [];
      for (const [emailId, items] of byEmail) {
        items.sort((a, b) =>
          String(a.invoiceNumber || '').localeCompare(String(b.invoiceNumber || ''), 'es'),
        );
        if (items.length >= 2) {
          groups.push({
            key: emailId,
            kind: 'email-batch',
            label: `${items.length} facturas · mismo correo`,
            subject: String(items[0].sourceEmailSubject || '').trim(),
            items,
          });
        } else {
          loose.push(...items);
        }
      }
      for (const item of loose) {
        groups.push({
          key: item._id,
          kind: 'single',
          label: '',
          subject: '',
          items: [item],
        });
      }
      groups.sort((a, b) => {
        const da = a.items.reduce((m, i) => Math.max(m, Date.parse(String(i.createdAt || i.date || 0)) || 0), 0);
        const db = b.items.reduce((m, i) => Math.max(m, Date.parse(String(i.createdAt || i.date || 0)) || 0), 0);
        return db - da;
      });
      return groups;
    })();

    const openInvoiceView = (inv: PurchaseInvoice) => {
      setViewingInvoice(inv);
    };

    const renderInvoiceActions = (originalInvoice: PurchaseInvoice, compact: boolean) => {
      const pad = compact ? 'p-1.5' : 'p-2';
      const isManual = originalInvoice.entryMethod === 'manual' && originalInvoice.source !== 'email';
      return (
        <div className="flex items-center shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => openInvoiceView(originalInvoice)}
            className={`${pad} hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors`}
            title="Ver factura"
          >
            <Eye className="w-4 h-4 text-blue-600" />
          </button>
          {!originalInvoice.ocrStockReceivedAt && (
            <button
              onClick={() => handleLoadInvoiceToWarehouse(originalInvoice)}
              className={`${pad} hover:bg-emerald-100 rounded-lg transition-colors`}
              title="Cargar al almacén"
            >
              <PackageCheck className="w-4 h-4 text-emerald-600" />
            </button>
          )}
          {!invoiceFinanceLinks.has(originalInvoice._id) && (
            <button
              onClick={() => handleLinkInvoiceToFinance(originalInvoice)}
              className={`${pad} hover:bg-violet-100 rounded-lg transition-colors`}
              title="Registrar pago en finanzas"
            >
              <Wallet className="w-4 h-4 text-violet-600" />
            </button>
          )}
          {originalInvoice.status !== 'paid' ? (
            <button
              onClick={() => handleToggleInvoiceStatus(originalInvoice)}
              className={`${pad} hover:bg-green-100 rounded-lg transition-colors`}
              title="Marcar como pagada"
            >
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </button>
          ) : (
            <button
              onClick={() => handleToggleInvoiceStatus(originalInvoice)}
              className={`${pad} hover:bg-amber-100 rounded-lg transition-colors`}
              title="Marcar como pendiente"
            >
              <Clock className="w-4 h-4 text-amber-600" />
            </button>
          )}
          {isManual ? (
            <button
              onClick={() => { setEditingInvoice(originalInvoice); setShowCreateInvoice(true); }}
              className={`${pad} hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors`}
              title="Corregir datos manuales"
            >
              <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          ) : null}
          <button
            onClick={(e) => void handleDeleteInvoice(originalInvoice, e)}
            className={`${pad} hover:bg-red-100 rounded-lg transition-colors`}
            title={canDeletePurchaseDocs ? 'Eliminar factura' : 'Solo dueño o admin'}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      );
    };

    const renderMobileInvoiceCard = (invoice: InvRow) => {
      const statusCfg = INVOICE_STATUS_CONFIG[invoice.displayStatus] || INVOICE_STATUS_CONFIG.pending;
      const originalInvoice = scopedInvoices.find((i) => i._id === invoice._id)!;
      const num = invoiceTableNumber(originalInvoice);
      return (
        <div
          key={invoice._id}
          className="px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
          onClick={() => openInvoiceView(originalInvoice)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openInvoiceView(originalInvoice);
            }
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                  {num.primary}
                </p>
                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border shrink-0 ${statusCfg.badgeClass}`}>
                  {statusCfg.label}
                </span>
                {(originalInvoice.flags?.priceVariance || originalInvoice.priceVariance?.hasVariance) ? (
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border shrink-0 bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                    Precio distinto
                  </span>
                ) : null}
              </div>
              {num.hint ? (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">{num.hint}</p>
              ) : null}
              {Array.isArray(originalInvoice.attachments) && originalInvoice.attachments[0]?.filename && (
                <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                  {originalInvoice.attachments[0].filename}
                </p>
              )}
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-0.5 truncate">
                {invoice.supplierName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {invoiceDateLabel(invoice)}
                {invoice.dueDate ? ` · vence ${formatDateEs(invoiceDateToInputValue(invoice.dueDate) || invoice.dueDate)}` : ''}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                Base {(invoice.subtotal || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                {' · '}
                IVA {(invoice.taxAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                {invoice.taxRate != null ? ` (${invoice.taxRate}%)` : ''}
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                {(invoice.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
              </p>
            </div>
            {renderInvoiceActions(originalInvoice, false)}
          </div>
        </div>
      );
    };

    const renderDesktopInvoiceRow = (invoice: InvRow, grouped: boolean) => {
      const statusCfg = INVOICE_STATUS_CONFIG[invoice.displayStatus] || INVOICE_STATUS_CONFIG.pending;
      const originalInvoice = scopedInvoices.find((i) => i._id === invoice._id)!;
      const num = invoiceTableNumber(originalInvoice);
      return (
        <tr
          key={invoice._id}
          className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
            grouped ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''
          }`}
          onClick={() => openInvoiceView(originalInvoice)}
        >
          <td className={`px-3 py-3 ${grouped ? 'border-l-2 border-teal-500/70 dark:border-teal-400/50' : ''}`}>
            <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
              {num.primary}
            </div>
            {(originalInvoice.flags?.priceVariance || originalInvoice.priceVariance?.hasVariance) ? (
              <div className="mt-0.5">
                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-md border bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                  Precio distinto
                </span>
              </div>
            ) : null}
            {num.hint ? (
              <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate max-w-[180px]" title={num.hint}>
                {num.hint}
              </div>
            ) : null}
            {Array.isArray(originalInvoice.attachments) && originalInvoice.attachments[0]?.filename && (
              <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[180px]" title={originalInvoice.attachments[0].filename}>
                {originalInvoice.attachments[0].filename}
              </div>
            )}
            {invoice.dueDate && (
              <div className={`text-[10px] mt-0.5 ${invoice.displayStatus === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                Vence {formatDateEs(invoiceDateToInputValue(invoice.dueDate) || invoice.dueDate)}
              </div>
            )}
          </td>
          <td className="px-3 py-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[160px]">{invoice.supplierName}</div>
          </td>
          <td className="px-3 py-3">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {invoiceDateLabel(invoice)}
            </span>
          </td>
          <td className="px-3 py-3">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${statusCfg.badgeClass}`}>
              {statusCfg.label}
            </span>
          </td>
          <td className="px-3 py-3 text-right">
            <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
              {(invoice.subtotal || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
            </span>
          </td>
          <td className="px-3 py-3 text-right">
            <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
              {(invoice.taxAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
            </span>
            <span className="text-[10px] text-gray-400 ml-0.5">({invoice.taxRate || 0}%)</span>
          </td>
          <td className="px-3 py-3 text-right">
            <span className="font-bold text-sm text-gray-900 dark:text-gray-100 tabular-nums">
              {(invoice.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
            </span>
          </td>
          <td className="px-3 py-3">
            {renderInvoiceActions(originalInvoice, true)}
          </td>
        </tr>
      );
    };

    return (
      <CatalogTabShell
        stats={[
          { label: 'facturas', value: invoiceKpis.total },
          { label: 'pendientes', value: invoiceKpis.pending, tone: 'amber' },
          { label: 'pagadas', value: invoiceKpis.paid, tone: 'emerald' },
          {
            label: 'importe',
            value: formatMoneyEs(invoiceKpis.totalAmount),
          },
        ]}
        storeLabel={storeLabel}
        dataUserId={dataUserId}
        storeWarehouseId={storeWarehouseId}
        toolbarRight={
          <div className="flex flex-wrap items-center gap-2">
            {invoiceEmailConnectedCount > 0 || syncingEmailInvoices || invoicesHydrating ? (
              <span className="text-[11px] text-teal-700 dark:text-teal-300 font-medium tabular-nums">
                {invoiceEmailConnectedCount > 0
                  ? `${invoiceEmailConnectedCount} tienda(s) con correo`
                  : ''}
                {invoiceEmailConnectedCount > 0 && (syncingEmailInvoices || invoicesHydrating) ? ' · ' : ''}
                {syncingEmailInvoices ? 'sincronizando…' : invoicesHydrating ? 'actualizando…' : ''}
              </span>
            ) : null}
            <SaasTabSecondaryButton
              onClick={() => navigate('/saas/correo-facturas?ajustes=1')}
              title="Ajustes de correo de facturas"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Ajustes
            </SaasTabSecondaryButton>
            <SaasTabSecondaryButton
              onClick={() => void syncInvoicesFromEmail()}
              disabled={syncingEmailInvoices || !dataUserId}
              title="Leer facturas nuevas del correo conectado"
            >
              {syncingEmailInvoices ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Sincronizar
            </SaasTabSecondaryButton>
            <SaasTabSecondaryButton
              onClick={() => openInvoiceOcrFlow()}
              disabled={!dataUserId}
              title="Escanear factura con OCR: proveedor, artículos y stock"
            >
              <ScanLine className="w-3.5 h-3.5" />
              Escanear factura
            </SaasTabSecondaryButton>
            <SaasTabPrimaryButton onClick={() => { setEditingInvoice(null); setShowCreateInvoice(true); }}>
              <Plus className="w-3.5 h-3.5" />
              Nueva factura
            </SaasTabPrimaryButton>
          </div>
        }
      >
        {invoicesWithDisplay.length === 0 ? (
          <SaasTabEmpty
            icon={<FileText className="w-10 h-10" />}
            title="Sin facturas de compra"
            description={
              invoicesHydrating
                ? 'Actualizando lista en segundo plano…'
                : 'Registra la primera factura de proveedor'
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <SaasTabSecondaryButton
                  onClick={() => openInvoiceOcrFlow()}
                  disabled={!dataUserId}
                  title="Escanear factura con OCR: proveedor, artículos y stock"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  Escanear factura
                </SaasTabSecondaryButton>
                <SaasTabPrimaryButton onClick={() => { setEditingInvoice(null); setShowCreateInvoice(true); }}>
                  <Plus className="w-3.5 h-3.5" />
                  Nueva factura
                </SaasTabPrimaryButton>
              </div>
            }
          />
        ) : (
          <>
          <div className="md:hidden space-y-3 px-1">
            {invoiceGroups.map((group) => (
              group.kind === 'email-batch' ? (
                <section
                  key={group.key}
                  className="rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/20 overflow-hidden"
                >
                  <header className="px-3 py-2 flex items-start gap-2 border-b border-teal-200/80 dark:border-teal-800/50 bg-teal-100/60 dark:bg-teal-900/30">
                    <Mail className="w-3.5 h-3.5 text-teal-700 dark:text-teal-300 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-teal-900 dark:text-teal-100">{group.label}</p>
                      {group.subject ? (
                        <p className="text-[10px] text-teal-700/80 dark:text-teal-300/80 truncate mt-0.5">{group.subject}</p>
                      ) : null}
                    </div>
                  </header>
                  <div className="divide-y divide-teal-100 dark:divide-teal-900/40">
                    {group.items.map((invoice) => renderMobileInvoiceCard(invoice))}
                  </div>
                </section>
              ) : (
                <div
                  key={group.key}
                  className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden"
                >
                  {group.items.map((invoice) => renderMobileInvoiceCard(invoice))}
                </div>
              )
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Factura</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Proveedor</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Base</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">IVA</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {invoiceGroups.map((group) => (
                  <Fragment key={group.key}>
                    {group.kind === 'email-batch' && (
                      <tr className="bg-teal-100/70 dark:bg-teal-900/40 border-t border-teal-200 dark:border-teal-800">
                        <td colSpan={8} className="px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail className="w-3.5 h-3.5 text-teal-700 dark:text-teal-300 shrink-0" />
                            <span className="text-xs font-semibold text-teal-900 dark:text-teal-100">{group.label}</span>
                            {group.subject ? (
                              <span className="text-[11px] text-teal-700/80 dark:text-teal-300/70 truncate">· {group.subject}</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                    {group.items.map((invoice) => renderDesktopInvoiceRow(invoice, group.kind === 'email-batch'))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700">
                  <td colSpan={4} className="px-3 py-3 text-sm font-bold text-gray-700 dark:text-gray-300">
                    Total ({invoicesWithDisplay.length} factura{invoicesWithDisplay.length !== 1 ? 's' : ''})
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                    {footerBase.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                    {footerIva.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    {footerTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </CatalogTabShell>
    );
  };

  // ── Tab: Ingredientes ─────────────────────────────────────────────────────────

  const renderIngredientesTab = () => (
    dataUserId && businessId ? (
      <StoreIngredientsPanel userId={dataUserId} businessId={businessId} />
    ) : null
  );

  // ── Tabs config ─────────────────────────────────────────────────────────────

  const navGroups = useMemo<CatalogNavGroup[]>(() => {
    const cartaTabs: CatalogNavGroup['tabs'] = [
      { id: 'catalog', label: 'Carta', count: catalogMenuItems.filter((i) => i.active).length || undefined },
    ];
    const almacenTabs: CatalogNavGroup['tabs'] = [
      { id: 'stock', label: 'Almacén', count: stockTabCount || undefined },
    ];
    if (!isRestaurantCatalog) {
      almacenTabs.push({
        id: 'ingredientes',
        label: 'Ingredientes',
        count: storeIngredients.length || undefined,
      });
    }

    return [
      {
        id: 'carta',
        label: 'Carta',
        tabs: cartaTabs,
      },
      {
        id: 'almacen',
        label: 'Almacén',
        tabs: almacenTabs,
      },
      {
        id: 'compras',
        label: 'Compras',
        tabs: [
          { id: 'suppliers', label: 'Proveedores', count: supplierKpis.active || undefined },
          { id: 'purchase-orders', label: 'Pedidos' },
          { id: 'albaranes', label: 'Albarán' },
          { id: 'invoices', label: 'Facturas', count: invoiceKpis.pending || undefined },
        ],
      },
      {
        id: 'escandallo',
        label: 'Escandallo',
        tabs: [{ id: 'escandallo', label: 'Escandallo' }],
      },
      {
        id: 'equipo',
        label: 'Equipo',
        tabs: [{ id: 'staff-consumption', label: 'Consumos' }],
      },
    ];
  }, [
    isRestaurantCatalog,
    stockTabCount,
    catalogMenuItems,
    storeIngredients,
    supplierKpis.active,
    invoiceKpis.pending,
  ]);

  const brandSetupCtx = useMemo(
    () =>
      resolveBrandSetupContext(
        // Igual que Ajustes → Marca: solo delivery/heladería exigen «tipo de línea».
        // Bar/restaurante no: si no, sale «Marca sin completar» con marcas ya válidas.
        isDeliveryOps || isHeladeriaCatalog,
        activeStore.retailWorkCenters,
        {
          storesConfirmed:
            retailStoreCount > 0 ||
            activeStore.allPointsOfSale.length > 0,
        },
      ),
    [
      isDeliveryOps,
      isHeladeriaCatalog,
      activeStore.retailWorkCenters,
      activeStore.allPointsOfSale.length,
      retailStoreCount,
    ],
  );

  const brandReady = useMemo(() => {
    if (!usesTpvCatalogUi) return true;
    if (catalogMenuItems.some((i) => i.active)) return true;
    if (brands.length === 0) return false;
    // Bar/restaurante: basta con una marca activa con nombre real (sin reglas delivery).
    if (isRestaurantCatalog) {
      return brands.some(
        (b) => b.active !== false && !(isDefaultCommercialBrand(b) && isDefaultBrandNamePlaceholder(b.name)),
      );
    }
    return isDeliveryBrandActivationComplete(brands, brandSetupCtx);
  }, [usesTpvCatalogUi, isRestaurantCatalog, brands, brandSetupCtx, catalogMenuItems]);

  /** No mostrar el aviso hasta tener marcas + tiendas cargadas (evita flash al entrar). */
  const brandCheckReady =
    pageReady && Boolean(businessId) && !brandsLoading && !activeStore.loading;
  const showBrandIncompleteBanner = usesTpvCatalogUi && brandCheckReady && !brandReady;

  // Bar/restaurante: Carta · Almacén · Compras son raíces del sidebar → sin flecha Atrás.
  // Delivery: sigue volviendo al Centro Operativo.
  const catalogBackTo = isRestaurantCatalog
    ? false
    : isHeladeriaCatalog
      ? HELADERIA_OPS_HOME_PATH
      : DELIVERY_OPS_HOME_PATH;

  const { pageTitle, pageSubtitle } = useMemo(() => {
    if (activeTab === 'stock') {
      return {
        pageTitle: 'Almacén / Inventario',
        pageSubtitle: 'Stock por tienda · envases · ingredientes de cocina',
      };
    }
    if (activeTab === 'ingredientes') {
      return {
        pageTitle: 'Almacén / Inventario',
        pageSubtitle: 'Ingredientes · lista maestra y stock',
      };
    }
    if (activeTab === 'suppliers' || activeTab === 'purchase-orders' || activeTab === 'albaranes' || activeTab === 'invoices') {
      const compraSub: Record<string, string> = {
        suppliers: 'Proveedores',
        'purchase-orders': 'Pedidos a proveedor',
        albaranes: 'Albaranes de recepción',
        invoices: 'Facturas de compra',
      };
      return {
        pageTitle: 'Compras',
        pageSubtitle: compraSub[activeTab] || 'Proveedores · Pedidos · Albarán · Facturas',
      };
    }
    if (activeTab === 'staff-consumption') {
      return {
        pageTitle: 'Equipo',
        pageSubtitle: 'Consumos de personal',
      };
    }
    // Carta: catalog | escandallo
    const cartaSub: Record<string, string> = {
      catalog: isRestaurantCatalog ? 'Carta de sala y barra' : 'Menú y productos TPV',
      escandallo: 'Costes y recetas',
    };
    return {
      pageTitle: 'Carta / Catálogo',
      pageSubtitle:
        cartaSub[activeTab] ||
        (isRestaurantCatalog
          ? 'Carta · Escandallo · Inventario · Compras · Consumos'
          : 'Menú · Escandallo · Inventario · Compras · Consumos'),
    };
  }, [activeTab, isRestaurantCatalog]);

  const catalogBusy =
    (loading || (brandsLoading && allCatalogItems.length > 0 && catalogItems.length === 0)) &&
    catalogItems.length === 0;

  return (
    <Layout backTo={catalogBackTo} title={pageTitle} subtitle={pageSubtitle}>
      <div className="space-y-3">
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
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  {isRestaurantCatalog ? 'Falta configurar la marca' : 'Marca sin completar'}
                </p>
                <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
                  {isRestaurantCatalog
                    ? 'Puedes usar el catálogo. Crea o activa tu marca en Ajustes → Marca para la carta de sala y barra.'
                    : 'Puedes usar el catálogo igualmente. Completa la marca en Ajustes para carta, categorías y precios.'}
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

        <CatalogModuleNav groups={navGroups} activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'catalog' && renderCatalogTab()}

        {activeTab === 'ingredientes' && !isRestaurantCatalog && renderIngredientesTab()}

        {activeTab === 'stock' && (
          <InventoryPanel seedStockItems={filterStockInventoryItems(catalogItems)} />
        )}

        {activeTab === 'staff-consumption' && (
          dataUserId && user ? (
            <StaffConsumptionTabPanel
              userId={dataUserId}
              catalogItems={catalogItems}
              currentUser={user}
              onCatalogUpdated={loadCatalog}
            />
          ) : null
        )}

        {activeTab === 'suppliers' && renderSuppliersTab()}

        {activeTab === 'purchase-orders' && (
          <PurchaseOrdersPage
            dataUserId={dataUserId}
            businessId={businessId || undefined}
            businessName={currentBusiness?.name}
            accountBusinessCount={accountBusinessCount}
            suppliers={suppliers}
            catalogItems={catalogItems}
            storeIngredients={storeIngredients}
            commercialBrands={commercialLines}
            onGoToAlbaranes={() => setActiveTab('albaranes')}
            onGoToInvoices={() => setActiveTab('invoices')}
          />
        )}

        {activeTab === 'albaranes' && renderAlbaranesTab()}

        {activeTab === 'invoices' && renderInvoicesTab()}

        {activeTab === 'escandallo' && (
          <EscandalloPanel
            seedCatalogItems={escandalloSeedItems}
            seedStoreIngredients={storeIngredients}
            seedBrands={escandalloSeedBrands}
            onCostingUpdated={() => {
              notifyDeliveryCatalogChanged(dataUserId, businessId);
              void loadCatalog();
            }}
          />
        )}
          </>
        )}
      </div>

      <CreateCatalogItemModal
        isOpen={showCreateItem}
        onClose={() => {
          setShowCreateItem(false);
          setEditingItem(null);
          setComboSeedProduct(null);
        }}
        onCreate={handleCreateItem}
        editItem={editingItem}
        seedFromProduct={comboSeedProduct}
        brands={brands}
        businessId={businessId}
        dataUserId={dataUserId}
        onBrandsChange={setBrands}
        catalogCategoriesInUse={categories}
        catalogItems={catalogForComboEditor}
        catalogMenuItemsForDuplicateCheck={catalogMenuItemsRaw}
        storeIngredients={storeIngredients}
        brandIngredientSelection={brandIngredientSelection}
        packagingStockItems={filterStockInventoryItems(catalogItems).filter(
          (item) => item.stockCategory === 'packaging',
        )}
        isRestaurantCatalog={isRestaurantCatalog}
      />

      {detailItem && (
        <CatalogItemDetailModal
          item={detailItem}
          brands={brands}
          catalogItems={catalogForComboEditor}
          stats={catalogSalesIndex.get(detailItem._id) || computeCatalogItemSalesStats(detailItem, deliveryOrders)}
          statsLoading={ordersLoading}
          storeIngredients={storeIngredients}
          stockItems={filterStockInventoryItems(catalogItems)}
          dataUserId={dataUserId}
          businessId={businessId}
          onArmCombo={() => {
            const seed = detailItem;
            setDetailItem(null);
            setEditingItem(null);
            setComboSeedProduct(seed);
            setShowCreateItem(true);
          }}
          onCostingSaved={(saved) => {
            setAllCatalogItems((prev) => prev.map((i) => (i._id === saved._id ? saved : i)));
            setDetailItem(saved);
          }}
          onClose={() => setDetailItem(null)}
          onSave={handleSaveDetailItem}
        />
      )}

      <CreateSupplierModal
        isOpen={showCreateSupplier}
        onClose={() => { setShowCreateSupplier(false); setEditingSupplier(null); setSupplierModalHydrating(false); }}
        onCreate={handleCreateSupplier}
        editItem={editingSupplier}
        editHydrating={supplierModalHydrating}
        brands={brands}
        catalogItems={catalogItems}
        storeIngredients={storeIngredients}
        existingSuppliers={suppliers}
        businessType={currentBusiness?.businessType}
      />

      {showInvoiceOcrStorePicker ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar"
            onClick={() => setShowInvoiceOcrStorePicker(false)}
          />
          <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">¿A qué tienda aplica?</h3>
                <p className="text-xs text-stone-500 mt-1">
                  El stock y el gasto de esta factura se asignan a esa tienda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInvoiceOcrStorePicker(false)}
                className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
              {invoiceOcrStores.map((store) => (
                <li key={store.id}>
                  <button
                    type="button"
                    onClick={() => confirmInvoiceOcrStore(store)}
                    className="w-full text-left px-3 py-3 rounded-xl border border-stone-200 dark:border-stone-700 hover:border-blue-500 hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors"
                  >
                    <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">{store.name}</span>
                    {store.id === activeWorkCenterId ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-300 font-bold">
                        Activa
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <SAAS__OcrScanModal
        isOpen={showInvoiceOcr}
        onClose={() => {
          setShowInvoiceOcr(false);
          setInvoiceOcrWorkCenter(null);
        }}
        userId={dataUserId}
        targetModule="compras"
        context={{
          workCenterId: invoiceOcrWorkCenter?.id || activeWorkCenterId || '',
          workCenterName: invoiceOcrWorkCenter?.name || activeWorkCenterName || '',
          costCenterId: invoiceOcrWorkCenter?.id || activeWorkCenterId || '',
          costCenterName: invoiceOcrWorkCenter?.name || activeWorkCenterName || '',
          businessId: businessId || '',
          businessName: currentBusiness?.name || '',
        }}
        onDocumentCreated={async (payload) => {
          setShowInvoiceOcr(false);
          setInvoiceOcrWorkCenter(null);
          await loadInvoices();
          void loadCatalog();
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
              toast.success(
                `Factura procesada: ${fx.stockUpdated} artículo(s) en stock y gasto en Finanzas`,
              );
            }
          } else if (fx?.financeMovementId) {
            toast.warning(
              'Factura y gasto en Finanzas registrados, pero ninguna línea subió stock. Revisa el vínculo de artículos.',
            );
          } else {
            toast.success('Factura procesada. Revisa Facturas, Finanzas e Inventario.');
          }
        }}
      />

      <CreateInvoiceModal
        isOpen={showCreateInvoice}
        onClose={() => { setShowCreateInvoice(false); setEditingInvoice(null); }}
        onCreate={handleCreateInvoice}
        suppliers={suppliers}
        invoices={scopedInvoices}
        editItem={editingInvoice}
        purchaseOrders={scopedPurchaseOrders}
        onGoToPurchaseOrders={() => setSearchParams({ tab: 'purchase-orders' })}
        onReplenishPending={
          editingInvoice && isAlbaranInvoice(editingInvoice)
            ? (() => {
                const linked =
                  scopedPurchaseOrders.find((o) => o._id === editingInvoice.linkedPurchaseOrderId) || null;
                const pending = resolveAlbaranPendingLines(editingInvoice, linked);
                if (!linked || pending.length === 0) return undefined;
                return () => handleReplenishPendingOrder(linked, pending);
              })()
            : undefined
        }
        replenishing={replenishingOrder}
        onReloadInvoices={async () => {
          if (!dataUserId) return [];
          const data = await listPurchaseInvoicesRequest(dataUserId);
          setInvoices(data);
          invoicesFetchedRef.current = true;
          return data;
        }}
        onSelectExisting={(inv) => setEditingInvoice(inv)}
      />

      <PurchaseInvoiceViewModal
        invoice={
          viewingInvoice
            ? scopedInvoices.find((i) => i._id === viewingInvoice._id) || viewingInvoice
            : null
        }
        isOpen={Boolean(viewingInvoice)}
        onClose={() => setViewingInvoice(null)}
        purchaseOrders={scopedPurchaseOrders}
        catalogItems={catalogItems}
        financeLinked={viewingInvoice ? invoiceFinanceLinks.has(viewingInvoice._id) : false}
        canDelete={canDeletePurchaseDocs}
        onTogglePaid={handleToggleInvoiceStatus}
        onLoadWarehouse={handleLoadInvoiceToWarehouse}
        onLinkFinance={handleLinkInvoiceToFinance}
        onDelete={async (inv) => {
          await handleDeleteInvoice(inv);
          setViewingInvoice(null);
        }}
        onEditManual={(inv) => {
          setViewingInvoice(null);
          setEditingInvoice(inv);
          setShowCreateInvoice(true);
        }}
      />

      {albaranCorroborate && dataUserId ? (
        <AlbaranCorroborateModal
          userId={dataUserId}
          order={albaranCorroborate.order}
          invoice={albaranCorroborate.invoice}
          existingInvoiceNumbers={scopedInvoices.map((inv) => inv.invoiceNumber)}
          onClose={() => setAlbaranCorroborate(null)}
          onDone={({ order, invoice }) => {
            setAlbaranCorroborate(null);
            setWaitingAlbaranOrderId((id) => (id === order._id ? '' : id));
            setPurchaseOrders((prev) => prev.map((o) => (o._id === order._id ? order : o)));
            if (invoice) {
              setInvoices((prev) => {
                const idx = prev.findIndex((i) => i._id === invoice._id);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = invoice;
                  return next;
                }
                return [invoice, ...prev];
              });
            }
            void loadCatalog();
          }}
        />
      ) : null}

      <StockAdjustModal
        isOpen={!!stockAdjustItem}
        onClose={() => setStockAdjustItem(null)}
        item={stockAdjustItem}
        onAdjust={handleStockAdjust}
      />
    
      <CatalogMoveModal
        open={catalogMoveItems !== null}
        items={catalogMoveItems ?? []}
        brands={brands}
        commercialLines={commercialLines}
        categoriesInUse={categories}
        emptyOrganizers={emptyCommercialLines}
        submitting={bulkMovingCatalog}
        deletingOrganizerId={deletingOrganizerId}
        onClose={() => {
          if (!bulkMovingCatalog && !deletingOrganizerId) setCatalogMoveItems(null);
        }}
        onConfirm={handleConfirmCatalogMove}
        onDeleteEmptyOrganizer={handleDeleteEmptyOrganizer}
      />
      <CatalogSectionsModal
        open={catalogSectionsOpen}
        sections={catalogSectionRows}
        busy={bulkDeletingCatalog || bulkMovingCatalog}
        entityLabel={isRestaurantCatalog ? 'sección' : 'categoría'}
        onClose={() => setCatalogSectionsOpen(false)}
        onAdd={handleAddCatalogSection}
        onRename={handleRenameCatalogSection}
        onDelete={handleDeleteCatalogSectionFromModal}
      />
      <CatalogDeleteGuardModal
        open={catalogDeleteGuard !== null}
        payload={
          catalogDeleteGuard?.mode === 'single'
            ? {
                mode: 'single',
                itemName: catalogDeleteGuard.item.name,
                kind: 'carta',
                alsoAffectsWarehouse: isStockInventoryItem(catalogDeleteGuard.item),
              }
            : catalogDeleteGuard?.mode === 'bulk'
              ? (() => {
                  const scope = summarizeCatalogDeleteScope(catalogDeleteGuard.items);
                  return {
                    mode: 'bulk' as const,
                    kind: 'carta' as const,
                    count: catalogDeleteGuard.items.length,
                    organizerLabel: catalogDeleteGuard.categoryLabel,
                    warehouseOverlapCount: scope.alsoWarehouse,
                    cartaOnlyCount: scope.cartaOnly,
                  };
                })()
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
        templateFileName={catalogImportTemplateFilename}
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
        onDownloadTemplate={handleDownloadCatalogTemplate}
        headerAliases={catalogHeaderAliasesForVertical(catalogVertical)}
        skipMappingWhenComplete
        importSheetName={isEventsCatalog ? 'productos' : 'catalogo'}
        extraFileUpload={{
          label: 'ZIP de fotos propias (opcional)',
          helpText:
            'No hace falta subir fotos: Vertial asigna imágenes genéricas automáticamente (pizza, bebida, combo…). Usa el ZIP solo si quieres sustituirlas por fotos tuyas (nombre = código o nombre del producto).',
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
      />    </Layout>
  );
}
