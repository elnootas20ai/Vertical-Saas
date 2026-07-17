import type { PointOfSale } from '../deliveryApi';
import {
  DEFAULT_PRINTER_CONFIG,
  loadLegacyPrinterConfig,
  loadPdvPrinterCache,
  saveLegacyPrinterConfig,
  cachePdvPrinterConfig,
  type VertialPrinterConfig,
} from './printerConfig';
import {
  isVertialPrinterConfigConfigured,
  normalizeVertialPrinterConfig,
} from './printerConfigNormalize';

export interface ActivePrinterScope {
  pdvId?: string;
  terminalId?: string;
  pdv?: PointOfSale | null;
}

let activeScope: ActivePrinterScope = {};

export function setActivePrinterScope(scope: ActivePrinterScope): void {
  activeScope = {
    pdvId: scope.pdvId || undefined,
    terminalId: scope.terminalId || undefined,
    pdv: scope.pdv ?? undefined,
  };
}

export function clearActivePrinterScope(): void {
  activeScope = {};
}

export function getActivePrinterScope(): ActivePrinterScope {
  return activeScope;
}

export function resolveEffectivePrinterConfig(options?: {
  pdv?: PointOfSale | null;
  /** Permite resolver por caché de PDV sin tener el documento completo (p. ej. el PDV del pedido). */
  pdvId?: string | null;
  terminalId?: string | null;
  localFallback?: VertialPrinterConfig;
}): VertialPrinterConfig {
  const scope = options ?? {};
  const pdv = scope.pdv ?? activeScope.pdv ?? null;
  const terminalId = String(scope.terminalId ?? activeScope.terminalId ?? '').trim();
  const pdvId = String(scope.pdvId || pdv?._id || activeScope.pdvId || '').trim();
  const localFallback = scope.localFallback ?? loadLegacyPrinterConfig();
  const localCfg = normalizeVertialPrinterConfig(localFallback);

  // Orden: terminal → tienda (servidor) → caché por PDV → dispositivo.
  // Así la config del Panel admin / Ajustes por tienda llega al TPV de esa tienda.
  const terminal = terminalId
    ? pdv?.terminals?.find((t) => t.id === terminalId)
    : undefined;
  const terminalCfg = terminal?.printerConfig
    ? normalizeVertialPrinterConfig(terminal.printerConfig)
    : null;
  if (terminalCfg && isVertialPrinterConfigConfigured(terminalCfg)) {
    return terminalCfg;
  }

  const storeCfg = pdv?.printerConfig
    ? normalizeVertialPrinterConfig(pdv.printerConfig)
    : null;
  if (storeCfg && isVertialPrinterConfigConfigured(storeCfg)) {
    return storeCfg;
  }

  if (pdvId) {
    const cachedRaw = loadPdvPrinterCache(pdvId);
    if (cachedRaw) {
      const cached = normalizeVertialPrinterConfig(cachedRaw);
      if (isVertialPrinterConfigConfigured(cached)) {
        return cached;
      }
    }
  }

  // Sin config de tienda: IP de este dispositivo (tablet) como respaldo.
  if (isVertialPrinterConfigConfigured(localCfg)) {
    return localCfg;
  }

  return normalizeVertialPrinterConfig(localFallback || DEFAULT_PRINTER_CONFIG);
}

/** Config efectiva: terminal → tienda → caché → dispositivo. */
export function loadPrinterConfig(): VertialPrinterConfig {
  return resolveEffectivePrinterConfig();
}

export function savePrinterConfig(config: VertialPrinterConfig, pdvId?: string | null): void {
  saveLegacyPrinterConfig(config);
  const id = String(pdvId || activeScope.pdvId || activeScope.pdv?._id || '').trim();
  if (id) {
    cachePdvPrinterConfig(id, config);
  }
}
