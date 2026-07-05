import type { DiningTableStatus } from './salaApi';

/** Tras abrir / sentar clientes. */
export function tableStatusOnOpen(previous: DiningTableStatus): DiningTableStatus {
  if (previous === 'unavailable' || previous === 'hidden') return previous;
  if (previous === 'reserved') return 'occupied';
  if (previous === 'available') return 'occupied';
  return previous;
}

/** Tras registrar comanda (cuenta abierta, sin cobrar aún). */
export function tableStatusOnOrderAdded(): DiningTableStatus {
  return 'pending_payment';
}

/** Tras cobrar y cerrar cuenta → mesa libre. */
export function tableStatusOnPaid(): DiningTableStatus {
  return 'available';
}

/** Liberar mesa manualmente (clientes se fueron sin cobrar en TPV). */
export function tableStatusOnRelease(): DiningTableStatus {
  return 'available';
}
