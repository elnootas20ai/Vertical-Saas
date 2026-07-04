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
  events: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  carDealership: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  workshop: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  delivery: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  restaurant: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  cleaning: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  hairSalon: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  gym: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  clinic: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  hotel: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  construction: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  academy: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  realEstate: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  lawyer: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  nightclub: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
  scrapyard: 'bg-stone-100 text-stone-700 dark:bg-stone-900/40 dark:text-stone-300',
  spareParts: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300',
  taxi: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
  pharmacy: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  carWash: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  vet: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  tobaccoShop: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  butcherShop: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
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
      {/* Fade edges */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-1 w-8 bg-gradient-to-r from-gray-50 dark:from-gray-900 to-transparent z-[5] pointer-events-none rounded-l-xl" />
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent z-[5] pointer-events-none rounded-r-xl" />
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
            className={`snap-start flex-shrink-0 w-[200px] p-3.5 rounded-xl border-2 transition-all duration-200 text-left group/card hover:shadow-md hover:-translate-y-0.5 ${
              portfolioTabLocked
                ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 opacity-90 cursor-pointer'
                : portfolioViewActive
                  ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/30 shadow-sm shadow-indigo-200/50 dark:shadow-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-200 dark:hover:border-indigo-700'
            }`}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  portfolioTabLocked
                    ? 'bg-gray-400 dark:bg-gray-600'
                    : portfolioViewActive
                      ? 'bg-indigo-600 dark:bg-indigo-500'
                      : 'bg-gradient-to-br from-indigo-600 to-violet-600'
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
                  className={`text-xs font-bold truncate transition-colors ${
                    portfolioTabLocked
                      ? 'text-gray-500 dark:text-gray-400'
                      : portfolioViewActive
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-900 dark:text-gray-100 group-hover/card:text-indigo-700 dark:group-hover/card:text-indigo-300'
                  }`}
                >
                  Visión general
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                  {portfolioTabLocked ? 'Requiere plan Pro' : 'Todas las empresas'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-md ${
                  portfolioTabLocked
                    ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                }`}
              >
                {portfolioTabLocked ? 'Pro' : 'Portfolio'}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {businesses.length} empresas
              </span>
              {portfolioViewActive && !portfolioTabLocked && (
                <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-indigo-600 text-white">
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
            'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
          const employeeCount = business.members?.length || 0;

          return (
            <button
              key={business.business_id}
              data-bid={business.business_id}
              type="button"
              onClick={() => onSwitchBusiness(business.business_id)}
              className={`snap-start flex-shrink-0 w-[200px] p-3.5 rounded-xl border-2 transition-all duration-200 text-left group/card hover:shadow-md hover:-translate-y-0.5 ${
                isActive
                  ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 shadow-sm shadow-amber-200/50 dark:shadow-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-900 dark:bg-gray-700 overflow-hidden">
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
                    className={`text-xs font-bold truncate transition-colors ${
                      isActive
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-gray-900 dark:text-gray-100 group-hover/card:text-amber-700 dark:group-hover/card:text-amber-300'
                    }`}
                  >
                    {business.name}
                  </p>
                  {business.city && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-0.5 truncate">
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
                <span className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                  <Users className="w-2.5 h-2.5" />
                  {employeeCount}
                </span>
                {isActive && (
                  <span className="ml-auto px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[9px] font-semibold rounded-md">
                    Activa
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Navigation arrows */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 z-10 w-7 h-7 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-all opacity-0 group-hover/carousel:opacity-100"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1.5 z-10 w-7 h-7 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-all opacity-0 group-hover/carousel:opacity-100"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
