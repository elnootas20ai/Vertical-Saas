import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { authFetch, getAuthHeaders } from '../../lib/authApi';
import { getApiBase } from '../../lib/apiBase';
import {
  AlertTriangle, ShieldCheck, FileText, ClipboardList,
  ScanLine, ChevronRight, X, RefreshCw, Building2,
} from 'lucide-react';

const _env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};
function _couchHeaders() {
  const h: Record<string, string> = {};
  return h;
}

interface DocAlert {
  type: string;
  severity: string;
  message: string;
  documentId?: string;
  vehicleId?: string;
  registrationPlate?: string;
  actionUrl?: string;
  missingDocs?: string[];
  category?: string;
}

const ALERT_ICON: Record<string, React.ReactNode> = {
  itv_expired:           <ShieldCheck className="w-4 h-4 text-red-500" />,
  itv_expiring:          <ShieldCheck className="w-4 h-4 text-amber-500" />,
  missing_vehicle_docs:  <FileText className="w-4 h-4 text-amber-500" />,
  missing_required:      <Building2 className="w-4 h-4 text-blue-500" />,
  document_missing_required: <Building2 className="w-4 h-4 text-blue-500" />,
  contract_pending_sign: <ClipboardList className="w-4 h-4 text-amber-500" />,
  stale_pending:         <ClipboardList className="w-4 h-4 text-amber-500" />,
  ocr_incomplete:        <ScanLine className="w-4 h-4 text-blue-500" />,
  expired:               <AlertTriangle className="w-4 h-4 text-red-500" />,
  expiring_soon:         <AlertTriangle className="w-4 h-4 text-amber-500" />,
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2, alert: 0 };

export function DocumentAlertsWidget() {
  const navigate = useNavigate();
  const { user } = useApp();
  const [alerts, setAlerts] = useState<DocAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const fetchAlerts = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await authFetch(`${getApiBase()}/api/documents/${user.id}/alerts`, {
        headers: { ...getAuthHeaders(), ..._couchHeaders() },
      });
      const data = await res.json();
      if (data.ok) setAlerts(data.alerts || []);
    } catch { /* silently fail */ }
    setLoading(false);
  };

  useEffect(() => { void fetchAlerts(); }, [user?.id]);

  const sortedAlerts = useMemo(() => (
    [...alerts].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
  ), [alerts]);

  if (dismissed || sortedAlerts.length === 0) return null;

  const critCount = sortedAlerts.filter(a => a.severity === 'critical' || a.severity === 'alert').length;
  const warnCount = sortedAlerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas documentación</h3>
          <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full">
            {sortedAlerts.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => void fetchAlerts()} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Actualizar">
            <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setDismissed(true)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {critCount > 0 && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950 text-xs text-red-700 dark:text-red-400 font-semibold">
          {critCount} alerta{critCount > 1 ? 's' : ''} crítica{critCount > 1 ? 's' : ''}
          {warnCount > 0 && ` · ${warnCount} aviso${warnCount > 1 ? 's' : ''}`}
        </div>
      )}

      <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-60 overflow-y-auto">
        {sortedAlerts.slice(0, 8).map((alert, i) => (
          <div
            key={`${alert.type}-${alert.documentId || alert.message}-${i}`}
            onClick={() => alert.actionUrl && navigate(alert.actionUrl)}
            className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${alert.actionUrl ? 'cursor-pointer' : ''}`}
          >
            <div className="mt-0.5 flex-shrink-0">{ALERT_ICON[alert.type] || <AlertTriangle className="w-4 h-4 text-gray-400" />}</div>
            <p className="text-xs text-gray-700 dark:text-gray-300 flex-1 leading-relaxed">{alert.message}</p>
            {alert.actionUrl && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />}
          </div>
        ))}
        {sortedAlerts.length > 8 && (
          <div className="px-4 py-2.5 text-center">
            <button onClick={() => navigate('/saas/documents')} className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              Ver todas las alertas ({sortedAlerts.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
