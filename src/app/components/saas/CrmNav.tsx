import React from 'react';
import { useNavigate } from 'react-router';

type CrmSection = 'quotes' | 'leads' | 'clients' | 'promotions' | 'billing' | 'alerts';

const CRM_TABS: { id: CrmSection; label: string; path: string }[] = [
  { id: 'clients',    label: 'Clientes',              path: '/saas/crm/clientes?tab=clients' },
  { id: 'leads',      label: 'Leads',                 path: '/saas/crm/clientes?tab=leads' },
  { id: 'quotes',     label: 'Presupuestos',          path: '/saas/quotes' },
  { id: 'promotions', label: 'Promociones',           path: '/saas/promotions' },
  { id: 'billing',    label: 'Facturación',           path: '/saas/crm/clientes?tab=billing' },
  { id: 'alerts',     label: 'Alertas',               path: '/saas/crm/clientes?tab=alerts' },
];

interface CrmNavProps {
  active: CrmSection;
}

export function CrmNav({ active }: CrmNavProps) {
  const navigate = useNavigate();

  return (
    <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
      {CRM_TABS.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => { if (!isActive) navigate(tab.path); }}
            className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
              isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
            } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
          >
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export type { CrmSection };
