import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  Building2,
  Store,
  Users,
  Shield,
  Layers,
  LayoutGrid,
  Monitor,
  Mail,
  Upload,
  Settings,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ArrowRight,
  Clock,
  CreditCard,
  FileText,
  Eye,
  BarChart3,
  UserCheck,
  Briefcase,
  CalendarDays,
  Receipt,
  Truck,
  Wallet,
  FolderOpen,
  ScanLine,
  MapPin,
  Zap,
  CircleDot,
  Info,
  ExternalLink,
  X,
  RefreshCw,
} from 'lucide-react';
import type { Business, BusinessType } from '../../lib/businessApi';
import { listWorkCenters, type WorkCenter } from '../../lib/workCentersApi';
import {
  getModulesConfig,
  saveModulesConfig,
  getInvoiceEmailConfig,
  saveInvoiceEmailConfig,
  getInitialImportStatus,
  saveInitialImportStatus,
  type ModulesConfig,
  type InvoiceEmailConfig,
  type InitialImportData,
} from '../../lib/configApi';
import { toast } from 'sonner';

// ─── Module definitions ────────────────────────────────────────────────────────

const MODULE_DEFS = [
  { id: 'dashboard',     label: 'Dashboard',              icon: BarChart3,    category: 'core' },
  { id: 'crm',           label: 'CRM / Clientes',         icon: Users,        category: 'core' },
  { id: 'catalog',       label: 'Catálogo',               icon: LayoutGrid,   category: 'core' },
  { id: 'stock',         label: 'Compras y Stock',        icon: Truck,        category: 'operations' },
  { id: 'sales',         label: 'Ventas',                 icon: Receipt,      category: 'operations' },
  { id: 'suppliers',     label: 'Proveedores',            icon: Briefcase,    category: 'operations' },
  { id: 'invoices',      label: 'Facturas Proveedor',     icon: FileText,     category: 'finance' },
  { id: 'finance',       label: 'Finanzas',               icon: Wallet,       category: 'finance' },
  { id: 'documents',     label: 'Documentación',          icon: FolderOpen,   category: 'core' },
  { id: 'ocr',           label: 'OCR',                    icon: ScanLine,     category: 'advanced' },
  { id: 'team',          label: 'Equipo',                 icon: Users,        category: 'hr' },
  { id: 'clockins',      label: 'Fichajes',               icon: Clock,        category: 'hr' },
  { id: 'schedules',     label: 'Horarios y Vacaciones',  icon: CalendarDays, category: 'hr' },
  { id: 'payroll',       label: 'Nóminas y Documentos',   icon: FileText,     category: 'hr' },
  { id: 'tpv',           label: 'TPV',                    icon: Monitor,      category: 'advanced' },
] as const;

type ModuleId = (typeof MODULE_DEFS)[number]['id'];

// ─── Vertical labels ───────────────────────────────────────────────────────────

const VERTICAL_LABELS: Record<BusinessType, string> = {
  events: 'Eventos',
  carDealership: 'Compraventa de vehículos',
  workshop: 'Taller mecánico',
  delivery: 'Delivery / Montajes',
  cleaning: 'Limpieza',
  hairSalon: 'Peluquería / Estética',
  gym: 'Gimnasio',
  clinic: 'Clínica',
  hotel: 'Hotel',
  construction: 'Construcción',
  academy: 'Academia',
  realEstate: 'Inmobiliaria',
  lawyer: 'Abogado / Despacho',
  nightclub: 'Discoteca / Ocio nocturno',
  scrapyard: 'Desguace',
  spareParts: 'Recambios',
  taxi: 'Taxi / VTC',
  pharmacy: 'Farmacia',
  carWash: 'Lavadero de coches',
  vet: 'Veterinaria',
  tobaccoShop: 'Estanco',
  butcherShop: 'Carnicería',
};

// ─── Config status helpers ─────────────────────────────────────────────────────

type BlockStatus = 'complete' | 'partial' | 'empty';

function statusBadge(status: BlockStatus) {
  switch (status) {
    case 'complete':
      return { label: 'Configurado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800', dot: 'bg-emerald-500' };
    case 'partial':
      return { label: 'Incompleto', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800', dot: 'bg-amber-500' };
    case 'empty':
      return { label: 'Pendiente', color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800', dot: 'bg-red-500' };
  }
}

function getEmpresaStatus(biz: Business | null): BlockStatus {
  if (!biz) return 'empty';
  const fields = [biz.name, biz.taxId, biz.address, biz.phone, biz.email];
  const filled = fields.filter((f) => f && f.trim().length > 0).length;
  if (filled === fields.length) return 'complete';
  if (filled > 0) return 'partial';
  return 'empty';
}

function getSedesStatus(count: number): BlockStatus {
  if (count >= 1) return 'complete';
  return 'empty';
}

function getUsuariosStatus(biz: Business | null): BlockStatus {
  if (!biz) return 'empty';
  if (biz.members.length >= 2) return 'complete';
  if (biz.members.length === 1) return 'partial';
  return 'empty';
}

function getPermisosStatus(biz: Business | null): BlockStatus {
  if (!biz || biz.members.length === 0) return 'empty';
  const withPerms = biz.members.filter((m) => Object.keys(m.permissions).length > 0);
  if (withPerms.length === biz.members.length) return 'complete';
  if (withPerms.length > 0) return 'partial';
  return 'empty';
}

function getVerticalStatus(biz: Business | null): BlockStatus {
  if (!biz) return 'empty';
  return biz.businessType ? 'complete' : 'empty';
}

function getModulosStatus(biz: Business | null): BlockStatus {
  if (!biz) return 'empty';
  const active = biz.activeModules?.length ?? 0;
  if (active >= 3) return 'complete';
  if (active > 0) return 'partial';
  return 'empty';
}

function getImportStatus(biz: Business | null): BlockStatus {
  if (!biz || !biz.initialImportStatus) return 'empty';
  const s = biz.initialImportStatus;
  const vals = [s.stock, s.clients, s.catalog];
  if (vals.every((v) => v === 'completed')) return 'complete';
  if (vals.some((v) => v === 'completed')) return 'partial';
  if (vals.some((v) => v === 'skipped')) return 'partial';
  return 'empty';
}

// ─── System alert engine ───────────────────────────────────────────────────────

interface SystemAlert {
  id: string;
  type: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  action: string;
  route: string;
}

function computeAlerts(biz: Business | null, subscription: { status: string }): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  if (!biz) return alerts;

  if (biz.members.some((m) => Object.keys(m.permissions).length === 0)) {
    const users = biz.members.filter((m) => Object.keys(m.permissions).length === 0);
    alerts.push({
      id: 'user-no-perms',
      type: 'medium',
      message: `${users.length} usuario(s) sin permisos asignados`,
      action: 'Asignar permisos',
      route: '/saas/settings/roles',
    });
  }

  if (['trial_expired', 'payment_failed', 'suspended'].includes(subscription.status)) {
    alerts.push({
      id: 'plan-expired',
      type: 'critical',
      message: subscription.status === 'payment_failed' ? 'Error en el pago de tu plan' : 'Tu plan ha expirado',
      action: 'Renovar plan',
      route: '/saas/settings/facturacion',
    });
  } else if (['trial_expiring', 'grace_period'].includes(subscription.status)) {
    alerts.push({
      id: 'plan-expiring',
      type: 'high',
      message: 'Tu plan expira pronto',
      action: 'Revisar plan',
      route: '/saas/settings/facturacion',
    });
  }

  if (biz.onboardingImportPending) {
    const pending: string[] = [];
    if (biz.initialImportStatus?.stock === 'pending') pending.push('stock');
    if (biz.initialImportStatus?.clients === 'pending') pending.push('clientes');
    if (biz.initialImportStatus?.catalog === 'pending') pending.push('catálogo');
    if (pending.length > 0) {
      alerts.push({
        id: 'import-pending',
        type: 'low',
        message: `Importación inicial pendiente: ${pending.join(', ')}`,
        action: 'Completar importación',
        route: '#importacion',
      });
    }
  }

  const requiredFields = [
    { key: 'name', label: 'nombre de empresa' },
    { key: 'taxId', label: 'CIF/NIF' },
    { key: 'address', label: 'dirección' },
  ] as const;
  const missing = requiredFields.filter((f) => !((biz as Record<string, unknown>)[f.key] as string)?.trim());
  if (missing.length > 0) {
    alerts.push({
      id: 'config-incomplete',
      type: 'critical',
      message: `Configuración obligatoria incompleta: falta ${missing.map((m) => m.label).join(', ')}`,
      action: 'Completar datos',
      route: '/saas/settings/empresas',
    });
  }

  return alerts;
}

const ALERT_STYLES: Record<SystemAlert['type'], { bg: string; icon: string; border: string }> = {
  critical: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  high: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  medium: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  low: { bg: 'bg-gray-50 dark:bg-gray-800', icon: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700' },
};

// ─── Connection panel definitions ──────────────────────────────────────────────

const CONNECTIONS = [
  { id: 'dashboard',        label: 'Dashboard',              icon: BarChart3,    path: '/saas/dashboard' },
  { id: 'crm',              label: 'CRM / Clientes',         icon: Users,        path: '/saas/clients' },
  { id: 'team',             label: 'Equipo',                 icon: UserCheck,    path: '/saas/team' },
  { id: 'clockins',         label: 'Fichajes',               icon: Clock,        path: '/saas/clockins' },
  { id: 'schedules',        label: 'Horarios y Vacaciones',  icon: CalendarDays, path: '/saas/schedules' },
  { id: 'payroll',          label: 'Nóminas y Documentos',   icon: FileText,     path: '/saas/payroll' },
  { id: 'stock',            label: 'Compras y Stock',        icon: Truck,        path: '/saas/catalog' },
  { id: 'suppliers',        label: 'Proveedores',            icon: Briefcase,    path: '/saas/suppliers' },
  { id: 'invoices',         label: 'Facturas Proveedor',     icon: Receipt,      path: '/saas/supplier-billing' },
  { id: 'finance',          label: 'Finanzas',               icon: Wallet,       path: '/saas/finance' },
  { id: 'documents',        label: 'Documentación',          icon: FolderOpen,   path: '/saas/documents' },
  { id: 'ocr',              label: 'OCR',                    icon: ScanLine,     path: '/saas/documents' },
  { id: 'tpv',              label: 'TPV',                    icon: Monitor,      path: '/saas/tpv' },
  { id: 'onboarding',       label: 'Onboarding',             icon: Zap,          path: '/saas/configuracion' },
] as const;

// ─── Main component ────────────────────────────────────────────────────────────

export function ConfiguracionGeneral() {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const { user, listUsers } = useAuth();
  const { subscription } = useApp();

  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loadingCenters, setLoadingCenters] = useState(true);
  const [teamCount, setTeamCount] = useState(0);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [modulesData, setModulesData] = useState<ModulesConfig | null>(null);
  const [invoiceEmailData, setInvoiceEmailData] = useState<InvoiceEmailConfig | null>(null);
  const [importData, setImportData] = useState<InitialImportData | null>(null);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const biz = currentBusiness;
  const bizId = biz?.business_id;

  useEffect(() => {
    if (!user?.id) return;
    setLoadingCenters(true);
    listWorkCenters(user.id)
      .then((centers) => setWorkCenters(centers))
      .catch(() => {})
      .finally(() => setLoadingCenters(false));
  }, [user?.id]);

  useEffect(() => {
    listUsers()
      .then((members) => setTeamCount(members.length))
      .catch(() => setTeamCount(0));
  }, [listUsers]);

  useEffect(() => {
    if (!bizId) return;
    getModulesConfig(bizId).then(setModulesData).catch(() => {});
    getInvoiceEmailConfig(bizId).then(setInvoiceEmailData).catch(() => {});
    getInitialImportStatus(bizId).then(setImportData).catch(() => {});
  }, [bizId]);

  const handleToggleModule = useCallback(async (moduleId: string) => {
    if (!bizId || !modulesData) return;
    setTogglingModule(moduleId);
    const current = modulesData.activeModules;
    const next = current.includes(moduleId)
      ? current.filter((m) => m !== moduleId)
      : [...current, moduleId];
    try {
      await saveModulesConfig(bizId, next);
      setModulesData((prev) => prev ? { ...prev, activeModules: next } : prev);
      toast.success(next.includes(moduleId) ? 'Modulo activado' : 'Modulo desactivado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar modulos');
    } finally {
      setTogglingModule(null);
    }
  }, [bizId, modulesData]);

  const handleCopyEmail = useCallback(() => {
    const email = invoiceEmailData?.email || `facturas-${bizId || 'xxx'}@udaredge.com`;
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      toast.success('Email copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [invoiceEmailData, bizId]);

  const handleToggleInvoiceEmail = useCallback(async () => {
    if (!bizId || !invoiceEmailData) return;
    try {
      const next = !invoiceEmailData.enabled;
      await saveInvoiceEmailConfig(bizId, { enabled: next });
      setInvoiceEmailData((prev) => prev ? { ...prev, enabled: next } : prev);
      toast.success(next ? 'Recepcion de facturas activada' : 'Recepcion de facturas desactivada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar');
    }
  }, [bizId, invoiceEmailData]);

  const dismissAlert = useCallback((id: string) => {
    setDismissedAlerts((prev) => new Set([...prev, id]));
  }, []);

  const alerts = useMemo(
    () => computeAlerts(biz, subscription).filter((a) => !dismissedAlerts.has(a.id)),
    [biz, subscription, dismissedAlerts],
  );

  const activeCenters = workCenters.filter((c) => c.active);

  const activeModulesSet = useMemo(() => new Set(modulesData?.activeModules ?? biz?.activeModules ?? []), [modulesData, biz]);
  const contractedModulesSet = useMemo(() => new Set(modulesData?.contractedModules ?? biz?.contractedModules ?? []), [modulesData, biz]);

  const blocks = useMemo(() => [
    {
      id: 'empresa',
      icon: Building2,
      title: 'Empresa',
      description: biz?.name ? `${biz.name}${biz.taxId ? ` · ${biz.taxId}` : ''}` : 'Configura los datos de tu empresa',
      status: getEmpresaStatus(biz),
      route: '/saas/settings/empresas',
      stats: biz ? `${[biz.name, biz.taxId, biz.address, biz.phone, biz.email].filter((f) => f?.trim()).length}/5 campos` : '0/5 campos',
    },
    {
      id: 'sedes',
      icon: Store,
      title: 'Sedes / PDV',
      description: activeCenters.length > 0 ? `${activeCenters.length} centro(s) activo(s)` : 'Configura tus centros de trabajo',
      status: getSedesStatus(activeCenters.length),
      route: '/saas/settings/centros-de-trabajo',
      stats: `${activeCenters.length} activos`,
    },
    {
      id: 'usuarios',
      icon: Users,
      title: 'Usuarios',
      description: teamCount > 0 ? `${teamCount} miembro(s) en el equipo` : 'Invita a tu equipo',
      status: getUsuariosStatus(biz),
      route: '/saas/settings/usuarios',
      stats: `${teamCount} usuarios`,
    },
    {
      id: 'permisos',
      icon: Shield,
      title: 'Permisos',
      description: 'Gestión de roles y permisos por módulo',
      status: getPermisosStatus(biz),
      route: '/saas/settings/roles',
      stats: biz ? `${biz.members.filter((m) => Object.keys(m.permissions).length > 0).length}/${biz.members.length} con permisos` : '—',
    },
    {
      id: 'vertical',
      icon: Layers,
      title: 'Vertical activa',
      description: biz?.businessType ? VERTICAL_LABELS[biz.businessType] || biz.businessType : 'Selecciona tu tipo de negocio',
      status: getVerticalStatus(biz),
      route: '/saas/settings/empresas',
      stats: biz?.businessType ? VERTICAL_LABELS[biz.businessType] : 'Sin asignar',
    },
    {
      id: 'modulos',
      icon: LayoutGrid,
      title: 'Módulos activos',
      description: `${modulesData?.activeModules?.length ?? biz?.activeModules?.length ?? 0} modulo(s) activado(s)`,
      status: (modulesData?.activeModules?.length ?? biz?.activeModules?.length ?? 0) >= 3 ? 'complete' as BlockStatus : (modulesData?.activeModules?.length ?? biz?.activeModules?.length ?? 0) > 0 ? 'partial' as BlockStatus : 'empty' as BlockStatus,
      route: '#modulos',
      stats: `${modulesData?.activeModules?.length ?? biz?.activeModules?.length ?? 0} activos`,
    },
    {
      id: 'tpv',
      icon: Monitor,
      title: 'Configuración TPV',
      description: 'Terminal punto de venta',
      status: (activeModulesSet.has('tpv') ? 'complete' : 'empty') as BlockStatus,
      route: '#tpv-config',
      stats: activeModulesSet.has('tpv') ? 'Activo' : 'Inactivo',
      hidden: !activeModulesSet.has('tpv') && !contractedModulesSet.has('tpv'),
    },
    {
      id: 'correo-facturas',
      icon: Mail,
      title: 'Correo recepción facturas',
      description: invoiceEmailData?.email || 'Configura tu email de recepcion',
      status: (invoiceEmailData?.enabled ? 'complete' : 'empty') as BlockStatus,
      route: '#correo-facturas',
      stats: invoiceEmailData?.enabled ? 'Activo' : 'Pendiente',
    },
    {
      id: 'importacion',
      icon: Upload,
      title: 'Importación inicial',
      description: (importData?.onboardingImportPending ?? biz?.onboardingImportPending) ? 'Tienes importaciones pendientes' : 'Datos iniciales importados',
      status: (() => {
        const s = importData || biz?.initialImportStatus;
        if (!s) return 'empty' as BlockStatus;
        const vals = [s.stock, s.clients, s.catalog];
        if (vals.every((v) => v === 'completed')) return 'complete' as BlockStatus;
        if (vals.some((v) => v === 'completed' || v === 'skipped')) return 'partial' as BlockStatus;
        return 'empty' as BlockStatus;
      })(),
      route: '#importacion',
      stats: (() => {
        const s = importData || biz?.initialImportStatus;
        if (!s) return '0/3';
        return `${[s.stock, s.clients, s.catalog].filter((v) => v === 'completed').length}/3 completados`;
      })(),
    },
  ], [biz, activeCenters, teamCount, modulesData, invoiceEmailData, importData, activeModulesSet, contractedModulesSet]);

  const visibleBlocks = blocks.filter((b) => !('hidden' in b && b.hidden));

  const completedCount = visibleBlocks.filter((b) => b.status === 'complete').length;
  const totalCount = visibleBlocks.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
              Configuración General
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Gestiona los parámetros globales y prepara tu cuenta para trabajar
            </p>
          </div>

          {/* Progress ring */}
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4"
                  className="text-gray-200 dark:text-gray-700" />
                <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4"
                  strokeDasharray={`${(completionPct / 100) * 175.93} 175.93`}
                  strokeLinecap="round"
                  className={completionPct === 100 ? 'text-emerald-500' : 'text-blue-500'} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-gray-900 dark:text-gray-100">
                {completionPct}%
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{completedCount}/{totalCount} bloques</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">configuración completada</p>
            </div>
          </div>
        </div>

        {/* ── System alerts ──────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((alert) => {
              const style = ALERT_STYLES[alert.type];
              return (
                <div key={alert.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${style.bg} ${style.border}`}>
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${style.icon}`} />
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{alert.message}</p>
                  <button
                    onClick={() => navigate(alert.route)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    {alert.action}
                  </button>
                  <button onClick={() => dismissAlert(alert.id)} className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Config blocks grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleBlocks.map((block) => {
            const badge = statusBadge(block.status);
            const Icon = block.icon;
            return (
              <button
                key={block.id}
                onClick={() => {
                  if (block.route.startsWith('#')) {
                    document.getElementById(block.route.slice(1))?.scrollIntoView({ behavior: 'smooth' });
                    return;
                  }
                  navigate(block.route);
                }}
                className="group relative text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 transition-all hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    block.status === 'complete'
                      ? 'bg-emerald-50 dark:bg-emerald-900/30'
                      : block.status === 'partial'
                        ? 'bg-amber-50 dark:bg-amber-900/30'
                        : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <Icon className={`w-5 h-5 ${
                      block.status === 'complete'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : block.status === 'partial'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-gray-500 dark:text-gray-400'
                    }`} />
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badge.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    {badge.label}
                  </span>
                </div>

                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-0.5">{block.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{block.description}</p>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">{block.stats}</span>
                  {!block.route.startsWith('#') && (
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                  )}
                </div>

                {block.status === 'complete' && (
                  <div className="absolute top-3 right-3 w-2 h-2 bg-emerald-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Módulos activos (inline panel) ─────────────────────────────── */}
        <section id="modulos" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Módulos activos</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Activa o desactiva los módulos disponibles en tu plan
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULE_DEFS.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeModulesSet.has(mod.id);
              const isContracted = contractedModulesSet.size === 0 || contractedModulesSet.has(mod.id);
              const isToggling = togglingModule === mod.id;
              return (
                <div key={mod.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    isActive
                      ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20'
                      : isContracted
                        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        : 'border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-900/40'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                      {mod.label}
                    </p>
                    {!isContracted && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">No incluido en tu plan</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => isContracted && handleToggleModule(mod.id)}
                    disabled={!isContracted || isToggling}
                    className={`w-9 h-5 rounded-full flex items-center transition-colors ${
                      isActive ? 'bg-blue-500 justify-end' : 'bg-gray-300 dark:bg-gray-600 justify-start'
                    } ${!isContracted ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${isToggling ? 'animate-pulse' : ''}`}
                  >
                    <span className="w-4 h-4 bg-white rounded-full shadow-sm mx-0.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Correo recepción facturas ───────────────────────────────────── */}
        <section id="correo-facturas" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
              <Mail className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Correo recepción de facturas</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Envía o reenvía facturas de proveedores a esta dirección para procesarlas automáticamente
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tu email de recepcion</p>
              <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 truncate">
                {invoiceEmailData?.email || `facturas-${bizId || 'xxx'}@udaredge.com`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleInvoiceEmail}
                className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                  invoiceEmailData?.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  invoiceEmailData?.enabled ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </button>
              <button
                onClick={handleCopyEmail}
                className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-bold hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
              >
                {copied ? 'Copiado!' : 'Copiar email'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Info className="w-4 h-4 text-gray-400 shrink-0" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Las facturas recibidas se procesaran automaticamente con OCR y apareceran en tu bandeja de facturas de proveedor.
            </p>
          </div>
        </section>

        {/* ── Importación inicial ─────────────────────────────────────────── */}
        <section id="importacion" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <Upload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Importación inicial</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sube tus datos iniciales para empezar a trabajar con información real
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { key: 'stock' as const, label: 'Stock', desc: 'Archivo de existencias iniciales', icon: Truck, route: '/saas/catalog' },
              { key: 'clients' as const, label: 'Clientes', desc: 'Base de datos de clientes', icon: Users, route: '/saas/clients' },
              { key: 'catalog' as const, label: 'Catalogo', desc: 'Productos o servicios', icon: LayoutGrid, route: '/saas/catalog' },
            ]).map((item) => {
              const importStatus = importData?.[item.key] ?? biz?.initialImportStatus?.[item.key] ?? 'pending';
              const Icon = item.icon;
              return (
                <div key={item.key}
                  className={`p-4 rounded-xl border transition-all ${
                    importStatus === 'completed'
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                      : importStatus === 'skipped'
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                        : 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${
                      importStatus === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'
                    }`} />
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{item.label}</span>
                    {importStatus === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 ml-auto" />}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{item.desc}</p>
                  {importStatus === 'completed' ? (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Completado</span>
                  ) : (
                    <button
                      onClick={() => navigate(item.route)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Upload className="w-3 h-3" />
                      {importStatus === 'skipped' ? 'Retomar importación' : 'Subir archivo'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Configuracion TPV (condicional) ─────────────────────────────── */}
        {activeModulesSet.has('tpv') && (
          <section id="tpv-config" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-gray-900 dark:text-gray-100">Configuracion TPV</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Terminal punto de venta — configura metodos de pago, impuestos y tickets
                </p>
              </div>
              <button
                onClick={() => navigate('/saas/tpv')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                Ir al TPV
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { label: 'Punto de venta', desc: 'Selecciona tu PDV por defecto', icon: Store },
                { label: 'Metodos de pago', desc: 'Efectivo, tarjeta, Bizum, transferencia', icon: CreditCard },
                { label: 'Impuestos (IVA)', desc: 'Tipo de IVA por defecto', icon: Receipt },
                { label: 'Numeracion tickets', desc: 'Formato y serie de tickets', icon: FileText },
                { label: 'Impresora', desc: 'Impresora de tickets conectada', icon: Settings },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.label}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Config de importacion ───────────────────────────────────────── */}
        <section id="import-config" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Reglas de importacion</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Define como se procesan los archivos de importacion
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Duplicados
              </label>
              <select className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none">
                <option value="ignore">Ignorar duplicados</option>
                <option value="overwrite">Sobrescribir existentes</option>
                <option value="create_new">Crear como nuevo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Formato de fecha
              </label>
              <select className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none">
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Separador CSV
              </label>
              <select className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none">
                <option value=";">Punto y coma (;)</option>
                <option value=",">Coma (,)</option>
                <option value="\t">Tabulador</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Codificacion
              </label>
              <select className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none">
                <option value="UTF-8">UTF-8</option>
                <option value="ISO-8859-1">ISO-8859-1 (Latin-1)</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Conexiones rápidas ──────────────────────────────────────────── */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <ExternalLink className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Conexiones</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Accesos rápidos a todos los módulos conectados
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {CONNECTIONS.map((conn) => {
              const Icon = conn.icon;
              const isActive = activeModulesSet.has(conn.id) || conn.id === 'dashboard' || conn.id === 'onboarding';
              return (
                <button
                  key={conn.id}
                  onClick={() => navigate(conn.path)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all hover:shadow-sm ${
                    isActive
                      ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700'
                      : 'border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 opacity-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-xs font-semibold truncate ${isActive ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>
                    {conn.label}
                  </span>
                  {!isActive && (
                    <CircleDot className="w-3 h-3 text-gray-300 dark:text-gray-600 ml-auto shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Layout>
  );
}
