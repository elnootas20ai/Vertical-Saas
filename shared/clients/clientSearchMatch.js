/** Normaliza id de empresa (quita prefijo business:). */
export function normalizeClientBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

/**
 * Cliente visible para la empresa activa.
 * Sin business_id → legacy, visible en todas las empresas del titular.
 * Con una sola empresa activa en la cuenta → todos los clientes del titular.
 */
export function clientMatchesBusinessScope(doc, businessId, options = {}) {
  if (options.legacySingleBusiness) return true;
  const bid = normalizeClientBusinessScopeId(businessId);
  if (!bid) return true;
  const docBid = normalizeClientBusinessScopeId(doc?.businessId || doc?.business_id);
  if (!docBid) return true;
  return docBid === bid;
}

function foldSearchText(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function clientNameSearchHaystack(doc) {
  const parts = [];
  const push = (v) => {
    const s = String(v || '').trim();
    if (s) parts.push(s);
  };
  push(doc.name);
  push(doc.legalName);
  push(doc.nombre);
  push(doc.fullName);
  push(doc.displayName);
  if (Array.isArray(doc.contacts)) {
    for (const c of doc.contacts) {
      if (c && typeof c === 'object') {
        push(c.name);
        push(c.nombre);
      }
    }
  }
  return foldSearchText(parts.join(' '));
}

function clientEmailSearchHaystack(doc) {
  return foldSearchText(String(doc.email || '').trim());
}

function foldedNameQueryMatches(qFold, haystackFold) {
  if (!qFold || qFold.length < 2 || !haystackFold) return false;
  const tokens = qFold.split(/\s+/).filter((t) => t.length >= 2);
  const parts = tokens.length > 0 ? tokens : [qFold];
  const words = haystackFold.split(/[^a-z0-9]+/).filter(Boolean);

  return parts.every((token) =>
    words.some((w) => w === token || w.startsWith(token)),
  );
}

/** Últimos 9 dígitos (móvil ES) para buscar aunque el doc tenga +34. */
export function localPhoneDigits(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length >= 9) return d.slice(-9);
  return d;
}

export function clientPhoneDigitHaystacks(doc) {
  const list = [String(doc.phone || '').replace(/\D/g, '')];
  if (Array.isArray(doc.contacts)) {
    for (const c of doc.contacts) {
      if (c && typeof c === 'object') {
        list.push(String(c.phone || c.telefono || '').replace(/\D/g, ''));
      }
    }
  }
  return list.filter(Boolean);
}

/** Puntuación de coincidencia por teléfono (0 = sin match). */
export function scorePhoneDigitsMatch(hayDigits, qDigits) {
  if (!hayDigits || !qDigits || qDigits.length < 3) return 0;

  if (hayDigits === qDigits) return 200;
  if (hayDigits.endsWith(qDigits)) return 170;
  if (hayDigits.startsWith(qDigits)) return 150;
  if (qDigits.length >= 6 && hayDigits.includes(qDigits)) return 130;

  const hayLocal = localPhoneDigits(hayDigits);
  const qLocal = localPhoneDigits(qDigits);
  if (!hayLocal || !qLocal) return 0;

  if (hayLocal === qLocal) return 200;
  if (hayLocal.endsWith(qLocal)) return 170;
  if (hayLocal.startsWith(qLocal)) return 150;
  if (qLocal.length >= 3 && hayLocal.includes(qLocal)) return 140;

  return 0;
}

/** true = búsqueda por teléfono; false = prioriza nombre (letras). */
export function clientSearchPrefersPhone(raw, qDigits) {
  const letters = String(raw || '').replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, '');
  if (qDigits.length >= 3 && letters.length === 0) return true;
  if (letters.length >= 2 && qDigits.length < 3) return false;
  return qDigits.length > letters.length;
}

export function scoreClientSearchMatch(doc, raw, qFold, qDigits, _preferPhone) {
  let score = 0;
  const nameHay = clientNameSearchHaystack(doc);
  const words = nameHay.split(/[^a-z0-9]+/).filter(Boolean);

  if (qFold.length >= 2) {
    if (nameHay === qFold) score += 200;
    else if (words.some((w) => w === qFold)) score += 180;
    else if (words.some((w) => w.startsWith(qFold))) score += 160;
    else if (foldedNameQueryMatches(qFold, nameHay)) score += 120;
    else if (nameHay.includes(qFold)) score += 80;
  }

  if (qDigits.length >= 3) {
    let phoneScore = 0;
    for (const h of clientPhoneDigitHaystacks(doc)) {
      phoneScore = Math.max(phoneScore, scorePhoneDigitsMatch(h, qDigits));
    }
    score += phoneScore;
  }

  if (raw.includes('@')) {
    const emailHay = clientEmailSearchHaystack(doc);
    if (emailHay.includes(qFold)) score += 100;
  }

  return score;
}
