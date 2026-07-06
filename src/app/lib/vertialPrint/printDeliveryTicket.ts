import { toast } from 'sonner';
import type { DeliveryTicketPrintOptions } from '../deliveryTicketTypes';
import { buildTicketDocument } from './ticketDocument';
import { encodeTicketEscpos } from './escposEncode';
import { resolveEffectivePrinterConfig } from './printerActiveScope';
import { fetchBridgeHealth, sendEscposToBridge } from './printBridgeClient';
import { printDeliveryTicketBrowser, printTestTicketBrowser } from './printBrowser';

export type PrintDeliveryTicketResult = {
  method: 'bridge' | 'browser';
};

export async function printDeliveryTicket(
  options: DeliveryTicketPrintOptions,
): Promise<PrintDeliveryTicketResult> {
  const config = resolveEffectivePrinterConfig();
  const doc = buildTicketDocument(options);
  const escpos = encodeTicketEscpos(doc, config.paperWidthMm);

  if (config.preferBridge && config.connectionType !== 'browser') {
    const health = await fetchBridgeHealth(1400, config);
    if (health.ok) {
      const result = await sendEscposToBridge(escpos, config);
      if (result.ok) {
        return { method: 'bridge' };
      }
      toast.warning(result.error || 'Impresión directa fallida. Usando navegador…');
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

  if (config.preferBridge && config.connectionType !== 'browser') {
    const health = await fetchBridgeHealth(1400, config);
    if (health.ok) {
      const result = await sendEscposToBridge(escpos, config);
      if (result.ok) {
        toast.success('Ticket de prueba enviado a la impresora');
        return { method: 'bridge' };
      }
      toast.error(result.error || 'No se pudo imprimir la prueba');
      return { method: 'browser' };
    }
    toast.error('No se detectó el servicio de impresión en este dispositivo o PC del mostrador');
    return { method: 'browser' };
  }

  printTestTicketBrowser(config.paperWidthMm);
  toast.info('Se abrirá la ventana de imprimir de tu dispositivo');
  return { method: 'browser' };
}
