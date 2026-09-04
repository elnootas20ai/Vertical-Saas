import { createPortal } from 'react-dom';
import { useEffect, type ReactNode } from 'react';
import { TPV_MODAL_CHANGE_EVENT } from '../../../hooks/useVisualViewportFit';

/** Baja el teclado virtual sin cerrar el modal (tap fuera en tablet). */
export function dismissTpvKeyboard() {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}

function notifyTpvModalChange() {
  try {
    window.dispatchEvent(new Event(TPV_MODAL_CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

/** Modal TPV en document.body: evita que overflow-hidden del shell bloquee el scroll táctil.
 * z-[210] por encima del panel carta restaurant (z-55) y otros shells del gate.
 */
export function TpvModalRoot({
  children,
  className = 'fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-6',
}: {
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    notifyTpvModalChange();
    return () => {
      document.body.style.overflow = prevOverflow;
      // Tras desmontar el portal, avisar para restaurar el fit del chrome.
      queueMicrotask(() => notifyTpvModalChange());
    };
  }, []);

  return createPortal(
    <div className={className} data-tpv-modal-root="">
      {children}
    </div>,
    document.body,
  );
}
