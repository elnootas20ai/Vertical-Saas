import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';
import { withNativeCallTimeout } from './nativeCallTimeout';
import { getEscposPlugin, getNativeLocalNetworkInfo } from './escposPlugin';

/** Puertos habituales de impresoras térmicas ESC/POS por red. */
export const NATIVE_RAW_PRINT_PORTS = [9100, 9101, 9102] as const;

/**
 * BLINDADO — TestFlight build 33 / commit 112127f (Codemagic #33).
 * NO acortar timeouts ni invertir Bridge↔ESCPOSProxy sin OK explícito del dueño.
 */
const NATIVE_PRINT_TIMEOUT_MS = 20_000;
const NATIVE_PRINT_RETRY_TIMEOUT_MS = 12_000;
const NATIVE_PRINT_RETRY_DELAY_MS = 400;
const NATIVE_DISCOVER_PLUGIN_TIMEOUT_MS = 10_000;
const NATIVE_DISCOVER_PLUGIN_RETRY_MS = 8_000;
const NATIVE_DISCOVER_SUBNET_SWEEP_MS = 12_000;
const NATIVE_PING_TIMEOUT_MS = 3_500;
/** Ping corto para barridos: con 3 s por host el barrido no cubre la subred. */
const NATIVE_SWEEP_PING_TIMEOUT_MS = 1_500;

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

/** Respaldo si ESCPOSProxy falla: VertialIosBridge (mismo TCP 9100). */
async function printViaVertialBridge(
  host: string,
  port: number,
  bytes: Uint8Array,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const bridge = registerPlugin<{
      printEscPos: (opts: { ip: string; port: number; message: string }) => Promise<{ status?: string }>;
    }>('VertialIosBridge');
    await withNativeTimeout(
      bridge.printEscPos({ ip: host, port, message: bytesToBase64(bytes) }),
      timeoutMs,
      'Impresión',
    );
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo imprimir';
    return { ok: false, error: message };
  }
}

async function pingViaVertialBridge(
  host: string,
  port: number,
): Promise<{ ok: boolean; rtt?: number }> {
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const bridge = registerPlugin<{
      pingHost: (opts: { ip: string; port: number }) => Promise<{ online?: boolean; rtt?: number }>;
    }>('VertialIosBridge');
    const result = await withNativeTimeout(
      bridge.pingHost({ ip: host, port }),
      NATIVE_PING_TIMEOUT_MS,
      'Comprobación de impresora',
    );
    return { ok: Boolean(result?.online), rtt: result?.rtt };
  } catch {
    return { ok: false };
  }
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

/** Barrido TCP por ping (solo puerto 9100) cuando discover del plugin no encuentra nada. */
async function discoverByPingSweep(
  timeoutMs: number,
  onProgress?: (checked: number, total: number) => void,
  subnetHintHost?: string,
): Promise<NativeNetworkPrinterInfo[]> {
  const deadline = Date.now() + timeoutMs;
  const found: NativeNetworkPrinterInfo[] = [];
  const batchSize = 24;

  const prefix = buildSweepPrefixes(subnetHintHost, true)[0];
  if (!prefix) return found;

  const priority = PRIORITY_LAST_OCTETS.map((n) => `${prefix}.${n}`);
  const rest = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`)
    .filter((ip) => !priority.includes(ip));
  const hosts = [...priority, ...rest];
  let checked = 0;

  const tryHost = async (ip: string): Promise<NativeNetworkPrinterInfo | null> => {
    if (Date.now() >= deadline) return null;
    if (await pingHostReachable(ip, 9100, NATIVE_SWEEP_PING_TIMEOUT_MS)) {
      return normalizeDiscoveredPrinter({ ip, port: 9100, source: 'scan' });
    }
    return null;
  };

  for (let offset = 0; offset < hosts.length; offset += batchSize) {
    if (Date.now() >= deadline) break;
    const batch = hosts.slice(offset, offset + batchSize);
    const hits = await Promise.all(batch.map((ip) => tryHost(ip)));
    for (const hit of hits) {
      if (hit && !found.some((item) => item.host === hit.host)) found.push(hit);
    }
    checked = Math.min(hosts.length, checked + batch.length);
    onProgress?.(checked, hosts.length);
    if (found.length > 0) break;
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
      // Nunca esperar sin tope: un print nativo colgado dejaba la cola bloqueada minutos.
      await withNativeTimeout(inflight, Math.min(timeoutMs, 8_000), 'Impresión anterior');
    } catch {
      escposInFlight.delete(key);
    }
  }

  const run = (async () => {
    // BLINDADO build 33 (112127f): Bridge propio primero (estable en iPad). ESCPOSProxy de respaldo.
    const viaBridge = await printViaVertialBridge(host, port, bytes, timeoutMs);
    if (viaBridge.ok) return { ok: true as const };

    try {
      const ESCPOSProxy = await escposProxy();
      await withNativeTimeout(
        ESCPOSProxy.print({ ip: host, port, message: bytesToBase64(bytes) }),
        timeoutMs,
        'Impresión',
      );
      return { ok: true as const };
    } catch (primaryError) {
      const message =
        viaBridge.error ||
        (primaryError instanceof Error ? primaryError.message : 'No se pudo conectar con la impresora');
      const friendly = /unimplemented|not implemented|is not implemented/i.test(message)
        ? 'El módulo de impresión nativo no está disponible. Actualiza la app desde TestFlight e inténtalo de nuevo.'
        : message;
      return {
        ok: false as const,
        error: `${friendly} (IP ${host}:${port})`,
      };
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
  return pingNativeHost(String(config.networkHost || '').trim(), Number(config.networkPort || 9100) || 9100);
}

export async function pingNativeHost(
  host: string,
  port = 9100,
): Promise<{ ok: boolean; rtt?: number }> {
  if (!isVertialNativeApp()) return { ok: false };
  const ip = String(host || '').trim();
  if (!ip) return { ok: false };
  const safePort = Number(port) || 9100;
  const viaBridge = await pingViaVertialBridge(ip, safePort);
  if (viaBridge.ok) return viaBridge;
  try {
    const ESCPOSProxy = await escposProxy();
    const { online, rtt } = await withNativeTimeout(
      ESCPOSProxy.ping({ ip, port: safePort }),
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
  onProgress?: (checked: number, total: number) => void;
  /** IP guardada o del router: prioriza esa subred en el barrido (iPad/iPhone). */
  subnetHintHost?: string;
}): Promise<{
  ok: boolean;
  printers: NativeNetworkPrinterInfo[];
  error?: string;
  diagnostics?: NativeNetworkPrinterDiscoveryDiagnostics;
}> {
  if (!isVertialNativeApp()) {
    return { ok: false, printers: [], error: 'Búsqueda en red solo en la app Vertial' };
  }

  let deviceNetwork: Awaited<ReturnType<typeof getNativeLocalNetworkInfo>> = null;
  try {
    deviceNetwork = await withNativeTimeout(getNativeLocalNetworkInfo(), 3_000, 'Información de red');
  } catch {
    deviceNetwork = null;
  }
  const subnetHintHost = options?.subnetHintHost || deviceNetwork?.ip || undefined;
  const scannedPrefix = deviceNetwork?.prefix || buildSweepPrefixes(subnetHintHost, true)[0] || '';

  const ports = (options?.ports?.length ? options.ports : [...NATIVE_RAW_PRINT_PORTS])
    .map((port) => Number(port) || 0)
    .filter((port) => port > 0);

  const buildDiagnostics = (pluginFound: number, sweepFound: number): NativeNetworkPrinterDiscoveryDiagnostics => ({
    deviceIp: deviceNetwork?.ip || '',
    devicePrefix: deviceNetwork?.prefix || '',
    scannedPrefix,
    pluginFound,
    sweepFound,
    deepScan: false,
  });

  try {
    // 1) Descubrimiento nativo (mDNS + escaneo /24 con conexiones concurrentes): lo rápido.
    //    En iOS este primer intento dispara el aviso de «Red local» si aún no se concedió.
    const firstPass = await discoverViaPlugin(ports, NATIVE_DISCOVER_PLUGIN_TIMEOUT_MS).catch(
      () => [] as NativeNetworkPrinterInfo[],
    );
    if (firstPass.length > 0) {
      return { ok: true, printers: firstPass, diagnostics: buildDiagnostics(firstPass.length, 0) };
    }

    // 2) Segundo intento nativo con más tiempo: si el aviso de permiso acaba de aceptarse,
    //    el primer escaneo falló con los sockets bloqueados y este ya funciona.
    const secondPass = await discoverViaPlugin(ports, NATIVE_DISCOVER_PLUGIN_RETRY_MS).catch(
      () => [] as NativeNetworkPrinterInfo[],
    );
    if (secondPass.length > 0) {
      return { ok: true, printers: secondPass, diagnostics: buildDiagnostics(secondPass.length, 0) };
    }

    // 3) Último recurso: barrido por ping desde JS (solo puerto 9100, subred del dispositivo).
    const swept = await discoverByPingSweep(
      NATIVE_DISCOVER_SUBNET_SWEEP_MS,
      options?.onProgress,
      subnetHintHost,
    );
    if (swept.length > 0) {
      return { ok: true, printers: swept, diagnostics: buildDiagnostics(0, swept.length) };
    }

    const prefixHint = scannedPrefix ? ` en la red ${scannedPrefix}.x` : '';
    return {
      ok: true,
      printers: [],
      diagnostics: buildDiagnostics(0, 0),
      error: deviceNetwork?.prefix
        ? `No se encontró ninguna impresora${prefixHint}. Comprueba que está encendida y en la misma WiFi, y que Vertial tiene «Red local» activado en Ajustes de iOS (Ajustes → Vertial → Red local). Luego vuelve a buscar.`
        : 'No se detectó WiFi local. Conecta el iPhone/iPad a la red WiFi del local (no solo datos móviles) y activa «Red local» para Vertial en Ajustes de iOS.',
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
