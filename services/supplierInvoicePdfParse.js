/**
 * Parser local de facturas PDF (texto embebido) — sin OpenAI.
 * Cubrir facturas españolas típicas: CIF, nº, fechas, bases, IVA, total.
 */

const CIF_NIF_RE =
  /\b([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])\b/gi;

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
    // Ambiguo: última coma como decimal si hay 2 dígitos tras ella
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
  // Label en una línea, importe en la misma zona (hasta 40 chars)
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
    /\bfactura\b[^A-Z0-9]{0,12}([A-Z]{0,4}\d{3,}[A-Z0-9\-\/]*)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const v = m[1].replace(/[^\w\/\-]/g, '');
      if (v.length >= 3 && !/^(20\d{2}|iva|eur)$/i.test(v)) return v;
    }
  }
  return null;
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
  // Primera fecha suelta tipo dd/mm/yyyy
  const any = t.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
  return any ? parseEsDate(any[1]) : null;
}

function extractIban(text) {
  const m = String(text || '').replace(/\s+/g, '').match(/\bES\d{22}\b/i);
  return m ? m[0].toUpperCase() : null;
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
  // Primera línea “empresa” razonable
  for (const l of lines.slice(0, 8)) {
    if (l.length < 3 || l.length > 80) continue;
    if (/factura|invoice|albaran|cif|nif|fecha|total|iva|eur|€/i.test(l)) continue;
    if (/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .,&\-']{2,}$/.test(l)) return l;
  }
  return null;
}

/**
 * Heurística de líneas: "desc ... qty ... price ... total"
 * Conservadora: solo si hay al menos qty + 2 importes.
 */
function extractLines(text) {
  const lines = [];
  const rawLines = String(text || '').split(/\n+/);
  for (const raw of rawLines) {
    const line = raw.trim();
    if (line.length < 8) continue;
    if (/total|base imponible|cuota|iva|subtotal|vencimiento|iban|cif|nif|factura/i.test(line)) continue;
    const money = [...line.matchAll(/([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2})/g)].map((m) => parseEsMoney(m[1]));
    const nums = money.filter((n) => n != null && n > 0);
    if (nums.length < 2) continue;
    const total = nums[nums.length - 1];
    const unitPrice = nums.length >= 2 ? nums[nums.length - 2] : total;
    let quantity = 1;
    const qtyM = line.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:ud|uds|unid|kg|g|l|ml|x)\b/i)
      || line.match(/^\s*(\d+(?:[.,]\d+)?)\s+/);
    if (qtyM) {
      const q = parseEsMoney(qtyM[1].replace('.', ',')) ?? Number(String(qtyM[1]).replace(',', '.'));
      if (Number.isFinite(q) && q > 0 && q < 100000) quantity = q;
    }
    let description = line
      .replace(/([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2})/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (description.length < 2) continue;
    lines.push({
      description: description.slice(0, 120),
      quantity,
      unitPrice,
      total,
    });
    if (lines.length >= 40) break;
  }
  return lines;
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

  // Si hay varios "total", preferir el mayor razonable
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
  if (subtotal == null && total != null && taxAmount != null) {
    // ok
  } else if (subtotal == null && total != null) {
    // leave subtotal null; buildPurchaseInvoiceDocument can derive
  }

  const lines = extractLines(raw);
  const documentNumber = extractInvoiceNumber(raw);
  const date = extractDateNear(raw, ['fecha factura', 'fecha', 'date']);
  const dueDate = extractDateNear(raw, ['fecha vencimiento', 'vencimiento', 'vto', 'due']);
  const emitter = guessEmitterName(raw, emitterCIF);
  const bankAccount = extractIban(raw);

  let confidenceScore = 35;
  if (documentNumber) confidenceScore += 15;
  if (emitterCIF) confidenceScore += 15;
  if (total != null && total > 0) confidenceScore += 25;
  if (date) confidenceScore += 5;
  if (lines.length > 0) confidenceScore += 10;
  if (subtotal != null) confidenceScore += 5;
  confidenceScore = Math.min(95, confidenceScore);

  return {
    documentType: 'factura_proveedor',
    emitter,
    emitterCIF,
    receiver: null,
    receiverCIF,
    date,
    dueDate,
    documentNumber,
    subtotal,
    taxRate,
    taxAmount: taxAmount ?? (subtotal != null ? Math.round(subtotal * (taxRate / 100) * 100) / 100 : null),
    total,
    currency: 'EUR',
    lines,
    paymentTerms: null,
    bankAccount,
    confidenceScore,
    notes: 'Parseado local PDF (sin OpenAI)',
    parseMethod: 'pdf_text_rules',
    parseError: !(total > 0 || documentNumber || emitterCIF),
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
  const maxPages = Math.min(pdf.numPages || 1, 6);
  const parts = [];
  for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const line = (content.items || [])
      .map((it) => (typeof it?.str === 'string' ? it.str : ''))
      .filter(Boolean)
      .join(' ');
    if (line.trim()) parts.push(line.trim());
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
  parsed.rawTextPreview = text.slice(0, 500);
  return parsed;
}
