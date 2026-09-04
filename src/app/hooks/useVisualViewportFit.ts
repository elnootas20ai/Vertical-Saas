import { useEffect, useState, type CSSProperties, type RefObject } from 'react';

type VisualViewportFit = {
  /** Estilo a aplicar al contenedor a pantalla completa (TPV tablet/móvil). */
  style: CSSProperties | undefined;
  /** Teclado virtual abierto (o viewport muy reducido). */
  keyboardOpen: boolean;
};

const KEYBOARD_INSET_PX = 72;

export function scrollTpvFieldIntoView(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  } catch {
    try {
      el.scrollIntoView(false);
    } catch {
      /* ignore */
    }
  }
}

export function isTpvKeyboardField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'range', 'color'].includes(type);
}

/**
 * En iPad/Capacitor el teclado tapa el layout `100svh` sin redimensionarlo.
 * Encoge el shell al `visualViewport` visible para que campo + resultados sigan arriba.
 */
export function useVisualViewportFit(enabled: boolean): VisualViewportFit {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setStyle(undefined);
      setKeyboardOpen(false);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) {
      setStyle(undefined);
      setKeyboardOpen(false);
      return;
    }

    const update = () => {
      const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
      const visibleH = Math.round(vv.height);
      const offsetTop = Math.round(vv.offsetTop || 0);
      const inset = Math.max(0, layoutH - visibleH - offsetTop);
      const open = inset >= KEYBOARD_INSET_PX && visibleH > 0;
      setKeyboardOpen(open);
      if (!open) {
        setStyle(undefined);
        return;
      }
      setStyle({
        height: `${visibleH}px`,
        maxHeight: `${visibleH}px`,
        // Mantiene el UI en la zona visible si iOS desplaza el visual viewport.
        transform: offsetTop > 0 ? `translateY(${offsetTop}px)` : undefined,
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return { style, keyboardOpen };
}

/** Al enfocar cualquier input/textarea dentro del root, lo acerca al viewport visible. */
export function useTpvKeyboardFocusScroll(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;
    const onFocusIn = (e: FocusEvent) => {
      if (!isTpvKeyboardField(e.target)) return;
      const el = e.target;
      window.setTimeout(() => scrollTpvFieldIntoView(el), 60);
      window.setTimeout(() => scrollTpvFieldIntoView(el), 280);
    };
    root.addEventListener('focusin', onFocusIn);
    return () => root.removeEventListener('focusin', onFocusIn);
  }, [enabled, rootRef]);
}
