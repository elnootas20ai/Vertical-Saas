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
export const AFFILIATE_KYC_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.pdf,application/pdf';

/** Lado máximo al comprimir fotos de DNI (móvil suele mandar 8–12 MP). */
const KYC_IMAGE_MAX_SIDE = 1600;

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

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('No se pudo comprimir la imagen'));
        else resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Fotos de móvil suelen superar 2 MB. Las reescalamos y bajamos calidad JPEG
 * hasta quedar bajo el límite (PDF se deja tal cual si ya cabe).
 */
export async function prepareAffiliateKycUploadFile(file: File): Promise<File> {
  if (file.size <= AFFILIATE_KYC_MAX_BYTES) return file;

  const isPdf =
    file.type === 'application/pdf'
    || /\.pdf$/i.test(file.name);
  if (isPdf) {
    throw new Error(
      `El PDF supera ${formatKycFileSize(AFFILIATE_KYC_MAX_BYTES)}. Usa una foto o un PDF más ligero.`,
    );
  }

  const isImage =
    /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type)
    || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isImage) {
    throw new Error('Formato no válido. Usa foto JPG/PNG o PDF.');
  }

  const img = await loadImageFromFile(file);
  let { width, height } = img;
  let maxSide = KYC_IMAGE_MAX_SIDE;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(width, height, 1));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo comprimir la imagen');
    ctx.drawImage(img, 0, 0, w, h);

    const qualities = [0.72, 0.6, 0.48, 0.36];
    for (const q of qualities) {
      const blob = await canvasToJpegBlob(canvas, q);
      if (blob.size <= AFFILIATE_KYC_MAX_BYTES) {
        const base = file.name.replace(/\.[^.]+$/, '') || 'dni';
        return new File([blob], `${base}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
      }
    }
    maxSide = Math.round(maxSide * 0.75);
  }

  throw new Error(
    `No se pudo comprimir la foto por debajo de ${formatKycFileSize(AFFILIATE_KYC_MAX_BYTES)}. Prueba otra foto más cercana al documento.`,
  );
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
