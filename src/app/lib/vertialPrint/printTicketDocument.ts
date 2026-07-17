import { toast } from 'sonner';
import { encodeTicketEscpos } from './escposEncode';
import { resolveEffectivePrinterConfig } from './printerActiveScope';
import { fetchBridgeHealth, sendEscposToBridge } from './printBridgeClient';
import { printDeliveryTicketBrowser } from './printBrowser';
import { isVertialNativeApp } from './isNativeApp';
import { shouldBlockBrowserPrintOnNative, NATIVE_WIFI_PRINTER_SETUP_MESSAGE } from './nativePrintRouting';
import { sendEposTicket, shouldUseEposPrint } from './eposPrintClient';
import type { VertialPrinterConfig } from './printerConfig';
import type { TicketDocument } from './ticketDocument';
import type { PrintDeliveryTicketResult } from './printDeliveryTicket';
import { printNativeEscposWithUi } from './printNativeEscposWithUi';

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
    const result = await printNativeEscposWithUi(escpos, config, { timeoutMs: 8_000 });
    return { method: 'native', ok: result.ok };
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
      toast.warning(result.error || 'Impresión directa fallida. Usando navegador…');
    } else if (config.connectionType === 'network') {
      toast.warning('Inicia Vertial Print en este PC y vuelve a probar.');
    }
  }

  if (shouldBlockBrowserPrintOnNative()) {
    toast.error(NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
    return { method: 'native', ok: false };
  }

  printDeliveryTicketBrowser({} as import('../deliveryTicketTypes').DeliveryTicketPrintOptions, doc);
  return { method: 'browser', ok: true };
}
