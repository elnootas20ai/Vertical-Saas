import { toast } from 'sonner';
import type { DeliveryTicketPrintOptions } from '../deliveryTicketTypes';
import { buildTicketDocument } from './ticketDocument';
import { encodeTicketEscpos } from './escposEncode';
import {
  resolveEffectivePrinterConfig,
  resolvePrinterConfigForOrderPdv,
} from './printerActiveScope';
import { fetchBridgeHealth, fetchBridgePingPrinter, sendEscposToBridge } from './printBridgeClient';
import { printDeliveryTicketBrowser, printTestTicketBrowser } from './printBrowser';
import { isVertialNativeApp } from './isNativeApp';
import { sendNativeEscpos } from './nativePrintClient';
import {
  NATIVE_WIFI_PRINTER_SETUP_MESSAGE,
  shouldBlockBrowserPrintOnNative,
} from './nativePrintRouting';
import { sendEposTestTicket, sendEposTicket, shouldUseEposPrint } from './eposPrintClient';
import { normalizeVertialPrinterConfig } from './printerConfigNormalize';
import { DELIVERY_TICKET_PAPER_WIDTH_MM, type VertialPrinterConfig } from './printerConfig';
import {
  NATIVE_PRINTER_PRINT_FAILED_MESSAGE,
  resolveNativePrinterForPrint,
} from './nativePrinterFlow';

export type PrintDeliveryTicketResult = {
  method: 'epos' | 'native' | 'bridge' | 'browser';
  ok: boolean;
};

/** Misma maquetación de ticket en todas las tiendas (80 mm). */
function withUnifiedTicketPaperWidth(config: VertialPrinterConfig): VertialPrinterConfig {
  return normalizeVertialPrinterConfig({
    ...config,
    paperWidthMm: DELIVERY_TICKET_PAPER_WIDTH_MM,
  });
}

/**
 * Config efectiva para imprimir un pedido: la impresora de la tienda del pedido
 * (salesPointId), no la de otra tienda que tenga el scope activo.
 * Así la 2ª impresora (prueba OK en el panel) también recibe comandas/tickets.
 */
function resolvePrinterConfigForOrder(options: DeliveryTicketPrintOptions) {
  return resolvePrinterConfigForOrderPdv(options.order?.salesPointId);
}

export async function printDeliveryTicket(
  options: DeliveryTicketPrintOptions,
): Promise<PrintDeliveryTicketResult> {
  const config = withUnifiedTicketPaperWidth(resolvePrinterConfigForOrder(options));
  const doc = buildTicketDocument(options);
  const escpos = encodeTicketEscpos(doc, config.paperWidthMm, {
    customerTailFeedCm: config.ticketBottomFeedCm,
  });

  if (isVertialNativeApp()) {
    const prepared = resolveNativePrinterForPrint(config);
    if (!prepared.ready) {
      toast.error(prepared.error || NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
      return { method: 'native', ok: false };
    }
    const printConfig = prepared.config;
    // BLINDADO build 33 (112127f): no bajar de 8s.
    const result = await sendNativeEscpos(escpos, printConfig, { timeoutMs: 8_000 });
    if (result.ok) return { method: 'native', ok: true };
    toast.error(result.error || NATIVE_PRINTER_PRINT_FAILED_MESSAGE, {
      duration: 12000,
      action: {
        label: 'Reintentar',
        onClick: () => {
          toast.loading('Reintentando impresión…', { id: 'native-print-retry' });
          void sendNativeEscpos(escpos, printConfig).then((retry) => {
            toast.dismiss('native-print-retry');
            if (retry.ok) {
              toast.success('Ticket impreso');
            } else {
              toast.error(retry.error || NATIVE_PRINTER_PRINT_FAILED_MESSAGE, {
                duration: 10000,
              });
            }
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
    if (config.preferBridge && config.connectionType !== 'browser') {
      const health = await fetchBridgeHealth(1400, config);
      if (health.ok) {
        const bridgeResult = await sendEscposToBridge(escpos, config);
        if (bridgeResult.ok) return { method: 'bridge', ok: true };
      }
    }
    toast.error(result.error || 'No se pudo imprimir en la impresora Epson', { duration: 10000 });
    return { method: 'epos', ok: false };
  }

  if (config.preferBridge && config.connectionType !== 'browser' && !isVertialNativeApp()) {
    const health = await fetchBridgeHealth(1400, config);
    if (health.ok) {
      const result = await sendEscposToBridge(escpos, config);
      if (result.ok) return { method: 'bridge', ok: true };
      toast.warning(result.error || 'Impresión directa fallida. Usando navegador…');
    } else if (config.connectionType === 'network') {
      toast.warning('Abre Vertial Print en este PC y vuelve a probar.');
    } else if (config.connectionType !== 'browser') {
      toast.warning('No se detectó el servicio de impresión. Usando ventana del dispositivo…');
    }
  }

  if (shouldBlockBrowserPrintOnNative()) {
    toast.error(NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
    return { method: 'native', ok: false };
  }

  printDeliveryTicketBrowser(options, doc, config.ticketBottomFeedCm);
  return { method: 'browser', ok: true };
}

async function bridgeTestPrint(
  escpos: Uint8Array,
  config: VertialPrinterConfig,
): Promise<{ ok: boolean; error?: string }> {
  const health = await fetchBridgeHealth(1400, config);
  if (!health.ok) {
    return {
      ok: false,
      error: config.connectionType === 'network'
        ? 'Abre Vertial Print en este PC y vuelve a probar.'
        : 'No se detectó el servicio de impresión en este PC.',
    };
  }
  if (config.connectionType === 'network') {
    const host = String(config.networkHost || '').trim();
    const ping = await fetchBridgePingPrinter(host, config, {
      port: config.networkPort || 9100,
      timeoutMs: 1800,
    });
    if (!ping.ok) {
      return {
        ok: false,
        error: ping.error || `La impresora ${host} no responde. Comprueba que está encendida y en la misma red.`,
      };
    }
  }
  return sendEscposToBridge(escpos, config, { timeoutMs: 5000 });
}

export async function printTestTicket(overrideConfig?: VertialPrinterConfig): Promise<PrintDeliveryTicketResult> {
  const config = overrideConfig
    ? normalizeVertialPrinterConfig({ ...resolveEffectivePrinterConfig(), ...overrideConfig })
    : resolveEffectivePrinterConfig();
  const { encodeTestTicketEscpos } = await import('./escposEncode');
  const escpos = encodeTestTicketEscpos(config.paperWidthMm, {
    customerTailFeedCm: config.ticketBottomFeedCm,
  });

  if (isVertialNativeApp()) {
    const prepared = resolveNativePrinterForPrint(config);
    if (!prepared.ready) {
      toast.error(prepared.error || NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
      return { method: 'native', ok: false };
    }
    const printConfig = prepared.config;
    // Mismos timeouts que el motor blindado (20s + reintento): la prueba no debe
    // fallar antes que un ticket real en la 2ª tablet.
    const result = await sendNativeEscpos(escpos, printConfig);
    if (result.ok) {
      toast.success('Ticket de prueba enviado a la impresora');
      return { method: 'native', ok: true };
    }
    toast.error(result.error || NATIVE_PRINTER_PRINT_FAILED_MESSAGE, { duration: 8000 });
    return { method: 'native', ok: false };
  }

  if (shouldUseEposPrint(config)) {
    const bridgeHost = String(config.bridgeHost || '').trim();
    if (bridgeHost && config.preferBridge && config.connectionType !== 'browser') {
      const health = await fetchBridgeHealth(1400, config);
      if (health.ok) {
        const bridgeResult = await sendEscposToBridge(escpos, config);
        if (bridgeResult.ok) {
          toast.success('Ticket de prueba enviado a la impresora (vía PC del mostrador)');
          return { method: 'bridge', ok: true };
        }
      }
    }
    const result = await sendEposTestTicket(config);
    if (result.ok) {
      toast.success('Ticket de prueba enviado a la impresora');
      return { method: 'epos', ok: true };
    }
    if (config.preferBridge && config.connectionType !== 'browser') {
      const health = await fetchBridgeHealth(1400, config);
      if (health.ok) {
        const bridgeResult = await sendEscposToBridge(escpos, config);
        if (bridgeResult.ok) {
          toast.success('Ticket de prueba enviado a la impresora (vía PC del mostrador)');
          return { method: 'bridge', ok: true };
        }
      }
    }
    toast.error(result.error || 'No se pudo imprimir la prueba', { duration: 10000 });
    return { method: 'epos', ok: false };
  }

  if (config.preferBridge && config.connectionType !== 'browser' && !isVertialNativeApp()) {
    const result = await bridgeTestPrint(escpos, config);
    if (result.ok) {
      toast.success('Ticket de prueba enviado a la impresora');
      return { method: 'bridge', ok: true };
    }
    toast.error(result.error || 'No se pudo imprimir la prueba', { duration: 8000 });
    return { method: 'bridge', ok: false };
  }

  if (shouldBlockBrowserPrintOnNative()) {
    toast.error(NATIVE_WIFI_PRINTER_SETUP_MESSAGE, { duration: 12000 });
    return { method: 'native', ok: false };
  }

  printTestTicketBrowser(config.paperWidthMm);
  toast.info('Se abrirá la ventana de imprimir de tu dispositivo');
  return { method: 'browser', ok: true };
}
