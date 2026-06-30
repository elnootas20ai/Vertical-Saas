import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Edit3,
  ImagePlus,
  Layers,
  Link2,
  Lock,
  Plus,
  Search,
  Store,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  brandPreviewGradient,
  brandTint,
  brandStoreAssignment,
  brandStoreLabel,
  DEFAULT_BRAND_NAME_SUGGESTIONS,
  canDeactivateBrand,
  getBrandSetupPending,
  isBrandActive,
  isDefaultBrandNamePlaceholder,
  isDefaultCommercialBrand,
  resolveBrandActiveOnCreate,
  isBrandSetupComplete,
  findBrandToCompleteInActivation,
  isIncompleteActivationShell,
  sortBrandsForDisplay,
  suggestBrandShortCodeFromName,
} from '../../../lib/brandUtils';
import { DeliveryActivationGatePanel } from '../DeliveryActivationGatePanel';
import { useActivationFocus } from '../../../hooks/useActivationFocus';
import { ActivationFieldWrap, ActivationFocusBanner } from '../ActivationGuideUi';
import { useDeliveryStorePdvGate } from '../../../hooks/useDeliveryStorePdvGate';
import { notifyDeliveryBrandsChanged } from '../../../lib/deliverySetup';
import { readImageFileAsDataUrl } from '../../../lib/readImageAsDataUrl';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import {
  DELIVERY_BRAND_LINE_ICON_BOX,
  DELIVERY_BRAND_LINE_PHOTOS,
  DELIVERY_BRAND_LINE_PRESETS,
  DELIVERY_BRAND_LINE_PRESETS_PICKER,
  deliveryBrandLineKindLabel,
  getDeliveryBrandLinePreset,
  type DeliveryBrandLineKindId,
} from '../../../lib/deliveryBrandLineKinds';
import {
  filterWorkCentersForBusinessScope,
  isDeliveryBusinessType,
  resolveBusinessScopeId,
} from '../../../lib/deliverySetup';
import { useTenantEntitlements, countCommercialBrands } from '../../../hooks/useTenantEntitlements';
import { writeBillingSelection } from '../../../lib/billingSelection';
import { formatAddonPriceShort } from '../../../lib/planAddonCatalog';
import { listWorkCentersForDelivery, type WorkCenter } from '../../../lib/workCentersApi';
import { resolveBrandLogo, resolveBrandPlaceholderUrl, shouldPersistBrandPlaceholderLogo } from '../../../lib/brandPlaceholders';
import { BrandLogoPreview, isExtremeWideLogo } from './BrandLogoPreview';
import { SettingsWizardFooter, SettingsWizardShell, type SettingsWizardStep } from './SettingsWizardShell';
import {
  settingsChipChoiceClass,
  settingsChoiceCardSpaciousClass,
  settingsDashedCtaClass,
  settingsEmptyStateClass,
  settingsFilterBtnClass,
  settingsInputClass,
  settingsKpiCardClass,
  settingsLabelClass,
  settingsPrimaryBtnClass,
  settingsSearchInputClass,
  settingsStatusPillClass,
  settingsChoiceGridClass,
  settingsChoiceRowClass,
  settingsWizardLeadClass,
  settingsLogoPreviewBoxClass,
  settingsWizardSectionClass,
  settingsWizardSectionCompactClass,
} from './settingsFormStyles';

const BRAND_WIZARD_STEP_HINTS: Record<string, string> = {
  negocio: 'Tipo de carta',
  identidad: 'Nombre y aspecto',
  tiendas: 'Locales donde vende',
  operacion: 'Catálogo y códigos',
};

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
  activationHighlight?: string | null;
}

function BrandLineModal({
  isOpen,
  onClose,
  onSave,
  editingBrand,
  retailStores,
  isDelivery = false,
  activationHighlight = null,
}: BrandLineModalProps) {
  const [step, setStep] = useState<WizardStep>('identidad');
  const [form, setForm] = useState<BrandFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isDefault = editingBrand ? isDefaultCommercialBrand(editingBrand) : false;
  const showDeliveryWizard = isDelivery;
  const [newCategory, setNewCategory] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoFileName, setLogoFileName] = useState('');
  const [logoAspectHint, setLogoAspectHint] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const shortCodeTouchedRef = useRef(false);

  const presetShortCodes = useMemo(
    () => new Set(DELIVERY_BRAND_LINE_PRESETS.map((p) => p.shortCode).filter(Boolean)),
    [],
  );

  const resolveShortCodeFromName = (name: string, fallback = '') => {
    const fromName = suggestBrandShortCodeFromName(name);
    return fromName || fallback;
  };

  const syncShortCodeFromName = (name: string, fallback = '') => {
    if (shortCodeTouchedRef.current) return undefined;
    return resolveShortCodeFromName(name, fallback);
  };

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
    setForm((f) => {
      const nextName = shouldAutofillDefaultName(f.name) ? preset.suggestedName : f.name;
      const nextShortCode = syncShortCodeFromName(nextName, preset.shortCode) ?? f.shortCode;
      const linePhoto = DELIVERY_BRAND_LINE_PHOTOS[kindId];
      const nextLogo = shouldPersistBrandPlaceholderLogo(f.logo) ? linePhoto : f.logo;
      return {
        ...f,
        deliveryLineKind: kindId,
        catalogCategories: [...preset.typicalCategories],
        name: nextName,
        description: !f.description.trim() ? preset.description : f.description,
        shortCode: nextShortCode,
        primaryColor: preset.primaryColor,
        logo: nextLogo,
      };
    });
  };

  const nameSuggestions = useMemo(() => {
    if (editingBrand && !isDefault) return [];
    const preset = getDeliveryBrandLinePreset(form.deliveryLineKind);
    const fromPreset = preset ? [preset.suggestedName, ...preset.typicalCategories.slice(0, 2)] : [];
    const merged = [...fromPreset, ...DEFAULT_BRAND_NAME_SUGGESTIONS];
    return [...new Set(merged.map((s) => s.trim()).filter(Boolean))].slice(0, 8);
  }, [isDefault, editingBrand, form.deliveryLineKind]);

  const defaultNameUnset =
    isDefault && (!form.name.trim() || isDefaultBrandNamePlaceholder(form.name));

  useEffect(() => {
    if (!isOpen || !activationHighlight) return;
    if (
      activationHighlight === 'brand-name' ||
      activationHighlight === 'edit-brand' ||
      activationHighlight === 'create-brand'
    ) {
      setStep(showDeliveryWizard ? (activationHighlight === 'create-brand' ? 'negocio' : 'identidad') : 'identidad');
    }
  }, [isOpen, activationHighlight, showDeliveryWizard]);

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
      const existingLogo = String(editingBrand.logo || '').trim();
      setLogoFileName(
        existingLogo
          ? existingLogo.startsWith('data:')
            ? 'Logo guardado'
            : 'Logo por enlace'
          : '',
      );
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
    setLogoFileName('');
    setLogoAspectHint(false);
    shortCodeTouchedRef.current = false;
  }, [editingBrand, isOpen, showDeliveryWizard]);

  useEffect(() => {
    if (!isOpen || shortCodeTouchedRef.current) return;
    setForm((f) => {
      const suggested = resolveShortCodeFromName(f.name);
      if (!suggested) return f;
      const current = f.shortCode.trim().toUpperCase();
      const isPresetCode = current && presetShortCodes.has(current);
      if (!current || isPresetCode) {
        if (current === suggested) return f;
        return { ...f, shortCode: suggested };
      }
      return f;
    });
  }, [isOpen, form.name, presetShortCodes]);

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
    if (step === 'identidad') {
      setForm((f) => {
        const nextShortCode = syncShortCodeFromName(f.name);
        return nextShortCode ? { ...f, shortCode: nextShortCode } : f;
      });
    }
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
        hint: BRAND_WIZARD_STEP_HINTS[row.id],
        completed: activeStepIndex > index,
        hasError:
          (row.id === 'negocio' && Boolean(fieldErrors.negocio)) ||
          (row.id === 'identidad' && Boolean(fieldErrors.name)) ||
          (row.id === 'tiendas' && Boolean(fieldErrors.stores)) ||
          (row.id === 'operacion' && Boolean(fieldErrors.categories)),
      })),
    [wizardRows, activeStepIndex, fieldErrors],
  );

  const wizardSubtitle = editingBrand
    ? 'Revisa y ajusta cómo se muestra esta línea en catálogo, PDV e informes.'
    : 'Configura la identidad de la marca y en qué tiendas estará disponible.';

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

  const handleLogoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLogoUploading(true);
    try {
      const { dataUrl, trimmed } = await readImageFileAsDataUrl(file, { maxDimension: 640, trimWhitespace: true });
      setForm((f) => ({ ...f, logo: dataUrl }));
      setLogoFileName(file.name);
      if (trimmed) {
        toast.success('Márgenes vacíos recortados automáticamente');
      }
      const probe = new Image();
      probe.onload = () => {
        setLogoAspectHint(isExtremeWideLogo(probe.naturalWidth, probe.naturalHeight));
      };
      probe.src = dataUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el logo');
    } finally {
      setLogoUploading(false);
    }
  };

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
  const formLogoDisplay = useMemo(
    () =>
      resolveBrandLogo({
        logo: form.logo,
        name: form.name,
        deliveryLineKind: form.deliveryLineKind,
        catalogCategories: form.catalogCategories,
      }),
    [form.logo, form.name, form.deliveryLineKind, form.catalogCategories],
  );

  if (!isOpen) return null;

  const previewStoreCount =
    retailStores.length === 0
      ? 0
      : form.salesPointIds.length === 0
        ? retailStores.length
        : form.salesPointIds.length;

  return (
    <SettingsWizardShell
      isOpen={isOpen}
      onClose={onClose}
      size="large"
      maxHeight="min(92dvh, 900px)"
      bodyOverflow={step === 'negocio' ? 'hidden' : 'auto'}
      title={
        editingBrand
          ? isDefault && defaultNameUnset
            ? 'Configura tu marca'
            : 'Editar marca'
          : 'Nueva marca'
      }
      subtitle={wizardSubtitle}
      icon={<Tag className="h-6 w-6" />}
      steps={shellSteps}
      activeStepId={step}
      onStepChange={(id) => setStep(id as WizardStep)}
      preview={
        <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-gray-200/80 shadow-sm dark:border-gray-600">
          <p className="bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:bg-gray-900 dark:text-gray-500">
            Vista previa
          </p>
          <div
            className="px-4 py-7 text-center text-white"
            style={{ background: brandPreviewGradient(form.primaryColor) }}
          >
            <div className="mx-auto w-full max-w-[12.5rem] overflow-hidden rounded-2xl bg-white/95 p-2 shadow-lg ring-2 ring-white/40">
              <BrandLogoPreview src={formLogoDisplay} size="lg" boxClassName="min-h-[9rem]" />
            </div>
            <p className="mt-4 line-clamp-2 text-lg font-bold leading-tight drop-shadow-sm">{previewName}</p>
            {form.shortCode ? (
              <span className="mt-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 font-mono text-xs font-semibold backdrop-blur-sm">
                {form.shortCode}
              </span>
            ) : null}
          </div>
          <div className="space-y-3 bg-white p-4 dark:bg-gray-800">
            {form.description.trim() ? (
              <p className="line-clamp-3 text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {form.description.trim()}
              </p>
            ) : null}
            <dl className="space-y-2 text-left text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Tiendas</dt>
                <dd className="font-semibold text-gray-900 dark:text-gray-100">
                  {retailStores.length === 0 ? '—' : previewStoreCount === retailStores.length ? 'Todas' : previewStoreCount}
                </dd>
              </div>
              {isDelivery && form.catalogCategories.length > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Categorías</dt>
                  <dd className="font-semibold text-gray-900 dark:text-gray-100">{form.catalogCategories.length}</dd>
                </div>
              ) : null}
            </dl>
          </div>
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
            {activationHighlight ? (
              <div className="mb-4">
                <ActivationFocusBanner fieldKey={activationHighlight} />
              </div>
            ) : null}
            {step === 'negocio' && showDeliveryWizard && (
              <div className={settingsWizardSectionCompactClass}>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">
                  Elige el tipo de carta. En el siguiente paso podrás ajustar nombre, color y categorías.
                </p>
                <div className={settingsChoiceGridClass}>
                  {DELIVERY_BRAND_LINE_PRESETS_PICKER.map((preset) => {
                    const selected = form.deliveryLineKind === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.description || preset.hint}
                        onClick={() => applyPreset(preset.id)}
                        className={settingsChoiceRowClass(selected)}
                      >
                        <img
                          src={DELIVERY_BRAND_LINE_PHOTOS[preset.id]}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-lg object-cover bg-gray-100 ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="min-w-0">
                          <span className="block font-medium leading-tight text-gray-900 line-clamp-2 dark:text-gray-100">
                            {preset.label}
                          </span>
                          <span className="block text-[11px] text-gray-500 line-clamp-1 dark:text-gray-400">
                            {preset.hint}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.negocio ? <p className="text-sm text-red-600">{fieldErrors.negocio}</p> : null}
              </div>
            )}

            {step === 'identidad' && (
              <div className={settingsWizardSectionClass}>
                <p className={settingsWizardLeadClass}>
                  Así verán tu marca en el catálogo, el PDV y los informes. El nombre es lo que identifica la línea de venta.
                </p>
                <ActivationFieldWrap fieldKey="brand-name" activeKey={activationHighlight}>
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
                      onChange={(e) => {
                        const name = e.target.value;
                        setForm((f) => {
                          const nextShortCode = syncShortCodeFromName(name);
                          return nextShortCode ? { ...f, name, shortCode: nextShortCode } : { ...f, name };
                        });
                      }}
                      autoFocus={!editingBrand || (isDefault && defaultNameUnset)}
                    />
                  </div>
                </ActivationFieldWrap>
                  {(isDefault || !editingBrand) && nameSuggestions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {nameSuggestions.map((suggestion) => {
                        const active = form.name.trim() === suggestion;
                        return (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() =>
                              setForm((f) => {
                                const nextShortCode = syncShortCodeFromName(suggestion);
                                return nextShortCode
                                  ? { ...f, name: suggestion, shortCode: nextShortCode }
                                  : { ...f, name: suggestion };
                              })
                            }
                            className={settingsChipChoiceClass(active)}
                          >
                            {suggestion}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {fieldErrors.name ? <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p> : null}
                <div>
                  <label className={settingsLabelClass}>Descripción</label>
                  <textarea
                    rows={3}
                    className={`${settingsInputClass} resize-none min-h-[5.5rem]`}
                    placeholder="Ej. qué vendes, para quién, estilo…"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="rounded-2xl border-2 border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/30 sm:p-5">
                  <p className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Aspecto visual</p>
                  {form.deliveryLineKind && shouldPersistBrandPlaceholderLogo(form.logo) ? (
                    <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      Usamos la foto del tipo de carta elegido. Si quieres otro logo, súbelo abajo.
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="w-full shrink-0 space-y-2 sm:max-w-[15rem]">
                      <label className={settingsLabelClass}>Logo (archivo en tu ordenador)</label>
                      <button
                        type="button"
                        disabled={logoUploading}
                        onClick={() => logoInputRef.current?.click()}
                        className={`${settingsLogoPreviewBoxClass} cursor-pointer transition-colors hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-60`}
                      >
                        {logoUploading ? (
                          <span className="text-sm text-gray-500">Cargando…</span>
                        ) : (
                          <div className="relative w-full">
                            <BrandLogoPreview src={formLogoDisplay} size="xl" boxClassName="min-h-[11rem] w-full" />
                            {shouldPersistBrandPlaceholderLogo(form.logo) ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white/75 p-2 text-center dark:bg-gray-900/75">
                                <ImagePlus className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                                <span className="text-xs font-semibold text-gray-500">Clic para subir tu logo</span>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </button>
                      <input
                        ref={logoInputRef}
                        id="brand-logo-file-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => void handleLogoFile(e)}
                      />
                      <label
                        htmlFor="brand-logo-file-input"
                        className={`inline-flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-gray-900 bg-gray-900 px-3 py-2.5 text-center text-xs font-semibold text-white transition-colors hover:bg-black dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white ${
                          logoUploading ? 'pointer-events-none opacity-60' : ''
                        }`}
                      >
                        Elegir archivo
                      </label>
                      <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                        PNG o JPG. Máx. 2&nbsp;MB. Mejor un logo recortado al dibujo, sin mucho blanco alrededor (las capturas de pantalla suelen verse pequeñas).
                      </p>
                      {logoFileName ? (
                        <p className="truncate text-[11px] font-medium text-emerald-700 dark:text-emerald-400" title={logoFileName}>
                          {logoFileName}
                        </p>
                      ) : null}
                      {form.logo && logoAspectHint ? (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                          <p className="text-[11px] font-semibold leading-snug text-amber-950 dark:text-amber-100">
                            Sigue siendo muy alargada. Recorta manualmente solo el icono (cuadrado) en Paint o Recortes y vuelve a subir.
                          </p>
                        </div>
                      ) : null}
                      {form.logo && !shouldPersistBrandPlaceholderLogo(form.logo) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const fallback =
                              form.deliveryLineKind &&
                              form.deliveryLineKind in DELIVERY_BRAND_LINE_PHOTOS
                                ? DELIVERY_BRAND_LINE_PHOTOS[form.deliveryLineKind as DeliveryBrandLineKindId]
                                : '';
                            setForm((f) => ({ ...f, logo: fallback }));
                            setLogoFileName('');
                            setLogoAspectHint(false);
                          }}
                          className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          Quitar logo personalizado
                        </button>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-4">
                      <div>
                        <label className={settingsLabelClass}>Color de la marca</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            className="h-14 w-20 shrink-0 cursor-pointer rounded-xl border-2 border-gray-200 dark:border-gray-700"
                            value={form.primaryColor}
                            onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                          />
                          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                            Se usa en la vista previa, catálogo, PDV e informes. El fondo lateral se adapta a este color.
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className={`${settingsLabelClass} flex items-center gap-1.5`}>
                          <Link2 className="h-3.5 w-3.5" />
                          Alternativa: enlace al logo (si no tienes el archivo aquí)
                        </label>
                        <input
                          className={settingsInputClass}
                          placeholder="https://… (opcional)"
                          value={form.logo.startsWith('data:') ? '' : form.logo}
                          onChange={(e) => {
                            setLogoFileName('');
                            setForm((f) => ({ ...f, logo: e.target.value }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 rounded-2xl border-2 border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Vista ampliada
                    </p>
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/80">
                      <BrandLogoPreview src={formLogoDisplay} size="xl" boxClassName="min-h-[14rem] w-full" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'tiendas' && (
              <div className={settingsWizardSectionClass}>
                <p className={settingsWizardLeadClass}>
                  Indica en qué locales puede venderse esta marca. Puedes usar todas las tiendas o elegir solo algunas.
                </p>
                {retailStores.length === 0 ? (
                  <button type="button" onClick={() => navigate('/saas/settings/tienda')} className={settingsDashedCtaClass}>
                    Crear tienda en Ajustes → Tienda
                  </button>
                ) : (
                  <>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-colors ${
                        allStoresMode
                          ? 'border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-900/40'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={allStoresMode}
                        onChange={(e) =>
                          e.target.checked
                            ? setAllStores()
                            : setForm((f) => ({ ...f, salesPointIds: retailStores.map((s) => s._id) }))
                        }
                      />
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Todas las tiendas activas</span>
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {retailStores.map((store) => {
                        const selected = allStoresMode || form.salesPointIds.includes(store._id);
                        return (
                          <button
                            key={store._id}
                            type="button"
                            onClick={() => toggleStore(store._id)}
                            disabled={allStoresMode}
                            className={`${settingsChoiceCardSpaciousClass(selected)} flex items-center gap-3 disabled:opacity-60`}
                          >
                            <Store className="h-5 w-5 shrink-0 text-gray-500" />
                            <span className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{store.name}</span>
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
              <div className={settingsWizardSectionClass}>
                <p className={settingsWizardLeadClass}>
                  Define cómo se organiza el catálogo y los códigos que verás en PDV e informes.
                </p>
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
                        className="shrink-0 rounded-xl border-2 border-gray-900 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                      >
                        Añadir
                      </button>
                    </div>
                    {fieldErrors.categories ? <p className="mt-1 text-xs text-red-600">{fieldErrors.categories}</p> : null}
                  </div>
                ) : null}
                <div>
                  <label className={settingsLabelClass}>Código corto (PDV / informes)</label>
                  <input
                    className={settingsInputClass}
                    placeholder="Ej. PIZ, BUR (opcional)"
                    maxLength={12}
                    value={form.shortCode}
                    onChange={(e) => {
                      shortCodeTouchedRef.current = true;
                      setForm((f) => ({ ...f, shortCode: e.target.value.toUpperCase().replace(/\s/g, '') }));
                    }}
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

function BrandMarcaHero({
  brand,
  storeLabel,
  lineLabel,
  onConfigure,
}: {
  brand: Brand;
  storeLabel: string;
  lineLabel?: string | null;
  onConfigure: () => void;
}) {
  const color = brand.primaryColor || '#6366F1';
  const nameUnset = isDefaultCommercialBrand(brand) && isDefaultBrandNamePlaceholder(brand.name);
  const displayName = nameUnset ? 'Configura tu marca' : brand.name;

  return (
    <section
      className="overflow-hidden rounded-2xl border-2 shadow-md transition-[border-color,box-shadow] duration-300 dark:shadow-gray-900/40"
      style={{ borderColor: brandTint(color, '55') }}
    >
      <div className="px-5 py-6 text-white sm:px-8 sm:py-8" style={{ background: brandPreviewGradient(color) }}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="mx-auto flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/95 p-2 shadow-lg ring-2 ring-white/30 sm:mx-0">
            <BrandLogoPreview
              src={resolveBrandLogo(brand)}
              size="lg"
              boxClassName="h-full w-full min-h-[6rem]"
            />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">Tu marca en Vertial</p>
            <h2 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{displayName}</h2>
            {brand.shortCode ? (
              <span className="mt-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 font-mono text-xs font-semibold backdrop-blur-sm">
                {brand.shortCode}
              </span>
            ) : null}
            {brand.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-white/85">{brand.description}</p>
            ) : (
              <p className="mt-2 text-sm text-white/70">Catálogo, PDV e informes usarán este color y logo.</p>
            )}
          </div>
          <button
            type="button"
            onClick={onConfigure}
            className="shrink-0 rounded-xl border-2 border-white/40 bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            Configurar marca
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 bg-white px-5 py-3 text-xs dark:bg-gray-800 sm:px-8">
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Store className="h-3.5 w-3.5" style={{ color }} />
          <span className="font-medium text-gray-800 dark:text-gray-200">{storeLabel}</span>
        </span>
        {lineLabel ? (
          <span className="font-medium" style={{ color }}>
            {lineLabel}
          </span>
        ) : null}
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
          style={{ backgroundColor: brandTint(color, '18'), color }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          Color activo en esta pantalla
        </span>
      </div>
    </section>
  );
}

// ── Pestaña Marca ─────────────────────────────────────────────────────────────

export function CompanyMarcaSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const accountBusinessCount = businessesFetchSettled ? businesses.length : undefined;
  const businessId = resolveBusinessScopeId(currentBusiness);
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const pdvGate = useDeliveryStorePdvGate();
  const pdvGateReloadedRef = useRef(false);

  useEffect(() => {
    pdvGateReloadedRef.current = false;
  }, [businessId]);

  useEffect(() => {
    if (!isDelivery || pdvGate.loading || pdvGate.ready || pdvGateReloadedRef.current) return;
    pdvGateReloadedRef.current = true;
    void pdvGate.reload();
  }, [isDelivery, pdvGate.loading, pdvGate.ready, pdvGate.reload]);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [stores, setStores] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [hoverBrandId, setHoverBrandId] = useState<string | null>(null);
  const [deactivateBrandTarget, setDeactivateBrandTarget] = useState<Brand | null>(null);
  const [togglingBrandId, setTogglingBrandId] = useState<string | null>(null);
  const [modalActivationHighlight, setModalActivationHighlight] = useState<string | null>(null);
  const { focus: activationFocus, clearFocus: clearActivationFocus } = useActivationFocus();
  const newBrandQueryHandledRef = useRef(false);

  const commercialBrandCount = useMemo(() => countCommercialBrands(brands), [brands]);
  const entitlements = useTenantEntitlements({ commercialBrandCount });

  const retailStores = useMemo(() => {
    const active = stores.filter((s) => s.active);
    if (!isDelivery) return active;
    return active.filter((s) => s.centerType === 'punto_de_venta' || s.centerType === 'almacen');
  }, [stores, isDelivery]);

  const loadAll = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const list = await listBrandsRequest(businessId).catch(() => [] as Brand[]);
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
      const scoped = filterWorkCentersForBusinessScope(wcs, businessId, {
        accountBusinessCount,
      });
      setStores(scoped);
    } catch {
      setStores([]);
    }
  }, [dataUserId, currentBusiness, businessId, accountBusinessCount]);

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

  const openCreate = useCallback(() => {
    const pending = findBrandToCompleteInActivation(brands, setupCtx);
    if (isDelivery && pending) {
      setEditingBrand(pending);
      setShowModal(true);
      return;
    }
    const isFirstBrand = brands.length === 0;
    if (!isFirstBrand && !entitlements.canCreateCommercialBrand) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingBrand(null);
    setShowModal(true);
  }, [entitlements.canCreateCommercialBrand, brands, setupCtx, isDelivery]);

  const openBrandWizardForActivation = useCallback(
    (highlight?: string | null) => {
      const pending = findBrandToCompleteInActivation(brands, setupCtx);
      if (pending) {
        setEditingBrand(pending);
        setShowModal(true);
        setModalActivationHighlight(highlight ?? 'create-brand');
        return;
      }
      setEditingBrand(null);
      setShowModal(true);
      setModalActivationHighlight(highlight ?? 'create-brand');
    },
    [brands, setupCtx],
  );

  useEffect(() => {
    if (!activationFocus || loading) return;
    if (activationFocus === 'create-brand') {
      openBrandWizardForActivation('create-brand');
      clearActivationFocus();
      return;
    }
    if (activationFocus === 'edit-brand' || activationFocus === 'brand-name') {
      openBrandWizardForActivation(activationFocus);
      clearActivationFocus();
    }
  }, [activationFocus, loading, clearActivationFocus, openBrandWizardForActivation]);

  useEffect(() => {
    const wantsSetup =
      searchParams.get('action') === 'setup-brand' || searchParams.get('action') === 'new-brand';
    if (!wantsSetup) {
      newBrandQueryHandledRef.current = false;
      return;
    }
    if (loading || (isDelivery && pdvGate.loading)) return;
    if (isDelivery && !pdvGate.ready) {
      void pdvGate.reload();
      return;
    }
    if (newBrandQueryHandledRef.current) return;
    newBrandQueryHandledRef.current = true;

    openBrandWizardForActivation('create-brand');

    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [
    loading,
    isDelivery,
    pdvGate.loading,
    pdvGate.ready,
    searchParams,
    setSearchParams,
    openBrandWizardForActivation,
  ]);

  const accentBrand = useMemo(() => {
    if (hoverBrandId) {
      const hit = brands.find((b) => b._id === hoverBrandId);
      if (hit) return hit;
    }
    return (
      brands.find((b) => isDefaultCommercialBrand(b)) ??
      brands.find((b) => b.active !== false) ??
      brands[0] ??
      null
    );
  }, [brands, hoverBrandId]);

  const accentColor = accentBrand?.primaryColor || '#6366F1';

  const kpis = useMemo(() => {
    const pending = brands.filter((b) => getBrandSetupPending(b, setupCtx).length > 0).length;
    return {
      total: brands.length,
      active: brands.filter((b) => b.active !== false).length,
      inactive: brands.filter((b) => b.active === false).length,
      pending,
    };
  }, [brands, setupCtx]);

  const openEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBrand(null);
    setModalActivationHighlight(null);
  };

  const persistBrand = async (form: BrandFormState) => {
    if (!businessId) return;
    const isDefault = editingBrand ? isDefaultCommercialBrand(editingBrand) : false;
    const resolvedLogo = shouldPersistBrandPlaceholderLogo(form.logo)
      ? resolveBrandPlaceholderUrl({
          name: form.name,
          deliveryLineKind: form.deliveryLineKind,
          catalogCategories: form.catalogCategories,
        })
      : form.logo.trim();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      logo: resolvedLogo,
      website: form.website.trim(),
      primaryColor: form.primaryColor,
      shortCode: form.shortCode.trim() || suggestBrandShortCodeFromName(form.name) || undefined,
      salesPointIds: form.salesPointIds,
      deliveryLineKind: form.deliveryLineKind || undefined,
      catalogCategories: form.catalogCategories.length > 0 ? form.catalogCategories : undefined,
      active: editingBrand?.active ?? true,
      isDefault: editingBrand?.isDefault ?? brands.length === 0,
    };
    try {
      if (editingBrand) {
        const updated = await updateBrandRequest(businessId, { ...editingBrand, ...payload } as Brand);
        setBrands((prev) => sortBrandsForDisplay(prev.map((b) => (b._id === updated._id ? updated : b))));
        toast.success(`«${updated.name}» actualizada`);
      } else {
        const pendingShell = findBrandToCompleteInActivation(brands, setupCtx);
        if (isDelivery && pendingShell) {
          toast.error('Ya tienes una marca pendiente. Complétala en el asistente antes de crear otra.');
          setEditingBrand(pendingShell);
          setShowModal(true);
          throw new Error('pending brand exists');
        }
        const created = await createBrandRequest(businessId, {
          ...payload,
          active: resolveBrandActiveOnCreate(brands),
          isDefault: brands.length === 0,
        });
        setBrands((prev) => sortBrandsForDisplay([created, ...prev]));
        toast.success(
          created.active !== false
            ? `«${created.name}» creada`
            : `«${created.name}» creada como inactiva. Actívala cuando quieras usarla.`,
        );
      }
      notifyDeliveryBrandsChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la marca');
      throw new Error('save failed');
    }
  };

  const handleDelete = async (brand: Brand) => {
    const shell = isIncompleteActivationShell(brand, setupCtx);
    if (isDefaultCommercialBrand(brand) && !shell) return;
    if (!confirm(`¿Eliminar la marca «${brand.name}»?`)) return;
    try {
      await deleteBrandRequest(businessId, brand._id);
      setBrands((prev) => prev.filter((b) => b._id !== brand._id));
      toast.success('Marca eliminada');
      notifyDeliveryBrandsChanged();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const applyBrandActive = async (brand: Brand, nextActive: boolean) => {
    setTogglingBrandId(brand._id);
    try {
      const updated = await updateBrandRequest(businessId, { ...brand, active: nextActive });
      setBrands((prev) => sortBrandsForDisplay(prev.map((b) => (b._id === updated._id ? updated : b))));
      toast.success(nextActive ? `"${updated.name}" activada` : `"${updated.name}" desactivada`);
      notifyDeliveryBrandsChanged();
    } catch {
      toast.error('Error al actualizar la marca');
    } finally {
      setTogglingBrandId(null);
    }
  };

  const requestToggleBrandActive = (brand: Brand, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isBrandActive(brand) && !canDeactivateBrand(brand, brands)) {
      toast.error('Debe quedar al menos una marca activa. Crea o activa otra marca antes de desactivar esta.');
      return;
    }

    if (isBrandActive(brand)) {
      setDeactivateBrandTarget(brand);
      return;
    }

    void applyBrandActive(brand, true);
  };

  const confirmDeactivateBrand = async () => {
    if (!deactivateBrandTarget) return;
    const target = deactivateBrandTarget;
    setDeactivateBrandTarget(null);
    await applyBrandActive(target, false);
  };

  if (!businessId) {
    return (
      <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        Selecciona una empresa en el selector superior.
      </div>
    );
  }

  if (isDelivery && pdvGate.loading) {
    return (
      <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        Comprobando tienda y PDV…
      </div>
    );
  }

  if (isDelivery && !pdvGate.ready) {
    return (
      <div className="py-6">
        <DeliveryActivationGatePanel kind="store_pdv" />
      </div>
    );
  }

  return (
    <div
      className="space-y-6 rounded-2xl p-1 transition-[background] duration-500 sm:p-2"
      style={{
        background: `linear-gradient(180deg, ${brandTint(accentColor, '16')} 0%, transparent 320px)`,
      }}
    >
      {accentBrand && !loading ? (
        <BrandMarcaHero
          brand={accentBrand}
          storeLabel={brandStoreLabel(accentBrand.salesPointIds?.length ?? 0, retailStores.length)}
          lineLabel={isDelivery && accentBrand.deliveryLineKind ? deliveryBrandLineKindLabel(accentBrand.deliveryLineKind) : null}
          onConfigure={() => openEdit(accentBrand)}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={settingsKpiCardClass('indigo')}>
          <Layers className="mb-2 h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <div className="text-2xl font-bold">{kpis.total}</div>
          <div className="mt-0.5 text-xs opacity-80">Total marcas</div>
        </div>
        <div className={settingsKpiCardClass('green')}>
          <div className="mb-2 h-5 w-5 rounded-full bg-green-500/30" />
          <div className="text-2xl font-bold">{kpis.active}</div>
          <div className="mt-0.5 text-xs opacity-80">Activas</div>
        </div>
        <div className={settingsKpiCardClass('amber')}>
          <AlertCircle className="mb-2 h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div className="text-2xl font-bold">{kpis.pending}</div>
          <div className="mt-0.5 text-xs opacity-80">Pendientes</div>
        </div>
        <div className={settingsKpiCardClass('violet')}>
          <Store className="mb-2 h-5 w-5 text-violet-600 dark:text-violet-400" />
          <div className="text-2xl font-bold">{retailStores.length}</div>
          <div className="mt-0.5 text-xs opacity-80">Tiendas retail</div>
        </div>
      </div>

      {!entitlements.canCreateCommercialBrand && brands.length > 0 ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
          Tu plan <strong>{entitlements.planLabel}</strong> incluye una marca principal para operar con una
          sola línea de negocio. Para añadir líneas extra (p. ej. Pizzería, Burger) necesitas{' '}
          {entitlements.needsCommercialBrandAddon ? 'ampliar el cupo en Facturación' : 'el plan PRO'}.
        </div>
      ) : null}

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              className={settingsSearchInputClass}
              placeholder="Buscar marca…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'active', 'inactive'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterActive(status)}
                className={settingsFilterBtnClass(filterActive === status)}
              >
                {status === 'all' ? 'Todas' : status === 'active' ? 'Activas' : 'Inactivas'}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={openCreate} className={settingsPrimaryBtnClass}>
          <Plus className="h-4 w-4" />
          Nueva línea comercial
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <div className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-100" />
          Cargando marcas…
        </div>
      ) : filtered.length === 0 ? (
        <div className={settingsEmptyStateClass}>
          <Layers className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="font-semibold text-gray-700 dark:text-gray-300">
            {brands.length === 0 ? 'Aún no tienes ninguna marca' : 'Sin resultados'}
          </p>
          <p className="mt-1 text-sm">
            {brands.length === 0
              ? 'Crea la carta de tu negocio con el asistente (nombre, categorías y tiendas).'
              : 'Prueba con otros términos de búsqueda.'}
          </p>
          {brands.length === 0 ? (
            <button
              type="button"
              onClick={openCreate}
              className={`${settingsPrimaryBtnClass} mt-4`}
            >
              <Plus className="h-4 w-4" />
              Crear marca principal
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((brand) => {
            const color = brand.primaryColor || '#6366F1';
            const isDefault = isDefaultCommercialBrand(brand);
            const assignment = brandStoreAssignment(brand, retailStores);
            const storeLabel = brandStoreLabel(brand.salesPointIds?.length ?? 0, retailStores.length);
            const inactive = brand.active === false;
            const setupPending = getBrandSetupPending(brand, setupCtx);
            const needsSetup = setupPending.length > 0;
            const incompleteShell = isIncompleteActivationShell(brand, setupCtx);
            const nameUnset = isDefault && isDefaultBrandNamePlaceholder(brand.name);

            const isAccent = accentBrand?._id === brand._id;

            const brandActive = isBrandActive(brand);
            const toggleLocked = brandActive && !canDeactivateBrand(brand, brands);
            const toggleBusy = togglingBrandId === brand._id;

            return (
              <article
                key={brand._id}
                onMouseEnter={() => setHoverBrandId(brand._id)}
                onMouseLeave={() => setHoverBrandId(null)}
                className={`group overflow-hidden rounded-2xl border-2 bg-white text-left transition-all duration-200 hover:shadow-lg dark:bg-gray-800 ${
                  inactive ? 'border-dashed opacity-70' : ''
                } ${needsSetup ? 'ring-2 ring-red-300/60 dark:ring-red-800/50' : ''}`}
                style={{
                  borderColor: needsSetup ? undefined : isAccent ? color : brandTint(color, '44'),
                  boxShadow: isAccent ? `0 10px 28px ${brandTint(color, '28')}` : undefined,
                }}
              >
                <div className="h-1.5 shrink-0" style={{ background: brandPreviewGradient(color) }} aria-hidden />
                <div className="p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(brand)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none transition-colors hover:bg-gray-50/80 focus-visible:ring-2 focus-visible:ring-gray-900 dark:hover:bg-gray-700/40 dark:focus-visible:ring-gray-100"
                  >
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 bg-white p-1 dark:bg-gray-900"
                      style={{ borderColor: brandTint(color, '44') }}
                    >
                      <BrandLogoPreview
                        src={resolveBrandLogo(brand)}
                        size="md"
                        boxClassName="h-full w-full min-h-[3rem]"
                      />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`truncate text-sm font-semibold ${
                          nameUnset
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {nameUnset ? 'Configura el nombre…' : brand.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {isDefault ? (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase"
                            style={{ backgroundColor: brandTint(color, '22'), color }}
                          >
                            <Lock className="h-2.5 w-2.5" />
                            Por defecto
                          </span>
                        ) : null}
                        {brand.shortCode ? (
                          <span className="font-mono text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                            {brand.shortCode}
                          </span>
                        ) : null}
                        {needsSetup ? (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Pendiente
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => requestToggleBrandActive(brand, e)}
                    disabled={toggleLocked || toggleBusy}
                    className={`relative z-10 shrink-0 ${settingsStatusPillClass(brandActive, toggleLocked || toggleBusy)}`}
                    title={
                      toggleLocked
                        ? 'Debe quedar al menos una marca activa en la empresa'
                        : brandActive
                          ? 'Clic para desactivar'
                          : 'Clic para activar'
                    }
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${brandActive ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    {toggleBusy ? '…' : brandActive ? 'Activa' : 'Inactiva'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => openEdit(brand)}
                  className="w-full cursor-pointer rounded-xl text-left outline-none transition-colors hover:bg-gray-50/60 focus-visible:ring-2 focus-visible:ring-gray-900 dark:hover:bg-gray-700/30 dark:focus-visible:ring-gray-100"
                >
                {isDelivery && brand.deliveryLineKind ? (
                  <p className="mb-2 text-xs font-medium" style={{ color }}>
                    {deliveryBrandLineKindLabel(brand.deliveryLineKind)}
                  </p>
                ) : null}

                {brand.description ? (
                  <p className="mb-3 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{brand.description}</p>
                ) : null}

                <div
                  className="space-y-2 border-t pt-3 text-xs text-gray-500 dark:text-gray-400"
                  style={{ borderColor: brandTint(color, '28') }}
                >
                  <div className="flex items-center gap-2">
                    <Store className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium text-gray-700 dark:text-gray-300">{storeLabel}</span>
                  </div>
                  {assignment.mode === 'partial' && assignment.stores.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {assignment.stores.map((s) => (
                        <span
                          key={s.id}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-300"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {isDelivery && brand.catalogCategories && brand.catalogCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {brand.catalogCategories.slice(0, 4).map((cat) => (
                        <span
                          key={cat}
                          className="rounded-lg border px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            borderColor: brandTint(color, '33'),
                            backgroundColor: brandTint(color, '12'),
                            color,
                          }}
                        >
                          {cat}
                        </span>
                      ))}
                      {brand.catalogCategories.length > 4 ? (
                        <span className="text-[10px] text-gray-400">+{brand.catalogCategories.length - 4}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                </button>

                <div
                  className="mt-3 flex justify-end gap-1 border-t pt-2"
                  style={{ borderColor: brandTint(color, '22') }}
                >
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
                  {!isDefault || incompleteShell ? (
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
              </article>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          {filtered.length} de {brands.length} marca{brands.length !== 1 ? 's' : ''}
        </p>
      )}

      <BrandLineModal
        isOpen={showModal}
        onClose={closeModal}
        onSave={persistBrand}
        editingBrand={editingBrand}
        retailStores={retailStores}
        isDelivery={isDelivery}
        activationHighlight={modalActivationHighlight}
      />

      {deactivateBrandTarget ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setDeactivateBrandTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-2xl dark:border-amber-900 dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="deactivate-brand-title"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 id="deactivate-brand-title" className="text-base font-bold text-gray-900 dark:text-gray-100">
                  ¿Desactivar esta marca?
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {deactivateBrandTarget.name}
                  </span>{' '}
                  dejará de estar disponible en catálogo, PDV e informes hasta que la vuelvas a activar.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeactivateBrandTarget(null)}
                className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDeactivateBrand()}
                disabled={togglingBrandId === deactivateBrandTarget._id}
                className="flex-1 rounded-xl bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Sí, desactivar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border-2 border-violet-200 bg-white p-5 shadow-2xl dark:border-violet-900 dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Líneas comerciales extra</h4>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Tu plan {entitlements.planLabel} incluye la marca principal «General»
              {entitlements.commercialBrands > 0
                ? ` y ${entitlements.commercialBrands} línea comercial adicional.`
                : ' sin líneas comerciales extra (p. ej. Pizzería, Burger).'}
              {' '}
              {entitlements.needsCommercialBrandAddon
                ? `Para añadir otra línea contrata la ampliación (${formatAddonPriceShort('extra_brand')}).`
                : 'Para añadir líneas comerciales activa el plan PRO (o indícalo en el alta si aún no has pagado).'}
            </p>
            <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-200">
              Marcas comerciales (sin contar «General»): {commercialBrandCount} / {entitlements.commercialBrands}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUpgradeModal(false);
                  if (dataUserId) {
                    writeBillingSelection(dataUserId, {
                      selectedPlanId: 'pro',
                      billingMode: 'monthly',
                      requestedAddon: entitlements.needsCommercialBrandAddon ? 'extra_brand' : null,
                    });
                  }
                  navigate('/saas/settings/facturacion');
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
              >
                {entitlements.needsCommercialBrandAddon
                  ? `Contratar ampliación (${formatAddonPriceShort('extra_brand')})`
                  : 'Ver planes'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
