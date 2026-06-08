import JSZip from 'jszip';
import type { AuthUser } from './authApi';
import {
  analyzePayrollBulkRows,
  parsePayrollManifestCsv,
  suggestWorkerForPayrollFile,
  type PayrollManifestHint,
} from './payrollBulkMatch';
import {
  createPayrollDocumentRequest,
  finalizePayrollDocumentUpload,
  formatPayrollPeriodLabel,
  type PayrollDocument,
  type PayrollDocumentType,
} from './payrollApi';

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const ACCEPTED_EXT = /\.(pdf|doc|docx|xls|xlsx|png|jpe?g|webp)$/i;

export type PayrollBulkFileEntry = {
  id: string;
  file: File;
  fileName: string;
  mimeType: string;
  size: number;
};

export type PayrollBulkReviewRow = PayrollBulkFileEntry & {
  workerId: string;
  workerName: string;
  documentName: string;
  matchScore: number;
  matchReason: string;
};

export type PayrollBulkUploadFailure = {
  fileName: string;
  workerName: string;
  error: string;
};

export type PayrollBulkUploadOutcome = {
  success: PayrollDocument[];
  failed: PayrollBulkUploadFailure[];
};

export type PayrollBulkExtractResult = {
  entries: PayrollBulkFileEntry[];
  manifestByFile: Map<string, PayrollManifestHint>;
  inferredPeriod?: string;
};

export function defaultPayrollPeriod(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function inferPayrollPeriodFromNames(names: string[]): string | undefined {
  for (const raw of names) {
    const name = raw.toLowerCase();
    const ymd = name.match(/\b(20\d{2})[-_./](0[1-9]|1[0-2])\b/);
    if (ymd) return `${ymd[1]}-${ymd[2]}`;
    const dmy = name.match(/\b(0[1-9]|1[0-2])[-_./](20\d{2})\b/);
    if (dmy) return `${dmy[2]}-${dmy[1]}`;
    const compact = name.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);
    if (compact) return `${compact[1]}-${compact[2]}`;
  }
  return undefined;
}

async function readManifestFromZip(zip: JSZip): Promise<Map<string, PayrollManifestHint>> {
  const merged = new Map<string, PayrollManifestHint>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const base = (path.split('/').pop() || '').toLowerCase();
    if (!/\.(csv|txt)$/i.test(base)) continue;
    const text = await entry.async('string');
    for (const [key, hint] of parsePayrollManifestCsv(text)) {
      merged.set(key, hint);
    }
  }
  return merged;
}

export { analyzePayrollBulkRows } from './payrollBulkMatch';

export function buildDefaultPayrollDocumentName(
  period: string | undefined,
  workerName: string,
  fileName: string,
  documentType: PayrollDocumentType,
): string {
  const periodLabel = period ? formatPayrollPeriodLabel(period) : '';
  if (documentType === 'nomina' && periodLabel) {
    return `Nómina ${periodLabel} · ${workerName}`;
  }
  const base = fileName.replace(/\.[^.]+$/, '');
  return base.trim() || `Documento · ${workerName}`;
}

export function isAcceptedPayrollUploadFile(file: File): boolean {
  if (ACCEPTED_MIME.has(file.type)) return true;
  return ACCEPTED_EXT.test(file.name);
}

async function fileFromZipEntry(name: string, data: Blob): Promise<File | null> {
  if (name.includes('__MACOSX') || name.startsWith('.')) return null;
  const fileName = name.split('/').pop() || name;
  if (!ACCEPTED_EXT.test(fileName)) return null;
  const file = new File([data], fileName, { type: data.type || 'application/octet-stream' });
  return isAcceptedPayrollUploadFile(file) ? file : null;
}

export async function extractPayrollPackFromInput(files: FileList | File[]): Promise<PayrollBulkExtractResult> {
  const list = Array.from(files);
  const entries: PayrollBulkFileEntry[] = [];
  const manifestByFile = new Map<string, PayrollManifestHint>();
  const nameHints: string[] = list.map((f) => f.name);
  let seq = 0;

  for (const file of list) {
    const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
    if (isZip) {
      nameHints.push(file.name);
      const zip = await JSZip.loadAsync(file);
      const zipManifest = await readManifestFromZip(zip);
      for (const [key, hint] of zipManifest) manifestByFile.set(key, hint);

      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        nameHints.push(path);
        const blob = await entry.async('blob');
        const extracted = await fileFromZipEntry(path, blob);
        if (!extracted) continue;
        entries.push({
          id: `bulk-${++seq}`,
          file: extracted,
          fileName: extracted.name,
          mimeType: extracted.type || 'application/octet-stream',
          size: extracted.size,
        });
      }
      continue;
    }

    if (!isAcceptedPayrollUploadFile(file)) continue;
    entries.push({
      id: `bulk-${++seq}`,
      file,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    });
  }

  return {
    entries,
    manifestByFile,
    inferredPeriod: inferPayrollPeriodFromNames(nameHints),
  };
}

export async function extractPayrollFilesFromInput(files: FileList | File[]): Promise<PayrollBulkFileEntry[]> {
  const pack = await extractPayrollPackFromInput(files);
  return pack.entries;
}

export function buildPayrollBulkReviewRows(
  entries: PayrollBulkFileEntry[],
  members: AuthUser[],
  options: {
    period?: string;
    documentType: PayrollDocumentType;
    manifestByFile?: Map<string, PayrollManifestHint>;
  },
): PayrollBulkReviewRow[] {
  return entries.map((entry) => {
    const manifestHint = options.manifestByFile?.get(entry.fileName.toLowerCase());
    const suggestion = suggestWorkerForPayrollFile(entry.fileName, members, manifestHint);
    const workerId = suggestion?.workerId || '';
    const workerName = suggestion?.workerName || '';
    return {
      ...entry,
      workerId,
      workerName,
      documentName: workerName
        ? buildDefaultPayrollDocumentName(options.period, workerName, entry.fileName, options.documentType)
        : entry.fileName.replace(/\.[^.]+$/, ''),
      matchScore: suggestion?.score ?? 0,
      matchReason: suggestion?.reason || 'Sin coincidencia — asigna manualmente',
    };
  });
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export async function uploadPayrollDocumentsBatch(params: {
  rows: PayrollBulkReviewRow[];
  documentType: PayrollDocumentType;
  period?: string;
  uploadedBy: string;
  uploadedByName?: string;
  onProgress?: (done: number, total: number, current?: string) => void;
}): Promise<PayrollBulkUploadOutcome> {
  const eligible = params.rows.filter((r) => r.workerId && r.documentName.trim());
  const success: PayrollDocument[] = [];
  const failed: PayrollBulkUploadFailure[] = [];
  const total = eligible.length;

  for (let i = 0; i < eligible.length; i++) {
    const row = eligible[i];
    params.onProgress?.(i, total, row.fileName);
    try {
      const fileData = await readFileAsDataUrl(row.file);
      const doc = await createPayrollDocumentRequest({
        worker_id: row.workerId,
        worker_name: row.workerName,
        documentType: params.documentType,
        name: row.documentName.trim(),
        period: params.period?.trim() || undefined,
        fileData,
        mimeType: row.mimeType,
        fileName: row.fileName,
        size: row.size,
        uploadedBy: params.uploadedBy,
        uploadedByName: params.uploadedByName,
      });
      await finalizePayrollDocumentUpload(doc);
      success.push(doc);
    } catch (err) {
      failed.push({
        fileName: row.fileName,
        workerName: row.workerName || '—',
        error: err instanceof Error ? err.message : 'Error al subir',
      });
    }
  }

  params.onProgress?.(total, total);
  return { success, failed };
}

export function payrollBulkSummaryMessage(outcome: PayrollBulkUploadOutcome): string {
  const total = outcome.success.length + outcome.failed.length;
  if (total === 0) return 'No hay documentos listos para publicar';
  if (outcome.failed.length === 0) {
    return `${outcome.success.length} de ${total} publicadas. Los trabajadores ya las ven en Documentos.`;
  }
  return `${outcome.success.length} de ${total} publicadas · ${outcome.failed.length} con error`;
}
