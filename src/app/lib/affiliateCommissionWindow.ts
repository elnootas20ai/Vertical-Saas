/** Espejo tipado del util de backend `utils/affiliateCommissionWindow.js`. */

export const AFFILIATE_COMMISSION_MONTHS_PER_CLIENT = 24;

export function addMonthsIso(start: string | Date | null | undefined, months: number): string | null {
  if (!start) return null;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + Number(months));
  return out.toISOString();
}

export function resolveCommissionEndsAt(contact: {
  payingStartedAt?: string | null;
  commissionEndsAt?: string | null;
}): string | null {
  const explicit = String(contact?.commissionEndsAt || '').trim();
  if (explicit) {
    const t = new Date(explicit);
    if (!Number.isNaN(t.getTime())) return t.toISOString();
  }
  return addMonthsIso(contact?.payingStartedAt, AFFILIATE_COMMISSION_MONTHS_PER_CLIENT);
}

export function countCommissionMonthsForContact(
  commissions: Array<{ type?: string; contactId?: string; deletedAt?: string; status?: string }>,
  contactId: string,
): number {
  const id = String(contactId || '').trim();
  if (!id || !Array.isArray(commissions)) return 0;
  return commissions.filter(
    (c) =>
      c
      && !c.deletedAt
      && c.type === 'affiliate_commission'
      && String(c.contactId || '').trim() === id
      && c.status !== 'cancelled',
  ).length;
}

export function evaluateAffiliateCommissionEligibility(args: {
  contact: {
    _id?: string;
    id?: string;
    payingStartedAt?: string | null;
    commissionEndsAt?: string | null;
    isPaying?: boolean;
    contactName?: string;
  } | null;
  commissions?: Array<{ type?: string; contactId?: string; deletedAt?: string; status?: string }>;
  now?: Date | string;
}): {
  ok: boolean;
  reason?: string;
  endsAt?: string | null;
  monthsUsed?: number;
  monthsMax: number;
} {
  const monthsMax = AFFILIATE_COMMISSION_MONTHS_PER_CLIENT;
  const { contact, commissions = [], now = new Date() } = args;

  if (!contact) {
    return {
      ok: false,
      reason: 'Vincula un cliente referido (contacto) para registrar la comisión dentro de la ventana de 24 meses.',
      monthsMax,
    };
  }

  const start = String(contact.payingStartedAt || '').trim();
  if (!start) {
    return {
      ok: false,
      reason: 'Este cliente aún no tiene primer cobro registrado (marcar como pagando). La ventana de 24 meses empieza en el primer cobro.',
      monthsMax,
    };
  }

  const endsAt = resolveCommissionEndsAt(contact);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (endsAt && nowDate.getTime() >= new Date(endsAt).getTime()) {
    return {
      ok: false,
      reason: `La ventana de comisión de 24 meses para este cliente ya terminó (${new Date(endsAt).toLocaleDateString('es-ES')}).`,
      endsAt,
      monthsUsed: countCommissionMonthsForContact(commissions, String(contact._id || contact.id || '')),
      monthsMax,
    };
  }

  const contactId = String(contact._id || contact.id || '').trim();
  const monthsUsed = countCommissionMonthsForContact(commissions, contactId);
  if (monthsUsed >= monthsMax) {
    return {
      ok: false,
      reason: `Este cliente ya tiene ${monthsUsed} comisiones registradas (máximo ${monthsMax} meses).`,
      endsAt,
      monthsUsed,
      monthsMax,
    };
  }

  return { ok: true, endsAt, monthsUsed, monthsMax };
}
