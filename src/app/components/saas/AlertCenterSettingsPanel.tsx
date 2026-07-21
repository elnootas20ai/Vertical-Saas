import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, ChevronDown, ChevronLeft, Crown, Layers, Lock, Moon,
  RefreshCw, Save, Search, AlertTriangle, SlidersHorizontal, Sparkles, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAlertsConfig,
  saveAlertsConfig,
  DEFAULT_CASH_REGISTER_OPERATIONAL,
  DEFAULT_DELIVERY_OPERATIONAL,
  ruleDepartment,
  type AlertRule,
  type AlertsConfig,
  type CashRegisterOperationalConfig,
  type DeliveryOperationalConfig,
} from '../../lib/settingsApi';
import { RuleThresholdQuickEdit } from '../../lib/alertRuleThresholdFields';
import { useAlertDepartments } from '../../hooks/useAlertDepartments';
import { useEffectivePlanTier } from '../../hooks/useEffectivePlanTier';
import { getDepartmentLabel, isRuleVisibleForVertical } from '../../lib/alertDepartments';
import { PLAN_TIER_LABELS, type SubscriptionPlanTier } from '../../lib/pointOfSaleLimits';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import {
  ALERT_PLAN_TIER_LABELS,
  alertTierDescription,
  alertTierExamples,
  alertTierSectionTitle,
  alertTierSubtitle,
  canAccessAlertTier,
  getVisiblePlanTiersForVertical,
  inferRulePlanTier,
  syncRulesPlanTier,
  type AlertPlanTier,
} from '../../lib/alertPlanTiers';
import {
  countDeliveryPendingActivation,
  isDeliveryAlertsReviewPending,
  splitDeliveryReviewRules,
} from '../../lib/deliveryAlertsReview';
import {
  PRO_PLAN_CARD_OPEN,
  PRO_PLAN_GRADIENT,
  PRO_PLAN_GRADIENT_HOVER,
  PRO_PLAN_GRADIENT_TEXT,
  PRO_PLAN_RING,
  ProPlanBadge,
} from './alertCenterProUi';

const TIER_VISUAL: Record<AlertPlanTier, {
  icon: typeof Zap;
  ring: string;
  header: string;
  badge: string;
  badgeText: string;
  count: string;
}> = {
  basic: {
    icon: Zap,
    ring: 'ring-emerald-500/20',
    header: 'from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-gray-900',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    badgeText: 'Básico',
    count: 'text-emerald-700 dark:text-emerald-300',
  },
  normal: {
    icon: Layers,
    ring: 'ring-blue-500/20',
    header: 'from-blue-50/80 to-white dark:from-blue-950/20 dark:to-gray-900',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    badgeText: 'Normal',
    count: 'text-blue-700 dark:text-blue-300',
  },
  pro: {
    icon: Crown,
    ring: `ring-2 ${PRO_PLAN_RING}`,
    header: 'from-violet-50/95 via-purple-50/50 to-amber-50/45 dark:from-violet-950/35 dark:via-purple-950/20 dark:to-amber-950/15 dark:to-gray-900',
    badge: `${PRO_PLAN_GRADIENT} text-white shadow-sm shadow-violet-500/30`,
    badgeText: 'PRO',
    count: PRO_PLAN_GRADIENT_TEXT,
  },
};

const RULE_TO_CASH_FLAG: Record<string, keyof CashRegisterOperationalConfig> = {
  delivery_cash_pending_close: 'registerNotClosedEnabled',
  delivery_register_not_opened: 'registerNotOpenedEnabled',
  delivery_cash_discrepancy: 'discrepancyEnabled',
};

function normalizeAlertsConfig(data: AlertsConfig): AlertsConfig {
  return {
    ...data,
    deliveryAlertsReview: {
      completedAt: data.deliveryAlertsReview?.completedAt || null,
      notifSentAt: data.deliveryAlertsReview?.notifSentAt || null,
    },
    operational: {
      cashRegister: {
        ...DEFAULT_CASH_REGISTER_OPERATIONAL,
        ...(data.operational?.cashRegister || {}),
      },
      delivery: {
        ...DEFAULT_DELIVERY_OPERATIONAL,
        delayThresholds: {
          ...DEFAULT_DELIVERY_OPERATIONAL.delayThresholds,
          ...(data.operational?.delivery?.delayThresholds || {}),
        },
        ...(data.operational?.delivery || {}),
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
  const { departments: alertDepartments, vertical } = useAlertDepartments();
  const userPlanTier = useEffectivePlanTier();
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeDept, setActiveDept] = useState('all');
  const [activeTier, setActiveTier] = useState<AlertPlanTier | null>('normal');

  const selectTier = (tier: AlertPlanTier) => {
    setActiveTier((prev) => (prev === tier ? null : tier));
  };

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getAlertsConfig(businessId);
      setConfig(normalizeAlertsConfig({
        ...data,
        rules: syncRulesPlanTier(data.rules),
      }));
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
        operational: { ...prev.operational!, cashRegister },
      };
    });
  };

  const updateOperational = (next: {
    delivery: DeliveryOperationalConfig;
    cashRegister: CashRegisterOperationalConfig;
  }) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        operational: {
          delivery: next.delivery,
          cashRegister: next.cashRegister,
        },
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

  const markDeliveryReviewed = async () => {
    if (!config || !businessId) return;
    const next = {
      ...config,
      deliveryAlertsReview: {
        ...(config.deliveryAlertsReview || {}),
        completedAt: new Date().toISOString(),
      },
    };
    setConfig(next);
    setSaving(true);
    try {
      await saveAlertsConfig(businessId, next);
      toast.success('Listo: ya revisaste las alertas de Delivery');
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

  const businessRules = useMemo(() => {
    if (!config) return [];
    return config.rules.filter((r) => isRuleVisibleForVertical(ruleDepartment(r), vertical));
  }, [config, vertical]);

  const rulesByPlanTier = useMemo(() => {
    const grouped: Record<AlertPlanTier, AlertRule[]> = { basic: [], normal: [], pro: [] };
    for (const rule of businessRules) {
      grouped[inferRulePlanTier(rule)].push(rule);
    }
    return grouped;
  }, [businessRules]);

  useEffect(() => {
    if (!search.trim() && activeDept === 'all') return;
    const tiersWithHits = getVisiblePlanTiersForVertical(vertical).filter(
      (tier) => rulesByPlanTier[tier].some(matchesFilters),
    );
    if (tiersWithHits.length > 0) {
      setActiveTier(tiersWithHits[0]);
    }
  }, [search, activeDept, vertical, rulesByPlanTier, matchesFilters]);

  const filteredRules = useMemo(() => {
    return businessRules.filter((r) => matchesFilters(r) && isRuleEditable(r));
  }, [businessRules, matchesFilters, isRuleEditable]);

  const enabledInView = filteredRules.filter((r) => r.enabled).length;
  const accessibleRules = businessRules.filter((r) => isRuleEditable(r));
  const totalEnabled = accessibleRules.filter((r) => r.enabled).length;
  const totalRules = accessibleRules.length;

  const deptStats = useMemo(() => {
    return alertDepartments.filter((d) => d.id !== 'all').map((dept) => {
      const rules = businessRules.filter((r) => ruleDepartment(r) === dept.id);
      const enabled = rules.filter((r) => r.enabled).length;
      return { ...dept, total: rules.length, enabled };
    });
  }, [alertDepartments, businessRules]);

  const deliveryReviewPending = Boolean(
    (vertical === 'delivery' || vertical === 'restaurant')
    && config
    && isDeliveryAlertsReviewPending(config.deliveryAlertsReview),
  );
  const deliveryPendingCount = config ? countDeliveryPendingActivation(config.rules) : 0;
  const deliverySplit = useMemo(
    () => (config ? splitDeliveryReviewRules(config.rules) : null),
    [config],
  );

  useEffect(() => {
    if (!deliveryReviewPending || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('focus') !== 'delivery-review') return;
    const t = window.setTimeout(() => {
      document.getElementById('delivery-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => window.clearTimeout(t);
  }, [deliveryReviewPending, loading]);

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

    </>
  );

  const deptFilterBar = (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Ramas del negocio
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {alertDepartments.map((dept) => {
          const stats = dept.id === 'all'
            ? { enabled: totalEnabled, total: totalRules }
            : deptStats.find((d) => d.id === dept.id) ?? { enabled: 0, total: 0 };
          const isActive = activeDept === dept.id;

          return (
            <button
              key={dept.id}
              type="button"
              onClick={() => setActiveDept(dept.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition ${
                isActive
                  ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span>{dept.label}</span>
              <span className={`tabular-nums text-[10px] font-medium ${
                isActive ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'
              }`}>
                {stats.enabled}/{stats.total}
              </span>
            </button>
          );
        })}
      </div>
      {activeDept !== 'all' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggleDept(activeDept, true)}
            className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            Activar todas en {alertDepartments.find((d) => d.id === activeDept)?.label}
          </button>
          <button
            type="button"
            onClick={() => toggleDept(activeDept, false)}
            className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            Desactivar todas
          </button>
        </div>
      )}
    </div>
  );

  const visiblePlanTiers = getVisiblePlanTiersForVertical(vertical);

  const tierOverview = (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Planes de alerta
      </p>
      <div className="grid grid-cols-3 gap-2">
        {visiblePlanTiers.map((tier) => {
          const visual = TIER_VISUAL[tier];
          const TierIcon = visual.icon;
          const tierTotal = rulesByPlanTier[tier].length;
          const tierEnabled = rulesByPlanTier[tier].filter((r) => r.enabled).length;
          const tierAccessible = canAccessAlertTier(userPlanTier, tier);
          const isSelected = activeTier === tier;
          if (tierTotal === 0) return null;

          return (
            <button
              key={tier}
              type="button"
              onClick={() => selectTier(tier)}
              aria-pressed={isSelected}
              className={`rounded-xl border px-2.5 py-2 text-left transition ${
                tier === 'pro' ? visual.ring : `ring-1 ${visual.ring}`
              } ${
                isSelected
                  ? tier === 'pro'
                    ? PRO_PLAN_CARD_OPEN
                    : 'border-gray-300 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-900'
                  : tier === 'pro'
                    ? 'border-violet-200/70 bg-gradient-to-br from-violet-50/40 to-amber-50/20 hover:border-violet-300 dark:border-violet-800/50 dark:from-violet-950/20 dark:to-amber-950/10'
                    : 'border-gray-200/80 bg-gray-50/50 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800/40'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                {tier === 'pro' ? (
                  <ProPlanBadge size="sm" />
                ) : (
                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${visual.badge}`}>
                    <TierIcon className="h-3 w-3" />
                    {visual.badgeText}
                  </span>
                )}
                {!tierAccessible && (
                  <Lock className={`h-3 w-3 shrink-0 ${tier === 'pro' ? 'text-violet-500' : 'text-amber-500'}`} />
                )}
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isSelected ? 'rotate-180' : ''}`} />
              </div>
              <p className={`mt-1.5 text-lg font-black tabular-nums leading-none ${visual.count}`}>{tierTotal}</p>
              <p className="mt-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                {tierEnabled} activas
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const filtersAndTiersHeader = (
    <div className="space-y-4 shrink-0">
      {deliveryReviewPending && (
        <div
          id="delivery-review"
          className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3 dark:border-amber-800 dark:bg-amber-950/30"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Revisa tus alertas de Delivery
              </p>
              <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/90">
                Ya tienes activas las esenciales (caja, pedidos críticos, fichaje).
                {deliveryPendingCount > 0
                  ? ` Hay ${deliveryPendingCount} avisos más apagados: actívalos si los necesitas.`
                  : ' Confirma que la configuración te encaja.'}
              </p>
              {deliverySplit && (
                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                  Pack esencial: {deliverySplit.recommended.filter((r) => r.enabled).length}/
                  {deliverySplit.recommended.length} activos
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void markDeliveryReviewed()}
              className="shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Ya lo revisé
            </button>
          </div>
        </div>
      )}
      {deptFilterBar}
      {tierOverview}
    </div>
  );

  const featuredTopBar = (
    <div className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50 sm:px-5">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${
          userPlanTier === 'pro'
            ? 'border-violet-200/80 bg-gradient-to-r from-violet-50/80 to-amber-50/40 dark:border-violet-800/50 dark:from-violet-950/30 dark:to-amber-950/15'
            : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950'
        }`}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Plan</span>
          {userPlanTier === 'pro' ? (
            <ProPlanBadge size="md" />
          ) : (
            <span className="text-sm font-black text-zinc-900 dark:text-white">{PLAN_TIER_LABELS[userPlanTier]}</span>
          )}
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
          <span className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-300">{totalEnabled}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600/80">Activas</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
          <span className="text-lg font-black tabular-nums text-zinc-800 dark:text-zinc-100">{totalRules}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Disponibles</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => updateGlobal({ muteAll: !config.global.muteAll })}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              config.global.muteAll
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
            }`}
          >
            {config.global.muteAll ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5 text-emerald-500" />}
            Silenciar todas
          </button>
          <button
            type="button"
            onClick={() => updateGlobal({ quietHoursEnabled: !config.global.quietHoursEnabled })}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              config.global.quietHoursEnabled
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300'
                : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
            }`}
          >
            <Moon className="h-3.5 w-3.5" />
            No molestar
            {config.global.quietHoursEnabled && (
              <span className="text-[10px] font-medium tabular-nums opacity-80">
                {config.global.quietHoursFrom}–{config.global.quietHoursTo}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const activeTierPanel = (() => {
    if (!activeTier || !config) {
      return (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-10">
          Elige un plan arriba para ver sus alertas
        </p>
      );
    }

    const tier = activeTier;
    const tierRules = rulesByPlanTier[tier].filter(matchesFilters);
    const tierAccessible = canAccessAlertTier(userPlanTier, tier);
    const tierTotal = rulesByPlanTier[tier].length;
    const visual = TIER_VISUAL[tier];
    const TierIcon = visual.icon;

    return (
      <section
        className={`rounded-2xl border overflow-hidden shadow-sm ${
          tier === 'pro' ? visual.ring : `ring-1 ${visual.ring}`
        } ${
          tier === 'pro'
            ? 'border-violet-200/80 shadow-violet-500/10 dark:border-violet-800/50'
            : 'border-gray-200 dark:border-gray-700'
        }`}
      >
        <div className={`bg-gradient-to-r ${visual.header} px-4 py-3 border-b border-gray-100/80 dark:border-gray-800/80`}>
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              tier === 'pro'
                ? `${PRO_PLAN_GRADIENT} text-white shadow-md shadow-violet-500/30`
                : 'bg-white/80 text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200'
            }`}>
              <TierIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  {alertTierSectionTitle(tier, vertical)}
                </h4>
                {tier === 'pro' ? (
                  <ProPlanBadge size="sm" />
                ) : (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${visual.badge}`}>
                    {visual.badgeText}
                  </span>
                )}
                {tierAccessible ? (
                  tier === 'pro' ? (
                    <span className={`text-[10px] font-semibold ${PRO_PLAN_GRADIENT_TEXT}`}>
                      Incluido en tu plan Pro
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Incluido en tu plan
                    </span>
                  )
                ) : tier === 'pro' ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 dark:text-gray-400">
                    <Lock className="h-3 w-3 text-violet-500" />
                    Requiere
                    <ProPlanBadge size="sm" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    <Lock className="h-3 w-3" />
                    Requiere plan {ALERT_PLAN_TIER_LABELS[tier]}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                {alertTierSubtitle(tier, vertical)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {alertTierDescription(tier, vertical)}
            <span className="block text-[11px] text-gray-400 mt-1">{alertTierExamples(tier, vertical)}</span>
          </p>

          {!tierAccessible && (
            <AlertPlanUpgradeCta
              targetTier={tier}
              userTier={userPlanTier}
              ruleCount={tierTotal}
              vertical={vertical}
              featured={featured}
              onUpgrade={() => {
                if (isIosCustomerAccessOnlyApp()) return;
                navigate('/saas/billing');
              }}
            />
          )}

          {tierRules.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-3">No hay alertas en este filtro</p>
          ) : (
            <div className="space-y-1.5">
              {tierRules.map((rule) => (
                <RuleToggleRow
                  key={rule.id}
                  rule={rule}
                  featured={featured}
                  planTier={tier}
                  locked={!tierAccessible}
                  delivery={config.operational!.delivery}
                  cashRegister={config.operational!.cashRegister}
                  onOperationalChange={updateOperational}
                  onChange={(v) => updateRule(rule.id, v)}
                  disabled={config.global.muteAll || !tierAccessible}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  })();

  const saveBar = (
    <div className={`shrink-0 space-y-2 ${featured ? 'sticky bottom-0 z-10 -mx-1 rounded-2xl border border-zinc-200 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95' : 'p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white text-sm font-bold transition disabled:opacity-50"
      >
        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Guardar cambios (interruptores y tiempos)
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
      <div className="flex min-h-[640px] flex-col rounded-2xl border border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
        {featuredTopBar}
        <div className="flex flex-1 min-h-0 flex-col p-4 sm:p-5">
          {filtersAndTiersHeader}
          <div className="relative mt-4 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, descripción o categoría…"
              className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <p className="mt-2 shrink-0 text-xs text-gray-500">
            {enabledInView} de {filteredRules.length} activas en esta vista
          </p>
          <div className="mt-3 flex-1 min-h-[420px] overflow-y-auto pr-1">{activeTierPanel}</div>
          <div className="mt-4 shrink-0">{saveBar}</div>
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

      <div className={`shrink-0 px-3 py-2 space-y-3 ${compact ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
        {filtersAndTiersHeader}
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
        {activeTierPanel}
      </div>

      {saveBar}
    </div>
  );
}

function AlertPlanUpgradeCta({
  targetTier,
  ruleCount,
  vertical,
  featured,
  onUpgrade,
}: {
  targetTier: AlertPlanTier;
  userTier: SubscriptionPlanTier;
  ruleCount: number;
  vertical?: string;
  featured?: boolean;
  onUpgrade: () => void;
}) {
  const tierLabel = ALERT_PLAN_TIER_LABELS[targetTier];
  const isPro = targetTier === 'pro';

  return (
    <div className={`rounded-xl border ${
      isPro
        ? 'border-violet-200 bg-gradient-to-r from-violet-50 to-amber-50/60 dark:from-violet-950/40 dark:to-amber-950/20 dark:border-violet-800/50'
        : 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40'
    } ${featured ? 'p-4' : 'p-3'}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isPro
            ? `${PRO_PLAN_GRADIENT} text-white shadow-sm shadow-violet-500/25`
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
        }`}>
          {isPro ? <Crown className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {ruleCount} alertas disponibles en{' '}
            {isPro ? (
              <span className="inline-flex items-center gap-1.5 align-middle">
                plan
                <ProPlanBadge size="sm" />
              </span>
            ) : (
              <>plan {tierLabel}</>
            )}
          </p>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {alertTierDescription(targetTier, vertical)}
          </p>
        </div>
      </div>
      {!isIosCustomerAccessOnlyApp() ? (
      <button
        type="button"
        onClick={onUpgrade}
        className={`mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg font-bold text-white transition ${
          isPro
            ? `${PRO_PLAN_GRADIENT} ${PRO_PLAN_GRADIENT_HOVER} shadow-md shadow-violet-500/25`
            : 'bg-amber-600 hover:bg-amber-700'
        } ${featured ? 'py-2.5 text-sm' : 'py-2 text-xs'}`}
      >
        <Sparkles className="h-4 w-4" />
        {isPro ? (
          <span className="inline-flex items-center gap-1.5">
            Desbloquear
            <ProPlanBadge size="sm" className="shadow-none" />
          </span>
        ) : (
          <>Desbloquear plan {tierLabel}</>
        )}
      </button>
      ) : (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
          En iOS no se cambian planes.
        </p>
      )}
    </div>
  );
}

function RuleToggleRow({
  rule,
  onChange,
  disabled,
  locked,
  planTier,
  delivery,
  cashRegister,
  onOperationalChange,
}: {
  rule: AlertRule;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
  planTier?: AlertPlanTier;
  featured?: boolean;
  delivery: DeliveryOperationalConfig;
  cashRegister: CashRegisterOperationalConfig;
  onOperationalChange: (next: {
    delivery: DeliveryOperationalConfig;
    cashRegister: CashRegisterOperationalConfig;
  }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const deptLabel = getDepartmentLabel(ruleDepartment(rule));
  const isActive = rule.enabled && !disabled && !locked;

  return (
    <div className={`rounded-lg border transition ${
      locked
        ? 'border-gray-200/80 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-800/30'
        : isActive
          ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50'
          : 'border-gray-200/60 bg-gray-50/40 dark:border-gray-700/60 dark:bg-gray-800/20'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 min-w-0 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
          {locked
            ? <Lock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            : isActive
              ? <Bell className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              : <BellOff className="w-3.5 h-3.5 shrink-0 text-gray-400" />}
          <span className={`text-sm font-medium truncate ${
            locked ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'
          }`}>
            {rule.label}
          </span>
          <span className="hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 shrink-0">
            {deptLabel}
          </span>
          {(rule.urgency === 'critical' || rule.urgency === 'high') && (
            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
          )}
        </button>
        {locked ? (
          planTier === 'pro' ? (
            <ProPlanBadge size="sm" className="shrink-0" />
          ) : (
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0 px-1">
              {ALERT_PLAN_TIER_LABELS[planTier || 'normal']}
            </span>
          )
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(!rule.enabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
              rule.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            aria-label={rule.enabled ? 'Desactivar alerta' : 'Activar alerta'}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              rule.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-3 pb-3 pt-2.5">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{rule.description}</p>
          {!locked && (
            <RuleThresholdQuickEdit
              ruleId={rule.id}
              delivery={delivery}
              cashRegister={cashRegister}
              disabled={disabled || !rule.enabled}
              onChange={onOperationalChange}
            />
          )}
        </div>
      )}
    </div>
  );
}
