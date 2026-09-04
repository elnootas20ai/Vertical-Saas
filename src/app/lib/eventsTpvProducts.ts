/**
 * Productos de cobro en evento (Servicios → Productos).
 * Fuente única para TPV / carga PDV / plan del día — no es el catálogo delivery.
 */
import { createVerticalApi, type VerticalEntity } from './verticalApiFactory';

export type EventsTpvProduct = VerticalEntity & {
  nombre: string;
  precio: number;
  descripcion?: string;
  activo?: boolean;
  deletedAt?: string | null;
};

const api = createVerticalApi<EventsTpvProduct>('events', 'tpv_products');

export function eventsTpvProductsApi() {
  return api;
}

/** Activos, ordenados por nombre — listos para carta / qty del día. */
export async function listActiveEventsTpvProducts(userId: string): Promise<EventsTpvProduct[]> {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const items = await api.list(uid).catch(() => [] as EventsTpvProduct[]);
  return (items || [])
    .filter((p) => p.activo !== false && !p.deletedAt)
    .sort((a, b) =>
      String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'),
    );
}

export function eventsTpvProductId(p: EventsTpvProduct): string {
  return String(p._id || '').trim();
}

export function eventsTpvProductName(p: EventsTpvProduct): string {
  return String(p.nombre || '').trim() || eventsTpvProductId(p);
}

export function eventsTpvProductPrice(p: EventsTpvProduct): number {
  const n = Number(p.precio);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}
