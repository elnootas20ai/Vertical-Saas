'use strict';
const core = require('@capacitor/core');
const VertialIosBridge = core.registerPlugin('VertialIosBridge', {
  web: () => ({
    openAppSettings: async () => ({ opened: false }),
    requestLocalNetworkAccess: async () => ({ triggered: false }),
  }),
});
exports.VertialIosBridge = VertialIosBridge;
