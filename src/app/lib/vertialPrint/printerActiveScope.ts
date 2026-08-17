import type { PointOfSale } from '../deliveryApi';
import {
  DEFAULT_PRINTER_CONFIG,
  loadLegacyPrinterConfig,
  loadPdvPrinterCache,
  loadPdvDevicePrinterCache,
  saveLegacyPrinterConfig,
  cachePdvPrinterConfig,
  cachePdvDevicePrinterConfig,
  type VertialPrinterConfig,
} from './printerConfig';
import {
  isVertialPrinterConfigConfigured,
  normalizeVertialPrinterConfig,
} from './printerConfigNormalize';
import { isValidIpv4 } from './printerSetupStatus';

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
  const explicitPdvId = String(scope.pdvId || '').trim();
  let pdv = scope.pdv !== undefined ? scope.pdv : (activeScope.pdv ?? null);

  // Si piden un PDV concreto, no usar el documento de otra tienda del scope activo.
  // Antes: { pdvId: tienda-2 } seguía leyendo printerConfig de la tienda-1 activa
  // y la 2ª impresora solo salía en la prueba del panel.
  if (explicitPdvId && pdv && String(pdv._id || '').trim() !== explicitPdvId) {
    pdv = null;
  }

  const activePdvId = String(activeScope.pdvId || activeScope.pdv?._id || '').trim();
  const pdvId = explicitPdvId || String(pdv?._id || activePdvId || '').trim();

  let terminalId = String(scope.terminalId ?? '').trim();
  if (!terminalId) {
    // Heredar terminal del scope solo si es la misma tienda (o no hay PDV explícito distinto).
    const sameStoreAsActive = !explicitPdvId || !activePdvId || explicitPdvId === activePdvId;
    if (sameStoreAsActive && scope.terminalId === undefined) {
      terminalId = String(activeScope.terminalId || '').trim();
    }
  }

  const localFallback = scope.localFallback ?? loadLegacyPrinterConfig();
  const localCfg = normalizeVertialPrinterConfig(localFallback);

  // Terminal concreto (si lo hay) → tienda (1 impresora, N tablets) → caché dispositivo → legacy.
  const terminal = terminalId
    ? pdv?.terminals?.find((t) => t.id === terminalId)
    : undefined;
  const terminalCfg = terminal?.printerConfig
    ? normalizeVertialPrinterConfig(terminal.printerConfig)
    : null;
  if (terminalCfg && isVertialPrinterConfigConfigured(terminalCfg)) {
    return terminalCfg;
  }

  // IP de la tienda = la de la tablet que ya imprime. Se copia a esta tablet.
  const storeCfg = pdv?.printerConfig
    ? normalizeVertialPrinterConfig(pdv.printerConfig)
    : null;
  if (storeCfg && isVertialPrinterConfigConfigured(storeCfg)) {
    if (pdvId) {
      try {
        cachePdvDevicePrinterConfig(pdvId, storeCfg);
      } catch {
        /* ignore */
      }
    }
    return storeCfg;
  }

  if (pdvId) {
    const deviceCachedRaw = loadPdvDevicePrinterCache(pdvId);
    if (deviceCachedRaw) {
      const deviceCached = normalizeVertialPrinterConfig(deviceCachedRaw);
      if (isVertialPrinterConfigConfigured(deviceCached)) {
        return deviceCached;
      }
    }
  }

  const localHost = String(localCfg.networkHost || '').trim();
  const localNetworkOk =
    localCfg.connectionType === 'network' && isValidIpv4(localHost);
  if (localNetworkOk) {
    if (pdvId) {
      try {
        cachePdvDevicePrinterConfig(pdvId, localCfg);
      } catch {
        /* ignore */
      }
    }
    return localCfg;
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

  return normalizeVertialPrinterConfig(localFallback || DEFAULT_PRINTER_CONFIG);
}

/**
 * Impresora para un pedido real: prioriza la tienda del pedido (salesPointId).
 * El ticket de prueba del panel ya resolvía con esa tienda; los pedidos no,
 * y la 2ª impresora quedaba muda aunque la prueba sí saliera.
 */
export function resolvePrinterConfigForOrderPdv(
  orderPdvId?: string | null,
): VertialPrinterConfig {
  const id = String(orderPdvId || '').trim();
  if (!id) {
    return resolveEffectivePrinterConfig();
  }

  const activePdvId = String(activeScope.pdvId || activeScope.pdv?._id || '').trim();
  const samePdv = !activePdvId || activePdvId === id;
  const byOrder = resolveEffectivePrinterConfig({
    pdvId: id,
    pdv: samePdv ? (activeScope.pdv ?? null) : null,
    terminalId: samePdv ? (activeScope.terminalId ?? null) : null,
  });

  if (isVertialPrinterConfigConfigured(byOrder)) {
    return byOrder;
  }

  return resolveEffectivePrinterConfig();
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
    cachePdvDevicePrinterConfig(id, config);
  }
}
