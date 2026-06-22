export function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function deliveryOrderMatchesClient(order, clientId, clientPhone) {
  if (String(order?.clientId || '').trim() === String(clientId || '').trim()) return true;
  const orderPhone = normalizePhoneDigits(order?.customerPhone);
  const clientPhoneDigits = normalizePhoneDigits(clientPhone);
  if (!orderPhone || !clientPhoneDigits || clientPhoneDigits.length < 9) return false;
  return (
    orderPhone === clientPhoneDigits
    || orderPhone.endsWith(clientPhoneDigits)
    || clientPhoneDigits.endsWith(orderPhone)
  );
}

export function isCancelledDeliveryOrder(order) {
  const status = String(order?.status || '').toLowerCase();
  return status === 'cancelled' || status === 'cancelado' || status === 'devuelto';
}

export function deliveryOrderRevenue(order) {
  return Number(order?.totalAmount || order?.paidAmount || 0);
}
