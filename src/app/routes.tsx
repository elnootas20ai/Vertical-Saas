import { createBrowserRouter, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { lazy, Suspense, type ComponentType } from 'react';
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
import { RedirectLegacyDelivery } from './components/saas/RedirectLegacyDelivery';
import { RequireRestaurantVertical } from './components/saas/RequireRestaurantVertical';
import { RequireSalaAccess } from './components/saas/RequireSalaAccess';
import { TpvRouteShell } from './components/saas/TpvRouteShell';
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
// Cleaning vertical pages (dedicated CRM/billing/stock for limpieza)


// ── Gym ──

// ── Clinic ──

// ── Hotel ──
// HotelGuests removed (duplicate of ClientsPage)

// ── Construction ──
// ConstructionClients removed (duplicate of ClientsPage)
// ConstructionWorkers removed (duplicate of Team)
// ConstructionReports removed (duplicate of Reports)
// ConstructionDocuments removed (duplicate of DocumentsPage)

// ── Academy ──

// ── Real Estate ──
// RealEstateOwners/Tenants removed (duplicate of ClientsPage)

// ── Lawyer ──

// ── Nightclub ──
// NightclubInventory removed (duplicate of ComprasStockPage)

// ── Events ──

// ── Hair Salon ──

// ── Scrapyard ──
// ScrapyardInventory removed (duplicate of ComprasStockPage)
// ScrapyardSales removed (duplicate of Sales)
// ScrapyardReports removed (duplicate of Reports)
// ScrapyardWorkers removed (duplicate of Team)

// ── Spare Parts ──

// ── Taxi ──

// ── Pharmacy ──

// ── Car Wash ──

// ── Vet ──

// ── Tobacco Shop (Estanco) ──

// ── Butcher Shop (Carnicería) ──


import { AuthRouteLoading } from './components/AuthRouteLoading';
import { ProtectedRoute } from './components/ProtectedRoute';

/** Lazy page helper — named export → default for React.lazy */
function lazyPage<M extends Record<string, unknown>>(
  loader: () => Promise<M>,
  exportName: keyof M,
) {
  return lazy(() =>
    loader().then((m) => ({
      default: m[exportName] as ComponentType<any>,
    })),
  );
}

// ── Lazy SaaS / public / vertical pages (Ola 1) ──
const SaasRoot = lazyPage(() => import('./pages/SaasRoot'), 'SaasRoot');
const Dashboard = lazyPage(() => import('./pages/saas/Dashboard'), 'Dashboard');
const Operations = lazyPage(() => import('./pages/saas/Operations'), 'Operations');
const CompraventaHub = lazyPage(() => import('./pages/saas/CompraventaHub'), 'CompraventaHub');
const VehicleEntryPage = lazyPage(() => import('./pages/saas/VehicleEntryPage'), 'VehicleEntryPage');
const OperationDetail = lazyPage(() => import('./pages/saas/OperationDetail'), 'OperationDetail');
const Vehicles = lazyPage(() => import('./pages/saas/Vehicles'), 'Vehicles');
const VehicleDetail = lazyPage(() => import('./pages/saas/VehicleDetail'), 'VehicleDetail');
const PublicacionVentaPage = lazyPage(() => import('./pages/saas/PublicacionVentaPage'), 'PublicacionVentaPage');
const Locations = lazyPage(() => import('./pages/saas/Locations'), 'Locations');
const LocationZone = lazyPage(() => import('./pages/saas/LocationZone'), 'LocationZone');
const ClientsPage = lazyPage(() => import('./pages/saas/ClientsPage'), 'ClientsPage');
const ClientDetail = lazyPage(() => import('./pages/saas/ClientDetail'), 'ClientDetail');
const ClientPortal = lazyPage(() => import('./pages/public/ClientPortal'), 'ClientPortal');
const DocumentsPage = lazyPage(() => import('./pages/saas/DocumentsPage'), 'DocumentsPage');
const DocumentDetail = lazyPage(() => import('./pages/saas/DocumentDetail'), 'DocumentDetail');
const Pipeline = lazyPage(() => import('./pages/saas/Pipeline'), 'Pipeline');
const Sales = lazyPage(() => import('./pages/saas/Sales'), 'Sales');
const SaleDetail = lazyPage(() => import('./pages/saas/SaleDetail'), 'SaleDetail');
const SalesMetrics = lazyPage(() => import('./pages/saas/SalesMetrics'), 'SalesMetrics');
const Ancove = lazyPage(() => import('./pages/saas/Ancove'), 'Ancove');
const Team = lazyPage(() => import('./pages/saas/Team'), 'Team');
const TeamMemberDetail = lazyPage(() => import('./pages/saas/TeamMemberDetail'), 'TeamMemberDetail');
const Invitations = lazyPage(() => import('./pages/saas/Invitations'), 'Invitations');
const Finance = lazyPage(() => import('./pages/saas/Finance'), 'Finance');
const VerifactuPage = lazyPage(() => import('./pages/saas/VerifactuPage'), 'VerifactuPage');
const AdminPanel = lazyPage(() => import('./pages/saas/AdminPanel'), 'AdminPanel');
const AdminClientDetail = lazyPage(() => import('./pages/saas/AdminClientDetail'), 'AdminClientDetail');
const Settings = lazyPage(() => import('./pages/saas/Settings'), 'Settings');
const ConfiguracionGeneral = lazyPage(() => import('./pages/saas/ConfiguracionGeneral'), 'ConfiguracionGeneral');
const Billing = lazyPage(() => import('./pages/saas/Billing'), 'Billing');
const HelpCenter = lazyPage(() => import('./pages/saas/HelpCenter'), 'HelpCenter');
const Suspended = lazyPage(() => import('./pages/saas/Suspended'), 'Suspended');
const SubscriptionPaymentPage = lazyPage(() => import('./pages/saas/SubscriptionPaymentPage'), 'SubscriptionPaymentPage');
const Reports = lazyPage(() => import('./pages/saas/Reports'), 'Reports');
const AlertCenterPage = lazy(() => import('./pages/saas/AlertCenterPage'));
const OcrReviewPage = lazy(() => import('./pages/saas/OcrReviewPage'));
const CalendarView = lazyPage(() => import('./pages/saas/CalendarView'), 'CalendarView');
const Quotes = lazyPage(() => import('./pages/saas/Quotes'), 'Quotes');
const Groups = lazyPage(() => import('./pages/saas/Groups'), 'Groups');
const EmbedLeadForm = lazyPage(() => import('./pages/public/EmbedLeadForm'), 'EmbedLeadForm');
const AffiliatePage = lazyPage(() => import('./pages/public/AffiliatePage'), 'AffiliatePage');
const AffiliatePortal = lazyPage(() => import('./pages/public/AffiliatePortal'), 'AffiliatePortal');
const BookingPage = lazyPage(() => import('./pages/public/BookingPage'), 'BookingPage');
const MeetingsPage = lazyPage(() => import('./pages/public/MeetingsPage'), 'MeetingsPage');
const GdprPanel = lazyPage(() => import('./pages/saas/GdprPanel'), 'GdprPanel');
const VehiclePublic = lazyPage(() => import('./pages/public/VehiclePublic'), 'VehiclePublic');
const SignaturePublic = lazyPage(() => import('./pages/public/SignaturePublic'), 'SignaturePublic');
const LegalHubPage = lazyPage(() => import('./pages/public/LegalHubPage'), 'LegalHubPage');
const LegalDocumentPage = lazyPage(() => import('./pages/public/LegalDocumentPage'), 'LegalDocumentPage');
const Workshop = lazyPage(() => import('./pages/saas/Workshop'), 'Workshop');
const WorkOrderDetail = lazyPage(() => import('./pages/saas/WorkOrderDetail'), 'WorkOrderDetail');
const Parts = lazyPage(() => import('./pages/saas/Parts'), 'Parts');
const TechnicianView = lazyPage(() => import('./pages/saas/TechnicianView'), 'TechnicianView');
const Commissions = lazyPage(() => import('./pages/saas/Commissions'), 'Commissions');
const PayrollPage = lazyPage(() => import('./pages/saas/PayrollPage'), 'PayrollPage');
const GestoriaHubPage = lazyPage(() => import('./pages/saas/GestoriaHubPage'), 'GestoriaHubPage');
const RestaurantReservationsRouteEntry = lazyPage(() => import('./verticals/restaurant/RestaurantReservationsRouteEntry'), 'RestaurantReservationsRouteEntry');
const RestaurantWaitlistPage = lazyPage(() => import('./verticals/restaurant/RestaurantWaitlistPage'), 'RestaurantWaitlistPage');
const RestaurantKitchenRouteEntry = lazyPage(() => import('./verticals/restaurant/RestaurantKitchenRouteEntry'), 'RestaurantKitchenRouteEntry');
const RestaurantReportsPage = lazyPage(() => import('./verticals/restaurant/RestaurantReportsPage'), 'RestaurantReportsPage');
const RestaurantCajaRouteEntry = lazyPage(() => import('./verticals/restaurant/RestaurantCajaRouteEntry'), 'RestaurantCajaRouteEntry');
const RestaurantCeoTpvPage = lazyPage(() => import('./verticals/restaurant/RestaurantCeoTpvPage'), 'RestaurantCeoTpvPage');
const RestaurantSalaRouteEntry = lazyPage(() => import('./verticals/restaurant/RestaurantSalaRouteEntry'), 'RestaurantSalaRouteEntry');
const RestaurantOpsCenter = lazyPage(() => import('./verticals/restaurant/RestaurantOpsCenter'), 'RestaurantOpsCenter');
const DeliveryReparto = lazyPage(() => import('./pages/saas/DeliveryReparto'), 'DeliveryReparto');
const DeliveryMontaje = lazyPage(() => import('./pages/saas/DeliveryMontaje'), 'DeliveryMontaje');
const DeliveryKitchen = lazyPage(() => import('./pages/saas/DeliveryKitchen'), 'DeliveryKitchen');
const VerticalCatalogEntry = lazyPage(() => import('./pages/saas/VerticalCatalogEntry'), 'VerticalCatalogEntry');
const VerticalArticlesRedirect = lazyPage(() => import('./pages/saas/VerticalCatalogEntry'), 'VerticalArticlesRedirect');
const InventoryPage = lazy(() => import('./pages/saas/InventoryPage'));
const DealershipWorkers = lazyPage(() => import('./pages/saas/DealershipWorkers'), 'DealershipWorkers');
const TpvRapidoPage = lazyPage(() => import('./pages/saas/TpvRapidoPage'), 'TpvRapidoPage');
const TpvQuickBridgePage = lazyPage(() => import('./pages/saas/TpvQuickBridgePage'), 'TpvQuickBridgePage');
const CajaPage = lazyPage(() => import('./pages/saas/CajaPage'), 'CajaPage');
const ChangelogPage = lazyPage(() => import('./pages/saas/ChangelogPage'), 'ChangelogPage');
const WorkOrderStatus = lazyPage(() => import('./pages/public/WorkOrderStatus'), 'WorkOrderStatus');
const WebStorefront = lazyPage(() => import('./pages/public/WebStorefront'), 'WebStorefront');
const MesaQrPublicPage = lazyPage(() => import('./pages/public/MesaQrPublicPage'), 'MesaQrPublicPage');
const QuotePublicResponse = lazyPage(() => import('./pages/public/QuotePublicResponse'), 'QuotePublicResponse');
const PromoAcceptPublic = lazyPage(() => import('./pages/public/PromoAcceptPublic'), 'PromoAcceptPublic');
const WebConfig = lazyPage(() => import('./pages/saas/WebConfig'), 'WebConfig');
const WebOrders = lazyPage(() => import('./pages/saas/WebOrders'), 'WebOrders');
const DeliveryIntegrations = lazyPage(() => import('./pages/saas/DeliveryIntegrations'), 'DeliveryIntegrations');
const DeliveryReports = lazyPage(() => import('./pages/saas/DeliveryReports'), 'DeliveryReports');
const CleaningHub = lazyPage(() => import('./pages/saas/CleaningHub'), 'CleaningHub');
const CleaningWorkers = lazyPage(() => import('./pages/saas/CleaningWorkers'), 'CleaningWorkers');
const CleaningServices = lazyPage(() => import('./pages/saas/CleaningServices'), 'CleaningServices');
const CleaningRoutes = lazyPage(() => import('./pages/saas/CleaningRoutes'), 'CleaningRoutes');
const CleaningExecution = lazyPage(() => import('./pages/saas/CleaningExecution'), 'CleaningExecution');
const ServiceContractsPage = lazyPage(() => import('./pages/saas/ServiceContractsPage'), 'ServiceContractsPage');
const CleaningClientsPage = lazyPage(() => import('./pages/saas/CleaningClientsPage'), 'CleaningClientsPage');
const CleaningBilling = lazyPage(() => import('./pages/saas/CleaningBilling'), 'CleaningBilling');
const CleaningMaterialsPage = lazyPage(() => import('./pages/saas/CleaningMaterialsPage'), 'CleaningMaterialsPage');
const CleaningReports = lazyPage(() => import('./pages/saas/CleaningReports'), 'CleaningReports');
const CleaningChecklist = lazyPage(() => import('./pages/saas/CleaningChecklist'), 'CleaningChecklist');
const CleaningQuality = lazyPage(() => import('./pages/saas/CleaningQuality'), 'CleaningQuality');
const CleaningReviews = lazyPage(() => import('./pages/saas/CleaningReviews'), 'CleaningReviews');
const CleaningIncidents = lazyPage(() => import('./pages/saas/CleaningIncidents'), 'CleaningIncidents');
const WorkerMaterials = lazyPage(() => import('./pages/saas/worker/WorkerMaterials'), 'WorkerMaterials');
const Chat = lazyPage(() => import('./pages/saas/Chat'), 'Chat');
const SupplierInvoiceEmailPage = lazyPage(() => import('./pages/saas/SupplierInvoiceEmailPage'), 'SupplierInvoiceEmailPage');
const ClientBillingPage = lazyPage(() => import('./pages/saas/ClientBillingPage'), 'ClientBillingPage');
const IncomeExpensesPage = lazyPage(() => import('./pages/saas/IncomeExpensesPage'), 'IncomeExpensesPage');
const EbitdaPage = lazyPage(() => import('./pages/saas/EbitdaPage'), 'EbitdaPage');
const TaxesPage = lazyPage(() => import('./pages/saas/TaxesPage'), 'TaxesPage');
const BankReconciliationPage = lazyPage(() => import('./pages/saas/BankReconciliationPage'), 'BankReconciliationPage');
const ArticlesPage = lazyPage(() => import('./pages/saas/ArticlesPage'), 'ArticlesPage');
const SuppliersPage = lazyPage(() => import('./pages/saas/SuppliersPage'), 'SuppliersPage');
const SuppliersLayout = lazyPage(() => import('./pages/saas/suppliers/SuppliersLayout'), 'SuppliersLayout');
const SupplierDetailPage = lazyPage(() => import('./pages/saas/SupplierDetailPage'), 'SupplierDetailPage');
const ComprasStockPage = lazyPage(() => import('./pages/saas/ComprasStockPage'), 'ComprasStockPage');
const PromotionsPage = lazyPage(() => import('./pages/saas/PromotionsPage'), 'PromotionsPage');
const Clockins = lazyPage(() => import('./pages/saas/Clockins'), 'Clockins');
const Schedules = lazyPage(() => import('./pages/saas/Schedules'), 'Schedules');
const Vacations = lazyPage(() => import('./pages/saas/Vacations'), 'Vacations');
const SchedulesVacations = lazyPage(() => import('./pages/saas/SchedulesVacations'), 'SchedulesVacations');
const HrRequestsPage = lazyPage(() => import('./pages/saas/HrRequestsPage'), 'HrRequestsPage');
const Affiliates = lazyPage(() => import('./pages/saas/Affiliates'), 'Affiliates');
const SetupOnboarding = lazyPage(() => import('./pages/saas/SetupOnboarding'), 'SetupOnboarding');
const GymClasses = lazyPage(() => import('./pages/saas/GymClasses'), 'GymClasses');
const GymMemberships = lazyPage(() => import('./pages/saas/GymMemberships'), 'GymMemberships');
const GymRoutines = lazyPage(() => import('./pages/saas/GymRoutines'), 'GymRoutines');
const GymAccess = lazyPage(() => import('./pages/saas/GymAccess'), 'GymAccess');
const GymMembers = lazyPage(() => import('./pages/saas/GymMembers'), 'GymMembers');
const GymTrainers = lazyPage(() => import('./pages/saas/GymTrainers'), 'GymTrainers');
const GymDashboard = lazyPage(() => import('./pages/saas/dashboards/GymDashboard'), 'GymDashboard');
const ClinicHistory = lazyPage(() => import('./pages/saas/ClinicHistory'), 'ClinicHistory');
const ClinicTreatments = lazyPage(() => import('./pages/saas/ClinicTreatments'), 'ClinicTreatments');
const ClinicPrescriptions = lazyPage(() => import('./pages/saas/ClinicPrescriptions'), 'ClinicPrescriptions');
const HotelReservations = lazyPage(() => import('./pages/saas/HotelReservations'), 'HotelReservations');
const HotelRooms = lazyPage(() => import('./pages/saas/HotelRooms'), 'HotelRooms');
const HotelCheckin = lazyPage(() => import('./pages/saas/HotelCheckin'), 'HotelCheckin');
const HotelHousekeeping = lazyPage(() => import('./pages/saas/HotelHousekeeping'), 'HotelHousekeeping');
const HotelRoomService = lazyPage(() => import('./pages/saas/HotelRoomService'), 'HotelRoomService');
const ConstructionProjects = lazyPage(() => import('./pages/saas/ConstructionProjects'), 'ConstructionProjects');
const ConstructionProjectDetail = lazyPage(() => import('./pages/saas/ConstructionProjectDetail'), 'ConstructionProjectDetail');
const ConstructionBudgets = lazyPage(() => import('./pages/saas/ConstructionBudgets'), 'ConstructionBudgets');
const ConstructionTasks = lazyPage(() => import('./pages/saas/ConstructionTasks'), 'ConstructionTasks');
const ConstructionExecution = lazyPage(() => import('./pages/saas/ConstructionExecution'), 'ConstructionExecution');
const ConstructionOpsCenter = lazyPage(() => import('./pages/saas/ConstructionOpsCenter'), 'ConstructionOpsCenter');
const ConstructionCollections = lazyPage(() => import('./pages/saas/ConstructionCollections'), 'ConstructionCollections');
const ConstructionPayments = lazyPage(() => import('./pages/saas/ConstructionPayments'), 'ConstructionPayments');
const ConstructionIncidents = lazyPage(() => import('./pages/saas/ConstructionIncidents'), 'ConstructionIncidents');
const QuickBudgetPage = lazyPage(() => import('./pages/saas/QuickBudgetPage'), 'QuickBudgetPage');
const ConstructionClosure = lazyPage(() => import('./pages/saas/ConstructionClosure'), 'ConstructionClosure');
const ConstructionPartidasGremios = lazyPage(() => import('./pages/saas/ConstructionPartidasGremios'), 'ConstructionPartidasGremios');
const AcademyCourses = lazyPage(() => import('./pages/saas/AcademyCourses'), 'AcademyCourses');
const AcademyEnrollments = lazyPage(() => import('./pages/saas/AcademyEnrollments'), 'AcademyEnrollments');
const AcademyGrades = lazyPage(() => import('./pages/saas/AcademyGrades'), 'AcademyGrades');
const RealEstateProperties = lazyPage(() => import('./pages/saas/RealEstateProperties'), 'RealEstateProperties');
const RealEstateVisits = lazyPage(() => import('./pages/saas/RealEstateVisits'), 'RealEstateVisits');
const RealEstateContracts = lazyPage(() => import('./pages/saas/RealEstateContracts'), 'RealEstateContracts');
const RealEstateAppraisals = lazyPage(() => import('./pages/saas/RealEstateAppraisals'), 'RealEstateAppraisals');
const LawyerOpsCenter = lazyPage(() => import('./pages/saas/LawyerOpsCenter'), 'LawyerOpsCenter');
const LawyerCaptacion = lazyPage(() => import('./pages/saas/LawyerCaptacion'), 'LawyerCaptacion');
const LawyerCases = lazyPage(() => import('./pages/saas/LawyerCases'), 'LawyerCases');
const LawyerGestion = lazyPage(() => import('./pages/saas/LawyerGestion'), 'LawyerGestion');
const LawyerArchivo = lazyPage(() => import('./pages/saas/LawyerArchivo'), 'LawyerArchivo');
const LawyerHearings = lazyPage(() => import('./pages/saas/LawyerHearings'), 'LawyerHearings');
const LawyerDeadlines = lazyPage(() => import('./pages/saas/LawyerDeadlines'), 'LawyerDeadlines');
const LawyerBilling = lazyPage(() => import('./pages/saas/LawyerBilling'), 'LawyerBilling');
const NightclubEvents = lazyPage(() => import('./pages/saas/NightclubEvents'), 'NightclubEvents');
const NightclubVIP = lazyPage(() => import('./pages/saas/NightclubVIP'), 'NightclubVIP');
const NightclubPromoters = lazyPage(() => import('./pages/saas/NightclubPromoters'), 'NightclubPromoters');
const NightclubGuestlist = lazyPage(() => import('./pages/saas/NightclubGuestlist'), 'NightclubGuestlist');
const NightclubArtists = lazyPage(() => import('./pages/saas/NightclubArtists'), 'NightclubArtists');
const EventsServices = lazyPage(() => import('./pages/saas/EventsServices'), 'EventsServices');
const RedirectToEventsServicesTab = lazyPage(() => import('./pages/saas/EventsServices'), 'RedirectToEventsServicesTab');
const EventsHub = lazyPage(() => import('./pages/saas/vertical/eventos/EventsHub'), 'EventsHub');
const EventsContractWizardPage = lazyPage(() => import('./pages/saas/vertical/eventos/EventsContractWizardPage'), 'EventsContractWizardPage');
const EventsPipelinePage = lazyPage(() => import('./pages/saas/vertical/eventos/EventsPipelinePage'), 'EventsPipelinePage');
const EventsQuotesPage = lazyPage(() => import('./pages/saas/vertical/eventos/EventsQuotesPage'), 'EventsQuotesPage');
const EventsRoutePage = lazyPage(() => import('./pages/saas/vertical/eventos/EventsRoutePage'), 'EventsRoutePage');
const EventsProjectPage = lazyPage(() => import('./pages/saas/vertical/eventos/EventsProjectPage'), 'EventsProjectPage');
const EventsTpvPage = lazyPage(() => import('./pages/saas/vertical/eventos/EventsTpvPage'), 'EventsTpvPage');
const SalonServices = lazyPage(() => import('./pages/saas/SalonServices'), 'SalonServices');
const SalonLoyalty = lazyPage(() => import('./pages/saas/SalonLoyalty'), 'SalonLoyalty');
const ScrapyardHub = lazyPage(() => import('./pages/saas/ScrapyardHub'), 'ScrapyardHub');
const ScrapyardVehicles = lazyPage(() => import('./pages/saas/ScrapyardVehicles'), 'ScrapyardVehicles');
const ScrapyardVehicleDetail = lazyPage(() => import('./pages/saas/ScrapyardVehicleDetail'), 'ScrapyardVehicleDetail');
const ScrapyardParts = lazyPage(() => import('./pages/saas/ScrapyardParts'), 'ScrapyardParts');
const ScrapyardDeregistrations = lazyPage(() => import('./pages/saas/ScrapyardDeregistrations'), 'ScrapyardDeregistrations');
const ScrapyardEnvironment = lazyPage(() => import('./pages/saas/ScrapyardEnvironment'), 'ScrapyardEnvironment');
const ScrapyardExpedition = lazyPage(() => import('./pages/saas/ScrapyardExpedition'), 'ScrapyardExpedition');
const ScrapyardPurchasesPage = lazyPage(() => import('./pages/saas/ScrapyardPurchasesPage'), 'ScrapyardPurchasesPage');
const ScrapyardDocumentationPage = lazyPage(() => import('./pages/saas/ScrapyardDocumentationPage'), 'ScrapyardDocumentationPage');
const ScrapyardDismantling = lazyPage(() => import('./pages/saas/ScrapyardDismantling'), 'ScrapyardDismantling');
const SparePartsCompatibility = lazyPage(() => import('./pages/saas/SparePartsCompatibility'), 'SparePartsCompatibility');
const SparePartsCounter = lazyPage(() => import('./pages/saas/SparePartsCounter'), 'SparePartsCounter');
const TaxiFleet = lazyPage(() => import('./pages/saas/TaxiFleet'), 'TaxiFleet');
const TaxiTrips = lazyPage(() => import('./pages/saas/TaxiTrips'), 'TaxiTrips');
const TaxiShifts = lazyPage(() => import('./pages/saas/TaxiShifts'), 'TaxiShifts');
const PharmacyPrescriptions = lazyPage(() => import('./pages/saas/PharmacyPrescriptions'), 'PharmacyPrescriptions');
const PharmacyGuard = lazyPage(() => import('./pages/saas/PharmacyGuard'), 'PharmacyGuard');
const CarWashServices = lazyPage(() => import('./pages/saas/CarWashServices'), 'CarWashServices');
const CarWashMemberships = lazyPage(() => import('./pages/saas/CarWashMemberships'), 'CarWashMemberships');
const VetPatients = lazyPage(() => import('./pages/saas/VetPatients'), 'VetPatients');
const VetHistory = lazyPage(() => import('./pages/saas/VetHistory'), 'VetHistory');
const VetVaccinations = lazyPage(() => import('./pages/saas/VetVaccinations'), 'VetVaccinations');
const TobaccoLottery = lazyPage(() => import('./pages/saas/TobaccoLottery'), 'TobaccoLottery');
const TobaccoRegulatory = lazyPage(() => import('./pages/saas/TobaccoRegulatory'), 'TobaccoRegulatory');
const ButcherHub = lazyPage(() => import('./pages/saas/ButcherHub'), 'ButcherHub');
const ButcherClients = lazyPage(() => import('./pages/saas/ButcherClients'), 'ButcherClients');
const ButcherProducts = lazyPage(() => import('./pages/saas/ButcherProducts'), 'ButcherProducts');
const ButcherOrders = lazyPage(() => import('./pages/saas/ButcherOrders'), 'ButcherOrders');
const ButcherSales = lazyPage(() => import('./pages/saas/ButcherSales'), 'ButcherSales');
const ButcherReports = lazyPage(() => import('./pages/saas/ButcherReports'), 'ButcherReports');
const ButcherTraceability = lazyPage(() => import('./pages/saas/ButcherTraceability'), 'ButcherTraceability');
const ButcherWaste = lazyPage(() => import('./pages/saas/ButcherWaste'), 'ButcherWaste');
const ButcherPurchasesPage = lazyPage(() => import('./pages/saas/ButcherPurchasesPage'), 'ButcherPurchasesPage');
const ButcherReparto = lazyPage(() => import('./pages/saas/ButcherReparto'), 'ButcherReparto');
const ButcherDespiece = lazyPage(() => import('./pages/saas/ButcherDespiece'), 'ButcherDespiece');
const ButcherScaleSetup = lazyPage(() => import('./pages/saas/ButcherScaleSetup'), 'ButcherScaleSetup');
const ButcherTpvPage = lazyPage(() => import('./pages/saas/ButcherTpvPage'), 'ButcherTpvPage');
const WorkerButcherReparto = lazyPage(() => import('./pages/saas/WorkerButcherReparto'), 'WorkerButcherReparto');
const HeladeriaOpsPage = lazyPage(() => import('./verticals/heladeria/HeladeriaOpsPage'), 'HeladeriaOpsPage');
const HeladeriaTpvPage = lazyPage(() => import('./verticals/heladeria/HeladeriaTpvPage'), 'HeladeriaTpvPage');
const HeladeriaCajaPage = lazyPage(() => import('./verticals/heladeria/HeladeriaCajaPage'), 'HeladeriaCajaPage');
const HeladeriaEncargosPage = lazyPage(() => import('./verticals/heladeria/HeladeriaEncargosPage'), 'HeladeriaEncargosPage');
const HeladeriaIntegracionesPage = lazyPage(() => import('./verticals/heladeria/HeladeriaIntegracionesPage'), 'HeladeriaIntegracionesPage');
const CompraventaCrm = lazyPage(() => import('./pages/saas/vertical/compraventa/CompraventaCrm'), 'CompraventaCrm');
const CompraventaComprasPage = lazyPage(() => import('./pages/saas/vertical/compraventa/CompraventaComprasPage'), 'CompraventaComprasPage');
const CompraventaVentasPage = lazyPage(() => import('./pages/saas/vertical/compraventa/CompraventaVentasPage'), 'CompraventaVentasPage');
const CompraventaTasacionesPage = lazyPage(() => import('./pages/saas/vertical/compraventa/CompraventaTasacionesPage'), 'CompraventaTasacionesPage');
const CompraventaEntregasPage = lazyPage(() => import('./pages/saas/vertical/compraventa/CompraventaEntregasPage'), 'CompraventaEntregasPage');
const CompraventaFiscalCalculatorPage = lazyPage(() => import('./pages/saas/vertical/compraventa/CompraventaFiscalCalculatorPage'), 'CompraventaFiscalCalculatorPage');
const PreparationExpenses = lazyPage(() => import('./pages/saas/PreparationExpenses'), 'PreparationExpenses');
const ButcherWorkerOrders = lazyPage(() => import('./pages/saas/ButcherWorkerOrders'), 'ButcherWorkerOrders');
const SalesPointTpvPage = lazyPage(() => import('./pages/saas/SalesPointTpvPage'), 'SalesPointTpvPage');
const ClockKiosk = lazyPage(() => import('./pages/saas/ClockKiosk'), 'ClockKiosk');
const WorkerIdentitySetup = lazyPage(() => import('./pages/saas/worker/WorkerIdentitySetup'), 'WorkerIdentitySetup');
const WorkerPayrollSetup = lazyPage(() => import('./pages/saas/worker/WorkerPayrollSetup'), 'WorkerPayrollSetup');
const WorkerTasks = lazyPage(() => import('./pages/saas/worker/WorkerTasks'), 'WorkerTasks');
const WorkerCalendar = lazyPage(() => import('./pages/saas/worker/WorkerCalendar'), 'WorkerCalendar');
const WorkerRequests = lazyPage(() => import('./pages/saas/worker/WorkerRequests'), 'WorkerRequests');
const WorkerClock = lazyPage(() => import('./pages/saas/worker/WorkerClock'), 'WorkerClock');
const WorkerChat = lazyPage(() => import('./pages/saas/worker/WorkerChat'), 'WorkerChat');
const WorkerDocs = lazyPage(() => import('./pages/saas/worker/WorkerDocs'), 'WorkerDocs');
const WorkerOnboarding = lazyPage(() => import('./pages/saas/worker/WorkerOnboarding'), 'WorkerOnboarding');
const WorkerProfile = lazyPage(() => import('./pages/saas/worker/WorkerProfile'), 'WorkerProfile');
const WorkerContractInfo = lazyPage(() => import('./pages/saas/worker/WorkerContractInfo'), 'WorkerContractInfo');
const WorkerPosition = lazyPage(() => import('./pages/saas/worker/WorkerPosition'), 'WorkerPosition');
const WorkerNotifications = lazyPage(() => import('./pages/saas/worker/WorkerNotifications'), 'WorkerNotifications');
const WorkerSecurity = lazyPage(() => import('./pages/saas/worker/WorkerSecurity'), 'WorkerSecurity');
const WorkerTpv = lazyPage(() => import('./pages/saas/worker/WorkerTpv'), 'WorkerTpv');
const WorkerTpvEntry = lazyPage(() => import('./pages/saas/worker/WorkerTpv'), 'WorkerTpvEntry');
const WorkerTpvDeliveryRoute = lazyPage(() => import('./pages/saas/worker/WorkerTpv'), 'WorkerTpvDeliveryRoute');
const WorkerConstructionReport = lazyPage(() => import('./pages/saas/worker/WorkerConstructionReport'), 'WorkerConstructionReport');
const WorkerStockReviewPage = lazyPage(() => import('./pages/saas/worker/WorkerStockReviewPage'), 'WorkerStockReviewPage');
const WorkerEventsOps = lazyPage(() => import('./pages/saas/worker/WorkerEventsOps'), 'WorkerEventsOps');
const WorkerEventDayPage = lazyPage(() => import('./pages/saas/worker/WorkerEventDayPage'), 'WorkerEventDayPage');
const UserDashboard = lazyPage(() => import('./pages/saas/UserDashboard'), 'UserDashboard');


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

/** Pitch ventas: lazy (no va en el bundle inicial de landing/SaaS). */
const VertialPitchDeckLazy = lazy(() =>
  import('./pages/VertialPitchDeck').then((m) => ({ default: m.VertialPitchDeck })),
);

function RouteChunkFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--v-blue,#2563eb)] dark:border-gray-600 dark:border-t-blue-400" />
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function DeliveryOpsCenterRoute() {
  return (
    <Suspense fallback={<RouteChunkFallback label="Cargando operativa…" />}>
      <DeliveryOpsCenterLazy />
    </Suspense>
  );
}

function PresentacionRoute() {
  return (
    <Suspense fallback={<RouteChunkFallback label="Cargando presentación…" />}>
      <VertialPitchDeckLazy />
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
        path: 'presentacion',
        Component: PresentacionRoute,
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

          // Events — segmentos fijos ANTES de :eventId (ruta/tpv/… no son fichas).
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
        path: 'promo/accept',
        Component: PromoAcceptPublic,
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