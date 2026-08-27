import { useEffect, useState } from 'react';

/**
 * Retrasa la actualización de un valor hasta que hayan pasado `delay` ms
 * sin cambios. Útil para evitar cálculos o peticiones en cada keystroke.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    if (delay <= 0) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
