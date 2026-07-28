export type {
  DeliveryTicketBusinessInfo,
  DeliveryOrderLike,
  DeliveryTicketPrintOptions,
  DeliveryTicketVariant,
} from './deliveryTicketTypes';

/**
 * Un ticket a la vez (BLINDADO build 33 / 112127f).
 * Si llega otro mientras imprime, se encola — no se descarta.
 *
 * La UI NUNCA espera: encola al instante y sigue (cobrar / siguiente pedido).
 * Timeouts y Bridge/ESCPOSProxy no se tocan aquí.
 */
let printTail: Promise<void> = Promise.resolve();

type PrintModule = typeof import('./vertialPrint/printDeliveryTicket');
let printModulePromise: Promise<PrintModule> | null = null;

function loadPrintModule(): Promise<PrintModule> {
  if (!printModulePromise) {
    printModulePromise = import('./vertialPrint/printDeliveryTicket');
  }
  return printModulePromise;
}

/** Precarga el módulo de impresión al abrir el TPV para que el 1.er ticket no espere el import. */
export function prefetchDeliveryTicketPrint(): void {
  void loadPrintModule();
}

export function printDeliveryTicket(
  options: import('./deliveryTicketTypes').DeliveryTicketPrintOptions,
): Promise<void> {
  // Arranca el import YA (aunque haya otro ticket imprimiendo).
  const moduleReady = loadPrintModule();

  const job = async () => {
    const [{ toast }, { printDeliveryTicket: printUnified }] = await Promise.all([
      import('sonner'),
      moduleReady,
    ]);
    try {
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
  // Resuelve al instante: quien hace void/await no se queda colgado con la impresora.
  return Promise.resolve();
}
