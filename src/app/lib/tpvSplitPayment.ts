/**
 * Pago dividido TPV: varios métodos en un mismo cobro (efectivo + tarjeta…).
 * Core reutilizable — sin hardcode de vertical.
 */
import type { TpvPaymentMethod } from './deliveryApi';
import { normalizeTpvPaymentMethod } from './tpvCajaMath';

export type TpvSplitPaymentPart = {
  id: string;
  method: TpvPaymentMethod;
  amount: number;
  amountReceived?: number;
  changeGiven?: number;
};

export const TPV_SPLIT_METHOD_OPTIONS: Array<{
  value: TpvPaymentMethod;
  label: string;
}> = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'bizum', label: 'Bizum' },
];

export function roundMoney2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function newSplitPartId(): string {
  return `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function sumSplitParts(parts: Array<{ amount: number }>): number {
  return roundMoney2(parts.reduce((s, p) => s + (Number(p.amount) || 0), 0));
}

export function remainingSplitAmount(
  total: number,
  parts: Array<{ amount: number }>,
): number {
  return roundMoney2(Math.max(0, roundMoney2(total) - sumSplitParts(parts)));
}

export function splitPartsAreComplete(
  total: number,
  parts: Array<{ amount: number }>,
): boolean {
  if (!parts.length) return false;
  return Math.abs(sumSplitParts(parts) - roundMoney2(total)) < 0.009;
}

export function validateSplitParts(
  total: number,
  parts: TpvSplitPaymentPart[],
): string | null {
  if (!parts.length) return 'Añade al menos un tramo de pago';
  for (const p of parts) {
    if (!(Number(p.amount) > 0)) return 'Cada tramo debe ser mayor que 0';
    if (p.method === 'efectivo') {
      const received = Number(p.amountReceived);
      if (Number.isFinite(received) && received > 0 && received + 0.001 < p.amount) {
        return 'En efectivo, lo entregado no cubre el tramo';
      }
    }
  }
  if (!splitPartsAreComplete(total, parts)) {
    const left = remainingSplitAmount(total, parts);
    if (left > 0.009) return `Faltan ${left.toFixed(2)} € por asignar`;
    return 'La suma de tramos no coincide con el total';
  }
  return null;
}

export function formatSplitPartsSummary(parts: TpvSplitPaymentPart[]): string {
  return parts
    .map((p) => {
      const label =
        TPV_SPLIT_METHOD_OPTIONS.find((o) => o.value === p.method)?.label
        || normalizeTpvPaymentMethod(p.method);
      return `${label} ${roundMoney2(p.amount).toFixed(2)}€`;
    })
    .join(' + ');
}

/** Línea cobrable 1 a 1 (unidad de artículo o ajuste). */
export type TpvSplitPayLine = {
  lineId: string;
  name: string;
  amount: number;
};

export type TpvItemPayAssignment = {
  lineId: string;
  method: TpvPaymentMethod;
  amount: number;
  amountReceived?: number;
  changeGiven?: number;
};

/** Billetes rápidos para cambio (Exacto + billetes ≥ importe). */
export function cashQuickAmountsFor(lineAmount: number): number[] {
  const amount = roundMoney2(lineAmount);
  if (amount <= 0) return [];
  const exact = Math.ceil(amount * 100) / 100;
  const bills = [5, 10, 20, 50, 100].filter((v) => v >= amount - 0.001);
  return Array.from(new Set([exact, ...bills])).filter((v) => v > 0).slice(0, 6);
}

type SplitPayItemLike = {
  id?: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
};

/** Expande ítems a unidades 1×1 y ajusta la suma al total a cobrar. */
export function buildOrderSplitPayLines(
  items: SplitPayItemLike[] | undefined,
  chargeTotal: number,
): TpvSplitPayLine[] {
  const target = roundMoney2(chargeTotal);
  const lines: TpvSplitPayLine[] = [];
  const list = Array.isArray(items) ? items : [];

  list.forEach((item, idx) => {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const lineTotal = roundMoney2(
      Number(item.total) > 0
        ? Number(item.total)
        : Number(item.unitPrice || 0) * qty,
    );
    if (lineTotal <= 0) return;
    const baseId = String(item.id || `item-${idx}`);
    const name = String(item.name || '').trim() || 'Producto';
    if (qty === 1) {
      lines.push({ lineId: baseId, name, amount: lineTotal });
      return;
    }
    const unit = roundMoney2(lineTotal / qty);
    let assigned = 0;
    for (let i = 0; i < qty; i += 1) {
      const amount =
        i === qty - 1 ? roundMoney2(lineTotal - assigned) : unit;
      assigned = roundMoney2(assigned + amount);
      lines.push({
        lineId: `${baseId}#${i + 1}`,
        name: qty > 1 ? `${name} (${i + 1}/${qty})` : name,
        amount,
      });
    }
  });

  const sum = sumSplitParts(lines);
  const diff = roundMoney2(target - sum);
  if (Math.abs(diff) > 0.009) {
    if (diff > 0) {
      lines.push({
        lineId: 'ajuste-cobro',
        name: 'Ajuste / envío',
        amount: diff,
      });
    } else if (lines.length > 0) {
      // Descuento: restar del último ítem con margen, o línea negativa absorbida en último.
      let left = Math.abs(diff);
      for (let i = lines.length - 1; i >= 0 && left > 0.009; i -= 1) {
        const take = Math.min(lines[i].amount, left);
        lines[i] = {
          ...lines[i],
          amount: roundMoney2(lines[i].amount - take),
        };
        left = roundMoney2(left - take);
      }
      return lines.filter((l) => l.amount > 0.009);
    }
  }
  return lines.filter((l) => l.amount > 0.009);
}

/** Agrupa asignaciones por método → tramos de pago dividido. */
export function itemAssignmentsToSplitParts(
  assignments: TpvItemPayAssignment[],
): TpvSplitPaymentPart[] {
  const byMethod = new Map<
    TpvPaymentMethod,
    { amount: number; received: number; change: number }
  >();
  for (const a of assignments) {
    const method = normalizeTpvPaymentMethod(a.method);
    const amount = roundMoney2(a.amount);
    if (amount <= 0) continue;
    const prev = byMethod.get(method) || { amount: 0, received: 0, change: 0 };
    const received =
      method === 'efectivo'
        ? roundMoney2(
            Number(a.amountReceived) > 0 ? Number(a.amountReceived) : amount,
          )
        : 0;
    const change =
      method === 'efectivo'
        ? roundMoney2(
            Number(a.changeGiven) >= 0
              ? Number(a.changeGiven)
              : Math.max(0, received - amount),
          )
        : 0;
    byMethod.set(method, {
      amount: roundMoney2(prev.amount + amount),
      received: roundMoney2(prev.received + received),
      change: roundMoney2(prev.change + change),
    });
  }
  return Array.from(byMethod.entries()).map(([method, agg]) => ({
    id: newSplitPartId(),
    method,
    amount: agg.amount,
    ...(method === 'efectivo'
      ? { amountReceived: agg.received, changeGiven: agg.change }
      : {}),
  }));
}

export function validateItemPayAssignments(
  chargeTotal: number,
  lines: TpvSplitPayLine[],
  methodByLineId: Record<string, TpvPaymentMethod | undefined>,
): string | null {
  if (!lines.length) return 'No hay artículos para cobrar';
  const missing = lines.filter((l) => !methodByLineId[l.lineId]);
  if (missing.length) {
    return `Falta método en ${missing.length} artículo${missing.length === 1 ? '' : 's'}`;
  }
  const assignments: TpvItemPayAssignment[] = lines.map((l) => ({
    lineId: l.lineId,
    method: methodByLineId[l.lineId]!,
    amount: l.amount,
  }));
  return validateSplitParts(chargeTotal, itemAssignmentsToSplitParts(assignments));
}
