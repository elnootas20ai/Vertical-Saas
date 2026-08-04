export const COMPRAVENTA_TIENDA_SETTINGS_PATH = '/saas/settings/tienda?action=new-pdv';

/** Ítems del menú comercial/operativo que exigen expositor + PDV. */
export const COMPRAVENTA_SIDEBAR_REQUIRES_STORE = new Set([
  'compraventa-hub',
  'compraventa-vehiculos',
  'entrada-vehiculo',
  'compraventa-compras',
  'compraventa-ventas',
  'compraventa-tasaciones',
  'compraventa-entregas',
  'compraventa-crm',
  'compraventa-fiscal',
  'publicacion-venta',
  'gastos-preparacion',
  'vehicles',
  'sales',
  'clients',
  'quotes',
]);

export function getCompraventaSidebarItemLock(
  itemId: string,
  flags: { storeReady: boolean },
): { disabled: boolean; title?: string } {
  if (!COMPRAVENTA_SIDEBAR_REQUIRES_STORE.has(itemId)) {
    return { disabled: false };
  }
  if (flags.storeReady) {
    return { disabled: false };
  }
  return {
    disabled: true,
    title: 'Primero crea tu expositor y PDV en Ajustes → Tienda.',
  };
}
