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
export { fetchBridgeHealth, fetchBridgePrinters, fetchBridgeNetworkPrinters } from './printBridgeClient';
export type { BridgeNetworkPrinterInfo } from './printBridgeClient';
export {
  connectionToSetupKind,
  setupKindToConnection,
  evaluatePrinterStatus,
  isAppleMobileDevice,
} from './printerSetupStatus';
export type { PrinterSetupKind, PrinterStatusSnapshot } from './printerSetupStatus';
export {
  VERTIAL_PRINT_EXE_PATH,
  VERTIAL_PRINT_INSTALL_HINT,
  resolveVertialPrintDownloadUrl,
} from './vertialPrintInstaller';
export { isVertialNativeApp } from './isNativeApp';
export { sendNativeEscpos, pingNativePrinter, discoverNativeNetworkPrinters } from './nativePrintClient';
export type { NativeNetworkPrinterInfo } from './nativePrintClient';
export {
  shouldUseEposPrint,
  checkEposConnection,
  sendEposTicket,
  sendEposTestTicket,
} from './eposPrintClient';
