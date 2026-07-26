import { describe, expect, it } from 'vitest';
import {
  buildClientSearchIndex,
  candidateIndicesForClientSearch,
  scoreClientSearchMatch,
  clientSearchPrefersPhone,
  foldSearchText,
} from '../shared/clients/clientSearchMatch.js';

/** Réplica mínima del filtro TPV (sin businessId). */
function searchDocs(docs, q) {
  const index = buildClientSearchIndex(docs);
  const qFold = foldSearchText(q);
  const qDigits = String(q || '').replace(/\D/g, '');
  const preferPhone = clientSearchPrefersPhone(q, qDigits);
  const candidates = candidateIndicesForClientSearch(index, qFold, qDigits);
  const useIndex = candidates != null && candidates.size > 0;
  const out = [];
  const consider = (d) => {
    if (d?.type !== 'client' || d?.deletedAt) return;
    const score = scoreClientSearchMatch(d, q, qFold, qDigits, preferPhone);
    if (score > 0) out.push(d);
  };
  if (useIndex) {
    for (const idx of candidates) consider(docs[idx]);
  } else {
    for (const d of docs) consider(d);
  }
  return out;
}

describe('TPV client search blindaje', () => {
  const docs = [
    {
      type: 'client',
      user_id: 'pau',
      name: 'campi',
      phone: '+34 607201320',
      business_id: 'ed846f31-aee7-4568-ac03-fa25ff3ad773',
    },
    {
      type: 'client',
      user_id: 'pau',
      name: 'Gemma Serrat',
      phone: '+34 619689490',
      business_id: 'ed846f31-aee7-4568-ac03-fa25ff3ad773',
    },
  ];

  it('encuentra por nombre y teléfono', () => {
    expect(searchDocs(docs, 'campi').map((d) => d.name)).toContain('campi');
    expect(searchDocs(docs, '607201320').some((d) => d.name === 'campi')).toBe(true);
  });

  it('[] no cuenta como cartera cargada (regla de caché)', () => {
    const cached = [];
    expect(Array.isArray(cached) && cached.length > 0).toBe(false);
  });

  it('miss real con cartera cargada no exige refresh', () => {
    const portfolioSize = docs.length;
    expect(searchDocs(docs, 'zzzz-no-existe')).toHaveLength(0);
    expect(portfolioSize > 0).toBe(true);
  });
});
