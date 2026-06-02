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

/** Revisión interna Vertial (panel superadmin). */
export type CompanyVerificationReviewStatus = 'pending' | 'approved' | 'rejected';

export type CompanyVerificationReview = {
  status: CompanyVerificationReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
};

export type CompanyVerificationSnapshot = {
  documents: OnboardingVerificationDocument[];
  note: string;
  taxId: string;
  tradeName: string;
  legalName: string;
  businessType: string;
  review: CompanyVerificationReview | null;
  /** Sin docs */
  hasDocuments: boolean;
  /** Docs subidos y aún sin aprobar/rechazar */
  needsReview: boolean;
};

function parseVerificationDocuments(raw: unknown): OnboardingVerificationDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is OnboardingVerificationDocument =>
      Boolean(d) &&
      typeof d === 'object' &&
      typeof (d as OnboardingVerificationDocument).id === 'string' &&
      typeof (d as OnboardingVerificationDocument).fileName === 'string' &&
      typeof (d as OnboardingVerificationDocument).dataUrl === 'string',
  );
}

function parseVerificationReview(raw: unknown): CompanyVerificationReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const status = (raw as CompanyVerificationReview).status;
  if (status !== 'pending' && status !== 'approved' && status !== 'rejected') return null;
  return {
    status,
    reviewedAt: (raw as CompanyVerificationReview).reviewedAt,
    reviewedBy: (raw as CompanyVerificationReview).reviewedBy,
    adminNote: (raw as CompanyVerificationReview).adminNote,
  };
}

/** Extrae verificación de empresa desde onboardingData de la cuenta. */
export function getCompanyVerificationSnapshot(
  onboardingData: Record<string, unknown> | undefined | null,
): CompanyVerificationSnapshot {
  const od = onboardingData || {};
  const cp = (od.companyProfile && typeof od.companyProfile === 'object'
    ? od.companyProfile
    : {}) as Record<string, unknown>;
  const documents = parseVerificationDocuments(cp.verificationDocuments);
  const review = parseVerificationReview(cp.verificationReview);
  const hasDocuments = documents.length > 0;
  const needsReview =
    hasDocuments && (!review || review.status === 'pending');

  return {
    documents,
    note: String(cp.verificationNote || '').trim(),
    taxId: String(cp.taxId || '').trim(),
    tradeName: String(cp.tradeName || '').trim(),
    legalName: String(cp.legalName || '').trim(),
    businessType: String(od.businessType || '').trim(),
    review,
    hasDocuments,
    needsReview,
  };
}

export function getVerificationBadgeLabel(snapshot: CompanyVerificationSnapshot): string {
  if (!snapshot.hasDocuments) return 'Sin docs';
  if (snapshot.review?.status === 'approved') return 'Aprobada';
  if (snapshot.review?.status === 'rejected') return 'Rechazada';
  return `${snapshot.documents.length} doc${snapshot.documents.length === 1 ? '' : 's'} · Revisar`;
}

export function patchCompanyVerificationReview(
  onboardingData: Record<string, unknown> | undefined | null,
  review: CompanyVerificationReview,
): Record<string, unknown> {
  const od = { ...(onboardingData || {}) };
  const cp = {
    ...((od.companyProfile && typeof od.companyProfile === 'object'
      ? od.companyProfile
      : {}) as Record<string, unknown>),
    verificationReview: review,
  };
  return { ...od, companyProfile: cp };
}
