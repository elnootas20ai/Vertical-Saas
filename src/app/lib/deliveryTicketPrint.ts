export type {
  DeliveryTicketBusinessInfo,
  DeliveryOrderLike,
  DeliveryTicketPrintOptions,
  DeliveryTicketVariant,
} from './deliveryTicketTypes';

/** Evita solapar impresiones: cola ligera (no descarta el siguiente ticket). */
let printChain: Promise<void> = Promise.resolve();

/**
 * Imprime en segundo plano. No bloquea el botón «Continuar» del TPV:
 * la UI puede seguir mientras el ticket sale por la térmica.
 */
export function printDeliveryTicket(
  options: import('./deliveryTicketTypes').DeliveryTicketPrintOptions,
): Promise<void> {
  const job = printChain.then(async () => {
    const { toast } = await import('sonner');
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
  });

  // Encadena el siguiente sin romper la cola si este falla
  printChain = job.catch(() => undefined);
  return job;
}
