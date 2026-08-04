/**
 * Resumen diario a ALERTS_ADMIN_EMAIL: backup + uptime (solo prod / ALERTS_OPS_IN_DEV).
 */
import os from 'node:os';
import { sendAdminAlert } from './adminAlerts.js';
import { escapeAdminHtml } from './adminAlertEmail.js';
import { getBackupState } from './backupScheduler.js';
import logger from './logger.js';

function formatUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytesMb(bytes) {
  return Math.round((Number(bytes) || 0) / (1024 * 1024));
}

export async function runDailyOpsDigest() {
  const backup = getBackupState();
  const mem = process.memoryUsage();
  const uptimeLabel = formatUptime(process.uptime());
  const backupOk = backup.lastStatus === 'success';
  const subject = backupOk
    ? `✅ Vertial: resumen diario OK · uptime ${uptimeLabel}`
    : `⚠️ Vertial: resumen diario · backup ${backup.lastStatus || 'sin datos'}`;

  const html = `<p><b>Resumen operativo diario</b></p>
<ul>
  <li><b>Host</b>: ${escapeAdminHtml(os.hostname())}</li>
  <li><b>Uptime</b>: ${escapeAdminHtml(uptimeLabel)}</li>
  <li><b>RAM rss</b>: ${formatBytesMb(mem.rss)} MB · heap ${formatBytesMb(mem.heapUsed)} MB</li>
  <li><b>Backup</b>: ${escapeAdminHtml(backup.lastStatus || '—')}</li>
  <li><b>Último backup</b>: ${escapeAdminHtml(backup.lastRunAt || 'nunca')}</li>
  <li><b>Tamaño</b>: ${backup.lastFileSizeKB != null ? `${backup.lastFileSizeKB} KB` : '—'}</li>
  <li><b>OK / fallos</b>: ${backup.successRuns || 0} / ${backup.failedRuns || 0}</li>
  ${backup.lastError ? `<li><b>Último error backup</b>: ${escapeAdminHtml(backup.lastError)}</li>` : ''}
</ul>`;

  const result = await sendAdminAlert({
    key: 'daily_ops_digest',
    subject,
    html,
    cooldownMs: Number(process.env.ALERT_DAILY_DIGEST_COOLDOWN_MS || 20 * 60 * 60_000),
    severity: backupOk ? 'success' : 'warning',
  });

  if (result?.ok && !result.skipped) {
    logger.info({ tag: 'DAILY_DIGEST', backupStatus: backup.lastStatus }, 'Resumen diario admin enviado');
  }
  return result;
}

export function startDailyOpsDigest() {
  const delayMs = Number(process.env.ALERT_DAILY_DIGEST_DELAY_MS || 15 * 60_000);
  const intervalMs = Number(process.env.ALERT_DAILY_DIGEST_INTERVAL_MS || 24 * 60 * 60_000);
  setTimeout(() => runDailyOpsDigest().catch(() => null), delayMs);
  setInterval(() => runDailyOpsDigest().catch(() => null), intervalMs);
  logger.info(
    { tag: 'DAILY_DIGEST', delayMs, intervalMs },
    'Scheduler resumen diario admin iniciado',
  );
}
