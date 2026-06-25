import { createPortal } from 'react-dom';
import { useEffect, type ReactNode } from 'react';

/** Modal TPV en document.body: evita que overflow-hidden del shell bloquee el scroll táctil. */
export function TpvModalRoot({
  children,
  className = 'fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6',
}: {
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return createPortal(<div className={className}>{children}</div>, document.body);
}
