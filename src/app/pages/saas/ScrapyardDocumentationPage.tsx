import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { DOC_STATUS_TOKEN } from '../../components/saas/DesignTokens';
import { SAAS__UploadDocumentModal } from '../../components/design-system/SAAS__UploadDocumentModal';
import { SAAS__OcrScanModal } from '../../components/design-system/SAAS__OcrScanModal';
import { DOCUMENTS_DB_NAME } from '../../lib/documentsApi';
import type { ScrapyardDocCategory } from '../../lib/documentsApi';
import { authFetch, getAuthHeaders } from '../../lib/authApi';
import { getApiBase } from '../../lib/apiBase';
import { ScrapyardDocDossier } from '../../components/saas/ScrapyardDocDossier';
import {
  FileText, Upload, Search, Eye, Download, ScanLine, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, X, AlertTriangle, Clock,
  Car, ClipboardList, Receipt, ShieldCheck, Wrench, Paperclip,
  Leaf, Package, FileX, Truck, Shield, UserCheck, IdCard,
  Plus, Boxes, BookOpen,
} from 'lucide-react';

const _env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
function _couchHeaders() {
  const h: Record<string, string> = {};
  if (_env.VITE_COUCHDB_URL) h['x-couch-url'] = _env.VITE_COUCHDB_URL;
  if (_env.VITE_COUCHDB_USER) h['x-couch-user'] = _env.VITE_COUCHDB_USER;
  if (_env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = _env.VITE_COUCHDB_PASSWORD;
  return h;
}

type DocStatus = 'pending' | 'signed' | 'sent' | 'completed' | 'draft';
type SortField = 'name' | 'date' | 'status';
type SortDir = 'asc' | 'desc';

interface ScrapyardDoc {
  id: string;
  name: string;
  docSubCategory?: string;
  status: DocStatus;
  vehicleId?: string;
  vehicleName?: string;
  registrationPlate?: string;
  vin?: string;
  clientName?: string;
  supplierName?: string;
  partId?: string;
  partName?: string;
  partCode?: string;
  acquisitionId?: string;
  responsible: string;
  createdAt: string;
  updatedAt: string;
  fileUrl?: string;
  notes?: string;
  ocrConfidence?: number;
  archived?: boolean;
  isScrapyard?: boolean;
}

interface ScrapyardTab {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  subCategories: ScrapyardDocCategory[];
}

const SCRAPYARD_TAB_DEFS: ScrapyardTab[] = [
  {
    id: 'vehiculo',
    label: 'Vehículo',
    title: 'Documentación del vehículo',
    subtitle: 'Permiso, ficha técnica, tasación',
    icon: <Car className="w-4 h-4" />,
    subCategories: ['permiso_circulacion', 'ficha_tecnica', 'informe_trafico', 'doc_tasacion'],
  },
  {
    id: 'compra-retirada',
    label: 'Compra y retirada',
    title: 'Compras y retiradas',
    subtitle: 'Contratos, actas y albaranes de grúa',
    icon: <Truck className="w-4 h-4" />,
    subCategories: ['contrato_compra', 'acta_retirada', 'albaran_grua', 'justificante_deposito', 'acta_adjudicacion', 'factura_compra'],
  },
  {
    id: 'baja-destruccion',
    label: 'Baja y destrucción',
    title: 'Baja y destrucción',
    subtitle: 'Bajas DGT, certificados de destrucción',
    icon: <FileX className="w-4 h-4" />,
    subCategories: ['baja_temporal', 'baja_definitiva', 'certificado_destruccion'],
  },
  {
    id: 'medioambiental',
    label: 'Medioambiental',
    title: 'Documentación medioambiental',
    subtitle: 'Descontaminación, residuos, licencias',
    icon: <Leaf className="w-4 h-4" />,
    subCategories: ['certificado_descontaminacion', 'informe_medioambiental', 'licencia_actividad', 'registro_productor_residuos'],
  },
  {
    id: 'piezas',
    label: 'Piezas',
    title: 'Documentación de piezas',
    subtitle: 'Garantías, informes, albaranes de venta',
    icon: <Package className="w-4 h-4" />,
    subCategories: ['garantia_pieza', 'informe_pieza', 'albaran_venta_pieza'],
  },
  {
    id: 'regulatorio',
    label: 'Regulatorio',
    title: 'Documentación regulatoria',
    subtitle: 'Seguros, ITV, documentos de cliente',
    icon: <ShieldCheck className="w-4 h-4" />,
    subCategories: ['itv', 'seguro', 'doc_cliente', 'justificante'],
  },
  {
    id: 'otros',
    label: 'Otros',
    title: 'Otros documentos',
    subtitle: 'Reparaciones, anexos y otros',
    icon: <Paperclip className="w-4 h-4" />,
    subCategories: ['reparacion', 'anexo', 'otro'],
  },
];

const SCRAPYARD_DOC_ICONS: Record<string, React.ReactNode> = {
  permiso_circulacion: <IdCard className="w-4 h-4" />,
  ficha_tecnica: <ClipboardList className="w-4 h-4" />,
  contrato_compra: <FileText className="w-4 h-4" />,
  factura_compra: <Receipt className="w-4 h-4" />,
  baja_temporal: <FileX className="w-4 h-4 text-amber-500" />,
  baja_definitiva: <FileX className="w-4 h-4 text-red-500" />,
  certificado_destruccion: <Shield className="w-4 h-4 text-red-600" />,
  certificado_descontaminacion: <Leaf className="w-4 h-4 text-emerald-600" />,
  acta_retirada: <Truck className="w-4 h-4" />,
  albaran_grua: <Truck className="w-4 h-4 text-blue-500" />,
  garantia_pieza: <ShieldCheck className="w-4 h-4 text-emerald-500" />,
  informe_pieza: <Package className="w-4 h-4" />,
  albaran_venta_pieza: <Receipt className="w-4 h-4 text-violet-500" />,
  informe_medioambiental: <Leaf className="w-4 h-4" />,
  licencia_actividad: <BookOpen className="w-4 h-4" />,
  itv: <ShieldCheck className="w-4 h-4" />,
  seguro: <Shield className="w-4 h-4" />,
  reparacion: <Wrench className="w-4 h-4" />,
  doc_cliente: <UserCheck className="w-4 h-4" />,
  doc_tasacion: <FileText className="w-4 h-4 text-amber-600" />,
  otro: <Paperclip className="w-4 h-4" />,
};

const DOC_SUB_LABELS: Record<string, string> = {
  permiso_circulacion: 'Permiso de circulación',
  ficha_tecnica: 'Ficha técnica',
  contrato_compra: 'Contrato de compra',
  factura_compra: 'Factura de compra',
  baja_temporal: 'Baja temporal',
  baja_definitiva: 'Baja definitiva',
  certificado_destruccion: 'Certificado de destrucción',
  certificado_descontaminacion: 'Certificado de descontaminación',
  acta_retirada: 'Acta de retirada',
  albaran_grua: 'Albarán de grúa',
  justificante_deposito: 'Justificante de depósito',
  informe_medioambiental: 'Informe medioambiental',
  licencia_actividad: 'Licencia de actividad',
  registro_productor_residuos: 'Registro prod. residuos',
  garantia_pieza: 'Garantía de pieza',
  informe_pieza: 'Informe de pieza',
  albaran_venta_pieza: 'Albarán venta pieza',
  acta_adjudicacion: 'Acta de adjudicación',
  doc_tasacion: 'Tasación',
  itv: 'ITV',
  seguro: 'Seguro',
  reparacion: 'Reparación',
  doc_cliente: 'Doc. cliente',
  justificante: 'Justificante',
  anexo: 'Anexo',
  otro: 'Otro',
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  signed: { label: 'Firmado', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  sent: { label: 'Enviado', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  completed: { label: 'Completado', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300' },
};

interface AlertItem {
  type: string;
  severity: string;
  message: string;
  documentId?: string;
  vehicleId?: string;
  isScrapyard?: boolean;
  actionUrl?: string;
}

export function ScrapyardDocumentationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { documents: allDocs, user, vehicles } = useApp();

  const [activeTab, setActiveTab] = useState<string>('vehiculo');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocStatus | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showUpload, setShowUpload] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dossierVehicleId, setDossierVehicleId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'dossier'>('list');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && SCRAPYARD_TAB_DEFS.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
    const vid = searchParams.get('vehicleId');
    if (vid) {
      setDossierVehicleId(vid);
      setViewMode('dossier');
    }
  }, [searchParams]);

  const scrapyardDocs = useMemo<ScrapyardDoc[]>(() => {
    return (allDocs || [])
      .filter((d: Record<string, unknown>) => d.type === 'document' && d.isScrapyard && !d.deletedAt)
      .map((d: Record<string, unknown>) => ({
        id: (d._id || d.id) as string,
        name: (d.name || '') as string,
        docSubCategory: (d.docSubCategory || 'otro') as string,
        status: (d.status || 'pending') as DocStatus,
        vehicleId: (d.vehicleId || '') as string,
        vehicleName: (d.vehicleName || '') as string,
        registrationPlate: (d.registrationPlate || '') as string,
        vin: (d.vin || '') as string,
        clientName: (d.clientName || '') as string,
        supplierName: (d.supplierName || '') as string,
        partId: (d.partId || '') as string,
        partName: (d.partName || '') as string,
        partCode: (d.partCode || '') as string,
        acquisitionId: (d.acquisitionId || '') as string,
        responsible: (d.user_id || '') as string,
        createdAt: (d.createdAt || '') as string,
        updatedAt: (d.updatedAt || '') as string,
        fileUrl: (d.fileUrl || '') as string,
        notes: (d.notes || '') as string,
        ocrConfidence: (d.ocrConfidence || 0) as number,
        archived: (d.archived || false) as boolean,
        isScrapyard: true,
      }))
      .sort((a: ScrapyardDoc, b: ScrapyardDoc) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [allDocs]);

  useEffect(() => {
    if (!user?.id) return;
    authFetch(`${getApiBase()}/api/documents/${user.id}/alerts`, {
      headers: { ...getAuthHeaders(), ..._couchHeaders() },
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setAlerts((data.alerts || []).filter((a: AlertItem) => a.isScrapyard));
        }
      })
      .catch(() => {});
  }, [user?.id, scrapyardDocs.length]);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }, [sortField]);

  const currentTab = SCRAPYARD_TAB_DEFS.find(t => t.id === activeTab);

  const byTab = useMemo(() => {
    if (!currentTab) return scrapyardDocs;
    return scrapyardDocs.filter(d => currentTab.subCategories.includes(d.docSubCategory as ScrapyardDocCategory));
  }, [scrapyardDocs, currentTab]);

  const filtered = useMemo(() => {
    let result = byTab;
    if (statusFilter !== 'all') result = result.filter(d => d.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.vehicleName?.toLowerCase().includes(q) ||
        d.registrationPlate?.toLowerCase().includes(q) ||
        d.vin?.toLowerCase().includes(q) ||
        d.clientName?.toLowerCase().includes(q) ||
        d.supplierName?.toLowerCase().includes(q) ||
        d.partName?.toLowerCase().includes(q) ||
        d.partCode?.toLowerCase().includes(q)
      );
    }
    const statusOrder: Record<string, number> = { draft: 0, pending: 1, signed: 2, sent: 3, completed: 4 };
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'status') cmp = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
      else cmp = a.createdAt.localeCompare(b.createdAt);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [byTab, statusFilter, searchQuery, sortField, sortDir]);

  const kpis = useMemo(() => {
    const total = scrapyardDocs.length;
    const pending = scrapyardDocs.filter(d => d.status === 'pending' || d.status === 'draft').length;
    const withOcr = scrapyardDocs.filter(d => d.ocrConfidence && d.ocrConfidence > 0).length;
    const alertCount = alerts.length;
    return { total, pending, withOcr, alertCount };
  }, [scrapyardDocs, alerts]);

  const dossierVehicle = useMemo(() => {
    if (!dossierVehicleId) return null;
    return (vehicles || []).find((v: Record<string, unknown>) => (v._id || v.id) === dossierVehicleId);
  }, [dossierVehicleId, vehicles]);

  const dossierDocs = useMemo(() => {
    if (!dossierVehicleId) return [];
    return scrapyardDocs.filter(d => d.vehicleId === dossierVehicleId);
  }, [scrapyardDocs, dossierVehicleId]);

  const thCls = 'px-5 py-3.5 text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider';
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  return (
    <Layout title={currentTab?.title || 'Documentación Desguace'} subtitle={currentTab?.subtitle || 'Gestión documental del desguace'}>
      <div className="space-y-4">

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total documentos', value: kpis.total, icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Pendientes', value: kpis.pending, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
            { label: 'Con OCR', value: kpis.withOcr, icon: ScanLine, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20' },
            { label: 'Alertas', value: kpis.alertCount, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
          ].map(k => (
            <div key={k.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{k.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por matrícula, bastidor, proveedor, pieza..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(f => !f)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${showFilters ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
            <Filter className="w-4 h-4" /> Filtros
          </button>
          <div className="flex items-center gap-2 border-l pl-3 border-gray-200 dark:border-gray-700">
            <button onClick={() => setViewMode('list')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-500'}`}>
              Lista
            </button>
            <button onClick={() => setViewMode('dossier')} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${viewMode === 'dossier' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-500'}`}>
              Expediente
            </button>
          </div>
          <button onClick={() => setShowOcr(true)} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-all shadow-sm">
            <ScanLine className="w-4 h-4" /> Escanear OCR
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all shadow-sm">
            <Upload className="w-4 h-4" /> Subir documento
          </button>
        </div>

        {/* Alerts banner */}
        {alerts.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">{alerts.length} alerta{alerts.length > 1 ? 's' : ''} documental{alerts.length > 1 ? 'es' : ''}</span>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {alerts.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <span className="truncate">{a.message}</span>
                  {a.actionUrl && (
                    <button onClick={() => navigate(a.actionUrl!)} className="ml-auto text-amber-600 hover:text-amber-800 underline whitespace-nowrap">
                      Ver
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-3">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as DocStatus | 'all')}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="pending">Pendiente</option>
              <option value="signed">Firmado</option>
              <option value="sent">Enviado</option>
              <option value="completed">Completado</option>
            </select>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-1.5 gap-1 overflow-x-auto">
          {SCRAPYARD_TAB_DEFS.map(tab => {
            const isActive = activeTab === tab.id;
            const count = scrapyardDocs.filter(d => tab.subCategories.includes(d.docSubCategory as ScrapyardDocCategory)).length;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                {tab.icon}
                {tab.label}
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-blue-500 text-blue-100' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        {viewMode === 'dossier' && dossierVehicle ? (
          <ScrapyardDocDossier
            vehicleId={dossierVehicleId!}
            vehicleName={`${(dossierVehicle as Record<string, unknown>).brand || ''} ${(dossierVehicle as Record<string, unknown>).model || ''}`.trim()}
            registrationPlate={(dossierVehicle as Record<string, unknown>).registrationPlate as string}
            vehicleStatus={(dossierVehicle as Record<string, unknown>).status as string || (dossierVehicle as Record<string, unknown>).dismantlingStatus as string || 'received'}
            documents={dossierDocs.map(d => ({ id: d.id, name: d.name, docSubCategory: d.docSubCategory, status: d.status, createdAt: d.createdAt, registrationPlate: d.registrationPlate, ocrConfidence: d.ocrConfidence }))}
            onUpload={() => setShowUpload(true)}
            onOcr={() => setShowOcr(true)}
          />
        ) : viewMode === 'dossier' ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8">
            <div className="text-center">
              <Car className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Selecciona un vehículo</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Elige un vehículo del listado para ver su expediente documental completo</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[...new Set(scrapyardDocs.filter(d => d.vehicleId).map(d => d.vehicleId))].slice(0, 10).map(vid => {
                  const vDoc = scrapyardDocs.find(d => d.vehicleId === vid);
                  return (
                    <button
                      key={vid}
                      onClick={() => setDossierVehicleId(vid!)}
                      className="px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                    >
                      {vDoc?.registrationPlate || vDoc?.vehicleName || vid}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin documentos</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {searchQuery ? 'No se encontraron documentos con esos criterios' : `No hay documentos en "${currentTab?.label || 'esta categoría'}"`}
                </p>
                <div className="flex gap-2 justify-center">
                  <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
                    <Upload className="w-4 h-4" /> Subir documento
                  </button>
                  <button onClick={() => setShowOcr(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors">
                    <ScanLine className="w-4 h-4" /> Escanear con OCR
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className={thCls}>
                        <button onClick={() => toggleSort('name')} className="flex items-center">
                          Nombre <SortIcon field="name" />
                        </button>
                      </th>
                      <th className={thCls}>Tipo</th>
                      <th className={thCls}>Vehículo / Pieza</th>
                      <th className={thCls}>
                        <button onClick={() => toggleSort('status')} className="flex items-center">
                          Estado <SortIcon field="status" />
                        </button>
                      </th>
                      <th className={thCls}>OCR</th>
                      <th className={thCls}>
                        <button onClick={() => toggleSort('date')} className="flex items-center">
                          Fecha <SortIcon field="date" />
                        </button>
                      </th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {filtered.map(doc => {
                      const st = STATUS_LABELS[doc.status] || STATUS_LABELS.pending;
                      const subLabel = DOC_SUB_LABELS[doc.docSubCategory || ''] || doc.docSubCategory;
                      const subIcon = SCRAPYARD_DOC_ICONS[doc.docSubCategory || ''] || <FileText className="w-4 h-4" />;
                      return (
                        <tr
                          key={doc.id}
                          onClick={() => navigate(`/saas/documents/${doc.id}`)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors group"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
                                {subIcon}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{doc.name}</p>
                                {doc.supplierName && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{doc.supplierName}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-400">{subLabel}</td>
                          <td className="px-5 py-3.5">
                            <div className="text-xs text-gray-700 dark:text-gray-300">
                              {doc.registrationPlate && <span className="font-mono font-medium">{doc.registrationPlate}</span>}
                              {doc.vehicleName && !doc.registrationPlate && <span>{doc.vehicleName}</span>}
                              {doc.partName && <span className="block text-[10px] text-gray-500 mt-0.5">Pieza: {doc.partName}</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            {doc.ocrConfidence ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-10 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                                  <div className={`h-full rounded-full ${doc.ocrConfidence >= 80 ? 'bg-emerald-500' : doc.ocrConfidence >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${doc.ocrConfidence}%` }} />
                                </div>
                                <span className="text-[10px] text-gray-500">{doc.ocrConfidence}%</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                            {new Date(doc.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={e => { e.stopPropagation(); navigate(`/saas/documents/${doc.id}`); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {doc.fileUrl && (
                                <a href={doc.fileUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400">
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showUpload && (
        <SAAS__UploadDocumentModal
          onClose={() => setShowUpload(false)}
          onUpload={() => setShowUpload(false)}
          defaultCategory="otro"
          isScrapyard
        />
      )}
      {showOcr && (
        <SAAS__OcrScanModal
          onClose={() => setShowOcr(false)}
          ocrMode="vehicle"
        />
      )}
    </Layout>
  );
}
