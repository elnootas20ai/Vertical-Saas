import type { CatalogItem } from '../../lib/deliveryApi';

export type HeladeriaTpvProduct = {
  id: string;
  catalogId: string;
  name: string;
  price: number;
  category: string;
  unit: string;
};

export type HeladeriaCartLine = HeladeriaTpvProduct & { qty: number };

export type HeladeriaSaleTicket = {
  id: string;
  at: string;
  atIso: string;
  total: number;
  pdvId: string | null;
  pdvLabel: string;
  clientId?: string;
  clientName?: string;
  lines: { catalogId: string; name: string; qty: number; price: number }[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Productos activos vendibles para el TPV heladería. */
export function mapCatalogToHeladeriaProducts(items: CatalogItem[]): HeladeriaTpvProduct[] {
  const out: HeladeriaTpvProduct[] = [];
  for (const item of items) {
    if (item.active === false || item.available === false) continue;
    if (item.itemType !== 'product' && item.itemType !== 'combo') continue;
    const price = round2(Number(item.unitPrice) || 0);
    if (price <= 0) continue;
    const id = String(item._id || item.id || '').trim();
    const name = String(item.name || '').trim();
    if (!id || !name) continue;
    out.push({
      id,
      catalogId: id,
      name,
      price,
      category: String(item.category || 'Otros').trim() || 'Otros',
      unit: String(item.unit || 'ud').trim() || 'ud',
    });
  }
  out.sort((a, b) => {
    const cat = a.category.localeCompare(b.category, 'es');
    if (cat !== 0) return cat;
    return a.name.localeCompare(b.name, 'es');
  });
  return out;
}

export function uniqueHeladeriaCategories(products: HeladeriaTpvProduct[]): string[] {
  const set = new Set<string>();
  for (const p of products) set.add(p.category);
  return Array.from(set);
}

function ticketsStorageKey(businessId: string, pdvId: string): string {
  const bid = String(businessId || '').replace(/^business:/, '').trim() || 'none';
  const pid = String(pdvId || '').trim() || 'none';
  return `vertial:heladeria-tpv-tickets:${bid}:${pid}`;
}

export function readHeladeriaSessionTickets(
  businessId: string,
  pdvId: string,
): HeladeriaSaleTicket[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(ticketsStorageKey(businessId, pdvId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HeladeriaSaleTicket[];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function writeHeladeriaSessionTickets(
  businessId: string,
  pdvId: string,
  tickets: HeladeriaSaleTicket[],
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      ticketsStorageKey(businessId, pdvId),
      JSON.stringify(tickets.slice(0, 40)),
    );
  } catch {
    /* quota */
  }
}
