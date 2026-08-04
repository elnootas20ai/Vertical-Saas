import { Download, FileText, X } from 'lucide-react';
import {
  PAYROLL_DOC_TYPE_LABELS,
  type PayrollDocument,
} from '../../lib/payrollApi';

export function isPayrollPdfDoc(doc: Pick<PayrollDocument, 'mimeType' | 'fileName' | 'name' | 'fileData'>): boolean {
  if (doc.mimeType?.toLowerCase().includes('pdf')) return true;
  if (/\.pdf$/i.test(doc.fileName || '') || /\.pdf$/i.test(doc.name || '')) return true;
  if (String(doc.fileData || '').startsWith('data:application/pdf')) return true;
  return false;
}

export function isPayrollImageDoc(doc: Pick<PayrollDocument, 'mimeType' | 'fileName' | 'name' | 'fileData'>): boolean {
  if (doc.mimeType?.toLowerCase().startsWith('image/')) return true;
  if (/\.(png|jpe?g|webp|gif)$/i.test(doc.fileName || '') || /\.(png|jpe?g|webp|gif)$/i.test(doc.name || '')) {
    return true;
  }
  if (String(doc.fileData || '').startsWith('data:image/')) return true;
  return false;
}

/** Modal de vista previa (PDF / imagen) para documentos de nómina y laborales. */
export function PayrollDocumentPreviewModal({
  doc,
  onClose,
}: {
  doc: PayrollDocument;
  onClose: () => void;
}) {
  const isPdf = isPayrollPdfDoc(doc);
  const isImage = isPayrollImageDoc(doc);
  const src = doc.fileData || '';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4 shrink-0">
          <div className="min-w-0 pr-3">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{doc.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {doc.worker_name}
              {doc.documentType ? ` · ${PAYROLL_DOC_TYPE_LABELS[doc.documentType]}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {src ? (
              <a
                href={src}
                download={doc.fileName || doc.name}
                className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Descargar"
              >
                <Download className="w-4 h-4 text-gray-500" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Cerrar"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 min-h-[50vh]">
          {!src ? (
            <div className="text-center text-gray-400 dark:text-gray-500">
              <FileText className="w-16 h-16 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Este documento no tiene archivo adjunto</p>
            </div>
          ) : isPdf ? (
            <iframe
              title={doc.name}
              src={src}
              className="w-full h-[70vh] rounded-lg border border-gray-200 dark:border-gray-700 bg-white"
            />
          ) : isImage ? (
            <img
              src={src}
              alt={doc.name}
              className="max-w-full max-h-[70vh] rounded-lg shadow-lg object-contain"
            />
          ) : (
            <div className="text-center text-gray-400 dark:text-gray-500">
              <FileText className="w-16 h-16 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Vista previa no disponible para este formato</p>
              <a
                href={src}
                download={doc.fileName || doc.name}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold hover:bg-black dark:hover:bg-white transition-colors"
              >
                <Download className="w-4 h-4" />
                Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
