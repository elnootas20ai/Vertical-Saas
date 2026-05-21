import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Building2,
  RefreshCw,
  Shield,
  Users,
  X,
  Lock,
  Unlock,
  Key,
  Link,
  Save,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  Database,
  Download,
  GitFork,
  Clock,
  FileText,
  ChevronDown,
  Activity,
  Filter,
  LogIn,
  Trash2,
  PenLine,
  Plus,
  PackageOpen,
  CalendarDays,
  TrendingUp,
  UserCheck,
  CreditCard,
  Mail,
  MousePointerClick,
  Upload,
  ShieldCheck,
  ShieldX,
  DollarSign,
  Percent,
  GripVertical,
  Star,
  Sparkles,
  LoaderCircle,
  Search,
  Store,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  HandshakeIcon,
  CheckCircle2,
  XCircle,
  Phone,
  Globe,
  MessageSquare,
  Timer,
  Hourglass,
} from 'lucide-react';
import { impersonateUser } from '../../lib/settingsApi';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { isVertialSuperAdminEmail } from '../../lib/superAdmin';
import {
  getBasePointOfSaleLimit,
  getEffectivePointOfSaleLimit,
  resolvePlanTier,
} from '../../lib/pointOfSaleLimits';
import type { AuthUser } from '../../lib/authApi';
import {
  getPlanPricingConfig,
  savePlanPricingConfig,
  DEFAULT_PLANS,
  DEFAULT_ANNUAL_DISCOUNT,
  type PlanPricingConfig,
  type PlanDefinition,
  type PlanFeature,
} from '../../lib/planPricingApi';
import { MoneiPaymentsTab } from './MoneiPaymentsTab';
import { getApiBase } from '../../lib/apiBase';
import {
  listAffiliates,
  updateAffiliateStatus,
  type Affiliate,
  type AffiliateStatus,
} from '../../lib/affiliatesApi';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(user: Partial<AuthUser>) {
  return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'UU';
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


const API_BASE = getApiBase();

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  return res;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'clients', label: 'Clientes SaaS', icon: Users },
  { id: 'payments', label: 'Pagos MONEI', icon: CreditCard },
  { id: 'plans', label: 'Planes y precios', icon: DollarSign },
  { id: 'affiliate_requests', label: 'Solicitudes afiliados', icon: HandshakeIcon },
  { id: 'backup', label: 'Backup CouchDB', icon: Database },
  { id: 'audit', label: 'Auditoría', icon: Activity },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PLAN_OPTIONS = [
  { id: 'basic', name: 'Basic' },
  { id: 'pro', name: 'Pro' },
  { id: 'enterprise', name: 'Enterprise' },
  { id: 'trial', name: 'Trial' },
];

const SUBSCRIPTION_STATUS_OPTIONS = [
  { id: 'trial_active', label: 'Trial activo', color: 'text-blue-700 bg-blue-50' },
  { id: 'trial_expiring', label: 'Trial expirando', color: 'text-amber-700 bg-amber-50' },
  { id: 'trial_expired', label: 'Trial expirado', color: 'text-red-700 bg-red-50' },
  { id: 'subscription_active', label: 'Suscripción activa', color: 'text-green-700 bg-green-50' },
  { id: 'payment_failed', label: 'Pago fallido', color: 'text-red-700 bg-red-50' },
  { id: 'grace_period', label: 'Periodo de gracia', color: 'text-orange-700 bg-orange-50' },
  { id: 'suspended', label: 'Suspendido', color: 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700' },
];

function getStatusBadge(status?: string) {
  const found = SUBSCRIPTION_STATUS_OPTIONS.find((s) => s.id === status);
  return found ?? { id: status ?? '', label: status ?? 'Sin plan', color: 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700' };
}

const ENTITY_LABELS: Record<string, string> = {
  vehicle: 'Vehículo',
  account: 'Cuenta',
  sale: 'Venta',
  client: 'Cliente',
  lead: 'Lead',
  login: 'Login',
  export: 'Exportación',
  invoice: 'Factura',
  quote: 'Presupuesto',
  contract: 'Contrato',
  finance: 'Finanzas',
  purchase: 'Compra',
  document: 'Documento',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
  login: 'Login',
  export: 'Exportar',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'text-green-700 bg-green-50',
  update: 'text-blue-700 bg-blue-50',
  delete: 'text-red-700 bg-red-50',
  login: 'text-violet-700 bg-violet-50',
  export: 'text-amber-700 bg-amber-50',
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create: <Plus className="w-3 h-3" />,
  update: <PenLine className="w-3 h-3" />,
  delete: <Trash2 className="w-3 h-3" />,
  login: <LogIn className="w-3 h-3" />,
  export: <PackageOpen className="w-3 h-3" />,
};

// ─── Helpers CTA onboarding ──────────────────────────────────────────────────

const IMPORT_SECTIONS = ['vehicles', 'clients', 'team', 'billing'] as const;
const IMPORT_LABELS: Record<string, string> = {
  vehicles: 'Vehículos',
  clients: 'Clientes',
  team: 'Equipo',
  billing: 'Facturación',
};

function getPixelStatus(account: AuthUser) {
  const od = (account.onboardingData || {}) as Record<string, unknown>;
  return {
    opened: Boolean(od.pixelOpened),
    clicked: Boolean(od.pixelClicked),
  };
}

function getCardStatus(account: AuthUser) {
  return Boolean(account.paymentSummary?.lastFourDigits);
}

function getImportProgress(account: AuthUser) {
  const od = (account.onboardingData || {}) as Record<string, unknown>;
  const imports = (od.imports || {}) as Record<string, boolean>;
  const done = IMPORT_SECTIONS.filter((s) => Boolean(imports[s]));
  return { done: done.length, total: IMPORT_SECTIONS.length, sections: imports };
}

function getAncoverAccess(account: AuthUser) {
  const od = (account.onboardingData || {}) as Record<string, unknown>;
  return Boolean(od.ancoverAccess);
}

// ─── Modal de edición de cliente ─────────────────────────────────────────────

interface EditModalProps {
  account: AuthUser;
  onClose: () => void;
  onSaved: (updated: AuthUser) => void;
}

function EditClientModal({ account, onClose, onSaved }: EditModalProps) {
  const { updateUser, resetUserPassword } = useAuth();

  const [companyName, setCompanyName] = useState(account.companyName || '');
  const [email, setEmail] = useState(account.email || '');
  const [planName, setPlanName] = useState(account.subscription?.planName || 'Basic');
  const [selectedPlanId, setSelectedPlanId] = useState(
    account.subscription?.selectedPlanId || account.subscription?.planName?.toLowerCase() || 'basic',
  );
  const [subscriptionStatus, setSubscriptionStatus] = useState(
    account.subscription?.status || 'trial_active',
  );
  const [extraPointOfSaleSlots, setExtraPointOfSaleSlots] = useState(
    String(account.subscription?.extraPointOfSaleSlots ?? 0),
  );
  const [adminProAccess, setAdminProAccess] = useState(
    Boolean(account.subscription?.adminProAccess),
  );
  const [isBlocked, setIsBlocked] = useState(account.status === 'inactive');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [grantingMonths, setGrantingMonths] = useState(false);
  const [grantResult, setGrantResult] = useState<{ ok: boolean; months?: number; error?: string } | null>(null);

  const handleGrantFreeMonths = async (months: 1 | 2) => {
    setGrantingMonths(true);
    setGrantResult(null);
    try {
      const res = await apiFetch('/api/admin/monei/grant-free-months', {
        method: 'POST',
        body: JSON.stringify({ userId: account.user_id, months }),
      });
      const data = await res.json();
      if (data.ok) {
        setGrantResult({ ok: true, months });
        setSubscriptionStatus('subscription_active');
        const updated = await updateUser(account.user_id, {});
        if (updated.user) onSaved(updated.user);
      } else {
        setGrantResult({ ok: false, error: data.error || 'Error desconocido' });
      }
    } catch (err: unknown) {
      setGrantResult({ ok: false, error: err instanceof Error ? err.message : 'Error de red' });
    } finally {
      setGrantingMonths(false);
      setTimeout(() => setGrantResult(null), 4000);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    const result = await updateUser(account.user_id, {
      companyName,
      email,
      status: isBlocked ? 'inactive' : 'active',
      subscription: {
        ...account.subscription,
        planName,
        selectedPlanId,
        status: subscriptionStatus as AuthUser['subscription'] extends { status: infer S } ? S : never,
        cancelAtPeriodEnd: account.subscription?.cancelAtPeriodEnd ?? false,
        extraPointOfSaleSlots: Math.max(0, Math.min(99, Math.floor(Number(extraPointOfSaleSlots) || 0))),
        adminProAccess,
      },
    });
    setSaving(false);
    if (!result.success) { setSaveError(result.error ?? 'No se pudo guardar'); return; }
    setSaveSuccess(true);
    if (result.user) onSaved(result.user);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleResetPassword = async () => {
    setResetting(true);
    setGeneratedPassword(null);
    const result = await resetUserPassword(account.user_id);
    setResetting(false);
    if (result.success && result.generatedPassword) {
      setGeneratedPassword(result.generatedPassword);
      const updated = await updateUser(account.user_id, {});
      if (updated.user) onSaved(updated.user);
    }
  };

  const handleCopyPassword = async () => {
    if (!generatedPassword) return;
    await navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendLink = async () => {
    const loginUrl = `${window.location.origin}/auth/login`;
    const text = `Accede a Vertial:\nURL: ${loginUrl}\nEmail: ${email}${generatedPassword ? `\nContraseña temporal: ${generatedPassword}` : ''}`;
    await navigator.clipboard.writeText(text);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleImpersonate = async () => {
    setImpersonating(true);
    setImpersonateError('');
    try {
      const result = await impersonateUser(account.user_id);
      if (result.accessToken) {
        const url = new URL('/saas/dashboard', window.location.origin);
        url.searchParams.set('_impersonate', result.accessToken);
        url.searchParams.set('_impersonating', account.fullName || account.email);
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      setImpersonateError(err instanceof Error ? err.message : 'Error al iniciar impersonación');
    } finally {
      setImpersonating(false);
    }
  };

  const handlePlanChange = (planId: string) => {
    const plan = PLAN_OPTIONS.find((p) => p.id === planId);
    if (plan) { setSelectedPlanId(plan.id); setPlanName(plan.name); }
  };

  const planTier = resolvePlanTier(selectedPlanId, planName);
  const basePdvLimit = getBasePointOfSaleLimit(planTier);
  const extraPdv = Math.max(0, Math.min(99, Math.floor(Number(extraPointOfSaleSlots) || 0)));
  const totalPdvLimit = basePdvLimit + extraPdv;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 rounded-t-2xl px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center shrink-0">
              {account.avatar ? (
                <img src={account.avatar} alt={account.fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="font-bold text-gray-600 dark:text-gray-400 text-sm">{initials(account)}</span>
              )}
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-gray-100 leading-tight">{account.fullName}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{account.user_id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${isBlocked ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-center gap-2">
              {isBlocked ? <Lock className="w-4 h-4 text-red-600" /> : <Unlock className="w-4 h-4 text-green-600" />}
              <span className={`text-sm font-semibold ${isBlocked ? 'text-red-700' : 'text-green-700'}`}>
                {isBlocked ? 'Cuenta bloqueada' : 'Cuenta activa'}
              </span>
            </div>
            <button
              onClick={() => setIsBlocked((prev) => !prev)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${isBlocked ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
            >
              {isBlocked ? 'Desbloquear' : 'Bloquear'}
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-900 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Empresa</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-900 transition-all"
                  placeholder="Nombre de la empresa" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Plan</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <select value={selectedPlanId} onChange={(e) => handlePlanChange(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none text-sm text-gray-900 dark:text-gray-100 transition-all appearance-none bg-white dark:bg-gray-900">
                  {PLAN_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Estado suscripción</label>
              <select value={subscriptionStatus} onChange={(e) => setSubscriptionStatus(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none text-sm text-gray-900 dark:text-gray-100 transition-all appearance-none bg-white dark:bg-gray-900">
                {SUBSCRIPTION_STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-4 space-y-3">
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-200 uppercase tracking-wider">
              Ventajas sin cobro (superadmin)
            </p>
            <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">
              Para clientes que no pagan por pasarela: amplía PDV y/o funciones PRO. El plan del desplegable sigue contando como base (
              {basePdvLimit} PDV en {planName}).
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={adminProAccess}
                onChange={(e) => setAdminProAccess(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-sm text-violet-900 dark:text-violet-100">
                <span className="font-semibold block">Funciones PRO</span>
                <span className="text-xs text-violet-700 dark:text-violet-300">
                  Desbloquea PRO aunque el plan sea Básico/Normal (centros extra, etc.).
                </span>
              </span>
            </label>
            <div>
              <label className="block text-xs font-semibold text-violet-800 dark:text-violet-200 mb-1.5">
                PDV extra (además del plan)
              </label>
              <input
                type="number"
                min={0}
                max={99}
                value={extraPointOfSaleSlots}
                onChange={(e) => setExtraPointOfSaleSlots(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-900"
              />
              <p className="mt-1.5 text-xs text-violet-700 dark:text-violet-300">
                Cupo total permitido: <strong>{totalPdvLimit}</strong> PDV ({basePdvLimit} del plan + {extraPdv} extra).
                Ej.: plan Pro (2) + 2 extra = 4 tiendas.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contraseña</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5">
                <Key className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                <code className="text-sm text-gray-700 dark:text-gray-300 flex-1 font-mono">
                  {generatedPassword
                    ? (showPassword ? generatedPassword : '••••••••••••••')
                    : (account.password ? (showPassword ? account.password : '••••••••••••') : 'No disponible')}
                </code>
                <button onClick={() => setShowPassword((v) => !v)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {(generatedPassword || account.password) && (
                <button onClick={handleCopyPassword}
                  className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400" title="Copiar contraseña">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
            {generatedPassword && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">Nueva contraseña generada. Cópiala antes de cerrar.</p>
              </div>
            )}
            <button onClick={() => void handleResetPassword()} disabled={resetting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50">
              <Key className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
              {resetting ? 'Generando...' : 'Resetear contraseña'}
            </button>
          </div>
          <button onClick={() => void handleSendLink()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-sm font-semibold text-blue-700 dark:text-blue-300 transition-colors">
            {linkCopied ? <><Check className="w-4 h-4" />¡Enlace copiado al portapapeles!</> : <><Link className="w-4 h-4" />Enviar enlace de acceso</>}
          </button>

          <button onClick={() => void handleImpersonate()} disabled={impersonating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-sm font-semibold text-violet-700 dark:text-violet-300 transition-colors disabled:opacity-50">
            <UserCheck className={`w-4 h-4 ${impersonating ? 'animate-spin' : ''}`} />
            {impersonating ? 'Iniciando sesión...' : `Acceder como ${account.firstName || account.email}`}
          </button>
          {impersonateError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-sm text-red-700">{impersonateError}</p>
            </div>
          )}

          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Regalar meses gratis</p>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Extiende la suscripción activa del usuario sin coste. Se aplica sobre la fecha de fin actual.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void handleGrantFreeMonths(1)}
                disabled={grantingMonths}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${grantingMonths ? 'animate-spin' : ''}`} />
                1 mes gratis
              </button>
              <button
                onClick={() => void handleGrantFreeMonths(2)}
                disabled={grantingMonths}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${grantingMonths ? 'animate-spin' : ''}`} />
                2 meses gratis
              </button>
            </div>
            {grantResult?.ok && (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-3 py-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-300">
                  ¡{grantResult.months} {grantResult.months === 1 ? 'mes' : 'meses'} gratis aplicado{grantResult.months === 2 ? 's' : ''} correctamente!
                </p>
              </div>
            )}
            {grantResult && !grantResult.ok && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-300">{grantResult.error}</p>
              </div>
            )}
            {Array.isArray((account.subscription as Record<string, unknown>)?.freeMonthsHistory) &&
              ((account.subscription as Record<string, unknown>).freeMonthsHistory as Array<{ months: number; grantedAt: string }>).length > 0 && (
              <div className="border-t border-amber-200 dark:border-amber-800 pt-2 mt-2">
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1">Historial</p>
                {((account.subscription as Record<string, unknown>).freeMonthsHistory as Array<{ months: number; grantedAt: string }>).map((entry, i) => (
                  <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400">
                    +{entry.months} {entry.months === 1 ? 'mes' : 'meses'} — {new Date(entry.grantedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                ))}
              </div>
            )}
          </div>

          {saveError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}
          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700">Cambios guardados correctamente</p>
            </div>
          )}
          <button onClick={() => void handleSave()} disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors disabled:opacity-50">
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Clientes SaaS ───────────────────────────────────────────────────────

type SortField =
  | 'fullName'
  | 'companyName'
  | 'email'
  | 'plan'
  | 'pdvMax'
  | 'status'
  | 'trial'
  | 'createdAt'
  | 'card'
  | 'pixel'
  | 'import'
  | 'ancover';
type SortDir = 'asc' | 'desc';

function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentField === field;
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${isActive ? 'text-gray-900 dark:text-gray-100' : ''}`}
      >
        {label}
        {isActive ? (
          currentDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function getAccountPdvMaxInfo(account: AuthUser) {
  const sub = account.subscription;
  const total = getEffectivePointOfSaleLimit(sub);
  const tier = resolvePlanTier(sub?.selectedPlanId || '', sub?.planName || '');
  const base = getBasePointOfSaleLimit(tier);
  const extra = Math.max(0, Math.floor(Number(sub?.extraPointOfSaleSlots) || 0));
  return {
    total,
    base,
    extra,
    adminPro: Boolean(sub?.adminProAccess),
  };
}

function getAccountSortValue(account: AuthUser, field: SortField): string | number {
  switch (field) {
    case 'fullName': return (account.fullName || '').toLowerCase();
    case 'companyName': return (account.companyName || '').toLowerCase();
    case 'email': return (account.email || '').toLowerCase();
    case 'plan': return (account.subscription?.planName || 'Basic').toLowerCase();
    case 'pdvMax': return getAccountPdvMaxInfo(account).total;
    case 'status': return account.subscription?.status || '';
    case 'createdAt': return account.createdAt || '';
    case 'card': return getCardStatus(account) ? 1 : 0;
    case 'pixel': {
      const p = getPixelStatus(account);
      return (p.clicked ? 2 : p.opened ? 1 : 0);
    }
    case 'trial': {
      const te = account.subscription?.trialEndsAt;
      if (!te) return 9999;
      const diff = new Date(te).getTime() - Date.now();
      return diff > 0 ? diff : -1;
    }
    case 'import': return getImportProgress(account).done;
    case 'ancover': return getAncoverAccess(account) ? 1 : 0;
    default: return '';
  }
}

function getTrialInfo(account: AuthUser): {
  label: string;
  daysLeft: number;
  color: string;
  icon: 'active' | 'expiring' | 'expired' | 'paid' | 'none';
} {
  const status = account.subscription?.status;
  if (status === 'subscription_active') {
    return { label: 'Pagando', daysLeft: -1, color: 'bg-green-50 text-green-700', icon: 'paid' };
  }
  if (status === 'suspended') {
    return { label: 'Suspendido', daysLeft: -1, color: 'bg-gray-100 dark:bg-gray-700 text-gray-500', icon: 'none' };
  }
  if (status === 'grace_period') {
    const ge = account.subscription?.gracePeriodEndsAt;
    if (ge) {
      const diff = new Date(ge).getTime() - Date.now();
      const hours = Math.max(0, Math.floor(diff / 3600000));
      return { label: `Gracia ${hours}h`, daysLeft: 0, color: 'bg-orange-50 text-orange-700', icon: 'expiring' };
    }
    return { label: 'Gracia', daysLeft: 0, color: 'bg-orange-50 text-orange-700', icon: 'expiring' };
  }
  if (status === 'payment_failed') {
    return { label: 'Impago', daysLeft: -1, color: 'bg-red-50 text-red-700', icon: 'expired' };
  }
  const te = account.subscription?.trialEndsAt;
  if (!te) {
    return { label: 'Sin trial', daysLeft: -1, color: 'bg-gray-100 dark:bg-gray-700 text-gray-400', icon: 'none' };
  }
  const diff = new Date(te).getTime() - Date.now();
  if (diff <= 0) {
    return { label: 'Trial expirado', daysLeft: 0, color: 'bg-red-50 text-red-700', icon: 'expired' };
  }
  const days = Math.ceil(diff / 86400000);
  if (days <= 3) {
    return { label: `${days}d restantes`, daysLeft: days, color: 'bg-amber-50 text-amber-700', icon: 'expiring' };
  }
  return { label: `${days}d restantes`, daysLeft: days, color: 'bg-blue-50 text-blue-700', icon: 'active' };
}

function ClientsTab({
  selectedAccount,
  onSelectAccount,
  accountSaveCallbackRef,
}: {
  selectedAccount: AuthUser | null;
  onSelectAccount: (a: AuthUser | null) => void;
  accountSaveCallbackRef: React.MutableRefObject<((u: AuthUser) => void) | null>;
}) {
  const { listUsers } = useAuth();
  const [accounts, setAccounts] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBlocked, setFilterBlocked] = useState<'' | 'active' | 'blocked'>('');
  const [filterCard, setFilterCard] = useState<'' | 'yes' | 'no'>('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    accountSaveCallbackRef.current = (updated: AuthUser) => {
      setAccounts((prev) => prev.map((a) => (a.user_id === updated.user_id ? updated : a)));
    };
    return () => { accountSaveCallbackRef.current = null; };
  }, [accountSaveCallbackRef]);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError('');
      setAccounts(await listUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los clientes SaaS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAccounts(); }, []);

  const ownerAccountsBase = useMemo(
    () => accounts.filter((a) => !a.invitedBy),
    [accounts],
  );
  const invitedAccounts = useMemo(() => accounts.filter((a) => Boolean(a.invitedBy)), [accounts]);

  const planOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of ownerAccountsBase) set.add(a.subscription?.planName || 'Basic');
    return Array.from(set).sort();
  }, [ownerAccountsBase]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of ownerAccountsBase) {
      if (a.subscription?.status) set.add(a.subscription.status);
    }
    return Array.from(set).sort();
  }, [ownerAccountsBase]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = ownerAccountsBase;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) =>
        (a.fullName || '').toLowerCase().includes(q) ||
        (a.email || '').toLowerCase().includes(q) ||
        (a.companyName || '').toLowerCase().includes(q) ||
        (a.user_id || '').toLowerCase().includes(q) ||
        (a.phone || '').includes(q),
      );
    }

    if (filterPlan) {
      result = result.filter((a) => (a.subscription?.planName || 'Basic') === filterPlan);
    }
    if (filterStatus) {
      result = result.filter((a) => a.subscription?.status === filterStatus);
    }
    if (filterBlocked === 'blocked') {
      result = result.filter((a) => a.status === 'inactive');
    } else if (filterBlocked === 'active') {
      result = result.filter((a) => a.status !== 'inactive');
    }
    if (filterCard === 'yes') {
      result = result.filter((a) => getCardStatus(a));
    } else if (filterCard === 'no') {
      result = result.filter((a) => !getCardStatus(a));
    }

    result = [...result].sort((a, b) => {
      const va = getAccountSortValue(a, sortField);
      const vb = getAccountSortValue(b, sortField);
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [ownerAccountsBase, searchQuery, filterPlan, filterStatus, filterBlocked, filterCard, sortField, sortDir]);

  const activeFilterCount = [filterPlan, filterStatus, filterBlocked, filterCard].filter(Boolean).length;

  const clearFilters = () => {
    setFilterPlan('');
    setFilterStatus('');
    setFilterBlocked('');
    setFilterCard('');
  };

  return (
    <>
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Clientes propietarios</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{ownerAccountsBase.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Invitados excluidos</p>
            <p className="text-3xl font-bold text-amber-600">{invitedAccounts.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Admins detectados</p>
            <p className="text-3xl font-bold text-blue-600">{ownerAccountsBase.filter((a) => a.role === 'Admin').length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Con tarjeta</p>
            <p className="text-3xl font-bold text-green-600">{ownerAccountsBase.filter((a) => getCardStatus(a)).length}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          {/* Header + Search + Filters */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Clientes SaaS</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {filteredAndSorted.length === ownerAccountsBase.length
                    ? `${ownerAccountsBase.length} cuentas propietarias`
                    : `${filteredAndSorted.length} de ${ownerAccountsBase.length} cuentas`
                  }
                </p>
              </div>
              <button onClick={() => void loadAccounts()}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>

            {/* Search bar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, email, empresa o ID..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-900 transition-all placeholder:text-gray-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  activeFilterCount > 0
                    ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{activeFilterCount}</span>
                )}
                {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Filter row */}
            {showFilters && (
              <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <div className="relative">
                  <select
                    value={filterPlan}
                    onChange={(e) => setFilterPlan(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 focus:border-blue-500 outline-none cursor-pointer"
                  >
                    <option value="">Todos los planes</option>
                    {planOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 focus:border-blue-500 outline-none cursor-pointer"
                  >
                    <option value="">Todos los estados</option>
                    {statusOptions.map((s) => {
                      const badge = getStatusBadge(s);
                      return <option key={s} value={s}>{badge.label}</option>;
                    })}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    value={filterBlocked}
                    onChange={(e) => setFilterBlocked(e.target.value as '' | 'active' | 'blocked')}
                    className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 focus:border-blue-500 outline-none cursor-pointer"
                  >
                    <option value="">Activos y bloqueados</option>
                    <option value="active">Solo activos</option>
                    <option value="blocked">Solo bloqueados</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                <div className="relative">
                  <select
                    value={filterCard}
                    onChange={(e) => setFilterCard(e.target.value as '' | 'yes' | 'no')}
                    className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 focus:border-blue-500 outline-none cursor-pointer"
                  >
                    <option value="">Tarjeta: todos</option>
                    <option value="yes">Con tarjeta</option>
                    <option value="no">Sin tarjeta</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}
          </div>

          {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
            <table className="w-full min-w-[1600px]">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Avatar</th>
                  <SortableHeader label="Cliente" field="fullName" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Empresa" field="companyName" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Email" field="email" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Contraseña</th>
                  <SortableHeader label="Plan" field="plan" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="PDV máx." field="pdvMax" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Estado" field="status" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Trial" field="trial" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Alta" field="createdAt" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Pixel" field="pixel" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Tarjeta" field="card" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Importar" field="import" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Ancover" field="ancover" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAndSorted.length === 0 && !loading && (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center">
                      <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No se encontraron clientes</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {searchQuery || activeFilterCount > 0
                          ? 'Prueba a cambiar los criterios de búsqueda o filtros'
                          : 'No hay cuentas propietarias registradas'}
                      </p>
                    </td>
                  </tr>
                )}
                {filteredAndSorted.map((account) => {
                  const statusBadge = getStatusBadge(account.subscription?.status);
                  const isInactive = account.status === 'inactive';
                  return (
                    <tr key={account.user_id} onClick={() => onSelectAccount(account)}
                      className="hover:bg-blue-50 dark:hover:bg-blue-950/20 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="relative w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center">
                          {account.avatar ? <img src={account.avatar} alt={account.fullName} className="w-full h-full object-cover" /> : <span className="font-semibold text-gray-600 dark:text-gray-400">{initials(account)}</span>}
                          {isInactive && <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center"><Lock className="w-4 h-4 text-red-600" /></div>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{account.fullName}</p>
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"><Shield className="w-3 h-3" />{account.role}</span>
                          {isInactive && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700"><Lock className="w-3 h-3" />Bloqueado</span>}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-1">{account.user_id}</p>
                      </td>
                      <td className="px-4 py-3"><div className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />{account.companyName || 'Sin empresa'}</div></td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{account.email}</td>
                      <td className="px-4 py-3"><code className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300">{account.password ? '••••••••' : 'No visible'}</code></td>
                      <td className="px-4 py-3"><div className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><Users className="w-4 h-4 text-gray-400 dark:text-gray-500" />{account.subscription?.planName || 'Basic'}</div></td>
                      <td className="px-4 py-3">
                        {(() => {
                          const pdv = getAccountPdvMaxInfo(account);
                          return (
                            <div className="flex flex-col gap-1 min-w-[4.5rem]">
                              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-gray-100">
                                <Store className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                                {pdv.total}
                              </span>
                              {pdv.extra > 0 ? (
                                <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                                  {pdv.base}+{pdv.extra} extra
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">plan</span>
                              )}
                              {pdv.adminPro && (
                                <span className="inline-flex w-fit rounded-full bg-violet-100 dark:bg-violet-900/40 px-1.5 py-0.5 text-[9px] font-bold text-violet-800 dark:text-violet-200">
                                  PRO admin
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadge.color}`}>{statusBadge.label}</span></td>
                      <td className="px-4 py-3">
                        {(() => {
                          const trial = getTrialInfo(account);
                          const TrialIcon = trial.icon === 'active' ? Timer
                            : trial.icon === 'expiring' ? Hourglass
                            : trial.icon === 'paid' ? CheckCircle
                            : trial.icon === 'expired' ? XCircle
                            : Clock;
                          return (
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${trial.color}`}>
                                <TrialIcon className="w-3.5 h-3.5" />
                                {trial.label}
                              </span>
                              {trial.daysLeft >= 0 && trial.daysLeft <= 14 && trial.icon !== 'paid' && (
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full transition-all ${trial.daysLeft <= 3 ? 'bg-red-500' : trial.daysLeft <= 7 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.max(4, (trial.daysLeft / 14) * 100)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{account.createdAt ? new Date(account.createdAt).toLocaleDateString('es-ES') : '—'}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const pixel = getPixelStatus(account);
                          return (
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${pixel.opened ? 'bg-green-50 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>
                                <Mail className="w-3 h-3" />
                                Abierto
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${pixel.clicked ? 'bg-green-50 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>
                                <MousePointerClick className="w-3 h-3" />
                                Click
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const hasCard = getCardStatus(account);
                          return (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${hasCard ? 'bg-green-50 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>
                              <CreditCard className="w-3.5 h-3.5" />
                              {hasCard ? 'Añadida' : 'Pendiente'}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const imp = getImportProgress(account);
                          const allDone = imp.done === imp.total;
                          return (
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${allDone ? 'bg-green-50 text-green-700' : imp.done > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>
                                <Upload className="w-3.5 h-3.5" />
                                {imp.done}/{imp.total}
                              </span>
                              <div className="flex flex-wrap gap-0.5">
                                {IMPORT_SECTIONS.map((s) => (
                                  <span key={s} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${imp.sections[s] ? 'bg-green-50 text-green-600' : 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600'}`}>
                                    {IMPORT_LABELS[s]}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const hasAncover = getAncoverAccess(account);
                          return (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${hasAncover ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                              {hasAncover ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldX className="w-3.5 h-3.5" />}
                              {hasAncover ? 'Permitido' : 'Denegado'}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Tab: Backup CouchDB ──────────────────────────────────────────────────────

interface BackupSummary {
  dbCount: number;
  totalDocs: number;
  totalDiskSize: number;
}

interface BackupHistoryEntry {
  id: string;
  date: string;
  action: 'export' | 'import';
  status: 'ok' | 'error';
  message: string;
}

function BackupTab() {
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [history, setHistory] = useState<BackupHistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('vertial_backup_history_v2') || '[]'); } catch { return []; }
  });
  const [importProgress, setImportProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addHistory = useCallback((entry: BackupHistoryEntry) => {
    const next = [entry, ...history].slice(0, 30);
    setHistory(next);
    localStorage.setItem('vertial_backup_history_v2', JSON.stringify(next));
  }, [history]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/backup/summary');
      const data = await res.json() as { ok: boolean; dbCount?: number; totalDocs?: number; totalDiskSize?: number; error?: string };
      if (!res.ok || !data.ok) { setError(data.error || 'Error cargando resumen'); return; }
      setSummary({ dbCount: data.dbCount || 0, totalDocs: data.totalDocs || 0, totalDiskSize: data.totalDiskSize || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const handleExportAll = async () => {
    setExporting(true);
    setFeedback(null);
    setError('');
    try {
      const res = await apiFetch('/api/backup/export-all');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Error descargando backup' })) as { error?: string };
        setFeedback({ ok: false, message: errData.error || 'Error descargando backup' });
        addHistory({ id: uuidv4(), date: new Date().toISOString(), action: 'export', status: 'error', message: errData.error || 'Error' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `couchdb-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
      setFeedback({ ok: true, message: `Backup exportado correctamente (${sizeMb} MB)` });
      addHistory({ id: uuidv4(), date: new Date().toISOString(), action: 'export', status: 'ok', message: `Exportación completa — ${sizeMb} MB` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      setFeedback({ ok: false, message: msg });
      addHistory({ id: uuidv4(), date: new Date().toISOString(), action: 'export', status: 'error', message: msg });
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setFeedback({ ok: false, message: 'El archivo debe ser un .zip generado por la exportación' });
      return;
    }
    setImporting(true);
    setFeedback(null);
    setError('');
    setImportProgress('Subiendo archivo...');
    try {
      const buffer = await file.arrayBuffer();
      setImportProgress('Restaurando bases de datos...');
      const res = await fetch(`${API_BASE}/api/backup/import-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        credentials: 'include',
        body: buffer,
      });
      const data = await res.json().catch(() => ({})) as {
        ok: boolean;
        results?: { db: string; ok: boolean; docs: number; errors?: number }[];
        totalRestored?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        const msg = data.error || 'Error durante la importación';
        setFeedback({ ok: false, message: msg });
        addHistory({ id: uuidv4(), date: new Date().toISOString(), action: 'import', status: 'error', message: msg });
      } else {
        const dbCount = data.results?.length || 0;
        const totalDocs = data.totalRestored || 0;
        const msg = `${dbCount} bases restauradas con ${totalDocs.toLocaleString('es-ES')} documentos`;
        setFeedback({ ok: true, message: msg });
        addHistory({ id: uuidv4(), date: new Date().toISOString(), action: 'import', status: 'ok', message: msg });
        void loadSummary();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      setFeedback({ ok: false, message: msg });
      addHistory({ id: uuidv4(), date: new Date().toISOString(), action: 'import', status: 'error', message: msg });
    } finally {
      setImporting(false);
      setImportProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Bases de datos</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{summary?.dbCount ?? '—'}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Total documentos</p>
          <p className="text-3xl font-bold text-blue-600">{summary ? summary.totalDocs.toLocaleString('es-ES') : '—'}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Tamaño en disco</p>
          <p className="text-3xl font-bold text-gray-700 dark:text-gray-300">{summary ? formatBytes(summary.totalDiskSize) : '—'}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Exportar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Download className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Exportar backup completo</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Descarga un archivo ZIP con todas las bases de datos del sistema. Incluye todos los documentos, configuraciones y datos de clientes.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-400">
                <Database className="w-3 h-3" /> {summary?.dbCount ?? '?'} bases de datos
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-400">
                <FileText className="w-3 h-3" /> {summary ? summary.totalDocs.toLocaleString('es-ES') : '?'} documentos
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleExportAll()}
          disabled={exporting}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
        >
          {exporting ? (
            <>
              <LoaderCircle className="w-4 h-4 animate-spin" />
              Generando backup ZIP...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Descargar backup completo (.zip)
            </>
          )}
        </button>
      </div>

      {/* Importar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <Upload className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Importar backup</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Restaura un backup completo desde un archivo ZIP generado por la exportación. Los documentos existentes con el mismo ID serán omitidos.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Esta operación añade datos al sistema. Úsala solo para restaurar backups previamente exportados.</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 text-sm font-bold text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
        >
          {importing ? (
            <>
              <LoaderCircle className="w-4 h-4 animate-spin" />
              {importProgress || 'Importando...'}
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Seleccionar archivo ZIP para importar
            </>
          )}
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 ${feedback.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {feedback.ok ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
          <p className={`text-sm font-medium ${feedback.ok ? 'text-green-700' : 'text-red-700'}`}>{feedback.message}</p>
        </div>
      )}

      {/* Replicación CouchDB */}
      <ReplicationSection />

      {/* Historial */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Clock className="w-4 h-4" />Historial de operaciones</h3>
            <button
              type="button"
              onClick={() => { setHistory([]); localStorage.removeItem('vertial_backup_history_v2'); }}
              className="text-xs text-gray-400 hover:text-red-600 transition-colors"
            >
              Limpiar
            </button>
          </div>
          <div className="space-y-2">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-800">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  entry.action === 'export'
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-amber-50 border border-amber-200'
                }`}>
                  {entry.action === 'export'
                    ? <Download className="w-3.5 h-3.5 text-blue-600" />
                    : <Upload className="w-3.5 h-3.5 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.message}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(entry.date).toLocaleString('es-ES')}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${entry.status === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {entry.status === 'ok' ? 'OK' : 'Error'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReplicationSection() {
  const [targetUrl, setTargetUrl] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [targetPassword, setTargetPassword] = useState('');
  const [showTargetPass, setShowTargetPass] = useState(false);
  const [replicating, setReplicating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleReplicate = async () => {
    if (!targetUrl.trim()) { setResult({ ok: false, message: 'Introduce la URL del servidor destino' }); return; }
    setReplicating(true);
    setResult(null);
    try {
      const res = await apiFetch('/api/backup/replicate', {
        method: 'POST',
        body: JSON.stringify({ targetUrl: targetUrl.trim(), targetUser: targetUser.trim(), targetPassword }),
      });
      const data = await res.json() as { ok: boolean; results?: { db: string; ok: boolean }[]; error?: string };
      const dbCount = data.results?.length || 0;
      const failed = data.results?.filter((r) => !r.ok).length || 0;
      setResult({
        ok: data.ok,
        message: data.ok
          ? `${dbCount} base${dbCount !== 1 ? 's' : ''} replicada${dbCount !== 1 ? 's' : ''} correctamente`
          : `${failed} de ${dbCount} bases fallaron`,
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Error de conexión' });
    } finally {
      setReplicating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
            <GitFork className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Replicación a servidor secundario</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">Replicar todas las bases de datos a otro CouchDB</p>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-6 pb-6 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">URL del servidor destino</label>
            <input
              type="url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="http://backup-server:5984"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-900 transition-all font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Usuario</label>
              <input type="text" value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="admin"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-900 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showTargetPass ? 'text' : 'password'} value={targetPassword} onChange={(e) => setTargetPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-900 transition-all"
                />
                <button onClick={() => setShowTargetPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600">
                  {showTargetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          {result && (
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 ${result.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {result.ok ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
              <p className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-700'}`}>{result.message}</p>
            </div>
          )}
          <button
            onClick={() => void handleReplicate()} disabled={replicating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            <GitFork className={`w-4 h-4 ${replicating ? 'animate-spin' : ''}`} />
            {replicating ? 'Replicando...' : 'Iniciar replicación completa'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Actor Avatar Card (avatar + popup en auditoría) ───────────────────────────

function ActorAvatarCard({
  actorUserId,
  actorName,
  user,
  onViewDetails,
}: {
  actorUserId: string;
  actorName: string;
  user: AuthUser | null;
  onViewDetails: (u: AuthUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const displayName = user?.fullName || actorName || actorUserId || 'Sistema';
  const isSystem = !actorUserId || actorUserId === 'system';

  if (isSystem) {
    return (
      <span className="font-medium text-gray-600 dark:text-gray-400">Sistema</span>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-2 rounded-full hover:ring-2 hover:ring-gray-200 transition-all focus:outline-none focus:ring-2 focus:ring-blue-300"
        title={displayName}
      >
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
          {user?.avatar ? (
            <img src={user.avatar} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400">
              {`${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || displayName.charAt(0)}
            </span>
          )}
        </div>
        <span className="font-medium text-gray-600 dark:text-gray-400 truncate max-w-[120px]">{displayName}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 top-9 z-20 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[200px]">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {user?.avatar ? (
                  <img src={user.avatar} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-gray-600 dark:text-gray-400">
                    {`${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || displayName.charAt(0)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email || actorUserId}</p>
                {user?.role && (
                  <span className="inline-flex text-[10px] font-semibold text-blue-700 mt-0.5">{user.role}</span>
                )}
              </div>
            </div>
            {user && (
              <button
                type="button"
                onClick={() => { setOpen(false); onViewDetails(user); }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Ver detalles
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab: Auditoría (Changelog) ───────────────────────────────────────────────

interface ChangelogEntry {
  _id: string;
  type: 'changelog';
  entity: string;
  entityId: string;
  entityLabel: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'export';
  actorUserId: string;
  actorName: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function AuditTab({ usersMap, onViewUser }: { usersMap: Map<string, AuthUser>; onViewUser: (u: AuthUser) => void }) {
  const [allEntries, setAllEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadChangelog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (filterEntity) params.set('entity', filterEntity);
      if (filterActor) params.set('actorUserId', filterActor);
      const res = await apiFetch(`/api/changelog?${params.toString()}`);
      const data = await res.json() as { ok: boolean; entries?: ChangelogEntry[]; error?: string };
      if (!data.ok) { setError(data.error || 'Error cargando auditoría'); return; }
      setAllEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [filterEntity, filterActor]);

  useEffect(() => { void loadChangelog(); }, [loadChangelog]);

  const actorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of allEntries) {
      if (e.actorUserId && !seen.has(e.actorUserId)) seen.set(e.actorUserId, e.actorName || e.actorUserId);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [allEntries]);

  const entries = useMemo(() => {
    let filtered = allEntries;
    if (filterAction) filtered = filtered.filter((e) => e.action === filterAction);
    if (filterDateFrom) filtered = filtered.filter((e) => e.createdAt >= filterDateFrom);
    if (filterDateTo) {
      const to = filterDateTo + 'T23:59:59';
      filtered = filtered.filter((e) => e.createdAt <= to);
    }
    return filtered;
  }, [allEntries, filterAction, filterDateFrom, filterDateTo]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: allEntries.length,
      today: allEntries.filter((e) => e.createdAt.startsWith(today)).length,
      logins: allEntries.filter((e) => e.action === 'login').length,
      deletes: allEntries.filter((e) => e.action === 'delete').length,
      exports: allEntries.filter((e) => e.action === 'export').length,
    };
  }, [allEntries]);

  const handleExportCsv = () => {
    const rows = [
      ['Fecha', 'Hora', 'Acción', 'Entidad', 'Elemento', 'Actor', 'IP'],
      ...entries.map((e) => {
        const d = new Date(e.createdAt);
        return [
          d.toLocaleDateString('es-ES'),
          d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          e.action,
          ENTITY_LABELS[e.entity] || e.entity,
          e.entityLabel || e.entityId,
          e.actorName || e.actorUserId || 'Sistema',
          String((e.metadata as Record<string, unknown>)?.ip || ''),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total eventos', value: stats.total, color: 'text-gray-900 dark:text-gray-100', icon: <Activity className="w-4 h-4 text-gray-400 dark:text-gray-500" /> },
          { label: 'Hoy', value: stats.today, color: 'text-blue-700', icon: <CalendarDays className="w-4 h-4 text-blue-400" /> },
          { label: 'Logins', value: stats.logins, color: 'text-violet-700', icon: <LogIn className="w-4 h-4 text-violet-400" /> },
          { label: 'Eliminaciones', value: stats.deletes, color: 'text-red-700', icon: <Trash2 className="w-4 h-4 text-red-400" /> },
          { label: 'Exportaciones', value: stats.exports, color: 'text-amber-700', icon: <PackageOpen className="w-4 h-4 text-amber-400" /> },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
            <div className="shrink-0">{s.icon}</div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            <Filter className="w-4 h-4" /> Filtros
          </div>

          <div className="relative">
            <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none cursor-pointer">
              <option value="">Todas las entidades</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          </div>

          <div className="relative">
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none cursor-pointer">
              <option value="">Todas las acciones</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          </div>

          <div className="relative">
            <select value={filterActor} onChange={(e) => setFilterActor(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none cursor-pointer">
              <option value="">Todos los actores</option>
              {actorOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          </div>

          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <input
              type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none"
            />
            <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
            <input
              type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
              title="Exportar CSV"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={() => void loadChangelog()}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Tabla de changelog */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><TrendingUp className="w-4 h-4" />Registro de auditoría</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{entries.length} entrada{entries.length !== 1 ? 's' : ''} encontrada{entries.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {entries.length === 0 && !loading ? (
          <div className="px-6 py-16 text-center">
            <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin registros de auditoría para los filtros aplicados</p>
            <p className="text-xs text-gray-300 mt-1">Los logins, cambios, exportaciones y borrados aparecerán aquí</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry._id;
              const actionColor = ACTION_COLORS[entry.action] || 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700';
              const actionIcon = ACTION_ICONS[entry.action] || <Activity className="w-3 h-3" />;
              const hasDiff = Object.keys(entry.changes || {}).length > 0;
              const isLogin = entry.action === 'login';
              const meta = (entry.metadata || {}) as Record<string, unknown>;
              return (
                <div key={entry._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div
                    className={`flex items-center gap-4 px-6 py-3.5 ${hasDiff || isLogin ? 'cursor-pointer' : ''}`}
                    onClick={() => (hasDiff || isLogin) && setExpandedId(isExpanded ? null : entry._id)}
                  >
                    <div className="shrink-0 w-28">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${actionColor}`}>
                        {actionIcon}
                        {ACTION_LABELS[entry.action] || entry.action}
                      </span>
                    </div>
                    <div className="shrink-0 w-24">
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {ENTITY_LABELS[entry.entity] || entry.entity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{entry.entityLabel || entry.entityId}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate flex items-center gap-1.5 flex-wrap">
                        <span>por</span>
                        <ActorAvatarCard
                          actorUserId={entry.actorUserId}
                          actorName={entry.actorName}
                          user={usersMap.get(entry.actorUserId) ?? null}
                          onViewDetails={onViewUser}
                        />
                        {isLogin && meta.ip ? <span className="text-gray-300">· {String(meta.ip)}</span> : null}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(entry.createdAt).toLocaleDateString('es-ES')}</p>
                      <p className="text-xs text-gray-300">{new Date(entry.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {(hasDiff || isLogin) && (
                      <ChevronDown className={`shrink-0 w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                  {isExpanded && isLogin && (
                    <div className="px-6 pb-4">
                      <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        {[
                          { label: 'Email', value: String(meta.email || '—') },
                          { label: 'Rol', value: String(meta.role || '—') },
                          { label: 'IP', value: String(meta.ip || '—') },
                          { label: 'User-Agent', value: String(meta.userAgent || '—') },
                        ].map((item) => (
                          <div key={item.label}>
                            <span className="block text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-0.5">{item.label}</span>
                            <span className="font-mono text-violet-800 break-all">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {isExpanded && hasDiff && !isLogin && (
                    <div className="px-6 pb-4">
                      <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cambios detectados</p>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {Object.entries(entry.changes).map(([field, diff]) => (
                            <div key={field} className="flex items-start gap-4 px-4 py-2.5 text-xs">
                              <span className="shrink-0 font-mono font-semibold text-gray-600 dark:text-gray-400 w-32 truncate">{field}</span>
                              {'before' in diff && (
                                <div className="flex-1 flex gap-3 min-w-0">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-gray-400 dark:text-gray-500 text-[10px] uppercase font-semibold block mb-0.5">Antes</span>
                                    <code className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded break-all block">{JSON.stringify(diff.before)}</code>
                                  </div>
                                  {'after' in diff && (
                                    <div className="flex-1 min-w-0">
                                      <span className="text-gray-400 dark:text-gray-500 text-[10px] uppercase font-semibold block mb-0.5">Después</span>
                                      <code className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded break-all block">{JSON.stringify(diff.after)}</code>
                                    </div>
                                  )}
                                </div>
                              )}
                              {'after' in diff && !('before' in diff) && (
                                <div className="flex-1 min-w-0">
                                  <span className="text-gray-400 dark:text-gray-500 text-[10px] uppercase font-semibold block mb-0.5">Valor</span>
                                  <code className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded break-all block">{JSON.stringify(diff.after)}</code>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Planes y precios ────────────────────────────────────────────────────

function PlanFeatureRow({
  feature,
  onChange,
  onRemove,
}: {
  feature: PlanFeature;
  onChange: (f: PlanFeature) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange({ ...feature, included: !feature.included })}
        className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
          feature.included
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200'
        }`}
        title={feature.included ? 'Incluido' : 'No incluido'}
      >
        {feature.included ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      </button>
      <input
        type="text"
        value={feature.text}
        onChange={(e) => onChange({ ...feature, text: e.target.value })}
        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none transition-all"
        placeholder="Característica del plan..."
      />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function PlanEditor({
  plan,
  onChange,
  onRemove,
}: {
  plan: PlanDefinition;
  onChange: (p: PlanDefinition) => void;
  onRemove: () => void;
}) {
  const addFeature = () => {
    onChange({ ...plan, features: [...plan.features, { text: '', included: true }] });
  };

  const updateFeature = (idx: number, feature: PlanFeature) => {
    const next = [...plan.features];
    next[idx] = feature;
    onChange({ ...plan, features: next });
  };

  const removeFeature = (idx: number) => {
    onChange({ ...plan, features: plan.features.filter((_, i) => i !== idx) });
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border-2 transition-colors ${
      plan.highlight ? 'border-amber-300 dark:border-amber-600' : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
          <div className="flex items-center gap-2">
            {plan.highlight && <Star className="w-4 h-4 text-amber-500" />}
            <span className="font-bold text-gray-900 dark:text-gray-100">{plan.name || 'Sin nombre'}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">#{plan.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{plan.monthlyPrice} €<span className="text-xs font-normal text-gray-400">/mes</span></span>
          <button
            type="button"
            onClick={onRemove}
            className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar plan"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">ID del plan</label>
            <input
              type="text"
              value={plan.id}
              onChange={(e) => onChange({ ...plan, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 focus:border-blue-500 outline-none transition-all font-mono"
              placeholder="basic"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Nombre visible</label>
            <input
              type="text"
              value={plan.name}
              onChange={(e) => onChange({ ...plan, name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none transition-all"
              placeholder="Básico"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Precio mensual (€)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="number"
                min="0"
                step="1"
                value={plan.monthlyPrice}
                onChange={(e) => onChange({ ...plan, monthlyPrice: Number(e.target.value) || 0 })}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-gray-300 transition-all">
            <input
              type="checkbox"
              checked={plan.highlight}
              onChange={(e) => onChange({ ...plan, highlight: e.target.checked })}
              className="rounded"
            />
            <div>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500" /> Destacado
              </span>
              <p className="text-xs text-gray-400 dark:text-gray-500">Resalta este plan como recomendado</p>
            </div>
          </label>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Badge (opcional)</label>
            <input
              type="text"
              value={plan.badge || ''}
              onChange={(e) => onChange({ ...plan, badge: e.target.value || undefined })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none transition-all"
              placeholder="Más popular"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Características</label>
            <button
              type="button"
              onClick={addFeature}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir
            </button>
          </div>
          <div className="space-y-2">
            {plan.features.map((feat, idx) => (
              <PlanFeatureRow
                key={idx}
                feature={feat}
                onChange={(f) => updateFeature(idx, f)}
                onRemove={() => removeFeature(idx)}
              />
            ))}
            {plan.features.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">Sin características. Haz click en "Añadir" para crear una.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlansTab({ userId }: { userId: string }) {
  const [config, setConfig] = useState<PlanPricingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [plans, setPlans] = useState<PlanDefinition[]>(DEFAULT_PLANS);
  const [annualDiscount, setAnnualDiscount] = useState(DEFAULT_ANNUAL_DISCOUNT);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cfg = await getPlanPricingConfig();
      setConfig(cfg);
      setPlans(cfg.plans);
      setAnnualDiscount(cfg.annualDiscount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const saved = await savePlanPricingConfig(
        {
          ...(config || { _id: 'plan-pricing-config', type: 'plan_pricing_config', updatedAt: '', updatedBy: '' }),
          plans: plans.map((p, i) => ({ ...p, order: i })),
          annualDiscount,
        },
        userId,
      );
      setConfig(saved);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const addPlan = () => {
    const newId = `plan-${Date.now()}`;
    setPlans([
      ...plans,
      {
        id: newId,
        name: 'Nuevo plan',
        monthlyPrice: 0,
        features: [],
        highlight: false,
        order: plans.length,
      },
    ]);
  };

  const updatePlan = (idx: number, plan: PlanDefinition) => {
    const next = [...plans];
    next[idx] = plan;
    setPlans(next);
  };

  const removePlan = (idx: number) => {
    setPlans(plans.filter((_, i) => i !== idx));
  };

  const resetToDefaults = () => {
    setPlans(DEFAULT_PLANS);
    setAnnualDiscount(DEFAULT_ANNUAL_DISCOUNT);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderCircle className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Planes activos</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{plans.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Precio mínimo</p>
          <p className="text-3xl font-bold text-green-600">
            {plans.length > 0 ? `${Math.min(...plans.map((p) => p.monthlyPrice))} €` : '—'}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Precio máximo</p>
          <p className="text-3xl font-bold text-blue-600">
            {plans.length > 0 ? `${Math.max(...plans.map((p) => p.monthlyPrice))} €` : '—'}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Descuento anual</p>
          <p className="text-3xl font-bold text-amber-600">{Math.round(annualDiscount * 100)}%</p>
        </div>
      </div>

      {/* Descuento anual */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Percent className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Descuento anual</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">Se aplica al precio mensual cuando el cliente elige facturación anual</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="50"
            value={Math.round(annualDiscount * 100)}
            onChange={(e) => setAnnualDiscount(Number(e.target.value) / 100)}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-amber-500"
          />
          <div className="shrink-0 w-24">
            <div className="relative">
              <input
                type="number"
                min="0"
                max="50"
                value={Math.round(annualDiscount * 100)}
                onChange={(e) => setAnnualDiscount(Math.min(0.5, Math.max(0, Number(e.target.value) / 100)))}
                className="w-full px-3 py-2 pr-8 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:border-blue-500 outline-none transition-all text-center font-bold"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm font-bold">%</span>
            </div>
          </div>
        </div>
        {plans.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2 text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300">{p.name}</span>
                <span className="text-gray-400">→</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{Math.round(p.monthlyPrice * (1 - annualDiscount))} €/mes</span>
                <span className="text-gray-400 dark:text-gray-500">({Math.round(p.monthlyPrice * 12 * (1 - annualDiscount))} €/año)</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista de planes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Planes de suscripción</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">Configura los planes disponibles para los clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetToDefaults}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 hover:border-gray-300 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Restaurar valores
            </button>
            <button
              type="button"
              onClick={addPlan}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Añadir plan
            </button>
          </div>
        </div>

        {plans.map((plan, idx) => (
          <PlanEditor
            key={`${plan.id}-${idx}`}
            plan={plan}
            onChange={(p) => updatePlan(idx, p)}
            onRemove={() => removePlan(idx)}
          />
        ))}

        {plans.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <DollarSign className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No hay planes configurados</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Añade un plan o restaura los valores por defecto</p>
          </div>
        )}
      </div>

      {/* Preview */}
      {plans.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Eye className="w-4 h-4" /> Vista previa de la tabla de precios
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl border-2 p-5 transition-colors ${
                  plan.highlight
                    ? 'border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {plan.badge && (
                  <span className="inline-flex items-center gap-1 mb-3 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">
                    <Sparkles className="w-3 h-3" />
                    {plan.badge}
                  </span>
                )}
                <h4 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{plan.name}</h4>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-black text-gray-900 dark:text-gray-100">{plan.monthlyPrice} €</span>
                  <span className="text-sm text-gray-400">/mes</span>
                </div>
                <div className="space-y-2">
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {feat.included ? (
                        <Check className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                      )}
                      <span className={feat.included ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 line-through'}>
                        {feat.text}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
                  Anual: <span className="font-semibold text-gray-600 dark:text-gray-300">{Math.round(plan.monthlyPrice * (1 - annualDiscount))} €/mes</span>
                  {' '}({Math.round(plan.monthlyPrice * 12 * (1 - annualDiscount))} €/año)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">Configuración de planes guardada correctamente</p>
        </div>
      )}

      {config?.updatedAt && config.updatedBy && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          Última actualización: {new Date(config.updatedAt).toLocaleString('es-ES')}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
      >
        {saving ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Guardando configuración...' : 'Guardar configuración de planes'}
      </button>
    </div>
  );
}

// ─── Solicitudes de afiliados ─────────────────────────────────────────────────

const REQUEST_STATUS_CFG: Record<AffiliateStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:  { label: 'Pendiente', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  accepted: { label: 'Aceptado',  bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rechazado', bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
};

function AffiliateRequestsTab({ userId }: { userId: string }) {
  const [requests, setRequests] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AffiliateStatus | 'all'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const all = await listAffiliates(userId);
      setRequests(all);
    } catch (err) {
      console.error('Error loading affiliate requests:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.company ?? '').toLowerCase().includes(q) ||
          (r.affiliateCode ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [requests, filter, search]);

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    accepted: requests.filter((r) => r.status === 'accepted').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  }), [requests]);

  const handleStatus = async (id: string, status: AffiliateStatus) => {
    setProcessingId(id);
    try {
      await updateAffiliateStatus(userId, id, status);
      await load();
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const getAffId = (aff: Affiliate) => aff._id || aff.id || '';

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total solicitudes', value: counts.all, icon: <HandshakeIcon className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50' },
          { label: 'Pendientes', value: counts.pending, icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50' },
          { label: 'Aceptadas', value: counts.accepted, icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Rechazadas', value: counts.rejected, icon: <XCircle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <div className={`inline-flex p-2 rounded-xl ${kpi.bg} mb-3`}>{kpi.icon}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpi.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, empresa..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
          {([
            { id: 'pending' as const, label: 'Pendientes', count: counts.pending },
            { id: 'all' as const, label: 'Todas', count: counts.all },
            { id: 'accepted' as const, label: 'Aceptadas', count: counts.accepted },
            { id: 'rejected' as const, label: 'Rechazadas', count: counts.rejected },
          ]).map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filter === f.id
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f.label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                filter === f.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
              }`}>{f.count}</span>
            </button>
          ))}
        </div>
        <button onClick={() => load()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Recargar">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* List */}
      {loading && requests.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <LoaderCircle className="w-8 h-8 text-gray-300 mx-auto mb-3 animate-spin" />
          <p className="text-gray-500 font-medium">Cargando solicitudes...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <HandshakeIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {requests.length === 0 ? 'No hay solicitudes de afiliados' : 'Sin resultados para este filtro'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const id = getAffId(req);
            const cfg = REQUEST_STATUS_CFG[req.status];
            const isProcessing = processingId === id;
            const isPublicRequest = req.user_id === 'public_request';

            return (
              <div key={id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {req.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{req.name}</p>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                        </span>
                        {isPublicRequest && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                            Solicitud pública
                          </span>
                        )}
                        {req.affiliateCode && (
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono text-gray-600 dark:text-gray-400">
                            {req.affiliateCode}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{req.email}</span>
                        {req.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{req.phone}</span>}
                        {req.whatsapp && req.whatsapp !== req.phone && (
                          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-green-500" />{req.whatsapp}</span>
                        )}
                        {req.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{req.company}</span>}
                        {req.website && (
                          <a href={req.website.startsWith('http') ? req.website : `https://${req.website}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-500 hover:text-blue-700 transition-colors">
                            <Globe className="w-3 h-3" />{req.website}
                          </a>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(req.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Verticals */}
                      {req.verticals && req.verticals.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {req.verticals.map((v) => (
                            <span key={v} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[11px] font-medium">
                              {v}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Notes/message from the request */}
                      {req.notes && (
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 flex gap-2">
                          <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                          <span>{req.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatus(id, 'accepted')}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Aceptar
                          </button>
                          <button
                            onClick={() => handleStatus(id, 'rejected')}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Denegar
                          </button>
                        </>
                      )}
                      {req.status === 'rejected' && (
                        <button
                          onClick={() => handleStatus(id, 'accepted')}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Reactivar
                        </button>
                      )}
                      {req.status === 'accepted' && (
                        <button
                          onClick={() => handleStatus(id, 'rejected')}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Revocar
                        </button>
                      )}
                      {isProcessing && <LoaderCircle className="w-4 h-4 text-gray-400 animate-spin" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function AdminPanel() {
  const { user, listUsers } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('clients');
  const [selectedAccount, setSelectedAccount] = useState<AuthUser | null>(null);
  const [auditUsers, setAuditUsers] = useState<AuthUser[]>([]);
  const accountSaveCallbackRef = useRef<((u: AuthUser) => void) | null>(null);

  useModalClose(!!selectedAccount, () => setSelectedAccount(null));

  const usersMap = useMemo(() => new Map(auditUsers.map((u) => [u.user_id, u])), [auditUsers]);

  useEffect(() => {
    if (activeTab === 'audit') {
      listUsers().then(setAuditUsers).catch(() => setAuditUsers([]));
    }
  }, [activeTab, listUsers]);

  const handleAccountSaved = useCallback((updated: AuthUser) => {
    setSelectedAccount(updated);
    setAuditUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
    accountSaveCallbackRef.current?.(updated);
  }, []);

  if (!isVertialSuperAdminEmail(user?.email)) {
    return (
      <Layout title="Panel admin" subtitle="Acceso restringido">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-800">
          Este panel solo está disponible para la cuenta interna de plataforma (super-admin).
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Panel admin" subtitle="Gestión SaaS, backups y auditoría">
      <div className="space-y-6">
        {/* Tabs */}
        <div
          className="flex gap-1 p-1.5 bg-gray-100 dark:bg-gray-700 rounded-2xl overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1.5 min-w-[5.5rem] px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-amber-500' : ''}`} />
                <span className="leading-tight text-center">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Contenido del tab activo */}
        {activeTab === 'clients' && (
          <ClientsTab
            selectedAccount={selectedAccount}
            onSelectAccount={setSelectedAccount}
            accountSaveCallbackRef={accountSaveCallbackRef}
          />
        )}
        {activeTab === 'payments' && <MoneiPaymentsTab />}
        {activeTab === 'plans' && <PlansTab userId={user?.id || user?.user_id || ''} />}
        {activeTab === 'affiliate_requests' && <AffiliateRequestsTab userId={user?.id || user?.user_id || ''} />}
        {activeTab === 'backup' && <BackupTab />}
        {activeTab === 'audit' && (
          <AuditTab
            usersMap={usersMap}
            onViewUser={(u) => setSelectedAccount(u)}
          />
        )}
      </div>
      {selectedAccount && (
        <EditClientModal
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
          onSaved={handleAccountSaved}
        />
      )}
    </Layout>
  );
}
