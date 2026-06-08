import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell, BellOff, ChevronLeft, Moon, RefreshCw, Save, Settings2,
  Search, AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  getAlertsConfig,
  saveAlertsConfig,
  type AlertsConfig,
  type AlertRule,
} from '../../lib/settingsApi';
import { CEO_ALERT_DEPARTMENTS } from '../../lib/alertCenterApi';

const DELIVERY_EXTRA_RULES: AlertRule[] = [
  {
    id: 'delivery_delayed_order',
    category: 'delivery',
    label: 'Pedido retrasado',
    description: 'Cuando un pedido supera el tiempo máximo en su estado actual',
    enabled: true,
    channels: ['push', 'inApp'],
    urgency: 'high',
    schedule: 'instant',
    recipientRoles: ['Admin'],
    customRecipients: [],
  },
  {
    id: 'delivery_kitchen_saturated',
    category: 'delivery',
    label: 'Cocina saturada',
    description: 'Demasiados pedidos en cocina respecto a la capacidad configurada',
    enabled: true,
    channels: ['push', 'inApp'],
    urgency: 'high',
    schedule: 'instant',
    recipientRoles: ['Admin'],
    customRecipients: [],
  },
  {
    id: 'delivery_cash_pending_close',
    category: 'delivery',
    label: 'Caja delivery sin cerrar',
    description: 'Terminal o caja de delivery abierta después del horario límite',
    enabled: true,
    channels: ['push', 'email', 'inApp'],
    urgency: 'high',
    schedule: 'instant',
    recipientRoles: ['Admin'],
    customRecipients: [],
  },
  {
    id: 'delivery_cash_discrepancy',
    category: 'delivery',
    label: 'Descuadre de caja',
    description: 'Diferencia entre efectivo contado y registrado al cerrar caja',
    enabled: true,
    channels: ['push', 'inApp'],
    urgency: 'critical',
    schedule: 'instant',
    recipientRoles: ['Admin'],
    customRecipients: [],
  },
  {
    id: 'delivery_product_out_of_stock',
    category: 'delivery',
    label: 'Producto agotado en delivery',
    description: 'Un producto activo en carta queda sin stock disponible',
    enabled: true,
    channels: ['inApp'],
    urgency: 'medium',
    schedule: 'instant',
    recipientRoles: ['Admin'],
    customRecipients: [],
  },
  {
    id: 'delivery_no_active_riders',
    category: 'delivery',
    label: 'Sin repartidores activos',
    description: 'Hay pedidos en reparto pero ningún rider disponible',
    enabled: true,
    channels: ['push', 'inApp'],
    urgency: 'high',
    schedule: 'instant',
    recipientRoles: ['Admin'],
    customRecipients: [],
  },
  {
    id: 'delivery_unpaid_order',
    category: 'delivery',
    label: 'Pedido sin cobrar',
    description: 'Pedido entregado o listo con pago pendiente demasiado tiempo',
    enabled: true,
    channels: ['inApp'],
    urgency: 'medium',
    schedule: 'instant',
    recipientRoles: ['Admin'],
    customRecipients: [],
  },
];

const CATEGORY_TO_DEPT: Record<string, string> = {
  stock: 'operaciones',
  ventas: 'operaciones',
  crm: 'operaciones',
  citas: 'operaciones',
  taller: 'operaciones',
  sistema: 'operaciones',
  finanzas: 'finanzas',
  conciliacion: 'finanzas',
  ocr: 'finanzas',
  equipo: 'rrhh',
  documentos: 'rrhh',
  seguridad: 'rrhh',
  delivery: 'delivery',
};

function mergeRules(existing: AlertRule[]): AlertRule[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const extra of DELIVERY_EXTRA_RULES) {
    if (!byId.has(extra.id)) byId.set(extra.id, extra);
  }
  return Array.from(byId.values());
}

interface Props {
  businessId: string;
  compact?: boolean;
  onBack?: () => void;
  onSaved?: () => void;
}

export function AlertCenterSettingsPanel({ businessId, compact = false, onBack, onSaved }: Props) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeDept, setActiveDept] = useState('all');

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getAlertsConfig(businessId);
      setConfig({ ...data, rules: mergeRules(data.rules) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando preferencias');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const updateRule = (ruleId: string, enabled: boolean) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, enabled } : r)),
      };
    });
  };

  const updateGlobal = (patch: Partial<AlertsConfig['global']>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, global: { ...prev.global, ...patch } };
    });
  };

  const toggleDept = (deptId: string, enabled: boolean) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rules: prev.rules.map((r) => {
          const dept = CATEGORY_TO_DEPT[r.category] || 'operaciones';
          if (deptId !== 'all' && dept !== deptId) return r;
          return { ...r, enabled };
        }),
      };
    });
  };

  const handleSave = async () => {
    if (!config || !businessId) return;
    setSaving(true);
    try {
      await saveAlertsConfig(businessId, config);
      toast.success('Preferencias de alertas guardadas');
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const filteredRules = useMemo(() => {
    if (!config) return [];
    return config.rules.filter((r) => {
      const dept = CATEGORY_TO_DEPT[r.category] || 'operaciones';
      if (activeDept !== 'all' && dept !== activeDept) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.label.toLowerCase().includes(q)
          || r.description.toLowerCase().includes(q)
          || r.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [config, activeDept, search]);

  const enabledInView = filteredRules.filter((r) => r.enabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        No se pudo cargar la configuración
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${compact ? 'h-full min-h-0' : 'space-y-4'}`}>
      <div className={`shrink-0 ${compact ? 'px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700' : ''}`}>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Volver"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              Personalizar alertas
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Elige qué avisos quieres recibir en tu negocio
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {config.global.muteAll
              ? <BellOff className="w-4 h-4 text-red-500 shrink-0" />
              : <Bell className="w-4 h-4 text-emerald-500 shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">Silenciar todas</p>
              <p className="text-[10px] text-gray-500 truncate">Pausa temporal sin perder tu config</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateGlobal({ muteAll: !config.global.muteAll })}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              config.global.muteAll ? 'bg-red-500' : 'bg-emerald-500'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              config.global.muteAll ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">No molestar</span>
          </div>
          <div className="flex items-center gap-2">
            {config.global.quietHoursEnabled && (
              <span className="text-[10px] text-gray-500 tabular-nums">
                {config.global.quietHoursFrom}–{config.global.quietHoursTo}
              </span>
            )}
            <button
              type="button"
              onClick={() => updateGlobal({ quietHoursEnabled: !config.global.quietHoursEnabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.global.quietHoursEnabled ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                config.global.quietHoursEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </div>

      <div className={`shrink-0 px-3 py-2 space-y-2 ${compact ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {CEO_ALERT_DEPARTMENTS.map((dept) => (
            <button
              key={dept.id}
              type="button"
              onClick={() => setActiveDept(dept.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition border ${
                activeDept === dept.id
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}
            >
              {dept.label}
            </button>
          ))}
        </div>
        {activeDept !== 'all' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => toggleDept(activeDept, true)}
              className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            >
              Activar todas
            </button>
            <button
              type="button"
              onClick={() => toggleDept(activeDept, false)}
              className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              Desactivar todas
            </button>
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar alerta…"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <p className="text-[10px] text-gray-400 px-0.5">
          {enabledInView} de {filteredRules.length} activas en esta vista
        </p>
      </div>

      <div className={`flex-1 overflow-y-auto px-3 space-y-2 ${compact ? 'py-2 min-h-0' : 'max-h-[420px]'}`}>
        {filteredRules.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-8">No hay alertas en este filtro</p>
        ) : (
          filteredRules.map((rule) => (
            <RuleToggleRow key={rule.id} rule={rule} onChange={(v) => updateRule(rule.id, v)} disabled={config.global.muteAll} />
          ))
        )}
      </div>

      <div className={`shrink-0 space-y-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ${compact ? '' : 'rounded-b-2xl'}`}>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white text-sm font-bold transition disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar preferencias
        </button>
        <button
          type="button"
          onClick={() => navigate('/saas/settings/alertas')}
          className="w-full text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 py-1"
        >
          Configuración avanzada (canales, roles, horarios) →
        </button>
      </div>
    </div>
  );
}

function RuleToggleRow({
  rule,
  onChange,
  disabled,
}: {
  rule: AlertRule;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  const dept = CATEGORY_TO_DEPT[rule.category] || 'operaciones';
  const deptLabel = CEO_ALERT_DEPARTMENTS.find((d) => d.id === dept)?.label || rule.category;

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 transition ${
      rule.enabled && !disabled
        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60'
        : 'border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/40 opacity-75'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{rule.label}</p>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">
            {deptLabel}
          </span>
          {rule.urgency === 'critical' || rule.urgency === 'high' ? (
            <AlertTriangle className="w-3 h-3 text-amber-500" />
          ) : null}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{rule.description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!rule.enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
          rule.enabled ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          rule.enabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  );
}
