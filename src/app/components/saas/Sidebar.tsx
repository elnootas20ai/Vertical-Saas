import { useNavigate, useLocation } from 'react-router';
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { listSalesPoints, type SalesPoint } from '../../lib/salesPointsApi';
import { useModalClose } from '../../hooks/useModalClose';
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
  Phone,
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
  ArrowLeftRight,
  Shield,
  Check,
  Plus,
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
  Palette,
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
} from 'lucide-react';
import { SAAS__HelpModal } from '../design-system/SAAS__HelpModal';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import type { BusinessType } from '../../lib/businessApi';
import { ActivationChecklist } from './ActivationChecklist';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  pro?: boolean;
  disabled?: boolean;
  upcoming?: boolean;
  isNew?: boolean;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
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
      className={`mb-2 rounded-xl border border-gray-200/90 dark:border-gray-700/90 bg-gray-50/95 dark:bg-gray-800/55 ${
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
  itemIds: ['dashboard', 'calendar', 'chat', 'calls'],
};

const menuItemDefs = [
  // ── Home ─────────────────────────────────────────────────────────────────────
  { id: 'dashboard', navKey: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/dashboard' },
  { id: 'calendar',  navKey: 'calendar',  icon: <CalendarDays className="w-5 h-5" />,    path: '/saas/calendar' },
  { id: 'chat',      navKey: 'chat',      icon: <MessageSquare className="w-5 h-5" />,   path: '/saas/chat' },
  { id: 'calls',     navKey: 'calls',     icon: <Phone className="w-5 h-5" />,           path: '/saas/calls', disabled: true, upcoming: true },
  { id: 'business-mode', navKey: 'businessMode', icon: <ArrowLeftRight className="w-5 h-5" />, path: '#' },

  // ── Clientes / CRM ──────────────────────────────────────────────────────────
  { id: 'quotes',     navKey: 'quotes',     icon: <ClipboardList className="w-5 h-5" />, path: '/saas/quotes' },
  { id: 'promotions', navKey: 'promotions', icon: <Megaphone className="w-5 h-5" />,      path: '/saas/promotions', isNew: true },

  // ── Equipo ───────────────────────────────────────────────────────────────────
  { id: 'team',            navKey: 'team',           icon: <UsersRound className="w-5 h-5" />,    path: '/saas/team' },
  { id: 'clockins',        navKey: 'clockins',       icon: <Clock className="w-5 h-5" />,          path: '/saas/clockins' },
  { id: 'horarios-vacaciones', navKey: 'horarios-vacaciones', icon: <CalendarRange className="w-5 h-5" />, path: '/saas/equipo/horarios-vacaciones' },
  { id: 'commissions',     navKey: 'commissions',    icon: <Award className="w-5 h-5" />,          path: '/saas/commissions', isNew: true },
  { id: 'payroll',          navKey: 'payroll',         icon: <FileText className="w-5 h-5" />,       path: '/saas/payroll', isNew: true },

  // ── Catálogo y Proveedores ───────────────────────────────────────────────────
  { id: 'catalog',          navKey: 'catalog',         icon: <BookOpen className="w-5 h-5" />,    path: '/saas/catalog' },
  { id: 'articles',         navKey: 'articles',        icon: <Boxes className="w-5 h-5" />,       path: '/saas/articles' },
  { id: 'suppliers',        navKey: 'suppliers',       icon: <Factory className="w-5 h-5" />,     path: '/saas/suppliers' },
  { id: 'orders',           navKey: 'orders',          icon: <ShoppingBag className="w-5 h-5" />, path: '/saas/orders' },
  { id: 'purchase-orders',  navKey: 'purchaseOrders',  icon: <ShoppingCart className="w-5 h-5" />, path: '/saas/purchase-orders', isNew: true },
  { id: 'supplier-billing', navKey: 'supplierBilling', icon: <Receipt className="w-5 h-5" />,    path: '/saas/supplier-billing' },
  { id: 'costing',          navKey: 'costing',         icon: <Calculator className="w-5 h-5" />,  path: '/saas/costing', isNew: true },

  // ── Finanzas ─────────────────────────────────────────────────────────────────
  { id: 'finance',             navKey: 'finance',            icon: <DollarSign className="w-5 h-5" />,  path: '/saas/finance' },
  { id: 'income-expenses',     navKey: 'incomeExpenses',     icon: <ArrowUpDown className="w-5 h-5" />, path: '/saas/income-expenses' },
  { id: 'ebitda',              navKey: 'ebitda',             icon: <PiggyBank className="w-5 h-5" />,   path: '/saas/ebitda', isNew: true },
  { id: 'taxes',               navKey: 'taxes',              icon: <Landmark className="w-5 h-5" />,    path: '/saas/taxes' },
  { id: 'bank-reconciliation', navKey: 'bankReconciliation', icon: <Landmark className="w-5 h-5" />,    path: '/saas/bank-reconciliation', pro: true },
  { id: 'reports',             navKey: 'reports',            icon: <BarChart3 className="w-5 h-5" />,   path: '/saas/reports', isNew: true },
  { id: 'sales-metrics',       navKey: 'salesMetrics',       icon: <BarChart3 className="w-5 h-5" />,   path: '/saas/sales-metrics', isNew: true },

  // ── Documentación ────────────────────────────────────────────────────────────
  { id: 'doc-society',       navKey: 'docSociety',      icon: <Building2 className="w-5 h-5" />,   path: '/saas/documents?tab=society' },
  { id: 'doc-contracts',     navKey: 'docContracts',    icon: <ScrollText className="w-5 h-5" />,  path: '/saas/documents?tab=contracts' },
  { id: 'doc-licenses',      navKey: 'docLicenses',     icon: <ShieldCheck className="w-5 h-5" />, path: '/saas/documents?tab=licenses' },
  { id: 'doc-financial',     navKey: 'docFinancial',    icon: <Wallet className="w-5 h-5" />,      path: '/saas/documents?tab=financial' },
  { id: 'doc-user-expenses', navKey: 'docUserExpenses', icon: <Receipt className="w-5 h-5" />,     path: '/saas/documents?tab=user-expenses' },
  { id: 'doc-other',         navKey: 'docOther',        icon: <FolderOpen className="w-5 h-5" />,  path: '/saas/documents?tab=other' },

  // ── Vertical: Comercial (concesionario) ──────────────────────────────────────
  { id: 'compraventa-hub', navKey: 'compraventaHub', icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/vertical/compraventa', isNew: true },
  { id: 'vehicle-entry', navKey: 'vehicleEntry', icon: <CirclePlus className="w-5 h-5" />, path: '/saas/vertical/compraventa/entrada-vehiculo', isNew: true },
  { id: 'publicacion-venta', navKey: 'publicacionVenta', icon: <Megaphone className="w-5 h-5" />, path: '/saas/vertical/compraventa/publicacion-venta', isNew: true },
  { id: 'vehicles',     navKey: 'vehicles',     icon: <Car className="w-5 h-5" />,           path: '/saas/vehicles' },
  { id: 'reservations', navKey: 'reservations', icon: <BookmarkCheck className="w-5 h-5" />, path: '/saas/reservations' },
  { id: 'sales',        navKey: 'sales',        icon: <TrendingUp className="w-5 h-5" />,    path: '/saas/sales' },
  { id: 'pipeline', navKey: 'pipeline', icon: <Kanban className="w-5 h-5" />,     path: '/saas/pipeline' },
  { id: 'compraventa-crm', navKey: 'compraventa-crm', icon: <Kanban className="w-5 h-5" />, path: '/saas/vertical/compraventa/crm' },
  { id: 'gastos-preparacion', navKey: 'gastosPreparacion', icon: <Wrench className="w-5 h-5" />, path: '/saas/vertical/compraventa/gastos-preparacion', isNew: true },
  { id: 'ancove',   navKey: 'ancove',   icon: <Building2 className="w-5 h-5" />,  path: '/saas/ancove' },

  // ── Vertical: Taller ─────────────────────────────────────────────────────────
  { id: 'workshop', navKey: 'workshop', icon: <Wrench className="w-5 h-5" />,  path: '/saas/workshop' },
  { id: 'parts',    navKey: 'parts',    icon: <Package className="w-5 h-5" />, path: '/saas/parts' },
  { id: 'tech',     navKey: 'tech',     icon: <HardHat className="w-5 h-5" />, path: '/saas/tech' },

  // ── Vertical: Delivery ───────────────────────────────────────────────────────
  { id: 'delivery-ops',     navKey: 'deliveryOps',     icon: <Activity className="w-5 h-5" />, path: '/saas/delivery-ops' },
  { id: 'tpv',              navKey: 'tpv',             icon: <Receipt className="w-5 h-5" />,  path: '/saas/tpv' },
  { id: 'sala',             navKey: 'sala',             icon: <UtensilsCrossed className="w-5 h-5" />, path: '/saas/sala' },
  { id: 'tpv-locales',      navKey: 'tpvLocales',      icon: <Store className="w-5 h-5" />,    path: '/saas/tpv/locales' },
  { id: 'delivery',         navKey: 'delivery',        icon: <Truck className="w-5 h-5" />,    path: '/saas/delivery' },
  { id: 'delivery-kitchen', navKey: 'deliveryKitchen', icon: <ChefHat className="w-5 h-5" />, path: '/saas/delivery-kitchen' },
  { id: 'delivery-montaje', navKey: 'deliveryMontaje', icon: <ClipboardCheck className="w-5 h-5" />, path: '/saas/delivery-montaje' },
  { id: 'tpv-rapido',       navKey: 'tpvRapido',       icon: <Zap className="w-5 h-5" />,      path: '/saas/vertical/delivery/tpv' },
  { id: 'caja',             navKey: 'caja',            icon: <Banknote className="w-5 h-5" />,  path: '/saas/vertical/delivery/caja' },
  { id: 'delivery-clients', navKey: 'deliverySidebarClients', icon: <Users className="w-5 h-5" />, path: '/saas/clients' },
  { id: 'delivery-crm',     navKey: 'deliveryCrm',     icon: <Contact2 className="w-5 h-5" />,    path: '/saas/delivery-crm' },
  { id: 'delivery-catalog', navKey: 'deliveryCatalog', icon: <BookOpen className="w-5 h-5" />, path: '/saas/delivery-catalog' },
  { id: 'delivery-reparto', navKey: 'deliveryReparto', icon: <Truck className="w-5 h-5" />,    path: '/saas/delivery-reparto' },
  { id: 'web-orders',       navKey: 'webOrders',       icon: <Package className="w-5 h-5" />,  path: '/saas/web-orders' },
  { id: 'web-config',       navKey: 'webConfig',       icon: <Globe className="w-5 h-5" />,    path: '/saas/web-config' },

  // ── Vertical: Limpieza ───────────────────────────────────────────────────────
  { id: 'cleaning-hub',         navKey: 'cleaningHub',         icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/cleaning-hub' },
  { id: 'cleaning-contracts',   navKey: 'cleaningContracts',   icon: <FileStack className="w-5 h-5" />,      path: '/saas/vertical/limpieza/servicios' },
  { id: 'cleaning-services',    navKey: 'cleaningServices',    icon: <SprayCan className="w-5 h-5" />,       path: '/saas/cleaning-services' },
  { id: 'cleaning-execution', navKey: 'cleaningExecution', icon: <Timer className="w-5 h-5" />,          path: '/saas/cleaning-execution' },
  { id: 'cleaning-checklist', navKey: 'cleaningChecklist', icon: <ClipboardCheck className="w-5 h-5" />, path: '/saas/cleaning-checklist' },
  { id: 'cleaning-quality',   navKey: 'cleaningQuality',   icon: <Star className="w-5 h-5" />,           path: '/saas/cleaning-quality' },
  { id: 'cleaning-reviews',   navKey: 'cleaningReviews',   icon: <MessageSquare className="w-5 h-5" />,  path: '/saas/cleaning-reviews' },
  { id: 'cleaning-incidents', navKey: 'cleaningIncidents', icon: <AlertTriangle className="w-5 h-5" />,  path: '/saas/cleaning-incidents' },

  // ── Vertical: Gimnasio ─────────────────────────────────────────────────────
  { id: 'gym-classes',      navKey: 'gymClasses',      icon: <CalendarDays className="w-5 h-5" />, path: '/saas/gym-classes' },
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
  { id: 'events-management', navKey: 'eventsManagement', icon: <PartyPopper className="w-5 h-5" />,      path: '/saas/events-management' },
  { id: 'events-catering',  navKey: 'eventsCatering',   icon: <UtensilsCrossed className="w-5 h-5" />,  path: '/saas/events-catering' },
  { id: 'events-logistics', navKey: 'eventsLogistics',  icon: <ListChecks className="w-5 h-5" />,       path: '/saas/events-logistics' },

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
  { id: 'butcher-products',      navKey: 'butcherProducts',      icon: <Beef className="w-5 h-5" />,          path: '/saas/butcher-products' },
  { id: 'butcher-traceability',  navKey: 'butcherTraceability',  icon: <ScanBarcode className="w-5 h-5" />,   path: '/saas/butcher-traceability' },
  { id: 'butcher-waste',         navKey: 'butcherWaste',         icon: <Recycle className="w-5 h-5" />,       path: '/saas/butcher-waste' },

  // ── Bottom ───────────────────────────────────────────────────────────────────
  { id: 'configuracion', navKey: 'configuracion', icon: <Cog className="w-5 h-5" />, path: '/saas/configuracion' },
  { id: 'settings', navKey: 'settings', icon: <Settings className="w-5 h-5" />, path: '/saas/settings' },
] as const;

// ── Modo Trabajador ─────────────────────────────────────────────────────────
const workerMenuItemDefs = [
  // ── Principal ───────────────────────────────────────────────────────────────
  { id: 'worker-home',       navKey: 'workerHome',       icon: <LayoutDashboard className="w-5 h-5" />, path: '/saas/worker' },
  { id: 'worker-tpv',        navKey: 'workerTpv',        icon: <Monitor className="w-5 h-5" />,         path: '/saas/worker/tpv', isNew: true },
  { id: 'worker-tasks',      navKey: 'workerTasks',      icon: <ClipboardList className="w-5 h-5" />,   path: '/saas/worker/tasks' },
  { id: 'worker-calendar',   navKey: 'workerCalendar',   icon: <CalendarDays className="w-5 h-5" />,    path: '/saas/worker/calendar' },
  { id: 'worker-clock',      navKey: 'workerClock',      icon: <Clock className="w-5 h-5" />,           path: '/saas/worker/clock' },
  { id: 'worker-chat',       navKey: 'workerChat',       icon: <MessageSquare className="w-5 h-5" />,   path: '/saas/worker/chat' },
  { id: 'worker-docs',       navKey: 'workerDocs',       icon: <FileText className="w-5 h-5" />,        path: '/saas/worker/documents' },
  { id: 'worker-butcher-orders', navKey: 'workerButcherOrders', icon: <ClipboardList className="w-5 h-5" />, path: '/saas/worker/butcher-orders', isNew: true },
  { id: 'worker-onboarding', navKey: 'workerOnboarding', icon: <GraduationCap className="w-5 h-5" />,   path: '/saas/worker/onboarding', pro: true },

  // ── Configuración ───────────────────────────────────────────────────────────
  { id: 'worker-profile',       navKey: 'workerProfile',      icon: <User className="w-5 h-5" />,          path: '/saas/worker/profile' },
  { id: 'worker-contract-info', navKey: 'workerContractInfo', icon: <ClipboardCheck className="w-5 h-5" />, path: '/saas/worker/contract-info' },
  { id: 'worker-position',      navKey: 'workerPosition',     icon: <Briefcase className="w-5 h-5" />,     path: '/saas/worker/position' },
  { id: 'worker-notifications', navKey: 'workerNotifications', icon: <Bell className="w-5 h-5" />,         path: '/saas/worker/notifications' },
  { id: 'worker-security',      navKey: 'workerSecurity',     icon: <Shield className="w-5 h-5" />,        path: '/saas/worker/security' },
  { id: 'business-mode', navKey: 'businessMode', icon: <ArrowLeftRight className="w-5 h-5" />, path: '#' },
] as const;

const WORKER_HOME_GROUP: SidebarGroup = {
  id: 'worker-main',
  label: 'Principal',
  icon: <House className="w-4 h-4 shrink-0" />,
  itemIds: ['worker-home', 'worker-tpv', 'worker-tasks', 'worker-calendar', 'worker-clock', 'worker-chat', 'worker-docs', 'worker-onboarding'],
};

const workerSidebarGroupDefs = [
  { id: 'worker-config', icon: <Settings className="w-4 h-4 shrink-0" />, itemIds: ['worker-profile', 'worker-contract-info', 'worker-position', 'worker-notifications', 'worker-security'] },
] as const;

const sidebarGroupDefs = [
  { id: 'clientesCrm',      icon: <Contact2 className="w-4 h-4 shrink-0" />,      itemIds: ['quotes', 'promotions'] },
  { id: 'equipo',           icon: <UsersRound className="w-4 h-4 shrink-0" />,    itemIds: ['team', 'clockins', 'horarios-vacaciones', 'commissions', 'payroll'] },
  { id: 'catalogProviders', icon: <Package className="w-4 h-4 shrink-0" />,       itemIds: ['catalog', 'articles', 'suppliers', 'orders', 'purchase-orders', 'supplier-billing', 'costing'] },
  { id: 'finanzas',         icon: <DollarSign className="w-4 h-4 shrink-0" />,    itemIds: ['client-billing', 'finance', 'income-expenses', 'ebitda', 'taxes', 'bank-reconciliation', 'reports', 'sales-metrics'] },
  { id: 'documentacion',    icon: <FileText className="w-4 h-4 shrink-0" />,      itemIds: ['doc-society', 'doc-contracts', 'doc-licenses', 'doc-financial', 'doc-user-expenses', 'doc-other'] },
  { id: 'commercial',       icon: <Car className="w-4 h-4 shrink-0" />,           itemIds: ['compraventa-hub', 'vehicle-entry', 'publicacion-venta', 'vehicles', 'reservations', 'sales', 'pipeline', 'dealership-workers', 'ancove'] },
  { id: 'workshop',         icon: <Wrench className="w-4 h-4 shrink-0" />,        itemIds: ['workshop', 'parts', 'tech'] },
  { id: 'delivery',         icon: <Truck className="w-4 h-4 shrink-0" />,         itemIds: ['tpv-rapido', 'delivery-ops', 'delivery-clients', 'sala', 'delivery', 'delivery-kitchen', 'delivery-montaje', 'delivery-crm', 'delivery-catalog', 'delivery-reparto', 'caja', 'web-orders', 'web-config'] },
  { id: 'cleaning',         icon: <Droplets className="w-4 h-4 shrink-0" />,      itemIds: ['cleaning-hub', 'cleaning-contracts', 'cleaning-services', 'cleaning-execution', 'cleaning-checklist', 'cleaning-quality', 'cleaning-reviews', 'cleaning-incidents'] },
  { id: 'gym',              icon: <Dumbbell className="w-4 h-4 shrink-0" />,      itemIds: ['gym-classes', 'gym-memberships', 'gym-routines', 'gym-access'] },
  { id: 'clinic',           icon: <Stethoscope className="w-4 h-4 shrink-0" />,   itemIds: ['clinic-history', 'clinic-treatments', 'clinic-prescriptions'] },
  { id: 'hotel',            icon: <Hotel className="w-4 h-4 shrink-0" />,          itemIds: ['hotel-reservations', 'hotel-rooms', 'hotel-checkin', 'hotel-housekeeping', 'hotel-room-service'] },
  { id: 'construction',     icon: <HardHat className="w-4 h-4 shrink-0" />,       itemIds: ['construction-ops', 'construction-projects', 'construction-execution', 'construction-quick-budget', 'construction-budgets', 'construction-partidas', 'construction-collections', 'construction-payments', 'construction-tasks', 'construction-incidents', 'construction-closure'] },
  { id: 'academy',          icon: <GraduationCap className="w-4 h-4 shrink-0" />, itemIds: ['academy-courses', 'academy-enrollments', 'academy-grades'] },
  { id: 'realEstate',       icon: <Building2 className="w-4 h-4 shrink-0" />,     itemIds: ['realestate-properties', 'realestate-visits', 'realestate-contracts', 'realestate-appraisals'] },
  { id: 'lawyer',           icon: <Scale className="w-4 h-4 shrink-0" />,          itemIds: ['lawyer-cases', 'lawyer-hearings', 'lawyer-deadlines'] },
  { id: 'nightclub',        icon: <Music className="w-4 h-4 shrink-0" />,          itemIds: ['nightclub-events', 'nightclub-vip', 'nightclub-promoters', 'nightclub-guestlist', 'nightclub-artists'] },
  { id: 'events',           icon: <PartyPopper className="w-4 h-4 shrink-0" />,   itemIds: ['events-management', 'events-catering', 'events-logistics'] },
  { id: 'hairSalon',        icon: <Scissors className="w-4 h-4 shrink-0" />,      itemIds: ['salon-services', 'salon-loyalty'] },
  { id: 'scrapyard',        icon: <Container className="w-4 h-4 shrink-0" />,    itemIds: ['scrapyard-hub', 'scrapyard-purchases', 'scrapyard-vehicles', 'scrapyard-dismantling', 'scrapyard-parts', 'scrapyard-deregistrations', 'scrapyard-expedition', 'scrapyard-environment', 'scrapyard-documentation'] },
  { id: 'spareParts',       icon: <Cog className="w-4 h-4 shrink-0" />,          itemIds: ['spareparts-compatibility', 'spareparts-counter'] },
  { id: 'taxi',             icon: <CarTaxiFront className="w-4 h-4 shrink-0" />, itemIds: ['taxi-fleet', 'taxi-trips', 'taxi-shifts'] },
  { id: 'pharmacy',         icon: <Pill className="w-4 h-4 shrink-0" />,        itemIds: ['pharmacy-prescriptions', 'pharmacy-guard'] },
  { id: 'carWash',          icon: <Droplets className="w-4 h-4 shrink-0" />,    itemIds: ['carwash-services', 'carwash-memberships'] },
  { id: 'vet',              icon: <PawPrint className="w-4 h-4 shrink-0" />,    itemIds: ['vet-patients', 'vet-history', 'vet-vaccinations'] },
  { id: 'tobaccoShop',      icon: <Cigarette className="w-4 h-4 shrink-0" />,  itemIds: ['tobacco-lottery', 'tobacco-regulatory'] },
  { id: 'butcherShop',     icon: <Beef className="w-4 h-4 shrink-0" />,       itemIds: ['butcher-hub', 'butcher-products', 'butcher-traceability', 'butcher-waste'] },
] as const;

const VERTICAL_GROUPS: Record<BusinessType, Set<string>> = {
  carDealership: new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'commercial']),
  workshop:      new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'workshop']),
  delivery:      new Set(['equipo', 'catalogProviders', 'finanzas', 'documentacion', 'delivery']),
  cleaning:      new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'cleaning']),
  gym:           new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'gym']),
  clinic:        new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'clinic']),
  hotel:         new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'hotel']),
  construction:  new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion', 'construction']),
  academy:       new Set(['clientesCrm', 'equipo', 'finanzas', 'documentacion', 'academy']),
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
};

const VERTICAL_BOTTOM_ITEMS: Record<BusinessType, Set<string>> = {
  carDealership: new Set(['configuracion', 'settings']),
  workshop:      new Set(['configuracion', 'settings']),
  delivery:      new Set(['configuracion', 'settings']),
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
};

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onMobileClose }: SidebarProps) {
  useModalClose(mobileOpen, onMobileClose);
  const SIDEBAR_SCROLL_KEY = 'saas-sidebar-scroll-top';
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const { businesses, currentBusiness, switchBusiness } = useBusiness();
  const { t } = useTranslation();

  const vertical: BusinessType = (currentBusiness?.businessType as BusinessType) || 'carDealership';
  const allowedGroups = VERTICAL_GROUPS[vertical] || VERTICAL_GROUPS.carDealership;
  const allowedBottom = VERTICAL_BOTTOM_ITEMS[vertical] || VERTICAL_BOTTOM_ITEMS.carDealership;
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const companySelectorRef = useRef<HTMLDivElement>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [workerMode, setWorkerMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('saas-worker-mode') === 'true';
    }
    return false;
  });
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

  const loadSalesPoints = useCallback(async () => {
    if (!user?.id) return;
    try {
      const sps = await listSalesPoints(user.id);
      setSalesPoints(sps.filter((sp) => sp.active));
    } catch {
      // silent
    }
  }, [user?.id]);

  useEffect(() => {
    loadSalesPoints();
  }, [loadSalesPoints]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({
    home: false,
    'worker-main': false,
    salesPoints: false,
    ...Object.fromEntries(sidebarGroupDefs.map((g) => [g.id, false])),
    ...Object.fromEntries(workerSidebarGroupDefs.map((g) => [g.id, false])),
  }));

  const toggleWorkerMode = () => {
    setWorkerMode((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('saas-worker-mode', String(next));
      }
      if (next) {
        navigate('/saas/worker');
      } else {
        navigate('/saas/dashboard');
      }
      return next;
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companySelectorRef.current && !companySelectorRef.current.contains(event.target as Node)) {
        setShowCompanyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navScrollDesktopRef = useRef<HTMLElement>(null);
  const navScrollMobileRef = useRef<HTMLElement>(null);
  const pendingNavScrollRestore = useRef<number | null>(null);

  const menuItems: SidebarItem[] = menuItemDefs.map(item => ({
    ...item,
    label: item.id === 'business-mode'
      ? (workerMode ? t('sidebar.workerMode') : t('sidebar.businessMode'))
      : t(`nav.${item.navKey}`),
  }));

  const sidebarGroups: SidebarGroup[] = sidebarGroupDefs.map(g => ({
    id: g.id,
    icon: g.icon,
    itemIds: [...g.itemIds],
    label: t(`sidebar.groups.${g.id}`),
  }));

  const workerMenuItems: SidebarItem[] = workerMenuItemDefs.map(item => ({
    ...item,
    label: item.id === 'business-mode'
      ? (workerMode ? t('sidebar.workerMode') : t('sidebar.businessMode'))
      : t(`nav.${item.navKey}`),
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
  };
  const currentProfileLabel = workerMode ? 'Trabajador' : 'Gerente';

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'UU';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleNavigate = (path: string) => {
    const navEl =
      typeof window !== 'undefined' && window.innerWidth < 768
        ? navScrollMobileRef.current
        : navScrollDesktopRef.current;
    const scrollTop = navEl?.scrollTop ?? 0;
    pendingNavScrollRestore.current = scrollTop;
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(scrollTop));
    }
    navigate(path, { preventScrollReset: true });
    onMobileClose();
  };

  const handleMenuItemClick = (item: SidebarItem) => {
    if (item.disabled) {
      return;
    }
    if (item.id === 'business-mode') {
      toggleWorkerMode();
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
    handleNavigate(item.path);
  };

  useLayoutEffect(() => {
    const pendingY = pendingNavScrollRestore.current;
    const savedY =
      typeof window !== 'undefined'
        ? Number(window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY))
        : Number.NaN;
    const y = pendingY ?? (Number.isFinite(savedY) ? savedY : null);
    if (y === null) return;
    const desktop = navScrollDesktopRef.current;
    const mobile = navScrollMobileRef.current;
    if (desktop) desktop.scrollTop = y;
    if (mobile) mobile.scrollTop = y;
    pendingNavScrollRestore.current = null;
  }, [location.pathname, location.search]);

  const visibleMenuItemsBase = menuItems;

  const permissionMap = user?.permissions || {};
  const visibleMenuItems = visibleMenuItemsBase.filter((item) => {
    if (!user) {
      return true;
    }
    if (['dashboard', 'settings', 'configuracion', 'calls', 'chat', 'business-mode'].includes(item.id)) {
      return true;
    }
    const permission = permissionMap[item.id]
      || (item.id === 'leads' ? permissionMap.clients : undefined)
      || (item.id === 'billing' ? permissionMap.finance : undefined)
      || (item.id === 'client-billing' ? permissionMap.finance : undefined)
      || (item.id === 'tpv-locales' ? permissionMap.tpv : undefined)
      || (item.id.startsWith('doc-') ? permissionMap.documents : undefined);
    if (!permission) {
      return true;
    }
    return Boolean(permission.view);
  });

  const isItemActive = (item: SidebarItem) =>
    `${location.pathname}${location.search}` === item.path ||
    location.pathname === item.path ||
    (item.id === 'configuracion' && location.pathname.startsWith('/saas/configuracion')) ||
    (item.id === 'settings' && location.pathname.startsWith('/saas/settings')) ||
    (item.id === 'vehicles' && location.pathname.startsWith('/saas/locations')) ||
    (item.id === 'vehicle-entry' && location.pathname.startsWith('/saas/vertical/compraventa/entrada-vehiculo')) ||
    (item.id === 'workshop' && location.pathname.startsWith('/saas/workshop')) ||
    (item.id === 'parts' && location.pathname.startsWith('/saas/parts')) ||
    (item.id === 'tpv' && location.pathname === '/saas/tpv') ||
    (item.id === 'tpv-locales' && location.pathname === '/saas/tpv/locales') ||
    (item.id === 'delivery' && location.pathname === '/saas/delivery') ||
    (item.id === 'delivery-kitchen' && location.pathname.startsWith('/saas/delivery-kitchen')) ||
    (item.id === 'delivery-montaje' && location.pathname.startsWith('/saas/delivery-montaje')) ||
    (item.id === 'delivery-catalog' && location.pathname.startsWith('/saas/delivery-catalog')) ||
    (item.id === 'delivery-clients' && location.pathname.startsWith('/saas/clients')) ||
    (item.id === 'delivery-crm' && location.pathname.startsWith('/saas/delivery-crm')) ||
    (item.id === 'caja' && location.pathname.startsWith('/saas/vertical/delivery/caja')) ||
    (item.id === 'web-orders' && location.pathname.startsWith('/saas/web-orders')) ||
    (item.id === 'web-config' && location.pathname.startsWith('/saas/web-config')) ||
    (item.id === 'cleaning-hub' && location.pathname.startsWith('/saas/cleaning-hub')) ||
    (item.id === 'cleaning-clients' && location.pathname.startsWith('/saas/vertical/limpieza/clientes')) ||
    (item.id === 'cleaning-workers' && location.pathname.startsWith('/saas/cleaning-workers')) ||
    (item.id === 'cleaning-services' && location.pathname.startsWith('/saas/cleaning-services')) ||
    (item.id === 'cleaning-routes' && location.pathname.startsWith('/saas/cleaning-routes')) ||
    (item.id === 'cleaning-checklist' && location.pathname.startsWith('/saas/cleaning-checklist')) ||
    (item.id === 'cleaning-quality' && location.pathname.startsWith('/saas/cleaning-quality')) ||
    (item.id === 'cleaning-reviews' && location.pathname.startsWith('/saas/cleaning-reviews')) ||
    (item.id === 'cleaning-incidents' && location.pathname.startsWith('/saas/cleaning-incidents')) ||
    (item.id === 'catalog' && location.pathname.startsWith('/saas/catalog')) ||
    (item.id === 'articles' && location.pathname.startsWith('/saas/articles')) ||
    (item.id === 'suppliers' && location.pathname.startsWith('/saas/suppliers')) ||
    (item.id === 'orders' && location.pathname.startsWith('/saas/orders')) ||
    (item.id === 'purchase-orders' && location.pathname.startsWith('/saas/purchase-orders')) ||
    (item.id === 'income-expenses' && location.pathname.startsWith('/saas/income-expenses')) ||
    (item.id === 'ebitda' && location.pathname.startsWith('/saas/ebitda')) ||
    (item.id === 'taxes' && location.pathname.startsWith('/saas/taxes')) ||
    (item.id === 'bank-reconciliation' && location.pathname.startsWith('/saas/bank-reconciliation')) ||
    (item.id === 'promotions' && location.pathname.startsWith('/saas/promotions')) ||
    (item.id === 'payroll' && location.pathname.startsWith('/saas/payroll')) ||
    (item.id === 'worker-home' && location.pathname === '/saas/worker') ||
    (item.id !== 'worker-home' && item.id.startsWith('worker-') && location.pathname.startsWith(item.path)) ||
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
    (item.id.startsWith('events-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('salon-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('scrapyard-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('spareparts-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('taxi-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('pharmacy-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('carwash-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('vet-') && location.pathname.startsWith(item.path)) ||
    (item.id.startsWith('sp-') && location.pathname.startsWith(item.path));

  const visibleById = new Map(visibleMenuItems.map((item) => [item.id, item]));
  const COMMON_SIDEBAR_GROUPS = new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion']);
  const allowedGroupsList = sidebarGroups.filter((g) => allowedGroups.has(g.id));
  const shouldHideCrmGroup = vertical === 'delivery';
  const filteredGroups: SidebarGroup[] = [
    HOME_GROUP,
    ...allowedGroupsList.filter((g) => !COMMON_SIDEBAR_GROUPS.has(g.id) && !(shouldHideCrmGroup && g.id === 'clientesCrm')),
    ...allowedGroupsList.filter((g) => COMMON_SIDEBAR_GROUPS.has(g.id) && !(shouldHideCrmGroup && g.id === 'clientesCrm')),
  ];
  const salesPointItems: SidebarItem[] = salesPoints.map((sp) => ({
    id: `sp-${sp._id}`,
    label: sp.name,
    icon: <Store className="w-5 h-5" />,
    path: `/saas/tpv/punto/${sp._id}`,
  }));

  const salesPointsGroup: (SidebarGroup & { items: SidebarItem[] }) | null =
    salesPointItems.length > 0
      ? {
          id: 'salesPoints',
          label: t('sidebar.groups.salesPoints', 'Centros de trabajo'),
          icon: <Building2 className="w-4 h-4 shrink-0" />,
          itemIds: salesPointItems.map((i) => i.id),
          items: salesPointItems,
        }
      : null;

  const groupedVisibleItems = (() => {
    const mapped = filteredGroups
      .map((group) => ({
        ...group,
        items: group.itemIds
          .map((id) => visibleById.get(id))
          .filter((item): item is SidebarItem => Boolean(item)),
      }))
      .filter((group) => group.items.length > 0);
    if (salesPointsGroup) {
      const [home, ...rest] = mapped;
      return [home, salesPointsGroup, ...rest];
    }
    return mapped;
  })();

  const bottomItemIds = allowedBottom;
  const bottomVisibleItems = visibleMenuItems.filter((item) => bottomItemIds.has(item.id));

  const workerById = new Map(workerMenuItems.map((item) => [item.id, item]));
  const ADMIN_ONLY_GROUPS = new Set(['clientesCrm', 'equipo', 'catalogProviders', 'finanzas', 'documentacion']);
  const WORKER_HIDDEN_ITEM_IDS = new Set(['delivery-ops']);
  const verticalGroupsForWorker = sidebarGroups
    .filter((g) => allowedGroups.has(g.id) && !ADMIN_ONLY_GROUPS.has(g.id))
    .map((group) => ({
      ...group,
      items: group.itemIds
        .map((id) => visibleById.get(id))
        .filter((item): item is SidebarItem => Boolean(item) && !WORKER_HIDDEN_ITEM_IDS.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);
  const workerGroupedItems = [
    { ...workerHomeGroup, items: workerHomeGroup.itemIds.map((id) => workerById.get(id)).filter((item): item is SidebarItem => Boolean(item)) },
    ...verticalGroupsForWorker,
    ...workerGroups.map((g) => ({ ...g, items: g.itemIds.map((id) => workerById.get(id)).filter((item): item is SidebarItem => Boolean(item)) })),
  ].filter((g) => g.items.length > 0);

  const searchNorm = sidebarSearch.trim().toLowerCase();
  const itemMatchesSearch = (item: SidebarItem) =>
    !searchNorm || item.label.toLowerCase().includes(searchNorm) || item.id.toLowerCase().includes(searchNorm);

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

  const sidebarContent = (isMobile: boolean) => {
    const narrow = !isMobile && collapsed;
    return (
    <aside
      className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col h-svh max-h-svh overflow-hidden ${
        isMobile
          ? 'w-72'
          : `fixed inset-y-0 left-0 z-40 transition-[width] duration-300 ${collapsed ? 'w-20' : 'w-60'}`
      }`}
    >
      {/* Company selector + Mode toggle */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700">
        {isMobile && (
          <div className="flex items-center justify-end p-4 pb-0">
            <button
              onClick={onMobileClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        )}

        {/* Company selector dropdown */}
        <div ref={companySelectorRef} className={`relative ${narrow ? 'px-1 pb-1' : 'px-3 pb-1'}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setShowCompanyDropdown((prev) => !prev)}
              className={`flex items-center gap-2 rounded-lg transition-all text-sm ${
                narrow ? 'justify-center p-2 flex-1 min-w-0' : 'px-3 py-2 flex-1 min-w-0'
              } hover:bg-gray-100 dark:hover:bg-gray-800`}
              title={narrow ? (currentBusiness?.name || t('topbar.myCompany')) : undefined}
            >
              <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                {currentBusiness?.logo ? (
                  <img
                    src={currentBusiness.logo}
                    alt={currentBusiness.name}
                    className="w-7 h-7 rounded-lg object-cover"
                  />
                ) : (
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                    {currentBusiness
                      ? currentBusiness.name.slice(0, 2).toUpperCase()
                      : (user?.firstName?.[0] || 'U').toUpperCase()}
                  </span>
                )}
              </div>
              {(isMobile || !collapsed) && (
                <>
                  <span className="font-medium text-gray-900 dark:text-gray-100 flex-1 text-left truncate">
                    {currentBusiness?.name || user?.companyName || user?.firstName || t('topbar.myCompany')}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${showCompanyDropdown ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={toggleWorkerMode}
              className={`rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                narrow ? 'p-2 flex-shrink-0' : 'px-2 py-2 flex-shrink-0 max-w-[96px]'
              }`}
              title={currentProfileLabel}
            >
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 min-w-0">
                <ArrowLeftRight className="w-3.5 h-3.5" />
                {(isMobile || !collapsed) && (
                  <span className="truncate">{currentProfileLabel}</span>
                )}
              </span>
            </button>
          </div>

          {showCompanyDropdown && (
            <div className={`absolute z-50 mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden ${
              narrow ? 'left-full top-0 ml-2 w-64' : 'left-0 right-0 w-full'
            }`}>
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
                  businesses.map((business) => {
                    const isActiveBiz = currentBusiness?.business_id === business.business_id;
                    const bizInitials = business.name.slice(0, 2).toUpperCase();
                    return (
                      <button
                        key={business.business_id}
                        type="button"
                        onClick={() => {
                          switchBusiness(business.business_id);
                          setShowCompanyDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${isActiveBiz ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-100 dark:bg-blue-900 overflow-hidden">
                          {business.logo ? (
                            <img src={business.logo} alt={business.name} className="w-8 h-8 object-cover rounded-lg" />
                          ) : (
                            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{bizInitials}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${isActiveBiz ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
                            {business.name}
                          </p>
                          {business.city && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{business.city}</p>
                          )}
                        </div>
                        {isActiveBiz && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowCompanyDropdown(false);
                    navigate('/saas/settings/empresas');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('topbar.manageCompanies')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar search */}
        {(isMobile || !collapsed) && (
          <div className="px-3 pb-2 pt-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder={t('sidebar.searchMenu', 'Buscar menú...')}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 transition-colors"
              />
              {sidebarSearch && (
                <button
                  type="button"
                  onClick={() => setSidebarSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
            const shouldShowChildren = showGroupedAsFlat || isExpanded || !!searchNorm;

            const sortedItems = searchNorm
              ? [...group.items.filter(itemMatchesSearch), ...group.items.filter((i) => !itemMatchesSearch(i))]
              : group.items;

            return (
              <NavSectionShell key={group.id} narrow={narrow}>
                <div className={`transition-opacity duration-200 ${dimmed ? 'opacity-30' : ''}`}>
                  {!showGroupedAsFlat && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedGroups((prev) => ({
                          ...prev,
                          [group.id]: !prev[group.id],
                        }))
                      }
                      className={`w-full flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-wide transition-colors rounded-t-xl ${
                        groupHasActiveItem
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 flex-1 min-w-0 text-left font-semibold">
                        {group.icon}
                        {group.label}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 transition-transform ${(isExpanded || !!searchNorm) ? 'rotate-180' : 'rotate-0'}`}
                      />
                    </button>
                  )}

                  {shouldShowChildren &&
                    sortedItems.map((item) => {
                      const isActive = isItemActive(item);
                      const itemDimmed = !dimmed && searchNorm && !itemMatchesSearch(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleMenuItemClick(item)}
                          className={`relative w-full flex items-center gap-3 py-2.5 transition-all last:rounded-b-xl ${
                            !isMobile && collapsed ? 'justify-center px-0' : 'px-4'
                          } ${
                            isActive
                              ? 'bg-amber-50 dark:bg-amber-900/25 text-amber-900 dark:text-amber-300 border-l-2 border-amber-600'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/40'
                          } ${item.disabled ? 'opacity-60 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent' : ''} ${
                            itemDimmed ? 'opacity-30' : ''
                          }`}
                          disabled={item.disabled}
                          title={!isMobile && collapsed ? item.label : undefined}
                        >
                          <span className={isActive ? 'text-amber-600' : 'text-gray-500 dark:text-gray-400'}>
                            {item.icon}
                          </span>
                          {(isMobile || !collapsed) && (
                            <span className="font-medium flex-1 text-left">{item.label}</span>
                          )}
                          {(isMobile || !collapsed) && item.isNew && !seenNewItems.has(item.id) && (
                            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[9px] font-bold rounded-full leading-none flex-shrink-0 animate-pulse">
                              {t('sidebar.new')}
                            </span>
                          )}
                          {(isMobile || !collapsed) && item.pro && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] font-bold rounded-full leading-none flex-shrink-0">
                              <Sparkles className="w-2.5 h-2.5" />
                              {t('sidebar.pro')}
                            </span>
                          )}
                          {(isMobile || !collapsed) && item.upcoming && (
                            <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[9px] font-bold rounded-full leading-none flex-shrink-0">
                              {t('sidebar.comingSoon')}
                            </span>
                          )}
                          {!isMobile && collapsed && item.isNew && !seenNewItems.has(item.id) && (
                            <span className="absolute right-1 top-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          )}
                          {!isMobile && collapsed && item.pro && (
                            <span className="absolute right-1 top-1 w-2 h-2 bg-amber-400 rounded-full" />
                          )}
                        </button>
                      );
                    })}
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
                  className={`rounded-xl border border-gray-200/90 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 ${
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
                        ? 'border-l-[3px] border-amber-600 bg-amber-50 text-amber-900 dark:bg-amber-900/25 dark:text-amber-200'
                        : 'text-slate-600 hover:bg-slate-50 dark:text-gray-400 dark:hover:bg-gray-800/90'
                    } ${item.disabled ? 'cursor-not-allowed opacity-60 hover:bg-transparent dark:hover:bg-transparent' : ''}`}
                    disabled={item.disabled}
                    title={narrow ? item.label : undefined}
                  >
                    <span
                      className={`shrink-0 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-gray-400'}`}
                    >
                      {item.icon}
                    </span>
                    {(isMobile || !collapsed) && (
                      <span
                        className={`min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide leading-snug ${
                          isActive ? 'text-amber-900 dark:text-amber-200' : 'text-slate-600 dark:text-gray-400'
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
      <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="relative">
          {!isMobile && collapsed ? (
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              title={t('sidebar.userMenu')}
            >
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.fullName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{initials}</span>
                )}
              </div>
            </button>
          ) : (
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
            >
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.fullName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {user?.fullName || t('topbar.user')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user?.role || user?.email || t('sidebar.noRole')}
                </p>
              </div>
            </button>
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
                  navigate('/auth/gate', { replace: true });
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
              >
                <Home className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                <span className="text-sm text-blue-600 dark:text-blue-400">{t('sidebar.backToHome')}</span>
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
        {sidebarContent(false)}
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
          <div className="relative z-10 flex flex-col">
            {sidebarContent(true)}
          </div>
        </div>
      )}

      <SAAS__HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </>
  );
}
