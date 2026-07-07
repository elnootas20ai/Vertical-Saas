import { toast } from 'sonner';
import type { DeliveryTicketPrintOptions } from '../deliveryTicketTypes';
import { buildTicketDocument } from './ticketDocument';
import { encodeTicketEscpos } from './escposEncode';
import { resolveEffectivePrinterConfig } from './printerActiveScope';
import { fetchBridgeHealth, sendEscposToBridge } from './printBridgeClient';
import { printDeliveryTicketBrowser, printTestTicketBrowser } from './printBrowser';
import { isVertialNativeApp } from './isNativeApp';
import { sendNativeEscpos } from './nativePrintClient';
import { sendEposTestTicket, sendEposTicket, shouldUseEposPrint } from './eposPrintClient';

export type PrintDeliveryTicketResult = {
  method: 'epos' | 'native' | 'bridge' | 'browser';
};

export async function printDeliveryTicket(
  options: DeliveryTicketPrintOptions,
): Promise<PrintDeliveryTicketResult> {
  const config = resolveEffectivePrinterConfig();
  const doc = buildTicketDocument(options);
  const escpos = encodeTicketEscpos(doc, config.paperWidthMm);

  if (isVertialNativeApp() && config.connectionType === 'network') {
    const result = await sendNativeEscpos(escpos, config);
    if (result.ok) return { method: 'native' };
    toast.error(result.error || 'No se pudo imprimir en la impresora WiFi');
    return { method: 'browser' };
  }

  if (shouldUseEposPrint(config)) {
    const bridgeHost = String(config.bridgeHost || '').trim();
    if (bridgeHost && config.preferBridge && config.connectionType !== 'browser') {
      const health = await fetchBridgeHealth(1400, config);
      if (health.ok) {
        const bridgeResult = await sendEscposToBridge(escpos, config);
        if (bridgeResult.ok) return { method: 'bridge' };
      }
    }
    const result = await sendEposTicket(doc, config);
    if (result.ok) return { method: 'epos' };
    if (config.preferBridge && config.connectionType !== 'browser') {
      const health = await fetchBridgeHealth(1400, config);
      if (health.ok) {
        const bridgeResult = await sendEscposToBridge(escpos, config);
        if (bridgeResult.ok) return { method: 'bridge' };
      }
    }
    toast.error(result.error || 'No se pudo imprimir en la impresora Epson', { duration: 10000 });
    return { method: 'browser' };
  }

  if (config.preferBridge && config.connectionType !== 'browser') {
    const health = await fetchBridgeHealth(1400, config);
    if (health.ok) {
      const result = await sendEscposToBridge(escpos, config);
      if (result.ok) return { method: 'bridge' };
      toast.warning(result.error || 'Impresión directa fallida. Usando navegador…');
    } else if (config.connectionType === 'network' && !isVertialNativeApp()) {
      toast.warning('Inicia Vertial Print en este PC (npm run print-bridge) y vuelve a probar.');
    } else if (config.connectionType !== 'browser') {
      toast.warning('No se detectó el servicio de impresión. Usando ventana del dispositivo…');
    }
  }

  printDeliveryTicketBrowser(options, doc);
  return { method: 'browser' };
}

export async function printTestTicket(): Promise<PrintDeliveryTicketResult> {
  const config = resolveEffectivePrinterConfig();
  const { encodeTestTicketEscpos } = await import('./escposEncode');
  const escpos = encodeTestTicketEscpos(config.paperWidthMm);

  if (isVertialNativeApp() && config.connectionType === 'network') {
    const result = await sendNativeEscpos(escpos, config);
    if (result.ok) {
      toast.success('Ticket de prueba enviado a la impresora');
      return { method: 'native' };
    }
    toast.error(result.error || 'No se pudo imprimir la prueba', { duration: 8000 });
    return { method: 'browser' };
  }

  if (shouldUseEposPrint(config)) {
    const bridgeHost = String(config.bridgeHost || '').trim();
    if (bridgeHost && config.preferBridge && config.connectionType !== 'browser') {
      const health = await fetchBridgeHealth(1400, config);
      if (health.ok) {
        const bridgeResult = await sendEscposToBridge(escpos, config);
        if (bridgeResult.ok) {
          toast.success('Ticket de prueba enviado a la impresora (vía PC del mostrador)');
          return { method: 'bridge' };
        }
      }
    }
    const result = await sendEposTestTicket(config);
    if (result.ok) {
      toast.success('Ticket de prueba enviado a la impresora');
      return { method: 'epos' };
    }
    if (config.preferBridge && config.connectionType !== 'browser') {
      const health = await fetchBridgeHealth(1400, config);
      if (health.ok) {
        const bridgeResult = await sendEscposToBridge(escpos, config);
        if (bridgeResult.ok) {
          toast.success('Ticket de prueba enviado a la impresora (vía PC del mostrador)');
          return { method: 'bridge' };
        }
      }
    }
    toast.error(result.error || 'No se pudo imprimir la prueba', { duration: 10000 });
    return { method: 'browser' };
  }

  if (config.preferBridge && config.connectionType !== 'browser') {
    const health = await fetchBridgeHealth(1400, config);
    if (health.ok) {
      const result = await sendEscposToBridge(escpos, config);
      if (result.ok) {
        toast.success('Ticket de prueba enviado a la impresora');
        return { method: 'bridge' };
      }
      toast.error(result.error || 'No se pudo imprimir la prueba', { duration: 8000 });
      return { method: 'browser' };
    }
    if (config.connectionType === 'network' && !isVertialNativeApp()) {
      toast.error('Inicia Vertial Print en este PC: npm run print-bridge (misma red que la impresora).');
    } else {
      toast.error('No se detectó el servicio de impresión en este dispositivo o PC del mostrador');
    }
    return { method: 'browser' };
  }

  printTestTicketBrowser(config.paperWidthMm);
  toast.info('Se abrirá la ventana de imprimir de tu dispositivo');
  return { method: 'browser' };
}
