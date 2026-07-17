export type {
  DeliveryTicketBusinessInfo,
  DeliveryOrderLike,
  DeliveryTicketPrintOptions,
  DeliveryTicketVariant,
} from './deliveryTicketTypes';

/** Evita doble tap: un ticket a la vez desde la UI. */
let printInFlight: Promise<void> | null = null;

export async function printDeliveryTicket(
  options: import('./deliveryTicketTypes').DeliveryTicketPrintOptions,
): Promise<void> {
  const { toast } = await import('sonner');

  if (printInFlight) {
    toast.message('Espera: hay un ticket imprimiéndose…');
    await printInFlight.catch(() => undefined);
    return;
  }

  printInFlight = (async () => {
    try {
      const { printDeliveryTicket: printUnified } = await import('./vertialPrint/printDeliveryTicket');
      const result = await printUnified(options);
      if (result.ok && (result.method === 'bridge' || result.method === 'native' || result.method === 'epos')) {
        toast.success('Ticket enviado a la impresora');
      }
    } catch (error) {
      const num = String(options.order?.orderNumber || '').trim();
      const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
      toast.error(
        num
          ? `No se pudo imprimir el ticket del pedido #${num}${detail}`
          : `No se pudo imprimir el ticket${detail}`,
      );
    }
  })();

  try {
    await printInFlight;
  } finally {
    printInFlight = null;
  }
}
