import { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Save,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquare,
  Smartphone,
  Monitor,
  Moon,
  Clock,
  Filter,
  Search,
  ToggleLeft,
  ToggleRight,
  Shield,
  X,
  Plus,
} from 'lucide-react';
import type {
  AlertsConfig,
  AlertsGlobalConfig,
  AlertRule,
  AlertChannel,
  AlertUrgency,
} from '../../../lib/settingsApi';
import {
  getAlertsConfig,
  saveAlertsConfig,
  DEFAULT_CASH_REGISTER_OPERATIONAL,
  DEFAULT_DELIVERY_OPERATIONAL,
  ruleDepartment,
} from '../../../lib/settingsApi';
import { useAlertDepartments } from '../../../hooks/useAlertDepartments';
import { isRuleVisibleForVertical } from '../../../lib/alertDepartments';

interface Props {
  businessId: string;
}

const CHANNEL_META: Record<AlertChannel, { label: string; icon: typeof Bell; color: string }> = {
  push:  { label: 'Push',   icon: Smartphone,    color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800' },
  email: { label: 'Email',  icon: Mail,          color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800' },
  sms:   { label: 'SMS',    icon: MessageSquare,  color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800' },
  inApp: { label: 'In-App', icon: Monitor,        color: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-900/30 dark:border-violet-800' },
};

const URGENCY_META: Record<AlertUrgency, { label: string; dot: string; bg: string }> = {
  low:      { label: 'Baja',     dot: 'bg-gray-400',   bg: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600' },
  medium:   { label: 'Media',    dot: 'bg-blue-500',   bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' },
  high:     { label: 'Alta',     dot: 'bg-amber-500',  bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' },
  critical: { label: 'Crítica',  dot: 'bg-red-500',    bg: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800' },
};

const SCHEDULE_OPTIONS: { value: AlertRule['schedule']; label: string }[] = [
  { value: 'instant',       label: 'Inmediata' },
  { value: 'digest_daily',  label: 'Resumen diario' },
  { value: 'digest_weekly', label: 'Resumen semanal' },
];

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  stock:      { label: 'Stock',       color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  ventas:     { label: 'Ventas',      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  crm:        { label: 'CRM',         color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  citas:      { label: 'Citas',       color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' },
  taller:     { label: 'Taller',      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  finanzas:   { label: 'Finanzas',    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  seguridad:  { label: 'Seguridad',   color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  documentos: { label: 'Documentos',  color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
  sistema:    { label: 'Sistema',     color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  delivery:   { label: 'Delivery / Caja', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  equipo:     { label: 'Equipo',      color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' },
  conciliacion: { label: 'Conciliación', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
  ocr:        { label: 'OCR',         color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300' },
  documentacion: { label: 'Documentación', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
  compras:    { label: 'Compras',     color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  limpieza:   { label: 'Limpieza',    color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' },
  construccion: { label: 'Construcción', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  carniceria: { label: 'Carnicería',  color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  desguaces:  { label: 'Desguace',    color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
  compraventa: { label: 'Compraventa', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  adquisiciones: { label: 'Adquisiciones', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' },
  vehicle_entry: { label: 'Vehículos', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  verticales: { label: 'Operaciones', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
};

const AVAILABLE_ROLES = ['Admin', 'Comercial', 'Taller', 'Recepción', 'Finanzas'];

export function AlertsTab({ businessId }: Props) {
  const { departments: alertDepartments, vertical } = useAlertDepartments();
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<'global' | 'rules' | null>('rules');

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    getAlertsConfig(businessId)
      .then((data) => setConfig({
        ...data,
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
      }))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [businessId]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await saveAlertsConfig(businessId, config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const updateGlobal = (patch: Partial<AlertsGlobalConfig>) => {
    if (!config) return;
    setConfig({ ...config, global: { ...config.global, ...patch } });
  };

  const updateRule = (ruleId: string, patch: Partial<AlertRule>) => {
    if (!config) return;
    setConfig({
      ...config,
      rules: config.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    });
  };

  const toggleRuleChannel = (ruleId: string, channel: AlertChannel) => {
    if (!config) return;
    setConfig({
      ...config,
      rules: config.rules.map((r) => {
        if (r.id !== ruleId) return r;
        const channels = r.channels.includes(channel)
          ? r.channels.filter((c) => c !== channel)
          : [...r.channels, channel];
        return { ...r, channels };
      }),
    });
  };

  const toggleRuleRole = (ruleId: string, role: string) => {
    if (!config) return;
    setConfig({
      ...config,
      rules: config.rules.map((r) => {
        if (r.id !== ruleId) return r;
        const recipientRoles = r.recipientRoles.includes(role)
          ? r.recipientRoles.filter((x) => x !== role)
          : [...r.recipientRoles, role];
        return { ...r, recipientRoles };
      }),
    });
  };

  const addCustomRecipient = (ruleId: string, email: string) => {
    if (!config || !email.trim()) return;
    setConfig({
      ...config,
      rules: config.rules.map((r) => {
        if (r.id !== ruleId) return r;
        if (r.customRecipients.includes(email.trim())) return r;
        return { ...r, customRecipients: [...r.customRecipients, email.trim()] };
      }),
    });
  };

  const removeCustomRecipient = (ruleId: string, email: string) => {
    if (!config) return;
    setConfig({
      ...config,
      rules: config.rules.map((r) => {
        if (r.id !== ruleId) return r;
        return { ...r, customRecipients: r.customRecipients.filter((e) => e !== email) };
      }),
    });
  };

  const toggleGlobalChannel = (channel: AlertChannel) => {
    if (!config) return;
    const channels = config.global.defaultChannels.includes(channel)
      ? config.global.defaultChannels.filter((c) => c !== channel)
      : [...config.global.defaultChannels, channel];
    updateGlobal({ defaultChannels: channels });
  };

  const enableAllInCategory = (category: string, enabled: boolean) => {
    if (!config) return;
    setConfig({
      ...config,
      rules: config.rules.map((r) => (r.category === category ? { ...r, enabled } : r)),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
        <p className="text-sm text-red-700 dark:text-red-300">{error || 'No se pudo cargar la configuración de alertas'}</p>
      </div>
    );
  }

  const businessRules = config.rules.filter((r) => isRuleVisibleForVertical(ruleDepartment(r), vertical));
  const categories = [...new Set(businessRules.map((r) => r.category))];
  const filteredRules = businessRules.filter((r) => {
    if (filterDepartment !== 'all' && ruleDepartment(r) !== filterDepartment) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    }
    return true;
  });

  const groupedRules = filteredRules.reduce<Record<string, AlertRule[]>>((acc, rule) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {});

  const enabledCount = businessRules.filter((r) => r.enabled).length;
  const totalCount = businessRules.length;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</span>
          </div>
          <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{totalCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">alertas configuradas</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Activas</span>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{enabledCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">de {totalCount} posibles</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Filter className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Categorías</span>
          </div>
          <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{categories.length}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">áreas del negocio</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-1">
            {config.global.muteAll
              ? <BellOff className="w-4 h-4 text-red-500" />
              : <Bell className="w-4 h-4 text-emerald-500" />}
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</span>
          </div>
          <p className={`text-lg font-black ${config.global.muteAll ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {config.global.muteAll ? 'Silenciado' : 'Activo'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">modo global</p>
        </div>
      </div>

      {/* Global config section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setExpandedSection(expandedSection === 'global' ? null : 'global')}
          className="w-full flex items-center justify-between p-6 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              config.global.muteAll
                ? 'bg-red-50 dark:bg-red-950/40'
                : 'bg-emerald-50 dark:bg-emerald-950/40'
            }`}>
              {config.global.muteAll
                ? <BellOff className="w-5 h-5 text-red-500" />
                : <Bell className="w-5 h-5 text-emerald-500" />}
            </div>
            <div className="text-left">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Configuración global</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Silenciar todo, horarios de no molestar, canales por defecto</p>
            </div>
          </div>
          {expandedSection === 'global'
            ? <ChevronDown className="w-5 h-5 text-gray-400" />
            : <ChevronRight className="w-5 h-5 text-gray-400" />}
        </button>

        {expandedSection === 'global' && (
          <div className="px-6 pb-6 space-y-6 border-t border-gray-100 dark:border-gray-700 pt-4">
            {/* Mute all toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">Silenciar todas las alertas</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Desactiva temporalmente todas las notificaciones sin cambiar la configuración individual</p>
              </div>
              <button
                onClick={() => updateGlobal({ muteAll: !config.global.muteAll })}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  config.global.muteAll ? 'bg-red-500' : 'bg-emerald-500'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  config.global.muteAll ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Quiet hours */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Horario de no molestar</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Las alertas se retienen y envían al finalizar este periodo</p>
                  </div>
                </div>
                <button
                  onClick={() => updateGlobal({ quietHoursEnabled: !config.global.quietHoursEnabled })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    config.global.quietHoursEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    config.global.quietHoursEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {config.global.quietHoursEnabled && (
                <div className="flex items-center gap-3 pl-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Desde</label>
                    <input
                      type="time"
                      value={config.global.quietHoursFrom}
                      onChange={(e) => updateGlobal({ quietHoursFrom: e.target.value })}
                      className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Hasta</label>
                    <input
                      type="time"
                      value={config.global.quietHoursTo}
                      onChange={(e) => updateGlobal({ quietHoursTo: e.target.value })}
                      className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Digest time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Hora del resumen diario</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Las alertas con envío «resumen» se agrupan y envían a esta hora</p>
                </div>
              </div>
              <input
                type="time"
                value={config.global.digestTime}
                onChange={(e) => updateGlobal({ digestTime: e.target.value })}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Default channels */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Canales por defecto</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(CHANNEL_META) as AlertChannel[]).map((ch) => {
                  const meta = CHANNEL_META[ch];
                  const Icon = meta.icon;
                  const active = config.global.defaultChannels.includes(ch);
                  return (
                    <button
                      key={ch}
                      onClick={() => toggleGlobalChannel(ch)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        active ? meta.color : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alert rules section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setExpandedSection(expandedSection === 'rules' ? null : 'rules')}
          className="w-full flex items-center justify-between p-6 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <Filter className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Reglas de alertas</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{enabledCount} activas de {totalCount} — Configura cada alerta individualmente</p>
            </div>
          </div>
          {expandedSection === 'rules'
            ? <ChevronDown className="w-5 h-5 text-gray-400" />
            : <ChevronRight className="w-5 h-5 text-gray-400" />}
        </button>

        {expandedSection === 'rules' && (
          <div className="px-6 pb-6 border-t border-gray-100 dark:border-gray-700">
            {/* Search & filter */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar alertas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
                />
              </div>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
              >
                <option value="all">Todas las ramas</option>
                {alertDepartments.filter((d) => d.id !== 'all').map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.label}</option>
                ))}
              </select>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
              >
                <option value="all">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_META[cat]?.label || cat}</option>
                ))}
              </select>
            </div>

            {/* Grouped rules */}
            <div className="space-y-6">
              {Object.entries(groupedRules).map(([category, rules]) => {
                const catMeta = CATEGORY_META[category] || { label: category, color: 'bg-gray-100 text-gray-800' };
                const catEnabledCount = rules.filter((r) => r.enabled).length;
                const allEnabled = rules.every((r) => r.enabled);

                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${catMeta.color}`}>
                          {catMeta.label}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {catEnabledCount}/{rules.length} activas
                        </span>
                      </div>
                      <button
                        onClick={() => enableAllInCategory(category, !allEnabled)}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        {allEnabled
                          ? <><ToggleRight className="w-4 h-4 text-emerald-500" /> Desactivar todas</>
                          : <><ToggleLeft className="w-4 h-4" /> Activar todas</>}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {rules.map((rule) => {
                        const isExpanded = expandedRuleId === rule.id;
                        const urgencyMeta = URGENCY_META[rule.urgency];

                        return (
                          <div
                            key={rule.id}
                            className={`rounded-xl border transition-all ${
                              rule.enabled
                                ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                                : 'border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 opacity-70'
                            }`}
                          >
                            {/* Rule header */}
                            <div className="flex items-center gap-3 p-4">
                              <button
                                onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                                className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors shrink-0 ${
                                  rule.enabled ? 'bg-emerald-500' : 'bg-red-500'
                                }`}
                              >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                  rule.enabled ? 'translate-x-5' : 'translate-x-1'
                                }`} />
                              </button>

                              <div
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{rule.label}</p>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${urgencyMeta.bg}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${urgencyMeta.dot}`} />
                                    {urgencyMeta.label}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{rule.description}</p>
                              </div>

                              <div className="hidden sm:flex items-center gap-1 shrink-0">
                                {rule.channels.map((ch) => {
                                  const Icon = CHANNEL_META[ch].icon;
                                  return (
                                    <span key={ch} className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border text-[10px] ${CHANNEL_META[ch].color}`}>
                                      <Icon className="w-3.5 h-3.5" />
                                    </span>
                                  );
                                })}
                              </div>

                              <button
                                onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                                className="shrink-0 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                {isExpanded
                                  ? <ChevronDown className="w-4 h-4 text-gray-400" />
                                  : <ChevronRight className="w-4 h-4 text-gray-400" />}
                              </button>
                            </div>

                            {/* Rule expanded details */}
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100 dark:border-gray-700/50">
                                {/* Channels */}
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Canales de envío</p>
                                  <div className="flex flex-wrap gap-2">
                                    {(Object.keys(CHANNEL_META) as AlertChannel[]).map((ch) => {
                                      const meta = CHANNEL_META[ch];
                                      const Icon = meta.icon;
                                      const active = rule.channels.includes(ch);
                                      return (
                                        <button
                                          key={ch}
                                          onClick={() => toggleRuleChannel(rule.id, ch)}
                                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                                            active ? meta.color : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
                                          }`}
                                        >
                                          <Icon className="w-3.5 h-3.5" />
                                          {meta.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Urgency & schedule */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Urgencia</label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(Object.keys(URGENCY_META) as AlertUrgency[]).map((u) => {
                                        const meta = URGENCY_META[u];
                                        return (
                                          <button
                                            key={u}
                                            onClick={() => updateRule(rule.id, { urgency: u })}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                              rule.urgency === u ? meta.bg : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                                            }`}
                                          >
                                            <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                                            {meta.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Frecuencia de envío</label>
                                    <select
                                      value={rule.schedule}
                                      onChange={(e) => updateRule(rule.id, { schedule: e.target.value as AlertRule['schedule'] })}
                                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
                                    >
                                      {SCHEDULE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {/* Recipients */}
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Roles destinatarios</p>
                                  <div className="flex flex-wrap gap-2">
                                    {AVAILABLE_ROLES.map((role) => {
                                      const active = rule.recipientRoles.includes(role);
                                      return (
                                        <button
                                          key={role}
                                          onClick={() => toggleRuleRole(rule.id, role)}
                                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                                            active
                                              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300'
                                          }`}
                                        >
                                          <Shield className="w-3.5 h-3.5" />
                                          {role}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Custom recipients */}
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Destinatarios adicionales (email)</p>
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {rule.customRecipients.map((email) => (
                                      <span
                                        key={email}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300"
                                      >
                                        {email}
                                        <button onClick={() => removeCustomRecipient(rule.id, email)} className="hover:text-red-500 transition-colors">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <input
                                      type="email"
                                      placeholder="email@ejemplo.com"
                                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          addCustomRecipient(rule.id, (e.target as HTMLInputElement).value);
                                          (e.target as HTMLInputElement).value = '';
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={(e) => {
                                        const input = (e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement;
                                        if (input?.value) {
                                          addCustomRecipient(rule.id, input.value);
                                          input.value = '';
                                        }
                                      }}
                                      className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400 transition-colors"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {filteredRules.length === 0 && (
                <div className="text-center py-8">
                  <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No se encontraron alertas con los filtros actuales</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-300">Configuración de alertas guardada correctamente</p>
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-gray-300 text-white dark:text-gray-900 text-sm font-bold transition-colors disabled:opacity-50"
        >
          <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
          {saving ? 'Guardando...' : 'Guardar alertas'}
        </button>
      </div>
    </div>
  );
}
