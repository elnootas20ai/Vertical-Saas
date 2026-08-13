import React, { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useBusinessOptional } from '../../context/BusinessContext';

type CrmSection = 'quotes' | 'leads' | 'clients' | 'promotions' | 'billing' | 'alerts';

const CRM_TABS: { id: CrmSection; label: string; path: string }[] = [
  { id: 'clients',    label: 'Clientes',              path: '/saas/crm/clientes?tab=clients' },
  { id: 'leads',      label: 'Leads',                 path: '/saas/crm/clientes?tab=leads' },
  { id: 'quotes',     label: 'Presupuestos',          path: '/saas/quotes' },
  { id: 'promotions', label: 'Promociones',           path: '/saas/promotions' },
  { id: 'billing',    label: 'Facturación',           path: '/saas/crm/clientes?tab=billing' },
  { id: 'alerts',     label: 'Alertas',               path: '/saas/crm/clientes?tab=alerts' },
];

/** Inmobiliaria: CRM core sin leads / facturación / alertas en la barra. */
const REAL_ESTATE_CRM_TAB_IDS = new Set<CrmSection>(['clients', 'quotes', 'promotions']);

/** Bar/restaurante: igual que el sidebar — Clientes + Promociones (sin leads/presupuestos). */
const RESTAURANT_CRM_TAB_IDS = new Set<CrmSection>(['clients', 'promotions']);

interface CrmNavProps {
  active: CrmSection;
}

export function CrmNav({ active }: CrmNavProps) {
  const navigate = useNavigate();
  const businessType = useBusinessOptional()?.currentBusiness?.businessType;
  const isRealEstate = businessType === 'realEstate';
  const isRestaurant = businessType === 'restaurant';

  const tabs = useMemo(() => {
    if (isRealEstate) return CRM_TABS.filter((t) => REAL_ESTATE_CRM_TAB_IDS.has(t.id));
    if (isRestaurant) return CRM_TABS.filter((t) => RESTAURANT_CRM_TAB_IDS.has(t.id));
    return CRM_TABS;
  }, [isRealEstate, isRestaurant]);

  return (
    <div className="flex w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {tabs.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => { if (!isActive) navigate(tab.path); }}
            className={`relative flex flex-1 min-w-0 items-center justify-center px-2 sm:px-4 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
              isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
            } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
          >
            <span className="truncate text-center">{tab.label}</span>
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 sm:left-3 sm:right-3 h-0.5 bg-[var(--v-blue,#2563eb)] rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export type { CrmSection };
