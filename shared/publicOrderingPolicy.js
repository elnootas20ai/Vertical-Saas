const POLICIES = {
  restaurant: {
    mode: 'restaurant_hybrid',
    webTargetKind: 'restaurant_takeaway',
    qrTargetKind: 'restaurant_table',
    allowedOrderTypes: ['pickup', 'delivery'],
    supportsTableQr: true,
  },
  delivery: {
    mode: 'delivery_web',
    webTargetKind: 'delivery_ops',
    allowedOrderTypes: ['pickup', 'delivery'],
  },
  icecreamshop: {
    mode: 'delivery_web',
    webTargetKind: 'delivery_ops',
    allowedOrderTypes: ['pickup', 'delivery'],
  },
  butchershop: {
    mode: 'store_web',
    webTargetKind: 'butcher_ops',
    allowedOrderTypes: ['pickup', 'delivery'],
  },
  butcher: {
    mode: 'store_web',
    webTargetKind: 'butcher_ops',
    allowedOrderTypes: ['pickup', 'delivery'],
  },
  retail: {
    mode: 'store_web',
    webTargetKind: 'retail_ops',
    allowedOrderTypes: ['pickup', 'delivery'],
  },
  shop: {
    mode: 'store_web',
    webTargetKind: 'retail_ops',
    allowedOrderTypes: ['pickup', 'delivery'],
  },
  store: {
    mode: 'store_web',
    webTargetKind: 'retail_ops',
    allowedOrderTypes: ['pickup', 'delivery'],
  },
  retailstore: {
    mode: 'store_web',
    webTargetKind: 'retail_ops',
    allowedOrderTypes: ['pickup', 'delivery'],
  },
};

export function resolvePublicOrderingPolicy(businessType, orderContext = {}) {
  const vertical = String(businessType || '').trim().toLowerCase();
  const definition = POLICIES[vertical];
  if (!definition) {
    return {
      vertical,
      supported: false,
      mode: 'unsupported',
      sourceChannel: 'public_web',
      targetKind: '',
      requiresMesaQr: false,
      supportsTableQr: false,
      allowedOrderTypes: [],
    };
  }
  const isMesaQr = Boolean(orderContext?.mesaToken);
  return {
    vertical,
    supported: true,
    ...definition,
    sourceChannel: isMesaQr ? 'restaurant_qr' : 'public_web',
    targetKind: isMesaQr ? definition.qrTargetKind : definition.webTargetKind,
    requiresMesaQr: false,
    supportsTableQr: Boolean(definition.supportsTableQr),
  };
}
