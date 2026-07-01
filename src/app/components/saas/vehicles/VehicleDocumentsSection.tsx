import { useRef, useState } from 'react';
import { FileText, LoaderCircle, Trash2, Upload } from 'lucide-react';
import type { VehicleDocumentRecord } from '../../../context/AppContext';
import type { VehicleDocType } from '../../../lib/vehicleApi';
import { readFileAsDataUrl } from './vehicleImageUtils';
import { VehicleConfirmDialog } from './VehicleConfirmDialog';

const DOC_TYPE_LABELS: Record<string, string> = {
  ficha_tecnica: 'Ficha técnica',
  permiso_circulacion: 'Permiso de circulación',
  itv: 'ITV',
  seguro: 'Seguro',
  contrato_compraventa: 'Contrato compraventa',
  informe_historial: 'Informe historial',
  factura_compra: 'Factura compra',
  otro: 'Otro',
};

type VehicleDocumentsSectionProps = {
  documents: VehicleDocumentRecord[];
  onAdd: (document: {
    name: string;
    documentType: VehicleDocType;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }) => Promise<void>;
  onRemove: (documentId: string) => Promise<void>;
  disabled?: boolean;
};

export function VehicleDocumentsSection({
  documents,
  onAdd,
  onRemove,
  disabled = false,
}: VehicleDocumentsSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<VehicleDocType>('otro');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fileUrl = await readFileAsDataUrl(file);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      await onAdd({
        name: baseName || file.name,
        documentType: docType,
        fileUrl,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
      });
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await onRemove(deleteId);
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!disabled ? (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <label className="min-w-[160px] flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">Tipo</span>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as VehicleDocType)}
              className="h-10 w-full rounded-xl border-2 border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
          >
            {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Subir documento
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = '';
            }}
          />
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center dark:border-gray-700">
          <FileText className="mb-2 h-8 w-8 text-gray-300" strokeWidth={1.5} />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Sin documentos</p>
          <p className="mt-1 text-xs text-gray-400">Sube la ficha técnica, permiso de circulación u otros archivos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{doc.name}</p>
                <p className="text-xs text-gray-500">
                  {DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                  {doc.uploadedAt ? ` · ${new Date(doc.uploadedAt).toLocaleDateString('es-ES')}` : ''}
                </p>
              </div>
              {doc.fileUrl ? (
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                >
                  Ver
                </a>
              ) : null}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => setDeleteId(doc.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <VehicleConfirmDialog
        open={deleteId !== null}
        title="Eliminar documento"
        message="¿Seguro que quieres eliminar este documento del vehículo?"
        confirmLabel="Eliminar"
        tone="danger"
        loading={deleting}
        onCancel={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
