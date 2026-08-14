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

export { DeliverySoldProductMarginPanel } from './DeliverySoldProductMarginPanel';
export {
  buildSoldProductMarginRanking,
  soldMarginPeriodDayKeys,
  type SoldMarginPeriod,
  type SoldMarginRankRow,
  type SoldMarginRankResult,
} from './soldProductMarginRanking';

export {
  DELIVERY_INFORMES_CATALOG,
  DELIVERY_INFORMES_CATEGORIES,
  getInformesByCategory,
  getDeliveryInformeEntry,
  isLiveInformeId,
} from './informes/deliveryInformesCatalog';
export type {
  DeliveryInformeCategoryId,
  DeliveryInformeEntry,
  DeliveryInformeId,
} from './informes/deliveryInformesCatalog';
export {
  DeliveryInformesCatalogView,
  DeliveryInformeSkeletonPanel,
} from './informes/DeliveryInformesCatalogView';
export { DeliveryInformeRunner } from './informes/DeliveryInformeRunner';
export {
  VertialInformeProgress,
  VertialInformeReadyCard,
  downloadCsv,
  downloadXlsx,
  downloadPdf,
  downloadInforme,
} from './informes/VertialInformeProgress';
export type { InformeExportFormat } from './informes/VertialInformeProgress';
export { generateVertialInformePdf, buildInformeKpis } from './informes/vertialInformePdf';
export type { VertialInformePdfMeta } from './informes/vertialInformePdf';
