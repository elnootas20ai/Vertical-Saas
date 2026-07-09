import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';
import { withNativeCallTimeout } from './nativeCallTimeout';

/** Puertos habituales de impresoras térmicas ESC/POS por red. */
export const NATIVE_RAW_PRINT_PORTS = [9100, 9101, 9102] as const;

const NATIVE_PRINT_TIMEOUT_MS = 12_000;
const NATIVE_DISCOVER_TIMEOUT_MS = 8_000;
// En LAN una impresora responde en <100 ms; 3,5 s ya es margen de sobra y la UI no se eterniza.
const NATIVE_PING_TIMEOUT_MS = 3_500;

function withNativeTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return withNativeCallTimeout(promise, timeoutMs, label);
}

export interface NativeNetworkPrinterInfo {
  host: string;
  port: number;
  label?: string;
  /** Cómo se detectó: Bonjour/mDNS o escaneo de la subred WiFi. */
  source?: 'mdns' | 'scan';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function escposProxy() {
  const mod = await import('esc-pos-proxy-capacitor-plugin');
  return mod.ESCPOSProxy;
}

function normalizeDiscoveredPrinter(item: {
  ip: string;
  port: number;
  source: 'mdns' | 'scan';
}): NativeNetworkPrinterInfo | null {
  const host = String(item.ip || '').trim();
  if (!host) return null;

  let port = Number(item.port) || 9100;
  // Bonjour a veces anuncia IPP (631) u otros servicios; ESC/POS suele ir en 9100.
  if (!NATIVE_RAW_PRINT_PORTS.includes(port as (typeof NATIVE_RAW_PRINT_PORTS)[number])) {
    if (item.source === 'mdns') port = 9100;
    else return null;
  }

  const sourceLabel = item.source === 'mdns' ? 'Detectada por WiFi' : 'En la red local';
  return {
    host,
    port,
    source: item.source,
    label: `${sourceLabel} · ${host}:${port}`,
  };
}

function dedupeNativePrinters(printers: NativeNetworkPrinterInfo[]): NativeNetworkPrinterInfo[] {
  const byHost = new Map<string, NativeNetworkPrinterInfo>();
  for (const printer of printers) {
    const existing = byHost.get(printer.host);
    if (!existing) {
      byHost.set(printer.host, printer);
      continue;
    }
    // Preferir resultado de escaneo TCP (puerto verificado) sobre mDNS genérico.
    if (existing.source !== 'scan' && printer.source === 'scan') {
      byHost.set(printer.host, printer);
      continue;
    }
    if (printer.port < existing.port) {
      byHost.set(printer.host, printer);
    }
  }
  return Array.from(byHost.values()).sort((a, b) => a.host.localeCompare(b.host, 'es'));
}

async function sendEscposToHost(
  host: string,
  port: number,
  bytes: Uint8Array,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ESCPOSProxy = await escposProxy();
    await withNativeTimeout(
      ESCPOSProxy.print({ ip: host, port, message: bytesToBase64(bytes) }),
      NATIVE_PRINT_TIMEOUT_MS,
      'Impresión',
    );
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo conectar con la impresora';
    return { ok: false, error: message };
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendNativeEscpos(
  bytes: Uint8Array,
  config: VertialPrinterConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!isVertialNativeApp()) {
    return { ok: false, error: 'Impresión nativa solo disponible en la app Vertial' };
  }
  const host = String(config.networkHost || '').trim();
  if (!host) {
    return { ok: false, error: 'Indica la IP de la impresora' };
  }
  const port = Number(config.networkPort || 9100) || 9100;

  const first = await sendEscposToHost(host, port, bytes);
  if (first.ok) return first;

  // Un microcorte de WiFi no debe perder el ticket: un reintento antes de dar error.
  await wait(900);
  const second = await sendEscposToHost(host, port, bytes);
  if (second.ok) return second;

  return {
    ok: false,
    error: `La impresora ${host} no responde. Comprueba que está encendida y en la misma WiFi, o usa «Buscar impresora» en Ajustes por si cambió de dirección.`,
  };
}

/** Imprime un ticket corto de identificación en una impresora detectada (sin guardarla aún). */
export async function identifyNativePrinter(
  host: string,
  port: number,
  paperWidthMm: 58 | 80 = 80,
): Promise<{ ok: boolean; error?: string }> {
  if (!isVertialNativeApp()) {
    return { ok: false, error: 'Solo disponible en la app Vertial' };
  }
  const { encodeIdentifyTicketEscpos } = await import('./escposEncode');
  const bytes = encodeIdentifyTicketEscpos(host, port, paperWidthMm);
  return sendEscposToHost(String(host || '').trim(), Number(port) || 9100, bytes);
}

export async function pingNativePrinter(
  config: VertialPrinterConfig,
): Promise<{ ok: boolean; rtt?: number }> {
  if (!isVertialNativeApp()) return { ok: false };
  const host = String(config.networkHost || '').trim();
  if (!host) return { ok: false };
  const port = Number(config.networkPort || 9100) || 9100;
  try {
    const ESCPOSProxy = await escposProxy();
    const { online, rtt } = await withNativeTimeout(
      ESCPOSProxy.ping({ ip: host, port }),
      NATIVE_PING_TIMEOUT_MS,
      'Comprobación de impresora',
    );
    return { ok: Boolean(online), rtt };
  } catch {
    return { ok: false };
  }
}

export async function discoverNativeNetworkPrinters(options?: {
  ports?: number[];
  timeoutMs?: number;
}): Promise<{ ok: boolean; printers: NativeNetworkPrinterInfo[]; error?: string }> {
  if (!isVertialNativeApp()) {
    return { ok: false, printers: [], error: 'Búsqueda en red solo en la app Vertial' };
  }
  const ports = (options?.ports?.length ? options.ports : [...NATIVE_RAW_PRINT_PORTS])
    .map((port) => Number(port) || 0)
    .filter((port) => port > 0);
  const timeout = Math.min(15_000, Math.max(5000, Number(options?.timeoutMs || NATIVE_DISCOVER_TIMEOUT_MS)));
  try {
    const ESCPOSProxy = await escposProxy();
    const { printers } = await withNativeTimeout(
      ESCPOSProxy.discover({
        ports: ports.length > 0 ? ports : [...NATIVE_RAW_PRINT_PORTS],
        timeout,
      }),
      timeout + 3_000,
      'Búsqueda de impresoras',
    );
    const normalized = (printers || [])
      .map((item) => normalizeDiscoveredPrinter(item))
      .filter((item): item is NativeNetworkPrinterInfo => Boolean(item));
    return {
      ok: true,
      printers: dedupeNativePrinters(normalized),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo buscar impresoras';
    const permissionHint = /local network|bonjour|permission|denied|not authorized|nslocalnetwork/i.test(message)
      ? ' Activa el permiso de «red local» para Vertial en Ajustes del dispositivo.'
      : '';
    return { ok: false, printers: [], error: `${message}${permissionHint}` };
  }
}
