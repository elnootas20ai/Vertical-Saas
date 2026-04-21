import type { Lead } from '../context/AppContext';

export interface ScoreBreakdown {
  hasEmail: number;
  hasBudget: number;
  hasVehicle: number;
  interactionsBonus: number;
  recencyBonus: number;
  statusProgress: number;
  total: number;
}

const STATUS_SCORE: Record<Lead['status'], number> = {
  new:         5,
  contacted:   15,
  appointment: 25,
  reserved:    35,
  negotiation: 40,
  won:         50,
  lost:        0,
};

/**
 * Calcula el score de un lead (0-100) basado en:
 * - Datos de contacto completos (email, presupuesto, vehículo)
 * - Actividad: número de interacciones registradas
 * - Recencia: cuándo fue el último contacto
 * - Progreso en el pipeline
 */
export function computeLeadScore(lead: Lead): ScoreBreakdown {
  let hasEmail = 0;
  let hasBudget = 0;
  let hasVehicle = 0;
  let interactionsBonus = 0;
  let recencyBonus = 0;
  const statusProgress = STATUS_SCORE[lead.status] ?? 0;

  if (lead.email?.trim()) hasEmail = 10;
  if (lead.budget?.trim()) hasBudget = 10;
  if (lead.vehicleInterest?.trim() || lead.interestedVehicle?.trim()) hasVehicle = 10;

  const interactionsCount = lead.interactions?.length ?? 0;
  interactionsBonus = Math.min(interactionsCount * 5, 20);

  if (lead.lastContact) {
    const daysSinceContact = (Date.now() - new Date(lead.lastContact).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact <= 1) recencyBonus = 10;
    else if (daysSinceContact <= 7) recencyBonus = 7;
    else if (daysSinceContact <= 30) recencyBonus = 3;
  }

  const total = Math.min(
    hasEmail + hasBudget + hasVehicle + interactionsBonus + recencyBonus + statusProgress,
    100,
  );

  return { hasEmail, hasBudget, hasVehicle, interactionsBonus, recencyBonus, statusProgress, total };
}

export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (score >= 40) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-rose-700 bg-rose-50 border-rose-200';
}

export function getScoreLabel(score: number): string {
  if (score >= 70) return 'Caliente';
  if (score >= 40) return 'Tibio';
  return 'Frío';
}
