import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import logger from './logger.js';

const ALLOWED_MIME_TYPES = (process.env.SUPPLIER_INVOICE_ALLOWED_MIME_TYPES || 'application/pdf,image/png,image/jpeg,image/jpg,image/webp').split(',').map((s) => s.trim().toLowerCase());
const MAX_ATTACHMENT_SIZE = Number(process.env.SUPPLIER_INVOICE_MAX_ATTACHMENT_SIZE_MB || 25) * 1024 * 1024;
/** Por sync: evita 500/timeouts si el inbox tiene cientos/miles de no leídos. */
const MAX_EMAILS_PER_FETCH = Math.max(1, Number(process.env.SUPPLIER_INVOICE_MAX_EMAILS_PER_FETCH || 10));

function normalizeAttachmentMime(contentType, filename, content) {
  const raw = String(contentType || '').split(';')[0].trim().toLowerCase();
  const name = String(filename || '').toLowerCase();
  const buf = Buffer.isBuffer(content) ? content : null;
  const head = buf && buf.length >= 5 ? buf.subarray(0, 5).toString('utf8') : '';
  const isPdfMagic = head.startsWith('%PDF');
  if (raw === 'application/pdf' || raw === 'application/x-pdf' || name.endsWith('.pdf') || isPdfMagic) {
    return 'application/pdf';
  }
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw === 'image/png' || name.endsWith('.png')) return 'image/png';
  if (raw === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (raw === 'image/webp' || name.endsWith('.webp')) return 'image/webp';
  // Gmail a menudo manda PDF como octet-stream
  if ((raw === 'application/octet-stream' || raw === 'binary/octet-stream' || !raw) && (name.endsWith('.pdf') || isPdfMagic)) {
    return 'application/pdf';
  }
  return raw;
}

function isAllowedInvoiceAttachment(att) {
  const mime = normalizeAttachmentMime(att.contentType, att.filename, att.content);
  if (!ALLOWED_MIME_TYPES.includes(mime)) return false;
  if (att.size > MAX_ATTACHMENT_SIZE) {
    logger.warn(
      { tag: 'IMAP', filename: att.filename, size: att.size, max: MAX_ATTACHMENT_SIZE },
      'Adjunto demasiado grande, ignorado',
    );
    return false;
  }
  return true;
}

function getImapConfig(overrides = {}) {
  return {
    host: overrides.host || process.env.SUPPLIER_INVOICE_IMAP_HOST || '',
    port: Number(overrides.port || process.env.SUPPLIER_INVOICE_IMAP_PORT || 993),
    secure: overrides.tls !== false && process.env.SUPPLIER_INVOICE_IMAP_TLS !== 'false',
    auth: {
      user: overrides.user || process.env.SUPPLIER_INVOICE_IMAP_USER || '',
      pass: overrides.pass || process.env.SUPPLIER_INVOICE_IMAP_PASSWORD || '',
    },
    logger: false,
    emitLogs: false,
  };
}

export function isImapConfigured(overrides = {}) {
  const cfg = getImapConfig(overrides);
  return Boolean(cfg.host && cfg.auth.user && cfg.auth.pass);
}

function createClient(overrides = {}) {
  const cfg = getImapConfig(overrides);
  if (!cfg.host || !cfg.auth.user) {
    throw new Error('IMAP no configurado: faltan SUPPLIER_INVOICE_IMAP_HOST y/o SUPPLIER_INVOICE_IMAP_USER');
  }
  return new ImapFlow(cfg);
}

export async function testImapConnection(overrides = {}) {
  const cleaned = {
    ...overrides,
    pass: String(overrides.pass || '').replace(/\s+/g, '').trim(),
    user: String(overrides.user || '').trim(),
    host: String(overrides.host || '').trim(),
  };
  if (!cleaned.pass) {
    return {
      ok: false,
      error: 'Falta la contraseña de aplicación. Vuelve a escribirla y guarda antes de probar.',
    };
  }
  const client = createClient(cleaned);
  try {
    await client.connect();
    // listTree() en imapflow devuelve un árbol (Promise), no un async iterable.
    let folders = [];
    try {
      const listed = await client.list();
      folders = (Array.isArray(listed) ? listed : [])
        .map((mb) => mb?.path)
        .filter(Boolean);
    } catch {
      folders = ['INBOX'];
    }
    const inbox = await client.getMailboxLock('INBOX');
    const totalMessages = client.mailbox?.exists ?? 0;
    inbox.release();
    await client.logout();
    return { ok: true, folders, totalMessages };
  } catch (err) {
    const raw = String(err?.message || err || '');
    logger.warn({ tag: 'IMAP_TEST', err: raw }, 'Error al probar conexión IMAP');
    try { await client.logout(); } catch { /* ignore */ }
    let friendly = raw;
    if (/no password configured/i.test(raw)) {
      friendly = 'Falta la contraseña de aplicación. Vuelve a escribirla, guarda y prueba.';
    } else if (/authentication|invalid credentials|login failed|auth/i.test(raw)) {
      friendly = 'Usuario o contraseña de aplicación incorrectos. Revisa Gmail (contraseña de aplicación, no la normal).';
    } else if (/listTree|not a function|async iterable/i.test(raw)) {
      friendly = 'Error interno al listar carpetas IMAP. Reintenta; si persiste, avisa a soporte.';
    }
    return { ok: false, error: friendly };
  }
}

export async function connectAndFetchNewEmails(overrides = {}) {
  const client = createClient(overrides);
  const results = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const sinceUid = Number(overrides.sinceUid || 0);
      const sinceDateRaw = overrides.sinceDate || overrides.since || null;
      const sinceDate = sinceDateRaw ? new Date(sinceDateRaw) : null;
      const sinceOk = sinceDate && !Number.isNaN(sinceDate.getTime());

      let candidateUids = [];
      if (sinceUid > 0) {
        // Solo UIDs nuevos desde que se conectó / último cursor
        candidateUids = await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true });
      } else if (sinceOk) {
        // IMAP SINCE es por día; luego filtramos por fecha exacta en JS
        candidateUids = await client.search({ since: sinceDate }, { uid: true });
      } else {
        // Sin cursor: no tragarse el histórico — solo no leídos de los últimos 2 días
        const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        candidateUids = await client.search({ seen: false, since: recent }, { uid: true });
      }

      if (sinceUid > 0) {
        candidateUids = (candidateUids || []).filter((u) => Number(u) > sinceUid);
      }
      if (!candidateUids || candidateUids.length === 0) {
        lock.release();
        await client.logout();
        return results;
      }

      const sorted = [...candidateUids].sort((a, b) => Number(b) - Number(a));
      const batch = sorted.slice(0, MAX_EMAILS_PER_FETCH);
      logger.info(
        {
          tag: 'IMAP',
          candidates: candidateUids.length,
          batch: batch.length,
          max: MAX_EMAILS_PER_FETCH,
          sinceUid: sinceUid || null,
          sinceDate: sinceOk ? sinceDate.toISOString() : null,
        },
        'Emails candidatos a facturas',
      );

      let maxSeenUid = sinceUid > 0 ? sinceUid : 0;

      for (const uid of batch) {
        try {
          const raw = await client.download(uid, undefined, { uid: true });
          if (!raw?.content) continue;

          const chunks = [];
          for await (const chunk of raw.content) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          const parsed = await simpleParser(buffer);

          const msgDate = parsed.date ? new Date(parsed.date) : null;
          if (sinceOk && msgDate && !Number.isNaN(msgDate.getTime()) && msgDate < sinceDate) {
            // Anterior al momento de conexión — ignorar
            maxSeenUid = Math.max(maxSeenUid, Number(uid) || 0);
            continue;
          }

          const fromAddr = parsed.from?.value?.[0]?.address || '';
          const fromName = parsed.from?.value?.[0]?.name || '';

          const validAttachments = (parsed.attachments || []).filter((att) => isAllowedInvoiceAttachment(att)).map((att) => {
            const mimeType = normalizeAttachmentMime(att.contentType, att.filename, att.content);
            return {
              filename: att.filename || `adjunto-${Date.now()}${mimeType === 'application/pdf' ? '.pdf' : ''}`,
              mimeType,
              content: att.content,
              size: att.size,
            };
          });

          if (validAttachments.length === 0 && Array.isArray(parsed.attachments)) {
            for (const att of parsed.attachments) {
              const mimeType = normalizeAttachmentMime(att.contentType, att.filename, att.content);
              if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
                if (att.size > MAX_ATTACHMENT_SIZE) continue;
                validAttachments.push({
                  filename: att.filename || `factura-${Date.now()}.pdf`,
                  mimeType,
                  content: att.content,
                  size: att.size,
                });
              }
            }
          }

          results.push({
            messageId: parsed.messageId || `uid-${uid}`,
            from: fromAddr,
            fromName,
            subject: parsed.subject || '',
            date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
            textBody: parsed.text || '',
            htmlBody: parsed.html || '',
            attachments: validAttachments,
            hasValidAttachments: validAttachments.length > 0,
            uid,
          });

          maxSeenUid = Math.max(maxSeenUid, Number(uid) || 0);
          // No marcamos Seen aquí: el histórico del cliente no se toca; dedup por messageId
        } catch (msgErr) {
          logger.warn({ tag: 'IMAP', uid, err: msgErr.message }, 'Error procesando email individual');
        }
      }

      results._imapCursorUid = maxSeenUid;
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    logger.error({ tag: 'IMAP', err: err.message }, 'Error en la conexión IMAP');
    try { await client.logout(); } catch { /* ignore */ }
    throw err;
  }

  return results;
}
