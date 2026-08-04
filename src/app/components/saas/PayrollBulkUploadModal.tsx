import React, { useMemo, useRef, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AuthUser } from '../../lib/authApi';
import {
  PAYROLL_DOC_TYPE_LABELS,
  type PayrollDocument,
  type PayrollDocumentType,
} from '../../lib/payrollApi';
import {
  analyzePayrollBulkRows,
  buildDefaultPayrollDocumentName,
  buildPayrollBulkReviewRows,
  defaultPayrollPeriod,
  extractPayrollPackFromInput,
  payrollBulkSummaryMessage,
  uploadPayrollDocumentsBatch,
  type PayrollBulkReviewRow,
} from '../../lib/payrollBulkUpload';
import { downloadPayrollSampleZip } from '../../lib/payrollSampleZip';

type Step = 'setup' | 'review' | 'uploading' | 'done';

/** Tipos habituales al subir en lote (cada tipo va a su carpeta). */
const BULK_UPLOAD_TYPES: PayrollDocumentType[] = [
  'nomina',
  'contrato',
  'certificado',
  'justificante',
  'baja',
  'reconocimiento_medico',
  'prl',
  'seguro',
  'dni_nie',
  'otro',
];

interface PayrollBulkUploadModalProps {
  members: AuthUser[];
  currentUser: AuthUser;
  businessId: string;
  onClose: () => void;
  onComplete: (docs: PayrollDocument[]) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
}

const PAYROLL_FILE_ACCEPT =
  '.zip,.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/zip,application/pdf,image/png,image/jpeg,image/webp';

export function PayrollBulkUploadModal({
  members,
  currentUser,
  businessId,
  onClose,
  onComplete,
}: PayrollBulkUploadModalProps) {
  useModalClose(true, onClose);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('setup');
  const [documentType, setDocumentType] = useState<PayrollDocumentType>('nomina');
  const [period, setPeriod] = useState(defaultPayrollPeriod);
  const [rows, setRows] = useState<PayrollBulkReviewRow[]>([]);
  const [publishedSoFar, setPublishedSoFar] = useState<PayrollDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, current: '' });
  const [outcome, setOutcome] = useState<{ success: PayrollDocument[]; failed: { fileName: string; workerName: string; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [downloadingSample, setDownloadingSample] = useState(false);

  const typeLabel = PAYROLL_DOC_TYPE_LABELS[documentType] || 'Documento';
  const needsPeriod = documentType === 'nomina';
  const showSampleZip = documentType === 'nomina';

  const activeMembers = useMemo(
    () => members.filter((m) => m.status !== 'inactive'),
    [members],
  );

  const readyCount = rows.filter((r) => r.workerId && r.documentName.trim()).length;
  const unmatchedCount = rows.filter((r) => !r.workerId).length;

  function handleDownloadSampleZip() {
    setDownloadingSample(true);
    void downloadPayrollSampleZip(activeMembers, period)
      .then(({ fileCount }) => {
        toast.success(`ZIP de prueba descargado (${fileCount} PDF${fileCount !== 1 ? 's' : ''})`);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo generar el ZIP de prueba');
      })
      .finally(() => setDownloadingSample(false));
  }

  async function publishRows(reviewRows: PayrollBulkReviewRow[], effectivePeriod: string, appendToPrevious = false) {
    const eligible = reviewRows.filter((r) => r.workerId && r.documentName.trim());
    if (eligible.length === 0) return { success: [] as PayrollDocument[], failed: [] };

    setError(null);
    setStep('uploading');
    setUploadProgress({ done: 0, total: eligible.length, current: '' });

    const result = await uploadPayrollDocumentsBatch({
      businessId,
      rows: reviewRows,
      documentType,
      period: needsPeriod ? (effectivePeriod || undefined) : undefined,
      uploadedBy: currentUser.user_id,
      uploadedByName: currentUser.fullName,
      onProgress: (done, total, current) => {
        setUploadProgress({ done, total, current: current || '' });
      },
    });

    const combinedSuccess = appendToPrevious ? [...publishedSoFar, ...result.success] : result.success;
    setPublishedSoFar(combinedSuccess);
    setOutcome({ success: combinedSuccess, failed: result.failed });
    onComplete(result.success);

    if (result.failed.length === 0 && reviewRows.every((r) => r.workerId)) {
      setStep('done');
      toast.success(payrollBulkSummaryMessage({ success: combinedSuccess, failed: result.failed }));
    }

    return result;
  }

  async function ingestFiles(files: FileList | File[]) {
    setError(null);
    setInfo(null);
    setPublishedSoFar([]);
    setOutcome(null);

    const list = Array.from(files || []).filter(Boolean);
    if (list.length === 0) return;

    const zips = list.filter(isZipFile);
    const docs = list.filter((f) => !isZipFile(f));

    if (zips.length > 1) {
      setError('Solo un ZIP por subida. El ZIP es el paquete de todos; o sube varios PDF sueltos.');
      return;
    }
    if (zips.length === 1 && docs.length > 0) {
      setError(`Sube o un ZIP (todos los ${typeLabel.toLowerCase()}s) o varios PDF sueltos, no ambos a la vez.`);
      return;
    }
    if (zips.length === 0 && docs.length === 0) {
      setError(`Sube un ZIP o uno/varios PDF (o imágenes) de ${typeLabel.toLowerCase()}.`);
      return;
    }

    setLoadingFiles(true);
    try {
      const pack = await extractPayrollPackFromInput(list);
      if (pack.entries.length === 0) {
        setError(
          zips.length
            ? 'El ZIP está vacío o no tiene PDFs. Debe incluir un archivo por trabajador.'
            : `Ningún archivo es válido para ${typeLabel.toLowerCase()} (PDF, imagen o Word).`,
        );
        return;
      }

      const effectivePeriod = period || pack.inferredPeriod || defaultPayrollPeriod();
      if (!period) setPeriod(effectivePeriod);

      const reviewRows = buildPayrollBulkReviewRows(pack.entries, activeMembers, {
        period: needsPeriod ? effectivePeriod : undefined,
        documentType,
        manifestByFile: pack.manifestByFile,
      });

      const matched = reviewRows.filter((r) => r.workerId);
      const unmatched = reviewRows.filter((r) => !r.workerId);
      const analysis = analyzePayrollBulkRows(reviewRows);

      if (analysis.canAutoPublish) {
        await publishRows(reviewRows, effectivePeriod);
        return;
      }

      if (matched.length > 0) {
        const partial = await publishRows(matched, effectivePeriod);
        if (unmatched.length > 0) {
          setRows(unmatched);
          setStep('review');
          setInfo(
            `${partial.success.length} de ${reviewRows.length} publicadas. Asigna las ${unmatched.length} restantes y pulsa Publicar.`,
          );
          return;
        }
      }

      setRows(unmatched.length > 0 ? unmatched : reviewRows);
      setStep('review');
      if (unmatched.length > 0) {
        setError(
          `No pudimos identificar ${unmatched.length} archivo(s). Asigna el trabajador en la tabla (nombre o DNI en el archivo ayuda).`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron leer los archivos');
    } finally {
      setLoadingFiles(false);
    }
  }

  function handleFilePick(files: FileList | File[]) {
    void ingestFiles(files);
  }

  function updateRow(id: string, patch: Partial<Pick<PayrollBulkReviewRow, 'workerId' | 'workerName' | 'documentName'>>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.workerId !== undefined) {
          const member = activeMembers.find((m) => m.user_id === patch.workerId);
          next.workerName = member?.fullName || member?.firstName || '';
          if (member && !patch.documentName) {
            next.documentName = buildDefaultPayrollDocumentName(
              needsPeriod ? period : undefined,
              next.workerName,
              row.fileName,
              documentType,
            );
          }
          next.matchReason = patch.workerId ? 'Asignado manualmente' : 'Sin trabajador';
          next.matchScore = patch.workerId ? 100 : 0;
        }
        return next;
      }),
    );
  }

  async function handlePublishRemaining() {
    if (readyCount === 0) {
      setError('Asigna un trabajador a cada PDF pendiente.');
      return;
    }
    const effectivePeriod = period || defaultPayrollPeriod();
    const result = await publishRows(rows, effectivePeriod, publishedSoFar.length > 0);
    if (result && result.failed.length === 0) {
      setStep('done');
      toast.success(payrollBulkSummaryMessage({ success: publishedSoFar.length ? [...publishedSoFar, ...result.success] : result.success, failed: [] }));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[92vh] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Subir documentos</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              1) Elige qué tipo · 2) Sube ZIP o PDF(s)
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {step === 'setup' && (
            <>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  ¿Qué parte quieres subir?
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Elige el tipo y después adjunta el archivo.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {BULK_UPLOAD_TYPES.map((type) => {
                    const selected = documentType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setDocumentType(type)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {PAYROLL_DOC_TYPE_LABELS[type]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {needsPeriod ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                    Mes de las nóminas
                  </label>
                  <input
                    type="month"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full max-w-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                  />
                </div>
              ) : null}

              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-900 dark:text-blue-100 space-y-2">
                <p>
                  Vas a subir: <strong>{typeLabel}</strong>
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800/90 dark:text-blue-200/90">
                  <li>
                    <strong>ZIP</strong> — paquete con un archivo por trabajador (todos de golpe).
                  </li>
                  <li>
                    <strong>PDF sueltos</strong> — uno, o varios a la vez (Ctrl/Cmd + clic).
                  </li>
                </ul>
                <p className="text-xs text-blue-800/90 dark:text-blue-200/90">
                  Nombra el archivo con el nombre o DNI del trabajador para asignarlo solo.
                </p>
              </div>

              {showSampleZip ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ¿Quieres probar? Descarga un ZIP con un PDF por cada trabajador activo.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadSampleZip}
                    disabled={downloadingSample || activeMembers.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {downloadingSample ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Descargar ZIP de prueba
                  </button>
                </div>
              ) : null}

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.length) handleFilePick(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all ${
                  isDragging
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={PAYROLL_FILE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) handleFilePick(e.target.files);
                    e.target.value = '';
                  }}
                />
                {loadingFiles ? (
                  <>
                    <Loader2 className="w-10 h-10 mx-auto animate-spin text-blue-500 mb-3" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Leyendo archivos y repartiendo…
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Ahora el PDF / ZIP de {typeLabel.toLowerCase()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Arrastra aquí o haz clic para seleccionar
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              {info && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
                  {info}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 font-medium">
                  <AlertCircle className="w-4 h-4" />
                  {unmatchedCount} pendiente{unmatchedCount !== 1 ? 's' : ''}
                </span>
                {publishedSoFar.length > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {publishedSoFar.length} ya publicada{publishedSoFar.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">PDF</th>
                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Trabajador</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {rows.map((row) => (
                        <tr key={row.id} className={!row.workerId ? 'bg-amber-50/50 dark:bg-amber-900/10' : undefined}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{row.fileName}</p>
                                <p className="text-[11px] text-gray-400">{formatBytes(row.size)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 min-w-[200px]">
                            <select
                              value={row.workerId}
                              onChange={(e) => updateRow(row.id, { workerId: e.target.value })}
                              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                            >
                              <option value="">Seleccionar trabajador…</option>
                              {activeMembers.map((m) => (
                                <option key={m.user_id} value={m.user_id}>{m.fullName || m.email}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {step === 'uploading' && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 mx-auto animate-spin text-blue-500" />
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Publicando {typeLabel.toLowerCase()}… {uploadProgress.done} de {uploadProgress.total}
              </p>
              {uploadProgress.current && (
                <p className="text-xs text-gray-500 truncate max-w-md mx-auto">{uploadProgress.current}</p>
              )}
            </div>
          )}

          {step === 'done' && outcome && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
                    {payrollBulkSummaryMessage(outcome)}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Cada trabajador ya tiene su documento en Documentos (con aviso).
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 px-6 py-4 flex justify-between gap-3 shrink-0">
          <div>
            {step === 'review' && (
              <button
                type="button"
                onClick={() => { setStep('setup'); setRows([]); setPublishedSoFar([]); setError(null); setInfo(null); }}
                className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              >
                ← Subir más
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {step === 'done' ? 'Cerrar' : 'Cancelar'}
            </button>
            {step === 'review' && (
              <button
                type="button"
                disabled={readyCount === 0}
                onClick={() => void handlePublishRemaining()}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 px-5 py-2 text-sm font-semibold text-white dark:text-gray-900 hover:bg-black dark:hover:bg-white disabled:opacity-50"
              >
                <Users className="w-4 h-4" />
                Publicar {readyCount} restante{readyCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
