/**
 * Iconos de unidades de comida en cierre / apps — genéricos para delivery
 * (pizza · burger · taco). Emoji visible + Lucide opcional.
 * Import: desde `components/saas/delivery/` → `../../../lib/...`
 */
import type { LucideIcon } from 'lucide-react';
import { Pizza, Sandwich } from 'lucide-react';
import type { FoodFamilyKey } from '../../../lib/shiftFoodFamilyCounts';

type FoodUnitKey = FoodFamilyKey;

/** Taco: Lucide no trae uno; SVG al mismo grosor que Lucide. */
function TacoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 13c0 4.4 3.6 8 8 8s8-3.6 8-8" />
      <path d="M4 13c1.5-2 3.8-3 5.5-3 .9 0 1.7.3 2.5.8.8-.5 1.6-.8 2.5-.8 1.7 0 4 1 5.5 3" />
      <path d="M8.5 12.5c.4.8.5 1.6.5 2.5" />
      <path d="M12 11.5v3.5" />
      <path d="M15.5 12.5c-.4.8-.5 1.6-.5 2.5" />
    </svg>
  );
}

const META: Record<
  FoodFamilyKey,
  {
    label: string;
    labelShort: string;
    emoji: string;
    Icon: LucideIcon | typeof TacoIcon;
    tone: string;
    badge: string;
  }
> = {
  pizza: {
    label: 'Pizzas',
    labelShort: 'Pizza',
    emoji: '🍕',
    Icon: Pizza,
    tone: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800',
  },
  burger: {
    label: 'Burgers',
    labelShort: 'Burger',
    emoji: '🍔',
    Icon: Sandwich,
    tone: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-100 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800',
  },
  taco: {
    label: 'Tacos',
    labelShort: 'Tacos',
    emoji: '🌮',
    Icon: TacoIcon,
    tone: 'text-lime-700 dark:text-lime-400',
    badge: 'bg-lime-100 dark:bg-lime-950/50 border-lime-200 dark:border-lime-800',
  },
};

export function deliveryFoodUnitMeta(key: FoodFamilyKey | FoodUnitKey) {
  return META[key as FoodFamilyKey] || META.pizza;
}

/**
 * Icono de familia. Por defecto emoji (se lee bien en tablet/cierre).
 * `variant="line"` = trazo Lucide/SVG.
 */
export function DeliveryFoodUnitIcon({
  unit,
  className = 'w-4 h-4',
  muted = false,
  variant = 'emoji',
}: {
  unit: FoodFamilyKey | FoodUnitKey;
  className?: string;
  muted?: boolean;
  variant?: 'emoji' | 'line';
}) {
  const { Icon, tone, emoji, badge } = deliveryFoodUnitMeta(unit);
  if (variant === 'emoji') {
    const size =
      className.includes('w-5') || className.includes('h-5')
        ? 'text-base'
        : className.includes('w-3') || className.includes('h-3')
          ? 'text-sm'
          : 'text-[15px]';
    return (
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-center leading-none ${size} ${
          muted ? 'border-white/20 bg-white/10' : badge
        }`}
        aria-hidden
      >
        {emoji}
      </span>
    );
  }
  return <Icon className={`${className} shrink-0 ${muted ? 'text-current opacity-80' : tone}`} />;
}

/** Etiqueta con icono: para cabeceras y conteos del cierre. */
export function DeliveryFoodUnitLabel({
  unit,
  count,
  showCount = true,
  size = 'sm',
  muted = false,
}: {
  unit: FoodFamilyKey | FoodUnitKey;
  count?: number | string | null;
  showCount?: boolean;
  size?: 'xs' | 'sm' | 'md';
  muted?: boolean;
}) {
  const { label, labelShort } = deliveryFoodUnitMeta(unit);
  const iconClass = size === 'md' ? 'w-5 h-5' : size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const textSize = size === 'md' ? 'text-sm' : size === 'xs' ? 'text-[10px]' : 'text-[11px]';
  const hasCount = showCount && count !== undefined && count !== null && count !== '';
  return (
    <span className={`inline-flex items-center gap-1.5 font-bold ${textSize}`}>
      <DeliveryFoodUnitIcon unit={unit} className={iconClass} muted={muted} />
      <span>
        {hasCount ? (
          <>
            {labelShort} <span className="tabular-nums">{count}</span>
          </>
        ) : (
          label
        )}
      </span>
    </span>
  );
}

/** Orden fijo de familias en cierre delivery. */
export const DELIVERY_FOOD_UNIT_ORDER: FoodFamilyKey[] = ['pizza', 'burger', 'taco'];

export function deliveryFoodUnitTitle(key: FoodFamilyKey): string {
  return META[key].label;
}

/** Cabeceras Excel / billing → icono si coincide la key. */
export function foodUnitKeyFromBilling(key: string): FoodUnitKey | null {
  const k = String(key || '').trim();
  if (k === 'pizza' || k === 'burger' || k === 'taco') return k;
  return null;
}
