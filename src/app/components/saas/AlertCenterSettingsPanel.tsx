import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, ChevronDown, ChevronLeft, ChevronUp, Clock, Lock, Moon, RefreshCw, Save,
  Search, AlertTriangle, SlidersHorizontal, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAlertsConfig,
  saveAlertsConfig,
  DEFAULT_CASH_REGISTER_OPERATIONAL,
  ruleDepartment,
  type AlertRule,
  type AlertsConfig,
  type CashRegisterOperationalConfig,
} from '../../lib/settingsApi';
import { CEO_ALERT_DEPARTMENTS } from '../../lib/alertCenterApi';
import { useApp } from '../../context/AppContext';
import { resolvePlanTier, PLAN_TIER_LABELS, type SubscriptionPlanTier } from '../../lib/pointOfSaleLimits';
import {
  ALERT_PLAN_TIER_LABELS,
  ALERT_PLAN_TIER_ORDER,
  alertTierDescription,
  canAccessAlertTier,
  inferRulePlanTier,
  type AlertPlanTier,
} from '../../lib/alertPlanTiers';

const RULE_TO_CASH_FLAG: Record<string, keyof CashRegisterOperationalConfig> = {
  delivery_cash_pending_close: 'registerNotClosedEnabled',
  delivery_register_not_opened: 'registerNotOpenedEnabled',
  delivery_cash_discrepancy: 'discrepancyEnabled',
};

function normalizeAlertsConfig(data: AlertsConfig): AlertsConfig {
  return {
    ...data,
    operational: {
      cashRegister: {
        ...DEFAULT_CASH_REGISTER_OPERATIONAL,
        ...(data.operational?.cashRegister || {}),
      },
    },
  };
}

interface Props {
  businessId: string;
  compact?: boolean;
  featured?: boolean;
  onBack?: () => void;
  onSaved?: () => void;
  onOpenAdvanced?: () => void;
}

export function AlertCenterSettingsPanel({
  businessId,
  compact = false,
  featured = false,
  onBack,
  onSaved,
  onOpenAdvanced,
}: Props) {
  const navigate = useNavigate();
  const { subscription } = useApp();
  const userPlanTier = resolvePlanTier(subscription.selectedPlanId || '', subscription.planName || '');
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeDept, setActiveDept] = useState('all');
  const [showCashThresholds, setShowCashThresholds] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getAlertsConfig(businessId);
      setConfig(normalizeAlertsConfig(data));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando preferencias');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const isRuleEditable = useCallback((rule: AlertRule) => {
    return canAccessAlertTier(userPlanTier, inferRulePlanTier(rule));
  }, [userPlanTier]);

  const updateRule = (ruleId: string, enabled: boolean) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const target = prev.rules.find((r) => r.id === ruleId);
      if (target && !isRuleEditable(target)) return prev;
      const cashKey = RULE_TO_CASH_FLAG[ruleId];
      const cashRegister = cashKey
        ? { ...prev.operational!.cashRegister, [cashKey]: enabled }
        : prev.operational!.cashRegister;
      return {
        ...prev,
        rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, enabled } : r)),
        operational: { cashRegister },
      };
    });
  };

  const updateCashOperational = (patch: Partial<CashRegisterOperationalConfig>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const cashRegister = { ...prev.operational!.cashRegister, ...patch };
      const rules = [...prev.rules];
      for (const [ruleId, key] of Object.entries(RULE_TO_CASH_FLAG)) {
        if (patch[key] !== undefined) {
          const idx = rules.findIndex((r) => r.id === ruleId);
          if (idx >= 0) rules[idx] = { ...rules[idx], enabled: Boolean(patch[key]) };
        }
      }
      return { ...prev, rules, operational: { cashRegister } };
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
          const dept = ruleDepartment(r);
          if (deptId !== 'all' && dept !== deptId) return r;
          if (!isRuleEditable(r)) return r;
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

  const matchesFilters = useCallback((r: AlertRule) => {
    const dept = ruleDepartment(r);
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
  }, [activeDept, search]);

  const rulesByPlanTier = useMemo(() => {
    if (!config) {
      return { basic: [], normal: [], pro: [] } as Record<AlertPlanTier, AlertRule[]>;
    }
    const grouped: Record<AlertPlanTier, AlertRule[]> = { basic: [], normal: [], pro: [] };
    for (const rule of config.rules) {
      grouped[inferRulePlanTier(rule)].push(rule);
    }
    return grouped;
  }, [config]);

  const filteredRules = useMemo(() => {
    if (!config) return [];
    return config.rules.filter((r) => matchesFilters(r) && isRuleEditable(r));
  }, [config, matchesFilters, isRuleEditable]);

  const enabledInView = filteredRules.filter((r) => r.enabled).length;
  const accessibleRules = config?.rules.filter((r) => isRuleEditable(r)) ?? [];
  const totalEnabled = accessibleRules.filter((r) => r.enabled).length;
  const totalRules = accessibleRules.length;

  const deptStats = useMemo(() => {
    if (!config) return [];
    return CEO_ALERT_DEPARTMENTS.filter((d) => d.id !== 'all').map((dept) => {
      const rules = config.rules.filter((r) => ruleDepartment(r) === dept.id);
      const enabled = rules.filter((r) => r.enabled).length;
      return { ...dept, total: rules.length, enabled };
    });
  }, [config]);

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

  const globalControls = (
    <>
        <div className={`flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5 ${featured ? '' : 'mt-3'}`}>
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

        <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCashThresholds((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-900 dark:text-white">Umbrales de caja</p>
                <p className="text-[10px] text-gray-500">Hora límite, tolerancia y descuadres</p>
              </div>
            </div>
            {showCashThresholds ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showCashThresholds && config.operational?.cashRegister && (
            <CashThresholdsForm
              value={config.operational.cashRegister}
              onChange={updateCashOperational}
              disabled={config.global.muteAll}
            />
          )}
        </div>
    </>
  );

  const deptFilterBar = (
    <div className="space-y-2">
      {featured ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={() => setActiveDept('all')}
            className={`rounded-xl border p-3 text-left transition ${
              activeDept === 'all'
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900'
            }`}
          >
            <p className="text-sm font-bold">Todas las ramas</p>
            <p className={`mt-0.5 text-xs ${activeDept === 'all' ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-500'}`}>
              {totalEnabled} de {totalRules} activas
            </p>
          </button>
          {deptStats.map((dept) => (
            <button
              key={dept.id}
              type="button"
              onClick={() => setActiveDept(dept.id)}
              className={`rounded-xl border p-3 text-left transition ${
                activeDept === dept.id
                  ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                  : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
              }`}
            >
              <p className="text-sm font-bold">{dept.label}</p>
              <p className={`mt-0.5 text-xs ${activeDept === dept.id ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500'}`}>
                {dept.enabled} de {dept.total} activas
              </p>
            </button>
          ))}
        </div>
      ) : (
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
      )}
      {activeDept !== 'all' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggleDept(activeDept, true)}
            className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            Activar todas en {CEO_ALERT_DEPARTMENTS.find((d) => d.id === activeDept)?.label}
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
    </div>
  );

  const rulesByTierSections = (
    <div className={`space-y-6 ${featured ? '' : 'flex-1 overflow-y-auto px-3 min-h-0'}`}>
      {ALERT_PLAN_TIER_ORDER.map((tier) => {
        const tierRules = rulesByPlanTier[tier].filter(matchesFilters);
        const tierAccessible = canAccessAlertTier(userPlanTier, tier);
        const tierTotal = rulesByPlanTier[tier].length;
        const tierEnabled = rulesByPlanTier[tier].filter((r) => r.enabled).length;

        return (
          <section key={tier} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                Alertas {ALERT_PLAN_TIER_LABELS[tier]}
              </h4>
              {tierAccessible ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Incluido en tu plan
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  Plan {ALERT_PLAN_TIER_LABELS[tier]}
                </span>
              )}
              <span className="text-[10px] text-gray-400">
                {tierEnabled} de {tierTotal} activas
              </span>
            </div>

            {!tierAccessible ? (
              <AlertPlanUpgradeCta
                targetTier={tier}
                userTier={userPlanTier}
                ruleCount={tierTotal}
                featured={featured}
                onUpgrade={() => navigate('/saas/billing')}
              />
            ) : tierRules.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-4">No hay alertas en este filtro</p>
            ) : (
              <div className="space-y-2">
                {tierRules.map((rule) => (
                  <RuleToggleRow
                    key={rule.id}
                    rule={rule}
                    featured={featured}
                    onChange={(v) => updateRule(rule.id, v)}
                    disabled={config.global.muteAll}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  const saveBar = (
    <div className={`shrink-0 space-y-2 ${featured ? 'sticky bottom-0 z-10 -mx-1 rounded-2xl border border-zinc-200 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95' : 'p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white text-sm font-bold transition disabled:opacity-50"
      >
        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Guardar preferencias
      </button>
      {onOpenAdvanced && (
        <button
          type="button"
          onClick={onOpenAdvanced}
          className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 py-1"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Canales, urgencia y destinatarios →
        </button>
      )}
    </div>
  );

  if (featured) {
    return (
      <div className="rounded-2xl border border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4 border-b border-zinc-200 p-5 dark:border-zinc-800 lg:border-b-0 lg:border-r">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/60">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Tu plan</p>
              <p className="text-lg font-black text-zinc-900 dark:text-white">{PLAN_TIER_LABELS[userPlanTier]}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/30">
                <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{totalEnabled}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600/80">Activas</p>
              </div>
              <div className="rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-zinc-800">
                <p className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{totalRules}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Disponibles</p>
              </div>
            </div>
            {globalControls}
          </aside>

          <div className="flex min-h-[480px] flex-col p-5">
            {deptFilterBar}
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, descripción o categoría…"
                className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {enabledInView} de {filteredRules.length} activas en esta vista
            </p>
            <div className="mt-3 flex-1 overflow-y-auto pr-1">{rulesByTierSections}</div>
            <div className="mt-4">{saveBar}</div>
          </div>
        </div>
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
            <h3 className="font-bold text-gray-900 dark:text-white">Personalizar alertas</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Elige qué avisos quieres recibir
            </p>
          </div>
        </div>
        {globalControls}
      </div>

      <div className={`shrink-0 px-3 py-2 space-y-2 ${compact ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
        {deptFilterBar}
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

      <div className={`flex-1 overflow-y-auto ${compact ? 'py-2 min-h-0' : 'max-h-[420px]'}`}>
        {rulesByTierSections}
      </div>

      {saveBar}
    </div>
  );
}

function CashThresholdsForm({
  value,
  onChange,
  disabled,
}: {
  value: CashRegisterOperationalConfig;
  onChange: (patch: Partial<CashRegisterOperationalConfig>) => void;
  disabled?: boolean;
}) {
  const inputCls = 'w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white';

  return (
    <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-gray-100 dark:border-gray-800">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-medium text-gray-500">Hora límite cierre</span>
          <input
            type="time"
            disabled={disabled}
            className={inputCls}
            value={value.cashCloseDeadline}
            onChange={(e) => onChange({ cashCloseDeadline: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium text-gray-500">Tolerancia (min)</span>
          <input
            type="number"
            min={5}
            max={180}
            disabled={disabled}
            className={inputCls}
            value={value.cashWarningMinutes}
            onChange={(e) => onChange({ cashWarningMinutes: Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium text-gray-500">Máx. horas abierta</span>
          <input
            type="number"
            min={4}
            max={24}
            disabled={disabled}
            className={inputCls}
            value={value.cashMaxOpenHours}
            onChange={(e) => onChange({ cashMaxOpenHours: Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium text-gray-500">Comprobar apertura (h)</span>
          <input
            type="number"
            min={6}
            max={14}
            disabled={disabled}
            className={inputCls}
            value={value.registerNotOpenedCheckHour}
            onChange={(e) => onChange({ registerNotOpenedCheckHour: Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium text-gray-500">Descuadre (€)</span>
          <input
            type="number"
            min={1}
            step={5}
            disabled={disabled}
            className={inputCls}
            value={value.discrepancyThreshold}
            onChange={(e) => onChange({ discrepancyThreshold: Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium text-gray-500">Devoluciones (€)</span>
          <input
            type="number"
            min={10}
            step={10}
            disabled={disabled}
            className={inputCls}
            value={value.highReturnThreshold}
            onChange={(e) => onChange({ highReturnThreshold: Number(e.target.value) })}
          />
        </label>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        Tras la hora límite, si la caja sigue abierta se genera alerta. A la madrugada también cuenta el cierre del día anterior.
      </p>
    </div>
  );
}

function AlertPlanUpgradeCta({
  targetTier,
  userTier,
  ruleCount,
  featured,
  onUpgrade,
}: {
  targetTier: AlertPlanTier;
  userTier: SubscriptionPlanTier;
  ruleCount: number;
  featured?: boolean;
  onUpgrade: () => void;
}) {
  const tierLabel = ALERT_PLAN_TIER_LABELS[targetTier];
  const needsNormal = userTier === 'basic' && targetTier !== 'basic';

  return (
    <div className={`rounded-xl border border-dashed border-amber-300/80 bg-gradient-to-br from-amber-50 to-orange-50/60 dark:from-amber-950/30 dark:to-orange-950/20 dark:border-amber-700/50 ${
      featured ? 'p-5' : 'p-4'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
          <Lock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {ruleCount} alertas en plan {tierLabel}
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {alertTierDescription(targetTier)}
          </p>
          {needsNormal && targetTier === 'pro' && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              También necesitas plan Normal para desbloquear el bloque intermedio.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        className={`mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition ${
          featured ? 'py-2.5 text-sm' : 'py-2 text-xs'
        }`}
      >
        <Sparkles className="h-4 w-4" />
        Ver planes y mejorar a {tierLabel}
      </button>
    </div>
  );
}

function RuleToggleRow({
  rule,
  onChange,
  disabled,
  featured,
}: {
  rule: AlertRule;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  featured?: boolean;
}) {
  const dept = ruleDepartment(rule);
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
