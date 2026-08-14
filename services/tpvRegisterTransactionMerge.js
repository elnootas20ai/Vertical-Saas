/** Tipos de movimiento de efectivo que se pueden anular (no ventas). */
export const TPV_REMOVABLE_CASH_TX_TYPES = new Set(['cash_in', 'cash_out', 'return', 'expense']);

function txOrderId(t) {
  return String(t?.orderId || t?.linkedDeliveryOrderId || '').trim();
}

/**
 * Une transacciones de sesión TPV por id.
 * `removedIds`: anula entradas/salidas/devoluciones (nunca ventas sueltas).
 * `purgedSaleTxIds` / `purgedOrderSaleIds`: ventas quitadas al cancelar pedido;
 *   no se pueden resucitar desde un sync local viejo de la tablet.
 */
export function mergeTpvRegisterTransactions(
  existingTxs,
  incomingTxs,
  removedIds = [],
  opts = {},
) {
  const existing = Array.isArray(existingTxs) ? existingTxs : [];
  const incoming = Array.isArray(incomingTxs) ? incomingTxs : [];
  const purgedTx = new Set(
    (Array.isArray(opts.purgedSaleTxIds) ? opts.purgedSaleTxIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const purgedOrders = new Set(
    (Array.isArray(opts.purgedOrderSaleIds) ? opts.purgedOrderSaleIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );

  const isPurgedSale = (t) => {
    if (!t || String(t.type || '') !== 'sale') return false;
    const id = String(t.id || '').trim();
    if (id && purgedTx.has(id)) return true;
    const oid = txOrderId(t);
    return Boolean(oid && purgedOrders.has(oid));
  };

  const byId = new Map();
  for (const t of existing) {
    if (!t?.id || isPurgedSale(t)) continue;
    byId.set(t.id, t);
  }
  for (const t of incoming) {
    if (!t?.id || isPurgedSale(t)) continue;
    byId.set(t.id, t);
  }
  const removeSet = new Set(
    (Array.isArray(removedIds) ? removedIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  for (const id of removeSet) {
    const tx = byId.get(id);
    if (!tx) continue;
    if (TPV_REMOVABLE_CASH_TX_TYPES.has(String(tx.type || ''))) {
      byId.delete(id);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ta = new Date(a.date || 0).getTime();
    const tb = new Date(b.date || 0).getTime();
    return ta - tb;
  });
}

/** Une listas de ids purgados (cancelaciones). */
export function unionPurgedIds(...lists) {
  const out = new Set();
  for (const list of lists) {
    for (const id of Array.isArray(list) ? list : []) {
      const v = String(id || '').trim();
      if (v) out.add(v);
    }
  }
  return [...out];
}
