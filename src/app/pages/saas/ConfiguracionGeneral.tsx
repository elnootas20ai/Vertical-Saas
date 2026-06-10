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
import type { WorkCenter } from '../../lib/workCentersApi';
import {
  DELIVERY_WORK_CENTERS_CHANGED,
  loadDeliveryStores,
} from '../../lib/deliverySetup';
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
import { CrmImportWizard } from '../../components/saas/CrmImportWizard';
import { ImportStockWizard } from '../../components/saas/ImportStockWizard';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { bulkCreateCatalogItemsRequest, bulkUpdateCatalogStockRequest } from '../../lib/deliveryApi';
import { listBrandsRequest } from '../../lib/brandsApi';
import {
  mapImportEntryToCatalogItem,
  normalizeImportCategory,
  formatUnmatchedCommercialBrandWarning,
  activateCommercialLinesAfterCatalogImport,
  syncTpvOrganizersAfterCatalogImport,
} from '../../lib/deliveryCatalogImport';
import { organizerBrandsForCatalogTemplate } from '../../lib/deliveryCatalogImportLogic';
import {
  DELIVERY_CATALOG_IMPORT_FIELDS,
  DELIVERY_CATALOG_HEADER_ALIASES,
  downloadDeliveryCatalogImportTemplate,
  formatDeliveryCatalogImportValidationToast,
  validateDeliveryCatalogImportEntries,
} from '../../lib/deliveryCatalogExcelTemplate';
import {
  DELIVERY_STOCK_HEADER_ALIASES,
  DELIVERY_STOCK_IMPORT_FIELDS,
  DELIVERY_STOCK_SHEET_NAME,
  DELIVERY_STOCK_TEMPLATE_FILENAME,
  downloadDeliveryStockImportTemplate,
  formatDeliveryStockImportValidationToast,
  validateDeliveryStockImportEntries,
} from '../../lib/deliveryStockExcelTemplate';
import { notifyDeliveryCatalogChanged } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';

// ─── Module definitions ────────────────────────────────────────────────────────

const MODULE_DEFS = [
  { id: 'dashboard',     label: 'Panel principal',       icon: BarChart3,    category: 'core' },
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

/** Miembros que no son el titular = invitación aceptada al negocio. */
function invitedWorkersCount(biz: Business | null): number {
  if (!biz) return 0;
  return biz.members.filter((m) => m.user_id !== biz.owner_user_id).length;
}

function getUsuariosStatus(biz: Business | null): BlockStatus {
  if (!biz || biz.members.length === 0) return 'empty';
  const invited = invitedWorkersCount(biz);
  if (invited >= 1) return 'complete';
  return 'partial';
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
    const billingMsg =
      subscription.status === 'payment_failed'
        ? 'Error en el cobro del plan. Actualiza el método de pago.'
        : subscription.status === 'suspended'
          ? 'Cuenta suspendida por impago. Actualiza el método de pago para recuperar el acceso.'
          : 'Periodo de prueba finalizado o plan sin activar. Elige un plan o renueva para continuar.';
    alerts.push({
      id: 'plan-expired',
      type: 'critical',
      message: billingMsg,
      action: subscription.status === 'trial_expired' ? 'Elegir plan' : 'Ir a facturación',
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
  { id: 'dashboard',        label: 'Panel principal',       icon: BarChart3,    path: '/saas/dashboard' },
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
  { id: 'tpv',              label: 'TPV',                    icon: Monitor,      path: '/saas/vertical/delivery/tpv' },
  { id: 'onboarding',       label: 'Incorporación inicial', icon: Zap,          path: '/saas/configuracion' },
] as const;

// ─── Main component ────────────────────────────────────────────────────────────

export function ConfiguracionGeneral() {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const { user } = useAuth();
  const { subscription } = useApp();

  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [pdvCount, setPdvCount] = useState(0);
  const [loadingCenters, setLoadingCenters] = useState(true);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [modulesData, setModulesData] = useState<ModulesConfig | null>(null);
  const [invoiceEmailData, setInvoiceEmailData] = useState<InvoiceEmailConfig | null>(null);
  const [importData, setImportData] = useState<InitialImportData | null>(null);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importPopup, setImportPopup] = useState<null | 'stock' | 'clients' | 'catalog'>(null);

  const biz = currentBusiness;
  const bizId = biz?.business_id;
  const dataUserId = resolveBusinessDataUserId(user, biz);
  const isDeliveryBiz = biz?.businessType === 'delivery';
  const resolvedImportStatus = importData || biz?.initialImportStatus || null;
  const catalogImportDone =
    (resolvedImportStatus?.catalog ?? biz?.initialImportStatus?.catalog) === 'completed';

  const catalogImportFields: ImportFieldDef[] = useMemo(() => {
    if (biz?.businessType === 'delivery') return DELIVERY_CATALOG_IMPORT_FIELDS;
    return [
      { key: 'name', label: 'Nombre', required: true, example: 'Artículo ejemplo' },
      { key: 'sku', label: 'SKU', example: 'SKU-001' },
      { key: 'description', label: 'Descripción', example: 'Descripción breve' },
      { key: 'category', label: 'Categoría', example: 'general' },
      { key: 'unit', label: 'Unidad', example: 'ud' },
      { key: 'unitPrice', label: 'Precio venta', required: true, example: '2.50' },
      { key: 'costPrice', label: 'Precio coste', example: '0.80' },
      { key: 'image', label: 'Imagen (URL opcional)', example: '' },
      { key: 'stockQuantity', label: 'Stock actual', example: '100' },
      { key: 'minStock', label: 'Stock mínimo', example: '20' },
      { key: 'notes', label: 'Notas', example: '' },
    ];
  }, [biz?.businessType]);

  const handleDownloadCatalogTemplate = useCallback(async () => {
    if (!bizId) return;
    const brandList = await listBrandsRequest(bizId).catch(() => []);
    const lines = organizerBrandsForCatalogTemplate(brandList);
    if (lines.length === 0) {
      toast.error('Configura al menos una línea comercial en Ajustes → Marca antes de descargar la plantilla');
      return;
    }
    downloadDeliveryCatalogImportTemplate(lines);
    toast.success(`Plantilla descargada (${lines.map((b) => b.name).join(', ')})`);
  }, [bizId]);

  const handleCatalogImport = useCallback(async (entries: Record<string, string>[]) => {
    if (!dataUserId) return 0;
    const businessType = biz?.businessType || 'delivery';
    const isDelivery = businessType === 'delivery';
    let brandCache = bizId ? await listBrandsRequest(bizId).catch(() => []) : [];

    if (isDelivery) {
      const validation = validateDeliveryCatalogImportEntries(entries, brandCache);
      if (!validation.ok) {
        toast.error('Revisa la plantilla antes de importar', {
          description: formatDeliveryCatalogImportValidationToast(validation),
          duration: 12000,
        });
        return 0;
      }
    }

    const unmatchedCommercialBrands: string[] = [];
    const items: Record<string, unknown>[] = [];

    for (const entry of entries) {
      if (isDelivery && bizId) {
        const mapped = await mapImportEntryToCatalogItem(entry, { businessId: bizId, brandCache });
        if (!mapped) continue;
        brandCache = mapped.brandCache;
        unmatchedCommercialBrands.push(...mapped.unmatchedLineNames);
        items.push({
          ...mapped.item,
          vertical: businessType,
          notes: entry.notes || '',
        });
        continue;
      }

      const name = String(entry.name || '').trim();
      if (!name) continue;
      items.push({
        name,
        description: entry.description || '',
        category: normalizeImportCategory(entry.category || ''),
        brandIds: [],
        unit: entry.unit || 'ud',
        vertical: businessType,
        module: 'catalog' as const,
        unitPrice: Number(entry.unitPrice) || 0,
        costPrice: Number(entry.costPrice) || 0,
        stockQuantity: Number(entry.stockQuantity) || 0,
        minStock: Number(entry.minStock) || 0,
        active: true,
        webVisible: true,
        available: true,
        notes: entry.notes || '',
        sku: entry.sku || undefined,
        image: entry.image || undefined,
        customFields: {},
      });
    }

    const brandImportWarn = formatUnmatchedCommercialBrandWarning(unmatchedCommercialBrands);
    if (brandImportWarn) toast.warning(brandImportWarn, { duration: 14000 });

    if (items.length === 0) {
      toast.error('No se detectaron filas válidas para importar');
      return 0;
    }

    const result = await bulkCreateCatalogItemsRequest(dataUserId, items as any);

    // Marcar como completado si se creó al menos 1.
    if (bizId && result.created > 0) {
      if (isDelivery) {
        await syncTpvOrganizersAfterCatalogImport(
          bizId,
          items as Array<{ brandIds?: string[]; category?: string }>,
        ).catch(() => {});
        await activateCommercialLinesAfterCatalogImport(
          bizId,
          items as Array<{ brandIds?: string[] }>,
        ).catch(() => {});
      }
      notifyDeliveryCatalogChanged();
      const nextStatus = {
        stock: resolvedImportStatus?.stock || 'pending',
        clients: resolvedImportStatus?.clients || 'pending',
        catalog: 'completed' as const,
      };
      await saveInitialImportStatus(bizId, nextStatus).catch(() => {});
      setImportData((prev) => prev ? { ...prev, ...nextStatus } : ({ ...nextStatus, onboardingImportPending: true } as InitialImportData));
    }

    return result.created;
  }, [dataUserId, biz?.businessType, bizId, resolvedImportStatus?.stock, resolvedImportStatus?.clients]);

  const handleStockImport = useCallback(async (entries: Record<string, string>[]) => {
    if (!dataUserId) return 0;

    const validation = validateDeliveryStockImportEntries(entries);
    if (!validation.ok) {
      toast.error('Revisa el archivo de stock', {
        description: formatDeliveryStockImportValidationToast(validation),
        duration: 12000,
      });
      return 0;
    }

    const result = await bulkUpdateCatalogStockRequest(
      dataUserId,
      entries.map((entry) => ({
        sku: String(entry.sku || '').trim() || undefined,
        name: String(entry.name || entry.nombre || '').trim() || undefined,
        quantity: String(entry.quantity || entry.cantidad || '').trim(),
        unit: String(entry.unit || entry.unidad || '').trim() || undefined,
      })),
    );

    if (result.updated > 0 && bizId) {
      const nextStatus = {
        stock: 'completed' as const,
        clients: resolvedImportStatus?.clients || 'pending',
        catalog: resolvedImportStatus?.catalog || 'pending',
      };
      await saveInitialImportStatus(bizId, nextStatus).catch(() => {});
      setImportData((prev) => prev ? { ...prev, ...nextStatus } : ({ ...nextStatus, onboardingImportPending: true } as InitialImportData));
      notifyDeliveryCatalogChanged();
      toast.success(`${result.updated} artículo(s) con stock actualizado`);
    }
    if (result.notFound > 0) {
      toast.warning(`${result.notFound} fila(s) no encontradas en catálogo — importa primero el catálogo`);
    }
    if (result.updated === 0) {
      toast.error('No se actualizó ningún artículo');
    }
    return result.updated;
  }, [dataUserId, bizId, resolvedImportStatus?.clients, resolvedImportStatus?.catalog]);

  const loadWorkCenters = useCallback(async () => {
    if (!user || !bizId) {
      setWorkCenters([]);
      setPdvCount(0);
      setLoadingCenters(false);
      return;
    }
    setLoadingCenters(true);
    try {
      const state = await loadDeliveryStores(user, biz);
      setWorkCenters(state.workCenters);
      setPdvCount(state.pointsOfSale.length);
    } catch {
      setWorkCenters([]);
      setPdvCount(0);
    } finally {
      setLoadingCenters(false);
    }
  }, [user, bizId, biz]);

  useEffect(() => {
    void loadWorkCenters();
  }, [loadWorkCenters]);

  useEffect(() => {
    const onChanged = () => void loadWorkCenters();
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChanged);
    return () => window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChanged);
  }, [loadWorkCenters]);

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
      toast.success(next.includes(moduleId) ? 'Módulo activado' : 'Módulo desactivado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar módulos');
    } finally {
      setTogglingModule(null);
    }
  }, [bizId, modulesData]);

  const handleCopyEmail = useCallback(() => {
    const email = invoiceEmailData?.email || `facturas-${bizId || 'xxx'}@vertialapp.com`;
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
      toast.success(next ? 'Recepción de facturas activada' : 'Recepción de facturas desactivada');
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

  const activeCenters = workCenters.filter((c) => c.active && !c.deletedAt);
  const retailCenters = activeCenters.filter(
    (c) => c.centerType === 'punto_de_venta' || c.centerType === 'almacen',
  );

  const sedesDescription = loadingCenters
    ? 'Cargando locales…'
    : activeCenters.length > 0
      ? pdvCount > 0
        ? `${retailCenters.length} local(es) · ${pdvCount} PDV`
        : `${activeCenters.length} centro(s) activo(s)`
      : 'Configura tus centros de trabajo en Ajustes → Tienda';

  const sedesStats = loadingCenters
    ? '…'
    : activeCenters.length > 0
      ? `${activeCenters.length} activo(s)`
      : '0 activos';

  const invitedAccepted = invitedWorkersCount(biz);

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
      description: sedesDescription,
      status: loadingCenters ? 'partial' as BlockStatus : getSedesStatus(activeCenters.length),
      route: '/saas/settings/tienda',
      stats: sedesStats,
    },
    {
      id: 'usuarios',
      icon: Users,
      title: 'Usuarios',
      description:
        invitedAccepted === 0
          ? 'Ningún trabajador ha aceptado invitación aún'
          : `${invitedAccepted} trabajador${invitedAccepted === 1 ? '' : 'es'} con invitación aceptada`,
      status: getUsuariosStatus(biz),
      route: '/saas/settings/usuarios',
      stats: invitedAccepted === 0 ? 'Invita desde Equipo' : 'Cuenta sincronizada con miembros del negocio',
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
      description: invoiceEmailData?.email || 'Configura tu correo de recepción',
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
  ], [biz, activeCenters.length, sedesDescription, sedesStats, loadingCenters, invitedAccepted, modulesData, invoiceEmailData, importData, activeModulesSet, contractedModulesSet]);

  const visibleBlocks = blocks.filter((b) => !('hidden' in b && b.hidden));

  const completedCount = visibleBlocks.filter((b) => b.status === 'complete').length;
  const totalCount = visibleBlocks.length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-10">
        {/* ── Cabecera ───────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-amber-50/40 to-slate-50 p-6 shadow-sm dark:border-gray-700/90 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl dark:bg-amber-500/10" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700/90 dark:text-amber-400/90">
              Centro de configuración
            </p>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-gray-50 sm:text-3xl">
              Configuración general
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-slate-600 dark:text-gray-400">
              Revisa el estado de empresa, equipo y módulos antes de usar el día a día. Todo queda agrupado aquí para que configures con claridad.
            </p>
          </div>

          {/* Progreso */}
          <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-inner dark:border-gray-700/80 dark:bg-gray-800/60">
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
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{completedCount}/{totalCount} apartados</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">completados</p>
            </div>
          </div>
          </div>
        </section>

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleBlocks.map((block) => {
            const badge = statusBadge(block.status);
            const Icon = block.icon;
            return (
              <button
                key={block.id}
                onClick={() => {
                  if (block.route.startsWith('#')) {
                    document
                      .getElementById(block.route.slice(1))
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                  }
                  navigate(block.route);
                }}
                className="group relative text-left rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-200/80 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-amber-900/50"
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
        <section id="modulos" className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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
                      ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20'
                      : isContracted
                        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        : 'border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isActive
                      ? 'bg-amber-100 dark:bg-amber-900/40'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isActive ? 'text-amber-900 dark:text-amber-100' : 'text-gray-500 dark:text-gray-400'}`}>
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
                      isActive ? 'bg-amber-500 justify-end dark:bg-amber-600' : 'bg-gray-300 dark:bg-gray-600 justify-start'
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
        <section id="correo-facturas" className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tu correo de recepción</p>
              <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100 truncate">
                {invoiceEmailData?.email || `facturas-${bizId || 'xxx'}@vertialapp.com`}
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
                {copied ? '¡Copiado!' : 'Copiar correo'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Info className="w-4 h-4 text-gray-400 shrink-0" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Las facturas recibidas se procesarán automáticamente con OCR y aparecerán en tu bandeja de facturas de proveedor.
            </p>
          </div>
        </section>

        {/* ── Importación inicial ─────────────────────────────────────────── */}
        <section id="importacion" className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <Upload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Importación inicial</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isDeliveryBiz
                  ? 'Delivery: primero catálogo (carta + precios), luego stock (unidades). El coste de compra se calcula al recibir pedidos a proveedores.'
                  : 'Sube tus datos iniciales para empezar a trabajar con información real'}
              </p>
            </div>
          </div>

          {isDeliveryBiz ? (
            <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3 text-xs text-blue-900 dark:text-blue-200">
              <strong className="font-semibold">Orden recomendado:</strong>{' '}
              1) Catálogo (productos y precio TPV) → 2) Stock (recuento de unidades) → 3) Clientes.
              Los precios de compra los actualiza el sistema al registrar recepciones de proveedor.
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(isDeliveryBiz
              ? [
                  { key: 'catalog' as const, step: 1, label: 'Catálogo', desc: 'Productos y precios de venta (TPV)', icon: LayoutGrid },
                  { key: 'stock' as const, step: 2, label: 'Stock', desc: 'Unidades en almacén (tras el catálogo)', icon: Truck, needsCatalog: true },
                  { key: 'clients' as const, step: 3, label: 'Clientes', desc: 'Base de datos de clientes', icon: Users },
                ]
              : [
                  { key: 'stock' as const, step: 1, label: 'Stock', desc: 'Archivo de existencias iniciales', icon: Truck },
                  { key: 'clients' as const, step: 2, label: 'Clientes', desc: 'Base de datos de clientes', icon: Users },
                  { key: 'catalog' as const, step: 3, label: 'Catálogo', desc: 'Productos o servicios', icon: LayoutGrid },
                ]
            ).map((item) => {
              const importStatus = importData?.[item.key] ?? biz?.initialImportStatus?.[item.key] ?? 'pending';
              const Icon = item.icon;
              const stockBlocked = isDeliveryBiz && item.key === 'stock' && !catalogImportDone && importStatus !== 'completed';
              return (
                <div key={item.key}
                  className={`p-4 rounded-xl border transition-all ${
                    importStatus === 'completed'
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                      : stockBlocked
                        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'
                      : importStatus === 'skipped'
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                        : 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center shrink-0">
                      {item.step}
                    </span>
                    <Icon className={`w-4 h-4 ${
                      importStatus === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'
                    }`} />
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{item.label}</span>
                    {importStatus === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 ml-auto" />}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{item.desc}</p>
                  {stockBlocked ? (
                    <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      Importa primero el catálogo
                    </p>
                  ) : importStatus === 'completed' ? (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Completado</span>
                  ) : (
                    <button
                      onClick={() => {
                        if (isDeliveryBiz && item.key === 'stock' && !catalogImportDone) {
                          toast.error('Importa primero el catálogo (paso 1)');
                          return;
                        }
                        setImportPopup(item.key);
                      }}
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

        {/* ── Popups de importación (sin redirección) ─────────────────────── */}
        <CrmImportWizard
          isOpen={importPopup === 'clients'}
          onClose={() => setImportPopup(null)}
          initialMode="clients"
        />
        {importPopup === 'stock' && biz?.businessType === 'delivery' ? (
          <GenericImportModal
            isOpen
            onClose={() => setImportPopup(null)}
            moduleLabel="Stock"
            importLabel="Existencias iniciales"
            templateFileName={DELIVERY_STOCK_TEMPLATE_FILENAME}
            fields={DELIVERY_STOCK_IMPORT_FIELDS}
            onImport={handleStockImport}
            onDownloadTemplate={() => {
              downloadDeliveryStockImportTemplate();
              toast.success('Plantilla de stock descargada');
            }}
            headerAliases={DELIVERY_STOCK_HEADER_ALIASES}
            skipMappingWhenComplete
            importSheetName={DELIVERY_STOCK_SHEET_NAME}
          />
        ) : importPopup === 'stock' ? (
          <ImportStockWizard onClose={() => setImportPopup(null)} />
        ) : null}
        <GenericImportModal
          isOpen={importPopup === 'catalog'}
          onClose={() => setImportPopup(null)}
          moduleLabel="Catálogo"
          importLabel="Catálogo"
          templateFileName={biz?.businessType === 'delivery' ? 'plantilla_catalogo_delivery_tpv.xlsx' : 'plantilla_catalogo.xlsx'}
          fields={catalogImportFields}
          onImport={handleCatalogImport}
          onDownloadTemplate={biz?.businessType === 'delivery' ? () => void handleDownloadCatalogTemplate() : undefined}
          headerAliases={biz?.businessType === 'delivery' ? DELIVERY_CATALOG_HEADER_ALIASES : undefined}
          skipMappingWhenComplete={biz?.businessType === 'delivery'}
          importSheetName="catalogo"
        />

        {/* ── Configuracion TPV (condicional) ─────────────────────────────── */}
        {activeModulesSet.has('tpv') && (
          <section id="tpv-config" className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-gray-900 dark:text-gray-100">Configuración TPV</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Terminal punto de venta: métodos de pago, impuestos y tickets
                </p>
              </div>
              <button
                onClick={() => navigate('/saas/vertical/delivery/tpv')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                Ir al TPV
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { label: 'Punto de venta', desc: 'Selecciona tu PDV por defecto', icon: Store },
                { label: 'Métodos de pago', desc: 'Efectivo, tarjeta, Bizum, transferencia', icon: CreditCard },
                { label: 'Impuestos (IVA)', desc: 'Tipo de IVA por defecto', icon: Receipt },
                { label: 'Numeración de tickets', desc: 'Formato y serie de tickets', icon: FileText },
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
        <section id="import-config" className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Reglas de importación</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Define cómo se procesan los archivos de importación
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
                Codificación
              </label>
              <select className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none">
                <option value="UTF-8">UTF-8</option>
                <option value="ISO-8859-1">ISO-8859-1 (Latin-1)</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Conexiones rápidas ──────────────────────────────────────────── */}
        <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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

          <div className="rounded-xl border border-gray-200/90 bg-gray-50/95 p-1 dark:border-gray-700/90 dark:bg-gray-800/55">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-0.5">
            {CONNECTIONS.map((conn) => {
              const Icon = conn.icon;
              const isActive = activeModulesSet.has(conn.id) || conn.id === 'dashboard' || conn.id === 'onboarding';
              return (
                <button
                  key={conn.id}
                  onClick={() => navigate(conn.path)}
                  className={`flex items-center gap-2.5 rounded-lg border border-transparent p-3 text-left transition-all ${
                    isActive
                      ? 'border-l-2 border-l-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-50/90 dark:bg-amber-900/25 dark:text-amber-300 dark:hover:bg-amber-900/35'
                      : 'text-gray-500 opacity-60 hover:bg-white/60 hover:opacity-90 dark:text-gray-400 dark:hover:bg-gray-700/40'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-xs font-medium truncate ${isActive ? 'text-amber-900 dark:text-amber-200' : ''}`}>
                    {conn.label}
                  </span>
                  {!isActive && (
                    <CircleDot className="w-3 h-3 text-gray-300 dark:text-gray-600 ml-auto shrink-0" />
                  )}
                </button>
              );
            })}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
