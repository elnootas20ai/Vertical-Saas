import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { RootLayout } from './components/RootLayout';
import { LandingNew } from './pages/LandingNew';
import { Entry } from './pages/auth/Entry';
import { Login } from './pages/auth/Login';
import { TeamLogin } from './pages/auth/TeamLogin';
import { Recover } from './pages/auth/Recover';
import { ResetPassword } from './pages/auth/ResetPassword';
import { AcceptInvite } from './pages/auth/AcceptInvite';
import { Register } from './pages/auth/Register';
import { BusinessType } from './pages/auth/onboarding/BusinessType';
import { Company } from './pages/auth/onboarding/Company';
import { Structure } from './pages/auth/onboarding/Structure';
import { Needs } from './pages/auth/onboarding/Needs';
import { Recommendation } from './pages/auth/onboarding/Recommendation';
import { PaymentInfo } from './pages/auth/onboarding/PaymentInfo';
import { Confirmation } from './pages/auth/onboarding/Confirmation';
import { Gate } from './pages/auth/Gate';
import { BusinessProvider } from './context/BusinessContext';
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
import { Pipeline } from './pages/saas/Pipeline';
import { ClientPortal } from './pages/public/ClientPortal';
import { DocumentsPage } from './pages/saas/DocumentsPage';
import { DocumentDetail } from './pages/saas/DocumentDetail';
import { Sales } from './pages/saas/Sales';
import { SaleDetail } from './pages/saas/SaleDetail';
import { SalesMetrics } from './pages/saas/SalesMetrics';
import { Calls } from './pages/saas/Calls';
import { CallDetail } from './pages/saas/CallDetail';
import { Ancove } from './pages/saas/Ancove';
import { Team } from './pages/saas/Team';
import { TeamMemberDetail } from './pages/saas/TeamMemberDetail';
import { Finance } from './pages/saas/Finance';
import { AdminPanel } from './pages/saas/AdminPanel';
import { Settings } from './pages/saas/Settings';
import { ConfiguracionGeneral } from './pages/saas/ConfiguracionGeneral';
import { Billing } from './pages/saas/Billing';
import { HelpCenter } from './pages/saas/HelpCenter';
import { Suspended } from './pages/saas/Suspended';
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
import { SaasNavigationDemo } from './pages/SaasNavigationDemo';
import { SaasFlowMap } from './pages/SaasFlowMap';
import { SaasQACheck } from './pages/SaasQACheck';
import { OperationsDemo } from './pages/OperationsDemo';
import { LocationsDemo } from './pages/LocationsDemo';
import { EmbedLeadForm } from './pages/public/EmbedLeadForm';
import { AffiliatePage } from './pages/public/AffiliatePage';
import { AffiliatePortal } from './pages/public/AffiliatePortal';
import { BookingPage } from './pages/public/BookingPage';
import { GdprPanel } from './pages/saas/GdprPanel';
import { VehiclePublic } from './pages/public/VehiclePublic';
import { SignaturePublic } from './pages/public/SignaturePublic';
import { LegalInfoPage } from './pages/public/LegalInfoPage';
import { Workshop } from './pages/saas/Workshop';
import { WorkOrderDetail } from './pages/saas/WorkOrderDetail';
import { Parts } from './pages/saas/Parts';
import { TechnicianView } from './pages/saas/TechnicianView';
import { Commissions } from './pages/saas/Commissions';
import { PayrollPage } from './pages/saas/PayrollPage';
import { Delivery } from './pages/saas/Delivery';
import { SalaPage } from './pages/saas/SalaPage';
import { DeliveryReparto } from './pages/saas/DeliveryReparto';
import { DeliveryCrm } from './pages/saas/DeliveryCrm';
import { DeliveryCrmWorker } from './pages/saas/DeliveryCrmWorker';
import { DeliveryMontaje } from './pages/saas/DeliveryMontaje';
import { DeliveryKitchen } from './pages/saas/DeliveryKitchen';
import { DeliveryCatalog } from './pages/saas/DeliveryCatalog';
import { DeliveryOpsCenter } from './pages/saas/DeliveryOpsCenter';
import { TpvRapidoPage } from './pages/saas/TpvRapidoPage';
import { CajaPage } from './pages/saas/CajaPage';
import { RequirePdvTerminal } from './components/saas/RequirePdvTerminal';
import { ChangelogPage } from './pages/saas/ChangelogPage';
import { WorkOrderStatus } from './pages/public/WorkOrderStatus';
import { WebStorefront } from './pages/public/WebStorefront';
import { QuotePublicResponse } from './pages/public/QuotePublicResponse';
import { WebConfig } from './pages/saas/WebConfig';
import { WebOrders } from './pages/saas/WebOrders';
import { CleaningHub } from './pages/saas/CleaningHub';
import { CleaningWorkers } from './pages/saas/CleaningWorkers';
import { CleaningServices } from './pages/saas/CleaningServices';
import { CleaningRoutes } from './pages/saas/CleaningRoutes';
import { CleaningExecution } from './pages/saas/CleaningExecution';
import { ServiceContractsPage } from './pages/saas/ServiceContractsPage';
// CleaningClientsPage removed (duplicate of ClientsPage)
import { CleaningChecklist } from './pages/saas/CleaningChecklist';
import { CleaningQuality } from './pages/saas/CleaningQuality';
import { CleaningReviews } from './pages/saas/CleaningReviews';
// CleaningBilling removed (duplicate of ClientBillingPage)
import { CleaningIncidents } from './pages/saas/CleaningIncidents';
// CleaningMaterialsPage removed (duplicate of ComprasStockPage)
// CleaningReports removed (duplicate of Reports)
import { WorkerMaterials } from './pages/saas/worker/WorkerMaterials';
import { Chat } from './pages/saas/Chat';
import { CatalogPage } from './pages/saas/CatalogPage';
import { SupplierBillingPage } from './pages/saas/SupplierBillingPage';
import { ClientBillingPage } from './pages/saas/ClientBillingPage';
import { CostingPage } from './pages/saas/CostingPage';
import { IncomeExpensesPage } from './pages/saas/IncomeExpensesPage';
import { EbitdaPage } from './pages/saas/EbitdaPage';
import { TaxesPage } from './pages/saas/TaxesPage';
import { BankReconciliationPage } from './pages/saas/BankReconciliationPage';
import { ArticlesPage } from './pages/saas/ArticlesPage';
import { SuppliersPage } from './pages/saas/SuppliersPage';
import { OrdersPage } from './pages/saas/OrdersPage';
import { PurchaseOrdersPage } from './pages/saas/PurchaseOrdersPage';
import { ComprasStockPage } from './pages/saas/ComprasStockPage';
import { PromotionsPage } from './pages/saas/PromotionsPage';

import { Clockins } from './pages/saas/Clockins';
import { Schedules } from './pages/saas/Schedules';
import { Vacations } from './pages/saas/Vacations';
import { SchedulesVacations } from './pages/saas/SchedulesVacations';
import { Affiliates } from './pages/saas/Affiliates';
import { SetupOnboarding } from './pages/saas/SetupOnboarding';

// ── Gym ──
import { GymClasses } from './pages/saas/GymClasses';
import { GymMemberships } from './pages/saas/GymMemberships';
import { GymRoutines } from './pages/saas/GymRoutines';
import { GymAccess } from './pages/saas/GymAccess';

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
import { LawyerCases } from './pages/saas/LawyerCases';
import { LawyerHearings } from './pages/saas/LawyerHearings';
import { LawyerDeadlines } from './pages/saas/LawyerDeadlines';

// ── Nightclub ──
import { NightclubEvents } from './pages/saas/NightclubEvents';
import { NightclubVIP } from './pages/saas/NightclubVIP';
import { NightclubPromoters } from './pages/saas/NightclubPromoters';
import { NightclubGuestlist } from './pages/saas/NightclubGuestlist';
// NightclubInventory removed (duplicate of ComprasStockPage)
import { NightclubArtists } from './pages/saas/NightclubArtists';

// ── Events ──
import { EventsManagement } from './pages/saas/EventsManagement';
import { EventsCatering } from './pages/saas/EventsCatering';
import { EventsLogistics } from './pages/saas/EventsLogistics';

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
import { ButcherProducts } from './pages/saas/ButcherProducts';
import { ButcherTraceability } from './pages/saas/ButcherTraceability';
import { ButcherWaste } from './pages/saas/ButcherWaste';
import { ButcherTpvPage } from './pages/saas/ButcherTpvPage';
import { CompraventaCrm } from './pages/saas/vertical/compraventa/CompraventaCrm';
import { PreparationExpenses } from './pages/saas/PreparationExpenses';
import { ButcherWorkerOrders } from './pages/saas/ButcherWorkerOrders';

import { SalesPointTpvPage } from './pages/saas/SalesPointTpvPage';
import { ClockKiosk } from './pages/saas/ClockKiosk';

import {
  WorkerHome,
  WorkerTasks,
  WorkerCalendar,
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
  WorkerConstructionReport,
} from './pages/saas/worker';
import { UserDashboard } from './pages/saas/UserDashboard';
import { ProtectedRoute } from './components/ProtectedRoute';

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

function CatchAll() {
  return <Navigate to="/saas/dashboard" replace />;
}

function GateWithBusinessProvider() {
  return (
    <BusinessProvider>
      <Gate />
    </BusinessProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      {
        index: true,
        Component: LandingNew,
      },
      {
        path: 'demos',
        Component: DemoIndex,
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
        path: 'auth/login',
        Component: Login,
      },
      {
        path: 'auth/team-login',
        Component: TeamLogin,
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
        path: 'auth/register',
        Component: Register,
      },
      {
        path: 'auth/onboarding/business-type',
        Component: BusinessType,
      },
      {
        path: 'auth/onboarding/company',
        Component: Company,
      },
      {
        path: 'auth/onboarding/structure',
        Component: Structure,
      },
      {
        path: 'auth/onboarding/needs',
        Component: Needs,
      },
      {
        path: 'auth/onboarding/recommendation',
        Component: Recommendation,
      },
      {
        path: 'auth/onboarding/payment-info',
        Component: PaymentInfo,
      },
      {
        path: 'auth/onboarding/confirmation',
        Component: Confirmation,
      },
      {
        path: 'auth/gate',
        Component: GateWithBusinessProvider,
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
          { path: 'dashboard', Component: Dashboard },
          { path: 'onboarding', Component: SetupOnboarding },
          { path: 'user-dashboard', Component: UserDashboard },
          { path: 'reports', Component: Reports },
          { path: 'calendar', Component: CalendarView },
          { path: 'chat', Component: Chat },
          { path: 'chat/:channelId', Component: Chat },
          { path: 'operations', Component: Operations },
          { path: 'operations/:id', Component: OperationDetail },
          { path: 'vehicles', Component: Vehicles },
          { path: 'vehicles/:id', Component: VehicleDetail },
          { path: 'vertical/compraventa/publicacion-venta', Component: PublicacionVentaPage },
          { path: 'locations', Component: Locations },
          { path: 'locations/:id', Component: LocationZone },
          { path: 'clients', Component: ClientsPage },
          { path: 'clients/:id', Component: ClientDetail },
          { path: 'crm/clientes', Component: ClientsPage },
          { path: 'crm/clientes/:id', Component: ClientDetail },
          { path: 'pipeline', Component: Pipeline },
          { path: 'documents', Component: DocumentsPage },
          { path: 'documents/:id', Component: DocumentDetail },
          { path: 'sales', Component: Sales },
          { path: 'sales/:id', Component: SaleDetail },
          { path: 'sales-metrics', Component: SalesMetrics },
          { path: 'reservations', Component: HotelReservations },
          { path: 'calls', Component: Calls },
          { path: 'calls/:id', Component: CallDetail },
          { path: 'ancove', Component: Ancove },
          { path: 'team', Component: Team },
          { path: 'team/:userId', Component: TeamMemberDetail },
          { path: 'equipo', element: <Navigate to="/saas/team" replace /> },
          { path: 'equipo/:userId', Component: EquipoRedirect },
          { path: 'clockins', Component: Clockins },
          { path: 'equipo/horarios-vacaciones', Component: SchedulesVacations },
          { path: 'schedules', element: <Navigate to="/saas/equipo/horarios-vacaciones" replace /> },
          { path: 'vacations', element: <Navigate to="/saas/equipo/horarios-vacaciones" replace /> },
          { path: 'affiliates', Component: Affiliates },
          { path: 'finance', Component: Finance },
          { path: 'quotes', Component: Quotes },
          { path: 'promotions', Component: PromotionsPage },
          { path: 'sales-points', element: <Navigate to="/saas/settings/centros-de-trabajo" replace /> },
          { path: 'work-centers', element: <Navigate to="/saas/settings/centros-de-trabajo" replace /> },
          { path: 'groups', Component: Groups },
          { path: 'workshop', Component: Workshop },
          { path: 'workshop/:id', Component: WorkOrderDetail },
          { path: 'parts', Component: Parts },
          { path: 'tech', Component: TechnicianView },
          { path: 'commissions', Component: Commissions },
          { path: 'payroll', Component: PayrollPage },
          { path: 'sala', Component: SalaPage },
          { path: 'tpv/locales', element: <Navigate to="/saas/vertical/delivery/tpv" replace /> },
          { path: 'tpv', element: <Navigate to="/saas/vertical/delivery/tpv" replace /> },
          { path: 'tpv-mode', element: <Navigate to="/saas/vertical/delivery/tpv" replace /> },
          { path: 'tpv/punto/:salesPointId', Component: SalesPointTpvPage },
          { path: 'clock-kiosk', Component: ClockKiosk },
          { path: 'income-expenses', Component: IncomeExpensesPage },
          { path: 'ebitda', Component: EbitdaPage },
          { path: 'taxes', Component: TaxesPage },
          { path: 'bank-reconciliation', Component: BankReconciliationPage },
          { path: 'catalog', Component: CatalogPage },
          { path: 'articles', Component: ArticlesPage },
          { path: 'suppliers', Component: SuppliersPage },
          { path: 'orders', Component: OrdersPage },
          { path: 'purchase-orders', Component: PurchaseOrdersPage },
          { path: 'compras-stock', Component: ComprasStockPage },
          { path: 'supplier-billing', Component: SupplierBillingPage },
          { path: 'finanzas/facturacion-clientes', Component: ClientBillingPage },
          { path: 'client-billing', Component: ClientBillingPage },
          { path: 'costing', Component: CostingPage },
          { path: 'delivery', Component: Delivery },
          { path: 'delivery-ops', Component: DeliveryOpsCenter },
          { path: 'delivery-reparto', Component: DeliveryReparto },
          { path: 'vertical/delivery/reparto', Component: DeliveryReparto },
          { path: 'delivery-kitchen', Component: DeliveryKitchen },
          { path: 'delivery-montaje', Component: DeliveryMontaje },
          { path: 'delivery-catalog', Component: DeliveryCatalog },
          { path: 'vertical/delivery/tpv', element: <RequirePdvTerminal><TpvRapidoPage /></RequirePdvTerminal> },
          { path: 'vertical/delivery/caja', element: <RequirePdvTerminal><CajaPage /></RequirePdvTerminal> },
          { path: 'delivery-crm', Component: DeliveryCrm },
          { path: 'delivery-crm/worker', Component: DeliveryCrmWorker },
          { path: 'configuracion', Component: ConfiguracionGeneral },
          { path: 'admin', Component: AdminPanel },
          { path: 'gdpr', Component: GdprPanel },
          { path: 'settings', Component: Settings },
          { path: 'settings/:tab', Component: Settings },
          { path: 'billing', Component: Billing },
          { path: 'help', Component: HelpCenter },
          { path: 'web-config', Component: WebConfig },
          { path: 'web-orders', Component: WebOrders },
          { path: 'cleaning-hub', Component: CleaningHub },
          { path: 'vertical/limpieza/servicios', Component: ServiceContractsPage },
          { path: 'vertical/limpieza/clientes', element: <Navigate to="/saas/clients" replace /> },
          { path: 'cleaning-workers', Component: CleaningWorkers },
          { path: 'cleaning-services', Component: CleaningServices },
          { path: 'cleaning-routes', Component: CleaningRoutes },
          { path: 'cleaning-execution', Component: CleaningExecution },
          { path: 'cleaning-checklist', Component: CleaningChecklist },
          { path: 'cleaning-quality', Component: CleaningQuality },
          { path: 'cleaning-reviews', Component: CleaningReviews },
          { path: 'cleaning-incidents', Component: CleaningIncidents },
          { path: 'cleaning-billing', element: <Navigate to="/saas/client-billing" replace /> },
          { path: 'vertical/limpieza/facturacion', element: <Navigate to="/saas/client-billing" replace /> },
          { path: 'cleaning-materials', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'cleaning-reports', element: <Navigate to="/saas/reports" replace /> },
          { path: 'vertical/limpieza/informes', element: <Navigate to="/saas/reports" replace /> },

          // Gym
          { path: 'gym-members', element: <Navigate to="/saas/clients" replace /> },
          { path: 'gym-classes', Component: GymClasses },
          { path: 'gym-trainers', element: <Navigate to="/saas/team" replace /> },
          { path: 'gym-memberships', Component: GymMemberships },
          { path: 'gym-routines', Component: GymRoutines },
          { path: 'gym-access', Component: GymAccess },

          // Clinic
          { path: 'clinic-patients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'clinic-appointments', element: <Navigate to="/saas/calendar" replace /> },
          { path: 'clinic-history', Component: ClinicHistory },
          { path: 'clinic-treatments', Component: ClinicTreatments },
          { path: 'clinic-prescriptions', Component: ClinicPrescriptions },
          { path: 'clinic-rooms', element: <Navigate to="/saas/locations" replace /> },

          // Hotel
          { path: 'hotel-reservations', Component: HotelReservations },
          { path: 'hotel-rooms', Component: HotelRooms },
          { path: 'hotel-guests', element: <Navigate to="/saas/clients" replace /> },
          { path: 'hotel-checkin', Component: HotelCheckin },
          { path: 'hotel-housekeeping', Component: HotelHousekeeping },
          { path: 'hotel-room-service', Component: HotelRoomService },

          // Construction
          { path: 'construction-ops', Component: ConstructionOpsCenter },
          { path: 'vertical/construccion', Component: ConstructionOpsCenter },
          { path: 'construction-projects', Component: ConstructionProjects },
          { path: 'construction-projects/:id', Component: ConstructionProjectDetail },
          { path: 'vertical/construccion/obras', Component: ConstructionProjects },
          { path: 'construction-budgets', Component: ConstructionBudgets },
          { path: 'construction-clients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'vertical/construccion/clientes', element: <Navigate to="/saas/crm/clientes" replace /> },
          { path: 'construction-workers', element: <Navigate to="/saas/team" replace /> },
          { path: 'construction-tasks', Component: ConstructionTasks },
          { path: 'construction-execution', Component: ConstructionExecution },
          { path: 'construction-reports', element: <Navigate to="/saas/reports" replace /> },
          { path: 'construction-incidents', Component: ConstructionIncidents },
          { path: 'construction-payments', Component: ConstructionPayments },
          { path: 'vertical/construccion/pagos', Component: ConstructionPayments },
          { path: 'construction-collections', Component: ConstructionCollections },
          { path: 'vertical/construccion/cobros', Component: ConstructionCollections },
          { path: 'vertical/construccion/presupuestos', Component: QuickBudgetPage },
          { path: 'construction-closure', Component: ConstructionClosure },
          { path: 'vertical/construccion/cierre', Component: ConstructionClosure },
          { path: 'construction-documents', element: <Navigate to="/saas/documents" replace /> },
          { path: 'vertical/construccion/documentacion', element: <Navigate to="/saas/documents" replace /> },
          { path: 'vertical/construccion/partidas-gremios', Component: ConstructionPartidasGremios },
          { path: 'construction-partidas-gremios', Component: ConstructionPartidasGremios },

          // Academy
          { path: 'academy-students', element: <Navigate to="/saas/clients" replace /> },
          { path: 'academy-courses', Component: AcademyCourses },
          { path: 'academy-teachers', element: <Navigate to="/saas/team" replace /> },
          { path: 'academy-enrollments', Component: AcademyEnrollments },
          { path: 'academy-grades', Component: AcademyGrades },
          { path: 'academy-schedule', element: <Navigate to="/saas/calendar" replace /> },

          // Real Estate
          { path: 'realestate-properties', Component: RealEstateProperties },
          { path: 'realestate-visits', Component: RealEstateVisits },
          { path: 'realestate-contracts', Component: RealEstateContracts },
          { path: 'realestate-owners', element: <Navigate to="/saas/clients" replace /> },
          { path: 'realestate-tenants', element: <Navigate to="/saas/clients" replace /> },
          { path: 'realestate-appraisals', Component: RealEstateAppraisals },

          // Lawyer
          { path: 'lawyer-cases', Component: LawyerCases },
          { path: 'lawyer-clients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'lawyer-hearings', Component: LawyerHearings },
          { path: 'lawyer-documents', element: <Navigate to="/saas/documents" replace /> },
          { path: 'lawyer-billing', element: <Navigate to="/saas/client-billing" replace /> },
          { path: 'lawyer-deadlines', Component: LawyerDeadlines },

          // Nightclub
          { path: 'nightclub-events', Component: NightclubEvents },
          { path: 'nightclub-vip', Component: NightclubVIP },
          { path: 'nightclub-promoters', Component: NightclubPromoters },
          { path: 'nightclub-guestlist', Component: NightclubGuestlist },
          { path: 'nightclub-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'nightclub-artists', Component: NightclubArtists },

          // Events
          { path: 'events-management', Component: EventsManagement },
          { path: 'events-vendors', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'events-guests', element: <Navigate to="/saas/clients" replace /> },
          { path: 'events-venues', element: <Navigate to="/saas/locations" replace /> },
          { path: 'events-catering', Component: EventsCatering },
          { path: 'events-logistics', Component: EventsLogistics },

          // Hair Salon
          { path: 'salon-appointments', element: <Navigate to="/saas/calendar" replace /> },
          { path: 'salon-services', Component: SalonServices },
          { path: 'salon-stylists', element: <Navigate to="/saas/team" replace /> },
          { path: 'salon-products', element: <Navigate to="/saas/catalog" replace /> },
          { path: 'salon-loyalty', Component: SalonLoyalty },
          { path: 'salon-client-history', element: <Navigate to="/saas/clients" replace /> },

          // Scrapyard
          { path: 'vertical/desguaces', Component: ScrapyardHub },
          { path: 'vertical/desguaces/compras-retiradas', Component: ScrapyardPurchasesPage },
          { path: 'scrapyard-vehicles', Component: ScrapyardVehicles },
          { path: 'scrapyard-vehicles/:id', Component: ScrapyardVehicleDetail },
          { path: 'vertical/desguaces/entrada-vehiculo', Component: ScrapyardVehicles },
          { path: 'scrapyard-parts', Component: ScrapyardParts },
          { path: 'scrapyard-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'scrapyard-deregistrations', Component: ScrapyardDeregistrations },
          { path: 'scrapyard-sales', element: <Navigate to="/saas/sales" replace /> },
          { path: 'vertical/desguaces/ventas-pedidos', element: <Navigate to="/saas/sales" replace /> },
          { path: 'vertical/desguaces/despiece', Component: ScrapyardDismantling },
          { path: 'vertical/desguaces/despiece/:vehicleId', Component: ScrapyardDismantling },
          { path: 'vertical/desguaces/documentacion', Component: ScrapyardDocumentationPage },
          { path: 'scrapyard-environment', Component: ScrapyardEnvironment },
          { path: 'scrapyard-expedition', Component: ScrapyardExpedition },
          { path: 'vertical/desguaces/expedicion', Component: ScrapyardExpedition },
          { path: 'scrapyard-workers', element: <Navigate to="/saas/team" replace /> },
          { path: 'vertical/desguaces/trabajadores', element: <Navigate to="/saas/team" replace /> },
          { path: 'scrapyard-reports', element: <Navigate to="/saas/reports" replace /> },
          { path: 'vertical/desguaces/informes', element: <Navigate to="/saas/reports" replace /> },

          // Spare Parts
          { path: 'spareparts-catalog', element: <Navigate to="/saas/catalog" replace /> },
          { path: 'spareparts-stock', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'spareparts-orders', element: <Navigate to="/saas/orders" replace /> },
          { path: 'spareparts-suppliers', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'spareparts-compatibility', Component: SparePartsCompatibility },
          { path: 'spareparts-counter', Component: SparePartsCounter },

          // Taxi
          { path: 'taxi-fleet', Component: TaxiFleet },
          { path: 'taxi-drivers', element: <Navigate to="/saas/team" replace /> },
          { path: 'taxi-trips', Component: TaxiTrips },
          { path: 'taxi-shifts', Component: TaxiShifts },
          { path: 'taxi-maintenance', element: <Navigate to="/saas/workshop" replace /> },
          { path: 'taxi-billing', element: <Navigate to="/saas/client-billing" replace /> },

          // Pharmacy
          { path: 'pharmacy-prescriptions', Component: PharmacyPrescriptions },
          { path: 'pharmacy-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'pharmacy-patients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'pharmacy-sales', element: <Navigate to="/saas/sales" replace /> },
          { path: 'pharmacy-suppliers', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'pharmacy-guard', Component: PharmacyGuard },

          // Car Wash
          { path: 'carwash-services', Component: CarWashServices },
          { path: 'carwash-bookings', element: <Navigate to="/saas/calendar" replace /> },
          { path: 'carwash-vehicles', element: <Navigate to="/saas/vehicles" replace /> },
          { path: 'carwash-products', element: <Navigate to="/saas/catalog" replace /> },
          { path: 'carwash-staff', element: <Navigate to="/saas/team" replace /> },
          { path: 'carwash-memberships', Component: CarWashMemberships },

          // Vet
          { path: 'vet-patients', Component: VetPatients },
          { path: 'vet-appointments', element: <Navigate to="/saas/calendar" replace /> },
          { path: 'vet-history', Component: VetHistory },
          { path: 'vet-vaccinations', Component: VetVaccinations },
          { path: 'vet-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'vet-billing', element: <Navigate to="/saas/client-billing" replace /> },

          // Tobacco Shop (Estanco)
          { path: 'tobacco-sales', element: <Navigate to="/saas/sales" replace /> },
          { path: 'tobacco-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'tobacco-lottery', Component: TobaccoLottery },
          { path: 'tobacco-suppliers', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'tobacco-salespoint', element: <Navigate to="/saas/tpv" replace /> },
          { path: 'tobacco-regulatory', Component: TobaccoRegulatory },

          // Butcher Shop (Carnicería)
          { path: 'butcher-hub', Component: ButcherHub },
          { path: 'butcher-clients', element: <Navigate to="/saas/clients" replace /> },
          { path: 'butcher-products', Component: ButcherProducts },
          { path: 'butcher-orders', element: <Navigate to="/saas/orders" replace /> },
          { path: 'butcher-inventory', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'butcher-stock', element: <Navigate to="/saas/compras-stock" replace /> },
          { path: 'butcher-suppliers', element: <Navigate to="/saas/suppliers" replace /> },
          { path: 'butcher-traceability', Component: ButcherTraceability },
          { path: 'butcher-sales', element: <Navigate to="/saas/sales" replace /> },
          { path: 'butcher-purchases', element: <Navigate to="/saas/purchase-orders" replace /> },
          { path: 'vertical/carniceria/compras', element: <Navigate to="/saas/purchase-orders" replace /> },
          { path: 'butcher-waste', Component: ButcherWaste },
          { path: 'butcher-workers', element: <Navigate to="/saas/team" replace /> },
          { path: 'vertical/carniceria/trabajadores', element: <Navigate to="/saas/team" replace /> },
          { path: 'vertical/carniceria/tpv', Component: ButcherTpvPage },
          { path: 'vertical/carniceria/informes', element: <Navigate to="/saas/reports" replace /> },
          { path: 'butcher-tpv', Component: ButcherTpvPage },

          // Compraventa (car dealership)
          { path: 'vertical/compraventa/entrada-vehiculo', Component: VehicleEntryPage },
          { path: 'vertical/compraventa/crm', Component: CompraventaCrm },
          { path: 'vertical/compraventa/gastos-preparacion', Component: PreparationExpenses },

          { path: 'changelog', Component: ChangelogPage },
          { path: 'suspended', Component: Suspended },
          { path: 'qa-final', Component: QAFinal },
          { path: 'block-a1-checklist', Component: BlockA1Checklist },
          { path: 'block-a2-checklist', Component: BlockA2Checklist },
          { path: 'block-a3-checklist', Component: BlockA3Checklist },
          { path: 'saas-flow-map', Component: SAAS__FlowMap },

          // Worker mode
          { path: 'worker', Component: WorkerHome },
          { path: 'worker/tpv', Component: WorkerTpv },
          { path: 'worker/tasks', Component: WorkerTasks },
          { path: 'worker/calendar', Component: WorkerCalendar },
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
        path: 'sign/:token',
        Component: SignaturePublic,
      },
      {
        path: 'quote/respond',
        Component: QuotePublicResponse,
      },
      {
        path: 'legal',
        Component: LegalInfoPage,
      },
      {
        path: '*',
        Component: CatchAll,
      },
    ],
  },
]);