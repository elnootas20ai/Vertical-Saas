import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  AlertCircle,
  Download,
  FileText,
  Filter,
  Files,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AuthUser } from '../../lib/authApi';
import {
  createPayrollDocumentRequest,
  deletePayrollDocumentRequest,
  finalizePayrollDocumentUpload,
  payrollUploadSuccessMessage,
  listPayrollDocumentsRequest,
  PAYROLL_DOC_TYPE_LABELS,
  type PayrollDocument,
  type PayrollDocumentType,
} from '../../lib/payrollApi';
import { useBusiness } from '../../context/BusinessContext';
import { payrollBulkSummaryMessage } from '../../lib/payrollBulkUpload';
import { PayrollBulkUploadModal } from './PayrollBulkUploadModal';
import { HrGestorChecklist } from './HrGestorChecklist';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const DOC_TYPE_COLORS: Record<PayrollDocumentType, string> = {
  nomina: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  contrato: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  certificado: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700',
  baja: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  otro: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600',
};

// ─── Upload Modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  members: AuthUser[];
  currentUser: AuthUser;
  businessId: string;
  onClose: () => void;
  onUploaded: (doc: PayrollDocument) => void;
}

function UploadModal({ members, currentUser, businessId, onClose, onUploaded }: UploadModalProps) {
  useModalClose(true, onClose);
  const [workerId, setWorkerId] = useState('');
  const [documentType, setDocumentType] = useState<PayrollDocumentType>('nomina');
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeMembers = members.filter((m) => m.status !== 'inactive');

  function handleFileChange(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    if (!name) {
      setName(selected.name.replace(/\.[^.]+$/, ''));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!workerId) { setError('Selecciona un trabajador.'); return; }
    if (!name.trim()) { setError('Indica un nombre para el documento.'); return; }
    if (!file) { setError('Adjunta un archivo.'); return; }

    const worker = members.find((m) => m.user_id === workerId);

    setIsUploading(true);
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const doc = await createPayrollDocumentRequest({
        business_id: businessId,
        worker_id: workerId,
        worker_name: worker?.fullName || workerId,
        documentType,
        name: name.trim(),
        period: period.trim() || undefined,
        fileData,
        mimeType: file.type,
        fileName: file.name,
        size: file.size,
        uploadedBy: currentUser.user_id,
        uploadedByName: currentUser.fullName,
      });
      onUploaded(doc);
      void finalizePayrollDocumentUpload(doc);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Subir documento</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Visible al instante en Documentos del trabajador</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Worker */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Trabajador <span className="text-red-500">*</span>
            </label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            >
              <option value="">Seleccionar trabajador...</option>
              {activeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.fullName}</option>
              ))}
            </select>
          </div>

          {/* Document type + period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Tipo de documento
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as PayrollDocumentType)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
              >
                {(Object.entries(PAYROLL_DOC_TYPE_LABELS) as [PayrollDocumentType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Período (ej. 2025-01)
              </label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Nombre del documento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Nómina enero 2025"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            />
          </div>

          {/* File drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
              isDragging
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : file
                  ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-1">
                <FileText className="w-6 h-6 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{file.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Arrastra aquí o haz clic para seleccionar
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">PDF, Word, Excel, imagen — máx. 10 MB</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 px-5 py-2 text-sm font-semibold text-white dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors disabled:opacity-60"
            >
              {isUploading ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 dark:border-gray-900/30 border-t-white dark:border-t-gray-900 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Subir documento
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete confirmation ───────────────────────────────────────────────────────

interface DeleteConfirmProps {
  doc: PayrollDocument;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

function DeleteConfirm({ doc, onCancel, onConfirm, isDeleting }: DeleteConfirmProps) {
  useModalClose(true, onCancel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/30">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Eliminar documento</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Esta acción no se puede deshacer</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          ¿Seguro que quieres eliminar <span className="font-semibold text-gray-900 dark:text-gray-100">"{doc.name}"</span>?
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60"
          >
            {isDeleting ? (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main PayrollTab component ─────────────────────────────────────────────────

interface PayrollTabProps {
  members: AuthUser[];
  currentUser: AuthUser;
  isAdmin: boolean;
}

export function PayrollTab({ members, currentUser, isAdmin }: PayrollTabProps) {
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const [documents, setDocuments] = useState<PayrollDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [docToDelete, setDocToDelete] = useState<PayrollDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filterWorker, setFilterWorker] = useState<string>('all');
  const [filterType, setFilterType] = useState<PayrollDocumentType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!businessId) {
      setDocuments([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const memberIds = members.map((m) => m.user_id).filter(Boolean);
      const opts = {
        businessId,
        memberIds,
        ...( !isAdmin ? { workerId: currentUser.user_id } : {}),
      };
      const docs = await listPayrollDocumentsRequest(opts);
      setDocuments(docs);
    } catch {
      // silently fail — show empty state
    } finally {
      setIsLoading(false);
    }
  }, [businessId, isAdmin, currentUser.user_id, members]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  function handleUploaded(doc: PayrollDocument) {
    setDocuments((prev) => [doc, ...prev]);
    if (isAdmin) {
      setFilterWorker(doc.worker_id);
    }
    setMessage(payrollUploadSuccessMessage(doc));
    toast.success(payrollUploadSuccessMessage(doc));
    setTimeout(() => setMessage(null), 6000);
  }

  async function handleDelete() {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      await deletePayrollDocumentRequest(docToDelete);
      setDocuments((prev) => prev.filter((d) => d._id !== docToDelete._id));
      setMessage(`Documento "${docToDelete.name}" eliminado.`);
      setTimeout(() => setMessage(null), 4000);
      setDocToDelete(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo eliminar el documento.');
    } finally {
      setIsDeleting(false);
    }
  }

  function handleDownload(doc: PayrollDocument) {
    if (!doc.fileData) return;
    const link = window.document.createElement('a');
    link.href = doc.fileData;
    link.download = doc.fileName || doc.name;
    link.click();
  }

  const filteredDocs = documents.filter((doc) => {
    if (filterWorker !== 'all' && doc.worker_id !== filterWorker) return false;
    if (filterType !== 'all' && doc.documentType !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !doc.name.toLowerCase().includes(q) &&
        !doc.worker_name.toLowerCase().includes(q) &&
        !(doc.period || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const workerOptions = members.filter((m) =>
    documents.some((d) => d.worker_id === m.user_id),
  );

  const formatPeriod = (period: string) => {
    const [year, month] = period.split('-');
    if (!year || !month) return period;
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/30">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100">Nóminas y otros documentos</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {documents.length} documento{documents.length !== 1 ? 's' : ''} almacenado{documents.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowBulkUpload(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-semibold text-white dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors"
          >
            <Files className="w-4 h-4" />
            Subir ZIP nóminas
          </button>
        )}
      </div>

      {isAdmin && (
        <HrGestorChecklist mode="hr" compact />
      )}

      {message && (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar documentos..."
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
          />
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <select
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            >
              <option value="all">Todos los trabajadores</option>
              {workerOptions.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.fullName}</option>
              ))}
            </select>
          </div>
        )}

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as PayrollDocumentType | 'all')}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
        >
          <option value="all">Todos los tipos</option>
          {(Object.entries(PAYROLL_DOC_TYPE_LABELS) as [PayrollDocumentType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Documents list */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-gray-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-48 rounded bg-gray-100 dark:bg-gray-700" />
                  <div className="h-3 w-32 rounded bg-gray-50 dark:bg-gray-800" />
                </div>
                <div className="h-6 w-20 rounded-full bg-gray-100 dark:bg-gray-700" />
              </div>
            ))}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-700/50">
              <FileText className="w-7 h-7 text-gray-300 dark:text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {documents.length === 0
                  ? 'Aún no hay documentos'
                  : 'No se encontraron resultados'}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {documents.length === 0
                  ? isAdmin ? 'Sube el primer documento usando el botón "Subir documento".' : 'Todavía no tienes documentos asignados.'
                  : 'Prueba ajustando los filtros o la búsqueda.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/80">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Documento</th>
                  {isAdmin && <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Trabajador</th>}
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Tipo</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Período</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Subido</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Tamaño</th>
                  <th className="w-24 px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filteredDocs.map((doc) => (
                  <tr key={doc._id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
                          <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{doc.name}</p>
                          {doc.fileName && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">{doc.fileName}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{doc.worker_name}</td>
                    )}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${DOC_TYPE_COLORS[doc.documentType]}`}>
                        {PAYROLL_DOC_TYPE_LABELS[doc.documentType]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {doc.period ? formatPeriod(doc.period) : '—'}
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-400 dark:text-gray-500">
                      {doc.size ? formatBytes(doc.size) : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {doc.fileData && (
                          <button
                            type="button"
                            onClick={() => handleDownload(doc)}
                            title="Descargar"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDocToDelete(doc)}
                            title="Eliminar"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">
              {filteredDocs.map((doc) => (
                <div key={doc._id} className="px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
                        <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{doc.name}</p>
                        {isAdmin && <p className="text-xs text-gray-500 dark:text-gray-400">{doc.worker_name}</p>}
                      </div>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${DOC_TYPE_COLORS[doc.documentType]}`}>
                      {PAYROLL_DOC_TYPE_LABELS[doc.documentType]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                      <span>{doc.period ? formatPeriod(doc.period) : '—'}</span>
                      <span>·</span>
                      <span>{formatDate(doc.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {doc.fileData && (
                        <button
                          type="button"
                          onClick={() => handleDownload(doc)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDocToDelete(doc)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showBulkUpload && businessId && (
        <PayrollBulkUploadModal
          members={members}
          currentUser={currentUser}
          businessId={businessId}
          onClose={() => setShowBulkUpload(false)}
          onComplete={(docs) => {
            if (docs.length === 0) return;
            setDocuments((prev) => [...docs, ...prev]);
            setMessage(payrollBulkSummaryMessage({ success: docs, failed: [] }));
            toast.success(payrollBulkSummaryMessage({ success: docs, failed: [] }));
            setTimeout(() => setMessage(null), 6000);
          }}
        />
      )}

      {docToDelete && (
        <DeleteConfirm
          doc={docToDelete}
          onCancel={() => setDocToDelete(null)}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
