import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Download,
  Eye,
  Search,
  FolderOpen,
  Receipt,
  ScrollText,
  ShieldCheck,
  Calendar,
  File,
  Upload,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { WORKER_SELF_UPLOAD_TYPES } from '../../../lib/gestoriaLaborMetrics';
import { createNotificationRequest } from '../../../lib/notificationApi';
import {
  createPayrollDocumentRequest,
  listPayrollDocumentsRequest,
  PAYROLL_DOC_TYPE_LABELS,
  type PayrollDocument,
  type PayrollDocumentType,
} from '../../../lib/payrollApi';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

type DocCategory = 'all' | 'identity' | 'nomina' | 'contrato' | 'certificado' | 'baja' | 'otro';

const CATEGORY_CONFIG: Record<DocCategory, { label: string; icon: React.ReactNode }> = {
  all: { label: 'Todos', icon: <FolderOpen className="w-4 h-4" /> },
  identity: { label: 'Identidad', icon: <ShieldCheck className="w-4 h-4" /> },
  nomina: { label: 'Nóminas', icon: <Receipt className="w-4 h-4" /> },
  contrato: { label: 'Contratos', icon: <ScrollText className="w-4 h-4" /> },
  certificado: { label: 'Certificados', icon: <ShieldCheck className="w-4 h-4" /> },
  baja: { label: 'Baja / IT', icon: <FileText className="w-4 h-4" /> },
  otro: { label: 'Otros', icon: <File className="w-4 h-4" /> },
};

const IDENTITY_TYPES = new Set<PayrollDocumentType>([
  'dni_nie',
  'pasaporte',
  'permiso_trabajo',
  'carnet_conducir',
]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesCategory(doc: PayrollDocument, cat: DocCategory): boolean {
  if (cat === 'all') return true;
  if (cat === 'identity') return IDENTITY_TYPES.has(doc.documentType);
  if (cat === 'otro') {
    return !IDENTITY_TYPES.has(doc.documentType)
      && !['nomina', 'contrato', 'certificado', 'baja'].includes(doc.documentType);
  }
  return doc.documentType === cat;
}

async function notifyManagersWorkerDoc(
  managerIds: string[],
  doc: PayrollDocument,
): Promise<void> {
  const typeLabel = PAYROLL_DOC_TYPE_LABELS[doc.documentType] || 'Documento';
  await Promise.all(
    managerIds.filter(Boolean).map((id) =>
      createNotificationRequest(id, {
        level: 'info',
        category: 'team',
        title: `Documento del trabajador: ${typeLabel}`,
        message: `${doc.worker_name} ha subido «${doc.name}».`,
        entityId: doc.id || doc._id,
        entityType: 'payroll',
        route: '/saas/gestoria',
        metadata: { workerId: doc.worker_id, documentType: doc.documentType },
      }).catch(() => undefined),
    ),
  );
}

export function WorkerDocs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const [activeCategory, setActiveCategory] = useState<DocCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState<PayrollDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [documentType, setDocumentType] = useState<PayrollDocumentType>('dni_nie');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (!user?.user_id) return;
    setIsLoading(true);
    try {
      const docs = await listPayrollDocumentsRequest({
        workerId: user.user_id,
        businessId: businessId || undefined,
      });
      setDocuments(docs);
    } catch {
      /* empty */
    } finally {
      setIsLoading(false);
    }
  }, [user?.user_id, businessId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocs = documents
    .filter((doc) => matchesCategory(doc, activeCategory))
    .filter(
      (doc) =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase())
        || (doc.fileName || '').toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const categoryCounts = (Object.keys(CATEGORY_CONFIG) as DocCategory[]).reduce(
    (acc, key) => {
      acc[key] = documents.filter((d) => matchesCategory(d, key)).length;
      return acc;
    },
    {} as Record<DocCategory, number>,
  );

  const getDocIcon = (docType: PayrollDocumentType) => {
    if (IDENTITY_TYPES.has(docType)) return <ShieldCheck className="w-5 h-5 text-purple-500" />;
    switch (docType) {
      case 'nomina':
        return <Receipt className="w-5 h-5 text-emerald-500" />;
      case 'contrato':
        return <ScrollText className="w-5 h-5 text-blue-500" />;
      case 'certificado':
        return <ShieldCheck className="w-5 h-5 text-purple-500" />;
      case 'baja':
        return <FileText className="w-5 h-5 text-amber-500" />;
      default:
        return <File className="w-5 h-5 text-gray-400" />;
    }
  };

  function handleDownload(doc: PayrollDocument) {
    if (!doc.fileData) return;
    const link = window.document.createElement('a');
    link.href = doc.fileData;
    link.download = doc.fileName || doc.name;
    link.click();
  }

  function handlePreview(doc: PayrollDocument) {
    if (!doc.fileData) return;
    const win = window.open('', '_blank');
    if (!win) return;
    if (doc.mimeType?.startsWith('image/')) {
      win.document.write(`<img src="${doc.fileData}" style="max-width:100%;height:auto" />`);
    } else if (doc.mimeType === 'application/pdf') {
      win.location.href = doc.fileData;
    } else {
      handleDownload(doc);
      win.close();
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !businessId) {
      toast.error('No hay empresa asociada.');
      return;
    }
    if (!name.trim() || !file) {
      toast.error('Indica nombre y archivo.');
      return;
    }
    setUploading(true);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const doc = await createPayrollDocumentRequest({
        business_id: businessId,
        worker_id: user.user_id,
        worker_name: user.fullName || user.email || '',
        documentType,
        name: name.trim(),
        fileData,
        mimeType: file.type,
        fileName: file.name,
        size: file.size,
        uploadedBy: user.user_id,
        uploadedByName: user.fullName,
        documentCategory: IDENTITY_TYPES.has(documentType) ? 'identity' : 'other',
      });
      setDocuments((prev) => [doc, ...prev]);
      const managerIds = [
        currentBusiness?.owner_user_id,
        ...(currentBusiness?.members || [])
          .filter((m) => ['Admin', 'Gerente', 'Gestor', 'Encargado'].includes(String(m.role || '')))
          .map((m) => m.user_id),
      ].filter((id): id is string => Boolean(id) && id !== user.user_id);
      void notifyManagersWorkerDoc([...new Set(managerIds)], doc);
      toast.success('Documento subido. RRHH / gestoría ya puede verlo.');
      setShowUpload(false);
      setName('');
      setFile(null);
      setDocumentType('dni_nie');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Layout title={t('worker.docs.title')} subtitle={t('worker.docs.subtitle')}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Sube tu DNI/NIE (foto anverso/reverso). Las nóminas las publica la empresa o gestoría.
          </p>
          <button type="button" onClick={() => setShowUpload(true)} className={VERTIAL_BTN_PRIMARY}>
            <Upload className="h-4 w-4" />
            Subir mi documento
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(Object.entries(CATEGORY_CONFIG) as [DocCategory, typeof CATEGORY_CONFIG['all']][]).map(
            ([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  activeCategory === key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {config.icon}
                {config.label}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeCategory === key ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  {categoryCounts[key]}
                </span>
              </button>
            ),
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('worker.docs.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3 animate-spin" />
              <p className="text-sm text-gray-400 dark:text-gray-500">Cargando documentos...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="p-12 text-center">
              <FolderOpen className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {documents.length === 0 ? t('worker.docs.noDocuments') : 'No se encontraron resultados'}
              </p>
              {documents.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Empieza subiendo tu DNI/NIE. Las nóminas aparecerán cuando las publique la empresa.
                </p>
              ) : null}
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div
                key={doc._id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
              >
                <div className="w-10 h-10 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
                  {getDocIcon(doc.documentType)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{doc.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(doc.createdAt)}
                    </span>
                    {doc.size ? <span className="text-xs text-gray-400">{formatBytes(doc.size)}</span> : null}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded">
                      {PAYROLL_DOC_TYPE_LABELS[doc.documentType]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.fileData
                  && doc.mimeType
                  && (doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf') ? (
                    <button
                      type="button"
                      onClick={() => handlePreview(doc)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      title={t('worker.docs.preview')}
                    >
                      <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  ) : null}
                  {doc.fileData ? (
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      className="inline-flex items-center gap-1.5 p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
                      title={t('worker.docs.download')}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showUpload ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setShowUpload(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-700 dark:bg-stone-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Subir mi documento</h2>
              <button type="button" onClick={() => setShowUpload(false)} className="rounded-lg p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800">
                <X className="h-4 w-4 text-stone-500" />
              </button>
            </div>
            <form onSubmit={handleUpload} className="space-y-3">
              <label className="block text-xs font-semibold text-stone-600">
                Tipo
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as PayrollDocumentType)}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-800"
                >
                  {WORKER_SELF_UPLOAD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PAYROLL_DOC_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-stone-600">
                Nombre *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. DNI anverso"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-800"
                />
              </label>
              <label className="block text-xs font-semibold text-stone-600">
                Archivo (foto o PDF) *
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
                  }}
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowUpload(false)} className={VERTIAL_BTN_SECONDARY}>
                  Cancelar
                </button>
                <button type="submit" disabled={uploading} className={`${VERTIAL_BTN_PRIMARY} flex-1`}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Subir
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
