import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, ShieldCheck, IdCard, ClipboardList, Receipt,
  Wrench, UserCheck, Paperclip, AlertTriangle, CheckCircle,
  Upload, ScanLine, ExternalLink, ChevronDown, ChevronRight,
  Shield, Car,
} from 'lucide-react';
import type { CompraventaDocCategory } from '../../lib/documentsApi';

interface VehicleDoc {
  id: string;
  name: string;
  docSubCategory?: string;
  status: string;
  createdAt: string;
  registrationPlate?: string;
  itvExpiryDate?: string;
  ocrConfidence?: number;
}

interface Props {
  vehicleId: string;
  vehicleName: string;
  registrationPlate?: string;
  vehicleImageUrl?: string;
  documents: VehicleDoc[];
  onUpload?: () => void;
  onOcr?: () => void;
  compact?: boolean;
}

const REQUIRED_DOCS: { sub: CompraventaDocCategory; label: string }[] = [
  { sub: 'permiso_circulacion', label: 'Permiso de circulación' },
  { sub: 'ficha_tecnica',       label: 'Ficha técnica' },
  { sub: 'contrato_compra',     label: 'Contrato de compra' },
  { sub: 'factura_compra',      label: 'Factura de compra' },
  { sub: 'itv',                 label: 'ITV' },
];

const SUB_ICON: Record<string, React.ReactNode> = {
  permiso_circulacion: <IdCard className="w-4 h-4" />,
  ficha_tecnica: <ClipboardList className="w-4 h-4" />,
  contrato_compra: <FileText className="w-4 h-4" />,
  contrato_venta: <FileText className="w-4 h-4" />,
  factura_compra: <Receipt className="w-4 h-4" />,
  factura_venta: <Receipt className="w-4 h-4" />,
  itv: <ShieldCheck className="w-4 h-4" />,
  reparacion: <Wrench className="w-4 h-4" />,
  justificante: <Receipt className="w-4 h-4" />,
  doc_cliente: <UserCheck className="w-4 h-4" />,
  anexo: <Paperclip className="w-4 h-4" />,
  seguro: <Shield className="w-4 h-4" />,
};

export function VehicleDocDossier({ vehicleId, vehicleName, registrationPlate, vehicleImageUrl, documents, onUpload, onOcr, compact }: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(!compact);

  const presentSubs = useMemo(() => new Set(documents.map(d => d.docSubCategory)), [documents]);
  const filled = REQUIRED_DOCS.filter(r => presentSubs.has(r.sub)).length;
  const total = REQUIRED_DOCS.length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  const itvDoc = documents.find(d => d.docSubCategory === 'itv' && d.itvExpiryDate);
  const itvDaysLeft = useMemo(() => {
    if (!itvDoc?.itvExpiryDate) return null;
    const exp = new Date(itvDoc.itvExpiryDate);
    return Math.ceil((exp.getTime() - Date.now()) / 86400000);
  }, [itvDoc]);

  const pctColor = pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const pctBg = pct === 100 ? 'bg-emerald-100 dark:bg-emerald-900/30' : pct >= 60 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30';

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        {vehicleImageUrl ? (
          <img src={vehicleImageUrl} alt={vehicleName} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
            <Car className="w-7 h-7 text-blue-500" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{vehicleName}</p>
            {registrationPlate && (
              <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-mono font-bold rounded-lg flex-shrink-0">{registrationPlate}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className={`flex-1 h-2 rounded-full ${pctBg}`}>
              <div className={`h-full rounded-full transition-all ${pctColor}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold text-gray-500 flex-shrink-0">{filled}/{total}</span>
          </div>
        </div>

        {itvDaysLeft !== null && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0 ${
            itvDaysLeft < 0 ? 'bg-red-50 dark:bg-red-950 text-red-600'
            : itvDaysLeft <= 30 ? 'bg-amber-50 dark:bg-amber-950 text-amber-600'
            : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600'
          }`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            {itvDaysLeft < 0 ? `ITV caducada` : `ITV ${itvDaysLeft}d`}
          </div>
        )}

        {expanded ? <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {REQUIRED_DOCS.map(req => {
              const doc = documents.find(d => d.docSubCategory === req.sub);
              return (
                <div
                  key={req.sub}
                  onClick={() => doc ? navigate(`/saas/documents/${doc.id}`) : undefined}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-sm transition-colors ${
                    doc
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 cursor-pointer hover:border-emerald-300'
                      : 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    doc ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {doc ? <CheckCircle className="w-3.5 h-3.5" /> : (SUB_ICON[req.sub] || <FileText className="w-3.5 h-3.5" />)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold truncate ${doc ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>{req.label}</p>
                    {doc ? (
                      <p className="text-[10px] text-gray-400 truncate">{doc.name}</p>
                    ) : (
                      <p className="text-[10px] text-orange-500 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> Falta</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {documents.filter(d => !REQUIRED_DOCS.some(r => r.sub === d.docSubCategory)).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2">Otros documentos</p>
              <div className="space-y-1">
                {documents.filter(d => !REQUIRED_DOCS.some(r => r.sub === d.docSubCategory)).map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => navigate(`/saas/documents/${doc.id}`)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm"
                  >
                    <span className="text-gray-400">{SUB_ICON[doc.docSubCategory || 'otro'] || <FileText className="w-4 h-4" />}</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{doc.name}</span>
                    <ExternalLink className="w-3 h-3 text-gray-300" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {onUpload && (
              <button onClick={onUpload} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-gray-400 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 transition-colors">
                <Upload className="w-3.5 h-3.5" /> Subir doc
              </button>
            )}
            {onOcr && (
              <button onClick={onOcr} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors">
                <ScanLine className="w-3.5 h-3.5" /> OCR
              </button>
            )}
            <button
              onClick={() => navigate(`/saas/documents?vehicleId=${vehicleId}`)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-gray-400 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver todos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
