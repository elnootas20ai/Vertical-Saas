import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { useSSE } from '../hooks/useSSE';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useNativePushNotifications } from '../hooks/useNativePushNotifications';
import { PushPermissionGate } from '../components/saas/PushPermissionGate';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './AuthContext';
import { useBusinessOptional } from './BusinessContext';
import { resolveVehicleListBusinessId, supportsVehicleInventoryModule } from '../lib/vehicleVertical';
import { isCompraventaBusinessType } from '../lib/compraventaSetup';
import type { BillingSubscription as PersistedBillingSubscription } from '../lib/authApi';
import { isWorkerAccount, logActivityRequest } from '../lib/authApi';
import { persistVertialJsonCache, pruneVertialStorageIfNeeded } from '../lib/clientSessionStorage';
import {
  bulkCreateVehiclesRequest,
  createVehicleRequest,
  deleteVehicleRequest,
  archiveVehicleRequest,
  restoreVehicleRequest,
  listVehiclesRequest,
  updateVehicleRequest,
} from '../lib/vehicleApi';
import {
  createClientRequest,
  createLeadRequest,
  deleteClientRequest,
  deleteLeadRequest,
  listClientsPageRequest,
  listClientsRequest,
  listLeadsRequest,
  updateClientRequest,
  updateLeadRequest,
} from '../lib/crmApi';
import {
  createNotificationRequest,
  listNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
  type NotificationLevel,
  type NotificationRecord,
} from '../lib/notificationApi';
import {
  createParkingZone,
  type CreateParkingZoneInput,
  type ParkingZone,
} from '../lib/parkingZones';
import {
  listSalesRecords,
  createSaleInCouch,
  updateSaleInCouch,
  deleteSaleInCouch,
} from '../lib/salesApi';
import type { SaleRecord } from '../lib/salesTypes';
import { isVertialSuperAdminEmail } from '../lib/superAdmin';
import {
  listDocumentsRequest,
  createDocumentRequest,
  updateDocumentRequest,
  deleteDocumentRequest,
  type DocumentRecord,
} from '../lib/documentsApi';
import {
  listParkingZonesRequest,
  saveParkingZoneRequest,
  deleteParkingZoneRequest,
  createParkingZoneRequest,
} from '../lib/locationsApi';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PriceChangeReasonCategory =
  | 'market_adjustment'
  | 'client_negotiation'
  | 'time_in_stock'
  | 'competitor_price'
  | 'manager_decision'
  | 'error_correction'
  | 'other';

export interface PriceHistoryEntry {
  id: string;
  date: string;
  userId: string;
  userName: string;
  oldPrice: number | null;
  newPrice: number | null;
  reason: string;
  reasonCategory?: PriceChangeReasonCategory;
  priceVariation?: number | null;
}

export type CommercialStatus = 'preparation' | 'ready' | 'published' | 'reserved' | 'sold';

export interface VehiclePublicationChannel {
  channelId: string;
  channelName: string;
  url: string;
  publishedAt: string | null;
  unpublishedAt: string | null;
  active: boolean;
  notes: string;
}

export interface CommercialStatusHistoryEntry {
  id: string;
  date: string;
  userId: string;
  userName: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
}

export interface WarrantyClaim {
  id: string;
  date: string;
  description: string;
  resolved: boolean;
}

export interface Warranty {
  id: string;
  type: 'factory' | 'own';
  provider: string;
  startDate?: string;
  endDate?: string;
  coverage: string;
  claims: WarrantyClaim[];
}

export type CostCategory = 'preparacion' | 'itv' | 'limpieza' | 'fotos' | 'publicidad' | 'otro';

export interface AssociatedCost {
  id: string;
  category: CostCategory;
  description: string;
  amount: number;
  date: string;
}

export type PreparationExpenseType = 'taller' | 'limpieza' | 'pintura' | 'transporte' | 'gestoria' | 'combustible' | 'itv' | 'otro';
export type PreparationExpenseStatus = 'pendiente' | 'revisado' | 'validado' | 'rechazado';

export interface PreparationExpense {
  id: string;
  type: 'preparation_expense';
  user_id: string;
  business_id?: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleLabel: string;
  expenseType: PreparationExpenseType;
  amount: number;
  date: string;
  supplierId?: string;
  supplierName?: string;
  documentId?: string;
  documentName?: string;
  ocrData?: Record<string, unknown>;
  notes?: string;
  status: PreparationExpenseStatus;
  validatedBy?: string;
  validatedAt?: string;
  rejectionReason?: string;
  invoiceNumber?: string;
  paymentId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleWorkshopRepair {
  id: string;
  concept: string;
  date: string;
  amount: number;
  status: 'pending' | 'in_progress' | 'done';
  workshop: string;
  notes: string;
}

export interface VehicleChecklistItem {
  id: string;
  task: string;
  done: boolean;
  category: string;
}

export interface Vehicle {
  id: string;
  _rev?: string;
  type?: string;
  user_id?: string;
  active?: boolean;
  registrationPlate: string;
  brand: string;
  model: string;
  version?: string;
  year: number;
  color: string;
  fuelType?: 'gasolina' | 'diesel' | 'hibrido' | 'electrico' | 'glp' | 'otro';
  mileage?: number;
  vin?: string;
  transmission?: 'manual' | 'automatico' | 'semiauto';
  doors?: number;
  power?: number;
  bodyType?: 'sedan' | 'suv' | 'familiar' | 'coupe' | 'cabrio' | 'furgon' | 'pickup' | 'otro';
  purchasePrice: number;
  salePrice?: number;
  purchaseDate?: string;
  origin?: 'particular' | 'empresa' | 'subasta' | 'permuta' | 'otro';
  supplierName?: string;
  tradeInId?: string;
  acquisitionId?: string;
  status: 'entrada' | 'preparacion' | 'listo' | 'reservado' | 'vendido' | 'entregado';
  location?: string;
  daysInStock: number;
  images?: string[];
  notes?: string;
  priceHistory?: PriceHistoryEntry[];
  warranties?: Warranty[];
  associatedCosts?: AssociatedCost[];
  preparationCostTotal?: number;
  estimatedMargin?: number | null;
  totalCosts?: number;
  margin?: number | null;
  marginPercent?: number | null;
  workshopRepairs?: VehicleWorkshopRepair[];
  workshopChecklist?: VehicleChecklistItem[];
  assignedTo?: string | null;
  assignedToName?: string | null;
  assignedAt?: string | null;
  stockAlertSentAt?: string | null;
  lowMarginAlertSentAt?: string | null;
  noPhotosAlertSentAt?: string | null;
  incompleteDataAlertSentAt?: string | null;
  workCenterId?: string;
  workCenterName?: string;

  commercialDescription?: string;
  commercialStatus?: CommercialStatus;
  published?: boolean;
  publishedAt?: string | null;
  featured?: boolean;
  minimumSalePrice?: number | null;
  assignedCommercialId?: string | null;
  assignedCommercialName?: string | null;
  publicationChannels?: VehiclePublicationChannel[];
  estimatedMargin?: number | null;
  totalPreparationCost?: number | null;
  marginPercentage?: number | null;
  commercialStatusHistory?: CommercialStatusHistoryEntry[];

  createdAt: Date;
  updatedAt?: Date;
  soldAt?: Date;

  archived?: boolean;
  archivedAt?: string;
  createdByUserId?: string;
  createdByName?: string;
  vehicleHistory?: VehicleHistoryRecord[];
  documents?: VehicleDocumentRecord[];
}

export interface VehicleHistoryRecord {
  id: string;
  action: string;
  label: string;
  note?: string;
  date: string;
  userId?: string;
  userName?: string;
  metadata?: Record<string, unknown>;
}

export interface VehicleDocumentRecord {
  id: string;
  name: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  attachmentName?: string;
  notes?: string;
  expiresAt?: string | null;
  uploadedAt: string;
  uploadedBy: string;
}

export type TradeInCondition = 'excelente' | 'bueno' | 'regular' | 'malo';
export type TradeInStatus = 'pending' | 'negotiation' | 'accepted' | 'rejected';

export interface TradeInStatusHistoryEntry {
  id?: string;
  action?: string;
  status?: string;
  date?: string;
  userId?: string;
  note?: string;
  linkedVehicleId?: string;
  linkedAcquisitionId?: string;
}

export interface TradeIn {
  id: string;
  _rev?: string;
  type?: string;
  user_id?: string;
  business_id?: string;
  linkedVehicleId?: string;
  linkedAcquisitionId?: string;
  clientId?: string;
  brand: string;
  model: string;
  version?: string;
  year: number;
  mileage?: number;
  color: string;
  fuelType?: string;
  transmission?: string;
  registrationPlate?: string;
  vin?: string;
  condition: TradeInCondition;
  estimatedValue: number;
  recommendedPrice?: number;
  acceptedValue?: number;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  notes?: string;
  status: TradeInStatus;
  statusHistory?: TradeInStatusHistoryEntry[];
  appraiserUserId?: string;
  appraiserName?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface LeadInteraction {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'appointment';
  title: string;
  description: string;
  date: string;
  user: string;
}

export interface Lead {
  id: string;
  _rev?: string;
  type?: 'lead';
  user_id?: string;
  name: string;
  phone: string;
  email?: string;
  source: string;
  status: 'new' | 'contacted' | 'appointment' | 'reserved' | 'negotiation' | 'won' | 'lost';
  interestedVehicle?: string;
  vehicleInterest?: string;
  vehicleInterestId?: string;
  budget?: string;
  notes?: string;
  responsible?: string;
  branch_id?: string;
  tags?: string[];
  interactions?: LeadInteraction[];
  score?: number;
  lastContact?: Date;
  convertedAt?: Date;
  convertedToClientId?: string;
  convertedToClientName?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landing_page?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ConsentHistoryEntry {
  timestamp: string;
  type: 'dataProcessing' | 'commercial' | 'thirdParty';
  value: boolean;
  method: 'web' | 'phone' | 'presential' | 'email' | 'written';
  user?: string;
}

export interface GdprRecord {
  deletionRequested: boolean;
  deletionRequestedAt?: string;
  deletionCompletedAt?: string;
  dataExportRequestedAt?: string;
  consentHistory: ConsentHistoryEntry[];
}

export type ClientType = 'particular' | 'empresa';

export type PaymentMethod =
  | 'efectivo'
  | 'tarjeta'
  | 'transferencia'
  | 'domiciliacion'
  | 'bizum'
  | 'cheque'
  | 'pagare'
  | 'confirming'
  | 'otro';

export interface ClientAddress {
  id: string;
  label?: string;
  street: string;
  city?: string;
  postalCode?: string;
  state?: string;
  country?: string;
  isPrimary?: boolean;
  isDefault?: boolean;
  notes?: string;
  usageCount?: number;
  lastUsedAt?: string | null;
}

export type ClientCreatedFrom = 'crm' | 'tpv' | 'pedido' | 'presupuesto' | 'factura' | 'vertical' | 'import' | 'web';

/** migration = base histórica del negocio; organic = alta real en Vertial. */
export type ClientAcquisitionKind = 'migration' | 'organic';

export interface ClientStats {
  totalOrders: number;
  lastOrderDate: string | null;
  orderFrequencyDays: number;
  favoriteAddressId: string | null;
  totalSpent: number;
  createdFrom: ClientCreatedFrom;
  /** Si 'migration', no cuenta como “cliente nuevo” en KPIs del mes. */
  acquisitionKind?: ClientAcquisitionKind;
  excludeFromNewMetrics?: boolean;
  /** Atención rápida TPV sin teléfono → ficha «cliente perdido». */
  lostFromQuickAttention?: boolean;
}

export type LoyaltyLevel = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface ClientLoyalty {
  enrolled: boolean;
  enrolledAt: string | null;
  points: number;
  level: LoyaltyLevel;
  totalVisits: number;
}

export interface Client {
  id: string;
  _rev?: string;
  type?: 'client';
  user_id?: string;
  clientType?: ClientType;
  name: string;
  phone: string;
  phonePrefix?: string;
  email: string;
  dni?: string;
  legalName?: string;
  fiscalId?: string;
  fiscalAddress?: string;
  fiscalCity?: string;
  fiscalPostalCode?: string;
  fiscalCountry?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  status: 'active' | 'inactive';
  commercialStatus?: string;
  responsible?: string;
  /** Agente/trabajador asignado (userId de Equipo). Clave para cartera inmobiliaria. */
  responsibleUserId?: string;
  branch_id?: string;
  businessId?: string;
  business_id?: string;
  notes?: string;
  defaultPaymentMethod?: PaymentMethod | '';
  tags?: string[];
  consents?: {
    dataProcessing: boolean;
    commercial: boolean;
    thirdParty: boolean;
  };
  gdpr?: GdprRecord;
  vehiclesPurchased?: string[];
  vehiclesSold?: string[];
  documentsCount?: number;
  contacts?: Array<{
    id: string;
    name: string;
    role?: string;
    phone?: string;
    email?: string;
  }>;
  addresses?: ClientAddress[];
  socialLinks?: Array<{
    platform: string;
    url: string;
  }>;
  interactions?: Array<{
    id: string;
    type: 'call' | 'email' | 'meeting' | 'note';
    title: string;
    description: string;
    date: string;
    user: string;
  }>;
  documentsList?: Array<{
    id: string;
    name: string;
    date: string;
    status: string;
  }>;
  referralCode?: string;
  stats?: ClientStats;
  loyalty?: ClientLoyalty;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Sale {
  id: string;
  _id?: string;
  _rev?: string;
  vehicleId: string;
  clientId: string;
  salePrice: number;
  downPayment?: number;
  financingAmount?: number;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  saleDate: Date;
  deliveryDate?: Date;
  createdAt: Date;
}

export interface Document {
  id: string;
  _id?: string;
  _rev?: string;
  name: string;
  type: string;
  status: 'pending' | 'signed' | 'sent';
  relatedTo?: string;
  relatedToId?: string;
  templateId?: string;
  notes?: string;
  expiresAt?: string;
  createdAt: Date;
  /** Expediente compraventa / OCR */
  vehicleId?: string;
  vehicleName?: string;
  clientId?: string;
  clientName?: string;
  docSubCategory?: string;
  registrationPlate?: string;
  vin?: string;
  itvExpiryDate?: string;
  ocrConfidence?: number;
}

export interface Location {
  id: string;
  name: string;
  capacity: number;
  currentVehicles: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AppNotification {
  id: string;
  _rev?: string;
  user_id: string;
  level: NotificationLevel;
  category: string;
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
  route?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
  updatedAt?: string;
  /** Aviso de actividad (“fue bien”) — campana, no Centro de Alertas */
  kind?: string | null;
  polarity?: string | null;
  excludeFromAlertCenter?: boolean;
}

export type SubscriptionStatus =
  | 'pending_payment'
  | 'payment_sent'
  | 'trial_active'
  | 'trial_expiring'
  | 'trial_expired'
  | 'subscription_active'
  | 'payment_failed'
  | 'grace_period'
  | 'suspended';

export interface Subscription {
  status: SubscriptionStatus;
  planName: string;
  selectedPlanId?: string;
  trialEndsAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  gracePeriodEndsAt?: Date;
  lastPaymentAt?: Date;
  cancelAtPeriodEnd: boolean;
  /** Cupo extra de PDV concedido por superadmin (sin cobro). */
  extraPointOfSaleSlots?: number;
  /** Cupo extra de marcas comerciales concedido por superadmin (sin cobro). */
  extraCommercialBrandSlots?: number;
  /** Empresas extra contratadas o concedidas por admin. */
  extraBusinessSlots?: number;
  /** Trabajadores extra (además del cupo del plan). */
  extraWorkerSlots?: number;
  extraTpvTabletSlots?: number;
  /** Funciones PRO activadas manualmente por superadmin. */
  adminProAccess?: boolean;
  /** Exento de suspensión automática (MONEI/cron). Cuentas manuales como clientes sin pasarela. */
  billingExempt?: boolean;
  moneiSubscriptionId?: string;
  moneiSubscriptionStatus?: string;
}

// ─── Context Type ─────────────────────────────────────────────────────────────

export interface AppContextType {
  vehicles: Vehicle[];
  isLoadingVehicles: boolean;
  isLoadingClients: boolean;
  /** Total de clientes en servidor (sin cargar todos en memoria). */
  clientsTotalCount: number;
  parkingZones: ParkingZone[];
  leads: Lead[];
  clients: Client[];
  notifications: AppNotification[];
  sales: Sale[];
  documents: Document[];
  locations: Location[];
  user: User | null;
  subscription: Subscription;
  setDevSubscriptionPlan: (plan: 'basic' | 'normal' | 'pro' | null) => void;
  /** Activa PDV ilimitados en local para pruebas (desactiva simulación de plan). */
  enableDevUnlimitedPdv: () => void;
  /** Plan simulado en Plan (dev): basic | normal | pro. null = suscripción real / Ilimitado. */
  devPlanOverride: 'basic' | 'normal' | 'pro' | null;
  /** Sin tope de PDV al crear tiendas (solo simulación local). */
  devUnlimitedPdv: boolean;
  /** Cupos extra de tienda/PDV simulados en local (suman al plan). */
  devExtraPdv: number;
  /** Cupos extra de marca comercial simulados en local (suman al plan). */
  devExtraBrands: number;
  /** Cupos extra de empresa simulados en local (suman al plan). */
  devExtraBusiness: number;
  setDevExtraPdvSlots: (value: number) => void;
  setDevExtraBrandSlots: (value: number) => void;
  setDevExtraBusinessSlots: (value: number) => void;
  canAccessFeature: () => boolean;
  canPerformCriticalAction: () => boolean;
  getAccessRestrictionMessage: () => string | null;
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'daysInStock'>) => Promise<Vehicle | void>;
  addVehiclesBulk: (vehicles: Omit<Vehicle, 'id' | 'createdAt' | 'daysInStock'>[]) => Promise<Vehicle[]>;
  updateVehicle: (id: string, updates: Partial<Vehicle>, priceChangeReason?: string, priceChangeReasonCategory?: PriceChangeReasonCategory) => Promise<Vehicle | void>;
  syncVehicle: (vehicle: Vehicle) => void;
  mergeVehicles: (vehicles: Vehicle[]) => void;
  archiveVehicle: (id: string) => Promise<Vehicle | void>;
  restoreVehicle: (id: string) => Promise<Vehicle | void>;
  deleteVehicle: (id: string) => Promise<void>;
  addLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'status'>) => Promise<Lead | void>;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  /** Recarga leads desde el backend (útil tras importaciones masivas/SSE). */
  refreshLeads: () => Promise<void>;
  addClient: (client: Omit<Client, 'id' | 'createdAt'>) => Promise<Client | void>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  /** Recarga clientes desde el backend (útil tras importaciones masivas/SSE). */
  refreshClients: () => Promise<void>;
  createNotification: (notification: {
    level?: NotificationLevel;
    category?: string;
    title: string;
    message: string;
    entityId?: string;
    entityType?: string;
    route?: string;
    metadata?: Record<string, unknown>;
    read?: boolean;
    createdAt?: string;
  }) => Promise<AppNotification | null>;
  markNotificationAsRead: (id: string, read?: boolean) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  addSale: (sale: Omit<Sale, 'id' | 'createdAt' | 'status' | 'saleDate'>) => Promise<void>;
  updateSale: (id: string, updates: Partial<Sale>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  addDocument: (document: Omit<Document, 'id' | 'createdAt'>) => Promise<void>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  refreshDocuments: () => Promise<void>;
  addLocation: (location: Omit<Location, 'id'>) => void;
  addParkingZone: (zone: CreateParkingZoneInput) => void;
  updateLocation: (id: string, updates: Partial<Location>) => void;
  deleteLocation: (id: string) => void;
  getStats: () => {
    totalVehicles: number;
    vehiclesAvailable: number;
    vehiclesReserved: number;
    vehiclesSold: number;
    totalLeads: number;
    activeSales: number;
    pendingDocuments: number;
    totalStockValue: number;
  };
}

// ─── HMR-safe singleton context ───────────────────────────────────────────────
// Store the context on globalThis so it survives React Fast Refresh reloads.
// This prevents the "used outside Provider" error caused by HMR creating a new
// context object identity while the old Provider is still in the React tree.

const CONTEXT_KEY = '__vertial_app_ctx__';

function getOrCreateContext(): ReturnType<typeof createContext<AppContextType>> {
  const g = globalThis as any;
  if (!g[CONTEXT_KEY]) {
    const defaultStats = () => ({
      totalVehicles: 0, vehiclesAvailable: 0, vehiclesReserved: 0,
      vehiclesSold: 0, totalLeads: 0, activeSales: 0, pendingDocuments: 0, totalStockValue: 0,
    });
    const defaultCtx: AppContextType = {
      vehicles: [], isLoadingVehicles: true, isLoadingClients: true, clientsTotalCount: 0, parkingZones: [], leads: [], clients: [], notifications: [], sales: [], documents: [], locations: [], user: null,
      subscription: { status: 'trial_active', planName: 'Basic', cancelAtPeriodEnd: false },
      setDevSubscriptionPlan: () => {},
      enableDevUnlimitedPdv: () => {},
      devPlanOverride: null,
      devUnlimitedPdv: false,
      devExtraPdv: 0,
      devExtraBrands: 0,
      devExtraBusiness: 0,
      setDevExtraPdvSlots: () => {},
      setDevExtraBrandSlots: () => {},
      setDevExtraBusinessSlots: () => {},
      canAccessFeature: () => true,
      canPerformCriticalAction: () => true,
      getAccessRestrictionMessage: () => null,
      addVehicle: async () => undefined,
      addVehiclesBulk: async () => [],
      updateVehicle: async () => {},
      syncVehicle: () => {},
      mergeVehicles: () => {},
      archiveVehicle: async () => {},
      restoreVehicle: async () => {},
      deleteVehicle: async () => {},
      addLead: async () => undefined, updateLead: async () => {}, deleteLead: async () => {},
      refreshLeads: async () => {},
      addClient: async () => undefined, updateClient: async () => {}, deleteClient: async () => {},
      refreshClients: async () => {},
      createNotification: async () => null,
      markNotificationAsRead: async () => {},
      markAllNotificationsAsRead: async () => {},
      addSale: async () => {}, updateSale: async () => {}, deleteSale: async () => {},
      addDocument: async () => {}, updateDocument: async () => {}, deleteDocument: async () => {},
      refreshDocuments: async () => {},
      addLocation: () => {}, addParkingZone: () => {}, updateLocation: () => {}, deleteLocation: () => {},
      getStats: defaultStats,
    };
    g[CONTEXT_KEY] = createContext<AppContextType>(defaultCtx);
  }
  return g[CONTEXT_KEY];
}

const AppContext = getOrCreateContext();

// ─── Date Deserializers ───────────────────────────────────────────────────────

function deserializeVehicle(v: any): Vehicle {
  return {
    ...v,
    createdAt: new Date(v.createdAt),
    updatedAt: v.updatedAt ? new Date(v.updatedAt) : undefined,
    soldAt: v.soldAt ? new Date(v.soldAt) : undefined,
  };
}
function deserializeLead(l: any): Lead {
  return {
    ...l,
    createdAt: new Date(l.createdAt),
    updatedAt: l.updatedAt ? new Date(l.updatedAt) : undefined,
    lastContact: l.lastContact ? new Date(l.lastContact) : undefined,
    convertedAt: l.convertedAt ? new Date(l.convertedAt) : undefined,
  };
}
function deserializeClient(c: any): Client {
  return {
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
    consents: c.consents || { dataProcessing: false, commercial: false, thirdParty: false },
    tags: c.tags || [],
    gdpr: c.gdpr || { deletionRequested: false, consentHistory: [] },
    vehiclesPurchased: c.vehiclesPurchased || [],
    vehiclesSold: c.vehiclesSold || [],
    documentsCount: c.documentsCount || 0,
    interactions: c.interactions || [],
    documentsList: c.documentsList || [],
  };
}
function deserializeSale(s: any): Sale {
  return { ...s, createdAt: new Date(s.createdAt), saleDate: new Date(s.saleDate), deliveryDate: s.deliveryDate ? new Date(s.deliveryDate) : undefined };
}
function deserializeDocument(d: any): Document {
  return { ...d, createdAt: new Date(d.createdAt) };
}

function mapDocumentRecordToApp(r: DocumentRecord): Document {
  return {
    id: r.id,
    _id: r._id,
    _rev: r._rev,
    name: r.name,
    type: r.docType,
    status: r.status,
    relatedTo: r.relatedTo,
    relatedToId: r.relatedToId,
    templateId: r.templateId,
    notes: r.notes,
    expiresAt: r.expiresAt,
    createdAt: new Date(r.createdAt),
    vehicleId: r.vehicleId || (r.relatedTo === 'vehicle' ? r.relatedToId : undefined),
    vehicleName: r.vehicleName,
    clientId: r.clientId,
    clientName: r.clientName,
    docSubCategory: r.docSubCategory,
    registrationPlate: r.registrationPlate,
    vin: r.vin,
    itvExpiryDate: r.itvExpiryDate,
    ocrConfidence: r.ocrConfidence,
  };
}

function deserializeNotification(notification: NotificationRecord): AppNotification {
  const status = String((notification as AppNotification & { status?: string }).status || '');
  // status 'seen'/'resolved' cuenta como leída aunque el booleano venga mal.
  const read =
    Boolean(notification.read)
    || (status !== '' && status !== 'new');
  return {
    ...notification,
    metadata: notification.metadata || {},
    route: notification.route || '',
    entityId: notification.entityId || '',
    entityType: notification.entityType || '',
    read,
    updatedAt: notification.updatedAt || notification.createdAt,
  };
}

/**
 * Al hidratar desde API, no reabrir la campanita si el cliente ya marcó leído
 * (el servidor a veces tarda o falla y devolvía read=false → badge “3” otra vez).
 */
function mergeServerNotificationsPreferringLocalRead(
  serverList: AppNotification[],
  localList: AppNotification[],
): AppNotification[] {
  const localById = new Map(localList.map((n) => [n.id, n]));
  return capNotifications(
    serverList.map((server) => {
      const local = localById.get(server.id);
      if (!local) return server;
      if (local.read && !server.read) {
        return {
          ...server,
          read: true,
          updatedAt: local.updatedAt || server.updatedAt,
        };
      }
      if (String(local.updatedAt || '') > String(server.updatedAt || '')) {
        return { ...server, ...local, id: server.id };
      }
      return server;
    }),
  );
}

/** Max notifications kept in React state (newest first). */
const NOTIFICATIONS_STATE_LIMIT = 80;
/** Max notifications written to localStorage (offline cache). */
const NOTIFICATIONS_CACHE_LIMIT = 40;

function sortNotificationsNewestFirst(list: AppNotification[]): AppNotification[] {
  return [...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function capNotifications(list: AppNotification[], limit = NOTIFICATIONS_STATE_LIMIT): AppNotification[] {
  if (list.length <= limit) return list;
  return sortNotificationsNewestFirst(list).slice(0, limit);
}

function notificationForCache(notification: AppNotification): AppNotification {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return notification;
  }
  const keys = Object.keys(metadata);
  if (keys.length <= 12) {
    return notification;
  }
  const trimmed: Record<string, unknown> = {};
  for (const key of keys.slice(0, 12)) {
    trimmed[key] = metadata[key];
  }
  return { ...notification, metadata: trimmed };
}

function persistNotificationsCache(key: string, notifications: AppNotification[]) {
  if (typeof window === 'undefined') return;

  const limits = [NOTIFICATIONS_CACHE_LIMIT, 25, 10, 5];
  for (const limit of limits) {
    try {
      const payload = JSON.stringify(
        sortNotificationsNewestFirst(notifications)
          .slice(0, limit)
          .map(notificationForCache),
      );
      window.localStorage.setItem(key, payload);
      return;
    } catch (error) {
      const isQuotaError =
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || error.code === 22);
      if (!isQuotaError) {
        console.error('Error saving notification cache:', error);
        return;
      }
    }
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const DEV_PLAN_OVERRIDE_KEY = 'vertial_dev_plan_override';
export const DEV_EXTRA_PDV_KEY = 'vertial_dev_extra_pdv';
export const DEV_EXTRA_BRAND_KEY = 'vertial_dev_extra_brands';
export const DEV_EXTRA_BUSINESS_KEY = 'vertial_dev_extra_businesses';
export const DEV_UNLIMITED_PDV_KEY = 'vertial_dev_unlimited_pdv';

type DevPlan = 'basic' | 'normal' | 'pro';

/** Solo la cuenta super-admin (o flag explícito) puede ver y usar el override de plan en localStorage. */
export function userCanUseDevPlanOverride(
  authUser?: { email?: string; role?: string; devPlanSwitcher?: boolean } | null,
): boolean {
  if (!authUser) return false;
  if (typeof authUser.devPlanSwitcher === 'boolean') {
    return authUser.devPlanSwitcher;
  }
  return isVertialSuperAdminEmail(authUser.email);
}

const DEV_PLAN_DEFINITIONS: Record<DevPlan, { planName: string; selectedPlanId: string }> = {
  basic: { planName: 'Básico', selectedPlanId: 'basic' },
  normal: { planName: 'Mediano', selectedPlanId: 'normal' },
  pro: { planName: 'Pro', selectedPlanId: 'pro' },
};

export function readDevPlanOverride(): DevPlan | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEV_PLAN_OVERRIDE_KEY);
    return raw === 'basic' || raw === 'normal' || raw === 'pro' ? raw : null;
  } catch {
    return null;
  }
}

function readDevExtraSlots(key: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const n = Math.floor(Number(window.localStorage.getItem(key) || 0));
    return Math.max(0, Math.min(99, n));
  } catch {
    return 0;
  }
}

/** PDV extra solo en local (suma al cupo del plan real al simular). */
export function readDevExtraPdv(): number {
  return readDevExtraSlots(DEV_EXTRA_PDV_KEY);
}

/** Marcas comerciales extra solo en local (suman al cupo del plan al simular). */
export function readDevExtraBrands(): number {
  return readDevExtraSlots(DEV_EXTRA_BRAND_KEY);
}

/** @internal Dev-only extra business slots (localStorage). */
export function readDevExtraBusinesses(): number {
  return readDevExtraSlots(DEV_EXTRA_BUSINESS_KEY);
}

export function readDevUnlimitedPdv(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEV_UNLIMITED_PDV_KEY) === '1';
  } catch {
    return false;
  }
}

function clearDevPlanLocalStorage() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DEV_PLAN_OVERRIDE_KEY);
    window.localStorage.removeItem(DEV_EXTRA_PDV_KEY);
    window.localStorage.removeItem(DEV_EXTRA_BRAND_KEY);
    window.localStorage.removeItem(DEV_EXTRA_BUSINESS_KEY);
    window.localStorage.removeItem(DEV_UNLIMITED_PDV_KEY);
  } catch {
    // ignore
  }
}

function mergeDevOverrides(sub: Subscription): Subscription {
  const override = readDevPlanOverride();
  let result: Subscription = { ...sub };
  if (override) {
    const def = DEV_PLAN_DEFINITIONS[override];
    result = {
      ...result,
      status: 'subscription_active',
      planName: def.planName,
      selectedPlanId: def.selectedPlanId,
      // Sin esto, uriel@admin (billingExempt / adminProAccess) sigue viendo Pro
      // aunque el Plan (dev) diga Básico o Mediano.
      adminProAccess: false,
      billingExempt: false,
    };
    // Simulación limpia del plan base: Mediano/Básico = 1 empresa (sin extras).
    if (override === 'basic' || override === 'normal') {
      result = {
        ...result,
        extraBusinessSlots: 0,
      };
    }
  }
  const devExtraPdv = readDevExtraPdv();
  if (devExtraPdv > 0) {
    const serverExtra = Math.max(0, Math.floor(Number(sub.extraPointOfSaleSlots) || 0));
    result = {
      ...result,
      extraPointOfSaleSlots: Math.min(99, serverExtra + devExtraPdv),
    };
  }
  const devExtraBrands = readDevExtraBrands();
  if (devExtraBrands > 0) {
    const serverExtra = Math.max(0, Math.floor(Number(sub.extraCommercialBrandSlots) || 0));
    result = {
      ...result,
      extraCommercialBrandSlots: Math.min(99, serverExtra + devExtraBrands),
    };
  }
  const overrideAfter = readDevPlanOverride();
  const devExtraBusiness = readDevExtraBusinesses();
  if (
    devExtraBusiness > 0
    && overrideAfter !== 'basic'
    && overrideAfter !== 'normal'
  ) {
    const serverExtra = Math.max(0, Math.floor(Number(sub.extraBusinessSlots) || 0));
    result = {
      ...result,
      extraBusinessSlots: Math.min(99, serverExtra + devExtraBusiness),
    };
  }
  return result;
}

function applyDevPlanOverride(sub: Subscription): Subscription {
  return mergeDevOverrides(sub);
}

function deserializeSubscription(
  subscription?: PersistedBillingSubscription | null,
  options?: { isWorker?: boolean },
): Subscription {
  if (!subscription) {
    if (options?.isWorker) {
      return {
        status: 'subscription_active',
        planName: '',
        selectedPlanId: '',
        cancelAtPeriodEnd: false,
      };
    }
    // Sin suscripción en /me: tratar como pendiente (no trial fantasma).
    return {
      status: 'pending_payment',
      planName: 'Basic',
      selectedPlanId: 'basic',
      cancelAtPeriodEnd: false,
    };
  }

  return {
    status: subscription.status,
    planName: subscription.planName,
    selectedPlanId: subscription.selectedPlanId,
    trialEndsAt: subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : undefined,
    currentPeriodStart: subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart) : undefined,
    currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : undefined,
    gracePeriodEndsAt: subscription.gracePeriodEndsAt ? new Date(subscription.gracePeriodEndsAt) : undefined,
    lastPaymentAt: subscription.lastPaymentAt ? new Date(subscription.lastPaymentAt) : undefined,
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    extraPointOfSaleSlots: subscription.extraPointOfSaleSlots,
    extraCommercialBrandSlots: subscription.extraCommercialBrandSlots,
    extraBusinessSlots: subscription.extraBusinessSlots,
    extraWorkerSlots: subscription.extraWorkerSlots,
    extraTpvTabletSlots: subscription.extraTpvTabletSlots,
    adminProAccess: Boolean(subscription.adminProAccess),
    billingExempt: Boolean(subscription.billingExempt),
    moneiSubscriptionId: subscription.moneiSubscriptionId,
    moneiSubscriptionStatus: subscription.moneiSubscriptionStatus,
  };
}

// ─── App provider ─────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();
  const currentBusiness = useBusinessOptional()?.currentBusiness ?? null;
  /** CRM compraventa/desguace/taller… — no hidratar en delivery/restaurant/etc. */
  const needsCrmBoot =
    Boolean(currentBusiness?.businessType) &&
    (supportsVehicleInventoryModule(currentBusiness?.businessType) ||
      isCompraventaBusinessType(currentBusiness?.businessType));
  const scopeKey = currentBusiness?.business_id
    ? `b:${currentBusiness.business_id}`
    : authUser?.user_id
      ? `u:${authUser.user_id}`
      : 'guest';
  const vehiclesStorageKey = `vertial-vehicles:${scopeKey}`;
  const parkingZonesStorageKey = `vertial-parking-zones:${scopeKey}`;
  const leadsStorageKey = `vertial-leads:${scopeKey}`;
  const clientsStorageKey = `vertial-clients:${scopeKey}`;
  // Inbox personal: siempre por usuario (no por empresa). Si se clavea por business,
  // al cambiar de tienda se recarga/persiste vacío y parece que “se borraron”.
  const notificationsStorageKey = authUser?.user_id
    ? `vertial-notifications:u:${authUser.user_id}`
    : 'vertial-notifications:guest';

  useEffect(() => {
    pruneVertialStorageIfNeeded();
  }, []);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [clientsTotalCount, setClientsTotalCount] = useState(0);
  const [parkingZones, setParkingZones] = useState<ParkingZone[]>(() => []);

  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('vertial-leads:guest');
      if (saved) return JSON.parse(saved).map(deserializeLead);
      return [];
    } catch { return []; }
  });

  const [clients, setClients] = useState<Client[]>(() => {
    try {
      const saved = localStorage.getItem('vertial-clients:guest');
      if (saved) return JSON.parse(saved).map(deserializeClient);
      return [];
    } catch { return []; }
  });

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem('vertial-notifications:guest');
      return saved ? capNotifications(JSON.parse(saved).map(deserializeNotification)) : [];
    } catch {
      return [];
    }
  });
  /** Evita persistir [] antes de la primera carga (eso vaciaba el inbox al arrancar). */
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);

  const [sales, setSales] = useState<Sale[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);

  const [locations, setLocations] = useState<Location[]>([]);

  const [user, setUser] = useState<User | null>(null);

  const [subscription, setSubscription] = useState<Subscription>({
    // Default conservador: no abrir el SaaS antes de sincronizar /me.
    status: 'pending_payment',
    planName: 'Basic',
    selectedPlanId: 'basic',
    cancelAtPeriodEnd: false,
  });

  const [devExtraPdv, setDevExtraPdv] = useState(0);
  const [devExtraBrands, setDevExtraBrands] = useState(0);
  const [devExtraBusiness, setDevExtraBusiness] = useState(0);
  const [devUnlimitedPdv, setDevUnlimitedPdv] = useState(false);
  const [devPlanOverride, setDevPlanOverride] = useState<DevPlan | null>(() => readDevPlanOverride());

  useEffect(() => {
    if (!authUser) {
      setUser(null);
      setSubscription(deserializeSubscription(null));
      setDevPlanOverride(null);
      return;
    }

    setUser({
      id: authUser.user_id,
      name: authUser.fullName || `${authUser.firstName} ${authUser.lastName}`.trim(),
      email: authUser.email,
      role: authUser.role,
    });
    const isWorker = isWorkerAccount(authUser);
    const baseSubscription = deserializeSubscription(authUser.subscription, { isWorker });
    const canUseDevPlanOverride = userCanUseDevPlanOverride(authUser);
    if (canUseDevPlanOverride) {
      // Conservar Plan (dev) / Mi plan simulado: NO forzar Ilimitado ni borrar override.
      const override = readDevPlanOverride();
      const unlimited = readDevUnlimitedPdv();
      setDevExtraPdv(readDevExtraPdv());
      setDevExtraBrands(readDevExtraBrands());
      setDevExtraBusiness(readDevExtraBusinesses());
      setDevPlanOverride(override);
      setDevUnlimitedPdv(unlimited);
      setSubscription(mergeDevOverrides(baseSubscription));
    } else {
      clearDevPlanLocalStorage();
      setSubscription(baseSubscription);
      setDevExtraPdv(0);
      setDevExtraBrands(0);
      setDevExtraBusiness(0);
      setDevUnlimitedPdv(false);
      setDevPlanOverride(null);
    }
  }, [authUser]);

  const refreshDevSubscription = useCallback(() => {
    const base = deserializeSubscription(authUser?.subscription, {
      isWorker: isWorkerAccount(authUser),
    });
    const override = readDevPlanOverride();
    setDevPlanOverride(override);
    setSubscription(mergeDevOverrides(base));
    setDevExtraPdv(readDevExtraPdv());
    setDevExtraBrands(readDevExtraBrands());
    setDevExtraBusiness(readDevExtraBusinesses());
    setDevUnlimitedPdv(readDevUnlimitedPdv());
  }, [authUser?.subscription]);

  const setDevSubscriptionPlan = useCallback((plan: DevPlan | null) => {
    if (!userCanUseDevPlanOverride(authUser)) {
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        if (plan) {
          window.localStorage.setItem(DEV_PLAN_OVERRIDE_KEY, plan);
          window.localStorage.removeItem(DEV_UNLIMITED_PDV_KEY);
        } else clearDevPlanLocalStorage();
      } catch {
        // Storage may be unavailable (private mode); we still update state below.
      }
    }
    if (!plan) {
      setDevExtraPdv(0);
      setDevExtraBrands(0);
      setDevExtraBusiness(0);
      setDevUnlimitedPdv(false);
      setDevPlanOverride(null);
      setSubscription(deserializeSubscription(authUser?.subscription, {
        isWorker: isWorkerAccount(authUser),
      }));
      return;
    }
    setDevPlanOverride(plan);
    setDevUnlimitedPdv(false);
    if (plan === 'basic' || plan === 'normal') {
      try {
        window.localStorage.removeItem(DEV_EXTRA_BUSINESS_KEY);
      } catch {
        // ignore
      }
      setDevExtraBusiness(0);
    }
    refreshDevSubscription();
  }, [authUser, refreshDevSubscription]);

  const enableDevUnlimitedPdv = useCallback(() => {
    if (!userCanUseDevPlanOverride(authUser)) return;
    try {
      window.localStorage.setItem(DEV_UNLIMITED_PDV_KEY, '1');
      window.localStorage.removeItem(DEV_PLAN_OVERRIDE_KEY);
      window.localStorage.removeItem(DEV_EXTRA_PDV_KEY);
    } catch {
      // ignore
    }
    setDevExtraPdv(0);
    setDevPlanOverride(null);
    setDevUnlimitedPdv(true);
    setSubscription(deserializeSubscription(authUser?.subscription));
  }, [authUser]);

  const setDevExtraPdvSlots = useCallback((value: number) => {
    if (!userCanUseDevPlanOverride(authUser)) return;
    const clamped = Math.max(0, Math.min(99, Math.floor(value)));
    try {
      if (clamped > 0) {
        window.localStorage.setItem(DEV_EXTRA_PDV_KEY, String(clamped));
        window.localStorage.removeItem(DEV_UNLIMITED_PDV_KEY);
      } else {
        window.localStorage.removeItem(DEV_EXTRA_PDV_KEY);
      }
    } catch {
      // ignore
    }
    setDevExtraPdv(clamped);
    if (clamped > 0) setDevUnlimitedPdv(false);
    refreshDevSubscription();
  }, [authUser, refreshDevSubscription]);

  const setDevExtraBrandSlots = useCallback((value: number) => {
    if (!userCanUseDevPlanOverride(authUser)) return;
    const clamped = Math.max(0, Math.min(99, Math.floor(value)));
    try {
      if (clamped > 0) {
        window.localStorage.setItem(DEV_EXTRA_BRAND_KEY, String(clamped));
      } else {
        window.localStorage.removeItem(DEV_EXTRA_BRAND_KEY);
      }
    } catch {
      // ignore
    }
    setDevExtraBrands(clamped);
    refreshDevSubscription();
  }, [authUser, refreshDevSubscription]);

  const setDevExtraBusinessSlots = useCallback((value: number) => {
    if (!userCanUseDevPlanOverride(authUser)) return;
    const clamped = Math.max(0, Math.min(99, Math.floor(value)));
    try {
      if (clamped > 0) {
        window.localStorage.setItem(DEV_EXTRA_BUSINESS_KEY, String(clamped));
      } else {
        window.localStorage.removeItem(DEV_EXTRA_BUSINESS_KEY);
      }
    } catch {
      // ignore
    }
    setDevExtraBusiness(clamped);
    refreshDevSubscription();
  }, [authUser, refreshDevSubscription]);

  useEffect(() => {
    if (!authUser?.user_id) {
      setVehicles([]);
      setIsLoadingVehicles(false);
      return;
    }
    if (!needsCrmBoot) {
      setVehicles([]);
      setIsLoadingVehicles(false);
      return;
    }

    let cancelled = false;
    setIsLoadingVehicles(true);

    listVehiclesRequest(authUser.user_id, resolveVehicleListBusinessId(currentBusiness))
      .then((response) => {
        if (cancelled) return;
        setVehicles((response.vehicles || []).map(deserializeVehicle));
        setIsLoadingVehicles(false);
      })
      .catch((error) => {
        console.error('Error loading vehicles from CouchDB:', error);
        try {
          const saved = localStorage.getItem(vehiclesStorageKey);
          if (saved && !cancelled) {
            setVehicles(JSON.parse(saved).map(deserializeVehicle));
          }
        } catch (storageError) {
          console.error('Error loading vehicle cache:', storageError);
        }
        if (!cancelled) setIsLoadingVehicles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.user_id, currentBusiness?.business_id, needsCrmBoot, vehiclesStorageKey]);

  useEffect(() => {
    if (!authUser?.user_id) {
      try {
        const saved = localStorage.getItem('vertial-leads:guest');
        if (saved) {
          setLeads(JSON.parse(saved).map(deserializeLead));
        }
      } catch (storageError) {
        console.error('Error loading guest leads:', storageError);
      }
      return;
    }
    if (!needsCrmBoot) {
      setLeads([]);
      return;
    }

    let cancelled = false;

    listLeadsRequest(authUser.user_id)
      .then((items) => {
        if (!cancelled) {
          setLeads(items);
        }
      })
      .catch((error) => {
        console.error('Error loading leads from CouchDB:', error);
        try {
          const saved = localStorage.getItem(`vertial-leads:${authUser.user_id}`);
          if (saved && !cancelled) {
            setLeads(JSON.parse(saved).map(deserializeLead));
          }
        } catch (storageError) {
          console.error('Error loading lead cache:', storageError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.user_id, needsCrmBoot]);

  useEffect(() => {
    if (!authUser?.user_id) {
      try {
        const saved = localStorage.getItem('vertial-clients:guest');
        if (saved) {
          const guestClients = JSON.parse(saved).map(deserializeClient);
          setClients(guestClients);
          setClientsTotalCount(guestClients.length);
        }
      } catch (storageError) {
        console.error('Error loading guest clients:', storageError);
      }
      setIsLoadingClients(false);
      return;
    }

    // Delivery/food/etc.: no pedir conteo CRM al boot (TPV/CRM lo refrescan al abrir).
    if (!needsCrmBoot) {
      setClients([]);
      setClientsTotalCount(0);
      setIsLoadingClients(false);
      return;
    }

    let cancelled = false;
    setIsLoadingClients(true);

    listClientsPageRequest(
      // Titular: trabajadores ven el mismo total que el dueño (Pau ~6k).
      String((authUser as { invitedBy?: string }).invitedBy || '').trim() || authUser.user_id,
      { limit: 1, skip: 0, lite: true },
    )
      .then(({ meta }) => {
        if (!cancelled) {
          setClients([]);
          setClientsTotalCount(meta.total);
          setIsLoadingClients(false);
        }
      })
      .catch((error) => {
        console.error('Error loading clients from CouchDB:', error);
        try {
          const saved = localStorage.getItem(`vertial-clients:${authUser.user_id}`);
          if (saved && !cancelled) {
            const cached = JSON.parse(saved).map(deserializeClient);
            setClients(cached);
            setClientsTotalCount(cached.length);
          }
        } catch (storageError) {
          console.error('Error loading client cache:', storageError);
        }
        if (!cancelled) setIsLoadingClients(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.user_id, needsCrmBoot]);

  useEffect(() => {
    if (!authUser?.user_id) {
      setNotificationsHydrated(false);
      try {
        const saved = localStorage.getItem('vertial-notifications:guest');
        setNotifications(saved ? capNotifications(JSON.parse(saved).map(deserializeNotification)) : []);
      } catch (storageError) {
        console.error('Error loading guest notifications:', storageError);
        setNotifications([]);
      }
      return;
    }

    let cancelled = false;
    setNotificationsHydrated(false);

    // Restaura caché al instante (por si la API tarda o falla).
    try {
      const cached = localStorage.getItem(notificationsStorageKey);
      if (cached) {
        setNotifications(capNotifications(JSON.parse(cached).map(deserializeNotification)));
      }
    } catch {
      /* ignore */
    }

    listNotificationsRequest(authUser.user_id)
      .then((response) => {
        if (cancelled) return;
        const fromServer = (response.notifications || []).map(deserializeNotification);
        setNotifications((prev) => mergeServerNotificationsPreferringLocalRead(fromServer, prev));
        setNotificationsHydrated(true);
      })
      .catch((error) => {
        console.error('Error loading notifications:', error);
        try {
          const saved = localStorage.getItem(notificationsStorageKey);
          if (saved && !cancelled) {
            setNotifications(capNotifications(JSON.parse(saved).map(deserializeNotification)));
          } else if (!cancelled) {
            setNotifications([]);
          }
        } catch (storageError) {
          console.error('Error loading notification cache:', storageError);
          if (!cancelled) {
            setNotifications([]);
          }
        }
        if (!cancelled) setNotificationsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.user_id, notificationsStorageKey]);

  // ─── Load sales from CouchDB ──────────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.user_id) {
      try {
        const saved = localStorage.getItem('vertial-sales');
        if (saved) setSales(JSON.parse(saved).map(deserializeSale));
      } catch { /* ignore */ }
      return;
    }
    if (!needsCrmBoot) {
      setSales([]);
      return;
    }

    let cancelled = false;
    listSalesRecords()
      .then((records) => {
        if (cancelled) return;
        const mapped: Sale[] = records.map((r: SaleRecord) => ({
          id: r.id,
          _id: r._id,
          _rev: r._rev,
          vehicleId: r.vehicleId,
          clientId: r.clientId,
          salePrice: r.totalPrice,
          downPayment: r.depositPaid,
          financingAmount: r.financingAmount,
          notes: r.notes,
          status: r.stage === 'delivered' || r.stage === 'sold' ? 'completed' :
                  r.stage === 'interested' || r.stage === 'reserved' || r.stage === 'documentation' ? 'pending' : 'pending',
          saleDate: new Date(r.createdAt),
          createdAt: new Date(r.createdAt),
        }));
        setSales(mapped);
      })
      .catch((err) => {
        console.error('Error loading sales from CouchDB:', err);
        try {
          const saved = localStorage.getItem('vertial-sales');
          if (saved && !cancelled) setSales(JSON.parse(saved).map(deserializeSale));
        } catch { /* ignore */ }
      });
    return () => { cancelled = true; };
  }, [authUser?.user_id, needsCrmBoot]);

  // ─── Load documents from CouchDB ─────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.user_id) {
      try {
        const saved = localStorage.getItem('vertial-documents');
        if (saved) setDocuments(JSON.parse(saved).map(deserializeDocument));
      } catch { /* ignore */ }
      return;
    }
    if (!needsCrmBoot) {
      setDocuments([]);
      return;
    }

    let cancelled = false;
    listDocumentsRequest(authUser.user_id)
      .then((records: DocumentRecord[]) => {
        if (cancelled) return;
        const mapped: Document[] = records.map((r) => mapDocumentRecordToApp(r));
        setDocuments(mapped);
      })
      .catch((err) => {
        console.error('Error loading documents from CouchDB:', err);
        try {
          const saved = localStorage.getItem('vertial-documents');
          if (saved && !cancelled) setDocuments(JSON.parse(saved).map(deserializeDocument));
        } catch { /* ignore */ }
      });
    return () => { cancelled = true; };
  }, [authUser?.user_id, needsCrmBoot]);

  // ─── Load parking zones from CouchDB ─────────────────────────────────────
  useEffect(() => {
    if (!authUser?.user_id) {
      try {
        const saved = localStorage.getItem(parkingZonesStorageKey);
        setParkingZones(saved ? JSON.parse(saved) : []);
      } catch {
        setParkingZones([]);
      }
      return;
    }
    if (!needsCrmBoot) {
      setParkingZones([]);
      return;
    }

    let cancelled = false;
    listParkingZonesRequest(authUser.user_id)
      .then((zones) => {
        if (!cancelled) setParkingZones(zones);
      })
      .catch((err) => {
        console.error('Error loading parking zones from CouchDB:', err);
        if (!cancelled) {
          try {
            const saved = localStorage.getItem(parkingZonesStorageKey);
            setParkingZones(saved ? JSON.parse(saved) : []);
          } catch {
            setParkingZones([]);
          }
        }
      });
    return () => { cancelled = true; };
  }, [authUser?.user_id, parkingZonesStorageKey, needsCrmBoot]);

  useEffect(() => {
    if (authUser?.user_id) return;
    persistVertialJsonCache(vehiclesStorageKey, vehicles);
  }, [vehicles, vehiclesStorageKey, authUser?.user_id]);
  useEffect(() => {
    if (authUser?.user_id) return;
    persistVertialJsonCache(leadsStorageKey, leads);
  }, [leads, leadsStorageKey, authUser?.user_id]);
  useEffect(() => {
    if (authUser?.user_id) return;
    persistVertialJsonCache(clientsStorageKey, clients);
  }, [clients, clientsStorageKey, authUser?.user_id]);
  useEffect(() => {
    if (!notificationsHydrated) return;
    persistNotificationsCache(notificationsStorageKey, notifications);
  }, [notifications, notificationsStorageKey, notificationsHydrated]);

  const canAccessFeature = () =>
    Boolean(subscription.billingExempt) ||
    ['trial_active', 'trial_expiring', 'subscription_active'].includes(subscription.status);

  const canPerformCriticalAction = () =>
    Boolean(subscription.billingExempt) ||
    ['trial_active', 'trial_expiring', 'subscription_active'].includes(subscription.status);

  const getAccessRestrictionMessage = (): string | null => {
    if (subscription.billingExempt) return null;
    switch (subscription.status) {
      case 'pending_payment':
        return 'Tu cuenta está pendiente de pago. Realiza la transferencia para activar Vertial.';
      case 'payment_sent':
        return 'Hemos recibido tu aviso de pago. Acceso disponible cuando validemos la transferencia.';
      case 'trial_expired': return 'Tu periodo de prueba ha expirado. Actualiza tu suscripción para continuar.';
      case 'suspended': return 'Cuenta suspendida. Actualiza tu método de pago para restaurar el acceso.';
      case 'payment_failed': return 'Error en el pago. Algunas funciones están limitadas hasta que actualices tu método de pago.';
      case 'grace_period': return 'Periodo de gracia activo. Funcionalidad limitada. Actualiza tu pago para restaurar el acceso completo.';
      default: return null;
    }
  };

  const createNotification = async (notification: {
    level?: NotificationLevel;
    category?: string;
    title: string;
    message: string;
    entityId?: string;
    entityType?: string;
    route?: string;
    metadata?: Record<string, unknown>;
    read?: boolean;
    createdAt?: string;
  }): Promise<AppNotification | null> => {
    if (!authUser?.user_id) {
      const localNotification: AppNotification = {
        id: `notification-${uuidv4()}`,
        user_id: '',
        level: notification.level || 'info',
        category: notification.category || 'system',
        title: notification.title,
        message: notification.message,
        entityId: notification.entityId || '',
        entityType: notification.entityType || '',
        route: notification.route || '',
        metadata: notification.metadata || {},
        read: Boolean(notification.read),
        createdAt: notification.createdAt || new Date().toISOString(),
        updatedAt: notification.createdAt || new Date().toISOString(),
      };
      setNotifications((prev) => capNotifications([localNotification, ...prev]));
      return localNotification;
    }

    try {
      const response = await createNotificationRequest(authUser.user_id, notification);
      if (!response.notification) {
        return null;
      }

      const nextNotification = deserializeNotification(response.notification);
      setNotifications((prev) => {
        const withoutCurrent = prev.filter((item) => item.id !== nextNotification.id);
        return capNotifications([nextNotification, ...withoutCurrent]);
      });
      // Misma señal que SSE: popup/toast en Topbar aunque el stream vaya lento.
      try {
        window.dispatchEvent(new CustomEvent('vertial:notification', { detail: nextNotification }));
      } catch {
        /* ignore */
      }
      return nextNotification;
    } catch {
      return null;
    }
  };

  const markNotificationAsRead = async (id: string, read = true) => {
    if (!id) {
      return;
    }

    const stamp = new Date().toISOString();
    // Optimista: la campanita baja al momento (el API a veces devolvía status 'new' y reabría el badge).
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id
          ? { ...notification, read, updatedAt: stamp }
          : notification,
      ),
    );

    if (!authUser?.user_id) {
      return;
    }

    try {
      const response = await markNotificationReadRequest(authUser.user_id, id, read);
      if (response.notification) {
        const nextNotification = deserializeNotification(response.notification);
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === id
              ? { ...nextNotification, read: Boolean(read) || Boolean(nextNotification.read) }
              : notification,
          ),
        );
      }
    } catch {
      /* ya actualizado en local */
    }
  };

  const markAllNotificationsAsRead = async () => {
    const stamp = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((notification) => ({
        ...notification,
        read: true,
        updatedAt: stamp,
      })),
    );

    if (!authUser?.user_id) {
      return;
    }

    try {
      await markAllNotificationsReadRequest(authUser.user_id);
    } catch { /* local ya limpio */ }
  };

  const trackActivity = (payload: {
    type: string;
    action: string;
    entityId?: string;
    entityLabel?: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!authUser?.user_id) {
      return;
    }

    void logActivityRequest({
      actorUserId: authUser.user_id,
      actorName: authUser.fullName,
      targetUserId: authUser.user_id,
      ...payload,
    }).catch((error) => {
      console.error('Error logging activity:', error);
    });
  };

  const addVehicle = async (vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'daysInStock'>) => {
    if (!authUser?.user_id) {
      const localVehicle: Vehicle = {
        ...vehicle,
        id: `VEH-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        daysInStock: 0,
      };
      setVehicles(prev => [localVehicle, ...prev]);
      return localVehicle;
    }

    const response = await createVehicleRequest(
      authUser.user_id,
      vehicle,
      resolveVehicleListBusinessId(currentBusiness),
    );
    if (response.vehicle) {
      const createdVehicle = deserializeVehicle(response.vehicle);
      setVehicles(prev => [createdVehicle, ...prev]);
      return createdVehicle;
    }
    throw new Error('No se recibió el vehículo creado');
  };

  const addVehiclesBulk = async (nextVehicles: Omit<Vehicle, 'id' | 'createdAt' | 'daysInStock'>[]) => {
    if (nextVehicles.length === 0) {
      return [];
    }

    if (!authUser?.user_id) {
      const createdVehicles = nextVehicles.map((vehicle, index) => ({
        ...vehicle,
        id: `VEH-${Date.now()}-${index}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        daysInStock: 0,
      }));
      setVehicles(prev => [...createdVehicles, ...prev]);
      return createdVehicles;
    }

    const response = await bulkCreateVehiclesRequest(
      authUser.user_id,
      nextVehicles,
      resolveVehicleListBusinessId(currentBusiness),
    );
    const createdVehicles = (response.vehicles || []).map(deserializeVehicle);
    setVehicles(prev => [...createdVehicles, ...prev]);
    return createdVehicles;
  };

  const updateVehicle = async (id: string, updates: Partial<Vehicle>, priceChangeReason?: string, priceChangeReasonCategory?: PriceChangeReasonCategory) => {
    if (!authUser?.user_id) {
      setVehicles(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
      return;
    }

    const response = await updateVehicleRequest(authUser.user_id, id, updates, priceChangeReason, priceChangeReasonCategory);
    if (response.vehicle) {
      const nextVehicle = deserializeVehicle(response.vehicle);
      setVehicles(prev => prev.map(v => v.id === id ? nextVehicle : v));
      return nextVehicle;
    }
  };

  const syncVehicle = (vehicle: Vehicle) => {
    const nextVehicle = deserializeVehicle(vehicle);
    setVehicles((prev) => prev.map((v) => (v.id === nextVehicle.id ? nextVehicle : v)));
  };

  const mergeVehicles = (incoming: Vehicle[]) => {
    const nextItems = incoming.map(deserializeVehicle);
    setVehicles((prev) => {
      const byId = new Map(prev.map((v) => [v.id, v]));
      for (const item of nextItems) byId.set(item.id, item);
      return Array.from(byId.values());
    });
  };

  const archiveVehicle = async (id: string) => {
    if (!authUser?.user_id) {
      setVehicles(prev => prev.map(v => v.id === id ? { ...v, archived: true, archivedAt: new Date().toISOString() } : v));
      return;
    }

    const response = await archiveVehicleRequest(authUser.user_id, id);
    if (response.vehicle) {
      const nextVehicle = deserializeVehicle(response.vehicle);
      setVehicles(prev => prev.map(v => v.id === id ? nextVehicle : v));
      return nextVehicle;
    }
  };

  const restoreVehicle = async (id: string) => {
    if (!authUser?.user_id) {
      setVehicles(prev => prev.map(v => v.id === id
        ? { ...v, archived: false, archivedAt: undefined, status: 'available' as Vehicle['status'] }
        : v));
      return;
    }

    const response = await restoreVehicleRequest(authUser.user_id, id);
    if (response.vehicle) {
      const nextVehicle = deserializeVehicle(response.vehicle);
      setVehicles(prev => prev.map(v => v.id === id ? nextVehicle : v));
      return nextVehicle;
    }
  };

  const deleteVehicle = async (id: string) => {
    if (!authUser?.user_id) {
      setVehicles(prev => prev.filter(v => v.id !== id));
      return;
    }

    await deleteVehicleRequest(authUser.user_id, id);
    setVehicles(prev => prev.filter(v => v.id !== id));
  };

  const addLead = async (lead: Omit<Lead, 'id' | 'createdAt' | 'status'>) => {
    const nextLead: Lead = {
      ...lead,
      id: `lead-${uuidv4()}`,
      type: 'lead',
      user_id: authUser?.user_id || '',
      status: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!authUser?.user_id) {
      setLeads(prev => [nextLead, ...prev]);
      return nextLead;
    }

    const { lead: createdLead } = await createLeadRequest(authUser.user_id, nextLead);
    if (createdLead) {
      setLeads(prev => [createdLead, ...prev]);
      trackActivity({
        type: 'client',
        action: `Añadió lead ${createdLead.name}`,
        entityId: createdLead.id,
        entityLabel: createdLead.name,
      });
      void createNotification({
        level: 'info',
        category: 'lead',
        title: 'Nueva consulta',
        message: createdLead.vehicleInterest
          ? `${createdLead.name} interesado en ${createdLead.vehicleInterest}`
          : `${createdLead.name} ha entrado como nuevo lead`,
        entityId: createdLead.id,
        entityType: 'lead',
        route: `/saas/clients?tab=leads&leadId=${encodeURIComponent(createdLead.id)}`,
      }).catch((error) => {
        console.error('Error creating lead notification:', error);
      });
      return createdLead;
    }
  };

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    const currentLead = leads.find(l => l.id === id);
    if (!currentLead) {
      return;
    }

    const nextLead = { ...currentLead, ...updates, updatedAt: new Date() };

    if (!authUser?.user_id) {
      setLeads(prev => prev.map(l => l.id === id ? nextLead : l));
      return;
    }

    const savedLead = await updateLeadRequest(authUser.user_id, nextLead);
    if (savedLead) {
      setLeads(prev => prev.map(l => l.id === id ? savedLead : l));
      trackActivity({
        type: 'client',
        action: `Actualizó lead ${savedLead.name}`,
        entityId: savedLead.id,
        entityLabel: savedLead.name,
      });
    }
  };

  const deleteLead = async (id: string) => {
    const currentLead = leads.find(l => l.id === id);
    if (!currentLead) {
      return;
    }

    if (!authUser?.user_id) {
      setLeads(prev => prev.filter(l => l.id !== id));
      return;
    }

    await deleteLeadRequest(authUser.user_id, currentLead);
    setLeads(prev => prev.filter(l => l.id !== id));
    trackActivity({
      type: 'client',
      action: `Eliminó lead ${currentLead.name}`,
      entityId: currentLead.id,
      entityLabel: currentLead.name,
    });
  };

  const addClient = async (client: Omit<Client, 'id' | 'createdAt'>) => {
    const apiUserId = String(client.user_id || authUser?.user_id || '').trim();
    const scopeBusinessId = String(
      client.businessId || client.business_id || currentBusiness?.business_id || '',
    ).replace(/^business:/, '').trim();
    const now = new Date();
    const nextClient: Client = {
      ...client,
      id: `client-${uuidv4()}`,
      type: 'client',
      user_id: apiUserId,
      ...(scopeBusinessId
        ? { businessId: scopeBusinessId, business_id: scopeBusinessId }
        : {}),
      consents: client.consents || { dataProcessing: false, commercial: false, thirdParty: false },
      vehiclesPurchased: client.vehiclesPurchased || [],
      vehiclesSold: client.vehiclesSold || [],
      documentsCount: client.documentsCount || 0,
      interactions: client.interactions || [],
      documentsList: client.documentsList || [],
      createdAt: now,
      updatedAt: now,
    };

    if (!apiUserId) {
      setClients(prev => [nextClient, ...prev]);
      return nextClient;
    }

    try {
      const { client: createdClient } = await createClientRequest(apiUserId, nextClient);
      if (!createdClient) {
        throw new Error('El servidor no devolvió el cliente creado');
      }
      setClients((prev) => [createdClient, ...prev].slice(0, 50));
      setClientsTotalCount((n) => n + 1);
      trackActivity({
        type: 'client',
        action: `Añadió cliente ${createdClient.name}`,
        entityId: createdClient.id,
        entityLabel: createdClient.name,
      });
      return createdClient;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('Error al guardar el cliente');
    }
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    const currentClient = clients.find(c => c.id === id);
    if (!currentClient) {
      return;
    }

    const nextClient: Client = {
      ...currentClient,
      ...updates,
      consents: {
        dataProcessing: updates.consents?.dataProcessing ?? currentClient.consents?.dataProcessing ?? false,
        commercial: updates.consents?.commercial ?? currentClient.consents?.commercial ?? false,
        thirdParty: updates.consents?.thirdParty ?? currentClient.consents?.thirdParty ?? false,
      },
      vehiclesPurchased: updates.vehiclesPurchased || currentClient.vehiclesPurchased || [],
      vehiclesSold: updates.vehiclesSold || currentClient.vehiclesSold || [],
      interactions: updates.interactions || currentClient.interactions || [],
      documentsList: updates.documentsList || currentClient.documentsList || [],
      documentsCount:
        updates.documentsCount ??
        updates.documentsList?.length ??
        currentClient.documentsCount ??
        currentClient.documentsList?.length ??
        0,
      updatedAt: new Date(),
    };

    if (!authUser?.user_id) {
      setClients(prev => prev.map(c => c.id === id ? nextClient : c));
      return;
    }

    const savedClient = await updateClientRequest(authUser.user_id, nextClient);
    if (savedClient) {
      setClients(prev => prev.map(c => c.id === id ? savedClient : c));
      trackActivity({
        type: 'client',
        action: `Actualizó ficha de cliente ${savedClient.name}`,
        entityId: savedClient.id,
        entityLabel: savedClient.name,
      });
    }
  };

  const deleteClient = async (id: string) => {
    const currentClient = clients.find(c => c.id === id);

    if (!authUser?.user_id) {
      setClients(prev => prev.filter(c => c.id !== id));
      return;
    }

    await deleteClientRequest(authUser.user_id, currentClient || ({ id } as Client));
    setClients(prev => prev.filter(c => c.id !== id));
    setClientsTotalCount((n) => Math.max(0, n - 1));
    trackActivity({
      type: 'client',
      action: `Eliminó cliente ${currentClient?.name || id}`,
      entityId: id,
      entityLabel: currentClient?.name || id,
    });
  };

  const addSale = async (sale: Omit<Sale, 'id' | 'createdAt' | 'status' | 'saleDate'>) => {
    const vehicle = vehicles.find(v => v.id === sale.vehicleId);
    const client = clients.find(c => c.id === sale.clientId);
    let nextSale: Sale;

    if (authUser?.user_id) {
      try {
        const record = await createSaleInCouch({
          vehicleId: sale.vehicleId,
          vehicleName: vehicle ? `${vehicle.brand} ${vehicle.model}` : sale.vehicleId,
          vehiclePlate: vehicle?.registrationPlate || '',
          vehicleYear: vehicle?.year,
          vehicleMileage: vehicle?.mileage,
          vehicleFuel: vehicle?.fuelType,
          purchasePrice: vehicle?.purchasePrice || 0,
          clientId: sale.clientId,
          clientName: client?.name || sale.clientId,
          clientPhone: client?.phone || '',
          clientEmail: client?.email || '',
          stage: 'reserved',
          totalPrice: sale.salePrice,
          depositPaid: sale.downPayment || 0,
          financingAmount: sale.financingAmount || 0,
          responsible: authUser.fullName || authUser.firstName || 'Sin asignar',
          notes: sale.notes || '',
        });
        nextSale = {
          ...sale,
          id: record.id,
          _id: record._id,
          _rev: record._rev,
          status: 'pending',
          saleDate: new Date(record.createdAt),
          createdAt: new Date(record.createdAt),
        };
      } catch (err) {
        console.error('Error creating sale in CouchDB:', err);
        nextSale = { ...sale, id: `SALE-${Date.now()}`, status: 'pending', saleDate: new Date(), createdAt: new Date() };
      }
    } else {
      nextSale = { ...sale, id: `SALE-${Date.now()}`, status: 'pending', saleDate: new Date(), createdAt: new Date() };
    }

    setSales(prev => [...prev, nextSale]);
    updateVehicle(sale.vehicleId, { status: 'reserved' });
    trackActivity({ type: 'sale', action: `Creó venta ${nextSale.id}`, entityId: nextSale.id, entityLabel: nextSale.id });
    void createNotification({
      level: 'info', category: 'sale', title: 'Venta creada',
      message: `Se ha registrado la operación ${nextSale.id}`,
      entityId: nextSale.id, entityType: 'sale', route: `/saas/sales/${encodeURIComponent(nextSale.id)}`,
    }).catch((error) => { console.error('Error creating sale notification:', error); });
  };

  const updateSale = async (id: string, updates: Partial<Sale>) => {
    setSales(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    trackActivity({
      type: 'sale', action: `Actualizó venta ${id}`, entityId: id, entityLabel: id,
      metadata: { status: updates.status || '' },
    });
    if (updates.status === 'completed') {
      const sale = sales.find(s => s.id === id);
      if (sale) {
        updateVehicle(sale.vehicleId, { status: 'sold', soldAt: new Date() });
        updateLead(sale.clientId, { status: 'won' });
        void createNotification({
          level: 'success', category: 'sale', title: 'Venta completada',
          message: `La venta ${id} se ha marcado como completada`,
          entityId: id, entityType: 'sale', route: `/saas/sales/${encodeURIComponent(id)}`,
        }).catch((error) => { console.error('Error creating completed sale notification:', error); });
      }
    }
    if (updates.status === 'cancelled') {
      const sale = sales.find(s => s.id === id);
      if (sale) updateVehicle(sale.vehicleId, { status: 'available' });
    }
  };

  const deleteSale = async (id: string) => {
    const sale = sales.find(s => s.id === id);
    if (sale && sale.status !== 'completed') updateVehicle(sale.vehicleId, { status: 'available' });
    setSales(prev => prev.filter(s => s.id !== id));
    if (authUser?.user_id && sale?._id) {
      try {
        const fullRecord = { _id: sale._id!, _rev: sale._rev, type: 'sale' as const, id: sale.id } as Parameters<typeof deleteSaleInCouch>[0];
        await deleteSaleInCouch(fullRecord);
      } catch (err) {
        console.error('Error deleting sale from CouchDB:', err);
      }
    }
    trackActivity({ type: 'sale', action: `Eliminó venta ${id}`, entityId: id, entityLabel: id });
  };

  const addDocument = async (document: Omit<Document, 'id' | 'createdAt'>) => {
    let nextDocument: Document;

    if (authUser?.user_id) {
      try {
        const record = await createDocumentRequest(authUser.user_id, {
          user_id: authUser.user_id,
          name: document.name,
          docType: document.type,
          status: document.status,
          relatedTo: document.relatedTo,
          relatedToId: document.relatedToId,
          templateId: document.templateId,
          notes: document.notes,
          expiresAt: document.expiresAt,
        });
        nextDocument = {
          id: record.id,
          _id: record._id,
          _rev: record._rev,
          name: record.name,
          type: record.docType,
          status: record.status,
          relatedTo: record.relatedTo,
          relatedToId: record.relatedToId,
          templateId: record.templateId,
          notes: record.notes,
          expiresAt: record.expiresAt,
          createdAt: new Date(record.createdAt),
        };
      } catch (err) {
        console.error('Error creating document in CouchDB:', err);
        nextDocument = { ...document, id: `DOC-${Date.now()}`, createdAt: new Date() };
      }
    } else {
      nextDocument = { ...document, id: `DOC-${Date.now()}`, createdAt: new Date() };
    }

    setDocuments(prev => [...prev, nextDocument]);
    trackActivity({ type: 'document', action: `Generó documento ${nextDocument.name}`, entityId: nextDocument.id, entityLabel: nextDocument.name });
    void createNotification({
      level: nextDocument.status === 'pending' ? 'warning' : 'info',
      category: 'document',
      title: nextDocument.status === 'pending' ? 'Documento pendiente' : 'Documento generado',
      message: nextDocument.name,
      entityId: nextDocument.id,
      entityType: 'document',
      route: `/saas/documents/${encodeURIComponent(nextDocument.id)}`,
    }).catch((error) => { console.error('Error creating document notification:', error); });
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    const current = documents.find(d => d.id === id);
    const nextDocument = current ? { ...current, ...updates } : null;
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));

    if (authUser?.user_id && nextDocument?._id) {
      try {
        const record: DocumentRecord = {
          _id: nextDocument._id!,
          _rev: nextDocument._rev,
          type: 'document',
          id: nextDocument.id,
          user_id: authUser.user_id,
          name: nextDocument.name,
          docType: nextDocument.type,
          status: nextDocument.status,
          relatedTo: nextDocument.relatedTo,
          relatedToId: nextDocument.relatedToId,
          templateId: nextDocument.templateId,
          notes: nextDocument.notes,
          expiresAt: nextDocument.expiresAt,
          createdAt: nextDocument.createdAt.toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const saved = await updateDocumentRequest(record);
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, _rev: saved._rev } : d));
      } catch (err) {
        console.error('Error updating document in CouchDB:', err);
      }
    }

    trackActivity({ type: 'document', action: `Actualizó documento ${updates.name || id}`, entityId: id, entityLabel: updates.name || id });
    if (updates.status === 'pending' || updates.status === 'signed') {
      void createNotification({
        level: updates.status === 'signed' ? 'success' : 'warning',
        category: 'document',
        title: updates.status === 'signed' ? 'Documento firmado' : 'Documento pendiente',
        message: updates.name || id,
        entityId: id,
        entityType: 'document',
        route: `/saas/documents/${encodeURIComponent(id)}`,
      }).catch((error) => { console.error('Error creating document status notification:', error); });
    }
  };

  const deleteDocument = async (id: string) => {
    const current = documents.find(d => d.id === id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    if (authUser?.user_id && current?._id) {
      try {
        const record: DocumentRecord = {
          _id: current._id!,
          _rev: current._rev,
          type: 'document',
          id: current.id,
          user_id: authUser.user_id,
          name: current.name,
          docType: current.type,
          status: current.status,
          createdAt: current.createdAt.toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await deleteDocumentRequest(record);
      } catch (err) {
        console.error('Error deleting document from CouchDB:', err);
      }
    }
    trackActivity({ type: 'document', action: `Eliminó documento ${current?.name || id}`, entityId: id, entityLabel: current?.name || id });
  };

  const addLocation = (location: Omit<Location, 'id'>) =>
    setLocations(prev => [...prev, { ...location, id: `LOC-${Date.now()}` }]);

  const addParkingZone = (zone: CreateParkingZoneInput) => {
    if (authUser?.user_id) {
      createParkingZoneRequest(authUser.user_id, zone)
        .then((created) => {
          setParkingZones(prev => [...prev, created]);
        })
        .catch((err) => {
          console.error('Error creating parking zone in CouchDB:', err);
          setParkingZones(prev => [...prev, createParkingZone(zone)]);
        });
    } else {
      setParkingZones(prev => [...prev, createParkingZone(zone)]);
    }
  };

  const updateLocation = (id: string, updates: Partial<Location>) =>
    setLocations(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));

  const deleteLocation = (id: string) =>
    setLocations(prev => prev.filter(l => l.id !== id));

  const getStats = () => ({
    totalVehicles: vehicles.length,
    vehiclesAvailable: vehicles.filter(v => v.status === 'available').length,
    vehiclesReserved: vehicles.filter(v => v.status === 'reserved').length,
    vehiclesSold: vehicles.filter(v => v.status === 'sold').length,
    totalLeads: leads.filter(l => l.status !== 'won' && l.status !== 'lost').length,
    activeSales: sales.filter(s => s.status === 'pending').length,
    pendingDocuments: documents.filter(d => d.status === 'pending').length,
    totalStockValue: vehicles.filter(v => v.status === 'available').reduce((sum, v) => sum + v.purchasePrice, 0),
  });

  // ─── RT-01: SSE — actualizaciones en tiempo real ──────────────────────────
  const sseToken = useMemo(() => {
    if (!authUser?.user_id) return null;
    return typeof window !== 'undefined'
      ? localStorage.getItem('vertial_access_token')
      : null;
  }, [authUser?.user_id]);

  const handleSSENotification = useCallback((data: unknown) => {
    const raw = data as AppNotification & { _id?: string };
    const n = { ...raw, id: String(raw?.id || raw?._id || '').trim() } as AppNotification;
    if (!n.id) return;
    setNotifications((prev) => {
      if (prev.some((x) => x.id === n.id)) return prev;
      // Solo avisar a UI (banner / Clockins) cuando es aviso NUEVO, no en refrescos.
      queueMicrotask(() => {
        try {
          window.dispatchEvent(new CustomEvent('vertial:notification', { detail: n }));
        } catch {
          // Silenciado: dispatchEvent no debe romper el flujo de SSE.
        }
      });
      return capNotifications([deserializeNotification(n), ...prev]);
    });
  }, []);

  const handleVehicleUpdated = useCallback((data: unknown) => {
    const v = data as Vehicle;
    if (!v?.id) return;
    setVehicles((prev) =>
      prev.map((x) => (x.id === v.id ? deserializeVehicle(v) : x)),
    );
  }, []);

  const handleLeadCreated = useCallback((data: unknown) => {
    const l = data as Lead;
    if (!l?.id) return;
    setLeads((prev) => {
      if (prev.some((x) => x.id === l.id)) return prev;
      return [deserializeLead(l), ...prev];
    });
  }, []);

  const sseHandlers = useMemo(() => ({
    notification: handleSSENotification,
    vehicle_updated: handleVehicleUpdated,
    lead_created: handleLeadCreated,
  }), [handleSSENotification, handleVehicleUpdated, handleLeadCreated]);

  useSSE({
    userId: authUser?.user_id ?? null,
    token: sseToken,
    businessId: currentBusiness?.business_id ?? null,
    handlers: sseHandlers,
    enabled: Boolean(authUser?.user_id),
  });

  // Push nativo/web: CEO y trabajador (nómina, contrato, avisos personales).
  const pushUserId = authUser?.user_id ?? null;
  usePushNotifications({
    userId: pushUserId,
    token: pushUserId ? sseToken : null,
  });
  useNativePushNotifications({
    userId: pushUserId,
    token: pushUserId ? sseToken : null,
  });

  const refreshClients = useCallback(async () => {
    if (!authUser?.user_id) return;
    try {
      const dataUserId =
        String((authUser as { invitedBy?: string }).invitedBy || '').trim() || authUser.user_id;
      const { meta } = await listClientsPageRequest(dataUserId, { limit: 1, skip: 0, lite: true });
      setClientsTotalCount(meta.total);
    } catch {
      // Silenciado: el total actual permanece como fallback.
    }
  }, [authUser]);

  const refreshLeads = useCallback(async () => {
    if (!authUser?.user_id) return;
    try {
      const fresh = await listLeadsRequest(authUser.user_id);
      setLeads(fresh);
    } catch {
      // Silenciado: la lista actual permanece como fallback.
    }
  }, [authUser?.user_id]);

  const refreshDocuments = useCallback(async () => {
    if (!authUser?.user_id) return;
    try {
      const records = await listDocumentsRequest(authUser.user_id);
      setDocuments(records.map((r) => mapDocumentRecordToApp(r)));
    } catch {
      // Silenciado: la lista actual permanece como fallback.
    }
  }, [authUser?.user_id]);

  const value: AppContextType = {
    vehicles, isLoadingVehicles, isLoadingClients, clientsTotalCount, parkingZones, leads, clients, notifications, sales, documents, locations, user, subscription,
    setDevSubscriptionPlan,
    enableDevUnlimitedPdv,
    devPlanOverride,
    devUnlimitedPdv,
    devExtraPdv,
    devExtraBrands,
    devExtraBusiness,
    setDevExtraPdvSlots,
    setDevExtraBrandSlots,
    setDevExtraBusinessSlots,
    canAccessFeature, canPerformCriticalAction, getAccessRestrictionMessage,
    addVehicle, addVehiclesBulk, updateVehicle, syncVehicle, mergeVehicles, archiveVehicle, restoreVehicle, deleteVehicle,
    addLead, updateLead, deleteLead, refreshLeads,
    addClient, updateClient, deleteClient, refreshClients,
    createNotification, markNotificationAsRead, markAllNotificationsAsRead,
    addSale, updateSale, deleteSale,
    addDocument, updateDocument, deleteDocument, refreshDocuments,
    addLocation, addParkingZone, updateLocation, deleteLocation,
    getStats,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      <PushPermissionGate userId={pushUserId} />
    </AppContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useApp(): AppContextType {
  return useContext(AppContext);
}