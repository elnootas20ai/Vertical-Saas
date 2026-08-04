import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Lock,
  Plus,
  Receipt,
  ScrollText,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
  File,
  Calendar,
  Users,
  Clock,
  ArrowRight,
  ScanLine,
  Files,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import type { AuthUser } from '../../lib/authApi';
import {
  listPayrollDocumentsRequest,
  createPayrollDocumentRequest,
  deletePayrollDocumentRequest,
  finalizePayrollDocumentUpload,
  payrollUploadSuccessMessage,
  PAYROLL_DOC_TYPE_LABELS,
  formatPayrollPeriodLabel,
  type PayrollDocument,
  type PayrollDocumentType,
} from '../../lib/payrollApi';
import { toast } from 'sonner';
import { SAAS__OcrScanModal } from '../../components/design-system/SAAS__OcrScanModal';
import { PayrollBulkUploadModal } from '../../components/saas/PayrollBulkUploadModal';
import { LaborMonthClosePanel } from '../../components/saas/LaborMonthClosePanel';
import { PayrollNominasPanel } from '../../components/saas/PayrollNominasPanel';
import { formatDateEs } from '../../lib/formatDateEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

type HubTab = 'nominas' | 'documentacion';

function resolveHubTab(raw: string | null): HubTab {
  if (raw === 'documentacion' || raw === 'docs' || raw === 'documents') return 'documentacion';
  return 'nominas';
}

type DocFilter = 'all' | PayrollDocumentType;

const DOC_FILTERS: { id: DocFilter; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'Todos', icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'nomina', label: 'Nóminas', icon: <Receipt className="w-4 h-4" /> },
  { id: 'contrato', label: 'Contratos', icon: <ScrollText className="w-4 h-4" /> },
  { id: 'certificado', label: 'Certificados', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'baja', label: 'Bajas / IT', icon: <File className="w-4 h-4" /> },
  { id: 'otro', label: 'Otros', icon: <FileText className="w-4 h-4" /> },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return formatDateEs(iso) || iso;
}

// ─── Upload Modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  members: AuthUser[];
  currentUser: AuthUser;
  businessId: string;
  onClose: () => void;
  onUploaded: (doc: PayrollDocument) => void;
}

function PayrollUploadModal({ members, currentUser, businessId, onClose, onUploaded }: UploadModalProps) {
  const [workerId, setWorkerId] = useState('');
  const [documentType, setDocumentType] = useState<PayrollDocumentType>('nomina');
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(
      (m) =>
        m.fullName?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q),
    );
  }, [members, memberSearch]);

  const selectedMember = members.find((m) => m.user_id === workerId);

  function handleFileChange(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    if (!name) setName(selected.name.replace(/\.[^.]+$/, ''));
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
        worker_name: selectedMember?.fullName || '',
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
      toast.success(payrollUploadSuccessMessage(doc));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
          {/* Worker selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Trabajador <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Buscar trabajador..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
                  />
                </div>
              </div>
              {selectedMember ? (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300">
                    {(selectedMember.firstName?.[0] || '') + (selectedMember.lastName?.[0] || '')}
                  </div>
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100 flex-1">{selectedMember.fullName}</span>
                  <button type="button" onClick={() => setWorkerId('')} className="text-blue-400 hover:text-blue-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredMembers.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-400">Sin resultados</div>
                  ) : (
                    filteredMembers.map((m) => (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => { setWorkerId(m.user_id); setMemberSearch(''); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
                          {(m.firstName?.[0] || '') + (m.lastName?.[0] || '')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.fullName}</p>
                          <p className="text-xs text-gray-400 truncate">{m.email}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Tipo de documento</label>
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
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Período</label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Nombre del documento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Nómina enero 2026"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            />
          </div>

          {/* File drop */}
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
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Arrastra aquí o haz clic para seleccionar</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">PDF, Word, Excel, imagen</p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <Lock className="w-4 h-4 shrink-0" />
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
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
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

// ─── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({ doc, onClose }: { doc: PayrollDocument; onClose: () => void }) {
  const isPdf = doc.mimeType?.includes('pdf');
  const isImage = doc.mimeType?.startsWith('image/');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{doc.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.worker_name} · {PAYROLL_DOC_TYPE_LABELS[doc.documentType]}</p>
          </div>
          <div className="flex items-center gap-2">
            {doc.fileData && (
              <a
                href={doc.fileData}
                download={doc.fileName || doc.name}
                className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Descargar"
              >
                <Download className="w-4 h-4 text-gray-500" />
              </a>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
          {isPdf && doc.fileData ? (
            <iframe src={doc.fileData} className="w-full h-[70vh] rounded-lg border border-gray-200 dark:border-gray-700" />
          ) : isImage && doc.fileData ? (
            <img src={doc.fileData} alt={doc.name} className="max-w-full max-h-[70vh] rounded-lg shadow-lg" />
          ) : (
            <div className="text-center text-gray-400 dark:text-gray-500">
              <FileText className="w-16 h-16 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Vista previa no disponible</p>
              {doc.fileData && (
                <a
                  href={doc.fileData}
                  download={doc.fileName || doc.name}
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold hover:bg-black dark:hover:bg-white transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Descargar archivo
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function PayrollPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, listUsers } = useAuth();
  const { currentBusiness } = useBusiness();

  const hubTab = resolveHubTab(searchParams.get('tab'));
  const selectedWorkerId = searchParams.get('worker') || '';

  const setHubTab = useCallback(
    (tab: HubTab, extras?: { worker?: string; clearWorker?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      if (extras?.clearWorker) next.delete('worker');
      if (extras?.worker) next.set('worker', extras.worker);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [documents, setDocuments] = useState<PayrollDocument[]>([]);
  const [members, setMembers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<DocFilter>('all');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PayrollDocument | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (hubTab === 'documentacion' && selectedWorkerId) {
      setFilterWorker(selectedWorkerId);
    }
  }, [hubTab, selectedWorkerId]);

  const loadData = useCallback(async () => {
    const businessId = currentBusiness?.business_id || '';
    if (!businessId) {
      setDocuments([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const users = await listUsers(businessId);
      const memberIds = users.map((u) => u.user_id).filter(Boolean);
      const docs = await listPayrollDocumentsRequest({ businessId, memberIds });
      setDocuments(docs);
      setMembers(users);
    } catch {
      toast.error('Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  }, [currentBusiness?.business_id, listUsers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredDocs = useMemo(() => {
    let result = documents;
    if (filterType !== 'all') {
      result = result.filter((d) => d.documentType === filterType);
    }
    if (filterWorker) {
      result = result.filter((d) => d.worker_id === filterWorker);
    }
    if (filterWorkCenter !== 'all') {
      const memberIds = new Set(
        members.filter(m => (m as any).workCenterId === filterWorkCenter).map(m => m.user_id),
      );
      result = result.filter(d => memberIds.has(d.worker_id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.worker_name?.toLowerCase().includes(q) ||
          d.period?.includes(q),
      );
    }
    return result;
  }, [documents, filterType, filterWorker, filterWorkCenter, search, members]);

  const workerCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of documents) {
      map.set(d.worker_id, (map.get(d.worker_id) || 0) + 1);
    }
    return map;
  }, [documents]);

  const uniqueWorkers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of members) {
      if (m.status === 'inactive') continue;
      if (m.user_id) seen.set(m.user_id, m.fullName || m.email || m.user_id);
    }
    for (const d of documents) {
      if (!seen.has(d.worker_id)) seen.set(d.worker_id, d.worker_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [documents, members]);

  async function handleDelete(doc: PayrollDocument) {
    if (!confirm(`¿Eliminar "${doc.name}"?`)) return;
    setDeleting(doc._id);
    try {
      await deletePayrollDocumentRequest(doc);
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
      toast.success('Documento eliminado');
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeleting(null);
    }
  }

  function handleUploaded(doc: PayrollDocument) {
    setDocuments((prev) => [doc, ...prev]);
    setFilterWorker(doc.worker_id);
    if (doc.documentType === 'nomina') {
      setFilterType('nomina');
    }
    void finalizePayrollDocumentUpload(doc);
  }

  function handleBulkComplete(docs: PayrollDocument[]) {
    if (docs.length === 0) return;
    setDocuments((prev) => [...docs, ...prev]);
    setFilterType('nomina');
    if (docs.length === 1) {
      setFilterWorker(docs[0].worker_id);
    } else {
      setFilterWorker('');
    }
  }

  return (
    <Layout title="Nóminas y documentación" subtitle="Equipo: pagos, pendientes y documentos laborales">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Hub genérico: NÓMINAS | DOCUMENTACIÓN */}
        <div className="flex gap-1 p-1 rounded-2xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setHubTab('nominas')}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              hubTab === 'nominas'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Nóminas
          </button>
          <button
            type="button"
            onClick={() => setHubTab('documentacion')}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              hubTab === 'documentacion'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            Documentación
          </button>
        </div>

        {hubTab === 'nominas' ? (
          <>
            <LaborMonthClosePanel
              business={currentBusiness}
              authUser={user}
              members={members}
            />
            <PayrollNominasPanel
              members={members}
              documents={documents}
              loading={loading}
              selectedWorkerId={selectedWorkerId}
              onSelectWorker={(workerId) => setHubTab('nominas', { worker: workerId })}
              onOpenDocuments={(workerId) => {
                if (workerId) setFilterWorker(workerId);
                setFilterType('all');
                setHubTab('documentacion', workerId ? { worker: workerId } : undefined);
              }}
              onUploadPayslips={() => setShowBulkUpload(true)}
            />
            <Link
              to="/saas/clockins"
              className="flex items-center justify-between p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                  <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Resumen de fichajes para nómina</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Consulta horas trabajadas, extras, retrasos y absentismo del equipo</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-blue-400 group-hover:translate-x-1 transition-transform" />
            </Link>
          </>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
                <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 mb-1">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Total</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">{documents.length}</p>
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
                <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 mb-1">
                  <Receipt className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Nóminas</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">
                  {documents.filter((d) => d.documentType === 'nomina').length}
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
                <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 mb-1">
                  <ScrollText className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Contratos</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">
                  {documents.filter((d) => d.documentType === 'contrato').length}
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
                <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Trabajadores</span>
                </div>
                <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">{uniqueWorkers.length}</p>
              </div>
            </div>

            {/* ZIP upload info */}
            <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
              <strong className="text-stone-900 dark:text-stone-100">Nóminas del mes:</strong> sube un ZIP con un PDF por trabajador.
              El sistema lo reparte a cada uno automáticamente. Contratos u otros documentos sueltos → perfil del trabajador en Equipo.
            </div>

            {/* Filters row */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, trabajador o período..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
                />
              </div>

              {/* Worker filter */}
              <div className="relative">
                <select
                  value={filterWorker}
                  onChange={(e) => setFilterWorker(e.target.value)}
                  className="appearance-none pl-9 pr-8 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
                >
                  <option value="">Todos los trabajadores</option>
                  {uniqueWorkers.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({workerCounts.get(w.id) || 0})</option>
                  ))}
                </select>
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              </div>
              {hasWorkCenters && (
                <select
                  value={filterWorkCenter}
                  onChange={(e) => setFilterWorkCenter(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
                >
                  <option value="all">Todos los centros</option>
                  {activeWorkCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                </select>
              )}
              <button
                onClick={() => setShowBulkUpload(true)}
                className={VERTIAL_BTN_PRIMARY}
              >
                <Files className="w-4 h-4" />
                <span className="hidden sm:inline">Subir ZIP nóminas</span>
              </button>
              <button
                onClick={() => setShowOcr(true)}
                className={VERTIAL_BTN_SECONDARY}
              >
                <ScanLine className="w-4 h-4" />
                <span className="hidden sm:inline">Escanear OCR</span>
              </button>
            </div>

            {/* Type tabs */}
            <div className="flex gap-1 flex-wrap">
              {DOC_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    filterType === f.id
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                  }`}
                >
                  {f.icon}
                  {f.label}
                </button>
              ))}
            </div>

            {/* Documents list */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-stone-200 dark:border-stone-700 py-16 text-center">
                <FileText className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
                  {documents.length === 0 ? 'No hay documentos aún' : 'Sin resultados para los filtros aplicados'}
                </p>
                {documents.length === 0 && (
                  <button
                    onClick={() => setShowBulkUpload(true)}
                    className={`${VERTIAL_BTN_PRIMARY} mt-4`}
                  >
                    <Upload className="w-4 h-4" />
                    Subir ZIP nóminas
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                        <th className="px-4 py-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Documento</th>
                        <th className="px-4 py-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Trabajador</th>
                        <th className="px-4 py-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider hidden sm:table-cell">Tipo</th>
                        <th className="px-4 py-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider hidden md:table-cell">Período</th>
                        <th className="px-4 py-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider hidden lg:table-cell">Fecha</th>
                        <th className="px-4 py-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {filteredDocs.map((doc) => (
                        <tr key={doc._id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                {doc.documentType === 'nomina' ? <Receipt className="w-4 h-4 text-blue-600 dark:text-blue-400" /> :
                                 doc.documentType === 'contrato' ? <ScrollText className="w-4 h-4 text-amber-600 dark:text-amber-400" /> :
                                 <FileText className="w-4 h-4 text-stone-500 dark:text-stone-400" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{doc.name}</p>
                                {doc.fileName && (
                                  <p className="text-xs text-stone-400 truncate">{doc.fileName} {doc.size ? `· ${formatBytes(doc.size)}` : ''}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setHubTab('nominas', { worker: doc.worker_id })}
                              className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              <User className="w-3.5 h-3.5" />
                              {doc.worker_name}
                            </button>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-600 dark:text-stone-400">
                              {PAYROLL_DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400 hidden md:table-cell">
                            {doc.period ? (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatPayrollPeriodLabel(doc.period)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-stone-500 dark:text-stone-400 hidden lg:table-cell">
                            {formatDate(doc.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {doc.fileData && (
                                <button
                                  onClick={() => setPreviewDoc(doc)}
                                  className="rounded-lg p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                                  title="Ver"
                                >
                                  <Eye className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                                </button>
                              )}
                              {doc.fileData && (
                                <a
                                  href={doc.fileData}
                                  download={doc.fileName || doc.name}
                                  className="rounded-lg p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                                  title="Descargar"
                                >
                                  <Download className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                                </a>
                              )}
                              <button
                                onClick={() => setHubTab('nominas', { worker: doc.worker_id })}
                                className="rounded-lg p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                                title="Ir al perfil de nómina"
                              >
                                <User className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                              </button>
                              <button
                                onClick={() => handleDelete(doc)}
                                disabled={deleting === doc._id}
                                className="rounded-lg p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Eliminar"
                              >
                                {deleting === doc._id ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                                ) : (
                                  <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showBulkUpload && user && currentBusiness?.business_id && (
        <PayrollBulkUploadModal
          members={members}
          currentUser={user}
          businessId={currentBusiness.business_id}
          onClose={() => setShowBulkUpload(false)}
          onComplete={handleBulkComplete}
        />
      )}

      {previewDoc && (
        <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}

      <SAAS__OcrScanModal
        isOpen={showOcr}
        onClose={() => setShowOcr(false)}
        targetModule="nominas"
        onDocumentCreated={async () => { setShowOcr(false); await loadData(); toast.success('Documento procesado por OCR'); }}
      />
    </Layout>
  );
}
