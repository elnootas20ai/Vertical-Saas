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

const STORAGE_KEY = 'vertial_printer_config_v1';

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
  if (!raw) return VERTIAL_PRINT_BRIDGE_URL;
  const normalized = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (normalized.includes(':')) return `http://${normalized}`;
  return `http://${normalized}:${VERTIAL_PRINT_BRIDGE_PORT}`;
}

export function loadPrinterConfig(): VertialPrinterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

export function savePrinterConfig(config: VertialPrinterConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
