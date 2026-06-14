import { useEffect, useState } from 'react';

/** Reloj local para repintar tiempos transcurridos sin recargar el API. */
export function useLiveClock(intervalMs = 30_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}
