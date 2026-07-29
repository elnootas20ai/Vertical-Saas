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
