import { broadcastToBusiness } from '../sseService.js';

/**
 * Retail genérico conserva `web_order` como encargo operativo hasta el cobro.
 * No crea una venta TPV anticipada: la venta nace cuando el personal cobra/entrega.
 */
export async function acceptRetailPublicOrder(_req, context) {
  const { order, businessId } = context;
  broadcastToBusiness(businessId, 'retail:public_order_accepted', {
    orderId: order._id,
    salesPointId: order.salesPointId || '',
  });
  return { linkedRetailOrderId: order._id };
}
