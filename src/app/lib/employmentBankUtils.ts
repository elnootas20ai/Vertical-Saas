/** IBAN internacional (ISO 13616): máx. 34 caracteres alfanuméricos. ES = 24. */
export const IBAN_MAX_LENGTH = 34;
export const ES_IBAN_LENGTH = 24;
export const BANK_NAME_MAX_LENGTH = 60;
export const EMERGENCY_CONTACT_MAX_LENGTH = 80;
export const EMERGENCY_PHONE_MAX_LENGTH = 20;

export function normalizeIbanInput(value: string): string {
  return String(value || '')
    .replace(/\s/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, IBAN_MAX_LENGTH);
}

/** Estilo IBAN: misma talla que el resto de campos; barra ancha (usar col-span-2 en grid). */
export const IBAN_INPUT_CLASS = 'w-full font-mono text-sm';

/** Longitud máx. visible IBAN español con espacios: ES00 0000 0000 0000 0000 0000 */
export const IBAN_DISPLAY_MAX_LENGTH = 29;

export function formatIbanInput(value: string): string {
  const clean = normalizeIbanInput(value).slice(0, ES_IBAN_LENGTH);
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

export function normalizeEmergencyPhone(value: string): string {
  return String(value || '')
    .replace(/[^\d+\s()-]/g, '')
    .slice(0, EMERGENCY_PHONE_MAX_LENGTH);
}

export function normalizeEmergencyContact(value: string): string {
  return String(value || '').trim().slice(0, EMERGENCY_CONTACT_MAX_LENGTH);
}

export function isValidEsIban(value: string): boolean {
  const clean = normalizeIbanInput(value);
  if (!clean.startsWith('ES')) return clean.length >= 15;
  return clean.length === ES_IBAN_LENGTH;
}

export function normalizeBankName(value: string): string {
  return String(value || '').trim().slice(0, BANK_NAME_MAX_LENGTH);
}
