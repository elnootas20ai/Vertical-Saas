export type {
  DeliveryTicketBusinessInfo,
  DeliveryOrderLike,
  DeliveryTicketPrintOptions,
  DeliveryTicketVariant,
} from './deliveryTicketTypes';

export async function printDeliveryTicket(
  options: import('./deliveryTicketTypes').DeliveryTicketPrintOptions,
): Promise<void> {
  const { toast } = await import('sonner');
  try {
    const { printDeliveryTicket: printUnified } = await import('./vertialPrint/printDeliveryTicket');
    const result = await printUnified(options);
    // Confirmación visible de que el click funcionó cuando la impresión es silenciosa (sin ventana).
    if (result.method === 'bridge' || result.method === 'native' || result.method === 'epos') {
      toast.success('Ticket enviado a la impresora');
    }
  } catch {
    const num = String(options.order?.orderNumber || '').trim();
    toast.error(num ? `No se pudo imprimir el ticket del pedido #${num}` : 'No se pudo imprimir el ticket');
  }
}
