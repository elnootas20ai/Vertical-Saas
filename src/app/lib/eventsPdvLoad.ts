/**
 * Carga del PDV de eventos (fijo o temporal sin evento ligado):
 * productos/servicios que se venden en ese TPV, con cantidad y precio.
 * No es un almacén de negocio: es la “carga” del puesto.
 */
export type EventsPdvLoadLine = {
  catalogItemId: string;
  name: string;
  qty: number;
  unitPrice: number;
};

export function normalizeEventsPdvLoad(raw: unknown): EventsPdvLoadLine[] {
  if (!Array.isArray(raw)) return [];
  const out: EventsPdvLoadLine[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const catalogItemId = String(r.catalogItemId || r.id || '').trim();
    if (!catalogItemId || seen.has(catalogItemId)) continue;
    seen.add(catalogItemId);
    const qty = Math.max(0, Math.floor(Number(r.qty ?? r.quantity) || 0));
    const unitPrice = Math.max(0, Math.round(Number(r.unitPrice ?? r.price) * 100) / 100 || 0);
    const name = String(r.name || r.concepto || '').trim() || catalogItemId;
    out.push({ catalogItemId, name, qty, unitPrice });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function eventsPdvLoadAllowlist(load: EventsPdvLoadLine[] | null | undefined): string[] | null {
  if (load == null) return null;
  return load.map((l) => l.catalogItemId).filter(Boolean);
}

export function eventsPdvLoadPriceMap(load: EventsPdvLoadLine[] | null | undefined): Record<string, number> | null {
  if (load == null || load.length === 0) return null;
  const map: Record<string, number> = {};
  for (const line of load) {
    if (!(line.unitPrice >= 0)) continue;
    map[line.catalogItemId] = line.unitPrice;
  }
  return Object.keys(map).length ? map : null;
}
