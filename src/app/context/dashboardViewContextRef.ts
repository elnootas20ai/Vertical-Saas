import { createContext } from 'react';

/** Contexto aparte para evitar duplicados de módulo (Provider vs hook en chunks distintos). */
export type DashboardViewContextValue = {
  isPortfolioView: boolean;
  setPortfolioView: (value: boolean) => void;
  selectBusinessFromPortfolio: (businessId: string) => void;
  enterBusinessView: () => void;
};

export const DashboardViewContext = createContext<DashboardViewContextValue | null>(null);
