/** Tipos para importar `deliveryPointOfSaleCode.js` desde TypeScript (Vite). */

export function derivePdvCodePrefix(displayName: string): string;

export function suggestNextPdvCode(
  displayName: string,
  existingCodes: readonly string[],
): string;
