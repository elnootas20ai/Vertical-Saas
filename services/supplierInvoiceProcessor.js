import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';
import { connectAndFetchNewEmails, isImapConfigured } from './imapService.js';
import {
  getCatalogDbName,
  buildPurchaseInvoiceDocument,
  buildSupplierDocument,
  sanitizePurchaseInvoice,
  listSuppliersByUser,
  findDuplicatePurchaseInvoice,
  listPurchaseInvoicesByUser,
  assignPurchaseInvoiceNumber,
  buildNotificationDocument,
  saveNotification,
  sanitizeNotification,
  NOTIFICATIONS_DB,
  ensureDatabase,
  putDocument,
  couchRequest,
  getDocument,
  findAccountByUserId,
  listPointsOfSaleByUser,
  getDeliveryDbName,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';
import { enrichOcrLinesForUser, reconcilePurchaseInvoiceFromOcr } from './ocrPurchasePipeline.js';
import {
  mergeSupplierInvoiceOcr,
  ocrHasUsefulLines,
  parseSupplierInvoicePdfBuffer,
  reconstructTextFromPdfItems,
} from './supplierInvoicePdfParse.js';
import { hasImapPasswordStored, revealImapPassword } from './secretAtRest.js';

const fakeReq = { headers: {} };

function imapConfigReady(c) {
  if (!c?.enabled) return false;
  const host = String(c.imapHost || '').trim();
  const user = String(c.imapUser || '').trim();
  return Boolean(host && user && hasImapPasswordStored(c.imapPassword));
}

function overridesFromImapConfig(c, meta = {}) {
  if (!imapConfigReady(c)) return null;
  return {
    host: String(c.imapHost || '').trim(),
    port: Number(c.imapPort || 993),
    user: String(c.imapUser || '').trim(),
    pass: revealImapPassword(c.imapPassword),
    tls: c.imapTls !== false,
    sinceUid: Number(c.imapCursorUid || 0) || 0,
    sinceDate: c.imapSyncFrom || null,
    ...meta,
  };
}

/** Credenciales IMAP de la cuenta (legado, sin PDV). */
async function buildImapOverridesForUser(userId) {
  if (!userId) return {};
  try {
    const account = await findAccountByUserId(fakeReq, userId);
    const c = account?.supplierInvoiceConfig;
    if (!imapConfigReady(c)) {
      if (c?.enabled) {
        logger.warn(
          { tag: 'SINV_PROC', userId },
          'Facturas por email activadas en cuenta pero IMAP incompleto — se usarán variables SUPPLIER_INVOICE_IMAP_* si existen',
        );
      }
      return {};
    }
    return overridesFromImapConfig(c, {
      _accountId: account._id,
      _userId: userId,
      _scope: 'account',
    }) || {};
  } catch (err) {
    logger.warn({ tag: 'SINV_PROC', userId, err: err.message }, 'No se pudo leer cuenta para IMAP');
    return {};
  }
}

async function buildImapOverridesForPdv(userId, pdvId) {
  if (!userId || !pdvId) return {};
  try {
    const db = getDeliveryDbName();
    await ensureDatabase(fakeReq, db);
    const pdv = await getDocument(fakeReq, db, pdvId);
    if (!pdv || pdv.type !== 'point_of_sale' || pdv.deletedAt) return {};
    const { pdvDocMatchesUser } = await import('./couchdb.js');
    if (!pdvDocMatchesUser(pdv, userId)) return {};
    const c = pdv.supplierInvoiceConfig;
    return (
      overridesFromImapConfig(c, {
        _pdvId: pdv._id,
        _userId: userId,
        _scope: 'pdv',
        _workCenterId: String(pdv.workCenterId || '').trim(),
        _businessId: String(pdv.businessId || pdv.business_id || '').trim(),
        _pdvName: String(pdv.name || '').trim(),
      }) || {}
    );
  } catch (err) {
    logger.warn({ tag: 'SINV_PROC', userId, pdvId, err: err.message }, 'No se pudo leer PDV para IMAP');
    return {};
  }
}

/** Todos los buzones a sondear: PDVs con IMAP + legado de cuenta si no hay PDV con el mismo usuario IMAP. */
export async function listSupplierInvoiceImapTargets(userId) {
  const targets = [];
  const seenUsers = new Set();
  try {
    const pdvs = await listPointsOfSaleByUser(fakeReq, userId);
    for (const pdv of pdvs) {
      if (!pdv || pdv.active === false || pdv.deletedAt) continue;
      const c = pdv.supplierInvoiceConfig;
      if (!imapConfigReady(c)) continue;
      const ov = overridesFromImapConfig(c, {
        _pdvId: pdv._id,
        _userId: userId,
        _scope: 'pdv',
        _workCenterId: String(pdv.workCenterId || '').trim(),
        _businessId: String(pdv.businessId || pdv.business_id || '').trim(),
        _pdvName: String(pdv.name || '').trim(),
      });
      if (!ov) continue;
      seenUsers.add(String(ov.user || '').toLowerCase());
      targets.push(ov);
    }
  } catch (err) {
    logger.warn({ tag: 'SINV_PROC', userId, err: err.message }, 'No se pudieron listar PDVs IMAP');
  }

  const accountOv = await buildImapOverridesForUser(userId);
  if (accountOv?.host && accountOv?.user) {
    const key = String(accountOv.user || '').toLowerCase();
    if (!seenUsers.has(key)) targets.push(accountOv);
  }
  return targets;
}

async function persistImapCursor(overrides, cursorUid, syncFrom) {
  const pdvId = overrides?._pdvId;
  const accountId = overrides?._accountId;
  if (!pdvId && !accountId) return;
  try {
    if (pdvId) {
      const db = getDeliveryDbName();
      await ensureDatabase(fakeReq, db);
      const pdvDoc = await getDocument(fakeReq, db, pdvId);
      if (!pdvDoc || pdvDoc.type !== 'point_of_sale') return;
      const cfg = { ...(pdvDoc.supplierInvoiceConfig || {}) };
      if (cursorUid != null && Number(cursorUid) > Number(cfg.imapCursorUid || 0)) {
        cfg.imapCursorUid = Number(cursorUid);
      }
      if (syncFrom && !cfg.imapSyncFrom) cfg.imapSyncFrom = syncFrom;
      pdvDoc.supplierInvoiceConfig = cfg;
      pdvDoc.updatedAt = new Date().toISOString();
      await putDocument(fakeReq, db, pdvDoc._id, pdvDoc);
      return;
    }

    const { ACCOUNTS_DB } = await import('./couchdb.js');
    await ensureDatabase(fakeReq, ACCOUNTS_DB);
    const accountDoc = await getDocument(fakeReq, ACCOUNTS_DB, accountId);
    if (!accountDoc) return;
    const cfg = { ...(accountDoc.supplierInvoiceConfig || {}) };
    if (cursorUid != null && Number(cursorUid) > Number(cfg.imapCursorUid || 0)) {
      cfg.imapCursorUid = Number(cursorUid);
    }
    if (syncFrom && !cfg.imapSyncFrom) cfg.imapSyncFrom = syncFrom;
    accountDoc.supplierInvoiceConfig = cfg;
    await putDocument(fakeReq, ACCOUNTS_DB, accountDoc._id, accountDoc);
  } catch (err) {
    logger.warn({ tag: 'SINV_PROC', err: err.message }, 'No se pudo guardar cursor IMAP');
  }
}

/** Primera conexión: fija cursor al final del inbox para no leer el histórico. */
async function ensureImapCursorBaseline(overrides) {
  if (Number(overrides.sinceUid) > 0) return { ...overrides, _justBaselined: false };
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host: overrides.host,
    port: Number(overrides.port || 993),
    secure: overrides.tls !== false,
    auth: { user: overrides.user, pass: overrides.pass },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  let cursor = 0;
  try {
    const uidNext = Number(client.mailbox?.uidNext || 1);
    cursor = Math.max(0, uidNext - 1);
  } finally {
    lock.release();
    try { await client.logout(); } catch { /* ignore */ }
  }
  const syncFrom = new Date().toISOString();
  await persistImapCursor(overrides, cursor, syncFrom);
  logger.info(
    { tag: 'SINV_PROC', cursor, syncFrom, pdvId: overrides._pdvId || null },
    'Cursor IMAP inicializado: solo se procesará correo nuevo a partir de ahora',
  );
  return { ...overrides, sinceUid: cursor, sinceDate: syncFrom, _justBaselined: true };
}

// ─── OCR interno (reutiliza la misma lógica de /api/ocr/scan) ────────────────

const OCR_JSON_SYSTEM = `Eres un experto en OCR de facturas y albaranes de proveedor (España).
Extrae TODA la información útil. Responde SOLO con JSON válido, sin markdown ni texto adicional.
{
  "documentType": "factura_proveedor",
  "emitter": "Nombre del emisor/empresa proveedora",
  "emitterCIF": "CIF/NIF del emisor",
  "receiver": "Nombre del receptor",
  "receiverCIF": "CIF/NIF del receptor",
  "date": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD o null",
  "documentNumber": "Número de factura/albarán",
  "subtotal": 0.00,
  "taxRate": 21,
  "taxAmount": 0.00,
  "total": 0.00,
  "currency": "EUR",
  "lines": [
    { "description": "Nombre del artículo/concepto", "quantity": 1, "unitPrice": 0.00, "total": 0.00 }
  ],
  "paymentTerms": "Condiciones de pago si aparecen",
  "bankAccount": "IBAN si aparece",
  "confidenceScore": 85,
  "notes": "Observaciones relevantes"
}
REGLAS OBLIGATORIAS:
- "lines" debe incluir TODAS las líneas de producto/servicio (no solo totales).
- Cada línea: description (texto legible), quantity, unitPrice (sin IVA si se ve), total de línea.
- No inventes artículos. Si no hay tabla de líneas, "lines": [].
- Fechas en YYYY-MM-DD. Importes numéricos con punto decimal.
- Si un campo no se puede determinar, usa null.`;

function parseOcrJsonContent(rawContent) {
  try {
    const cleaned = String(rawContent || '')
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return { raw: rawContent, parseError: true };
  }
}

async function convertPdfToImageBase64(pdfBase64) {
  const { execSync } = await import('node:child_process');
  const tmpDir = os.tmpdir();
  const id = `ocr-email-${Date.now()}`;
  const pdfPath = path.join(tmpDir, `${id}.pdf`);
  const outPrefix = path.join(tmpDir, id);

  fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, 'base64'));
  try {
    execSync(`pdftoppm -png -r 200 -singlefile "${pdfPath}" "${outPrefix}"`, { timeout: 20000 });
    const pngPath = `${outPrefix}.png`;
    if (!fs.existsSync(pngPath)) throw new Error('pdftoppm no generó imagen');
    const pngBuffer = fs.readFileSync(pngPath);
    fs.unlinkSync(pngPath);
    return pngBuffer.toString('base64');
  } finally {
    try { fs.unlinkSync(pdfPath); } catch { /* noop */ }
  }
}

/** Fallback Windows/VPS sin poppler: texto embebido del PDF → GPT (con saltos de línea reales). */
async function extractPdfText(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = Buffer.isBuffer(buffer)
    ? new Uint8Array(buffer)
    : buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer || []);
  const loadingTask = getDocument({ data, useSystemFonts: true, disableWorker: true });
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

function normalizeOcrLines(ocrData) {
  if (!ocrData || typeof ocrData !== 'object') return ocrData;
  const raw = Array.isArray(ocrData.lines) ? ocrData.lines : [];
  ocrData.lines = raw
    .map((line) => {
      const description = String(line?.description || line?.itemName || line?.catalogItemName || '').trim();
      const quantity = Number(line?.quantity);
      const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
      let unitPrice = Number(line?.unitPrice ?? line?.unitCost ?? 0);
      let total = Number(line?.total ?? line?.lineTotal ?? line?.amount ?? 0);
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
        catalogItemId: String(line?.catalogItemId || ''),
        catalogItemName: String(line?.catalogItemName || ''),
        sku: String(line?.sku || ''),
      };
    })
    .filter((l) => l.description && (l.total > 0 || l.unitPrice > 0 || l.quantity > 0));
  return ocrData;
}

async function callOpenAiOcr(messages) {
  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_KEY || '';
  const openAiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (!openAiApiKey) {
    throw new Error('Falta OPENAI_API_KEY para OCR');
  }

  const response = await fetch(`${openAiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 6000,
      messages,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`OpenAI OCR error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const payload = await response.json();
  return parseOcrJsonContent(payload.choices?.[0]?.message?.content || '{}');
}

async function runOcrOnBuffer(buffer, mimeType) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const headAscii = buf.subarray(0, 5).toString('utf8');
  const isPdf =
    String(mimeType || '').includes('pdf')
    || headAscii.startsWith('%PDF')
    || buf.toString('base64').substring(0, 10).startsWith('JVBE');

  if (isPdf) {
    let local = null;
    // 1) Parser local (sin OpenAI) — PDF con texto
    try {
      local = await parseSupplierInvoicePdfBuffer(buf);
      const usableHeader =
        !local.parseError
        && (
          Number(local.total) > 0
          || String(local.documentNumber || '').trim()
          || String(local.emitterCIF || '').trim()
        );
      const hasLines = ocrHasUsefulLines(local);
      if (usableHeader && hasLines) {
        logger.info(
          {
            tag: 'SINV_PROC',
            method: 'pdf_text_rules',
            total: local.total,
            documentNumber: local.documentNumber,
            lines: local.lines?.length || 0,
            confidenceScore: local.confidenceScore,
          },
          'Factura PDF parseada en local (cabecera + líneas)',
        );
        return normalizeOcrLines(local);
      }
      logger.warn(
        {
          tag: 'SINV_PROC',
          confidenceScore: local.confidenceScore,
          hasHeader: usableHeader,
          lines: local.lines?.length || 0,
        },
        usableHeader && !hasLines
          ? 'Parser PDF local: cabecera OK pero sin líneas — se intenta OpenAI para completar'
          : 'Parser PDF local incompleto; se intenta OpenAI si hay clave',
      );
    } catch (localErr) {
      logger.warn({ tag: 'SINV_PROC', err: localErr.message, code: localErr.code }, 'Parser PDF local falló');
    }

    // 2) OpenAI opcional (si la clave funciona) — obligatorio si faltan líneas
    const openAiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_KEY || '';
    if (!openAiApiKey) {
      if (local && !local.parseError && Number(local.total) > 0) {
        logger.warn(
          { tag: 'SINV_PROC', lines: local.lines?.length || 0 },
          'Sin OPENAI_API_KEY: se guarda factura con cabecera; líneas pueden faltar',
        );
        return normalizeOcrLines(local);
      }
      throw new Error(
        'PDF no parseado en local y no hay OPENAI_API_KEY. Usa un PDF con texto seleccionable o configura OpenAI.',
      );
    }

    let openaiResult = null;
    try {
      const pngBase64 = await convertPdfToImageBase64(buf.toString('base64'));
      openaiResult = await callOpenAiOcr([
        { role: 'system', content: OCR_JSON_SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analiza esta factura de proveedor. Extrae cabecera, totales Y todas las líneas de artículos.',
            },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}`, detail: 'high' } },
          ],
        },
      ]);
      openaiResult.parseMethod = openaiResult.parseMethod || 'openai_vision';
    } catch (imgErr) {
      logger.warn({ tag: 'SINV_PROC', err: imgErr.message }, 'PDF→imagen/OpenAI falló; texto→OpenAI');
    }
    if (!openaiResult) {
      const text = await extractPdfText(buf);
      if (!text || text.length < 20) {
        if (local && !local.parseError) return normalizeOcrLines(local);
        throw new Error('No se pudo leer el PDF (sin texto y sin OCR de imagen).');
      }
      openaiResult = await callOpenAiOcr([
        { role: 'system', content: OCR_JSON_SYSTEM },
        {
          role: 'user',
          content: `Analiza este texto de factura PDF. Extrae cabecera, totales Y todas las líneas de artículos:\n\n${text.slice(0, 14000)}`,
        },
      ]);
      openaiResult.parseMethod = openaiResult.parseMethod || 'openai_text';
    }

    openaiResult = normalizeOcrLines(openaiResult);
    if (local && !local.parseError) {
      const merged = normalizeOcrLines(mergeSupplierInvoiceOcr(local, openaiResult));
      logger.info(
        {
          tag: 'SINV_PROC',
          method: merged.parseMethod,
          total: merged.total,
          lines: merged.lines?.length || 0,
        },
        'Factura PDF: merge local + OpenAI',
      );
      return merged;
    }
    return openaiResult;
  }

  // Imágenes: OpenAI si hay clave
  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_KEY || '';
  if (!openAiApiKey) {
    throw new Error('Las fotos/imágenes requieren OPENAI_API_KEY (o envía la factura en PDF con texto).');
  }
  const detectedMime = mimeType || 'image/png';
  const dataUrl = `data:${detectedMime};base64,${buf.toString('base64')}`;
  const imageResult = await callOpenAiOcr([
    { role: 'system', content: OCR_JSON_SYSTEM },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Analiza esta factura de proveedor. Extrae cabecera, totales Y todas las líneas de artículos.',
        },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
      ],
    },
  ]);
  imageResult.parseMethod = imageResult.parseMethod || 'openai_vision';
  return normalizeOcrLines(imageResult);
}

function suggestNextSupplierCodeFromDocs(suppliers) {
  let max = 0;
  for (const s of suppliers || []) {
    const code = String(s?.code || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '-');
    const m = code.match(/^PROV-?(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `PROV-${String(max + 1).padStart(3, '0')}`;
}

// ─── Matching de proveedor ───────────────────────────────────────────────────

async function matchSupplier(userId, ocrData, emailFrom) {
  let suppliers;
  try {
    suppliers = await listSuppliersByUser(fakeReq, userId);
  } catch {
    return { matched: false, method: '', supplier: null };
  }

  if (!suppliers || suppliers.length === 0) {
    return { matched: false, method: '', supplier: null };
  }

  const fromLower = (emailFrom || '').toLowerCase();
  const emitterCif = String(ocrData?.emitterCIF || '').replace(/[\s-]/g, '').toUpperCase();
  const emitterName = String(ocrData?.emitter || '').toLowerCase().trim();

  // 1. Match por email
  if (fromLower) {
    const byEmail = suppliers.find((s) => s.email && s.email.toLowerCase() === fromLower);
    if (byEmail) return { matched: true, method: 'email', supplier: byEmail };

    const domain = fromLower.split('@')[1];
    if (domain) {
      const byDomain = suppliers.find((s) => s.email && s.email.toLowerCase().endsWith(`@${domain}`));
      if (byDomain) return { matched: true, method: 'email_domain', supplier: byDomain };
    }
  }

  // 2. Match por CIF
  if (emitterCif && emitterCif.length >= 8) {
    const byCif = suppliers.find((s) => {
      const sCif = String(s.cif || '').replace(/[\s-]/g, '').toUpperCase();
      return sCif && sCif === emitterCif;
    });
    if (byCif) return { matched: true, method: 'cif', supplier: byCif };
  }

  // 3. Match por nombre (parcial)
  if (emitterName && emitterName.length > 3) {
    const byName = suppliers.find((s) => {
      const sName = (s.name || '').toLowerCase();
      return sName && (sName.includes(emitterName) || emitterName.includes(sName));
    });
    if (byName) return { matched: true, method: 'name', supplier: byName };
  }

  return { matched: false, method: '', supplier: null };
}

async function ensureSupplierFromOcr(userId, ocrData, emailFrom) {
  const matchResult = await matchSupplier(userId, ocrData, emailFrom);
  if (matchResult.matched && matchResult.supplier) return matchResult;

  const name = String(ocrData?.emitter || '').trim();
  if (!name) return matchResult;

  try {
    const doc = buildSupplierDocument(userId, {
      name,
      code: suggestNextSupplierCodeFromDocs(suppliers),
      cif: String(ocrData?.emitterCIF || '').trim(),
      email: String(emailFrom || '').trim().split('<').pop()?.replace('>', '').trim() || '',
      notes: 'Creado automáticamente desde factura por email (OCR)',
      active: true,
    });
    const db = getCatalogDbName();
    await ensureDatabase(fakeReq, db);
    await putDocument(fakeReq, db, doc._id, doc);
    logger.info({ tag: 'SINV_PROC', supplierId: doc._id, name }, 'Proveedor auto-creado desde OCR email');
    return { matched: true, method: 'auto_created', supplier: doc };
  } catch (err) {
    logger.warn({ tag: 'SINV_PROC', err: err.message, name }, 'No se pudo auto-crear proveedor');
    return matchResult;
  }
}

// ─── Propuesta de categoría y pago ───────────────────────────────────────────

function proposeExpenseAndPayment(ocrData, supplier) {
  const CATEGORY_KEYWORDS = {
    materiales: ['material', 'cemento', 'ladrillo', 'arena', 'hierro', 'acero', 'madera', 'pintura', 'ferreter'],
    servicios: ['servicio', 'consultor', 'asesor', 'mantenimiento', 'reparacion', 'instalacion', 'limpieza'],
    alquiler: ['alquiler', 'arrendamiento', 'renta', 'rent'],
    suministros: ['electricidad', 'agua', 'gas', 'telefono', 'internet', 'luz'],
    transporte: ['transporte', 'envio', 'flete', 'mensajeria', 'logistic'],
    alimentacion: ['comida', 'alimenta', 'bebida', 'catering', 'restauran'],
    tecnologia: ['software', 'licencia', 'hosting', 'dominio', 'cloud', 'server'],
  };

  let proposedCategory = supplier?.category || '';

  if (!proposedCategory || proposedCategory === 'general') {
    const allText = (ocrData?.lines || []).map((l) => String(l.description || '').toLowerCase()).join(' ')
      + ' ' + String(ocrData?.notes || '').toLowerCase();

    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => allText.includes(kw))) {
        proposedCategory = cat;
        break;
      }
    }
  }

  let paymentStatus = 'unpaid';
  if (ocrData?.dueDate) {
    const due = new Date(ocrData.dueDate);
    if (!Number.isNaN(due.getTime()) && due < new Date()) {
      paymentStatus = 'overdue';
    }
  }

  return {
    proposedCategory: proposedCategory || 'proveedores',
    proposedPayMethod: '',
    paymentStatus,
  };
}

// ─── Guardar adjunto en CouchDB ──────────────────────────────────────────────

async function saveAttachment(invoiceId, filename, buffer, mimeType) {
  const db = getCatalogDbName();
  const doc = await getDocument(fakeReq, db, invoiceId);
  if (!doc) throw new Error(`Documento ${invoiceId} no encontrado para adjuntar archivo`);

  const encodedDb = encodeURIComponent(db);
  const encodedId = encodeURIComponent(invoiceId);
  const encodedFilename = encodeURIComponent(filename);

  const response = await couchRequest(
    fakeReq,
    `/${encodedDb}/${encodedId}/${encodedFilename}?rev=${doc._rev}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: buffer,
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Error guardando adjunto: ${response.status} ${body.substring(0, 200)}`);
  }

  return response.json();
}

// ─── Procesar un solo email ──────────────────────────────────────────────────


function parseInvoiceHintsFromSubject(subject) {
  const raw = String(subject || '');
  const out = { documentNumber: null, date: null };
  const num =
    raw.match(/factura\s*(?:n[ºo.]?\s*)?([A-Z0-9][A-Z0-9\-\/]{4,})/i)
    || raw.match(/\b(?:fac|inv)[-\s]?([A-Z0-9][A-Z0-9\-\/]{4,})/i)
    || raw.match(/\b(\d{8,})\b/);
  if (num?.[1]) out.documentNumber = String(num[1]).trim();
  const dateM = raw.match(/fecha(?:\s+de)?\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
  if (dateM?.[1]) {
    const parts = dateM[1].split(/[\/\-.]/);
    if (parts.length === 3) {
      let d = Number(parts[0]);
      let mo = Number(parts[1]);
      let y = Number(parts[2]);
      if (y < 100) y += 2000;
      if (d > 0 && mo > 0 && mo <= 12) {
        out.date = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      }
    }
  }
  return out;
}

async function processSingleEmail(userId, email, scope = {}) {
  const result = { created: false, invoiceId: null, alerts: [], createdCount: 0 };

  // Facturas ya creadas desde este mismo correo (1 email puede traer N PDFs)
  const alreadyFromEmail = (await listPurchaseInvoicesByUser(fakeReq, userId))
    .filter((inv) => inv.sourceEmailId && email.messageId && inv.sourceEmailId === email.messageId);
  const doneFilenames = new Set(
    alreadyFromEmail.flatMap((inv) =>
      (Array.isArray(inv.attachments) ? inv.attachments : [])
        .map((a) => String(a.filename || '').toLowerCase())
        .filter(Boolean),
    ),
  );

  const workCenterId = String(scope.workCenterId || '').trim();
  const businessId = String(scope.businessId || '').trim();
  const pdvName = String(scope.pdvName || '').trim();
  const pdvId = String(scope.pdvId || '').trim();

  const baseData = {
    source: 'email',
    sourceEmailId: email.messageId,
    sourceEmailFrom: email.from,
    sourceEmailSubject: email.subject,
    sourceEmailDate: email.date,
    entryMethod: 'email',
    status: 'pending_review',
    ...(workCenterId
      ? {
          workCenterId,
          costCenterId: workCenterId,
          workCenterName: pdvName,
          costCenterName: pdvName,
        }
      : {}),
    ...(businessId ? { businessId, business_id: businessId } : {}),
    ...(pdvId ? { sourcePdvId: pdvId } : {}),
  };

  // Sin adjuntos válidos: no crear factura fantasma (antes llenaba Compras de F-000x a 0 €).
  if (!email.hasValidAttachments) {
    logger.info({ tag: 'SINV_PROC', from: email.from, subject: email.subject }, 'Email sin adjuntos válidos — se ignora');
    result.alerts.push({
      type: 'no_attachment',
      data: { from: email.from, subject: email.subject, invoiceId: '' },
    });
    return result;
  }

  // Procesar cada adjunto como posible factura
  for (const attachment of email.attachments) {
    const fnameKey = String(attachment.filename || '').toLowerCase();
    if (fnameKey && doneFilenames.has(fnameKey)) {
      logger.info(
        { tag: 'SINV_PROC', messageId: email.messageId, filename: attachment.filename },
        'Adjunto ya importado en este correo — se omite',
      );
      continue;
    }

    let ocrData = null;
    let ocrFailed = false;

    try {
      ocrData = await runOcrOnBuffer(attachment.content, attachment.mimeType);
      if (ocrData.parseError) {
        ocrFailed = true;
        logger.warn({ tag: 'SINV_PROC', filename: attachment.filename }, 'OCR parseó pero con error');
      }
    } catch (err) {
      ocrFailed = true;
      logger.error({ tag: 'SINV_PROC', filename: attachment.filename, err: err.message }, 'OCR falló');
    }

    // Pistas del asunto (ej. IONOS: "Tu factura 311100758596 con fecha de 05/08/2026")
    const subjectHints = parseInvoiceHintsFromSubject(email.subject || '');
    if (ocrData && typeof ocrData === 'object') {
      if (!ocrData.documentNumber && subjectHints.documentNumber) {
        ocrData.documentNumber = subjectHints.documentNumber;
      }
      if (!ocrData.date && subjectHints.date) ocrData.date = subjectHints.date;
    } else if (subjectHints.documentNumber || subjectHints.date) {
      ocrData = {
        documentType: 'factura_proveedor',
        documentNumber: subjectHints.documentNumber,
        date: subjectHints.date,
        total: null,
        lines: [],
        confidenceScore: 25,
        notes: 'Datos parciales desde asunto del email',
        parseMethod: 'email_subject',
      };
    }

    const hasUsefulOcr =
      Number(ocrData?.total) > 0
      || Number(ocrData?.subtotal) > 0
      || (Array.isArray(ocrData?.lines) && ocrData.lines.some((l) => Number(l?.total) > 0 || Number(l?.unitPrice) > 0));

    // Sin importe no creamos (evita F-000x a 0,00 €). Asunto solo no basta.
    if (!hasUsefulOcr) {
      logger.warn(
        {
          tag: 'SINV_PROC',
          from: email.from,
          subject: email.subject,
          filename: attachment.filename,
          ocrFailed,
        },
        'Adjunto sin datos de factura usables — no se crea documento',
      );
      result.alerts.push({
        type: 'ocr_failed',
        data: {
          invoiceId: '',
          from: email.from,
          filename: attachment.filename,
          subject: email.subject,
        },
      });
      continue;
    }

    const matchResult = await ensureSupplierFromOcr(userId, ocrData, email.from);

    const invoiceNumber = await assignPurchaseInvoiceNumber(fakeReq, userId, {
      invoiceNumber: ocrData?.documentNumber || '',
      documentKind: ocrData?.documentType || 'factura_proveedor',
      ocrData,
    });
    let duplicateResult = null;
    if (invoiceNumber) {
      duplicateResult = await findDuplicatePurchaseInvoice(
        fakeReq, userId, invoiceNumber, matchResult.supplier?._id || '', ocrData?.total,
      );
    }

    // No meter 2 facturas con el mismo código
    if (duplicateResult) {
      result.alerts.push({
        type: 'duplicate',
        data: {
          invoiceId: duplicateResult._id,
          duplicateOf: duplicateResult._id,
          invoiceNumber,
          supplierName: duplicateResult.supplierName || matchResult.supplier?.name || '',
          total: duplicateResult.total,
        },
      });
      result.skippedDuplicate = true;
      logger.warn(
        { tag: 'SINV_PROC', invoiceNumber, existingId: duplicateResult._id },
        'Factura duplicada por código — no se crea de nuevo',
      );
      continue;
    }

    const proposal = proposeExpenseAndPayment(ocrData, matchResult.supplier);

    const enrichedLines = !ocrFailed
      ? await enrichOcrLinesForUser(
          ocrData?.lines || [],
          userId,
          matchResult.supplier?._id || '',
        )
      : [];

    const invoiceData = {
      ...baseData,
      invoiceNumber: invoiceNumber || '',
      supplierId: matchResult.supplier?._id || '',
      supplierName: matchResult.supplier?.name || ocrData?.emitter || '',
      supplierCif: matchResult.supplier?.cif || ocrData?.emitterCIF || '',
      supplierMatched: matchResult.matched,
      supplierMatchMethod: matchResult.method,
      date: ocrData?.date || email.date?.split('T')[0] || new Date().toISOString().split('T')[0],
      dueDate: ocrData?.dueDate || '',
      lines: enrichedLines.length > 0 ? enrichedLines : (ocrData?.lines || []),
      taxRate: ocrData?.taxRate ?? 21,
      currency: ocrData?.currency || 'EUR',
      subtotal: Number(ocrData?.subtotal ?? 0) || undefined,
      taxAmount: Number(ocrData?.taxAmount ?? 0) || undefined,
      total: Number(ocrData?.total ?? 0) || undefined,
      ...proposal,
      ocrData,
      ocrConfidence: ocrData?.confidenceScore ? (ocrData.confidenceScore >= 70 ? 'high' : 'low') : '',
      attachments: [{
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        couchAttachmentId: attachment.filename,
      }],
      flags: {
        duplicate: false,
        duplicateOf: '',
        noAttachment: false,
        supplierNotFound: !matchResult.matched,
        ocrFailed,
        manualReview: ocrFailed || !matchResult.matched,
        stockPending: true,
      },
    };

    const doc = buildPurchaseInvoiceDocument(userId, invoiceData);
    const db = getCatalogDbName();
    await ensureDatabase(fakeReq, db);
    const saved = await putDocument(fakeReq, db, doc._id, doc);

    try {
      const { rememberSupplierProductAliasesFromLines } = await import('./supplierProductAliasService.js');
      await rememberSupplierProductAliasesFromLines(
        fakeReq,
        userId,
        doc.supplierId || '',
        doc.lines || [],
      );
    } catch (aliasErr) {
      logger.warn({ tag: 'SINV_PROC', err: aliasErr?.message }, 'No se pudieron guardar aliases proveedor');
    }

    if (!ocrFailed) {
      try {
        // Correo: registra finanzas, stock pendiente hasta «Cargar al almacén»
        await reconcilePurchaseInvoiceFromOcr(fakeReq, userId, { ...doc, _rev: saved.rev }, {
          performedBy: 'email-ocr',
          applyStock: false,
          createFinance: true,
        });
      } catch (reconcileErr) {
        logger.warn({ tag: 'SINV_PROC', invoiceId: doc._id, err: reconcileErr.message }, 'Reconciliación stock/finanzas falló');
      }
    }

    let priceVarianceHit = false;
    try {
      const { applySupplierPriceVarianceCheck } = await import('./supplierPriceVarianceAlert.js');
      const withVar = await applySupplierPriceVarianceCheck(fakeReq, userId, { ...doc, _rev: saved.rev });
      priceVarianceHit = Boolean(withVar?.priceVariance?.hasVariance || withVar?.flags?.priceVariance);
    } catch (priceErr) {
      logger.warn({ tag: 'SINV_PROC', invoiceId: doc._id, err: priceErr?.message }, 'Variación de precio no comprobada');
    }

    // Guardar el archivo PDF/imagen como adjunto en CouchDB
    try {
      await saveAttachment(doc._id, attachment.filename, attachment.content, attachment.mimeType);
    } catch (attErr) {
      logger.warn({ tag: 'SINV_PROC', invoiceId: doc._id, err: attErr.message }, 'Error guardando adjunto en CouchDB');
    }

    result.created = true;
    result.createdCount = (result.createdCount || 0) + 1;
    result.invoiceId = doc._id;
    if (fnameKey) doneFilenames.add(fnameKey);

    if (!matchResult.matched) {
      result.alerts.push({ type: 'unknown_supplier', data: { invoiceId: doc._id, from: email.from, emitter: ocrData?.emitter, cif: ocrData?.emitterCIF } });
    }
    if (ocrFailed) {
      result.alerts.push({ type: 'ocr_failed', data: { invoiceId: doc._id, from: email.from, filename: attachment.filename } });
    }
    if (priceVarianceHit) {
      result.alerts.push({ type: 'price_variance', data: { invoiceId: doc._id, supplierName: doc.supplierName || '' } });
    }
  }

  return result;
}

// ─── Alertas en tiempo real ───────────────────────────────────────────────────

async function emitRealtimeAlert(userId, { title, message, level, route, invoiceId, metadata, alertType }) {
  try {
    const md = metadata && typeof metadata === 'object' ? metadata : {};
    const stableKey = invoiceId
      ? `inv:${invoiceId}`
      : [
          alertType || title || 'alert',
          md.from || '',
          md.filename || '',
          md.invoiceNumber || md.subject || '',
        ]
          .join('|')
          .slice(0, 160);
    const dedupKey = `sinv:${stableKey}:${new Date().toISOString().slice(0, 10)}`;
    const notification = buildNotificationDocument({
      userId,
      level: level || 'warning',
      category: 'supplier_invoice',
      title,
      message,
      entityId: invoiceId || '',
      entityType: 'purchase_invoice',
      route: route || '/saas/catalog?tab=invoices',
      metadata: metadata || {},
    });
    notification._id = `alert:supplier_invoice:${dedupKey}`;

    await ensureDatabase(fakeReq, NOTIFICATIONS_DB);
    const saved = await saveNotification(fakeReq, notification);
    const sanitized = sanitizeNotification(saved);

    broadcastToUser(userId, 'notification', sanitized);
    sendPushToUser(fakeReq, userId, {
      title: sanitized.title,
      body: sanitized.message,
      data: { route: sanitized.route, notificationId: sanitized.id },
    }).catch(() => null);
  } catch (err) {
    logger.warn({ tag: 'SINV_ALERT', err: err.message }, 'Error emitiendo alerta en tiempo real');
  }
}

// ─── Función principal ───────────────────────────────────────────────────────

async function processIncomingEmailsForTarget(userId, resolvedImap) {
  const summary = { processed: 0, created: 0, alerts: 0, duplicates: 0, errors: 0, allAlerts: [] };

  if (!isImapConfigured(resolvedImap)) {
    return summary;
  }

  let imap = resolvedImap;
  try {
    imap = await ensureImapCursorBaseline(imap);
    if (imap._justBaselined) {
      summary.baselined = true;
      summary.message =
        'Punto de partida listo. Los correos antiguos no se leen. Envía ahora un correo nuevo con PDF y vuelve a sincronizar.';
      logger.info(
        { tag: 'SINV_PROC', userId, pdvId: imap._pdvId || null },
        summary.message,
      );
      return summary;
    }
  } catch (err) {
    logger.error({ tag: 'SINV_PROC', err: err.message }, 'No se pudo inicializar cursor IMAP');
    summary.errors++;
    return summary;
  }

  let emails;
  try {
    emails = await connectAndFetchNewEmails(imap);
    const cursorUid = Number(emails?._imapCursorUid || 0);
    if (cursorUid > 0) {
      await persistImapCursor(imap, cursorUid, imap.sinceDate || null);
    }
  } catch (err) {
    logger.error({ tag: 'SINV_PROC', err: err.message }, 'Error obteniendo emails');
    summary.errors++;
    return summary;
  }

  if (!emails || emails.length === 0) {
    logger.debug({ tag: 'SINV_PROC', pdvId: imap._pdvId || null }, 'No hay emails nuevos desde la conexión');
    return summary;
  }

  logger.info(
    { tag: 'SINV_PROC', count: emails.length, pdvId: imap._pdvId || null },
    'Procesando emails entrantes',
  );

  const emailScope = {
    pdvId: imap._pdvId || '',
    workCenterId: imap._workCenterId || '',
    businessId: imap._businessId || '',
    pdvName: imap._pdvName || '',
  };

  for (const email of emails) {
    summary.processed++;
    try {
      const result = await processSingleEmail(userId, email, emailScope);
      if (result.created) summary.created += Math.max(1, Number(result.createdCount || 1));
      summary.alerts += result.alerts.length;
      summary.allAlerts.push(...result.alerts);

      for (const alert of result.alerts) {
        if (alert.type === 'duplicate') {
          const dupKey = String(alert.data.invoiceNumber || alert.data.invoiceId || '');
          if (dupKey && summary._dupAlerted?.has(dupKey)) continue;
          if (!summary._dupAlerted) summary._dupAlerted = new Set();
          if (dupKey) summary._dupAlerted.add(dupKey);
          summary.duplicates = (summary.duplicates || 0) + 1;
          const totalLabel = Number(alert.data.total || 0).toFixed(2);
          await emitRealtimeAlert(userId, {
            title: 'Posible factura duplicada',
            message: `La factura ${alert.data.invoiceNumber} de ${alert.data.supplierName || 'proveedor'} por ${totalLabel}€ podría estar duplicada.`,
            level: 'warning',
            invoiceId: alert.data.invoiceId,
            route: `/saas/catalog?tab=invoices&invoiceId=${alert.data.invoiceId}`,
            metadata: alert.data,
            alertType: 'duplicate',
          });
        } else if (alert.type === 'no_attachment') {
          continue;
        } else if (alert.type === 'unknown_supplier') {
          await emitRealtimeAlert(userId, {
            title: 'Proveedor no identificado',
            message: `Factura desde ${alert.data.from} — no se encontró proveedor registrado${alert.data.cif ? ` con CIF ${alert.data.cif}` : ''}.`,
            level: 'warning',
            invoiceId: alert.data.invoiceId,
            route: `/saas/catalog?tab=invoices&invoiceId=${alert.data.invoiceId}`,
            metadata: alert.data,
            alertType: 'unknown_supplier',
          });
        } else if (alert.type === 'ocr_failed') {
          await emitRealtimeAlert(userId, {
            title: 'Error al leer factura automáticamente',
            message: `No se pudo extraer datos de ${alert.data.filename} (email de ${alert.data.from}). Requiere revisión manual.`,
            level: 'warning',
            invoiceId: alert.data.invoiceId,
            route: `/saas/catalog?tab=invoices&invoiceId=${alert.data.invoiceId}`,
            metadata: alert.data,
            alertType: 'ocr_failed',
          });
        }
      }
    } catch (err) {
      summary.errors++;
      logger.error({ tag: 'SINV_PROC', messageId: email.messageId, err: err.message }, 'Error procesando email individual');
    }
  }

  delete summary._dupAlerted;
  return summary;
}

function mergeEmailPollSummaries(into, part) {
  into.processed += Number(part.processed || 0);
  into.created += Number(part.created || 0);
  into.alerts += Number(part.alerts || 0);
  into.duplicates = (into.duplicates || 0) + Number(part.duplicates || 0);
  into.errors += Number(part.errors || 0);
  if (Array.isArray(part.allAlerts)) into.allAlerts.push(...part.allAlerts);
  if (part.baselined) {
    into.baselined = true;
    into.message = part.message || into.message;
  }
  return into;
}

/**
 * @param {string} userId
 * @param {object} [imapOverrides] — si se pasa, solo ese buzón (tests / legado)
 * @param {{ pdvId?: string }} [options] — si pdvId, solo ese PDV
 */
export async function processIncomingEmails(userId, imapOverrides, options = {}) {
  const summary = { processed: 0, created: 0, alerts: 0, duplicates: 0, errors: 0, allAlerts: [] };
  const pdvId = String(options?.pdvId || '').trim();

  let targets = [];
  if (imapOverrides !== undefined) {
    targets = [imapOverrides];
  } else if (pdvId) {
    const ov = await buildImapOverridesForPdv(userId, pdvId);
    targets = [ov];
  } else {
    targets = await listSupplierInvoiceImapTargets(userId);
    if (targets.length === 0) {
      // Solo .env global (sin cuenta/PDV)
      const envOnly = {};
      if (isImapConfigured(envOnly)) targets = [envOnly];
    }
  }

  const usable = targets.filter((t) => isImapConfigured(t));
  if (usable.length === 0) {
    logger.debug({ tag: 'SINV_PROC', userId, pdvId: pdvId || null }, 'IMAP no configurado, saltando');
    summary.message =
      'No hay correo de facturas guardado y activado para esta tienda. En Correo de facturas: Probar conexión o Guardar y activar.';
    return summary;
  }

  for (const target of usable) {
    try {
      const part = await processIncomingEmailsForTarget(userId, target);
      mergeEmailPollSummaries(summary, part);
    } catch (err) {
      summary.errors++;
      logger.warn(
        { tag: 'SINV_PROC', userId, pdvId: target._pdvId || null, err: err.message },
        'Error en buzón IMAP',
      );
    }
  }

  logger.info({
    tag: 'SINV_PROC',
    processed: summary.processed,
    created: summary.created,
    alerts: summary.alerts,
    duplicates: summary.duplicates || 0,
    errors: summary.errors,
    targets: usable.length,
  }, 'Procesamiento de emails completado');

  return summary;
}

export { runOcrOnBuffer, matchSupplier, saveAttachment, processSingleEmail, buildImapOverridesForPdv };
