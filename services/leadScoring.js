/**
 * Lead scoring engine — servidor
 * Misma lógica que el frontend (leadScoring.ts) para coherencia.
 * Se llama al crear/actualizar un lead para mantener el score actualizado.
 */

const STATUS_SCORE = {
  new:         5,
  contacted:   15,
  appointment: 25,
  reserved:    35,
  negotiation: 40,
  won:         50,
  lost:        0,
};

/**
 * Calcula el score de un lead (0-100).
 * @param {object} lead - documento CouchDB del lead
 * @returns {{ total: number, breakdown: object }}
 */
export function computeLeadScore(lead) {
  let hasEmail = 0;
  let hasBudget = 0;
  let hasVehicle = 0;
  let interactionsBonus = 0;
  let recencyBonus = 0;
  const statusProgress = STATUS_SCORE[lead.status] ?? 0;

  if (String(lead.email || '').trim()) hasEmail = 10;
  if (String(lead.budget || '').trim()) hasBudget = 10;
  if (String(lead.vehicleInterest || lead.interestedVehicle || '').trim()) hasVehicle = 10;

  const interactionsCount = Array.isArray(lead.interactions) ? lead.interactions.length : 0;
  interactionsBonus = Math.min(interactionsCount * 5, 20);

  if (lead.lastContact) {
    const daysSince = (Date.now() - new Date(lead.lastContact).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 1) recencyBonus = 10;
    else if (daysSince <= 7) recencyBonus = 7;
    else if (daysSince <= 30) recencyBonus = 3;
  }

  const total = Math.min(
    hasEmail + hasBudget + hasVehicle + interactionsBonus + recencyBonus + statusProgress,
    100,
  );

  return {
    total,
    breakdown: { hasEmail, hasBudget, hasVehicle, interactionsBonus, recencyBonus, statusProgress },
  };
}

export function getScoreLabel(score) {
  if (score >= 70) return 'Caliente';
  if (score >= 40) return 'Tibio';
  return 'Frío';
}
