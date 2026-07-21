import type { VertialPrinterConfig } from './printerConfig';
import type { TicketDocument } from './ticketDocument';
import { isVertialNativeApp } from './isNativeApp';
import { isValidIpv4, isAppleMobileDevice } from './printerSetupStatus';
import { buildEposTicket } from './eposTicketBuilder';
import { normalizeEposPrintError } from './eposPrintErrors';

type EpsonAttempt = {
  useHttps: boolean;
  printerPort: number;
};

function eposAttemptsForBrowser(): EpsonAttempt[] {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return [{ useHttps: true, printerPort: 8043 }];
  }
  return [
    { useHttps: true, printerPort: 8043 },
    { useHttps: false, printerPort: 8008 },
  ];
}

function epsonConfig(host: string, attempt: EpsonAttempt) {
  return {
    printerIP: host,
    printerPort: attempt.printerPort,
    useHttps: attempt.useHttps,
    timeout: 35000,
    deviceId: 'local_printer',
  };
}

/** iPad/Safari móvil + impresora WiFi Epson → ePOS. En PC usa el puente local (Vertial Print). */
export function shouldUseEposPrint(config: VertialPrinterConfig): boolean {
  if (isVertialNativeApp()) return false;
  if (!isAppleMobileDevice()) return false;
  if (config.connectionType !== 'network') return false;
  return isValidIpv4(config.networkHost);
}

async function importEposPrint() {
  return import('@plevands/epson-thermal-printer');
}

/** Safari iPad: abrir el puerto ePOS antes ayuda a que el socket no falle en frío. */
async function warmupEposConnection(host: string): Promise<void> {
  const certUrl = `https://${host}:8043/`;
  try {
    await fetch(certUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
  } catch {
    // no-cors puede fallar aunque la impresora responda; seguimos con el SDK
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

async function runEposAttempts(
  host: string,
  run: (service: InstanceType<(Awaited<ReturnType<typeof importEposPrint>>)['EposPrintService']>) => Promise<{ success: boolean; message?: string; code?: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const { EposPrintService } = await importEposPrint();
  let lastError = 'No se pudo conectar con la impresora Epson';
  let lastRaw = '';

  await warmupEposConnection(host);

  for (const attempt of eposAttemptsForBrowser()) {
    try {
      const service = new EposPrintService(epsonConfig(host, attempt));
      const result = await run(service);
      if (result.success) return { ok: true };
      lastRaw = String(result.message || result.code || '').trim();
      lastError = normalizeEposPrintError(lastRaw, host);
    } catch (error) {
      lastRaw = error instanceof Error ? error.message : lastError;
      lastError = normalizeEposPrintError(lastRaw, host);
    }
  }

  if (lastRaw && !lastError.includes(lastRaw)) {
    lastError = `${lastError} (${lastRaw})`;
  }

  return { ok: false, error: lastError };
}

export async function checkEposConnection(
  config: VertialPrinterConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!shouldUseEposPrint(config)) return { ok: false };
  const host = String(config.networkHost || '').trim();
  return runEposAttempts(host, (service) => service.checkConnection());
}

export async function sendEposTicket(
  doc: TicketDocument,
  config: VertialPrinterConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!shouldUseEposPrint(config)) {
    return { ok: false, error: 'Configura la IP de la impresora WiFi' };
  }
  const host = String(config.networkHost || '').trim();

  return runEposAttempts(host, (service) => service.printWithBuilder((builder) => {
    buildEposTicket(builder, doc, config.paperWidthMm);
  }));
}

export async function sendEposTestTicket(
  config: VertialPrinterConfig,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const doc: TicketDocument = {
    variant: 'customer',
    title: 'PRUEBA',
    ticketNo: 'TEST-001',
    dateLabel: now,
    issuer: 'Vertial',
    taxId: '',
    addressLine: '',
    phone: '',
    salesPointName: '',
    orderNumber: '0000',
    customerName: 'Impresion de prueba',
    customerPhone: '',
    customerAddress: '',
    emphasizeCustomerAddress: false,
    deliveryTypeLabel: '',
    cashierName: '',
    lines: [{ qty: 1, name: 'Producto demo', total: 9.99 }],
    base: 9.08,
    vat: 0.91,
    vatRate: 10,
    total: 9.99,
    paymentLabel: 'Efectivo',
    paymentStatusLabel: 'Cobrado',
    refundReason: '',
    orderNotes: '',
    footer: 'Si ves esto, la impresora funciona',
    isRefund: false,
  };
  return sendEposTicket(doc, config);
}
