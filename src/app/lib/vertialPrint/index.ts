export { printDeliveryTicket, printTestTicket } from './printDeliveryTicket';
export type { PrintDeliveryTicketResult } from './printDeliveryTicket';
export {
  DEFAULT_PRINTER_CONFIG,
  VERTIAL_PRINT_BRIDGE_URL,
  resolveBridgeUrl,
  loadLegacyPrinterConfig,
  saveLegacyPrinterConfig,
  loadPdvPrinterCache,
  cachePdvPrinterConfig,
} from './printerConfig';
export type { VertialPrinterConfig, VertialPrinterConnectionType } from './printerConfig';
export {
  loadPrinterConfig,
  savePrinterConfig,
  resolveEffectivePrinterConfig,
  setActivePrinterScope,
  clearActivePrinterScope,
  getActivePrinterScope,
} from './printerActiveScope';
export type { ActivePrinterScope } from './printerActiveScope';
export { savePrinterConfigToPdv } from './printerPdvSync';
export type { PrinterConfigTarget } from './printerPdvSync';
export {
  normalizeVertialPrinterConfig,
  isVertialPrinterConfigConfigured,
  printerLabelFromConfig,
} from './printerConfigNormalize';
export { fetchBridgeHealth, fetchBridgePrinters } from './printBridgeClient';
export {
  connectionToSetupKind,
  setupKindToConnection,
  evaluatePrinterStatus,
  isAppleMobileDevice,
} from './printerSetupStatus';
export type { PrinterSetupKind, PrinterStatusSnapshot } from './printerSetupStatus';
