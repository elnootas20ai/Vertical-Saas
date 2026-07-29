/**
 * API: registrar pago dividido (N llamadas a registerPayment).
 */
import type { DeliveryOrder } from './deliveryApi';
import { registerPaymentRequest } from './deliveryApi';
import { normalizeTpvPaymentMethod } from './tpvCajaMath';
import {
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
    const method = normalizeTpvPaymentMethod(part.method);
    const amount = roundMoney2(part.amount);
    if (amount <= 0) continue;
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
