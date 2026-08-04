import { useMemo, useState } from 'react';
import {
  Eye,
  FileText,
  FolderOpen,
  Receipt,
  ScrollText,
  ShieldCheck,
  Upload,
  HeartPulse,
  Files,
} from 'lucide-react';
import type { AuthUser } from '../../lib/authApi';
import {
  PAYROLL_DOC_TYPE_LABELS,
  type PayrollDocument,
  type PayrollDocumentType,
} from '../../lib/payrollApi';
import {
  PAYROLL_DOC_FOLDERS,
  type PayrollDocFolderId,
} from '../../lib/payrollDocFolders';
import { formatDateEs } from '../../lib/formatDateEs';
import { VERTIAL_BTN_PRIMARY } from '../../lib/vertialUiTokens';

const FOLDER_ICONS: Record<PayrollDocFolderId, React.ReactNode> = {
  nomina: <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
  contrato: <ScrollText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
  certificado: <ShieldCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />,
  justificante: <FileText className="w-5 h-5 text-sky-600 dark:text-sky-400" />,
  baja: <HeartPulse className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  identity: <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />,
  otro: <Files className="w-5 h-5 text-stone-500" />,
};

type Props = {
  worker: AuthUser;
  documents: PayrollDocument[];
  /** Si true, muestra botón subir en carpetas de empresa. */
  canUpload?: boolean;
  onUploadClick?: (documentType: PayrollDocumentType) => void;
  onPreview?: (doc: PayrollDocument) => void;
};

export function PayrollWorkerDocsFolders({
  worker,
  documents,
  canUpload = true,
  onUploadClick,
  onPreview,
}: Props) {
  const [openFolder, setOpenFolder] = useState<PayrollDocFolderId | null>(null);

  const workerDocs = useMemo(
    () => documents.filter((d) => d.worker_id === worker.user_id),
    [documents, worker.user_id],
  );

  const folders = useMemo(
    () =>
      PAYROLL_DOC_FOLDERS.map((folder) => ({
        ...folder,
        docs: workerDocs
          .filter((d) => folder.match(d.documentType))
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      })),
    [workerDocs],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
            Documentos organizados
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Nómina, contrato, certificados, baja e identidad de {worker.fullName || 'este trabajador'}
          </p>
        </div>
        <span className="text-xs font-semibold tabular-nums text-stone-500">
          {workerDocs.length} archivo{workerDocs.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {folders.map((folder) => {
          const open = openFolder === folder.id;
          return (
            <div
              key={folder.id}
              className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenFolder(open ? null : folder.id)}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-stone-50 dark:bg-stone-800 flex items-center justify-center shrink-0">
                  {FOLDER_ICONS[folder.id]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {folder.label}
                  </p>
                  <p className="text-[11px] text-stone-500 truncate">{folder.hint}</p>
                </div>
                <span className="text-xs font-bold tabular-nums text-stone-500 shrink-0">
                  {folder.docs.length}
                </span>
              </button>

              {open ? (
                <div className="border-t border-stone-100 dark:border-stone-800 px-3.5 py-3 space-y-2">
                  {canUpload && onUploadClick ? (
                    <button
                      type="button"
                      onClick={() => onUploadClick(folder.uploadType)}
                      className={`${VERTIAL_BTN_PRIMARY} w-full min-h-10 text-sm`}
                    >
                      <Upload className="w-4 h-4" />
                      Subir {folder.label.toLowerCase()}
                    </button>
                  ) : null}
                  {folder.uploader === 'worker' || folder.uploader === 'both' ? (
                    <p className="text-[11px] text-stone-500">
                      El trabajador también puede subir esto desde Documentos.
                    </p>
                  ) : null}
                  {folder.docs.length === 0 ? (
                    <div className="flex flex-col items-center py-4 text-center">
                      <FolderOpen className="w-8 h-8 text-stone-300 dark:text-stone-600 mb-1.5" />
                      <p className="text-xs text-stone-500">Sin archivos en esta carpeta</p>
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {folder.docs.map((doc) => (
                        <li
                          key={doc._id}
                          className="flex items-center gap-2 rounded-lg bg-stone-50 dark:bg-stone-800/50 px-2.5 py-2"
                        >
                          <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                              {doc.name}
                            </p>
                            <p className="text-[10px] text-stone-400">
                              {PAYROLL_DOC_TYPE_LABELS[doc.documentType]}
                              {doc.period ? ` · ${doc.period}` : ''}
                              {' · '}
                              {formatDateEs(doc.createdAt) || '—'}
                            </p>
                          </div>
                          {doc.fileData && onPreview ? (
                            <button
                              type="button"
                              onClick={() => onPreview(doc)}
                              className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-blue-600 dark:hover:bg-stone-700 dark:hover:text-blue-400"
                              title="Ver documento"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
