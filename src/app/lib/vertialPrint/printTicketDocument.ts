import { toast } from 'sonner';
import { encodeTicketEscpos } from './escposEncode';
import { resolveEffectivePrinterConfig } from './printerActiveScope';
import { fetchBridgeHealth, fetchBridgePingPrinter, sendEscposToBridge } from './printBridgeClient';
import { printDeliveryTicketBrowser } from './printBrowser';
import { isVertialNativeApp } from './isNativeApp';
import { sendNativeEscpos } from './nativePrintClient';
import {
  isNativeWifiPrinterReady,
  NATIVE_WIFI_PRINTER_SETUP_MESSAGE,
  shouldBlockBrowserPrintOnNative,
} from './nativePrintRouting';
import { sendEposTicket, shouldUseEposPrint } from './eposPrintClient';
import type { VertialPrinterConfig } from './printerConfig';
import type { TicketDocument } from './ticketDocument';
import type { PrintDeliveryTicketResult } from './printDeliveryTicket';

/**
 * Imprime un TicketDocument ya construido.
 * En app nativa (iPhone/iPad/Android): ESC/POS directo a la impresora WiFi, sin ventana de preview.
 * En navegador PC: bridge / ePOS / ventana de imprimir según configuración.
 */
export async function printTicketDocument(
  doc: TicketDocument,
  options?: { config?: VertialPrinterConfig },
): Promise<PrintDeliveryTicketResult> {
  const config = options?.config ?? resolveEffectivePrinterConfig();
  const escpos = encodeTicketEscpos(doc, config.paperWidthMm);

  if (isVertialNativeApp()) {
    if (!isNativeWifiPrinterReady(config)) {
      toast.error(NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
      return { method: 'native', ok: false };
    }
    const result = await sendNativeEscpos(escpos, config, { timeoutMs: 8_000 });
    if (result.ok) return { method: 'native', ok: true };
    toast.error(result.error || 'No se pudo imprimir en la impresora WiFi', {
      duration: 12000,
      action: {
        label: 'Reintentar',
        onClick: () => {
          void sendNativeEscpos(escpos, config, { retry: false, timeoutMs: 10_000 }).then((retry) => {
            if (retry.ok) toast.success('Ticket impreso');
            else toast.error(retry.error || 'Revisa Ajustes → Tickets y el permiso «Red local».', { duration: 10000 });
          });
        },
      },
    });
    return { method: 'native', ok: false };
  }

  if (shouldUseEposPrint(config)) {
    const bridgeHost = String(config.bridgeHost || '').trim();
    if (bridgeHost && config.preferBridge && config.connectionType !== 'browser') {
      const health = await fetchBridgeHealth(1400, config);
      if (health.ok) {
        const bridgeResult = await sendEscposToBridge(escpos, config);
        if (bridgeResult.ok) return { method: 'bridge', ok: true };
      }
    }
    const result = await sendEposTicket(doc, config);
    if (result.ok) return { method: 'epos', ok: true };
    toast.error(result.error || 'No se pudo imprimir', { duration: 10000 });
    return { method: 'epos', ok: false };
  }

  if (config.preferBridge && config.connectionType !== 'browser') {
    const health = await fetchBridgeHealth(1400, config);
    if (health.ok) {
      const result = await sendEscposToBridge(escpos, config);
      if (result.ok) return { method: 'bridge', ok: true };
    }
  }

  if (shouldBlockBrowserPrintOnNative()) {
    toast.error(NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
    return { method: 'native', ok: false };
  }

  printDeliveryTicketBrowser({} as import('../deliveryTicketTypes').DeliveryTicketPrintOptions, doc);
  return { method: 'browser', ok: true };
}
