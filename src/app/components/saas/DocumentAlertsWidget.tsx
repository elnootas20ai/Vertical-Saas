import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { authFetch, getAuthHeaders } from '../../lib/authApi';
import {
  AlertTriangle, ShieldCheck, FileText, ClipboardList,
  ScanLine, ChevronRight, X, RefreshCw,
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

interface DocAlert {
  type: string;
  severity: string;
  message: string;
  documentId?: string;
  vehicleId?: string;
  registrationPlate?: string;
  actionUrl?: string;
  missingDocs?: string[];
}

const ALERT_ICON: Record<string, React.ReactNode> = {
  itv_expired:          <ShieldCheck className="w-4 h-4 text-red-500" />,
  itv_expiring:         <ShieldCheck className="w-4 h-4 text-amber-500" />,
  missing_vehicle_docs: <FileText className="w-4 h-4 text-amber-500" />,
  contract_pending_sign:<ClipboardList className="w-4 h-4 text-amber-500" />,
  ocr_incomplete:       <ScanLine className="w-4 h-4 text-blue-500" />,
  expired:              <AlertTriangle className="w-4 h-4 text-red-500" />,
  expiring_soon:        <AlertTriangle className="w-4 h-4 text-amber-500" />,
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
  warning:  'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
  info:     'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
};

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
      const res = await authFetch(`${_apiBase()}/api/documents/${user.id}/alerts`, {
        headers: { ...getAuthHeaders(), ..._couchHeaders() },
      });
      const data = await res.json();
      if (data.ok) setAlerts(data.alerts || []);
    } catch { /* silently fail */ }
    setLoading(false);
  };

  useEffect(() => { fetchAlerts(); }, [user?.id]);

  const compraventaAlerts = useMemo(() =>
    alerts.filter(a => ['itv_expired', 'itv_expiring', 'missing_vehicle_docs', 'contract_pending_sign', 'ocr_incomplete'].includes(a.type)),
  [alerts]);

  if (dismissed || compraventaAlerts.length === 0) return null;

  const critCount = compraventaAlerts.filter(a => a.severity === 'critical').length;
  const warnCount = compraventaAlerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas documentación</h3>
          <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full">
            {compraventaAlerts.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={fetchAlerts} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Actualizar">
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
        {compraventaAlerts.slice(0, 8).map((alert, i) => (
          <div
            key={i}
            onClick={() => alert.actionUrl && navigate(alert.actionUrl)}
            className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${alert.actionUrl ? 'cursor-pointer' : ''}`}
          >
            <div className="mt-0.5 flex-shrink-0">{ALERT_ICON[alert.type] || <AlertTriangle className="w-4 h-4 text-gray-400" />}</div>
            <p className="text-xs text-gray-700 dark:text-gray-300 flex-1 leading-relaxed">{alert.message}</p>
            {alert.actionUrl && <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />}
          </div>
        ))}
        {compraventaAlerts.length > 8 && (
          <div className="px-4 py-2.5 text-center">
            <button onClick={() => navigate('/saas/documents')} className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              Ver todas las alertas ({compraventaAlerts.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
