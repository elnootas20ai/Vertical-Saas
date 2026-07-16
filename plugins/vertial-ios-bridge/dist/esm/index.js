import { registerPlugin } from '@capacitor/core';

export const VertialIosBridge = registerPlugin('VertialIosBridge', {
  web: () => ({
    openAppSettings: async () => ({ opened: false }),
    requestLocalNetworkAccess: async () => ({ triggered: false }),
  }),
});
