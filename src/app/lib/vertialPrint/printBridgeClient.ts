import {
  resolveBridgeUrl,
  type VertialPrinterConfig,
} from './printerConfig';
import { resolveEffectivePrinterConfig } from './printerActiveScope';
import { isVertialNativeApp } from './isNativeApp';

/** Vertial Print (127.0.0.1 / PC del mostrador) no existe dentro del propio iPhone/Android. */
function bridgeAvailableOnDevice(): boolean {
  return !isVertialNativeApp();
}

export interface BridgeHealth {
  ok: boolean;
  version?: string;
}

export interface BridgePrinterInfo {
  name: string;
  isDefault?: boolean;
}

export interface BridgeNetworkPrinterInfo {
  host: string;
  port: number;
  label?: string;
}

export interface BridgePrintConnection {
  type: 'network' | 'system';
  host?: string;
  port?: number;
  name?: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function buildBridgeConnection(config: VertialPrinterConfig): BridgePrintConnection | null {
  if (config.connectionType === 'browser') return null;
  if (config.connectionType === 'network') {
    const host = String(config.networkHost || '').trim();
    if (!host) return null;
    return { type: 'network', host, port: Number(config.networkPort || 9100) || 9100 };
  }
  const name = String(config.systemPrinterName || '').trim();
  if (!name) return null;
  return { type: 'system', name };
}

function bridgeUrl(config?: VertialPrinterConfig): string {
  return resolveBridgeUrl(config ?? resolveEffectivePrinterConfig());
}

export async function fetchBridgeHealth(timeoutMs = 1200, config?: VertialPrinterConfig): Promise<BridgeHealth> {
  if (!bridgeAvailableOnDevice()) return { ok: false };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${bridgeUrl(config)}/v1/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false };
    const data = await res.json() as BridgeHealth;
    return { ok: Boolean(data.ok), version: data.version };
  } catch {
    return { ok: false };
  }
}

export async function fetchBridgePrinters(config?: VertialPrinterConfig): Promise<BridgePrinterInfo[]> {
  if (!bridgeAvailableOnDevice()) return [];
  try {
    const res = await fetch(`${bridgeUrl(config)}/v1/printers`);
    if (!res.ok) return [];
    const data = await res.json() as { printers?: BridgePrinterInfo[] };
    return Array.isArray(data.printers) ? data.printers : [];
  } catch {
    return [];
  }
}

/** Comprueba si la impresora responde en la red (vía Vertial Print en el PC). */
export async function fetchBridgePingPrinter(
  host: string,
  config?: VertialPrinterConfig,
  options?: { port?: number; timeoutMs?: number },
): Promise<{ ok: boolean; error?: string }> {
  if (!bridgeAvailableOnDevice()) {
    return { ok: false, error: 'Comprobación vía PC solo en navegador' };
  }
  const trimmedHost = String(host || '').trim();
  if (!trimmedHost) return { ok: false, error: 'Falta IP de la impresora' };
  const port = Number(options?.port || 9100) || 9100;
  const timeoutMs = Math.min(5000, Math.max(800, Number(options?.timeoutMs || 2000) || 2000));
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs + 400);
    const res = await fetch(
      `${bridgeUrl(config)}/v1/ping?host=${encodeURIComponent(trimmedHost)}&port=${port}&timeoutMs=${timeoutMs}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'La impresora no responde en esa IP' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo comprobar la impresora. ¿Vertial Print está abierto?' };
  }
}

/** Busca impresoras térmicas WiFi (puerto 9100) en la red local via Vertial Print. */
export async function fetchBridgeNetworkPrinters(
  config?: VertialPrinterConfig,
  options?: { port?: number; timeoutMs?: number },
): Promise<{ ok: boolean; printers: BridgeNetworkPrinterInfo[]; error?: string }> {
  if (!bridgeAvailableOnDevice()) {
    return { ok: false, printers: [], error: 'Búsqueda vía PC solo en navegador o tablet con Vertial Print' };
  }
  const port = Number(options?.port || 9100) || 9100;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(8000, Number(options?.timeoutMs || 25000)));
    const res = await fetch(`${bridgeUrl(config)}/v1/network-printers?port=${port}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({})) as {
      ok?: boolean;
      printers?: BridgeNetworkPrinterInfo[];
      error?: string;
    };
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        printers: [],
        error: data.error || 'No se pudo buscar impresoras en la red',
      };
    }
    return {
      ok: true,
      printers: Array.isArray(data.printers) ? data.printers : [],
    };
  } catch {
    return {
      ok: false,
      printers: [],
      error: 'Activa Vertial Print en el PC del mostrador (descarga VertialPrint.exe) y vuelve a buscar.',
    };
  }
}

export async function sendEscposToBridge(
  bytes: Uint8Array,
  config: VertialPrinterConfig,
  options?: { timeoutMs?: number },
): Promise<{ ok: boolean; error?: string }> {
  if (!bridgeAvailableOnDevice()) {
    return { ok: false, error: 'Impresión vía PC del mostrador no disponible en la app del móvil' };
  }
  const connection = buildBridgeConnection(config);
  if (!connection) {
    return { ok: false, error: 'Configura la impresora en el TPV (icono de impresora arriba)' };
  }

  const timeoutMs = Math.min(8000, Math.max(2500, Number(options?.timeoutMs || 5500) || 5500));
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${bridgeUrl(config)}/v1/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection,
        data: toBase64(bytes),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const payload = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!res.ok || !payload.ok) {
      return { ok: false, error: payload.error || 'No se pudo imprimir via Vertial Print' };
    }
    return { ok: true };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      error: aborted
        ? 'La impresora no respondió a tiempo. Comprueba que está encendida y en la misma red.'
        : 'No se detectó el servicio de impresión. Comprueba el PC del mostrador.',
    };
  }
}
