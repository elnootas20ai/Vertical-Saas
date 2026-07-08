/**
 * Engine Idle Gate — pausa automática de motores en segundo plano.
 *
 * Problema: los motores de alertas (limpieza cada 2 min, báscula cada 5 min,
 * delivery cada 15 min, general cada 60 min…) escanean CouchDB en cada ciclo
 * aunque nadie esté usando la aplicación, consumiendo cuota de API 24/7.
 *
 * Solución: cada petición real a /api marca actividad. Si no hay actividad
 * en los últimos ENGINE_IDLE_AFTER_MS (20 min por defecto), los motores se
 * saltan sus ciclos y no tocan CouchDB. En cuanto llega una petición se
 * reanudan solos en el siguiente tick. Como red de seguridad, aunque el
 * sistema siga inactivo, cada motor ejecuta un barrido cada
 * ENGINE_IDLE_MAX_SKIP_MS (6 h por defecto) para que las alertas críticas
 * con push/email (caja sin cerrar, caducidades…) sigan saliendo.
 *
 * Configuración por env (opcional, no hace falta tocar nada):
 *   ENGINE_IDLE_AFTER_MS     — ventana de inactividad (default 20 min)
 *   ENGINE_IDLE_MAX_SKIP_MS  — barrido de seguridad (default 6 h)
 *   ENGINE_IDLE_GATE=off     — desactiva la puerta (comportamiento antiguo)
 */

import logger from './logger.js';

const IDLE_AFTER_MS = Math.max(60_000, Number(process.env.ENGINE_IDLE_AFTER_MS) || 20 * 60_000);
const MAX_SKIP_MS = Math.max(IDLE_AFTER_MS, Number(process.env.ENGINE_IDLE_MAX_SKIP_MS) || 6 * 3_600_000);
const GATE_DISABLED = String(process.env.ENGINE_IDLE_GATE || '').trim().toLowerCase() === 'off';

// El arranque cuenta como actividad: los ciclos iniciales tras un deploy se ejecutan.
let lastActivityAt = Date.now();

const lastRunByTag = new Map();
const pausedTags = new Set();

/** Llamado por el middleware de /api en cada petición real. */
export function markSystemActivity() {
  lastActivityAt = Date.now();
}

export function hasRecentActivity(windowMs = IDLE_AFTER_MS) {
  return Date.now() - lastActivityAt < windowMs;
}

/**
 * Decide si un motor debe ejecutar su ciclo.
 * true  → hay actividad reciente, o toca el barrido de seguridad.
 * false → sistema inactivo: el motor se salta el ciclo (0 llamadas a CouchDB).
 */
export function shouldRunBackgroundEngine(tag, { maxSkipMs = MAX_SKIP_MS } = {}) {
  if (GATE_DISABLED) return true;

  const now = Date.now();
  if (!lastRunByTag.has(tag)) lastRunByTag.set(tag, now);

  const active = now - lastActivityAt < IDLE_AFTER_MS;
  const safetyDue = now - lastRunByTag.get(tag) >= maxSkipMs;

  if (!active && !safetyDue) {
    if (!pausedTags.has(tag)) {
      pausedTags.add(tag);
      logger.info(
        { tag: 'ENGINE_IDLE', engine: tag, idleAfterMin: Math.round(IDLE_AFTER_MS / 60_000), safetyH: Math.round(maxSkipMs / 3_600_000) },
        'Sistema inactivo: motor en pausa (se reanuda con actividad o en el barrido de seguridad)',
      );
    }
    return false;
  }

  lastRunByTag.set(tag, now);
  if (pausedTags.has(tag)) {
    pausedTags.delete(tag);
    logger.info(
      { tag: 'ENGINE_IDLE', engine: tag, reason: active ? 'activity' : 'safety_sweep' },
      active ? 'Actividad detectada: motor reanudado' : 'Barrido de seguridad durante inactividad',
    );
  }
  return true;
}

/** Solo para tests: fuerza estado interno sin esperar tiempo real. */
export function __resetIdleGateForTests({ lastActivityMs, lastRuns } = {}) {
  if (Number.isFinite(lastActivityMs)) lastActivityAt = lastActivityMs;
  lastRunByTag.clear();
  pausedTags.clear();
  for (const [tag, at] of Object.entries(lastRuns || {})) lastRunByTag.set(tag, at);
}
