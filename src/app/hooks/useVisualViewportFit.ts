import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

type VisualViewportFit = {
  /** Estilo a aplicar al contenedor a pantalla completa (TPV tablet/móvil). */
  style: CSSProperties | undefined;
  /** Teclado virtual abierto (o viewport muy reducido). */
  keyboardOpen: boolean;
};

const KEYBOARD_INSET_PX = 72;
/** Ignora micro-cambios del teclado (barra de sugerencias iOS) que marean el TPV. */
const STABLE_HEIGHT_PX = 56;
const STABLE_OFFSET_PX = 28;

export const TPV_MODAL_CHANGE_EVENT = 'vertial:tpv-modal-change';

export function isTpvModalUiOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('[data-tpv-modal-root]'));
}

export function scrollTpvFieldIntoView(el: HTMLElement): void {
  // Dentro de modales fixed/portal: scrollIntoView mueve toda la tablet en iOS.
  if (el.closest('[role="dialog"], [data-tpv-modal-root]')) return;
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

function readViewportMetrics(): {
  open: boolean;
  visibleH: number;
  offsetTop: number;
} {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return { open: false, visibleH: 0, offsetTop: 0 };
  const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
  const visibleH = Math.round(vv.height);
  const offsetTop = Math.round(vv.offsetTop || 0);
  const inset = Math.max(0, layoutH - visibleH - offsetTop);
  const open = inset >= KEYBOARD_INSET_PX && visibleH > 0;
  return { open, visibleH, offsetTop };
}

/**
 * En iPad/Capacitor el teclado tapa el layout `100svh` sin redimensionarlo.
 * Encoge el shell al `visualViewport` visible para que campo + resultados sigan arriba.
 *
 * Con modal TPV abierto: no toca el chrome de fondo (evita saltos al buscar ingredientes).
 */
export function useVisualViewportFit(enabled: boolean): VisualViewportFit {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const lastHRef = useRef<number | null>(null);
  const lastTopRef = useRef(0);
  const openRef = useRef(false);
  const hasStyleRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setStyle(undefined);
      setKeyboardOpen(false);
      lastHRef.current = null;
      openRef.current = false;
      hasStyleRef.current = false;
      return;
    }
    if (!window.visualViewport) {
      setStyle(undefined);
      setKeyboardOpen(false);
      return;
    }

    const setOpen = (open: boolean) => {
      if (openRef.current === open) return;
      openRef.current = open;
      setKeyboardOpen(open);
    };

    const clearFit = () => {
      lastHRef.current = null;
      lastTopRef.current = 0;
      if (hasStyleRef.current) {
        hasStyleRef.current = false;
        setStyle(undefined);
      }
    };

    const apply = () => {
      // Modal encima: el fondo no debe redimensionarse (mareo al filtrar ingredientes).
      if (isTpvModalUiOpen()) {
        clearFit();
        setOpen(readViewportMetrics().open);
        return;
      }

      const { open, visibleH, offsetTop } = readViewportMetrics();
      setOpen(open);
      if (!open) {
        clearFit();
        return;
      }
      const prevH = lastHRef.current;
      if (
        prevH != null
        && Math.abs(prevH - visibleH) < STABLE_HEIGHT_PX
        && Math.abs(lastTopRef.current - offsetTop) < STABLE_OFFSET_PX
      ) {
        return;
      }
      lastHRef.current = visibleH;
      lastTopRef.current = offsetTop;
      hasStyleRef.current = true;
      setStyle({
        height: `${visibleH}px`,
        maxHeight: `${visibleH}px`,
        transform: offsetTop > 0 ? `translateY(${offsetTop}px)` : undefined,
      });
    };

    apply();
    const vv = window.visualViewport;
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    window.addEventListener(TPV_MODAL_CHANGE_EVENT, apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener(TPV_MODAL_CHANGE_EVENT, apply);
    };
  }, [enabled]);

  return { style, keyboardOpen };
}

/**
 * Altura del sheet TPV con teclado: fija en clase CSS; aquí solo limita al visualViewport
 * cuando el teclado está abierto (sin micro-saltos).
 */
export function useTpvModalSheetFit(enabled = true): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  const lastHRef = useRef<number | null>(null);
  const hasStyleRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setStyle(undefined);
      hasStyleRef.current = false;
      return;
    }
    const vv = window.visualViewport;
    const apply = () => {
      const { open, visibleH } = readViewportMetrics();
      if (!open) {
        lastHRef.current = null;
        if (hasStyleRef.current) {
          hasStyleRef.current = false;
          setStyle(undefined);
        }
        return;
      }
      const next = Math.max(280, visibleH - 8);
      const prev = lastHRef.current;
      if (prev != null && Math.abs(prev - next) < STABLE_HEIGHT_PX) return;
      lastHRef.current = next;
      hasStyleRef.current = true;
      setStyle({
        height: `${next}px`,
        maxHeight: `${next}px`,
      });
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
    };
  }, [enabled]);

  return style;
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
      // Buscador de carta: ya está arriba; scrollIntoView marea en tablet.
      if (e.target instanceof HTMLElement && e.target.id === 'tpv-product-search') return;
      const el = e.target;
      window.setTimeout(() => scrollTpvFieldIntoView(el), 60);
    };
    root.addEventListener('focusin', onFocusIn);
    return () => root.removeEventListener('focusin', onFocusIn);
  }, [enabled, rootRef]);
}
