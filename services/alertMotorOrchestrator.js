/**
 * Orquestador de motores de alertas — un solo punto para sincronizar el Centro de Alertas.
 * El front llama POST /api/alerts/:userId/check al abrir o pulsar «Actualizar».
 */

import logger from './logger.js';
import { runAlertEngine } from './alertEngine.js';
import { runDeliveryAlerts } from './deliveryAlertEngine.js';
import { runEventsAlertEngine } from './eventsAlertEngine.js';

const TAG = 'ALERT_ORCHESTRATOR';

export async function runAllAlertMotors() {
  const start = Date.now();
  // Limpieza / carnicería / construcción: fuera de momento (solo delivery + eventos + bar).
  const results = await Promise.allSettled([
    runAlertEngine(),
    runDeliveryAlerts(),
    runEventsAlertEngine(),
  ]);

  const errors = results
    .map((r, i) => (r.status === 'rejected' ? { motor: i, err: r.reason?.message || String(r.reason) } : null))
    .filter(Boolean);

  if (errors.length) {
    logger.warn({ tag: TAG, errors, ms: Date.now() - start }, 'Algunos motores de alertas fallaron');
  }

  return { ok: errors.length === 0, ms: Date.now() - start, failures: errors.length };
}
