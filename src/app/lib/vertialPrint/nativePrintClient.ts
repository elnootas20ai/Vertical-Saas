import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';
import { withNativeCallTimeout } from './nativeCallTimeout';

/** Puertos habituales de impresoras térmicas ESC/POS por red. */
export const NATIVE_RAW_PRINT_PORTS = [9100, 9101, 9102] as const;

const NATIVE_PRINT_TIMEOUT_MS = 7_000;
const NATIVE_PRINT_RETRY_TIMEOUT_MS = 5_000;
const NATIVE_DISCOVER_PLUGIN_TIMEOUT_MS = 5_000;
const NATIVE_DISCOVER_PING_SWEEP_MS = 8_000;
const NATIVE_PING_TIMEOUT_MS = 350;

/** Prefijos habituales en WiFi de locales (España/Europa). */
const COMMON_LAN_PREFIXES = ['192.168.1', '192.168.0', '192.168.4', '10.0.0'] as const;

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

async function pingHostReachable(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  try {
    const ESCPOSProxy = await escposProxy();
    const { online } = await withNativeTimeout(
      ESCPOSProxy.ping({ ip, port }),
      timeoutMs,
      'Comprobación de impresora',
    );
    return Boolean(online);
  } catch {
    return false;
  }
}

/** Barrido TCP por ping cuando discover del plugin no responde o no encuentra nada. */
async function discoverByPingSweep(
  ports: number[],
  timeoutMs: number,
  onProgress?: (checked: number, total: number) => void,
): Promise<NativeNetworkPrinterInfo[]> {
  const targetPorts = ports.length > 0 ? ports : [...NATIVE_RAW_PRINT_PORTS];
  const primaryPort = targetPorts[0] || 9100;
  const deadline = Date.now() + timeoutMs;
  const found: NativeNetworkPrinterInfo[] = [];
  const batchSize = 20;

  const prefixes = [...COMMON_LAN_PREFIXES];
  const allHosts = prefixes.flatMap((prefix) =>
    Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`),
  );
  let checked = 0;

  for (let offset = 0; offset < allHosts.length; offset += batchSize) {
    if (Date.now() >= deadline) break;

    const batch = allHosts.slice(offset, offset + batchSize);
    const hits = await Promise.all(
      batch.map(async (ip) => {
        for (const port of targetPorts) {
          if (Date.now() >= deadline) return null;
          if (await pingHostReachable(ip, port, NATIVE_PING_TIMEOUT_MS)) {
            return { ip, port };
          }
        }
        return null;
      }),
    );

    for (const hit of hits) {
      if (!hit) continue;
      const normalized = normalizeDiscoveredPrinter({
        ip: hit.ip,
        port: hit.port,
        source: 'scan',
      });
      if (normalized) found.push(normalized);
    }

    checked = Math.min(allHosts.length, offset + batch.length);
    onProgress?.(checked, allHosts.length);
  }

  return dedupeNativePrinters(found);
}

async function discoverViaPlugin(
  ports: number[],
  timeoutMs: number,
): Promise<NativeNetworkPrinterInfo[]> {
  const ESCPOSProxy = await escposProxy();
  const { printers } = await withNativeTimeout(
    ESCPOSProxy.discover({
      ports: ports.length > 0 ? ports : [...NATIVE_RAW_PRINT_PORTS],
      timeout: timeoutMs,
    }),
    timeoutMs + 800,
    'Búsqueda de impresoras',
  );
  return (printers || [])
    .map((item) => normalizeDiscoveredPrinter(item))
    .filter((item): item is NativeNetworkPrinterInfo => Boolean(item));
}

async function sendEscposToHost(
  host: string,
  port: number,
  bytes: Uint8Array,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ESCPOSProxy = await escposProxy();
    await withNativeTimeout(
      ESCPOSProxy.print({ ip: host, port, message: bytesToBase64(bytes) }),
      timeoutMs,
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

  const first = await sendEscposToHost(host, port, bytes, NATIVE_PRINT_TIMEOUT_MS);
  if (first.ok) return first;

  await wait(600);
  const second = await sendEscposToHost(host, port, bytes, NATIVE_PRINT_RETRY_TIMEOUT_MS);
  if (second.ok) return second;

  return {
    ok: false,
    error:
      first.error ||
      second.error ||
      `La impresora ${host} no responde. Comprueba que está encendida, en la misma WiFi, y que Vertial tiene permiso de «red local» en Ajustes.`,
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
  return sendEscposToHost(String(host || '').trim(), Number(port) || 9100, bytes, NATIVE_PRINT_TIMEOUT_MS);
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
      NATIVE_PING_TIMEOUT_MS + 200,
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
  onProgress?: (checked: number, total: number) => void;
}): Promise<{ ok: boolean; printers: NativeNetworkPrinterInfo[]; error?: string }> {
  if (!isVertialNativeApp()) {
    return { ok: false, printers: [], error: 'Búsqueda en red solo en la app Vertial' };
  }

  const ports = (options?.ports?.length ? options.ports : [...NATIVE_RAW_PRINT_PORTS])
    .map((port) => Number(port) || 0)
    .filter((port) => port > 0);
  const pluginTimeout = Math.min(
    6_000,
    Math.max(3_000, Number(options?.timeoutMs || NATIVE_DISCOVER_PLUGIN_TIMEOUT_MS)),
  );

  let pluginPrinters: NativeNetworkPrinterInfo[] = [];
  try {
    pluginPrinters = dedupeNativePrinters(await discoverViaPlugin(ports, pluginTimeout));
  } catch {
    /* discover nativo puede colgarse: seguimos con barrido por ping */
  }

  if (pluginPrinters.length > 0) {
    return { ok: true, printers: pluginPrinters };
  }

  try {
    const swept = await discoverByPingSweep(
      ports,
      NATIVE_DISCOVER_PING_SWEEP_MS,
      options?.onProgress,
    );
    if (swept.length > 0) {
      return { ok: true, printers: swept };
    }
    return {
      ok: true,
      printers: [],
      error:
        'No se encontró ninguna impresora térmica. Comprueba que está encendida, en la misma WiFi, y el permiso de «red local» para Vertial.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo buscar impresoras';
    const permissionHint = /local network|bonjour|permission|denied|not authorized|nslocalnetwork|red local/i.test(
      message,
    )
      ? ' Activa el permiso de «red local» para Vertial en Ajustes del iPhone.'
      : '';
    return { ok: false, printers: [], error: `${message}${permissionHint}` };
  }
}
