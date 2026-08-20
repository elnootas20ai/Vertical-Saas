/**
 * Empareja líneas OCR de facturas/albaranes con artículos de inventario (stock).
 */

import { scoreSupplierAliasMatch } from '../shared/purchases/supplierProductAlias.js';

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardScore(a, b) {
  const words1 = new Set(normalizeText(a).split(/\s+/).filter(Boolean));
  const words2 = new Set(normalizeText(b).split(/\s+/).filter(Boolean));
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = [...words1].filter((w) => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  return union > 0 ? intersection / union : 0;
}

function containsScore(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  return 0;
}

/** Puntuación línea OCR ↔ artículo de catálogo. */
export function scoreLineToCatalogItem(lineText, catalogItem, options = {}) {
  const name = catalogItem?.name || '';
  const sku = String(catalogItem?.sku || '').toLowerCase().trim();
  const lineLower = String(lineText || '').toLowerCase().trim();
  const lineSku = String(options.lineSku || '').trim();
  const supplierId = String(options.supplierId || '').trim();

  const aliasHit = scoreSupplierAliasMatch(lineText, lineSku, catalogItem, supplierId);
  if (aliasHit) return aliasHit;

  if (sku && sku.length >= 3 && lineLower.includes(sku)) {
    return { score: 0.98, method: 'sku' };
  }

  const jaccard = jaccardScore(lineText, name);
  const incl = containsScore(lineText, name);
  const score = Math.max(jaccard, incl);

  let method = 'none';
  if (score >= 0.35) {
    method = jaccard >= incl ? 'name_jaccard' : 'name_contains';
  }

  return { score, method };
}

/** Mejor artículo de inventario para una línea OCR. */
export function matchOcrLineToCatalog(line, catalogItems, options = {}) {
  const supplierId = String(options.supplierId || '').trim();
  const lineText = line?.description || line?.name || line?.itemName || '';
  const lineSku = String(line?.sku || '').trim();
  const minScore = options.minScore ?? 0.35;

  let best = null;
  let bestScore = 0;
  let bestMethod = 'none';

  for (const item of catalogItems || []) {
    const { score, method } = scoreLineToCatalogItem(lineText, item, {
      supplierId,
      lineSku,
    });
    let adjusted = score;
    if (supplierId && item.supplierId === supplierId) adjusted += 0.05;
    if (adjusted > bestScore) {
      bestScore = adjusted;
      best = item;
      bestMethod = method;
    }
  }

  if (!best || bestScore < minScore) return null;

  return {
    catalogItemId: best._id || best.id,
    catalogItemName: best.name || '',
    sku: best.sku || '',
    matchConfidence: Math.round(Math.min(bestScore, 1) * 100) / 100,
    matchMethod: bestMethod,
  };
}

/** Enriquece líneas OCR con catalogItemId cuando hay match. */
export function enrichOcrLinesWithCatalog(rawLines, catalogItems, options = {}) {
  const usedIds = new Set();

  return (rawLines || []).map((line, idx) => {
    const description = String(line?.description || line?.name || line?.itemName || '').trim();
    const quantity = Number(line?.quantity || line?.qty || 0);
    const unitPrice = Number(line?.unitPrice || line?.price || line?.unitCost || 0);
    const computedTotal = quantity * unitPrice;
    const total = Number(line?.total || 0) || computedTotal;

    const pool = (catalogItems || []).filter((item) => !usedIds.has(item._id || item.id));
    const match = matchOcrLineToCatalog(line, pool.length > 0 ? pool : catalogItems, options);

    const enriched = {
      id: line?.id || `pinvl-${idx}-${Date.now().toString(36)}`,
      description,
      itemName: description,
      quantity,
      unitPrice,
      total: Math.round(total * 100) / 100,
      sku: line?.sku || match?.sku || '',
      matchConfidence: match?.matchConfidence ?? 0,
      matchMethod: match?.matchMethod || 'none',
      ...(match
        ? {
            catalogItemId: match.catalogItemId,
            catalogItemName: match.catalogItemName,
          }
        : {
            catalogItemId: '',
            catalogItemName: '',
          }),
    };

    if (match?.catalogItemId) usedIds.add(match.catalogItemId);
    return enriched;
  });
}

export function summarizeCatalogMatches(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const matched = rows.filter((l) => l.catalogItemId).length;
  return {
    totalLines: rows.length,
    matchedLines: matched,
    unmatchedLines: rows.length - matched,
  };
}
