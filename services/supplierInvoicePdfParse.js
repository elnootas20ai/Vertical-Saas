/**
 * Parser local de facturas PDF (texto embebido) — sin OpenAI.
 * Cubrir facturas españolas típicas: CIF, nº, fechas, bases, IVA, total y líneas.
 */

const CIF_NIF_RE =
  /\b([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/gi;

const MONEY_RE = /([0-9]{1,3}(?:[.\s][0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2}|[0-9]+\.[0-9]{2})/g;

const SKIP_LINE_RE =
  /^(total|base imponible|base imponibl|importe neto|neto|subtotal|cuota|iva\b|vencimiento|iban|cif|nif|factura|albar[aá]n|pedido|cliente|proveedor|pagina|página|concepto|descripci[oó]n|cantidad|precio|importe|fecha|vto|domicilio|direcci[oó]n|tel[eé]fono|email|www\.|http)/i;

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEsMoney(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[€\s]/g, '').replace(/EUR/gi, '');
  // 1.234,56 → 1234.56 | 1234.56 → 1234.56 | 1234,56 → 1234.56
  if (/\d+\.\d{3},\d{2}$/.test(s) || /^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\d+,\d{2}$/.test(s) && !s.includes('.')) {
    s = s.replace(',', '.');
  } else if (/\d+\.\d{2}$/.test(s) && !s.includes(',')) {
    // ok
  } else if (s.includes(',') && s.includes('.')) {
    if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseEsDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let d = Number(m[1]);
    let mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (d > 31 && mo <= 31) [d, mo] = [mo, d];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function moneyNearLabel(text, labels) {
  const t = fold(text);
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:.]?\\s*(?:EUR|€)?\\s*([0-9]{1,3}(?:[.\\s][0-9]{3})*(?:[.,][0-9]{2})|[0-9]+[.,][0-9]{2})`,
      'i',
    );
    const m = t.match(re);
    if (m) {
      const n = parseEsMoney(m[1]);
      if (n != null && n > 0) return n;
    }
  }
  for (const label of labels) {
    const re = new RegExp(`${label}[^0-9]{0,40}?([0-9]{1,3}(?:[.][0-9]{3})*(?:[,][0-9]{2})|[0-9]+[,][0-9]{2})`, 'i');
    const m = t.match(re);
    if (m) {
      const n = parseEsMoney(m[1]);
      if (n != null && n > 0) return n;
    }
  }
  return null;
}

function extractCifs(text) {
  const found = [];
  const seen = new Set();
  for (const m of String(text || '').matchAll(CIF_NIF_RE)) {
    const v = String(m[1] || m[0] || '').toUpperCase().replace(/\s/g, '');
    if (!v || seen.has(v)) continue;
    seen.add(v);
    found.push(v);
  }
  return found;
}

function extractInvoiceNumber(text) {
  const t = fold(text);
  const patterns = [
    /n[ºo]?\s*(?:de\s*)?factura\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]{2,30})/i,
    /factura\s*n[ºo]?\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]{2,30})/i,
    /n[ºo]?\s*(?:de\s*)?documento\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]{2,30})/i,
    /n[ºo]?\s*(?:de\s*)?albar[aá]n\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]{2,30})/i,
    /\bfactura\b[^A-Z0-9]{0,12}([A-Z]{0,4}\d{3,}[A-Z0-9\-\/]*)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const v = m[1].replace(/[^\w\/\-]/g, '');
      if (isPlausibleInvoiceNumber(v)) return v;
    }
  }
  return null;
}

function isPlausibleInvoiceNumber(value) {
  const v = String(value || '').trim();
  if (!v || v.length < 3) return false;
  if (/^(20\d{2}|iva|eur|factura|fac|tura|tutra|albaran|alb|total|neto)$/i.test(v)) return false;
  if (/^[a-z]+$/i.test(v) && !/\d/.test(v) && v.length < 8) return false;
  return true;
}

function extractDateNear(text, labels) {
  const t = fold(text);
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:.]?\\s*(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})`,
      'i',
    );
    const m = t.match(re);
    if (m) {
      const d = parseEsDate(m[1]);
      if (d) return d;
    }
  }
  const any = t.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
  return any ? parseEsDate(any[1]) : null;
}

function extractIban(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  const m = compact.match(/(?:IBAN)?(ES\d{22})/i);
  return m ? String(m[1]).toUpperCase() : null;
}

function extractPaymentTerms(text) {
  const t = fold(text);
  const m =
    t.match(/(?:forma de pago|condiciones de pago|pago)\s*[:.]?\s*([^\n]{5,80})/i)
    || t.match(/(\d+\s*d[ií]as(?:\s*fecha\s*factura)?)/i);
  if (!m?.[1]) return null;
  const v = String(m[1]).trim().replace(/\s+/g, ' ');
  if (/total|iva|base|iban/i.test(v)) return null;
  return v.slice(0, 80);
}

function guessEmitterName(text, emitterCif) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (emitterCif) {
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].toUpperCase().includes(emitterCif)) {
        for (let j = Math.max(0, i - 3); j < i; j += 1) {
          const cand = lines[j].replace(/cif|nif|vat/gi, '').trim();
          if (cand.length >= 3 && cand.length <= 80 && !/^\d/.test(cand) && !/total|factura|fecha/i.test(cand)) {
            return cand;
          }
        }
      }
    }
  }
  for (const l of lines.slice(0, 8)) {
    if (l.length < 3 || l.length > 80) continue;
    if (/factura|invoice|albaran|cif|nif|fecha|total|iva|eur|€/i.test(l)) continue;
    if (/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .,&\-']{2,}$/.test(l)) return l;
  }
  return null;
}

function normalizeLine(line) {
  const description = String(line.description || line.itemName || '').trim().slice(0, 160);
  const quantity = Number(line.quantity);
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  let unitPrice = Number(line.unitPrice);
  let total = Number(line.total);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) unitPrice = 0;
  if (!Number.isFinite(total) || total < 0) total = 0;
  if (total <= 0 && unitPrice > 0) total = Math.round(qty * unitPrice * 100) / 100;
  if (unitPrice <= 0 && total > 0 && qty > 0) unitPrice = Math.round((total / qty) * 100) / 100;
  return {
    description,
    itemName: description,
    quantity: qty,
    unitPrice: Math.round(unitPrice * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

function parseQtyFromText(line, moneyValues) {
  const qtyUnit =
    line.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:ud|uds|unid\.?|unidades|kg|g|l|ml|caja|cajas|pack|packs|x)\b/i);
  if (qtyUnit) {
    const q = parseEsMoney(qtyUnit[1].replace('.', ',')) ?? Number(String(qtyUnit[1]).replace(',', '.'));
    if (Number.isFinite(q) && q > 0 && q < 100000) return q;
  }
  const leading = line.match(/^\s*(\d+(?:[.,]\d+)?)\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]/);
  if (leading) {
    const q = Number(String(leading[1]).replace(',', '.'));
    if (Number.isFinite(q) && q > 0 && q < 10000 && !moneyValues.includes(q)) return q;
  }
  // "2 x 18,50" / "2x18,50"
  const mul = line.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[x×]\s*[0-9]/i);
  if (mul) {
    const q = Number(String(mul[1]).replace(',', '.'));
    if (Number.isFinite(q) && q > 0 && q < 100000) return q;
  }
  return 1;
}

function descriptionFromLine(line, moneyRawList) {
  let description = line;
  for (const raw of moneyRawList) {
    description = description.replace(raw, ' ');
  }
  description = description
    .replace(/(?:^|\s)\d+(?:[.,]\d+)?\s*(?:ud|uds|unid\.?|unidades|kg|g|l|ml|caja|cajas|pack|packs)\b/gi, ' ')
    .replace(/(?:^|\s)\d+(?:[.,]\d+)?\s*[x×]\s*/gi, ' ')
    .replace(/\b(eur|€)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return description;
}

function lineFromCandidate(line) {
  const trimmed = String(line || '').trim();
  if (trimmed.length < 4) return null;
  if (SKIP_LINE_RE.test(trimmed)) return null;

  const moneyMatches = [...trimmed.matchAll(MONEY_RE)];
  const moneyRawList = moneyMatches.map((m) => m[1]);
  const nums = moneyRawList.map((raw) => parseEsMoney(raw)).filter((n) => n != null && n > 0);
  if (nums.length < 1) return null;

  const quantity = parseQtyFromText(trimmed, nums);
  let total = nums[nums.length - 1];
  let unitPrice = nums.length >= 2 ? nums[nums.length - 2] : 0;

  // Si solo hay un importe y qty>1, ese importe suele ser el total de línea
  if (nums.length === 1) {
    total = nums[0];
    unitPrice = quantity > 0 ? Math.round((total / quantity) * 100) / 100 : total;
  }

  // Si qty * unit ≈ otro importe, usar ese como total
  if (nums.length >= 2 && quantity > 0) {
    const approx = Math.round(quantity * unitPrice * 100) / 100;
    const hit = nums.find((n) => Math.abs(n - approx) <= 0.05);
    if (hit != null) total = hit;
  }

  const description = descriptionFromLine(trimmed, moneyRawList);
  if (description.length < 2) return null;
  if (/^(base|total|iva|cuota|neto|subtotal)\b/i.test(description)) return null;

  return normalizeLine({ description, quantity, unitPrice, total });
}

/**
 * Heurística de líneas: tablas españolas típicas + texto aplastado en una sola línea.
 */
function extractLines(text) {
  const found = [];
  const seen = new Set();
  const push = (row) => {
    if (!row) return;
    const key = `${row.description}|${row.quantity}|${row.total}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(row);
  };

  const rawLines = String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const raw of rawLines) {
    push(lineFromCandidate(raw));
    if (found.length >= 60) break;
  }

  // Texto aplastado (PDF sin saltos): buscar patrones "desc qty precio total"
  if (found.length === 0) {
    const flat = fold(text);
    const re =
      /([A-Za-zÁÉÍÓÚÑáéíóúñ0-9][A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ./%&\-]{2,60}?)\s+(\d+(?:[.,]\d+)?)\s*(?:ud|uds|unid\.?|kg|g|l|ml|x)?\s+([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2}|[0-9]+\.[0-9]{2})\s+([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2}|[0-9]+\.[0-9]{2})/gi;
    for (const m of flat.matchAll(re)) {
      const description = String(m[1] || '').trim();
      if (!description || SKIP_LINE_RE.test(description)) continue;
      if (/base|total|iva|cuota|factura|fecha|vencimiento/i.test(description)) continue;
      const quantity = Number(String(m[2]).replace(',', '.')) || 1;
      const unitPrice = parseEsMoney(m[3]) || 0;
      const total = parseEsMoney(m[4]) || 0;
      push(normalizeLine({ description, quantity, unitPrice, total }));
      if (found.length >= 60) break;
    }
  }

  return found;
}

/** ¿Hay al menos una línea de artículo usable? */
export function ocrHasUsefulLines(ocrData) {
  const lines = Array.isArray(ocrData?.lines) ? ocrData.lines : [];
  return lines.some((l) => {
    const name = String(l?.description || l?.itemName || '').trim();
    const total = Number(l?.total || 0);
    const unit = Number(l?.unitPrice || 0);
    const qty = Number(l?.quantity || 0);
    return Boolean(name) && (total > 0 || unit > 0 || qty > 0);
  });
}

/**
 * Une cabecera local (suele ser fiable) con líneas de otro parse (p.ej. OpenAI).
 */
export function mergeSupplierInvoiceOcr(primary, secondary) {
  const a = primary && typeof primary === 'object' ? primary : {};
  const b = secondary && typeof secondary === 'object' ? secondary : {};
  const prefer = (x, y) => (x != null && x !== '' && !(typeof x === 'number' && !Number.isFinite(x)) ? x : y);
  const lines = ocrHasUsefulLines(a) ? a.lines : (ocrHasUsefulLines(b) ? b.lines : (a.lines || b.lines || []));
  const normalizedLines = (Array.isArray(lines) ? lines : []).map(normalizeLine).filter((l) => l.description);

  return {
    ...b,
    ...a,
    emitter: prefer(a.emitter, b.emitter),
    emitterCIF: prefer(a.emitterCIF, b.emitterCIF),
    receiver: prefer(a.receiver, b.receiver),
    receiverCIF: prefer(a.receiverCIF, b.receiverCIF),
    date: prefer(a.date, b.date),
    dueDate: prefer(a.dueDate, b.dueDate),
    documentNumber: prefer(a.documentNumber, b.documentNumber),
    subtotal: prefer(a.subtotal, b.subtotal),
    taxRate: prefer(a.taxRate, b.taxRate) ?? 21,
    taxAmount: prefer(a.taxAmount, b.taxAmount),
    total: prefer(a.total, b.total),
    currency: prefer(a.currency, b.currency) || 'EUR',
    paymentTerms: prefer(a.paymentTerms, b.paymentTerms),
    bankAccount: prefer(a.bankAccount, b.bankAccount),
    lines: normalizedLines,
    confidenceScore: Math.max(Number(a.confidenceScore || 0), Number(b.confidenceScore || 0)),
    notes: [a.notes, b.notes].filter(Boolean).join(' · ').slice(0, 240) || null,
    parseMethod: ocrHasUsefulLines(a)
      ? (a.parseMethod || 'pdf_text_rules')
      : ocrHasUsefulLines(b)
        ? `merged:${b.parseMethod || 'openai'}+local_header`
        : (a.parseMethod || b.parseMethod || 'pdf_text_rules'),
    parseError: !(Number(prefer(a.total, b.total)) > 0 || prefer(a.documentNumber, b.documentNumber) || prefer(a.emitterCIF, b.emitterCIF)),
  };
}

/**
 * Reconstruye saltos de línea reales desde items de pdf.js (por coordenada Y).
 * Sin esto, todo el texto de la página se aplasta en una sola línea y las líneas de artículo se pierden.
 */
export function reconstructTextFromPdfItems(items) {
  const rows = new Map();
  for (const it of items || []) {
    const str = typeof it?.str === 'string' ? it.str : '';
    if (!str.trim()) continue;
    const transform = Array.isArray(it.transform) ? it.transform : [];
    const x = Number(transform[4]);
    const y = Number(transform[5]);
    const yKey = Number.isFinite(y) ? Math.round(y) : 0;
    if (!rows.has(yKey)) rows.set(yKey, []);
    rows.get(yKey).push({
      x: Number.isFinite(x) ? x : 0,
      str,
      hasEol: Boolean(it.hasEOL),
    });
  }

  const yKeys = [...rows.keys()].sort((a, b) => b - a);
  const lines = [];
  for (const yKey of yKeys) {
    const parts = rows.get(yKey).sort((a, b) => a.x - b.x);
    let line = '';
    let prevRight = null;
    for (const p of parts) {
      const gap = prevRight == null ? 0 : p.x - prevRight;
      if (line && gap > 2) line += ' ';
      line += p.str;
      prevRight = p.x + (p.str.length * 2);
      if (p.hasEol) {
        lines.push(line.trim());
        line = '';
        prevRight = null;
      }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.filter(Boolean).join('\n');
}

/**
 * @param {string} text
 * @returns {object} mismo shape que el OCR OpenAI
 */
export function parseSpanishSupplierInvoiceText(text) {
  const raw = String(text || '');
  const cifs = extractCifs(raw);
  const emitterCIF = cifs[0] || null;
  const receiverCIF = cifs[1] || null;

  const subtotal =
    moneyNearLabel(raw, [
      'base imponible',
      'base imponibl',
      'importe neto',
      'neto',
      'subtotal',
      'base',
    ]) || null;
  const taxAmount =
    moneyNearLabel(raw, [
      'cuota iva',
      'cuota del iva',
      'importe iva',
      'iva 21',
      'iva 10',
      'iva 4',
      '\\biva\\b',
    ]) || null;
  let total =
    moneyNearLabel(raw, [
      'total factura',
      'total a pagar',
      'importe total',
      'total eur',
      'total €',
      '\\btotal\\b',
    ]) || null;

  if (total == null) {
    const all = [...fold(raw).matchAll(/\btotal\b[^0-9]{0,20}([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2})/gi)]
      .map((m) => parseEsMoney(m[1]))
      .filter((n) => n != null && n > 0);
    if (all.length) total = Math.max(...all);
  }

  let taxRate = 21;
  const rateM = fold(raw).match(/\biva\b[^%]{0,12}(\d{1,2})\s*%/i) || fold(raw).match(/(\d{1,2})\s*%\s*(?:iva|de iva)/i);
  if (rateM) {
    const r = Number(rateM[1]);
    if ([4, 5, 10, 21].includes(r)) taxRate = r;
  }

  if (total == null && subtotal != null) {
    total = Math.round(subtotal * (1 + taxRate / 100) * 100) / 100;
  }

  const lines = extractLines(raw);
  const documentNumber = extractInvoiceNumber(raw);
  const date = extractDateNear(raw, ['fecha factura', 'fecha', 'date']);
  const dueDate = extractDateNear(raw, ['fecha vencimiento', 'vencimiento', 'vto', 'due']);
  const emitter = guessEmitterName(raw, emitterCIF);
  const bankAccount = extractIban(raw);
  const paymentTerms = extractPaymentTerms(raw);

  let derivedSubtotal = subtotal;
  let derivedTax = taxAmount;
  if (derivedSubtotal == null && lines.length > 0) {
    const sum = lines.reduce((s, l) => s + Number(l.total || 0), 0);
    if (sum > 0) derivedSubtotal = Math.round(sum * 100) / 100;
  }
  if (derivedTax == null && derivedSubtotal != null) {
    derivedTax = Math.round(derivedSubtotal * (taxRate / 100) * 100) / 100;
  }
  if (total == null && derivedSubtotal != null && derivedTax != null) {
    total = Math.round((derivedSubtotal + derivedTax) * 100) / 100;
  }

  let confidenceScore = 35;
  if (documentNumber) confidenceScore += 15;
  if (emitterCIF) confidenceScore += 15;
  if (total != null && total > 0) confidenceScore += 20;
  if (date) confidenceScore += 5;
  if (lines.length > 0) confidenceScore += 15;
  if (lines.length >= 2) confidenceScore += 5;
  if (derivedSubtotal != null) confidenceScore += 5;
  confidenceScore = Math.min(95, confidenceScore);

  const hasHeader = Boolean((total != null && total > 0) || documentNumber || emitterCIF);
  const incompleteLines = hasHeader && lines.length === 0;

  return {
    documentType: 'factura_proveedor',
    emitter,
    emitterCIF,
    receiver: null,
    receiverCIF,
    date,
    dueDate,
    documentNumber,
    subtotal: derivedSubtotal,
    taxRate,
    taxAmount: derivedTax,
    total,
    currency: 'EUR',
    lines,
    paymentTerms,
    bankAccount,
    confidenceScore,
    notes: incompleteLines
      ? 'Parseado local PDF: cabecera OK, sin líneas de artículo'
      : 'Parseado local PDF (sin OpenAI)',
    parseMethod: 'pdf_text_rules',
    parseError: !hasHeader,
    incompleteLines,
  };
}

export async function extractPdfTextFromBuffer(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdfjs 5+ exige Uint8Array puro (Buffer de Node no vale)
  const bytes = Buffer.isBuffer(buffer)
    ? new Uint8Array(buffer)
    : buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer || []);
  const loadingTask = getDocument({ data: bytes, useSystemFonts: true, disableWorker: true });
  const pdf = await loadingTask.promise;
  const maxPages = Math.min(pdf.numPages || 1, 8);
  const parts = [];
  for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = reconstructTextFromPdfItems(content.items || []);
    if (pageText.trim()) parts.push(pageText.trim());
  }
  return parts.join('\n').trim();
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<object>}
 */
export async function parseSupplierInvoicePdfBuffer(buffer) {
  const text = await extractPdfTextFromBuffer(buffer);
  if (!text || text.length < 20) {
    const err = new Error(
      'El PDF no tiene texto extraíble (parece un escaneo/foto). Para esos hace falta OCR de imagen o OpenAI.',
    );
    err.code = 'PDF_NO_TEXT';
    throw err;
  }
  const parsed = parseSpanishSupplierInvoiceText(text);
  parsed.rawTextPreview = text.slice(0, 800);
  return parsed;
}
