import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getOnboardingProgressRequest, saveOnboardingProgressRequest } from '../lib/authApi';
import type { OnboardingVerificationDocument } from '../lib/onboardingCompanyVerification';
import type { DeliveryNeedsSelection } from '../lib/onboardingPlanRecommendation';
import {
  ONBOARDING_DATA_LEGACY_KEY,
  ONBOARDING_RESET_EVENT,
  onboardingDataStorageKey,
} from '../lib/onboardingStorage';

export const ONBOARDING_STEPS = [
  'Tipo de negocio',
  'Empresa',
  'Estructura',
  'Operativa',
  'Precio',
  'Pago',
] as const;

export const ONBOARDING_ROUTES = [
  '/auth/onboarding/business-type',
  '/auth/onboarding/company',
  '/auth/onboarding/structure',
  '/auth/onboarding/needs',
  '/auth/onboarding/recommendation',
  '/auth/onboarding/payment-info',
] as const;

export interface OnboardingData {
  completedStep: number;
  businessType: string;
  companyProfile: {
    tradeName: string;
    legalName: string;
    taxId: string;
    province: string;
    city?: string;
    address: string;
    companyEmail: string;
    companyPhone: string;
    isAncovePartner: boolean;
    ancoveMemberNumber: string;
    /** Documentos opcionales (CIF, licencia, etc.) para revisión de acceso */
    verificationDocuments?: OnboardingVerificationDocument[];
    verificationNote?: string;
  };
  businessMetrics: {
    userCount: number;
    /** Puntos de venta / locales operativos (legacy: locationCount). */
    locationCount: number;
    /** Empresas en la cuenta (CIF distintos o marcas bajo un grupo). */
    businessCount: number;
    /** Marcas comerciales además de «General» (p. ej. Pizzería, Burger). */
    commercialBrandCount: number;
    monthlyOperations: string;
    activeItems: string;
    currentTools: string[];
    otherToolsDetail: string;
    requiredIntegrations: string[];
  };
  requestedModules: {
    inventory: boolean;
    sales: boolean;
    crm: boolean;
    documentation: boolean;
    analytics: boolean;
    workshop: boolean;
  };
  /** Solo delivery: las 8 cartas del paso Operativa (se guardan tal cual). */
  deliveryNeeds?: DeliveryNeedsSelection;
  subscriptionSelection: {
    recommendedPlanId: string;
    billingMode: 'monthly' | 'annual';
    estimatedMonthlyTotal: number;
    estimatedAnnualTotal: number;
  };
  paymentDetails: {
    cardNumber: string;
    cardHolderName: string;
    expiryDate: string;
    cvv: string;
    acceptTerms: boolean;
  };
  trial: {
    startDate: number | null;
    endDate: number | null;
  };
}

interface OnboardingContextType {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(section: K, value: OnboardingData[K]) => void;
  resetData: () => void;
  initializeTrial: () => void;
  getTrialDaysRemaining: () => number;
  setUserId: (id: string | null) => void;
  advanceStep: (stepIndex: number) => void;
}

export const initialOnboardingData: OnboardingData = {
  completedStep: -1,
  businessType: 'events',
  companyProfile: {
    tradeName: '',
    legalName: '',
    taxId: '',
    province: '',
    address: '',
    companyEmail: '',
    companyPhone: '',
    isAncovePartner: false,
    ancoveMemberNumber: '',
    verificationDocuments: [],
    verificationNote: '',
  },
  businessMetrics: {
    userCount: 1,
    locationCount: 1,
    businessCount: 1,
    commercialBrandCount: 0,
    monthlyOperations: '',
    activeItems: '',
    currentTools: [],
    otherToolsDetail: '',
    requiredIntegrations: [],
  },
  requestedModules: {
    inventory: false,
    sales: false,
    crm: false,
    documentation: false,
    analytics: false,
    workshop: false,
  },
  subscriptionSelection: {
    recommendedPlanId: 'basic',
    billingMode: 'monthly',
    estimatedMonthlyTotal: 0,
    estimatedAnnualTotal: 0,
  },
  paymentDetails: {
    cardNumber: '',
    cardHolderName: '',
    expiryDate: '',
    cvv: '',
    acceptTerms: false,
  },
  trial: {
    startDate: null,
    endDate: null,
  },
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

function parseStoredOnboarding(raw: string | null): Partial<OnboardingData> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<OnboardingData>;
  } catch {
    return null;
  }
}

function mergeOnboardingData(partial?: Partial<OnboardingData> | null): OnboardingData {
  const p = partial ?? {};
  return {
    ...initialOnboardingData,
    ...p,
    companyProfile: {
      ...initialOnboardingData.companyProfile,
      ...(p.companyProfile ?? {}),
      verificationDocuments: p.companyProfile?.verificationDocuments ?? [],
      verificationNote: p.companyProfile?.verificationNote ?? '',
    },
    businessMetrics: {
      ...initialOnboardingData.businessMetrics,
      ...(p.businessMetrics ?? {}),
      businessCount: p.businessMetrics?.businessCount ?? initialOnboardingData.businessMetrics.businessCount,
      commercialBrandCount:
        p.businessMetrics?.commercialBrandCount ?? initialOnboardingData.businessMetrics.commercialBrandCount,
    },
    requestedModules: { ...initialOnboardingData.requestedModules, ...(p.requestedModules ?? {}) },
    deliveryNeeds: p.deliveryNeeds,
    subscriptionSelection: {
      ...initialOnboardingData.subscriptionSelection,
      ...(p.subscriptionSelection ?? {}),
    },
    paymentDetails: { ...initialOnboardingData.paymentDetails, ...(p.paymentDetails ?? {}) },
    trial: { ...initialOnboardingData.trial, ...(p.trial ?? {}) },
  };
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingData>(initialOnboardingData);
  const [userId, setUserId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedForUserRef = useRef<string | null>(null);

  const persistLocal = useCallback((uid: string | null, next: OnboardingData) => {
    if (!uid) return;
    try {
      localStorage.setItem(onboardingDataStorageKey(uid), JSON.stringify(next));
      localStorage.removeItem(ONBOARDING_DATA_LEGACY_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const applyFreshDraft = useCallback((uid: string | null) => {
    setData(initialOnboardingData);
    if (uid) {
      try {
        localStorage.removeItem(onboardingDataStorageKey(uid));
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem(ONBOARDING_DATA_LEGACY_KEY);
  }, []);

  useEffect(() => {
    const onReset = (ev: Event) => {
      const detail = (ev as CustomEvent<{ userId?: string }>).detail;
      const uid = String(detail?.userId || userId || '').trim() || null;
      loadedForUserRef.current = uid;
      applyFreshDraft(uid);
    };
    window.addEventListener(ONBOARDING_RESET_EVENT, onReset);
    return () => window.removeEventListener(ONBOARDING_RESET_EVENT, onReset);
  }, [userId, applyFreshDraft]);

  useEffect(() => {
    if (!userId) {
      loadedForUserRef.current = null;
      return;
    }
    if (loadedForUserRef.current === userId) return;

    const legacy = parseStoredOnboarding(localStorage.getItem(ONBOARDING_DATA_LEGACY_KEY));
    if (legacy) {
      localStorage.removeItem(ONBOARDING_DATA_LEGACY_KEY);
    }

    const local = parseStoredOnboarding(localStorage.getItem(onboardingDataStorageKey(userId)));

    getOnboardingProgressRequest(userId)
      .then((response) => {
        const fromBackend =
          response.onboardingData && Object.keys(response.onboardingData).length > 0
            ? (response.onboardingData as Partial<OnboardingData>)
            : null;

        if (fromBackend) {
          const merged = mergeOnboardingData(fromBackend);
          setData(merged);
          persistLocal(userId, merged);
        } else if (local && (local.companyProfile?.tradeName || local.completedStep >= 0)) {
          setData(mergeOnboardingData(local));
        } else {
          setData(initialOnboardingData);
          localStorage.removeItem(onboardingDataStorageKey(userId));
        }
        loadedForUserRef.current = userId;
      })
      .catch(() => {
        if (local && (local.companyProfile?.tradeName || local.completedStep >= 0)) {
          setData(mergeOnboardingData(local));
        } else {
          setData(initialOnboardingData);
        }
        loadedForUserRef.current = userId;
      });
  }, [userId, persistLocal]);

  useEffect(() => {
    persistLocal(userId, data);
  }, [data, userId, persistLocal]);

  const syncToBackend = useCallback(
    (nextData: OnboardingData) => {
      if (!userId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveOnboardingProgressRequest(userId, {
          onboardingData: nextData as unknown as Record<string, unknown>,
        }).catch(() => {
          /* localStorage ya guardó */
        });
      }, 800);
    },
    [userId],
  );

  const updateData = <K extends keyof OnboardingData>(section: K, value: OnboardingData[K]) => {
    setData((prev) => {
      const next = { ...prev, [section]: value };
      syncToBackend(next);
      return next;
    });
  };

  const advanceStep = (stepIndex: number) => {
    setData((prev) => {
      if (stepIndex <= prev.completedStep) return prev;
      const next = { ...prev, completedStep: stepIndex };
      syncToBackend(next);
      return next;
    });
  };

  const resetData = () => {
    applyFreshDraft(userId);
    loadedForUserRef.current = userId;
  };

  const initializeTrial = () => {
    const now = Date.now();
    const trialDuration = 14 * 24 * 60 * 60 * 1000;
    setData((prev) => {
      const next = {
        ...prev,
        trial: {
          startDate: now,
          endDate: now + trialDuration,
        },
      };
      syncToBackend(next);
      return next;
    });
  };

  const getTrialDaysRemaining = () => {
    const { startDate, endDate } = data.trial;
    if (!startDate || !endDate) {
      return 0;
    }

    return Math.max(0, Math.ceil((endDate - Date.now()) / (24 * 60 * 60 * 1000)));
  };

  return (
    <OnboardingContext.Provider
      value={{
        data,
        updateData,
        resetData,
        initializeTrial,
        getTrialDaysRemaining,
        setUserId,
        advanceStep,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
