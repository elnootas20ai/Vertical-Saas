export type InformeBuildResult = {
  rows: Record<string, unknown>[];
  summary: string;
};

export type InformeLoadCtx = {
  userId: string;
  businessId?: string;
  businessName?: string;
  signal?: AbortSignal;
  onProgress?: (pct: number, label: string) => void;
};

export function euro(n: number) {
  return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function yearNow() {
  return new Date().getFullYear();
}

export function monthKeyNow() {
  return new Date().toISOString().slice(0, 7);
}

export function lastDaysRange(days: number) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export function emptyResult(summary: string): InformeBuildResult {
  return { rows: [], summary };
}
