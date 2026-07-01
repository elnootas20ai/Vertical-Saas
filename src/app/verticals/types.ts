import type { BusinessType } from '../lib/businessApi';

/** Contrato de un vertical del SaaS (delivery, compraventa, …). */
export type VerticalModuleId = 'delivery' | 'compraventa';

export interface VerticalModuleDefinition {
  id: VerticalModuleId;
  businessType: BusinessType;
  /** Prefijos de ruta React (sin dominio). */
  routePrefixes: readonly string[];
  /** Carpetas de código que pertenecen SOLO a este vertical. */
  codeRoots: readonly string[];
  /**
   * Imports permitidos desde OTROS verticales hacia infra compartida con nombre legacy.
   * No añadir aquí pantallas, hooks ni lógica de negocio delivery/compraventa.
   */
  legacySharedImports: readonly string[];
}
