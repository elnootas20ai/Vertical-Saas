import { useState, useCallback } from 'react';
import {
  Settings, Server, Globe, CreditCard, Search,
  Shield, ShieldOff, ShieldCheck, Plus, Trash2,
  Check, RotateCcw, Image as ImageIcon, FileText,
  Link, Tag, Bot, Monitor, HardDrive, Calendar,
  CircleDot, ToggleLeft, ToggleRight, Pencil,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';

type SettingsTab = 'general' | 'login' | 'payments' | 'seo';

type LoginType = 'none' | 'standard' | 'custom';
type PaymentInterval = 'monthly' | 'yearly' | 'one_time';

interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  interval: PaymentInterval;
  active: boolean;
}

interface AppSettingsData {
  appName: string;
  description: string;
  port: number;
  frontendActive: boolean;
  backendActive: boolean;
  technology: string;
  createdAt: string;
  loginType: LoginType;
  loginProvider: string;
  paymentGateway: string;
  plans: PaymentPlan[];
  favicon: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  keywords: string;
  robots: string;
  canonical: string;
}

const STORAGE_KEY = 'pluginAppSettings';

function loadSettings(): AppSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    appName: 'Mi Aplicación',
    description: '',
    port: 3000,
    frontendActive: true,
    backendActive: true,
    technology: 'React + Node.js + CouchDB',
    createdAt: new Date().toISOString().split('T')[0],
    loginType: 'none',
    loginProvider: '',
    paymentGateway: 'Stripe',
    plans: [],
    favicon: '/favicon.ico',
    metaTitle: '',
    metaDescription: '',
    ogImage: '',
    keywords: '',
    robots: 'index, follow',
    canonical: '',
  };
}

function saveSettings(data: AppSettingsData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function StatusBadge({ active, isDark, t }: { active: boolean; isDark: boolean; t: (k: string) => string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
      active
        ? isDark ? 'bg-emerald-950/60 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
        : isDark ? 'bg-red-950/40 text-red-400 ring-1 ring-red-500/30' : 'bg-red-50 text-red-600 ring-1 ring-red-200',
    )}>
      <CircleDot className="size-2.5" />
      {active ? t('settingsActive') : t('settingsInactive')}
    </span>
  );
}

function FieldRow({ label, desc, children, isDark }: {
  label: string;
  desc?: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div className={cn(
      'flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 py-3 border-b last:border-b-0',
      isDark ? 'border-zinc-800/60' : 'border-gray-100',
    )}>
      <div className="sm:w-[140px] shrink-0">
        <p className={cn('text-xs font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>{label}</p>
        {desc && <p className={cn('text-[10px] mt-0.5', isDark ? 'text-zinc-600' : 'text-gray-400')}>{desc}</p>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, isDark }: { checked: boolean; onChange: (v: boolean) => void; isDark: boolean }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        checked
          ? 'bg-emerald-500'
          : isDark ? 'bg-zinc-700' : 'bg-gray-300',
      )}
    >
      <span className={cn(
        'inline-block size-3.5 transform rounded-full bg-white transition-transform shadow-sm',
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
      )} />
    </button>
  );
}

function InputField({ value, onChange, placeholder, isDark, type = 'text', className }: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  isDark: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full rounded-lg px-3 py-1.5 text-xs outline-none border transition-colors',
        isDark
          ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/60'
          : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-400',
        className,
      )}
    />
  );
}

function TextareaField({ value, onChange, placeholder, isDark, rows = 2 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isDark: boolean;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        'w-full rounded-lg px-3 py-1.5 text-xs outline-none border transition-colors resize-none',
        isDark
          ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/60'
          : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-400',
      )}
    />
  );
}

function SelectField({ value, onChange, options, isDark }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  isDark: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-lg px-3 py-1.5 text-xs outline-none border transition-colors appearance-none pr-7',
          isDark
            ? 'bg-zinc-900 border-zinc-700 text-zinc-200 focus:border-violet-500/60'
            : 'bg-white border-gray-200 text-gray-900 focus:border-violet-400',
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className={cn('absolute right-2 top-1/2 -translate-y-1/2 size-3 pointer-events-none', isDark ? 'text-zinc-500' : 'text-gray-400')} />
    </div>
  );
}

function GeneralTab({ settings, onChange, isDark, t }: {
  settings: AppSettingsData;
  onChange: (patch: Partial<AppSettingsData>) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-0">
      <FieldRow label={t('settingsAppName')} desc={t('settingsAppNameDesc')} isDark={isDark}>
        <InputField value={settings.appName} onChange={(v) => onChange({ appName: v })} isDark={isDark} />
      </FieldRow>
      <FieldRow label={t('settingsDescription')} desc={t('settingsDescriptionDesc')} isDark={isDark}>
        <TextareaField value={settings.description} onChange={(v) => onChange({ description: v })} isDark={isDark} placeholder="..." />
      </FieldRow>
      <FieldRow label={t('settingsPort')} desc={t('settingsPortDesc')} isDark={isDark}>
        <div className="flex items-center gap-2">
          <InputField value={settings.port} onChange={(v) => onChange({ port: parseInt(v) || 0 })} isDark={isDark} type="number" className="w-24" />
          <span className={cn('text-[10px] font-mono px-2 py-1 rounded-md', isDark ? 'bg-zinc-800 text-emerald-400' : 'bg-gray-100 text-emerald-600')}>
            :{settings.port}
          </span>
        </div>
      </FieldRow>
      <FieldRow label={t('settingsFrontendActive')} isDark={isDark}>
        <div className="flex items-center gap-3">
          <Toggle checked={settings.frontendActive} onChange={(v) => onChange({ frontendActive: v })} isDark={isDark} />
          <StatusBadge active={settings.frontendActive} isDark={isDark} t={t} />
        </div>
      </FieldRow>
      <FieldRow label={t('settingsBackendActive')} isDark={isDark}>
        <div className="flex items-center gap-3">
          <Toggle checked={settings.backendActive} onChange={(v) => onChange({ backendActive: v })} isDark={isDark} />
          <StatusBadge active={settings.backendActive} isDark={isDark} t={t} />
        </div>
      </FieldRow>
      <FieldRow label={t('settingsTechnology')} desc={t('settingsTechnologyDesc')} isDark={isDark}>
        <InputField value={settings.technology} onChange={(v) => onChange({ technology: v })} isDark={isDark} />
      </FieldRow>
      <FieldRow label={t('settingsCreatedAt')} isDark={isDark}>
        <div className="flex items-center gap-2">
          <Calendar className={cn('size-3.5', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <InputField value={settings.createdAt} onChange={(v) => onChange({ createdAt: v })} isDark={isDark} type="date" className="w-40" />
        </div>
      </FieldRow>
    </div>
  );
}

function LoginTab({ settings, onChange, isDark, t }: {
  settings: AppSettingsData;
  onChange: (patch: Partial<AppSettingsData>) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  const loginOptions: { type: LoginType; icon: typeof ShieldOff; label: string; desc: string; color: string }[] = [
    { type: 'none', icon: ShieldOff, label: t('settingsLoginNone'), desc: t('settingsLoginNoneDesc'), color: 'text-zinc-400' },
    { type: 'standard', icon: Shield, label: t('settingsLoginStandard'), desc: t('settingsLoginStandardDesc'), color: 'text-blue-400' },
    { type: 'custom', icon: ShieldCheck, label: t('settingsLoginCustom'), desc: t('settingsLoginCustomDesc'), color: 'text-violet-400' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className={cn('text-xs font-medium mb-3', isDark ? 'text-zinc-300' : 'text-gray-700')}>{t('settingsLoginType')}</p>
        <div className="grid gap-2">
          {loginOptions.map(({ type, icon: Icon, label, desc, color }) => (
            <button
              key={type}
              onClick={() => onChange({ loginType: type })}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                settings.loginType === type
                  ? isDark
                    ? 'border-violet-500/50 bg-violet-950/30 ring-1 ring-violet-500/20'
                    : 'border-violet-400 bg-violet-50 ring-1 ring-violet-200'
                  : isDark
                    ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900'
                    : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50',
              )}
            >
              <div className={cn(
                'size-8 rounded-lg flex items-center justify-center shrink-0',
                settings.loginType === type
                  ? isDark ? 'bg-violet-600/20' : 'bg-violet-100'
                  : isDark ? 'bg-zinc-800' : 'bg-gray-100',
              )}>
                <Icon className={cn('size-4', settings.loginType === type ? 'text-violet-400' : color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs font-medium', isDark ? 'text-zinc-200' : 'text-gray-800')}>{label}</p>
                <p className={cn('text-[10px] mt-0.5', isDark ? 'text-zinc-500' : 'text-gray-500')}>{desc}</p>
              </div>
              {settings.loginType === type && (
                <Check className="size-4 text-violet-400 shrink-0 mt-0.5" />
              )}
            </button>
          ))}
        </div>
      </div>

      {settings.loginType === 'custom' && (
        <FieldRow label={t('settingsLoginProvider')} desc={t('settingsLoginProviderDesc')} isDark={isDark}>
          <SelectField
            value={settings.loginProvider}
            onChange={(v) => onChange({ loginProvider: v })}
            options={[
              { value: '', label: '—' },
              { value: 'google', label: 'Google OAuth' },
              { value: 'github', label: 'GitHub OAuth' },
              { value: 'auth0', label: 'Auth0' },
              { value: 'firebase', label: 'Firebase Auth' },
              { value: 'keycloak', label: 'Keycloak' },
              { value: 'custom', label: 'Custom SSO' },
            ]}
            isDark={isDark}
          />
        </FieldRow>
      )}
    </div>
  );
}

function PaymentsTab({ settings, onChange, isDark, t }: {
  settings: AppSettingsData;
  onChange: (patch: Partial<AppSettingsData>) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const addPlan = () => {
    const plan: PaymentPlan = {
      id: Date.now().toString(36),
      name: 'Nuevo Plan',
      price: 9.99,
      interval: 'monthly',
      active: true,
    };
    onChange({ plans: [...settings.plans, plan] });
    setEditingId(plan.id);
  };

  const updatePlan = (id: string, patch: Partial<PaymentPlan>) => {
    onChange({ plans: settings.plans.map((p) => p.id === id ? { ...p, ...patch } : p) });
  };

  const removePlan = (id: string) => {
    onChange({ plans: settings.plans.filter((p) => p.id !== id) });
    if (editingId === id) setEditingId(null);
  };

  const intervalLabel = (i: PaymentInterval) => {
    switch (i) {
      case 'monthly': return t('settingsPaymentsMonthly');
      case 'yearly': return t('settingsPaymentsYearly');
      case 'one_time': return t('settingsPaymentsOneTime');
    }
  };

  return (
    <div className="space-y-4">
      <FieldRow label={t('settingsPaymentsGateway')} desc={t('settingsPaymentsGatewayDesc')} isDark={isDark}>
        <SelectField
          value={settings.paymentGateway}
          onChange={(v) => onChange({ paymentGateway: v })}
          options={[
            { value: 'Stripe', label: 'Stripe' },
            { value: 'PayPal', label: 'PayPal' },
            { value: 'MercadoPago', label: 'Mercado Pago' },
            { value: 'Square', label: 'Square' },
            { value: 'Paddle', label: 'Paddle' },
            { value: 'none', label: '—' },
          ]}
          isDark={isDark}
        />
      </FieldRow>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className={cn('text-xs font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>
            {t('settingsPaymentsPlan')}s
          </p>
          <button
            onClick={addPlan}
            className={cn(
              'flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
              isDark ? 'bg-violet-600/20 text-violet-400 hover:bg-violet-600/30' : 'bg-violet-100 text-violet-600 hover:bg-violet-200',
            )}
          >
            <Plus className="size-3" />
            {t('settingsPaymentsAdd')}
          </button>
        </div>

        {settings.plans.length === 0 ? (
          <div className={cn(
            'rounded-lg border border-dashed py-8 text-center',
            isDark ? 'border-zinc-800 bg-zinc-900/30' : 'border-gray-200 bg-gray-50',
          )}>
            <CreditCard className={cn('size-6 mx-auto mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-xs', isDark ? 'text-zinc-600' : 'text-gray-400')}>
              {t('settingsPaymentsNoPlans')}
            </p>
          </div>
        ) : (
          <div className={cn(
            'rounded-lg border overflow-hidden',
            isDark ? 'border-zinc-800' : 'border-gray-200',
          )}>
            <div className={cn(
              'grid grid-cols-[1fr_80px_90px_50px_40px] gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider',
              isDark ? 'bg-zinc-900 text-zinc-500 border-b border-zinc-800' : 'bg-gray-50 text-gray-400 border-b border-gray-200',
            )}>
              <span>{t('settingsPaymentsPlan')}</span>
              <span>{t('settingsPaymentsPrice')}</span>
              <span>{t('settingsPaymentsInterval')}</span>
              <span className="text-center">{t('settingsPaymentsActive')}</span>
              <span />
            </div>
            {settings.plans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  'grid grid-cols-[1fr_80px_90px_50px_40px] gap-1 items-center px-3 py-2 border-b last:border-b-0 group',
                  isDark ? 'border-zinc-800/60 hover:bg-zinc-900/50' : 'border-gray-100 hover:bg-gray-50',
                )}
              >
                {editingId === plan.id ? (
                  <>
                    <input
                      value={plan.name}
                      onChange={(e) => updatePlan(plan.id, { name: e.target.value })}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded border outline-none',
                        isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-200 text-gray-900',
                      )}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingId(null); }}
                      autoFocus
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={plan.price}
                      onChange={(e) => updatePlan(plan.id, { price: parseFloat(e.target.value) || 0 })}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded border outline-none w-full',
                        isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-200 text-gray-900',
                      )}
                    />
                    <select
                      value={plan.interval}
                      onChange={(e) => updatePlan(plan.id, { interval: e.target.value as PaymentInterval })}
                      className={cn(
                        'text-[10px] px-1 py-0.5 rounded border outline-none',
                        isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-200 text-gray-900',
                      )}
                    >
                      <option value="monthly">{t('settingsPaymentsMonthly')}</option>
                      <option value="yearly">{t('settingsPaymentsYearly')}</option>
                      <option value="one_time">{t('settingsPaymentsOneTime')}</option>
                    </select>
                  </>
                ) : (
                  <>
                    <span className={cn('text-xs truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{plan.name}</span>
                    <span className={cn('text-xs font-mono', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                      ${plan.price.toFixed(2)}
                    </span>
                    <span className={cn('text-[10px]', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                      {intervalLabel(plan.interval)}
                    </span>
                  </>
                )}
                <div className="flex justify-center">
                  <Toggle checked={plan.active} onChange={(v) => updatePlan(plan.id, { active: v })} isDark={isDark} />
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setEditingId(editingId === plan.id ? null : plan.id)}
                    className={cn(
                      'size-5 rounded flex items-center justify-center transition-colors',
                      editingId === plan.id
                        ? 'text-emerald-400'
                        : isDark ? 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-300 hover:text-gray-700 hover:bg-gray-100',
                    )}
                  >
                    {editingId === plan.id ? <Check className="size-3" /> : <Pencil className="size-3" />}
                  </button>
                  <button
                    onClick={() => removePlan(plan.id)}
                    className={cn(
                      'size-5 rounded flex items-center justify-center transition-colors',
                      isDark ? 'text-zinc-600 hover:text-red-400 hover:bg-zinc-800' : 'text-gray-300 hover:text-red-500 hover:bg-gray-100',
                    )}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SeoTab({ settings, onChange, isDark, t }: {
  settings: AppSettingsData;
  onChange: (patch: Partial<AppSettingsData>) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-0">
      <FieldRow label={t('settingsFavicon')} desc={t('settingsFaviconDesc')} isDark={isDark}>
        <div className="flex items-center gap-2">
          <div className={cn(
            'size-8 rounded-lg border flex items-center justify-center shrink-0',
            isDark ? 'border-zinc-700 bg-zinc-900' : 'border-gray-200 bg-gray-50',
          )}>
            {settings.favicon ? (
              <img src={settings.favicon} alt="favicon" className="size-4" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <ImageIcon className={cn('size-3.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
            )}
          </div>
          <InputField value={settings.favicon} onChange={(v) => onChange({ favicon: v })} isDark={isDark} placeholder="/favicon.ico" />
        </div>
      </FieldRow>
      <FieldRow label={t('settingsMetaTitle')} desc={t('settingsMetaTitleDesc')} isDark={isDark}>
        <InputField value={settings.metaTitle} onChange={(v) => onChange({ metaTitle: v })} isDark={isDark} placeholder="Mi App - Título" />
      </FieldRow>
      <FieldRow label={t('settingsMetaDescription')} desc={t('settingsMetaDescriptionDesc')} isDark={isDark}>
        <div>
          <TextareaField value={settings.metaDescription} onChange={(v) => onChange({ metaDescription: v })} isDark={isDark} placeholder="Descripción para buscadores..." />
          <p className={cn(
            'text-[9px] mt-1 text-right',
            (settings.metaDescription.length > 160)
              ? 'text-red-400'
              : isDark ? 'text-zinc-600' : 'text-gray-400',
          )}>
            {settings.metaDescription.length}/160
          </p>
        </div>
      </FieldRow>
      <FieldRow label={t('settingsOgImage')} desc={t('settingsOgImageDesc')} isDark={isDark}>
        <InputField value={settings.ogImage} onChange={(v) => onChange({ ogImage: v })} isDark={isDark} placeholder="https://..." />
      </FieldRow>
      <FieldRow label={t('settingsKeywords')} desc={t('settingsKeywordsDesc')} isDark={isDark}>
        <InputField value={settings.keywords} onChange={(v) => onChange({ keywords: v })} isDark={isDark} placeholder="react, saas, dashboard..." />
      </FieldRow>
      <FieldRow label={t('settingsRobots')} desc={t('settingsRobotsDesc')} isDark={isDark}>
        <SelectField
          value={settings.robots}
          onChange={(v) => onChange({ robots: v })}
          options={[
            { value: 'index, follow', label: 'index, follow' },
            { value: 'noindex, follow', label: 'noindex, follow' },
            { value: 'index, nofollow', label: 'index, nofollow' },
            { value: 'noindex, nofollow', label: 'noindex, nofollow' },
          ]}
          isDark={isDark}
        />
      </FieldRow>
      <FieldRow label={t('settingsCanonical')} desc={t('settingsCanonicalDesc')} isDark={isDark}>
        <InputField value={settings.canonical} onChange={(v) => onChange({ canonical: v })} isDark={isDark} placeholder="https://miapp.com" />
      </FieldRow>
    </div>
  );
}

const TABS: { key: SettingsTab; icon: typeof Server; color: string }[] = [
  { key: 'general', icon: Server, color: 'violet' },
  { key: 'login', icon: Shield, color: 'blue' },
  { key: 'payments', icon: CreditCard, color: 'emerald' },
  { key: 'seo', icon: Search, color: 'amber' },
];

export function AppSettings() {
  const { isDark, t } = usePluginSettings();
  const [tab, setTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<AppSettingsData>(loadSettings);
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback((patch: Partial<AppSettingsData>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [settings]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettings(loadSettings());
  }, []);

  const tabLabel = (key: SettingsTab) => {
    switch (key) {
      case 'general': return t('settingsGeneral');
      case 'login': return t('settingsLogin');
      case 'payments': return t('settingsPayments');
      case 'seo': return t('settingsSeo');
    }
  };

  const tabColor = (key: SettingsTab, active: boolean) => {
    if (!active) return isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700';
    switch (key) {
      case 'general': return isDark ? 'text-violet-300' : 'text-violet-600';
      case 'login': return isDark ? 'text-blue-300' : 'text-blue-600';
      case 'payments': return isDark ? 'text-emerald-300' : 'text-emerald-600';
      case 'seo': return isDark ? 'text-amber-300' : 'text-amber-600';
    }
  };

  const activeBarColor = (key: SettingsTab) => {
    switch (key) {
      case 'general': return isDark ? 'bg-violet-500' : 'bg-violet-600';
      case 'login': return isDark ? 'bg-blue-500' : 'bg-blue-600';
      case 'payments': return isDark ? 'bg-emerald-500' : 'bg-emerald-600';
      case 'seo': return isDark ? 'bg-amber-500' : 'bg-amber-600';
    }
  };

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', isDark ? 'bg-zinc-950' : 'bg-white')}>
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-3 border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <div className={cn(
          'size-7 rounded-lg flex items-center justify-center',
          isDark ? 'bg-violet-600/20' : 'bg-violet-100',
        )}>
          <Settings className="size-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <p className={cn('text-sm font-semibold', isDark ? 'text-zinc-100' : 'text-gray-900')}>
            {t('settingsLabel')}
          </p>
          <p className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
            {settings.appName} &middot; :{settings.port}
          </p>
        </div>
      </div>

      {/* Inner tabs */}
      <div className={cn(
        'flex border-b shrink-0 px-1',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors relative',
              tabColor(key, tab === key),
            )}
          >
            <Icon className="size-3" />
            <span className="hidden sm:inline">{tabLabel(key)}</span>
            <span className="sm:hidden">{tabLabel(key).slice(0, 3)}</span>
            {tab === key && (
              <div className={cn('absolute bottom-0 left-2 right-2 h-0.5 rounded-full', activeBarColor(key))} />
            )}
          </button>
        ))}
      </div>

      {/* Info bar */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-2 border-b text-[10px] shrink-0',
        isDark ? 'border-zinc-800/60 bg-zinc-900/40' : 'border-gray-100 bg-gray-50',
      )}>
        <div className="flex items-center gap-1.5">
          <Monitor className={cn('size-3', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <span className={cn(isDark ? 'text-zinc-400' : 'text-gray-500')}>{t('settingsFrontendActive')}:</span>
          <StatusBadge active={settings.frontendActive} isDark={isDark} t={t} />
        </div>
        <div className="flex items-center gap-1.5">
          <HardDrive className={cn('size-3', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <span className={cn(isDark ? 'text-zinc-400' : 'text-gray-500')}>{t('settingsBackendActive')}:</span>
          <StatusBadge active={settings.backendActive} isDark={isDark} t={t} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'general' && <GeneralTab settings={settings} onChange={handleChange} isDark={isDark} t={t} />}
        {tab === 'login' && <LoginTab settings={settings} onChange={handleChange} isDark={isDark} t={t} />}
        {tab === 'payments' && <PaymentsTab settings={settings} onChange={handleChange} isDark={isDark} t={t} />}
        {tab === 'seo' && <SeoTab settings={settings} onChange={handleChange} isDark={isDark} t={t} />}
      </div>

      {/* Footer actions */}
      <div className={cn(
        'flex items-center justify-between px-4 py-2.5 border-t shrink-0',
        isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50',
      )}>
        <button
          onClick={handleReset}
          className={cn(
            'flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors',
            isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
          )}
        >
          <RotateCcw className="size-3" />
          {t('settingsReset')}
        </button>
        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-1.5 text-[11px] font-semibold px-4 py-1.5 rounded-lg transition-all',
            saved
              ? 'bg-emerald-600 text-white'
              : 'bg-violet-600 hover:bg-violet-500 text-white',
          )}
        >
          {saved ? (
            <>
              <Check className="size-3" />
              {t('settingsSaved')}
            </>
          ) : (
            <>
              <Check className="size-3" />
              {t('settingsSave')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
