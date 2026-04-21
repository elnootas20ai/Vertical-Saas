const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost =
    typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

function authHeaders() {
  const token = localStorage.getItem('udar_access_token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export type DocType = 'invoice' | 'quote' | 'contract' | 'purchase' | 'sale';

export interface NumberingRule {
  prefix: string;
  year: boolean;
  separator: string;
  padding: number;
  counter: number;
}

export type NumberingConfig = Record<DocType, NumberingRule>;

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  invoice: 'Facturas',
  quote: 'Presupuestos',
  contract: 'Contratos',
  purchase: 'Compras',
  sale: 'Ventas',
};

export function previewDocNumber(rule: NumberingRule, counter?: number): string {
  const seq = counter ?? rule.counter + 1;
  const year = rule.year ? String(new Date().getFullYear()) : null;
  const padded = String(seq).padStart(Number(rule.padding) || 4, '0');
  const sep = rule.separator || '-';
  return [rule.prefix, year, padded].filter(Boolean).join(sep);
}

export async function getNumberingConfig(): Promise<{ ok: boolean; numbering: NumberingConfig; _rev?: string; error?: string }> {
  const res = await fetch(`${getApiBase()}/api/settings/numbering`, { headers: authHeaders() });
  return res.json() as Promise<{ ok: boolean; numbering: NumberingConfig; _rev?: string; error?: string }>;
}

export async function saveNumberingConfig(
  numbering: NumberingConfig,
  _rev?: string,
): Promise<{ ok: boolean; _rev?: string; error?: string }> {
  const res = await fetch(`${getApiBase()}/api/settings/numbering`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ numbering, _rev }),
  });
  return res.json() as Promise<{ ok: boolean; _rev?: string; error?: string }>;
}

export async function getNextDocNumber(docType: DocType): Promise<{ ok: boolean; number: string; counter: number; error?: string }> {
  const res = await fetch(`${getApiBase()}/api/settings/numbering/next/${docType}`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.json() as Promise<{ ok: boolean; number: string; counter: number; error?: string }>;
}
