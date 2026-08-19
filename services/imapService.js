import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import logger from './logger.js';

const ALLOWED_MIME_TYPES = (process.env.SUPPLIER_INVOICE_ALLOWED_MIME_TYPES || 'application/pdf,image/png,image/jpeg,image/webp').split(',').map((s) => s.trim());
const MAX_ATTACHMENT_SIZE = Number(process.env.SUPPLIER_INVOICE_MAX_ATTACHMENT_SIZE_MB || 25) * 1024 * 1024;

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
      const unseenMessages = await client.search({ seen: false });
      if (!unseenMessages || unseenMessages.length === 0) {
        lock.release();
        await client.logout();
        return results;
      }

      logger.info({ tag: 'IMAP', count: unseenMessages.length }, 'Emails no leídos encontrados');

      for (const uid of unseenMessages) {
        try {
          const raw = await client.download(uid, undefined, { uid: true });
          if (!raw?.content) continue;

          const chunks = [];
          for await (const chunk of raw.content) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          const parsed = await simpleParser(buffer);

          const fromAddr = parsed.from?.value?.[0]?.address || '';
          const fromName = parsed.from?.value?.[0]?.name || '';

          const validAttachments = (parsed.attachments || []).filter((att) => {
            if (!ALLOWED_MIME_TYPES.includes(att.contentType)) return false;
            if (att.size > MAX_ATTACHMENT_SIZE) {
              logger.warn({ tag: 'IMAP', filename: att.filename, size: att.size, max: MAX_ATTACHMENT_SIZE }, 'Adjunto demasiado grande, ignorado');
              return false;
            }
            return true;
          }).map((att) => ({
            filename: att.filename || `adjunto-${Date.now()}`,
            mimeType: att.contentType,
            content: att.content,
            size: att.size,
          }));

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

          await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        } catch (msgErr) {
          logger.warn({ tag: 'IMAP', uid, err: msgErr.message }, 'Error procesando email individual');
        }
      }
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
