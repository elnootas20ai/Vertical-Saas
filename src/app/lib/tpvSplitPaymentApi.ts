/**
 * API: registrar pago dividido (N llamadas a registerPayment).
 * Para entre tramos si el pedido ya está cubierto (evita doble cobro en caja).
 */
import type { DeliveryOrder } from './deliveryApi';
import { registerPaymentRequest } from './deliveryApi';
import { normalizeTpvPaymentMethod } from './tpvCajaMath';
import { orderAlreadyCobrado } from './tpvCajaScope';
import {
  orderPaymentRemaining,
  roundMoney2,
  type TpvSplitPaymentPart,
} from './tpvSplitPayment';

export async function registerSplitPaymentsRequest(
  userId: string,
  orderId: string,
  parts: TpvSplitPaymentPart[],
): Promise<DeliveryOrder> {
  let last: DeliveryOrder | null = null;
  for (const part of parts) {
    if (last && orderAlreadyCobrado(last)) {
      throw new Error('Este pedido ya está cobrado. No se puede registrar otro pago.');
    }
    const method = normalizeTpvPaymentMethod(part.method);
    let amount = roundMoney2(part.amount);
    if (amount <= 0) continue;
    if (last) {
      const rem = orderPaymentRemaining(last);
      if (rem <= 0.009) {
        throw new Error('Este pedido ya está cobrado. No se puede registrar otro pago.');
      }
      if (amount > rem + 0.009) {
        throw new Error(
          `El cobro (${amount.toFixed(2)} €) supera lo pendiente (${rem.toFixed(2)} €).`,
        );
      }
      amount = roundMoney2(Math.min(amount, rem));
    }
    const cash =
      method === 'efectivo'
        ? {
            amountReceived: roundMoney2(
              Number(part.amountReceived) > 0 ? Number(part.amountReceived) : amount,
            ),
            changeGiven: roundMoney2(
              Number(part.changeGiven) >= 0
                ? Number(part.changeGiven)
                : Math.max(
                    0,
                    roundMoney2(
                      (Number(part.amountReceived) > 0 ? Number(part.amountReceived) : amount)
                        - amount,
                    ),
                  ),
            ),
          }
        : undefined;
    last = await registerPaymentRequest(userId, orderId, method, amount, cash);
  }
  if (!last) throw new Error('No se pudo registrar el pago dividido');
  return last;
}
