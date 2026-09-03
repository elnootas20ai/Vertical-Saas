import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useApp } from './AppContext';
import { PlanUpgradePrepOverlay } from '../components/saas/PlanUpgradePrepOverlay';
import { PLAN_TIER_LABELS, type SubscriptionPlanTier } from '../lib/pointOfSaleLimits';
import { useEffectivePlanTier } from '../hooks/useEffectivePlanTier';

type DevPlanId = 'basic' | 'normal' | 'pro';

type PlanUpgradePrepContextValue = {
  /** Aplica plan; si es upgrade a Pro desde un plan inferior, lanza la preparación. */
  applyDevPlanWithPrep: (planId: DevPlanId) => void;
  isPreparingProUpgrade: boolean;
};

const PlanUpgradePrepContext = createContext<PlanUpgradePrepContextValue | null>(null);

export function PlanUpgradePrepProvider({ children }: { children: ReactNode }) {
  const { setDevSubscriptionPlan } = useApp();
  const currentTier = useEffectivePlanTier();
  const [prepFromTier, setPrepFromTier] = useState<SubscriptionPlanTier | null>(null);

  const applyDevPlanWithPrep = useCallback(
    (planId: DevPlanId) => {
      if (planId === 'pro' && currentTier !== 'pro') {
        setPrepFromTier(currentTier);
        return;
      }
      setDevSubscriptionPlan(planId);
    },
    [currentTier, setDevSubscriptionPlan],
  );

  const finishPrep = useCallback(() => {
    setDevSubscriptionPlan('pro');
    setPrepFromTier(null);
  }, [setDevSubscriptionPlan]);

  const value = useMemo(
    () => ({
      applyDevPlanWithPrep,
      isPreparingProUpgrade: prepFromTier != null,
    }),
    [applyDevPlanWithPrep, prepFromTier],
  );

  const fromLabel =
    prepFromTier != null ? PLAN_TIER_LABELS[prepFromTier] : 'Mediano';

  return (
    <PlanUpgradePrepContext.Provider value={value}>
      {children}
      {prepFromTier != null ? (
        <PlanUpgradePrepOverlay
          fromPlanLabel={fromLabel}
          allowSkip
          onComplete={finishPrep}
          onSkip={finishPrep}
        />
      ) : null}
    </PlanUpgradePrepContext.Provider>
  );
}

export function usePlanUpgradePrep(): PlanUpgradePrepContextValue {
  const ctx = useContext(PlanUpgradePrepContext);
  if (!ctx) {
    throw new Error('usePlanUpgradePrep must be used within PlanUpgradePrepProvider');
  }
  return ctx;
}

export function usePlanUpgradePrepOptional(): PlanUpgradePrepContextValue | null {
  return useContext(PlanUpgradePrepContext);
}
