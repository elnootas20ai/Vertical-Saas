/**
 * Config unificada de alertas de caja — una sola fuente para motores y settings del negocio.
 */

import {
  ACCOUNTS_DB,
  ensureDatabase,
  findAccountByUserId,
  saveAccount,
  couchRequest,
} from './couchdb.js';

const SETTINGS_DB = 'settings';

export const DEFAULT_CASH_REGISTER_OPERATIONAL = {
  registerNotOpenedEnabled: true,
  registerNotOpenedCheckHour: 10,
  registerNotClosedEnabled: true,
  cashCloseDeadline: '23:30',
  cashWarningMinutes: 30,
  cashMaxOpenHours: 12,
  discrepancyEnabled: true,
  discrepancyThreshold: 20,
  highReturnEnabled: true,
  highReturnThreshold: 50,
};

export function sanitizeCashRegisterOperational(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const hour = Number(src.registerNotOpenedCheckHour);
  const maxH = Number(src.cashMaxOpenHours);
  const warn = Number(src.cashWarningMinutes);
  const disc = Number(src.discrepancyThreshold);
  const ret = Number(src.highReturnThreshold);
  const deadline = String(src.cashCloseDeadline || '23:30').slice(0, 5);
  const [dh, dm] = deadline.split(':').map(Number);

  return {
    registerNotOpenedEnabled: src.registerNotOpenedEnabled !== false,
    registerNotOpenedCheckHour: Number.isFinite(hour) ? Math.min(14, Math.max(6, hour)) : 10,
    registerNotClosedEnabled: src.registerNotClosedEnabled !== false,
    cashCloseDeadline: `${String(dh ?? 23).padStart(2, '0')}:${String(dm ?? 30).padStart(2, '0')}`,
    cashWarningMinutes: Number.isFinite(warn) ? Math.min(180, Math.max(5, warn)) : 30,
    cashMaxOpenHours: Number.isFinite(maxH) ? Math.min(24, Math.max(4, maxH)) : 12,
    discrepancyEnabled: src.discrepancyEnabled !== false,
    discrepancyThreshold: Number.isFinite(disc) ? Math.max(1, disc) : 20,
    highReturnEnabled: src.highReturnEnabled !== false,
    highReturnThreshold: Number.isFinite(ret) ? Math.max(1, ret) : 50,
  };
}

/** Última hora límite de cierre ya pasada (corrige madrugada). */
export function getLastCloseDeadline(now, deadlineStr) {
  const [dH, dM] = String(deadlineStr || '23:30').split(':').map(Number);
  const dl = new Date(now);
  dl.setHours(dH ?? 23, dM ?? 30, 0, 0);
  if (now.getTime() >= dl.getTime()) return dl;
  const prev = new Date(dl);
  prev.setDate(prev.getDate() - 1);
  return prev;
}

export function minutesPastCloseDeadline(now, deadlineStr) {
  const last = getLastCloseDeadline(now, deadlineStr);
  const diff = (now.getTime() - last.getTime()) / 60_000;
  return diff > 0 ? diff : 0;
}

export async function getBusinessAlertsOperational(req, businessId) {
  if (!businessId) return null;
  try {
    await ensureDatabase(req, SETTINGS_DB);
    const docId = `alerts:${businessId}`;
    const res = await couchRequest(req, `/${encodeURIComponent(SETTINGS_DB)}/${encodeURIComponent(docId)}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc?._id) return null;
    const op = doc.operational;
    if (!op || typeof op !== 'object') return null;
    return {
      cashRegister: sanitizeCashRegisterOperational(op.cashRegister),
    };
  } catch {
    return null;
  }
}

export function resolveCashRegisterAlertConfig(account, businessOperational = null) {
  const legacy = account?.deliveryConfig?.cashRegisterAlerts || {};
  const deliveryCfg = account?.alertConfig?.delivery || {};
  const op = businessOperational?.cashRegister
    ? sanitizeCashRegisterOperational(businessOperational.cashRegister)
    : {};
  const reminder = account?.deliveryConfig?.cashCloseReminderTime;

  const merged = sanitizeCashRegisterOperational({
    registerNotOpenedEnabled: op.registerNotOpenedEnabled ?? legacy.registerNotOpenedEnabled,
    registerNotOpenedCheckHour: op.registerNotOpenedCheckHour ?? legacy.registerNotOpenedCheckHour,
    registerNotClosedEnabled: op.registerNotClosedEnabled ?? legacy.registerNotClosedEnabled,
    cashCloseDeadline: op.cashCloseDeadline || deliveryCfg.cashCloseDeadline || reminder,
    cashWarningMinutes: op.cashWarningMinutes ?? deliveryCfg.cashWarningMinutes,
    cashMaxOpenHours: op.cashMaxOpenHours ?? deliveryCfg.cashMaxOpenHours,
    discrepancyEnabled: op.discrepancyEnabled ?? legacy.discrepancyEnabled,
    discrepancyThreshold: op.discrepancyThreshold ?? legacy.discrepancyThreshold,
    highReturnEnabled: op.highReturnEnabled ?? legacy.highReturnEnabled,
    highReturnThreshold: op.highReturnThreshold ?? legacy.highReturnThreshold,
  });

  const deliveryEnabled = deliveryCfg.cashPendingCloseEnabled !== false;
  return {
    ...merged,
    cashPendingCloseEnabled: deliveryEnabled && merged.registerNotClosedEnabled,
  };
}

export async function syncCashRegisterAlertsToAccount(req, userId, operational) {
  const account = await findAccountByUserId(req, userId);
  if (!account) return;
  const cash = sanitizeCashRegisterOperational(operational);
  const delivery = { ...(account.alertConfig?.delivery || {}) };

  delivery.cashPendingCloseEnabled = cash.registerNotClosedEnabled;
  delivery.cashCloseDeadline = cash.cashCloseDeadline;
  delivery.cashWarningMinutes = cash.cashWarningMinutes;
  delivery.cashMaxOpenHours = cash.cashMaxOpenHours;

  const updated = {
    ...account,
    alertConfig: { ...(account.alertConfig || {}), delivery },
    deliveryConfig: {
      ...(account.deliveryConfig || {}),
      cashCloseReminder: cash.registerNotClosedEnabled,
      cashCloseReminderTime: cash.cashCloseDeadline,
      cashRegisterAlerts: { ...cash },
    },
    updatedAt: new Date().toISOString(),
  };
  await saveAccount(req, updated);
}
