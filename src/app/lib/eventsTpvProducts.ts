/**
 * Productos de cobro en evento (Servicios → Productos).
 * Fuente única para TPV / carga PDV / plan del día — no es el catálogo delivery.
 */
import { createVerticalApi, type VerticalEntity } from './verticalApiFactory';

/** IVA comida / catering reducido (España). Default al alta de producto. */
export const EVENTS_TPV_DEFAULT_TAX_RATE = 10;

export const EVENTS_TPV_TAX_OPTIONS = [
  { value: 10, label: '10% — comida / catering' },
  { value: 21, label: '21% — general' },
] as const;

export type EventsTpvProduct = VerticalEntity & {
  nombre: string;
  precio: number;
  /** % IVA (0–100). Vacío o inválido → 10% comida. */
  taxRate?: number;
  iva?: number;
  descripcion?: string;
  activo?: boolean;
  deletedAt?: string | null;
};

const api = createVerticalApi<EventsTpvProduct>('events', 'tpv_products');

export function eventsTpvProductsApi() {
  return api;
}

/** % IVA de producto evento. Vacío/inválido → 10% comida. Acepta cualquier % 0–100. */
export function normalizeEventsTpvTaxRate(raw: unknown): number {
  const n =
    typeof raw === 'string'
      ? Number(String(raw).trim().replace(',', '.'))
      : Number(raw);
  if (!Number.isFinite(n) || n < 0) return EVENTS_TPV_DEFAULT_TAX_RATE;
  const rounded = Math.round(n);
  if (rounded > 100) return EVENTS_TPV_DEFAULT_TAX_RATE;
  if (rounded >= 0 && rounded <= 100) return rounded;
  return EVENTS_TPV_DEFAULT_TAX_RATE;
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

export function eventsTpvProductTaxRate(p: EventsTpvProduct): number {
  return normalizeEventsTpvTaxRate(p.taxRate ?? p.iva);
}
