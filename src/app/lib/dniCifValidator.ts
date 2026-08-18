// ─── Validación real de DNI, NIE y CIF españoles ────────────────────────────
//
// Algoritmos oficiales según la normativa española.

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Quita espacios, guiones y puntos; pasa a mayúsculas. */
export function normalizeSpanishTaxId(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s.\-/]/g, '');
}

// ─── DNI ─────────────────────────────────────────────────────────────────────
// Formato: 8 dígitos + 1 letra de control (excluye I, Ñ, O, U)

export function validateDni(value: string): boolean {
  const v = normalizeSpanishTaxId(value);
  const match = v.match(/^(\d{8})([A-Z])$/);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return DNI_LETTERS[num % 23] === match[2];
}

// ─── NIE ─────────────────────────────────────────────────────────────────────
// Formato: X/Y/Z + 7 dígitos + 1 letra de control

export function validateNie(value: string): boolean {
  const v = normalizeSpanishTaxId(value);
  const match = v.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!match) return false;
  const prefix = { X: '0', Y: '1', Z: '2' }[match[1] as 'X' | 'Y' | 'Z'];
  const num = parseInt(prefix + match[2], 10);
  return DNI_LETTERS[num % 23] === match[3];
}

// ─── DNI o NIE ───────────────────────────────────────────────────────────────

export function validateDniOrNie(value: string): boolean {
  return validateDni(value) || validateNie(value);
}

// ─── CIF ─────────────────────────────────────────────────────────────────────
// Formato: 1 letra tipo organización + 7 dígitos + 1 carácter de control
//
// Tipos de organización: A-W (excepto I, Ñ, O, U)
//   K, P, Q, S → control siempre letra
//   A, B, E, H → control siempre dígito
//   resto      → control letra o dígito

const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

export function validateCif(value: string): boolean {
  const v = normalizeSpanishTaxId(value);
  const match = v.match(/^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (!match) return false;

  const orgLetter = match[1];
  const digits = match[2];
  const control = match[3];

  let oddSum = 0;
  let evenSum = 0;

  for (let i = 0; i < 7; i++) {
    const d = parseInt(digits[i], 10);
    if (i % 2 === 0) {
      // Posiciones impares (1,3,5,7): multiplicar por 2 y sumar dígitos
      const doubled = d * 2;
      oddSum += doubled >= 10 ? doubled - 9 : doubled;
    } else {
      // Posiciones pares (2,4,6): sumar directamente
      evenSum += d;
    }
  }

  const total = oddSum + evenSum;
  const controlDigit = (10 - (total % 10)) % 10;
  const controlLetter = CIF_CONTROL_LETTERS[controlDigit];

  const lettersOnly = 'KPQS';
  const digitsOnly = 'ABEH';

  if (lettersOnly.includes(orgLetter)) {
    return control === controlLetter;
  } else if (digitsOnly.includes(orgLetter)) {
    return control === String(controlDigit);
  }
  return control === controlLetter || control === String(controlDigit);
}

// ─── NIF genérico (DNI, NIE o CIF) ───────────────────────────────────────────

export function validateNifOrCif(value: string): boolean {
  return validateDniOrNie(value) || validateCif(value);
}

// ─── Mensajes de error ────────────────────────────────────────────────────────

export function getDniError(value: string): string | null {
  if (!normalizeSpanishTaxId(value)) return null;
  return validateDni(value) ? null : 'DNI no válido (formato: 8 dígitos + letra, ej: 12345678Z)';
}

export function getNieError(value: string): string | null {
  if (!normalizeSpanishTaxId(value)) return null;
  return validateNie(value) ? null : 'NIE no válido (formato: X/Y/Z + 7 dígitos + letra, ej: X1234567L)';
}

export function getDniOrNieError(value: string): string | null {
  if (!normalizeSpanishTaxId(value)) return null;
  return validateDniOrNie(value) ? null : 'DNI/NIE no válido. Comprueba el número y la letra de control';
}

export function getCifError(value: string): string | null {
  if (!normalizeSpanishTaxId(value)) return null;
  return validateCif(value) ? null : 'CIF no válido (formato: letra + 7 dígitos + control, ej: B12345678)';
}

export function getNifOrCifError(value: string): string | null {
  if (!normalizeSpanishTaxId(value)) return null;
  return validateNifOrCif(value) ? null : 'NIF/CIF no válido. Comprueba el número y el dígito de control';
}

/** Longitud típica DNI / NIE / CIF español (sin contar guiones). */
export const SPANISH_TAX_ID_FULL_LENGTH = 9;

/**
 * Para validación en vivo al escribir: no marcamos error hasta tener
 * 9 caracteres (formato completo). Así no bloquea la captura letra a letra.
 */
export function getNifOrCifErrorWhileTyping(value: string): string | null {
  const v = normalizeSpanishTaxId(value);
  if (!v) return null;
  if (v.length < SPANISH_TAX_ID_FULL_LENGTH) return null;
  return getNifOrCifError(v);
}

export function getDniOrNieErrorWhileTyping(value: string): string | null {
  const v = normalizeSpanishTaxId(value);
  if (!v) return null;
  if (v.length < SPANISH_TAX_ID_FULL_LENGTH) return null;
  return getDniOrNieError(v);
}

export function getCifErrorWhileTyping(value: string): string | null {
  const v = normalizeSpanishTaxId(value);
  if (!v) return null;
  if (v.length < SPANISH_TAX_ID_FULL_LENGTH) return null;
  return getCifError(v);
}
