import type { Business } from './businessApi';

/** Misma regla que ClientsPage: filtro por empresa solo en vertical delivery. */
export function resolveClientSearchBusinessId(
  business: Business | null | undefined,
  scopeBusinessId: string | null | undefined,
): string | undefined {
  if (business?.businessType !== 'delivery') return undefined;
  const bid = String(scopeBusinessId || '').replace(/^business:/, '').trim();
  return bid || undefined;
}
