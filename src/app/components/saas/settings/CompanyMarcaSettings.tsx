import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Edit3,
  Layers,
  Lock,
  Plus,
  Search,
  Store,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  createBrandRequest,
  deleteBrandRequest,
  listBrandsRequest,
  updateBrandRequest,
  type Brand,
} from '../../../lib/brandApi';
import {
  brandStoreAssignment,
  brandStoreLabel,
  DEFAULT_BRAND_NAME_SUGGESTIONS,
  DEFAULT_COMMERCIAL_BRAND_NAME,
  getBrandSetupPending,
  isDefaultBrandNamePlaceholder,
  isDefaultCommercialBrand,
  sortBrandsForDisplay,
} from '../../../lib/brandUtils';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import {
  DELIVERY_BRAND_LINE_PRESETS,
  deliveryBrandLineKindLabel,
  getDeliveryBrandLinePreset,
  type DeliveryBrandLineKindId,
} from '../../../lib/deliveryBrandLineKinds';
import { listWorkCentersForDelivery, type WorkCenter } from '../../../lib/workCentersApi';
import { SettingsWizardFooter, SettingsWizardShell, type SettingsWizardStep } from './SettingsWizardShell';
import { settingsInputClass, settingsLabelClass } from './settingsFormStyles';

type BrandFormState = {
  name: string;
  description: string;
  logo: string;
  website: string;
  primaryColor: string;
  shortCode: string;
  salesPointIds: string[];
  deliveryLineKind: DeliveryBrandLineKindId | '';
  catalogCategories: string[];
};

type WizardStep = 'negocio' | 'identidad' | 'tiendas' | 'operacion';

const EMPTY_FORM: BrandFormState = {
  name: '',
  description: '',
  logo: '',
  website: '',
  primaryColor: '#6366F1',
  shortCode: '',
  salesPointIds: [],
  deliveryLineKind: '',
  catalogCategories: [],
};

// ── Modal crear/editar marca ──────────────────────────────────────────────────

interface BrandLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: BrandFormState) => Promise<void>;
  editingBrand: Brand | null;
  retailStores: WorkCenter[];
  isDelivery?: boolean;
}

function BrandLineModal({
  isOpen,
  onClose,
  onSave,
  editingBrand,
  retailStores,
  isDelivery = false,
}: BrandLineModalProps) {
  const [step, setStep] = useState<WizardStep>('identidad');
  const [form, setForm] = useState<BrandFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isDefault = editingBrand ? isDefaultCommercialBrand(editingBrand) : false;
  const showDeliveryWizard = isDelivery;
  const [newCategory, setNewCategory] = useState('');

  const wizardRows = useMemo(() => {
    if (showDeliveryWizard) {
      return [
        { id: 'negocio' as const, n: 1, title: 'Qué vendes' },
        { id: 'identidad' as const, n: 2, title: 'Identidad' },
        { id: 'tiendas' as const, n: 3, title: 'Tiendas' },
        { id: 'operacion' as const, n: 4, title: 'Catálogo' },
      ];
    }
    return [
      { id: 'identidad' as const, n: 1, title: 'Identidad' },
      { id: 'tiendas' as const, n: 2, title: 'Tiendas' },
      { id: 'operacion' as const, n: 3, title: 'Operación' },
    ];
  }, [showDeliveryWizard]);

  const stepOrder = useMemo(() => wizardRows.map((r) => r.id), [wizardRows]);
  const isLastStep = step === stepOrder[stepOrder.length - 1];

  const shouldAutofillDefaultName = (name: string) =>
    !name.trim() || isDefaultBrandNamePlaceholder(name);

  const applyPreset = (kindId: DeliveryBrandLineKindId) => {
    const preset = getDeliveryBrandLinePreset(kindId);
    if (!preset) return;
    setForm((f) => ({
      ...f,
      deliveryLineKind: kindId,
      catalogCategories: [...preset.typicalCategories],
      name: shouldAutofillDefaultName(f.name) ? preset.suggestedName : f.name,
      description: !f.description.trim() ? preset.description : f.description,
      shortCode: !f.shortCode.trim() ? preset.shortCode : f.shortCode,
      primaryColor: preset.primaryColor,
    }));
  };

  const nameSuggestions = useMemo(() => {
    if (!isDefault) return [];
    const preset = getDeliveryBrandLinePreset(form.deliveryLineKind);
    const fromPreset = preset ? [preset.suggestedName, ...preset.typicalCategories.slice(0, 2)] : [];
    const merged = [...fromPreset, ...DEFAULT_BRAND_NAME_SUGGESTIONS];
    return [...new Set(merged.map((s) => s.trim()).filter(Boolean))].slice(0, 8);
  }, [isDefault, form.deliveryLineKind]);

  const defaultNameUnset =
    isDefault && (!form.name.trim() || isDefaultBrandNamePlaceholder(form.name));

  useEffect(() => {
    if (!isOpen) return;
    if (editingBrand) {
      const placeholderName =
        isDefaultCommercialBrand(editingBrand) && isDefaultBrandNamePlaceholder(editingBrand.name);
      setForm({
        name: placeholderName ? '' : editingBrand.name,
        description: editingBrand.description || '',
        logo: editingBrand.logo || '',
        website: editingBrand.website || '',
        primaryColor: editingBrand.primaryColor || '#6366F1',
        shortCode: editingBrand.shortCode || '',
        salesPointIds: Array.isArray(editingBrand.salesPointIds) ? [...editingBrand.salesPointIds] : [],
        deliveryLineKind: (editingBrand.deliveryLineKind as DeliveryBrandLineKindId) || '',
        catalogCategories: Array.isArray(editingBrand.catalogCategories) ? [...editingBrand.catalogCategories] : [],
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setStep(
      showDeliveryWizard
        ? editingBrand?.deliveryLineKind
          ? 'identidad'
          : 'negocio'
        : 'identidad',
    );
    setFieldErrors({});
    setNewCategory('');
  }, [editingBrand, isOpen, showDeliveryWizard]);

  const allStoresMode = form.salesPointIds.length === 0;
  const setAllStores = () => setForm((f) => ({ ...f, salesPointIds: [] }));

  const toggleStore = (storeId: string) => {
    setForm((f) => {
      if (f.salesPointIds.length === 0) {
        return { ...f, salesPointIds: retailStores.map((s) => s._id).filter((id) => id !== storeId) };
      }
      const has = f.salesPointIds.includes(storeId);
      const next = has ? f.salesPointIds.filter((id) => id !== storeId) : [...f.salesPointIds, storeId];
      if (next.length >= retailStores.length) return { ...f, salesPointIds: [] };
      return { ...f, salesPointIds: next };
    });
  };

  const validateStep = (s: WizardStep): boolean => {
    const errs: Record<string, string> = {};
    if (s === 'negocio' && isDelivery && !form.deliveryLineKind) {
      errs.negocio = 'Elige qué tipo de producto vende esta marca';
    }
    if (s === 'identidad') {
      const trimmed = form.name.trim();
      if (!trimmed) {
        errs.name = isDefault ? 'Elige o escribe el nombre de tu marca' : 'El nombre es obligatorio';
      } else if (isDefault && isDefaultBrandNamePlaceholder(trimmed)) {
        errs.name = 'Cambia el nombre (no dejes «General»)';
      }
    }
    if (s === 'tiendas') {
      if (retailStores.length === 0 && isDelivery) {
        errs.stores = 'Crea una tienda en Ajustes → Tienda antes de continuar';
      } else if (retailStores.length > 0) {
        const selected = allStoresMode ? retailStores.length : form.salesPointIds.length;
        if (selected === 0) errs.stores = 'Selecciona al menos una tienda o «Todas»';
      }
    }
    if (s === 'operacion' && isDelivery && form.catalogCategories.length === 0) {
      errs.categories = 'Añade al menos una categoría de catálogo';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    const idx = stepOrder.indexOf(step);
    if (idx >= 0 && idx < stepOrder.length - 1) setStep(stepOrder[idx + 1]);
  };

  const goBack = () => {
    const idx = stepOrder.indexOf(step);
    if (idx > 0) setStep(stepOrder[idx - 1]);
  };

  const activeStepIndex = stepOrder.indexOf(step);

  const shellSteps: SettingsWizardStep[] = useMemo(
    () =>
      wizardRows.map((row, index) => ({
        id: row.id,
        title: row.title,
        completed: activeStepIndex > index,
        hasError:
          (row.id === 'negocio' && Boolean(fieldErrors.negocio)) ||
          (row.id === 'identidad' && Boolean(fieldErrors.name)) ||
          (row.id === 'tiendas' && Boolean(fieldErrors.stores)) ||
          (row.id === 'operacion' && Boolean(fieldErrors.categories)),
      })),
    [wizardRows, activeStepIndex, fieldErrors],
  );

  const handleSubmit = async () => {
    for (const s of stepOrder) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      /* toast en padre */
    } finally {
      setSaving(false);
    }
  };

  const selectedPreset = getDeliveryBrandLinePreset(form.deliveryLineKind);

  const addCategory = () => {
    const c = newCategory.trim();
    if (!c) return;
    setForm((f) => ({
      ...f,
      catalogCategories: f.catalogCategories.includes(c) ? f.catalogCategories : [...f.catalogCategories, c],
    }));
    setNewCategory('');
  };

  const previewName = form.name.trim() || (defaultNameUnset ? 'Tu marca' : 'Marca');
  const previewInitial = previewName.charAt(0).toUpperCase();

  if (!isOpen) return null;

  return (
    <SettingsWizardShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        editingBrand
          ? isDefault && defaultNameUnset
            ? 'Configura tu marca'
            : 'Editar marca'
          : 'Nueva marca'
      }
      icon={<Tag className="h-5 w-5" />}
      steps={shellSteps}
      activeStepId={step}
      onStepChange={(id) => setStep(id as WizardStep)}
      preview={
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Vista previa</p>
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold shadow-sm transition-colors"
            style={{ backgroundColor: `${form.primaryColor}22`, color: form.primaryColor }}
          >
            {form.logo ? (
              <img src={form.logo} alt="" className="h-full w-full rounded-2xl object-cover" />
            ) : (
              previewInitial
            )}
          </div>
          <p className="line-clamp-2 w-full text-xs font-bold text-gray-900 dark:text-gray-100">{previewName}</p>
          {form.shortCode ? (
            <span className="font-mono text-[10px] text-gray-500">{form.shortCode}</span>
          ) : null}
          <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: form.primaryColor }} />
        </div>
      }
      footer={
        <SettingsWizardFooter
          onCancel={onClose}
          showBack={activeStepIndex > 0}
          onBack={goBack}
          onNext={goNext}
          onSave={() => void handleSubmit()}
          isLastStep={isLastStep}
          saving={saving}
          saveLabel={editingBrand ? 'Guardar cambios' : 'Crear marca'}
          nextLabel="Siguiente paso"
          disableSave={isDefault ? defaultNameUnset : !form.name.trim()}
        />
      }
    >
            {step === 'negocio' && showDeliveryWizard && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DELIVERY_BRAND_LINE_PRESETS.map((preset) => {
                    const selected = form.deliveryLineKind === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset.id)}
                        className={`rounded-xl border-2 p-3 text-left transition-all ${
                          selected
                            ? 'border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-900/50'
                            : 'border-gray-200 hover:border-gray-400 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: preset.primaryColor }}
                          />
                          <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{preset.label}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.negocio ? <p className="text-xs text-red-600">{fieldErrors.negocio}</p> : null}
              </div>
            )}

            {step === 'identidad' && (
              <div className="space-y-4">
                <div>
                  <label className={settingsLabelClass}>
                    {isDefault ? 'Nombre visible de tu negocio *' : 'Nombre de la marca *'}
                  </label>
                  <input
                    className={`${settingsInputClass} ${fieldErrors.name ? 'border-red-500' : ''} ${
                      defaultNameUnset
                        ? 'border-2 border-dashed border-red-400 bg-red-50/70 placeholder:text-red-500/80 focus:border-red-500 dark:border-red-600 dark:bg-red-950/30 dark:placeholder:text-red-400/70'
                        : ''
                    }`}
                    value={form.name}
                    placeholder={
                      isDefault
                        ? 'Ej. La Pizzería, Burger House, tu carta…'
                        : 'Ej. Pizza, Burger, Cafetería…'
                    }
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus={isDefault && defaultNameUnset}
                  />
                  {isDefault && nameSuggestions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {nameSuggestions.map((suggestion) => {
                        const active = form.name.trim() === suggestion;
                        return (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, name: suggestion }))}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                              active
                                ? 'border-red-500 bg-red-600 text-white'
                                : 'border-red-200 bg-white text-red-800 hover:border-red-400 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
                            }`}
                          >
                            {suggestion}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {fieldErrors.name ? <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p> : null}
                </div>
                <div>
                  <label className={settingsLabelClass}>Descripción</label>
                  <textarea
                    rows={2}
                    className={`${settingsInputClass} resize-none`}
                    placeholder="Ej. qué vendes, para quién, estilo…"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={settingsLabelClass}>Color en app e informes</label>
                    <input
                      type="color"
                      className="h-11 w-full cursor-pointer rounded-xl border-2 border-gray-200 dark:border-gray-700"
                      value={form.primaryColor}
                      onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={settingsLabelClass}>Logo (URL)</label>
                    <input
                      className={settingsInputClass}
                      placeholder="https://…"
                      value={form.logo}
                      onChange={(e) => setForm((f) => ({ ...f, logo: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 'tiendas' && (
              <div className="space-y-4">
                {retailStores.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate('/saas/settings/tienda')}
                    className="w-full rounded-xl border border-dashed border-gray-300 px-3 py-4 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-300"
                  >
                    Tienda →
                  </button>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={allStoresMode}
                        onChange={(e) => (e.target.checked ? setAllStores() : setForm((f) => ({ ...f, salesPointIds: retailStores.map((s) => s._id) })))}
                      />
                      Todas las tiendas activas
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {retailStores.map((store) => {
                        const selected = allStoresMode || form.salesPointIds.includes(store._id);
                        return (
                          <button
                            key={store._id}
                            type="button"
                            onClick={() => toggleStore(store._id)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                              selected
                                ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                                : 'border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-400'
                            }`}
                          >
                            <Store className="h-3.5 w-3.5 shrink-0" />
                            {store.name}
                          </button>
                        );
                      })}
                    </div>
                    {fieldErrors.stores ? <p className="text-xs text-red-600">{fieldErrors.stores}</p> : null}
                  </>
                )}
              </div>
            )}

            {step === 'operacion' && (
              <div className="space-y-4">
                {isDelivery ? (
                  <div>
                    <label className={settingsLabelClass}>Categorías en catálogo *</label>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {form.catalogCategories.map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium dark:bg-gray-700"
                        >
                          {cat}
                          <button
                            type="button"
                            className="text-gray-500 hover:text-red-600"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                catalogCategories: f.catalogCategories.filter((c) => c !== cat),
                              }))
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className={settingsInputClass}
                        placeholder="Ej. Principales, Pizzas…"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCategory();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={addCategory}
                        className="shrink-0 rounded-xl border-2 border-gray-300 px-3 text-sm font-semibold dark:border-gray-600"
                      >
                        Añadir
                      </button>
                    </div>
                    {fieldErrors.categories ? <p className="mt-1 text-xs text-red-600">{fieldErrors.categories}</p> : null}
                  </div>
                ) : null}
                <div>
                  <label className={settingsLabelClass}>Código corto (TPV / informes)</label>
                  <input
                    className={settingsInputClass}
                    placeholder="Ej. PIZ, BUR (opcional)"
                    maxLength={12}
                    value={form.shortCode}
                    onChange={(e) => setForm((f) => ({ ...f, shortCode: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                  />
                </div>
                <div>
                  <label className={settingsLabelClass}>Web de la marca (opcional)</label>
                  <input
                    className={settingsInputClass}
                    type="url"
                    placeholder="https://…"
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  />
                </div>
              </div>
            )}
    </SettingsWizardShell>
  );
}

// ── Pestaña Marca ─────────────────────────────────────────────────────────────

export function CompanyMarcaSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const isDelivery = (currentBusiness as { businessType?: string } | null)?.businessType === 'delivery';

  const [brands, setBrands] = useState<Brand[]>([]);
  const [stores, setStores] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [ensuringDefault, setEnsuringDefault] = useState(false);

  const retailStores = useMemo(() => {
    const active = stores.filter((s) => s.active);
    if (!isDelivery) return active;
    return active.filter((s) => s.centerType === 'punto_de_venta' || s.centerType === 'almacen');
  }, [stores, isDelivery]);

  const loadAll = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      let list = await listBrandsRequest(businessId);
      if (!list.some((b) => isDefaultCommercialBrand(b))) {
        setEnsuringDefault(true);
        try {
          const created = await createBrandRequest(businessId, {
            name: DEFAULT_COMMERCIAL_BRAND_NAME,
            description: '',
            active: true,
            isDefault: true,
            primaryColor: '#6366F1',
            salesPointIds: [],
          });
          list = [created, ...list];
        } catch {
          /* ignore */
        } finally {
          setEnsuringDefault(false);
        }
      }
      setBrands(sortBrandsForDisplay(list));
    } catch {
      setBrands([]);
      toast.error('Error al cargar las marcas');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const loadStores = useCallback(async () => {
    if (!dataUserId) {
      setStores([]);
      return;
    }
    try {
      const wcs = await listWorkCentersForDelivery(dataUserId, currentBusiness ?? null);
      setStores(wcs);
    } catch {
      setStores([]);
    }
  }, [dataUserId, currentBusiness]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const filtered = useMemo(() => {
    let list = brands;
    if (filterActive === 'active') list = list.filter((b) => b.active !== false);
    if (filterActive === 'inactive') list = list.filter((b) => b.active === false);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q) ||
        b.shortCode?.toLowerCase().includes(q),
    );
  }, [brands, search, filterActive]);

  const setupCtx = useMemo(
    () => ({ isDelivery, retailStoreCount: retailStores.length }),
    [isDelivery, retailStores.length],
  );

  const openCreate = () => {
    setEditingBrand(null);
    setShowModal(true);
  };

  const openEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBrand(null);
  };

  const persistBrand = async (form: BrandFormState) => {
    if (!businessId) return;
    const isDefault = editingBrand ? isDefaultCommercialBrand(editingBrand) : false;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      logo: form.logo.trim(),
      website: form.website.trim(),
      primaryColor: form.primaryColor,
      shortCode: form.shortCode.trim() || undefined,
      salesPointIds: form.salesPointIds,
      deliveryLineKind: form.deliveryLineKind || undefined,
      catalogCategories: form.catalogCategories.length > 0 ? form.catalogCategories : undefined,
      active: editingBrand?.active ?? true,
      isDefault: editingBrand?.isDefault ?? false,
    };
    try {
      if (editingBrand) {
        const updated = await updateBrandRequest(businessId, { ...editingBrand, ...payload } as Brand);
        setBrands((prev) => sortBrandsForDisplay(prev.map((b) => (b._id === updated._id ? updated : b))));
        toast.success(`«${updated.name}» actualizada`);
      } else {
        const created = await createBrandRequest(businessId, { ...payload, active: true });
        setBrands((prev) => sortBrandsForDisplay([created, ...prev]));
        toast.success(`«${created.name}» creada`);
      }
    } catch {
      toast.error('No se pudo guardar la marca');
      throw new Error('save failed');
    }
  };

  const handleDelete = async (brand: Brand) => {
    if (isDefaultCommercialBrand(brand)) return;
    if (!confirm(`¿Eliminar la marca «${brand.name}»?`)) return;
    try {
      await deleteBrandRequest(businessId, brand._id);
      setBrands((prev) => prev.filter((b) => b._id !== brand._id));
      toast.success('Marca eliminada');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const handleToggleActive = async (brand: Brand) => {
    if (isDefaultCommercialBrand(brand) && brand.active) return;
    try {
      const updated = await updateBrandRequest(businessId, { ...brand, active: !brand.active });
      setBrands((prev) => sortBrandsForDisplay(prev.map((b) => (b._id === updated._id ? updated : b))));
      toast.success(updated.active ? 'Marca activada' : 'Marca desactivada');
    } catch {
      toast.error('Error al actualizar');
    }
  };

  if (!businessId) {
    return (
      <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        Selecciona una empresa en el selector superior.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 dark:border-gray-700 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Marcas</h2>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          <Plus className="h-4 w-4" />
          Nueva marca
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none ring-0 transition-colors focus:border-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-gray-400"
            placeholder="Buscar por nombre o código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-900/50">
          {(['all', 'active', 'inactive'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterActive(status)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filterActive === status
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {status === 'all' ? 'Todas' : status === 'active' ? 'Activas' : 'Inactivas'}
            </button>
          ))}
        </div>
      </div>

      {loading || ensuringDefault ? (
        <div className="flex items-center justify-center py-24 text-gray-500">
          <div className="mr-3 h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900 dark:border-gray-700 dark:border-t-gray-100" />
          Cargando marcas…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 py-20 dark:border-gray-600">
          <Layers className="mb-4 h-14 w-14 text-gray-300 dark:text-gray-600" />
          {brands.length === 0 ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
            >
              <Plus className="h-4 w-4" />
              Nueva marca
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((brand) => {
            const color = brand.primaryColor || '#6366F1';
            const isDefault = isDefaultCommercialBrand(brand);
            const assignment = brandStoreAssignment(brand, retailStores);
            const storeLabel = brandStoreLabel(brand.salesPointIds?.length ?? 0, retailStores.length);
            const inactive = brand.active === false;
            const setupPending = getBrandSetupPending(brand, setupCtx);
            const needsSetup = setupPending.length > 0;
            const nameUnset = isDefault && isDefaultBrandNamePlaceholder(brand.name);

            return (
              <article
                key={brand._id}
                role="button"
                tabIndex={0}
                onClick={() => openEdit(brand)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openEdit(brand);
                  }
                }}
                className={`group relative cursor-pointer overflow-hidden rounded-2xl border text-left transition-all hover:shadow-lg ${
                  needsSetup
                    ? 'border-red-300 bg-gradient-to-br from-red-50/90 via-white to-white dark:border-red-800/80 dark:from-red-950/35 dark:via-gray-800 dark:to-gray-800'
                    : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                } ${inactive ? 'border-dashed opacity-75' : ''} ${
                  !needsSetup && !inactive ? 'hover:border-gray-300 dark:hover:border-gray-600' : ''
                }`}
              >
                <div
                  className={`absolute inset-y-0 left-0 w-1 ${needsSetup ? 'bg-red-500' : ''}`}
                  style={needsSetup ? undefined : { backgroundColor: color }}
                  aria-hidden
                />
                <div className="p-5 pl-5">
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold shadow-sm ${
                          needsSetup ? 'ring-2 ring-red-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : ''
                        }`}
                        style={{ backgroundColor: `${color}18`, color }}
                      >
                        {brand.logo ? (
                          <img src={brand.logo} alt="" className="h-full w-full rounded-2xl object-cover" />
                        ) : (
                          (nameUnset ? '…' : brand.name.charAt(0)).toUpperCase()
                        )}
                      </div>
                      {needsSetup ? (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow ring-2 ring-white dark:ring-gray-800"
                          title="Configuración pendiente"
                        >
                          <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`min-w-0 flex-1 truncate text-base font-bold ${
                            nameUnset
                              ? 'border-b border-dashed border-red-400 text-red-600 dark:border-red-600 dark:text-red-400'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          {nameUnset ? 'Elige nombre de marca…' : brand.name}
                        </h3>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {needsSetup ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
                              Pendiente
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleToggleActive(brand);
                            }}
                            disabled={isDefault && brand.active}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                              brand.active !== false
                                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}
                          >
                            {brand.active !== false ? 'Activa' : 'Off'}
                          </button>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {isDefault ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase text-gray-400">
                            <Lock className="h-3 w-3" />
                            Por defecto
                          </span>
                        ) : null}
                        {brand.shortCode ? (
                          <span className="font-mono text-[11px] text-gray-500">{brand.shortCode}</span>
                        ) : null}
                        {isDelivery && brand.deliveryLineKind ? (
                          <span className="text-[11px] text-gray-500">{deliveryBrandLineKindLabel(brand.deliveryLineKind)}</span>
                        ) : null}
                      </div>
                      {brand.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{brand.description}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-700/80">
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tiendas</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{storeLabel}</p>
                      {assignment.mode === 'partial' && assignment.stores.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {assignment.stores.map((s) => (
                            <span
                              key={s.id}
                              className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {isDelivery && brand.catalogCategories && brand.catalogCategories.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Catálogo</p>
                        <div className="flex flex-wrap gap-1">
                          {brand.catalogCategories.map((cat) => (
                            <span
                              key={cat}
                              className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-600 dark:text-gray-400"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(brand);
                        }}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Editar"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {!isDefault ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(brand);
                          }}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <BrandLineModal
        isOpen={showModal}
        onClose={closeModal}
        onSave={persistBrand}
        editingBrand={editingBrand}
        retailStores={retailStores}
        isDelivery={isDelivery}
      />
    </div>
  );
}
