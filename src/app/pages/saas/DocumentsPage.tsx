import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { DOC_STATUS_TOKEN } from '../../components/saas/DesignTokens';
import { SAAS__UploadDocumentModal } from '../../components/design-system/SAAS__UploadDocumentModal';
import { SAAS__GenerateFromTemplateModal } from '../../components/design-system/SAAS__GenerateFromTemplateModal';
import { SAAS__SignDocumentModal } from '../../components/design-system/SAAS__SignDocumentModal';
import { SAAS__SendToAgencyModal } from '../../components/design-system/SAAS__SendToAgencyModal';
import { SAAS__EditDocumentModal } from '../../components/design-system/SAAS__EditDocumentModal';
import { SAAS__OcrScanModal } from '../../components/design-system/SAAS__OcrScanModal';
import { DOCUMENTS_DB_NAME, createDocumentRequest, type CompraventaDocCategory } from '../../lib/documentsApi';
import { authFetch, getAuthHeaders } from '../../lib/authApi';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { useBusiness } from '../../context/BusinessContext';
import {
  FileText, Upload, Plus, Search, Eye, Send, Edit2,
  CheckCircle, Car, User, Download, ScanLine, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, X, AlertTriangle, Clock,
  Building2, CalendarClock, IdCard, ClipboardList, Receipt,
  ShieldCheck, Wrench, FileCheck, UserCheck, Paperclip, Shield,
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentStatus   = 'pending' | 'signed' | 'sent' | 'completed';
export type DocumentCategory = 'society' | 'contracts' | 'licenses' | 'financial' | 'user-expenses' | 'other';
type SortField = 'name' | 'date' | 'status';
type SortDir   = 'asc' | 'desc';

export interface DocView {
  id: string;
  name: string;
  category: DocumentCategory;
  docSubCategory?: CompraventaDocCategory;
  status: DocumentStatus;
  vehicleId?: string;
  vehicleName?: string;
  registrationPlate?: string;
  vin?: string;
  clientName?: string;
  supplierName?: string;
  costCenterId?: string;
  costCenterName?: string;
  responsible: string;
  createdAt: string;
  updatedAt: string;
  fileUrl?: string;
  notes?: string;
  expiresAt?: string;
  itvExpiryDate?: string;
  ocrConfidence?: number;
  archived?: boolean;
}

const VALID_CATEGORIES: DocumentCategory[] = ['society', 'contracts', 'licenses', 'financial', 'user-expenses', 'other'];
const ALL_STATUSES: DocumentStatus[] = ['pending', 'signed', 'sent', 'completed'];

function normalizeCategory(type?: string): DocumentCategory {
  if (type && VALID_CATEGORIES.includes(type as DocumentCategory)) return type as DocumentCategory;
  const legacy: Record<string, DocumentCategory> = {
    reception: 'society', contract: 'contracts', worksheet: 'contracts',
    invoice: 'financial', agency: 'other',
  };
  return legacy[type || ''] || 'other';
}

function inferCategoryFromTemplate(templateId: string): DocumentCategory {
  if (templateId.startsWith('factura')) return 'financial';
  if (templateId.startsWith('hoja') || templateId.startsWith('contrato')) return 'contracts';
  return 'other';
}

function inferNameFromTemplate(templateId: string): string {
  const map: Record<string, string> = {
    'contrato-compraventa': 'Contrato de compraventa',
    'contrato-reserva': 'Contrato de reserva',
    'hoja-encargo-transferencia': 'Hoja de encargo - Transferencia',
    'hoja-encargo-baja': 'Hoja de encargo - Baja',
    'factura-venta': 'Factura de venta',
  };
  return map[templateId] || `Documento ${templateId}`;
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

const DOC_TOKEN: Record<DocumentStatus, {
  label: string; dot: string; badgeBg: string; badgeText: string; accentBorder: string;
}> = {
  pending:   { ...DOC_STATUS_TOKEN.pending,  accentBorder: 'border-l-amber-500' },
  signed:    { ...DOC_STATUS_TOKEN.signed,   accentBorder: 'border-l-emerald-500' },
  sent:      { ...DOC_STATUS_TOKEN.sent,     accentBorder: 'border-l-blue-500' },
  completed: { label: 'Completado', dot: 'bg-violet-500', badgeBg: 'bg-violet-50 dark:bg-violet-950', badgeText: 'text-violet-700 dark:text-violet-300', accentBorder: 'border-l-violet-500' },
};

const REQUIRED_DOCS: Record<string, string[]> = {
  licenses: ['Licencia de Apertura', 'Licencia de Actividad'],
  society: ['Estatutos', 'CIF', 'IAE'],
};

interface DocAlert {
  id: string;
  type: 'expired' | 'expiring_soon' | 'stale_pending' | 'missing_required';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  category?: string;
  actionUrl?: string;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  critical: { bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-300', icon: 'text-red-500' },
  warning:  { bg: 'bg-orange-50 dark:bg-orange-950', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', icon: 'text-orange-500' },
  info:     { bg: 'bg-blue-50 dark:bg-blue-950', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', icon: 'text-blue-500' },
};

function AlertsBanner({ alerts, onDismissAll, navigate, onUploadMissing }: {
  alerts: DocAlert[];
  onDismissAll: () => void;
  navigate: (url: string) => void;
  onUploadMissing: () => void;
}) {
  if (alerts.length === 0) return null;
  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');
  const infos    = alerts.filter(a => a.severity === 'info');
  const groups = [
    { items: critical, label: 'Críticas', severity: 'critical' as const },
    { items: warnings, label: 'Avisos', severity: 'warning' as const },
    { items: infos, label: 'Información', severity: 'info' as const },
  ].filter(g => g.items.length > 0);

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const style = SEVERITY_STYLES[group.severity];
        return (
          <div key={group.severity} className={`${style.bg} ${style.border} border rounded-2xl overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 ${style.icon}`} />
                <span className={`text-xs font-bold ${style.text}`}>{group.label} ({group.items.length})</span>
              </div>
              <button onClick={onDismissAll} className={`p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors ${style.text}`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {group.items.slice(0, 5).map(alert => (
                <div key={alert.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <p className={`text-xs ${style.text} truncate`}>{alert.message}</p>
                  {alert.type === 'missing_required' ? (
                    <button
                      onClick={onUploadMissing}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex-shrink-0 ${
                        group.severity === 'critical' ? 'bg-red-600 hover:bg-red-700 text-white'
                        : group.severity === 'warning' ? 'bg-orange-600 hover:bg-orange-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      <Upload className="w-3 h-3" />
                      Subir
                    </button>
                  ) : alert.actionUrl ? (
                    <button
                      onClick={() => navigate(alert.actionUrl!)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex-shrink-0 ${
                        group.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60'
                        : group.severity === 'warning' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/60'
                        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      Ver
                    </button>
                  ) : null}
                </div>
              ))}
              {group.items.length > 5 && (
                <div className="px-4 py-2">
                  <p className={`text-[11px] ${style.text} opacity-70`}>+{group.items.length - 5} más</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TAB_DEFS: { id: DocumentCategory; label: string; title: string; subtitle: string }[] = [
  { id: 'society',       label: 'Sociedad',               title: 'Sociedad',               subtitle: 'Documentos de sociedad y constitución' },
  { id: 'contracts',     label: 'Contratos y alquileres',  title: 'Contratos y Alquileres',  subtitle: 'Gestión de contratos y arrendamientos' },
  { id: 'licenses',      label: 'Licencias',              title: 'Licencias',              subtitle: 'Licencias y permisos' },
  { id: 'financial',     label: 'Impuestos',              title: 'Impuestos',              subtitle: 'Modelos de impuestos subidos por el usuario o la gestoría' },
  { id: 'user-expenses', label: 'Gastos del usuario',     title: 'Gastos del Usuario',     subtitle: 'Control de gastos y dietas' },
  { id: 'other',         label: 'Otros documentos',       title: 'Otros Documentos',       subtitle: 'Documentación general' },
];

interface CompraventaTab {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  subCategories: CompraventaDocCategory[];
}

const COMPRAVENTA_TAB_DEFS: CompraventaTab[] = [
  { id: 'vehiculo',   label: 'Vehículo',     title: 'Documentación del vehículo',  subtitle: 'Permiso, ficha técnica, informe tráfico',      icon: <Car className="w-4 h-4" />,           subCategories: ['permiso_circulacion', 'ficha_tecnica', 'informe_trafico'] },
  { id: 'contratos',  label: 'Contratos',     title: 'Contratos',                    subtitle: 'Compra, venta y reserva',                       icon: <ClipboardList className="w-4 h-4" />, subCategories: ['contrato_compra', 'contrato_venta'] },
  { id: 'facturas',   label: 'Facturas',      title: 'Facturas',                     subtitle: 'Facturas de compra y venta',                    icon: <Receipt className="w-4 h-4" />,       subCategories: ['factura_compra', 'factura_venta'] },
  { id: 'itv',        label: 'ITV y seguro',  title: 'ITV y Seguros',                subtitle: 'Inspecciones técnicas y pólizas',               icon: <ShieldCheck className="w-4 h-4" />,   subCategories: ['itv', 'seguro'] },
  { id: 'reparacion', label: 'Reparaciones',  title: 'Reparaciones',                 subtitle: 'Informes de taller y preparación',              icon: <Wrench className="w-4 h-4" />,        subCategories: ['reparacion'] },
  { id: 'cliente',    label: 'Docs cliente',  title: 'Documentos del cliente',       subtitle: 'DNI, NIE, CIF, mandato SEPA, justificantes',   icon: <UserCheck className="w-4 h-4" />,     subCategories: ['doc_cliente', 'justificante'] },
  { id: 'anexos',     label: 'Anexos',        title: 'Anexos y otros',               subtitle: 'Documentación adicional',                       icon: <Paperclip className="w-4 h-4" />,     subCategories: ['anexo', 'otro'] },
];

const DOC_SUB_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  permiso_circulacion: <IdCard className="w-4 h-4" />,
  ficha_tecnica: <ClipboardList className="w-4 h-4" />,
  contrato_compra: <FileText className="w-4 h-4" />,
  contrato_venta: <FileText className="w-4 h-4" />,
  factura_compra: <Receipt className="w-4 h-4" />,
  factura_venta: <Receipt className="w-4 h-4" />,
  itv: <ShieldCheck className="w-4 h-4" />,
  reparacion: <Wrench className="w-4 h-4" />,
  justificante: <FileCheck className="w-4 h-4" />,
  doc_cliente: <UserCheck className="w-4 h-4" />,
  anexo: <Paperclip className="w-4 h-4" />,
  seguro: <Shield className="w-4 h-4" />,
  informe_trafico: <FileText className="w-4 h-4" />,
  otro: <FileText className="w-4 h-4" />,
};

const DOC_SUB_CATEGORY_LABELS: Record<string, string> = {
  permiso_circulacion: 'Permiso circulación',
  ficha_tecnica: 'Ficha técnica',
  contrato_compra: 'Contrato compra',
  contrato_venta: 'Contrato venta',
  factura_compra: 'Factura compra',
  factura_venta: 'Factura venta',
  itv: 'ITV',
  reparacion: 'Reparación',
  justificante: 'Justificante',
  doc_cliente: 'Doc. cliente',
  anexo: 'Anexo',
  seguro: 'Seguro',
  informe_trafico: 'Informe tráfico',
  otro: 'Otro',
};

// ─── Small components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DocumentStatus }) {
  const t = DOC_TOKEN[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${t.badgeBg} ${t.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.dot}`} />
      {t.label}
    </span>
  );
}

function DocIcon({ status }: { status: DocumentStatus }) {
  const colors: Record<DocumentStatus, string> = {
    pending:   'bg-amber-50 dark:bg-amber-950 text-amber-500',
    signed:    'bg-emerald-50 dark:bg-emerald-950 text-emerald-500',
    sent:      'bg-blue-50 dark:bg-blue-950 text-blue-500',
    completed: 'bg-violet-50 dark:bg-violet-950 text-violet-500',
  };
  return (
    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${colors[status]}`}>
      <FileText className="w-5 h-5" />
    </div>
  );
}

function ExpiryBadge({ expiresAt }: { expiresAt?: string }) {
  if (!expiresAt) return null;
  const now = new Date();
  const exp = new Date(expiresAt);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);

  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
        <AlertTriangle className="w-3 h-3" /> Caducado
      </span>
    );
  }
  if (daysLeft <= 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
        <Clock className="w-3 h-3" /> {daysLeft}d
      </span>
    );
  }
  return (
    <span className="text-[10px] text-gray-400 dark:text-gray-500">
      {exp.toLocaleDateString('es-ES')}
    </span>
  );
}

function SortIcon({ field, activeField, dir }: { field: SortField; activeField: SortField; dir: SortDir }) {
  if (field !== activeField) return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DocumentsPage() {
  const navigate  = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { vehicles, clients, user, documents, addDocument, updateDocument } = useApp();
  const { workCenters } = useWorkCenters();
  const { currentBusiness } = useBusiness();

  const isCompraventa = currentBusiness?.businessType === 'carDealership';
  const userRole = (user as any)?.role || '';
  const isManager = ['Admin', 'Gerente', 'admin', 'gerente', 'owner'].includes(userRole);
  const isWorkerMode = !isManager;

  // Tab
  const tabFromUrl = searchParams.get('tab');
  const validCompraventaTabs = COMPRAVENTA_TAB_DEFS.map(t => t.id);
  const initialTab: string = tabFromUrl
    ? (isCompraventa
        ? (validCompraventaTabs.includes(tabFromUrl) ? tabFromUrl : 'vehiculo')
        : (VALID_CATEGORIES.includes(tabFromUrl as DocumentCategory) ? tabFromUrl : 'society'))
    : (isCompraventa ? 'vehiculo' : 'society');

  const [activeTab, setActiveTabState] = useState<string>(initialTab);

  useEffect(() => {
    if (tabFromUrl) {
      if (isCompraventa && validCompraventaTabs.includes(tabFromUrl)) {
        setActiveTabState(tabFromUrl);
      } else if (!isCompraventa && VALID_CATEGORIES.includes(tabFromUrl as DocumentCategory)) {
        setActiveTabState(tabFromUrl);
      }
    }
  }, [tabFromUrl, isCompraventa]);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    next.delete('status');
    setSearchParams(next);
  };

  // Filters
  const [searchQuery,  setSearchQuery]  = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [showFilters,  setShowFilters]  = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir,   setSortDir]   = useState<SortDir>('desc');

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField]);

  // Modals
  const [showUpload,   setShowUpload]   = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showOcr,      setShowOcr]      = useState(false);
  const [showSign,     setShowSign]     = useState(false);
  const [showSend,     setShowSend]     = useState(false);
  const [showEdit,     setShowEdit]     = useState(false);
  const [selectedDoc,  setSelectedDoc]  = useState<DocView | null>(null);

  // Sync status filter from URL
  useEffect(() => {
    const s = searchParams.get('status');
    if (s && ALL_STATUSES.includes(s as DocumentStatus)) {
      setStatusFilter(s as DocumentStatus);
      setShowFilters(true);
    }
  }, [searchParams]);

  // ── Map documents ─────────────────────────────────────────────────────────

  const allDocuments = useMemo<DocView[]>(() => {
    return documents.map((doc) => {
      const category = normalizeCategory(doc.type);
      const vehicle = vehicles.find((v) => v.id === doc.relatedToId);
      const costCenter = workCenters.find((wc) => wc.id === doc.relatedToId);
      const createdAt = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date().toISOString();
      const raw = doc as any;

      return {
        id: doc.id,
        name: doc.name,
        category,
        docSubCategory: raw.docSubCategory || 'otro',
        status: doc.status as DocumentStatus,
        vehicleId: vehicle?.id || raw.vehicleId,
        vehicleName: vehicle ? `${vehicle.brand} ${vehicle.model}` : (raw.vehicleName || undefined),
        registrationPlate: raw.registrationPlate || vehicle?.registrationPlate || undefined,
        vin: raw.vin || undefined,
        clientName: raw.clientName || undefined,
        supplierName: raw.supplierName || undefined,
        costCenterId: costCenter?.id,
        costCenterName: costCenter?.name,
        responsible: user?.name || 'Sistema',
        createdAt,
        updatedAt: createdAt,
        expiresAt: raw.expiresAt || undefined,
        itvExpiryDate: raw.itvExpiryDate || undefined,
        ocrConfidence: raw.ocrConfidence || 0,
        archived: raw.archived || false,
      };
    });
  }, [documents, vehicles, workCenters, user?.name]);

  // ── Filter & Sort ─────────────────────────────────────────────────────────

  const byTab = useMemo(() => {
    if (isCompraventa) {
      const tabDef = COMPRAVENTA_TAB_DEFS.find(t => t.id === activeTab);
      if (!tabDef) return allDocuments;
      return allDocuments.filter(d => tabDef.subCategories.includes(d.docSubCategory as CompraventaDocCategory));
    }
    return allDocuments.filter(d => d.category === activeTab);
  }, [allDocuments, activeTab, isCompraventa]);

  const filtered = useMemo(() => {
    let result = byTab;

    if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.vehicleName?.toLowerCase().includes(q) ||
        d.registrationPlate?.toLowerCase().includes(q) ||
        d.vin?.toLowerCase().includes(q) ||
        d.clientName?.toLowerCase().includes(q) ||
        d.supplierName?.toLowerCase().includes(q) ||
        d.costCenterName?.toLowerCase().includes(q) ||
        d.responsible.toLowerCase().includes(q)
      );
    }

    const statusOrder: Record<string, number> = { pending: 0, signed: 1, sent: 2, completed: 3 };
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'status') cmp = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
      else cmp = a.createdAt.localeCompare(b.createdAt);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [byTab, statusFilter, searchQuery, sortField, sortDir]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const tabCount = (tabId: string) => {
    if (isCompraventa) {
      const tabDef = COMPRAVENTA_TAB_DEFS.find(t => t.id === tabId);
      if (!tabDef) return 0;
      return allDocuments.filter(d => tabDef.subCategories.includes(d.docSubCategory as CompraventaDocCategory)).length;
    }
    return allDocuments.filter(d => d.category === tabId).length;
  };
  const statusCount = (s: DocumentStatus) => byTab.filter(d => d.status === s).length;

  const expiredCount = useMemo(() => {
    const now = new Date();
    return byTab.filter(d => d.expiresAt && new Date(d.expiresAt) < now).length;
  }, [byTab]);

  const expiringCount = useMemo(() => {
    const now = new Date();
    const limit = new Date(now.getTime() + 30 * 86400000);
    return byTab.filter(d => {
      if (!d.expiresAt) return false;
      const exp = new Date(d.expiresAt);
      return exp >= now && exp <= limit;
    }).length;
  }, [byTab]);

  const hasActiveFilters = statusFilter !== 'all' || searchQuery.length > 0;

  // ── Alerts (computed client-side) ─────────────────────────────────────────

  const [alertsDismissed, setAlertsDismissed] = useState(false);

  const docAlerts = useMemo<DocAlert[]>(() => {
    if (alertsDismissed) return [];
    const now = new Date();
    const result: DocAlert[] = [];

    for (const doc of allDocuments) {
      if (doc.expiresAt) {
        const exp = new Date(doc.expiresAt);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
        if (daysLeft < 0) {
          result.push({ id: `exp-${doc.id}`, type: 'expired', severity: 'critical', message: `"${doc.name}" ha caducado hace ${Math.abs(daysLeft)} días`, category: doc.category, actionUrl: `/saas/documents/${doc.id}` });
        } else if (daysLeft <= 30) {
          result.push({ id: `expw-${doc.id}`, type: 'expiring_soon', severity: 'warning', message: `"${doc.name}" vence en ${daysLeft} días`, category: doc.category, actionUrl: `/saas/documents/${doc.id}` });
        }
      }

      if (doc.status === 'pending' && doc.createdAt) {
        const created = new Date(doc.createdAt);
        const daysPending = Math.ceil((now.getTime() - created.getTime()) / 86400000);
        if (daysPending > 15 && (doc.category === 'contracts' || doc.category === 'licenses')) {
          result.push({ id: `stale-${doc.id}`, type: 'stale_pending', severity: 'warning', message: `"${doc.name}" lleva pendiente ${daysPending} días`, category: doc.category, actionUrl: `/saas/documents/${doc.id}` });
        }
      }
    }

    const existingNames = allDocuments.map(d => d.name.toLowerCase().trim());
    for (const [category, required] of Object.entries(REQUIRED_DOCS)) {
      for (const reqName of required) {
        if (!existingNames.includes(reqName.toLowerCase())) {
          result.push({ id: `miss-${category}-${reqName}`, type: 'missing_required', severity: 'info', message: `Falta documento obligatorio: "${reqName}"`, category, actionUrl: `/saas/documents?tab=${category}` });
        }
      }
    }

    return result.sort((a, b) => {
      const sev: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      return (sev[a.severity] || 9) - (sev[b.severity] || 9);
    });
  }, [allDocuments, alertsDismissed]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openSign = (doc: DocView) => { setSelectedDoc(doc); setShowSign(true); };
  const openSend = (doc: DocView) => { setSelectedDoc(doc); setShowSend(true); };
  const openEdit = (doc: DocView) => { setSelectedDoc(doc); setShowEdit(true); };

  const handleGenerateFromTemplate = async (payload: any) => {
    const category = inferCategoryFromTemplate(payload.templateId);
    const name = inferNameFromTemplate(payload.templateId);
    const relatedTo = payload.vehicleId ? 'vehicle' : payload.clientId ? 'client' : undefined;
    const relatedToId = payload.vehicleId || payload.clientId || undefined;
    await addDocument({ name, type: category, status: 'pending', relatedTo, relatedToId, templateId: payload.templateId });
    setShowGenerate(false);
  };

  const handleUploadDocument = async (payload: any) => {
    const relatedTo = payload.costCenterId ? 'cost_center' : undefined;
    const relatedToId = payload.costCenterId || undefined;
    await addDocument({ name: payload.name, type: normalizeCategory(payload.category), status: 'pending', relatedTo, relatedToId });
    setShowUpload(false);
  };

  const handleOcrDocument = async (payload: any) => {
    const userId = user?.id || 'guest';
    const fileName = payload.file ? (payload.file as File).name.replace(/[^a-zA-Z0-9._-]/g, '-') : 'scan';
    const record = await createDocumentRequest(userId, {
      user_id: userId, name: payload.name, docType: payload.type, status: 'pending',
      relatedTo: payload.relatedTo, relatedToId: payload.relatedToId,
      ocrData: payload.ocrData, mimeType: payload.fileMimeType || undefined, fileName,
    });
    if (payload.fileBase64 && record._id && record._rev) {
      try {
        const buf = Uint8Array.from(atob(payload.fileBase64), c => c.charCodeAt(0));
        await authFetch(
          `${_apiBase()}/api/couch/attachment/${encodeURIComponent(DOCUMENTS_DB_NAME)}/${encodeURIComponent(record._id)}/${encodeURIComponent(fileName)}?rev=${encodeURIComponent(record._rev)}`,
          { method: 'PUT', headers: { 'Content-Type': payload.fileMimeType || 'application/octet-stream', ...getAuthHeaders(), ..._couchHeaders() }, body: buf },
        );
      } catch (e) { console.error('Error uploading OCR attachment:', e); }
    }
    navigate('/saas/documents');
    window.location.reload();
  };

  const handleSignDocument = async (payload: any) => {
    await updateDocument(payload.documentId, { status: 'signed' });
    setShowSign(false); setSelectedDoc(null);
  };

  const handleSendToAgency = async (payload: any) => {
    await updateDocument(payload.documentId, { status: 'sent' });
    setShowSend(false); setSelectedDoc(null);
  };

  const handleEditDocument = async (payload: any) => {
    const updates: Record<string, any> = { name: payload.name };
    if (payload.category) updates.type = payload.category;
    if (payload.notes !== undefined) updates.notes = payload.notes;
    if (payload.vehicleId) {
      updates.relatedTo = 'vehicle';
      updates.relatedToId = payload.vehicleId;
    } else if (payload.costCenterId) {
      updates.relatedTo = 'cost_center';
      updates.relatedToId = payload.costCenterId;
    }
    await updateDocument(payload.id, updates);
    setShowEdit(false); setSelectedDoc(null);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const currentCompraventaTab = isCompraventa ? COMPRAVENTA_TAB_DEFS.find(t => t.id === activeTab) : null;
  const currentGenericTab = !isCompraventa ? TAB_DEFS.find(t => t.id === activeTab) : null;
  const pageTitle = currentCompraventaTab?.title || currentGenericTab?.title || 'Documentación';
  const pageSubtitle = currentCompraventaTab?.subtitle || currentGenericTab?.subtitle || 'Gestión documental';
  const thCls = 'px-5 py-3.5 text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider';

  return (
    <Layout title={pageTitle} subtitle={pageSubtitle}>
      <div className="space-y-4">

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={isCompraventa ? "Buscar por matrícula, bastidor, cliente, proveedor..." : "Buscar por nombre, vehículo, centro de coste..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-400 focus:outline-none text-sm transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 border-2 rounded-xl text-sm font-semibold transition-colors flex-shrink-0 ${
              hasActiveFilters
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtros</span>
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-blue-500" />}
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors flex-shrink-0">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Subir</span>
          </button>
          {isManager && (
            <button onClick={() => setShowGenerate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Plantilla</span>
            </button>
          )}
          <button onClick={() => setShowOcr(true)} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0">
            <ScanLine className="w-4 h-4" />
            <span className="hidden sm:inline">OCR</span>
          </button>
        </div>

        {/* ── Alerts banner ── */}
        <AlertsBanner alerts={docAlerts} onDismissAll={() => setAlertsDismissed(true)} navigate={navigate} onUploadMissing={() => setShowUpload(true)} />

        {/* ── Filter bar ── */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mr-1">Estado:</span>
            {(['all', ...ALL_STATUSES] as const).map(s => {
              const label = s === 'all' ? 'Todos' : DOC_TOKEN[s].label;
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-400'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            {hasActiveFilters && (
              <button onClick={clearFilters} className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {isCompraventa ? (
            COMPRAVENTA_TAB_DEFS.map((tab, i) => {
              const isActive = activeTab === tab.id;
              const count = tabCount(tab.id);
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
                  className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                  } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
                >
                  <span className={isActive ? 'text-amber-600' : 'text-gray-400 dark:text-gray-600'}>{tab.icon}</span>
                  {tab.label}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}>
                    {count}
                  </span>
                  {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />}
                </button>
              );
            })
          ) : (
            TAB_DEFS.map((tab, i) => {
              const isActive = activeTab === tab.id;
              const count = tabCount(tab.id);
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
                  className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                  } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
                >
                  {tab.label}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}>
                    {count}
                  </span>
                  {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />}
                </button>
              );
            })
          )}
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {(isCompraventa ? [
            { label: 'En esta pestaña', value: byTab.length,                                                                  color: 'text-gray-900 dark:text-gray-100' },
            { label: 'Borradores',      value: byTab.filter(d => d.status === 'pending').length,                               color: 'text-amber-600' },
            { label: 'Firmados',        value: byTab.filter(d => d.status === 'signed' || d.status === 'sent').length,          color: 'text-emerald-600' },
            { label: 'Con vehículo',    value: byTab.filter(d => d.vehicleId).length,                                          color: 'text-blue-600' },
            { label: 'ITV caducada',    value: byTab.filter(d => d.itvExpiryDate && new Date(d.itvExpiryDate) < new Date()).length, color: byTab.some(d => d.itvExpiryDate && new Date(d.itvExpiryDate) < new Date()) ? 'text-red-600' : 'text-gray-400 dark:text-gray-500' },
            { label: 'OCR procesados',  value: byTab.filter(d => d.ocrConfidence && d.ocrConfidence > 0).length,               color: 'text-violet-600' },
          ] : [
            { label: 'Total',       value: byTab.length,                                   color: 'text-gray-900 dark:text-gray-100' },
            { label: 'Pendientes',  value: statusCount('pending'),                         color: 'text-amber-600' },
            { label: 'Firmados',    value: statusCount('signed'),                          color: 'text-emerald-600' },
            { label: 'Completados', value: statusCount('completed') + statusCount('sent'), color: 'text-blue-600' },
            { label: 'Caducados',   value: expiredCount,                                   color: expiredCount > 0 ? 'text-red-600' : 'text-gray-400 dark:text-gray-500' },
            { label: 'Por vencer',  value: expiringCount,                                  color: expiringCount > 0 ? 'text-orange-600' : 'text-gray-400 dark:text-gray-500' },
          ]).map(stat => (
            <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* ── Result count ── */}
        {hasActiveFilters && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mostrando <span className="font-semibold text-gray-700 dark:text-gray-300">{filtered.length}</span> de {byTab.length} documentos
          </p>
        )}

        {/* ── Document list ── */}
        {filtered.length > 0 ? (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className={`${thCls} cursor-pointer group/th`} onClick={() => toggleSort('name')}>
                      <span className="flex items-center gap-1">Documento <SortIcon field="name" activeField={sortField} dir={sortDir} /></span>
                    </th>
                    <th className={thCls}>{isCompraventa ? 'Vehículo / Matrícula' : 'Vehículo / Centro'}</th>
                    <th className={`${thCls} cursor-pointer group/th`} onClick={() => toggleSort('status')}>
                      <span className="flex items-center gap-1">Estado <SortIcon field="status" activeField={sortField} dir={sortDir} /></span>
                    </th>
                    <th className={thCls}>Vencimiento</th>
                    <th className={`${thCls} cursor-pointer group/th`} onClick={() => toggleSort('date')}>
                      <span className="flex items-center gap-1">Fecha <SortIcon field="date" activeField={sortField} dir={sortDir} /></span>
                    </th>
                    <th className={`${thCls} text-center`}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {filtered.map(doc => {
                    const t = DOC_TOKEN[doc.status];
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => navigate(`/saas/documents/${doc.id}`)}
                        className={`group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-l-4 ${t.accentBorder} cursor-pointer`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <DocIcon status={doc.status} />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">{doc.name}</p>
                              {isCompraventa && doc.docSubCategory && doc.docSubCategory !== 'otro' ? (
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                                  <span className="text-gray-400">{DOC_SUB_CATEGORY_ICONS[doc.docSubCategory]}</span>
                                  {DOC_SUB_CATEGORY_LABELS[doc.docSubCategory] || doc.docSubCategory}
                                </p>
                              ) : (
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">ID: {doc.id.slice(0, 12)}...</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {isCompraventa ? (
                            doc.registrationPlate ? (
                              <div>
                                <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-mono font-bold rounded-lg">{doc.registrationPlate}</span>
                                {doc.vehicleName && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{doc.vehicleName}</p>}
                              </div>
                            ) : doc.vehicleName ? (
                              <div className="flex items-center gap-1.5">
                                <Car className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{doc.vehicleName}</span>
                              </div>
                            ) : <span className="text-sm text-gray-300 dark:text-gray-600">&mdash;</span>
                          ) : (
                            doc.vehicleName ? (
                              <div className="flex items-center gap-1.5">
                                <Car className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{doc.vehicleName}</span>
                              </div>
                            ) : doc.costCenterName ? (
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{doc.costCenterName}</span>
                              </div>
                            ) : <span className="text-sm text-gray-300 dark:text-gray-600">&mdash;</span>
                          )}
                        </td>
                        <td className="px-5 py-4"><StatusBadge status={doc.status} /></td>
                        <td className="px-5 py-4"><ExpiryBadge expiresAt={doc.expiresAt} /></td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {new Date(doc.createdAt).toLocaleDateString('es-ES')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/saas/documents/${doc.id}`); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors" title="Ver detalle">
                              <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); openEdit(doc); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors" title="Editar">
                              <Edit2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            </button>
                            {isManager && doc.status === 'pending' && (
                              <button onClick={(e) => { e.stopPropagation(); openSign(doc); }} className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-xl transition-colors" title="Firmar">
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                              </button>
                            )}
                            {isManager && doc.status === 'signed' && doc.category !== 'other' && (
                              <button onClick={(e) => { e.stopPropagation(); openSend(doc); }} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-xl transition-colors" title="Enviar a gestoría">
                                <Send className="w-4 h-4 text-blue-500" />
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

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map(doc => {
                const t = DOC_TOKEN[doc.status];
                return (
                  <div
                    key={doc.id}
                    onClick={() => navigate(`/saas/documents/${doc.id}`)}
                    className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 ${t.accentBorder} rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <DocIcon status={doc.status} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">{doc.name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">ID: {doc.id.slice(0, 12)}...</p>
                        </div>
                      </div>
                      <StatusBadge status={doc.status} />
                    </div>

                    <div className="space-y-1.5 mb-3">
                      {doc.vehicleName && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          <Car className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{doc.vehicleName}</span>
                        </div>
                      )}
                      {doc.costCenterName && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{doc.costCenterName}</span>
                        </div>
                      )}
                      {doc.expiresAt && (
                        <div className="flex items-center gap-2">
                          <CalendarClock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <ExpiryBadge expiresAt={doc.expiresAt} />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(doc.createdAt).toLocaleDateString('es-ES')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(doc); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                          <Edit2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        </button>
                        {isManager && doc.status === 'pending' && (
                          <button onClick={(e) => { e.stopPropagation(); openSign(doc); }} className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-xl transition-colors">
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          </button>
                        )}
                        {isManager && doc.status === 'signed' && doc.category !== 'other' && (
                          <button onClick={(e) => { e.stopPropagation(); openSend(doc); }} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-xl transition-colors">
                            <Send className="w-4 h-4 text-blue-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {isCompraventa && currentCompraventaTab ? (
                <span className="text-gray-400 dark:text-gray-500">{currentCompraventaTab.icon}</span>
              ) : (
                <FileText className="w-7 h-7 text-gray-400 dark:text-gray-500" />
              )}
            </div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1">
              {hasActiveFilters ? 'Sin resultados' : isCompraventa ? `No hay ${currentCompraventaTab?.label?.toLowerCase() || 'documentos'}` : 'No hay documentos'}
            </h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">
              {hasActiveFilters
                ? 'Sin resultados para los filtros aplicados'
                : isCompraventa
                  ? `Sube ${currentCompraventaTab?.label?.toLowerCase() || 'documentos'} escaneando con OCR o subiendo archivos`
                  : 'Sube o genera tu primer documento'}
            </p>
            {hasActiveFilters ? (
              <button onClick={clearFilters} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors">
                Limpiar filtros
              </button>
            ) : (
              <div className="flex gap-3 justify-center flex-wrap">
                <button onClick={() => setShowUpload(true)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors">
                  Subir documento
                </button>
                <button onClick={() => setShowGenerate(true)} className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors">
                  Generar desde plantilla
                </button>
                <button onClick={() => setShowOcr(true)} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2">
                  <ScanLine className="w-4 h-4" /> OCR
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <SAAS__UploadDocumentModal isOpen={showUpload} onClose={() => setShowUpload(false)} onUpload={handleUploadDocument} costCenters={workCenters || []} />
      <SAAS__GenerateFromTemplateModal isOpen={showGenerate} onClose={() => setShowGenerate(false)} onGenerate={handleGenerateFromTemplate} vehicles={vehicles || []} clients={clients || []} />
      <SAAS__OcrScanModal isOpen={showOcr} onClose={() => setShowOcr(false)} onDocumentCreated={handleOcrDocument} targetModule="documentacion" />

      {selectedDoc && showSign && (
        <SAAS__SignDocumentModal isOpen={showSign} onClose={() => { setShowSign(false); setSelectedDoc(null); }} document={selectedDoc} onSign={handleSignDocument} />
      )}
      {selectedDoc && showSend && (
        <SAAS__SendToAgencyModal isOpen={showSend} onClose={() => { setShowSend(false); setSelectedDoc(null); }} document={selectedDoc} onSend={handleSendToAgency} />
      )}
      {selectedDoc && showEdit && (
        <SAAS__EditDocumentModal isOpen={showEdit} onClose={() => { setShowEdit(false); setSelectedDoc(null); }} onSave={handleEditDocument} document={selectedDoc} costCenters={workCenters || []} vehicles={vehicles || []} />
      )}
    </Layout>
  );
}
