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
  const client = createClient(overrides);
  try {
    await client.connect();
    const mailboxes = [];
    for await (const mb of client.listTree()) {
      mailboxes.push(mb.path);
    }
    const inbox = await client.getMailboxLock('INBOX');
    const totalMessages = client.mailbox.exists;
    inbox.release();
    await client.logout();
    return { ok: true, folders: mailboxes, totalMessages };
  } catch (err) {
    logger.warn({ tag: 'IMAP_TEST', err: err.message }, 'Error al probar conexión IMAP');
    try { await client.logout(); } catch { /* ignore */ }
    return { ok: false, error: err.message };
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
