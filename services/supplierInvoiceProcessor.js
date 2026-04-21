import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';
import { connectAndFetchNewEmails, isImapConfigured } from './imapService.js';
import {
  getCatalogDbName,
  buildPurchaseInvoiceDocument,
  sanitizePurchaseInvoice,
  listSuppliersByUser,
  findDuplicatePurchaseInvoice,
  findPurchaseInvoiceByEmailId,
  listPurchaseInvoicesByUser,
  buildNotificationDocument,
  saveNotification,
  sanitizeNotification,
  NOTIFICATIONS_DB,
  ensureDatabase,
  putDocument,
  couchRequest,
  getDocument,
} from './couchdb.js';
import { broadcastToUser } from './sseService.js';
import { sendPushToUser } from './pushService.js';

const fakeReq = { headers: {} };

// ─── OCR interno (reutiliza la misma lógica de /api/ocr/scan) ────────────────

async function convertPdfToImageBase64(pdfBase64) {
  const { execSync } = await import('node:child_process');
  const tmpDir = os.tmpdir();
  const id = `ocr-email-${Date.now()}`;
  const pdfPath = path.join(tmpDir, `${id}.pdf`);
  const outPrefix = path.join(tmpDir, id);

  fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, 'base64'));
  try {
    execSync(`pdftoppm -png -r 300 -singlefile "${pdfPath}" "${outPrefix}"`, { timeout: 15000 });
    const pngPath = `${outPrefix}.png`;
    if (!fs.existsSync(pngPath)) throw new Error('pdftoppm no generó imagen');
    const pngBuffer = fs.readFileSync(pngPath);
    fs.unlinkSync(pngPath);
    return pngBuffer.toString('base64');
  } finally {
    try { fs.unlinkSync(pdfPath); } catch { /* noop */ }
  }
}

async function runOcrOnBuffer(buffer, mimeType) {
  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_KEY || '';
  const openAiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

  if (!openAiApiKey) {
    throw new Error('Falta OPENAI_API_KEY para OCR');
  }

  let base64 = buffer.toString('base64');
  let detectedMime = mimeType || 'image/png';

  if (mimeType === 'application/pdf' || base64.substring(0, 10).startsWith('JVBE')) {
    base64 = await convertPdfToImageBase64(base64);
    detectedMime = 'image/png';
  }

  const dataUrl = `data:${detectedMime};base64,${base64}`;

  const response = await fetch(`${openAiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `Eres un experto en OCR de facturas de proveedor. Analiza la imagen y extrae toda la información.
Responde SOLO con JSON válido, sin markdown ni texto adicional.
{
  "documentType": "factura_proveedor",
  "emitter": "Nombre del emisor/empresa proveedora",
  "emitterCIF": "CIF/NIF del emisor",
  "receiver": "Nombre del receptor",
  "receiverCIF": "CIF/NIF del receptor",
  "date": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD o null",
  "documentNumber": "Número de factura",
  "subtotal": 0.00,
  "taxRate": 21,
  "taxAmount": 0.00,
  "total": 0.00,
  "currency": "EUR",
  "lines": [
    { "description": "Concepto", "quantity": 1, "unitPrice": 0.00, "total": 0.00 }
  ],
  "paymentTerms": "Condiciones de pago si aparecen",
  "bankAccount": "IBAN si aparece",
  "confidenceScore": 85,
  "notes": "Observaciones relevantes"
}
Si algún campo no se puede determinar, usa null.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analiza esta factura de proveedor y extrae toda la información financiera.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`OpenAI OCR error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const payload = await response.json();
  const rawContent = payload.choices?.[0]?.message?.content || '{}';

  try {
    const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { raw: rawContent, parseError: true };
  }
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

async function processSingleEmail(userId, email) {
  const result = { created: false, invoiceId: null, alerts: [] };

  // Verificar si ya se procesó este email
  const existing = await findPurchaseInvoiceByEmailId(fakeReq, userId, email.messageId);
  if (existing) {
    logger.info({ tag: 'SINV_PROC', messageId: email.messageId }, 'Email ya procesado, ignorando');
    return result;
  }

  const baseData = {
    source: 'email',
    sourceEmailId: email.messageId,
    sourceEmailFrom: email.from,
    sourceEmailSubject: email.subject,
    sourceEmailDate: email.date,
    entryMethod: 'email',
    status: 'pending_review',
  };

  // Sin adjuntos válidos
  if (!email.hasValidAttachments) {
    logger.info({ tag: 'SINV_PROC', from: email.from, subject: email.subject }, 'Email sin adjuntos válidos');

    const doc = buildPurchaseInvoiceDocument(userId, {
      ...baseData,
      flags: { noAttachment: true },
    });

    const db = getCatalogDbName();
    await ensureDatabase(fakeReq, db);
    await putDocument(fakeReq, db, doc._id, doc);

    result.created = true;
    result.invoiceId = doc._id;
    result.alerts.push({ type: 'no_attachment', data: { from: email.from, subject: email.subject, invoiceId: doc._id } });
    return result;
  }

  // Procesar cada adjunto como posible factura
  for (const attachment of email.attachments) {
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

    const matchResult = await matchSupplier(userId, ocrData, email.from);

    const invoiceNumber = ocrData?.documentNumber || '';
    let duplicateResult = null;
    if (invoiceNumber && matchResult.supplier) {
      duplicateResult = await findDuplicatePurchaseInvoice(
        fakeReq, userId, invoiceNumber, matchResult.supplier._id, ocrData?.total,
      );
    }

    const proposal = proposeExpenseAndPayment(ocrData, matchResult.supplier);

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
      lines: ocrData?.lines || [],
      taxRate: ocrData?.taxRate ?? 21,
      currency: ocrData?.currency || 'EUR',
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
        duplicate: Boolean(duplicateResult),
        duplicateOf: duplicateResult?._id || '',
        noAttachment: false,
        supplierNotFound: !matchResult.matched,
        ocrFailed,
        manualReview: ocrFailed || !matchResult.matched || Boolean(duplicateResult),
      },
    };

    const doc = buildPurchaseInvoiceDocument(userId, invoiceData);
    const db = getCatalogDbName();
    await ensureDatabase(fakeReq, db);
    const saved = await putDocument(fakeReq, db, doc._id, doc);

    // Guardar el archivo PDF/imagen como adjunto en CouchDB
    try {
      await saveAttachment(doc._id, attachment.filename, attachment.content, attachment.mimeType);
    } catch (attErr) {
      logger.warn({ tag: 'SINV_PROC', invoiceId: doc._id, err: attErr.message }, 'Error guardando adjunto en CouchDB');
    }

    result.created = true;
    result.invoiceId = doc._id;

    if (duplicateResult) {
      result.alerts.push({ type: 'duplicate', data: { invoiceId: doc._id, duplicateOf: duplicateResult._id, invoiceNumber, supplierName: invoiceData.supplierName, total: doc.total } });
    }
    if (!matchResult.matched) {
      result.alerts.push({ type: 'unknown_supplier', data: { invoiceId: doc._id, from: email.from, emitter: ocrData?.emitter, cif: ocrData?.emitterCIF } });
    }
    if (ocrFailed) {
      result.alerts.push({ type: 'ocr_failed', data: { invoiceId: doc._id, from: email.from, filename: attachment.filename } });
    }
  }

  return result;
}

// ─── Alertas en tiempo real ───────────────────────────────────────────────────

async function emitRealtimeAlert(userId, { title, message, level, route, invoiceId, metadata }) {
  try {
    const dedupKey = `sinv:${invoiceId || Date.now()}:${new Date().toISOString().slice(0, 10)}`;
    const notification = buildNotificationDocument({
      userId,
      level: level || 'warning',
      category: 'supplier_invoice',
      title,
      message,
      entityId: invoiceId || '',
      entityType: 'purchase_invoice',
      route: route || '/saas/supplier-billing',
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

export async function processIncomingEmails(userId, imapOverrides = {}) {
  const summary = { processed: 0, created: 0, alerts: 0, errors: 0, allAlerts: [] };

  if (!isImapConfigured(imapOverrides)) {
    logger.debug({ tag: 'SINV_PROC' }, 'IMAP no configurado, saltando procesamiento');
    return summary;
  }

  let emails;
  try {
    emails = await connectAndFetchNewEmails(imapOverrides);
  } catch (err) {
    logger.error({ tag: 'SINV_PROC', err: err.message }, 'Error obteniendo emails');
    summary.errors++;
    return summary;
  }

  if (!emails || emails.length === 0) {
    logger.debug({ tag: 'SINV_PROC' }, 'No hay emails nuevos');
    return summary;
  }

  logger.info({ tag: 'SINV_PROC', count: emails.length }, 'Procesando emails entrantes');

  for (const email of emails) {
    summary.processed++;
    try {
      const result = await processSingleEmail(userId, email);
      if (result.created) summary.created++;
      summary.alerts += result.alerts.length;
      summary.allAlerts.push(...result.alerts);

      for (const alert of result.alerts) {
        if (alert.type === 'duplicate') {
          await emitRealtimeAlert(userId, {
            title: 'Posible factura duplicada',
            message: `La factura ${alert.data.invoiceNumber} de ${alert.data.supplierName} por ${alert.data.total?.toFixed(2) || '0.00'}€ podría estar duplicada.`,
            level: 'warning',
            invoiceId: alert.data.invoiceId,
            route: `/saas/supplier-billing?invoiceId=${alert.data.invoiceId}`,
            metadata: alert.data,
          });
        } else if (alert.type === 'no_attachment') {
          await emitRealtimeAlert(userId, {
            title: 'Email recibido sin factura adjunta',
            message: `Email de ${alert.data.from} con asunto "${alert.data.subject}" sin PDF o imagen adjunta.`,
            level: 'info',
            invoiceId: alert.data.invoiceId,
            metadata: alert.data,
          });
        } else if (alert.type === 'unknown_supplier') {
          await emitRealtimeAlert(userId, {
            title: 'Proveedor no identificado',
            message: `Factura desde ${alert.data.from} — no se encontró proveedor registrado${alert.data.cif ? ` con CIF ${alert.data.cif}` : ''}.`,
            level: 'warning',
            invoiceId: alert.data.invoiceId,
            route: `/saas/supplier-billing?invoiceId=${alert.data.invoiceId}`,
            metadata: alert.data,
          });
        } else if (alert.type === 'ocr_failed') {
          await emitRealtimeAlert(userId, {
            title: 'Error al leer factura automáticamente',
            message: `No se pudo extraer datos de ${alert.data.filename} (email de ${alert.data.from}). Requiere revisión manual.`,
            level: 'warning',
            invoiceId: alert.data.invoiceId,
            route: `/saas/supplier-billing?invoiceId=${alert.data.invoiceId}`,
            metadata: alert.data,
          });
        }
      }
    } catch (err) {
      summary.errors++;
      logger.error({ tag: 'SINV_PROC', messageId: email.messageId, err: err.message }, 'Error procesando email individual');
    }
  }

  logger.info({ tag: 'SINV_PROC', ...summary }, 'Procesamiento de emails completado');
  return summary;
}

export { runOcrOnBuffer, matchSupplier, saveAttachment };
