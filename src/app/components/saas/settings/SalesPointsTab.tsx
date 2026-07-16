import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import {
  isDeliveryAccountFromSources,
  bootstrapRetailStoreAfterCreate,
  loadDeliveryStores,
  notifyDeliveryWorkCentersChanged,
  selectDeliveryPointOfSale,
  DELIVERY_WORK_CENTERS_CHANGED,
  readWorkCenterBusinessId,
  resolveBusinessScopeId,
  knownBusinessIdsFromList,
  repairMissingRetailDeliveryPdvs,
  type DeliveryStoresState,
} from '../../../lib/deliverySetup';
import {
  bootstrapCompraventaStoreAfterCreate,
  isCompraventaBusinessType,
  loadCompraventaStores,
} from '../../../lib/compraventaSetup';
import { notifyDeliveryActiveStoreChanged } from '../../../lib/deliveryOpsPdvSelection';
import {
  clearAllRetailScopeCaches,
  loadRetailStoresForBusiness,
  persistRetailScopeAfterStoreSave,
} from '../../../verticals/retailScopeRegistry';
import {
  isDeliveryOpsBusinessType,
  isRestaurantBusinessType,
  isRetailStoreBusinessType,
} from '../../../lib/deliveryOpsTypes';
import { loadRestaurantStores } from '../../../verticals/restaurant/loadRestaurantStores';
import {
  getRetailLocationCopy,
  resolvePdvWizardVariant,
  type PdvWizardVariant,
} from '../../../lib/retailLocationCopy';
import { useActiveStoreScope } from '../../../context/ActiveStoreScopeContext';
import { readSidebarRetailCache } from '../../../lib/sidebarRetailCache';
import { useModalClose } from '../../../hooks/useModalClose';
import { useHasProAccess } from '../../../hooks/useHasProAccess';
import { usePointOfSaleAccess } from '../../../hooks/usePointOfSaleAccess';
import {
  createWorkCenter,
  updateWorkCenter,
  deleteWorkCenter,
  WORK_CENTER_TYPE_LABELS,
  WORK_CENTER_TYPE_SHORT,
  OWNERSHIP_LABELS,
  type WorkCenter,
  type WorkCenterType,
  type OwnershipType,
  type ContractInfo,
} from '../../../lib/workCentersApi';
import { ensureRentFinanceFromWorkCenter } from '../../../lib/rentFinanceSync';
import {
  DEFAULT_BUSINESS_HOURS_CONFIG,
  getBusinessHoursIssue,
  hasValidBusinessHoursConfig,
  normalizeBusinessHoursConfig,
} from '../../../lib/businessHoursUtils';
import { getBusinessHours, type BusinessHoursConfig } from '../../../lib/settingsApi';
import { BusinessHoursEditor } from './BusinessHoursEditor';
import {
  buildPdvCodeFromParts,
  ensureDeliveryPdvForWorkCenter,
  ensureTabletCodesForPointsOfSale,
  isPdvCodeAlreadyUsed,
  parsePdvCodeParts,
  PDV_RETAIL_LIMITS,
  pointOfSaleDisplayLabel,
  regenerateTerminalCodeRequest,
  deletePointOfSaleRequest,
  resolveWorkCenterPdvAddress,
  sanitizePdvCodeInput,
  sanitizePdvCodeLiveInput,
  sanitizeRetailTextField,
  sanitizeRetailTextFieldInput,
  sanitizeStoreDisplayName,
  stripPdvDisplayNameBase,
  suggestNextPdvCode,
  suggestNextPdvDisplayName,
  updatePointOfSaleRequest,
  validatePdvCodeInput,
  validateStoreDisplayName,
  type PointOfSale,
} from '../../../lib/deliveryApi';
import { isSalaManagedWorkCenter } from '../../../lib/salaRoomTerminal';
import {
  formatMoneyAsYouType,
  parseSpanishMoneyInput,
  moneyNumberToDisplay,
} from '../../../lib/workCenterMoneyInput';
import { AddButtonDropdown } from '../AddButtonDropdown';
import { useActivationFocus } from '../../../hooks/useActivationFocus';
import { ActivationFieldWrap } from '../ActivationGuideUi';
import { ACCESO__AddressAutocomplete } from '../../design-system/ACCESO__AddressAutocomplete';
import { SettingsWizardFooter, SettingsWizardShell, type SettingsWizardStep } from './SettingsWizardShell';
import {
  settingsOwnershipChoiceClass,
  settingsOwnershipIconClass,
  settingsOwnershipRadioClass,
} from './settingsFormStyles';
import {
  Search,
  X,
  Trash2,
  Lock,
  Edit3,
  MapPin,
  ToggleRight,
  Phone,
  Mail,
  Store,
  Building2,
  Warehouse,
  Home,
  Tag,
  FileText,
  Euro,
  Users,
  ArrowRight,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Copy,
  Monitor,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { AUTH_PATHS } from '../../../lib/authEntryPaths';
import { writeBillingSelection } from '../../../lib/billingSelection';
import { formatAddonPriceShort } from '../../../lib/planAddonCatalog';

const WORK_CENTERS_CHANGED_EVENT = 'work-centers:changed';

function notifyWorkCentersChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(WORK_CENTERS_CHANGED_EVENT));
  } catch {
    // Older browsers without CustomEvent constructor; safe to ignore.
  }
}

const CENTER_TYPE_ICONS: Record<WorkCenterType, React.ReactNode> = {
  oficina: <Building2 className="w-4 h-4" />,
  punto_de_venta: <Store className="w-4 h-4" />,
  almacen: <Warehouse className="w-4 h-4" />,
  custom: <Tag className="w-4 h-4" />,
};

const EMPTY_PDV_CODES: readonly string[] = [];

const PDV_MOBILE_ADDRESS_LABEL = 'PDV móvil';

const CENTER_TYPE_COLORS: Record<WorkCenterType, string> = {
  oficina: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  punto_de_venta: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
  almacen: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
  custom: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
};

// ── Modal crear/editar centro de trabajo ──────────────────────────────────────

export type WorkCenterSaveData = Partial<WorkCenter> & {
  /** Código PDV de caja (delivery), editable en el wizard. */
  pdvCode?: string;
};

function isRetailWorkCenterType(centerType: WorkCenterType): boolean {
  return centerType === 'punto_de_venta' || centerType === 'almacen';
}

function shouldSyncRetailPdv(
  usesRetailPdvFlow: boolean,
  centerType: WorkCenterType,
): boolean {
  return usesRetailPdvFlow && isRetailWorkCenterType(centerType);
}

interface WorkCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: WorkCenterSaveData) => Promise<void>;
  editItem?: WorkCenter | null;
  forcePointOfSale?: boolean;
  /** Paso de horario en wizard (tiendas delivery / retail). */
  includeOpeningHours?: boolean;
  /** Migración: horario global legacy si la tienda aún no tiene `openingHours`. */
  legacyUserId?: string;
  /** Abrir el wizard directamente en el paso de horarios (checklist / deep link). */
  initialWizardStep?: 'horarios';
  /** Códigos PDV ya existentes (delivery), para previsualizar el siguiente `PREFIX-01`. */
  existingPdvCodes?: readonly string[];
  /** Nombres de PDV/centros retail ya existentes (para sufijo « - 02 » en el nombre). */
  existingPdvNames?: readonly string[];
  defaultActiveOnCreate?: boolean;
  /** Tienda delivery: permite editar código PDV al crear/editar. */
  enablePdvCodeEdit?: boolean;
  /** Código PDV actual al editar (si hay caja enlazada). */
  editPdvCode?: string;
  /** Textos del wizard compacto: delivery, bar/restaurante o compraventa. */
  pdvWizardVariant?: PdvWizardVariant;
}

function WorkCenterModal({
  isOpen,
  onClose,
  onSave,
  editItem,
  forcePointOfSale = false,
  includeOpeningHours = false,
  legacyUserId,
  initialWizardStep,
  existingPdvCodes = EMPTY_PDV_CODES,
  existingPdvNames = EMPTY_PDV_CODES,
  defaultActiveOnCreate = true,
  enablePdvCodeEdit = false,
  editPdvCode = '',
  pdvWizardVariant = 'delivery',
}: WorkCenterModalProps) {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    centerType: 'punto_de_venta' as WorkCenterType,
    customTypeName: '',
    ownership: 'propiedad' as OwnershipType,
    address: '',
    city: '',
    postalCode: '',
    province: '',
    phone: '',
    email: '',
    expectedStaffCount: '0',
    squareMeters: '',
    notes: '',
    purchasePrice: '',
    purchaseDate: '',
    cadastralReference: '',
    contractStartDate: '',
    contractEndDate: '',
    monthlyPrice: '',
    deposit: '',
    landlord: '',
    landlordPhone: '',
    landlordEmail: '',
    contractNotes: '',
  });
  const [saving, setSaving] = useState(false);
  const [openingHours, setOpeningHours] = useState<BusinessHoursConfig>(DEFAULT_BUSINESS_HOURS_CONFIG);
  const [step, setStep] = useState<'general' | 'ubicacion' | 'propiedad' | 'horarios'>('general');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pdvMoreOpen, setPdvMoreOpen] = useState<'general' | 'ubicacion' | 'contrato' | null>(null);
  const [pdvCode, setPdvCode] = useState('');
  const [pdvCodeManual, setPdvCodeManual] = useState(false);
  const [isMobilePdv, setIsMobilePdv] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isRetailCenter =
    forcePointOfSale ||
    form.centerType === 'punto_de_venta' ||
    form.centerType === 'almacen';
  const showPdvCodeField = enablePdvCodeEdit && isRetailCenter;

  useEffect(() => {
    if (editItem) {
      setForm({
        name: stripPdvDisplayNameBase(editItem.name),
        centerType: editItem.centerType || 'punto_de_venta',
        customTypeName: editItem.customTypeName || '',
        ownership: editItem.ownership || 'propiedad',
        address: editItem.address || '',
        city: editItem.city || '',
        postalCode: editItem.postalCode || '',
        province: editItem.province || '',
        phone: editItem.phone || '',
        email: editItem.email || '',
        expectedStaffCount: String(editItem.expectedStaffCount ?? 3),
        squareMeters: editItem.squareMeters ? String(editItem.squareMeters) : '',
        notes: editItem.notes || '',
        purchasePrice: editItem.purchasePrice ? String(editItem.purchasePrice) : '',
        purchaseDate: editItem.purchaseDate || '',
        cadastralReference: editItem.cadastralReference || '',
        contractStartDate: editItem.contract?.startDate || '',
        contractEndDate: editItem.contract?.endDate || '',
        monthlyPrice: moneyNumberToDisplay(editItem.contract?.monthlyPrice, true),
        deposit: moneyNumberToDisplay(editItem.contract?.deposit, false),
        landlord: editItem.contract?.landlord || '',
        landlordPhone: editItem.contract?.landlordPhone || '',
        landlordEmail: editItem.contract?.landlordEmail || '',
        contractNotes: editItem.contract?.contractNotes || '',
      });
    } else {
      setForm({
        name: '', centerType: 'punto_de_venta', customTypeName: '', ownership: 'propiedad',
        address: '', city: '', postalCode: '', province: '', phone: '', email: '', expectedStaffCount: '0', squareMeters: '',
        notes: '', purchasePrice: '', purchaseDate: '', cadastralReference: '',
        contractStartDate: '', contractEndDate: '', monthlyPrice: '', deposit: '',
        landlord: '', landlordPhone: '', landlordEmail: '', contractNotes: '',
      });
    }
    setStep('general');
    setFieldErrors({});
    setPdvMoreOpen(null);
    setIsMobilePdv(
      String(editItem?.address || '')
        .trim()
        .toLowerCase() === PDV_MOBILE_ADDRESS_LABEL.toLowerCase(),
    );
    setPdvCode(editPdvCode || '');
    setPdvCodeManual(Boolean(editPdvCode));
    setOpeningHours(normalizeBusinessHoursConfig(editItem?.openingHours ?? DEFAULT_BUSINESS_HOURS_CONFIG));
    if (isOpen && initialWizardStep === 'horarios' && includeOpeningHours) {
      setStep('horarios');
    }
  }, [editItem, isOpen, initialWizardStep, includeOpeningHours, editPdvCode]);

  useEffect(() => {
    if (!isOpen || !includeOpeningHours) return;
    if (editItem?.openingHours) {
      setOpeningHours(normalizeBusinessHoursConfig(editItem.openingHours));
      return;
    }
    if (!editItem || !legacyUserId) return;
    let cancelled = false;
    getBusinessHours(legacyUserId)
      .then((legacy) => {
        if (!cancelled && legacy) setOpeningHours(normalizeBusinessHoursConfig(legacy));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOpen, includeOpeningHours, editItem, legacyUserId]);

  useEffect(() => {
    setPdvMoreOpen(null);
  }, [step]);

  useEffect(() => {
    if (!pdvMoreOpen) return;
    const id = requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector('[data-pdv-more-panel]')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [pdvMoreOpen]);

  const simplifyPdvCreate = forcePointOfSale && !editItem;
  const showPdvLabelPreview =
    isOpen && !editItem && (simplifyPdvCreate || form.centerType === 'punto_de_venta');
  const effectivePdvCode = pdvCode.trim() === '-' ? '' : pdvCode.trim();

  const pdvLabelPreview = useMemo(() => {
    if (!showPdvLabelPreview) return null;
    const rawName = form.name.trim();
    if (!rawName) {
      return { code: '', displayName: '', label: '', needsName: true as const };
    }
    const code =
      (showPdvCodeField && effectivePdvCode) ||
      suggestNextPdvCode(rawName, [...existingPdvCodes]);
    const displayName = showPdvCodeField
      ? rawName
      : suggestNextPdvDisplayName(rawName, [...existingPdvNames], [...existingPdvCodes], code);
    const label = pointOfSaleDisplayLabel({ name: displayName, code });
    return { code, displayName, label, needsName: false as const };
  }, [
    showPdvLabelPreview,
    showPdvCodeField,
    form.name,
    pdvCode,
    existingPdvCodes,
    existingPdvNames,
  ]);

  useEffect(() => {
    if (!showPdvCodeField || pdvCodeManual || !form.name.trim()) return;
    const suggested = suggestNextPdvCode(stripPdvDisplayNameBase(form.name), [...existingPdvCodes]);
    setPdvCode(suggested);
  }, [showPdvCodeField, pdvCodeManual, form.name, existingPdvCodes]);

  if (!isOpen) return null;

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const updatePdvCodeLive = (raw: string) => {
    clearFieldError('pdvCode');
    const next = sanitizePdvCodeLiveInput(raw);
    if (next === '-') {
      setPdvCodeManual(true);
      setPdvCode('-');
      return;
    }
    setPdvCodeManual(true);
    setPdvCode(next);
  };

  const stepIds = includeOpeningHours
    ? (['general', 'ubicacion', 'propiedad', 'horarios'] as const)
    : (['general', 'ubicacion', 'propiedad'] as const);
  type WizardStepId = (typeof stepIds)[number];

  const stepHasFieldError = (sid: WizardStepId) => {
    const keys =
      sid === 'general'
        ? (['name', 'customTypeName', 'expectedStaffCount', 'pdvCode'] as const)
        : sid === 'ubicacion'
          ? (['address', 'city', 'postalCode', 'phone', 'email'] as const)
          : sid === 'horarios'
            ? (['horarios'] as const)
            : (['purchasePrice', 'purchaseDate', 'landlord', 'contractStartDate', 'monthlyPrice'] as const);
    return keys.some((k) => Boolean(fieldErrors[k]));
  };

  const validateWizardForm = (
    onlyStep?: WizardStepId,
  ): { errors: Record<string, string>; nameValidation: string | null; staffCount: number } => {
    const nextErr: Record<string, string> = {};
    const nameErr = validateStoreDisplayName(form.name);

    const validateGeneral = () => {
      if (nameErr) nextErr.name = nameErr;
      if (form.centerType === 'custom') {
        const custom = sanitizeRetailTextField(form.customTypeName, PDV_RETAIL_LIMITS.customTypeMax);
        if (!custom) nextErr.customTypeName = 'Indica el nombre del tipo personalizado';
        else if (form.customTypeName.trim().length > PDV_RETAIL_LIMITS.customTypeMax) {
          nextErr.customTypeName = `Máximo ${PDV_RETAIL_LIMITS.customTypeMax} caracteres`;
        }
      }
      const staffCount = Number(form.expectedStaffCount || 0);
      if (
        !String(form.expectedStaffCount ?? '').trim() ||
        !Number.isFinite(staffCount) ||
        staffCount < 0 ||
        staffCount > 999
      ) {
        nextErr.expectedStaffCount = 'Indica cuántos trabajadores prevés (0–999)';
      }
      return staffCount;
    };

    const validateUbicacion = () => {
      if (!form.address.trim()) nextErr.address = 'Indica la dirección del local';
      else if (form.address.trim().length > PDV_RETAIL_LIMITS.addressMax) {
        nextErr.address = `Máximo ${PDV_RETAIL_LIMITS.addressMax} caracteres`;
      }
      if (!form.city.trim()) nextErr.city = 'Indica la ciudad';
      else if (form.city.trim().length > PDV_RETAIL_LIMITS.cityMax) {
        nextErr.city = `Máximo ${PDV_RETAIL_LIMITS.cityMax} caracteres`;
      }
      if (!form.postalCode.trim()) nextErr.postalCode = 'Indica el código postal';
      else if (form.postalCode.trim().length > PDV_RETAIL_LIMITS.postalCodeMax) {
        nextErr.postalCode = `Máximo ${PDV_RETAIL_LIMITS.postalCodeMax} caracteres`;
      }
      if (!form.phone.trim()) nextErr.phone = 'Indica un teléfono de contacto del centro';
      else if (form.phone.trim().length > PDV_RETAIL_LIMITS.phoneMax) {
        nextErr.phone = `Máximo ${PDV_RETAIL_LIMITS.phoneMax} caracteres`;
      }
      if (form.email.trim().length > PDV_RETAIL_LIMITS.emailMax) {
        nextErr.email = `Máximo ${PDV_RETAIL_LIMITS.emailMax} caracteres`;
      }
      if (form.notes.trim().length > PDV_RETAIL_LIMITS.notesMax) {
        nextErr.notes = `Máximo ${PDV_RETAIL_LIMITS.notesMax} caracteres`;
      }
    };

    const validatePropiedad = () => {
      if (form.ownership === 'propiedad') {
        const ppRaw = String(form.purchasePrice ?? '').trim();
        const pp = ppRaw === '' && simplifyPdvCreate ? 0 : Number(ppRaw.replace(',', '.'));
        if (!ppRaw && !simplifyPdvCreate) {
          nextErr.purchasePrice = 'Indica el precio de compra (puedes poner 0)';
        } else if (!Number.isFinite(pp) || pp < 0) {
          nextErr.purchasePrice = 'Precio de compra no válido';
        }
        if (!simplifyPdvCreate && !form.purchaseDate.trim()) {
          nextErr.purchaseDate = 'Indica la fecha de compra';
        }
      } else {
        if (!form.landlord.trim()) nextErr.landlord = 'Indica el nombre del arrendador';
        if (!form.contractStartDate.trim()) {
          nextErr.contractStartDate = 'Indica el inicio del contrato';
        }
        const mp = parseSpanishMoneyInput(form.monthlyPrice);
        if (!String(form.monthlyPrice ?? '').trim() || !Number.isFinite(mp) || mp <= 0) {
          nextErr.monthlyPrice = 'Indica el precio mensual del alquiler';
        }
      }
    };

    const validateHorarios = () => {
      if (!includeOpeningHours) return;
      const issue = getBusinessHoursIssue(openingHours);
      if (issue) nextErr.horarios = issue;
    };

    let staffCount = Number(form.expectedStaffCount || 0);
    if (!onlyStep || onlyStep === 'general') staffCount = validateGeneral();
    if (!onlyStep || onlyStep === 'ubicacion') validateUbicacion();
    if (!onlyStep || onlyStep === 'propiedad') validatePropiedad();
    if (!onlyStep || onlyStep === 'horarios') validateHorarios();

    return { errors: nextErr, nameValidation: nameErr, staffCount };
  };

  const focusFirstWizardError = (nextErr: Record<string, string>) => {
    const s1 = ['name', 'customTypeName', 'expectedStaffCount', 'pdvCode'].some((k) => nextErr[k]);
    const s2 = ['address', 'city', 'postalCode', 'phone', 'email', 'notes'].some((k) => nextErr[k]);
    const s3 = ['purchasePrice', 'purchaseDate', 'landlord', 'contractStartDate', 'monthlyPrice'].some(
      (k) => nextErr[k],
    );
    if (s1) setStep('general');
    else if (s2) setStep('ubicacion');
    else if (s3) setStep('propiedad');
    else if (nextErr.horarios) setStep('horarios');
    const summary = Object.values(nextErr).filter(Boolean).slice(0, 2).join(' · ');
    toast.error(summary || 'Revisa los campos marcados en rojo');
  };

  const goNextValidated = () => {
    const { errors } = validateWizardForm(step);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstWizardError(errors);
      return;
    }
    setFieldErrors({});
    goNext();
  };

  const handleSubmit = async () => {
    const { errors: nextErr, nameValidation: nameErr, staffCount } = validateWizardForm();

    if (Object.keys(nextErr).length > 0) {
      setFieldErrors(nextErr);
      focusFirstWizardError(nextErr);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const contract: ContractInfo | undefined = form.ownership === 'alquiler' ? {
        startDate: form.contractStartDate || undefined,
        endDate: form.contractEndDate || undefined,
        monthlyPrice: String(form.monthlyPrice ?? '').trim() ? parseSpanishMoneyInput(form.monthlyPrice) : undefined,
        deposit: String(form.deposit ?? '').trim() ? parseSpanishMoneyInput(form.deposit) : undefined,
        landlord: form.landlord.trim() || undefined,
        landlordPhone: form.landlordPhone.trim() || undefined,
        landlordEmail: form.landlordEmail.trim() || undefined,
        contractNotes: form.contractNotes.trim() || undefined,
      } : undefined;

      const isRetailSave =
        enablePdvCodeEdit &&
        (forcePointOfSale || form.centerType === 'punto_de_venta' || form.centerType === 'almacen');
      const trimmedName = sanitizeStoreDisplayName(form.name);
      const codeForSave = isRetailSave ? sanitizePdvCodeInput(pdvCode) : '';

      if (nameErr) {
        setFieldErrors((p) => ({ ...p, name: ' ' }));
        setStep('general');
        setSaving(false);
        toast.error(nameErr);
        return;
      }

      if (isRetailSave) {
        const codeErr = validatePdvCodeInput(pdvCode);
        if (codeErr) {
          setFieldErrors({ pdvCode: ' ' });
          setStep('general');
          setSaving(false);
          toast.error(codeErr);
          return;
        }
        if (isPdvCodeAlreadyUsed(codeForSave, existingPdvCodes, editPdvCode || undefined)) {
          setFieldErrors({ pdvCode: ' ' });
          setStep('general');
          setSaving(false);
          toast.error(`El código «${codeForSave}» ya está en uso. Elige otro.`);
          return;
        }
      }

      const saveName = trimmedName;

      await onSave({
        ...editItem,
        name: saveName,
        pdvCode: isRetailSave ? codeForSave : undefined,
        centerType: forcePointOfSale ? 'punto_de_venta' : form.centerType,
        customTypeName:
          !forcePointOfSale && form.centerType === 'custom'
            ? sanitizeRetailTextField(form.customTypeName, PDV_RETAIL_LIMITS.customTypeMax)
            : undefined,
        ownership: form.ownership,
        contract,
        purchasePrice:
          form.ownership === 'propiedad'
            ? (() => {
                const raw = String(form.purchasePrice ?? '').trim();
                if (!raw && simplifyPdvCreate) return 0;
                return raw ? Number(raw.replace(',', '.')) : undefined;
              })()
            : undefined,
        purchaseDate: form.ownership === 'propiedad' ? form.purchaseDate || undefined : undefined,
        cadastralReference: form.cadastralReference.trim() || undefined,
        address: sanitizeRetailTextField(form.address, PDV_RETAIL_LIMITS.addressMax) || undefined,
        city: sanitizeRetailTextField(form.city, PDV_RETAIL_LIMITS.cityMax) || undefined,
        postalCode: sanitizeRetailTextField(form.postalCode, PDV_RETAIL_LIMITS.postalCodeMax) || undefined,
        province: sanitizeRetailTextField(form.province, PDV_RETAIL_LIMITS.cityMax) || undefined,
        phone: sanitizeRetailTextField(form.phone, PDV_RETAIL_LIMITS.phoneMax) || undefined,
        email: sanitizeRetailTextField(form.email, PDV_RETAIL_LIMITS.emailMax) || undefined,
        expectedStaffCount: Math.max(0, Math.floor(staffCount)),
        squareMeters: form.squareMeters ? Number(form.squareMeters) : undefined,
        notes: sanitizeRetailTextField(form.notes, PDV_RETAIL_LIMITS.notesMax) || undefined,
        active: editItem ? editItem.active !== false : defaultActiveOnCreate,
        openingHours: includeOpeningHours
          ? normalizeBusinessHoursConfig(openingHours)
          : editItem?.openingHours,
      });
      onClose();
    } catch {
      // onSave already shows the specific error/toast.
    } finally {
      setSaving(false);
    }
  };

  const inputBase = simplifyPdvCreate
    ? 'w-full px-2.5 py-1.5 border-2 rounded-lg outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm'
    : 'w-full px-3 py-2 border-2 rounded-xl outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  const inputOk = 'border-gray-200 dark:border-gray-700 focus:border-gray-900 dark:focus:border-gray-400';
  const inputErr = 'border-red-500 dark:border-red-500 focus:border-red-600 dark:focus:border-red-500';
  const inputClass = (field?: string) =>
    `${inputBase} ${field && fieldErrors[field] ? inputErr : inputOk}`;
  const labelClass = simplifyPdvCreate
    ? 'block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1'
    : 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';
  const renderPdvMore = (
    section: 'general' | 'ubicacion' | 'contrato',
    label: string,
    children: React.ReactNode,
  ) => {
    const open = pdvMoreOpen === section;
    return (
      <div className="w-full shrink-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setPdvMoreOpen(open ? null : section)}
          className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            open
              ? 'border-gray-400 bg-gray-100 text-gray-900 dark:border-gray-500 dark:bg-gray-700/60 dark:text-gray-100'
              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400 dark:hover:border-gray-500'
          }`}
        >
          {label}
          <ChevronDown
            className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {open ? (
          <div
            data-pdv-more-panel
            className="mt-2 w-full space-y-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800"
          >
            {children}
          </div>
        ) : null}
      </div>
    );
  };

  const wizardRows: { id: WizardStepId; n: number; title: string; hint: string }[] = [
    { id: 'general', n: 1, title: 'General', hint: simplifyPdvCreate ? 'Tipo y nombre' : 'Tipo, nombre, trabajadores' },
    { id: 'ubicacion', n: 2, title: 'Ubicación', hint: 'Dirección y contacto' },
    {
      id: 'propiedad',
      n: 3,
      title: form.ownership === 'alquiler' ? 'Contrato' : 'Propiedad',
      hint: form.ownership === 'alquiler' ? 'Alquiler' : 'Compra',
    },
    ...(includeOpeningHours
      ? [{ id: 'horarios' as WizardStepId, n: 4, title: 'Horarios', hint: 'Apertura del local' }]
      : []),
  ];

  const stepOrder = wizardRows.map((r) => r.id);
  const activeStepIndex = stepOrder.indexOf(step);
  const isLastStep = includeOpeningHours ? step === 'horarios' : step === 'propiedad';

  const goNext = () => {
    if (step === 'general') setStep('ubicacion');
    else if (step === 'ubicacion') setStep('propiedad');
    else if (step === 'propiedad' && includeOpeningHours) setStep('horarios');
  };

  const goBack = () => {
    if (step === 'horarios') setStep('propiedad');
    else if (step === 'propiedad') setStep('ubicacion');
    else if (step === 'ubicacion') setStep('general');
  };

  const isCompraventaWizard = pdvWizardVariant === 'compraventa';
  const retailCopy = getRetailLocationCopy(pdvWizardVariant);

  const storeHoursLabel =
    editItem?.name?.trim() ||
    (pdvLabelPreview && !pdvLabelPreview.needsName ? pdvLabelPreview.displayName : '') ||
    form.name.trim() ||
    retailCopy.previewFallback;

  const shellSteps: SettingsWizardStep[] = wizardRows.map((row, index) => ({
    id: row.id,
    title: row.title,
    hint: row.hint,
    completed: activeStepIndex > index,
    hasError: stepHasFieldError(row.id),
  }));

  const modalTitle = simplifyPdvCreate
    ? retailCopy.modalTitleNew
    : editItem
      ? 'Editar centro de trabajo'
      : 'Nuevo centro de trabajo';

  const storePreview = (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Vista previa</p>
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${CENTER_TYPE_COLORS[form.centerType]}`}>
        {CENTER_TYPE_ICONS[form.centerType]}
      </span>
      <p className="line-clamp-2 w-full text-xs font-bold text-gray-900 dark:text-gray-100">
        {pdvLabelPreview && !pdvLabelPreview.needsName
          ? pdvLabelPreview.displayName
          : form.name.trim() || retailCopy.previewFallback}
      </p>
      {pdvLabelPreview && !pdvLabelPreview.needsName && pdvLabelPreview.code ? (
        <span className="font-mono text-[10px] text-gray-500">{pdvLabelPreview.code}</span>
      ) : null}
    </div>
  );

  return (
    <SettingsWizardShell
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={editItem ? 'Actualiza los datos del centro' : undefined}
      icon={<Store className="h-5 w-5" />}
      steps={shellSteps}
      activeStepId={step}
      onStepChange={(id) => setStep(id as WizardStepId)}
      maxHeight={simplifyPdvCreate ? 'min(92dvh,780px)' : 'min(90dvh,920px)'}
      size={simplifyPdvCreate ? 'medium' : 'default'}
      preview={step === 'horarios' ? undefined : storePreview}
      footer={
        <SettingsWizardFooter
          onCancel={onClose}
          showBack={activeStepIndex > 0}
          onBack={goBack}
          onNext={goNextValidated}
          onSave={handleSubmit}
          isLastStep={isLastStep}
          saving={saving}
          saveLabel={
            editItem
              ? 'Guardar cambios'
              : simplifyPdvCreate
                ? retailCopy.modalSaveCta
                : 'Crear centro de trabajo'
          }
          nextLabel="Siguiente paso"
        />
      }
    >
      <div className={simplifyPdvCreate ? 'flex flex-col gap-3' : 'space-y-4'}>
          {step === 'general' && (
            <div className={simplifyPdvCreate ? 'flex flex-col gap-3' : 'space-y-4'}>
              {simplifyPdvCreate ? (
                <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 shrink-0">
                  Tipo: <span className="font-semibold">Punto de venta</span> —{' '}
                  {isCompraventaWizard
                    ? 'se creará el PDV de venta de vehículos y TPV automáticamente.'
                    : 'se creará el PDV de caja automáticamente.'}
                </p>
              ) : (
              <div>
                <label className={labelClass}>Tipo de centro *</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { type: 'oficina' as WorkCenterType, desc: 'Oficinas, despachos' },
                    { type: 'punto_de_venta' as WorkCenterType, desc: retailCopy.typeDesc },
                    { type: 'almacen' as WorkCenterType, desc: 'Naves, depósitos' },
                    { type: 'custom' as WorkCenterType, desc: 'Garajes, trasteros…' },
                  ]).map(({ type: ct, desc }) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => {
                        if (forcePointOfSale) return;
                        setForm(f => ({ ...f, centerType: ct }));
                      }}
                      disabled={forcePointOfSale && ct !== 'punto_de_venta'}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all text-sm ${
                        form.centerType === ct
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-700'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                      } ${forcePointOfSale && ct !== 'punto_de_venta' ? 'opacity-40 cursor-not-allowed hover:border-gray-200 dark:hover:border-gray-700' : ''
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${CENTER_TYPE_COLORS[ct]}`}>
                        {CENTER_TYPE_ICONS[ct]}
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100 block">{WORK_CENTER_TYPE_SHORT[ct]}</span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              )}

              {form.centerType === 'custom' && !simplifyPdvCreate && (
                <div>
                  <label className={labelClass}>Nombre del tipo personalizado *</label>
                  <input
                    className={inputClass('customTypeName')}
                    placeholder="Ej: Garaje, Trastero, Nave industrial, Parking..."
                    value={form.customTypeName}
                    onChange={(e) => {
                      clearFieldError('customTypeName');
                      setForm(f => ({ ...f, customTypeName: e.target.value }));
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Define el tipo de espacio a tu medida</p>
                </div>
              )}

              {pdvLabelPreview && simplifyPdvCreate && (
                <p className="text-xs text-indigo-800 dark:text-indigo-200 shrink-0">
                  Vista en {isCompraventaWizard ? 'TPV' : 'caja'}:{' '}
                  {pdvLabelPreview.needsName ? (
                    <span className="text-indigo-700/90 dark:text-indigo-300/90">
                      escribe el nombre arriba (ej. Badalona)
                    </span>
                  ) : (
                    <span className="font-semibold">{pdvLabelPreview.label}</span>
                  )}
                  {!pdvLabelPreview.needsName &&
                  !showPdvCodeField &&
                  pdvLabelPreview.displayName !== form.name.trim() &&
                  form.name.trim() ? (
                    <span className="block mt-0.5 text-indigo-600/90 dark:text-indigo-300/90">
                      Se guardará como «{pdvLabelPreview.displayName}»
                    </span>
                  ) : null}
                </p>
              )}

              {pdvLabelPreview && !simplifyPdvCreate && (
                <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50/90 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/35">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                    {retailCopy.previewVisibilityLabel}
                  </p>
                  <div className="mt-2 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white dark:border-indigo-800 dark:bg-gray-900">
                      <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Código automático{' '}
                        <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{pdvLabelPreview.code}</span>
                      </p>
                      <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100" title={pdvLabelPreview.label}>
                        {pdvLabelPreview.label}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className={simplifyPdvCreate ? 'grid grid-cols-1 sm:grid-cols-3 gap-2' : ''}>
              <div className={simplifyPdvCreate ? 'sm:col-span-2' : ''}>
                <label className={labelClass}>Nombre *</label>
                <input
                  className={inputClass('name')}
                  placeholder={
                    simplifyPdvCreate
                      ? retailCopy.namePlaceholderSimple
                      : retailCopy.namePlaceholderFull
                  }
                  value={form.name}
                  maxLength={PDV_RETAIL_LIMITS.storeNameMax}
                  onChange={(e) => {
                    clearFieldError('name');
                    setForm((f) => ({
                      ...f,
                      name: sanitizeRetailTextFieldInput(
                        e.target.value,
                        PDV_RETAIL_LIMITS.storeNameMax,
                      ),
                    }));
                  }}
                  onBlur={() => {
                    setForm((f) => ({
                      ...f,
                      name: sanitizeStoreDisplayName(f.name),
                    }));
                  }}
                  autoFocus
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Máx. {PDV_RETAIL_LIMITS.storeNameMax} caracteres (menú, sidebar y caja).
                </p>
                {fieldErrors.name ? (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{fieldErrors.name}</p>
                ) : null}
              </div>
              {showPdvCodeField && (
                <div className={simplifyPdvCreate ? 'sm:col-span-3' : ''}>
                  <label className={labelClass}>Código PDV</label>
                  <input
                    className={`${inputClass('pdvCode')} max-w-[8.5rem] font-mono uppercase tracking-widest`}
                    placeholder="-"
                    value={pdvCode || '-'}
                    maxLength={PDV_RETAIL_LIMITS.pdvCodeMax + 1}
                    aria-label="Código PDV (3 letras, guion, 2 números)"
                    onChange={(e) => updatePdvCodeLive(e.target.value)}
                    onBlur={() => {
                      const { prefix, seq } = parsePdvCodeParts(pdvCode);
                      if (seq.length === 1) {
                        updatePdvCodeLive(buildPdvCodeFromParts(prefix, seq.padStart(2, '0')));
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    3 letras + guion + 2 números (ej. CDM-01). El guion se mantiene; escribe letras y número.
                  </p>
                  {fieldErrors.pdvCode ? (
                    <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                      {validatePdvCodeInput(pdvCode) || 'Código no válido o ya en uso'}
                    </p>
                  ) : null}
                </div>
              )}
              <div>
                <label className={labelClass}>
                  Trabajadores{simplifyPdvCreate ? '' : ' previstos'} *
                </label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  className={inputClass('expectedStaffCount')}
                  placeholder={simplifyPdvCreate ? '0' : 'Obligatorio — número de personas (0–999)'}
                  value={form.expectedStaffCount}
                  onChange={(e) => {
                    clearFieldError('expectedStaffCount');
                    setForm(f => ({ ...f, expectedStaffCount: e.target.value }));
                  }}
                />
                {fieldErrors.expectedStaffCount ? (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                    {fieldErrors.expectedStaffCount}
                  </p>
                ) : null}
              </div>

              <div className={simplifyPdvCreate ? 'sm:col-span-3' : ''}>
                <label className={labelClass}>Régimen</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['propiedad', 'alquiler'] as OwnershipType[]).map((ow) => {
                    const selected = form.ownership === ow;
                    return (
                      <button
                        key={ow}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setForm(f => ({ ...f, ownership: ow }));
                          setFieldErrors((p) => {
                            const n = { ...p };
                            ['purchasePrice', 'purchaseDate', 'landlord', 'contractStartDate', 'monthlyPrice'].forEach(
                              (k) => {
                                delete n[k];
                              },
                            );
                            return n;
                          });
                        }}
                        className={settingsOwnershipChoiceClass(ow, selected, simplifyPdvCreate)}
                      >
                        <span className={settingsOwnershipRadioClass(ow, selected)} aria-hidden>
                          {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                        </span>
                        <span className={settingsOwnershipIconClass(ow, selected)}>
                          {ow === 'propiedad' ? <Home className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </span>
                        <span className={`min-w-0 flex-1 ${simplifyPdvCreate ? 'text-center' : ''}`}>
                          <span
                            className={`block font-bold leading-tight ${
                              selected
                                ? ow === 'propiedad'
                                  ? 'text-emerald-900 dark:text-emerald-100'
                                  : 'text-orange-900 dark:text-orange-100'
                                : 'text-gray-800 dark:text-gray-200'
                            } ${simplifyPdvCreate ? 'text-xs' : 'text-sm'}`}
                          >
                            {OWNERSHIP_LABELS[ow]}
                          </span>
                          {!simplifyPdvCreate ? (
                            <span
                              className={`mt-0.5 block text-[11px] leading-tight ${
                                selected
                                  ? ow === 'propiedad'
                                    ? 'text-emerald-700/90 dark:text-emerald-200/80'
                                    : 'text-orange-700/90 dark:text-orange-200/80'
                                  : 'text-gray-500 dark:text-gray-500'
                              }`}
                            >
                              {ow === 'propiedad' ? 'Local en propiedad' : 'Contrato de alquiler'}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>

              <div>
                <label className={labelClass}>Notas internas{simplifyPdvCreate ? ' (opcional)' : ''}</label>
                {simplifyPdvCreate ? (
                  <input
                    className={inputClass()}
                    placeholder="Notas adicionales..."
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                ) : (
                  <textarea
                    rows={2}
                    className={`${inputClass()} resize-none`}
                    placeholder="Notas adicionales..."
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                )}
              </div>

              {!simplifyPdvCreate && (
                <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                    <Users className="w-6 h-6 text-gray-700 dark:text-gray-200" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Invitar equipo del centro</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Configura usuarios desde Equipo para que el centro opere correctamente.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/saas/team')}
                    className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                  >
                    Ir a Equipo
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {simplifyPdvCreate &&
                renderPdvMore(
                  'general',
                  'Más opciones',
                  <>
                    {pdvLabelPreview && (
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-2.5 dark:border-indigo-800 dark:bg-indigo-950/30">
                        <p className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                          {retailCopy.previewVisibilityLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {pdvLabelPreview.needsName
                            ? 'Indica el nombre en el paso General'
                            : pdvLabelPreview.label || '—'}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Equipo del centro</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Invita usuarios desde Equipo</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/saas/team')}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
                      >
                        Equipo
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </>,
                )}
            </div>
          )}

          {step === 'ubicacion' && (
            <div className={simplifyPdvCreate ? 'flex flex-col gap-2.5' : 'space-y-4'}>
              {simplifyPdvCreate ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={isMobilePdv}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsMobilePdv(checked);
                      clearFieldError('address');
                      setForm((f) => ({
                        ...f,
                        address: checked
                          ? PDV_MOBILE_ADDRESS_LABEL
                          : f.address.trim().toLowerCase() === PDV_MOBILE_ADDRESS_LABEL.toLowerCase()
                            ? ''
                            : f.address,
                      }));
                    }}
                  />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">PDV móvil</span>
                </label>
              ) : null}
              <div>
                <label className={labelClass}>Dirección *</label>
                <input
                  className={inputClass('address')}
                  placeholder="Calle, número, piso…"
                  value={form.address}
                  maxLength={PDV_RETAIL_LIMITS.addressMax}
                  onChange={(e) => {
                    clearFieldError('address');
                    const next = sanitizeRetailTextFieldInput(e.target.value, PDV_RETAIL_LIMITS.addressMax);
                    setIsMobilePdv(next.trim().toLowerCase() === PDV_MOBILE_ADDRESS_LABEL.toLowerCase());
                    setForm((f) => ({ ...f, address: next }));
                  }}
                />
              </div>
              <div className={simplifyPdvCreate ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-3 gap-3'}>
                <div>
                  <label className={labelClass}>Ciudad *</label>
                  <input
                    className={inputClass('city')}
                    placeholder="Ciudad"
                    value={form.city}
                    maxLength={PDV_RETAIL_LIMITS.cityMax}
                    onChange={(e) => {
                      clearFieldError('city');
                      setForm((f) => ({
                        ...f,
                        city: sanitizeRetailTextFieldInput(e.target.value, PDV_RETAIL_LIMITS.cityMax),
                      }));
                    }}
                  />
                  {fieldErrors.city ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{fieldErrors.city}</p>
                  ) : null}
                </div>
                <div>
                  <label className={labelClass}>Provincia{simplifyPdvCreate ? '' : ''}</label>
                  <input
                    className={inputClass()}
                    placeholder="Prov."
                    value={form.province}
                    maxLength={PDV_RETAIL_LIMITS.cityMax}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        province: sanitizeRetailTextFieldInput(e.target.value, PDV_RETAIL_LIMITS.cityMax),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>C.P. *</label>
                  <input
                    className={inputClass('postalCode')}
                    placeholder="CP"
                    value={form.postalCode}
                    maxLength={PDV_RETAIL_LIMITS.postalCodeMax}
                    onChange={(e) => {
                      clearFieldError('postalCode');
                      setForm((f) => ({
                        ...f,
                        postalCode: sanitizeRetailTextField(e.target.value, PDV_RETAIL_LIMITS.postalCodeMax),
                      }));
                    }}
                  />
                  {fieldErrors.postalCode ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{fieldErrors.postalCode}</p>
                  ) : null}
                </div>
              </div>
              {fieldErrors.address ? (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">{fieldErrors.address}</p>
              ) : null}
              <div className={simplifyPdvCreate ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-4'}>
                <div>
                  <label className={labelClass}>Teléfono del centro *</label>
                  <input
                    className={inputClass('phone')}
                    placeholder="+34 …"
                    value={form.phone}
                    maxLength={PDV_RETAIL_LIMITS.phoneMax}
                    onChange={(e) => {
                      clearFieldError('phone');
                      setForm((f) => ({
                        ...f,
                        phone: sanitizeRetailTextFieldInput(e.target.value, PDV_RETAIL_LIMITS.phoneMax),
                      }));
                    }}
                  />
                  {fieldErrors.phone ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{fieldErrors.phone}</p>
                  ) : null}
                </div>
                <div>
                  <label className={labelClass}>Email{simplifyPdvCreate ? ' (opc.)' : ''}</label>
                  <input
                    type="email"
                    className={inputClass('email')}
                    placeholder="centro@empresa.com"
                    value={form.email}
                    maxLength={PDV_RETAIL_LIMITS.emailMax}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        email: sanitizeRetailTextField(e.target.value, PDV_RETAIL_LIMITS.emailMax),
                      }))
                    }
                  />
                </div>
              </div>
              {!simplifyPdvCreate && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Superficie (m²)</label>
                  <input type="number" className={inputClass()} placeholder="120" value={form.squareMeters} onChange={(e) => setForm(f => ({ ...f, squareMeters: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>Referencia catastral</label>
                  <input className={inputClass()} placeholder="Ref. catastral" value={form.cadastralReference} onChange={(e) => setForm(f => ({ ...f, cadastralReference: e.target.value }))} />
                </div>
              </div>
              )}
              {simplifyPdvCreate &&
                renderPdvMore(
                  'ubicacion',
                  'Más opciones',
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Superficie (m²)</label>
                      <input
                        type="number"
                        className={inputClass()}
                        placeholder="120"
                        value={form.squareMeters}
                        onChange={(e) => setForm(f => ({ ...f, squareMeters: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Ref. catastral</label>
                      <input
                        className={inputClass()}
                        placeholder="Ref. catastral"
                        value={form.cadastralReference}
                        onChange={(e) => setForm(f => ({ ...f, cadastralReference: e.target.value }))}
                      />
                    </div>
                  </div>,
                )}
            </div>
          )}

          {step === 'propiedad' && form.ownership === 'propiedad' && (
            <div className={simplifyPdvCreate ? 'space-y-3' : 'space-y-4'}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Precio de compra (€) *</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass('purchasePrice')}
                    placeholder="0"
                    value={form.purchasePrice}
                    onChange={(e) => {
                      clearFieldError('purchasePrice');
                      setForm(f => ({ ...f, purchasePrice: e.target.value }));
                    }}
                  />
                  {fieldErrors.purchasePrice ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{fieldErrors.purchasePrice}</p>
                  ) : null}
                </div>
                <div>
                  <label className={labelClass}>
                    Fecha de compra{simplifyPdvCreate ? ' (opc.)' : ' *'}
                  </label>
                  <input
                    type="date"
                    className={inputClass('purchaseDate')}
                    value={form.purchaseDate}
                    onChange={(e) => {
                      clearFieldError('purchaseDate');
                      setForm(f => ({ ...f, purchaseDate: e.target.value }));
                    }}
                  />
                  {fieldErrors.purchaseDate ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{fieldErrors.purchaseDate}</p>
                  ) : null}
                </div>
              </div>
              {simplifyPdvCreate && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Precio en 0 si no aplica; la fecha de compra es opcional en el alta rápida.
                </p>
              )}
            </div>
          )}

          {step === 'propiedad' && form.ownership === 'alquiler' && (
            <div className={simplifyPdvCreate ? 'flex flex-col gap-3' : 'space-y-4'}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Inicio del contrato *</label>
                  <input
                    type="date"
                    className={inputClass('contractStartDate')}
                    value={form.contractStartDate}
                    onChange={(e) => {
                      clearFieldError('contractStartDate');
                      setForm(f => ({ ...f, contractStartDate: e.target.value }));
                    }}
                  />
                </div>
                {!simplifyPdvCreate && (
                <div>
                  <label className={labelClass}>Fin del contrato</label>
                  <input
                    type="date"
                    className={inputClass()}
                    value={form.contractEndDate}
                    onChange={(e) => setForm(f => ({ ...f, contractEndDate: e.target.value }))}
                  />
                </div>
                )}
                {simplifyPdvCreate && (
                <div>
                  <label className={labelClass}>Precio mensual (€) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className={inputClass('monthlyPrice')}
                    placeholder="1.200"
                    value={form.monthlyPrice}
                    onChange={(e) => {
                      clearFieldError('monthlyPrice');
                      setForm((f) => ({ ...f, monthlyPrice: formatMoneyAsYouType(e.target.value, true) }));
                    }}
                  />
                </div>
                )}
              </div>
              {!simplifyPdvCreate && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Precio mensual (€) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className={inputClass('monthlyPrice')}
                    placeholder="1.200 o 1.200,50"
                    value={form.monthlyPrice}
                    onChange={(e) => {
                      clearFieldError('monthlyPrice');
                      setForm((f) => ({ ...f, monthlyPrice: formatMoneyAsYouType(e.target.value, true) }));
                    }}
                  />
                </div>
                <div>
                  <label className={labelClass}>Fianza (€)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className={inputClass()}
                    placeholder="2.400"
                    value={form.deposit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, deposit: formatMoneyAsYouType(e.target.value, false) }))
                    }
                  />
                </div>
              </div>
              )}
              <div>
                <label className={labelClass}>Arrendador (nombre) *</label>
                <input
                  className={inputClass('landlord')}
                  placeholder="Nombre o razón social"
                  value={form.landlord}
                  onChange={(e) => {
                    clearFieldError('landlord');
                    setForm(f => ({ ...f, landlord: e.target.value }));
                  }}
                />
              </div>
              {!simplifyPdvCreate && (
              <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Teléfono arrendador</label>
                  <input
                    className={inputClass()}
                    placeholder="+34 600 000 000"
                    value={form.landlordPhone}
                    onChange={(e) => setForm(f => ({ ...f, landlordPhone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email arrendador</label>
                  <input
                    type="email"
                    className={inputClass()}
                    placeholder="arrendador@email.com"
                    value={form.landlordEmail}
                    onChange={(e) => setForm(f => ({ ...f, landlordEmail: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Notas del contrato</label>
                <textarea
                  rows={2}
                  className={`${inputClass()} resize-none`}
                  placeholder="Condiciones especiales, renovación..."
                  value={form.contractNotes}
                  onChange={(e) => setForm(f => ({ ...f, contractNotes: e.target.value }))}
                />
              </div>
              </>
              )}

              {simplifyPdvCreate &&
                renderPdvMore(
                  'contrato',
                  'Más opciones del contrato',
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelClass}>Fin del contrato</label>
                        <input
                          type="date"
                          className={inputClass()}
                          value={form.contractEndDate}
                          onChange={(e) => setForm(f => ({ ...f, contractEndDate: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Fianza (€)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          className={inputClass()}
                          placeholder="2.400"
                          value={form.deposit}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, deposit: formatMoneyAsYouType(e.target.value, false) }))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelClass}>Tel. arrendador</label>
                        <input
                          className={inputClass()}
                          placeholder="+34 …"
                          value={form.landlordPhone}
                          onChange={(e) => setForm(f => ({ ...f, landlordPhone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Email arrendador</label>
                        <input
                          type="email"
                          className={inputClass()}
                          placeholder="arrendador@…"
                          value={form.landlordEmail}
                          onChange={(e) => setForm(f => ({ ...f, landlordEmail: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Notas del contrato</label>
                      <textarea
                        rows={2}
                        className={`${inputClass()} resize-none`}
                        placeholder="Condiciones, renovación…"
                        value={form.contractNotes}
                        onChange={(e) => setForm(f => ({ ...f, contractNotes: e.target.value }))}
                      />
                    </div>
                  </>,
                )}
            </div>
          )}

          {step === 'horarios' && includeOpeningHours && (
            <div className="space-y-3 pb-2">
              {fieldErrors.horarios ? (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">{fieldErrors.horarios}</p>
              ) : null}
              <BusinessHoursEditor
                config={openingHours}
                onChange={(next) => {
                  setOpeningHours(next);
                  clearFieldError('horarios');
                }}
                storeLabel={storeHoursLabel}
                wizard={simplifyPdvCreate}
                compact={!simplifyPdvCreate}
              />
            </div>
          )}
      </div>
    </SettingsWizardShell>
  );
}

// ── Tab principal ─────────────────────────────────────────────────────────────

export function SalesPointsTab() {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const accountBusinessCount = businessesFetchSettled ? businesses.length : undefined;
  const hasProAccess = useHasProAccess();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showProAccessModal, setShowProAccessModal] = useState(false);
  const [proAccessReason, setProAccessReason] = useState<'pro' | 'pdv-extra'>('pro');
  const [forceCreatePdv, setForceCreatePdv] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkCenter | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterType, setFilterType] = useState<WorkCenterType | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<WorkCenter | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteAcknowledge, setDeleteAcknowledge] = useState(false);
  /** Códigos y nombres de PDV en delivery (previsualización y sufijos al crear). */
  const [deliveryPdvCodes, setDeliveryPdvCodes] = useState<string[]>([]);
  const [deliveryPdvNames, setDeliveryPdvNames] = useState<string[]>([]);
  const [deliveryPdvsByWorkCenter, setDeliveryPdvsByWorkCenter] = useState<
    Record<string, Pick<PointOfSale, '_id' | '_rev' | 'code' | 'name' | 'address' | 'workCenterId' | 'terminalCode'>>
  >({});
  const isDeliveryAccount = isDeliveryAccountFromSources({
    business: currentBusiness,
    businesses,
  });
  const isOpsBusiness = isDeliveryOpsBusinessType(currentBusiness?.businessType);
  const isRestaurant = isRestaurantBusinessType(currentBusiness?.businessType);
  const hasDeliveryPdvs = Object.keys(deliveryPdvsByWorkCenter).length > 0;
  const isDelivery = isDeliveryAccount || hasDeliveryPdvs || isOpsBusiness;
  const isCompraventa = isCompraventaBusinessType(currentBusiness?.businessType);
  /** Delivery, compraventa y bar/restaurante crean local + PDV/caja. */
  const usesRetailPdvFlow =
    isRetailStoreBusinessType(currentBusiness?.businessType) ||
    isDeliveryAccount ||
    hasDeliveryPdvs;
  const pdvWizardVariant = resolvePdvWizardVariant({
    businessType: currentBusiness?.businessType,
    isDeliveryAccount,
    hasDeliveryPdvs,
  });
  const retailCopy = useMemo(() => getRetailLocationCopy(pdvWizardVariant), [pdvWizardVariant]);
  const [regeneratingTerminal, setRegeneratingTerminal] = useState<string | null>(null);
  const saveInProgressRef = useRef(false);
  const loadSeqRef = useRef(0);
  const hasDisplayedStoresRef = useRef(false);
  hasDisplayedStoresRef.current = workCenters.length > 0;
  const currentBusinessRef = useRef(currentBusiness);
  currentBusinessRef.current = currentBusiness;
  const userRef = useRef(user);
  userRef.current = user;
  const accountBusinessCountRef = useRef(accountBusinessCount);
  accountBusinessCountRef.current = accountBusinessCount;
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;
  const pdvWizardVariantRef = useRef(pdvWizardVariant);
  pdvWizardVariantRef.current = pdvWizardVariant;
  const isDeliveryAccountRef = useRef(isDeliveryAccount);
  isDeliveryAccountRef.current = isDeliveryAccount;
  const isOpsBusinessRef = useRef(isOpsBusiness);
  isOpsBusinessRef.current = isOpsBusiness;
  const isCompraventaRef = useRef(isCompraventa);
  isCompraventaRef.current = isCompraventa;
  const businessScopeId = resolveBusinessScopeId(currentBusiness);
  const activeStore = useActiveStoreScope();

  const orphanRetailCount = useMemo(
    () =>
      workCenters.filter(
        (wc) =>
          !wc.deletedAt &&
          (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen') &&
          !readWorkCenterBusinessId(wc),
      ).length,
    [workCenters],
  );

  const applyDeliveryStoresState = useCallback((state: DeliveryStoresState) => {
    setWorkCenters(state.workCenters);
    const pdvList = state.pointsOfSale;
    setDeliveryPdvCodes(pdvList.map((p) => String(p.code || '').trim()).filter(Boolean));
    setDeliveryPdvNames(pdvList.map((p) => String(p.name || '').trim()).filter(Boolean));
    const byWc: Record<string, Pick<PointOfSale, '_id' | '_rev' | 'code' | 'name' | 'address' | 'workCenterId' | 'terminalCode'>> = {};
    for (const p of pdvList) {
      const wcId = String(p.workCenterId || '').trim();
      if (wcId) {
        byWc[wcId] = {
          _id: p._id,
          _rev: p._rev,
          code: p.code,
          name: String(p.name || ''),
          address: p.address,
          workCenterId: wcId,
          terminalCode: p.terminalCode,
        };
      }
    }
    setDeliveryPdvsByWorkCenter(byWc);
  }, []);

  const loadData = useCallback(async (options?: { skipPdvMerge?: boolean }) => {
    const seq = ++loadSeqRef.current;

    const run = async () => {
      if (!businessesFetchSettled) return;

      const userNow = userRef.current;
      const bizNow = currentBusinessRef.current;
      const uid = resolveBusinessDataUserId(userNow, bizNow);
      const bid = businessScopeId || resolveBusinessScopeId(bizNow);

      if (!uid || !userNow) {
        if (seq === loadSeqRef.current) setLoading(false);
        return;
      }
      if ((isDeliveryAccountRef.current || isCompraventaRef.current || isOpsBusinessRef.current) && !bid) {
        setWorkCenters([]);
        if (seq === loadSeqRef.current) setLoading(false);
        return;
      }

      const businessesNow = businessesRef.current;
      const showSpinner = !hasDisplayedStoresRef.current;
      if (showSpinner) setLoading(true);

      const skipPdvMerge = options?.skipPdvMerge ?? false;
      const retailLoadOpts = {
        accountBusinessCount: accountBusinessCountRef.current ?? businessesNow.length,
        knownBusinessIds: knownBusinessIdsFromList(businessesNow),
        includeInactivePdvs: true,
        tpvBootstrap: false,
        skipPdvMerge,
        ensureTabletCodes: false,
      };

      const applyRetailStateWithRepair = async (state: DeliveryStoresState) => {
        if (isCompraventaRef.current && !isDeliveryAccountRef.current && !isOpsBusinessRef.current) {
          return state;
        }
        if (!state.dataUserId || skipPdvMerge) return state;
        return {
          ...state,
          pointsOfSale: await repairMissingRetailDeliveryPdvs(
            state.dataUserId,
            state.workCenters,
            state.pointsOfSale,
            bizNow ?? null,
          ),
        };
      };

      try {
        const isCompraventaOnly =
          isCompraventaRef.current && !isDeliveryAccountRef.current && !isOpsBusinessRef.current;
        let state = isCompraventaOnly
          ? await loadCompraventaStores(userNow, bizNow, {
              includeInactivePdvs: true,
              ensureTabletCodes: false,
            })
          : await loadRetailStoresForBusiness(userNow, bizNow!, businessesNow, retailLoadOpts);
        state = await applyRetailStateWithRepair(state);
        if (seq !== loadSeqRef.current) return;
        if ((businessScopeId || resolveBusinessScopeId(currentBusinessRef.current)) !== bid) return;
        applyDeliveryStoresState(state);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        if (isCompraventaRef.current && !isDeliveryAccountRef.current) {
          const msg =
            err instanceof Error ? err.message : 'Error al cargar los centros de trabajo';
          toast.error(msg);
          return;
        }
        try {
          const fallback = isRestaurantBusinessType(bizNow?.businessType)
            ? await loadRestaurantStores(userNow, bizNow!, businessesNow, {
                includeInactivePdvs: true,
                tpvBootstrap: false,
              })
            : await loadDeliveryStores(userNow, bizNow, {
                skipPdvMerge,
                includeInactivePdvs: true,
                ensureTabletCodes: false,
                accountBusinessCount: accountBusinessCountRef.current ?? businessesNow.length,
                knownBusinessIds: knownBusinessIdsFromList(businessesNow),
              });
          let fallbackState = await applyRetailStateWithRepair(fallback);
          if (seq !== loadSeqRef.current) return;
          applyDeliveryStoresState(fallbackState);
          toast.warning(getRetailLocationCopy(pdvWizardVariantRef.current).syncWarning);
        } catch (fallbackErr) {
          const msg =
            fallbackErr instanceof Error
              ? fallbackErr.message
              : err instanceof Error
                ? err.message
                : 'Error al cargar los centros de trabajo';
          toast.error(msg);
        }
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    };

    await run();
  }, [businessScopeId, businessesFetchSettled, applyDeliveryStoresState]);

  useEffect(() => {
    if (!businessScopeId || !usesRetailPdvFlow) return;
    const cached = readSidebarRetailCache(businessScopeId);
    if (!cached?.retailWorkCenters?.length) return;
    applyDeliveryStoresState({
      dataUserId: dataUserId || '',
      workCenters: cached.retailWorkCenters,
      pointsOfSale: cached.allPointsOfSale || [],
    });
    setLoading(false);
  }, [businessScopeId, usesRetailPdvFlow, dataUserId, applyDeliveryStoresState]);

  useEffect(() => {
    if (!businessesFetchSettled) return;
    if ((isDeliveryAccount || isCompraventa || isOpsBusiness || isRestaurant) && !businessScopeId) {
      setWorkCenters([]);
      setLoading(false);
      return;
    }
    void loadData();
  }, [
    businessesFetchSettled,
    businessScopeId,
    isDeliveryAccount,
    isCompraventa,
    isOpsBusiness,
    isRestaurant,
    loadData,
  ]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onChanged = () => {
      if (saveInProgressRef.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void loadDataRef.current();
      }, 250);
    };
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChanged);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChanged);
    };
  }, []);


  const handleRegenerateTerminalCode = async (wc: WorkCenter) => {
    const linked = deliveryPdvsByWorkCenter[wc._id];
    if (!linked?._id || !dataUserId) return;
    if (!window.confirm('¿Generar un nuevo código de tablet? Las tablets ya activadas deberán reconfigurarse.')) {
      return;
    }
    setRegeneratingTerminal(wc._id);
    try {
      const updated = await regenerateTerminalCodeRequest(dataUserId, linked._id);
      setDeliveryPdvsByWorkCenter((prev) => ({
        ...prev,
        [wc._id]: { ...prev[wc._id], terminalCode: updated.terminalCode, _rev: updated._rev },
      }));
      toast.success(`Nuevo código tablet: ${updated.terminalCode || '—'}`);
      clearAllRetailScopeCaches(resolveBusinessScopeId(currentBusiness ?? null));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo regenerar el código');
    } finally {
      setRegeneratingTerminal(null);
    }
  };

  const handleCopyTerminalCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Código copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const tabletActivationUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${AUTH_PATHS.tpvTabletLogin}`
    : AUTH_PATHS.tpvTabletLogin;

  const handleCopyTabletActivationUrl = async () => {
    try {
      await navigator.clipboard.writeText(tabletActivationUrl);
      toast.success('Enlace de activación copiado — ábrelo en la tablet');
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const pointOfSaleCount = useMemo(
    () => workCenters.filter((wc) => wc.centerType === 'punto_de_venta').length,
    [workCenters],
  );
  const pointOfSaleAccess = usePointOfSaleAccess(pointOfSaleCount);
  const canCreateWorkCenter =
    hasProAccess || pointOfSaleCount === 0 || pointOfSaleAccess.devUnlimitedPdv;
  const forceFirstCenterAsPdv = !hasProAccess && !editingItem && pointOfSaleCount === 0;

  const defaultActiveOnCreate = true;

  const primaryPdvId = useMemo(() => {
    const pdvs = workCenters.filter(
      (wc) => wc.centerType === 'punto_de_venta' && !isSalaManagedWorkCenter(wc),
    );
    if (pdvs.length === 0) return null;
    const sorted = [...pdvs].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return a._id.localeCompare(b._id);
    });
    return sorted[0]._id;
  }, [workCenters]);

  const isPrimaryPdv = useCallback(
    (wc: WorkCenter) => wc._id === primaryPdvId,
    [primaryPdvId],
  );

  const existingPdvNamesForModal = useMemo(() => {
    const names = new Set<string>(deliveryPdvNames);
    for (const wc of workCenters) {
      if (editingItem?._id === wc._id) continue;
      if (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen') {
        const n = String(wc.name || '').trim();
        if (n) names.add(n);
      }
    }
    return Array.from(names);
  }, [deliveryPdvNames, workCenters, editingItem]);

  const existingPdvCodesForModal = useMemo(() => {
    const cur = editingItem ? String(deliveryPdvsByWorkCenter[editingItem._id]?.code || '').trim() : '';
    if (!cur) return deliveryPdvCodes;
    return deliveryPdvCodes.filter((c) => c !== cur);
  }, [deliveryPdvCodes, deliveryPdvsByWorkCenter, editingItem]);

  const editingPdvCode = editingItem
    ? String(deliveryPdvsByWorkCenter[editingItem._id]?.code || '').trim()
    : '';

  const newPdvQueryHandledRef = useRef(false);
  const horariosQueryHandledRef = useRef(false);
  const activationQueryHandledRef = useRef(false);
  const [openModalAtHorarios, setOpenModalAtHorarios] = useState(false);
  const { focus: activationFocus, clearFocus: clearActivationFocus, isFocused } = useActivationFocus();

  const requestCreateWorkCenter = useCallback(
    (forcePdv = false) => {
      setEditingItem(null);
      setForceCreatePdv(forcePdv);
      setShowModal(false);
      setShowProAccessModal(false);

      if (!canCreateWorkCenter) {
        setProAccessReason('pro');
        setShowProAccessModal(true);
        return;
      }
      const needsPdvSlot = forcePdv || usesRetailPdvFlow;
      if (needsPdvSlot && !pointOfSaleAccess.canCreatePointOfSale) {
        setProAccessReason(pointOfSaleAccess.needsPointOfSaleAddon ? 'pdv-extra' : 'pro');
        setShowProAccessModal(true);
        return;
      }
      setShowModal(true);
    },
    [
      canCreateWorkCenter,
      usesRetailPdvFlow,
      pointOfSaleAccess.canCreatePointOfSale,
      pointOfSaleAccess.needsPointOfSaleAddon,
    ],
  );

  useEffect(() => {
    if (searchParams.get('action') !== 'new-pdv') {
      newPdvQueryHandledRef.current = false;
      return;
    }
    if (loading || newPdvQueryHandledRef.current) return;
    newPdvQueryHandledRef.current = true;

    requestCreateWorkCenter(true);

    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [loading, searchParams, setSearchParams, requestCreateWorkCenter]);

  useEffect(() => {
    const wantsHorarios =
      searchParams.get('action') === 'horarios' || searchParams.get('panel') === 'horarios';
    if (!wantsHorarios) {
      horariosQueryHandledRef.current = false;
      return;
    }
    if (loading || horariosQueryHandledRef.current) return;
    horariosQueryHandledRef.current = true;

    const retailActive = workCenters.filter(
      (wc) => wc.active !== false && isRetailWorkCenterType(wc.centerType),
    );
    if (retailActive.length === 0) {
      requestCreateWorkCenter(true);
    } else {
      const target =
        retailActive.find((wc) => !hasValidBusinessHoursConfig(wc.openingHours)) ?? retailActive[0];
      setOpenModalAtHorarios(true);
      setEditingItem(target);
      setShowModal(true);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('action');
    next.delete('panel');
    setSearchParams(next, { replace: true });
  }, [loading, searchParams, setSearchParams, requestCreateWorkCenter, workCenters]);

  useEffect(() => {
    if (!activationFocus) {
      activationQueryHandledRef.current = false;
      return;
    }
    if (loading || activationQueryHandledRef.current) return;
    activationQueryHandledRef.current = true;

    if (activationFocus === 'create-store') {
      requestCreateWorkCenter(true);
      clearActivationFocus();
      return;
    }

    if (activationFocus === 'store-hours') {
      const retailActive = workCenters.filter(
        (wc) => wc.active !== false && isRetailWorkCenterType(wc.centerType),
      );
      if (retailActive.length === 0) {
        requestCreateWorkCenter(true);
      } else {
        const target =
          retailActive.find((wc) => !hasValidBusinessHoursConfig(wc.openingHours)) ?? retailActive[0];
        setOpenModalAtHorarios(true);
        setEditingItem(target);
        setShowModal(true);
      }
      clearActivationFocus();
      return;
    }
  }, [
    activationFocus,
    loading,
    workCenters,
    requestCreateWorkCenter,
    clearActivationFocus,
  ]);

  const goToProAccess = () => {
    if (dataUserId) {
      writeBillingSelection(dataUserId, {
        selectedPlanId: 'pro',
        billingMode: 'monthly',
        requestedAddon: proAccessReason === 'pdv-extra' ? 'extra_pdv' : null,
      });
    }
    setShowProAccessModal(false);
    setForceCreatePdv(false);
    navigate('/saas/settings/facturacion');
  };

  const handleSave = async (data: WorkCenterSaveData) => {
    const wcData = { ...data };
    if (!dataUserId || !user) {
      toast.error('No hay usuario autenticado para guardar este centro.');
      return;
    }
    const requestedCenterType: WorkCenterType = (pointOfSaleCount === 0 || forceCreatePdv)
      ? 'punto_de_venta'
      : wcData.centerType || 'punto_de_venta';
    if (!editingItem && !canCreateWorkCenter) {
      setProAccessReason('pro');
      setShowProAccessModal(true);
      toast.error('Necesitas PRO para crear otro centro de trabajo.');
      throw new Error('pro required');
    }
    if (!editingItem && requestedCenterType === 'punto_de_venta' && !pointOfSaleAccess.canCreatePointOfSale) {
      setProAccessReason(pointOfSaleAccess.needsPointOfSaleAddon ? 'pdv-extra' : 'pro');
      setShowProAccessModal(true);
      toast.error(pointOfSaleAccess.needsPointOfSaleAddon
        ? 'Tu plan PRO incluye 2 PDV. Añade un PDV extra para crear otro.'
        : 'Necesitas PRO para crear un segundo PDV.');
      throw new Error('pdv limit required');
    }
    saveInProgressRef.current = true;
    try {
      const { pdvCode: pdvCodeToSave, ...wcPayload } = wcData;

      if (editingItem) {
        const businessIdForWc = resolveBusinessScopeId(currentBusiness ?? null);
        const updated = await updateWorkCenter({
          ...editingItem,
          ...wcPayload,
          businessId: businessIdForWc || editingItem.businessId,
        } as WorkCenter);
        if (shouldSyncRetailPdv(usesRetailPdvFlow, updated.centerType)) {
          const displayName = sanitizeStoreDisplayName(String(wcData.name || ''));
          const normCode = pdvCodeToSave ? sanitizePdvCodeInput(pdvCodeToSave) : '';
          const linkedPdv = deliveryPdvsByWorkCenter[updated._id];
          const addr = resolveWorkCenterPdvAddress(updated);

          let savedPdv: PointOfSale | null = null;
          if (linkedPdv?._id) {
            const codeToPersist = normCode || String(linkedPdv.code || '').trim();
            savedPdv = await updatePointOfSaleRequest(dataUserId, {
              ...linkedPdv,
              name: displayName,
              code: codeToPersist,
              address:
                (addr && addr.trim().length >= 5 ? addr : linkedPdv.address) || linkedPdv.address || addr,
              workCenterId: updated._id,
              active: updated.active !== false,
            });
          } else {
            savedPdv = await ensureDeliveryPdvForWorkCenter(dataUserId, updated, {
              business: currentBusiness ?? null,
              pdvCode: normCode || undefined,
              pdvName: displayName,
            });
          }
          if (!savedPdv) {
            toast.error(retailCopy.missingPdvEdit);
            throw new Error('pdv missing');
          }
          const [withTablet] = await ensureTabletCodesForPointsOfSale(dataUserId, [savedPdv]);
          savedPdv = withTablet ?? savedPdv;
          setDeliveryPdvsByWorkCenter((prev) => ({
            ...prev,
            [updated._id]: {
              _id: savedPdv!._id,
              _rev: savedPdv!._rev,
              code: savedPdv!.code,
              name: String(savedPdv!.name || ''),
              address: savedPdv!.address,
              workCenterId: updated._id,
              terminalCode: savedPdv!.terminalCode,
            },
          }));
          if (savedPdv && businessIdForWc) {
            persistRetailScopeAfterStoreSave(
              businessIdForWc,
              updated,
              savedPdv,
              { business: currentBusiness, businesses, accountBusinessCount },
            );
          }
          notifyDeliveryWorkCentersChanged(businessIdForWc);
          notifyDeliveryActiveStoreChanged();
        }
        setWorkCenters(prev => prev.map(wc => wc._id === updated._id ? updated : wc).sort((a, b) => a.name.localeCompare(b.name, 'es')));
        notifyWorkCentersChanged();
        notifyDeliveryWorkCentersChanged(businessIdForWc);
        if (updated.ownership === 'alquiler' && updated.contract?.monthlyPrice) {
          void ensureRentFinanceFromWorkCenter(dataUserId, updated, {
            businessId: businessIdForWc || '',
            businessName: currentBusiness?.name || '',
          });
        }
        setShowModal(false);
        setEditingItem(null);
        setForceCreatePdv(false);
        toast.success(`"${updated.name}" actualizado`);
        void loadData();
      } else {
        const businessIdForWc = resolveBusinessScopeId(currentBusiness ?? null);
        if (usesRetailPdvFlow && !businessIdForWc) {
          toast.error(retailCopy.missingBusiness);
          throw new Error('missing business');
        }
        const newNameNorm = sanitizeStoreDisplayName(String(wcData.name || '')).toLowerCase();
        if (
          newNameNorm &&
          (requestedCenterType === 'punto_de_venta' || requestedCenterType === 'almacen')
        ) {
          const existingDup = workCenters.find((wc) => {
            if (wc.deletedAt) return false;
            if (wc.centerType !== 'punto_de_venta' && wc.centerType !== 'almacen') return false;
            const bid = readWorkCenterBusinessId(wc);
            if (businessIdForWc) {
              if (bid && bid !== businessIdForWc) return false;
              if (!bid) return false;
            }
            return sanitizeStoreDisplayName(wc.name).toLowerCase() === newNameNorm;
          });
          if (existingDup) {
            toast.error(retailCopy.duplicateName(existingDup.name));
            throw new Error('duplicate store name');
          }
        }
        const created = await createWorkCenter(dataUserId, {
          name: wcData.name!,
          centerType: requestedCenterType,
          customTypeName: requestedCenterType === 'custom' ? wcData.customTypeName : undefined,
          ownership: wcData.ownership || 'propiedad',
          contract: wcData.contract,
          purchasePrice: wcData.purchasePrice,
          purchaseDate: wcData.purchaseDate,
          cadastralReference: wcData.cadastralReference,
          active: wcData.active !== false,
          address: wcData.address,
          city: wcData.city,
          postalCode: wcData.postalCode,
          province: wcData.province,
          phone: wcData.phone,
          email: wcData.email,
          expectedStaffCount: wcData.expectedStaffCount ?? 3,
          squareMeters: wcData.squareMeters,
          notes: wcData.notes,
          openingHours: wcData.openingHours,
          businessId: businessIdForWc || undefined,
        });
        let createdPdv: Awaited<ReturnType<typeof ensureDeliveryPdvForWorkCenter>> = null;
        if (shouldSyncRetailPdv(usesRetailPdvFlow, requestedCenterType)) {
          const normCode = pdvCodeToSave ? sanitizePdvCodeInput(pdvCodeToSave) : '';
          createdPdv = await ensureDeliveryPdvForWorkCenter(dataUserId, created, {
            business: currentBusiness ?? null,
            pdvCode: normCode || undefined,
            pdvName: sanitizeStoreDisplayName(String(wcData.name || '')),
          });
          if (!createdPdv) {
            setWorkCenters((prev) =>
              [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'es')),
            );
            notifyWorkCentersChanged();
            clearAllRetailScopeCaches(businessIdForWc);
            notifyDeliveryWorkCentersChanged(businessIdForWc);
            setShowModal(false);
            setEditingItem(null);
            setForceCreatePdv(false);
            toast.error(retailCopy.partialSaveWarning);
            void loadData();
            return;
          }
          const [createdWithTablet] = await ensureTabletCodesForPointsOfSale(dataUserId, [createdPdv]);
          createdPdv = createdWithTablet ?? createdPdv;
          if (isRestaurant || isDelivery) {
            await bootstrapRetailStoreAfterCreate(user, currentBusiness, {
              workCenter: created,
              pointOfSale: createdPdv,
              storeName: String(wcData.name || ''),
            });
          } else {
            await bootstrapCompraventaStoreAfterCreate(user, currentBusiness, {
              workCenter: created,
              pointOfSale: createdPdv,
            });
          }
          selectDeliveryPointOfSale(currentBusiness, dataUserId, createdPdv._id);
          activeStore.setActiveSalesPoint(createdPdv._id);
          persistRetailScopeAfterStoreSave(businessIdForWc, created, createdPdv, {
            business: currentBusiness,
            businesses,
            accountBusinessCount,
          });
        }
        setWorkCenters(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        if (createdPdv) {
          const code = String(createdPdv.code || '').trim();
          const name = String(createdPdv.name || '').trim();
          if (code) setDeliveryPdvCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
          if (name) setDeliveryPdvNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
          setDeliveryPdvsByWorkCenter((prev) => ({
            ...prev,
            [created._id]: {
              _id: createdPdv._id,
              _rev: createdPdv._rev,
              code: createdPdv.code,
              name,
              address: createdPdv.address,
              workCenterId: created._id,
              terminalCode: createdPdv.terminalCode,
            },
          }));
        }
        notifyWorkCentersChanged();
        notifyDeliveryWorkCentersChanged(businessIdForWc);
        if (created.ownership === 'alquiler' && created.contract?.monthlyPrice) {
          void ensureRentFinanceFromWorkCenter(dataUserId, created, {
            businessId: businessIdForWc || '',
            businessName: currentBusiness?.name || '',
          });
        }
        setShowModal(false);
        setEditingItem(null);
        setForceCreatePdv(false);
        toast.success(
          createdPdv
            ? `"${created.name}" y PDV ${pointOfSaleDisplayLabel(createdPdv)} guardados`
            : `"${created.name}" creada`,
        );
        await loadData();
        if (usesRetailPdvFlow) await activeStore.refresh();
        if (isRestaurant && createdPdv) {
          writeSalaSetupPending(businessIdForWc, createdPdv._id);
          activeStore.setActiveSalesPoint(createdPdv._id);
          await activeStore.refresh();
          navigate(`/saas/sala/setup?pdv=${encodeURIComponent(createdPdv._id)}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      toast.error(msg && msg !== 'save failed' && msg !== 'pro required' && msg !== 'pdv limit required' ? msg : 'Error al guardar');
      throw err instanceof Error ? err : new Error('save failed');
    } finally {
      saveInProgressRef.current = false;
    }
  };

  const handleToggleActive = async (wc: WorkCenter, e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!dataUserId) return;
    if (wc.active !== false && isPrimaryPdv(wc)) {
      toast.error('No se puede desactivar el PDV principal. Necesitas al menos un PDV activo para operar.');
      return;
    }
    try {
      const updated = await updateWorkCenter({ ...wc, active: wc.active === false });
      let linkedPdvId: string | null = null;
      if (shouldSyncRetailPdv(usesRetailPdvFlow, updated.centerType)) {
        const pdv = await ensureDeliveryPdvForWorkCenter(dataUserId, updated, {
          business: currentBusiness ?? null,
        });
        linkedPdvId = pdv?._id || null;
        await loadData();
      } else {
        setWorkCenters((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      }
      notifyWorkCentersChanged();
      clearAllRetailScopeCaches(resolveBusinessScopeId(currentBusiness));
      notifyDeliveryWorkCentersChanged(resolveBusinessScopeId(currentBusiness));
      notifyDeliveryActiveStoreChanged();
      await loadData();
      if (usesRetailPdvFlow && updated.active !== false && linkedPdvId) {
        selectDeliveryPointOfSale(currentBusiness, dataUserId, linkedPdvId);
      }
      toast.success(`"${updated.name}" marcada como ${updated.active !== false ? 'activa' : 'inactiva'}`);
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const openEditWorkCenter = (wc: WorkCenter) => {
    setEditingItem(wc);
    setShowModal(true);
  };

  const openDeleteDialog = (wc: WorkCenter) => {
    const legacySala = isSalaManagedWorkCenter(wc);
    if (isPrimaryPdv(wc) && !legacySala) {
      toast.error('El PDV principal de tu cuenta no se puede eliminar.');
      return;
    }
    setDeleteTarget(wc);
    setDeleteConfirmName('');
    setDeleteAcknowledge(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !dataUserId) return;
    const legacySala = isSalaManagedWorkCenter(deleteTarget);
    if (isPrimaryPdv(deleteTarget) && !legacySala) {
      toast.error('El PDV principal de tu cuenta no se puede eliminar.');
      setDeleteTarget(null);
      return;
    }
    if (deleteConfirmName.trim().toLowerCase() !== deleteTarget.name.trim().toLowerCase()) {
      toast.error(`Escribe el nombre exacto (${deleteTarget.name}) para continuar.`);
      return;
    }
    if (!deleteAcknowledge) {
      toast.error('Debes confirmar el borrado definitivo.');
      return;
    }
    try {
      const linkedPdv = deliveryPdvsByWorkCenter[deleteTarget._id];
      if (linkedPdv?._id) {
        await deletePointOfSaleRequest(dataUserId, linkedPdv._id).catch(() => undefined);
      }
      await deleteWorkCenter(deleteTarget._id);
      setWorkCenters((prev) => prev.filter((s) => s._id !== deleteTarget._id));
      notifyWorkCentersChanged();
      clearAllRetailScopeCaches(businessScopeId);
      notifyDeliveryWorkCentersChanged(businessScopeId);
      notifyDeliveryActiveStoreChanged();
      await activeStore.refresh();
      await loadData();
      toast.success(`"${deleteTarget.name}" eliminado`);
      setDeleteTarget(null);
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const filtered = useMemo(() => {
    return workCenters.filter(wc => {
      if (filterActive === 'active' && !wc.active) return false;
      if (filterActive === 'inactive' && wc.active) return false;
      if (filterType !== 'all' && wc.centerType !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          wc.name.toLowerCase().includes(q) ||
          wc.address?.toLowerCase().includes(q) ||
          wc.city?.toLowerCase().includes(q) ||
          wc.email?.toLowerCase().includes(q) ||
          wc.notes?.toLowerCase().includes(q) ||
          wc.customTypeName?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [workCenters, search, filterActive, filterType]);

  const kpis = useMemo(() => {
    const byType = { oficina: 0, punto_de_venta: 0, almacen: 0, custom: 0 };
    workCenters.forEach(wc => { byType[wc.centerType] = (byType[wc.centerType] || 0) + 1; });
    const owned = workCenters.filter(w => w.ownership === 'propiedad').length;
    const rented = workCenters.filter(w => w.ownership === 'alquiler').length;
    return { total: workCenters.length, active: workCenters.filter(s => s.active).length, inactive: workCenters.filter(s => !s.active).length, byType, owned, rented };
  }, [workCenters]);

  const getTypeLabel = (wc: WorkCenter) => wc.centerType === 'custom' ? (wc.customTypeName || 'Otro') : WORK_CENTER_TYPE_SHORT[wc.centerType];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
          <div className="text-indigo-600 mb-2"><Building2 className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">{kpis.total}</div>
          <div className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">Total centros</div>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
          <div className="text-green-600 mb-2"><ToggleRight className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-green-900 dark:text-green-200">{kpis.active}</div>
          <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Activos</div>
        </div>
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl">
          <div className="text-emerald-600 mb-2"><Home className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-200">{kpis.owned}</div>
          <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Propiedad</div>
        </div>
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl">
          <div className="text-orange-600 mb-2"><FileText className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-orange-900 dark:text-orange-200">{kpis.rented}</div>
          <div className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">Alquiler</div>
        </div>
      </div>

      {orphanRetailCount > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Hemos encontrado {orphanRetailCount === 1 ? retailCopy.orphanSingular : retailCopy.orphanPlural(orphanRetailCount)} sin
            asignar a esta empresa. Ábrela, revisa la dirección (mín. 5 caracteres) y pulsa{' '}
            <strong>Guardar</strong> para activar el PDV de caja.
          </p>
        </div>
      )}

      {/* Desglose por tipo */}
      {kpis.total > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            { type: 'oficina' as WorkCenterType, count: kpis.byType.oficina },
            { type: 'punto_de_venta' as WorkCenterType, count: kpis.byType.punto_de_venta },
            { type: 'almacen' as WorkCenterType, count: kpis.byType.almacen },
            { type: 'custom' as WorkCenterType, count: kpis.byType.custom },
          ]).filter(t => t.count > 0).map(({ type: ct, count }) => (
            <div key={ct} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${CENTER_TYPE_COLORS[ct]}`}>
              {CENTER_TYPE_ICONS[ct]}
              <span>{count} {WORK_CENTER_TYPE_SHORT[ct]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filtros y acciones */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-52"
              placeholder="Buscar centro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'active', 'inactive'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFilterActive(status);
                }}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border-2 transition-colors ${
                  filterActive === status
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                }`}
              >
                {status === 'all' ? 'Todos' : status === 'active' ? 'Activos' : 'Inactivos'}
              </button>
            ))}
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as WorkCenterType | 'all')}
            className="px-3 py-2 text-xs font-semibold rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 outline-none"
          >
            <option value="all">Todos los tipos</option>
            {(Object.keys(WORK_CENTER_TYPE_SHORT) as WorkCenterType[]).map(ct => (
              <option key={ct} value={ct}>{WORK_CENTER_TYPE_SHORT[ct]}</option>
            ))}
          </select>
        </div>
        <ActivationFieldWrap fieldKey="create-store" activeKey={isFocused('create-store') ? 'create-store' : activationFocus}>
          <AddButtonDropdown
            label={usesRetailPdvFlow ? retailCopy.createCta : 'Nuevo centro'}
            onQuickAdd={() => requestCreateWorkCenter(usesRetailPdvFlow)}
            quickAddLabel={usesRetailPdvFlow ? retailCopy.quickAdd : 'Alta rápida'}
            quickAddDesc={usesRetailPdvFlow ? retailCopy.quickAddDesc : 'Formulario de centro de trabajo'}
          />
        </ActivationFieldWrap>
      </div>

      {/* Lista de centros */}
      {usesRetailPdvFlow && !businessScopeId ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-800">
          <Building2 className="w-12 h-12 text-amber-300 mb-3" />
          <p className="font-semibold text-gray-900 dark:text-gray-100">Selecciona una empresa</p>
          <p className="text-sm mt-1 text-center max-w-md">
            {usesRetailPdvFlow
              ? retailCopy.selectBusinessHint
              : 'Selecciona una empresa arriba para ver sus centros de trabajo.'}
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
          Cargando centros de trabajo...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Building2 className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-semibold">
            {workCenters.length === 0 ? 'No hay centros de trabajo configurados' : 'Sin resultados'}
          </p>
          <p className="text-sm mt-1 text-center max-w-md">
            {workCenters.length === 0
              ? usesRetailPdvFlow
                ? currentBusiness?.name
                  ? retailCopy.emptyWithBusiness(currentBusiness.name)
                  : retailCopy.emptyNoBusiness
                : 'Crea el primer centro de trabajo: oficina, punto de venta, almacén...'
              : 'Prueba con otros términos de búsqueda'}
          </p>
          {workCenters.length === 0 && (
            <ActivationFieldWrap fieldKey="create-store" activeKey={activationFocus}>
              <button
                onClick={() => requestCreateWorkCenter(usesRetailPdvFlow)}
                className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium"
              >
                {usesRetailPdvFlow ? retailCopy.firstCta : '+ Nuevo centro de trabajo'}
              </button>
            </ActivationFieldWrap>
          )}
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-activation-field="pdv-list"
        >
          {filtered.map(wc => {
            const primary = isPrimaryPdv(wc);
            const openEdit = () => openEditWorkCenter(wc);

            return (
            <article
              key={wc._id}
              role="button"
              tabIndex={0}
              onClick={openEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openEdit();
                }
              }}
              className={`cursor-pointer bg-white text-left dark:bg-gray-800 border-2 rounded-xl p-5 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-gray-100 ${
                primary
                  ? 'border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-100 dark:ring-indigo-900/40'
                  : wc.active !== false
                    ? 'border-gray-200 dark:border-gray-700'
                    : 'border-dashed border-gray-300 dark:border-gray-600 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${CENTER_TYPE_COLORS[wc.centerType]}`}>
                    {CENTER_TYPE_ICONS[wc.centerType]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{wc.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${CENTER_TYPE_COLORS[wc.centerType]}`}>
                        {getTypeLabel(wc)}
                      </span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${wc.ownership === 'propiedad' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                        {OWNERSHIP_LABELS[wc.ownership]}
                      </span>
                      {primary && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" title="PDV principal de la cuenta, no se puede eliminar">
                          <Lock className="w-2.5 h-2.5" />
                          Principal
                        </span>
                      )}
                      {usesRetailPdvFlow && deliveryPdvsByWorkCenter[wc._id] && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" title="PDV enlazado">
                          {pointOfSaleDisplayLabel(deliveryPdvsByWorkCenter[wc._id])}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => void handleToggleActive(wc, e)}
                  disabled={primary && wc.active !== false}
                  className={`flex-shrink-0 ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    primary && wc.active !== false
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 opacity-70 cursor-not-allowed'
                      : wc.active !== false
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 cursor-pointer'
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200 hover:bg-gray-300 cursor-pointer'
                  }`}
                  title={
                    primary && wc.active !== false
                      ? 'El PDV principal debe permanecer activo'
                      : wc.active !== false
                        ? 'Clic para desactivar'
                        : 'Clic para activar'
                  }
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${wc.active !== false ? 'bg-green-500' : 'bg-gray-500'}`} />
                  {wc.active !== false ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              <div className="space-y-1.5">
                {wc.address && (
                  <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{[wc.address, wc.city, wc.province].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {wc.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{wc.phone}</span>
                  </div>
                )}
                {wc.centerType === 'punto_de_venta' && usesRetailPdvFlow && !deliveryPdvsByWorkCenter[wc._id] && (
                  <p className="text-[10px] leading-snug text-amber-800 dark:text-amber-200 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 px-2.5 py-2">
                    {retailCopy.missingPdvEdit}
                  </p>
                )}
                {wc.centerType === 'punto_de_venta' && deliveryPdvsByWorkCenter[wc._id]?.terminalCode && (
                  <div className="rounded-lg border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/30 px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                          Código para activar tablet
                        </p>
                        <p className="font-mono text-sm font-bold tracking-widest text-indigo-900 dark:text-indigo-100">
                          {deliveryPdvsByWorkCenter[wc._id]?.terminalCode}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="Copiar código"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyTerminalCode(String(deliveryPdvsByWorkCenter[wc._id]?.terminalCode || ''));
                          }}
                          className="p-1.5 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Regenerar código"
                          disabled={regeneratingTerminal === wc._id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRegenerateTerminalCode(wc);
                          }}
                          className="p-1.5 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${regeneratingTerminal === wc._id ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] leading-snug text-indigo-800/90 dark:text-indigo-200/90">
                      La activación es en la tablet: Acceso → TPV en tablet → introduce este código.
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyTabletActivationUrl();
                      }}
                      className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline inline-flex items-center gap-1"
                    >
                      <Monitor className="w-3 h-3" />
                      Copiar enlace para la tablet
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </button>
                  </div>
                )}
                {wc.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{wc.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>{wc.expectedStaffCount ?? 3} trabajador{(wc.expectedStaffCount ?? 3) !== 1 ? 'es' : ''}</span>
                </div>
                {wc.ownership === 'alquiler' && wc.contract?.monthlyPrice && (
                  <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
                    <Euro className="w-3.5 h-3.5 shrink-0" />
                    <span>{wc.contract.monthlyPrice.toLocaleString('es-ES')}€/mes</span>
                    {wc.contract.endDate && <span className="text-gray-400">· Hasta {new Date(wc.contract.endDate).toLocaleDateString('es-ES')}</span>}
                  </div>
                )}
                {wc.ownership === 'alquiler' && wc.contract?.landlord && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="w-3.5 h-3.5 shrink-0 text-center font-bold text-[10px]">👤</span>
                    <span>Arrendador: {wc.contract.landlord}</span>
                  </div>
                )}
                {wc.ownership === 'propiedad' && wc.purchasePrice && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <Euro className="w-3.5 h-3.5 shrink-0" />
                    <span>Valor: {wc.purchasePrice.toLocaleString('es-ES')}€</span>
                    {wc.purchaseDate && <span className="text-gray-400">· Compra {new Date(wc.purchaseDate).toLocaleDateString('es-ES')}</span>}
                  </div>
                )}
                {wc.squareMeters && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="w-3.5 h-3.5 shrink-0 text-center font-bold text-[10px]">📐</span>
                    <span>{wc.squareMeters} m²</span>
                  </div>
                )}
              </div>

              {wc.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 line-clamp-2">{wc.notes}</p>}

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit();
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </button>
                {primary ? (
                  <span
                    className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 cursor-not-allowed"
                    title="El PDV principal de la cuenta no se puede eliminar"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Lock className="w-4 h-4" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteDialog(wc);
                    }}
                    className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>
            </article>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
          <span>{filtered.length} de {workCenters.length} centro{workCenters.length !== 1 ? 's' : ''} de trabajo</span>
          {search && <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">Limpiar búsqueda</button>}
        </div>
      )}

      <WorkCenterModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingItem(null);
          setForceCreatePdv(false);
          setOpenModalAtHorarios(false);
        }}
        onSave={handleSave}
        editItem={editingItem}
        forcePointOfSale={
          forceFirstCenterAsPdv || forceCreatePdv || (usesRetailPdvFlow && !editingItem)
        }
        includeOpeningHours={
          isDelivery &&
          (forceFirstCenterAsPdv ||
            forceCreatePdv ||
            !editingItem ||
            isRetailWorkCenterType(editingItem.centerType))
        }
        legacyUserId={dataUserId || undefined}
        initialWizardStep={openModalAtHorarios ? 'horarios' : undefined}
        existingPdvCodes={existingPdvCodesForModal}
        existingPdvNames={existingPdvNamesForModal}
        defaultActiveOnCreate={defaultActiveOnCreate}
        enablePdvCodeEdit={usesRetailPdvFlow}
        editPdvCode={editingPdvCode}
        pdvWizardVariant={pdvWizardVariant}
      />

      {showProAccessModal && !showModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => { setShowProAccessModal(false); setForceCreatePdv(false); }}>
          <div className="w-full max-w-lg rounded-2xl border-2 border-violet-200 bg-white p-5 shadow-2xl dark:border-violet-900 dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-violet-100 p-2 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {proAccessReason === 'pdv-extra' ? 'Añadir otro PDV requiere ampliación' : 'Multi-centro requiere PRO'}
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {proAccessReason === 'pdv-extra'
                    ? `Tu plan PRO incluye ${pointOfSaleAccess.includedPointOfSaleLimit} puntos de venta. Para crear otro PDV contrata la ampliación (${formatAddonPriceShort('extra_pdv')}).`
                    : `El plan ${pointOfSaleAccess.planLabel} incluye ${pointOfSaleAccess.includedPointOfSaleLimit} centro de trabajo. Tanto Básico como Normal solo permiten 1 PDV; para crear otro local, almacén u oficina necesitas activar PRO.`}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-200">
              Ya tienes {pointOfSaleCount} PDV configurado{pointOfSaleCount !== 1 ? 's' : ''}. Tu plan {pointOfSaleAccess.planLabel} incluye {pointOfSaleAccess.includedPointOfSaleLimit}.
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => { setShowProAccessModal(false); setForceCreatePdv(false); }}
                className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={goToProAccess}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
              >
                {proAccessReason === 'pdv-extra' ? `Contratar ampliación (${formatAddonPriceShort('extra_pdv')})` : 'Solicitar PRO'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-lg rounded-2xl border-2 border-red-200 bg-white p-5 shadow-2xl dark:border-red-900 dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-100 p-2 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Eliminar establecimiento</h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Acción irreversible. Se ocultará para toda la operativa.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                Nombre: <span className="font-semibold">{deleteTarget.name}</span>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Escribe el nombre exacto para confirmar
              </label>
              <input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                placeholder={deleteTarget.name}
              />
              <label className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={deleteAcknowledge} onChange={(e) => setDeleteAcknowledge(e.target.checked)} />
                Confirmo que quiero eliminar este establecimiento y entiendo que la acción no se puede deshacer.
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteConfirmName.trim().toLowerCase() !== deleteTarget.name.trim().toLowerCase() || !deleteAcknowledge}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-white ${
                  deleteConfirmName.trim().toLowerCase() === deleteTarget.name.trim().toLowerCase() && deleteAcknowledge
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-red-300 cursor-not-allowed'
                }`}
              >
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
