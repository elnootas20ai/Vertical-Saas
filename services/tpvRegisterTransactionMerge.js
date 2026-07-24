/** Tipos de movimiento de efectivo que se pueden anular (no ventas). */
export const TPV_REMOVABLE_CASH_TX_TYPES = new Set(['cash_in', 'cash_out', 'return', 'expense']);

/**
 * Une transacciones de sesión TPV por id.
 * `removedIds`: anula entradas/salidas/devoluciones (nunca ventas).
 */
export function mergeTpvRegisterTransactions(existingTxs, incomingTxs, removedIds = []) {
  const existing = Array.isArray(existingTxs) ? existingTxs : [];
  const incoming = Array.isArray(incomingTxs) ? incomingTxs : [];
  const byId = new Map();
  for (const t of existing) {
    if (t && t.id) byId.set(t.id, t);
  }
  for (const t of incoming) {
    if (t && t.id) byId.set(t.id, t);
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
