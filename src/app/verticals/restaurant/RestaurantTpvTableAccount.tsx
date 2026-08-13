/**
 * Cuenta de mesa / mostrador en el TPV sala: monta la carta y el cobro.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { DiningOrder, DiningTable } from '../../lib/salaApi';
import { loadOpenDiningOrderForTable } from '../../lib/restaurantDiningTpv';
import { resolveRestaurantTpvPermissions } from '../../lib/restaurantTpvPermissions';
import {
  RestaurantTableTpvFlow,
  type RestaurantTableContext,
} from '../../components/saas/tpv/RestaurantTableTpvFlow';
import {
  useTpvRegisterIfOpen,
  type TpvRegisterContextType,
} from '../../components/saas/TpvRegisterGate';
import { isTpvRegisterSessionOpen } from '../../lib/deliveryApi';
import { resolveTableCapacity } from './tableCapacity';

export const RESTAURANT_COUNTER_TABLE_ID = '__restaurant_counter__';

type Props = {
  userId: string;
  table: DiningTable | RestaurantTableContext;
  order: DiningOrder | null;
  onBack: () => void;
  onOrderChange: (order: DiningOrder) => void;
  onTableChange?: (table: DiningTable | RestaurantTableContext, order: DiningOrder) => void;
  tabletMode?: boolean;
  /** Abrir en carta o directamente en cobro. */
  openIntent?: 'order' | 'pay';
  /**
   * Caja abierta capturada fuera del portal (FloorBoard).
   * El portal a body no debe depender solo del Context (parpadeos → «Abre la caja» al cobrar).
   */
  registerOverride?: TpvRegisterContextType | null;
};

function isDiningTable(table: DiningTable | RestaurantTableContext): table is DiningTable {
  return '_id' in table || ('type' in table && (table as DiningTable).type === 'dining_table');
}

function toRestaurantTableContext(table: DiningTable | RestaurantTableContext): RestaurantTableContext {
  if (!isDiningTable(table) && 'isCounter' in table) {
    return table as RestaurantTableContext;
  }
  const t = table as DiningTable;
  return {
    id: String(t._id || t.id || '').trim(),
    number: Number(t.number) || 0,
    name: t.name || `Mesa ${t.number}`,
    capacity: resolveTableCapacity(t),
    roomName: t.zone || undefined,
    isCounter: false,
  };
}

export function buildCounterTableContext(): RestaurantTableContext {
  return {
    id: RESTAURANT_COUNTER_TABLE_ID,
    number: 0,
    name: 'Mostrador',
    capacity: 1,
    isCounter: true,
  };
}

export function RestaurantTpvTableAccount({
  userId,
  table,
  order,
  onBack,
  onOrderChange,
  onTableChange,
  tabletMode = true,
  openIntent = 'order',
  registerOverride: registerOverrideProp = null,
}: Props) {
  const { user } = useAuth();
  const registerFromGate = useTpvRegisterIfOpen();
  const liveRegister =
    (registerOverrideProp && isTpvRegisterSessionOpen(registerOverrideProp.session)
      ? registerOverrideProp
      : null)
    || (registerFromGate && isTpvRegisterSessionOpen(registerFromGate.session) ? registerFromGate : null);
  const registerStickyRef = useRef<TpvRegisterContextType | null>(liveRegister);
  if (liveRegister) {
    registerStickyRef.current = liveRegister;
  } else if (
    registerStickyRef.current
    && !isTpvRegisterSessionOpen(registerStickyRef.current.session)
  ) {
    registerStickyRef.current = null;
  }
  const registerOverride =
    liveRegister
    || (
      registerStickyRef.current && isTpvRegisterSessionOpen(registerStickyRef.current.session)
        ? registerStickyRef.current
        : null
    );
  const [refreshing, setRefreshing] = useState(false);
  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;

  const restaurantTable = useMemo(() => toRestaurantTableContext(table), [table]);
  const tableId = restaurantTable.id;
  const permissions = useMemo(() => resolveRestaurantTpvPermissions(user), [user]);

  useEffect(() => {
    let cancelled = false;
    if (!userId || !tableId) return;
    setRefreshing(true);
    void loadOpenDiningOrderForTable(userId, tableId)
      .then((fresh) => {
        if (!cancelled && fresh) onOrderChangeRef.current(fresh);
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tableId]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {refreshing ? (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full bg-white/90 p-1.5 shadow dark:bg-stone-900/90">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" />
        </div>
      ) : null}
      <RestaurantTableTpvFlow
        table={restaurantTable}
        order={order}
        tabletMode={tabletMode}
        openIntent={openIntent}
        permissions={permissions}
        registerOverride={registerOverride}
        onBack={onBack}
        onOrderChange={onOrderChange}
        onOrderComplete={onBack}
        onTableChange={(nextCtx, nextOrder) => {
          if (!onTableChange) {
            onOrderChange(nextOrder);
            return;
          }
          if (nextCtx.isCounter) {
            onTableChange(nextCtx, nextOrder);
            return;
          }
          if (isDiningTable(table)) {
            onTableChange(
              {
                ...table,
                _id: nextCtx.id,
                id: nextCtx.id,
                number: nextCtx.number,
                name: nextCtx.name,
                capacity: nextCtx.capacity,
                zone: nextCtx.roomName || table.zone,
              },
              nextOrder,
            );
            return;
          }
          onTableChange(nextCtx, nextOrder);
        }}
      />
    </div>
  );
}
