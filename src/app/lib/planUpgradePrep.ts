/**
 * Secuencia de “preparando sistema” al subir a Pro (pago aceptado).
 * Duraciones pensadas para sensación profesional (~2 min). Admin puede saltar.
 */

export type PlanUpgradePrepStepId =
  | 'confirm'
  | 'architecture'
  | 'modules'
  | 'dashboard'
  | 'sync'
  | 'finalize';

export type PlanUpgradePrepStep = {
  id: PlanUpgradePrepStepId;
  title: string;
  detail: string;
  /** Duración de este paso en ms */
  durationMs: number;
};

/** ~2 minutos en total (admin preview; clientes usarán la misma base). */
export const PLAN_UPGRADE_PREP_STEPS: PlanUpgradePrepStep[] = [
  {
    id: 'confirm',
    title: 'Confirmando tu plan Pro',
    detail: 'Validamos el pago y activamos la suscripción en Vertial.',
    durationMs: 12_000,
  },
  {
    id: 'architecture',
    title: 'Preparando la arquitectura del sistema',
    detail: 'Multi-empresa, cupos ampliados y estructura de datos Pro.',
    durationMs: 28_000,
  },
  {
    id: 'modules',
    title: 'Activando módulos Pro',
    detail: 'Finanzas, equipo, chat, alertas y el resto de herramientas incluidas.',
    durationMs: 32_000,
  },
  {
    id: 'dashboard',
    title: 'Configurando el dashboard avanzado',
    detail: 'Gráficas, marcas, ranking y paneles de operativa completa.',
    durationMs: 24_000,
  },
  {
    id: 'sync',
    title: 'Sincronizando permisos y cupos',
    detail: 'Ajustamos menú, plazas de trabajadores y acceso por rol.',
    durationMs: 18_000,
  },
  {
    id: 'finalize',
    title: 'Últimos ajustes',
    detail: 'Casi listo. Estamos cerrando la activación de tu cuenta Pro.',
    durationMs: 10_000,
  },
];

export const PLAN_UPGRADE_PREP_TOTAL_MS = PLAN_UPGRADE_PREP_STEPS.reduce(
  (sum, step) => sum + step.durationMs,
  0,
);

export function formatPrepRemaining(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m} min ${s} s` : `${m} min`;
  }
  return `${sec} s`;
}
