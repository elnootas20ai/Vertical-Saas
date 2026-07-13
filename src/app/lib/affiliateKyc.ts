/** Verificación de identidad (KYC) del programa de afiliados Vertial. */

export type AffiliateKycDocKind = 'dni_front' | 'dni_back';

export type AffiliateKycStatus = 'pending' | 'approved' | 'rejected';

export type AffiliateKycDocument = {
  id: string;
  kind: AffiliateKycDocKind;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  /** data URL base64 — solo backend / revisión admin */
  dataUrl: string;
};

export type AffiliateKycData = {
  dni: string;
  legalName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  iban: string;
  billingTaxId?: string;
  documents: AffiliateKycDocument[];
  submittedAt: string;
  status: AffiliateKycStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
};

export const AFFILIATE_KYC_MAX_BYTES = 2 * 1024 * 1024;
export const AFFILIATE_KYC_ACCEPT = '.pdf,image/jpeg,image/png,image/webp';

export const AFFILIATE_KYC_DOC_KINDS: {
  value: AffiliateKycDocKind;
  label: string;
  hint: string;
}[] = [
  { value: 'dni_front', label: 'DNI / NIE (anverso)', hint: 'Foto o PDF del anverso' },
  { value: 'dni_back', label: 'DNI / NIE (reverso)', hint: 'Foto o PDF del reverso' },
];

export function labelForKycDocKind(kind: AffiliateKycDocKind): string {
  return AFFILIATE_KYC_DOC_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export function formatKycFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Estado expuesto al portal de afiliado (sin documentos). */
export type AffiliateKycPortalSnapshot = {
  status: AffiliateKycStatus | null;
  needsKycSubmission: boolean;
  needsKycApproval: boolean;
  kycApproved: boolean;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  dni?: string;
  legalName?: string;
};

export function getAffiliateKycPortalSnapshot(
  kyc: AffiliateKycData | null | undefined,
): AffiliateKycPortalSnapshot {
  if (!kyc?.submittedAt) {
    return {
      status: null,
      needsKycSubmission: true,
      needsKycApproval: false,
      kycApproved: false,
    };
  }

  const status = kyc.status || 'pending';

  return {
    status,
    needsKycSubmission: status === 'rejected',
    needsKycApproval: status === 'pending',
    kycApproved: status === 'approved',
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt,
    rejectionReason: kyc.rejectionReason,
    dni: status === 'approved' ? kyc.dni : undefined,
    legalName: status === 'approved' ? kyc.legalName : undefined,
  };
}
