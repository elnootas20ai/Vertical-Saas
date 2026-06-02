/** Campos de ubicación en ficha de cliente (legacy + direcciones del TPV). */
export type ClientLocationSource = {
  address?: string;
  city?: string;
  postalCode?: string;
  addresses?: Array<{
    street?: string;
    city?: string;
    postalCode?: string;
    isPrimary?: boolean;
  }>;
};

export function getPrimaryClientAddress(source: ClientLocationSource) {
  const raw = source.addresses;
  const addrs = Array.isArray(raw) ? raw : [];
  if (!addrs.length) return null;
  return addrs.find((a) => a && typeof a === 'object' && a.isPrimary) || addrs[0];
}

/** Une `address` plano con la dirección principal del TPV (`addresses[].street`). */
export function resolveClientLocationFields(source: ClientLocationSource) {
  const primary = getPrimaryClientAddress(source);
  return {
    address:
      String(source.address || '').trim() || String(primary?.street || '').trim(),
    city: String(source.city || '').trim() || String(primary?.city || '').trim(),
    postalCode:
      String(source.postalCode || '').trim() || String(primary?.postalCode || '').trim(),
  };
}
