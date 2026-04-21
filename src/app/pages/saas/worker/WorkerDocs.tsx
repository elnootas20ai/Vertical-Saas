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
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import {
  listPayrollDocumentsRequest,
  PAYROLL_DOC_TYPE_LABELS,
  type PayrollDocument,
  type PayrollDocumentType,
} from '../../../lib/payrollApi';

type DocCategory = 'all' | 'nomina' | 'contrato' | 'certificado' | 'baja' | 'otro';

const CATEGORY_CONFIG: Record<DocCategory, { label: string; icon: React.ReactNode; color: string }> = {
  all: { label: 'Todos', icon: <FolderOpen className="w-4 h-4" />, color: 'text-gray-600' },
  nomina: { label: 'Nóminas', icon: <Receipt className="w-4 h-4" />, color: 'text-emerald-600' },
  contrato: { label: 'Contratos', icon: <ScrollText className="w-4 h-4" />, color: 'text-blue-600' },
  certificado: { label: 'Certificados', icon: <ShieldCheck className="w-4 h-4" />, color: 'text-purple-600' },
  baja: { label: 'Baja / IT', icon: <FileText className="w-4 h-4" />, color: 'text-amber-600' },
  otro: { label: 'Otros', icon: <File className="w-4 h-4" />, color: 'text-gray-500' },
};

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

export function WorkerDocs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<DocCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState<PayrollDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDocuments = useCallback(async () => {
    if (!user?.user_id) return;
    setIsLoading(true);
    try {
      const docs = await listPayrollDocumentsRequest(user.user_id);
      setDocuments(docs);
    } catch {
      // show empty state on error
    } finally {
      setIsLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocs = documents
    .filter((doc) => activeCategory === 'all' || doc.documentType === activeCategory)
    .filter((doc) =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.fileName || '').toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const categoryCounts: Record<DocCategory, number> = {
    all: documents.length,
    nomina: documents.filter((d) => d.documentType === 'nomina').length,
    contrato: documents.filter((d) => d.documentType === 'contrato').length,
    certificado: documents.filter((d) => d.documentType === 'certificado').length,
    baja: documents.filter((d) => d.documentType === 'baja').length,
    otro: documents.filter((d) => d.documentType === 'otro').length,
  };

  const getDocIcon = (docType: PayrollDocumentType) => {
    switch (docType) {
      case 'nomina': return <Receipt className="w-5 h-5 text-emerald-500" />;
      case 'contrato': return <ScrollText className="w-5 h-5 text-blue-500" />;
      case 'certificado': return <ShieldCheck className="w-5 h-5 text-purple-500" />;
      case 'baja': return <FileText className="w-5 h-5 text-amber-500" />;
      default: return <File className="w-5 h-5 text-gray-400" />;
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

  const formatPeriod = (period?: string) => {
    if (!period) return '';
    const [year, month] = period.split('-');
    if (!year || !month) return period;
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
  };

  return (
    <Layout title={t('worker.docs.title')} subtitle={t('worker.docs.subtitle')}>
      <div className="space-y-5">
        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(Object.entries(CATEGORY_CONFIG) as [DocCategory, typeof CATEGORY_CONFIG['all']][]).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {config.icon}
              {config.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeCategory === key ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                {categoryCounts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
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

        {/* Documents list */}
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
              {documents.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Los documentos que suba la empresa aparecerán aquí automáticamente.
                </p>
              )}
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div key={doc._id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
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
                    {doc.period && (
                      <span className="text-xs text-gray-400">{formatPeriod(doc.period)}</span>
                    )}
                    {doc.size && (
                      <span className="text-xs text-gray-400">{formatBytes(doc.size)}</span>
                    )}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded">
                      {PAYROLL_DOC_TYPE_LABELS[doc.documentType]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {doc.fileData && doc.mimeType && (doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf') && (
                    <button
                      onClick={() => handlePreview(doc)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      title={t('worker.docs.preview')}
                    >
                      <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  )}
                  {doc.fileData && (
                    <button
                      onClick={() => handleDownload(doc)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      title={t('worker.docs.download')}
                    >
                      <Download className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
