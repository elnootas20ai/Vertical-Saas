/**
 * API de puntos de venta (caja/PDV) — fachada neutral.
 * El endpoint sigue siendo el compartido de tiendas; compraventa no importa deliveryApi.
 */
export {
  type PointOfSale,
  listPointsOfSaleRequest,
  dedupePointsOfSale,
  ensureTabletCodesForPointsOfSale,
  invalidatePointsOfSaleCache,
} from './deliveryApi';
