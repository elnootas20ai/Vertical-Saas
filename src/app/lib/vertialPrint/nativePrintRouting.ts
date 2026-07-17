import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';
import { isValidIpv4 } from './printerSetupStatus';

/** En app nativa la impresión va directo a ESC/POS por WiFi — nunca ventana del navegador. */
export function isNativeWifiPrinterReady(config: VertialPrinterConfig): boolean {
  return config.connectionType === 'network' && isValidIpv4(config.networkHost);
}

export const NATIVE_WIFI_PRINTER_SETUP_MESSAGE =
  'Configura la impresora WiFi: escribe la IP del ticket SELF-TEST en Ajustes → Empresa → Impresora, o pulsa el icono de impresora en la barra del TPV.';

export function shouldBlockBrowserPrintOnNative(): boolean {
  return isVertialNativeApp();
}
