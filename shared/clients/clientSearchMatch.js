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
  const bid = normalizeClientBusinessScopeId(businessId);
  if (!bid) return true;
  const docBid = normalizeClientBusinessScopeId(doc?.businessId || doc?.business_id);
  if (!docBid) {
    if (options.excludeUnscopedLegacy) return false;
    return true;
  }
  if (docBid === bid) return true;
  if (options.legacySingleBusiness) return true;
  return false;
}

/**
 * Texto de búsqueda sin acentos/diacríticos.
 * «jose» ↔ «José», «maria» ↔ «María», «nunez» ↔ «Núñez».
 */
export function foldSearchText(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFD')
    // Todas las marcas combinantes (no solo el bloque U+0300–036F).
    .replace(/\p{M}/gu, '')
    .replace(/[\u0300-\u036f]/g, '')
    // Acentos “sueltos” que a veces se pegan al teclear (´ ` ¨ ^ ~).
    .replace(/[\u00B4\u0060\u00A8\u02C6\u02DC\u02CA\u02CB\u02C9\u02D8\u02D9]/g, '')
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

/** Mín/máx dígitos al guardar teléfono (TPV/CRM). E.164 ≤ 15. */
export const MIN_CLIENT_PHONE_DIGITS = 7;
export const MAX_CLIENT_PHONE_DIGITS = 15;

/** Últimos 9 dígitos (móvil ES) para buscar aunque el doc tenga +34. */
export function localPhoneDigits(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length >= 9) return d.slice(-9);
  return d;
}

/** Solo dígitos, sin prefijo UI. Normaliza 34XXXXXXXXX → XXXXXXXXX (móvil ES). */
export function normalizeClientPhoneForSave(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return { phone: '', phonePrefix: '' };
  if (d.length > MAX_CLIENT_PHONE_DIGITS) d = d.slice(0, MAX_CLIENT_PHONE_DIGITS);
  // España con 34 pegado: 34612… → 612…
  if (d.length === 11 && d.startsWith('34') && /^[67]\d{8}$/.test(d.slice(2))) {
    return { phone: d.slice(2), phonePrefix: '' };
  }
  return { phone: d, phonePrefix: '' };
}

/** ¿Mismo cliente por teléfono? Exacto, sufijo, o últimos 9 (ES +34). */
export function clientPhonesMatch(a, b) {
  const da = String(a || '').replace(/\D/g, '');
  const db = String(b || '').replace(/\D/g, '');
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 9 && db.length >= 9 && localPhoneDigits(da) === localPhoneDigits(db)) {
    return true;
  }
  const minLen = Math.min(da.length, db.length);
  if (minLen >= MIN_CLIENT_PHONE_DIGITS && (da.endsWith(db) || db.endsWith(da))) {
    return true;
  }
  return false;
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

function addIndexHit(map, key, idx) {
  if (!key) return;
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(idx);
}

/**
 * Índice en memoria para no recorrer miles de clientes en cada tecla del TPV.
 * Prefijos de teléfono + prefijos de palabras del nombre.
 */
export function buildClientSearchIndex(docs) {
  const phonePrefix = new Map();
  const namePrefix = new Map();
  const list = Array.isArray(docs) ? docs : [];

  for (let i = 0; i < list.length; i += 1) {
    const doc = list[i];
    for (const digits of clientPhoneDigitHaystacks(doc)) {
      const variants = new Set([digits, localPhoneDigits(digits)].filter(Boolean));
      for (const d of variants) {
        const max = Math.min(d.length, 12);
        for (let len = 1; len <= max; len += 1) {
          addIndexHit(phonePrefix, d.slice(0, len), i);
        }
        for (let len = 3; len <= Math.min(d.length, 9); len += 1) {
          addIndexHit(phonePrefix, `e:${d.slice(-len)}`, i);
        }
      }
    }

    const nameHay = clientNameSearchHaystack(doc);
    const words = nameHay.split(/[^a-z0-9]+/).filter(Boolean);
    for (const w of words) {
      const max = Math.min(w.length, 6);
      for (let len = 1; len <= max; len += 1) {
        addIndexHit(namePrefix, w.slice(0, len), i);
      }
    }
  }

  return { phonePrefix, namePrefix, size: list.length };
}

/** Candidatos a puntuar. Sin índice → null (scan completo). Con índice vacío → sin matches. */
export function candidateIndicesForClientSearch(index, qFold, qDigits) {
  if (!index) return null;
  const hits = new Set();

  if (qDigits && qDigits.length >= 1) {
    const exact = index.phonePrefix.get(qDigits);
    if (exact) for (const i of exact) hits.add(i);
    const ends = index.phonePrefix.get(`e:${qDigits}`);
    if (ends) for (const i of ends) hits.add(i);
    const qLocal = localPhoneDigits(qDigits);
    if (qLocal && qLocal !== qDigits) {
      const el = index.phonePrefix.get(qLocal);
      if (el) for (const i of el) hits.add(i);
      const eel = index.phonePrefix.get(`e:${qLocal}`);
      if (eel) for (const i of eel) hits.add(i);
    }
  }

  if (qFold && qFold.length >= 1) {
    const tokens = qFold.split(/\s+/).filter((t) => t.length >= 1);
    const parts = tokens.length > 0 ? tokens : [qFold];
    for (const token of parts) {
      const key = token.slice(0, Math.min(6, token.length));
      const set = index.namePrefix.get(key);
      if (set) for (const i of set) hits.add(i);
    }
  }

  return hits;
}

/** Puntuación de coincidencia por teléfono (0 = sin match). */
export function scorePhoneDigitsMatch(hayDigits, qDigits) {
  if (!hayDigits || !qDigits || qDigits.length < 1) return 0;

  // Con 1-2 dígitos solo prefijo: al teclear un teléfono desde el principio,
  // endsWith/includes darían coincidencias aleatorias y ruidosas.
  const allowLoose = qDigits.length >= 3;

  if (hayDigits === qDigits) return 200;
  if (allowLoose && hayDigits.endsWith(qDigits)) return 170;
  if (hayDigits.startsWith(qDigits)) return 150;
  if (qDigits.length >= 6 && hayDigits.includes(qDigits)) return 130;

  const hayLocal = localPhoneDigits(hayDigits);
  const qLocal = localPhoneDigits(qDigits);
  if (!hayLocal || !qLocal) return 0;

  if (hayLocal === qLocal) return 200;
  if (allowLoose && hayLocal.endsWith(qLocal)) return 170;
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
  // Con 1 solo carácter: prefijo de nombre sí (primera letra), pero no
  // `includes` (una letra suelta dentro del nombre no significa nada).
  const qHasDigits = qDigits.length > 0;

  if (qFold.length >= 2) {
    if (nameHay === qFold) {
      // Nombre completo exacto (p. ej. «uriel», «campi»).
      score += 220;
    } else if (words.some((w) => w === qFold)) {
      // Palabra exacta («pau» en «pau», no «paula»).
      score += 200;
    } else {
      // Prefijo: «pau»→«paula» debe puntuar MENOS que un «pau» exacto.
      let bestPrefix = 0;
      for (const w of words) {
        if (!w.startsWith(qFold)) continue;
        const extra = w.length - qFold.length;
        // extra 0 ya cubierto arriba; extra 1 («anns»→«anna») ~170; «pau»→«paula» (2) ~140.
        const prefixScore = Math.max(70, 170 - extra * 18);
        if (prefixScore > bestPrefix) bestPrefix = prefixScore;
      }
      if (bestPrefix > 0) {
        score += bestPrefix;
      } else if (foldedNameQueryMatches(qFold, nameHay)) {
        score += 120;
      } else if (qFold.length >= 4 && nameHay.includes(qFold)) {
        // includes solo con 4+ letras (evita «pau» dentro de basura).
        score += 80;
      }
    }
  } else if (qFold.length === 1 && !qHasDigits) {
    if (words.some((w) => w.startsWith(qFold))) score += 160;
  }

  if (qDigits.length >= 1) {
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
