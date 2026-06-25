import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listBrandsRequest } from '../lib/brandApi';
import {
  buildDeliveryActivationStepDefs,
  EMPTY_DELIVERY_ACTIVATION_FLAGS,
  type DeliveryActivationFlags,
} from '../lib/deliveryActivationChecklist';
import { listCatalogItemsRequest } from '../lib/deliveryApi';
import {
  DELIVERY_BRANDS_CHANGED,
  DELIVERY_CATALOG_CHANGED,
  loadDeliveryStores,
  snapshotDeliveryStoreActivation,
  isDeliveryBusinessType,
} from '../lib/deliverySetup';
import { isBrandSetupComplete, isDefaultCommercialBrand } from '../lib/brandUtils';
import { anyActiveRetailStoreHasOpeningHours } from '../lib/businessHoursUtils';
import {
  activationInProgressKey,
  isActivationChecklistDismissed,
  isActivationChecklistForceVisible,
  markOnboardingTourCompleted,
  setActivationChecklistDismissed,
  setActivationChecklistForceVisible,
  setOnboardingTourActive,
} from '../lib/onboardingLocalKeys';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import { useApp } from './AppContext';
import { useAuth } from './AuthContext';
import { useBusinessOptional } from './BusinessContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'in_progress' | 'completed';

export interface OnboardingSubStep {
  id: string;
  label: string;
  completed: boolean;
}

export interface OnboardingStep {
  id: string;
  number: number;
  label: string;
  description: string;
  route: string;
  icon: string;
  status: StepStatus;
  subSteps: OnboardingSubStep[];
  completedSubSteps: number;
  totalSubSteps: number;
  /** Delivery: paso bloqueado hasta completar prerrequisitos (p. ej. PDV). */
  locked?: boolean;
  lockedReason?: string;
  unlockRoute?: string;
}

interface ActivationChecklistContextType {
  steps: OnboardingStep[];
  completionPct: number;
  completedSteps: number;
  totalSteps: number;
  isVisible: boolean;
  isDismissed: boolean;
  currentStepIndex: number;
  dismiss: () => void;
  restore: () => void;
  loadSampleData: () => void;
  isLoadingSample: boolean;
}

const ActivationChecklistContext = createContext<ActivationChecklistContextType | undefined>(undefined);

function resolveAccountUserId(user: { user_id?: string; id?: string } | null | undefined): string {
  return String(user?.user_id || user?.id || '').trim();
}

type StepDef = Omit<OnboardingStep, 'status' | 'completedSubSteps' | 'totalSubSteps'>;

function finalizeStepDefs(
  defs: StepDef[],
  activeStepKey: string | null,
): OnboardingStep[] {
  const firstActionableId =
    defs.find((d) => {
      const completedSub = d.subSteps.filter((s) => s.completed).length;
      const allDone = d.subSteps.length > 0 && completedSub === d.subSteps.length;
      return !allDone && !d.locked;
    })?.id ?? null;

  return defs.map((def) => {
    const completedSub = def.subSteps.filter((s) => s.completed).length;
    const allDone = def.subSteps.length > 0 && completedSub === def.subSteps.length;
    const inProgress = completedSub > 0 && !allDone;

    let status: StepStatus = 'pending';
    if (allDone) {
      status = 'completed';
    } else if (def.locked) {
      status = 'pending';
    } else if (inProgress || activeStepKey === def.id || firstActionableId === def.id) {
      status = 'in_progress';
    }

    return {
      ...def,
      status,
      completedSubSteps: completedSub,
      totalSubSteps: def.subSteps.length,
    };
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ActivationChecklistProvider({ children }: { children: ReactNode }) {
  const { vehicles, clients, clientsTotalCount, leads, sales, documents } = useApp();
  const { user, listUsers } = useAuth();
  const currentBusiness = useBusinessOptional()?.currentBusiness ?? null;
  const businessesCount = useBusinessOptional()?.businesses?.length ?? 0;
  const [teamCount, setTeamCount] = useState(0);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [deliveryFlags, setDeliveryFlags] = useState<DeliveryActivationFlags | null>(null);
  const deliveryFlagsRef = useRef<DeliveryActivationFlags | null>(null);
  const accountUserId = resolveAccountUserId(user);
  const businessId = currentBusiness?.business_id || '';
  const bizName = currentBusiness?.name ?? '';
  const bizTaxId = currentBusiness?.taxId ?? '';
  const bizAddress = currentBusiness?.address ?? '';
  const bizPhone = currentBusiness?.phone ?? '';
  const [isDismissed, setIsDismissed] = useState(false);
  const [forceVisible, setForceVisible] = useState(false);

  useEffect(() => {
    setIsDismissed(
      accountUserId && businessId
        ? isActivationChecklistDismissed(accountUserId, businessId)
        : false,
    );
    setForceVisible(
      accountUserId && businessId
        ? isActivationChecklistForceVisible(accountUserId, businessId)
        : false,
    );
  }, [accountUserId, businessId]);

  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);

  useEffect(() => {
    listUsers()
      .then(members => setTeamCount(members.length))
      .catch(() => setTeamCount(0));
  }, [listUsers]);

  useEffect(() => {
    setDeliveryFlags(null);
    deliveryFlagsRef.current = null;
  }, [businessId]);

  useEffect(() => {
    if (!isDelivery || !dataUserId) {
      setDeliveryFlags(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const [storeState, brands, catalog] = await Promise.all([
          loadDeliveryStores(user, currentBusiness, {
            includeInactivePdvs: true,
            accountBusinessCount: businessesCount,
          }),
          businessId ? listBrandsRequest(businessId).catch(() => []) : Promise.resolve([]),
          listCatalogItemsRequest(dataUserId, 'catalog').catch(() => []),
        ]);

        if (cancelled) return;

        const { hasActiveRetailStore, hasActivePdv, retailStores } =
          snapshotDeliveryStoreActivation(storeState);

        const brandIds = new Set(brands.map((b) => String(b._id || '').trim()).filter(Boolean));
        const catalogForBusiness = catalog.filter((item) => {
          const ids = (item.brandIds ?? []).map((id) => String(id).trim()).filter(Boolean);
          if (ids.length === 0) {
            return Boolean(item.name?.trim()) && brandIds.size > 0;
          }
          return ids.some((id) => brandIds.has(id));
        });
        const priced = catalogForBusiness.filter((item) => Number(item.unitPrice ?? 0) > 0);

        const primaryBrand =
          brands.find((b) => isDefaultCommercialBrand(b)) ??
          brands.find((b) => b.active !== false) ??
          brands[0] ??
          null;
        const setupCtx = { isDelivery: true, retailStoreCount: retailStores.length };
        const brandReady = primaryBrand
          ? isBrandSetupComplete(primaryBrand, setupCtx)
          : false;

        const nextFlags: DeliveryActivationFlags = {
          hasCompanyName: Boolean(bizName.trim()),
          hasTaxData: Boolean(bizTaxId.trim()),
          hasAddress: Boolean(bizAddress.trim()),
          hasPhone: Boolean(bizPhone.trim()),
          hasActiveRetailStore,
          hasActivePdv,
          brandSetupComplete: brandReady,
          hasCatalogProduct: catalogForBusiness.length > 0,
          hasPricedProduct: priced.length > 0,
          hasBusinessHours: anyActiveRetailStoreHasOpeningHours(retailStores),
        };
        deliveryFlagsRef.current = nextFlags;
        setDeliveryFlags(nextFlags);
      } catch {
        if (!cancelled && !deliveryFlagsRef.current) {
          setDeliveryFlags(EMPTY_DELIVERY_ACTIVATION_FLAGS);
        }
      }
    };

    void load();
    const scheduleLoad = () => {
      void load();
    };
    const onBrandsChanged = () => {
      void load();
    };
    window.addEventListener('work-centers:changed', scheduleLoad);
    window.addEventListener(DELIVERY_CATALOG_CHANGED, scheduleLoad);
    window.addEventListener(DELIVERY_BRANDS_CHANGED, onBrandsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('work-centers:changed', scheduleLoad);
      window.removeEventListener(DELIVERY_CATALOG_CHANGED, scheduleLoad);
      window.removeEventListener(DELIVERY_BRANDS_CHANGED, onBrandsChanged);
    };
  }, [isDelivery, dataUserId, businessId, bizName, bizTaxId, bizAddress, bizPhone, user, currentBusiness, businessesCount]);

  const biz = currentBusiness;

  // Primitive flags for stable useMemo dependencies
  const hasCompanyName = Boolean(biz?.name && biz.name.trim().length > 0);
  const hasTaxData = Boolean(biz?.taxId && biz.taxId.trim().length > 0);
  const hasAddress = Boolean(biz?.address && biz.address.trim().length > 0);
  const hasBranches = Boolean(biz?.branches && biz.branches.length > 0);
  const hasPhone = Boolean(biz?.phone && biz.phone.trim().length > 0);
  const hasClients = clientsTotalCount > 0 || clients.length > 0;
  const hasLeads = leads.length > 0;
  const hasMultipleClients = clientsTotalCount >= 3 || clients.length >= 3;
  const hasProducts = vehicles.length > 0;
  const hasMultipleProducts = vehicles.length >= 3;
  const hasProductWithPrice = vehicles.some(v => (v.salePrice ?? 0) > 0);
  const hasStockWithCost = vehicles.some(v => v.purchasePrice > 0);
  const hasStockWithLocation = vehicles.some(v => Boolean(v.location || v.workCenterId));
  const hasTeam = teamCount > 1;
  const hasDocuments = documents.length > 0;
  const hasSales = sales.length > 0;

  const steps: OnboardingStep[] = useMemo(() => {
    let activeStepKey: string | null = null;
    try {
      activeStepKey =
        accountUserId && businessId
          ? localStorage.getItem(activationInProgressKey(accountUserId, businessId))
          : null;
    } catch { /* noop */ }

    if (isDelivery) {
      const flags = deliveryFlags ?? deliveryFlagsRef.current;
      if (!flags) return [];
      return finalizeStepDefs(buildDeliveryActivationStepDefs(flags), activeStepKey);
    }

    const defs: StepDef[] = [
      { id: 'configure_business', number: 1, label: 'Configura tu negocio', description: 'Completa la información básica de tu empresa para poder operar', route: '/saas/configuracion', icon: 'building', subSteps: [
        { id: 'company_name', label: 'Nombre comercial', completed: hasCompanyName },
        { id: 'tax_data', label: 'Datos fiscales (CIF/NIF)', completed: hasTaxData },
        { id: 'address', label: 'Dirección / ubicación', completed: hasAddress },
        { id: 'contact', label: 'Teléfono de contacto', completed: hasPhone },
        { id: 'branches', label: 'Sedes o centros de trabajo', completed: hasBranches },
      ] },
      { id: 'upload_clients', number: 2, label: 'Sube tus clientes', description: 'Importa o crea tus clientes para empezar a trabajar', route: '/saas/clients', icon: 'users', subSteps: [
        { id: 'first_client', label: 'Crear o importar primer cliente', completed: hasClients || hasLeads },
        { id: 'multiple_clients', label: 'Tener al menos 3 clientes', completed: hasMultipleClients },
      ] },
      { id: 'create_catalog', number: 3, label: 'Crea tu catálogo', description: 'Da de alta tus productos o servicios con precios', route: '/saas/catalog', icon: 'package', subSteps: [
        { id: 'first_product', label: 'Crear primer producto o servicio', completed: hasProducts },
        { id: 'product_price', label: 'Asignar precio de venta', completed: hasProductWithPrice },
        { id: 'multiple_products', label: 'Tener al menos 3 artículos', completed: hasMultipleProducts },
      ] },
      { id: 'load_stock', number: 4, label: 'Carga tu stock inicial', description: 'Registra tus existencias actuales con costes y ubicación', route: '/saas/catalog', icon: 'warehouse', subSteps: [
        { id: 'stock_items', label: 'Registrar existencias iniciales', completed: hasProducts },
        { id: 'stock_cost', label: 'Indicar coste de compra', completed: hasStockWithCost },
        { id: 'stock_location', label: 'Asignar ubicación / almacén', completed: hasStockWithLocation },
      ] },
      { id: 'configure_operations', number: 5, label: 'Configura tu operativa', description: 'Define equipo, plantillas y numeración de documentos', route: '/saas/settings/numeracion', icon: 'settings', subSteps: [
        { id: 'team', label: 'Invitar a un miembro del equipo', completed: hasTeam },
        { id: 'documents', label: 'Crear una plantilla de documento', completed: hasDocuments },
      ] },
      { id: 'first_operation', number: 6, label: 'Realiza tu primera operación', description: 'Crea tu primera venta para validar que todo funciona', route: '/saas/sales', icon: 'rocket', subSteps: [
        { id: 'first_client_sel', label: 'Crear o seleccionar un cliente', completed: hasClients || hasLeads },
        { id: 'first_sale', label: 'Registrar primera venta u operación', completed: hasSales },
      ] },
    ];

    return finalizeStepDefs(defs, activeStepKey);
  }, [
    accountUserId,
    isDelivery,
    deliveryFlags,
    hasCompanyName,
    hasTaxData,
    hasAddress,
    hasBranches,
    hasPhone,
    hasClients,
    hasLeads,
    hasMultipleClients,
    hasProducts,
    hasMultipleProducts,
    hasProductWithPrice,
    hasStockWithCost,
    hasStockWithLocation,
    hasTeam,
    hasDocuments,
    hasSales,
  ]);

  const stableStepsRef = useRef<OnboardingStep[]>([]);
  useEffect(() => {
    stableStepsRef.current = [];
  }, [businessId]);

  const displaySteps = steps.length > 0 ? steps : stableStepsRef.current;
  if (steps.length > 0) {
    stableStepsRef.current = steps;
  }

  const completedSteps = displaySteps.filter(s => s.status === 'completed').length;
  const totalSteps = displaySteps.length;
  const completionPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const currentStepIndex = useMemo(() => {
    const idx = displaySteps.findIndex(s => s.status !== 'completed');
    return idx === -1 ? Math.max(displaySteps.length - 1, 0) : idx;
  }, [displaySteps]);

  useEffect(() => {
    if (completionPct !== 100 || !accountUserId || !businessId) return;
    markOnboardingTourCompleted(accountUserId, businessId);
    setOnboardingTourActive(accountUserId, businessId, false);
    if (isActivationChecklistForceVisible(accountUserId, businessId)) return;
    setIsDismissed(true);
    setActivationChecklistDismissed(accountUserId, businessId, true);
  }, [completionPct, accountUserId, businessId]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (accountUserId && businessId) {
      setActivationChecklistDismissed(accountUserId, businessId, true);
      if (isDelivery) setActivationChecklistForceVisible(accountUserId, businessId, false);
    }
  }, [accountUserId, businessId, isDelivery]);

  const restore = useCallback(() => {
    setIsDismissed(false);
    setForceVisible(true);
    if (accountUserId && businessId) {
      setActivationChecklistDismissed(accountUserId, businessId, false);
      setActivationChecklistForceVisible(accountUserId, businessId, true);
    }
  }, [accountUserId, businessId]);

  const loadSampleData = useCallback(() => {
    setIsLoadingSample(true);
    setTimeout(() => setIsLoadingSample(false), 1500);
  }, []);

  const isVisible =
    totalSteps > 0 && !isDismissed && (completionPct < 100 || forceVisible);

  return (
    <ActivationChecklistContext.Provider
      value={{ steps: displaySteps, completionPct, completedSteps, totalSteps, isVisible, isDismissed, currentStepIndex, dismiss, restore, loadSampleData, isLoadingSample }}
    >
      {children}
    </ActivationChecklistContext.Provider>
  );
}

export function useActivationChecklist() {
  const ctx = useContext(ActivationChecklistContext);
  if (!ctx) {
    return {
      steps: [],
      completionPct: 0,
      completedSteps: 0,
      totalSteps: 0,
      isVisible: false,
      isDismissed: true,
      currentStepIndex: 0,
      dismiss: () => {},
      restore: () => {},
      loadSampleData: () => {},
      isLoadingSample: false,
    };
  }
  return ctx;
}
