import { useEffect, useMemo, useState } from 'react';
import { fetchLaborCost } from '../../../../lib/clockinsApi';

function currentMonthBounds() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(y, m + 1, 0).getDate();
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(last)}`,
  };
}

/** Coste empresa (pago trabajadores) por businessId · mes en curso. */
export function useCeoLaborCosts(businessIds: string[]) {
  const month = useMemo(() => currentMonthBounds(), []);
  const key = useMemo(() => [...businessIds].filter(Boolean).sort().join('|'), [businessIds]);
  const [byBiz, setByBiz] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    if (!ids.length) {
      setByBiz({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetchLaborCost(id, { from: month.from, to: month.to });
            return [id, Number(res.summary?.actual_employer_cost) || 0] as const;
          } catch {
            return [id, 0] as const;
          }
        }),
      );
      if (!cancelled) {
        const next: Record<string, number> = {};
        for (const [id, amount] of entries) next[id] = amount;
        setByBiz(next);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, month.from, month.to]);

  return { laborByBiz: byBiz, laborLoading: loading };
}
