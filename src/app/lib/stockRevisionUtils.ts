import type { StockCount } from './stockCountApi';

export function formatStockDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatStockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function countDiscrepancies(count: StockCount): number {
  return count.lines.filter((l) => l.countedStock !== null && l.difference !== 0).length;
}

export function groupCountsByDay(counts: StockCount[]): { dayKey: string; dayLabel: string; counts: StockCount[] }[] {
  const map = new Map<string, { dayLabel: string; counts: StockCount[] }>();
  for (const c of counts) {
    const iso = c.completedAt || c.updatedAt || c.createdAt;
    const d = new Date(iso);
    const dayKey = Number.isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10);
    const dayLabel = Number.isNaN(d.getTime())
      ? 'Sin fecha'
      : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const entry = map.get(dayKey) || { dayLabel, counts: [] };
    entry.counts.push(c);
    map.set(dayKey, entry);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, { dayLabel, counts: dayCounts }]) => ({
      dayKey,
      dayLabel,
      counts: dayCounts.sort(
        (a, b) =>
          new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime(),
      ),
    }));
}
