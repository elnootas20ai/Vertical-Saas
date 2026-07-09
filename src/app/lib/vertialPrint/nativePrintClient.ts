import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';

/** Puertos habituales de impresoras térmicas ESC/POS por red. */
export const NATIVE_RAW_PRINT_PORTS = [9100, 9101, 9102] as const;

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
  try {
    const ESCPOSProxy = await escposProxy();
    await ESCPOSProxy.print({ ip: host, port, message: bytesToBase64(bytes) });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo conectar con la impresora';
    return { ok: false, error: message };
  }
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
    const { online, rtt } = await ESCPOSProxy.ping({ ip: host, port });
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
  const timeout = Math.max(5000, Number(options?.timeoutMs || 20000));
  try {
    const ESCPOSProxy = await escposProxy();
    const { printers } = await ESCPOSProxy.discover({
      ports: ports.length > 0 ? ports : [...NATIVE_RAW_PRINT_PORTS],
      timeout,
    });
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
