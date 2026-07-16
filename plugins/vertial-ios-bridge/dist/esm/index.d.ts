export interface VertialIosBridgePlugin {
  openAppSettings(): Promise<{ opened: boolean }>;
  requestLocalNetworkAccess(): Promise<{ triggered: boolean }>;
}
export declare const VertialIosBridge: VertialIosBridgePlugin;
