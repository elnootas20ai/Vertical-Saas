import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalClose } from '../../hooks/useModalClose';
import { useSwitchActiveBusiness } from '../../hooks/useSwitchActiveBusiness';
import {
  LayoutDashboard,
  ShoppingCart,
  Car,
  TrendingUp,
  Users,
  UserPlus,
  FileText,
  DollarSign,
  UsersRound,
  Building2,
  Settings,
  LogOut,
  User,
  HelpCircle,
  X,
  Sparkles,
  Kanban,
  CalendarDays,
  BarChart3,
  ClipboardList,
  Wrench,
  Package,
  HardHat,
  Award,
  Receipt,
  Newspaper,
  ChevronDown,
  Truck,
  BookOpen,
  Globe,
  Home,
  House,
  SprayCan,
  ClipboardCheck,
  Star,
  MessageSquare,
  Contact2,
  Megaphone,
  Droplets,
  Store,
  Clock,
  CalendarRange,
  Umbrella,
  Boxes,
  Factory,
  ShoppingBag,
  Calculator,
  ArrowUpDown,
  PiggyBank,
  Landmark,
  ScrollText,
  ShieldCheck,
  Wallet,
  FolderOpen,
  GraduationCap,
  Bell,
  Briefcase,
  Shield,
  Check,
  Plus,
  PlusCircle,
  Dumbbell,
  Stethoscope,
  Hotel,
  Scale,
  Music,
  PartyPopper,
  Scissors,
  HeartPulse,
  Pill,
  BedDouble,
  ConciergeBell,
  Hammer,
  Lock,
  Ruler,
  BookOpenCheck,
  UserCheck,
  Key,
  Eye,
  Gavel,
  Timer,
  Wine,
  Mic,
  ListChecks,
  MapPin,
  UtensilsCrossed,
  Sparkle,
  History,
  Container,
  Cog,
  Recycle,
  Leaf,
  Tag,
  ScanBarcode,
  Layers,
  CircleDollarSign,
  CarTaxiFront,
  Navigation,
  Gauge,
  CreditCard,
  PawPrint,
  Monitor,
  Search,
  Cigarette,
  Ticket,
  Beef,
  Bike,
  IceCream,
  AlertTriangle,
  ChefHat,
  Zap,
  Activity,
  Route,
  Banknote,
  FileStack,
  BookmarkCheck,
  CirclePlus,
  FileCheck,
  Plug,
  Mail,
  Loader2,
  Copy,
} from 'lucide-react';
import { SAAS__HelpModal } from '../design-system/SAAS__HelpModal';
import { useAuthOptional, type AuthContextType } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import { canManageTeam } from '../../lib/teamManagerAccess';
import { sortByBusinessUsage } from '../../lib/businessUsageOrder';
import {
  workerNeedsBusinessLink,
  WORKER_UNLINKED_HOME_PATH,
} from '../../lib/workerProfileCompletion';
import { useApp, userCanUseDevPlanOverride } from '../../context/AppContext';
import { getEffectivePointOfSaleLimit } from '../../lib/pointOfSaleLimits';
import { getEffectiveBusinessLimit, getEffectiveCommercialBrandLimit } from '../../lib/tenantEntitlements';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import type { BusinessType } from '../../lib/businessApi';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  ensureTabletCodesForPointsOfSale,
  listPointsOfSaleRequest,
  pointOfSaleDisplayLabel,
} from '../../lib/deliveryApi';
import {
  DELIVERY_WORK_CENTERS_CHANGED,
  filterWorkCentersForBusinessScope,
  isDeliveryBusinessType,
  resolveBusinessScopeId,
} from '../../lib/deliverySetup';
import { listSalesPoints, type SalesPoint } from '../../lib/salesPointsApi';
import { isCompraventaBusinessType, loadCompraventaStores, listCompraventaSidebarWorkCenters } from '../../lib/compraventaSetup';
import { ActivationChecklist } from './ActivationChecklist';
import { VertialLogo } from '../VertialLogo';
import { useDeliveryActivationNav } from '../../hooks/useDeliveryActivationNav';
import { useCompraventaActivationNav } from '../../hooks/useCompraventaActivationNav';
import { getCompraventaSidebarItemLock } from '../../lib/compraventaActivationGates';
import { getDeliverySidebarItemLock } from '../../lib/deliveryActivationGates';
import { useEventsActivationNav } from '../../hooks/useEventsActivationNav';
import {
  isDeliveryOpsBusinessType,
  isEventsBusinessType,
  isRestaurantBusinessType,
  isStrictDeliveryBusinessType,
} from '../../lib/deliveryOpsTypes';
import { useSidebarDeliveryStoreRows } from '../../hooks/useSidebarDeliveryStoreRows';
import { useRestaurantStoreRows } from '../../hooks/useRestaurantStoreRows';
import { useAlertCenterSummary } from '../../hooks/useAlertCenterSummary';
import { useAlertCenterBusinessId } from '../../hooks/useAlertCenterBusinessId';
import { getEventsSidebarItemLock } from '../../lib/eventsActivationGates';
import { isMenuItemVisibleForVertical } from '../../lib/verticalModuleVisibility';
import { isSidebarItemUnlockedForPlan } from '../../lib/sidebarPlanCatalog';
import { useEffectivePlanTier } from '../../hooks/useEffectivePlanTier';
import { saasPathWithBusinessScope } from '../../lib/businessScopeUrl';
import { EventsPortablePdvModal } from './events/EventsPortablePdvModal';
import { resolveEventsUserId } from '../../lib/eventsFlow';
import {
  resolveActiveOpsStoreRowId,
  resolveActiveWorkCenterRowId,
} from '../../lib/activeStoreSidebarSelection';

interface SidebarItem {
  id: string;
  label: string;
  /** Segunda línea (p. ej. código PDV en monospace). */
  subLabel?: string;
  /** Código tablet TPV (copiable) ligado a la tienda. */
  terminalCode?: string;
  icon: React.ReactNode;
  path: string;
  pro?: boolean;
  disabled?: boolean;
  /** Tooltip cuando está bloqueado por alta delivery. */
  lockTitle?: string;
  /** Tienda/PDV inactivo: visible en lista pero no seleccionable para operar. */
  inactive?: boolean;
  upcoming?: boolean;
  isNew?: boolean;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon: React.ReactNode | null;
  itemIds: string[];
}

/** Contenedor visual para cada sección del menú */
function NavSectionShell({
  children,
  narrow,
}: {
  children: React.ReactNode;
  narrow: boolean;
}) {
  return (
    <div
      className={`mb-2 rounded-xl border border-slate-200/80 bg-slate-50/90 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/40 ${
        narrow ? 'mx-0.5' : 'mx-2'
      }`}
    >
      {children}
    </div>
  );
}

const HOME_GROUP: SidebarGroup = {
  id: 'home',
  label: 'Home',
  icon: <House className="w-4 h-4 shrink-0" />,
  itemIds: ['dashboard', 'alertas', 'calendar', 'chat'],
};

const menuItemDefs = [
  // ── Home ─────────────────────────────────────────────────────────────────────
  { id: 'dashboard', navKey: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/dashboard' },
  { id: 'alertas', navKey: 'alertas', icon: <Bell className="w-5 h-5" />, path: '/saas/alerts' },
  { id: 'calendar',  navKey: 'calendar',  icon: <CalendarDays className="w-5 h-5" />,    path: '/saas/calendar' },
  { id: 'chat',      navKey: 'chat',      icon: <MessageSquare className="w-5 h-5" />,   path: '/saas/chat' },

  // ── Clientes / CRM ──────────────────────────────────────────────────────────
  { id: 'clients',     navKey: 'clients',     icon: <Users className="w-5 h-5" />,     path: '/saas/crm/clientes?tab=clients' },
  { id: 'quotes',     navKey: 'quotes',     icon: <ClipboardList className="w-5 h-5" />, path: '/saas/quotes' },
  { id: 'promotions', navKey: 'promotions', icon: <Megaphone className="w-5 h-5" />,      path: '/saas/promotions', isNew: true },

  // ── Equipo ───────────────────────────────────────────────────────────────────
  { id: 'team',            navKey: 'team',           icon: <UsersRound className="w-5 h-5" />,    path: '/saas/team' },
  { id: 'clockins',        navKey: 'clockins',       icon: <Clock className="w-5 h-5" />,          path: '/saas/clockins' },
  { id: 'hr-requests',     navKey: 'hrRequests',     icon: <ClipboardList className="w-5 h-5" />,  path: '/saas/equipo/solicitudes' },
  { id: 'horarios-vacaciones', navKey: 'horarios-vacaciones', icon: <CalendarRange className="w-5 h-5" />, path: '/saas/equipo/horarios-vacaciones' },
  { id: 'commissions',     navKey: 'commissions',    icon: <Award className="w-5 h-5" />,          path: '/saas/commissions', isNew: true },
  { id: 'payroll',          navKey: 'payroll',         icon: <FileText className="w-5 h-5" />,       path: '/saas/payroll?tab=nominas', isNew: true },
  { id: 'gestoria',         navKey: 'gestoria',        icon: <Briefcase className="w-5 h-5" />,      path: '/saas/gestoria', isNew: true },

  // ── Catálogo y Proveedores ───────────────────────────────────────────────────
  { id: 'catalog',          navKey: 'catalog',         icon: <BookOpen className="w-5 h-5" />,    path: '/saas/catalog?tab=catalog' },
  { id: 'catalog-stock',    navKey: 'articles',        icon: <Boxes className="w-5 h-5" />,       path: '/saas/inventory' },
  // TPV (delivery / restaurante / heladería): las 4 secciones del módulo catálogo.
  { id: 'catalog-carta',    navKey: 'cartaTpv',        icon: <BookOpen className="w-5 h-5" />,    path: '/saas/catalog?tab=catalog' },
  { id: 'catalog-stock-tpv', navKey: 'almacenTpv',     icon: <Boxes className="w-5 h-5" />,       path: '/saas/catalog?tab=stock' },
  { id: 'catalog-purchases', navKey: 'catalogPurchases', icon: <ShoppingCart className="w-5 h-5" />, path: '/saas/catalog?tab=suppliers' },
  { id: 'catalog-consumos', navKey: 'staffConsumption', icon: <UtensilsCrossed className="w-5 h-5" />, path: '/saas/catalog?tab=staff-consumption' },
  { id: 'costing',          navKey: 'costing',         icon: <Calculator className="w-5 h-5" />,  path: '/saas/catalog?tab=escandallo' },
  { id: 'suppliers',        navKey: 'suppliers',       icon: <Factory className="w-5 h-5" />,     path: '/saas/suppliers' },
  { id: 'catalog-invoice-email', navKey: 'invoiceEmailReception', icon: <Mail className="w-5 h-5" />, path: '/saas/correo-facturas' },

  // ── Finanzas ─────────────────────────────────────────────────────────────────
  { id: 'finance',             navKey: 'finance',            icon: <DollarSign className="w-5 h-5" />,  path: '/saas/finance' },
  { id: 'income-expenses',     navKey: 'incomeExpenses',     icon: <ArrowUpDown className="w-5 h-5" />, path: '/saas/income-expenses' },
  { id: 'ebitda',              navKey: 'ebitda',             icon: <PiggyBank className="w-5 h-5" />,   path: '/saas/ebitda', isNew: true },
  { id: 'taxes',               navKey: 'taxes',              icon: <Landmark className="w-5 h-5" />,    path: '/saas/taxes' },
  { id: 'verifactu',           navKey: 'verifactu',          icon: <Receipt className="w-5 h-5" />,     path: '/saas/verifactu', isNew: true },
  { id: 'bank-reconciliation', navKey: 'bankReconciliation', icon: <Landmark className="w-5 h-5" />,    path: '/saas/bank-reconciliation', pro: true },
  { id: 'reports',             navKey: 'reports',            icon: <BarChart3 className="w-5 h-5" />,   path: '/saas/reports', isNew: true },
  { id: 'sales-metrics',       navKey: 'salesMetrics',       icon: <BarChart3 className="w-5 h-5" />,   path: '/saas/sales-metrics', isNew: true },

  // ── Documentación ────────────────────────────────────────────────────────────
  { id: 'doc-society',       navKey: 'docSociety',      icon: <Building2 className="w-5 h-5" />,   path: '/saas/documents?tab=society' },
  { id: 'doc-contracts',     navKey: 'docContracts',    icon: <ScrollText className="w-5 h-5" />,  path: '/saas/documents?tab=contracts' },
  { id: 'doc-licenses',      navKey: 'docLicenses',     icon: <ShieldCheck className="w-5 h-5" />, path: '/saas/documents?tab=licenses' },
  { id: 'doc-financial',     navKey: 'docFinancial',    icon: <Wallet className="w-5 h-5" />,      path: '/saas/documents?tab=financial' },
  { id: 'doc-other',         navKey: 'docOther',        icon: <FolderOpen className="w-5 h-5" />,  path: '/saas/documents?tab=other' },

  // ── Documentación compraventa (tabs vehículo) ────────────────────────────────
  { id: 'doc-vehiculo',      navKey: 'docVehiculo',     icon: <Car className="w-5 h-5" />,           path: '/saas/documents?tab=vehiculo' },
  { id: 'doc-contratos-cv',  navKey: 'docContratosCv',  icon: <ScrollText className="w-5 h-5" />,  path: '/saas/documents?tab=contratos' },
  { id: 'doc-facturas-cv',   navKey: 'docFacturasCv',   icon: <Receipt className="w-5 h-5" />,     path: '/saas/documents?tab=facturas' },
  { id: 'doc-itv-cv',        navKey: 'docItvCv',        icon: <ShieldCheck className="w-5 h-5" />, path: '/saas/documents?tab=itv' },
  { id: 'doc-reparacion-cv', navKey: 'docReparacionCv', icon: <Wrench className="w-5 h-5" />,      path: '/saas/documents?tab=reparacion' },
  { id: 'doc-cliente-cv',    navKey: 'docClienteCv',    icon: <UserCheck className="w-5 h-5" />,   path: '/saas/documents?tab=cliente' },
  { id: 'doc-anexos-cv',     navKey: 'docAnexosCv',     icon: <FolderOpen className="w-5 h-5" />,  path: '/saas/documents?tab=anexos' },

  // ── Vertical: Comercial (concesionario) ──────────────────────────────────────
  { id: 'compraventa-hub',        navKey: 'compraventaHub',        icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/vertical/compraventa' },
  { id: 'compraventa-vehiculos',  navKey: 'compraventaVehiculos',  icon: <Car className="w-5 h-5" />,              path: '/saas/vehicles' },
  { id: 'entrada-vehiculo',       navKey: 'entradaVehiculo',       icon: <CirclePlus className="w-5 h-5" />,       path: '/saas/vertical/compraventa/entrada-vehiculo' },
  { id: 'compraventa-compras',    navKey: 'compraventaCompras',    icon: <ShoppingCart className="w-5 h-5" />,       path: '/saas/vertical/compraventa/compras' },
  { id: 'compraventa-ventas',     navKey: 'compraventaVentas',     icon: <TrendingUp className="w-5 h-5" />,         path: '/saas/vertical/compraventa/ventas' },
  { id: 'compraventa-tasaciones', navKey: 'compraventaTasaciones', icon: <Scale className="w-5 h-5" />,              path: '/saas/vertical/compraventa/tasaciones' },
  { id: 'compraventa-entregas',   navKey: 'compraventaEntregas',   icon: <Truck className="w-5 h-5" />,              path: '/saas/vertical/compraventa/entregas' },
  { id: 'compraventa-crm',        navKey: 'compraventa-crm',       icon: <Kanban className="w-5 h-5" />,             path: '/saas/vertical/compraventa/crm' },
  { id: 'compraventa-fiscal',     navKey: 'compraventaFiscal',     icon: <Calculator className="w-5 h-5" />,         path: '/saas/vertical/compraventa/calculadora-fiscal' },
  { id: 'publicacion-venta',      navKey: 'publicacionVenta',      icon: <Megaphone className="w-5 h-5" />,           path: '/saas/vertical/compraventa/publicacion-venta' },
  { id: 'dealership-workers',     navKey: 'dealershipWorkers',     icon: <BarChart3 className="w-5 h-5" />,          path: '/saas/dealership-workers' },
  { id: 'gastos-preparacion',     navKey: 'gastosPreparacion',     icon: <Receipt className="w-5 h-5" />,            path: '/saas/vertical/compraventa/gastos-preparacion' },
  { id: 'vehicles',     navKey: 'vehicles',     icon: <Car className="w-5 h-5" />,           path: '/saas/vehicles' },
  { id: 'reservations', navKey: 'reservations', icon: <BookmarkCheck className="w-5 h-5" />, path: '/saas/reservations' },
  { id: 'sales',        navKey: 'sales',        icon: <TrendingUp className="w-5 h-5" />,    path: '/saas/sales' },
  { id: 'pipeline', navKey: 'pipeline', icon: <Kanban className="w-5 h-5" />,     path: '/saas/pipeline' },

  // ── Vertical: Taller ─────────────────────────────────────────────────────────
  { id: 'workshop', navKey: 'workshop', icon: <Wrench className="w-5 h-5" />,  path: '/saas/workshop' },
  { id: 'parts',    navKey: 'parts',    icon: <Package className="w-5 h-5" />, path: '/saas/parts' },
  { id: 'tech',     navKey: 'tech',     icon: <HardHat className="w-5 h-5" />, path: '/saas/tech' },

  // ── Vertical: Delivery ───────────────────────────────────────────────────────
  { id: 'delivery-ops',     navKey: 'deliveryOps',     icon: <Activity className="w-5 h-5" />, path: '/saas/delivery-ops' },
  { id: 'restaurant-ops',   navKey: 'restaurantOps',   icon: <Activity className="w-5 h-5" />, path: '/saas/restaurant-ops' },
  { id: 'tpv',              navKey: 'tpv',             icon: <Receipt className="w-5 h-5" />,  path: '/saas/tpv' },
  { id: 'sala',             navKey: 'sala',             icon: <UtensilsCrossed className="w-5 h-5" />, path: '/saas/sala' },
  { id: 'cocina',           navKey: 'deliveryKitchen',  icon: <ChefHat className="w-5 h-5" />, path: '/saas/cocina' },
  { id: 'reservas',         navKey: 'reservations',     icon: <BookmarkCheck className="w-5 h-5" />, path: '/saas/reservations' },
  { id: 'lista-espera',     navKey: 'listaEspera',      icon: <ListChecks className="w-5 h-5" />, path: '/saas/lista-espera' },
  { id: 'tpv-locales',      navKey: 'tpvLocales',      icon: <Store className="w-5 h-5" />,    path: '/saas/tpv/locales' },
  { id: 'tpv-rapido',       navKey: 'tpvRapido',       icon: <Zap className="w-5 h-5" />,      path: '/saas/vertical/delivery/tpv' },
  { id: 'caja',             navKey: 'caja',            icon: <Banknote className="w-5 h-5" />,  path: '/saas/vertical/delivery/caja' },
  { id: 'delivery-clients', navKey: 'deliverySidebarClients', icon: <Users className="w-5 h-5" />, path: '/saas/crm/clientes?tab=clients' },
  { id: 'web-orders',       navKey: 'webOrders',       icon: <Package className="w-5 h-5" />,  path: '/saas/web-orders' },
  { id: 'web-config',       navKey: 'webConfig',       icon: <Globe className="w-5 h-5" />,    path: '/saas/web-config' },
  { id: 'delivery-integrations', navKey: 'deliveryIntegrations', icon: <Plug className="w-5 h-5" />, path: '/saas/vertical/delivery/integraciones' },

  // ── Vertical: Limpieza ───────────────────────────────────────────────────────
  { id: 'cleaning-hub',         navKey: 'cleaningHub',         icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/cleaning-hub' },
  { id: 'cleaning-contracts',   navKey: 'cleaningContracts',   icon: <FileStack className="w-5 h-5" />,      path: '/saas/vertical/limpieza/servicios' },
  { id: 'cleaning-services',    navKey: 'cleaningServices',    icon: <SprayCan className="w-5 h-5" />,       path: '/saas/cleaning-services' },
  { id: 'cleaning-workers',     navKey: 'cleaningWorkers',     icon: <Users className="w-5 h-5" />,          path: '/saas/cleaning-workers' },
  { id: 'cleaning-routes',      navKey: 'cleaningRoutes',      icon: <Route className="w-5 h-5" />,          path: '/saas/cleaning-routes' },
  { id: 'cleaning-clients',     navKey: 'cleaningClients',     icon: <UserCheck className="w-5 h-5" />,      path: '/saas/vertical/limpieza/clientes' },
  { id: 'cleaning-billing',     navKey: 'cleaningBilling',     icon: <Receipt className="w-5 h-5" />,        path: '/saas/cleaning-billing' },
  { id: 'cleaning-materials',   navKey: 'cleaningMaterials',   icon: <Package className="w-5 h-5" />,        path: '/saas/cleaning-materials' },
  { id: 'cleaning-reports',     navKey: 'cleaningReports',     icon: <BarChart3 className="w-5 h-5" />,      path: '/saas/cleaning-reports' },
  { id: 'cleaning-execution', navKey: 'cleaningExecution', icon: <Timer className="w-5 h-5" />,          path: '/saas/cleaning-execution' },
  { id: 'cleaning-checklist', navKey: 'cleaningChecklist', icon: <ClipboardCheck className="w-5 h-5" />, path: '/saas/cleaning-checklist' },
  { id: 'cleaning-quality',   navKey: 'cleaningQuality',   icon: <Star className="w-5 h-5" />,           path: '/saas/cleaning-quality' },
  { id: 'cleaning-reviews',   navKey: 'cleaningReviews',   icon: <MessageSquare className="w-5 h-5" />,  path: '/saas/cleaning-reviews' },
  { id: 'cleaning-incidents', navKey: 'cleaningIncidents', icon: <AlertTriangle className="w-5 h-5" />,  path: '/saas/cleaning-incidents' },

  // ── Vertical: Gimnasio ─────────────────────────────────────────────────────
  { id: 'gym-hub',          navKey: 'gymHub',          icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/gym-hub' },
  { id: 'gym-members',      navKey: 'gymMembers',      icon: <Users className="w-5 h-5" />,         path: '/saas/gym-members' },
  { id: 'gym-classes',      navKey: 'gymClasses',      icon: <CalendarDays className="w-5 h-5" />, path: '/saas/gym-classes' },
  { id: 'gym-trainers',     navKey: 'gymTrainers',     icon: <UserCheck className="w-5 h-5" />,    path: '/saas/gym-trainers' },
  { id: 'gym-memberships',  navKey: 'gymMemberships',  icon: <Award className="w-5 h-5" />,       path: '/saas/gym-memberships' },
  { id: 'gym-routines',     navKey: 'gymRoutines',     icon: <ClipboardList className="w-5 h-5" />, path: '/saas/gym-routines' },
  { id: 'gym-access',       navKey: 'gymAccess',       icon: <ShieldCheck className="w-5 h-5" />, path: '/saas/gym-access' },

  // ── Vertical: Clínica ──────────────────────────────────────────────────────
  { id: 'clinic-history',       navKey: 'clinicHistory',       icon: <HeartPulse className="w-5 h-5" />,  path: '/saas/clinic-history' },
  { id: 'clinic-treatments',    navKey: 'clinicTreatments',    icon: <Stethoscope className="w-5 h-5" />, path: '/saas/clinic-treatments' },
  { id: 'clinic-prescriptions', navKey: 'clinicPrescriptions', icon: <Pill className="w-5 h-5" />,        path: '/saas/clinic-prescriptions' },

  // ── Vertical: Hotel ────────────────────────────────────────────────────────
  { id: 'hotel-reservations',  navKey: 'hotelReservations',  icon: <BookOpen className="w-5 h-5" />,      path: '/saas/hotel-reservations' },
  { id: 'hotel-rooms',         navKey: 'hotelRooms',         icon: <BedDouble className="w-5 h-5" />,     path: '/saas/hotel-rooms' },
  { id: 'hotel-checkin',       navKey: 'hotelCheckin',       icon: <Key className="w-5 h-5" />,           path: '/saas/hotel-checkin' },
  { id: 'hotel-housekeeping',  navKey: 'hotelHousekeeping',  icon: <SprayCan className="w-5 h-5" />,     path: '/saas/hotel-housekeeping' },
  { id: 'hotel-room-service',  navKey: 'hotelRoomService',   icon: <ConciergeBell className="w-5 h-5" />, path: '/saas/hotel-room-service' },

  // ── Vertical: Constructora ─────────────────────────────────────────────────
  { id: 'construction-ops',            navKey: 'constructionOps',            icon: <Activity className="w-5 h-5" />,       path: '/saas/construction-ops' },
  { id: 'construction-projects',       navKey: 'constructionProjects',       icon: <HardHat className="w-5 h-5" />,       path: '/saas/construction-projects' },
  { id: 'construction-execution',      navKey: 'constructionExecution',      icon: <ClipboardCheck className="w-5 h-5" />,path: '/saas/construction-execution' },
  { id: 'construction-quick-budget',   navKey: 'constructionQuickBudget',    icon: <Zap className="w-5 h-5" />,           path: '/saas/vertical/construccion/presupuestos' },
  { id: 'construction-budgets',        navKey: 'constructionBudgets',        icon: <Receipt className="w-5 h-5" />,       path: '/saas/construction-budgets' },
  { id: 'construction-partidas',      navKey: 'constructionPartidas',      icon: <Layers className="w-5 h-5" />,        path: '/saas/vertical/construccion/partidas-gremios' },
  { id: 'construction-tasks',          navKey: 'constructionTasks',          icon: <ClipboardList className="w-5 h-5" />, path: '/saas/construction-tasks' },
  { id: 'construction-incidents',      navKey: 'constructionIncidents',      icon: <AlertTriangle className="w-5 h-5" />,path: '/saas/construction-incidents' },
  { id: 'construction-collections',    navKey: 'constructionCollections',    icon: <Banknote className="w-5 h-5" />,     path: '/saas/construction-collections' },
  { id: 'construction-payments',      navKey: 'constructionPayments',      icon: <CreditCard className="w-5 h-5" />,   path: '/saas/construction-payments' },
  { id: 'construction-closure',        navKey: 'constructionClosure',        icon: <Lock className="w-5 h-5" />,         path: '/saas/construction-closure' },

  // ── Vertical: Academia ─────────────────────────────────────────────────────
  { id: 'academy-courses',      navKey: 'academyCourses',      icon: <BookOpenCheck className="w-5 h-5" />,  path: '/saas/academy-courses' },
  { id: 'academy-enrollments',  navKey: 'academyEnrollments',  icon: <UserCheck className="w-5 h-5" />,     path: '/saas/academy-enrollments' },
  { id: 'academy-grades',       navKey: 'academyGrades',       icon: <BarChart3 className="w-5 h-5" />,     path: '/saas/academy-grades' },

  // ── Vertical: Inmobiliaria ─────────────────────────────────────────────────
  { id: 'realestate-properties', navKey: 'realestateProperties', icon: <Building2 className="w-5 h-5" />,  path: '/saas/realestate-properties' },
  { id: 'realestate-visits',    navKey: 'realestateVisits',     icon: <Eye className="w-5 h-5" />,         path: '/saas/realestate-visits' },
  { id: 'realestate-contracts', navKey: 'realestateContracts',  icon: <ScrollText className="w-5 h-5" />,  path: '/saas/realestate-contracts' },
  { id: 'realestate-appraisals', navKey: 'realestateAppraisals', icon: <DollarSign className="w-5 h-5" />, path: '/saas/realestate-appraisals' },

  // ── Vertical: Abogados ─────────────────────────────────────────────────────
  { id: 'lawyer-cases',      navKey: 'lawyerCases',      icon: <Briefcase className="w-5 h-5" />,    path: '/saas/lawyer-cases' },
  { id: 'lawyer-hearings',   navKey: 'lawyerHearings',   icon: <Gavel className="w-5 h-5" />,        path: '/saas/lawyer-hearings' },
  { id: 'lawyer-deadlines',  navKey: 'lawyerDeadlines',  icon: <Timer className="w-5 h-5" />,        path: '/saas/lawyer-deadlines' },

  // ── Vertical: Discoteca ────────────────────────────────────────────────────
  { id: 'nightclub-events',    navKey: 'nightclubEvents',    icon: <Music className="w-5 h-5" />,         path: '/saas/nightclub-events' },
  { id: 'nightclub-vip',       navKey: 'nightclubVip',       icon: <Star className="w-5 h-5" />,          path: '/saas/nightclub-vip' },
  { id: 'nightclub-promoters', navKey: 'nightclubPromoters', icon: <Megaphone className="w-5 h-5" />,     path: '/saas/nightclub-promoters' },
  { id: 'nightclub-guestlist', navKey: 'nightclubGuestlist', icon: <ClipboardList className="w-5 h-5" />, path: '/saas/nightclub-guestlist' },
  { id: 'nightclub-artists',   navKey: 'nightclubArtists',   icon: <Mic className="w-5 h-5" />,           path: '/saas/nightclub-artists' },

  // ── Vertical: Eventos ──────────────────────────────────────────────────────
  { id: 'events-hub', navKey: 'eventsHub', icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/vertical/eventos' },
  { id: 'events-new-contract', navKey: 'eventsNewContract', icon: <PlusCircle className="w-5 h-5" />, path: '/saas/vertical/eventos/nueva-contratacion' },
  { id: 'events-quotes', navKey: 'eventsQuotes', icon: <Receipt className="w-5 h-5" />, path: '/saas/vertical/eventos/presupuestos' },
  { id: 'events-pipeline', navKey: 'eventsPipeline', icon: <FileText className="w-5 h-5" />, path: '/saas/vertical/eventos/contrataciones' },
  { id: 'events-services', navKey: 'eventsServices', icon: <Sparkles className="w-5 h-5" />, path: '/saas/events-services' },
  { id: 'events-venues', navKey: 'eventsVenues', icon: <MapPin className="w-5 h-5" />, path: '/saas/events-venues' },
  { id: 'events-vendors', navKey: 'eventsVendors', icon: <Briefcase className="w-5 h-5" />, path: '/saas/events-vendors' },
  { id: 'events-catering', navKey: 'eventsCatering', icon: <UtensilsCrossed className="w-5 h-5" />, path: '/saas/events-catering' },
  { id: 'events-logistics', navKey: 'eventsLogistics', icon: <ListChecks className="w-5 h-5" />, path: '/saas/events-logistics' },
  { id: 'events-route', navKey: 'eventsRoute', icon: <Route className="w-5 h-5" />, path: '/saas/vertical/eventos/ruta' },

  // ── Vertical: Peluquería ───────────────────────────────────────────────────
  { id: 'salon-services',        navKey: 'salonServices',        icon: <Scissors className="w-5 h-5" />,     path: '/saas/salon-services' },
  { id: 'salon-loyalty',         navKey: 'salonLoyalty',         icon: <Sparkle className="w-5 h-5" />,      path: '/saas/salon-loyalty' },

  // ── Vertical: Desguace ──────────────────────────────────────────────────────
  { id: 'scrapyard-hub',              navKey: 'scrapyardHub',              icon: <Container className="w-5 h-5" />,      path: '/saas/vertical/desguaces' },
  { id: 'scrapyard-purchases',        navKey: 'scrapyardPurchases',        icon: <ShoppingCart className="w-5 h-5" />,   path: '/saas/vertical/desguaces/compras-retiradas' },
  { id: 'scrapyard-vehicles',         navKey: 'scrapyardVehicles',         icon: <Car className="w-5 h-5" />,            path: '/saas/scrapyard-vehicles' },
  { id: 'scrapyard-dismantling',      navKey: 'scrapyardDismantling',      icon: <Wrench className="w-5 h-5" />,         path: '/saas/vertical/desguaces/despiece', isNew: true },
  { id: 'scrapyard-parts',            navKey: 'scrapyardParts',            icon: <Cog className="w-5 h-5" />,            path: '/saas/scrapyard-parts' },
  { id: 'scrapyard-deregistrations',  navKey: 'scrapyardDeregistrations',  icon: <FileText className="w-5 h-5" />,      path: '/saas/scrapyard-deregistrations' },
  { id: 'scrapyard-environment',      navKey: 'scrapyardEnvironment',      icon: <Leaf className="w-5 h-5" />,           path: '/saas/scrapyard-environment' },
  { id: 'scrapyard-expedition',      navKey: 'scrapyardExpedition',       icon: <Truck className="w-5 h-5" />,          path: '/saas/scrapyard-expedition' },
  { id: 'scrapyard-documentation',   navKey: 'scrapyardDocumentation',    icon: <FileCheck className="w-5 h-5" />,      path: '/saas/vertical/desguaces/documentacion', isNew: true },

  // ── Vertical: Recambios ────────────────────────────────────────────────────
  { id: 'spareparts-compatibility',  navKey: 'sparepartsCompatibility',  icon: <ScanBarcode className="w-5 h-5" />,  path: '/saas/spareparts-compatibility' },
  { id: 'spareparts-counter',        navKey: 'sparepartsCounter',        icon: <Tag className="w-5 h-5" />,           path: '/saas/spareparts-counter' },

  // ── Vertical: Taxi ──────────────────────────────────────────────────────────
  { id: 'taxi-fleet',        navKey: 'taxiFleet',        icon: <CarTaxiFront className="w-5 h-5" />,  path: '/saas/taxi-fleet' },
  { id: 'taxi-trips',        navKey: 'taxiTrips',        icon: <Navigation className="w-5 h-5" />,    path: '/saas/taxi-trips' },
  { id: 'taxi-shifts',       navKey: 'taxiShifts',       icon: <CalendarRange className="w-5 h-5" />, path: '/saas/taxi-shifts' },

  // ── Vertical: Farmacia ──────────────────────────────────────────────────────
  { id: 'pharmacy-prescriptions', navKey: 'pharmacyPrescriptions', icon: <FileText className="w-5 h-5" />,     path: '/saas/pharmacy-prescriptions' },
  { id: 'pharmacy-guard',         navKey: 'pharmacyGuard',         icon: <ShieldCheck className="w-5 h-5" />,  path: '/saas/pharmacy-guard' },

  // ── Vertical: Lavadero de coches ──────────────────────────────────────────
  { id: 'carwash-services',    navKey: 'carwashServices',    icon: <Droplets className="w-5 h-5" />,      path: '/saas/carwash-services' },
  { id: 'carwash-memberships', navKey: 'carwashMemberships', icon: <CreditCard className="w-5 h-5" />,   path: '/saas/carwash-memberships' },

  // ── Vertical: Veterinario ───────────────────────────────────────────────────
  { id: 'vet-patients',      navKey: 'vetPatients',      icon: <PawPrint className="w-5 h-5" />,       path: '/saas/vet-patients' },
  { id: 'vet-history',       navKey: 'vetHistory',       icon: <FileText className="w-5 h-5" />,       path: '/saas/vet-history' },
  { id: 'vet-vaccinations',  navKey: 'vetVaccinations',  icon: <ShieldCheck className="w-5 h-5" />,    path: '/saas/vet-vaccinations' },

  // ── Vertical: Estanco ──────────────────────────────────────────────────────
  { id: 'tobacco-lottery',     navKey: 'tobaccoLottery',     icon: <Ticket className="w-5 h-5" />,       path: '/saas/tobacco-lottery' },
  { id: 'tobacco-regulatory',  navKey: 'tobaccoRegulatory',  icon: <ShieldCheck className="w-5 h-5" />,  path: '/saas/tobacco-regulatory' },

  // ── Vertical: Carnicería ───────────────────────────────────────────────────
  { id: 'butcher-hub',            navKey: 'butcherHub',           icon: <Gauge className="w-5 h-5" />,         path: '/saas/butcher-hub' },
  { id: 'butcher-clients',        navKey: 'butcherClients',       icon: <Users className="w-5 h-5" />,         path: '/saas/butcher-clients' },
  { id: 'butcher-orders',         navKey: 'butcherOrders',        icon: <ClipboardList className="w-5 h-5" />, path: '/saas/butcher-orders' },
  { id: 'butcher-sales',          navKey: 'butcherSales',         icon: <Receipt className="w-5 h-5" />,       path: '/saas/butcher-sales' },
  { id: 'butcher-tpv',            navKey: 'tpv',                  icon: <Monitor className="w-5 h-5" />,       path: '/saas/vertical/carniceria/tpv' },
  { id: 'butcher-products',      navKey: 'butcherProducts',      icon: <Beef className="w-5 h-5" />,          path: '/saas/butcher-products' },
  { id: 'butcher-purchases',     navKey: 'butcherPurchases',     icon: <Truck className="w-5 h-5" />,         path: '/saas/vertical/carniceria/compras' },
  { id: 'butcher-despiece',      navKey: 'butcherDespiece',      icon: <Scissors className="w-5 h-5" />,      path: '/saas/vertical/carniceria/despiece' },
  { id: 'butcher-reparto',       navKey: 'butcherReparto',       icon: <Bike className="w-5 h-5" />,          path: '/saas/vertical/carniceria/reparto' },
  { id: 'butcher-basculas',      navKey: 'butcherBasculas',      icon: <Scale className="w-5 h-5" />,         path: '/saas/vertical/carniceria/basculas' },
  { id: 'butcher-traceability',  navKey: 'butcherTraceability',  icon: <ScanBarcode className="w-5 h-5" />,   path: '/saas/butcher-traceability' },
  { id: 'butcher-waste',         navKey: 'butcherWaste',         icon: <Recycle className="w-5 h-5" />,       path: '/saas/butcher-waste' },
  { id: 'butcher-reports',       navKey: 'butcherReports',       icon: <BarChart3 className="w-5 h-5" />,     path: '/saas/vertical/carniceria/informes' },

  // ── Vertical: Heladería ────────────────────────────────────────────────────
  { id: 'heladeria-tpv',            navKey: 'heladeriaTpv',            icon: <Monitor className="w-5 h-5" />,         path: '/saas/vertical/heladeria/tpv' },
  { id: 'heladeria-ops',            navKey: 'heladeriaOps',            icon: <Activity className="w-5 h-5" />,        path: '/saas/heladeria-ops' },
  { id: 'heladeria-caja',           navKey: 'heladeriaCaja',           icon: <Banknote className="w-5 h-5" />,        path: '/saas/vertical/heladeria/caja' },
  { id: 'heladeria-encargos',       navKey: 'heladeriaEncargos',       icon: <ClipboardList className="w-5 h-5" />,   path: '/saas/heladeria-encargos' },
  { id: 'heladeria-integraciones',  navKey: 'heladeriaIntegraciones',  icon: <Plug className="w-5 h-5" />,            path: '/saas/heladeria-integraciones' },

  // ── Bottom ───────────────────────────────────────────────────────────────────
  { id: 'configuracion', navKey: 'configuracion', icon: <Cog className="w-5 h-5" />, path: '/saas/configuracion' },
  { id: 'settings', navKey: 'settings', icon: <Settings className="w-5 h-5" />, path: '/saas/settings' },
] as const;

// ── Modo Trabajador ─────────────────────────────────────────────────────────
const workerMenuItemDefs = [
  // ── Principal ───────────────────────────────────────────────────────────────
  { id: 'worker-tpv',        navKey: 'workerTpv',        icon: <Monitor className="w-5 h-5" />,         path: '/saas/worker/tpv', isNew: true },
  { id: 'worker-tasks',      navKey: 'workerTasks',      icon: <ClipboardList className="w-5 h-5" />,   path: '/saas/worker/tasks' },
  { id: 'worker-stock-review', navKey: 'workerStockReview', icon: <ClipboardCheck className="w-5 h-5" />, path: '/saas/worker/stock-review' },
  { id: 'worker-calendar',   navKey: 'workerCalendar',   icon: <CalendarDays className="w-5 h-5" />,    path: '/saas/worker/calendar' },
  { id: 'worker-requests',   navKey: 'workerRequests',   icon: <Umbrella className="w-5 h-5" />,        path: '/saas/worker/requests' },
  { id: 'worker-clock',      navKey: 'workerClock',      icon: <Clock className="w-5 h-5" />,           path: '/saas/worker/clock' },
  { id: 'worker-chat',       navKey: 'workerChat',       icon: <MessageSquare className="w-5 h-5" />,   path: '/saas/worker/chat' },
  { id: 'worker-docs',       navKey: 'workerDocs',       icon: <FileText className="w-5 h-5" />,        path: '/saas/worker/documents' },
  { id: 'worker-butcher-orders', navKey: 'workerButcherOrders', icon: <ClipboardList className="w-5 h-5" />, path: '/saas/worker/butcher-orders', isNew: true },
  { id: 'worker-butcher-reparto', navKey: 'workerButcherReparto', icon: <Bike className="w-5 h-5" />, path: '/saas/worker/butcher-reparto', isNew: true },
  { id: 'worker-materials', navKey: 'workerMaterials', icon: <Package className="w-5 h-5" />, path: '/saas/worker/materials' },
  { id: 'worker-onboarding', navKey: 'workerOnboarding', icon: <GraduationCap className="w-5 h-5" />,   path: '/saas/worker/onboarding', pro: true },

  // ── Configuración ───────────────────────────────────────────────────────────
  { id: 'worker-profile',       navKey: 'workerProfile',      icon: <User className="w-5 h-5" />,          path: '/saas/worker/profile' },
  { id: 'worker-contract-info', navKey: 'workerContractInfo', icon: <ClipboardCheck className="w-5 h-5" />, path: '/saas/worker/contract-info' },
  { id: 'worker-position',      navKey: 'workerPosition',     icon: <Briefcase className="w-5 h-5" />,     path: '/saas/worker/position' },
  { id: 'worker-notifications', navKey: 'workerNotifications', icon: <Bell className="w-5 h-5" />,         path: '/saas/worker/notifications' },
  { id: 'worker-security',      navKey: 'workerSecurity',     icon: <Shield className="w-5 h-5" />,        path: '/saas/worker/security' },
] as const;

/** Ítems del menú trabajador que no van en sidebar (acceso operativo vía landing / código tienda). */
const WORKER_SIDEBAR_HIDDEN_ITEM_IDS = new Set(['worker-tpv', 'worker-stock-review', 'worker-onboarding', 'tpv-rapido', 'caja', 'events-guests']);

const WORKER_HOME_GROUP: SidebarGroup = {
  id: 'worker-main',
  label: 'Principal',
  icon: <House className="w-4 h-4 shrink-0" />,
  itemIds: ['worker-tasks', 'worker-calendar', 'worker-requests', 'worker-clock', 'worker-chat', 'worker-docs'],
};

const workerSidebarGroupDefs = [
  { id: 'worker-config', icon: <Settings className="w-4 h-4 shrink-0" />, itemIds: ['worker-profile', 'worker-contract-info', 'worker-position', 'worker-notifications', 'worker-security'] },
] as const;

const sidebarGroupDefs = [
  { id: 'clientesCrm',      icon: <Contact2 className="w-4 h-4 shrink-0" />,      itemIds: ['quotes', 'promotions'] },
  { id: 'equipo',           icon: <UsersRound className="w-4 h-4 shrink-0" />,    itemIds: ['hr-requests', 'team', 'clockins', 'horarios-vacaciones', 'commissions', 'payroll', 'gestoria'] },
  { id: 'catalogProviders', icon: <Package className="w-4 h-4 shrink-0" />,       itemIds: ['catalog', 'catalog-stock', 'costing', 'catalog-invoice-email'] },
  { id: 'finanzas',         icon: <DollarSign className="w-4 h-4 shrink-0" />,    itemIds: ['reports', 'client-billing', 'finance', 'income-expenses', 'ebitda', 'taxes', 'verifactu', 'bank-reconciliation'] },
  { id: 'documentacion',    icon: <FileText className="w-4 h-4 shrink-0" />,      itemIds: ['doc-society', 'doc-contracts', 'doc-licenses', 'doc-financial', 'doc-other'] },
  { id: 'commercial',       icon: <Car className="w-4 h-4 shrink-0" />,           itemIds: ['compraventa-hub', 'compraventa-vehiculos', 'entrada-vehiculo', 'compraventa-compras', 'compraventa-ventas', 'compraventa-tasaciones', 'compraventa-entregas', 'compraventa-crm', 'compraventa-fiscal', 'publicacion-venta'] },
  { id: 'workshop',         icon: <Wrench className="w-4 h-4 shrink-0" />,        itemIds: ['workshop', 'parts', 'tech'] },
  { id: 'delivery',         icon: <Truck className="w-4 h-4 shrink-0" />,         itemIds: ['tpv-rapido', 'delivery-ops', 'sala', 'caja', 'web-config', 'delivery-integrations'] },
  { id: 'cleaning',         icon: <Droplets className="w-4 h-4 shrink-0" />,      itemIds: ['cleaning-hub', 'cleaning-contracts', 'cleaning-services', 'cleaning-workers', 'cleaning-routes', 'cleaning-clients', 'cleaning-execution', 'cleaning-checklist', 'cleaning-quality', 'cleaning-reviews', 'cleaning-incidents', 'cleaning-billing', 'cleaning-materials', 'cleaning-reports'] },
  { id: 'gym',              icon: <Dumbbell className="w-4 h-4 shrink-0" />,      itemIds: ['gym-hub', 'gym-members', 'gym-classes', 'gym-trainers', 'gym-memberships', 'gym-routines', 'gym-access'] },
  { id: 'clinic',           icon: <Stethoscope className="w-4 h-4 shrink-0" />,   itemIds: ['clinic-history', 'clinic-treatments', 'clinic-prescriptions'] },
  { id: 'hotel',            icon: <Hotel className="w-4 h-4 shrink-0" />,          itemIds: ['hotel-reservations', 'hotel-rooms', 'hotel-checkin', 'hotel-housekeeping', 'hotel-room-service'] },
  { id: 'construction',     icon: <HardHat className="w-4 h-4 shrink-0" />,       itemIds: ['construction-ops', 'construction-projects', 'construction-execution', 'construction-quick-budget', 'construction-budgets', 'construction-partidas', 'construction-collections', 'construction-payments', 'construction-tasks', 'construction-incidents', 'construction-closure'] },
  { id: 'academy',          icon: <GraduationCap className="w-4 h-4 shrink-0" />, itemIds: ['academy-courses', 'academy-enrollments', 'academy-grades'] },
  { id: 'realEstate',       icon: <Building2 className="w-4 h-4 shrink-0" />,     itemIds: ['realestate-properties', 'realestate-visits', 'realestate-contracts', 'realestate-appraisals'] },
  { id: 'lawyer',           icon: <Scale className="w-4 h-4 shrink-0" />,          itemIds: ['lawyer-cases', 'lawyer-hearings', 'lawyer-deadlines'] },
  { id: 'nightclub',        icon: <Music className="w-4 h-4 shrink-0" />,          itemIds: ['nightclub-events', 'nightclub-vip', 'nightclub-promoters', 'nightclub-guestlist', 'nightclub-artists'] },
  { id: 'events',           icon: <PartyPopper className="w-4 h-4 shrink-0" />,   itemIds: ['events-hub', 'events-new-contract', 'events-quotes', 'events-pipeline', 'events-services', 'events-route'] },
  { id: 'hairSalon',        icon: <Scissors className="w-4 h-4 shrink-0" />,      itemIds: ['salon-services', 'salon-loyalty'] },
  { id: 'scrapyard',        icon: <Container className="w-4 h-4 shrink-0" />,    itemIds: ['scrapyard-hub', 'scrapyard-purchases', 'scrapyard-vehicles', 'scrapyard-dismantling', 'scrapyard-parts', 'scrapyard-deregistrations', 'scrapyard-expedition', 'scrapyard-environment', 'scrapyard-documentation'] },
  { id: 'spareParts',       icon: <Cog className="w-4 h-4 shrink-0" />,          itemIds: ['spareparts-compatibility', 'spareparts-counter'] },
  { id: 'taxi',             icon: <CarTaxiFront className="w-4 h-4 shrink-0" />, itemIds: ['taxi-fleet', 'taxi-trips', 'taxi-shifts'] },
  { id: 'pharmacy',         icon: <Pill className="w-4 h-4 shrink-0" />,        itemIds: ['pharmacy-prescriptions', 'pharmacy-guard'] },
  { id: 'carWash',          icon: <Droplets className="w-4 h-4 shrink-0" />,    itemIds: ['carwash-services', 'carwash-memberships'] },
  { id: 'vet',              icon: <PawPrint className="w-4 h-4 shrink-0" />,    itemIds: ['vet-patients', 'vet-history', 'vet-vaccinations'] },
  { id: 'tobaccoShop',      icon: <Cigarette className="w-4 h-4 shrink-0" />,  itemIds: ['tobacco-lottery', 'tobacco-regulatory'] },
  { id: 'butcherShop',     icon: <Beef className="w-4 h-4 shrink-0" />,       itemIds: ['butcher-hub', 'butcher-clients', 'butcher-orders', 'butcher-sales', 'butcher-tpv', 'butcher-products', 'butcher-purchases', 'butcher-despiece', 'butcher-reparto', 'butcher-basculas', 'butcher-traceability', 'butcher-waste', 'butcher-reports'] },
  { id: 'iceCreamShop',    icon: <IceCream className="w-4 h-4 shrink-0" />,   itemIds: ['heladeria-tpv', 'heladeria-ops', 'heladeria-caja', 'heladeria-encargos', 'heladeria-integraciones'] },
] as const;

const VERTICAL_GROUPS: Record<BusinessType, Set<string>> = {
  carDealership: new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'commercial']),
  workshop:      new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'workshop']),
  delivery:      new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'delivery']),
  restaurant:    new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'delivery']),
  cleaning:      new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'cleaning']),
  gym:           new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'gym']),
  clinic:        new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'clinic']),
  hotel:         new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'hotel']),
  construction:  new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'construction']),
  academy:       new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'academy']),
  // Sin catalogProviders (Catálogo / Inventario / Proveedores): no aplica a inmobiliaria.
  realEstate:    new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'realEstate']),
  lawyer:        new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'lawyer']),
  nightclub:     new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'nightclub']),
  events:        new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'events']),
  hairSalon:     new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'hairSalon']),
  scrapyard:     new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'scrapyard']),
  spareParts:    new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'spareParts']),
  taxi:          new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'taxi']),
  carWash:       new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'carWash']),
  pharmacy:      new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'pharmacy']),
  vet:           new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'vet']),
  tobaccoShop:   new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'tobaccoShop']),
  butcherShop:   new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'butcherShop']),
  // Heladería = mismo core + bloque operativo que Delivery (TPV, ops, caja, web, integraciones).
  iceCreamShop:  new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'delivery']),
};

/** Items de menú por grupo, sustituyen los defaults del grupo para un vertical concreto. */
const VERTICAL_GROUP_ITEM_OVERRIDES: Partial<Record<BusinessType, Record<string, readonly string[]>>> = {
  carDealership: {
    clientesCrm: ['clients', 'quotes', 'promotions'],
    equipo: ['hr-requests', 'team', 'dealership-workers', 'clockins', 'horarios-vacaciones', 'commissions', 'payroll', 'gestoria'],
    catalogProviders: ['suppliers', 'catalog-invoice-email'],
    finanzas: ['reports', 'client-billing', 'finance', 'income-expenses', 'ebitda', 'taxes', 'verifactu', 'bank-reconciliation', 'gastos-preparacion'],
    documentacion: ['doc-vehiculo', 'doc-contratos-cv', 'doc-facturas-cv', 'doc-itv-cv', 'doc-reparacion-cv', 'doc-cliente-cv', 'doc-anexos-cv'],
    commercial: [
      'compraventa-hub',
      'compraventa-vehiculos',
      'entrada-vehiculo',
      'compraventa-compras',
      'compraventa-ventas',
      'compraventa-tasaciones',
      'compraventa-entregas',
      'compraventa-crm',
      'compraventa-fiscal',
      'publicacion-venta',
    ],
  },
  restaurant: {
    clientesCrm: ['clients', 'promotions'],
    equipo: ['hr-requests', 'team', 'clockins', 'horarios-vacaciones', 'payroll', 'gestoria'],
    finanzas: ['reports', 'finance', 'income-expenses', 'client-billing', 'taxes', 'verifactu'],
    // Hub propio + TPV sala (/saas/caja/tpv) — no DeliveryOps ni TPV delivery.
    delivery: [
      'restaurant-ops',
      'sala',
      'tpv-rapido',
      'cocina',
      'caja',
      'reservas',
      'lista-espera',
      'web-config',
    ],
  },
  events: {
    clientesCrm: ['clients'],
    catalogProviders: ['suppliers', 'catalog-invoice-email'],
  },
  delivery: {
    clientesCrm: ['clients', 'promotions'],
  },
  // Core CRM + ops propias heladería (no rutas Delivery).
  iceCreamShop: {
    clientesCrm: ['clients', 'promotions'],
    delivery: [
      'heladeria-tpv',
      'heladeria-ops',
      'heladeria-caja',
      'heladeria-encargos',
      'heladeria-integraciones',
    ],
  },
  realEstate: {
    // CRM core (no delivery): Clientes + presupuestos/promos.
    clientesCrm: ['clients', 'quotes', 'promotions'],
  },
};

/** Rutas sidebar bar/restaurante (separadas de Delivery). */
const RESTAURANT_SIDEBAR_PATH_OVERRIDES: Record<string, string> = {
  'restaurant-ops': '/saas/restaurant-ops',
  caja: '/saas/caja',
  'tpv-rapido': '/saas/caja/tpv',
  reports: '/saas/vertical/restaurant/informes',
};

function resolveSidebarItemPath(item: SidebarItem, isRestaurantVertical: boolean): string {
  if (isRestaurantVertical && RESTAURANT_SIDEBAR_PATH_OVERRIDES[item.id]) {
    return RESTAURANT_SIDEBAR_PATH_OVERRIDES[item.id];
  }
  return item.path;
}

const VERTICAL_BOTTOM_ITEMS: Record<BusinessType, Set<string>> = {
  carDealership: new Set(['configuracion', 'settings']),
  workshop:      new Set(['configuracion', 'settings']),
  delivery:      new Set(['configuracion', 'settings']),
  restaurant:    new Set(['configuracion', 'settings']),
  cleaning:      new Set(['configuracion', 'settings']),
  gym:           new Set(['configuracion', 'settings']),
  clinic:        new Set(['configuracion', 'settings']),
  hotel:         new Set(['configuracion', 'settings']),
  construction:  new Set(['configuracion', 'settings']),
  academy:       new Set(['configuracion', 'settings']),
  realEstate:    new Set(['configuracion', 'settings']),
  lawyer:        new Set(['configuracion', 'settings']),
  nightclub:     new Set(['configuracion', 'settings']),
  events:        new Set(['configuracion', 'settings']),
  hairSalon:     new Set(['configuracion', 'settings']),
  scrapyard:     new Set(['configuracion', 'settings']),
  spareParts:    new Set(['configuracion', 'settings']),
  taxi:          new Set(['configuracion', 'settings']),
  carWash:       new Set(['configuracion', 'settings']),
  pharmacy:      new Set(['configuracion', 'settings']),
  vet:           new Set(['configuracion', 'settings']),
  tobaccoShop:   new Set(['configuracion', 'settings']),
  butcherShop:   new Set(['configuracion', 'settings']),
  iceCreamShop:  new Set(['configuracion', 'settings']),
};

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onMobileClose }: SidebarProps) {
  const auth = useAuthOptional();
  if (!auth?.user) return null;
  return (
    <SidebarInner
      auth={auth}
      collapsed={collapsed}
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
    />
  );
}

function SidebarInner({
  auth,
  collapsed,
  mobileOpen,
  onMobileClose,
}: SidebarProps & { auth: AuthContextType }) {
  useModalClose(mobileOpen, onMobileClose);
  const SIDEBAR_SCROLL_KEY = 'saas-sidebar-scroll-top';
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = auth;
  const { businesses, businessesFetchSettled, currentBusiness } = useBusiness();
  const businessesByUsage = useMemo(
    () => sortByBusinessUsage(businesses, user?.user_id),
    [businesses, user?.user_id],
  );
  const switchActiveBusiness = useSwitchActiveBusiness();
  const accountBusinessCount = businessesFetchSettled ? businesses.length : undefined;
  const {
    subscription,
    setDevSubscriptionPlan,
    enableDevUnlimitedPdv,
    devUnlimitedPdv,
    devExtraPdv,
    devExtraBrands,
    devExtraBusiness,
    setDevExtraPdvSlots,
    setDevExtraBrandSlots,
    setDevExtraBusinessSlots,
  } = useApp();
  const { t } = useTranslation();
  const canUseDevPlanSwitcher = userCanUseDevPlanOverride(user);
  const currentDevPlan: 'basic' | 'normal' | 'pro' = (() => {
    const id = (subscription.selectedPlanId || '').toLowerCase();
    if (id === 'pro') return 'pro';
    if (id === 'normal') return 'normal';
    return 'basic';
  })();

  const isWorker = isWorkerAccount(user);
  /** Trabajador operativo = menú worker. Gestor/Encargado invitados gestionan equipo → menú empresa (nóminas, contratos). */
  const treatAsWorkerNav = isWorker && !canManageTeam(user, businesses);
  const alertCenterBusinessId = useAlertCenterBusinessId();
  const { unresolved: alertCenterUnresolved } = useAlertCenterSummary(
    !treatAsWorkerNav ? alertCenterBusinessId : undefined,
  );
  /** Trabajador con empresa asignada (invitación aceptada / miembro en el negocio). */
  const unlinkedWorkerNeedsCompany = workerNeedsBusinessLink(user);

  const vertical: BusinessType | null = currentBusiness?.businessType
    ? (currentBusiness.businessType as BusinessType)
    : treatAsWorkerNav
      ? null
      : 'carDealership';
  const isCompraventa = isCompraventaBusinessType(vertical);
  const isRestaurantVertical = isRestaurantBusinessType(vertical);
  const isHeladeriaVertical = vertical === 'iceCreamShop';
  const isStrictDeliveryVertical = isDeliveryBusinessType(vertical);
  /** Heladería reutiliza el shell Delivery (sidebar, tiendas/PDV, locks de alta). */
  const usesDeliverySidebarCore = isStrictDeliveryVertical || isHeladeriaVertical;
  // Heladería comparte selector de tienda/PDV del core Delivery.
  const usesOpsStoreSidebar =
    isDeliveryOpsBusinessType(vertical) || isRestaurantVertical || isHeladeriaVertical;
  /** Eventos: bloque PDV/tiendas entre Home y el vertical (como delivery/bar). */
  const isEventsVertical = isEventsBusinessType(vertical);
  const showWorkCentersSidebar =
    usesOpsStoreSidebar || isCompraventa || isEventsVertical;
  const allowedGroups = vertical
    ? (VERTICAL_GROUPS[vertical] || VERTICAL_GROUPS.carDealership)
    : new Set<string>();
  const allowedBottom = vertical
    ? (VERTICAL_BOTTOM_ITEMS[vertical] || VERTICAL_BOTTOM_ITEMS.carDealership)
    : new Set<string>();
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showEventsPortablePdvModal, setShowEventsPortablePdvModal] = useState(false);
  const desktopCompanySelectorRef = useRef<HTMLDivElement>(null);
  const mobileCompanySelectorRef = useRef<HTMLDivElement>(null);
  const companyDropdownPanelRef = useRef<HTMLDivElement>(null);
  const [companyDropdownStyle, setCompanyDropdownStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  // `workerMode` ya no es alternable: cuenta trabajador → siempre menú worker.
  const workerMode = treatAsWorkerNav;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('saas-worker-mode', String(workerMode));
  }, [workerMode]);
  const SEEN_NEW_ITEMS_KEY = 'saas-sidebar-seen-new';
  const [seenNewItems, setSeenNewItems] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(SEEN_NEW_ITEMS_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
      } catch { return new Set(); }
    }
    return new Set();
  });
  const markNewItemSeen = (id: string) => {
    setSeenNewItems((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SEEN_NEW_ITEMS_KEY, JSON.stringify([...next]));
      }
      return next;
    });
  };

  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([]);
  /** Eventos: código TPV tablet por workCenterId. */
  const [eventsTabletCodeByWc, setEventsTabletCodeByWc] = useState<Record<string, string>>({});
  const currentBusinessRef = useRef(currentBusiness);
  currentBusinessRef.current = currentBusiness;
  const userRef = useRef(user);
  userRef.current = user;
  const businessScopeId = resolveBusinessScopeId(currentBusiness);

  const loadCompraventaSidebarStores = useCallback(async () => {
    const biz = currentBusinessRef.current;
    const authUser = userRef.current;
    const bid = resolveBusinessScopeId(biz);
    if (!bid || !authUser) {
      setSalesPoints([]);
      return;
    }
    try {
      const state = await loadCompraventaStores(authUser, biz, {
        includeInactivePdvs: true,
        ensureTabletCodes: false,
      });
      if (resolveBusinessScopeId(currentBusinessRef.current) !== bid) return;
      setSalesPoints(listCompraventaSidebarWorkCenters(state.workCenters));
    } catch {
      if (resolveBusinessScopeId(currentBusinessRef.current) !== bid) return;
      setSalesPoints([]);
    }
  }, [businessScopeId, user?.user_id]);

  const loadSalesPoints = useCallback(async () => {
    if (isCompraventa) {
      await loadCompraventaSidebarStores();
      return;
    }
    const dataUserId = resolveBusinessDataUserId(userRef.current, currentBusinessRef.current);
    if (!dataUserId) return;
    try {
      const sps = await listSalesPoints(dataUserId);
      const businessId = resolveBusinessScopeId(currentBusinessRef.current);
      const scoped = filterWorkCentersForBusinessScope(sps, businessId, {
        accountBusinessCount,
      });
      const filtered = scoped.filter(
        (sp) =>
          sp.active !== false &&
          (!isDeliveryBusinessType(vertical) ||
            sp.centerType === 'punto_de_venta' ||
            sp.centerType === 'almacen'),
      );
      setSalesPoints(filtered);

      if (isEventsBusinessType(vertical)) {
        try {
          let pdvs = await listPointsOfSaleRequest(dataUserId, { includeInactive: false });
          if (businessId) {
            pdvs = pdvs.filter((p) => {
              const bid = String(p.businessId || (p as { business_id?: string }).business_id || '')
                .replace(/^business:/, '')
                .trim();
              return !bid || bid === businessId;
            });
          }
          pdvs = await ensureTabletCodesForPointsOfSale(dataUserId, pdvs);
          const map: Record<string, string> = {};
          for (const pdv of pdvs) {
            const wcId = String(pdv.workCenterId || '').trim();
            const code = String(pdv.terminalCode || '').trim().toUpperCase();
            if (wcId && code) map[wcId] = code;
          }
          setEventsTabletCodeByWc(map);
        } catch {
          setEventsTabletCodeByWc({});
        }
      } else {
        setEventsTabletCodeByWc({});
      }
    } catch {
      setSalesPoints([]);
      setEventsTabletCodeByWc({});
    }
  }, [accountBusinessCount, isCompraventa, loadCompraventaSidebarStores, vertical]);

  const activeStore = useActiveStoreScope();
  const sidebarDelivery = useSidebarDeliveryStoreRows(usesDeliverySidebarCore);
  const sidebarRestaurant = useRestaurantStoreRows(isRestaurantVertical);
  const opsStoreRows = isRestaurantVertical ? sidebarRestaurant.rows : sidebarDelivery.rows;
  const opsStoreLoading = isRestaurantVertical ? sidebarRestaurant.loading : sidebarDelivery.loading;
  const lastOpsStoreRowsRef = useRef(opsStoreRows);
  useEffect(() => {
    lastOpsStoreRowsRef.current = [];
  }, [businessScopeId]);
  if (opsStoreRows.length > 0) {
    lastOpsStoreRowsRef.current = opsStoreRows;
  }
  const displayOpsStoreRows =
    opsStoreRows.length > 0 ? opsStoreRows : lastOpsStoreRowsRef.current;
  const showOpsStoreLoading =
    usesOpsStoreSidebar && opsStoreLoading && displayOpsStoreRows.length === 0;

  useEffect(() => {
    if (usesOpsStoreSidebar) return;
    if (!businessesFetchSettled) return;
    if (isCompraventa && !businessScopeId) {
      setSalesPoints([]);
      return;
    }
    void loadSalesPoints();
  }, [loadSalesPoints, usesOpsStoreSidebar, isCompraventa, businessScopeId, businessesFetchSettled]);

  const loadCompraventaSidebarStoresRef = useRef(loadCompraventaSidebarStores);
  loadCompraventaSidebarStoresRef.current = loadCompraventaSidebarStores;

  useEffect(() => {
    if (!isEventsVertical) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onStoresChanged = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void loadSalesPoints();
      }, 250);
    };
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onStoresChanged);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onStoresChanged);
    };
  }, [isEventsVertical, loadSalesPoints]);

  useEffect(() => {
    if (!isCompraventa) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onStoresChanged = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void loadCompraventaSidebarStoresRef.current();
      }, 250);
    };
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onStoresChanged);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onStoresChanged);
    };
  }, [isCompraventa]);

  useEffect(() => {
    if (!usesOpsStoreSidebar) return;
    const onStoresChanged = () => {
      void activeStore.refresh();
    };
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onStoresChanged);
    return () => window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onStoresChanged);
  }, [usesOpsStoreSidebar, activeStore.refresh]);

  /** Al entrar en Delivery/Heladería: recarga suave solo si aún no hay tiendas. */
  useEffect(() => {
    if (!usesDeliverySidebarCore || !businessScopeId) return;
    if (activeStore.retailWorkCenters.length > 0 || activeStore.allPointsOfSale.length > 0) return;
    void activeStore.refresh({ force: false });
  }, [
    usesDeliverySidebarCore,
    businessScopeId,
    activeStore.retailWorkCenters.length,
    activeStore.allPointsOfSale.length,
    activeStore.refresh,
  ]);

  useEffect(() => {
    if (!usesOpsStoreSidebar) return;
    if (opsStoreLoading) return;
    if (opsStoreRows.length > 0) return;
    if (activeStore.retailWorkCenters.length > 0 || activeStore.allPointsOfSale.length > 0) return;
    const onFocus = () => {
      void activeStore.refresh({ force: false });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [
    usesOpsStoreSidebar,
    opsStoreLoading,
    opsStoreRows.length,
    activeStore.retailWorkCenters.length,
    activeStore.allPointsOfSale.length,
    activeStore.refresh,
  ]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({
    home: false,
    'worker-main': true,
    salesPoints: true,
    ...Object.fromEntries(sidebarGroupDefs.map((g) => [g.id, false])),
    ...Object.fromEntries(workerSidebarGroupDefs.map((g) => [g.id, false])),
  }));

  useEffect(() => {
    if (!usesOpsStoreSidebar) return;
    if (displayOpsStoreRows.length === 0) return;
    setExpandedGroups((prev) => ({ ...prev, salesPoints: true }));
  }, [usesOpsStoreSidebar, displayOpsStoreRows.length]);

  /** Centro de trabajo marcado en sidebar = misma lógica que Topbar (PDV `_id` o `wc:`). */
  const selectedSidebarWorkCenterId = useMemo(() => {
    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
    if (!bid || !dataUserId) return null;
    const raw = activeStore.activePreferenceRaw?.trim();
    const points = activeStore.pointsOfSale;
    if (!raw) {
      const aid = activeStore.activeSalesPointId;
      if (aid && points.length) {
        const p = points.find((x) => x._id === aid);
        if (p?.workCenterId) return String(p.workCenterId).trim();
      }
      return null;
    }
    if (raw.startsWith('wc:')) return raw.slice(3).trim() || null;
    const pdv = points.find((x) => x._id === raw);
    if (pdv?.workCenterId) return String(pdv.workCenterId).trim();
    const spHit = salesPoints.find(
      (sp) => String(sp._id || sp.id || '') === raw || String(sp.id || '') === raw,
    );
    if (spHit) return String(spHit._id || spHit.id || '').trim() || null;
    return null;
  }, [
    currentBusiness,
    user,
    activeStore.activePreferenceRaw,
    activeStore.activeSalesPointId,
    activeStore.pointsOfSale,
    salesPoints,
  ]);

  /** Fila única activa en sidebar tiendas (evita doble selección PDV + centro). */
  const activeOpsStoreRowId = useMemo(
    () => resolveActiveOpsStoreRowId(
      displayOpsStoreRows,
      activeStore.activeSalesPointId,
      activeStore.activePreferenceRaw,
    ),
    [displayOpsStoreRows, activeStore.activeSalesPointId, activeStore.activePreferenceRaw],
  );

  const activeCompraventaStoreRowId = useMemo(
    () => resolveActiveWorkCenterRowId(
      salesPoints.map((sp) => String(sp._id || sp.id || '').trim()).filter(Boolean),
      selectedSidebarWorkCenterId,
    ),
    [salesPoints, selectedSidebarWorkCenterId],
  );

  const selectSidebarStore = useCallback((rawId: string) => {
    if (!rawId.trim()) return;
    const id = rawId.trim();
    const pdvPool =
      activeStore.allPointsOfSale.length > 0 ? activeStore.allPointsOfSale : activeStore.pointsOfSale;
    if (usesOpsStoreSidebar) {
      const row = displayOpsStoreRows.find((r) => r.rowId === id);
      const pdvId = row?.pdvId || pdvPool.find((p) => p._id === id)?._id;
      if (pdvId) {
        activeStore.setActiveSalesPoint(pdvId);
        void activeStore.refresh();
        return;
      }
      if (row?.workCenterId) {
        activeStore.setActiveWorkCenterPreference(row.workCenterId);
        void activeStore.refresh();
      }
      return;
    }
    const pdv = pdvPool.find(
      (p) => String(p.workCenterId || '').trim() === id && p.active !== false,
    );
    if (pdv) {
      activeStore.setActiveSalesPoint(pdv._id);
    } else {
      activeStore.setActiveWorkCenterPreference(id);
    }
  }, [usesOpsStoreSidebar, displayOpsStoreRows, activeStore]);

  const getActiveCompanySelector = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (window.innerWidth < 768 && mobileOpen) {
      return mobileCompanySelectorRef.current;
    }
    return desktopCompanySelectorRef.current;
  }, [mobileOpen]);

  const updateCompanyDropdownPosition = useCallback(() => {
    const anchor = getActiveCompanySelector();
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const narrow = typeof window !== 'undefined' && window.innerWidth >= 768 && collapsed;
    if (narrow) {
      setCompanyDropdownStyle({ top: rect.top, left: rect.right + 8, width: 256 });
    } else {
      setCompanyDropdownStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [collapsed, getActiveCompanySelector]);

  useLayoutEffect(() => {
    if (!showCompanyDropdown) {
      setCompanyDropdownStyle(null);
      return;
    }
    updateCompanyDropdownPosition();
    window.addEventListener('resize', updateCompanyDropdownPosition);
    window.addEventListener('scroll', updateCompanyDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateCompanyDropdownPosition);
      window.removeEventListener('scroll', updateCompanyDropdownPosition, true);
    };
  }, [showCompanyDropdown, updateCompanyDropdownPosition]);

  useEffect(() => {
    if (!showCompanyDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (desktopCompanySelectorRef.current?.contains(target)) return;
      if (mobileCompanySelectorRef.current?.contains(target)) return;
      if (companyDropdownPanelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-company-dropdown-root]')) return;
      setShowCompanyDropdown(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCompanyDropdown]);

  useEffect(() => {
    const close = () => setShowCompanyDropdown(false);
    window.addEventListener('vertial:close-company-dropdown', close);
    return () => window.removeEventListener('vertial:close-company-dropdown', close);
  }, []);

  const navScrollDesktopRef = useRef<HTMLElement>(null);
  const navScrollMobileRef = useRef<HTMLElement>(null);

  const deliveryNav = useDeliveryActivationNav();
  const compraventaNav = useCompraventaActivationNav();
  const eventsNav = useEventsActivationNav();
  const planTier = useEffectivePlanTier();

  const menuItems: SidebarItem[] = useMemo(() => {
    return menuItemDefs.map((item) => {
      const base: SidebarItem = {
        ...item,
        label:
          isRestaurantVertical && item.id === 'tpv-rapido'
            ? 'TPV sala'
            : isRestaurantVertical && item.id === 'cocina'
              ? 'Cocina'
              : isRestaurantVertical && item.id === 'web-config'
                ? 'Pág. web'
                : t(`nav.${item.navKey}`),
      };
      let resolved: SidebarItem;
      if (eventsNav.isEvents && !item.disabled) {
        const lock = getEventsSidebarItemLock(item.id, {
          hasPricedService: eventsNav.hasPricedService,
          hasClient: eventsNav.hasClient,
          hasEvent: eventsNav.hasEvent,
        });
        resolved = !lock.disabled
          ? base
          : {
              ...base,
              disabled: true,
              lockTitle: lock.title,
            };
      } else if (compraventaNav.isCompraventa && !item.disabled) {
        const lock = getCompraventaSidebarItemLock(item.id, {
          storeReady: compraventaNav.storeReady,
        });
        resolved = !lock.disabled
          ? base
          : {
              ...base,
              disabled: true,
              lockTitle: lock.title,
            };
      } else if (isRestaurantVertical) {
        const pathOverride = RESTAURANT_SIDEBAR_PATH_OVERRIDES[item.id];
        resolved = pathOverride ? { ...base, path: pathOverride } : base;
      } else if (!deliveryNav.isDelivery || item.disabled) {
        resolved = base;
      } else if (item.id === 'reports') {
        resolved = { ...base, path: '/saas/vertical/delivery/informes' };
      } else {
        const lock = getDeliverySidebarItemLock(item.id, {
          pdvReady: deliveryNav.pdvReady,
          brandReady: deliveryNav.brandReady,
        });
        resolved = !lock.disabled
          ? base
          : {
              ...base,
              disabled: true,
              lockTitle: lock.title,
            };
      }
      return resolved;
    });
  }, [
    t,
    deliveryNav.isDelivery,
    deliveryNav.pdvReady,
    deliveryNav.brandReady,
    compraventaNav.isCompraventa,
    compraventaNav.storeReady,
    eventsNav.isEvents,
    eventsNav.hasPricedService,
    eventsNav.hasClient,
    eventsNav.hasEvent,
    isRestaurantVertical,
  ]);

  const sidebarGroups: SidebarGroup[] = sidebarGroupDefs.map(g => {
    const override = vertical ? VERTICAL_GROUP_ITEM_OVERRIDES[vertical]?.[g.id] : undefined;
    const isCompraventaCommercial = g.id === 'commercial' && vertical === 'carDealership';
    let itemIds = override ? [...override] : [...g.itemIds];
    if (g.id === 'catalogProviders') {
      if (usesDeliverySidebarCore || isRestaurantVertical) {
        // TPV: Carta · Almacén · Compras · Consumos · Correo facturas (abajo).
        itemIds = [
          'catalog-carta',
          'catalog-stock-tpv',
          'catalog-purchases',
          'catalog-consumos',
          'catalog-invoice-email',
        ];
      } else {
        itemIds = itemIds.filter((id) => id !== 'costing');
        if (!itemIds.includes('catalog-invoice-email')) {
          itemIds = [...itemIds, 'catalog-invoice-email'];
        }
      }
    }
    if (g.id === 'butcherShop' && vertical === 'butcherShop' && !currentBusiness?.ownDeliveryEnabled) {
      itemIds = itemIds.filter((id) => id !== 'butcher-reparto');
    }
    return {
      id: g.id,
      icon: isCompraventaCommercial
        ? null
        : g.id === 'delivery' && isRestaurantVertical
          ? <UtensilsCrossed className="w-4 h-4 shrink-0" />
          : g.id === 'delivery' && isHeladeriaVertical
            ? <IceCream className="w-4 h-4 shrink-0" />
            : g.icon,
      itemIds,
      label: g.id === 'equipo'
        ? 'RRHH'
        : isCompraventaCommercial
          ? t('sidebar.groups.compraventaCommercial')
          : g.id === 'delivery' && isRestaurantVertical
            ? t('sidebar.groups.restaurant')
            : g.id === 'delivery' && isHeladeriaVertical
              ? t('sidebar.groups.iceCreamShop')
              : t(`sidebar.groups.${g.id}`),
    };
  });

  const workerMenuItems: SidebarItem[] = workerMenuItemDefs.map(item => ({
    ...item,
    label: t(`nav.${item.navKey}`),
  }));

  const workerGroups: SidebarGroup[] = workerSidebarGroupDefs.map(g => ({
    id: g.id,
    icon: g.icon,
    itemIds: [...g.itemIds],
    label: t(`sidebar.groups.${g.id}`),
  }));

  const workerHomeGroup: SidebarGroup = {
    ...WORKER_HOME_GROUP,
    label: t('sidebar.groups.workerMain'),
    itemIds: [
      ...WORKER_HOME_GROUP.itemIds,
      ...(vertical === 'cleaning' ? ['worker-materials' as const] : []),
      ...(vertical === 'butcherShop' ? ['worker-butcher-orders' as const] : []),
      ...(vertical === 'butcherShop' && currentBusiness?.ownDeliveryEnabled
        ? ['worker-butcher-reparto' as const]
        : []),
    ],
  };

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'UU';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleNavigate = (path: string) => {
    navigate(saasPathWithBusinessScope(path, currentBusiness?.business_id), {
      preventScrollReset: true,
    });
    onMobileClose();
  };

  const openManageCompanies = () => {
    setShowCompanyDropdown(false);
    window.requestAnimationFrame(() => {
      handleNavigate('/saas/settings/empresas');
    });
  };

  const companyDropdownPanel = companyDropdownStyle ? (
    <div
      ref={companyDropdownPanelRef}
      data-company-dropdown-root
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-[45] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
      style={{
        top: companyDropdownStyle.top,
        left: companyDropdownStyle.left,
        width: companyDropdownStyle.width,
      }}
    >
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('topbar.myCompanies')}</p>
      </div>
      <div className="max-h-52 overflow-y-auto py-1">
        {businesses.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <Building2 className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-1" />
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('topbar.noCompanies')}</p>
          </div>
        ) : (
          businessesByUsage.map((business) => {
            const isActiveBiz = currentBusiness?.business_id === business.business_id;
            const bizInitials = business.name.slice(0, 2).toUpperCase();
            return (
              <button
                key={business.business_id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  const changed = switchActiveBusiness(business.business_id);
                  setShowCompanyDropdown(false);
                  if (changed) onMobileClose();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${isActiveBiz ? 'bg-blue-50/80 dark:bg-blue-950/40' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 overflow-hidden">
                  {business.logo ? (
                    <img src={business.logo} alt={business.name} className="w-8 h-8 object-cover rounded-lg" />
                  ) : (
                    <span className="text-xs font-bold text-[var(--v-blue,#2563eb)] dark:text-blue-300">{bizInitials}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isActiveBiz ? 'text-[var(--v-blue,#2563eb)] dark:text-blue-300' : 'text-slate-900 dark:text-slate-100'}`}>
                    {business.name}
                  </p>
                  {business.city ? (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{business.city}</p>
                  ) : null}
                </div>
                {isActiveBiz && <Check className="w-3.5 h-3.5 text-[var(--v-blue,#2563eb)] dark:text-blue-400 flex-shrink-0" />}
              </button>
            );
          })
        )}
      </div>
      <div className="border-t border-gray-100 dark:border-gray-800 p-1.5">
        <button
          type="button"
          data-company-dropdown-manage
          onClick={(event) => {
            event.stopPropagation();
            openManageCompanies();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('topbar.manageCompanies')}</span>
        </button>
      </div>
    </div>
  ) : null;

  const handleMenuItemClick = (item: SidebarItem) => {
    if (item.disabled) {
      if (item.lockTitle) {
        toast.error(item.lockTitle);
      }
      return;
    }
    if (item.isNew && !seenNewItems.has(item.id)) {
      markNewItemSeen(item.id);
    }
    if (item.id === 'tech') {
      window.open('/mecanico', '_blank', 'noopener,noreferrer');
      onMobileClose();
      return;
    }
    if (
      isEventsVertical
      && (item.id === 'salesPoints-settings' || item.id === 'salesPoints-add')
    ) {
      setShowEventsPortablePdvModal(true);
      onMobileClose();
      return;
    }
    if (item.id.startsWith('sp-')) {
      const rawId = item.id.slice('sp-'.length);
      if (rawId) {
        selectSidebarStore(rawId);
        if (usesOpsStoreSidebar) {
          handleNavigate(isRestaurantVertical ? '/saas/restaurant-ops' : '/saas/delivery-ops');
          onMobileClose();
          return;
        }
        if (isCompraventa) {
          handleNavigate('/saas/vehicles');
          onMobileClose();
          return;
        }
      }
      onMobileClose();
      return;
    }
    handleNavigate(resolveSidebarItemPath(item, isRestaurantVertical));
  };

  const visibleMenuItemsBase = menuItems;

  const permissionMap = user?.permissions || {};

  // Items que SOLO pueden ver los dueños del negocio (owner/admin/manager).
  // Sirve tanto para el filtro de sidebar como para no colar nada admin en modo worker.
  const BUSINESS_OWNER_ONLY_IDS = new Set<string>([
    'dashboard', 'alertas', 'reports', 'team', 'team-schedules', 'hr-requests', 'horarios-vacaciones', 'commissions', 'payroll', 'gestoria',
    'finance', 'income-expenses', 'ebitda', 'taxes', 'verifactu', 'bank-reconciliation',
    'client-billing', 'costing', 'billing',
    'suppliers', 'compras-stock', 'catalog-purchases', 'catalog-invoice-email',
    'configuracion', 'settings', 'admin', 'gdpr',
    'pipeline', 'sales-metrics', 'operations', 'affiliates',
    // 'delivery-clients' apunta a /saas/delivery-ops?panel=clients (también owner-only).
    'delivery-ops', 'restaurant-ops', 'delivery-clients', 'clockins', 'groups', 'web-config', 'web-orders', 'delivery-integrations',
    'cleaning-hub', 'cleaning-workers', 'cleaning-services', 'cleaning-routes',
    'cleaning-quality', 'cleaning-reviews', 'cleaning-incidents',
    'gym-classes', 'gym-memberships', 'gym-routines', 'gym-access',
    'clinic-history', 'clinic-treatments', 'clinic-prescriptions',
    'hotel-rooms',
    'construction-ops', 'construction-projects', 'construction-budgets',
    'construction-payments', 'construction-collections', 'construction-closure',
    'academy-courses', 'academy-enrollments', 'academy-grades',
    'realestate-properties', 'realestate-contracts', 'realestate-appraisals',
    'lawyer-cases', 'lawyer-deadlines',
    'nightclub-events', 'nightclub-vip', 'nightclub-promoters', 'nightclub-artists',
    'salon-services', 'salon-loyalty',
    'butcher-hub', 'butcher-clients', 'butcher-orders', 'butcher-sales', 'butcher-tpv',
    'butcher-products', 'butcher-despiece', 'butcher-reparto', 'butcher-basculas',
    'butcher-traceability', 'butcher-reports',
    // butcher-purchases / butcher-waste: workers con permiso butcher_* (no owner-only)
    'tobacco-regulatory',
    'taxi-fleet', 'taxi-trips', 'taxi-shifts',
    'pharmacy-guard',
    'vet-history',
    'spareparts-compatibility',
    'carwash-services', 'carwash-memberships',
    'scrapyard-deregistrations', 'scrapyard-environment',
    'compraventa-hub', 'dealership-workers', 'gastos-preparacion', 'compraventa-crm',
  ]);

  const visibleMenuItems = visibleMenuItemsBase.filter((item) => {
    if (!isMenuItemVisibleForVertical(item.id, vertical)) {
      return false;
    }
    if (!isSidebarItemUnlockedForPlan(item.id, planTier)) {
      return false;
    }
    if (!user) {
      return true;
    }
    // Trabajador: nunca ver items admin-only / de empresa.
    if (treatAsWorkerNav && BUSINESS_OWNER_ONLY_IDS.has(item.id)) {
      return false;
    }
    if (treatAsWorkerNav && WORKER_SIDEBAR_HIDDEN_ITEM_IDS.has(item.id)) {
      return false;
    }
    // Items siempre accesibles para el owner / gestor RRHH.
    if (!treatAsWorkerNav && ['dashboard', 'settings', 'configuracion', 'chat', 'team', 'payroll', 'gestoria', 'hr-requests', 'horarios-vacaciones', 'clockins'].includes(item.id)) {
      return true;
    }
    // Items operativos siempre visibles para todos (chat es transversal).
    if (item.id === 'chat') {
      return true;
    }
    // Mapeo item.id → clave de permiso (TEAM_PERMISSION_KEYS). Sin esto, los items
    // operativos de delivery (tpv, tpv-rapido, tpv-locales, caja, sala, delivery-clients)
    // caían al fallback `return !isWorker → false`, y un trabajador delivery NO VEÍA
    // nada en su vertical (aunque tuviera permisos de delivery/cash_register).
    const tpvLike =
      item.id === 'tpv' ||
      item.id === 'tpv-rapido' ||
      item.id === 'tpv-locales' ||
      item.id === 'caja' ||
      item.id === 'butcher-tpv';
    const restaurantFloorOps =
      item.id === 'sala' || item.id === 'cocina' || item.id === 'reservas' || item.id === 'lista-espera';
    const permission = permissionMap[item.id]
      || (item.id === 'catalog-stock' ? permissionMap.catalog : undefined)
      || (item.id === 'leads' ? permissionMap.clients : undefined)
      || (item.id === 'billing' ? permissionMap.finance : undefined)
      || (item.id === 'client-billing' ? permissionMap.finance : undefined)
      || (tpvLike ? (permissionMap.cash_register || permissionMap.sales) : undefined)
      || (restaurantFloorOps && isRestaurantVertical
        ? (item.id === 'reservas'
          ? (permissionMap.reservations || permissionMap.sala)
          : (permissionMap.sala || (item.id === 'sala' ? permissionMap.reservations : undefined)))
        : undefined)
      || (restaurantFloorOps && !isRestaurantVertical ? permissionMap.delivery : undefined)
      || (item.id.startsWith('doc-') ? permissionMap.documents : undefined)
      || (item.id === 'compraventa-vehiculos' ? permissionMap.vehicles : undefined)
      || (item.id === 'entrada-vehiculo' ? permissionMap.vehicles : undefined)
      || (item.id === 'compraventa-hub' ? permissionMap.vehicles : undefined)
      || (item.id === 'compraventa-ventas' ? permissionMap.sales : undefined)
      || (item.id === 'compraventa-compras' ? permissionMap.vehicles : undefined)
      || (item.id === 'compraventa-fiscal' ? permissionMap.vehicles : undefined)
      || (item.id === 'compraventa-tasaciones' ? permissionMap.vehicles : undefined)
      || (item.id === 'compraventa-entregas' ? permissionMap.sales : undefined)
      || (item.id === 'compraventa-crm' ? permissionMap.clients : undefined)
      || (item.id === 'publicacion-venta' ? permissionMap.vehicles : undefined)
      || (item.id === 'butcher-purchases' ? permissionMap.butcher_purchases : undefined)
      || (item.id === 'butcher-waste' ? permissionMap.butcher_waste : undefined)
      || (['workshop', 'parts', 'tech'].includes(item.id) ? (permissionMap.workshop || permissionMap.vehicles) : undefined)
      || (item.id.startsWith('events-') ? permissionMap.sales : undefined);
    if (!permission) {
      // Sin permiso definido: owner/gestor RRHH lo ve; worker operativo no.
      return !treatAsWorkerNav;
    }
    return Boolean(permission.view);
  });

  const isItemActive = (item: SidebarItem) => {
    const catalogTab = location.pathname.startsWith('/saas/catalog')
      ? (new URLSearchParams(location.search).get('tab') || 'catalog')
      : '';
    return (
    `${location.pathname}${location.search}` === item.path ||
    location.pathname === item.path ||
    (item.id === 'hr-requests' && location.pathname.startsWith('/saas/equipo/solicitudes')) ||
    (item.id === 'horarios-vacaciones' && location.pathname.startsWith('/saas/equipo/horarios-vacaciones')) ||
    (item.id === 'alertas' && location.pathname.startsWith('/saas/alerts')) ||
    (item.id === 'configuracion' && location.pathname.startsWith('/saas/configuracion')) ||
    (item.id === 'settings' && location.pathname.startsWith('/saas/settings')) ||
    (item.id === 'salesPoints-settings' &&
      (location.pathname.startsWith('/saas/settings/tienda') ||
        location.pathname.startsWith('/saas/settings/tiendas') ||
        location.pathname.startsWith('/saas/settings/centros-de-trabajo'))) ||
    (item.id === 'salesPoints-add' &&
      (location.pathname.startsWith('/saas/settings/tienda') ||
        location.pathname.startsWith('/saas/settings/tiendas') ||
        location.pathname.startsWith('/saas/settings/centros-de-trabajo'))) ||
    (item.id === 'vehicles' && location.pathname.startsWith('/saas/locations')) ||
    (item.id === 'compraventa-vehiculos' && (location.pathname.startsWith('/saas/vehicles') || location.pathname.startsWith('/saas/locations'))) ||
    (item.id === 'compraventa-ventas' && location.pathname.startsWith('/saas/vertical/compraventa/ventas')) ||
    (item.id === 'compraventa-compras' && location.pathname.startsWith('/saas/vertical/compraventa/compras')) ||
    (item.id === 'compraventa-fiscal' && location.pathname.startsWith('/saas/vertical/compraventa/calculadora-fiscal')) ||
    (item.id === 'publicacion-venta' && location.pathname.startsWith('/saas/vertical/compraventa/publicacion-venta')) ||
    (item.id === 'compraventa-tasaciones' && location.pathname.startsWith('/saas/vertical/compraventa/tasaciones')) ||
    (item.id === 'compraventa-entregas' && location.pathname.startsWith('/saas/vertical/compraventa/entregas')) ||
    (item.id === 'compraventa-crm' && location.pathname.startsWith('/saas/vertical/compraventa/crm')) ||
    (item.id === 'entrada-vehiculo' && location.pathname.startsWith('/saas/vertical/compraventa/entrada-vehiculo')) ||
    (item.id === 'compraventa-hub' && location.pathname.startsWith('/saas/vertical/compraventa') && !location.pathname.includes('/compras') && !location.pathname.includes('/calculadora-fiscal') && !location.pathname.includes('/ventas') && !location.pathname.includes('/tasaciones') && !location.pathname.includes('/entregas') && !location.pathname.includes('/crm') && !location.pathname.includes('/gastos') && !location.pathname.includes('/entrada-vehiculo') && !location.pathname.includes('/publicacion-venta')) ||
    (item.id === 'dealership-workers' && location.pathname.startsWith('/saas/dealership-workers')) ||
    (item.id === 'gastos-preparacion' && location.pathname.startsWith('/saas/vertical/compraventa/gastos-preparacion')) ||
    (item.id === 'doc-vehiculo' && location.pathname.startsWith('/saas/documents') && location.search.includes('tab=vehiculo')) ||
    (item.id === 'doc-contratos-cv' && location.pathname.startsWith('/saas/documents') && location.search.includes('tab=contratos')) ||
    (item.id === 'doc-facturas-cv' && location.pathname.startsWith('/saas/documents') && location.search.includes('tab=facturas')) ||
    (item.id === 'doc-itv-cv' && location.pathname.startsWith('/saas/documents') && location.search.includes('tab=itv')) ||
    (item.id === 'doc-reparacion-cv' && location.pathname.startsWith('/saas/documents') && location.search.includes('tab=reparacion')) ||
    (item.id === 'doc-cliente-cv' && location.pathname.startsWith('/saas/documents') && location.search.includes('tab=cliente')) ||
    (item.id === 'doc-anexos-cv' && location.pathname.startsWith('/saas/documents') && location.search.includes('tab=anexos')) ||
    (item.id === 'clients' && (location.pathname.startsWith('/saas/clients') || location.pathname.startsWith('/saas/crm/clientes'))) ||
    (item.id === 'workshop' && location.pathname.startsWith('/saas/workshop')) ||
    (item.id === 'parts' && location.pathname.startsWith('/saas/parts')) ||
    (item.id === 'tpv' && (location.pathname === '/saas/tpv' || location.pathname === '/saas/tpv/locales')) ||
    (item.id === 'tpv-rapido'
      && (location.pathname.startsWith('/saas/vertical/delivery/tpv')
        || location.pathname.startsWith('/saas/caja/tpv'))) ||
    (item.id === 'tpv-locales' && (location.pathname === '/saas/tpv/locales' || location.pathname === '/saas/tpv')) ||
    (item.id === 'delivery-ops'
      && location.pathname.startsWith('/saas/delivery-ops')
      && !['clients', 'promotions'].includes(new URLSearchParams(location.search).get('panel') || '')) ||
    (item.id === 'restaurant-ops' && location.pathname.startsWith('/saas/restaurant-ops')) ||
    (item.id === 'promotions' && location.pathname.startsWith('/saas/promotions')) ||
    (item.id === 'caja' && (location.pathname.startsWith('/saas/caja') || location.pathname.startsWith('/saas/vertical/delivery/caja'))) ||
    (item.id === 'sala' && location.pathname.startsWith('/saas/sala')) ||
    (item.id === 'cocina' && location.pathname.startsWith('/saas/cocina')) ||
    (item.id === 'reports' && location.pathname.startsWith('/saas/vertical/restaurant/informes')) ||
    (item.id === 'reservas' && (location.pathname.startsWith('/saas/reservations') || location.pathname.startsWith('/saas/reservas'))) ||
    (item.id === 'lista-espera' && location.pathname.startsWith('/saas/lista-espera')) ||
    (item.id === 'web-orders' && location.pathname.startsWith('/saas/web-orders')) ||
    (item.id === 'web-config' && location.pathname.startsWith('/saas/web-config')) ||
    (item.id === 'delivery-integrations'
      && (location.pathname.startsWith('/saas/vertical/delivery/integraciones')
        || location.pathname.startsWith('/saas/vertical/restaurant/integraciones'))) ||
    (item.id === 'cleaning-hub' && location.pathname.startsWith('/saas/cleaning-hub')) ||
    (item.id === 'cleaning-clients' && location.pathname.startsWith('/saas/vertical/limpieza/clientes')) ||
    (item.id === 'cleaning-workers' && location.pathname.startsWith('/saas/cleaning-workers')) ||
    (item.id === 'cleaning-services' && location.pathname.startsWith('/saas/cleaning-services')) ||
    (item.id === 'cleaning-routes' && location.pathname.startsWith('/saas/cleaning-routes')) ||
    (item.id === 'cleaning-checklist' && location.pathname.startsWith('/saas/cleaning-checklist')) ||
    (item.id === 'cleaning-quality' && location.pathname.startsWith('/saas/cleaning-quality')) ||
    (item.id === 'cleaning-reviews' && location.pathname.startsWith('/saas/cleaning-reviews')) ||
    (item.id === 'cleaning-incidents' && location.pathname.startsWith('/saas/cleaning-incidents')) ||
    (item.id === 'cleaning-contracts' && location.pathname.startsWith('/saas/vertical/limpieza/servicios')) ||
    (item.id === 'cleaning-billing' && (location.pathname.startsWith('/saas/cleaning-billing') || location.pathname.startsWith('/saas/vertical/limpieza/facturacion'))) ||
    (item.id === 'cleaning-materials' && location.pathname.startsWith('/saas/cleaning-materials')) ||
    (item.id === 'cleaning-reports' && (location.pathname.startsWith('/saas/cleaning-reports') || location.pathname.startsWith('/saas/vertical/limpieza/informes'))) ||
    (item.id === 'cleaning-execution' && location.pathname.startsWith('/saas/cleaning-execution')) ||
    (item.id === 'catalog' && location.pathname.startsWith('/saas/catalog') && catalogTab === 'catalog') ||
    (item.id === 'catalog-carta' && location.pathname.startsWith('/saas/catalog') && ['catalog', 'escandallo', 'ingredientes', 'tpv-templates'].includes(catalogTab)) ||
    (item.id === 'catalog-stock' && location.pathname.startsWith('/saas/inventory')) ||
    (item.id === 'catalog-stock-tpv' && location.pathname.startsWith('/saas/catalog') && catalogTab === 'stock') ||
    (item.id === 'catalog-purchases' && location.pathname.startsWith('/saas/catalog') && ['suppliers', 'purchase-orders', 'albaranes', 'invoices'].includes(catalogTab)) ||
    (item.id === 'catalog-consumos' && location.pathname.startsWith('/saas/catalog') && catalogTab === 'staff-consumption') ||
    (item.id === 'costing' && location.pathname.startsWith('/saas/catalog') && catalogTab === 'escandallo') ||
    (item.id === 'costing' && location.pathname.startsWith('/saas/costing')) ||
    (item.id === 'suppliers' && location.pathname.startsWith('/saas/suppliers')) ||
    (item.id === 'catalog-invoice-email' && location.pathname.startsWith('/saas/correo-facturas')) ||
    (item.id === 'income-expenses' && location.pathname.startsWith('/saas/income-expenses')) ||
    (item.id === 'ebitda' && location.pathname.startsWith('/saas/ebitda')) ||
    (item.id === 'taxes' && location.pathname.startsWith('/saas/taxes')) ||
    (item.id === 'bank-reconciliation' && location.pathname.startsWith('/saas/bank-reconciliation')) ||
    (item.id === 'promotions' && location.pathname.startsWith('/saas/promotions')) ||
    (item.id === 'payroll' && location.pathname.startsWith('/saas/payroll')) ||
    (item.id === 'gestoria' && location.pathname.startsWith('/saas/gestoria')) ||
    (item.id.startsWith('worker-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('gym-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('clinic-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('hotel-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('construction-') &&
      (item.id === 'construction-ops'
        ? location.pathname.startsWith('/saas/construction-ops') || location.pathname.startsWith('/saas/vertical/construccion')
        : location.pathname.startsWith(item.path))) ||
    (item.id.startsWith('academy-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('realestate-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('lawyer-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('nightclub-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('events-') && (() => {
      if (item.id === 'events-hub') {
        return location.pathname === '/saas/vertical/eventos';
      }
      if (item.id === 'events-quotes') {
        return location.pathname.startsWith('/saas/vertical/eventos/presupuestos');
      }
      if (item.id === 'events-route') {
        return location.pathname.startsWith('/saas/vertical/eventos/ruta');
      }
      if (item.id === 'events-pipeline') {
        return location.pathname.startsWith('/saas/vertical/eventos/contrataciones')
          || /^\/saas\/vertical\/eventos\/(?!nueva-contratacion|contrataciones|presupuestos|ruta)[^/]+$/.test(location.pathname);
      }
      return location.pathname.startsWith(item.path);
    })()) ||
    (item.id.startsWith('salon-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('scrapyard-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('spareparts-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('taxi-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('pharmacy-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('carwash-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('vet-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('butcher-') && (
      location.pathname.startsWith(item.path)
      || (item.id === 'butcher-tpv' && location.pathname.startsWith('/saas/butcher-tpv'))
      || (item.id === 'butcher-reports' && location.pathname.startsWith('/saas/butcher-reports'))
    )) ||
    (item.id.startsWith('sp-') && (() => {
      const rawId = item.id.slice('sp-'.length);
      if (!rawId) return false;
      if (usesOpsStoreSidebar) {
        return activeOpsStoreRowId === rawId;
      }
      return activeCompraventaStoreRowId === rawId;
    })())
    );
  };

  const visibleById = new Map(visibleMenuItems.map((item) => [item.id, item]));
  const COMMON_SIDEBAR_GROUPS = new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion']);
  const allowedGroupsList = sidebarGroups.filter((g) => allowedGroups.has(g.id));
  const filteredGroups: SidebarGroup[] = [
    HOME_GROUP,
    ...allowedGroupsList.filter((g) => !COMMON_SIDEBAR_GROUPS.has(g.id)),
    ...allowedGroupsList.filter((g) => COMMON_SIDEBAR_GROUPS.has(g.id)),
  ];
  const workCentersSettingsPath = '/saas/settings/tienda';
  const workCentersAddPath = `${workCentersSettingsPath}?action=new-pdv`;

  const salesPointRows: SidebarItem[] =
    usesOpsStoreSidebar
      ? displayOpsStoreRows.map((row) => {
          const subParts: string[] = [];
          if (row.code) subParts.push(row.code);
          if (row.needsPdv) subParts.push('Sin PDV');
          else if (row.inactive) subParts.push('Inactiva');
          const terminalCode = String(row.terminalCode || '').trim().toUpperCase() || undefined;
          return {
            id: `sp-${row.rowId}`,
            label: row.title,
            subLabel: subParts.length ? subParts.join(' · ') : undefined,
            terminalCode,
            inactive: row.inactive,
            icon: <Store className="w-3.5 h-3.5" />,
            path: '#',
          };
        })
      : salesPoints.map((sp) => {
        const terminalCode = isEventsVertical
          ? (eventsTabletCodeByWc[sp._id] || undefined)
          : undefined;
        return {
          id: `sp-${sp._id}`,
          label: sp.name,
          subLabel: isEventsVertical && !terminalCode ? 'Sin código TPV' : undefined,
          terminalCode,
          icon: <Store className="w-3.5 h-3.5" />,
          path: '#',
        };
      });

  const workCentersSidebarCount =
    usesOpsStoreSidebar ? displayOpsStoreRows.length : salesPoints.length;

  /** Sin PDV: CTA «Primer centro» (abre alta). Con al menos uno: lista + «Nuevo centro». */
  const workCentersSidebarItems: SidebarItem[] =
    showOpsStoreLoading
      ? [
          {
            id: 'salesPoints-loading',
            label: isEventsVertical
              ? 'Cargando PDV…'
              : t('sidebar.workCenters.loading', 'Cargando tiendas…'),
            icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
            path: '#',
            disabled: true,
          },
        ]
      : workCentersSidebarCount === 0
      ? [
          {
            id: 'salesPoints-settings',
            label: isEventsVertical
              ? 'Crear PDV portátil'
              : t('sidebar.workCenters.firstCenter', 'Primer centro'),
            icon: <Plus className="w-5 h-5" />,
            path: workCentersAddPath,
          },
        ]
      : [
          ...salesPointRows,
          {
            id: 'salesPoints-add',
            label: isEventsVertical
              ? 'Nuevo PDV portátil'
              : t('sidebar.workCenters.newCenter', 'Nuevo centro'),
            icon: <Plus className="w-3.5 h-3.5" />,
            path: workCentersAddPath,
          },
        ];

  const salesPointsGroup: (SidebarGroup & { items: SidebarItem[] }) = {
    id: 'salesPoints',
    label: isEventsVertical
      ? 'PDV portátil'
      : t('sidebar.groups.salesPoints', 'Centros de trabajo'),
    icon: isEventsVertical
      ? <Store className="w-4 h-4 shrink-0" />
      : <Building2 className="w-4 h-4 shrink-0" />,
    itemIds: workCentersSidebarItems.map((i) => i.id),
    items: workCentersSidebarItems,
  };

  const groupedVisibleItems = (() => {
    const mapped = filteredGroups
      .map((group) => ({
        ...group,
        items: group.itemIds
          .map((id) => visibleById.get(id))
          .filter((item): item is SidebarItem => Boolean(item)),
      }))
      .filter((group) => group.items.length > 0);
    const [home, ...rest] = mapped;
    const withCenters = showWorkCentersSidebar
      ? (home ? [home, salesPointsGroup, ...rest] : [salesPointsGroup, ...rest])
      : mapped;
    return withCenters;
  })();

  // Al cambiar de ruta, abrir el grupo que contiene la página activa (sin impedir cerrarlo después).
  const prevNavLocationRef = useRef(`${location.pathname}${location.search}`);
  useEffect(() => {
    if (workerMode) return;
    const current = `${location.pathname}${location.search}`;
    if (current === prevNavLocationRef.current) return;
    prevNavLocationRef.current = current;

    setExpandedGroups((prev) => {
      const updates: Record<string, boolean> = {};
      for (const group of groupedVisibleItems) {
        if (group.id === 'home' || group.id === 'salesPoints') continue;
        if (group.items.some((item) => isItemActive(item))) {
          updates[group.id] = true;
        }
      }
      if (Object.keys(updates).length === 0) return prev;
      const needsUpdate = Object.entries(updates).some(([id, val]) => prev[id] !== val);
      if (!needsUpdate) return prev;
      return { ...prev, ...updates };
    });
    // Solo reaccionar a la URL: groupedVisibleItems cambia de identidad cada render y provocaba temblores.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional
  }, [location.pathname, location.search, workerMode]);

  const bottomItemIds = allowedBottom;
  const bottomVisibleItems = visibleMenuItems.filter((item) => bottomItemIds.has(item.id));

  const workerById = new Map(workerMenuItems.map((item) => [item.id, item]));
  const WORKER_UNLINKED_CONFIG_ITEM_IDS = new Set(['worker-profile', 'worker-notifications', 'worker-security']);
  const workerUnlinkedMenuItems: SidebarItem[] = [
    {
      id: 'worker-claim-company',
      navKey: 'workerClaimCompany',
      icon: <Building2 className="w-5 h-5" />,
      path: WORKER_UNLINKED_HOME_PATH,
      label: t('nav.workerClaimCompany', 'Unirse a una empresa'),
    },
    {
      id: 'worker-invitations',
      navKey: 'workerInvitations',
      icon: <Mail className="w-5 h-5" />,
      path: '/saas/invitations',
      label: t('nav.workerInvitations', 'Mis invitaciones'),
    },
  ];
  // Solo menú worker (tareas, fichaje, docs…). Sin módulos de empresa en el lateral.
  const verticalGroupsForWorker: Array<SidebarGroup & { items: SidebarItem[] }> = [];
  const workerGroupedItems = unlinkedWorkerNeedsCompany
    ? [
        {
          id: 'worker-unlinked-main',
          label: t('sidebar.groups.workerAccess', 'Acceso'),
          icon: <Mail className="w-4 h-4 shrink-0" />,
          itemIds: workerUnlinkedMenuItems.map((item) => item.id),
          items: workerUnlinkedMenuItems,
        },
        ...workerGroups
          .map((g) => ({
            ...g,
            items: g.itemIds
              .map((id) => workerById.get(id))
              .filter(
                (item): item is SidebarItem =>
                  Boolean(item) && WORKER_UNLINKED_CONFIG_ITEM_IDS.has(item.id),
              ),
          }))
          .filter((g) => g.items.length > 0),
      ]
    : [
    {
      ...workerHomeGroup,
      items: workerHomeGroup.itemIds
        .map((id) => workerById.get(id))
        .filter((item): item is SidebarItem => Boolean(item) && !WORKER_SIDEBAR_HIDDEN_ITEM_IDS.has(item.id)),
    },
    ...verticalGroupsForWorker,
    ...workerGroups.map((g) => ({ ...g, items: g.itemIds.map((id) => workerById.get(id)).filter((item): item is SidebarItem => Boolean(item)) })),
  ].filter((g) => g.items.length > 0);

  const searchNorm = sidebarSearch.trim().toLowerCase();
  const itemMatchesSearch = (item: SidebarItem) =>
    !searchNorm
    || item.label.toLowerCase().includes(searchNorm)
    || item.id.toLowerCase().includes(searchNorm)
    || (item.subLabel?.toLowerCase().includes(searchNorm) ?? false);

  const splitGroupsBySearch = (groups: Array<SidebarGroup & { items: SidebarItem[] }>) => {
    if (!searchNorm) return { matched: groups, unmatched: [] as typeof groups };
    const matched: typeof groups = [];
    const unmatched: typeof groups = [];
    for (const g of groups) {
      if (g.items.some(itemMatchesSearch)) {
        matched.push(g);
      } else {
        unmatched.push(g);
      }
    }
    return { matched, unmatched };
  };

  const sidebarContent = (
    isMobile: boolean,
    selectorRef: React.RefObject<HTMLDivElement | null>,
  ) => {
    const narrow = !isMobile && collapsed;
    return (
    <aside
      className={`vsaas-sidebar flex flex-col overflow-hidden ${
        isMobile
          ? 'w-72 h-full'
          : `fixed inset-y-0 left-0 z-40 h-svh max-h-svh safe-area-top transition-[width] duration-300 ${collapsed ? 'w-20' : 'w-60'}`
      }`}
    >
      {/* Company selector + Mode toggle */}
      <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-800">
        <div className="px-3 pt-2.5">
          <div className="h-0.5 w-full rounded-full bg-[linear-gradient(135deg,#22c55e_0%,#14b8a6_52%,#2563eb_100%)] opacity-80" aria-hidden />
        </div>
        {/* Empresa (gerente) o cabecera fija (trabajador: sin selector de empresas) */}
        <div
          ref={selectorRef}
          className={`relative ${
            narrow
              ? 'px-1 pb-1'
              : isMobile
                ? 'px-3 pb-1 pt-[max(0.5rem,env(safe-area-inset-top,0px))]'
                : 'px-3 pb-1 pt-1'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {workerMode ? (
              <div
                className={`flex items-center gap-2 rounded-xl text-sm min-w-0 flex-1 ${
                  narrow ? 'justify-center p-2' : isMobile ? 'px-2 py-1.5' : 'px-3 py-2'
                }`}
                title={narrow ? (user?.fullName || user?.firstName || 'Trabajador') : undefined}
              >
                <div className="w-8 h-8 bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <span className="text-xs font-extrabold text-[var(--v-blue,#2563eb)]">
                    {`${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'T'}
                  </span>
                </div>
                {(isMobile || !collapsed) && (
                  <div className="min-w-0 flex-1 text-left">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate tracking-tight">
                      {user?.fullName || user?.firstName || t('sidebar.workerSpace', 'Mi espacio')}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate">
                      {t('sidebar.workerBackoffice', 'Backoffice trabajador')}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCompanyDropdown((prev) => !prev)}
                className={`flex items-center gap-2 rounded-xl transition-all text-sm ${
                  narrow ? 'justify-center p-2 flex-1 min-w-0' : isMobile ? 'px-2 py-1.5 flex-1 min-w-0' : 'px-3 py-2 flex-1 min-w-0'
                } hover:bg-blue-50/80 dark:hover:bg-blue-950/40`}
                title={narrow ? (currentBusiness?.name || t('topbar.myCompany')) : undefined}
              >
                <div className="w-8 h-8 bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {currentBusiness?.logo ? (
                    <img
                      src={currentBusiness.logo}
                      alt={currentBusiness.name}
                      className="w-8 h-8 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="text-xs font-extrabold text-[var(--v-blue,#2563eb)]">
                      {currentBusiness
                        ? currentBusiness.name.slice(0, 2).toUpperCase()
                        : (user?.firstName?.[0] || 'U').toUpperCase()}
                    </span>
                  )}
                </div>
                {(isMobile || !collapsed) && (
                  <>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 flex-1 text-left truncate tracking-tight">
                      {currentBusiness?.name
                        || user?.companyName
                        || user?.firstName
                        || t('topbar.myCompany')}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${showCompanyDropdown ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>
            )}

            {isMobile && (
              <button
                type="button"
                onClick={onMobileClose}
                className="vsaas-icon-btn shrink-0"
                aria-label={t('common.close', 'Cerrar')}
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Sidebar search */}
        {(isMobile || !collapsed) && (
          <div className="px-3 pb-2.5 pt-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder={t('sidebar.searchMenu', 'Buscar menú...')}
                className="w-full pl-8 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
              {sidebarSearch && (
                <button
                  type="button"
                  onClick={() => setSidebarSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[var(--v-rose,#e11d48)]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav
        ref={isMobile ? navScrollMobileRef : navScrollDesktopRef}
        onScroll={(event) => {
          if (typeof window === 'undefined') return;
          const target = event.currentTarget as HTMLElement;
          window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(target.scrollTop));
        }}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-3"
      >
        {(() => {
          const allGroups = workerMode ? workerGroupedItems : groupedVisibleItems;
          const { matched: matchedGroups, unmatched: unmatchedGroups } = splitGroupsBySearch(allGroups);

          const renderGroup = (group: typeof allGroups[number], dimmed: boolean) => {
            const groupHasActiveItem = group.items.some((item) => isItemActive(item));
            const isExpanded = Boolean(expandedGroups[group.id]);
            const showGroupedAsFlat = !isMobile && collapsed;
            const shouldShowChildren =
              showGroupedAsFlat || isExpanded || !!searchNorm;

            const sortedItems = searchNorm
              ? [...group.items.filter(itemMatchesSearch), ...group.items.filter((i) => !itemMatchesSearch(i))]
              : group.items;

            return (
              <NavSectionShell key={group.id} narrow={narrow}>
                <div className={dimmed ? 'opacity-30' : undefined}>
                  {!showGroupedAsFlat && (
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedGroups((prev) => ({
                          ...prev,
                          [group.id]: !prev[group.id],
                        }));
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.08em] transition-colors rounded-t-xl font-bold ${
                        groupHasActiveItem
                          ? 'text-[var(--v-blue,#2563eb)]'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        {group.icon}
                        {group.label}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 ${shouldShowChildren ? 'rotate-180' : 'rotate-0'}`}
                      />
                    </button>
                  )}

                  <div className={shouldShowChildren ? undefined : 'hidden'} aria-hidden={!shouldShowChildren}>
                    {sortedItems.map((item) => {
                      const isActive = isItemActive(item);
                      const isSalesPointSubItem =
                        item.id.startsWith('sp-') || item.id === 'salesPoints-add';
                      const isInactiveStore = Boolean(item.inactive);
                      const itemDimmed = !dimmed && searchNorm && !itemMatchesSearch(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleMenuItemClick(item)}
                          className={`relative w-full flex items-center transition-colors last:rounded-b-xl ${
                            isSalesPointSubItem ? 'gap-2 py-1.5' : 'gap-3 py-2.5'
                          } ${
                            !isMobile && collapsed
                              ? 'justify-center px-0'
                              : isSalesPointSubItem
                                ? 'pl-10 pr-4'
                                : 'px-4'
                          } ${
                            isInactiveStore && !isActive
                              ? 'text-slate-400 dark:text-slate-500 border-l-2 border-dashed border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                              : isActive
                              ? 'vsaas-nav-active'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-l-2 border-transparent'
                          } ${item.disabled ? 'opacity-60 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent' : ''} ${
                            itemDimmed ? 'opacity-30' : ''
                          }`}
                          disabled={item.disabled}
                          title={
                            item.lockTitle ??
                            item.label
                          }
                        >
                          <span className={
                            isActive
                              ? 'vsaas-nav-icon-active'
                              : isSalesPointSubItem
                                ? 'text-slate-400 dark:text-slate-500'
                                : 'text-slate-500 dark:text-slate-400'
                          }>
                            {item.lockTitle ? <Lock className="w-5 h-5" /> : item.icon}
                          </span>
                          {(isMobile || !collapsed) && (
                            <span
                              className={`flex-1 min-w-0 text-left ${
                                isSalesPointSubItem && (item.subLabel || item.terminalCode)
                                  ? 'flex flex-col gap-0.5'
                                  : ''
                              }`}
                            >
                              <span
                                className={`block text-[13px] leading-snug ${
                                  isSalesPointSubItem
                                    ? `${isActive ? 'font-semibold' : 'font-medium'} truncate`
                                    : 'font-medium line-clamp-2 break-words'
                                }`}
                              >
                                {item.label}
                              </span>
                              {isSalesPointSubItem && item.subLabel ? (
                                <span
                                  className={`block truncate font-mono text-[10px] leading-none ${
                                    isActive
                                      ? 'text-blue-700/90 dark:text-blue-300/90'
                                      : 'text-slate-400 dark:text-slate-500'
                                  }`}
                                >
                                  {item.subLabel}
                                </span>
                              ) : null}
                              {isSalesPointSubItem && item.terminalCode ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  title="Copiar código TPV"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const code = String(item.terminalCode || '').trim().toUpperCase();
                                    if (!code) return;
                                    void navigator.clipboard.writeText(code).then(
                                      () => toast.success(`Código TPV copiado: ${code}`),
                                      () => toast.error('No se pudo copiar'),
                                    );
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key !== 'Enter' && e.key !== ' ') return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    (e.currentTarget as HTMLElement).click();
                                  }}
                                  className={`inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] leading-none tracking-widest transition-colors ${
                                    isActive
                                      ? 'bg-blue-100/80 text-blue-800 hover:bg-blue-200/80 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  <Copy className="h-2.5 w-2.5 shrink-0 opacity-70" />
                                  <span className="truncate">{item.terminalCode}</span>
                                </span>
                              ) : null}
                            </span>
                          )}
                          {(isMobile || !collapsed) && item.id === 'alertas' && alertCenterUnresolved > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full leading-none flex-shrink-0 min-w-[1.25rem] text-center">
                              {alertCenterUnresolved > 99 ? '99+' : alertCenterUnresolved}
                            </span>
                          )}
                          {!isMobile && collapsed && item.id === 'alertas' && alertCenterUnresolved > 0 && (
                            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                          )}
                          {(isMobile || !collapsed) && item.isNew && !seenNewItems.has(item.id) && (
                            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[9px] font-bold rounded-full leading-none flex-shrink-0 animate-pulse">
                              {t('sidebar.new')}
                            </span>
                          )}
                          {(isMobile || !collapsed) && item.pro && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[9px] font-bold rounded-full leading-none flex-shrink-0">
                              <Sparkles className="w-2.5 h-2.5" />
                              {t('sidebar.pro')}
                            </span>
                          )}
                          {(isMobile || !collapsed) && item.upcoming && (
                            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-bold rounded-full leading-none flex-shrink-0">
                              {t('sidebar.comingSoon')}
                            </span>
                          )}
                          {!isMobile && collapsed && item.isNew && !seenNewItems.has(item.id) && (
                            <span className="absolute right-1 top-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          )}
                          {!isMobile && collapsed && item.pro && (
                            <span className="absolute right-1 top-1 w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </NavSectionShell>
            );
          };

          return (
            <>
              {matchedGroups.map((g) => renderGroup(g, false))}
              {unmatchedGroups.map((g) => renderGroup(g, true))}
            </>
          );
        })()}

        {!workerMode && canUseDevPlanSwitcher && (isMobile || !collapsed) && (
          <div className={`mb-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/60 px-2 py-1.5 dark:border-violet-700 dark:bg-violet-950/20 ${narrow ? 'mx-0.5' : 'mx-2'}`}>
            <div className="mb-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                Plan (dev)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-0.5">
              {([
                { id: 'basic' as const, label: 'Básico' },
                { id: 'normal' as const, label: 'Mediano' },
                { id: 'pro' as const, label: 'Pro' },
              ]).map(({ id, label }) => {
                const isCurrent = !devUnlimitedPdv && currentDevPlan === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDevSubscriptionPlan(id)}
                    className={`px-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                      isCurrent
                        ? id === 'pro'
                          ? 'bg-violet-600 text-white'
                          : id === 'normal'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-700 text-white'
                        : 'bg-white text-gray-600 hover:bg-violet-100 border border-violet-200 dark:bg-gray-900 dark:text-gray-300 dark:border-violet-800 dark:hover:bg-violet-900/30'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={enableDevUnlimitedPdv}
              className={`mt-0.5 w-full px-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                devUnlimitedPdv
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-sky-700 hover:bg-sky-50 border border-sky-300 dark:bg-gray-900 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-950/40'
              }`}
            >
              Ilimitado
            </button>
            {!devUnlimitedPdv && (
              <div className="mt-1.5 space-y-1">
                {([
                  {
                    label: 'Tiendas extra',
                    value: devExtraPdv,
                    onChange: setDevExtraPdvSlots,
                  },
                  {
                    label: 'Marcas extra',
                    value: devExtraBrands,
                    onChange: setDevExtraBrandSlots,
                  },
                  {
                    label: 'Empresas extra',
                    value: devExtraBusiness,
                    onChange: setDevExtraBusinessSlots,
                  },
                ] as const).map(({ label, value, onChange }) => (
                  <div key={label} className="flex items-center justify-between gap-1">
                    <span className="text-[9px] text-violet-700 dark:text-violet-300">{label}</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Menos ${label}`}
                        onClick={() => onChange(value - 1)}
                        disabled={value <= 0}
                        className="h-5 w-5 rounded border border-violet-200 bg-white text-[11px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-40 dark:border-violet-800 dark:bg-gray-900 dark:text-violet-300 dark:hover:bg-violet-900/30"
                      >
                        −
                      </button>
                      <span className="min-w-[1.25rem] text-center text-[10px] font-semibold text-violet-800 dark:text-violet-200">
                        {value}
                      </span>
                      <button
                        type="button"
                        aria-label={`Más ${label}`}
                        onClick={() => onChange(value + 1)}
                        disabled={value >= 99}
                        className="h-5 w-5 rounded border border-violet-200 bg-white text-[11px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-40 dark:border-violet-800 dark:bg-gray-900 dark:text-violet-300 dark:hover:bg-violet-900/30"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-[9px] text-violet-600/80 dark:text-violet-400/80">
              {devUnlimitedPdv
                ? 'Sin límite de cupos · funciones Pro'
                : `Máx. ${getEffectiveBusinessLimit(subscription)} empresas · ${getEffectivePointOfSaleLimit(subscription)} tiendas · ${getEffectiveCommercialBrandLimit(subscription)} marcas`}
            </p>
            <button
              type="button"
              onClick={() => setDevSubscriptionPlan(null)}
              className="mt-0.5 w-full text-[9px] text-violet-600/80 dark:text-violet-400/80 hover:text-violet-800 dark:hover:text-violet-200 underline-offset-2 hover:underline"
            >
              Reset (plan real)
            </button>
          </div>
        )}

        {!workerMode && bottomVisibleItems.length > 0 && (
          <div
            className={`space-y-2 transition-opacity duration-200 ${
              searchNorm && !bottomVisibleItems.some(itemMatchesSearch) ? 'opacity-30' : ''
            }`}
          >
            {bottomVisibleItems.map((item) => {
              const isActive = isItemActive(item);
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
                    narrow ? 'mx-0.5' : 'mx-2'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleMenuItemClick(item)}
                    className={`relative flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left transition-colors ${
                      narrow ? 'justify-center px-0' : ''
                    } ${
                      isActive
                        ? 'border-l-[3px] border-[var(--v-blue,#2563eb)] bg-blue-50 text-blue-900 dark:bg-blue-900/25 dark:text-blue-200'
                        : 'text-slate-600 hover:bg-blue-50/50 dark:text-slate-400 dark:hover:bg-blue-950/20'
                    } ${item.disabled ? 'cursor-not-allowed opacity-60 hover:bg-transparent dark:hover:bg-transparent' : ''}`}
                    disabled={item.disabled}
                    title={narrow ? item.label : undefined}
                  >
                    <span
                      className={`shrink-0 ${isActive ? 'text-[var(--v-blue,#2563eb)]' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      {item.icon}
                    </span>
                    {(isMobile || !collapsed) && (
                      <span
                        className={`min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide leading-snug ${
                          isActive ? 'text-blue-900 dark:text-blue-200' : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {item.label}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {!workerMode && <ActivationChecklist collapsed={!isMobile && collapsed} />}

      {/* User section */}
      <div className="shrink-0 p-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="relative">
          {!isMobile && collapsed ? (
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer transition-colors"
              title={t('sidebar.userMenu')}
            >
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 rounded-full flex items-center justify-center">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.fullName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold text-[var(--v-blue,#2563eb)]">{initials}</span>
                )}
              </div>
            </button>
          ) : (
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer transition-colors"
            >
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.fullName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold text-[var(--v-blue,#2563eb)]">{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate tracking-tight">
                  {user?.fullName || t('topbar.user')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user?.role || user?.email || t('sidebar.noRole')}
                </p>
              </div>
            </button>
          )}

          {/* Marca Vertial + versión — pie del sidebar (no en pantallas de módulo) */}
          {(isMobile || !collapsed) ? (
            <div className="mt-2 flex items-center justify-center gap-2 px-1">
              <VertialLogo size="sm" className="opacity-75" />
              {import.meta.env.VITE_APP_VERSION ? (
                <p
                  className="text-[10px] text-gray-400 dark:text-gray-600 tabular-nums"
                  title="Versión del build (package.json al compilar)"
                >
                  v{import.meta.env.VITE_APP_VERSION}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 flex justify-center" title="Vertial">
              <VertialLogo size="sm" className="opacity-75" />
            </div>
          )}

          {showUserMenu && (
            <div
              className={`absolute bottom-full mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/40 overflow-hidden z-50 ${
                !isMobile && collapsed ? 'left-full ml-2 w-48' : 'left-0 right-0'
              }`}
            >
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  navigate('/saas/settings/usuarios', { preventScrollReset: true });
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('sidebar.myProfile')}</span>
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  setShowHelpModal(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <HelpCircle className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('sidebar.help')}</span>
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  navigate('/saas/changelog', { preventScrollReset: true });
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <Newspaper className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('sidebar.changelog')}</span>
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700" />
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  if (workerMode) {
                    navigate('/saas/worker/tasks', { replace: true });
                    return;
                  }
                  if (businesses.length <= 1) {
                    navigate('/saas/dashboard', { replace: true });
                  } else {
                    navigate('/auth/gate', { replace: true });
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
              >
                <Home className="w-4 h-4 text-[var(--v-blue,#2563eb)] dark:text-blue-400" />
                <span className="text-sm text-[var(--v-blue,#2563eb)] dark:text-blue-400">{t('sidebar.backToHome')}</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600 dark:text-red-400">{t('sidebar.logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        {sidebarContent(false, desktopCompanySelectorRef)}
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          {/* Drawer */}
          <div className="relative z-10 flex h-full min-h-0 flex-col">
            {sidebarContent(true, mobileCompanySelectorRef)}
          </div>
        </div>
      )}

      {!workerMode && showCompanyDropdown && companyDropdownPanel && typeof document !== 'undefined'
        ? createPortal(companyDropdownPanel, document.body)
        : null}

      <SAAS__HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />

      {isEventsVertical ? (
        <EventsPortablePdvModal
          open={showEventsPortablePdvModal}
          userId={resolveEventsUserId(user, currentBusiness)}
          business={currentBusiness}
          onClose={() => setShowEventsPortablePdvModal(false)}
          onCreated={() => {
            void loadSalesPoints();
          }}
        />
      ) : null}
    </>
  );
}
