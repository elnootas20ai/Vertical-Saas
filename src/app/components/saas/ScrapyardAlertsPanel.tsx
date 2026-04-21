import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, FileX, MapPin, Clock, Wrench, ChevronDown, ChevronUp, X, Bell,
} from 'lucide-react';
import type { ScrapyardAlert, ScrapyardAlertSeverity } from '../../lib/scrapyardTypes';

interface Props {
  alerts: ScrapyardAlert[];
}

const SEVERITY_CONFIG: Record<ScrapyardAlertSeverity, { bg: string; border: string; icon: string; badge: string }> = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  },
};

const TIPO_ICON: Record<string, typeof AlertTriangle> = {
  matricula_duplicada: AlertTriangle,
  bastidor_duplicado: AlertTriangle,
  sin_documentacion: FileX,
  sin_ubicacion: MapPin,
  baja_pendiente: Clock,
  sin_procesar: Wrench,
};

export function ScrapyardAlertsPanel({ alerts }: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));
  const criticalCount = visibleAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = visibleAlerts.filter(a => a.severity === 'warning').length;

  if (visibleAlerts.length === 0) return null;

  const grouped = {
    critical: visibleAlerts.filter(a => a.severity === 'critical'),
    warning: visibleAlerts.filter(a => a.severity === 'warning'),
    info: visibleAlerts.filter(a => a.severity === 'info'),
  };

  const displayAlerts = expanded ? visibleAlerts : visibleAlerts.slice(0, 3);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-100 dark:bg-amber-900/40 rounded-lg">
            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Alertas
          </span>
          <div className="flex gap-1.5">
            {criticalCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                {criticalCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                {warningCount}
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
          {(['critical', 'warning', 'info'] as ScrapyardAlertSeverity[]).map(severity => {
            const group = grouped[severity];
            if (group.length === 0) return null;
            const cfg = SEVERITY_CONFIG[severity];

            return (
              <div key={severity}>
                {group.map(alert => {
                  const Icon = TIPO_ICON[alert.tipo] || AlertTriangle;
                  return (
                    <div
                      key={alert.id}
                      className={`flex items-center gap-3 px-4 py-2.5 ${cfg.bg} cursor-pointer hover:opacity-90 transition-opacity`}
                      onClick={() => navigate(`/saas/scrapyard-vehicles/${alert.vehicleId}`)}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${cfg.icon}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{alert.mensaje}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{alert.matricula} - {alert.marcaModelo}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setDismissed(prev => new Set(prev).add(alert.id)); }}
                        className="p-1 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {!expanded && visibleAlerts.length > 3 && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
          >
            Ver todas ({visibleAlerts.length} alertas)
          </button>
        </div>
      )}
    </div>
  );
}
