export interface VertialIosBridgePlugin {
  openAppSettings(): Promise<{ opened: boolean }>;
  requestLocalNetworkAccess(): Promise<{ triggered: boolean }>;
  printEscPos(options: { ip: string; port: number; message: string }): Promise<{ status: string }>;
  pingHost(options: { ip: string; port: number }): Promise<{ online: boolean; rtt?: number }>;
}
export declare const VertialIosBridge: VertialIosBridgePlugin;
