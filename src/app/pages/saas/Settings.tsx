import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  Calendar,
  Camera,
  Clock,
  Car,
  CarTaxiFront,
  Check,
  CheckCircle,
  Cog,
  Container,
  Copy,
  CreditCard,
  Download,
  Dumbbell,
  Edit2,
  Eye,
  FileText,
  GraduationCap,
  HardHat,
  Hash,
  Hotel,
  Image,
  KeyRound,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Monitor,
  Moon,
  Music,
  Palette,
  Sun,
  PartyPopper,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Scissors,
  Search,
  Settings as SettingsIcon,
  Shield,
  Smartphone,
  SprayCan,
  Stethoscope,
  Store,
  Table2,
  Tablet,
  Trash2,
  TrendingUp,
  Truck,
  UserCircle2,
  Users,
  Webhook,
  Wrench,
  X,
  ArrowUpDown,
  ChevronDown,
  Filter,
  Pill,
  Droplets,
  PawPrint,
  Tag,
  Globe,
  Cigarette,
  Beef,
  Layers,
} from 'lucide-react';
import { WysiwygTemplateEditor } from '../../components/saas/WysiwygTemplateEditor';
import { CreateRoleModal } from '../../components/saas/CreateRoleModal';
import { CompanyMarcaSettings } from '../../components/saas/settings/CompanyMarcaSettings';
import { BrandingTab, type BrandingTabHandle } from '../../components/saas/settings/BrandingTab';
import { CompanyTiendaSettings } from '../../components/saas/settings/CompanyTiendaSettings';
import { TpvPrinterSettingsTab } from '../../components/saas/settings/TpvPrinterSettingsTab';
import { PipelineConfigTab } from '../../components/saas/settings/PipelineConfigTab';
import { EmailTemplatesTab } from '../../components/saas/settings/EmailTemplatesTab';
import { BusinessHoursTab } from '../../components/saas/settings/BusinessHoursTab';
import { DataPortabilityTab } from '../../components/saas/settings/DataPortabilityTab';
import { AlertsTab } from '../../components/saas/settings/AlertsTab';
import { MyNotificationsTab } from '../../components/saas/settings/MyNotificationsTab';
import { SalesPointsTab } from '../../components/saas/settings/SalesPointsTab';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useTenantEntitlements } from '../../hooks/useTenantEntitlements';
import { PortfolioPlanBanner } from '../../components/saas/PortfolioPlanBanner';
import type { Business } from '../../lib/businessApi';
import { listBrandsRequest } from '../../lib/brandApi';
import {
  DELIVERY_WORK_CENTERS_CHANGED,
  loadDeliveryStores,
} from '../../lib/deliverySetup';
import {
  ACTIVATION_FOCUS_PARAM,
  clearActivationFocusFromSearch,
} from '../../lib/activationGuide';
import { useActivationFocus } from '../../hooks/useActivationFocus';
import { ActivationFieldWrap, ActivationFocusBanner } from '../../components/saas/ActivationGuideUi';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { useDocumentTemplates } from '../../hooks/useDocumentTemplates';
import { SAAS__CreateZoneModal } from '../../components/design-system/SAAS__CreateZoneModal';
import { IntegrationsPanel } from '../../components/saas/IntegrationsPanel';
import type { ActiveSession, AuthUser, RoleDefinition } from '../../lib/authApi';
import {
  buildTemplatePreview,
  createEmptyDocumentTemplate,
  DOCUMENT_TEMPLATE_SCOPE_OPTIONS,
  DOCUMENT_TEMPLATE_VARIABLES,
  type DocumentTemplate,
} from '../../lib/documentTemplates';
import {
  buildInvoiceNumber,
  createBillingInvoice,
  downloadInvoicePdf,
  listBillingInvoices,
  type BillingInvoice,
} from '../../lib/billingApi';
import { isVertialSuperAdminEmail } from '../../lib/superAdmin';
import {
  createMoneiSubscription,
  getSubscriptionStatus,
  confirmMoneiSubscription,
  cancelMoneiSubscription,
  purchaseSubscriptionAddon,
} from '../../lib/subscriptionApi';
import { isBlockingSubscriptionStatus } from '../../lib/billingRecovery';
import { PUBLIC_PAYMENT_UNAVAILABLE, isIgnorableSessionError, sanitizePaymentError } from '../../lib/paymentErrors';
import {
  getPlanPricingConfig,
  DEFAULT_PLANS,
  DEFAULT_ANNUAL_DISCOUNT,
} from '../../lib/planPricingApi';
import {
  formatAddonPrice,
  getAddonMonthlyPriceEur,
  isPlanAddonId,
  PLAN_ADDON_CATALOG,
  PLAN_ADDON_LIST,
  type PlanAddonId,
} from '../../lib/planAddonCatalog';
import { writeBillingSelection } from '../../lib/billingSelection';
import { ZONE_COLOR_MAP } from '../../lib/parkingZones';
import { formatRolePermissions, loadCustomRoles, mergeRoleCatalog, saveCustomRoles, upsertCustomRole } from '../../lib/roleCatalog';
import {
  DOC_TYPE_LABELS,
  getNextDocNumber,
  getNumberingConfig,
  previewDocNumber,
  saveNumberingConfig,
  type DocType,
  type NumberingConfig,
  type NumberingRule,
} from '../../lib/numberingApi';

type TabId =
  | 'users'
  | 'accountSecurity'
  | 'devices'
  | 'roles'
  | 'locations'
  | 'templates'
  | 'integrations'
  | 'billing'
  | 'businesses'
  | 'numbering'
  | 'brands'
  | 'pipeline'
  | 'emails'
  | 'horarios'
  | 'datos'
  | 'alertas'
  | 'misNotificaciones'
  | 'apariencia'
  | 'salesPoints'
  | 'tpvPrinter';

const TAB_KEYS: { id: TabId; slug: string; i18nKey?: string; label?: string }[] = [
  { id: 'users', slug: 'usuarios', i18nKey: 'settings.tabs.users' },
  { id: 'roles', slug: 'roles', label: 'Equipo' },
  { id: 'businesses', slug: 'empresa', label: 'Empresa' },
  { id: 'locations', slug: 'ubicaciones', i18nKey: 'settings.tabs.locations' },
  { id: 'templates', slug: 'plantillas', i18nKey: 'settings.tabs.templates' },
  { id: 'integrations', slug: 'integraciones', i18nKey: 'settings.tabs.integrations' },
  { id: 'billing', slug: 'facturacion', i18nKey: 'settings.tabs.billing' },
  { id: 'numbering', slug: 'numeracion', label: 'Numeración' },
  { id: 'accountSecurity', slug: 'seguridad', label: 'Seguridad' },
  { id: 'devices', slug: 'mis-dispositivos', label: 'Mis dispositivos' },
  { id: 'brands', slug: 'marca', label: 'Marca' },
  { id: 'pipeline', slug: 'pipeline', label: 'Pipeline' },
  { id: 'emails', slug: 'emails', label: 'Plantillas email' },
  { id: 'horarios', slug: 'horarios', label: 'Horarios' },
  { id: 'datos', slug: 'datos', label: 'Datos' },
  { id: 'alertas', slug: 'alertas', label: 'Alertas' },
  { id: 'misNotificaciones', slug: 'mis-notificaciones', label: 'Mis notificaciones' },
  { id: 'apariencia', slug: 'apariencia', label: 'Apariencia' },
  { id: 'salesPoints', slug: 'tienda', label: 'Tienda' },
  { id: 'tpvPrinter', slug: 'impresion-tpv', label: 'Tickets' },
];

const SLUG_TO_TAB: Record<string, TabId> = {
  ...Object.fromEntries(TAB_KEYS.map((t) => [t.slug, t.id])),
  'puntos-de-venta': 'salesPoints',
  'centros-de-trabajo': 'salesPoints',
  tiendas: 'salesPoints',
  'impresora-tpv': 'tpvPrinter',
  'tpv-impresion': 'tpvPrinter',
  empresas: 'businesses',
  resumen: 'businesses',
  identidad: 'brands',
  marcas: 'brands',
  'marcas-comerciales': 'brands',
  /** URL antigua: antes «security» era solo sesiones; ahora es «devices». */
  security: 'devices',
} as Record<string, TabId>;

const TAB_TO_SLUG: Record<TabId, string> = Object.fromEntries(
  TAB_KEYS.map((t) => [t.id, t.slug]),
) as Record<TabId, string>;

const DEFAULT_TAB: TabId = 'users';

type SectionId = 'profile' | 'company' | 'billing' | 'config' | 'alerts';

const SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }>; tabs: TabId[] }[] = [
  { id: 'profile', label: 'Mi perfil', icon: UserCircle2, tabs: ['users', 'roles', 'accountSecurity', 'devices', 'apariencia'] },
  {
    id: 'company',
    label: 'Empresa',
    icon: Building2,
    tabs: ['businesses', 'brands', 'salesPoints', 'tpvPrinter'],
  },
  { id: 'billing', label: 'Facturación', icon: CreditCard, tabs: ['billing', 'numbering'] },
  { id: 'config', label: 'Configuración', icon: SettingsIcon, tabs: ['templates', 'integrations', 'pipeline', 'emails', 'datos'] },
  { id: 'alerts', label: 'Alertas', icon: Bell, tabs: ['alertas', 'misNotificaciones'] },
];

const TAB_TO_SECTION: Record<TabId, SectionId> = Object.fromEntries(
  SECTIONS.flatMap((section) => section.tabs.map((tabId) => [tabId, section.id])),
) as Record<TabId, SectionId>;

/** Misma clave que `VerifyEmailPending`: cooldown compartido del reenvío entre pantallas. */
const EMAIL_VERIFY_RESEND_COOLDOWN_KEY = 'emailVerifResendAt';
const EMAIL_VERIFY_RESEND_COOLDOWN_SEC = 60;

const inputClassName =
  'w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none transition-colors focus:border-blue-500';


function templateScopeLabel(scope: DocumentTemplate['scope']) {
  return DOCUMENT_TEMPLATE_SCOPE_OPTIONS.find((option) => option.value === scope)?.label || 'General';
}

function roleStyles(role: string) {
  if (role === 'Admin') {
    return {
      dot: 'bg-blue-500',
      badgeBg: 'bg-blue-50',
      badgeText: 'text-blue-700',
      border: 'border-l-blue-500',
      icon: <Shield className="w-4 h-4 text-blue-700" />,
    };
  }

  if (role === 'Comercial') {
    return {
      dot: 'bg-emerald-500',
      badgeBg: 'bg-emerald-50',
      badgeText: 'text-emerald-700',
      border: 'border-l-emerald-500',
      icon: <TrendingUp className="w-4 h-4 text-emerald-700" />,
    };
  }

  if (role === 'Taller') {
    return {
      dot: 'bg-violet-500',
      badgeBg: 'bg-violet-50',
      badgeText: 'text-violet-700',
      border: 'border-l-violet-500',
      icon: <Wrench className="w-4 h-4 text-violet-700" />,
    };
  }

  return {
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    border: 'border-l-amber-500',
    icon: <SettingsIcon className="w-4 h-4 text-amber-700" />,
  };
}

function userInitials(user?: Partial<AuthUser> | null) {
  if (!user) {
    return 'UU';
  }

  const first = user.firstName?.[0] || '';
  const last = user.lastName?.[0] || '';
  return `${first}${last}`.toUpperCase() || 'UU';
}

function addOneMonth(date: Date) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function formatInputDate(value?: Date | string | null) {
  if (!value) {
    return new Date().toISOString().split('T')[0];
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().split('T')[0];
  }

  return parsed.toISOString().split('T')[0];
}

function TabBilling() {
  const { subscription } = useApp();
  const { user, updateProfile, refreshCurrentUser } = useAuth();
  const billingSelectionStorageKey = useMemo(
    () => (user?.user_id ? `billing_selection_${user.user_id}` : null),
    [user?.user_id],
  );
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState(subscription.selectedPlanId || 'basic');
  const [billingMode, setBillingMode] = useState<'monthly' | 'annual'>('monthly');
  const [requestedAddon, setRequestedAddon] = useState<PlanAddonId | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isPurchasingAddon, setIsPurchasingAddon] = useState(false);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [billingFeedback, setBillingFeedback] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({
    number: buildInvoiceNumber(),
    description: '',
    amount: '0',
    date: formatInputDate(new Date()),
    dueDate: formatInputDate(new Date()),
    status: 'pending' as BillingInvoice['status'],
  });

  const [ANNUAL_DISCOUNT, setAnnualDiscount] = useState(DEFAULT_ANNUAL_DISCOUNT);
  const [plans, setPlans] = useState(DEFAULT_PLANS.map((p) => ({ ...p })));

  useEffect(() => {
    getPlanPricingConfig()
      .then((cfg) => {
        if (cfg.plans.length > 0) setPlans(cfg.plans);
        setAnnualDiscount(cfg.annualDiscount);
      })
      .catch(() => {});
  }, []);

  const getEffectivePrice = (plan: typeof plans[0]) => {
    if (billingMode === 'annual') {
      return Math.round(plan.monthlyPrice * (1 - ANNUAL_DISCOUNT));
    }
    return plan.monthlyPrice;
  };

  const getAnnualTotal = (plan: typeof plans[0]) =>
    Math.round(plan.monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT));

  const getAnnualSavings = (plan: typeof plans[0]) =>
    Math.round(plan.monthlyPrice * 12 * ANNUAL_DISCOUNT);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0];
  const activeSubscriptionPlanId = subscription.selectedPlanId || 'basic';
  const accountBlocked = isBlockingSubscriptionStatus(subscription.status);
  const isSuspended = subscription.status === 'suspended';
  /** Permite ir a pasarela aunque ya haya suscripción, si el usuario eligió otro plan (pruebas / futuro upgrade). */
  const wantsDifferentPlanThanSubscription = selectedPlanId !== activeSubscriptionPlanId;

  const statusConfig: Record<string, { label: string; dot: string; badgeBg: string; badgeText: string }> = {
    trial_active: { label: 'Periodo de prueba', dot: 'bg-blue-500', badgeBg: 'bg-blue-50', badgeText: 'text-blue-700' },
    trial_expiring: { label: 'Prueba por expirar', dot: 'bg-amber-500', badgeBg: 'bg-amber-50', badgeText: 'text-amber-700' },
    trial_expired: { label: 'Prueba expirada', dot: 'bg-red-500', badgeBg: 'bg-red-50', badgeText: 'text-red-700' },
    subscription_active: { label: 'Activa', dot: 'bg-emerald-500', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700' },
    payment_failed: { label: 'Error en pago', dot: 'bg-red-500', badgeBg: 'bg-red-50', badgeText: 'text-red-700' },
    grace_period: { label: 'Periodo de gracia', dot: 'bg-orange-500', badgeBg: 'bg-orange-50', badgeText: 'text-orange-700' },
    suspended: { label: 'Suspendida', dot: 'bg-slate-400', badgeBg: 'bg-slate-100', badgeText: 'text-slate-600' },
  };

  useEffect(() => {
    if (!subscription.selectedPlanId) {
      return;
    }

    setSelectedPlanId(subscription.selectedPlanId);
  }, [subscription.selectedPlanId]);

  useEffect(() => {
    if (!billingSelectionStorageKey) {
      return;
    }

    try {
      const rawSelection = localStorage.getItem(billingSelectionStorageKey);
      if (!rawSelection) {
        return;
      }

      const parsedSelection = JSON.parse(rawSelection) as {
        selectedPlanId?: string;
        billingMode?: 'monthly' | 'annual';
        requestedAddon?: string;
      };

      if (parsedSelection.selectedPlanId) {
        setSelectedPlanId(parsedSelection.selectedPlanId);
      }

      if (parsedSelection.billingMode === 'monthly' || parsedSelection.billingMode === 'annual') {
        setBillingMode(parsedSelection.billingMode);
      }

      if (isPlanAddonId(parsedSelection.requestedAddon)) {
        setRequestedAddon(parsedSelection.requestedAddon);
      }
    } catch {
      // Si hay datos corruptos en localStorage, se ignoran.
    }
  }, [billingSelectionStorageKey]);

  useEffect(() => {
    if (!billingSelectionStorageKey) {
      return;
    }

    const payload = JSON.stringify({
      selectedPlanId,
      billingMode,
      ...(requestedAddon ? { requestedAddon } : {}),
    });
    localStorage.setItem(billingSelectionStorageKey, payload);
  }, [billingMode, billingSelectionStorageKey, selectedPlanId, requestedAddon]);

  useEffect(() => {
    if (!user?.user_id) return;

    let cancelled = false;

    const loadBilling = async () => {
      setIsLoadingBilling(true);
      try {
        const nextInvoices = await listBillingInvoices(user.user_id);
        if (!cancelled) {
          setInvoices(nextInvoices);
        }
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : '';
          if (!isIgnorableSessionError(msg)) {
            setBillingFeedback(sanitizePaymentError(msg || 'No se pudo cargar la facturación.'));
          }
        }
      } finally {
        if (!cancelled) setIsLoadingBilling(false);
      }
    };

    void loadBilling();
    return () => { cancelled = true; };
  }, [user?.user_id]);

  const sc = statusConfig[subscription.status] ?? {
    label: subscription.status,
    dot: 'bg-gray-400',
    badgeBg: 'bg-gray-100 dark:bg-gray-700',
    badgeText: 'text-gray-600 dark:text-gray-400',
  };

  const [moneiStatus, setMoneiStatus] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Maneja la vuelta desde la página de pago de MONEI
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subComplete = params.get('subscription_complete');
    const subId = params.get('subscription_id');
    const paymentId = params.get('payment_id');

    if (subComplete === 'true' && subId) {
      const seenKey = `vertial.moneiConfirmHandled.${subId}`;
      try {
        if (sessionStorage.getItem(seenKey)) return;
        sessionStorage.setItem(seenKey, '1');
      } catch {
        /* ignore */
      }
      setBillingFeedback('Verificando tu suscripción...');
      confirmMoneiSubscription(subId, paymentId || undefined)
        .then((result) => {
          if (result.ok) {
            setBillingFeedback('Suscripción activada correctamente.');
            setMoneiStatus(String(result.moneiSubscription?.status || 'ACTIVE'));
            void refreshCurrentUser();
            // TODO(pagos): sustituir por factura emitida desde webhook / backend al cobro real.
            if (user?.user_id) {
              let mode: 'monthly' | 'annual' = 'monthly';
              let pid = subscription.selectedPlanId || 'basic';
              try {
                const rawSel = billingSelectionStorageKey ? localStorage.getItem(billingSelectionStorageKey) : null;
                if (rawSel) {
                  const j = JSON.parse(rawSel) as { billingMode?: string; selectedPlanId?: string };
                  if (j.billingMode === 'annual' || j.billingMode === 'monthly') mode = j.billingMode;
                  if (j.selectedPlanId) pid = j.selectedPlanId;
                }
              } catch {
                /* ignore */
              }
              const planRow = DEFAULT_PLANS.find((p) => p.id === pid) || DEFAULT_PLANS[0];
              const charge =
                mode === 'annual'
                  ? Math.round(planRow.monthlyPrice * 12 * (1 - DEFAULT_ANNUAL_DISCOUNT))
                  : planRow.monthlyPrice;
              void createBillingInvoice({
                userId: user.user_id,
                number: buildInvoiceNumber(),
                description: `Suscripción ${planRow.name} (${mode}) — pago confirmado (MONEI)`,
                amount: charge,
                date: formatInputDate(new Date()),
                dueDate: formatInputDate(new Date()),
                status: 'paid',
                planId: planRow.id,
                planName: planRow.name,
              })
                .then((inv) => setInvoices((prev) => [inv, ...prev]))
                .catch(() => {});
            }
          } else {
            try {
              sessionStorage.removeItem(seenKey);
            } catch {
              /* ignore */
            }
          }
        })
        .catch((err) => {
          try {
            sessionStorage.removeItem(seenKey);
          } catch {
            /* ignore */
          }
          setBillingFeedback(
            sanitizePaymentError(err instanceof Error ? err.message : 'Error al confirmar la suscripción.'),
          );
        })
        .finally(() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('subscription_complete');
          url.searchParams.delete('subscription_id');
          url.searchParams.delete('subscription_cancelled');
          url.searchParams.delete('payment_id');
          window.history.replaceState({}, '', url.toString());
        });
    }

    if (params.get('subscription_cancelled') === 'true') {
      setBillingFeedback('Has cancelado el proceso de suscripción.');
      const url = new URL(window.location.href);
      url.searchParams.delete('subscription_cancelled');
      window.history.replaceState({}, '', url.toString());
    }

    if (params.get('addon_complete') === 'true') {
      setBillingFeedback('Ampliación registrada. Actualizando tu cuenta…');
      void refreshCurrentUser().then(() => {
        setBillingFeedback('Ampliación contratada correctamente.');
        if (user?.user_id) {
          writeBillingSelection(user.user_id, { requestedAddon: null });
        }
        setRequestedAddon(null);
      });
      const url = new URL(window.location.href);
      url.searchParams.delete('addon_complete');
      url.searchParams.delete('addon_id');
      window.history.replaceState({}, '', url.toString());
    }

    if (params.get('addon_cancelled') === 'true') {
      setBillingFeedback('Has cancelado la contratación de la ampliación.');
      const url = new URL(window.location.href);
      url.searchParams.delete('addon_cancelled');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Carga el estado de MONEI al montar
  useEffect(() => {
    if (!user?.user_id) return;
    getSubscriptionStatus()
      .then((result) => {
        if (result.moneiSubscription) {
          setMoneiStatus(result.moneiSubscription.status);
        }
      })
      .catch(() => {});
  }, [user?.user_id]);

  const handlePurchaseAddon = async (addonId: PlanAddonId) => {
    if (!user?.user_id) {
      setBillingFeedback('No hay usuario autenticado.');
      return;
    }
    if (accountBlocked) {
      setBillingFeedback('Primero reactiva tu suscripción mensual; después podrás contratar ampliaciones.');
      return;
    }

    setIsPurchasingAddon(true);
    setBillingFeedback(null);
    setRequestedAddon(addonId);
    writeBillingSelection(user.user_id, { requestedAddon: addonId, billingMode });

    try {
      const result = await purchaseSubscriptionAddon(addonId, billingMode);
      if (result.ok && result.redirectUrl) {
        setBillingFeedback('Redirigiendo al pago seguro de la ampliación…');
        window.location.href = result.redirectUrl;
        return;
      }
      if (result.ok && result.skippedMonei) {
        setBillingFeedback('Ampliación activada en tu cuenta.');
        writeBillingSelection(user.user_id, { requestedAddon: null });
        setRequestedAddon(null);
        void refreshCurrentUser();
        return;
      }
      setBillingFeedback('No se pudo completar la contratación de la ampliación.');
    } catch (error) {
      setBillingFeedback(
        sanitizePaymentError(error instanceof Error ? error.message : undefined),
      );
    } finally {
      setIsPurchasingAddon(false);
    }
  };

  const handlePaySubscription = async () => {
    if (!user?.user_id) {
      setBillingFeedback('No hay usuario autenticado.');
      return;
    }

    setIsPaying(true);
    setBillingFeedback(null);

    const plan = plans.find((p) => p.id === selectedPlanId) || plans[0];
    const chargeAmount = billingMode === 'annual' ? getAnnualTotal(plan) : getEffectivePrice(plan);

    const recordPaidSubscriptionInvoice = async (description: string) => {
      try {
        const invoice = await createBillingInvoice({
          userId: user.user_id,
          number: buildInvoiceNumber(),
          description,
          amount: chargeAmount,
          date: formatInputDate(new Date()),
          dueDate: formatInputDate(new Date()),
          status: 'paid',
          planId: plan.id,
          planName: plan.name,
        });
        setInvoices((prev) => [invoice, ...prev]);
      } catch {
        /* no bloquear el flujo de cobro / pruebas */
      }
    };

    try {
      const result = await createMoneiSubscription(selectedPlanId, billingMode);

      if (result.ok && result.redirectUrl) {
        setBillingFeedback('Redirigiendo a la página de pago seguro...');
        window.location.href = result.redirectUrl;
        return;
      }

      if (result.ok) {
        if (result.skippedMonei) {
          setBillingFeedback('Plan activado en tu cuenta (modo sin MONEI en el servidor).');
        } else {
          setBillingFeedback(
            'Modo prueba: la pasarela no devolvió URL de cobro. Simulación completada; al integrar MONEI aquí irás al pago real.',
          );
        }
        setMoneiStatus(result.skippedMonei ? 'ACTIVE' : 'TRIALING');
        void refreshCurrentUser();
        await recordPaidSubscriptionInvoice(
          `Suscripción ${plan.name} (${billingMode === 'annual' ? 'anual' : 'mensual'})${result.skippedMonei ? ' — activación local (sin MONEI)' : ' — cobro automático (simulación hasta pasarela)'}`,
        );
        return;
      }
    } catch (error) {
      setBillingFeedback(
        sanitizePaymentError(error instanceof Error ? error.message : undefined),
      );
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('¿Estás seguro de que deseas cancelar tu suscripción? Perderás el acceso al final del periodo actual.')) {
      return;
    }

    setIsCancelling(true);
    setBillingFeedback(null);

    try {
      await cancelMoneiSubscription();
      setMoneiStatus('CANCELLED');
      setBillingFeedback('Suscripción cancelada correctamente.');
    } catch (error) {
      setBillingFeedback(
        sanitizePaymentError(error instanceof Error ? error.message : 'No se pudo cancelar la suscripción.'),
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCreateInvoice = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user?.user_id) {
      setBillingFeedback('No hay usuario autenticado.');
      return;
    }

    if (!invoiceForm.description.trim()) {
      setBillingFeedback('Añade una descripción para la factura.');
      return;
    }

    if (Number(invoiceForm.amount) <= 0) {
      setBillingFeedback('El importe de la factura debe ser mayor que cero.');
      return;
    }

    setIsCreatingInvoice(true);
    setBillingFeedback(null);

    try {
      const invoice = await createBillingInvoice({
        userId: user.user_id,
        number: invoiceForm.number,
        description: invoiceForm.description,
        amount: Number(invoiceForm.amount),
        date: invoiceForm.date,
        dueDate: invoiceForm.dueDate,
        status: invoiceForm.status,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
      });

      setInvoices((prev) => [invoice, ...prev]);
      setInvoiceForm({
        number: buildInvoiceNumber(),
        description: '',
        amount: '0',
        date: formatInputDate(new Date()),
        dueDate: formatInputDate(new Date()),
        status: 'pending',
      });
      setIsInvoiceDialogOpen(false);
      setBillingFeedback('Factura creada en CouchDB dentro de `invoice`.');
    } catch (error) {
      setBillingFeedback(
        sanitizePaymentError(error instanceof Error ? error.message : 'No se pudo crear la factura.'),
      );
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const openInvoicePreview = (invoice: BillingInvoice) => {
    setSelectedInvoice(invoice);
    setIsInvoicePreviewOpen(true);
  };

  return (
    <div className="space-y-6">
      {accountBlocked && (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 px-5 py-4 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm font-bold text-red-900 dark:text-red-100">
            {isSuspended ? 'Cuenta suspendida' : 'Suscripción pendiente de pago'}
          </p>
          <p className="mt-1 text-sm text-red-800 dark:text-red-200">
            {isSuspended
              ? 'Regulariza tu suscripción mensual para recuperar el acceso. Elige tu plan abajo y pulsa «Pagar y reactivar».'
              : 'Tu acceso puede estar limitado hasta que confirmes el pago del plan.'}
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Suscripción activa</p>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{subscription.planName}</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.badgeBg} ${sc.badgeText}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {sc.label}
                </span>
              </div>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6">
          {subscription.currentPeriodEnd && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium">Próximo pago</p>
                <p className="text-sm font-bold text-blue-900">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>
          )}
          {subscription.lastPaymentAt && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl">
              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-emerald-600 font-medium">Último pago</p>
                <p className="text-sm font-bold text-emerald-900">
                  {new Date(subscription.lastPaymentAt).toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl">
            <div className="w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Cobro</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{billingMode === 'monthly' ? 'Mensual' : 'Anual'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Planes disponibles</p>
          {/* S-09: Toggle visual mensual / anual con descuento */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setBillingMode('monthly')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                billingMode === 'monthly'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setBillingMode('annual')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                billingMode === 'annual'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Anual
              <span className="inline-block bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                −20%
              </span>
            </button>
          </div>
        </div>
        {billingMode === 'annual' && (
          <div className="mb-5 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <p className="text-sm text-emerald-800">
              <span className="font-semibold">Ahorra un 20%</span> pagando anualmente. Se factura un único cargo al inicio del año.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const effectivePrice = getEffectivePrice(plan);
            const annualTotal = getAnnualTotal(plan);
            const savings = getAnnualSavings(plan);
            const isSelected = selectedPlanId === plan.id;
            const isActive = subscription.selectedPlanId === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-5 transition-all ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50'
                    : plan.highlight
                    ? 'border-gray-300'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-block bg-gray-900 text-white text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{plan.name}</h3>
                  {isActive && (
                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      Activo
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {effectivePrice}€
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-normal">/mes</span>
                  </p>
                  {billingMode === 'annual' ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-emerald-600 font-semibold">
                        {annualTotal}€/año · ahorras {savings}€
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 line-through">{plan.monthlyPrice}€/mes sin descuento</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      O {getAnnualTotal(plan)}€/año con plan anual (ahorra {savings}€)
                    </p>
                  )}
                </div>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature.text} className="flex items-start gap-2">
                      {feature.included ? (
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={`text-sm ${feature.included ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isSelected
                      ? 'bg-gray-900 text-white'
                      : 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                  }`}
                >
                  {isSelected ? 'Plan seleccionado' : 'Seleccionar plan'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Ampliaciones</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Suma cupos a tu plan Pro. Precio por unidad adicional (la marca «General» no cuenta de cupo).
          </p>
          {(subscription.extraPointOfSaleSlots ?? 0) > 0 ||
          (subscription.extraCommercialBrandSlots ?? 0) > 0 ||
          (subscription.extraBusinessSlots ?? 0) > 0 ? (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
              Cupos extra activos:{' '}
              {[
                (subscription.extraPointOfSaleSlots ?? 0) > 0
                  ? `${subscription.extraPointOfSaleSlots} PDV`
                  : null,
                (subscription.extraCommercialBrandSlots ?? 0) > 0
                  ? `${subscription.extraCommercialBrandSlots} marca(s)`
                  : null,
                (subscription.extraBusinessSlots ?? 0) > 0
                  ? `${subscription.extraBusinessSlots} empresa(s)`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
        {requestedAddon && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/30">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
            <p className="text-sm text-violet-900 dark:text-violet-100">
              Quieres contratar{' '}
              <span className="font-semibold">{PLAN_ADDON_CATALOG[requestedAddon].name}</span>{' '}
              ({formatAddonPrice(requestedAddon, billingMode)}).
              {accountBlocked
                ? ' Reactiva primero tu suscripción; las ampliaciones requieren plan activo.'
                : ' Pulsa «Contratar ampliación» en la tarjeta para pagar.'}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLAN_ADDON_LIST.map((addon) => {
            const isSelected = requestedAddon === addon.id;
            return (
              <div
                key={addon.id}
                className={`rounded-2xl border-2 p-5 transition-all ${
                  isSelected
                    ? 'border-violet-400 bg-violet-50 dark:border-violet-600 dark:bg-violet-950/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{addon.name}</h3>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {getAddonMonthlyPriceEur(addon.id)}€
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">/mes</span>
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  O {formatAddonPrice(addon.id, 'annual')} con plan anual (−20%)
                </p>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{addon.description}</p>
                <p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">
                  Requiere plan Pro activo
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const next = isSelected ? null : addon.id;
                    setRequestedAddon(next);
                    if (user?.user_id) {
                      writeBillingSelection(user.user_id, { requestedAddon: next, billingMode });
                    }
                  }}
                  className={`mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isSelected
                      ? 'border border-violet-300 bg-white text-violet-800 dark:border-violet-700 dark:bg-gray-900 dark:text-violet-200'
                      : 'border border-gray-200 text-gray-700 hover:border-violet-300 dark:border-gray-700 dark:text-gray-300'
                  }`}
                >
                  {isSelected ? 'Seleccionada' : `Seleccionar ${addon.shortLabel}`}
                </button>
                <button
                  type="button"
                  disabled={!isSelected || isPurchasingAddon || accountBlocked}
                  onClick={() => void handlePurchaseAddon(addon.id)}
                  className={`mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isSelected && !accountBlocked
                      ? 'bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
                  }`}
                >
                  {isPurchasingAddon && isSelected
                    ? 'Procesando…'
                    : accountBlocked
                      ? 'Reactiva suscripción primero'
                      : `Contratar ampliación (${formatAddonPrice(addon.id, billingMode)})`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-5 gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Suscripción con MONEI</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Ciclo: <span className="font-medium text-gray-700 dark:text-gray-300">{billingMode === 'annual' ? 'Anual (−20%)' : 'Mensual'}</span>
              {wantsDifferentPlanThanSubscription && (moneiStatus === 'ACTIVE' || moneiStatus === 'TRIALING') ? (
                <> · <span className="text-amber-700 dark:text-amber-300 font-medium">Plan distinto al contratado: puedes ir a pagar el cambio (pruebas)</span></>
              ) : null}
            </p>
          </div>
          {moneiStatus && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              moneiStatus === 'ACTIVE' || moneiStatus === 'TRIALING'
                ? 'bg-emerald-50 text-emerald-700'
                : moneiStatus === 'PAST_DUE'
                ? 'bg-red-50 text-red-700'
                : moneiStatus === 'CANCELLED'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-amber-50 text-amber-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                moneiStatus === 'ACTIVE' ? 'bg-emerald-500'
                : moneiStatus === 'TRIALING' ? 'bg-blue-500'
                : moneiStatus === 'PAST_DUE' ? 'bg-red-500'
                : moneiStatus === 'CANCELLED' ? 'bg-gray-400'
                : 'bg-amber-500'
              }`} />
              {moneiStatus === 'ACTIVE' ? 'Activa' : moneiStatus === 'TRIALING' ? 'En prueba' : moneiStatus === 'PAST_DUE' ? 'Pago pendiente' : moneiStatus === 'CANCELLED' ? 'Cancelada' : moneiStatus === 'PAUSED' ? 'Pausada' : moneiStatus}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Pago seguro con MONEI</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              Al pagar, serás redirigido a la página segura de MONEI para introducir tu tarjeta (cuando la pasarela esté activa).
              El importe del plan seleccionado será{' '}
              <span className="font-semibold">
                {billingMode === 'annual' ? `${getAnnualTotal(selectedPlan)}€/año` : `${getEffectivePrice(selectedPlan)}€/mes`}
              </span>
              . Las facturas se generan automáticamente al confirmar el cobro.
            </p>
          </div>
        </div>

        {billingFeedback && !isIgnorableSessionError(billingFeedback) && (
          <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
            billingFeedback === PUBLIC_PAYMENT_UNAVAILABLE ||
            billingFeedback.includes('error') ||
            billingFeedback.includes('Error') ||
            billingFeedback.includes('No pudimos') ||
            billingFeedback.includes('cancelado')
              ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              : billingFeedback.includes('correctamente') || billingFeedback.includes('activada')
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
          }`}>
            {billingFeedback.includes('correctamente') || billingFeedback.includes('activada') ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : billingFeedback === PUBLIC_PAYMENT_UNAVAILABLE ||
              billingFeedback.includes('error') ||
              billingFeedback.includes('Error') ||
              billingFeedback.includes('No pudimos') ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" />
            )}
            {billingFeedback}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {isLoadingBilling ? 'Cargando...' : `Plan seleccionado: ${selectedPlan.name} · ${billingMode === 'annual' ? getAnnualTotal(selectedPlan) + '€/año' : getEffectivePrice(selectedPlan) + '€/mes'}`}
          </div>
          <div className="flex items-center gap-2">
            {(moneiStatus === 'ACTIVE' || moneiStatus === 'TRIALING') && (
              <button
                type="button"
                onClick={() => void handleCancelSubscription()}
                disabled={isCancelling}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCancelling ? 'Cancelando...' : 'Cancelar suscripción'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handlePaySubscription()}
              disabled={
                isLoadingBilling ||
                isPaying ||
                (!accountBlocked &&
                  (moneiStatus === 'ACTIVE' || moneiStatus === 'TRIALING') &&
                  !wantsDifferentPlanThanSubscription)
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4" />
              {isPaying
                ? 'Redirigiendo a MONEI...'
                : accountBlocked
                  ? 'Pagar y reactivar suscripción'
                  : moneiStatus === 'ACTIVE' || moneiStatus === 'TRIALING'
                    ? wantsDifferentPlanThanSubscription
                      ? 'Ir a pagar plan seleccionado'
                      : 'Suscripción activa'
                    : 'Ir a pagar'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Historial de facturas</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
              Las facturas de suscripción se crean <span className="font-medium text-gray-700 dark:text-gray-300">automáticamente al pagar</span>
              (pasarela o modo prueba). Más adelante el backend / webhooks MONEI sustituirán la generación local.
            </p>
          </div>
          <details className="group rounded-xl border border-dashed border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 sm:max-w-xs shrink-0">
            <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300 list-none flex items-center justify-between gap-2">
              <span>Factura manual (solo pruebas)</span>
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 shrink-0" />
            </summary>
            <button
              type="button"
              onClick={() => setIsInvoiceDialogOpen(true)}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir factura a mano
            </button>
          </details>
        </div>
        <div className="divide-y divide-gray-50">
          {invoices.length === 0 && (
            <div className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400">
              No hay facturas todavía. Tras un pago (o una simulación desde «Ir a pagar») aparecerá aquí la primera en CouchDB `invoice`.
            </div>
          )}
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              role="button"
              tabIndex={0}
              onClick={() => openInvoicePreview(invoice)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openInvoicePreview(invoice);
                }
              }}
              className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{invoice.number}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{invoice.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{invoice.amount}€</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(invoice.date).toLocaleDateString('es-ES')}</p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    downloadInvoicePdf(invoice, user?.companyName || 'Vertial');
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  <Download className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog
        open={isInvoicePreviewOpen}
        onOpenChange={(open) => {
          setIsInvoicePreviewOpen(open);
          if (!open) {
            setSelectedInvoice(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de factura</DialogTitle>
            <DialogDescription>
              Revisa la factura seleccionada y descárgala en PDF.
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{selectedInvoice.number}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{selectedInvoice.description}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      selectedInvoice.status === 'paid'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {selectedInvoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Importe</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">{selectedInvoice.amount}€</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha de emisión</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">{new Date(selectedInvoice.date).toLocaleDateString('es-ES')}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vencimiento</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">{new Date(selectedInvoice.dueDate).toLocaleDateString('es-ES')}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plan</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">{selectedInvoice.planName || '—'}</p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedInvoice) return;
                    downloadInvoicePdf(selectedInvoice, user?.companyName || 'Vertial');
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
                >
                  <Download className="w-4 h-4" />
                  Descargar PDF
                </button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
        <DialogContent className="max-w-xl">
          <form onSubmit={handleCreateInvoice} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Nueva factura</DialogTitle>
              <DialogDescription>
                Esta acción crea y guarda la factura en la base `invoice` de CouchDB.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Número</label>
                <input
                  value={invoiceForm.number}
                  onChange={(event) => setInvoiceForm((prev) => ({ ...prev, number: event.target.value }))}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Estado</label>
                <select
                  value={invoiceForm.status}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({ ...prev, status: event.target.value as BillingInvoice['status'] }))
                  }
                  className={inputClassName}
                >
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagada</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Descripción</label>
              <input
                value={invoiceForm.description}
                onChange={(event) => setInvoiceForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder={`Suscripción ${selectedPlan.name}`}
                className={inputClassName}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Importe</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoiceForm.amount}
                  onChange={(event) => setInvoiceForm((prev) => ({ ...prev, amount: event.target.value }))}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha emisión</label>
                <input
                  type="date"
                  value={invoiceForm.date}
                  onChange={(event) => setInvoiceForm((prev) => ({ ...prev, date: event.target.value }))}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Vencimiento</label>
                <input
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(event) => setInvoiceForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  className={inputClassName}
                />
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setIsInvoiceDialogOpen(false)}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isCreatingInvoice}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                {isCreatingInvoice ? 'Guardando...' : 'Crear factura'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab Empresas ─────────────────────────────────────────────────────────────

const BUSINESS_INPUT_CLASS =
  'w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none transition-colors focus:border-blue-500 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:focus:border-blue-400';

const ENABLED_BUSINESS_TYPES = new Set(['events', 'carDealership', 'workshop', 'delivery', 'cleaning', 'hairSalon', 'tobaccoShop', 'scrapyard', 'gym', 'clinic', 'hotel', 'construction', 'academy', 'realEstate', 'lawyer', 'nightclub', 'spareParts', 'taxi', 'pharmacy', 'carWash', 'vet', 'butcherShop']);

const ALL_BUSINESS_TYPES: { value: string; label: string; description: string; icon: React.ReactNode; keywords: string; disabled?: boolean }[] = [
  { value: 'events',        label: 'Eventos',               description: 'Organización de eventos',        icon: <PartyPopper className="w-6 h-6" />,    keywords: 'boda fiesta conferencia feria organización catering' },
  { value: 'carDealership', label: 'Compraventa de coches', description: 'Venta y compra de vehículos',   icon: <Car className="w-6 h-6" />,            keywords: 'coche vehículo concesionario automóvil motor' },
  { value: 'workshop',      label: 'Taller',                description: 'Taller mecánico',               icon: <Wrench className="w-6 h-6" />,         keywords: 'mecánico reparación motor vehículo' },
  { value: 'delivery',      label: 'Delivery',              description: 'Logística y entregas',          icon: <Truck className="w-6 h-6" />,          keywords: 'envío transporte reparto logística comida' },
  { value: 'cleaning',      label: 'Limpieza',              description: 'Empresa de limpieza',           icon: <SprayCan className="w-6 h-6" />,       keywords: 'limpiar hogar oficina mantenimiento' },
  { value: 'hairSalon',     label: 'Peluquería',            description: 'Salón de belleza',               icon: <Scissors className="w-6 h-6" />,       keywords: 'pelo corte color estilista barbería belleza estética' },
  { value: 'gym',           label: 'Gimnasio',              description: 'Gimnasio y fitness',             icon: <Dumbbell className="w-6 h-6" />,       keywords: 'deporte fitness entrenamiento crossfit yoga' },
  { value: 'clinic',        label: 'Clínica',               description: 'Clínica y consultas médicas',   icon: <Stethoscope className="w-6 h-6" />,    keywords: 'médico doctor salud hospital consulta dental' },
  { value: 'hotel',         label: 'Hotel',                 description: 'Gestión hotelera',               icon: <Hotel className="w-6 h-6" />,          keywords: 'alojamiento hostal habitación turismo hostelería' },
  { value: 'construction',  label: 'Constructora',          description: 'Obras y proyectos',              icon: <HardHat className="w-6 h-6" />,        keywords: 'obra proyecto edificio reforma albañil' },
  { value: 'academy',       label: 'Academia',              description: 'Formación y educación',          icon: <GraduationCap className="w-6 h-6" />,  keywords: 'educación curso formación clase profesor alumno' },
  { value: 'realEstate',    label: 'Inmobiliaria',          description: 'Gestión inmobiliaria',           icon: <Building2 className="w-6 h-6" />,      keywords: 'piso casa alquiler venta propiedad vivienda' },
  { value: 'lawyer',        label: 'Abogados',              description: 'Despacho jurídico',              icon: <Scale className="w-6 h-6" />,          keywords: 'abogado derecho legal jurídico caso expediente' },
  { value: 'nightclub',     label: 'Discoteca',             description: 'Ocio nocturno',                  icon: <Music className="w-6 h-6" />,          keywords: 'fiesta noche club pub bar discoteca DJ' },
  { value: 'scrapyard',     label: 'Desguace',              description: 'Desguace de vehículos',          icon: <Container className="w-6 h-6" />,      keywords: 'desguace chatarra reciclaje piezas baja vehículo' },
  { value: 'spareParts',    label: 'Recambios',             description: 'Venta de recambios',             icon: <Cog className="w-6 h-6" />,            keywords: 'recambio repuesto pieza auto taller distribuidor' },
  { value: 'taxi',          label: 'Taxi',                  description: 'Flota de taxis',                 icon: <CarTaxiFront className="w-6 h-6" />,   keywords: 'taxi conductor flota carrera licencia VTC' },
  { value: 'pharmacy',      label: 'Farmacia',              description: 'Farmacia y parafarmacia',        icon: <Pill className="w-6 h-6" />,           keywords: 'farmacia medicamento receta parafarmacia botica' },
  { value: 'carWash',       label: 'Lavadero de coches',    description: 'Centro de lavado',               icon: <Droplets className="w-6 h-6" />,       keywords: 'lavado coche túnel autolavado limpieza vehículo' },
  { value: 'vet',           label: 'Veterinario',           description: 'Clínica veterinaria',            icon: <PawPrint className="w-6 h-6" />,       keywords: 'veterinario animal mascota perro gato clínica vacuna' },
  { value: 'tobaccoShop',  label: 'Estanco',               description: 'Expendeduría de tabaco',         icon: <Cigarette className="w-6 h-6" />,      keywords: 'estanco tabaco lotería sellos expendeduría timbre' },
  { value: 'butcherShop', label: 'Carnicería',            description: 'Carnicería y charcutería',       icon: <Beef className="w-6 h-6" />,           keywords: 'carnicería carne charcutería embutido vacuno cerdo pollo' },
];

function BusinessFormModal({
  initial,
  onSave,
  onClose,
  isNew,
  highlightField = null,
}: {
  initial: Partial<Business>;
  onSave: (data: Partial<Business>) => Promise<void>;
  onClose: () => void;
  isNew: boolean;
  highlightField?: string | null;
}) {
  useModalClose(true, onClose);
  const [step, setStep] = useState<1 | 2>(isNew ? 1 : 2);
  const [typeSearch, setTypeSearch] = useState('');
  const [form, setForm] = useState({
    name: initial.name || '',
    legalName: initial.legalName || '',
    taxId: initial.taxId || '',
    address: initial.address || '',
    city: initial.city || '',
    phone: initial.phone || '',
    email: initial.email || '',
    logo: initial.logo || '',
    businessType: (initial as Business).businessType || 'carDealership',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredTypes = useMemo(() => {
    if (!typeSearch.trim()) return ALL_BUSINESS_TYPES;
    const q = typeSearch.toLowerCase();
    return ALL_BUSINESS_TYPES.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.keywords.toLowerCase().includes(q),
    );
  }, [typeSearch]);

  const selectedTypeInfo = ALL_BUSINESS_TYPES.find((t) => t.value === form.businessType);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('El nombre de la empresa es obligatorio');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[min(92vh,760px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 w-full max-w-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-5 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {isNew ? 'Nueva empresa' : 'Editar empresa'}
              </h2>
              {isNew && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Paso {step} de 2 — {step === 1 ? 'Tipo de negocio' : 'Datos de la empresa'}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {highlightField && (
          <div className="shrink-0 mx-6 mt-4">
            <ActivationFocusBanner fieldKey={highlightField} />
          </div>
        )}

        {/* Step indicator */}
        {isNew && (
          <div className="shrink-0 px-6 pt-4 pb-1">
            <div className="flex items-center gap-2">
              <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 1 ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 2 ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
            </div>
          </div>
        )}

        {/* Step 1: Select business type */}
        {step === 1 && (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 px-6 pt-4 pb-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">¿Qué tipo de negocio es?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Selecciona el sector de tu empresa para adaptar la plataforma.</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none transition-colors focus:border-blue-500 dark:bg-gray-800 dark:focus:border-blue-400 placeholder:text-gray-400"
                  placeholder="Buscar sector... (ej. peluquería, taxi, hotel)"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
              {filteredTypes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No se encontraron sectores</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Prueba con otro término de búsqueda</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredTypes.map((opt) => {
                    const isSelected = form.businessType === opt.value;
                    const isDisabled = opt.disabled ?? !ENABLED_BUSINESS_TYPES.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && setForm((prev) => ({ ...prev, businessType: opt.value }))}
                        className={`group relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                          isDisabled
                            ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700'
                            : isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400 shadow-sm shadow-blue-100 dark:shadow-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        {isSelected && !isDisabled && (
                          <div className="absolute top-2 right-2">
                            <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        )}
                        {isDisabled && (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-medium text-gray-500 dark:text-gray-400">
                            Próximamente
                          </div>
                        )}
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                          isSelected && !isDisabled
                            ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 dark:group-hover:bg-blue-900/30 dark:group-hover:text-blue-400'
                        }`}>
                          {opt.icon}
                        </div>
                        <div>
                          <p className={`text-sm font-semibold leading-tight ${
                            isSelected && !isDisabled ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'
                          }`}>{opt.label}</p>
                          <p className={`text-[11px] mt-0.5 leading-tight ${
                            isSelected && !isDisabled ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                          }`}>{opt.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 flex w-full gap-3 border-t border-gray-100 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Continuar
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Company details */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-4 p-6 pb-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {/* Selected type chip */}
                {selectedTypeInfo && (
                  <button
                    type="button"
                    onClick={() => isNew && setStep(1)}
                    className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 transition-colors ${isNew ? 'hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-300">
                      {selectedTypeInfo.icon}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{selectedTypeInfo.label}</p>
                      <p className="text-[11px] text-blue-500 dark:text-blue-400">{selectedTypeInfo.description}</p>
                    </div>
                    {isNew && <Edit2 className="w-3.5 h-3.5 text-blue-400 ml-auto" />}
                  </button>
                )}

                <div className="grid grid-cols-1 gap-4">
                  <ActivationFieldWrap fieldKey="name" activeKey={highlightField}>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                        Nombre comercial <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        className={BUSINESS_INPUT_CLASS}
                        placeholder="Ej. Mi Negocio"
                        required
                        autoFocus={step === 2 && highlightField === 'name'}
                      />
                    </div>
                  </ActivationFieldWrap>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Razón social</label>
                      <input
                        value={form.legalName}
                        onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
                        className={BUSINESS_INPUT_CLASS}
                        placeholder="Mi Negocio S.L."
                      />
                    </div>
                    <ActivationFieldWrap fieldKey="taxId" activeKey={highlightField}>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">CIF / NIF</label>
                        <input
                          value={form.taxId}
                          onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value }))}
                          className={BUSINESS_INPUT_CLASS}
                          placeholder="B12345678"
                          autoFocus={step === 2 && highlightField === 'taxId'}
                        />
                      </div>
                    </ActivationFieldWrap>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Ciudad</label>
                      <input
                        value={form.city}
                        onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                        className={BUSINESS_INPUT_CLASS}
                        placeholder="Madrid"
                      />
                    </div>
                    <ActivationFieldWrap fieldKey="phone" activeKey={highlightField}>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Teléfono</label>
                        <input
                          value={form.phone}
                          onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                          className={BUSINESS_INPUT_CLASS}
                          placeholder="+34 600 000 000"
                          autoFocus={step === 2 && highlightField === 'phone'}
                        />
                      </div>
                    </ActivationFieldWrap>
                  </div>

                  <ActivationFieldWrap fieldKey="address" activeKey={highlightField}>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Dirección</label>
                      <input
                        value={form.address}
                        onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                        className={BUSINESS_INPUT_CLASS}
                        placeholder="Calle Mayor 1, 28013"
                        autoFocus={step === 2 && highlightField === 'address'}
                      />
                    </div>
                  </ActivationFieldWrap>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Email empresa</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      className={BUSINESS_INPUT_CLASS}
                      placeholder="info@minegocio.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex w-full gap-3 border-t border-gray-100 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
              {isNew ? (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Atrás
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Guardando...' : isNew ? 'Crear empresa' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function TabBusinesses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    businesses,
    currentBusiness,
    switchBusiness,
    createBusiness,
    updateBusiness,
    deleteBusiness,
  } = useBusiness();
  const entitlements = useTenantEntitlements();

  const activationFocus = useMemo(
    () => new URLSearchParams(location.search).get(ACTIVATION_FOCUS_PARAM),
    [location.search],
  );

  const clearActivationFocus = useCallback(() => {
    if (!activationFocus) return;
    const nextSearch = clearActivationFocusFromSearch(location.search);
    navigate(
      { pathname: location.pathname, search: nextSearch },
      { replace: true, state: location.state },
    );
  }, [activationFocus, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!activationFocus || !currentBusiness) return;
    setEditingBusiness(currentBusiness);
  }, [activationFocus, currentBusiness?.business_id, currentBusiness]);

  const [showForm, setShowForm] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Business | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'members' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'table'>('list');

  type BusinessStats = {
    brands: number;
    stores: number;
    pdvCaja: number;
    sedes: number;
    loading: boolean;
  };
  const [businessStats, setBusinessStats] = useState<Record<string, BusinessStats>>({});

  const reloadBusinessStats = useCallback(async () => {
    if (!user || businesses.length === 0) {
      setBusinessStats({});
      return;
    }

    setBusinessStats((prev) => {
      const next: Record<string, BusinessStats> = {};
      for (const b of businesses) {
        next[b.business_id] = prev[b.business_id] || {
          brands: 0,
          stores: 0,
          pdvCaja: 0,
          sedes: 0,
          loading: true,
        };
      }
      return next;
    });

    const results = await Promise.all(
      businesses.map(async (business) => {
        const dataUserId = resolveBusinessDataUserId(user, business);
        const [brands, deliveryState] = await Promise.all([
          listBrandsRequest(business.business_id).catch(() => []),
          dataUserId
            ? loadDeliveryStores(user, business).catch(() => ({
                workCenters: [],
                pointsOfSale: [],
              }))
            : Promise.resolve({ workCenters: [], pointsOfSale: [] }),
        ]);
        const active = deliveryState.workCenters.filter((wc) => !wc.deletedAt && wc.active !== false);
        const retail = active.filter(
          (wc) => wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen',
        );
        return {
          businessId: business.business_id,
          brands: brands.filter((b) => !b.deletedAt).length,
          stores: retail.length,
          pdvCaja: deliveryState.pointsOfSale.length,
          sedes: active.length,
        };
      }),
    );

    const next: Record<string, BusinessStats> = {};
    for (const r of results) {
      next[r.businessId] = {
        brands: r.brands,
        stores: r.stores,
        pdvCaja: r.pdvCaja,
        sedes: r.sedes,
        loading: false,
      };
    }
    setBusinessStats(next);
  }, [businesses, user]);

  useEffect(() => {
    void reloadBusinessStats();
  }, [reloadBusinessStats]);

  useEffect(() => {
    const onStoresChanged = () => {
      void reloadBusinessStats();
    };
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onStoresChanged);
    return () => window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onStoresChanged);
  }, [reloadBusinessStats]);

  const filteredBusinesses = useMemo(() => {
    let result = [...businesses];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.legalName?.toLowerCase().includes(q) ||
          b.taxId?.toLowerCase().includes(q) ||
          b.city?.toLowerCase().includes(q) ||
          b.email?.toLowerCase().includes(q)
      );
    }

    if (filterType !== 'all') {
      result = result.filter((b) => b.businessType === filterType);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'members') {
        cmp = a.members.length - b.members.length;
      } else if (sortBy === 'type') {
        const labelA = ALL_BUSINESS_TYPES.find((t) => t.value === a.businessType)?.label || a.businessType;
        const labelB = ALL_BUSINESS_TYPES.find((t) => t.value === b.businessType)?.label || b.businessType;
        cmp = labelA.localeCompare(labelB);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [businesses, searchQuery, filterType, sortBy, sortOrder]);

  const activeFilterLabel = filterType === 'all'
    ? 'Todos los tipos'
    : ALL_BUSINESS_TYPES.find((t) => t.value === filterType)?.label || filterType;

  const sortLabels: Record<string, string> = { name: 'Nombre', members: 'Miembros', type: 'Tipo' };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleCreate = async (data: Partial<Business>) => {
    const result = await createBusiness({
      name: data.name || '',
      legalName: data.legalName,
      taxId: data.taxId,
      address: data.address,
      city: data.city,
      phone: data.phone,
      email: data.email,
      logo: data.logo,
      businessType: (data as Business).businessType || 'carDealership',
    });
    if (result.success) {
      setShowForm(false);
      showFeedback('success', `Empresa "${data.name}" creada correctamente`);
    } else {
      throw new Error(result.error);
    }
  };

  const handleUpdate = async (data: Partial<Business>) => {
    if (!editingBusiness) return;
    const result = await updateBusiness(editingBusiness.business_id, {
      name: data.name,
      legalName: data.legalName,
      taxId: data.taxId,
      address: data.address,
      city: data.city,
      phone: data.phone,
      email: data.email,
      logo: data.logo,
      businessType: (data as Business).businessType,
    });
    if (result.success) {
      setEditingBusiness(null);
      showFeedback('success', 'Empresa actualizada correctamente');
    } else {
      throw new Error(result.error);
    }
  };

  const openDeleteDialog = (business: Business) => {
    setDeleteTarget(business);
    setDeletePassword('');
    setDeleteError('');
    setShowDeletePassword(false);
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeletePassword('');
    setDeleteError('');
    setShowDeletePassword(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!deletePassword.trim()) {
      setDeleteError('Introduce tu contraseña para confirmar');
      return;
    }
    setDeletingId(deleteTarget.business_id);
    setDeleteError('');
    const isLastBusiness = businesses.length <= 1;
    const result = await deleteBusiness(deleteTarget.business_id, deletePassword);
    setDeletingId(null);
    if (result.success) {
      closeDeleteDialog();
      if (isLastBusiness) {
        navigate('/auth/gate', { replace: true });
      } else {
        showFeedback('success', `Empresa "${deleteTarget.name}" eliminada`);
      }
    } else {
      setDeleteError(result.error || 'Error al eliminar la empresa');
    }
  };

  const isOwner = (business: Business) => business.owner_user_id === user?.user_id;

  const openBillingForMoreBusinesses = useCallback(() => {
    if (!user?.user_id) return;
    if (entitlements.needsBusinessUpgrade) {
      writeBillingSelection(user.user_id, {
        selectedPlanId: 'pro',
        billingMode: 'monthly',
        requestedAddon: null,
      });
    } else {
      writeBillingSelection(user.user_id, {
        selectedPlanId: 'pro',
        billingMode: 'monthly',
        requestedAddon: 'extra_business',
      });
    }
    navigate('/saas/settings/facturacion');
  }, [user?.user_id, entitlements.needsBusinessUpgrade, navigate]);

  return (
    <div className="space-y-6">
      <PortfolioPlanBanner
        planLabel={entitlements.planLabel}
        planTier={entitlements.planTier}
        maxBusinesses={entitlements.businesses}
        currentBusinesses={businesses.length}
        canUsePortfolioView={businesses.length > 1 && entitlements.businesses > 1}
        portfolioLocked={businesses.length > 1 && entitlements.businesses <= 1}
        variant="settings"
      />

      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Empresa</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Razón social, CIF/NIF y tipo de actividad.
              </p>
            </div>
          </div>
          {entitlements.canCreateBusiness ? (
            <button
              type="button"
              onClick={() => {
                setShowForm(true);
                setEditingBusiness(null);
              }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Nueva empresa
            </button>
          ) : entitlements.needsBusinessUpgrade ? (
            <button
              type="button"
              onClick={openBillingForMoreBusinesses}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors bg-violet-600 hover:bg-violet-700"
            >
              <Plus className="w-4 h-4" />
              Subir a Pro
            </button>
          ) : (
            <button
              type="button"
              onClick={openBillingForMoreBusinesses}
              title={`Plan ${entitlements.planLabel}: ${businesses.length} de ${entitlements.businesses} empresas`}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" />
              Añadir empresa extra
            </button>
          )}
        </div>

        {feedback && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm border ${
              feedback.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {feedback.message}
          </div>
        )}
      </div>

      {/* Buscador, filtro y ordenación */}
      {businesses.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Buscador */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, CIF, ciudad, email..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none transition-colors focus:border-blue-500 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-gray-900"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtro por tipo */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowFilterDropdown(!showFilterDropdown); setShowSortDropdown(false); }}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors whitespace-nowrap ${
                  filterType !== 'all'
                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Filter className="w-4 h-4" />
                {activeFilterLabel}
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </button>
              {showFilterDropdown && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowFilterDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 w-64 max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl">
                    <button
                      type="button"
                      onClick={() => { setFilterType('all'); setShowFilterDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        filterType === 'all'
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      Todos los tipos
                    </button>
                    {ALL_BUSINESS_TYPES.map((bt) => (
                      <button
                        key={bt.value}
                        type="button"
                        onClick={() => { setFilterType(bt.value); setShowFilterDropdown(false); }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                          filterType === bt.value
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 flex-shrink-0 opacity-60">{bt.icon}</span>
                        {bt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Ordenar */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowSortDropdown(!showSortDropdown); setShowFilterDropdown(false); }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
              >
                <ArrowUpDown className="w-4 h-4" />
                {sortLabels[sortBy]}
                <span className="text-xs opacity-50">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </button>
              {showSortDropdown && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowSortDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl">
                    {(['name', 'members', 'type'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (sortBy === key) {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortBy(key);
                            setSortOrder('asc');
                          }
                          setShowSortDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                          sortBy === key
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {sortLabels[key]}
                        {sortBy === key && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑ Ascendente' : '↓ Descendente'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Toggle vista */}
            <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title="Vista lista"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title="Vista tabla"
              >
                <Table2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Resumen de resultados */}
          {(searchQuery || filterType !== 'all') && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>
                {filteredBusinesses.length} empresa{filteredBusinesses.length !== 1 ? 's' : ''} encontrada{filteredBusinesses.length !== 1 ? 's' : ''}
              </span>
              {(searchQuery || filterType !== 'all') && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setFilterType('all'); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lista de empresas */}
      {businesses.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Sin empresas aún</h4>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 max-w-sm mx-auto">
            Crea tu primera empresa para organizar equipos, datos y configuraciones de forma independiente.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear primera empresa
          </button>
        </div>
      ) : filteredBusinesses.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
          <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Sin resultados</h4>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            No se encontraron empresas con los filtros aplicados.
          </p>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setFilterType('all'); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar filtros
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {filteredBusinesses.map((business) => {
            const isActive = currentBusiness?.business_id === business.business_id;
            const owner = isOwner(business);
            const initials = business.name.slice(0, 2).toUpperCase();
            const isDeleting = deletingId === business.business_id;

            return (
              <div
                key={business.business_id}
                className={`bg-white dark:bg-gray-900 rounded-2xl border-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 dark:border-blue-500'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="p-5 flex items-center gap-4">
                  {/* Logo / Iniciales */}
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {business.logo ? (
                      <img src={business.logo} alt={business.name} className="w-12 h-12 object-cover rounded-xl" />
                    ) : (
                      <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{initials}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate">{business.name}</h4>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                          <Check className="w-3 h-3" />
                          Activa
                        </span>
                      )}
                      {owner && (
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-medium">
                          Propietario
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {(() => {
                        const typeInfo = ALL_BUSINESS_TYPES.find((t) => t.value === business.businessType);
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                            <span className="w-3.5 h-3.5 [&>svg]:w-3.5 [&>svg]:h-3.5">{typeInfo?.icon}</span>
                            {typeInfo?.label || business.businessType}
                          </span>
                        );
                      })()}
                      {business.legalName && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{business.legalName}</span>
                      )}
                      {business.taxId && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{business.taxId}</span>
                      )}
                      {business.city && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {business.city}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => switchBusiness(business.business_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        Seleccionar
                      </button>
                    )}
                    {owner && (
                      <>
                        <button
                          type="button"
                          onClick={() => { setEditingBusiness(business); setShowForm(false); }}
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          title="Editar empresa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteDialog(business)}
                          disabled={isDeleting}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Eliminar empresa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Stats: Marcas · Tiendas · Sedes · Miembros */}
                <div className="px-5 pb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(() => {
                      const stats = businessStats[business.business_id];
                      const loadingStats = !stats || stats.loading;
                      const items = [
                        {
                          key: 'brands',
                          label: 'Marcas',
                          icon: <Tag className="w-3.5 h-3.5" />,
                          value: stats?.brands ?? 0,
                          color: 'text-purple-600 dark:text-purple-400',
                          bg: 'bg-purple-50 dark:bg-purple-900/20',
                          border: 'border-purple-100 dark:border-purple-900/40',
                          loading: loadingStats,
                        },
                        {
                          key: 'stores',
                          label: 'Tiendas',
                          icon: <Store className="w-3.5 h-3.5" />,
                          value: stats?.stores ?? 0,
                          hint:
                            !loadingStats && stats && stats.pdvCaja < stats.stores
                              ? `${stats.pdvCaja} con PDV caja`
                              : undefined,
                          color: 'text-emerald-600 dark:text-emerald-400',
                          bg: 'bg-emerald-50 dark:bg-emerald-900/20',
                          border: 'border-emerald-100 dark:border-emerald-900/40',
                          loading: loadingStats,
                        },
                        {
                          key: 'branches',
                          label: 'Sedes',
                          icon: <Layers className="w-3.5 h-3.5" />,
                          value: stats?.sedes ?? 0,
                          color: 'text-amber-600 dark:text-amber-400',
                          bg: 'bg-amber-50 dark:bg-amber-900/20',
                          border: 'border-amber-100 dark:border-amber-900/40',
                          loading: loadingStats,
                        },
                        {
                          key: 'members',
                          label: 'Miembros',
                          icon: <Users className="w-3.5 h-3.5" />,
                          value: business.members.length,
                          color: 'text-blue-600 dark:text-blue-400',
                          bg: 'bg-blue-50 dark:bg-blue-900/20',
                          border: 'border-blue-100 dark:border-blue-900/40',
                          loading: false,
                        },
                      ];
                      return items.map((it) => (
                        <div
                          key={it.key}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${it.bg} ${it.border}`}
                        >
                          <span className={`flex-shrink-0 ${it.color}`}>{it.icon}</span>
                          <div className="min-w-0 leading-tight">
                            <div className={`text-sm font-bold ${it.color}`}>
                              {it.loading ? (
                                <span className="inline-block w-4 h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse align-middle" />
                              ) : (
                                it.value
                              )}
                            </div>
                            <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate">
                              {it.label}
                              {'hint' in it && it.hint ? ` · ${it.hint}` : ''}
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Miembros */}
                {business.members.length > 0 && (
                  <div className="px-5 pb-4 flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {business.members.slice(0, 5).map((member, idx) => (
                        <div
                          key={member.user_id}
                          className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-900 flex items-center justify-center"
                          title={member.fullName || member.user_id}
                          style={{ zIndex: 10 - idx }}
                        >
                          <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">
                            {(member.fullName || member.user_id).slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      ))}
                      {business.members.length > 5 && (
                        <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-gray-900 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">+{business.members.length - 5}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                      {business.members.map((m) => m.role).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Vista tabla */
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Empresa</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider hidden md:table-cell">CIF</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider hidden lg:table-cell">Ciudad</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider hidden md:table-cell">Marcas</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider hidden md:table-cell">Tiendas</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Miembros</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider hidden sm:table-cell">Estado</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredBusinesses.map((business) => {
                  const isActive = currentBusiness?.business_id === business.business_id;
                  const owner = isOwner(business);
                  const initials = business.name.slice(0, 2).toUpperCase();
                  const isDeleting = deletingId === business.business_id;
                  const typeInfo = ALL_BUSINESS_TYPES.find((t) => t.value === business.businessType);

                  return (
                    <tr
                      key={business.business_id}
                      className={`transition-colors ${
                        isActive
                          ? 'bg-blue-50/50 dark:bg-blue-900/10'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      {/* Empresa */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {business.logo ? (
                              <img src={business.logo} alt={business.name} className="w-8 h-8 object-cover rounded-lg" />
                            ) : (
                              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{initials}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{business.name}</div>
                            {business.legalName && (
                              <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{business.legalName}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 whitespace-nowrap">
                          <span className="w-3 h-3 [&>svg]:w-3 [&>svg]:h-3">{typeInfo?.icon}</span>
                          {typeInfo?.label || business.businessType}
                        </span>
                      </td>

                      {/* CIF */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {business.taxId ? (
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">{business.taxId}</span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>

                      {/* Ciudad */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {business.city ? (
                          <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {business.city}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>

                      {/* Marcas */}
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {(() => {
                          const stats = businessStats[business.business_id];
                          if (!stats || stats.loading) {
                            return <span className="inline-block w-5 h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />;
                          }
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs font-semibold">
                              <Tag className="w-3 h-3" />
                              {stats.brands}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Tiendas */}
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {(() => {
                          const stats = businessStats[business.business_id];
                          if (!stats || stats.loading) {
                            return <span className="inline-block w-5 h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />;
                          }
                          const pdvHint =
                            stats.pdvCaja < stats.stores
                              ? ` (${stats.pdvCaja} PDV)`
                              : '';
                          return (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold"
                              title={
                                stats.pdvCaja < stats.stores
                                  ? `${stats.pdvCaja} de ${stats.stores} tiendas tienen PDV de caja enlazado`
                                  : undefined
                              }
                            >
                              <Store className="w-3 h-3" />
                              {stats.stores}
                              {pdvHint}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Miembros */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="flex -space-x-1.5">
                            {business.members.slice(0, 3).map((member, idx) => (
                              <div
                                key={member.user_id}
                                className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 border border-white dark:border-gray-900 flex items-center justify-center"
                                title={member.fullName || member.user_id}
                                style={{ zIndex: 5 - idx }}
                              >
                                <span className="text-[8px] font-bold text-gray-600 dark:text-gray-300">
                                  {(member.fullName || member.user_id).slice(0, 1).toUpperCase()}
                                </span>
                              </div>
                            ))}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{business.members.length}</span>
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                              <Check className="w-3 h-3" />
                              Activa
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">Inactiva</span>
                          )}
                          {owner && (
                            <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px] font-medium">
                              Owner
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => switchBusiness(business.business_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors"
                            >
                              Seleccionar
                            </button>
                          )}
                          {owner && (
                            <>
                              <button
                                type="button"
                                onClick={() => { setEditingBusiness(business); setShowForm(false); }}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                title="Editar empresa"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteDialog(business)}
                                disabled={isDeleting}
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                                title="Eliminar empresa"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-800 p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">
              Cómo funciona el sistema multi-empresa
            </h4>
            <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
              <li>• Cada empresa tiene su propio equipo, datos y configuración totalmente independientes</li>
              <li>• Puedes pertenecer a varias empresas con diferentes roles y permisos en cada una</li>
              <li>• La empresa activa se muestra en la barra superior y se guarda automáticamente</li>
              <li>• Para gestionar el equipo de cada empresa, ve a la sección <strong>Equipo</strong></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <BusinessFormModal
          initial={{}}
          onSave={handleCreate}
          onClose={() => setShowForm(false)}
          isNew
        />
      )}
      {editingBusiness && (
        <BusinessFormModal
          initial={editingBusiness}
          onSave={async (data) => {
            await handleUpdate(data);
            clearActivationFocus();
          }}
          onClose={() => {
            setEditingBusiness(null);
            clearActivationFocus();
          }}
          isNew={false}
          highlightField={activationFocus}
        />
      )}

      {/* Confirmación de eliminación — mismo lenguaje visual que el modal de agenda (CalendarView) */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <DialogContent className="sm:max-w-lg max-w-lg gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl dark:bg-gray-800 [&>button]:hidden">
          <div className="sticky top-0 flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
            <div>
              <DialogTitle className="text-xl font-bold text-white">
                Eliminar empresa
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-sm text-blue-100">
                Esta acción es permanente e irreversible
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={closeDeleteDialog}
              className="rounded-lg p-2 transition-colors hover:bg-white/20"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          <div className="space-y-4 p-6">
            {deleteTarget && (
              <div className="flex items-center gap-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                  {deleteTarget.logo ? (
                    <img src={deleteTarget.logo} alt={deleteTarget.name} className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-red-700 dark:text-red-300">
                      {deleteTarget.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {deleteTarget.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {deleteTarget.members.length} miembro{deleteTarget.members.length !== 1 ? 's' : ''} ·{' '}
                    {deleteTarget.businessType === 'workshop'
                      ? 'Taller'
                      : deleteTarget.businessType === 'delivery'
                        ? 'Delivery'
                        : 'Compraventa'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="leading-relaxed">
                Se eliminarán <strong>todos los datos</strong> de esta empresa: equipo, configuración, documentos e historial. Introduce tu contraseña para confirmar.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="delete-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Contraseña de tu cuenta
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <KeyRound className="h-4 w-4" />
                </div>
                <input
                  id="delete-password"
                  type={showDeletePassword ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={(e) => {
                    setDeletePassword(e.target.value);
                    setDeleteError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDelete();
                  }}
                  placeholder="Introduce tu contraseña"
                  autoFocus
                  className={`w-full rounded-xl border-2 py-2.5 pl-10 pr-10 text-sm transition-colors focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 ${
                    deleteError
                      ? 'border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/30'
                      : 'border-gray-200 dark:border-gray-600'
                  } text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500`}
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword(!showDeletePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  tabIndex={-1}
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
              {deleteError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {deleteError}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 border-t border-gray-100 px-6 pb-6 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={closeDeleteDialog}
              className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!deletePassword.trim() || deletingId === deleteTarget?.business_id}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletingId === deleteTarget?.business_id ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Eliminando…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Eliminar empresa
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Numeración configurable ────────────────────────────────────────────

const DEFAULT_NUMBERING_CONFIG: NumberingConfig = {
  invoice: { prefix: 'FAC', year: true, separator: '-', padding: 4, counter: 0 },
  quote: { prefix: 'PRE', year: true, separator: '-', padding: 4, counter: 0 },
  contract: { prefix: 'CON', year: true, separator: '-', padding: 4, counter: 0 },
  purchase: { prefix: 'COM', year: true, separator: '-', padding: 4, counter: 0 },
  sale: { prefix: 'VTA', year: true, separator: '-', padding: 4, counter: 0 },
};

function TabNumbering() {
  const [config, setConfig] = useState<NumberingConfig>(DEFAULT_NUMBERING_CONFIG);
  const [rev, setRev] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [testingType, setTestingType] = useState<DocType | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getNumberingConfig();
      if (data.ok) {
        setConfig({ ...DEFAULT_NUMBERING_CONFIG, ...data.numbering });
        setRev(data._rev);
      } else {
        setError(data.error ?? 'Error cargando configuración');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateRule = (type: DocType, field: keyof NumberingRule, value: string | number | boolean) => {
    setConfig((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const result = await saveNumberingConfig(config, rev);
      if (result.ok) {
        setRev(result._rev);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error ?? 'Error guardando');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (type: DocType) => {
    setTestingType(type);
    try {
      const result = await getNextDocNumber(type);
      if (result.ok) {
        setTestResult((prev) => ({ ...prev, [type]: result.number }));
        setConfig((prev) => ({
          ...prev,
          [type]: { ...prev[type], counter: result.counter },
        }));
        setRev(undefined);
        void load();
      }
    } finally {
      setTestingType(null);
    }
  };

  const docTypes = Object.keys(DOC_TYPE_LABELS) as DocType[];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Hash className="w-4 h-4" /> Numeración de documentos
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Configura el prefijo, año, separador y relleno para cada tipo de documento. Ejemplo: <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">FAC-2025-0001</code>
            </p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="space-y-4">
          {docTypes.map((type) => {
            const rule = config[type];
            const preview = previewDocNumber(rule);
            const tested = testResult[type];
            return (
              <div key={type} className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{DOC_TYPE_LABELS[type]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tested && (
                      <span className="text-xs font-mono bg-green-50 border border-green-200 text-green-700 px-2.5 py-1 rounded-lg">
                        Último generado: {tested}
                      </span>
                    )}
                    <span className="text-xs font-mono bg-blue-50 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-lg">
                      Vista previa: {preview}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Prefijo</label>
                    <input
                      type="text"
                      value={rule.prefix}
                      maxLength={10}
                      onChange={(e) => updateRule(type, 'prefix', e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      placeholder="FAC"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Separador</label>
                    <input
                      type="text"
                      value={rule.separator}
                      maxLength={3}
                      onChange={(e) => updateRule(type, 'separator', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      placeholder="-"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Dígitos</label>
                    <input
                      type="number"
                      value={rule.padding}
                      min={1}
                      max={8}
                      onChange={(e) => updateRule(type, 'padding', Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Contador actual</label>
                    <input
                      type="number"
                      value={rule.counter}
                      min={0}
                      onChange={(e) => updateRule(type, 'counter', Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Año en número</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        onClick={() => updateRule(type, 'year', !rule.year)}
                        className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${rule.year ? 'bg-blue-600' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-800 shadow transition-transform ${rule.year ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{rule.year ? 'Sí' : 'No'}</span>
                    </label>
                    <button
                      onClick={() => void handleTest(type)}
                      disabled={testingType === type}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      {testingType === type ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Hash className="w-3 h-3" />}
                      Probar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          {saved && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" /> Configuración guardada
            </div>
          )}
          {!saved && <div />}
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Guardando...' : 'Guardar numeración'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-blue-800 mb-1">¿Cómo funciona?</p>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>El botón <strong>Probar</strong> genera un número real e incrementa el contador en la base de datos.</li>
          <li>El <strong>Contador actual</strong> es el último número asignado. El siguiente será <code className="font-mono">contador + 1</code>.</li>
          <li>Puedes cambiar el prefijo, separador y dígitos en cualquier momento. El contador no se reinicia.</li>
          <li>Para reiniciar la numeración anual, ajusta el contador a <code className="font-mono">0</code> manualmente.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Tab Seguridad (contraseña + verificación de email) ───────────────────────

function TabAccountSecurity() {
  const { user, updatePassword, resendVerificationEmail, refreshCurrentUser } = useAuth();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const targetEmail = user?.email || '';

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    const storedAt = localStorage.getItem(EMAIL_VERIFY_RESEND_COOLDOWN_KEY);
    if (storedAt) {
      const elapsed = Math.floor((Date.now() - Number(storedAt)) / 1000);
      const remaining = EMAIL_VERIFY_RESEND_COOLDOWN_SEC - elapsed;
      if (remaining > 0) {
        setResendState('sent');
        startCountdown(remaining);
      } else {
        localStorage.removeItem(EMAIL_VERIFY_RESEND_COOLDOWN_KEY);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCountdown]);

  useEffect(() => {
    if (!user?.user_id || user.emailVerified) return;
    const tick = () => {
      void refreshCurrentUser();
    };
    const id = window.setInterval(tick, 4000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    tick();
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [user?.user_id, user?.emailVerified, refreshCurrentUser]);

  const handleResend = async () => {
    if (!targetEmail || countdown > 0) return;
    setResendState('loading');
    setResendError('');
    const result = await resendVerificationEmail(targetEmail);
    if (result.success) {
      setResendState('sent');
      localStorage.setItem(EMAIL_VERIFY_RESEND_COOLDOWN_KEY, String(Date.now()));
      startCountdown(EMAIL_VERIFY_RESEND_COOLDOWN_SEC);
    } else {
      setResendState('error');
      const retryMatch = result.error?.match(/esperar (\d+) segundos/);
      if (retryMatch) {
        const secs = Number(retryMatch[1]);
        startCountdown(secs);
        localStorage.setItem(
          EMAIL_VERIFY_RESEND_COOLDOWN_KEY,
          String(Date.now() - (EMAIL_VERIFY_RESEND_COOLDOWN_SEC - secs) * 1000),
        );
      }
      setResendError(result.error || 'Error al reenviar el email');
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);

    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('La confirmación de la contraseña no coincide.');
      return;
    }

    const result = await updatePassword(passwordForm.currentPassword, passwordForm.newPassword);
    setPasswordMessage(
      result.success
        ? 'Contraseña actualizada. Ya puedes entrar con la nueva contraseña.'
        : result.error || 'No se pudo actualizar la contraseña.',
    );

    if (result.success) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
  };

  const handleCheckVerified = () => {
    void refreshCurrentUser();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-slate-100 dark:bg-gray-800">
          <Shield className="w-5 h-5 text-slate-700 dark:text-gray-200" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Seguridad</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Verificación del correo y contraseña de acceso.
          </p>
        </div>
      </div>

      {/* Verificación de email */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-900/25">
            <Mail className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Correo de la cuenta</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Confirma que controlas este email; es necesario para recuperar acceso y avisos importantes.
            </p>
          </div>
        </div>

        {user?.emailVerified ? (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-200">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>
              <strong className="font-semibold">Verificado.</strong> {targetEmail}
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Tu cuenta usa <strong className="text-gray-900 dark:text-gray-100">{targetEmail || 'tu email'}</strong>.
              Abre el enlace que te enviamos (válido 24 h) o pide uno nuevo.
            </p>
            <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1.5 list-disc list-inside">
              <li>Revisa spam o correo no deseado.</li>
              <li>Si ya hiciste clic en el enlace en otra pestaña, usa «Comprobar estado» o espera unos segundos.</li>
            </ul>

            {resendState === 'sent' && countdown > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-green-800 dark:text-green-200 text-sm">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Enlace enviado a <strong>{targetEmail}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  Podrás reenviar en {countdown}s
                </div>
              </div>
            ) : resendState === 'sent' && countdown <= 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-green-800 dark:text-green-200 text-sm">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Último envío completado.</span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resendState === 'loading' || !targetEmail || countdown > 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {resendState === 'loading' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : countdown > 0 ? (
                  <>
                    <Clock className="w-4 h-4" />
                    Reenvío en {countdown}s
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Reenviar enlace de verificación
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCheckVerified}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                Comprobar estado
              </button>
            </div>
            {resendState === 'error' && resendError && (
              <p className="text-sm text-red-600 dark:text-red-400">{resendError}</p>
            )}
          </div>
        )}
      </div>

      {/* Contraseña */}
      <form onSubmit={handlePasswordSubmit} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            Cambiar contraseña
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            La nueva contraseña será la que uses al iniciar sesión en la aplicación.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Contraseña actual</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                className={`${inputClassName} pl-10`}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nueva contraseña</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Repetir nueva contraseña</label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              className={inputClassName}
            />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4 text-sm text-blue-800 dark:text-blue-200">
          Tras guardar, el inicio de sesión usará exclusivamente la nueva contraseña.
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-gray-500 dark:text-gray-400">{passwordMessage || 'Mínimo 8 caracteres.'}</div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            Guardar contraseña
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── S-07: Tab Mis Dispositivos (sesiones activas) ────────────────────────────

function DeviceIcon({ device }: { device: string }) {
  if (device === 'Móvil') return <Smartphone className="w-5 h-5 text-gray-500 dark:text-gray-400" />;
  if (device === 'Tablet') return <Tablet className="w-5 h-5 text-gray-500 dark:text-gray-400" />;
  return <Monitor className="w-5 h-5 text-gray-500 dark:text-gray-400" />;
}

function TabDevices() {
  const { listSessions, revokeSession, revokeOtherSessions } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listSessions();
    setSessions(data);
    setLoading(false);
  }, [listSessions]);

  useEffect(() => { void load(); }, [load]);

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    setMessage('');
    setError('');
    const result = await revokeSession(sessionId);
    setRevoking(null);
    if (result.success) {
      setMessage('Sesión revocada correctamente.');
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    } else {
      setError(result.error || 'Error al revocar la sesión');
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    setMessage('');
    setError('');
    const result = await revokeOtherSessions();
    setRevokingAll(false);
    if (result.success) {
      setMessage('Todas las demás sesiones han sido cerradas.');
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } else {
      setError(result.error || 'Error al cerrar sesiones');
    }
  };

  function formatRelativeTime(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Ahora mismo';
    if (min < 60) return `Hace ${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `Hace ${days} día${days !== 1 ? 's' : ''}`;
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Sesiones activas
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Gestiona los dispositivos donde tu cuenta está activa. Revoca el acceso a cualquier sesión desconocida.
            </p>
          </div>
          {otherSessions.length > 0 && (
            <button
              onClick={() => void handleRevokeAll()}
              disabled={revokingAll}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              {revokingAll ? 'Cerrando...' : 'Cerrar todas las demás'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" /> {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <RefreshCw className="w-6 h-6 text-gray-300 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando sesiones...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Monitor className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No se encontraron sesiones activas</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {sessions.map((session) => (
              <div key={session.sessionId} className="flex items-center gap-4 px-6 py-4">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <DeviceIcon device={session.deviceInfo?.device || 'Escritorio'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {session.deviceInfo?.browser || 'Navegador'} en {session.deviceInfo?.os || 'Sistema'}
                    </p>
                    {session.isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 text-[11px] font-bold px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        Sesión actual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {session.deviceInfo?.device || 'Escritorio'}
                    </span>
                    {session.ipAddress && (
                      <>
                        <span className="text-gray-300 text-xs">·</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{session.ipAddress}</span>
                      </>
                    )}
                    <span className="text-gray-300 text-xs">·</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(session.lastActiveAt)}</span>
                  </div>
                </div>
                {!session.isCurrent && (
                  <button
                    onClick={() => void handleRevoke(session.sessionId)}
                    disabled={revoking === session.sessionId}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-red-200 hover:text-red-600 text-xs font-semibold text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-50"
                  >
                    {revoking === session.sessionId ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                    Cerrar sesión
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aviso de seguridad */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700">
          Si ves una sesión que no reconoces, ciérrala inmediatamente y cambia tu contraseña.
          Cada sesión muestra el dispositivo, navegador e IP de origen.
        </p>
      </div>
    </div>
  );
}

// ─── Tab Apariencia ───────────────────────────────────────────────────────────

function TabApariencia() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const businessName = currentBusiness?.name || '';
  const brandingRef = useRef<BrandingTabHandle>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const isDark = resolvedTheme === 'dark';

  const handleSetTheme = (value: string) => {
    const root = document.documentElement;
    root.classList.add('theme-transitioning');
    setTheme(value);
    window.setTimeout(() => root.classList.remove('theme-transitioning'), 350);
  };

  const options: { value: string; label: string; description: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: 'Claro',
      description: 'Interfaz con fondo blanco y texto oscuro.',
      icon: <Sun className="w-6 h-6 text-amber-500" />,
    },
    {
      value: 'dark',
      label: 'Oscuro',
      description: 'Interfaz con fondo oscuro, ideal para reducir la fatiga ocular.',
      icon: <Moon className="w-6 h-6 text-indigo-400" />,
    },
    {
      value: 'system',
      label: 'Sistema',
      description: 'Sigue la preferencia de color de tu sistema operativo.',
      icon: <Monitor className="w-6 h-6 text-gray-500 dark:text-gray-400" />,
    },
  ];

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Apariencia</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tema de la interfaz y logo de tu empresa en la app.</p>
      </div>

      {businessId ? (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Logo y colores de la empresa</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Logo global de la empresa, distinto de cada marca (Ajustes → Marca).</p>
          </div>
          <BrandingTab ref={brandingRef} businessId={businessId} businessName={businessName} embedded />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void brandingRef.current?.save()}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
            >
              Guardar logo y colores
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800">
          <Palette className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Tema de la interfaz</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Claro, oscuro o según el sistema.
          </p>
        </div>
      </div>

      {/* Theme selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tema de color</p>
          {theme === 'system' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
              {isDark ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
              Sistema activo: {isDark ? 'oscuro' : 'claro'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map((opt) => {
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSetTheme(opt.value)}
                className={[
                  'flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
                  isActive
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800/40',
                ].join(' ')}
              >
                <div className="flex w-full items-center justify-between">
                  {opt.icon}
                  {isActive && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-500">
                      <Check className="w-3 h-3 text-white" />
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{opt.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview strip */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Vista previa</p>
        <div className="grid grid-cols-2 gap-3">
          {/* Light preview */}
          <div className={`rounded-xl border-2 p-3 ${!isDark ? 'border-violet-400 ring-2 ring-violet-200' : 'border-gray-200 dark:border-gray-600'}`} style={{ backgroundColor: '#ffffff' }}>
            <div className="space-y-2">
              <div className="h-2 w-3/4 rounded" style={{ backgroundColor: '#e5e7eb' }} />
              <div className="h-2 w-1/2 rounded" style={{ backgroundColor: '#f3f4f6' }} />
              <div className="mt-2 flex gap-1.5">
                <div className="h-5 w-12 rounded-md" style={{ backgroundColor: '#111827' }} />
                <div className="h-5 w-10 rounded-md" style={{ backgroundColor: '#e5e7eb' }} />
              </div>
            </div>
            <p className="mt-2 text-[10px] font-medium" style={{ color: '#6b7280' }}>Modo claro</p>
          </div>
          {/* Dark preview */}
          <div className={`rounded-xl border-2 p-3 bg-[oklch(0.19_0_0)] ${isDark ? 'border-violet-400 ring-2 ring-violet-900' : 'border-gray-700'}`}>
            <div className="space-y-2">
              <div className="h-2 w-3/4 rounded bg-[oklch(0.33_0_0)]" />
              <div className="h-2 w-1/2 rounded bg-[oklch(0.28_0_0)]" />
              <div className="mt-2 flex gap-1.5">
                <div className="h-5 w-12 rounded-md bg-[oklch(0.93_0_0)]" />
                <div className="h-5 w-10 rounded-md bg-[oklch(0.28_0_0)]" />
              </div>
            </div>
            <p className="mt-2 text-[10px] font-medium text-gray-400">Modo oscuro</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        El tema se guarda en tu navegador. <strong>Sistema</strong> sigue la preferencia de tu dispositivo.
      </p>
      </section>
    </div>
  );
}

// ─── Settings main ────────────────────────────────────────────────────────────

export function Settings() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { tab: tabSlug } = useParams<{ tab?: string }>();
  const { user, updateProfile, listRoles, listUsers } = useAuth();
  const { parkingZones, addParkingZone, subscription } = useApp();
  const { templates, upsertTemplate, duplicateTemplate } = useDocumentTemplates();
  const { currentBusiness } = useBusiness();
  const activeTab: TabId = (tabSlug && SLUG_TO_TAB[tabSlug]) || DEFAULT_TAB;
  const setActiveTab = useCallback(
    (id: TabId) => {
      navigate(`/saas/settings/${TAB_TO_SLUG[id]}`);
    },
    [navigate],
  );

  useEffect(() => {
    if (!tabSlug) return;
    const tabId = SLUG_TO_TAB[tabSlug];
    if (!tabId) return;
    const canonical = TAB_TO_SLUG[tabId];
    if (canonical && tabSlug !== canonical) {
      navigate(`/saas/settings/${canonical}${location.search}${location.hash}`, { replace: true });
    }
  }, [tabSlug, location.search, location.hash, navigate]);

  useEffect(() => {
    if (!isBlockingSubscriptionStatus(subscription.status)) return;
    if (activeTab === 'billing') return;
    navigate('/saas/settings/facturacion', { replace: true });
  }, [subscription.status, activeTab, navigate]);

  const teamStats = useMemo(() => {
    const members = currentBusiness?.members;
    if (!members?.length) return { total: 0, invitedJoined: 0 };
    const ownerId = String(currentBusiness?.owner_user_id || '').trim();
    const total = members.length;
    const invitedJoined = ownerId
      ? members.filter((m) => String(m.user_id || '').trim() && String(m.user_id).trim() !== ownerId).length
      : Math.max(0, total - 1);
    return { total, invitedJoined };
  }, [currentBusiness?.members, currentBusiness?.owner_user_id]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [baseRoles, setBaseRoles] = useState<RoleDefinition[]>([]);
  const [customRoles, setCustomRoles] = useState<RoleDefinition[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<RoleDefinition | null>(null);
  const [isCreateZoneOpen, setIsCreateZoneOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    avatar: '',
  });
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<DocumentTemplate>(() => createEmptyDocumentTemplate());
  const [templateFeedback, setTemplateFeedback] = useState<string | null>(null);
  const [templateView, setTemplateView] = useState<'cards' | 'list' | 'table'>('cards');
  const roleScope = user?.user_id || 'guest';

  useEffect(() => {
    if (!user) {
      return;
    }

    setProfileForm({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      avatar: user.avatar || '',
    });
  }, [user]);

  const loadDirectory = async () => {
    setIsLoadingDirectory(true);
    try {
      const [nextUsers, nextRoles] = await Promise.all([listUsers(), listRoles()]);
      setUsers(nextUsers);
      setBaseRoles(nextRoles);
    } catch (error) {
      console.error('Error loading users/roles:', error);
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  useEffect(() => {
    setCustomRoles(loadCustomRoles(roleScope));
  }, [roleScope]);

  useEffect(() => {
    void loadDirectory();
  }, []);

  const currentRoleStyles = useMemo(() => roleStyles(user?.role || 'Admin'), [user?.role]);
  const roles = useMemo(() => mergeRoleCatalog(baseRoles, customRoles, users), [baseRoles, customRoles, users]);
  const customRoleIdSet = useMemo(
    () => new Set(customRoles.map((role) => role.id.trim().toLowerCase())),
    [customRoles],
  );

  const openNewTemplateDialog = () => {
    setTemplateForm(createEmptyDocumentTemplate());
    setTemplateFeedback(null);
    setIsTemplateDialogOpen(true);
  };

  const openEditTemplateDialog = (template: DocumentTemplate) => {
    setTemplateForm(template);
    setTemplateFeedback(null);
    setIsTemplateDialogOpen(true);
  };

  const handleDuplicateTemplate = (template: DocumentTemplate) => {
    duplicateTemplate(template);
    setTemplateFeedback(`Se ha duplicado la plantilla "${template.title}".`);
  };

  const handleTemplateSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedTitle = templateForm.title.trim();
    const normalizedDescription = templateForm.description.trim();
    const normalizedHtml = templateForm.html.trim();

    if (!normalizedTitle) {
      setTemplateFeedback('Añade un título para guardar la plantilla.');
      return;
    }

    if (!normalizedHtml) {
      setTemplateFeedback('El HTML de la plantilla no puede estar vacío.');
      return;
    }

    const now = new Date().toISOString();
    const nextTemplate: DocumentTemplate = {
      ...templateForm,
      title: normalizedTitle,
      description: normalizedDescription,
      html: normalizedHtml,
      updatedAt: now,
      createdAt: templateForm.createdAt || now,
    };

    const isEditing = templates.some((template) => template.id === nextTemplate.id);
    upsertTemplate(nextTemplate);
    setTemplateFeedback(`Plantilla ${isEditing ? 'actualizada' : 'creada'} correctamente.`);
    setIsTemplateDialogOpen(false);
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 500;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      setProfileForm((prev) => ({ ...prev, avatar: base64 }));
    };
    img.src = objectUrl;
  };

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileMessage(null);

    const result = await updateProfile(profileForm);
    setProfileMessage(result.success ? 'Perfil actualizado correctamente.' : result.error || 'No se pudo actualizar el perfil.');
    if (result.success) {
      await loadDirectory();
    }
  };

  const openCreateRoleModal = () => {
    setSelectedRoleForEdit(null);
    setRoleMessage(null);
    setIsRoleModalOpen(true);
  };

  const openEditRoleModal = (role: RoleDefinition) => {
    setSelectedRoleForEdit(role);
    setRoleMessage(null);
    setIsRoleModalOpen(true);
  };

  const closeRoleModal = () => {
    setIsRoleModalOpen(false);
    setSelectedRoleForEdit(null);
  };

  const handleSaveRole = (data: { id: string; description: string; permissions: string[] }) => {
    const wasEditing = Boolean(selectedRoleForEdit);
    const nextRoles = upsertCustomRole(roleScope, data);
    setCustomRoles(nextRoles);
    closeRoleModal();
    setRoleMessage(`Rol "${data.id}" ${wasEditing ? 'actualizado' : 'creado'} correctamente.`);
  };

  const handleDeleteRole = (roleId: string) => {
    const normalizedRoleId = roleId.trim().toLowerCase();
    if (!customRoleIdSet.has(normalizedRoleId)) {
      setRoleMessage(`El rol "${roleId}" no se puede eliminar porque no es personalizado.`);
      return;
    }

    const nextRoles = customRoles.filter((role) => role.id.trim().toLowerCase() !== normalizedRoleId);
    saveCustomRoles(roleScope, nextRoles);
    setCustomRoles(nextRoles);
    closeRoleModal();
    setRoleMessage(`Rol "${roleId}" eliminado correctamente.`);
  };

  const handleCreateZone = (data: { name: string; description?: string; color: string; capacity: number }) => {
    addParkingZone(data);
    setIsCreateZoneOpen(false);
    setLocationMessage(`Zona "${data.name}" creada con ${data.capacity} plazas.`);
  };

  return (
    <Layout title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <div className="mx-auto max-w-6xl space-y-6">
        <nav className="space-y-3 border-b border-gray-200 pb-4 dark:border-gray-700">
              <div
                className="flex gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none' }}
              >
                {SECTIONS.map((section) => {
                  const isActive = TAB_TO_SECTION[activeTab] === section.id;
                  const SectionIcon = section.icon;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => navigate(`/saas/settings/${TAB_TO_SLUG[section.tabs[0]]}`)}
                      className={`flex min-h-[40px] shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                      }`}
                    >
                      <SectionIcon
                        className={`h-4 w-4 shrink-0 ${isActive ? 'text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400'}`}
                      />
                      {section.label}
                    </button>
                  );
                })}
              </div>

              {(() => {
                const currentSection = SECTIONS.find((s) => s.id === TAB_TO_SECTION[activeTab]);
                if (!currentSection || currentSection.tabs.length <= 1) return null;
                return (
                  <div
                    className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    {currentSection.tabs.map((tabId) => {
                      const tab = TAB_KEYS.find((tk) => tk.id === tabId);
                      if (!tab) return null;
                      const defaultLabel = tab.label ?? (tab.i18nKey ? t(tab.i18nKey) : tab.id);
                      const usersTabMeta =
                        tab.id === 'users' && currentBusiness
                          ? `${teamStats.total} ${teamStats.total === 1 ? 'miembro' : 'miembros'} en el equipo${
                              teamStats.invitedJoined > 0
                                ? ` · ${teamStats.invitedJoined} invitación${teamStats.invitedJoined !== 1 ? 'es' : ''} aceptada${teamStats.invitedJoined !== 1 ? 's' : ''}`
                                : ''
                            }`
                          : null;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            activeTab === tab.id
                              ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                          } ${tab.id === 'users' && usersTabMeta ? 'text-left min-w-[9.5rem]' : ''}`}
                        >
                          {tab.id === 'users' && usersTabMeta ? (
                            <span className="flex flex-col items-start gap-0.5 leading-tight">
                              <span>{t('settings.tabs.users')}</span>
                              <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400 normal-case">
                                {usersTabMeta}
                              </span>
                            </span>
                          ) : (
                            defaultLabel
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
        </nav>

        {isVertialSuperAdminEmail(user?.email) && (
          <div className="rounded-xl border border-gray-200/90 bg-gray-50/95 p-1 dark:border-gray-700/90 dark:bg-gray-800/55">
            <button
              type="button"
              onClick={() => navigate('/saas/admin')}
              className={`flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                location.pathname.startsWith('/saas/admin')
                  ? 'border-l-2 border-amber-600 bg-amber-50 text-amber-900 dark:bg-amber-900/25 dark:text-amber-300'
                  : 'text-gray-700 hover:bg-white/60 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700/40 dark:hover:text-gray-100'
              }`}
            >
              <Shield
                className={`h-4 w-4 shrink-0 ${
                  location.pathname.startsWith('/saas/admin')
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              />
              <span>Panel de administración</span>
            </button>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 max-w-3xl">
            {currentBusiness && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-3 sm:px-5 sm:py-4">
                <p className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                  Equipo · {currentBusiness.name}
                </p>
                <p className="mt-1 text-xs text-emerald-900/90 dark:text-emerald-200/90 leading-relaxed">
                  Hay <span className="font-semibold">{teamStats.total}</span>{' '}
                  {teamStats.total === 1 ? 'persona con acceso' : 'personas con acceso'} al negocio (datos de miembros aceptados).
                  {teamStats.invitedJoined > 0 ? (
                    <>
                      {' '}
                      De ellas, <span className="font-semibold">{teamStats.invitedJoined}</span>{' '}
                      {teamStats.invitedJoined === 1 ? 'entró por invitación' : 'entraron por invitación'} (trabajador
                      {teamStats.invitedJoined !== 1 ? 'es' : ''} invitado
                      {teamStats.invitedJoined !== 1 ? 's' : ''}).
                    </>
                  ) : (
                    <> Invita desde Equipo para que acepten y aparezcan aquí.</>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/saas/team')}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  Ir a Equipo e invitaciones
                </button>
              </div>
            )}
            <form onSubmit={handleProfileSubmit} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">{t('settings.myUser')}</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('settings.myUserDesc')}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${currentRoleStyles.badgeBg} ${currentRoleStyles.badgeText}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${currentRoleStyles.dot}`} />
                    {user?.role || 'Admin'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-start">
                  <div className="flex flex-col items-center gap-3">
                    <label className="cursor-pointer group relative w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-gray-400 transition-all">
                      {profileForm.avatar ? (
                        <img src={profileForm.avatar} alt={user?.fullName || 'Avatar'} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-gray-600 dark:text-gray-400">{userInitials(user)}</span>
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
                    </label>
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-28">{t('settings.avatarHint')}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">{t('settings.firstName')}</label>
                      <input
                        value={profileForm.firstName}
                        onChange={(event) => setProfileForm((prev) => ({ ...prev, firstName: event.target.value }))}
                        className={inputClassName}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">{t('settings.lastName')}</label>
                      <input
                        value={profileForm.lastName}
                        onChange={(event) => setProfileForm((prev) => ({ ...prev, lastName: event.target.value }))}
                        className={inputClassName}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">{t('settings.phone')}</label>
                      <input
                        value={profileForm.phone}
                        onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
                        className={inputClassName}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Email de acceso</label>
                      <input value={user?.email || ''} readOnly className={`${inputClassName} bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400`} />
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <div className="text-sm text-gray-500 dark:text-gray-400">{profileMessage || 'Los cambios se guardan en tu cuenta de usuario.'}</div>
                  <button type="submit" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors">
                    <Save className="w-4 h-4" />
                    Guardar perfil
                  </button>
                </div>
              </form>
          </div>
        )}

        {activeTab === 'accountSecurity' && <TabAccountSecurity />}

        {activeTab === 'roles' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Roles separados de usuarios</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Cada rol muestra su descripción y cuántos usuarios lo tienen ahora mismo.</p>
              </div>
              <button
                type="button"
                onClick={openCreateRoleModal}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
              >
                <Plus className="w-4 h-4" />
                Nuevo rol
              </button>
            </div>

            {roleMessage && (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {roleMessage}
              </div>
            )}

            <div className="space-y-3">
              {roles.map((role) => {
                const styles = roleStyles(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => openEditRoleModal(role)}
                    className={`w-full flex items-center justify-between gap-4 border border-gray-200 dark:border-gray-700 border-l-4 ${styles.border} rounded-2xl p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl ${styles.badgeBg} flex items-center justify-center`}>
                        {styles.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{role.id}</p>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${styles.badgeBg} ${styles.badgeText}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                            {role.users} usuario{role.users !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{role.description}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Permisos: {formatRolePermissions(role.permissions)}</p>
                      </div>
                    </div>
                    <Edit2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'locations' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Ubicaciones y zonas</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Configura las zonas de tu concesionario</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateZoneOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Nueva zona
              </button>
            </div>

            {locationMessage && (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {locationMessage}
              </div>
            )}

            <div className="space-y-3">
              {parkingZones.map((location) => {
                const colors = ZONE_COLOR_MAP[location.color] ?? ZONE_COLOR_MAP.blue;
                return (
                <div key={location.name} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 ${colors.bg} rounded-xl flex items-center justify-center`}>
                      <MapPin className={`w-4 h-4 ${colors.light}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{location.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{location.description || `${location.capacity} plazas`}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:text-gray-400">
                    {location.capacity} plazas
                  </span>
                </div>
              );
              })}
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">Plantillas de documentos</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Crea plantillas reutilizables con HTML, descripción y variables dinámicas para toda la plataforma.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* View toggle */}
                  <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
                    {([
                      { id: 'cards', icon: LayoutGrid, label: 'Tarjetas' },
                      { id: 'list',  icon: List,        label: 'Lista' },
                      { id: 'table', icon: Table2,       label: 'Tabla' },
                    ] as const).map(({ id, icon: Icon, label }) => (
                      <button
                        key={id}
                        onClick={() => setTemplateView(id)}
                        title={label}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                          templateView === id
                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={openNewTemplateDialog}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Nueva plantilla
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4 mb-6">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-500">Repositorio común</p>
                  <p className="mt-2 text-sm text-blue-900">
                    Las plantillas se guardan con `scope`, `título`, `descripción` y `html`, para poder reutilizarlas después en ventas,
                    entregas, facturación u otros módulos.
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Variables listas</p>
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                    Dispones de {DOCUMENT_TEMPLATE_VARIABLES.length} variables base de empresa, cliente, vehículo y venta para auto-rellenado.
                  </p>
                </div>
              </div>

              {templateFeedback && (
                <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {templateFeedback}
                </div>
              )}

              {/* ── Vista tarjetas ─────────────────────────────────────────── */}
              {templateView === 'cards' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {templates.map((template) => {
                    const previewHtml = buildTemplatePreview(template.html);
                    const variableMatches = template.html.match(/\{\{[^}]+\}\}/g);
                    const variableCount = variableMatches ? new Set(variableMatches).size : 0;

                    return (
                      <div key={template.id} className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-gray-800 p-5">
                          <div className="flex items-start gap-3">
                            <div className="w-11 h-11 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                              <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{template.title}</p>
                                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                                  {templateScopeLabel(template.scope)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {template.description || 'Sin descripción. Añade contexto para saber dónde usarla.'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Variables</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{variableCount}</p>
                          </div>
                        </div>

                        <div className="space-y-4 p-5">
                          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                              <Eye className="w-3.5 h-3.5" />
                              Vista previa
                            </div>
                            <div className="max-h-44 overflow-auto rounded-xl bg-white dark:bg-gray-800 p-4 text-sm text-gray-700 dark:text-gray-300">
                              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 text-xs text-gray-400 dark:text-gray-500">
                            <span>Actualizada {new Date(template.updatedAt).toLocaleDateString('es-ES')}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditTemplateDialog(template)}
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                              >
                                <Edit2 className="w-4 h-4" />
                                Editar
                              </button>
                              <button
                                onClick={() => handleDuplicateTemplate(template)}
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                              >
                                <Copy className="w-4 h-4" />
                                Duplicar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Vista lista ────────────────────────────────────────────── */}
              {templateView === 'list' && (
                <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {templates.map((template) => {
                    const variableMatches = template.html.match(/\{\{[^}]+\}\}/g);
                    const variableCount = variableMatches ? new Set(variableMatches).size : 0;

                    return (
                      <div key={template.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4.5 h-4.5 text-gray-500 dark:text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{template.title}</p>
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 flex-shrink-0">
                              {templateScopeLabel(template.scope)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                            {template.description || 'Sin descripción'}
                          </p>
                        </div>
                        <div className="text-center flex-shrink-0 hidden sm:block">
                          <p className="text-xs text-gray-400 dark:text-gray-500">Variables</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{variableCount}</p>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 hidden md:block">
                          {new Date(template.updatedAt).toLocaleDateString('es-ES')}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => openEditTemplateDialog(template)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDuplicateTemplate(template)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                            title="Duplicar"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Vista tabla ────────────────────────────────────────────── */}
              {templateView === 'table' && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-5 py-3">Título</th>
                        <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Ámbito</th>
                        <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Descripción</th>
                        <th className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Vars.</th>
                        <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Actualizada</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {templates.map((template) => {
                        const variableMatches = template.html.match(/\{\{[^}]+\}\}/g);
                        const variableCount = variableMatches ? new Set(variableMatches).size : 0;

                        return (
                          <tr key={template.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                                </div>
                                <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[160px]">{template.title}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 hidden sm:table-cell">
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                                {templateScopeLabel(template.scope)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 hidden md:table-cell">
                              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px] block">
                                {template.description || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{variableCount}</span>
                            </td>
                            <td className="px-4 py-3.5 hidden lg:table-cell">
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {new Date(template.updatedAt).toLocaleDateString('es-ES')}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openEditTemplateDialog(template)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDuplicateTemplate(template)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 transition-colors hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-600"
                                  title="Duplicar"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Dialog
              open={isTemplateDialogOpen}
              onOpenChange={(nextOpen) => {
                setIsTemplateDialogOpen(nextOpen);
                if (!nextOpen) {
                  setTemplateFeedback(null);
                }
              }}
            >
              <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
                <form onSubmit={handleTemplateSubmit}>
                  <DialogHeader className="border-b border-gray-100 dark:border-gray-800 px-6 py-5">
                    <DialogTitle>{templates.some((template) => template.id === templateForm.id) ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
                    <DialogDescription>
                      Define el título, la descripción funcional y el HTML base para reutilizar esta plantilla en distintos módulos.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 px-6 py-5">
                    {templateFeedback && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {templateFeedback}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Título</label>
                        <input
                          value={templateForm.title}
                          onChange={(event) => setTemplateForm((prev) => ({ ...prev, title: event.target.value }))}
                          className={inputClassName}
                          placeholder="Ej. Contrato premium de venta"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Disponible en</label>
                        <select
                          value={templateForm.scope}
                          onChange={(event) =>
                            setTemplateForm((prev) => ({
                              ...prev,
                              scope: event.target.value as DocumentTemplate['scope'],
                            }))
                          }
                          className={inputClassName}
                        >
                          {DOCUMENT_TEMPLATE_SCOPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label} · {option.helper}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Descripción</label>
                      <textarea
                        value={templateForm.description}
                        onChange={(event) => setTemplateForm((prev) => ({ ...prev, description: event.target.value }))}
                        className={`${inputClassName} min-h-24`}
                        placeholder="Explica para qué sirve la plantilla y en qué flujo debe aparecer."
                      />
                    </div>

                    <WysiwygTemplateEditor
                      value={templateForm.html}
                      onChange={(html) => setTemplateForm((prev) => ({ ...prev, html }))}
                      variables={DOCUMENT_TEMPLATE_VARIABLES}
                    />
                  </div>

                  <DialogFooter className="border-t border-gray-100 dark:border-gray-800 px-6 py-5">
                    <button
                      type="button"
                      onClick={() => setIsTemplateDialogOpen(false)}
                      className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
                    >
                      <Save className="w-4 h-4" />
                      Guardar plantilla
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}

        {activeTab === 'businesses' && <TabBusinesses />}

        {activeTab === 'brands' && <CompanyMarcaSettings />}

        {activeTab === 'integrations' && <IntegrationsPanel />}

        {activeTab === 'billing' && <TabBilling />}

        {activeTab === 'numbering' && <TabNumbering />}

        {activeTab === 'devices' && <TabDevices />}

        {activeTab === 'pipeline' && user && (
          <PipelineConfigTab userId={user.user_id} />
        )}

        {activeTab === 'emails' && user && (
          <EmailTemplatesTab userId={user.user_id} />
        )}

        {activeTab === 'horarios' && user && (
          <BusinessHoursTab userId={user.user_id} />
        )}

        {activeTab === 'datos' && user && (
          <DataPortabilityTab userId={user.user_id} />
        )}

        {activeTab === 'alertas' && currentBusiness && (
          <AlertsTab businessId={currentBusiness.business_id} />
        )}

        {activeTab === 'misNotificaciones' && <MyNotificationsTab />}

        {activeTab === 'apariencia' && <TabApariencia />}

        {activeTab === 'salesPoints' && <CompanyTiendaSettings />}

        {activeTab === 'tpvPrinter' && <TpvPrinterSettingsTab />}
      </div>

      <CreateRoleModal
        isOpen={isRoleModalOpen}
        onClose={closeRoleModal}
        onCreate={handleSaveRole}
        mode={selectedRoleForEdit ? 'edit' : 'create'}
        initialRole={selectedRoleForEdit}
        onDelete={handleDeleteRole}
        canDelete={selectedRoleForEdit ? customRoleIdSet.has(selectedRoleForEdit.id.trim().toLowerCase()) : false}
        existingRoleIds={roles.map((role) => role.id)}
      />
      <SAAS__CreateZoneModal
        isOpen={isCreateZoneOpen}
        onClose={() => setIsCreateZoneOpen(false)}
        onCreate={handleCreateZone}
      />
    </Layout>
  );
}