/**
 * API pública del módulo Delivery.
 *
 * Regla: código fuera de delivery que necesite comprobar rutas o tipo delivery
 * debe importar desde aquí, NO desde páginas/lib sueltas.
 *
 * Código nuevo de delivery debe vivir en src/app/verticals/delivery/** y exportarse aquí.
 */

export {
  DELIVERY_MODULE,
  isDeliveryModuleRoute,
} from './module';

export { isDeliveryBusinessType } from '../../lib/deliverySetup';

export {
  buildWorkerPayMonthSummary,
  isTpvWorkerPayTx,
  workerNameFromPayDescription,
  type WorkerPayMonthSummary,
  type WorkerPayMonthRow,
  type WorkerPayRecentItem,
} from './workerPayFromTpv';

export { WorkerPayMonthPanel } from './WorkerPayMonthPanel';

export {
  buildDeliveryOpsInsights,
  isQuickAttentionLostOrder,
  formatMinutesEs,
  unionBusyMinutes,
  peakOverlap,
  resolveDeliveryStores,
  PREP_BASELINE_MIN,
  ORDER_BASELINE_MIN,
  type DeliveryOpsInsights,
  type OpsInsightRange,
  type DeliveryStoreRef,
  type StoreTimingInsights,
} from './deliveryOpsInsights';

export { DeliveryOpsInsightsPanel } from './DeliveryOpsInsightsPanel';

export { DeliveryMobileDashboardBlocks } from './DeliveryMobileDashboardBlocks';
export { DeliveryMobileHomeAlerts } from './DeliveryMobileHomeAlerts';
