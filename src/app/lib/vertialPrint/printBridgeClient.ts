import {
  VERTIAL_PRINT_BRIDGE_URL,
  type VertialPrinterConfig,
} from './printerConfig';

export interface BridgeHealth {
  ok: boolean;
  version?: string;
}

export interface BridgePrinterInfo {
  name: string;
  isDefault?: boolean;
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

export async function fetchBridgeHealth(timeoutMs = 1200): Promise<BridgeHealth> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${VERTIAL_PRINT_BRIDGE_URL}/v1/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false };
    const data = await res.json() as BridgeHealth;
    return { ok: Boolean(data.ok), version: data.version };
  } catch {
    return { ok: false };
  }
}

export async function fetchBridgePrinters(): Promise<BridgePrinterInfo[]> {
  try {
    const res = await fetch(`${VERTIAL_PRINT_BRIDGE_URL}/v1/printers`);
    if (!res.ok) return [];
    const data = await res.json() as { printers?: BridgePrinterInfo[] };
    return Array.isArray(data.printers) ? data.printers : [];
  } catch {
    return [];
  }
}

export async function sendEscposToBridge(
  bytes: Uint8Array,
  config: VertialPrinterConfig,
): Promise<{ ok: boolean; error?: string }> {
  const connection = buildBridgeConnection(config);
  if (!connection) {
    return { ok: false, error: 'Configura la impresora en Ajustes → Tienda → Impresora TPV' };
  }

  try {
    const res = await fetch(`${VERTIAL_PRINT_BRIDGE_URL}/v1/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection,
        data: toBase64(bytes),
      }),
    });
    const payload = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!res.ok || !payload.ok) {
      return { ok: false, error: payload.error || 'No se pudo imprimir via Vertial Print' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Vertial Print no responde. Ejecuta: npm run print-bridge' };
  }
}
