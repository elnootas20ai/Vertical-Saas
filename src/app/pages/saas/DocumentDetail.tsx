import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { SAAS__SignDocumentModal } from '../../components/design-system/SAAS__SignDocumentModal';
import { SAAS__SendToAgencyModal } from '../../components/design-system/SAAS__SendToAgencyModal';
import { SAAS__EditDocumentModal } from '../../components/design-system/SAAS__EditDocumentModal';
import { DOCUMENTS_DB_NAME } from '../../lib/documentsApi';
import { authFetch, getAuthHeaders } from '../../lib/authApi';
import {
  ArrowLeft, FileText, Download, Edit2, Trash2, Send,
  CheckCircle, Clock, User, Car, Calendar, History,
  Eye, AlertCircle, Building2, Image, FileIcon
} from 'lucide-react';

const _env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
function _apiBase() {
  if (_env.VITE_API_URL) return _env.VITE_API_URL;
  const host = _env.VITE_API_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const proto = _env.VITE_API_PROTOCOL || (typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http');
  return `${proto}://${host}:${_env.VITE_API_PORT || '3001'}`;
}
function _couchHeaders() {
  const h: Record<string, string> = {};
  if (_env.VITE_COUCHDB_URL) h['x-couch-url'] = _env.VITE_COUCHDB_URL;
  if (_env.VITE_COUCHDB_USER) h['x-couch-user'] = _env.VITE_COUCHDB_USER;
  if (_env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = _env.VITE_COUCHDB_PASSWORD;
  return h;
}

interface AttachmentInfo {
  name: string;
  contentType: string;
  url: string;
}

type DocumentStatus = 'pending' | 'signed' | 'sent' | 'completed';
type DocumentCategory = 'society' | 'contracts' | 'licenses' | 'financial' | 'user-expenses' | 'other';

const VALID_CATEGORIES: DocumentCategory[] = ['society', 'contracts', 'licenses', 'financial', 'user-expenses', 'other'];

function normalizeCategory(type?: string): DocumentCategory {
  if (type && VALID_CATEGORIES.includes(type as DocumentCategory)) return type as DocumentCategory;
  const legacy: Record<string, DocumentCategory> = {
    reception: 'society', contract: 'contracts', worksheet: 'contracts',
    invoice: 'financial', agency: 'other',
  };
  return legacy[type || ''] || 'other';
}

interface ResolvedDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  status: DocumentStatus;
  vehicleId?: string;
  vehicleName?: string;
  costCenterId?: string;
  costCenterName?: string;
  responsible: string;
  createdAt: string;
  updatedAt: string;
  fileUrl?: string;
  notes?: string;
  templateId?: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  description: string;
  user: string;
  timestamp: string;
  icon: 'upload' | 'edit' | 'sign' | 'send' | 'complete';
}

const STATUS_CONFIG: Record<DocumentStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending:   { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-800 border-amber-200',   icon: Clock },
  signed:    { label: 'Firmado',    cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle },
  sent:      { label: 'Enviado',    cls: 'bg-blue-100 text-blue-800 border-blue-200',       icon: Send },
  completed: { label: 'Completado', cls: 'bg-violet-100 text-violet-800 border-violet-200', icon: CheckCircle },
};

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  society: 'Sociedad',
  contracts: 'Contratos y alquileres',
  licenses: 'Licencias',
  financial: 'Impuestos',
  'user-expenses': 'Gastos del usuario',
  other: 'Otros documentos',
};

const HISTORY_ICONS: Record<string, { Icon: typeof FileText; color: string }> = {
  upload:   { Icon: FileText,    color: 'bg-blue-100 text-blue-600' },
  edit:     { Icon: Edit2,       color: 'bg-amber-100 text-amber-600' },
  sign:     { Icon: CheckCircle, color: 'bg-emerald-100 text-emerald-600' },
  send:     { Icon: Send,        color: 'bg-blue-100 text-blue-600' },
  complete: { Icon: CheckCircle, color: 'bg-violet-100 text-violet-600' },
};

export function DocumentDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { vehicles, documents, user, updateDocument, deleteDocument } = useApp();
  const { workCenters } = useWorkCenters();
  const [showSignModal, setShowSignModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentInfo | null>(null);

  useEffect(() => {
    if (!id) return;
    const raw = documents.find(d => d.id === id);
    if (!raw?._id) return;

    const docId = encodeURIComponent(raw._id);
    const dbName = encodeURIComponent(DOCUMENTS_DB_NAME);
    authFetch(`${_apiBase()}/api/couch/doc/${dbName}/${docId}`, {
      headers: { ...getAuthHeaders(), ..._couchHeaders() },
    })
      .then(r => r.json())
      .then((couchDoc: any) => {
        if (couchDoc?._attachments) {
          const attachName = Object.keys(couchDoc._attachments)[0];
          if (attachName) {
            const meta = couchDoc._attachments[attachName];
            setAttachment({
              name: attachName,
              contentType: meta.content_type || 'application/octet-stream',
              url: `${_apiBase()}/api/couch/attachment/${dbName}/${docId}/${encodeURIComponent(attachName)}`,
            });
          }
        }
      })
      .catch(() => {});
  }, [id, documents]);

  const document = useMemo<ResolvedDocument | null>(() => {
    const raw = documents.find((d) => d.id === id);
    if (!raw) return null;

    const category = normalizeCategory(raw.type);
    const vehicle = vehicles.find((v) => v.id === raw.relatedToId);
    const costCenter = workCenters.find((wc) => wc.id === raw.relatedToId);
    const createdAt = raw.createdAt instanceof Date ? raw.createdAt.toISOString() : new Date().toISOString();

    return {
      id: raw.id,
      name: raw.name,
      category,
      status: raw.status as DocumentStatus,
      vehicleId: vehicle?.id,
      vehicleName: vehicle ? `${vehicle.brand} ${vehicle.model}` : undefined,
      costCenterId: costCenter?.id,
      costCenterName: costCenter?.name,
      responsible: user?.name || 'Sistema',
      createdAt,
      updatedAt: createdAt,
      templateId: raw.templateId,
    };
  }, [id, documents, vehicles, workCenters, user?.name]);

  const history = useMemo<HistoryEntry[]>(() => {
    if (!document) return [];

    const entries: HistoryEntry[] = [
      {
        id: 'h-1',
        action: 'Documento creado',
        description: document.templateId
          ? `Generado desde plantilla "${document.templateId}"`
          : 'Documento subido manualmente',
        user: document.responsible,
        timestamp: document.createdAt,
        icon: 'upload',
      },
    ];

    if (document.status === 'signed' || document.status === 'sent' || document.status === 'completed') {
      entries.push({
        id: 'h-2',
        action: 'Documento firmado',
        description: 'El documento fue marcado como firmado',
        user: document.responsible,
        timestamp: document.updatedAt,
        icon: 'sign',
      });
    }

    if (document.status === 'sent' || document.status === 'completed') {
      entries.push({
        id: 'h-3',
        action: 'Enviado a gestoría',
        description: 'Documento enviado para tramitación',
        user: document.responsible,
        timestamp: document.updatedAt,
        icon: 'send',
      });
    }

    if (document.status === 'completed') {
      entries.push({
        id: 'h-4',
        action: 'Proceso completado',
        description: 'Trámite finalizado correctamente',
        user: 'Sistema',
        timestamp: document.updatedAt,
        icon: 'complete',
      });
    }

    return entries.reverse();
  }, [document]);

  if (!document) {
    return (
      <Layout title="Documento no encontrado" subtitle="">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Documento no encontrado</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">El documento que buscas no existe o fue eliminado.</p>
          <button
            onClick={() => navigate('/saas/documents')}
            className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-medium transition-colors"
          >
            Volver a documentos
          </button>
        </div>
      </Layout>
    );
  }

  const statusConfig = STATUS_CONFIG[document.status];
  const StatusIcon = statusConfig.icon;

  const handleSign = async (data: any) => {
    await updateDocument(data.documentId, { status: 'signed' });
    setShowSignModal(false);
  };

  const handleSend = async (data: any) => {
    await updateDocument(data.documentId, { status: 'sent' });
    setShowSendModal(false);
  };

  const handleEdit = async (data: any) => {
    const updates: Record<string, any> = { name: data.name };
    if (data.category) updates.type = data.category;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.vehicleId) {
      updates.relatedTo = 'vehicle';
      updates.relatedToId = data.vehicleId;
    } else if (data.costCenterId) {
      updates.relatedTo = 'cost_center';
      updates.relatedToId = data.costCenterId;
    }
    await updateDocument(document.id, updates);
    setShowEditModal(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este documento? Esta acción no se puede deshacer.')) return;
    setIsDeleting(true);
    try {
      await deleteDocument(document.id);
      navigate('/saas/documents');
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <Layout title={document.name} subtitle={CATEGORY_LABELS[document.category]}>
      <div className="space-y-6">
        <button
          onClick={() => navigate('/saas/documents')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a documentos
        </button>

        {/* Header Card */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 sm:p-8 text-white">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold truncate">{document.name}</h1>
                  <div className="text-indigo-200 text-xs mt-1 font-mono">ID: {document.id}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-indigo-100 text-sm">
                {document.vehicleName && (
                  <div className="flex items-center gap-1.5">
                    <Car className="w-4 h-4" />
                    <span>{document.vehicleName}</span>
                  </div>
                )}
                {document.costCenterName && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4" />
                    <span>{document.costCenterName}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  <span>{document.responsible}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(document.createdAt).toLocaleDateString('es-ES')}</span>
                </div>
              </div>
            </div>
            <span className="px-4 py-2 rounded-full text-sm font-semibold bg-white/20 text-white border border-white/30 flex items-center gap-2 flex-shrink-0">
              <StatusIcon className="w-4 h-4" />
              {statusConfig.label}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Document Info */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Información del documento</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Categoría</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100 font-semibold">{CATEGORY_LABELS[document.category]}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Estado</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusConfig.cls}`}>
                    {statusConfig.label}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Responsable</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100 font-semibold">{document.responsible}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Creado</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{new Date(document.createdAt).toLocaleString('es-ES')}</p>
                </div>
                {document.vehicleName && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Vehículo</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 font-semibold">{document.vehicleName}</p>
                  </div>
                )}
                {document.costCenterName && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Centro de coste</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 font-semibold">{document.costCenterName}</p>
                  </div>
                )}
              </div>

              {document.notes && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Notas</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{document.notes}</p>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Vista previa</h3>
              {attachment ? (
                <div>
                  {attachment.contentType.startsWith('image/') ? (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="w-full max-h-[600px] object-contain"
                        crossOrigin="use-credentials"
                      />
                    </div>
                  ) : attachment.contentType === 'application/pdf' ? (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                      <iframe
                        src={attachment.url}
                        title={attachment.name}
                        className="w-full h-[600px] border-0"
                      />
                    </div>
                  ) : (
                    <div className="bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
                      <FileIcon className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{attachment.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{attachment.contentType}</p>
                    </div>
                  )}
                  <div className="flex justify-center mt-3">
                    <a
                      href={attachment.url}
                      download={attachment.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Descargar {attachment.name}
                    </a>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
                  <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Sin archivo adjunto</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Este documento no tiene un archivo asociado</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Acciones</h3>

              <div className="space-y-3">
                {document.status === 'pending' && (
                  <button
                    onClick={() => setShowSignModal(true)}
                    className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Marcar como firmado
                  </button>
                )}

                {document.status === 'signed' && document.category !== 'other' && (
                  <button
                    onClick={() => setShowSendModal(true)}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    Enviar a gestoría
                  </button>
                )}

                <button
                  onClick={() => setShowEditModal(true)}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-5 h-5" />
                  Editar
                </button>

                {attachment ? (
                  <a
                    href={attachment.url}
                    download={attachment.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Descargar
                  </a>
                ) : (
                  <button disabled className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 rounded-xl font-medium flex items-center justify-center gap-2 cursor-not-allowed opacity-50">
                    <Download className="w-5 h-5" />
                    Sin archivo
                  </button>
                )}

                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full px-4 py-3 border-2 border-red-200 dark:border-red-900 hover:border-red-300 text-red-600 dark:text-red-400 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-5 h-5" />
                  {isDeleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>

            {/* History */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                Historial
              </h3>

              <div className="space-y-4">
                {history.map((entry) => {
                  const iconConfig = HISTORY_ICONS[entry.icon] || HISTORY_ICONS.upload;
                  const Icon = iconConfig.Icon;

                  return (
                    <div key={entry.id} className="flex gap-3">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${iconConfig.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.action}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{entry.description}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                          {entry.user} &middot; {new Date(entry.timestamp).toLocaleString('es-ES')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSignModal && (
        <SAAS__SignDocumentModal
          isOpen={showSignModal}
          onClose={() => setShowSignModal(false)}
          document={document}
          onSign={handleSign}
        />
      )}

      {showSendModal && (
        <SAAS__SendToAgencyModal
          isOpen={showSendModal}
          onClose={() => setShowSendModal(false)}
          document={document}
          onSend={handleSend}
        />
      )}

      {showEditModal && (
        <SAAS__EditDocumentModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={handleEdit}
          document={document}
          costCenters={workCenters || []}
          vehicles={vehicles || []}
        />
      )}
    </Layout>
  );
}


