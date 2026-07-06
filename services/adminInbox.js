/**
 * Buzón único de alertas operativas (registros, bugs, infra, afiliados).
 * Prioridad: ALERTS_ADMIN_EMAIL → BUG_REPORT_EMAIL → AFFILIATE_EMAIL → DEFAULT_CONTACT_EMAIL
 */
export function getAdminInbox() {
  return (
    process.env.ALERTS_ADMIN_EMAIL ||
    process.env.BUG_REPORT_EMAIL ||
    process.env.AFFILIATE_EMAIL ||
    process.env.DEFAULT_CONTACT_EMAIL ||
    ''
  )
    .toString()
    .trim();
}

/** Solicitudes de afiliados: AFFILIATE_EMAIL explícito o buzón admin. */
export function getAffiliateAdminInbox() {
  return (
    process.env.AFFILIATE_EMAIL ||
    process.env.ALERTS_ADMIN_EMAIL ||
    process.env.DEFAULT_CONTACT_EMAIL ||
    ''
  )
    .toString()
    .trim();
}
