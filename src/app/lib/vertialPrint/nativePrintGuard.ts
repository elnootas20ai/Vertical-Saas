import { isValidIpv4 } from './printerSetupStatus';
import type { VertialPrinterConfig } from './printerConfig';

/** Puerto ESC/POS por defecto en térmicas de red. */
export const DEFAULT_ESC_POS_PORT = 9100;

export function sanitizePrinterPort(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return DEFAULT_ESC_POS_PORT;
  return Math.floor(n);
}

export type NativePrintTargetOk = { ok: true; host: string; port: number };
export type NativePrintTargetErr = { ok: false; error: string };
export type NativePrintTarget = NativePrintTargetOk | NativePrintTargetErr;

/** Valida IP + puerto (+ payload) antes de tocar el plugin nativo. */
export function assertNativePrintTarget(
  host: unknown,
  port: unknown,
  bytes?: Uint8Array,
): NativePrintTarget {
  const safeHost = String(host || '').trim();
  if (!isValidIpv4(safeHost)) {
    return {
      ok: false,
      error:
        'Falta la IP de la impresora. Ábrela en Ajustes → Empresa → Impresora (o el icono de impresora del TPV) y guárdala.',
    };
  }
  const safePort = sanitizePrinterPort(port);
  if (bytes && bytes.byteLength === 0) {
    return { ok: false, error: 'El ticket está vacío; no hay nada que imprimir.' };
  }
  return { ok: true, host: safeHost, port: safePort };
}

export function resolveNativePrintTargetFromConfig(
  config: VertialPrinterConfig,
  bytes?: Uint8Array,
): NativePrintTarget {
  return assertNativePrintTarget(config.networkHost, config.networkPort, bytes);
}

/** Cola global: evita solapar tickets en la tablet (doble tap / auto + manual). */
let printQueueTail: Promise<unknown> = Promise.resolve();

export async function enqueueNativePrint<T>(task: () => Promise<T>): Promise<T> {
  const previous = printQueueTail;
  let release!: () => void;
  printQueueTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous.catch(() => undefined);
    return await task();
  } finally {
    release();
  }
}
