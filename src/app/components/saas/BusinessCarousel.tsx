import { useRef, useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Lock,
  MapPin,
  Users,
} from 'lucide-react';
import type { Business, BusinessType } from '../../lib/businessApi';

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  events: 'Eventos',
  carDealership: 'Compraventa',
  workshop: 'Taller',
  delivery: 'Delivery',
  restaurant: 'Restauración',
  cleaning: 'Limpieza',
  hairSalon: 'Peluquería',
  gym: 'Gimnasio',
  clinic: 'Clínica',
  hotel: 'Hotel',
  construction: 'Construcción',
  academy: 'Academia',
  realEstate: 'Inmobiliaria',
  lawyer: 'Abogado',
  nightclub: 'Ocio nocturno',
  scrapyard: 'Desguace',
  spareParts: 'Recambios',
  taxi: 'Taxi',
  pharmacy: 'Farmacia',
  carWash: 'Lavadero',
  vet: 'Veterinario',
  tobaccoShop: 'Estanco',
  butcherShop: 'Carnicería',
};

export const BUSINESS_TYPE_COLORS: Record<string, string> = {
  events: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  carDealership: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  workshop: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  delivery: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  restaurant: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  cleaning: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
  hairSalon: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  gym: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  clinic: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  hotel: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  construction: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  academy: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  realEstate: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  lawyer: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  nightclub: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  scrapyard: 'bg-stone-100 text-stone-700 dark:bg-stone-900/40 dark:text-stone-300',
  spareParts: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  taxi: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  pharmacy: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  carWash: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  vet: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  tobaccoShop: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  butcherShop: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

interface BusinessCarouselProps {
  businesses: Business[];
  currentBusinessId: string | undefined;
  onSwitchBusiness: (businessId: string) => void;
  /** Primera pestaña: vista portfolio (todas las empresas). */
  showPortfolioTab?: boolean;
  portfolioViewActive?: boolean;
  portfolioTabLocked?: boolean;
  onSelectPortfolioView?: () => void;
  onPortfolioLockedClick?: () => void;
}

export function BusinessCarousel({
  businesses,
  currentBusinessId,
  onSwitchBusiness,
  showPortfolioTab = false,
  portfolioViewActive = false,
  portfolioTabLocked = false,
  onSelectPortfolioView,
  onPortfolioLockedClick,
}: BusinessCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, businesses.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollTarget = portfolioViewActive
      ? el.querySelector<HTMLElement>('[data-bid="__portfolio__"]')
      : currentBusinessId
        ? el.querySelector<HTMLElement>(`[data-bid="${currentBusinessId}"]`)
        : null;
    if (scrollTarget) {
      const left = scrollTarget.offsetLeft - el.offsetLeft - 16;
      const isOutOfView =
        left < el.scrollLeft || left + scrollTarget.offsetWidth > el.scrollLeft + el.clientWidth;
      if (isOutOfView) {
        el.scrollTo({ left: left - 8, behavior: 'smooth' });
      }
    }
  }, [currentBusinessId, portfolioViewActive]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -260 : 260, behavior: 'smooth' });
  }, []);

  if (businesses.length === 0) return null;

  return (
    <div className="relative group/carousel -mx-1">
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-1 w-8 bg-gradient-to-r from-[var(--v-surface,#f5f7fb)] dark:from-slate-900 to-transparent z-[5] pointer-events-none rounded-l-xl" />
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-[var(--v-surface,#f5f7fb)] dark:from-slate-900 to-transparent z-[5] pointer-events-none rounded-r-xl" />
      )}

      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-1 px-1 scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {showPortfolioTab && (onSelectPortfolioView || portfolioTabLocked) ? (
          <button
            type="button"
            data-bid="__portfolio__"
            onClick={() => {
              if (portfolioTabLocked) {
                onPortfolioLockedClick?.();
                return;
              }
              onSelectPortfolioView?.();
            }}
            className={`snap-start flex-shrink-0 w-[200px] p-3.5 rounded-2xl border transition-all duration-200 text-left group/card hover:shadow-md hover:-translate-y-0.5 ${
              portfolioTabLocked
                ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 opacity-90 cursor-pointer'
                : portfolioViewActive
                  ? 'border-[var(--v-blue,#2563eb)] bg-blue-50/70 dark:bg-blue-950/30 shadow-sm shadow-blue-200/40 dark:shadow-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-700'
            }`}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  portfolioTabLocked
                    ? 'bg-slate-400 dark:bg-slate-600'
                    : portfolioViewActive
                      ? 'bg-[var(--v-blue,#2563eb)]'
                      : 'bg-[linear-gradient(135deg,#22c55e_0%,#14b8a6_52%,#2563eb_100%)]'
                }`}
              >
                {portfolioTabLocked ? (
                  <Lock className="w-4 h-4 text-white" />
                ) : (
                  <LayoutGrid className="w-4 h-4 text-white" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-xs font-bold truncate transition-colors tracking-tight ${
                    portfolioTabLocked
                      ? 'text-slate-500 dark:text-slate-400'
                      : portfolioViewActive
                        ? 'text-[var(--v-blue,#2563eb)]'
                        : 'text-slate-900 dark:text-slate-100 group-hover/card:text-[var(--v-blue,#2563eb)]'
                  }`}
                >
                  Visión general
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {portfolioTabLocked ? 'Requiere plan Pro' : 'Grupo · todas'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-md ${
                  portfolioTabLocked
                    ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    : 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                }`}
              >
                {portfolioTabLocked ? 'Pro' : 'Portfolio'}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {businesses.length} empresas
              </span>
              {portfolioViewActive && !portfolioTabLocked && (
                <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-[var(--v-blue,#2563eb)] text-white">
                  Activa
                </span>
              )}
            </div>
          </button>
        ) : null}

        {businesses.map((business) => {
          const isActive = !portfolioViewActive && currentBusinessId === business.business_id;
          const initials = business.name.slice(0, 2).toUpperCase();
          const typeLabel =
            BUSINESS_TYPE_LABELS[business.businessType] || business.businessType;
          const typeColor =
            BUSINESS_TYPE_COLORS[business.businessType] ||
            'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
          const employeeCount = business.members?.length || 0;

          return (
            <button
              key={business.business_id}
              data-bid={business.business_id}
              type="button"
              onClick={() => onSwitchBusiness(business.business_id)}
              className={`snap-start flex-shrink-0 w-[200px] p-3.5 rounded-2xl border transition-all duration-200 text-left group/card hover:shadow-md hover:-translate-y-0.5 ${
                isActive
                  ? 'border-[var(--v-blue,#2563eb)] bg-blue-50/70 dark:bg-blue-950/25 shadow-sm shadow-blue-200/40 dark:shadow-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-700'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${
                  isActive ? 'bg-[var(--v-blue,#2563eb)]' : 'bg-slate-900 dark:bg-slate-700'
                }`}>
                  {business.logo ? (
                    <img
                      src={business.logo}
                      alt=""
                      className="w-9 h-9 object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-white">
                      {initials}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-bold truncate transition-colors tracking-tight ${
                      isActive
                        ? 'text-[var(--v-blue,#2563eb)]'
                        : 'text-slate-900 dark:text-slate-100 group-hover/card:text-[var(--v-blue,#2563eb)]'
                    }`}
                  >
                    {business.name}
                  </p>
                  {business.city && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5 truncate">
                      <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                      {business.city}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-md ${typeColor}`}
                >
                  {typeLabel}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                  <Users className="w-2.5 h-2.5" />
                  {employeeCount}
                </span>
                {isActive && (
                  <span className="ml-auto px-1.5 py-0.5 bg-[var(--v-blue,#2563eb)] text-white text-[9px] font-semibold rounded-md">
                    Esta empresa
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 z-10 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-[var(--v-blue,#2563eb)] transition-all opacity-0 group-hover/carousel:opacity-100"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1.5 z-10 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-[var(--v-blue,#2563eb)] transition-all opacity-0 group-hover/carousel:opacity-100"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
