import { isVertialNativeApp } from './isNativeApp';

export interface NativeLocalNetworkInfo {
  ip: string;
  prefix: string;
}

type EscposPlugin = {
  print(options: { message: string; ip: string; port: number }): Promise<{ status: string }>;
  ping(options: { ip: string; port?: number }): Promise<{ online: boolean; rtt?: number }>;
  discover(options?: { ports?: number[]; timeout?: number }): Promise<{
    printers: Array<{ ip: string; port: number; source: 'scan' | 'mdns' }>;
  }>;
  getLocalNetworkInfo?: () => Promise<{ ip?: string; prefix?: string }>;
};

let cachedPlugin: EscposPlugin | null = null;

export async function getEscposPlugin(): Promise<EscposPlugin> {
  if (cachedPlugin) return cachedPlugin;
  const mod = await import('esc-pos-proxy-capacitor-plugin');
  cachedPlugin = mod.ESCPOSProxy as EscposPlugin;
  return cachedPlugin;
}

/** IP y prefijo /24 de la WiFi del dispositivo (plugin nativo). */
export async function getNativeLocalNetworkInfo(): Promise<NativeLocalNetworkInfo | null> {
  if (!isVertialNativeApp()) return null;
  try {
    const plugin = await getEscposPlugin();
    if (typeof plugin.getLocalNetworkInfo !== 'function') return null;
    const raw = await plugin.getLocalNetworkInfo();
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
