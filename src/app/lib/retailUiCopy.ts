import { isRestaurantBusinessType } from './deliveryOpsTypes';

export type RetailOpsUiCopy = {
  permissionDeliveryModule: string;
  roleDeliveryPermission: string;
  roleDeliveryPermissionDescription: string;
  salesChannelDelivery: string;
  ventasOperativa: string;
  ventasOperativaDelta: string;
  operativaSectionTitle: string;
  revenueInlineSuffix: string;
  ingresosOperativa: string;
  tpvPickTitle: string;
  tpvPickSubtitle: string;
  tpvEmptyStoresTitle: string;
  tpvEmptyStoresBody: string;
  tpvCreateFirstStore: string;
  escandalloUnavailable: string;
  catalogZipReadmeTitle: string;
  catalogZipFilename: string;
  ordersMonthLabel: string;
  deliveredMonthLabel: string;
  activeOrdersLabel: string;
  activeOrdersSub: string;
  deliveredTableLabel: string;
  activeTableLabel: string;
  ordersInlineLabel: string;
  tabletCodeLabel: string;
  storesSectionTitle: string;
  storeCountLabel: string;
  loadingStoresLabel: string;
};

const DELIVERY_OPS_COPY: RetailOpsUiCopy = {
  permissionDeliveryModule: 'Delivery / Pedidos',
  roleDeliveryPermission: 'Delivery',
  roleDeliveryPermissionDescription: 'Pedidos omnicanal, cocina y reparto',
  salesChannelDelivery: 'Delivery propio',
  ventasOperativa: 'Ventas delivery',
  ventasOperativaDelta: 'Δ delivery',
  operativaSectionTitle: 'Operativa delivery y equipo',
  revenueInlineSuffix: 'delivery',
  ingresosOperativa: 'Ingresos delivery',
  tpvPickTitle: 'Elige la tienda',
  tpvPickSubtitle: 'Misma experiencia que la tablet por código. Después abrirás caja en la tienda elegida.',
  tpvEmptyStoresTitle: 'Aún no tienes tiendas',
  tpvEmptyStoresBody:
    'Para usar el TPV necesitas al menos un centro de venta con caja. Créalo en Ajustes y vuelve aquí para abrir turno.',
  tpvCreateFirstStore: 'Crear primera tienda',
  escandalloUnavailable: 'El escandallo automático está disponible en empresas de delivery y bar/restaurante.',
  catalogZipReadmeTitle: 'Ejemplo de ZIP de imagenes para Delivery Catalogo',
  catalogZipFilename: 'ejemplo_zip_delivery_catalogo.zip',
  ordersMonthLabel: 'Pedidos mes',
  deliveredMonthLabel: 'Entregados mes',
  activeOrdersLabel: 'En curso',
  activeOrdersSub: 'Pedidos activos',
  deliveredTableLabel: 'Entregados',
  activeTableLabel: 'En curso',
  ordersInlineLabel: 'pedidos',
  tabletCodeLabel: 'Código de tienda',
  storesSectionTitle: 'Tus tiendas',
  storeCountLabel: 'tienda',
  loadingStoresLabel: 'Cargando tiendas…',
};

const RESTAURANT_OPS_COPY: RetailOpsUiCopy = {
  permissionDeliveryModule: 'Sala y cocina',
  roleDeliveryPermission: 'Sala y cocina',
  roleDeliveryPermissionDescription: 'Comandas, cocina y operativa de sala',
  salesChannelDelivery: 'Servicio en sala',
  ventasOperativa: 'Ventas sala',
  ventasOperativaDelta: 'Δ sala',
  operativaSectionTitle: 'Operativa sala y equipo',
  revenueInlineSuffix: 'sala',
  ingresosOperativa: 'Ingresos sala',
  tpvPickTitle: 'Elige el local',
  tpvPickSubtitle: 'Misma experiencia que la tablet por código. Después abrirás caja en el local elegido.',
  tpvEmptyStoresTitle: 'Aún no tienes locales',
  tpvEmptyStoresBody:
    'Para usar el TPV necesitas al menos un centro de venta con caja. Créalo en Ajustes y vuelve aquí para abrir turno.',
  tpvCreateFirstStore: 'Crear primer local',
  escandalloUnavailable: 'El escandallo automático está disponible en empresas de bar/restaurante.',
  catalogZipReadmeTitle: 'Ejemplo de ZIP de imagenes para Catalogo Restaurante',
  catalogZipFilename: 'ejemplo_zip_restaurante_catalogo.zip',
  ordersMonthLabel: 'Comandas mes',
  deliveredMonthLabel: 'Cobradas mes',
  activeOrdersLabel: 'En sala',
  activeOrdersSub: 'Comandas activas',
  deliveredTableLabel: 'Cobradas',
  activeTableLabel: 'En sala',
  ordersInlineLabel: 'comandas',
  tabletCodeLabel: 'Código del local',
  storesSectionTitle: 'Tus locales',
  storeCountLabel: 'local',
  loadingStoresLabel: 'Cargando locales…',
};

/** Etiquetas visibles según vertical retail (bar/restaurante vs delivery). */
export function getRetailOpsUiCopy(businessType?: string | null): RetailOpsUiCopy {
  return isRestaurantBusinessType(businessType) ? RESTAURANT_OPS_COPY : DELIVERY_OPS_COPY;
}

/** Portfolio o filtro: copy restaurante solo si todas las filas visibles son restaurante. */
export function getRetailOpsUiCopyForRows(
  rows: Array<{ isRestaurant?: boolean }>,
  fallbackBusinessType?: string | null,
): RetailOpsUiCopy {
  if (rows.length > 0 && rows.every((row) => row.isRestaurant)) {
    return RESTAURANT_OPS_COPY;
  }
  if (rows.length === 1 && rows[0]?.isRestaurant) {
    return RESTAURANT_OPS_COPY;
  }
  return getRetailOpsUiCopy(fallbackBusinessType);
}

export const RESTAURANT_DELIVERY_PERMISSION_LABELS: Record<string, { label: string; description: string }> = {
  'delivery.view': { label: 'Ver comandas', description: 'Ver listado de comandas' },
  'delivery.create': { label: 'Crear comandas', description: 'Crear comandas manualmente' },
  'delivery.edit': { label: 'Editar comandas', description: 'Editar datos de una comanda' },
  'delivery.cancel': { label: 'Cancelar comandas', description: 'Cancelar comandas con motivo' },
  'delivery.reopen': { label: 'Reabrir comandas', description: 'Reabrir comandas canceladas o cerradas' },
  'delivery.operate': { label: 'Operar comandas', description: 'Avanzar estado de la comanda' },
  'delivery.payment': { label: 'Registrar cobros', description: 'Registrar cobros en comandas' },
};
