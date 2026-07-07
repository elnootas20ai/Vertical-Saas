import type { VertialPrinterConfig } from './printerConfig';
import { isVertialNativeApp } from './isNativeApp';

export interface NativeNetworkPrinterInfo {
  host: string;
  port: number;
  label?: string;
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
  port?: number;
  timeoutMs?: number;
}): Promise<{ ok: boolean; printers: NativeNetworkPrinterInfo[]; error?: string }> {
  if (!isVertialNativeApp()) {
    return { ok: false, printers: [], error: 'Búsqueda en red solo en la app Vertial' };
  }
  const port = Number(options?.port || 9100) || 9100;
  const timeout = Math.max(5000, Number(options?.timeoutMs || 15000));
  try {
    const ESCPOSProxy = await escposProxy();
    const { printers } = await ESCPOSProxy.discover({ ports: [port], timeout });
    return {
      ok: true,
      printers: (printers || []).map((item) => ({
        host: item.ip,
        port: item.port || port,
        label: `Impresora térmica · ${item.ip}`,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo buscar impresoras';
    return { ok: false, printers: [], error: message };
  }
}
