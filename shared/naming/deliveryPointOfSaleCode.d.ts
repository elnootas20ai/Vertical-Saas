/** Tipos para importar `deliveryPointOfSaleCode.js` desde TypeScript (Vite). */

export const PDV_RETAIL_LIMITS: {
  storeNameMax: number;
  pdvCodeMax: number;
  pdvCodeMin: number;
  addressMax: number;
  cityMax: number;
  postalCodeMax: number;
  phoneMax: number;
  emailMax: number;
  customTypeMax: number;
  notesMax: number;
};

export function clampText(raw: string, maxLen: number): string;

export function sanitizeStoreDisplayName(raw: string): string;

export function validateStoreDisplayName(raw: string): string | null;

export function normalizePdvCodeInput(raw: string): string;

export function sanitizePdvCodeInput(raw: string): string;

export function validatePdvCodeInput(raw: string): string | null;

export function sanitizeRetailTextField(raw: string, maxLen: number): string;

export function sanitizeRetailTextFieldInput(raw: string, maxLen: number): string;

export function truncateStoreLabelForUi(raw: string, maxLen?: number): string;
export function derivePdvCodePrefix(displayName: string): string;

export function suggestNextPdvCode(
  displayName: string,
  existingCodes: readonly string[],
): string;

export function stripPdvDisplayNameBase(displayName: string): string;

export function isPdvCodeAlreadyUsed(
  code: string,
  existingCodes: readonly string[],
  exceptCode?: string,
): boolean;

export function suggestNextPdvDisplayName(
  displayName: string,
  existingNames: readonly string[],
  existingCodes: readonly string[],
  explicitCode?: string,
): string;
