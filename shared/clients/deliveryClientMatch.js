export function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Comparación estricta: exacta o mismos 9 últimos dígitos (móvil ES). */
export function deliveryPhonesMatch(orderPhone, clientPhone) {
  const orderDigits = normalizePhoneDigits(orderPhone);
  const clientDigits = normalizePhoneDigits(clientPhone);
  if (!orderDigits || !clientDigits || clientDigits.length < 9) return false;
  if (orderDigits === clientDigits) return true;
  const minLen = 9;
  if (orderDigits.length >= minLen && clientDigits.length >= minLen) {
    return orderDigits.slice(-minLen) === clientDigits.slice(-minLen);
  }
  return false;
}

export function deliveryOrderMatchesClient(order, clientId, clientPhone) {
  const orderClientId = String(order?.clientId || '').trim();
  const targetClientId = String(clientId || '').trim();
  if (orderClientId) return orderClientId === targetClientId;
  return deliveryPhonesMatch(order?.customerPhone, clientPhone);
}

export function isCancelledDeliveryOrder(order) {
  const status = String(order?.status || '').toLowerCase();
  return status === 'cancelled' || status === 'cancelado' || status === 'devuelto';
}

export function deliveryOrderRevenue(order) {
  return Number(order?.totalAmount || order?.paidAmount || 0);
}
