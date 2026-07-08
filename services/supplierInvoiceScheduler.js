import logger from './logger.js';
import { isImapConfigured } from './imapService.js';
import { processIncomingEmails } from './supplierInvoiceProcessor.js';
import { ACCOUNTS_DB, ensureDatabase, getAllDocuments } from './couchdb.js';
import { shouldRunBackgroundEngine } from './engineIdleGate.js';

const POLL_INTERVAL_MS = Number(process.env.SUPPLIER_INVOICE_POLL_INTERVAL_MS || 300_000);
const STARTUP_DELAY_MS = 20_000;

let intervalId = null;
let running = false;

async function getActiveUserIds() {
  const fakeReq = { headers: {} };
  try {
    await ensureDatabase(fakeReq, ACCOUNTS_DB);
    const accounts = await getAllDocuments(fakeReq, ACCOUNTS_DB);
    return accounts
      .filter((a) => a && a.type === 'account' && !a.deletedAt && a.active !== false)
      .map((a) => a.userId || a._id)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function accountImapReadyForPolling(cfg) {
  if (!cfg?.enabled) return false;
  const host = String(cfg.imapHost || '').trim();
  const user = String(cfg.imapUser || '').trim();
  const pass = String(cfg.imapPassword || '').trim();
  return Boolean(host && user && pass);
}

async function anyAccountHasEnabledImap() {
  const fakeReq = { headers: {} };
  try {
    await ensureDatabase(fakeReq, ACCOUNTS_DB);
    const accounts = await getAllDocuments(fakeReq, ACCOUNTS_DB);
    return accounts.some((a) => (
      a
      && a.type === 'account'
      && !a.deletedAt
      && a.active !== false
      && accountImapReadyForPolling(a.supplierInvoiceConfig)
    ));
  } catch {
    return false;
  }
}

async function runPollCycle() {
  if (running) {
    logger.debug({ tag: 'SINV_SCHED' }, 'Ciclo anterior aún en ejecución, saltando');
    return;
  }

  running = true;
  try {
    const userIds = await getActiveUserIds();
    if (userIds.length === 0) {
      logger.debug({ tag: 'SINV_SCHED' }, 'No hay usuarios activos para polling');
      return;
    }

    for (const userId of userIds) {
      try {
        const summary = await processIncomingEmails(userId);
        if (summary.created > 0 || summary.errors > 0) {
          logger.info({ tag: 'SINV_SCHED', userId, ...summary }, 'Polling completado para usuario');
        }
      } catch (err) {
        logger.warn({ tag: 'SINV_SCHED', userId, err: err.message }, 'Error en polling para usuario');
      }
    }
  } catch (err) {
    logger.error({ tag: 'SINV_SCHED', err: err.message }, 'Error en ciclo de polling');
  } finally {
    running = false;
  }
}

export async function startSupplierInvoicePolling() {
  if (process.env.SUPPLIER_INVOICE_POLL_ENABLED === 'false') {
    logger.info({ tag: 'SINV_SCHED' }, 'Polling de facturas proveedor desactivado por variable de entorno');
    return;
  }

  let imapReady = isImapConfigured();
  if (!imapReady) {
    imapReady = await anyAccountHasEnabledImap();
    if (!imapReady) {
      logger.info(
        { tag: 'SINV_SCHED' },
        'IMAP no configurado en .env ni ninguna cuenta con facturas por email habilitadas — polling desactivado',
      );
      return;
    }
    logger.info(
      { tag: 'SINV_SCHED' },
      'Polling activo usando credenciales por cuenta (sin SUPPLIER_INVOICE_IMAP_* en entorno)',
    );
  }

  logger.info({ tag: 'SINV_SCHED', intervalMs: POLL_INTERVAL_MS }, 'Iniciando polling de facturas proveedor por email');

  setTimeout(() => {
    runPollCycle().catch((err) =>
      logger.error({ tag: 'SINV_SCHED', err: err.message }, 'Error en primera ejecución'),
    );
  }, STARTUP_DELAY_MS);

  intervalId = setInterval(() => {
    if (!shouldRunBackgroundEngine('supplier_invoice_poll')) return;
    runPollCycle().catch((err) =>
      logger.error({ tag: 'SINV_SCHED', err: err.message }, 'Error en ciclo periódico'),
    );
  }, POLL_INTERVAL_MS);
}

export function stopSupplierInvoicePolling() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info({ tag: 'SINV_SCHED' }, 'Polling de facturas proveedor detenido');
  }
}

export { runPollCycle };
