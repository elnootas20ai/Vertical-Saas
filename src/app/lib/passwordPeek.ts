import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Mantener pulsado para ver la contraseña sin perder el caret.
 * Cambiar type password↔text resetea la selección en Chromium; la restauramos.
 */
export function createPasswordPeekHandler(setPeek: (peek: boolean) => void) {
  return (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const wrap = e.currentTarget.closest('[data-acceso-input-wrap]');
    const input = wrap?.querySelector('input') as HTMLInputElement | null;
    const start = input?.selectionStart ?? null;
    const end = input?.selectionEnd ?? null;

    setPeek(true);

    const restoreCaret = () => {
      if (!input || start == null || end == null) return;
      try {
        input.focus({ preventScroll: true });
        input.setSelectionRange(start, end);
      } catch {
        /* ignore */
      }
    };

    const hide = () => {
      setPeek(false);
      requestAnimationFrame(() => requestAnimationFrame(restoreCaret));
      window.removeEventListener('pointerup', hide);
      window.removeEventListener('pointercancel', hide);
    };

    window.addEventListener('pointerup', hide);
    window.addEventListener('pointercancel', hide);
  };
}
