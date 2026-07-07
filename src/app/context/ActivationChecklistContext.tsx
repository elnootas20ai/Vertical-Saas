import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { listBrandsRequest } from '../lib/brandApi';
import {
  buildDeliveryActivationStepDefs,
  buildRestaurantActivationStepDefs,
  EMPTY_DELIVERY_ACTIVATION_FLAGS,
  type DeliveryActivationFlags,
} from '../lib/deliveryActivationChecklist';
import { listCatalogItemsRequest } from '../lib/deliveryApi';
import { filterCatalogItemsForBusinessScope } from '../lib/catalogBusinessScope';
import {
  DELIVERY_BRANDS_CHANGED,
  DELIVERY_CATALOG_CHANGED,
  loadTpvPointsOfSaleForBusiness,
  snapshotDeliveryStoreActivation,
  resolveBusinessScopeId,
} from '../lib/deliverySetup';
import {
  buildCompraventaActivationStepDefs,
  EMPTY_COMPRAVENTA_ACTIVATION_FLAGS,
  type CompraventaActivationFlags,
} from '../lib/compraventaActivationChecklist';
import {
  buildCleaningActivationStepDefs,
  EMPTY_CLEANING_ACTIVATION_FLAGS,
  type CleaningActivationFlags,
} from '../lib/cleaningActivationChecklist';
import {
  buildGymActivationStepDefs,
  EMPTY_GYM_ACTIVATION_FLAGS,
  type GymActivationFlags,
} from '../lib/gymActivationChecklist';
import {
  buildWorkshopActivationStepDefs,
  EMPTY_WORKSHOP_ACTIVATION_FLAGS,
  type WorkshopActivationFlags,
} from '../lib/workshopActivationChecklist';
import {
  buildEventsActivationStepDefs,
  EMPTY_EVENTS_ACTIVATION_FLAGS,
  type EventsActivationFlags,
} from '../lib/eventsActivationChecklist';
import { loadEvents, loadEventServices } from '../lib/eventsFlow';
import { createVerticalApi } from '../lib/verticalApiFactory';
import { listWorkOrdersRequest } from '../lib/workshopApi';
import { listPartsRequest } from '../lib/partsApi';
import { WORKSHOP_DATA_CHANGED } from '../lib/workshopEvents';
import { listClientsRequest } from '../lib/crmApi';
import { loadCompraventaStores } from '../lib/compraventaSetup';
import { listCleaningServicesRequest } from '../lib/cleaningApi';
import { listUsersRequest } from '../lib/authApi';
import { listVehiclesRequest } from '../lib/vehicleApi';
import { resolveVehicleListBusinessId } from '../lib/vehicleVertical';
import {
  isDeliveryOpsBusinessType,
  isGuidedActivationBusinessType,
  isRestaurantBusinessType,
} from '../lib/deliveryOpsTypes';
import { isDeliveryBrandActivationComplete } from '../lib/brandUtils';
import { anyActiveRetailStoreHasOpeningHours } from '../lib/businessHoursUtils';
import {
  ACTIVATION_IN_PROGRESS_CHANGED,
  getActivationInProgressStep,
  isActivationChecklistDismissed,
  isActivationChecklistForceVisible,
  isOnboardingTourActive,
  dismissOnboardingWelcomeTourForActivation,
  markOnboardingTourCompleted,
  notifyGuidedActivationComplete,
  setActivationChecklistDismissed,
  setActivationChecklistForceVisible,
  setActivationInProgressStep,
  setOnboardingTourActive,
} from '../lib/onboardingLocalKeys';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
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

function isStepDataComplete(def: Pick<StepDef, 'subSteps'>): boolean {
  return def.subSteps.length > 0 && def.subSteps.every((s) => s.completed);
}

function finalizeStepDefs(
  defs: StepDef[],
  activeStepKey: string | null,
): OnboardingStep[] {
  const allStepsGloballyDone =
    defs.length > 0 && defs.every((d) => isStepDataComplete(d));

  const firstActionableId =
    defs.find((d) => {
      const allDone = isStepDataComplete(d);
      return !allDone && !d.locked;
    })?.id ?? null;

  return defs.map((def) => {
    const completedSub = def.subSteps.filter((s) => s.completed).length;
    const allDone = isStepDataComplete(def);
    const inProgress = completedSub > 0 && !allDone;

    let status: StepStatus = 'pending';
    const repasar = allDone && activeStepKey === def.id && !allStepsGloballyDone;
    if (repasar) {
      status = 'in_progress';
    } else if (allDone) {
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

type ActivationFlagsBundle =
  | { kind: 'delivery'; flags: DeliveryActivationFlags }
  | { kind: 'compraventa'; flags: CompraventaActivationFlags }
  | { kind: 'cleaning'; flags: CleaningActivationFlags }
  | { kind: 'gym'; flags: GymActivationFlags }
  | { kind: 'workshop'; flags: WorkshopActivationFlags }
  | { kind: 'events'; flags: EventsActivationFlags };

function buildStepDefsForBusiness(
  businessType: string | null | undefined,
  bundle: ActivationFlagsBundle | null,
): StepDef[] {
  const kind = bundle?.kind
    ?? (isDeliveryOpsBusinessType(businessType)
      ? 'delivery'
      : businessType === 'carDealership'
        ? 'compraventa'
        : businessType === 'cleaning'
          ? 'cleaning'
          : businessType === 'gym'
            ? 'gym'
            : businessType === 'workshop'
              ? 'workshop'
              : businessType === 'events'
                ? 'events'
              : null);

  if (kind === 'delivery') {
    const flags = bundle?.kind === 'delivery'
      ? bundle.flags
      : EMPTY_DELIVERY_ACTIVATION_FLAGS;
    if (businessType === 'restaurant' || isRestaurantBusinessType(businessType)) {
      return buildRestaurantActivationStepDefs(flags);
    }
    return buildDeliveryActivationStepDefs(flags);
  }
  if (kind === 'compraventa') {
    const flags = bundle?.kind === 'compraventa'
      ? bundle.flags
      : EMPTY_COMPRAVENTA_ACTIVATION_FLAGS;
    return buildCompraventaActivationStepDefs(flags);
  }
  if (kind === 'cleaning') {
    const flags = bundle?.kind === 'cleaning'
      ? bundle.flags
      : EMPTY_CLEANING_ACTIVATION_FLAGS;
    return buildCleaningActivationStepDefs(flags);
  }
  if (kind === 'gym') {
    const flags = bundle?.kind === 'gym'
      ? bundle.flags
      : EMPTY_GYM_ACTIVATION_FLAGS;
    return buildGymActivationStepDefs(flags);
  }
  if (kind === 'workshop') {
    const flags = bundle?.kind === 'workshop'
      ? bundle.flags
      : EMPTY_WORKSHOP_ACTIVATION_FLAGS;
    return buildWorkshopActivationStepDefs(flags);
  }
  if (kind === 'events') {
    const flags = bundle?.kind === 'events'
      ? bundle.flags
      : EMPTY_EVENTS_ACTIVATION_FLAGS;
    return buildEventsActivationStepDefs(flags);
  }
  return [];
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ActivationChecklistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const currentBusiness = useBusinessOptional()?.currentBusiness ?? null;
  const businessesCount = useBusinessOptional()?.businesses?.length ?? 0;
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [activationFlags, setActivationFlags] = useState<ActivationFlagsBundle | null>(null);
  const activationFlagsRef = useRef<ActivationFlagsBundle | null>(null);
  const businessType = currentBusiness?.businessType ?? '';
  const accountUserId = resolveAccountUserId(user);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const bizName = currentBusiness?.name ?? '';
  const bizTaxId = currentBusiness?.taxId ?? '';
  const bizAddress = currentBusiness?.address ?? '';
  const bizPhone = currentBusiness?.phone ?? '';
  const [isDismissed, setIsDismissed] = useState(false);
  const [forceVisible, setForceVisible] = useState(false);
  const [activeStepKey, setActiveStepKey] = useState<string | null>(null);

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
    setActiveStepKey(
      accountUserId && businessId
        ? getActivationInProgressStep(accountUserId, businessId)
        : null,
    );
  }, [accountUserId, businessId]);

  useEffect(() => {
    if (!accountUserId || !businessId) return;
    const onStepChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; businessId?: string }>).detail;
      if (detail?.userId !== accountUserId || detail?.businessId !== businessId) return;
      setActiveStepKey(getActivationInProgressStep(accountUserId, businessId));
    };
    window.addEventListener(ACTIVATION_IN_PROGRESS_CHANGED, onStepChanged);
    return () => window.removeEventListener(ACTIVATION_IN_PROGRESS_CHANGED, onStepChanged);
  }, [accountUserId, businessId]);

  const usesGuidedActivation = isGuidedActivationBusinessType(businessType);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);

  useEffect(() => {
    setActivationFlags(null);
    activationFlagsRef.current = null;
  }, [businessId]);

  useEffect(() => {
    if (!usesGuidedActivation || !dataUserId) {
      setActivationFlags(null);
      return;
    }

    let cancelled = false;

    const companyFlags = {
      hasCompanyName: Boolean(bizName.trim()),
      hasTaxData: Boolean(bizTaxId.trim()),
      hasAddress: Boolean(bizAddress.trim()),
      hasPhone: Boolean(bizPhone.trim()),
    };

    const load = async () => {
      try {
        if (isDeliveryOpsBusinessType(businessType)) {
          const [storeState, brands, catalog] = await Promise.all([
            loadTpvPointsOfSaleForBusiness(user, currentBusiness, {
              includeInactivePdvs: true,
              accountBusinessCount: businessesCount,
            }),
            businessId ? listBrandsRequest(businessId).catch(() => []) : Promise.resolve([]),
            listCatalogItemsRequest(dataUserId, 'catalog').catch(() => []),
          ]);

          if (cancelled) return;

          const { hasActiveRetailStore, hasActivePdv, retailStores } =
            snapshotDeliveryStoreActivation(storeState);

          const catalogForBusiness = filterCatalogItemsForBusinessScope(
            catalog,
            businessId,
            brands,
            { accountBusinessCount: businessesCount, activeBusinessType: businessType || 'delivery' },
          );
          const priced = catalogForBusiness.filter((item) => Number(item.unitPrice ?? 0) > 0);

          const setupCtx = { isDelivery: true, retailStoreCount: retailStores.length };
          const brandReady = isDeliveryBrandActivationComplete(brands, setupCtx);

          const nextBundle: ActivationFlagsBundle = {
            kind: 'delivery',
            flags: {
              ...companyFlags,
              hasActiveRetailStore,
              hasActivePdv,
              brandSetupComplete: brandReady,
              hasCatalogProduct: catalogForBusiness.length > 0,
              hasPricedProduct: priced.length > 0,
              hasBusinessHours: anyActiveRetailStoreHasOpeningHours(retailStores),
            },
          };
          activationFlagsRef.current = nextBundle;
          setActivationFlags(nextBundle);
          return;
        }

        if (businessType === 'carDealership') {
          const [storeState, clients, vehiclesRes] = await Promise.all([
            loadCompraventaStores(user, currentBusiness, { includeInactivePdvs: true }),
            listClientsRequest(dataUserId, { businessId }).catch(() => []),
            listVehiclesRequest(dataUserId, resolveVehicleListBusinessId(currentBusiness)).catch(
              () => ({ vehicles: [] as Array<{ salePrice?: number }> }),
            ),
          ]);

          if (cancelled) return;

          const { hasActiveRetailStore, hasActivePdv } = snapshotDeliveryStoreActivation(storeState);
          const vehicles = vehiclesRes.vehicles || [];
          const pricedVehicles = vehicles.filter((v) => Number(v.salePrice ?? 0) > 0);

          const nextBundle: ActivationFlagsBundle = {
            kind: 'compraventa',
            flags: {
              ...companyFlags,
              hasActiveRetailStore,
              hasActivePdv,
              hasClient: clients.length > 0,
              hasVehicle: vehicles.length > 0,
              hasPricedVehicle: pricedVehicles.length > 0,
            },
          };
          activationFlagsRef.current = nextBundle;
          setActivationFlags(nextBundle);
          return;
        }

        if (businessType === 'cleaning') {
          const [services, clients, usersRes] = await Promise.all([
            listCleaningServicesRequest(dataUserId).catch(() => []),
            listClientsRequest(dataUserId, { businessId }).catch(() => []),
            businessId ? listUsersRequest(businessId).catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
          ]);

          if (cancelled) return;

          const activeServices = services.filter((svc) => !svc.deletedAt);
          const pricedServices = activeServices.filter((svc) => Number(svc.price ?? 0) > 0);
          const teamUsers = usersRes.users || [];

          const nextBundle: ActivationFlagsBundle = {
            kind: 'cleaning',
            flags: {
              ...companyFlags,
              hasService: activeServices.length > 0,
              hasPricedService: pricedServices.length > 0,
              hasClient: clients.length > 0,
              hasTeamMember: teamUsers.length >= 2,
            },
          };
          activationFlagsRef.current = nextBundle;
          setActivationFlags(nextBundle);
          return;
        }

        if (businessType === 'gym') {
          const gymMembersApi = createVerticalApi('gym', 'members');
          const gymClassesApi = createVerticalApi('gym', 'classes');
          const gymMembershipsApi = createVerticalApi('gym', 'memberships');
          const [members, classes, memberships, usersRes] = await Promise.all([
            gymMembersApi.list(dataUserId).catch(() => []),
            gymClassesApi.list(dataUserId).catch(() => []),
            gymMembershipsApi.list(dataUserId).catch(() => []),
            businessId ? listUsersRequest(businessId).catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
          ]);

          if (cancelled) return;

          const nextBundle: ActivationFlagsBundle = {
            kind: 'gym',
            flags: {
              ...companyFlags,
              hasMember: members.length > 0,
              hasClass: classes.length > 0,
              hasMembership: memberships.length > 0,
              hasTeamMember: (usersRes.users || []).length >= 2,
            },
          };
          activationFlagsRef.current = nextBundle;
          setActivationFlags(nextBundle);
          return;
        }

        if (businessType === 'workshop') {
          const [clients, orders, parts, usersRes] = await Promise.all([
            listClientsRequest(dataUserId, { businessId }).catch(() => []),
            listWorkOrdersRequest(dataUserId, { businessId }).catch(() => []),
            listPartsRequest(dataUserId, { businessId }).catch(() => []),
            businessId ? listUsersRequest(businessId).catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
          ]);

          if (cancelled) return;

          const nextBundle: ActivationFlagsBundle = {
            kind: 'workshop',
            flags: {
              ...companyFlags,
              hasClient: clients.length > 0,
              hasWorkOrder: orders.length > 0,
              hasPart: parts.length > 0,
              hasTeamMember: (usersRes.users || []).length >= 2,
            },
          };
          activationFlagsRef.current = nextBundle;
          setActivationFlags(nextBundle);
          return;
        }

        if (businessType === 'events') {
          const [services, clients, events, usersRes] = await Promise.all([
            loadEventServices(dataUserId, false).catch(() => []),
            listClientsRequest(dataUserId, { businessId }).catch(() => []),
            loadEvents(dataUserId).catch(() => []),
            businessId ? listUsersRequest(businessId).catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
          ]);

          if (cancelled) return;

          const activeServices = services.filter((svc) => svc.activo !== false);
          const pricedServices = activeServices.filter((svc) => Number(svc.precio ?? 0) > 0);

          const nextBundle: ActivationFlagsBundle = {
            kind: 'events',
            flags: {
              ...companyFlags,
              hasService: activeServices.length > 0,
              hasPricedService: pricedServices.length > 0,
              hasClient: clients.length > 0,
              hasEvent: events.length > 0,
              hasTeamMember: (usersRes.users || []).length >= 2,
            },
          };
          activationFlagsRef.current = nextBundle;
          setActivationFlags(nextBundle);
        }
      } catch {
        if (cancelled || activationFlagsRef.current) return;
        if (isDeliveryOpsBusinessType(businessType)) {
          const fallback: ActivationFlagsBundle = { kind: 'delivery', flags: EMPTY_DELIVERY_ACTIVATION_FLAGS };
          activationFlagsRef.current = fallback;
          setActivationFlags(fallback);
        } else if (businessType === 'carDealership') {
          const fallback: ActivationFlagsBundle = { kind: 'compraventa', flags: EMPTY_COMPRAVENTA_ACTIVATION_FLAGS };
          activationFlagsRef.current = fallback;
          setActivationFlags(fallback);
        } else if (businessType === 'cleaning') {
          const fallback: ActivationFlagsBundle = { kind: 'cleaning', flags: EMPTY_CLEANING_ACTIVATION_FLAGS };
          activationFlagsRef.current = fallback;
          setActivationFlags(fallback);
        } else if (businessType === 'gym') {
          const fallback: ActivationFlagsBundle = { kind: 'gym', flags: EMPTY_GYM_ACTIVATION_FLAGS };
          activationFlagsRef.current = fallback;
          setActivationFlags(fallback);
        } else if (businessType === 'workshop') {
          const fallback: ActivationFlagsBundle = { kind: 'workshop', flags: EMPTY_WORKSHOP_ACTIVATION_FLAGS };
          activationFlagsRef.current = fallback;
          setActivationFlags(fallback);
        } else if (businessType === 'events') {
          const fallback: ActivationFlagsBundle = { kind: 'events', flags: EMPTY_EVENTS_ACTIVATION_FLAGS };
          activationFlagsRef.current = fallback;
          setActivationFlags(fallback);
        }
      }
    };

    void load();
    const scheduleLoad = () => {
      void load();
    };
    window.addEventListener('work-centers:changed', scheduleLoad);
    window.addEventListener(DELIVERY_CATALOG_CHANGED, scheduleLoad);
    window.addEventListener(DELIVERY_BRANDS_CHANGED, scheduleLoad);
    window.addEventListener(WORKSHOP_DATA_CHANGED, scheduleLoad);
    window.addEventListener('focus', scheduleLoad);
    return () => {
      cancelled = true;
      window.removeEventListener('work-centers:changed', scheduleLoad);
      window.removeEventListener(DELIVERY_CATALOG_CHANGED, scheduleLoad);
      window.removeEventListener(DELIVERY_BRANDS_CHANGED, scheduleLoad);
      window.removeEventListener(WORKSHOP_DATA_CHANGED, scheduleLoad);
      window.removeEventListener('focus', scheduleLoad);
    };
  }, [
    usesGuidedActivation,
    businessType,
    dataUserId,
    businessId,
    bizName,
    bizTaxId,
    bizAddress,
    bizPhone,
    user,
    currentBusiness,
    businessesCount,
  ]);

  const steps: OnboardingStep[] = useMemo(() => {
    if (!usesGuidedActivation) return [];
    const bundle = activationFlags ?? activationFlagsRef.current;
    const defs = buildStepDefsForBusiness(businessType, bundle);
    return finalizeStepDefs(defs, activeStepKey);
  }, [activeStepKey, usesGuidedActivation, activationFlags, businessType]);

  const stableStepsRef = useRef<OnboardingStep[]>([]);
  useEffect(() => {
    stableStepsRef.current = [];
  }, [businessId]);

  const displaySteps = steps.length > 0 ? steps : stableStepsRef.current;
  if (steps.length > 0) {
    stableStepsRef.current = steps;
  }

  const completedSteps = displaySteps.filter(
    (s) => s.totalSubSteps > 0 && s.completedSubSteps === s.totalSubSteps,
  ).length;
  const totalSteps = displaySteps.length;
  const completionPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const currentStepIndex = useMemo(() => {
    const idx = displaySteps.findIndex(s => s.status !== 'completed');
    return idx === -1 ? Math.max(displaySteps.length - 1, 0) : idx;
  }, [displaySteps]);

  const guidedActivationIncomplete = usesGuidedActivation && totalSteps > 0 && completionPct < 100;
  const prevCompletionPctRef = useRef(0);

  useEffect(() => {
    prevCompletionPctRef.current = 0;
  }, [accountUserId, businessId]);

  useEffect(() => {
    if (!accountUserId || !businessId || completionPct < 100) return;
    if (!getActivationInProgressStep(accountUserId, businessId)) return;
    setActivationInProgressStep(accountUserId, businessId, null);
    setActiveStepKey(null);
  }, [completionPct, accountUserId, businessId]);

  useEffect(() => {
    if (!guidedActivationIncomplete || !accountUserId || !businessId) return;
    setIsDismissed(false);
    setActivationChecklistDismissed(accountUserId, businessId, false);
  }, [guidedActivationIncomplete, accountUserId, businessId]);

  useEffect(() => {
    if (completionPct !== 100 || !accountUserId || !businessId || !usesGuidedActivation) {
      prevCompletionPctRef.current = completionPct;
      return;
    }
    if (isOnboardingTourActive(accountUserId, businessId)) {
      dismissOnboardingWelcomeTourForActivation(accountUserId, businessId);
    } else {
      markOnboardingTourCompleted(accountUserId, businessId);
      setOnboardingTourActive(accountUserId, businessId, false);
    }
    const prev = prevCompletionPctRef.current;
    prevCompletionPctRef.current = completionPct;
    if (prev < 100) {
      notifyGuidedActivationComplete(accountUserId, businessId);
    }
  }, [completionPct, accountUserId, businessId, usesGuidedActivation]);

  const dismiss = useCallback(() => {
    if (usesGuidedActivation && completionPct < 100) return;
    setIsDismissed(true);
    if (accountUserId && businessId) {
      setActivationChecklistDismissed(accountUserId, businessId, true);
      if (usesGuidedActivation) setActivationChecklistForceVisible(accountUserId, businessId, false);
    }
  }, [accountUserId, businessId, usesGuidedActivation, completionPct]);

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
    totalSteps > 0 &&
    !isDismissed &&
    (completionPct < 100 || forceVisible);

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
