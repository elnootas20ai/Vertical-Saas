import { useEffect, useState, type ReactNode } from 'react';
import { useInViewOnce } from '../../hooks/useInViewOnce';

type Props = {
  children: ReactNode;
  /** Contenido mientras no entra en vista (skeleton / hint). */
  placeholder?: ReactNode;
  className?: string;
  rootMargin?: string;
  /** En md+ monta ya (sin esperar scroll). */
  eagerFromMd?: boolean;
};

function useEagerFromMd(eagerFromMd: boolean): boolean {
  const [eager, setEager] = useState(false);
  useEffect(() => {
    if (!eagerFromMd || typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setEager(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [eagerFromMd]);
  return eager;
}

/**
 * No monta hijos hasta que el bloque se acerca al viewport (móvil).
 * En desktop (md+) puede montar al instante si eagerFromMd.
 */
export function MobileLazySection({
  children,
  placeholder,
  className,
  rootMargin = '180px 0px',
  eagerFromMd = true,
}: Props) {
  const eager = useEagerFromMd(eagerFromMd);
  const { ref, visible } = useInViewOnce({ rootMargin, disabled: eager });

  return (
    <div ref={ref} className={className}>
      {visible
        ? children
        : placeholder ?? (
            <div className="flex min-h-[72px] items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-4 text-[11px] text-stone-400 dark:border-stone-800 dark:bg-stone-950/40">
              Desliza para cargar…
            </div>
          )}
    </div>
  );
}
