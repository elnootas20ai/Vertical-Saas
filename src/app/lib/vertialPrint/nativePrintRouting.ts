import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';
import { isValidIpv4 } from './printerSetupStatus';

/** En app nativa la impresión va directo a ESC/POS por WiFi — nunca ventana del navegador. */
export function isNativeWifiPrinterReady(config: VertialPrinterConfig): boolean {
  return config.connectionType === 'network' && isValidIpv4(config.networkHost);
}

export const NATIVE_WIFI_PRINTER_SETUP_MESSAGE =
  'Configura la impresora WiFi en Ajustes → Tickets (busca en la red o escribe la IP). La app imprime directo, sin ventana de imprimir.';

export function shouldBlockBrowserPrintOnNative(): boolean {
  return isVertialNativeApp();
}
