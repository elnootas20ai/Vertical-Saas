/**
 * API de Polymarket - Mercados de predicción
 * Documentación: https://docs.polymarket.com
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug?: string;
  outcomePrices?: string;
  bestBid?: number;
  bestAsk?: number;
  volume?: number;
  liquidity?: number;
  enableOrderBook?: boolean;
  closed?: boolean;
  endDate?: string;
  volume24hr?: number;
  clobTokenIds?: string | string[];
  tokens?: number | string[];
}

export interface PolymarketEvent {
  id: string;
  slug?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  image?: string;
  icon?: string;
  startDate?: string;
  endDate?: string;
  creationDate?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  featured?: boolean;
  liquidity?: number;
  volume?: number;
  openInterest?: number;
  enableOrderBook?: boolean;
  volume24hr?: number;
  volume1wk?: number;
  volume1mo?: number;
  markets?: PolymarketMarket[];
  category?: string;
  subcategory?: string;
}

export interface PriceHistoryPoint {
  t: number;
  p: number;
}

export interface PriceHistoryResponse {
  history?: PriceHistoryPoint[];
}

// ─── API ────────────────────────────────────────────────────────────────────

export async function fetchPolymarketEvents(params?: {
  limit?: number;
  offset?: number;
  order?: string;
  ascending?: boolean;
  active?: boolean;
  closed?: boolean;
  end_date_min?: string;
  end_date_max?: string;
  volume_min?: number;
}): Promise<PolymarketEvent[]> {
  const search = new URLSearchParams();
  search.set('limit', String(params?.limit ?? 50));
  search.set('offset', String(params?.offset ?? 0));
  search.set('order', params?.order ?? 'endDate');
  search.set('ascending', String(params?.ascending ?? true));
  if (params?.active !== undefined) search.set('active', String(params.active));
  if (params?.closed !== undefined) search.set('closed', String(params.closed));
  if (params?.end_date_min) search.set('end_date_min', params.end_date_min);
  if (params?.end_date_max) search.set('end_date_max', params.end_date_max);
  if (params?.volume_min !== undefined) search.set('volume_min', String(params.volume_min));

  const res = await fetch(`${GAMMA_API}/events?${search}`);
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
  return res.json();
}

export async function fetchPolymarketEventById(id: string): Promise<PolymarketEvent | null> {
  const res = await fetch(`${GAMMA_API}/events?id=${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

export async function fetchPolymarketEventBySlug(slug: string): Promise<PolymarketEvent | null> {
  const res = await fetch(`${GAMMA_API}/events?slug=${slug}`);
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

export async function fetchPriceHistory(
  marketOrAssetId: string,
  params?: { interval?: string; startTs?: number; endTs?: number }
): Promise<PriceHistoryPoint[]> {
  const search = new URLSearchParams();
  search.set('market', marketOrAssetId);
  if (params?.interval) search.set('interval', params.interval);
  if (params?.startTs !== undefined) search.set('startTs', String(params.startTs));
  if (params?.endTs !== undefined) search.set('endTs', String(params.endTs));

  const res = await fetch(`${CLOB_API}/prices-history?${search}`);
  if (!res.ok) return [];
  const data = (await res.json()) as PriceHistoryResponse;
  return data.history ?? [];
}

/** Obtiene el asset ID (token) para Yes de un mercado */
export function getYesAssetId(market: PolymarketMarket): string | undefined {
  let ids = market.clobTokenIds;
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids) as string[];
    } catch {
      return undefined;
    }
  }
  if (!ids || !Array.isArray(ids) || ids.length < 2) return undefined;
  return ids[0];
}

/** Parsea precios "YES,NO" o "[\"0.65\", \"0.35\"]" a números */
export function parseOutcomePrices(outcomePrices?: string): { yes: number; no: number } {
  if (!outcomePrices) return { yes: 0.5, no: 0.5 };
  let parts: number[];
  if (outcomePrices.startsWith('[')) {
    try {
      const arr = JSON.parse(outcomePrices) as string[];
      parts = arr.map(s => parseFloat(s) || 0);
    } catch {
      return { yes: 0.5, no: 0.5 };
    }
  } else {
    parts = outcomePrices.split(',').map(s => parseFloat(s.trim()) || 0);
  }
  return {
    yes: parts[0] ?? 0.5,
    no: parts[1] ?? 0.5,
  };
}
