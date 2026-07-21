export type {
  DeliveryTicketBusinessInfo,
  DeliveryOrderLike,
  DeliveryTicketPrintOptions,
  DeliveryTicketVariant,
} from './deliveryTicketTypes';

/**
 * Un ticket a la vez (BLINDADO build 33 / 112127f).
 * Si llega otro mientras imprime, se encola — no se descarta.
 */
let printTail: Promise<void> = Promise.resolve();

export async function printDeliveryTicket(
  options: import('./deliveryTicketTypes').DeliveryTicketPrintOptions,
): Promise<void> {
  const { toast } = await import('sonner');

  const job = async () => {
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
  };

  const run = printTail.then(job, job);
  printTail = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
}
