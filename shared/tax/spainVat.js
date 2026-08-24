/**
 * IVA España — fuente compartida (backend + frontend).
 * Tipos válidos y cálculo desde líneas con precios con IVA incluido.
 *
 * Por defecto `enabled: false` → finanzas como hasta ahora (todo al 21%).
 * El IVA por producto vive en el catálogo (opcional); no se aplica solo.
 */

export const VALID_ES_VAT_RATES = [0, 4, 5, 10, 21];

/** Comportamiento histórico del cliente delivery (antes de IVA por producto). */
export const LEGACY_ES_FINANCE_TAX_RATE = 21;

export const DEFAULT_ES_TAX_POLICY = {
  countryCode: 'ES',
  /** Apagado = no cambia finanzas/TPV; el % opcional está en cada producto del catálogo. */
  enabled: false,
  pricesIncludeTax: true,
  defaultFoodTaxRate: 10,
  defaultStandardTaxRate: 21,
  defaultReducedTaxRate: 4,
};

const BEVERAGE_CATEGORY_RE =
  /\b(bebidas?|refrescos?|cervezas?|aguas?|zumos?|cafés?|cafes?|vinos?|alcohol(?:es)?|licores?|cocktails?|batidos?|sodas?|colas?|energéticas?|energeticas?)\b/i;

export function normalizeEsTaxRate(raw, policy = DEFAULT_ES_TAX_POLICY) {
  const n = Number(raw);
  if (Number.isFinite(n) && VALID_ES_VAT_RATES.includes(n)) return n;
  return Number(policy.defaultFoodTaxRate) || 10;
}

export function normalizeEsTaxPolicy(raw) {
  const base = { ...DEFAULT_ES_TAX_POLICY };
  if (!raw || typeof raw !== 'object') return base;
  const pick = (key, fallback) => {
    const n = Number(raw[key]);
    return Number.isFinite(n) && VALID_ES_VAT_RATES.includes(n) ? n : fallback;
  };
  return {
    countryCode: String(raw.countryCode || 'ES').trim().toUpperCase() || 'ES',
    /** Solo se activa con enabled === true (opt-in). */
    enabled: raw.enabled === true,
    pricesIncludeTax: raw.pricesIncludeTax !== false,
    defaultFoodTaxRate: pick('defaultFoodTaxRate', base.defaultFoodTaxRate),
    defaultStandardTaxRate: pick('defaultStandardTaxRate', base.defaultStandardTaxRate),
    defaultReducedTaxRate: pick('defaultReducedTaxRate', base.defaultReducedTaxRate),
  };
}

function isTaxPolicyEnabled(policy) {
  return normalizeEsTaxPolicy(policy).enabled === true;
}

/** Categoría carta → tipo IVA por defecto (si el producto no trae taxRate). */
export function inferTaxRateFromCategory(category, policy = DEFAULT_ES_TAX_POLICY) {
  const p = normalizeEsTaxPolicy(policy);
  const cat = String(category || '').trim();
  if (BEVERAGE_CATEGORY_RE.test(cat)) return p.defaultStandardTaxRate;
  return p.defaultFoodTaxRate;
}

/**
 * IVA de un artículo de catálogo: explícito en producto o inferido por categoría.
 * Sin política activa no inventa tipos: solo el taxRate del producto si es válido.
 */
export function resolveCatalogItemTaxRate(item, policy = DEFAULT_ES_TAX_POLICY) {
  const p = normalizeEsTaxPolicy(policy);
  const explicit = Number(item?.taxRate);
  if (Number.isFinite(explicit) && explicit >= 0 && VALID_ES_VAT_RATES.includes(explicit)) {
    return explicit;
  }
  if (!p.enabled) return LEGACY_ES_FINANCE_TAX_RATE;
  return inferTaxRateFromCategory(item?.category, p);
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function lineGross(line) {
  const total = Number(line?.total);
  if (Number.isFinite(total) && total > 0) return total;
  const qty = Number(line?.quantity) || 0;
  const unit = Number(line?.unitPrice ?? line?.price) || 0;
  return qty > 0 && unit > 0 ? qty * unit : 0;
}

function resolveLineTaxRate(line, policy) {
  const p = normalizeEsTaxPolicy(policy);
  const explicit = Number(line?.taxRate ?? line?.vatRate ?? line?.iva);
  if (Number.isFinite(explicit) && explicit >= 0 && VALID_ES_VAT_RATES.includes(explicit)) {
    return explicit;
  }
  if (!p.enabled) return LEGACY_ES_FINANCE_TAX_RATE;
  return inferTaxRateFromCategory(line?.category, p);
}

function legacyFinanceTaxAmounts(grossIn) {
  const gross = round2(Math.max(0, Number(grossIn) || 0));
  const rate = LEGACY_ES_FINANCE_TAX_RATE;
  const base = round2(gross / (1 + rate / 100));
  return {
    amountBase: base,
    taxAmount: round2(gross - base),
    totalAmount: gross,
    taxRate: rate,
    byRate: {},
  };
}

/**
 * Desglose fiscal desde líneas de pedido (precios con IVA incluido por defecto).
 */
export function calcLinesTaxBreakdown(lines = [], policy = DEFAULT_ES_TAX_POLICY) {
  const p = normalizeEsTaxPolicy(policy);
  let base = 0;
  let gross = 0;
  const byRate = new Map();

  for (const line of lines) {
    const g = lineGross(line);
    if (!(g > 0)) continue;
    const rate = resolveLineTaxRate(line, p);
    let lineBase = g;
    let lineTax = 0;
    if (p.pricesIncludeTax) {
      lineBase = g / (1 + rate / 100);
      lineTax = g - lineBase;
    } else {
      lineTax = g * (rate / 100);
      lineBase = g;
    }
    gross += p.pricesIncludeTax ? g : g + lineTax;
    base += lineBase;
    const bucket = byRate.get(rate) || { base: 0, tax: 0, gross: 0 };
    bucket.base += lineBase;
    bucket.tax += lineTax;
    bucket.gross += p.pricesIncludeTax ? g : g + lineTax;
    byRate.set(rate, bucket);
  }

  base = round2(base);
  gross = round2(gross);
  const tax = round2(Math.max(0, gross - base));
  const effectiveTaxRate = base > 0.009
    ? round2((tax / base) * 100)
    : (p.enabled ? p.defaultFoodTaxRate : LEGACY_ES_FINANCE_TAX_RATE);

  const byRateOut = {};
  for (const [rate, bucket] of byRate.entries()) {
    byRateOut[rate] = {
      base: round2(bucket.base),
      tax: round2(bucket.tax),
      gross: round2(bucket.gross),
    };
  }

  return { base, tax, gross, effectiveTaxRate, byRate: byRateOut };
}

/** Totales para un movimiento financiero único. Apagado → todo al 21% (legacy). */
export function calcOrderFinanceTaxAmounts(order, policy = DEFAULT_ES_TAX_POLICY) {
  const p = normalizeEsTaxPolicy(policy);
  const grossFallback = Math.max(
    0,
    Number(order?.paidAmount || order?.totalAmount || 0) - Number(order?.refundAmount || 0),
  );

  if (!isTaxPolicyEnabled(p)) {
    return legacyFinanceTaxAmounts(grossFallback);
  }

  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length > 0) {
    const breakdown = calcLinesTaxBreakdown(items, p);
    return {
      amountBase: breakdown.base,
      taxAmount: breakdown.tax,
      totalAmount: breakdown.gross,
      taxRate: breakdown.effectiveTaxRate,
      byRate: breakdown.byRate,
    };
  }

  const gross = round2(grossFallback);
  const fallbackRate = p.defaultFoodTaxRate;
  const base = p.pricesIncludeTax ? round2(gross / (1 + fallbackRate / 100)) : gross;
  const tax = round2(gross - base);
  return {
    amountBase: base,
    taxAmount: tax,
    totalAmount: gross,
    taxRate: fallbackRate,
    byRate: {},
  };
}

export function calcRefundFinanceTaxAmounts(order, refundGross, policy = DEFAULT_ES_TAX_POLICY) {
  const gross = round2(Math.max(0, Number(refundGross) || 0));
  if (!(gross > 0.009)) {
    return { amountBase: 0, taxAmount: 0, totalAmount: 0, taxRate: 0, byRate: {} };
  }

  const p = normalizeEsTaxPolicy(policy);
  if (!isTaxPolicyEnabled(p)) {
    return legacyFinanceTaxAmounts(gross);
  }

  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length > 0) {
    const orderGross = calcLinesTaxBreakdown(items, p).gross;
    if (orderGross > 0.009 && gross < orderGross - 0.01) {
      const ratio = gross / orderGross;
      const full = calcLinesTaxBreakdown(
        items.map((line) => ({
          ...line,
          total: round2(lineGross(line) * ratio),
        })),
        p,
      );
      return {
        amountBase: full.base,
        taxAmount: full.tax,
        totalAmount: full.gross,
        taxRate: full.effectiveTaxRate,
        byRate: full.byRate,
      };
    }
    const full = calcLinesTaxBreakdown(items, p);
    return {
      amountBase: full.base,
      taxAmount: full.tax,
      totalAmount: gross,
      taxRate: full.effectiveTaxRate,
      byRate: full.byRate,
    };
  }
  const base = p.pricesIncludeTax ? round2(gross / (1 + p.defaultFoodTaxRate / 100)) : gross;
  return {
    amountBase: base,
    taxAmount: round2(gross - base),
    totalAmount: gross,
    taxRate: p.defaultFoodTaxRate,
    byRate: {},
  };
}

/** Opciones Verifactu / ticket desde política de empresa (solo si enabled). */
export function saleLineOptsFromTaxPolicy(policy) {
  const p = normalizeEsTaxPolicy(policy);
  if (!p.enabled) return null;
  return {
    pricesIncludeTax: p.pricesIncludeTax,
    defaultTaxRate: p.defaultFoodTaxRate,
  };
}
