import { createBrowserRouter, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './context/AuthContext';
import { useBusinessOptional } from './context/BusinessContext';
import { isWorkerAccount } from './lib/authApi';
import { resolveWorkerSessionEntryPath, userOwnsAnyBusiness } from './lib/workerProfileCompletion';
import { canUseCeoAdminPanel } from './lib/teamManagerAccess';
import { isAffiliateWorldPath } from './lib/authEntryPaths';
import { RootLayout } from './components/RootLayout';
import { LandingNew } from './pages/LandingNew';
import { NativeOnboarding } from './pages/native/NativeOnboarding';
import { hasSeenNativeOnboarding } from './lib/nativeOnboardingStorage';
import { Entry } from './pages/auth/Entry';
import { Login } from './pages/auth/Login';
import { TeamLogin } from './pages/auth/TeamLogin';
import { TpvTabletLogin } from './pages/auth/TpvTabletLogin';
import { WorkerLogin } from './pages/auth/WorkerLogin';
import { Recover } from './pages/auth/Recover';
import { ResetPassword } from './pages/auth/ResetPassword';
import { AcceptInvite } from './pages/auth/AcceptInvite';
import { JoinByInviteLink } from './pages/auth/JoinByInviteLink';
import { Register } from './pages/auth/Register';
import { BusinessType } from './pages/auth/onboarding/BusinessType';
import { Company } from './pages/auth/onboarding/Company';
import { Structure } from './pages/auth/onboarding/Structure';
import { Needs } from './pages/auth/onboarding/Needs';
import { Recommendation } from './pages/auth/onboarding/Recommendation';
import { PaymentInfo } from './pages/auth/onboarding/PaymentInfo';
import { ServiceAgreement } from './pages/auth/onboarding/ServiceAgreement';
import { Confirmation } from './pages/auth/onboarding/Confirmation';
import { Gate } from './pages/auth/Gate';
import { RequireEmailVerified } from './components/RequireEmailVerified';
import { DELIVERY_CRM_REDIRECT_PATH } from './lib/deliveryCrmFeature';
import { VerifyEmailPending } from './pages/auth/VerifyEmailPending';
import { SaasRoot } from './pages/SaasRoot';
import { Dashboard } from './pages/saas/Dashboard';
import { Operations } from './pages/saas/Operations';
import { CompraventaHub } from './pages/saas/CompraventaHub';
import { VehicleEntryPage } from './pages/saas/VehicleEntryPage';
import { OperationDetail } from './pages/saas/OperationDetail';
import { Vehicles } from './pages/saas/Vehicles';
import { VehicleDetail } from './pages/saas/VehicleDetail';
import { PublicacionVentaPage } from './pages/saas/PublicacionVentaPage';
import { Locations } from './pages/saas/Locations';
import { LocationZone } from './pages/saas/LocationZone';
import { ClientsPage } from './pages/saas/ClientsPage';
import { ClientDetail } from './pages/saas/ClientDetail';
import { ClientPortal } from './pages/public/ClientPortal';
import { DocumentsPage } from './pages/saas/DocumentsPage';
import { DocumentDetail } from './pages/saas/DocumentDetail';
import { Pipeline } from './pages/saas/Pipeline';
import { Sales } from './pages/saas/Sales';
import { SaleDetail } from './pages/saas/SaleDetail';
import { SalesMetrics } from './pages/saas/SalesMetrics';
import { Ancove } from './pages/saas/Ancove';
import { Team } from './pages/saas/Team';
import { TeamMemberDetail } from './pages/saas/TeamMemberDetail';
import { Invitations } from './pages/saas/Invitations';
import { Finance } from './pages/saas/Finance';
import { VerifactuPage } from './pages/saas/VerifactuPage';
import { AdminPanel } from './pages/saas/AdminPanel';
import { AdminClientDetail } from './pages/saas/AdminClientDetail';
import { Settings } from './pages/saas/Settings';
import { ConfiguracionGeneral } from './pages/saas/ConfiguracionGeneral';
import { Billing } from './pages/saas/Billing';
import { HelpCenter } from './pages/saas/HelpCenter';
import { Suspended } from './pages/saas/Suspended';
import { SubscriptionPaymentPage } from './pages/saas/SubscriptionPaymentPage';
import { Reports } from './pages/saas/Reports';
import AlertCenterPage from './pages/saas/AlertCenterPage';
import OcrReviewPage from './pages/saas/OcrReviewPage';
import { CalendarView } from './pages/saas/CalendarView';
import { Quotes } from './pages/saas/Quotes';
import { Groups } from './pages/saas/Groups';
import { QAFinal } from './pages/saas/QAFinal';
import { BlockA1Checklist } from './pages/saas/BlockA1Checklist';
import { BlockA2Checklist } from './pages/saas/BlockA2Checklist';
import { BlockA3Checklist } from './pages/saas/BlockA3Checklist';
import { SAAS__FlowMap } from './pages/saas/SAAS__FlowMap';
import { NavigationMap } from './pages/NavigationMap';
import { Block1QA } from './pages/qa/Block1QA';
import { Block2QA } from './pages/qa/Block2QA';
import { Block3QA } from './pages/qa/Block3QA';
import { Block4QA } from './pages/qa/Block4QA';
import { FinalQA } from './pages/qa/FinalQA';
import { QAIndex } from './pages/qa/QAIndex';
import { ProjectSummary } from './pages/ProjectSummary';
import { AccessFlowDemo } from './pages/AccessFlowDemo';
import { SubscriptionDemo } from './pages/SubscriptionDemo';
import { DemoIndex } from './pages/DemoIndex';
import { VertialPitchDeck } from './pages/VertialPitchDeck';
import { SaasNavigationDemo } from './pages/SaasNavigationDemo';
import { SaasFlowMap } from './pages/SaasFlowMap';
import { SaasQACheck } from './pages/SaasQACheck';
import { OperationsDemo } from './pages/OperationsDemo';
import { LocationsDemo } from './pages/LocationsDemo';
import { EmbedLeadForm } from './pages/public/EmbedLeadForm';
import { AffiliatePage } from './pages/public/AffiliatePage';
import { AffiliatePortal } from './pages/public/AffiliatePortal';
import { BookingPage } from './pages/public/BookingPage';
import { MeetingsPage } from './pages/public/MeetingsPage';
import { GdprPanel } from './pages/saas/GdprPanel';
import { VehiclePublic } from './pages/public/VehiclePublic';
import { SignaturePublic } from './pages/public/SignaturePublic';
import { LegalHubPage } from './pages/public/LegalHubPage';
import { LegalDocumentPage } from './pages/public/LegalDocumentPage';
import { Workshop } from './pages/saas/Workshop';
import { WorkOrderDetail } from './pages/saas/WorkOrderDetail';
import { Parts } from './pages/saas/Parts';
import { TechnicianView } from './pages/saas/TechnicianView';
import { Commissions } from './pages/saas/Commissions';
import { PayrollPage } from './pages/saas/PayrollPage';
import { GestoriaHubPage } from './pages/saas/GestoriaHubPage';
import { RedirectLegacyDelivery } from './components/saas/RedirectLegacyDelivery';
import { RestaurantReservationsRouteEntry } from './verticals/restaurant/RestaurantReservationsRouteEntry';
import { RestaurantWaitlistPage } from './verticals/restaurant/RestaurantWaitlistPage';
import { RestaurantKitchenRouteEntry } from './verticals/restaurant/RestaurantKitchenRouteEntry';
import { RestaurantReportsPage } from './verticals/restaurant/RestaurantReportsPage';
import { RestaurantCajaRouteEntry } from './verticals/restaurant/RestaurantCajaRouteEntry';
import { RestaurantCeoTpvPage } from './verticals/restaurant/RestaurantCeoTpvPage';
import { RestaurantSalaRouteEntry } from './verticals/restaurant/RestaurantSalaRouteEntry';
import { RestaurantOpsCenter } from './verticals/restaurant/RestaurantOpsCenter';
import { RequireRestaurantVertical } from './components/saas/RequireRestaurantVertical';
import { RequireSalaAccess } from './components/saas/RequireSalaAccess';
import { DeliveryReparto } from './pages/saas/DeliveryReparto';
import { DeliveryMontaje } from './pages/saas/DeliveryMontaje';
import { DeliveryKitchen } from './pages/saas/DeliveryKitchen';
import { VerticalCatalogEntry, VerticalArticlesRedirect } from './pages/saas/VerticalCatalogEntry';
import InventoryPage from './pages/saas/InventoryPage';
import { DealershipWorkers } from './pages/saas/DealershipWorkers';
import { TpvRapidoPage } from './pages/saas/TpvRapidoPage';
import { TpvQuickBridgePage } from './pages/saas/TpvQuickBridgePage';
import { TpvRouteShell } from './components/saas/TpvRouteShell';
import { CajaPage } from './pages/saas/CajaPage';
import { RequirePdvTerminal } from './components/saas/RequirePdvTerminal';
import { RequireTpvTabletEntry } from './components/saas/RequireTpvTabletEntry';
import { RedirectLegacyDeliveryTpv } from './components/saas/RedirectLegacyDeliveryTpv';
import { RequireBusinessOwner } from './components/saas/RequireBusinessOwner';
import { RequireDeliveryVertical } from './components/saas/RequireDeliveryVertical';
import { RequireCompraventaVertical } from './components/saas/RequireCompraventaVertical';
import { RequireCleaningVertical } from './components/saas/RequireCleaningVertical';
import { RequireRealEstateVertical } from './components/saas/RequireRealEstateVertical';
import { RequireTeamManager } from './components/saas/RequireTeamManager';
import { RequireWebOrderingVertical } from './components/saas/RequireWebOrderingVertical';
import { RedirectEventsFromRetailRoutes } from './components/saas/RedirectEventsFromRetailRoutes';
import { RequireSuperAdmin } from './components/saas/RequireSuperAdmin';
import { RequireWorkerPermission } from './components/saas/RequireWorkerPermission';
import { ChangelogPage } from './pages/saas/ChangelogPage';
import { WorkOrderStatus } from './pages/public/WorkOrderStatus';
import { WebStorefront } from './pages/public/WebStorefront';
import { MesaQrPublicPage } from './pages/public/MesaQrPublicPage';
import { QuotePublicResponse } from './pages/public/QuotePublicResponse';
import { WebConfig } from './pages/saas/WebConfig';
import { WebOrders } from './pages/saas/WebOrders';
import { DeliveryIntegrations } from './pages/saas/DeliveryIntegrations';
import { DeliveryReports } from './pages/saas/DeliveryReports';
import { CleaningHub } from './pages/saas/CleaningHub';
import { CleaningWorkers } from './pages/saas/CleaningWorkers';
import { CleaningServices } from './pages/saas/CleaningServices';
import { CleaningRoutes } from './pages/saas/CleaningRoutes';
import { CleaningExecution } from './pages/saas/CleaningExecution';
import { ServiceContractsPage } from './pages/saas/ServiceContractsPage';
// Cleaning vertical pages (dedicated CRM/billing/stock for limpieza)
import { CleaningClientsPage } from './pages/saas/CleaningClientsPage';
import { CleaningBilling } from './pages/saas/CleaningBilling';
import { CleaningMaterialsPage } from './pages/saas/CleaningMaterialsPage';
import { CleaningReports } from './pages/saas/CleaningReports';
import { CleaningChecklist } from './pages/saas/CleaningChecklist';
import { CleaningQuality } from './pages/saas/CleaningQuality';
import { CleaningReviews } from './pages/saas/CleaningReviews';
import { CleaningIncidents } from './pages/saas/CleaningIncidents';
import { WorkerMaterials } from './pages/saas/worker/WorkerMaterials';
import { Chat } from './pages/saas/Chat';
import { SupplierInvoiceEmailPage } from './pages/saas/SupplierInvoiceEmailPage';
import { ClientBillingPage } from './pages/saas/ClientBillingPage';
import { IncomeExpensesPage } from './pages/saas/IncomeExpensesPage';
import { EbitdaPage } from './pages/saas/EbitdaPage';
import { TaxesPage } from './pages/saas/TaxesPage';
import { BankReconciliationPage } from './pages/saas/BankReconciliationPage';
import { ArticlesPage } from './pages/saas/ArticlesPage';
import { SuppliersPage } from './pages/saas/SuppliersPage';
import { SuppliersLayout } from './pages/saas/suppliers/SuppliersLayout';
import { SupplierDetailPage } from './pages/saas/SupplierDetailPage';
import { ComprasStockPage } from './pages/saas/ComprasStockPage';
import { PromotionsPage } from './pages/saas/PromotionsPage';

import { Clockins } from './pages/saas/Clockins';
import { Schedules } from './pages/saas/Schedules';
import { Vacations } from './pages/saas/Vacations';
import { SchedulesVacations } from './pages/saas/SchedulesVacations';
import { HrRequestsPage } from './pages/saas/HrRequestsPage';
import { Affiliates } from './pages/saas/Affiliates';
import { SetupOnboarding } from './pages/saas/SetupOnboarding';

// ── Gym ──
import { GymClasses } from './pages/saas/GymClasses';
import { GymMemberships } from './pages/saas/GymMemberships';
import { GymRoutines } from './pages/saas/GymRoutines';
import { GymAccess } from './pages/saas/GymAccess';
import { GymMembers } from './pages/saas/GymMembers';
import { GymTrainers } from './pages/saas/GymTrainers';
import { GymDashboard } from './pages/saas/dashboards/GymDashboard';

// ── Clinic ──
import { ClinicHistory } from './pages/saas/ClinicHistory';
import { ClinicTreatments } from './pages/saas/ClinicTreatments';
import { ClinicPrescriptions } from './pages/saas/ClinicPrescriptions';

// ── Hotel ──
import { HotelReservations } from './pages/saas/HotelReservations';
import { HotelRooms } from './pages/saas/HotelRooms';
// HotelGuests removed (duplicate of ClientsPage)
import { HotelCheckin } from './pages/saas/HotelCheckin';
import { HotelHousekeeping } from './pages/saas/HotelHousekeeping';
import { HotelRoomService } from './pages/saas/HotelRoomService';

// ── Construction ──
import { ConstructionProjects } from './pages/saas/ConstructionProjects';
import { ConstructionProjectDetail } from './pages/saas/ConstructionProjectDetail';
import { ConstructionBudgets } from './pages/saas/ConstructionBudgets';
// ConstructionClients removed (duplicate of ClientsPage)
// ConstructionWorkers removed (duplicate of Team)
import { ConstructionTasks } from './pages/saas/ConstructionTasks';
import { ConstructionExecution } from './pages/saas/ConstructionExecution';
import { ConstructionOpsCenter } from './pages/saas/ConstructionOpsCenter';
import { ConstructionCollections } from './pages/saas/ConstructionCollections';
import { ConstructionPayments } from './pages/saas/ConstructionPayments';
// ConstructionReports removed (duplicate of Reports)
import { ConstructionIncidents } from './pages/saas/ConstructionIncidents';
// ConstructionDocuments removed (duplicate of DocumentsPage)
import { QuickBudgetPage } from './pages/saas/QuickBudgetPage';
import { ConstructionClosure } from './pages/saas/ConstructionClosure';
import { ConstructionPartidasGremios } from './pages/saas/ConstructionPartidasGremios';

// ── Academy ──
import { AcademyCourses } from './pages/saas/AcademyCourses';
import { AcademyEnrollments } from './pages/saas/AcademyEnrollments';
import { AcademyGrades } from './pages/saas/AcademyGrades';

// ── Real Estate ──
import { RealEstateProperties } from './pages/saas/RealEstateProperties';
import { RealEstateVisits } from './pages/saas/RealEstateVisits';
import { RealEstateContracts } from './pages/saas/RealEstateContracts';
// RealEstateOwners/Tenants removed (duplicate of ClientsPage)
import { RealEstateAppraisals } from './pages/saas/RealEstateAppraisals';

// ── Lawyer ──
import { LawyerOpsCenter } from './pages/saas/LawyerOpsCenter';
import { LawyerCaptacion } from './pages/saas/LawyerCaptacion';
import { LawyerCases } from './pages/saas/LawyerCases';
import { LawyerGestion } from './pages/saas/LawyerGestion';
import { LawyerArchivo } from './pages/saas/LawyerArchivo';
import { LawyerHearings } from './pages/saas/LawyerHearings';
import { LawyerDeadlines } from './pages/saas/LawyerDeadlines';
import { LawyerBilling } from './pages/saas/LawyerBilling';

// ── Nightclub ──
import { NightclubEvents } from './pages/saas/NightclubEvents';
import { NightclubVIP } from './pages/saas/NightclubVIP';
import { NightclubPromoters } from './pages/saas/NightclubPromoters';
import { NightclubGuestlist } from './pages/saas/NightclubGuestlist';
// NightclubInventory removed (duplicate of ComprasStockPage)
import { NightclubArtists } from './pages/saas/NightclubArtists';

// ── Events ──
import { EventsServices, RedirectToEventsServicesTab } from './pages/saas/EventsServices';
import { EventsHub } from './pages/saas/vertical/eventos/EventsHub';
import { EventsContractWizardPage } from './pages/saas/vertical/eventos/EventsContractWizardPage';
import { EventsPipelinePage } from './pages/saas/vertical/eventos/EventsPipelinePage';
import { EventsQuotesPage } from './pages/saas/vertical/eventos/EventsQuotesPage';
import { EventsRoutePage } from './pages/saas/vertical/eventos/EventsRoutePage';
import { EventsProjectPage } from './pages/saas/vertical/eventos/EventsProjectPage';
import { EventsTpvPage } from './pages/saas/vertical/eventos/EventsTpvPage';

// ── Hair Salon ──
import { SalonServices } from './pages/saas/SalonServices';
import { SalonLoyalty } from './pages/saas/SalonLoyalty';

// ── Scrapyard ──
import { ScrapyardHub } from './pages/saas/ScrapyardHub';
import { ScrapyardVehicles } from './pages/saas/ScrapyardVehicles';
import { ScrapyardVehicleDetail } from './pages/saas/ScrapyardVehicleDetail';
import { ScrapyardParts } from './pages/saas/ScrapyardParts';
// ScrapyardInventory removed (duplicate of ComprasStockPage)
import { ScrapyardDeregistrations } from './pages/saas/ScrapyardDeregistrations';
// ScrapyardSales removed (duplicate of Sales)
import { ScrapyardEnvironment } from './pages/saas/ScrapyardEnvironment';
import { ScrapyardExpedition } from './pages/saas/ScrapyardExpedition';
import { ScrapyardPurchasesPage } from './pages/saas/ScrapyardPurchasesPage';
// ScrapyardReports removed (duplicate of Reports)
import { ScrapyardDocumentationPage } from './pages/saas/ScrapyardDocumentationPage';
// ScrapyardWorkers removed (duplicate of Team)
import { ScrapyardDismantling } from './pages/saas/ScrapyardDismantling';

// ── Spare Parts ──
import { SparePartsCompatibility } from './pages/saas/SparePartsCompatibility';
import { SparePartsCounter } from './pages/saas/SparePartsCounter';

// ── Taxi ──
import { TaxiFleet } from './pages/saas/TaxiFleet';
import { TaxiTrips } from './pages/saas/TaxiTrips';
import { TaxiShifts } from './pages/saas/TaxiShifts';

// ── Pharmacy ──
import { PharmacyPrescriptions } from './pages/saas/PharmacyPrescriptions';
import { PharmacyGuard } from './pages/saas/PharmacyGuard';

// ── Car Wash ──
import { CarWashServices } from './pages/saas/CarWashServices';
import { CarWashMemberships } from './pages/saas/CarWashMemberships';

// ── Vet ──
import { VetPatients } from './pages/saas/VetPatients';
import { VetHistory } from './pages/saas/VetHistory';
import { VetVaccinations } from './pages/saas/VetVaccinations';

// ── Tobacco Shop (Estanco) ──
import { TobaccoLottery } from './pages/saas/TobaccoLottery';
import { TobaccoRegulatory } from './pages/saas/TobaccoRegulatory';

// ── Butcher Shop (Carnicería) ──
import { ButcherHub } from './pages/saas/ButcherHub';
import { ButcherClients } from './pages/saas/ButcherClients';
import { ButcherProducts } from './pages/saas/ButcherProducts';
import { ButcherOrders } from './pages/saas/ButcherOrders';
import { ButcherSales } from './pages/saas/ButcherSales';
import { ButcherReports } from './pages/saas/ButcherReports';
import { ButcherTraceability } from './pages/saas/ButcherTraceability';
import { ButcherWaste } from './pages/saas/ButcherWaste';
import { ButcherPurchasesPage } from './pages/saas/ButcherPurchasesPage';
import { ButcherReparto } from './pages/saas/ButcherReparto';
import { ButcherDespiece } from './pages/saas/ButcherDespiece';
import { ButcherScaleSetup } from './pages/saas/ButcherScaleSetup';
import { ButcherTpvPage } from './pages/saas/ButcherTpvPage';
import { WorkerButcherReparto } from './pages/saas/WorkerButcherReparto';
import {
  HeladeriaOpsPage,
  HeladeriaTpvPage,
  HeladeriaCajaPage,
  HeladeriaEncargosPage,
  HeladeriaIntegracionesPage,
} from './verticals/heladeria';
import { CompraventaCrm } from './pages/saas/vertical/compraventa/CompraventaCrm';
import { CompraventaComprasPage } from './pages/saas/vertical/compraventa/CompraventaComprasPage';
import { CompraventaVentasPage } from './pages/saas/vertical/compraventa/CompraventaVentasPage';
import { CompraventaTasacionesPage } from './pages/saas/vertical/compraventa/CompraventaTasacionesPage';
import { CompraventaEntregasPage } from './pages/saas/vertical/compraventa/CompraventaEntregasPage';
import { CompraventaFiscalCalculatorPage } from './pages/saas/vertical/compraventa/CompraventaFiscalCalculatorPage';
import { PreparationExpenses } from './pages/saas/PreparationExpenses';
import { ButcherWorkerOrders } from './pages/saas/ButcherWorkerOrders';

import { SalesPointTpvPage } from './pages/saas/SalesPointTpvPage';
import { ClockKiosk } from './pages/saas/ClockKiosk';

import {
  WorkerIdentitySetup,
  WorkerPayrollSetup,
  WorkerTasks,
  WorkerCalendar,
  WorkerRequests,
  WorkerClock,
  WorkerChat,
  WorkerDocs,
  WorkerOnboarding,
  WorkerProfile,
  WorkerContractInfo,
  WorkerPosition,
  WorkerNotifications,
  WorkerSecurity,
  WorkerTpv,
  WorkerTpvEntry,
  WorkerTpvDeliveryRoute,
  WorkerConstructionReport,
  WorkerStockReviewPage,
  WorkerEventsOps,
  WorkerEventDayPage,
} from './pages/saas/worker';
import { UserDashboard } from './pages/saas/UserDashboard';
import { AuthRouteLoading } from './components/AuthRouteLoading';

function MechanicStandalone() {
  return (
    <ProtectedRoute>
      <TechnicianView />
    </ProtectedRoute>
  );
}

function EquipoRedirect() {
  const { userId } = useParams();
  return <Navigate to={`/saas/team/${userId}`} replace />;
}

/** Rutas desconocidas: NUNCA al SaaS (evita saltar afiliado → trabajador al fallar un PDF/enlace). */
function CatchAll() {
  const location = useLocation();
  if (isAffiliateWorldPath(location.pathname) || location.pathname.startsWith('/docs/')) {
    return <Navigate to="/panel-afiliado" replace />;
  }
  return <Navigate to="/" replace />;
}

/**
 * En la app nativa (iOS/Android) la ruta `/` no muestra la landing web:
 * primera apertura → onboarding de 4 páginas; después → acceso o su sesión.
 */
function HomeEntry() {
  const { isAuthenticated, isInitializing } = useAuth();
  if (!Capacitor.isNativePlatform()) {
    return <LandingNew />;
  }
  if (isInitializing) {
    return <AuthRouteLoading label="Abriendo Vertial…" />;
  }
  if (isAuthenticated) {
    return <Navigate to="/saas" replace />;
  }
  if (!hasSeenNativeOnboarding()) {
    return <NativeOnboarding />;
  }
  return <Navigate to="/auth/entry" replace />;
}

/** /saas y /saas/ no tenían hijo index → Outlet vacío (pantalla en blanco). */
function SaasIndexRedirect() {
  const { user } = useAuth();
  const businessCtx = useBusinessOptional();
  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }
  const businessesPending =
    !businessCtx?.businessesFetchSettled || Boolean(businessCtx?.isLoading);
  if (businessesPending) {
    return <AuthRouteLoading label="Preparando espacio de trabajo…" />;
  }
  const ownsBusiness = userOwnsAnyBusiness(user.user_id, businessCtx?.businesses);
  if (user.accountType === 'user' && !String(user.linkedBusinessId || '').trim() && !ownsBusiness) {
    return <Navigate to="/saas/user-dashboard" replace />;
  }
  if (isWorkerAccount(user) && !ownsBusiness) {
    if (canUseCeoAdminPanel(user, businessCtx?.businesses)) {
      return <Navigate to="/saas/dashboard" replace />;
    }
    return <Navigate to={resolveWorkerSessionEntryPath(user, businessCtx?.businesses)} replace />;
  }
  return <Navigate to="/saas/dashboard" replace />;
}

/** Centro Operativo delivery: chunk solo al abrir la ruta (no en el bundle inicial). */
const DeliveryOpsCenterLazy = lazy(() =>
  import('./pages/saas/DeliveryOpsCenter').then((m) => ({ default: m.DeliveryOpsCenter })),
);

function DeliveryOpsCenterRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--v-blue,#2563eb)] dark:border-gray-600 dark:border-t-blue-400" />
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Cargando operativa…</p>
          </div>
        </div>
      }
    >
      <DeliveryOpsCenterLazy />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      {
        index: true,
        Component: HomeEntry,
      },
      {
        path: 'demos',
        Component: DemoIndex,
      },
      {
        path: 'presentacion',
        Component: VertialPitchDeck,
      },
      {
        path: 'project-summary',
        Component: ProjectSummary,
      },
      {
        path: 'access-flow-demo',
        Component: AccessFlowDemo,
      },
      {
        path: 'subscription-demo',
        Component: SubscriptionDemo,
      },
      {
        path: 'auth/entry',
        Component: Entry,
      },
      {
        path: 'acceso/empresa',
        element: <Navigate to="/auth/login" replace />,
      },
      {
        path: 'acceso/trabajador',
        element: <Navigate to="/auth/worker-login" replace />,
      },
      {
        path: 'auth/login',
        element: (
          <ErrorBoundary moduleName="Inicio de sesión">
            <Login />
          </ErrorBoundary>
        ),
      },
      {
        path: 'auth/team-login',
        Component: TeamLogin,
      },
      {
        path: 'auth/tpv-tablet',
        Component: TpvTabletLogin,
      },
      {
        path: 'auth/worker-login',
        Component: WorkerLogin,
      },
      {
        path: 'auth/recover',
        Component: Recover,
      },
      {
        path: 'auth/reset-password',
        Component: ResetPassword,
      },
      {
        path: 'auth/accept-invite',
        Component: AcceptInvite,
      },
      {
        path: 'auth/join',
        Component: JoinByInviteLink,
      },
      {
        path: 'auth/register',
        Component: Register,
      },
      {
        path: 'auth/onboarding/business-type',
        element: (
          <RequireEmailVerified>
            <BusinessType />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/onboarding/company',
        element: (
          <RequireEmailVerified>
            <Company />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/onboarding/structure',
        element: (
          <RequireEmailVerified>
            <Structure />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/onboarding/needs',
        element: (
          <RequireEmailVerified>
            <Needs />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/onboarding/recommendation',
        element: (
          <RequireEmailVerified>
            <Recommendation />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/onboarding/payment-info',
        element: (
          <RequireEmailVerified>
            <PaymentInfo />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/onboarding/contrato',
        element: (
          <RequireEmailVerified>
            <ServiceAgreement />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/onboarding/confirmation',
        element: (
          <RequireEmailVerified>
            <Confirmation />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/gate',
        element: (
          <RequireEmailVerified>
            <Gate />
          </RequireEmailVerified>
        ),
      },
      {
        path: 'auth/verify-email',
        Component: VerifyEmailPending,
      },
      {
        path: 'auth/verify-email-pending',
        Component: VerifyEmailPending,
      },
      // SaaS routes — all wrapped with AppProvider via SaasRoot layout
      {
        path: 'saas',
        Component: SaasRoot,
        children: [
          { index: true, element: <SaasIndexRedirect /> },
          { path: 'dashboard', element: <RequireBusinessOwner><Dashboard /></RequireBusinessOwner> },
          { path: 'alerts', element: <RequireBusinessOwner><AlertCenterPage /></RequireBusinessOwner> },
          { path: 'onboarding', Component: SetupOnboarding },
          { path: 'delivery/primer-pdv', element: <Navigate to="/saas/dashboard" replace /> },
          { path: 'user-dashboard', Component: UserDashboard },
          { path: 'reports', element: <RequireBusinessOwner><Reports /></RequireBusinessOwner> },
          { path: 'calendar', Component: CalendarView },
          { path: 'chat', Component: Chat },
          { path: 'chat/:channelId', Component: Chat },
          { path: 'operations', element: <RequireBusinessOwner><Operations /></RequireBusinessOwner> },
          { path: 'operations/:id', element: <RequireWorkerPermission permission="vehicles"><OperationDetail /></RequireWorkerPermission> },
          { path: 'vehicles', element: <RequireWorkerPermission permission="vehicles"><Vehicles /></RequireWorkerPermission> },
          { path: 'vehicles/:id', element: <RequireWorkerPermission permission="vehicles"><VehicleDetail /></RequireWorkerPermission> },
          { path: 'vertical/compraventa/publicacion-venta', element: <RequireBusinessOwner><RequireCompraventaVertical><PublicacionVentaPage /></RequireCompraventaVertical></RequireBusinessOwner> },
          { path: 'locations', Component: Locations },
          { path: 'locations/:id', Component: LocationZone },
          { path: 'clients', element: <RequireWorkerPermission permission="clients"><ClientsPage /></RequireWorkerPermission> },
          { path: 'clientes', element: <Navigate to="/saas/crm/clientes?tab=clients" replace /> },
          { path: 'clients/:id', element: <RequireWorkerPermission permission="clients"><ClientDetail /></RequireWorkerPermission> },
          { path: 'crm/clientes', element: <RequireWorkerPermission permission="clients"><ClientsPage /></RequireWorkerPermission> },
          { path: 'crm/clientes/:id', element: <RequireWorkerPermission permission="clients"><ClientDetail /></RequireWorkerPermission> },
          { path: 'pipeline', element: <RequireBusinessOwner><Pipeline /></RequireBusinessOwner> },
          { path: 'documents', element: <RequireWorkerPermission permission="documents"><DocumentsPage /></RequireWorkerPermission> },
          { path: 'documents/:id', element: <RequireWorkerPermission permission="documents"><DocumentDetail /></RequireWorkerPermission> },
          { path: 'sales', element: <RequireWorkerPermission permission="sales"><Sales /></RequireWorkerPermission> },
          { path: 'sales/:id', element: <RequireWorkerPermission permission="sales"><SaleDetail /></RequireWorkerPermission> },
          { path: 'sales-metrics', element: <RequireBusinessOwner><SalesMetrics /></RequireBusinessOwner> },
          { path: 'reservations', element: <RequireWorkerPermission permission="reservations"><RestaurantReservationsRouteEntry /></RequireWorkerPermission> },
          { path: 'reservas', element: <Navigate to="/saas/reservations" replace /> },
          { path: 'ancove', element: <RequireWorkerPermission permission="ancove"><Ancove /></RequireWorkerPermission> },
          { path: 'team', element: <RequireTeamManager><Team /></RequireTeamManager> },
          { path: 'team/:userId', element: <RequireTeamManager><TeamMemberDetail /></RequireTeamManager> },
          { path: 'invitations', Component: Invitations },
          { path: 'equipo', element: <Navigate to="/saas/team" replace /> },
          { path: 'equipo/:userId', Component: EquipoRedirect },
          { path: 'clockins', element: <RequireBusinessOwner><Clockins /></RequireBusinessOwner> },
          { path: 'equipo/solicitudes', element: <RequireBusinessOwner><HrRequestsPage /></RequireBusinessOwner> },
          { path: 'equipo/horarios-vacaciones', element: <RequireBusinessOwner><SchedulesVacations /></RequireBusinessOwner> },
          { path: 'schedules', element: <Navigate to="/saas/equipo/horarios-vacaciones" replace /> },
          { path: 'vacations', element: <Navigate to="/saas/equipo/solicitudes" replace /> },
          { path: 'affiliates', element: <RequireBusinessOwner><Affiliates /></RequireBusinessOwner> },
          { path: 'finance', element: <RequireBusinessOwner><Finance /></RequireBusinessOwner> },
          { path: 'verifactu', element: <RequireBusinessOwner><VerifactuPage /></RequireBusinessOwner> },
          { path: 'quotes', element: <RequireBusinessOwner><Quotes /></RequireBusinessOwner> },
          { path: 'promotions', element: <RequireBusinessOwner><PromotionsPage /></RequireBusinessOwner> },
          { path: 'sales-points', element: <Navigate to="/saas/settings/tienda" replace /> },
          { path: 'work-centers', element: <Navigate to="/saas/settings/tienda" replace /> },
          { path: 'groups', Component: Groups },
          { path: 'workshop', element: <RequireWorkerPermission permission={['workshop', 'vehicles', 'fleet']}><Workshop /></RequireWorkerPermission> },
          { path: 'workshop/:id', element: <RequireWorkerPermission permission={['workshop', 'vehicles', 'fleet']}><WorkOrderDetail /></RequireWorkerPermission> },
          { path: 'parts', element: <RequireWorkerPermission permission={['workshop', 'vehicles', 'fleet']}><Parts /></RequireWorkerPermission> },
          { path: 'tech', element: <RequireWorkerPermission permission={['workshop', 'vehicles', 'fleet']}><TechnicianView /></RequireWorkerPermission> },
          { path: 'commissions', element: <RequireBusinessOwner><Commissions /></RequireBusinessOwner> },
          { path: 'payroll', element: <RequireTeamManager><PayrollPage /></RequireTeamManager> },
          { path: 'gestoria', element: <RequireTeamManager><GestoriaHubPage /></RequireTeamManager> },
          { path: 'restaurant-ops', element: <RequireBusinessOwner><RequireRestaurantVertical><RestaurantOpsCenter /></RequireRestaurantVertical></RequireBusinessOwner> },
          { path: 'sala/setup', element: <RequireSalaAccess><RequireWorkerPermission permission={['sala', 'reservations']}><RestaurantSalaRouteEntry /></RequireWorkerPermission></RequireSalaAccess> },
          { path: 'sala', element: <RequireSalaAccess><RequireWorkerPermission permission={['sala', 'reservations']}><RestaurantSalaRouteEntry /></RequireWorkerPermission></RequireSalaAccess> },
          { path: 'lista-espera', element: <RequireRestaurantVertical><RequireWorkerPermission permission="sala"><RestaurantWaitlistPage /></RequireWorkerPermission></RequireRestaurantVertical> },
          { path: 'cocina', element: <RequireWorkerPermission permission={['sala', 'delivery']}><RestaurantKitchenRouteEntry /></RequireWorkerPermission> },
          { path: 'vertical/restaurant/informes', element: <RequireBusinessOwner><RequireRestaurantVertical><RestaurantReportsPage /></RequireRestaurantVertical></RequireBusinessOwner> },
          { path: 'vertical/restaurant/integraciones', element: <Navigate to="/saas/restaurant-ops" replace /> },
          { path: 'tpv/locales', element: <RequireBusinessOwner><RedirectEventsFromRetailRoutes><TpvQuickBridgePage /></RedirectEventsFromRetailRoutes></RequireBusinessOwner> },
          { path: 'tpv', element: <RequireBusinessOwner><RedirectEventsFromRetailRoutes><TpvQuickBridgePage /></RedirectEventsFromRetailRoutes></RequireBusinessOwner> },
          { path: 'tpv-mode', element: <RedirectLegacyDeliveryTpv /> },
          { path: 'tpv/punto/:salesPointId', element: <RedirectEventsFromRetailRoutes><SalesPointTpvPage /></RedirectEventsFromRetailRoutes> },
          { path: 'clock-kiosk', Component: ClockKiosk },
          { path: 'income-expenses', element: <RequireBusinessOwner><IncomeExpensesPage /></RequireBusinessOwner> },
          { path: 'ebitda', element: <RequireBusinessOwner><EbitdaPage /></RequireBusinessOwner> },
          { path: 'taxes', element: <RequireBusinessOwner><TaxesPage /></RequireBusinessOwner> },
          { path: 'bank-reconciliation', element: <RequireBusinessOwner><BankReconciliationPage /></RequireBusinessOwner> },
          { path: 'catalog', element: <RedirectEventsFromRetailRoutes><VerticalCatalogEntry /></RedirectEventsFromRetailRoutes> },
          { path: 'correo-facturas', element: <RequireBusinessOwner><RedirectEventsFromRetailRoutes><SupplierInvoiceEmailPage /></RedirectEventsFromRetailRoutes></RequireBusinessOwner> },
          { path: 'inventory', element: <RequireBusinessOwner><RedirectEventsFromRetailRoutes><InventoryPage /></RedirectEventsFromRetailRoutes></RequireBusinessOwner> },
          { path: 'articles', element: <RedirectEventsFromRetailRoutes><VerticalArticlesRedirect /></RedirectEventsFromRetailRoutes> },
          { path: 'suppliers', element: <RequireBusinessOwner><RedirectEventsFromRetailRoutes><Outlet /></RedirectEventsFromRetailRoutes></RequireBusinessOwner>, children: [
            {
              element: <SuppliersLayout />,
              children: [
                { index: true, element: <SuppliersPage /> },
                { path: 'ordenes-compra', element: <Navigate to="/saas/catalog?tab=purchase-orders" replace /> },
                { path: 'facturas', element: <Navigate to="/saas/catalog?tab=invoices" replace /> },
              ],
            },
            { path: 'correo-facturas', element: <Navigate to="/saas/correo-facturas" replace /> },
            { path: ':supplierId', element: <SupplierDetailPage /> },
          ]},
          { path: 'orders', element: <Navigate to="/saas/catalog?tab=invoices" replace /> },
          { path: 'purchase-orders', element: <Navigate to="/saas/catalog?tab=purchase-orders" replace /> },
          { path: 'compras-stock', element: <RequireBusinessOwner><RedirectEventsFromRetailRoutes><ComprasStockPage /></RedirectEventsFromRetailRoutes></RequireBusinessOwner> },
          { path: 'supplier-billing', element: <Navigate to="/saas/catalog?tab=invoices" replace /> },
          { path: 'finanzas/facturacion-clientes', element: <RequireBusinessOwner><ClientBillingPage /></RequireBusinessOwner> },
          { path: 'client-billing', element: <RequireBusinessOwner><ClientBillingPage /></RequireBusinessOwner> },
          { path: 'costing', element: <Navigate to="/saas/catalog?tab=escandallo" replace /> },
          { path: 'delivery', element: <RequireBusinessOwner><RequireDeliveryVertical><RedirectLegacyDelivery /></RequireDeliveryVertical></RequireBusinessOwner> },
          { path: 'delivery-ops', element: <RequireBusinessOwner><RequireDeliveryVertical><DeliveryOpsCenterRoute /></RequireDeliveryVertical></RequireBusinessOwner> },
          { path: 'vertical/delivery/pedidos', element: <RequireDeliveryVertical><Navigate to="/saas/delivery-ops" replace /></RequireDeliveryVertical> },
          { path: 'vertical/delivery', element: <RequireDeliveryVertical><Navigate to="/saas/delivery-ops" replace /></RequireDeliveryVertical> },
          { path: 'delivery-reparto', element: <RequireDeliveryVertical><RequireWorkerPermission permission="delivery"><DeliveryReparto /></RequireWorkerPermission></RequireDeliveryVertical> },
          { path: 'vertical/delivery/reparto', element: <RequireDeliveryVertical><RequireWorkerPermission permission="delivery"><DeliveryReparto /></RequireWorkerPermission></RequireDeliveryVertical> },
          { path: 'delivery-kitchen', element: <RequireDeliveryVertical><RequireWorkerPermission permission="delivery"><DeliveryKitchen /></RequireWorkerPermission></RequireDeliveryVertical> },
          { path: 'delivery-montaje', element: <RequireDeliveryVertical><RequireWorkerPermission permission="delivery"><DeliveryMontaje /></RequireWorkerPermission></RequireDeliveryVertical> },
          { path: 'delivery-catalog', element: <Navigate to="/saas/catalog" replace /> },
          { path: 'vertical/delivery/tpv', element: <RequireBusinessOwner><RequireDeliveryVertical><RequirePdvTerminal><TpvRouteShell><TpvRapidoPage /></TpvRouteShell></RequirePdvTerminal></RequireDeliveryVertical></RequireBusinessOwner> },
          { path: 'caja', element: <RequireBusinessOwner><RequireRestaurantVertical><RedirectEventsFromRetailRoutes><RequirePdvTerminal><TpvRouteShell><RestaurantCajaRouteEntry /></TpvRouteShell></RequirePdvTerminal></RedirectEventsFromRetailRoutes></RequireRestaurantVertical></RequireBusinessOwner> },
          { path: 'caja/tpv', element: <RequireBusinessOwner><RequireRestaurantVertical><RedirectEventsFromRetailRoutes><RestaurantCeoTpvPage /></RedirectEventsFromRetailRoutes></RequireRestaurantVertical></RequireBusinessOwner> },
          { path: 'vertical/delivery/caja', element: <RequireBusinessOwner><RequireDeliveryVertical><RequirePdvTerminal><CajaPage /></RequirePdvTerminal></RequireDeliveryVertical></RequireBusinessOwner> },
          { path: 'vertical/delivery/integraciones', element: <RequireBusinessOwner><RequireDeliveryVertical><RequireWebOrderingVertical><DeliveryIntegrations /></RequireWebOrderingVertical></RequireDeliveryVertical></RequireBusinessOwner> },
          // Alias corto (redirect Uber OAuth / bookmarks) → ruta real de Integraciones
          { path: 'delivery-integrations', element: <Navigate to="/saas/vertical/delivery/integraciones" replace /> },
          { path: 'vertical/delivery/informes', element: <RequireBusinessOwner><RequireDeliveryVertical><DeliveryReports /></RequireDeliveryVertical></RequireBusinessOwner> },
          { path: 'delivery-crm', element: <Navigate to={DELIVERY_CRM_REDIRECT_PATH} replace /> },
          { path: 'delivery-crm/worker', element: <Navigate to={DELIVERY_CRM_REDIRECT_PATH} replace /> },
          { path: 'configuracion', element: <RequireBusinessOwner><ConfiguracionGeneral /></RequireBusinessOwner> },
          { path: 'admin', element: <RequireBusinessOwner><RequireSuperAdmin><AdminPanel /></RequireSuperAdmin></RequireBusinessOwner> },
          { path: 'admin/clients/:userId', element: <RequireBusinessOwner><RequireSuperAdmin><AdminClientDetail /></RequireSuperAdmin></RequireBusinessOwner> },
          { path: 'gdpr', element: <RequireBusinessOwner><GdprPanel /></RequireBusinessOwner> },
          { path: 'settings', element: <RequireBusinessOwner><Settings /></RequireBusinessOwner> },
          { path: 'settings/horarios', element: <Navigate to="/saas/settings/tienda?action=horarios" replace /> },
          { path: 'settings/alertas', element: <Navigate to="/saas/alerts?tab=ajustes" replace /> },
          { path: 'settings/:tab', element: <RequireBusinessOwner><Settings /></RequireBusinessOwner> },
          { path: 'billing', element: <RequireBusinessOwner><Billing /></RequireBusinessOwner> },
          { path: 'help', Component: HelpCenter },
          { path: 'web-config', element: <RequireBusinessOwner><RequireWebOrderingVertical><WebConfig /></RequireWebOrderingVertical></RequireBusinessOwner> },
          { path: 'web-orders', element: <RequireBusinessOwner><RequireWebOrderingVertical><WebOrders /></RequireWebOrderingVertical></RequireBusinessOwner> },
          { path: 'vertical/limpieza', element: <RequireCleaningVertical><Navigate to="/saas/cleaning-hub" replace /></RequireCleaningVertical> },
          { path: 'cleaning-hub', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningHub /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'vertical/limpieza/servicios', element: <RequireBusinessOwner><RequireCleaningVertical><ServiceContractsPage /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'vertical/limpieza/clientes', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningClientsPage /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-workers', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningWorkers /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-services', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningServices /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-routes', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningRoutes /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-execution', element: <RequireCleaningVertical><CleaningExecution /></RequireCleaningVertical> },
          { path: 'cleaning-checklist', element: <RequireCleaningVertical><CleaningChecklist /></RequireCleaningVertical> },
          { path: 'cleaning-quality', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningQuality /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-reviews', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningReviews /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-incidents', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningIncidents /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-billing', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningBilling /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'vertical/limpieza/facturacion', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningBilling /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-materials', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningMaterialsPage /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'cleaning-reports', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningReports /></RequireCleaningVertical></RequireBusinessOwner> },
          { path: 'vertical/limpieza/informes', element: <RequireBusinessOwner><RequireCleaningVertical><CleaningReports /></RequireCleaningVertical></RequireBusinessOwner> },

          // Gym
          { path: 'gym-hub', element: <RequireBusinessOwner><GymDashboard /></RequireBusinessOwner> },
          { path: 'gym-members', element: <RequireBusinessOwner><GymMembers /></RequireBusinessOwner> },
          { path: 'gym-classes', element: <RequireBusinessOwner><GymClasses /></RequireBusinessOwner> },
          { path: 'gym-trainers', element: <RequireBusinessOwner><GymTrainers /></RequireBusinessOwner> },
          { path: 'gym-memberships', element: <RequireBusinessOwner><GymMemberships /></RequireBusinessOwner> },
          { path: 'gym-routines', element: <RequireBusinessOwner><GymRoutines /></RequireBusinessOwner> },
          { path: 'gym-access', element: <RequireBusinessOwner><GymAccess /></RequireBusinessOwner> },

          // Clinic
          { path: 'clinic-patients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'clinic-appointments', element: <Navigate to="/saas/calendar" replace /> },
          { path: 'clinic-history', element: <RequireBusinessOwner><ClinicHistory /></RequireBusinessOwner> },
          { path: 'clinic-treatments', element: <RequireBusinessOwner><ClinicTreatments /></RequireBusinessOwner> },
          { path: 'clinic-prescriptions', element: <RequireBusinessOwner><ClinicPrescriptions /></RequireBusinessOwner> },
          { path: 'clinic-rooms', element: <Navigate to="/saas/locations" replace /> },

          // Hotel
          { path: 'hotel-reservations', element: <RequireWorkerPermission permission="reservations"><HotelReservations /></RequireWorkerPermission> },
          { path: 'hotel-rooms', element: <RequireBusinessOwner><HotelRooms /></RequireBusinessOwner> },
          { path: 'hotel-guests', element: <Navigate to="/saas/clients" replace /> },
          { path: 'hotel-checkin', Component: HotelCheckin },
          { path: 'hotel-housekeeping', Component: HotelHousekeeping },
          { path: 'hotel-room-service', Component: HotelRoomService },

          // Construction
          { path: 'construction-ops', element: <RequireBusinessOwner><ConstructionOpsCenter /></RequireBusinessOwner> },
          { path: 'vertical/construccion', element: <RequireBusinessOwner><ConstructionOpsCenter /></RequireBusinessOwner> },
          { path: 'construction-projects', element: <RequireBusinessOwner><ConstructionProjects /></RequireBusinessOwner> },
          { path: 'construction-projects/:id', Component: ConstructionProjectDetail },
          { path: 'vertical/construccion/obras', element: <RequireBusinessOwner><ConstructionProjects /></RequireBusinessOwner> },
          { path: 'construction-budgets', element: <RequireBusinessOwner><ConstructionBudgets /></RequireBusinessOwner> },
          { path: 'construction-clients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'vertical/construccion/clientes', element: <Navigate to="/saas/crm/clientes" replace /> },
          { path: 'construction-workers', element: <Navigate to="/saas/team" replace /> },
          { path: 'construction-tasks', Component: ConstructionTasks },
          { path: 'construction-execution', Component: ConstructionExecution },
          { path: 'construction-reports', element: <Navigate to="/saas/reports" replace /> },
          { path: 'construction-incidents', Component: ConstructionIncidents },
          { path: 'construction-payments', element: <RequireBusinessOwner><ConstructionPayments /></RequireBusinessOwner> },
          { path: 'vertical/construccion/pagos', element: <RequireBusinessOwner><ConstructionPayments /></RequireBusinessOwner> },
          { path: 'construction-collections', element: <RequireBusinessOwner><ConstructionCollections /></RequireBusinessOwner> },
          { path: 'vertical/construccion/cobros', element: <RequireBusinessOwner><ConstructionCollections /></RequireBusinessOwner> },
          { path: 'vertical/construccion/presupuestos', element: <RequireBusinessOwner><QuickBudgetPage /></RequireBusinessOwner> },
          { path: 'construction-closure', element: <RequireBusinessOwner><ConstructionClosure /></RequireBusinessOwner> },
          { path: 'vertical/construccion/cierre', element: <RequireBusinessOwner><ConstructionClosure /></RequireBusinessOwner> },
          { path: 'construction-documents', element: <Navigate to="/saas/documents" replace /> },
          { path: 'vertical/construccion/documentacion', element: <Navigate to="/saas/documents" replace /> },
          { path: 'vertical/construccion/partidas-gremios', Component: ConstructionPartidasGremios },
          { path: 'construction-partidas-gremios', Component: ConstructionPartidasGremios },

          // Academy
          { path: 'academy-students', element: <Navigate to="/saas/clients" replace /> },
          { path: 'academy-courses', element: <RequireBusinessOwner><AcademyCourses /></RequireBusinessOwner> },
          { path: 'academy-teachers', element: <Navigate to="/saas/team" replace /> },
          { path: 'academy-enrollments', element: <RequireBusinessOwner><AcademyEnrollments /></RequireBusinessOwner> },
          { path: 'academy-grades', element: <RequireBusinessOwner><AcademyGrades /></RequireBusinessOwner> },
          { path: 'academy-schedule', element: <Navigate to="/saas/calendar" replace /> },

          // Real Estate
          { path: 'realestate-properties', element: <RequireBusinessOwner><RequireRealEstateVertical><RealEstateProperties /></RequireRealEstateVertical></RequireBusinessOwner> },
          { path: 'realestate-visits', element: <RequireRealEstateVertical><RealEstateVisits /></RequireRealEstateVertical> },
          { path: 'realestate-contracts', element: <RequireBusinessOwner><RequireRealEstateVertical><RealEstateContracts /></RequireRealEstateVertical></RequireBusinessOwner> },
          { path: 'realestate-owners', element: <Navigate to="/saas/crm/clientes?tab=clients" replace /> },
          { path: 'realestate-tenants', element: <Navigate to="/saas/crm/clientes?tab=clients" replace /> },
          { path: 'realestate-appraisals', element: <RequireBusinessOwner><RequireRealEstateVertical><RealEstateAppraisals /></RequireRealEstateVertical></RequireBusinessOwner> },

          // Lawyer
          { path: 'lawyer-ops', element: <RequireBusinessOwner><LawyerOpsCenter /></RequireBusinessOwner> },
          { path: 'lawyer-captacion', element: <RequireBusinessOwner><LawyerCaptacion /></RequireBusinessOwner> },
          { path: 'lawyer-cases', element: <RequireBusinessOwner><LawyerCases /></RequireBusinessOwner> },
          { path: 'lawyer-gestion', element: <RequireBusinessOwner><LawyerGestion key="lawyer-gestion-mock" /></RequireBusinessOwner> },
          { path: 'lawyer-archivo', element: <RequireBusinessOwner><LawyerArchivo /></RequireBusinessOwner> },
          { path: 'lawyer-clients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'lawyer-hearings', Component: LawyerHearings },
          { path: 'lawyer-documents', element: <Navigate to="/saas/documents" replace /> },
          { path: 'lawyer-billing', element: <RequireBusinessOwner><LawyerBilling /></RequireBusinessOwner> },
          { path: 'lawyer-deadlines', element: <RequireBusinessOwner><LawyerDeadlines /></RequireBusinessOwner> },

          // Nightclub
          { path: 'nightclub-events', element: <RequireBusinessOwner><NightclubEvents /></RequireBusinessOwner> },
          { path: 'nightclub-vip', element: <RequireBusinessOwner><NightclubVIP /></RequireBusinessOwner> },
          { path: 'nightclub-promoters', element: <RequireBusinessOwner><NightclubPromoters /></RequireBusinessOwner> },
          { path: 'nightclub-guestlist', Component: NightclubGuestlist },
          { path: 'nightclub-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'nightclub-artists', element: <RequireBusinessOwner><NightclubArtists /></RequireBusinessOwner> },

          // Events
          { path: 'vertical/eventos', element: <RequireWorkerPermission permission="sales"><EventsHub /></RequireWorkerPermission> },
          { path: 'vertical/eventos/nueva-contratacion', element: <RequireWorkerPermission permission="sales"><EventsContractWizardPage /></RequireWorkerPermission> },
          { path: 'vertical/eventos/tpv', element: <RequireWorkerPermission permission="sales"><EventsTpvPage /></RequireWorkerPermission> },
          { path: 'vertical/eventos/operar', element: <RequireWorkerPermission permission="sales"><RequirePdvTerminal><TpvRouteShell><TpvRapidoPage /></TpvRouteShell></RequirePdvTerminal></RequireWorkerPermission> },
          { path: 'vertical/eventos/presupuestos', element: <RequireWorkerPermission permission="sales"><EventsQuotesPage /></RequireWorkerPermission> },
          { path: 'vertical/eventos/ruta', element: <RequireWorkerPermission permission="sales"><EventsRoutePage /></RequireWorkerPermission> },
          { path: 'vertical/eventos/contrataciones', element: <RequireWorkerPermission permission="sales"><EventsPipelinePage /></RequireWorkerPermission> },
          { path: 'vertical/eventos/:eventId', element: <RequireWorkerPermission permission="sales"><EventsProjectPage /></RequireWorkerPermission> },
          { path: 'events-management', element: <Navigate to="/saas/vertical/eventos/contrataciones" replace /> },
          { path: 'events-vendors', element: <RequireWorkerPermission permission="sales"><RedirectToEventsServicesTab tab="externos" /></RequireWorkerPermission> },
          { path: 'events-guests', element: <Navigate to="/saas/vertical/eventos" replace /> },
          { path: 'events-venues', element: <RequireWorkerPermission permission="sales"><RedirectToEventsServicesTab tab="espacios" /></RequireWorkerPermission> },
          { path: 'events-services', element: <RequireWorkerPermission permission="sales"><EventsServices /></RequireWorkerPermission> },
          { path: 'events-catering', element: <RequireWorkerPermission permission="sales"><RedirectToEventsServicesTab tab="catering" /></RequireWorkerPermission> },
          { path: 'events-logistics', element: <RequireWorkerPermission permission="sales"><RedirectToEventsServicesTab tab="logistica" /></RequireWorkerPermission> },

          // Hair Salon
          { path: 'salon-appointments', element: <Navigate to="/saas/calendar" replace /> },
          { path: 'salon-services', element: <RequireBusinessOwner><SalonServices /></RequireBusinessOwner> },
          { path: 'salon-stylists', element: <Navigate to="/saas/team" replace /> },
          { path: 'salon-products', element: <Navigate to="/saas/catalog" replace /> },
          { path: 'salon-loyalty', element: <RequireBusinessOwner><SalonLoyalty /></RequireBusinessOwner> },
          { path: 'salon-client-history', element: <Navigate to="/saas/clients" replace /> },

          // Scrapyard
          { path: 'vertical/desguaces', element: <RequireBusinessOwner><ScrapyardHub /></RequireBusinessOwner> },
          { path: 'vertical/desguaces/compras-retiradas', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardPurchasesPage /></RequireWorkerPermission> },
          { path: 'scrapyard-vehicles', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardVehicles /></RequireWorkerPermission> },
          { path: 'scrapyard-vehicles/:id', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardVehicleDetail /></RequireWorkerPermission> },
          { path: 'vertical/desguaces/entrada-vehiculo', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardVehicles /></RequireWorkerPermission> },
          { path: 'scrapyard-parts', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardParts /></RequireWorkerPermission> },
          { path: 'scrapyard-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'scrapyard-deregistrations', element: <RequireBusinessOwner><ScrapyardDeregistrations /></RequireBusinessOwner> },
          { path: 'scrapyard-sales', element: <Navigate to="/saas/sales" replace /> },
          { path: 'vertical/desguaces/ventas-pedidos', element: <Navigate to="/saas/sales" replace /> },
          { path: 'vertical/desguaces/despiece', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardDismantling /></RequireWorkerPermission> },
          { path: 'vertical/desguaces/despiece/:vehicleId', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardDismantling /></RequireWorkerPermission> },
          { path: 'vertical/desguaces/documentacion', element: <RequireWorkerPermission permission={['scrapyard_docs', 'documents']}><ScrapyardDocumentationPage /></RequireWorkerPermission> },
          { path: 'scrapyard-environment', element: <RequireBusinessOwner><ScrapyardEnvironment /></RequireBusinessOwner> },
          { path: 'scrapyard-expedition', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardExpedition /></RequireWorkerPermission> },
          { path: 'vertical/desguaces/expedicion', element: <RequireWorkerPermission permission="scrapyard"><ScrapyardExpedition /></RequireWorkerPermission> },
          { path: 'scrapyard-workers', element: <Navigate to="/saas/team" replace /> },
          { path: 'vertical/desguaces/trabajadores', element: <Navigate to="/saas/team" replace /> },
          { path: 'scrapyard-reports', element: <Navigate to="/saas/reports" replace /> },
          { path: 'vertical/desguaces/informes', element: <Navigate to="/saas/reports" replace /> },

          // Spare Parts
          { path: 'spareparts-catalog', element: <Navigate to="/saas/catalog" replace /> },
          { path: 'spareparts-stock', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'spareparts-orders', element: <Navigate to="/saas/suppliers/ordenes-compra" replace /> },
          { path: 'spareparts-suppliers', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'spareparts-compatibility', element: <RequireBusinessOwner><SparePartsCompatibility /></RequireBusinessOwner> },
          { path: 'spareparts-counter', Component: SparePartsCounter },

          // Taxi
          { path: 'taxi-fleet', element: <RequireBusinessOwner><TaxiFleet /></RequireBusinessOwner> },
          { path: 'taxi-drivers', element: <Navigate to="/saas/team" replace /> },
          { path: 'taxi-trips', element: <RequireBusinessOwner><TaxiTrips /></RequireBusinessOwner> },
          { path: 'taxi-shifts', element: <RequireBusinessOwner><TaxiShifts /></RequireBusinessOwner> },
          { path: 'taxi-maintenance', element: <Navigate to="/saas/workshop" replace /> },
          { path: 'taxi-billing', element: <Navigate to="/saas/client-billing" replace /> },

          // Pharmacy
          { path: 'pharmacy-prescriptions', Component: PharmacyPrescriptions },
          { path: 'pharmacy-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'pharmacy-patients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'pharmacy-sales', element: <Navigate to="/saas/sales" replace /> },
          { path: 'pharmacy-suppliers', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'pharmacy-guard', element: <RequireBusinessOwner><PharmacyGuard /></RequireBusinessOwner> },

          // Car Wash
          { path: 'carwash-services', element: <RequireBusinessOwner><CarWashServices /></RequireBusinessOwner> },
          { path: 'carwash-bookings', element: <Navigate to="/saas/calendar" replace /> },
          { path: 'carwash-vehicles', element: <Navigate to="/saas/vehicles" replace /> },
          { path: 'carwash-products', element: <Navigate to="/saas/catalog" replace /> },
          { path: 'carwash-staff', element: <Navigate to="/saas/team" replace /> },
          { path: 'carwash-memberships', element: <RequireBusinessOwner><CarWashMemberships /></RequireBusinessOwner> },

          // Vet
          { path: 'vet-patients', Component: VetPatients },
          { path: 'vet-appointments', element: <Navigate to="/saas/calendar" replace /> },
          { path: 'vet-history', element: <RequireBusinessOwner><VetHistory /></RequireBusinessOwner> },
          { path: 'vet-vaccinations', Component: VetVaccinations },
          { path: 'vet-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'vet-billing', element: <Navigate to="/saas/client-billing" replace /> },

          // Tobacco Shop (Estanco)
          { path: 'tobacco-sales', element: <Navigate to="/saas/sales" replace /> },
          { path: 'tobacco-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'tobacco-lottery', Component: TobaccoLottery },
          { path: 'tobacco-suppliers', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'tobacco-salespoint', element: <Navigate to="/saas/tpv" replace /> },
          { path: 'tobacco-regulatory', element: <RequireBusinessOwner><TobaccoRegulatory /></RequireBusinessOwner> },

          // Butcher Shop (Carnicería)
          { path: 'vertical/carniceria', element: <Navigate to="/saas/butcher-hub" replace /> },
          { path: 'butcher-hub', element: <RequireBusinessOwner><ButcherHub /></RequireBusinessOwner> },
          { path: 'butcher-clients', element: <RequireBusinessOwner><ButcherClients /></RequireBusinessOwner> },
          { path: 'butcher-products', element: <RequireBusinessOwner><ButcherProducts /></RequireBusinessOwner> },
          { path: 'butcher-orders', element: <RequireBusinessOwner><ButcherOrders /></RequireBusinessOwner> },
          { path: 'butcher-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'butcher-stock', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'butcher-suppliers', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'butcher-traceability', element: <RequireBusinessOwner><ButcherTraceability /></RequireBusinessOwner> },
          { path: 'butcher-sales', element: <RequireBusinessOwner><ButcherSales /></RequireBusinessOwner> },
          { path: 'butcher-purchases', element: <RequireWorkerPermission permission="butcher_purchases"><ButcherPurchasesPage /></RequireWorkerPermission> },
          { path: 'vertical/carniceria/compras', element: <RequireWorkerPermission permission="butcher_purchases"><ButcherPurchasesPage /></RequireWorkerPermission> },
          { path: 'butcher-waste', element: <RequireWorkerPermission permission="butcher_waste"><ButcherWaste /></RequireWorkerPermission> },
          { path: 'butcher-workers', element: <Navigate to="/saas/team" replace /> },
          { path: 'vertical/carniceria/trabajadores', element: <Navigate to="/saas/team" replace /> },
          { path: 'vertical/carniceria/clientes', element: <RequireBusinessOwner><ButcherClients /></RequireBusinessOwner> },
          { path: 'vertical/carniceria/pedidos', element: <RequireBusinessOwner><ButcherOrders /></RequireBusinessOwner> },
          { path: 'vertical/carniceria/ventas', element: <RequireBusinessOwner><ButcherSales /></RequireBusinessOwner> },
          { path: 'vertical/carniceria/clientes-pedidos', element: <Navigate to="/saas/butcher-orders" replace /> },
          { path: 'vertical/carniceria/tpv', Component: ButcherTpvPage },
          { path: 'vertical/carniceria/informes', Component: ButcherReports },
          { path: 'vertical/carniceria/reparto', element: <RequireBusinessOwner><ButcherReparto /></RequireBusinessOwner> },
          { path: 'butcher-reparto', element: <RequireBusinessOwner><ButcherReparto /></RequireBusinessOwner> },
          { path: 'vertical/carniceria/despiece', element: <RequireBusinessOwner><ButcherDespiece /></RequireBusinessOwner> },
          { path: 'butcher-despiece', element: <RequireBusinessOwner><ButcherDespiece /></RequireBusinessOwner> },
          { path: 'vertical/carniceria/basculas', element: <RequireBusinessOwner><ButcherScaleSetup /></RequireBusinessOwner> },
          { path: 'butcher-basculas', element: <RequireBusinessOwner><ButcherScaleSetup /></RequireBusinessOwner> },
          { path: 'butcher-reports', Component: ButcherReports },
          { path: 'butcher-tpv', Component: ButcherTpvPage },

          // Heladería (ice cream shop)
          { path: 'vertical/heladeria', element: <Navigate to="/saas/heladeria-ops" replace /> },
          { path: 'heladeria-ops', element: <RequireBusinessOwner><HeladeriaOpsPage /></RequireBusinessOwner> },
          { path: 'heladeria-encargos', element: <RequireBusinessOwner><HeladeriaEncargosPage /></RequireBusinessOwner> },
          { path: 'heladeria-integraciones', element: <RequireBusinessOwner><HeladeriaIntegracionesPage /></RequireBusinessOwner> },
          { path: 'heladeria-caja', element: <RequireBusinessOwner><HeladeriaCajaPage /></RequireBusinessOwner> },
          { path: 'heladeria-tpv', element: <RequireBusinessOwner><HeladeriaTpvPage /></RequireBusinessOwner> },
          { path: 'vertical/heladeria/tpv', element: <RequireBusinessOwner><HeladeriaTpvPage /></RequireBusinessOwner> },
          { path: 'vertical/heladeria/caja', element: <RequireBusinessOwner><HeladeriaCajaPage /></RequireBusinessOwner> },
          { path: 'vertical/heladeria/encargos', element: <Navigate to="/saas/heladeria-encargos" replace /> },
          { path: 'vertical/heladeria/integraciones', element: <Navigate to="/saas/heladeria-integraciones" replace /> },

          // Compraventa (car dealership)
          { path: 'compraventa-hub', element: <Navigate to="/saas/vertical/compraventa" replace /> },
          { path: 'vertical/compraventa', element: <RequireBusinessOwner><RequireCompraventaVertical><CompraventaHub /></RequireCompraventaVertical></RequireBusinessOwner> },
          { path: 'vertical/compraventa/informes', element: <RequireCompraventaVertical><Navigate to="/saas/reports" replace /></RequireCompraventaVertical> },
          { path: 'dealership-workers', element: <RequireBusinessOwner><RequireCompraventaVertical><DealershipWorkers /></RequireCompraventaVertical></RequireBusinessOwner> },
          { path: 'vertical/compraventa/trabajadores', element: <RequireCompraventaVertical><Navigate to="/saas/dealership-workers" replace /></RequireCompraventaVertical> },
          { path: 'vertical/compraventa/entrada-vehiculo', element: <RequireCompraventaVertical><RequireWorkerPermission permission="vehicles"><VehicleEntryPage /></RequireWorkerPermission></RequireCompraventaVertical> },
          { path: 'vertical/compraventa/crm', element: <RequireCompraventaVertical><RequireWorkerPermission permission="clients"><CompraventaCrm /></RequireWorkerPermission></RequireCompraventaVertical> },
          { path: 'vertical/compraventa/compras', element: <RequireBusinessOwner><RequireCompraventaVertical><CompraventaComprasPage /></RequireCompraventaVertical></RequireBusinessOwner> },
          { path: 'vertical/compraventa/calculadora-fiscal', element: <RequireBusinessOwner><RequireCompraventaVertical><CompraventaFiscalCalculatorPage /></RequireCompraventaVertical></RequireBusinessOwner> },
          { path: 'vertical/compraventa/ventas', element: <RequireCompraventaVertical><RequireWorkerPermission permission="sales"><CompraventaVentasPage /></RequireWorkerPermission></RequireCompraventaVertical> },
          { path: 'vertical/compraventa/tasaciones', element: <RequireBusinessOwner><RequireCompraventaVertical><CompraventaTasacionesPage /></RequireCompraventaVertical></RequireBusinessOwner> },
          { path: 'vertical/compraventa/gastos', element: <RequireCompraventaVertical><Navigate to="/saas/vertical/compraventa/gastos-preparacion" replace /></RequireCompraventaVertical> },
          { path: 'vertical/compraventa/entregas', element: <RequireCompraventaVertical><RequireWorkerPermission permission="sales"><CompraventaEntregasPage /></RequireWorkerPermission></RequireCompraventaVertical> },
          { path: 'vertical/compraventa/gastos-preparacion', element: <RequireBusinessOwner><RequireCompraventaVertical><PreparationExpenses /></RequireCompraventaVertical></RequireBusinessOwner> },

          { path: 'changelog', Component: ChangelogPage },
          { path: 'subscription', Component: SubscriptionPaymentPage },
          { path: 'suspended', Component: Suspended },
          { path: 'qa-final', Component: QAFinal },
          { path: 'block-a1-checklist', Component: BlockA1Checklist },
          { path: 'block-a2-checklist', Component: BlockA2Checklist },
          { path: 'block-a3-checklist', Component: BlockA3Checklist },
          { path: 'saas-flow-map', Component: SAAS__FlowMap },

          // Worker mode
          { path: 'worker/events', Component: WorkerEventsOps },
          { path: 'worker/events/dia/:eventId', Component: WorkerEventDayPage },
          { path: 'worker/setup-profile', Component: WorkerIdentitySetup },
          { path: 'worker/complete-payroll', Component: WorkerPayrollSetup },
          { path: 'worker', element: <Navigate to="/saas/worker/tasks" replace /> },
          { path: 'worker/tpv/delivery', element: <RequireTpvTabletEntry requireForAll><WorkerTpvDeliveryRoute /></RequireTpvTabletEntry> },
          { path: 'worker/tpv/restaurant', element: <RequireTpvTabletEntry requireForAll><RequireRestaurantVertical><RestaurantCeoTpvPage /></RequireRestaurantVertical></RequireTpvTabletEntry> },
          { path: 'worker/tpv', element: <RequireTpvTabletEntry><WorkerTpvEntry /></RequireTpvTabletEntry> },
          { path: 'worker/tasks', Component: WorkerTasks },
          { path: 'worker/stock-review', Component: WorkerStockReviewPage },
          { path: 'worker/calendar', Component: WorkerCalendar },
          { path: 'worker/requests', Component: WorkerRequests },
          { path: 'worker/clock', Component: WorkerClock },
          { path: 'worker/chat', Component: WorkerChat },
          { path: 'worker/documents', Component: WorkerDocs },
          { path: 'worker/onboarding', Component: WorkerOnboarding },
          { path: 'worker/profile', Component: WorkerProfile },
          { path: 'worker/contract-info', Component: WorkerContractInfo },
          { path: 'worker/position', Component: WorkerPosition },
          { path: 'worker/notifications', Component: WorkerNotifications },
          { path: 'worker/security', Component: WorkerSecurity },
          { path: 'worker/construction-report', Component: WorkerConstructionReport },
          { path: 'worker/butcher-orders', Component: ButcherWorkerOrders },
          { path: 'worker/butcher-reparto', Component: WorkerButcherReparto },
          { path: 'worker/materials', element: <RequireCleaningVertical><WorkerMaterials /></RequireCleaningVertical> },
        ],
      },
      {
        path: 'navigation-map',
        Component: NavigationMap,
      },
      {
        path: 'qa',
        Component: QAIndex,
      },
      {
        path: 'qa/block-1',
        Component: Block1QA,
      },
      {
        path: 'qa/block-2',
        Component: Block2QA,
      },
      {
        path: 'qa/block-3',
        Component: Block3QA,
      },
      {
        path: 'qa/block-4',
        Component: Block4QA,
      },
      {
        path: 'qa/final',
        Component: FinalQA,
      },
      {
        path: 'saas-navigation-demo',
        Component: SaasNavigationDemo,
      },
      {
        path: 'saas-flow-map',
        Component: SaasFlowMap,
      },
      {
        path: 'saas-qa-check',
        Component: SaasQACheck,
      },
      {
        path: 'operations-demo',
        Component: OperationsDemo,
      },
      {
        path: 'locations-demo',
        Component: LocationsDemo,
      },
      {
        path: 'affiliados',
        Component: AffiliatePage,
      },
      {
        path: 'panel-afiliado',
        Component: AffiliatePortal,
      },
      {
        path: 'panel-afiliado/:code',
        Component: AffiliatePortal,
      },
      {
        path: 'embed/:dealerId',
        Component: EmbedLeadForm,
      },
      {
        path: 'portal/:token',
        Component: ClientPortal,
      },
      {
        path: 'booking/:userId',
        Component: BookingPage,
      },
      {
        path: 'reuniones',
        Component: MeetingsPage,
      },
      {
        path: 'wo/:workOrderId',
        Component: WorkOrderStatus,
      },
      {
        path: 'mecanico',
        Component: MechanicStandalone,
      },
      {
        path: 'v/:vehicleId',
        Component: VehiclePublic,
      },
      {
        path: 'web/:slug',
        Component: WebStorefront,
      },
      {
        path: 'm/:token',
        Component: MesaQrPublicPage,
      },
      {
        path: 'sign/:token',
        Component: SignaturePublic,
      },
      {
        path: 'quote/respond',
        Component: QuotePublicResponse,
      },
      {
        path: 'legal/:docSlug',
        Component: LegalDocumentPage,
      },
      {
        path: 'legal',
        Component: LegalHubPage,
      },
      {
        path: '*',
        Component: CatchAll,
      },
    ],
  },
]);