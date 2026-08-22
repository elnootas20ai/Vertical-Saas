/**
 * QR de mesa — URL opaca + imagen (mismo patrón que invitación / vehículos).
 */
import type { DiningTable } from './salaApi';
import { authFetch } from './authApi';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

export type PublicMesaPayload = {
  token: string;
  tableId: string;
  tableNumber: number;
  tableName: string;
  zone: string;
  businessId: string;
  webSlug: string;
  webEnabled: boolean;
  storeName: string;
};

export function buildMesaPublicPath(token: string): string {
  const t = String(token || '').trim();
  return t ? `/m/${encodeURIComponent(t)}` : '';
}

export function buildMesaPublicUrl(token: string, origin?: string): string {
  const path = buildMesaPublicPath(token);
  if (!path) return '';
  const base =
    String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export function buildMesaQrImageUrl(publicUrl: string, size = 240): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(publicUrl)}&margin=8&color=111111&bgcolor=FFFFFF`;
}

export async function getPublicMesaByTokenRequest(token: string): Promise<PublicMesaPayload> {
  const response = await fetch(`${API_BASE}/api/web/mesa/${encodeURIComponent(token)}`);
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    mesa?: PublicMesaPayload;
    error?: string;
  };
  if (!response.ok || !payload.mesa) {
    throw new Error(payload.error || 'QR no válido');
  }
  return payload.mesa;
}

export async function ensureMesaQrTokensRequest(
  userId: string,
  businessId: string,
): Promise<{ tables: DiningTable[]; created: number }> {
  const response = await authFetch(`${API_BASE}/api/sala/tables/${encodeURIComponent(userId)}/ensure-qr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessId }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    tables?: DiningTable[];
    created?: number;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || 'No se pudieron generar los QR');
  }
  return {
    tables: payload.tables || [],
    created: Number(payload.created || 0),
  };
}

export async function regenerateMesaQrTokenRequest(
  userId: string,
  tableId: string,
): Promise<DiningTable> {
  const response = await authFetch(
    `${API_BASE}/api/sala/tables/${encodeURIComponent(userId)}/${encodeURIComponent(tableId)}/regenerate-qr`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    table?: DiningTable;
    error?: string;
  };
  if (!response.ok || !payload.table) {
    throw new Error(payload.error || 'No se pudo regenerar el QR');
  }
  return payload.table;
}

export function printMesaQrSheet(opts: {
  tableName: string;
  storeLabel?: string;
  publicUrl: string;
}): void {
  const qrSrc = buildMesaQrImageUrl(opts.publicUrl, 280);
  const store = String(opts.storeLabel || '').trim();
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html><html><head><title>QR — ${opts.tableName}</title>
    <style>
      body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fff; }
      .card { border: 2px solid #e5e7eb; border-radius: 16px; padding: 32px 40px; text-align: center; max-width: 360px; }
      h2 { margin: 16px 0 4px; font-size: 22px; color: #111; }
      p  { margin: 0 0 12px; color: #6b7280; font-size: 14px; }
      img { width: 240px; height: 240px; }
      small { display: block; margin-top: 12px; color: #9ca3af; font-size: 10px; word-break: break-all; }
    </style></head><body>
    <div class="card">
      <img src="${qrSrc}" alt="QR" />
      <h2>${opts.tableName}</h2>
      ${store ? `<p>${store}</p>` : '<p>Escanea para pedir en esta mesa</p>'}
      <small>${opts.publicUrl}</small>
    </div>
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>
  `);
  win.document.close();
}

const MESA_LOCK_KEY = 'vertial.mesaQr.lock';

export function writeMesaQrLock(mesa: PublicMesaPayload): void {
  try {
    sessionStorage.setItem(MESA_LOCK_KEY, JSON.stringify({
      token: mesa.token,
      tableId: mesa.tableId,
      tableNumber: mesa.tableNumber,
      tableName: mesa.tableName,
      businessId: mesa.businessId,
      at: Date.now(),
    }));
  } catch {
    /* ignore */
  }
}

export function readMesaQrLock(): {
  token: string;
  tableId: string;
  tableNumber: number;
  tableName: string;
  businessId: string;
} | null {
  try {
    const raw = sessionStorage.getItem(MESA_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token = String(parsed.token || '').trim();
    const tableId = String(parsed.tableId || '').trim();
    if (!token || !tableId) return null;
    return {
      token,
      tableId,
      tableNumber: Number(parsed.tableNumber) || 0,
      tableName: String(parsed.tableName || '').trim() || `Mesa ${parsed.tableNumber || ''}`,
      businessId: String(parsed.businessId || '').trim(),
    };
  } catch {
    return null;
  }
}

export function clearMesaQrLock(): void {
  try {
    sessionStorage.removeItem(MESA_LOCK_KEY);
  } catch {
    /* ignore */
  }
}
