import { useEffect, useRef } from 'react';
import type { DeliveryOrder, TpvRegisterSession } from '../lib/deliveryApi';
import { orderInRegisterSession, orderOnOpenTpvOpsBoard } from '../lib/tpvCajaScope';
import { isTpvBoardSoundEnabled, playTpvChannelOrderSound } from '../lib/tpvChannelSounds';

/**
 * Suena al detectar pedidos nuevos de canales externos (web, agregadores).
 * TPV no suena: el operador ya lo acaba de crear.
 */
export function useTpvIncomingOrderSounds(
  orders: DeliveryOrder[],
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'> | null | undefined,
  soundEnabled = isTpvBoardSoundEnabled(),
) {
  const seenRef = useRef<Set<string> | null>(null);
  const sessionKeyRef = useRef('');

  const sessionKey = String(session?.openedAt || '');

  useEffect(() => {
    if (sessionKey !== sessionKeyRef.current) {
      sessionKeyRef.current = sessionKey;
      seenRef.current = null;
    }
  }, [sessionKey]);

  useEffect(() => {
    if (!soundEnabled || !session?.openedAt) return;

    const relevant = orders.filter((o) => orderOnOpenTpvOpsBoard(o, session));

    if (seenRef.current === null) {
      seenRef.current = new Set(relevant.map((o) => o._id));
      return;
    }

    for (const order of relevant) {
      if (seenRef.current.has(order._id)) continue;
      seenRef.current.add(order._id);
      playTpvChannelOrderSound(order.channel);
    }
  }, [orders, session, soundEnabled]);
}
