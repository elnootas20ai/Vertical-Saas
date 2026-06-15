import { toast } from 'sonner';
import type { DeliveryTicketPrintOptions } from '../deliveryTicketTypes';
import { buildTicketDocument } from './ticketDocument';
import { encodeTicketEscpos } from './escposEncode';
import { loadPrinterConfig } from './printerConfig';
import { fetchBridgeHealth, sendEscposToBridge } from './printBridgeClient';
import { printDeliveryTicketBrowser } from './printBrowser';

export type PrintDeliveryTicketResult = {
  method: 'bridge' | 'browser';
};

export async function printDeliveryTicket(
  options: DeliveryTicketPrintOptions,
): Promise<PrintDeliveryTicketResult> {
  const config = loadPrinterConfig();
  const doc = buildTicketDocument(options);
  const escpos = encodeTicketEscpos(doc, config.paperWidthMm);

  if (config.preferBridge && config.connectionType !== 'browser') {
    const health = await fetchBridgeHealth();
    if (health.ok) {
      const result = await sendEscposToBridge(escpos, config);
      if (result.ok) {
        return { method: 'bridge' };
      }
      toast.warning(result.error || 'Impresión directa fallida. Usando navegador…');
    } else if (config.connectionType !== 'browser') {
      toast.warning('Vertial Print no está activo. Usando impresión del navegador…');
    }
  }

  printDeliveryTicketBrowser(options, doc);
  return { method: 'browser' };
}

export async function printTestTicket(): Promise<PrintDeliveryTicketResult> {
  const config = loadPrinterConfig();
  const { encodeTestTicketEscpos } = await import('./escposEncode');
  const escpos = encodeTestTicketEscpos(config.paperWidthMm);

  if (config.preferBridge && config.connectionType !== 'browser') {
    const health = await fetchBridgeHealth();
    if (health.ok) {
      const result = await sendEscposToBridge(escpos, config);
      if (result.ok) {
        toast.success('Ticket de prueba enviado a la impresora');
        return { method: 'bridge' };
      }
      toast.error(result.error || 'No se pudo imprimir la prueba');
      return { method: 'browser' };
    }
    toast.error('Vertial Print no está activo. Ejecuta: npm run print-bridge');
    return { method: 'browser' };
  }

  toast.info('Configura impresora de red o activa Vertial Print para prueba térmica');
  return { method: 'browser' };
}
