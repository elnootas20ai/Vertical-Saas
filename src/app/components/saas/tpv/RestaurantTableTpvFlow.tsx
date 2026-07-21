/**
 * Puente compartido: monta el flujo de pedido/cobro de mesa (modo restaurante)
 * sin que `verticals/restaurant` importe directamente `TpvRapidoPage`.
 */
import { Component, type ErrorInfo, type ReactNode, Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import type { DiningOrder } from '../../../lib/salaApi';
import type { RestaurantTpvPermissions } from '../../../lib/restaurantTpvPermissions';

export type RestaurantTableContext = {
  id: string;
  number: number;
  name: string;
  capacity: number;
  roomName?: string;
  isCounter?: boolean;
};

export type RestaurantTableTpvFlowProps = {
  table: RestaurantTableContext;
  order: DiningOrder | null;
  onBack: () => void;
  onOrderChange: (order: DiningOrder) => void;
  onOrderComplete: () => void;
  onTableChange?: (table: RestaurantTableContext, order: DiningOrder) => void;
  permissions?: RestaurantTpvPermissions;
  tabletMode?: boolean;
};

const TpvRapidoOrderFlowLazy = lazy(async () => {
  const mod = await import('../../../pages/saas/TpvRapidoPage');
  return { default: mod.TpvRapidoOrderFlow };
});

class TpvFlowErrorBoundary extends Component<
  { onBack: () => void; children: ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(err: Error) {
    return { error: err?.message || 'Error al abrir el TPV' };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[RestaurantTableTpvFlow]', err, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-stone-50 p-6 text-center dark:bg-stone-950">
          <p className="text-base font-semibold text-stone-900 dark:text-stone-50">
            No se pudo cargar el TPV
          </p>
          <p className="max-w-md text-sm text-stone-500">{this.state.error}</p>
          <button
            type="button"
            onClick={this.props.onBack}
            className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Volver al plano
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RestaurantTableTpvFlow({
  table,
  order,
  onBack,
  onOrderChange,
  onOrderComplete,
  onTableChange,
  permissions,
  tabletMode = true,
}: RestaurantTableTpvFlowProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      <TpvFlowErrorBoundary onBack={onBack}>
        <Suspense
          fallback={(
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
              <p className="text-sm text-stone-500">Cargando TPV…</p>
            </div>
          )}
        >
          <TpvRapidoOrderFlowLazy
            restaurantMode
            embeddedInRestaurantTpv
            tabletMode={tabletMode}
            restaurantTable={table}
            restaurantDiningOrder={order}
            restaurantPermissions={permissions}
            onBack={onBack}
            onRestaurantDiningOrderUpdated={onOrderChange}
            onRestaurantOrderComplete={onOrderComplete}
            onRestaurantTableChange={onTableChange}
          />
        </Suspense>
      </TpvFlowErrorBoundary>
    </div>
  );
}
