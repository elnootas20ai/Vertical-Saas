import type { VertialPrinterConfig } from './printerConfig';
import { DEFAULT_PRINTER_CONFIG, clampTicketBottomFeedCm } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';
import { isValidIpv4 } from './printerSetupStatus';

export function normalizeVertialPrinterConfig(
  raw?: Partial<VertialPrinterConfig> | null,
): VertialPrinterConfig {
  let connectionType = raw?.connectionType === 'network' || raw?.connectionType === 'system' || raw?.connectionType === 'browser'
    ? raw.connectionType
    : DEFAULT_PRINTER_CONFIG.connectionType;
  // En app nativa no existe impresión por ventana del navegador: forzar WiFi.
  if (isVertialNativeApp() && connectionType === 'browser') {
    connectionType = 'network';
  }
  return {
    ...DEFAULT_PRINTER_CONFIG,
    ...raw,
    connectionType,
    networkHost: String(raw?.networkHost || '').trim(),
    networkPort: Number(raw?.networkPort || DEFAULT_PRINTER_CONFIG.networkPort) || 9100,
    systemPrinterName: String(raw?.systemPrinterName || '').trim(),
    bridgeHost: String(raw?.bridgeHost || '').trim(),
    paperWidthMm: raw?.paperWidthMm === 58 ? 58 : 80,
    preferBridge: raw?.preferBridge !== false,
    ticketBottomFeedCm: clampTicketBottomFeedCm(
      raw?.ticketBottomFeedCm ?? DEFAULT_PRINTER_CONFIG.ticketBottomFeedCm,
    ),
  };
}

export function isVertialPrinterConfigConfigured(config: VertialPrinterConfig): boolean {
  if (isVertialNativeApp()) {
    return config.connectionType === 'network' && isValidIpv4(config.networkHost);
  }
  if (config.connectionType === 'browser') return true;
  if (config.connectionType === 'network') return isValidIpv4(config.networkHost);
  return Boolean(String(config.systemPrinterName || '').trim());
}

export function printerLabelFromConfig(config: VertialPrinterConfig): string {
  if (config.connectionType === 'network' && config.networkHost) {
    return `WiFi ${config.networkHost}`;
  }
  if (config.connectionType === 'system' && config.systemPrinterName) {
    return config.systemPrinterName;
  }
  if (config.connectionType === 'browser') return 'Ventana del dispositivo';
  return '';
}
