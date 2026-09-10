/**
 * Holding (grupo empresarial): contenedor de dirección multi-empresa.
 * No es un businessType; reutiliza Groups + alcance de invite.
 */

export type InviteAccessScope = 'single' | 'holding' | 'account';

export const INVITE_ACCESS_SCOPE_LABELS: Record<InviteAccessScope, string> = {
  single: 'Solo 1 empresa',
  holding: 'Solo esta holding',
  account: 'Todo (cuenta)',
};

export const INVITE_ACCESS_SCOPE_HINTS: Record<InviteAccessScope, string> = {
  single: 'Acceso solo a la empresa seleccionada.',
  holding: 'Ve y entra en las empresas vinculadas a la holding. Si añades o quitas empresas del grupo, su acceso se actualiza.',
  account: 'Todas las empresas de tu cuenta. No incluye facturación ni crear empresas.',
};

export function normalizeInviteAccessScope(raw: unknown): InviteAccessScope {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'holding' || v === 'group') return 'holding';
  if (v === 'account' || v === 'all' || v === 'todo') return 'account';
  return 'single';
}

/** Holding visible: plan multi-empresa (Pro / cupo). No hace falta tener ya 2 empresas para ver el menú. */
export function canUseHoldingModule(opts: {
  businessCount: number;
  maxBusinesses: number;
  isWorker?: boolean;
}): boolean {
  if (opts.isWorker) return false;
  return opts.maxBusinesses > 1;
}

/** Holding “lista” para operar (vincular / consolidado útil): ≥2 empresas en la cuenta. */
export function holdingHasMultiBusinessPortfolio(businessCount: number): boolean {
  return businessCount >= 2;
}
