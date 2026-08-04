import type { BusinessType } from '../lib/businessApi';
import { BUTCHER_MODULE } from './butcher/module';
import { COMPRAVENTA_MODULE } from './compraventa/module';
import { DELIVERY_MODULE } from './delivery/module';
import { RESTAURANT_MODULE } from './restaurant/module';
import type { VerticalModuleDefinition, VerticalModuleId } from './types';

/** Registro único de verticales — no mezclar lógica entre entradas.
 *  Scope de tiendas/PDV: src/app/verticals/retailScopeRegistry.ts */
export const VERTICAL_MODULES: Record<VerticalModuleId, VerticalModuleDefinition> = {
  delivery: DELIVERY_MODULE,
  restaurant: RESTAURANT_MODULE,
  compraventa: COMPRAVENTA_MODULE,
  butcher: BUTCHER_MODULE,
};

const BY_BUSINESS_TYPE = new Map<BusinessType, VerticalModuleDefinition>();
for (const mod of Object.values(VERTICAL_MODULES)) {
  BY_BUSINESS_TYPE.set(mod.businessType, mod);
}

export function getVerticalModule(id: VerticalModuleId): VerticalModuleDefinition {
  return VERTICAL_MODULES[id];
}

export function getVerticalModuleByBusinessType(
  businessType: BusinessType | string | null | undefined,
): VerticalModuleDefinition | null {
  if (!businessType) return null;
  return BY_BUSINESS_TYPE.get(businessType as BusinessType) ?? null;
}

/** Imports legacy compartidos (PDV/tiendas) — permitidos entre verticales retail. */
export function isLegacySharedCrossVerticalImport(specifier: string): boolean {
  const base = specifier.replace(/^.*\//, '').replace(/\.(tsx?|jsx?)$/, '');
  return Object.values(VERTICAL_MODULES).some((m) =>
    m.legacySharedImports.some((allowed) => base === allowed || specifier.includes(`/${allowed}`)),
  );
}
