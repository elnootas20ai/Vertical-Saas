import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, X, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';

export interface DeliveryAlert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  entityId?: string;
  action?: { label: string; onClick: () => void };
}

const LEVEL_CONFIG = {
  critical: { bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', icon: AlertCircle, iconColor: 'text-red-500' },
  warning:  { bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', icon: AlertTriangle, iconColor: 'text-amber-500' },
  info:     { bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', icon: Info, iconColor: 'text-blue-500' },
};

interface Props {
  alerts: DeliveryAlert[];
  onDismiss: (alertId: string) => void;
}

export function DeliveryAlertsBar({ alerts, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter((a) => a.level === 'critical').length;
  const warningCount = alerts.filter((a) => a.level === 'warning').length;

  return (
    <div className="space-y-2">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{alerts.length} alerta{alerts.length !== 1 ? 's' : ''} activa{alerts.length !== 1 ? 's' : ''}</span>
          {criticalCount > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">{criticalCount} crítica{criticalCount !== 1 ? 's' : ''}</span>}
          {warningCount > 0 && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">{warningCount} aviso{warningCount !== 1 ? 's' : ''}</span>}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const cfg = LEVEL_CONFIG[alert.level];
            const Icon = cfg.icon;
            return (
              <div key={alert.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${cfg.bg}`}>
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.iconColor}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${cfg.text}`}>{alert.title}</p>
                  <p className={`text-xs mt-0.5 ${cfg.text} opacity-80`}>{alert.message}</p>
                </div>
                {alert.action && (
                  <button onClick={alert.action.onClick}
                    className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-semibold ${cfg.text} hover:opacity-80 flex items-center gap-1`}>
                    {alert.action.label} <ArrowRight className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => onDismiss(alert.id)} className="flex-shrink-0 p-1 hover:opacity-60">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
