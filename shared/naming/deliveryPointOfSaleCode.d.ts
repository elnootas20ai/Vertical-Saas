/** Tipos para importar `deliveryPointOfSaleCode.js` desde TypeScript (Vite). */

export function derivePdvCodePrefix(displayName: string): string;

export function suggestNextPdvCode(
  displayName: string,
  existingCodes: readonly string[],
): string;

export function stripPdvDisplayNameBase(displayName: string): string;

export function suggestNextPdvDisplayName(
  displayName: string,
  existingNames: readonly string[],
  existingCodes: readonly string[],
  explicitCode?: string,
): string;
