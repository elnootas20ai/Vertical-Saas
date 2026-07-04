import type { Business } from './businessApi';
import { getVerticalModuleByBusinessType } from '../verticals/registry';

/** Misma vertical de código (delivery ≠ restaurant ≠ compraventa). */
export function sameVerticalModule(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const modA = getVerticalModuleByBusinessType(a);
  const modB = getVerticalModuleByBusinessType(b);
  if (modA && modB) return modA.id === modB.id;
  return String(a || '').trim() === String(b || '').trim();
}

/** Cuenta con más de un módulo vertical (p. ej. delivery + restaurant). */
export function hasMixedVerticalModules(
  businesses: Array<{ businessType?: string | null }>,
): boolean {
  const ids = new Set<string>();
  for (const b of businesses) {
    const mod = getVerticalModuleByBusinessType(b.businessType);
    if (mod) ids.add(mod.id);
  }
  return ids.size > 1;
}

/** @deprecated No usar en selectores de empresa — el usuario debe ver todas sus empresas. */
export function filterBusinessesForActiveVertical(
  businesses: Business[],
  active: Business | null | undefined,
): Business[] {
  if (!active?.businessType || businesses.length <= 1) return businesses;
  return businesses.filter((b) => sameVerticalModule(b.businessType, active.businessType));
}
