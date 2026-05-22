import { useRef, useState } from 'react';
import { FileText, ShieldCheck, Upload, X } from 'lucide-react';
import {
  formatVerificationFileSize,
  labelForVerificationKind,
  ONBOARDING_VERIFICATION_ACCEPT,
  ONBOARDING_VERIFICATION_KINDS,
  ONBOARDING_VERIFICATION_MAX_BYTES,
  ONBOARDING_VERIFICATION_MAX_FILES,
  readFileAsDataUrl,
  type OnboardingVerificationDocKind,
  type OnboardingVerificationDocument,
} from '../../../lib/onboardingCompanyVerification';

type Props = {
  documents: OnboardingVerificationDocument[];
  note: string;
  onDocumentsChange: (docs: OnboardingVerificationDocument[]) => void;
  onNoteChange: (note: string) => void;
};

export function OnboardingCompanyVerification({
  documents,
  note,
  onDocumentsChange,
  onNoteChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<OnboardingVerificationDocKind>('cif_nif');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const atLimit = documents.length >= ONBOARDING_VERIFICATION_MAX_FILES;

  const handlePickFile = () => {
    setUploadError(null);
    inputRef.current?.click();
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);

    if (file.size > ONBOARDING_VERIFICATION_MAX_BYTES) {
      setUploadError(`Máximo ${formatVerificationFileSize(ONBOARDING_VERIFICATION_MAX_BYTES)} por archivo`);
      return;
    }
    if (atLimit) {
      setUploadError(`Máximo ${ONBOARDING_VERIFICATION_MAX_FILES} documentos`);
      return;
    }

    const mime = file.type || 'application/octet-stream';
    const allowed =
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      /\.(pdf|jpe?g|png|webp)$/i.test(file.name);
    if (!allowed) {
      setUploadError('Formato: PDF, JPG, PNG o WEBP');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const entry: OnboardingVerificationDocument = {
        id: `onb-doc-${Date.now()}`,
        kind,
        fileName: file.name,
        mimeType: mime,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        dataUrl,
      };
      onDocumentsChange([...documents, entry]);
    } catch {
      setUploadError('No se pudo adjuntar el archivo');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeDoc = (id: string) => {
    onDocumentsChange(documents.filter((d) => d.id !== id));
  };

  return (
    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Verificación de empresa <span className="font-normal text-gray-500">(opcional)</span>
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug mt-0.5">
            Adjunta CIF, licencia de actividad u otro documento para revisar el acceso más rápido. No
            es obligatorio para continuar.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as OnboardingVerificationDocKind)}
          disabled={uploading || atLimit}
          className="flex-1 min-w-0 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
          aria-label="Tipo de documento"
        >
          {ONBOARDING_VERIFICATION_KINDS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handlePickFile}
          disabled={uploading || atLimit}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
        >
          <Upload className="w-4 h-4" />
          {uploading ? 'Subiendo…' : 'Adjuntar'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ONBOARDING_VERIFICATION_ACCEPT}
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {uploadError ? <p className="text-xs text-red-600">{uploadError}</p> : null}

      {documents.length > 0 ? (
        <ul className="space-y-1.5 max-h-24 overflow-y-auto">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200" title={doc.fileName}>
                {doc.fileName}
              </span>
              <span className="text-gray-400 shrink-0 hidden sm:inline">
                {labelForVerificationKind(doc.kind)}
              </span>
              <span className="text-gray-400 shrink-0">{formatVerificationFileSize(doc.size)}</span>
              <button
                type="button"
                onClick={() => removeDoc(doc.id)}
                className="p-0.5 text-gray-400 hover:text-red-600 shrink-0"
                aria-label="Quitar documento"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          Sin documentos adjuntos — puedes añadirlos más tarde desde Ajustes.
        </p>
      )}

      <input
        type="text"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Nota opcional (ej. actividad: restauración, en trámite de alta…)"
        maxLength={200}
        className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 outline-none"
      />
    </div>
  );
}
