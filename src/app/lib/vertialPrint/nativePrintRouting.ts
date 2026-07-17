import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';
import { isValidIpv4 } from './printerSetupStatus';
import { sanitizePrinterPort } from './nativePrintGuard';

/** En app nativa la impresión va directo a ESC/POS por WiFi — nunca ventana del navegador. */
export function isNativeWifiPrinterReady(config: VertialPrinterConfig): boolean {
  if (config.connectionType !== 'network') return false;
  if (!isValidIpv4(config.networkHost)) return false;
  const port = sanitizePrinterPort(config.networkPort);
  return port >= 1 && port <= 65535;
}

export const NATIVE_WIFI_PRINTER_SETUP_MESSAGE =
  'Configura la impresora WiFi: IP + puerto (casi siempre 9100) en Ajustes → Empresa → Impresora, o el icono de impresora del TPV.';

export function shouldBlockBrowserPrintOnNative(): boolean {
  return isVertialNativeApp();
}
