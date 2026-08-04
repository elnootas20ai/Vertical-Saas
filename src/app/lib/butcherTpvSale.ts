/** Helpers de cobro TPV carnicería — mapping canónico + cola offline. */

export type ButcherTpvUnitMode = 'kg' | 'gramos' | 'unidades';

export type ButcherTpvTicketLineLike = {
  productoId?: string;
  nombre: string;
  cantidad: number;
  unidad: ButcherTpvUnitMode;
  cantidadKg: number;
  precioUnitario: number;
  subtotal: number;
};

/** Línea canónica para /api/butcher-sales (quantity siempre en kg o ud). */
export function mapButcherTpvLinesToSaleItems(lines: ButcherTpvTicketLineLike[]) {
  return lines.map((l) => {
    const isUnit = l.unidad === 'unidades';
    return {
      productId: l.productoId || undefined,
      productName: l.nombre,
      quantity: isUnit ? Number(l.cantidad) : Number(l.cantidadKg),
      unit: isUnit ? 'ud' : 'kg',
      pricePerUnit: Number(l.precioUnitario),
      subtotal: Number(l.subtotal),
    };
  });
}

export function butcherTpvLinesTotalWeightKg(lines: ButcherTpvTicketLineLike[]) {
  return lines.reduce((s, l) => s + (l.unidad === 'unidades' ? 0 : Number(l.cantidadKg) || 0), 0);
}

export function mapTpvPaymentToButcher(method: 'efectivo' | 'tarjeta' | 'bizum' | string): 'cash' | 'card' | 'bizum' {
  if (method === 'tarjeta') return 'card';
  if (method === 'bizum') return 'bizum';
  return 'cash';
}
