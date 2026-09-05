import logger from './logger.js';
import { isImapConfigured } from './imapService.js';
import { processIncomingEmails, listSupplierInvoiceImapTargets } from './supplierInvoiceProcessor.js';
import { ACCOUNTS_DB, ensureDatabase, getAllDocuments } from './couchdb.js';
import { shouldRunBackgroundEngine } from './engineIdleGate.js';
import { hasImapPasswordStored } from './secretAtRest.js';

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
  return Boolean(host && user && hasImapPasswordStored(cfg.imapPassword));
}

async function anyAccountHasEnabledImap() {
  const fakeReq = { headers: {} };
  try {
    await ensureDatabase(fakeReq, ACCOUNTS_DB);
    const accounts = await getAllDocuments(fakeReq, ACCOUNTS_DB);
    for (const a of accounts) {
      if (!a || a.type !== 'account' || a.deletedAt || a.active === false) continue;
      if (accountImapReadyForPolling(a.supplierInvoiceConfig)) return true;
      const userId = a.userId || a._id;
      if (!userId) continue;
      try {
        const targets = await listSupplierInvoiceImapTargets(userId);
        if (targets.length > 0) return true;
      } catch {
        /* next */
      }
    }
    return false;
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

  // Siempre arranca el intervalo. Si al boot no hay IMAP, se reintenta en cada ciclo
  // (si no, conectar el correo después del deploy deja el automático muerto hasta reiniciar).
  logger.info({ tag: 'SINV_SCHED', intervalMs: POLL_INTERVAL_MS }, 'Iniciando polling de facturas proveedor por email');

  const tick = async () => {
    let imapReady = isImapConfigured();
    if (!imapReady) {
      try {
        imapReady = await anyAccountHasEnabledImap();
      } catch (err) {
        logger.warn({ tag: 'SINV_SCHED', err: err?.message || String(err) }, 'No se pudo comprobar IMAP por cuenta');
        return;
      }
    }
    if (!imapReady) {
      logger.debug(
        { tag: 'SINV_SCHED' },
        'Sin buzones IMAP listos todavía — se reintentará en el próximo ciclo',
      );
      return;
    }
    if (!shouldRunBackgroundEngine('supplier_invoice_poll')) return;
    await runPollCycle();
  };

  setTimeout(() => {
    tick().catch((err) =>
      logger.error({ tag: 'SINV_SCHED', err: err.message }, 'Error en primera ejecución'),
    );
  }, STARTUP_DELAY_MS);

  intervalId = setInterval(() => {
    tick().catch((err) =>
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
