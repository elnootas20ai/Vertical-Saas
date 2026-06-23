import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import { useBusiness } from './BusinessContext';
import { useApp } from './AppContext';
import { portfolioViewAllowed } from '../lib/tenantEntitlements';
import { resolvePlanTier } from '../lib/pointOfSaleLimits';
import {
  DashboardViewContext,
  type DashboardViewContextValue,
} from './dashboardViewContextRef';

export type { DashboardViewContextValue };

const DASH_GENERAL_KEY = 'vertial_dash_general';

function readPortfolioPreference(businessCount: number): boolean {
  if (businessCount <= 1) return false;
  try {
    const stored = localStorage.getItem(DASH_GENERAL_KEY);
    if (stored === '0') return false;
    if (stored === '1') return true;
    return true;
  } catch {
    return businessCount > 1;
  }
}

export function DashboardViewProvider({ children }: { children: ReactNode }) {
  const { businesses, businessesFetchSettled, switchBusiness } = useBusiness();
  const { subscription } = useApp();
  const location = useLocation();
  const isDashboard = location.pathname === '/saas/dashboard';

  const planTier = resolvePlanTier(
    subscription?.selectedPlanId || '',
    subscription?.planName || '',
  );
  const canUsePortfolioView = portfolioViewAllowed(planTier, businesses.length);

  const [isPortfolioView, setIsPortfolioViewState] = useState(() =>
    readPortfolioPreference(businesses.length) && portfolioViewAllowed(planTier, businesses.length),
  );

  useEffect(() => {
    if (!businessesFetchSettled) return;
    if (!canUsePortfolioView) {
      setIsPortfolioViewState(false);
      return;
    }
    if (businesses.length <= 1) {
      setIsPortfolioViewState(false);
      return;
    }
    if (isDashboard) {
      setIsPortfolioViewState(readPortfolioPreference(businesses.length));
    }
  }, [businesses.length, businessesFetchSettled, isDashboard, canUsePortfolioView]);

  const setPortfolioView = useCallback(
    (value: boolean) => {
      if (value && !canUsePortfolioView) return;
      setIsPortfolioViewState(value);
      try {
        localStorage.setItem(DASH_GENERAL_KEY, value ? '1' : '0');
      } catch {
        /* noop */
      }
    },
    [canUsePortfolioView],
  );

  const selectBusinessFromPortfolio = useCallback(
    (businessId: string) => {
      void switchBusiness(businessId);
      setPortfolioView(false);
    },
    [switchBusiness, setPortfolioView],
  );

  const enterBusinessView = useCallback(() => {
    setPortfolioView(false);
  }, [setPortfolioView]);

  const value = useMemo(
    (): DashboardViewContextValue => ({
      isPortfolioView: isPortfolioView && canUsePortfolioView,
      setPortfolioView,
      selectBusinessFromPortfolio,
      enterBusinessView,
    }),
    [
      isPortfolioView,
      canUsePortfolioView,
      setPortfolioView,
      selectBusinessFromPortfolio,
      enterBusinessView,
    ],
  );

  return (
    <DashboardViewContext.Provider value={value}>{children}</DashboardViewContext.Provider>
  );
}

export function useDashboardView(): DashboardViewContextValue {
  const ctx = useContext(DashboardViewContext);
  if (!ctx) {
    throw new Error('useDashboardView debe usarse dentro de DashboardViewProvider');
  }
  return ctx;
}

export function useDashboardViewOptional(): DashboardViewContextValue | null {
  return useContext(DashboardViewContext);
}
