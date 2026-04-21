import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, ShieldCheck, IdCard, ClipboardList, Receipt,
  Wrench, UserCheck, Paperclip, AlertTriangle, CheckCircle,
  Upload, ScanLine, ChevronDown, ChevronRight,
  Shield, Car, FileX, Leaf, Truck, Package, BookOpen,
} from 'lucide-react';

interface VehicleDoc {
  id: string;
  name: string;
  docSubCategory?: string;
  status: string;
  createdAt: string;
  registrationPlate?: string;
  ocrConfidence?: number;
}

interface Props {
  vehicleId: string;
  vehicleName: string;
  registrationPlate?: string;
  vehicleStatus: string;
  documents: VehicleDoc[];
  onUpload?: () => void;
  onOcr?: () => void;
}

interface RequiredDoc {
  sub: string;
  label: string;
  phase: string;
}

const PHASE_ORDER = ['Recepción', 'Descontaminación', 'Despiece', 'Baja y destrucción', 'Regulatorio'];

const SCRAPYARD_REQUIRED_DOCS: RequiredDoc[] = [
  { sub: 'permiso_circulacion', label: 'Permiso de circulación', phase: 'Recepción' },
  { sub: 'ficha_tecnica', label: 'Ficha técnica', phase: 'Recepción' },
  { sub: 'contrato_compra', label: 'Contrato de compra', phase: 'Recepción' },
  { sub: 'certificado_descontaminacion', label: 'Certificado de descontaminación', phase: 'Descontaminación' },
  { sub: 'informe_medioambiental', label: 'Informe medioambiental', phase: 'Descontaminación' },
  { sub: 'baja_definitiva', label: 'Baja definitiva DGT', phase: 'Baja y destrucción' },
  { sub: 'certificado_destruccion', label: 'Certificado de destrucción', phase: 'Baja y destrucción' },
  { sub: 'licencia_actividad', label: 'Licencia de actividad (CAT)', phase: 'Regulatorio' },
  { sub: 'registro_productor_residuos', label: 'Registro productor de residuos', phase: 'Regulatorio' },
];

function getRequiredForStatus(vehicleStatus: string): string[] {
  switch (vehicleStatus) {
    case 'received':
      return ['permiso_circulacion', 'ficha_tecnica', 'contrato_compra'];
    case 'dismantling':
    case 'partially_dismantled':
    case 'fully_dismantled':
      return ['permiso_circulacion', 'ficha_tecnica', 'contrato_compra', 'certificado_descontaminacion'];
    case 'compacted':
    case 'deregistered':
      return ['permiso_circulacion', 'ficha_tecnica', 'contrato_compra', 'certificado_descontaminacion', 'baja_definitiva', 'certificado_destruccion'];
    default:
      return ['permiso_circulacion', 'ficha_tecnica', 'contrato_compra'];
  }
}

const SUB_ICON: Record<string, React.ReactNode> = {
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
  informe_medioambiental: <Leaf className="w-4 h-4" />,
  licencia_actividad: <BookOpen className="w-4 h-4" />,
  registro_productor_residuos: <BookOpen className="w-4 h-4 text-emerald-500" />,
  itv: <ShieldCheck className="w-4 h-4" />,
  seguro: <Shield className="w-4 h-4" />,
  reparacion: <Wrench className="w-4 h-4" />,
  doc_cliente: <UserCheck className="w-4 h-4" />,
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  received: { label: 'Recibido', color: 'bg-blue-500' },
  dismantling: { label: 'En despiece', color: 'bg-amber-500' },
  partially_dismantled: { label: 'Parcialmente despiece', color: 'bg-orange-500' },
  fully_dismantled: { label: 'Despiezado', color: 'bg-emerald-500' },
  compacted: { label: 'Compactado', color: 'bg-gray-500' },
  deregistered: { label: 'Dado de baja', color: 'bg-red-500' },
};

export function ScrapyardDocDossier({ vehicleId, vehicleName, registrationPlate, vehicleStatus, documents, onUpload, onOcr }: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);

  const required = useMemo(() => getRequiredForStatus(vehicleStatus), [vehicleStatus]);
  const presentSubs = useMemo(() => new Set(documents.map(d => d.docSubCategory)), [documents]);
  const filled = required.filter(r => presentSubs.has(r)).length;
  const total = required.length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  const docsByPhase = useMemo(() => {
    const groups: Record<string, { required: RequiredDoc[]; docs: VehicleDoc[] }> = {};
    for (const phase of PHASE_ORDER) {
      const phaseDocs = SCRAPYARD_REQUIRED_DOCS.filter(r => r.phase === phase);
      const matchDocs = documents.filter(d => phaseDocs.some(p => p.sub === d.docSubCategory));
      if (phaseDocs.length > 0 || matchDocs.length > 0) {
        groups[phase] = { required: phaseDocs, docs: matchDocs };
      }
    }
    const coveredSubs = new Set(SCRAPYARD_REQUIRED_DOCS.map(r => r.sub));
    const extras = documents.filter(d => !coveredSubs.has(d.docSubCategory || ''));
    if (extras.length > 0) {
      groups['Otros'] = { required: [], docs: extras };
    }
    return groups;
  }, [documents]);

  const statusInfo = STATUS_MAP[vehicleStatus] || { label: vehicleStatus, color: 'bg-gray-500' };
  const pctColor = pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const pctBg = pct === 100 ? 'bg-emerald-100 dark:bg-emerald-900/30' : pct >= 60 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30';

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
          <Car className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{vehicleName || 'Vehículo'}</span>
            {registrationPlate && <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">{registrationPlate}</span>}
            <span className={`text-[10px] px-2 py-0.5 rounded-full text-white font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${pctBg}`}>
              <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pctColor}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={pct === 100 ? 'text-emerald-700 dark:text-emerald-300' : pct >= 60 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'}>
                {filled}/{total}
              </span>
            </div>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{documents.length} doc{documents.length !== 1 ? 's' : ''} total</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onOcr && (
            <button onClick={e => { e.stopPropagation(); onOcr(); }} className="p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
              <ScanLine className="w-4 h-4" />
            </button>
          )}
          {onUpload && (
            <button onClick={e => { e.stopPropagation(); onUpload(); }} className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              <Upload className="w-4 h-4" />
            </button>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
          {Object.entries(docsByPhase).map(([phase, { required: phaseDocs, docs: phaseDDocsList }]) => (
            <div key={phase} className="px-5 py-3">
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{phase}</h4>
              <div className="space-y-1.5">
                {phaseDocs.map(req => {
                  const doc = documents.find(d => d.docSubCategory === req.sub);
                  const isPresent = !!doc;
                  const isRequired = required.includes(req.sub);
                  return (
                    <div
                      key={req.sub}
                      onClick={() => doc && navigate(`/saas/documents/${doc.id}`)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${doc ? 'hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer' : ''}`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isPresent ? 'bg-emerald-100 dark:bg-emerald-900/30' : isRequired ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                        {isPresent ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : isRequired ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> : (SUB_ICON[req.sub] || <FileText className="w-3.5 h-3.5 text-gray-400" />)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${isPresent ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{req.label}</p>
                        {doc && <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{doc.name} — {new Date(doc.createdAt).toLocaleDateString('es-ES')}</p>}
                      </div>
                      {doc?.ocrConfidence ? (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${doc.ocrConfidence >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                          OCR {doc.ocrConfidence}%
                        </span>
                      ) : !isPresent && isRequired ? (
                        <span className="text-[10px] text-red-500 font-medium">Falta</span>
                      ) : null}
                    </div>
                  );
                })}
                {phaseDDocsList.filter(d => !phaseDocs.some(r => r.sub === d.docSubCategory)).map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => navigate(`/saas/documents/${doc.id}`)}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      {SUB_ICON[doc.docSubCategory || ''] || <FileText className="w-3.5 h-3.5 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{doc.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(doc.createdAt).toLocaleDateString('es-ES')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
