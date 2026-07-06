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
  terminalId?: string | null;
  localFallback?: VertialPrinterConfig;
}): VertialPrinterConfig {
  const scope = options ?? {};
  const pdv = scope.pdv ?? activeScope.pdv ?? null;
  const terminalId = String(scope.terminalId ?? activeScope.terminalId ?? '').trim();
  const pdvId = String(pdv?._id || activeScope.pdvId || '').trim();
  const localFallback = scope.localFallback ?? loadLegacyPrinterConfig();

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
    const cached = loadPdvPrinterCache(pdvId);
    if (cached && isVertialPrinterConfigConfigured(cached)) {
      return cached;
    }
  }

  return normalizeVertialPrinterConfig(localFallback || DEFAULT_PRINTER_CONFIG);
}

/** Config efectiva según terminal → tienda → caché local → legacy del dispositivo. */
export function loadPrinterConfig(): VertialPrinterConfig {
  return resolveEffectivePrinterConfig();
}

export function savePrinterConfig(config: VertialPrinterConfig): void {
  saveLegacyPrinterConfig(config);
  const pdvId = String(activeScope.pdvId || activeScope.pdv?._id || '').trim();
  if (pdvId) {
    cachePdvPrinterConfig(pdvId, config);
  }
}
