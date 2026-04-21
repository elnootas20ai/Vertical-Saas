// ── Multi-currency support ─────────────────────────────────────────────────────
// Exchange rates are fetched from exchangerate-api.com (free tier) and cached
// locally for 1 hour to avoid hammering the free API.

export type CurrencyCode =
  | 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'CAD' | 'AUD'
  | 'MAD' | 'SAR' | 'AED' | 'QAR' | 'KWD' | 'CNY' | 'BRL'
  | 'MXN' | 'SEK' | 'NOK' | 'DKK' | 'PLN' | 'CZK' | 'RON';

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  symbol: string;
  flag: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { code: 'EUR', name: 'Euro',                    symbol: '€',  flag: '🇪🇺' },
  USD: { code: 'USD', name: 'Dólar estadounidense',    symbol: '$',  flag: '🇺🇸' },
  GBP: { code: 'GBP', name: 'Libra esterlina',         symbol: '£',  flag: '🇬🇧' },
  CHF: { code: 'CHF', name: 'Franco suizo',            symbol: '₣',  flag: '🇨🇭' },
  JPY: { code: 'JPY', name: 'Yen japonés',             symbol: '¥',  flag: '🇯🇵' },
  CAD: { code: 'CAD', name: 'Dólar canadiense',        symbol: 'C$', flag: '🇨🇦' },
  AUD: { code: 'AUD', name: 'Dólar australiano',       symbol: 'A$', flag: '🇦🇺' },
  MAD: { code: 'MAD', name: 'Dírham marroquí',         symbol: 'د.م.', flag: '🇲🇦' },
  SAR: { code: 'SAR', name: 'Riyal saudí',             symbol: '﷼',  flag: '🇸🇦' },
  AED: { code: 'AED', name: 'Dírham EAU',              symbol: 'د.إ', flag: '🇦🇪' },
  QAR: { code: 'QAR', name: 'Riyal catarí',            symbol: '﷼',  flag: '🇶🇦' },
  KWD: { code: 'KWD', name: 'Dinar kuwaití',           symbol: 'د.ك', flag: '🇰🇼' },
  CNY: { code: 'CNY', name: 'Yuan chino',              symbol: '¥',  flag: '🇨🇳' },
  BRL: { code: 'BRL', name: 'Real brasileño',          symbol: 'R$', flag: '🇧🇷' },
  MXN: { code: 'MXN', name: 'Peso mexicano',           symbol: 'MX$', flag: '🇲🇽' },
  SEK: { code: 'SEK', name: 'Corona sueca',            symbol: 'kr', flag: '🇸🇪' },
  NOK: { code: 'NOK', name: 'Corona noruega',          symbol: 'kr', flag: '🇳🇴' },
  DKK: { code: 'DKK', name: 'Corona danesa',           symbol: 'kr', flag: '🇩🇰' },
  PLN: { code: 'PLN', name: 'Esloti polaco',           symbol: 'zł', flag: '🇵🇱' },
  CZK: { code: 'CZK', name: 'Corona checa',           symbol: 'Kč', flag: '🇨🇿' },
  RON: { code: 'RON', name: 'Leu rumano',              symbol: 'lei', flag: '🇷🇴' },
};

interface RateCache {
  base: CurrencyCode;
  rates: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let _cache: RateCache | null = null;

// Fallback static rates (EUR base, approximate) used when API is unavailable
const FALLBACK_RATES: Record<string, number> = {
  EUR: 1, USD: 1.08, GBP: 0.86, CHF: 0.97, JPY: 160.5, CAD: 1.47, AUD: 1.65,
  MAD: 10.8, SAR: 4.05, AED: 3.97, QAR: 3.94, KWD: 0.33, CNY: 7.83, BRL: 5.56,
  MXN: 18.3, SEK: 11.4, NOK: 11.5, DKK: 7.46, PLN: 4.26, CZK: 25.2, RON: 4.97,
};

export async function fetchExchangeRates(base: CurrencyCode = 'EUR'): Promise<Record<string, number>> {
  const now = Date.now();
  if (_cache && _cache.base === base && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.rates;
  }

  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${base}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error('Rate fetch failed');
    const data = await res.json() as { rates: Record<string, number> };
    _cache = { base, rates: data.rates, fetchedAt: now };
    return data.rates;
  } catch {
    // Return fallback rates converted to requested base
    if (base === 'EUR') return FALLBACK_RATES;
    const baseRate = FALLBACK_RATES[base] ?? 1;
    const converted: Record<string, number> = {};
    for (const [code, rate] of Object.entries(FALLBACK_RATES)) {
      converted[code] = rate / baseRate;
    }
    return converted;
  }
}

export async function convertAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
): Promise<number> {
  if (from === to) return amount;
  const rates = await fetchExchangeRates(from);
  const rate = rates[to] ?? 1;
  return Math.round(amount * rate * 100) / 100;
}

export function formatCurrencyAmount(amount: number, currency: CurrencyCode): string {
  const info = CURRENCIES[currency];
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + (info ? ` (${info.flag})` : '');
}

export function formatCurrencySimple(amount: number, currency: CurrencyCode): string {
  const info = CURRENCIES[currency];
  const symbol = info?.symbol ?? currency;
  return `${amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
}

export function getCurrencyList(): CurrencyInfo[] {
  return Object.values(CURRENCIES).sort((a, b) => a.name.localeCompare(b.name));
}
