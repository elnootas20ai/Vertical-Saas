import { useNavigate } from 'react-router';

export type RealEstateNavSection = 'properties' | 'visits' | 'contracts' | 'appraisals';

const RE_TABS: { id: RealEstateNavSection; label: string; path: string }[] = [
  { id: 'properties', label: 'Propiedades', path: '/saas/realestate-properties' },
  { id: 'visits', label: 'Visitas', path: '/saas/realestate-visits' },
  { id: 'contracts', label: 'Contratos', path: '/saas/realestate-contracts' },
  { id: 'appraisals', label: 'Tasaciones', path: '/saas/realestate-appraisals' },
];

interface RealEstateNavProps {
  active: RealEstateNavSection;
}

/** Pestañas del módulo inmobiliaria — ancho igual y texto centrado en cada una. */
export function RealEstateNav({ active }: RealEstateNavProps) {
  const navigate = useNavigate();

  return (
    <nav
      className="flex w-full rounded-2xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 overflow-hidden"
      aria-label="Inmobiliaria"
    >
      {RE_TABS.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (!isActive) navigate(tab.path);
            }}
            className={`relative flex flex-1 min-w-0 items-center justify-center px-2 sm:px-4 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
              isActive
                ? 'text-stone-900 dark:text-stone-100'
                : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'
            } ${i !== 0 ? 'border-l border-stone-100 dark:border-stone-800' : ''}`}
          >
            <span className="truncate text-center">{tab.label}</span>
            {isActive ? (
              <span className="absolute bottom-0 left-2 right-2 sm:left-3 sm:right-3 h-0.5 rounded-t-full bg-[var(--v-blue,#2563eb)]" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
