import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { SAAS__UploadDocumentModal } from '../../components/design-system/SAAS__UploadDocumentModal';
import { SAAS__GenerateFromTemplateModal } from '../../components/design-system/SAAS__GenerateFromTemplateModal';
import { SAAS__SignDocumentModal } from '../../components/design-system/SAAS__SignDocumentModal';
import { SAAS__SendToGestoriaModal } from '../../components/design-system/SAAS__SendToGestoriaModal';
import { DOC_STATUS_TOKEN, type DocStatus } from '../../components/saas/DesignTokens';
import {
  FileText, Plus, Upload, File, Eye, PenTool, Send, Search, X,
  CheckCircle2, Clock, ArrowUpRight,
} from 'lucide-react';

type DocumentType = 'recepcion' | 'contrato' | 'hoja' | 'factura' | 'gestoria';

interface Document {
  id: string;
  name: string;
  type: DocumentType;
  vehicleId?: string;
  vehicleName?: string;
  clientId?: string;
  clientName?: string;
  status: DocStatus;
  date: string;
  responsible: string;
}

// ─── Badge de estado consistente ─────────────────────────────────────────────

function DocStatusBadge({ status }: { status: DocStatus }) {
  const t = DOC_STATUS_TOKEN[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full ${t.badgeBg} ${t.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.dot}`} />
      {t.label}
    </span>
  );
}

// ─── Tipo de documento — emojis e iconos ─────────────────────────────────────

const DOC_TYPE_META: Record<DocumentType, { label: string; emoji: string; iconBg: string }> = {
  recepcion: { label: 'Recepción',  emoji: '📥', iconBg: 'bg-slate-100' },
  contrato:  { label: 'Contrato',   emoji: '📄', iconBg: 'bg-blue-50' },
  hoja:      { label: 'Hoja',       emoji: '📋', iconBg: 'bg-amber-50' },
  factura:   { label: 'Factura',    emoji: '🧾', iconBg: 'bg-emerald-50' },
  gestoria:  { label: 'Gestoría',   emoji: '⚖️', iconBg: 'bg-violet-50' },
};

// ─── Fila de documento — mobile card ─────────────────────────────────────────

function DocMobileCard({ doc, onSign, onSend, onView }: {
  doc: Document;
  onSign: () => void; onSend: () => void; onView: () => void;
}) {
  const meta = DOC_TYPE_META[doc.type];
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl ${meta.iconBg}`}>
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{doc.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <DocStatusBadge status={doc.status} />
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(doc.date).toLocaleDateString('es-ES')}</span>
          </div>
        </div>
      </div>
      {(doc.vehicleName || doc.clientName) && (
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mb-3">
          {doc.vehicleName && <span className="flex items-center gap-1">🚗 {doc.vehicleName}</span>}
          {doc.clientName && <span className="flex items-center gap-1">👤 {doc.clientName}</span>}
        </div>
      )}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
        <button onClick={onView}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
          <Eye className="w-3.5 h-3.5" /> Ver
        </button>
        {doc.status === 'pending' && (
          <button onClick={onSign}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors">
            <PenTool className="w-3.5 h-3.5" /> Firmar
          </button>
        )}
        {doc.status === 'signed' && doc.type !== 'gestoria' && (
          <button onClick={onSend}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors">
            <Send className="w-3.5 h-3.5" /> Gestoría
          </button>
        )}
        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">{doc.responsible}</span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Documents() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { vehicles, clients } = useApp();
  const [activeTab, setActiveTab] = useState<DocumentType>('recepcion');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const allDocuments = useMemo<Document[]>(() => [
    { id: 'doc-1', name: 'Recepción BMW X3 2020',              type: 'recepcion', vehicleId: vehicles[0]?.id, vehicleName: `${vehicles[0]?.brand} ${vehicles[0]?.model}`, status: 'pending', date: '2024-03-07', responsible: 'Juan García' },
    { id: 'doc-2', name: 'Recepción Audi A4 2019',             type: 'recepcion', vehicleId: vehicles[1]?.id, vehicleName: `${vehicles[1]?.brand} ${vehicles[1]?.model}`, status: 'signed',  date: '2024-03-06', responsible: 'María López' },
    { id: 'doc-3', name: 'Contrato de compra - Mercedes C',    type: 'contrato',  vehicleId: vehicles[2]?.id, vehicleName: `${vehicles[2]?.brand} ${vehicles[2]?.model}`, clientId: clients[0]?.id, clientName: clients[0]?.name, status: 'signed',  date: '2024-03-05', responsible: 'Carlos Ruiz' },
    { id: 'doc-4', name: 'Contrato de venta - BMW X3',         type: 'contrato',  vehicleId: vehicles[0]?.id, vehicleName: `${vehicles[0]?.brand} ${vehicles[0]?.model}`, clientId: clients[1]?.id, clientName: clients[1]?.name, status: 'pending', date: '2024-03-04', responsible: 'Juan García' },
    { id: 'doc-5', name: 'Hoja de encargo - SUV Premium',      type: 'hoja',      clientId: clients[2]?.id,  clientName: clients[2]?.name, status: 'signed',  date: '2024-03-03', responsible: 'María López' },
    { id: 'doc-6', name: 'Factura #2024-001',                  type: 'factura',   vehicleId: vehicles[0]?.id, vehicleName: `${vehicles[0]?.brand} ${vehicles[0]?.model}`, clientId: clients[0]?.id, clientName: clients[0]?.name, status: 'sent',    date: '2024-03-02', responsible: 'Carlos Ruiz' },
    { id: 'doc-7', name: 'Factura #2024-002',                  type: 'factura',   vehicleId: vehicles[1]?.id, vehicleName: `${vehicles[1]?.brand} ${vehicles[1]?.model}`, clientId: clients[1]?.id, clientName: clients[1]?.name, status: 'signed',  date: '2024-03-01', responsible: 'Juan García' },
    { id: 'doc-8', name: 'Transferencia - BMW X3',             type: 'gestoria',  vehicleId: vehicles[0]?.id, vehicleName: `${vehicles[0]?.brand} ${vehicles[0]?.model}`, status: 'sent',    date: '2024-02-28', responsible: 'María López' },
  ], [vehicles, clients]);

  const filteredDocuments = useMemo(() => {
    return allDocuments.filter(doc => doc.type === activeTab).filter(doc => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return doc.name.toLowerCase().includes(q) || doc.vehicleName?.toLowerCase().includes(q) || doc.clientName?.toLowerCase().includes(q);
    });
  }, [allDocuments, activeTab, searchQuery]);

  const TABS: { id: DocumentType; label: string; emoji: string }[] = [
    { id: 'recepcion', label: 'Recepción', emoji: '📥' },
    { id: 'contrato',  label: 'Contratos', emoji: '📄' },
    { id: 'hoja',      label: 'Hojas',     emoji: '📋' },
    { id: 'factura',   label: 'Facturas',  emoji: '🧾' },
    { id: 'gestoria',  label: 'Gestoría',  emoji: '⚖️' },
  ];

  // Estadísticas globales
  const stats = [
    { label: 'Total docs',  value: allDocuments.length,                             iconBg: 'bg-gray-100 dark:bg-gray-700',   iconText: 'text-gray-500 dark:text-gray-400',   Icon: FileText,    valColor: 'text-gray-900 dark:text-gray-100' },
    { label: 'Pendientes',  value: allDocuments.filter(d => d.status === 'pending').length, iconBg: 'bg-amber-50',   iconText: 'text-amber-500',  Icon: Clock,       valColor: 'text-amber-600' },
    { label: 'Firmados',    value: allDocuments.filter(d => d.status === 'signed').length,  iconBg: 'bg-emerald-50', iconText: 'text-emerald-500',Icon: CheckCircle2,valColor: 'text-emerald-600' },
    { label: 'Enviados',    value: allDocuments.filter(d => d.status === 'sent').length,    iconBg: 'bg-blue-50',    iconText: 'text-blue-500',   Icon: ArrowUpRight,valColor: 'text-blue-600' },
  ];

  const openSign = (doc: Document) => { setSelectedDocument(doc); setShowSignModal(true); };
  const openSend = (doc: Document) => { setSelectedDocument(doc); setShowSendModal(true); };

  return (
    <Layout title={t('documents.title')} subtitle={t('documents.subtitle')}>
      <div className="space-y-4">

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(({ label, value, iconBg, iconText, Icon, valColor }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                <Icon className={`w-5 h-5 ${iconText}`} />
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
                <p className={`text-xl font-bold leading-none mt-0.5 ${valColor}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-0 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar documentos…"
              className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600"><X className="w-4 h-4" /></button>}
          </div>
          <button onClick={() => setShowGenerateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors flex-shrink-0">
            <File className="w-4 h-4" />
            <span className="hidden sm:inline">Generar plantilla</span>
          </button>
          <button onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Subir documento</span>
            <span className="sm:hidden">Subir</span>
          </button>
        </div>

        {/* ── Tabs de tipo ──────────────────────────────────────────────── */}
        <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden gap-1" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(tab => {
            const count = allDocuments.filter(d => d.type === tab.id).length;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border-2 ${
                  isActive ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Documentos: tabla desktop / tarjetas mobile ───────────────── */}
        <div>
          {/* Desktop: tabla */}
          <div className="hidden sm:block bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {['Documento', 'Vehículo', 'Cliente', 'Estado', 'Fecha', 'Responsable', 'Acciones'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredDocuments.length === 0 ? (
                    <tr><td colSpan={7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center text-2xl">
                          {DOC_TYPE_META[activeTab].emoji}
                        </div>
                        <p className="text-sm text-gray-400 dark:text-gray-500">No hay documentos de este tipo</p>
                      </div>
                    </td></tr>
                  ) : filteredDocuments.map(doc => {
                    const meta = DOC_TYPE_META[doc.type];
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${meta.iconBg}`}>
                              {meta.emoji}
                            </div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{doc.name}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4"><p className="text-sm text-gray-500 dark:text-gray-400">{doc.vehicleName || '—'}</p></td>
                        <td className="px-5 py-4"><p className="text-sm text-gray-500 dark:text-gray-400">{doc.clientName || '—'}</p></td>
                        <td className="px-5 py-4"><DocStatusBadge status={doc.status} /></td>
                        <td className="px-5 py-4"><p className="text-sm text-gray-400 dark:text-gray-500">{new Date(doc.date).toLocaleDateString('es-ES')}</p></td>
                        <td className="px-5 py-4"><p className="text-sm text-gray-500 dark:text-gray-400">{doc.responsible}</p></td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => navigate(`/saas/documents/${doc.id}`)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Ver detalle">
                              <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            </button>
                            {doc.status === 'pending' && (
                              <button onClick={() => openSign(doc)}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 transition-colors" title="Firmar">
                                <PenTool className="w-4 h-4 text-emerald-600" />
                              </button>
                            )}
                            {doc.status === 'signed' && doc.type !== 'gestoria' && (
                              <button onClick={() => openSend(doc)}
                                className="p-1.5 rounded-lg hover:bg-violet-50 transition-colors" title="Enviar a gestoría">
                                <Send className="w-4 h-4 text-violet-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: tarjetas de ancho completo */}
          <div className="sm:hidden space-y-2">
            {filteredDocuments.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 py-14 text-center">
                <div className="text-4xl mb-3">{DOC_TYPE_META[activeTab].emoji}</div>
                <p className="text-sm text-gray-400 dark:text-gray-500">No hay documentos de este tipo</p>
              </div>
            ) : filteredDocuments.map(doc => (
              <DocMobileCard
                key={doc.id}
                doc={doc}
                onSign={() => openSign(doc)}
                onSend={() => openSend(doc)}
                onView={() => navigate(`/saas/documents/${doc.id}`)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <SAAS__UploadDocumentModal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} onUpload={() => {}} clients={clients} />
      <SAAS__GenerateFromTemplateModal isOpen={showGenerateModal} onClose={() => setShowGenerateModal(false)} onGenerate={() => {}} vehicles={vehicles} clients={clients} />

      {selectedDocument && (
        <>
          <SAAS__SignDocumentModal isOpen={showSignModal} onClose={() => { setShowSignModal(false); setSelectedDocument(null); }} documentName={selectedDocument.name} onSign={() => { setShowSignModal(false); setSelectedDocument(null); }} />
          <SAAS__SendToGestoriaModal isOpen={showSendModal} onClose={() => { setShowSendModal(false); setSelectedDocument(null); }} documentName={selectedDocument.name} onSend={() => { setShowSendModal(false); setSelectedDocument(null); }} />
        </>
      )}
    </Layout>
  );
}
