export type VertialPrinterConnectionType = 'network' | 'system' | 'browser';

export interface VertialPrinterConfig {
  connectionType: VertialPrinterConnectionType;
  networkHost: string;
  networkPort: number;
  systemPrinterName: string;
  /** IP del PC del mostrador con Vertial Print (iPad/tablet → PC en la misma WiFi). Vacío = este dispositivo. */
  bridgeHost: string;
  paperWidthMm: 58 | 80;
  preferBridge: boolean;
}

export const VERTIAL_PRINT_BRIDGE_PORT = 39201;
export const VERTIAL_PRINT_BRIDGE_URL = `http://127.0.0.1:${VERTIAL_PRINT_BRIDGE_PORT}`;

const LEGACY_STORAGE_KEY = 'vertial_printer_config_v1';
const PDV_CACHE_PREFIX = 'vertial_printer_config_pdv_';

export const DEFAULT_PRINTER_CONFIG: VertialPrinterConfig = {
  connectionType: 'browser',
  networkHost: '',
  networkPort: 9100,
  systemPrinterName: '',
  bridgeHost: '',
  paperWidthMm: 80,
  preferBridge: true,
};

export function resolveBridgeUrl(config?: Pick<VertialPrinterConfig, 'bridgeHost'>): string {
  const raw = String(config?.bridgeHost || '').trim();
  if (raw) {
    const normalized = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (normalized.includes(':')) return `http://${normalized}`;
    return `http://${normalized}:${VERTIAL_PRINT_BRIDGE_PORT}`;
  }
  // Dev: proxy Vite /local-print → 127.0.0.1:39201 (mismo origen, sin CORS ni IP del PC).
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return '/local-print';
  }
  return VERTIAL_PRINT_BRIDGE_URL;
}

export function pdvPrinterCacheKey(pdvId: string): string {
  return `${PDV_CACHE_PREFIX}${pdvId}`;
}

export function loadLegacyPrinterConfig(): VertialPrinterConfig {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRINTER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<VertialPrinterConfig>;
    return {
      ...DEFAULT_PRINTER_CONFIG,
      ...parsed,
      networkPort: Number(parsed.networkPort || DEFAULT_PRINTER_CONFIG.networkPort) || 9100,
      paperWidthMm: parsed.paperWidthMm === 58 ? 58 : 80,
    };
  } catch {
    return { ...DEFAULT_PRINTER_CONFIG };
  }
}

export function saveLegacyPrinterConfig(config: VertialPrinterConfig): void {
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(config));
}

export function loadPdvPrinterCache(pdvId: string): VertialPrinterConfig | null {
  try {
    const raw = localStorage.getItem(pdvPrinterCacheKey(pdvId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VertialPrinterConfig>;
    return {
      ...DEFAULT_PRINTER_CONFIG,
      ...parsed,
      networkPort: Number(parsed.networkPort || DEFAULT_PRINTER_CONFIG.networkPort) || 9100,
      paperWidthMm: parsed.paperWidthMm === 58 ? 58 : 80,
    };
  } catch {
    return null;
  }
}

export function cachePdvPrinterConfig(pdvId: string, config: VertialPrinterConfig): void {
  localStorage.setItem(pdvPrinterCacheKey(pdvId), JSON.stringify(config));
}

/**
 * Refresca la caché local por PDV con la impresora guardada en el servidor.
 * Así la app iOS/Android puede imprimir el ticket de un pedido aunque la
 * impresora se configurase desde otro dispositivo. Solo se cachea config de
 * red (IP): es la única que sirve para impresión directa desde el móvil.
 * No pisa una IP local válida con un PDV vacío del servidor.
 */
export function cacheServerPdvPrinterConfigs(
  pdvs: Array<{ _id: string; printerConfig?: Partial<VertialPrinterConfig> | null }>,
): void {
  for (const pdv of pdvs) {
    const cfg = pdv?.printerConfig;
    const pdvId = String(pdv?._id || '').trim();
    if (!pdvId || !cfg) continue;
    const connectionType = cfg.connectionType || 'network';
    if (connectionType !== 'network') continue;
    const host = String(cfg.networkHost || '').trim();
    if (!host) continue;
    try {
      cachePdvPrinterConfig(pdvId, {
        ...DEFAULT_PRINTER_CONFIG,
        ...cfg,
        connectionType: 'network',
        networkHost: host,
        networkPort: Number(cfg.networkPort || DEFAULT_PRINTER_CONFIG.networkPort) || 9100,
        paperWidthMm: cfg.paperWidthMm === 58 ? 58 : 80,
      });
    } catch {
      /* almacenamiento no disponible: seguimos sin caché */
    }
  }
}
