import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Se pone a true la primera vez que el nodo entra en viewport (o cerca).
 * Sirve para diferir fetch/UI en móvil al bajar.
 */
export function useInViewOnce(options?: {
  rootMargin?: string;
  /** Si true, se considera ya visible (p. ej. desktop o refresh forzado). */
  enabled?: boolean;
  disabled?: boolean;
}) {
  const enabled = options?.enabled !== false;
  const disabled = options?.disabled === true;
  const rootMargin = options?.rootMargin ?? '160px 0px';
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(disabled || !enabled);

  useEffect(() => {
    if (disabled || !enabled) {
      setVisible(true);
      return;
    }
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disabled, enabled, rootMargin, visible]);

  return { ref, visible };
}

/**
 * Pagina una lista: muestra `pageSize` y va añadiendo al acercarse al final.
 */
export function useScrollPagination<T>(items: T[], pageSize = 5) {
  const [limit, setLimit] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | HTMLLIElement | null>(null);
  const itemsLen = items.length;
  const itemsKey = useMemo(
    () => items.map((it) => (it as { businessId?: string })?.businessId || '').join('|'),
    [items],
  );

  useEffect(() => {
    setLimit(pageSize);
  }, [itemsKey, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (limit >= itemsLen) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setLimit((n) => {
          if (n >= itemsLen) return n;
          return Math.min(itemsLen, n + pageSize);
        });
      },
      { root: null, rootMargin: '240px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [limit, itemsLen, pageSize]);

  const visibleItems = items.slice(0, limit);
  const hasMore = limit < itemsLen;

  return { visibleItems, hasMore, sentinelRef, shown: limit, total: itemsLen };
}
