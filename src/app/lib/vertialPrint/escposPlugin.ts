import { registerPlugin } from '@capacitor/core';
import { isVertialNativeApp } from './isNativeApp';
import { withNativeCallTimeout } from './nativeCallTimeout';

export interface NativeLocalNetworkInfo {
  ip: string;
  prefix: string;
}

export type EscposPlugin = {
  print(options: { message: string; ip: string; port: number }): Promise<{ status: string }>;
  ping(options: { ip: string; port?: number }): Promise<{ online: boolean; rtt?: number }>;
  discover(options?: { ports?: number[]; timeout?: number }): Promise<{
    printers: Array<{ ip: string; port: number; source: 'scan' | 'mdns' }>;
  }>;
  getLocalNetworkInfo?: () => Promise<{ ip?: string; prefix?: string }>;
};

/**
 * Proxy nativo Capacitor (jsName = ESCPOSProxy).
 * No usar dynamic import del paquete: en iOS el chunk a veces falla y
 * dispara el falso «Plugin impresora tardó demasiado».
 */
const ESCPOSProxyNative = registerPlugin<EscposPlugin>('ESCPOSProxy');

export async function getEscposPlugin(): Promise<EscposPlugin> {
  return ESCPOSProxyNative;
}

/** IP y prefijo /24 de la WiFi del dispositivo (plugin nativo). */
export async function getNativeLocalNetworkInfo(): Promise<NativeLocalNetworkInfo | null> {
  if (!isVertialNativeApp()) return null;
  try {
    const plugin = await getEscposPlugin();
    if (typeof plugin.getLocalNetworkInfo !== 'function') return null;
    const raw = await withNativeCallTimeout(plugin.getLocalNetworkInfo(), 4_000, 'Lectura WiFi');
    const ip = String(raw?.ip || '').trim();
    const prefix = String(raw?.prefix || '').trim();
    if (prefix && /^\d{1,3}(\.\d{1,3}){2}$/.test(prefix)) {
      return { ip, prefix };
    }
    if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      const parts = ip.split('.');
      return { ip, prefix: parts.slice(0, 3).join('.') };
    }
    return null;
  } catch {
    return null;
  }
}
