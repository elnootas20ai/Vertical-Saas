import { useEffect, useState, type ReactNode } from 'react';
import { useInViewOnce } from '../../../hooks/useInViewOnce';

type Props = {
  title: string;
  hint?: string;
  icon?: ReactNode;
  children: ReactNode;
  ready?: boolean;
  minHeight?: number;
  rootMargin?: string;
  skeleton?: ReactNode;
  className?: string;
};

function SectionPlaceholder({
  title,
  hint,
  icon,
}: Pick<Props, 'title' | 'hint' | 'icon'>) {
  return (
    <section
      className="animate-pulse rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900"
      aria-busy="true"
      aria-label={`Cargando ${title}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-blue-600 dark:bg-stone-800 dark:text-blue-300">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">{title}</p>
          {hint ? <p className="mt-0.5 truncate text-[11px] text-stone-500">{hint}</p> : null}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-16 rounded-xl border border-stone-100 bg-stone-50 dark:border-stone-800 dark:bg-stone-950/50"
          />
        ))}
      </div>
      <div className="mt-3 h-20 rounded-xl bg-stone-50 dark:bg-stone-950/50" />
    </section>
  );
}

/**
 * Carga progresiva exclusiva del dashboard Restaurant.
 * Reserva espacio, monta el panel al acercarse al viewport y lo revela sin acordeones.
 */
export function RestaurantProgressiveSection({
  title,
  hint,
  icon,
  children,
  ready = true,
  minHeight = 180,
  rootMargin = '320px 0px',
  skeleton,
  className = '',
}: Props) {
  const { ref, visible } = useInViewOnce({ rootMargin });
  const shouldMount = visible && ready;
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!shouldMount) {
      setEntered(false);
      return;
    }
    if (typeof requestAnimationFrame === 'undefined') {
      setEntered(true);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [shouldMount]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ minHeight }}
      data-restaurant-progressive-section={title}
    >
      {shouldMount ? (
        <div
          className={`origin-top transform-gpu transition-[opacity,transform] duration-500 motion-reduce:transform-none motion-reduce:transition-none ${
            entered ? 'translate-y-0 scale-y-100 opacity-100' : 'translate-y-2 scale-y-[0.985] opacity-0'
          }`}
        >
          {children}
        </div>
      ) : (
        skeleton ?? <SectionPlaceholder title={title} hint={hint} icon={icon} />
      )}
    </div>
  );
}
