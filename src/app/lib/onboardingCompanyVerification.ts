/** Documentos opcionales de verificación de empresa en el onboarding (se guardan en onboardingData). */

export type OnboardingVerificationDocKind =
  | 'cif_nif'
  | 'activity_license'
  | 'company_registry'
  | 'representation'
  | 'other';

export type OnboardingVerificationDocument = {
  id: string;
  kind: OnboardingVerificationDocKind;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  /** data URL (base64) — solo onboarding / cuenta hasta migrar a almacén de documentos */
  dataUrl: string;
};

/** Límite bajo para que onboardingData quepa en la cuenta CouchDB */
export const ONBOARDING_VERIFICATION_MAX_FILES = 2;
export const ONBOARDING_VERIFICATION_MAX_BYTES = 2 * 1024 * 1024;
export const ONBOARDING_VERIFICATION_ACCEPT = '.pdf,image/jpeg,image/png,image/webp';

export const ONBOARDING_VERIFICATION_KINDS: {
  value: OnboardingVerificationDocKind;
  label: string;
  hint: string;
}[] = [
  { value: 'cif_nif', label: 'CIF / NIF / modelo 036', hint: 'Certificado o justificante fiscal' },
  {
    value: 'activity_license',
    label: 'Licencia o IAE',
    hint: 'Licencia de apertura, IAE o actividad',
  },
  {
    value: 'company_registry',
    label: 'Empresa (escrituras)',
    hint: 'Registro mercantil, estatutos, constitución',
  },
  {
    value: 'representation',
    label: 'Representación',
    hint: 'Poderes o DNI del representante',
  },
  { value: 'other', label: 'Otro', hint: 'Cualquier documento que ayude a validar el acceso' },
];

export function labelForVerificationKind(kind: OnboardingVerificationDocKind): string {
  return ONBOARDING_VERIFICATION_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export function formatVerificationFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
