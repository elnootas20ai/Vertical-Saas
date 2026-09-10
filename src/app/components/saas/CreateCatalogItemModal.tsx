import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, X, CheckCircle2, Loader2, Upload, ImagePlus } from 'lucide-react';
import { sortBrandsForDisplay } from '../../lib/brandUtils';
import {
  notifyDeliveryBrandsChanged,
  notifyDeliveryCatalogChanged,
  notifyDeliveryConfigChanged,
  DELIVERY_CONFIG_CHANGED,
} from '../../lib/deliverySetup';
import { findCatalogDuplicateByName, formatCatalogDuplicateNameError } from '../../lib/catalogBusinessScope';
import { resolveCatalogProductImage } from '../../lib/catalogProductPlaceholders';
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
import { CatalogServiceRulesFields } from './CatalogServiceRulesFields';
import { countCommercialBrands, useTenantEntitlements } from '../../hooks/useTenantEntitlements';
import { useModalClose } from '../../hooks/useModalClose';
import { writeBillingSelection } from '../../lib/billingSelection';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import {
  normalizeImportCategory,
  resolveCatalogImportBrandIds,
  shouldClearBrandForCategory,
  syncTpvOrganizersAfterCatalogImport,
  removeCatalogCategoryFromBrands,
} from '../../lib/deliveryCatalogImport';
import { commercialLineBrands, isWarehouseImportCategory } from '../../lib/deliveryCatalogImportLogic';
import {
  deliveryBrandLineKindLabel,
  getDeliveryBrandLinePreset,
  DELIVERY_BRAND_LINE_ICON_BOX,
} from '../../lib/deliveryBrandLineKinds';
import {
  createCatalogItemRequest,
  getDeliveryConfigRequest,
  updateDeliveryConfigRequest,
  type CatalogItem,
  type CatalogComboRef,
} from '../../lib/deliveryApi';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_FOCUS_RING } from '../../lib/vertialUiTokens';
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
  normalizeCatalogIngredientsForSave,
  unifyStoreIngredientsFromConfig,
  resolveTpvBrandConfigFromDeliveryConfig,
  normalizeStoreIngredients,
  normalizeStoreIngredientUnit,
  withStoreIngredientTpvFlags,
  resolveBrandTpvCategoryKeys,
  type StoreIngredient,
  type TpvBrandIngredientSelection,
  type TpvCategoryTemplateKey,
} from '../../lib/catalogCustomization';
import { withVertialDefaultBaseCost } from '../../lib/vertialDefaultCosts';
import { ORGANIZER_PACKAGING } from '../../lib/inventoryUtils';
import { CatalogComboCompositionEditor } from './CatalogComboCompositionEditor';
import {
  CatalogProductRecipePicker,
  CatalogProductPackagingPicker,
  recipePicksToLines,
  recipePicksToTpvIngredientsText,
  packagingPicksToLines,
  type CatalogRecipePick,
  type CatalogPackagingPick,
} from './CatalogProductRecipePicker';
import {
  calculateRecipeTotalCost,
  readProductRecipeLines,
  storeIngredientsById,
  withProductCosting,
} from '../../lib/catalogCosting';
import { syncInventoryCatalogFromSources } from '../../lib/inventorySync';
import {
  comboStructureFromCustomFields,
  defaultComboStructureForCatalog,
  isComboStructureConfirmed,
  type ComboStructureSlot,
} from '../../lib/catalogComboSlots';
import { normalizeTenantUserId } from '../../lib/tenantUserId';
import { VehicleConfirmDialog } from './vehicles/VehicleConfirmDialog';
import {
  PurchasesChromelessShell,
  PURCHASES_FIELD_INPUT,
  PURCHASES_FIELD_LABEL,
} from './purchases/PurchasesChromelessShell';

// ─── Create Catalog Item Wizard ──────────────────────────────────────────────

const ALLERGEN_OPTIONS = [
  'Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes', 'Soja',
  'Lácteos', 'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Moluscos', 'Altramuces',
];

const CREATE_STEP_LABELS = ['Producto', 'Ingredientes y composición', 'Foto y publicación'];
/** Cuadrado recomendado para carta / web / TPV (calidad). */
const CATALOG_PRODUCT_IMAGE_PX = 1024;

export interface CreateCatalogItemModalProps {
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
  /** modal = overlay (default); workspace = hoja fullscreen Compras-style */
  variant?: 'modal' | 'workspace';
  /** Panel Resultados (solo workspace edit); pestaña Resultados */
  resultadosPanel?: ReactNode;
}

type WorkspaceTab = 'composicion' | 'tpv' | 'datos' | 'combo' | 'resultados';

export function CreateCatalogItemModal({
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
  variant = 'modal',
  resultadosPanel = null,
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('composicion');
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
      active: true,
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
          .map((line) => {
            const storeId = String(line.storeIngredientId);
            const fromWarehouse = storeIngredients.find((ing) => ing.id === storeId);
            return {
              storeIngredientId: storeId,
              name: line.name,
              quantity: line.quantity,
              ...(line.quantityText ? { quantityText: line.quantityText } : {}),
              unit: normalizeStoreIngredientUnit(
                line.unit || fromWarehouse?.unit,
                'ud',
              ),
              tpvRemovable:
                removableNames.size === 0
                  ? true
                  : removableNames.has(line.name.toLowerCase()),
            };
          }),
      );
      setPackagingPicks(
        existingRecipe
          .filter((line) => line.catalogItemId && line.stockCategory === 'packaging')
          .map((line) => ({
            catalogItemId: String(line.catalogItemId),
            name: line.name,
            quantity: line.quantity,
            ...(line.quantityText ? { quantityText: line.quantityText } : {}),
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
        costPrice: Number.isFinite(cost) && cost >= 0 ? String(cost) : '',
        stockQuantity: editItem.stockQuantity == null ? '' : String(editItem.stockQuantity),
        minStock: editItem.minStock == null ? '' : String(editItem.minStock),
        image: editItem.image || '',
        allergens: editItem.allergens || [],
        notes: editItem.notes || '',
        webVisible: editItem.webVisible ?? true,
        available: editItem.available ?? true,
        active: editItem.active !== false,
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

  // Receta ↔ almacén: la unidad del pick es de uso en la línea;
  // la unidad de coste (€/kg…) vive solo en la ficha del ingrediente.
  // No sincronizar pick.unit ← almacén (rompía el select UND/LT/KG).

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

  const workspaceTabs = useMemo<Array<{ id: WorkspaceTab; label: string }>>(
    () =>
      (
        [
          { id: 'composicion', label: 'Composición', show: form.itemType !== 'service' },
          { id: 'tpv', label: 'TPV', show: form.itemType === 'product' },
          { id: 'datos', label: 'Datos', show: true },
          {
            id: 'combo',
            label: 'Combo',
            show: form.itemType === 'combo' || /combo/i.test(form.category),
          },
          { id: 'resultados', label: 'Resultados', show: isEditMode },
        ] as Array<{ id: WorkspaceTab; label: string; show: boolean }>
      )
        .filter((tab) => tab.show)
        .map(({ id, label }) => ({ id, label })),
    [form.itemType, form.category, isEditMode],
  );

  // Al cambiar el tipo (o la categoría) la pestaña activa puede desaparecer.
  useEffect(() => {
    if (variant !== 'workspace') return;
    if (workspaceTabs.some((tab) => tab.id === workspaceTab)) return;
    const first = workspaceTabs[0];
    if (first) setWorkspaceTab(first.id);
  }, [variant, workspaceTabs, workspaceTab]);

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
        active: form.active !== false,
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
    const unit = normalizeStoreIngredientUnit(opts.unit, 'ud');
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
        unit: normalizeStoreIngredientUnit(input.unit, 'ud'),
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

  if (variant === 'workspace') {
    const title = editItem
      ? form.itemType === 'service'
        ? 'Editar servicio'
        : 'Editar producto'
      : form.itemType === 'service'
        ? 'Nuevo servicio'
        : 'Nuevo producto';
    const subtitle = form.name.trim() || form.category.trim() || undefined;

    const left = (
      <div className="space-y-3">
        {renderProductPhotoField()}
        {renderItemTypePicker()}
        <div>
          <label className={PURCHASES_FIELD_LABEL}>Nombre *</label>
          <input
            className={PURCHASES_FIELD_INPUT}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          {showNameDuplicateError ? (
            <p className="mt-1 text-xs text-red-600">
              {formatCatalogDuplicateNameError(duplicateCatalogItemByName)}
            </p>
          ) : null}
          {showNameRequiredError ? (
            <p className="mt-1 text-xs text-red-600">Indica el nombre.</p>
          ) : null}
        </div>
        {form.itemType === 'service' ? (
          <CatalogServiceRulesFields
            rules={form.serviceRules}
            onChange={(serviceRules) => setForm((f) => ({ ...f, serviceRules }))}
            brands={brands}
            showValidation={fieldErrorsShown}
          />
        ) : (
          <>
            {renderCategoryUnit()}
            {renderBrandPicker()}
          </>
        )}
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label className={PURCHASES_FIELD_LABEL}>Precio venta (€) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={PURCHASES_FIELD_INPUT}
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
            />
          </div>
          <div>
            <label className={PURCHASES_FIELD_LABEL}>Precio empleado (€)</label>
            <input
              type="number"
              step="0.01"
              className={PURCHASES_FIELD_INPUT}
              placeholder="Opcional"
              value={form.staffPrice}
              onChange={(e) => setForm((f) => ({ ...f, staffPrice: e.target.value }))}
            />
          </div>
          <div>
            <label className={PURCHASES_FIELD_LABEL}>Coste (€)</label>
            <input
              type="number"
              step="0.01"
              className={PURCHASES_FIELD_INPUT}
              value={form.costPrice}
              onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
          className={`w-full p-3 rounded-xl border-2 text-left text-sm font-semibold ${
            form.active !== false
              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
              : 'border-stone-200 dark:border-stone-700'
          }`}
        >
          {form.active !== false ? 'Activo en carta' : 'Inactivo'}
        </button>
      </div>
    );

    const right = (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {workspaceTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setWorkspaceTab(tab.id)}
              className={`min-h-10 px-3 rounded-xl text-sm font-semibold border-2 ${
                workspaceTab === tab.id
                  ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                  : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 dark:border-stone-800 dark:bg-stone-900 space-y-4">
          {workspaceTab === 'composicion' && form.itemType !== 'service'
            ? showComboBuilder && form.itemType === 'combo'
              ? renderComboBuilderSection()
              : renderCustomizationSection()
            : null}
          {workspaceTab === 'tpv' ? (
            <div className="space-y-3">
              {renderProductConfiguratorOptions()}
              {renderBuildYourOwnIngredientPicker()}
              {renderHalfHalfPizzaPicker()}
            </div>
          ) : null}
          {workspaceTab === 'datos' ? (
            <div className="space-y-4">
              {form.itemType !== 'service' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Stock actual</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={form.stockQuantity}
                      onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Stock mínimo</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={form.minStock}
                      onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>IVA %</label>
                    <input
                      type="number"
                      className={inputClass}
                      placeholder="21"
                      value={form.taxRate}
                      onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
                    />
                  </div>
                </div>
              ) : null}
              <div>
                <label className={labelClass}>Descripción</label>
                <textarea
                  rows={3}
                  className={`${inputClass} resize-none`}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>Alérgenos</label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGEN_OPTIONS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAllergen(a)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${
                        form.allergens.includes(a)
                          ? 'bg-orange-100 border-orange-400 text-orange-800'
                          : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Notas internas</label>
                <textarea
                  rows={2}
                  className={`${inputClass} resize-none`}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, webVisible: !f.webVisible }))}
                className={`w-full p-4 rounded-2xl border-2 text-left ${
                  form.webVisible
                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <span className="font-semibold">Visible en la web</span>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, available: !f.available }))}
                className={`w-full p-4 rounded-2xl border-2 text-left ${
                  form.available
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-red-300 bg-red-50 dark:bg-red-900/20'
                }`}
              >
                <span className="font-semibold">{form.available ? 'Disponible' : 'Agotado'}</span>
              </button>
            </div>
          ) : null}
          {workspaceTab === 'combo' ? renderComboBuilderSection() : null}
          {workspaceTab === 'resultados'
            ? resultadosPanel || (
                <p className="text-sm text-stone-500">
                  Guarda el producto para ver resultados de ventas.
                </p>
              )
            : null}
        </div>
      </div>
    );

    return (
      <>
        <PurchasesChromelessShell
          title={title}
          subtitle={subtitle}
          onBack={onClose}
          backLabel="Volver"
          primaryLabel={submitting ? 'Guardando…' : editItem ? 'Guardar' : 'Crear'}
          onPrimary={() => void handleFinalSubmit(false)}
          primaryDisabled={submitting}
          primaryLoading={submitting}
          left={left}
          right={right}
        />
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
