import { toast } from 'sonner';
import { encodeTicketEscpos } from './escposEncode';
import { resolveEffectivePrinterConfig } from './printerActiveScope';
import { fetchBridgeHealth, fetchBridgePingPrinter, sendEscposToBridge } from './printBridgeClient';
import { printDeliveryTicketBrowser } from './printBrowser';
import { isVertialNativeApp } from './isNativeApp';
import { sendNativeEscpos } from './nativePrintClient';
import {
  NATIVE_PRINTER_PRINT_FAILED_MESSAGE,
  resolveNativePrinterForPrint,
} from './nativePrinterFlow';
import { shouldBlockBrowserPrintOnNative, NATIVE_WIFI_PRINTER_SETUP_MESSAGE } from './nativePrintRouting';
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
    const prepared = resolveNativePrinterForPrint(config);
    if (!prepared.ready) {
      toast.error(prepared.error || NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
      return { method: 'native', ok: false };
    }
    const printConfig = prepared.config;
    const result = await sendNativeEscpos(escpos, printConfig, { timeoutMs: 5_000 });
    if (result.ok) return { method: 'native', ok: true };
    toast.error(result.error || NATIVE_PRINTER_PRINT_FAILED_MESSAGE, {
      duration: 12000,
      action: {
        label: 'Reintentar',
        onClick: () => {
          void sendNativeEscpos(escpos, printConfig, { retry: false, timeoutMs: 5_000 }).then((retry) => {
            if (retry.ok) toast.success('Ticket impreso');
            else toast.error(retry.error || NATIVE_PRINTER_PRINT_FAILED_MESSAGE, { duration: 10000 });
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
