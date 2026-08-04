/** Export CSV de cierre Z / arqueo TPV carnicería (sesión de caja). */

import type { TpvRegisterSession } from './deliveryApi';

function esc(v: string | number) {
  const s = String(v ?? '');
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function money(n: number) {
  return (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
}

/** Genera CSV del cierre (o sesión abierta) para descarga. */
export function buildButcherCajaZCsv(session: TpvRegisterSession, opts?: { businessName?: string }): string {
  const txs = Array.isArray(session.transactions) ? session.transactions : [];
  const sales = txs.filter((t) => t.type === 'sale');
  const returns = txs.filter((t) => t.type === 'return');
  const byMethod: Record<string, number> = {};
  for (const t of sales) {
    const k = String(t.paymentMethod || 'otro');
    byMethod[k] = (byMethod[k] || 0) + Number(t.amount || 0);
  }
  for (const t of returns) {
    const k = String(t.paymentMethod || 'otro');
    byMethod[k] = (byMethod[k] || 0) - Number(t.amount || 0);
  }

  const lines: string[] = [];
  lines.push(['Informe', 'Cierre Z carnicería'].map(esc).join(';'));
  lines.push(['Negocio', opts?.businessName || ''].map(esc).join(';'));
  lines.push(['PDV', session.pointOfSaleName || session.pointOfSaleId || ''].map(esc).join(';'));
  lines.push(['Sesión', session._id || ''].map(esc).join(';'));
  lines.push(['Apertura', session.openedAt || ''].map(esc).join(';'));
  lines.push(['Cierre', session.closedAt || '(abierta)'].map(esc).join(';'));
  lines.push(['Estado', session.status || ''].map(esc).join(';'));
  lines.push('');
  lines.push(['Concepto', 'Importe EUR'].map(esc).join(';'));
  lines.push(['Efectivo esperado', money(session.expectedCash ?? 0)].map(esc).join(';'));
  if (session.closingCashCount) {
    lines.push(['Efectivo contado', money(session.closingCashCount.actualCash ?? 0)].map(esc).join(';'));
    lines.push(['Diferencia', money(session.difference ?? session.closingCashCount.difference ?? 0)].map(esc).join(';'));
  }
  lines.push(['Total ventas (sesion)', money(sales.reduce((s, t) => s + Number(t.amount || 0), 0))].map(esc).join(';'));
  lines.push(['Devoluciones', money(returns.reduce((s, t) => s + Number(t.amount || 0), 0))].map(esc).join(';'));
  lines.push('');
  lines.push(['Método', 'Importe EUR'].map(esc).join(';'));
  for (const [k, v] of Object.entries(byMethod)) {
    lines.push([k, money(v)].map(esc).join(';'));
  }
  lines.push('');
  lines.push(['Hora', 'Tipo', 'Método', 'Importe', 'Descripción'].map(esc).join(';'));
  for (const t of txs) {
    lines.push([
      t.date || '',
      t.type || '',
      t.paymentMethod || '',
      money(t.amount),
      t.description || t.orderNumber || '',
    ].map(esc).join(';'));
  }
  return `${lines.join('\n')}\n`;
}

export function downloadButcherCajaZCsv(session: TpvRegisterSession, opts?: { businessName?: string; filename?: string }) {
  const csv = buildButcherCajaZCsv(session, opts);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const day = String(session.closedAt || session.openedAt || new Date().toISOString()).slice(0, 10);
  a.href = url;
  a.download = opts?.filename || `cierre-z-carniceria-${day}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
