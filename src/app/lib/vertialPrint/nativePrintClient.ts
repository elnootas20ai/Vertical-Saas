import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';
import { withNativeCallTimeout } from './nativeCallTimeout';
import { getEscposPlugin, getNativeLocalNetworkInfo } from './escposPlugin';

/** Puertos habituales de impresoras térmicas ESC/POS por red. */
export const NATIVE_RAW_PRINT_PORTS = [9100, 9101, 9102] as const;

const NATIVE_PRINT_TIMEOUT_MS = 8_000;
const NATIVE_PRINT_RETRY_TIMEOUT_MS = 6_000;
const NATIVE_PRINT_RETRY_DELAY_MS = 400;
const NATIVE_DISCOVER_PLUGIN_TIMEOUT_MS = 6_000;
const NATIVE_DISCOVER_PING_SWEEP_MS = 22_000;
const NATIVE_DISCOVER_SUBNET_SWEEP_MS = 30_000;
const NATIVE_PING_TIMEOUT_MS = 3_000;

/** IPs habituales de impresoras térmicas en routers de locales. */
const PRIORITY_LAST_OCTETS = [20, 50, 100, 200, 10, 1, 254, 2, 30, 40, 60, 80, 150, 22, 23, 24, 25];

/** Prefijos habituales en WiFi de locales (España/Europa). */
export const COMMON_LAN_PREFIXES = [
  '192.168.1',
  '192.168.0',
  '192.168.2',
  '192.168.4',
  '192.168.8',
  '192.168.10',
  '192.168.31',
  '192.168.50',
  '10.0.0',
  '10.0.1',
  '172.16.0',
] as const;

/** Ordena subredes poniendo primero la del dispositivo/impresora conocida (mejor cobertura en iOS). */
export function buildOrderedLanPrefixes(hintHost?: string): string[] {
  const hint = String(hintHost || '').trim();
  const match = hint.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  const hintPrefix = match?.[1];
  const ordered = hintPrefix
    ? [hintPrefix, ...COMMON_LAN_PREFIXES.filter((prefix) => prefix !== hintPrefix)]
    : [...COMMON_LAN_PREFIXES];
  return ordered;
}

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

export interface NativeNetworkPrinterDiscoveryDiagnostics {
  deviceIp: string;
  devicePrefix: string;
  scannedPrefix: string;
  pluginFound: number;
  sweepFound: number;
  deepScan: boolean;
}

function buildSweepPrefixes(subnetHintHost?: string, subnetOnly?: boolean): string[] {
  const ordered = buildOrderedLanPrefixes(subnetHintHost);
  if (subnetOnly && ordered.length > 0) return [ordered[0]];
  return ordered;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function escposProxy() {
  return getEscposPlugin();
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
  subnetHintHost?: string,
  subnetOnly = false,
  options?: { priorityOnly?: boolean },
): Promise<NativeNetworkPrinterInfo[]> {
  const targetPorts = ports.length > 0 ? ports : [...NATIVE_RAW_PRINT_PORTS];
  const deadline = Date.now() + timeoutMs;
  const found: NativeNetworkPrinterInfo[] = [];
  const batchSize = 12;

  const prefixes = buildSweepPrefixes(subnetHintHost, subnetOnly);
  const totalHosts = prefixes.length * 254;
  let checked = 0;

  const tryHost = async (ip: string): Promise<NativeNetworkPrinterInfo | null> => {
    for (const port of targetPorts) {
      if (Date.now() >= deadline) return null;
      if (await pingHostReachable(ip, port, NATIVE_PING_TIMEOUT_MS)) {
        return normalizeDiscoveredPrinter({ ip, port, source: 'scan' });
      }
    }
    return null;
  };

  const pushHit = (hit: NativeNetworkPrinterInfo | null) => {
    if (!hit) return;
    if (!found.some((item) => item.host === hit.host && item.port === hit.port)) {
      found.push(hit);
    }
  };

  // 1) IPs frecuentes en la subred del dispositivo (muchas impresoras usan .20, .50, etc.)
  const primaryPrefix = prefixes[0];
  if (primaryPrefix) {
    const priorityHosts = PRIORITY_LAST_OCTETS.map((n) => `${primaryPrefix}.${n}`);
    for (let offset = 0; offset < priorityHosts.length; offset += batchSize) {
      if (Date.now() >= deadline) break;
      const batch = priorityHosts.slice(offset, offset + batchSize);
      const hits = await Promise.all(batch.map((ip) => tryHost(ip)));
      for (const hit of hits) pushHit(hit);
      checked = Math.min(totalHosts, checked + batch.length);
      onProgress?.(checked, totalHosts);
      if (found.length > 0) return dedupeNativePrinters(found);
    }
  }

  if (options?.priorityOnly) {
    return dedupeNativePrinters(found);
  }

  // 2) Barrido completo 1–254 por prefijo
  for (const prefix of prefixes) {
    if (Date.now() >= deadline) break;

    const prefixHosts = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`);
    for (let offset = 0; offset < prefixHosts.length; offset += batchSize) {
      if (Date.now() >= deadline) break;

      const batch = prefixHosts.slice(offset, offset + batchSize);
      const hits = await Promise.all(batch.map((ip) => tryHost(ip)));
      for (const hit of hits) pushHit(hit);

      checked = Math.min(totalHosts, checked + batch.length);
      onProgress?.(checked, totalHosts);

      if (found.length > 0 && !subnetOnly) break;
    }

    if (found.length > 0 && !subnetOnly) break;
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

const escposInFlight = new Map<string, Promise<{ ok: boolean; error?: string }>>();

async function sendEscposToHost(
  host: string,
  port: number,
  bytes: Uint8Array,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  const key = `${host}:${port}`;
  const inflight = escposInFlight.get(key);
  if (inflight) {
    try {
      await inflight;
    } catch {
      /* esperar a que termine el intento anterior */
    }
  }

  const run = (async () => {
    try {
      const ESCPOSProxy = await escposProxy();
      await withNativeTimeout(
        ESCPOSProxy.print({ ip: host, port, message: bytesToBase64(bytes) }),
        timeoutMs,
        'Impresión',
      );
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar con la impresora';
      return { ok: false as const, error: message };
    }
  })();

  escposInFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (escposInFlight.get(key) === run) escposInFlight.delete(key);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendNativeEscpos(
  bytes: Uint8Array,
  config: VertialPrinterConfig,
  options?: { retry?: boolean; timeoutMs?: number },
): Promise<{ ok: boolean; error?: string }> {
  if (!isVertialNativeApp()) {
    return { ok: false, error: 'Impresión nativa solo disponible en la app Vertial' };
  }
  const host = String(config.networkHost || '').trim();
  if (!host) {
    return { ok: false, error: 'Indica la IP de la impresora' };
  }
  const port = Number(config.networkPort || 9100) || 9100;
  const timeoutMs = Math.max(1500, Number(options?.timeoutMs || NATIVE_PRINT_TIMEOUT_MS));
  const allowRetry = options?.retry !== false;

  const first = await sendEscposToHost(host, port, bytes, timeoutMs);
  if (first.ok) return first;
  if (!allowRetry) {
    return {
      ok: false,
      error: first.error || `La impresora ${host} no responde. Comprueba que está encendida y en la misma WiFi.`,
    };
  }

  await wait(NATIVE_PRINT_RETRY_DELAY_MS);
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

export async function pingNativeHost(
  host: string,
  port = 9100,
): Promise<{ ok: boolean; rtt?: number }> {
  if (!isVertialNativeApp()) return { ok: false };
  const ip = String(host || '').trim();
  if (!ip) return { ok: false };
  try {
    const ESCPOSProxy = await escposProxy();
    const { online, rtt } = await withNativeTimeout(
      ESCPOSProxy.ping({ ip, port: Number(port) || 9100 }),
      NATIVE_PING_TIMEOUT_MS + 500,
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
  /** IP guardada o del router: prioriza esa subred en el barrido (iPad/iPhone). */
  subnetHintHost?: string;
  /** Primera búsqueda tras conceder permiso: más tiempo para mDNS iOS. */
  firstScan?: boolean;
  /** Escaneo profundo: solo la subred WiFi del móvil, hasta ~45 s. */
  deepScan?: boolean;
}): Promise<{
  ok: boolean;
  printers: NativeNetworkPrinterInfo[];
  error?: string;
  diagnostics?: NativeNetworkPrinterDiscoveryDiagnostics;
}> {
  if (!isVertialNativeApp()) {
    return { ok: false, printers: [], error: 'Búsqueda en red solo en la app Vertial' };
  }

  const deviceNetwork = await getNativeLocalNetworkInfo();
  const subnetHintHost =
    options?.subnetHintHost ||
    deviceNetwork?.ip ||
    (deviceNetwork?.prefix ? `${deviceNetwork.prefix}.1` : undefined);
  const scannedPrefix = buildSweepPrefixes(subnetHintHost, true)[0] || deviceNetwork?.prefix || '';

  const ports = (options?.ports?.length ? options.ports : [...NATIVE_RAW_PRINT_PORTS])
    .map((port) => Number(port) || 0)
    .filter((port) => port > 0);
  const deepScan = Boolean(options?.deepScan);
  const firstScan = Boolean(options?.firstScan);
  const subnetSweepMs = deepScan ? NATIVE_DISCOVER_SUBNET_SWEEP_MS : NATIVE_DISCOVER_PING_SWEEP_MS;

  try {
    if (!deepScan) {
      const quick = await discoverByPingSweep(
        ports,
        12_000,
        options?.onProgress,
        subnetHintHost,
        true,
        { priorityOnly: true },
      );
      if (quick.length > 0) {
        return {
          ok: true,
          printers: quick,
          diagnostics: {
            deviceIp: deviceNetwork?.ip || '',
            devicePrefix: deviceNetwork?.prefix || '',
            scannedPrefix,
            pluginFound: 0,
            sweepFound: quick.length,
            deepScan: false,
          },
        };
      }

      const pluginTimeout = firstScan ? 6_000 : 3_000;
      const [pluginResult, swept] = await Promise.all([
        discoverViaPlugin(ports, pluginTimeout).catch(() => [] as NativeNetworkPrinterInfo[]),
        discoverByPingSweep(ports, subnetSweepMs, options?.onProgress, subnetHintHost, true),
      ]);
      const pluginPrinters = dedupeNativePrinters(pluginResult);
      const merged = dedupeNativePrinters([...pluginPrinters, ...swept]);

      const diagnostics: NativeNetworkPrinterDiscoveryDiagnostics = {
        deviceIp: deviceNetwork?.ip || '',
        devicePrefix: deviceNetwork?.prefix || '',
        scannedPrefix,
        pluginFound: pluginPrinters.length,
        sweepFound: swept.length,
        deepScan: false,
      };

      if (merged.length > 0) {
        return { ok: true, printers: merged, diagnostics };
      }

      const prefixHint = scannedPrefix ? ` en ${scannedPrefix}.x` : '';
      return {
        ok: true,
        printers: [],
        diagnostics,
        error: deviceNetwork?.prefix
          ? `No hay ninguna impresora térmica${prefixHint}. Comprueba que está encendida, en la misma WiFi que este dispositivo (${deviceNetwork.ip || 'sin IP'}) y responde en el puerto 9100. Si conoces la IP, configúrala abajo.`
          : 'No se detectó WiFi local. Conecta el iPhone/iPad a la red del local (no solo datos móviles).',
      };
    }

    const swept = await discoverByPingSweep(
      ports,
      subnetSweepMs,
      options?.onProgress,
      subnetHintHost,
      true,
    );
    if (swept.length > 0) {
      return {
        ok: true,
        printers: swept,
        diagnostics: {
          deviceIp: deviceNetwork?.ip || '',
          devicePrefix: deviceNetwork?.prefix || '',
          scannedPrefix,
          pluginFound: 0,
          sweepFound: swept.length,
          deepScan: true,
        },
      };
    }

    const extraSwept = await discoverByPingSweep(
      ports,
      NATIVE_DISCOVER_PING_SWEEP_MS,
      options?.onProgress,
      subnetHintHost,
      false,
    );
    const diagnostics: NativeNetworkPrinterDiscoveryDiagnostics = {
      deviceIp: deviceNetwork?.ip || '',
      devicePrefix: deviceNetwork?.prefix || '',
      scannedPrefix,
      pluginFound: 0,
      sweepFound: extraSwept.length,
      deepScan: true,
    };
    if (extraSwept.length > 0) {
      return { ok: true, printers: extraSwept, diagnostics };
    }

    const prefixHint = scannedPrefix ? ` en ${scannedPrefix}.x` : '';
    return {
      ok: true,
      printers: [],
      diagnostics,
      error: deviceNetwork?.prefix
        ? `No hay ninguna impresora térmica${prefixHint}. Comprueba que está encendida, en la misma WiFi que este dispositivo (${deviceNetwork.ip || 'sin IP'}) y responde en el puerto 9100. Si conoces la IP, configúrala abajo.`
        : 'No se detectó WiFi local. Conecta el iPhone/iPad a la red del local (no solo datos móviles).',
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
