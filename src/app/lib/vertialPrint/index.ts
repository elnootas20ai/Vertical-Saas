export { printDeliveryTicket, printTestTicket } from './printDeliveryTicket';
export { printTicketDocument } from './printTicketDocument';
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
export { fetchBridgeHealth, fetchBridgePrinters, fetchBridgeNetworkPrinters, fetchBridgePingPrinter } from './printBridgeClient';
export type { BridgeNetworkPrinterInfo } from './printBridgeClient';
export {
  connectionToSetupKind,
  setupKindToConnection,
  evaluatePrinterStatus,
  isAppleMobileDevice,
  isAppleMobileWebBrowser,
} from './printerSetupStatus';
export type { PrinterSetupKind, PrinterStatusSnapshot } from './printerSetupStatus';
export {
  VERTIAL_PRINT_EXE_PATH,
  VERTIAL_PRINT_INSTALL_HINT,
  resolveVertialPrintDownloadUrl,
} from './vertialPrintInstaller';
export { isVertialNativeApp } from './isNativeApp';
export {
  sendNativeEscpos,
  pingNativePrinter,
  pingNativeHost,
  discoverNativeNetworkPrinters,
  identifyNativePrinter,
} from './nativePrintClient';
export type { NativeNetworkPrinterInfo, NativeNetworkPrinterDiscoveryDiagnostics } from './nativePrintClient';
export {
  hasAcknowledgedLocalNetworkPermission,
  hasUserCompletedLanPermissionFlow,
  markLanPermissionFlowCompleted,
  acknowledgeLocalNetworkPermission,
  resetLocalNetworkPermissionAck,
  rerequestNativeLocalNetworkPermission,
  requestNativeLocalNetworkAccess,
  completeLocalNetworkPermissionFlow,
  ensureNativeLocalNetworkReady,
  isLocalNetworkFlowReady,
  markLocalNetworkReady,
  dispatchNativeLocalNetworkPermissionPrompt,
  dispatchLocalNetworkPermissionAttempted,
  openNativeAppSettings,
  buildLanProbeHosts,
  buildPrinterDiscoveryHelpMessage,
  LAN_PERMISSION_ATTEMPTED_EVENT,
  LAN_PERMISSION_MODAL_EVENT,
} from './localNetworkPermission';
export type { LocalNetworkPermissionFlowResult } from './localNetworkPermission';
export { getNativeLocalNetworkInfo, getEscposPlugin } from './escposPlugin';
export type { NativeLocalNetworkInfo } from './escposPlugin';
export {
  shouldUseEposPrint,
  checkEposConnection,
  sendEposTicket,
  sendEposTestTicket,
} from './eposPrintClient';
export {
  IMPRESORA_SETTINGS_PATH,
  NATIVE_PRINTER_NOT_CONFIGURED_MESSAGE,
  NATIVE_PRINTER_PERMISSION_HINT,
  NATIVE_PRINTER_PRINT_FAILED_MESSAGE,
  resolveNativePrinterForPrint,
  prepareNativePrinterForPrint,
} from './nativePrinterFlow';
export type { NativePrinterPrepareResult } from './nativePrinterFlow';
export {
  loadNativePrinterDiagnostics,
  readNativePrinterDiagnosticsSync,
  readPrinterVerifiedHost,
  writePrinterVerifiedHost,
  clearPrinterVerifiedHost,
} from './nativePrinterDiagnostics';
export type { NativePrinterDiagnostics } from './nativePrinterDiagnostics';
