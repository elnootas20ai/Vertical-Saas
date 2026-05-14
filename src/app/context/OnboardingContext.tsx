import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getOnboardingProgressRequest, saveOnboardingProgressRequest } from '../lib/authApi';

export const ONBOARDING_STEPS = [
  'Tipo de negocio',
  'Empresa',
  'Estructura',
  'Necesidades',
  'Recomendación',
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
    /** Localidad (p. ej. desde autocompletado de dirección); si falta, SaaS usa provincia como respaldo para el negocio. */
    city?: string;
    address: string;
    companyEmail: string;
    companyPhone: string;
    isAncovePartner: boolean;
    ancoveMemberNumber: string;
  };
  businessMetrics: {
    userCount: number;
    locationCount: number;
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

const STORAGE_KEY = 'vertial_onboarding_data';

const initialData: OnboardingData = {
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
  },
  businessMetrics: {
    userCount: 1,
    locationCount: 1,
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

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingData>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return initialData;
    }

    try {
      return { ...initialData, ...JSON.parse(stored) };
    } catch {
      return initialData;
    }
  });

  const [userId, setUserId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar progreso desde el backend cuando se identifica al usuario
  useEffect(() => {
    if (!userId) return;

    getOnboardingProgressRequest(userId)
      .then((response) => {
        if (response.onboardingData && Object.keys(response.onboardingData).length > 0) {
          setData((prev) => ({
            ...initialData,
            ...prev,
            ...(response.onboardingData as Partial<OnboardingData>),
          }));
        }
      })
      .catch(() => {
        // Si falla, el estado local (localStorage) ya está cargado como fallback
      });
  }, [userId]);

  // Sincronizar con localStorage en cada cambio
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // Guardar en backend con debounce de 800ms para no saturar
  const syncToBackend = useCallback(
    (nextData: OnboardingData) => {
      if (!userId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveOnboardingProgressRequest(userId, {
          onboardingData: nextData as unknown as Record<string, unknown>,
        }).catch(() => {
          // Silenciar errores de red; localStorage ya actuó como fallback
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
    setData(initialData);
    localStorage.removeItem(STORAGE_KEY);
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