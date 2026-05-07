import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useModalClose } from '../../hooks/useModalClose';
import { v4 as uuidv4 } from 'uuid';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useApp } from '../../context/AppContext';
import { useBusiness } from '../../context/BusinessContext';
import type { ConsentHistoryEntry, GdprRecord, LeadInteraction } from '../../context/AppContext';
import { computeLeadScore, getScoreColor, getScoreLabel } from '../../lib/leadScoring';
import { InteractionTimeline, type TimelineEvent } from '../../components/saas/InteractionTimeline';
import { useAuth } from '../../context/AuthContext';
import { SAAS__CreateContractModal } from '../../components/design-system/SAAS__CreateContractModal';
import { AddLeadModal } from '../../components/saas/AddLeadModal';
import { ConfirmDestroyModal } from '../../components/saas/ConfirmDestroyModal';
import { LEAD_STATUS_TOKEN, type LeadStatus } from '../../components/saas/DesignTokens';
import { listUsersRequest, getAuthHeaders, type AuthUser } from '../../lib/authApi';
import { getDniOrNieError } from '../../lib/dniCifValidator';
import { sendAppointmentReminderRequest } from '../../lib/crmApi';
import { getApiBase } from '../../lib/apiBase';

async function generatePortalLinkRequest(userId: string, clientId: string): Promise<string | null> {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/portal-token`, {
      method: 'POST', headers,
    });
    const data = await res.json();
    if (!data.ok) return null;
    // Build frontend portal URL
    return `${window.location.origin}/portal/${encodeURIComponent(data.token)}`;
  } catch { return null; }
}
function getClientApiBase(): string {
  return getApiBase();
}

function getClientApiHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vertial_access_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function fetchClientSummary(userId: string, clientId: string): Promise<{ summary: ClientSummary } | null> {
  try {
    const res = await fetch(`${getClientApiBase()}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}`, { headers: getClientApiHeaders() });
    const data = await res.json();
    return data.ok ? data : null;
  } catch { return null; }
}

async function fetchClientPromotions(userId: string, clientId: string): Promise<ClientPromotion[]> {
  try {
    const res = await fetch(`${getClientApiBase()}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/promotions`, { headers: getClientApiHeaders() });
    const data = await res.json();
    return data.ok ? (data.promotions || []) : [];
  } catch { return []; }
}

async function fetchClientActivity(userId: string, clientId: string): Promise<ClientActivityItem[]> {
  try {
    const res = await fetch(`${getClientApiBase()}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/activity`, { headers: getClientApiHeaders() });
    const data = await res.json();
    return data.ok ? (data.activities || []) : [];
  } catch { return []; }
}

async function saveClientContacts(userId: string, clientId: string, contacts: ContactPerson[]): Promise<ContactPerson[] | null> {
  try {
    const res = await fetch(`${getClientApiBase()}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/contacts`, {
      method: 'PUT', headers: getClientApiHeaders(), body: JSON.stringify({ contacts }),
    });
    const data = await res.json();
    return data.ok ? (data.contacts || contacts) : null;
  } catch { return null; }
}

async function createClientPromotionRequest(userId: string, clientId: string, promotion: Record<string, unknown>): Promise<ClientPromotion | null> {
  try {
    const res = await fetch(`${getClientApiBase()}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/promotions`, {
      method: 'POST', headers: getClientApiHeaders(), body: JSON.stringify({ promotion }),
    });
    const data = await res.json();
    return data.ok ? data.promotion : null;
  } catch { return null; }
}

async function toggleClientPromotionRequest(userId: string, clientId: string, promo: ClientPromotion): Promise<ClientPromotion | null> {
  try {
    const newEstado = promo.estado === 'activa' ? 'inactiva' : 'activa';
    const res = await fetch(`${getClientApiBase()}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/promotions/${encodeURIComponent(promo.id)}`, {
      method: 'PUT', headers: getClientApiHeaders(), body: JSON.stringify({ promotion: { estado: newEstado } }),
    });
    const data = await res.json();
    return data.ok ? data.promotion : null;
  } catch { return null; }
}

async function deleteClientPromotionRequest(userId: string, clientId: string, promotionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getClientApiBase()}/api/clients/${encodeURIComponent(userId)}/${encodeURIComponent(clientId)}/promotions/${encodeURIComponent(promotionId)}`, {
      method: 'DELETE', headers: getClientApiHeaders(),
    });
    const data = await res.json();
    return data.ok;
  } catch { return false; }
}

import { ClientCLVCard } from '../../components/saas/ClientCLVCard';
import { ExternalLink, Link2 } from 'lucide-react';
import {
  ArrowLeft, User, Mail, Phone, MapPin, FileText, Car,
  Calendar, Edit2, CheckCircle, XCircle, MessageSquare,
  Clock, TrendingUp, Pencil, UserPlus, Tag, X, Plus,
  Shield, AlertTriangle, Download, Trash2, History, Activity, Bell,
  Upload, FolderOpen, Eye, FileCheck, Receipt, IdCard, FolderClosed, ChevronRight,
  BarChart3, Database, Users, Megaphone, Globe, Building2, UserCircle,
  Hash, Percent, Gift, ToggleLeft, ToggleRight, ClipboardList, PenLine, Send,
  ShoppingBag,
} from 'lucide-react';
import { getClientQuotesRequest, type ClientQuote } from '../../lib/crmApi';
import { listClientInvoicesRequest, type ClientInvoiceRecord } from '../../lib/clientInvoicesApi';
import { SignatureRequestModal } from '../../components/saas/SignatureRequestModal';
import { SignaturePanel } from '../../components/saas/SignaturePanel';

interface ContactPerson {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  notes: string;
}

interface ClientAddress {
  id: string;
  label: string;
  street: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
  isPrimary: boolean;
}

interface SocialLink {
  id: string;
  name: string;
  url: string;
}

interface ClientPromotion {
  id: string;
  nombre: string;
  tipo: string;
  descuento: number | null;
  codigo: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  usosRestantes: number | null;
  descripcion: string;
  createdAt: string;
}

interface ClientActivityItem {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  fecha: string;
  referencia?: string;
  monto?: number;
  estado?: string;
  autor?: string;
}

interface ClientSummary {
  totalInvoiced: number;
  totalOrders: number;
  avgTicket: number;
  lastPurchase: string | null;
}

interface Client {
  id: string;
  name: string;
  dni: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  postalCode?: string;
  status: 'active' | 'inactive';
  responsible: string;
  createdAt: string;
  clientType?: 'particular' | 'empresa';
  legalName?: string;
  fiscalId?: string;
  consents: {
    dataProcessing: boolean;
    commercial: boolean;
    thirdParty: boolean;
  };
  notes?: string;
  vehiclesPurchased?: string[];
  vehiclesSold?: string[];
  documentsCount?: number;
  interactions?: Interaction[];
  documentsList?: Array<{ id: string; name: string; date: string; status: string }>;
  contacts?: ContactPerson[];
  addresses?: ClientAddress[];
  socialLinks?: SocialLink[];
}

interface Interaction {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'note';
  title: string;
  description: string;
  date: string;
  user: string;
}

export function ClientDetail() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id } = useParams();
  const { vehicles, clients, leads, updateClient, updateLead, deleteClient } = useApp();
  const { currentBusiness } = useBusiness();
  const { user: authUser } = useAuth();
  const isDeliveryBusiness = currentBusiness?.businessType === 'delivery';
  const [activeTab, setActiveTab] = useState('resumen');
  const [showCreateContractModal, setShowCreateContractModal] = useState(false);
  const [showDeleteClientModal, setShowDeleteClientModal] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [generatingPortalLink, setGeneratingPortalLink] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [portalLinkCopied, setPortalLinkCopied] = useState(false);
  const [portalLinkError, setPortalLinkError] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [consentMethod, setConsentMethod] = useState<ConsentHistoryEntry['method']>('presential');
  const [editForm, setEditForm] = useState({
    name: '',
    dni: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    responsible: '',
    notes: '',
    referralCode: '',
    status: 'active' as Client['status'],
  });
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [interactionForm, setInteractionForm] = useState<Interaction>({
    id: '',
    type: 'note',
    title: '',
    description: '',
    date: '',
    user: '',
  });
  const [interactionFormError, setInteractionFormError] = useState<string | null>(null);
  const [documentForm, setDocumentForm] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    status: 'Pendiente',
    category: 'otros',
  });
  const [docCategoryFilter, setDocCategoryFilter] = useState<string>('all');
  const [previewDoc, setPreviewDoc] = useState<{ id: string; name: string; date: string; status: string; category?: string; content?: string } | null>(null);
  useModalClose(!!previewDoc, () => setPreviewDoc(null));
  const [signatureDoc, setSignatureDoc] = useState<{ id: string; name: string; fileUrl?: string; mimeType?: string; fileSize?: number } | null>(null);
  const [platformUsers, setPlatformUsers] = useState<AuthUser[]>([]);

  // New tab states
  const [clientSummary, setClientSummary] = useState<ClientSummary | null>(null);
  const [clientInvoices, setClientInvoices] = useState<ClientInvoiceRecord[]>([]);
  const [clientPromotions, setClientPromotions] = useState<ClientPromotion[]>([]);
  const [clientActivities, setClientActivities] = useState<ClientActivityItem[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingPromotions, setLoadingPromotions] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<ContactPerson>({ id: '', name: '', role: '', email: '', phone: '', notes: '' });
  const [showPromotionForm, setShowPromotionForm] = useState(false);
  const [promotionForm, setPromotionForm] = useState({
    nombre: '', tipo: 'descuento', descuento: '', codigo: '',
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: new Date().toISOString().split('T')[0],
    descripcion: '',
  });
  const [clientQuotes, setClientQuotes] = useState<ClientQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  useEffect(() => {
    listUsersRequest()
      .then((res) => {
        if (res.users) {
          setPlatformUsers(res.users);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!authUser?.user_id || !id) return;
    const userId = authUser.user_id;

    if (activeTab === 'resumen' && !clientSummary && !loadingSummary) {
      setLoadingSummary(true);
      fetchClientSummary(userId, id).then((data) => {
        if (data?.summary) setClientSummary(data.summary);
      }).finally(() => setLoadingSummary(false));
    }
    if (activeTab === 'facturas' && clientInvoices.length === 0 && !loadingInvoices) {
      setLoadingInvoices(true);
      listClientInvoicesRequest(userId).then((all) => {
        setClientInvoices(all.filter((inv) => inv.clientId === id));
      }).finally(() => setLoadingInvoices(false));
    }
    if (activeTab === 'promociones' && clientPromotions.length === 0 && !loadingPromotions) {
      setLoadingPromotions(true);
      fetchClientPromotions(userId, id).then(setClientPromotions).finally(() => setLoadingPromotions(false));
    }
    if (activeTab === 'actividad' && clientActivities.length === 0 && !loadingActivities) {
      setLoadingActivities(true);
      fetchClientActivity(userId, id).then(setClientActivities).finally(() => setLoadingActivities(false));
    }
    if (activeTab === 'presupuestos' && clientQuotes.length === 0 && !loadingQuotes) {
      setLoadingQuotes(true);
      getClientQuotesRequest(userId, id).then(setClientQuotes).finally(() => setLoadingQuotes(false));
    }
  }, [activeTab, authUser?.user_id, id]);

  const client = useMemo<Client | null>(() => {
    const found = clients.find((item) => item.id === id);
    if (!found) {
      return null;
    }

    return {
      id: found.id,
      name: found.name,
      dni: found.dni || '',
      phone: found.phone,
      email: found.email,
      address: found.address || '',
      city: found.city || '',
      postalCode: found.postalCode || '',
      status: found.status,
      responsible: found.responsible || 'Sin asignar',
      createdAt: found.createdAt instanceof Date ? found.createdAt.toISOString() : String(found.createdAt),
      clientType: (found as any).clientType || 'particular',
      legalName: (found as any).legalName || '',
      fiscalId: (found as any).fiscalId || '',
      consents: found.consents || {
        dataProcessing: false,
        commercial: false,
        thirdParty: false,
      },
      notes: found.notes || '',
      vehiclesPurchased: found.vehiclesPurchased || [],
      vehiclesSold: found.vehiclesSold || [],
      documentsCount: found.documentsCount || found.documentsList?.length || 0,
      interactions: found.interactions || [],
      documentsList: found.documentsList || [],
      contacts: (found as any).contacts || [],
      addresses: (found as any).addresses || [],
      socialLinks: (found as any).socialLinks || [],
    };
  }, [clients, id]);

  const interactions = useMemo<Interaction[]>(() => client?.interactions || [], [client]);
  const documents = useMemo(() => client?.documentsList || [], [client]);

  const lead = useMemo(() => leads.find((l) => l.id === id) ?? null, [leads, id]);

  if (!client && lead) {
    const statusToken = LEAD_STATUS_TOKEN[lead.status as LeadStatus];
    const vehicleName = (() => {
      if (!lead.interestedVehicle) return lead.vehicleInterest || '';
      const v = vehicles.find((veh) => veh.id === lead.interestedVehicle);
      return v ? `${v.brand} ${v.model} (${v.year})` : lead.vehicleInterest || '';
    })();

    const sourceLabels: Record<string, string> = {
      web: 'Página web', phone: 'Llamada telefónica', web_form: 'Formulario web',
      inPerson: 'Visita presencial', whatsapp: 'WhatsApp', referral: 'Recomendación',
    };

    const scoreBreakdown = computeLeadScore(lead);
    const leadInteractions: LeadInteraction[] = lead.interactions || [];

    return (
      <Layout title={lead.name} subtitle={t('crm.leadDetail')}>
        <div className="space-y-6">
          <button
            onClick={() => navigate('/saas/crm/clientes')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a leads
          </button>

          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl p-6 sm:p-8 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold">{lead.name}</h1>
                  {statusToken && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 border border-white/30 text-white whitespace-nowrap">
                      {statusToken.label}
                    </span>
                  )}
                  {/* Score badge */}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${getScoreColor(scoreBreakdown.total)}`}>
                    <TrendingUp className="w-3 h-3" />
                    {scoreBreakdown.total} — {getScoreLabel(scoreBreakdown.total)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-violet-100 text-sm">
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
                      <Phone className="w-4 h-4" />
                      {lead.phone}
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
                      <Mail className="w-4 h-4" />
                      {lead.email}
                    </a>
                  )}
                </div>
                {/* Tags */}
                <LeadTagsManager lead={lead} updateLead={updateLead} />
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                {lead.status === 'appointment' && lead.email && (
                  <SendReminderButton lead={lead} />
                )}
                <button
                  onClick={() => setShowEditLeadModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-violet-50 text-violet-700 rounded-xl font-semibold transition-colors text-sm"
                >
                  <Pencil className="w-4 h-4" />
                  Editar
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <LeadDetailTabs
            lead={lead}
            vehicleName={vehicleName}
            sourceLabels={sourceLabels}
            interactions={leadInteractions}
            scoreBreakdown={scoreBreakdown}
            updateLead={updateLead}
            authUser={authUser}
          />
        </div>

        {showEditLeadModal && (
          <AddLeadModal
            onClose={() => setShowEditLeadModal(false)}
            leadToEdit={lead}
          />
        )}
      </Layout>
    );
  }

  if (!client) {
    return (
      <Layout title={t('common.notFound')} subtitle="">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No encontrado</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">El registro que buscas no existe.</p>
          <button
            onClick={() => navigate('/saas/crm/clientes')}
            className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-medium transition-colors"
          >
            Volver a clientes
          </button>
        </div>
      </Layout>
    );
  }

  const tabsConfig = [
    { id: 'resumen', label: 'Resumen', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'datos', label: 'Datos', icon: <Database className="w-4 h-4" /> },
    { id: 'contactos', label: 'Contactos', icon: <Users className="w-4 h-4" />, count: client.contacts?.length || 0 },
    { id: 'presupuestos', label: 'Presupuestos', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'facturas', label: 'Facturas', icon: <Receipt className="w-4 h-4" /> },
    { id: 'promociones', label: 'Promociones', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'actividad', label: 'Actividad', icon: <Activity className="w-4 h-4" /> },
    { id: 'documents', label: 'Documentos', icon: <FileText className="w-4 h-4" />, count: client.documentsCount },
    { id: 'gdpr', label: 'RGPD', icon: <Shield className="w-4 h-4" /> },
  ];

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      case 'meeting': return <Calendar className="w-4 h-4" />;
      case 'note': return <MessageSquare className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getInteractionColor = (type: string) => {
    switch (type) {
      case 'call': return 'bg-green-100 text-green-700';
      case 'email': return 'bg-blue-100 text-blue-700';
      case 'meeting': return 'bg-purple-100 text-purple-700';
      case 'note': return 'bg-amber-100 text-amber-700';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  useEffect(() => {
    if (!client) {
      return;
    }

    setEditForm({
      name: client.name,
      dni: client.dni,
      phone: client.phone,
      email: client.email,
      address: client.address || '',
      city: client.city || '',
      postalCode: client.postalCode || '',
      responsible: client.responsible,
      notes: client.notes || '',
      referralCode: (client as Record<string, unknown>).referralCode as string || '',
      status: client.status,
    });
  }, [client]);

  const handleSaveClient = async () => {
    if (!client) {
      return;
    }

    if (editForm.dni.trim()) {
      const dniErr = getDniOrNieError(editForm.dni);
      if (dniErr) {
        setEditFormErrors((prev) => ({ ...prev, dni: dniErr }));
        return;
      }
    }

    setEditFormErrors({});
    await updateClient(client.id, {
      name: editForm.name,
      dni: editForm.dni,
      phone: editForm.phone,
      email: editForm.email,
      address: editForm.address,
      city: editForm.city,
      postalCode: editForm.postalCode,
      responsible: editForm.responsible,
      notes: editForm.notes,
      referralCode: editForm.referralCode,
      status: editForm.status,
    });
    setIsEditingInfo(false);
  };

  const handleAddInteraction = async () => {
    if (!client) {
      return;
    }

    const description = interactionForm.description.trim();
    const title = interactionForm.title.trim();

    if (!description) {
      setInteractionFormError('Añade una descripción para guardar la interacción.');
      return;
    }

    if (!title && interactionForm.type !== 'note') {
      setInteractionFormError('Añade un título para guardar la interacción.');
      return;
    }

    const computedTitle = title || (description.length > 60 ? `${description.slice(0, 60)}...` : description);

    const nextInteraction: Interaction = {
      id: `interaction-${uuidv4()}`,
      type: interactionForm.type,
      title: computedTitle,
      description,
      date: interactionForm.date || new Date().toISOString(),
      user: interactionForm.user.trim() || client.responsible,
    };

    await updateClient(client.id, {
      interactions: [nextInteraction, ...(client.interactions || [])],
    });

    setInteractionForm({
      id: '',
      type: 'note',
      title: '',
      description: '',
      date: '',
      user: '',
    });
    setInteractionFormError(null);
    setShowInteractionForm(false);
  };

  const handleAddDocument = async () => {
    if (!client || !documentForm.name.trim()) {
      return;
    }

    const nextDocuments = [
      {
        id: `document-${uuidv4()}`,
        name: documentForm.name.trim(),
        date: documentForm.date,
        status: documentForm.status,
        category: documentForm.category,
      },
      ...(client.documentsList || []),
    ];

    await updateClient(client.id, {
      documentsList: nextDocuments,
      documentsCount: nextDocuments.length,
    });

    setDocumentForm({
      name: '',
      date: new Date().toISOString().split('T')[0],
      status: 'Pendiente',
      category: 'otros',
    });
    setShowDocumentForm(false);
  };

  const handleCreateContract = () => {
    setShowCreateContractModal(true);
  };

  const renderInfoTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Datos personales</h3>
          <button
            onClick={() => setIsEditingInfo((value) => !value)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {isEditingInfo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Nombre completo"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
              <div>
                <input
                  value={editForm.dni}
                  onChange={(e) => {
                    const upper = e.target.value.toUpperCase();
                    setEditForm((prev) => ({ ...prev, dni: upper }));
                    setEditFormErrors((prev) => ({ ...prev, dni: getDniOrNieError(upper) ?? '' }));
                  }}
                  placeholder="DNI/NIE"
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none font-mono transition-colors ${
                    editFormErrors.dni
                      ? 'border-red-300 focus:border-red-400'
                      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
                  }`}
                />
                {editFormErrors.dni && (
                  <p className="text-xs text-red-500 mt-1">{editFormErrors.dni}</p>
                )}
              </div>
              <input
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Teléfono"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
              <input
                value={editForm.city}
                onChange={(e) => setEditForm((prev) => ({ ...prev, city: e.target.value }))}
                placeholder="Ciudad"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
              <input
                value={editForm.postalCode}
                onChange={(e) => setEditForm((prev) => ({ ...prev, postalCode: e.target.value }))}
                placeholder="Código postal"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
              <select
                value={editForm.responsible}
                onChange={(e) => setEditForm((prev) => ({ ...prev, responsible: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800"
              >
                <option value="">Seleccionar responsable</option>
                {platformUsers.map((user) => (
                  <option key={user.id} value={user.fullName}>
                    {user.fullName}{user.employment?.position ? ` — ${user.employment.position}` : ''}
                  </option>
                ))}
              </select>
              <select
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, status: e.target.value as Client['status'] }))
                }
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800"
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
            <input
              value={editForm.address}
              onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Dirección"
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
            />
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Código de referido (afiliado)</label>
              <input
                value={editForm.referralCode}
                onChange={(e) => setEditForm((prev) => ({ ...prev, referralCode: e.target.value.toUpperCase() }))}
                placeholder="Ej: REF-A7K2N3"
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none font-mono tracking-wider"
              />
            </div>
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notas"
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditingInfo(false)}
                className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => { void handleSaveClient(); }}
                className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre completo</label>
              <div className="text-gray-900 dark:text-gray-100 font-semibold">{client.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">DNI/NIE</label>
              <div className="text-gray-900 dark:text-gray-100 font-mono">{client.dni}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
              <div className="text-gray-900 dark:text-gray-100">{client.phone}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
              <div className="text-gray-900 dark:text-gray-100">{client.email}</div>
            </div>
            {client.address && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Dirección</label>
                <div className="text-gray-900 dark:text-gray-100">{client.address}</div>
              </div>
            )}
            {(client.city || client.postalCode) && (
              <>
                {client.city && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Ciudad</label>
                    <div className="text-gray-900 dark:text-gray-100">{client.city}</div>
                  </div>
                )}
                {client.postalCode && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Código postal</label>
                    <div className="text-gray-900 dark:text-gray-100">{client.postalCode}</div>
                  </div>
                )}
              </>
            )}
            {(client as Record<string, unknown>).referralCode && (
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Código de referido</label>
                <div className="text-amber-700 dark:text-amber-400 font-mono font-semibold">{String((client as Record<string, unknown>).referralCode)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Consents */}
      <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6">Consentimientos</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-3">
              {client.consents.dataProcessing ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">Tratamiento de datos</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Consentimiento para procesar información personal</div>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              client.consents.dataProcessing
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {client.consents.dataProcessing ? 'Aceptado' : 'Rechazado'}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-3">
              {client.consents.commercial ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">Comunicaciones comerciales</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Envío de ofertas y novedades</div>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              client.consents.commercial
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {client.consents.commercial ? 'Aceptado' : 'Rechazado'}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-3">
              {client.consents.thirdParty ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">Cesión a terceros</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Compartir datos con partners</div>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              client.consents.thirdParty
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {client.consents.thirdParty ? 'Aceptado' : 'Rechazado'}
            </span>
          </div>
        </div>
      </div>

      {client.notes && (
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Notas</h3>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{client.notes}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Responsable</label>
            <div className="text-gray-900 dark:text-gray-100 font-semibold">{client.responsible}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente desde</label>
            <div className="text-gray-900 dark:text-gray-100">{new Date(client.createdAt).toLocaleDateString('es-ES')}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInteractionsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {interactions.length} interacciones registradas
        </div>
        <button
          onClick={() => {
            setInteractionFormError(null);
            setShowInteractionForm((value) => !value);
          }}
          className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-medium transition-colors"
        >
          + Añadir nota
        </button>
      </div>

      {showInteractionForm && (
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={interactionForm.type}
              onChange={(e) =>
                setInteractionForm((prev) => ({
                  ...prev,
                  type: e.target.value as Interaction['type'],
                }))
              }
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800"
            >
              <option value="note">Nota</option>
              <option value="call">Llamada</option>
              <option value="email">Email</option>
              <option value="meeting">Reunión</option>
            </select>
            <input
              value={interactionForm.user}
              onChange={(e) => {
                setInteractionFormError(null);
                setInteractionForm((prev) => ({ ...prev, user: e.target.value }));
              }}
              placeholder="Usuario responsable"
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
            />
            <input
              value={interactionForm.title}
              onChange={(e) => {
                setInteractionFormError(null);
                setInteractionForm((prev) => ({ ...prev, title: e.target.value }));
              }}
              placeholder="Título"
              className="md:col-span-2 w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
            />
            <textarea
              value={interactionForm.description}
              onChange={(e) => {
                setInteractionFormError(null);
                setInteractionForm((prev) => ({ ...prev, description: e.target.value }));
              }}
              placeholder="Descripción"
              rows={3}
              className="md:col-span-2 w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>
          {interactionFormError && (
            <p className="text-sm text-red-600 dark:text-red-400">{interactionFormError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setShowInteractionForm(false)}
              className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Cancelar
            </button>
            <button
              onClick={() => { void handleAddInteraction(); }}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
            >
              Guardar interacción
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="space-y-6">
          {interactions.length === 0 && (
            <div className="text-center py-10 text-sm text-gray-400 dark:text-gray-500">
              Todavía no hay interacciones registradas.
            </div>
          )}
          {interactions.map((interaction, index) => (
            <div key={interaction.id} className="relative flex gap-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getInteractionColor(interaction.type)}`}>
                {getInteractionIcon(interaction.type)}
              </div>

              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">{interaction.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{interaction.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{interaction.user}</span>
                  <span>•</span>
                  <span>{new Date(interaction.date).toLocaleString('es-ES')}</span>
                </div>
              </div>

              {index < interactions.length - 1 && (
                <div className="absolute left-[20px] top-10 w-0.5 h-full bg-gray-200" style={{ marginTop: '2.5rem' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── RESUMEN TAB ──────────────────────────────────────────────────────────

  const renderResumenTab = () => {
    if (loadingSummary) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-3" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      );
    }
    const summary = clientSummary;
    return (
      <div className="space-y-6">
        {isDeliveryBusiness && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/35">
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Pedido desde esta ficha</p>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-300 mt-0.5">
                Abre el TPV rápido con {client.name} ya seleccionado (tipo de envío y productos en el TPV).
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/saas/vertical/delivery/tpv?clientId=${encodeURIComponent(client.id)}`)}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              <ShoppingBag className="w-4 h-4" />
              Nuevo pedido delivery
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total facturado</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {summary ? `${summary.totalInvoiced.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €` : '—'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <Hash className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pedidos</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {summary ? summary.totalOrders : '—'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-violet-600" />
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ticket medio</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {summary ? `${summary.avgTicket.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €` : '—'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Última compra</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {summary?.lastPurchase ? new Date(summary.lastPurchase).toLocaleDateString('es-ES') : '—'}
            </p>
          </div>
        </div>

        {/* CLV Card */}
        {authUser?.user_id && client.id && (
          <ClientCLVCard userId={authUser.user_id} clientId={client.id} />
        )}
      </div>
    );
  };

  // ─── DATOS TAB ────────────────────────────────────────────────────────────

  const renderDatosTab = () => (
    <div className="space-y-6">
      {/* Tipo de cliente y datos principales */}
      <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            {client.clientType === 'empresa' ? <Building2 className="w-5 h-5 text-blue-600" /> : <UserCircle className="w-5 h-5 text-violet-600" />}
            {client.clientType === 'empresa' ? 'Empresa' : 'Particular'}
          </h3>
          <button
            onClick={() => setIsEditingInfo((v) => !v)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {isEditingInfo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre completo" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none" />
              <div>
                <input value={editForm.dni} onChange={(e) => { const upper = e.target.value.toUpperCase(); setEditForm((p) => ({ ...p, dni: upper })); setEditFormErrors((p) => ({ ...p, dni: getDniOrNieError(upper) ?? '' })); }} placeholder="DNI/NIE/CIF" className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none font-mono transition-colors ${editFormErrors.dni ? 'border-red-300 focus:border-red-400' : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'}`} />
                {editFormErrors.dni && <p className="text-xs text-red-500 mt-1">{editFormErrors.dni}</p>}
              </div>
              <input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Teléfono" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none" />
              <input type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none" />
              <select value={editForm.responsible} onChange={(e) => setEditForm((p) => ({ ...p, responsible: e.target.value }))} className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800">
                <option value="">Seleccionar responsable</option>
                {platformUsers.map((user) => (<option key={user.id} value={user.fullName}>{user.fullName}{user.employment?.position ? ` — ${user.employment.position}` : ''}</option>))}
              </select>
              <select value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as Client['status'] }))} className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800">
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
            <input value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} placeholder="Dirección" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={editForm.city} onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))} placeholder="Ciudad" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none" />
              <input value={editForm.postalCode} onChange={(e) => setEditForm((p) => ({ ...p, postalCode: e.target.value }))} placeholder="Código postal" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none" />
            </div>
            <textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notas" rows={3} className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none resize-none" />
            <div className="flex gap-3">
              <button onClick={() => setIsEditingInfo(false)} className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
              <button onClick={() => { void handleSaveClient(); }} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium">Guardar cambios</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre completo</label>
              <div className="text-gray-900 dark:text-gray-100 font-semibold">{client.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">DNI/NIE/CIF</label>
              <div className="text-gray-900 dark:text-gray-100 font-mono">{client.dni || '—'}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
              <div className="text-gray-900 dark:text-gray-100">{client.phone}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
              <div className="text-gray-900 dark:text-gray-100">{client.email}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Responsable</label>
              <div className="text-gray-900 dark:text-gray-100 font-semibold">{client.responsible}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente desde</label>
              <div className="text-gray-900 dark:text-gray-100">{new Date(client.createdAt).toLocaleDateString('es-ES')}</div>
            </div>
          </div>
        )}
      </div>

      {/* Datos fiscales */}
      {(client.legalName || client.fiscalId || client.clientType === 'empresa') && (
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            Datos fiscales
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Razón social</label>
              <div className="text-gray-900 dark:text-gray-100">{client.legalName || '—'}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">CIF/NIF</label>
              <div className="text-gray-900 dark:text-gray-100 font-mono">{client.fiscalId || client.dni || '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Direcciones */}
      <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-red-500" />
          Direcciones
        </h3>
        {client.addresses && client.addresses.length > 0 ? (
          <div className="space-y-3">
            {client.addresses.map((addr) => (
              <div key={addr.id} className={`p-4 rounded-xl border-2 ${addr.isPrimary ? 'border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{addr.label || 'Dirección'}</span>
                  {addr.isPrimary && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Principal</span>}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{[addr.street, addr.postalCode, addr.city, addr.state, addr.country].filter(Boolean).join(', ')}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            {client.address ? (
              <div className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-left">
                <p className="text-sm text-gray-600 dark:text-gray-400">{[client.address, client.postalCode, client.city].filter(Boolean).join(', ')}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin direcciones registradas</p>
            )}
          </div>
        )}
      </div>

      {/* Redes sociales y webs */}
      <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-cyan-600" />
          Redes sociales y webs
        </h3>
        {client.socialLinks && client.socialLinks.length > 0 ? (
          <div className="space-y-2">
            {client.socialLinks.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <Globe className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{link.name || 'Enlace'}</p>
                  <p className="text-xs text-cyan-600 truncate">{link.url}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Sin redes sociales registradas</p>
        )}
      </div>

      {/* Notas */}
      {client.notes && (
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Notas</h3>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{client.notes}</p>
        </div>
      )}
    </div>
  );

  // ─── CONTACTOS TAB ────────────────────────────────────────────────────────

  const handleSaveContact = async () => {
    if (!client || !contactForm.name.trim()) return;
    const contacts = [...(client.contacts || [])];
    if (editingContactId) {
      const idx = contacts.findIndex((c) => c.id === editingContactId);
      if (idx >= 0) contacts[idx] = { ...contactForm, id: editingContactId };
    } else {
      contacts.push({ ...contactForm, id: `contact-${uuidv4()}` });
    }
    if (authUser?.user_id) {
      await saveClientContacts(authUser.user_id, client.id, contacts);
    }
    await updateClient(client.id, { contacts } as any);
    setShowContactForm(false);
    setEditingContactId(null);
    setContactForm({ id: '', name: '', role: '', email: '', phone: '', notes: '' });
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!client) return;
    const contacts = (client.contacts || []).filter((c) => c.id !== contactId);
    if (authUser?.user_id) {
      await saveClientContacts(authUser.user_id, client.id, contacts);
    }
    await updateClient(client.id, { contacts } as any);
  };

  const renderContactosTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {(client.contacts?.length || 0)} personas de contacto
        </div>
        <button
          onClick={() => {
            setEditingContactId(null);
            setContactForm({ id: '', name: '', role: '', email: '', phone: '', notes: '' });
            setShowContactForm(true);
          }}
          className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-medium transition-colors"
        >
          + Añadir contacto
        </button>
      </div>

      {showContactForm && (
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            {editingContactId ? 'Editar contacto' : 'Nuevo contacto'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={contactForm.name} onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre *" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
            <input value={contactForm.role} onChange={(e) => setContactForm((p) => ({ ...p, role: e.target.value }))} placeholder="Cargo / Rol" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
            <input type="email" value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
            <input value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Teléfono" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
            <textarea value={contactForm.notes} onChange={(e) => setContactForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notas" rows={2} className="md:col-span-2 w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none resize-none text-sm" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setShowContactForm(false); setEditingContactId(null); }} className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
            <button onClick={() => { void handleSaveContact(); }} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium">Guardar</button>
          </div>
        </div>
      )}

      {(client.contacts && client.contacts.length > 0) ? (
        <div className="space-y-3">
          {client.contacts.map((contact) => (
            <div key={contact.id} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5 flex items-start gap-4 group">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.name}</p>
                  {contact.role && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">{contact.role}</span>}
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
                  {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-blue-600"><Mail className="w-3.5 h-3.5" />{contact.email}</a>}
                  {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-blue-600"><Phone className="w-3.5 h-3.5" />{contact.phone}</a>}
                </div>
                {contact.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{contact.notes}</p>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => { setEditingContactId(contact.id); setContactForm(contact); setShowContactForm(true); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><Edit2 className="w-4 h-4 text-gray-400 dark:text-gray-500" /></button>
                <button onClick={() => { void handleDeleteContact(contact.id); }} className="p-2 hover:bg-red-50 rounded-xl"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : !showContactForm && (
        <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Sin contactos</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Añade las personas de contacto de este cliente</p>
          <button onClick={() => setShowContactForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> Añadir contacto
          </button>
        </div>
      )}
    </div>
  );

  // ─── FACTURAS TAB ─────────────────────────────────────────────────────────

  const renderFacturasTab = () => {
    if (loadingInvoices) {
      return (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      );
    }

    const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
      paid: { label: 'Pagada', bg: 'bg-emerald-50', text: 'text-emerald-700' },
      pending: { label: 'Pendiente', bg: 'bg-amber-50', text: 'text-amber-700' },
      overdue: { label: 'Vencida', bg: 'bg-red-50', text: 'text-red-700' },
      draft: { label: 'Borrador', bg: 'bg-gray-50 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400' },
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">{clientInvoices.length} facturas</p>
        </div>
        {clientInvoices.length > 0 ? (
          <div className="space-y-2">
            {clientInvoices.map((inv) => {
              const st = statusConfig[inv.status] || statusConfig.draft;
              return (
                <div key={inv.id} className="flex items-center gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4 hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{inv.number || inv.id}</p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
                      {(inv as any).origin && (inv as any).origin !== 'manual' && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600">
                          {(inv as any).origin === 'auto_service' ? 'Auto (servicio)' : (inv as any).origin === 'auto_contract' ? 'Auto (contrato)' : (inv as any).origin}
                        </span>
                      )}
                      {(inv as any).vertical === 'cleaning' && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-600">Limpieza</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      <span>{new Date(inv.date).toLocaleDateString('es-ES')}</span>
                      {inv.vehicleName && <><span>·</span><span>{inv.vehicleName}</span></>}
                      {(inv as any).periodStart && (inv as any).periodEnd && (
                        <><span>·</span><span>{new Date((inv as any).periodStart).toLocaleDateString('es-ES')} — {new Date((inv as any).periodEnd).toLocaleDateString('es-ES')}</span></>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{Number(inv.total).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</p>
                    {inv.paid > 0 && inv.paid < inv.total && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">Pagado: {Number(inv.paid).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Sin facturas</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">Este cliente no tiene facturas registradas</p>
          </div>
        )}
      </div>
    );
  };

  // ─── PROMOCIONES TAB ──────────────────────────────────────────────────────

  const handleCreatePromotion = async () => {
    if (!client || !authUser?.user_id || !promotionForm.nombre.trim()) return;
    const promo = await createClientPromotionRequest(authUser.user_id, client.id, {
      nombre: promotionForm.nombre,
      tipo: promotionForm.tipo,
      descuento: promotionForm.descuento ? Number(promotionForm.descuento) : null,
      codigo: promotionForm.codigo,
      fechaInicio: promotionForm.fechaInicio,
      fechaFin: promotionForm.fechaFin,
      descripcion: promotionForm.descripcion,
    });
    if (promo) {
      setClientPromotions((prev) => [promo, ...prev]);
    }
    setShowPromotionForm(false);
    setPromotionForm({ nombre: '', tipo: 'descuento', descuento: '', codigo: '', fechaInicio: new Date().toISOString().split('T')[0], fechaFin: new Date().toISOString().split('T')[0], descripcion: '' });
  };

  const handleTogglePromotion = async (promo: ClientPromotion) => {
    if (!client || !authUser?.user_id) return;
    const updated = await toggleClientPromotionRequest(authUser.user_id, client.id, promo);
    if (updated) {
      setClientPromotions((prev) => prev.map((p) => p.id === promo.id ? updated : p));
    }
  };

  const handleDeletePromotion = async (promoId: string) => {
    if (!client || !authUser?.user_id) return;
    const ok = await deleteClientPromotionRequest(authUser.user_id, client.id, promoId);
    if (ok) {
      setClientPromotions((prev) => prev.filter((p) => p.id !== promoId));
    }
  };

  const renderPromocionesTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">{clientPromotions.length} promociones</p>
        <button onClick={() => setShowPromotionForm((v) => !v)} className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-medium transition-colors">
          + Nueva promoción
        </button>
      </div>

      {showPromotionForm && (
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Nueva promoción</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={promotionForm.nombre} onChange={(e) => setPromotionForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Nombre de la promoción *" className="md:col-span-2 w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
            <select value={promotionForm.tipo} onChange={(e) => setPromotionForm((p) => ({ ...p, tipo: e.target.value }))} className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800 text-sm">
              <option value="descuento">Descuento</option>
              <option value="regalo">Regalo</option>
              <option value="envio_gratis">Envío gratis</option>
              <option value="puntos">Puntos</option>
              <option value="otro">Otro</option>
            </select>
            <input value={promotionForm.descuento} onChange={(e) => setPromotionForm((p) => ({ ...p, descuento: e.target.value }))} placeholder="Descuento (%)" type="number" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
            <input value={promotionForm.codigo} onChange={(e) => setPromotionForm((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))} placeholder="Código promocional" className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm font-mono" />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Inicio</label>
                <input type="date" value={promotionForm.fechaInicio} onChange={(e) => setPromotionForm((p) => ({ ...p, fechaInicio: e.target.value }))} className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fin</label>
                <input type="date" value={promotionForm.fechaFin} onChange={(e) => setPromotionForm((p) => ({ ...p, fechaFin: e.target.value }))} className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm" />
              </div>
            </div>
            <textarea value={promotionForm.descripcion} onChange={(e) => setPromotionForm((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción" rows={2} className="md:col-span-2 w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none resize-none text-sm" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowPromotionForm(false)} className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
            <button onClick={() => { void handleCreatePromotion(); }} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium">Guardar</button>
          </div>
        </div>
      )}

      {loadingPromotions ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : clientPromotions.length > 0 ? (
        <div className="space-y-3">
          {clientPromotions.map((promo) => {
            const isActive = promo.estado === 'activa';
            const isExpired = promo.fechaFin && new Date(promo.fechaFin) < new Date();
            return (
              <div key={promo.id} className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-5 transition-all group ${isActive ? 'border-emerald-200 dark:border-emerald-800' : 'border-gray-200 dark:border-gray-700 opacity-75'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{promo.nombre}</p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                        {isActive ? 'Activa' : 'Inactiva'}
                      </span>
                      {isExpired && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-600">Expirada</span>}
                      {promo.codigo && <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">{promo.codigo}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-1">
                      <span className="capitalize">{promo.tipo}</span>
                      {promo.descuento != null && <span>{promo.descuento}% dto.</span>}
                      <span>{new Date(promo.fechaInicio).toLocaleDateString('es-ES')} — {new Date(promo.fechaFin).toLocaleDateString('es-ES')}</span>
                    </div>
                    {promo.descripcion && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{promo.descripcion}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { void handleTogglePromotion(promo); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors" title={isActive ? 'Desactivar' : 'Activar'}>
                      {isActive ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400 dark:text-gray-500" />}
                    </button>
                    <button onClick={() => { void handleDeletePromotion(promo.id); }} className="p-2 hover:bg-red-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : !showPromotionForm && (
        <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <Megaphone className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Sin promociones</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Crea promociones personalizadas para este cliente</p>
          <button onClick={() => setShowPromotionForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> Nueva promoción
          </button>
        </div>
      )}
    </div>
  );

  // ─── PRESUPUESTOS TAB ─────────────────────────────────────────────────────

  const QUOTE_STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
    draft: { label: 'Borrador', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400' },
    sent: { label: 'Enviado', bg: 'bg-blue-100', text: 'text-blue-700' },
    pending: { label: 'Pendiente', bg: 'bg-amber-100', text: 'text-amber-700' },
    accepted: { label: 'Aceptado', bg: 'bg-emerald-100', text: 'text-emerald-700' },
    rejected: { label: 'Rechazado', bg: 'bg-red-100', text: 'text-red-700' },
  };

  const renderPresupuestosTab = () => {
    if (loadingQuotes) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      );
    }

    if (clientQuotes.length === 0) {
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
          <ClipboardList className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin presupuestos vinculados</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Los presupuestos de este cliente aparecerán aquí</p>
        </div>
      );
    }

    const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
    const totalQuotesValue = clientQuotes.reduce((s, q) => s + q.total, 0);
    const acceptedQuotes = clientQuotes.filter((q) => q.status === 'accepted');

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total presupuestos</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{clientQuotes.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Valor total</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{eurFmt.format(totalQuotesValue)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Aceptados</p>
            <p className="text-xl font-bold text-emerald-600">{acceptedQuotes.length}</p>
          </div>
        </div>

        <div className="space-y-2">
          {clientQuotes.map((q) => {
            const statusStyle = QUOTE_STATUS_STYLES[q.status] || QUOTE_STATUS_STYLES.draft;
            return (
              <div key={q.id} className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-sm transition-all">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 shrink-0">
                  <ClipboardList className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {q.title || q.number || 'Presupuesto'}
                    </p>
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                      {statusStyle.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {q.number && `#${q.number} · `}{q.items} líneas · {new Date(q.createdAt).toLocaleDateString('es-ES')}
                    {q.validUntil && ` · Válido hasta ${new Date(q.validUntil).toLocaleDateString('es-ES')}`}
                  </p>
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 shrink-0">
                  {eurFmt.format(q.total)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── ACTIVIDAD TAB ────────────────────────────────────────────────────────

  const renderActividadTab = () => {
    if (loadingActivities) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            </div>
          ))}
        </div>
      );
    }

    const tipoConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
      pedido: { icon: <Car className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
      factura: { icon: <Receipt className="w-4 h-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
      nota: { icon: <MessageSquare className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">{clientActivities.length} actividades registradas</p>
        </div>

        {clientActivities.length > 0 ? (
          <div className="space-y-2">
            {clientActivities.map((act, idx) => {
              const cfg = tipoConfig[act.tipo] || { icon: <Clock className="w-4 h-4" />, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-700' };
              return (
                <div key={act.id || idx} className="flex gap-4 relative">
                  {idx < clientActivities.length - 1 && (
                    <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-gray-100 dark:bg-gray-700" />
                  )}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.bg}`}>
                    <span className={cfg.color}>{cfg.icon}</span>
                  </div>
                  <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{act.titulo}</p>
                        <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500">{act.tipo}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 whitespace-nowrap">
                        {act.fecha ? new Date(act.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                      </span>
                    </div>
                    {act.descripcion && <p className="text-sm text-gray-500 dark:text-gray-400">{act.descripcion}</p>}
                    <div className="flex items-center gap-3 mt-1.5">
                      {act.monto != null && act.monto > 0 && <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{act.monto.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>}
                      {act.estado && <span className={`text-[10px] font-semibold capitalize px-2 py-0.5 rounded-full ${
                        act.estado === 'completado' || act.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' :
                        act.estado === 'cancelado' || act.estado === 'vencido' ? 'bg-red-100 text-red-600' :
                        'bg-amber-100 text-amber-700'
                      }`}>{act.estado}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
            <Activity className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Sin actividad</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">Aún no hay actividad registrada para este cliente</p>
          </div>
        )}
      </div>
    );
  };

  const DOC_CATEGORIES: { id: string; label: string; icon: React.ReactNode; color: string; badge: string }[] = [
    { id: 'contrato',  label: 'Contratos',  icon: <FileCheck className="w-4 h-4" />,   color: 'text-blue-600',   badge: 'bg-blue-50 text-blue-700 border-blue-200' },
    { id: 'factura',   label: 'Facturas',   icon: <Receipt className="w-4 h-4" />,     color: 'text-emerald-600',badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'identidad', label: 'Identidad',  icon: <IdCard className="w-4 h-4" />,      color: 'text-violet-600', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
    { id: 'vehiculo',  label: 'Vehículo',   icon: <Car className="w-4 h-4" />,         color: 'text-amber-600',  badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'otros',     label: 'Otros',      icon: <FolderClosed className="w-4 h-4" />,color: 'text-gray-600 dark:text-gray-400',   badge: 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700' },
  ];

  const DOC_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    Pendiente:  { label: 'Pendiente',  bg: 'bg-amber-50',   text: 'text-amber-700' },
    Recibido:   { label: 'Recibido',   bg: 'bg-blue-50',    text: 'text-blue-700' },
    Validado:   { label: 'Validado',   bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Firmado:    { label: 'Firmado',    bg: 'bg-violet-50',  text: 'text-violet-700' },
  };

  const docsByCategory = DOC_CATEGORIES.map((cat) => ({
    ...cat,
    docs: documents.filter((d: any) => (d.category || 'otros') === cat.id),
  }));

  const filteredDocs = docCategoryFilter === 'all'
    ? documents
    : documents.filter((d: any) => (d.category || 'otros') === docCategoryFilter);

  const renderDocumentsTab = () => (
    <div className="space-y-5">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Carpeta de documentos</p>
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
            {documents.length} archivos
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDocumentForm((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir documento
          </button>
          <button
            onClick={() => setShowDocumentForm((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Añadir
          </button>
        </div>
      </div>

      {/* ── Category summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {docsByCategory.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setDocCategoryFilter(docCategoryFilter === cat.id ? 'all' : cat.id)}
            className={`flex flex-col items-start p-3 rounded-2xl border-2 transition-all text-left ${
              docCategoryFilter === cat.id
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className={`mb-1.5 ${docCategoryFilter === cat.id ? 'text-white' : cat.color}`}>
              {cat.icon}
            </span>
            <span className={`text-xs font-semibold leading-tight ${docCategoryFilter === cat.id ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
              {cat.label}
            </span>
            <span className={`text-lg font-bold ${docCategoryFilter === cat.id ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
              {cat.docs.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Add document form ── */}
      {showDocumentForm && (
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Añadir documento</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={documentForm.name}
              onChange={(e) => setDocumentForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Nombre del documento"
              className="sm:col-span-2 w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            />
            <select
              value={documentForm.category}
              onChange={(e) => setDocumentForm((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800 text-sm"
            >
              {DOC_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
            <select
              value={documentForm.status}
              onChange={(e) => setDocumentForm((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800 text-sm"
            >
              <option>Pendiente</option>
              <option>Recibido</option>
              <option>Validado</option>
              <option>Firmado</option>
            </select>
            <input
              type="date"
              value={documentForm.date}
              onChange={(e) => setDocumentForm((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowDocumentForm(false)}
              className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
            >
              Cancelar
            </button>
            <button
              onClick={() => { void handleAddDocument(); }}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-black transition-colors"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* ── Document list ── */}
      {filteredDocs.length > 0 ? (
        <div className="space-y-2">
          {filteredDocs.map((doc: any) => {
            const cat = DOC_CATEGORIES.find((c) => c.id === (doc.category || 'otros')) || DOC_CATEGORIES[4];
            const statusCfg = DOC_STATUS_CONFIG[doc.status] || DOC_STATUS_CONFIG['Pendiente'];
            return (
              <div
                key={doc.id}
                className="flex items-center gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3.5 hover:shadow-sm transition-all group"
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cat.badge} border`}>
                  {cat.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{doc.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${cat.color}`}>{cat.label}</span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{doc.date}</span>
                  </div>
                </div>

                {/* Status badge */}
                <span className={`hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold flex-shrink-0 ${statusCfg.bg} ${statusCfg.text}`}>
                  {statusCfg.label}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    title="Vista previa"
                  >
                    <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={() => setSignatureDoc({ id: doc.id, name: doc.name, fileUrl: doc.fileUrl, mimeType: doc.mimeType, fileSize: doc.fileSize })}
                    className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                    title="Enviar a firma"
                  >
                    <PenLine className="w-4 h-4 text-blue-500" />
                  </button>
                  <button
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    title="Descargar"
                  >
                    <Download className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!client) return;
                      const next = (client.documentsList || []).filter((d: any) => d.id !== doc.id);
                      await updateClient(client.id, { documentsList: next, documentsCount: next.length });
                    }}
                    className="p-2 hover:bg-red-50 rounded-xl transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-7 h-7 text-gray-300" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {docCategoryFilter === 'all' ? 'Sin documentos' : `Sin documentos en ${DOC_CATEGORIES.find((c) => c.id === docCategoryFilter)?.label}`}
          </h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">Sube o añade el primer documento del cliente</p>
          <button
            onClick={() => setShowDocumentForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Añadir documento
          </button>
        </div>
      )}

      {/* ── Preview modal ── */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setPreviewDoc(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                {(() => {
                  const cat = DOC_CATEGORIES.find((c) => c.id === ((previewDoc as any).category || 'otros')) || DOC_CATEGORIES[4];
                  return (
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cat.badge} border`}>
                      {cat.icon}
                    </div>
                  );
                })()}
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{previewDoc.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{previewDoc.date} · {previewDoc.status}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-y-auto p-6">
              {(previewDoc as any).content ? (
                <div
                  className="prose prose-sm max-w-none text-gray-900 dark:text-gray-100"
                  dangerouslySetInnerHTML={{ __html: (previewDoc as any).content }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Vista previa no disponible</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Este documento no tiene contenido HTML para previsualizar.</p>
                  <div className="mt-5 flex gap-3">
                    <button className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                      <Download className="w-4 h-4" />
                      Descargar
                    </button>
                    <button className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-black transition-colors">
                      <ChevronRight className="w-4 h-4" />
                      Ver en documentos
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Firma Digital: panel de estado de firmas del cliente ── */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <PenLine className="w-5 h-5 text-blue-500" />
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Firmas digitales</p>
        </div>
        <SignaturePanel
          filters={{ entityType: 'client', entityId: id }}
          compact
        />
      </div>

      {/* ── Signature Request Modal ── */}
      {signatureDoc && client && (
        <SignatureRequestModal
          open={!!signatureDoc}
          onOpenChange={(open) => { if (!open) setSignatureDoc(null); }}
          document={{
            id: signatureDoc.id,
            name: signatureDoc.name,
            fileUrl: signatureDoc.fileUrl,
            mimeType: signatureDoc.mimeType,
            fileSize: signatureDoc.fileSize,
            clientId: client.id,
            clientName: client.name || client.fullName || '',
          }}
        />
      )}
    </div>
  );

  // ─── Obtener el cliente del contexto (con gdpr y tags) ────────────────────

  const ctxClient = useMemo(() => clients.find((c) => c.id === id), [clients, id]);

  // ─── Tag management ────────────────────────────────────────────────────────

  const [newTag, setNewTag] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const tagSearch = newTag.toLowerCase().trim();
  const clientTagSuggestions = LEAD_PREDEFINED_TAGS.filter(
    (s) => !(ctxClient?.tags || []).includes(s) && (tagSearch === '' || s.toLowerCase().includes(tagSearch)),
  );

  const handleAddTag = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || !ctxClient) return;
    const currentTags = ctxClient.tags || [];
    if (currentTags.includes(trimmed)) return;
    await updateClient(ctxClient.id, { tags: [...currentTags, trimmed] });
    setNewTag('');
  };

  const handleRemoveTag = async (tag: string) => {
    if (!ctxClient) return;
    const currentTags = ctxClient.tags || [];
    await updateClient(ctxClient.id, { tags: currentTags.filter((t) => t !== tag) });
  };

  // ─── GDPR handlers ─────────────────────────────────────────────────────────

  const handleUpdateConsent = async (
    type: ConsentHistoryEntry['type'],
    value: boolean,
    method: ConsentHistoryEntry['method'],
  ) => {
    if (!ctxClient) return;
    const entry: ConsentHistoryEntry = {
      timestamp: new Date().toISOString(),
      type,
      value,
      method,
      user: authUser?.fullName || 'Sistema',
    };
    const currentGdpr: GdprRecord = ctxClient.gdpr || { deletionRequested: false, consentHistory: [] };
    const newConsents = {
      dataProcessing: type === 'dataProcessing' ? value : (ctxClient.consents?.dataProcessing ?? false),
      commercial: type === 'commercial' ? value : (ctxClient.consents?.commercial ?? false),
      thirdParty: type === 'thirdParty' ? value : (ctxClient.consents?.thirdParty ?? false),
    };
    await updateClient(ctxClient.id, {
      consents: newConsents,
      gdpr: {
        ...currentGdpr,
        consentHistory: [entry, ...(currentGdpr.consentHistory || [])],
      },
    });
  };

  const handleRequestDeletion = async () => {
    if (!ctxClient || !window.confirm('¿Confirmas la solicitud de borrado? Este cliente será anonimizado.')) return;
    const currentGdpr: GdprRecord = ctxClient.gdpr || { deletionRequested: false, consentHistory: [] };
    await updateClient(ctxClient.id, {
      gdpr: {
        ...currentGdpr,
        deletionRequested: true,
        deletionRequestedAt: new Date().toISOString(),
      },
    });
  };

  const handleExportPersonalData = () => {
    if (!ctxClient) return;
    const data = {
      exportDate: new Date().toISOString(),
      name: ctxClient.name,
      phone: ctxClient.phone,
      email: ctxClient.email,
      dni: ctxClient.dni || '',
      address: ctxClient.address || '',
      city: ctxClient.city || '',
      postalCode: ctxClient.postalCode || '',
      consents: ctxClient.consents,
      gdpr: ctxClient.gdpr,
      interactions: ctxClient.interactions,
      vehiclesPurchased: ctxClient.vehiclesPurchased,
      createdAt: ctxClient.createdAt,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `datos-personales-${ctxClient.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    // Register export in GDPR record
    const currentGdpr: GdprRecord = ctxClient.gdpr || { deletionRequested: false, consentHistory: [] };
    void updateClient(ctxClient.id, {
      gdpr: { ...currentGdpr, dataExportRequestedAt: new Date().toISOString() },
    });
  };

  // ─── Timeline unificado ────────────────────────────────────────────────────

  const renderTimelineTab = () => {
    // C-01: Timeline visual con el nuevo componente InteractionTimeline
    const findUserAvatar = (userName?: string) => {
      if (!userName) return undefined;
      const match = platformUsers.find(
        (u) => u.fullName === userName || u.id === userName || u.user_id === userName,
      );
      return match?.avatar || undefined;
    };

    const timelineEvents: TimelineEvent[] = [
      ...(ctxClient?.interactions || []).map((i) => ({
        id: i.id,
        type: i.type as TimelineEvent['type'],
        title: i.title,
        description: i.description,
        date: i.date,
        user: i.user,
        userAvatar: findUserAvatar(i.user),
      })),
      ...(ctxClient?.documentsList || []).map((d) => ({
        id: d.id,
        type: 'document' as const,
        title: d.name,
        description: `Estado: ${d.status}`,
        date: d.date,
        user: '',
      })),
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Historial de comunicaciones</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{timelineEvents.length} eventos registrados</p>
          </div>
          <button
            onClick={() => { setActiveTab('interactions'); setShowInteractionForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Registrar
          </button>
        </div>
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-5">
          <InteractionTimeline
            events={timelineEvents}
            emptyLabel="Aún no hay eventos registrados para este cliente"
          />
        </div>
      </div>
    );
  };

  // ─── GDPR Tab ──────────────────────────────────────────────────────────────

  const renderGdprTab = () => {
    const gdpr = ctxClient?.gdpr || { deletionRequested: false, consentHistory: [] };
    const consents = ctxClient?.consents || { dataProcessing: false, commercial: false, thirdParty: false };

    const consentDefs: { key: ConsentHistoryEntry['type']; label: string; desc: string }[] = [
      { key: 'dataProcessing', label: 'Tratamiento de datos', desc: 'Permite el tratamiento de datos personales para la gestión de la relación comercial.' },
      { key: 'commercial',     label: 'Comunicaciones comerciales', desc: 'Acepta recibir ofertas, promociones y comunicaciones de marketing.' },
      { key: 'thirdParty',     label: 'Cesión a terceros', desc: 'Autoriza la cesión de datos a terceras empresas para fines comerciales.' },
    ];

    const methodOptions: { value: ConsentHistoryEntry['method']; label: string }[] = [
      { value: 'presential', label: 'Presencial' },
      { value: 'web',        label: 'Web' },
      { value: 'email',      label: 'Email' },
      { value: 'phone',      label: 'Teléfono' },
      { value: 'written',    label: 'Escrito' },
    ];

    return (
      <div className="space-y-6">
        {/* Banner de baja si está solicitada */}
        {gdpr.deletionRequested && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Borrado solicitado</p>
              <p className="text-sm text-red-700 mt-0.5">
                Solicitud recibida el {gdpr.deletionRequestedAt ? new Date(gdpr.deletionRequestedAt).toLocaleString('es-ES') : '—'}.
                {gdpr.deletionCompletedAt ? ` Completado el ${new Date(gdpr.deletionCompletedAt).toLocaleString('es-ES')}.` : ' Pendiente de proceso.'}
              </p>
            </div>
          </div>
        )}

        {/* Consentimientos actuales */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Consentimientos RGPD
            </h3>
            <select
              value={consentMethod}
              onChange={(e) => setConsentMethod(e.target.value as ConsentHistoryEntry['method'])}
              className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800"
            >
              {methodOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            {consentDefs.map(({ key, label, desc }) => {
              const value = consents[key as keyof typeof consents] ?? false;
              return (
                <div key={key} className={`flex items-start justify-between gap-4 p-4 rounded-xl border-2 transition-all ${value ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${value ? 'text-emerald-800' : 'text-gray-700 dark:text-gray-300'}`}>{label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {value
                      ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                      : <XCircle className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    }
                    <button
                      onClick={() => void handleUpdateConsent(key, !value, consentMethod)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        value
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                    >
                      {value ? 'Revocar' : 'Aceptar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Historial de consentimientos */}
        {gdpr.consentHistory && gdpr.consentHistory.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <History className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                Historial de consentimientos
              </h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {gdpr.consentHistory.map((entry, idx) => (
                <div key={idx} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {entry.value
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    }
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {entry.type === 'dataProcessing' ? 'Tratamiento de datos'
                          : entry.type === 'commercial' ? 'Comunicaciones'
                          : 'Cesión a terceros'}
                        {' '}— <span className={entry.value ? 'text-emerald-600' : 'text-red-600'}>{entry.value ? 'Aceptado' : 'Revocado'}</span>
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{entry.method} · {entry.user || 'Sistema'}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {new Date(entry.timestamp).toLocaleString('es-ES')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Derechos RGPD */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" />
            Derechos del interesado
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleExportPersonalData}
              className="flex items-center gap-3 p-4 border-2 border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center flex-shrink-0 transition-colors">
                <Download className="w-4 h-4 text-blue-700" />
              </div>
              <div>
                <p className="font-semibold text-blue-900 text-sm">Exportar datos personales</p>
                <p className="text-xs text-blue-600">Derecho de acceso (Art. 15 RGPD)</p>
                {ctxClient?.gdpr?.dataExportRequestedAt && (
                  <p className="text-[10px] text-blue-400 mt-0.5">
                    Última exportación: {new Date(ctxClient.gdpr.dataExportRequestedAt).toLocaleString('es-ES')}
                  </p>
                )}
              </div>
            </button>

            <button
              onClick={() => void handleRequestDeletion()}
              disabled={gdpr.deletionRequested}
              className="flex items-center gap-3 p-4 border-2 border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded-xl transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-xl bg-red-100 group-hover:bg-red-200 flex items-center justify-center flex-shrink-0 transition-colors">
                <Trash2 className="w-4 h-4 text-red-700" />
              </div>
              <div>
                <p className="font-semibold text-red-900 text-sm">Solicitar borrado</p>
                <p className="text-xs text-red-600">Derecho al olvido (Art. 17 RGPD)</p>
                {gdpr.deletionRequested && (
                  <p className="text-[10px] text-red-400 mt-0.5">Ya solicitado</p>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout title={client.name} subtitle={`Cliente desde ${new Date(client.createdAt).toLocaleDateString('es-ES')}`}>
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate('/saas/crm/clientes?tab=clients')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a clientes
        </button>

        {/* Header Card */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-8 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold mb-2">{client.name}</h1>
              <div className="flex flex-wrap items-center gap-4 text-blue-100 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span>{client.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>{client.phone}</span>
                </div>
                {client.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{client.city}</span>
                  </div>
                )}
              </div>
              {/* Tags */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3 relative">
                {(ctxClient?.tags || []).map((tag) => (
                  <span key={tag} className="flex items-center gap-1 px-2.5 py-1 bg-white/20 border border-white/30 rounded-full text-xs font-semibold text-white">
                    {tag}
                    <button
                      onClick={() => void handleRemoveTag(tag)}
                      className="hover:text-red-200 transition-colors ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <form
                    onSubmit={(e) => { e.preventDefault(); void handleAddTag(newTag); setShowTagSuggestions(false); }}
                  >
                    <input
                      ref={tagInputRef}
                      value={newTag}
                      onChange={(e) => { setNewTag(e.target.value); setShowTagSuggestions(true); }}
                      onFocus={() => setShowTagSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                      placeholder="+ Etiqueta"
                      className="w-28 px-2.5 py-1 bg-white/10 border border-white/30 rounded-full text-xs text-white placeholder-white/60 focus:outline-none focus:bg-white/20"
                    />
                  </form>
                  {showTagSuggestions && (
                    <div
                      role="listbox"
                      aria-label="Sugerencias de etiquetas"
                      className="absolute top-full left-0 mt-1.5 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 z-50 min-w-[220px] max-w-[280px] max-h-[200px] overflow-y-auto"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        tagInputRef.current?.focus();
                      }}
                    >
                      {clientTagSuggestions.length > 0 ? (
                        clientTagSuggestions.slice(0, 8).map((s) => (
                          <button
                            key={s}
                            type="button"
                            role="option"
                            onMouseDown={(e) => { e.preventDefault(); void handleAddTag(s); setShowTagSuggestions(false); }}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-700 transition-colors break-words leading-relaxed"
                          >
                            {s}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 italic">
                          {tagSearch ? 'Sin coincidencias. Pulsa Enter para añadir.' : 'Escribe para buscar…'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              {isDeliveryBusiness && (
                <button
                  type="button"
                  onClick={() => navigate(`/saas/vertical/delivery/tpv?clientId=${encodeURIComponent(client.id)}`)}
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-colors flex items-center gap-2 text-sm shadow-md shadow-emerald-900/15"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Nuevo pedido delivery
                </button>
              )}
              <button
                onClick={handleCreateContract}
                className="px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-blue-50 text-blue-600 rounded-xl font-semibold transition-colors flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4" />
                Crear contrato
              </button>
              {authUser?.user_id && (
                <button
                  onClick={async () => {
                    if (portalLink) {
                      try {
                        await navigator.clipboard.writeText(portalLink);
                      } catch {
                        const ta = document.createElement('textarea');
                        ta.value = portalLink;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                      }
                      setPortalLinkCopied(true);
                      setTimeout(() => setPortalLinkCopied(false), 2500);
                      return;
                    }
                    setGeneratingPortalLink(true);
                    setPortalLinkError(false);
                    const link = await generatePortalLinkRequest(authUser.user_id, client.id);
                    setGeneratingPortalLink(false);
                    if (!link) {
                      setPortalLinkError(true);
                      setTimeout(() => setPortalLinkError(false), 3000);
                      return;
                    }
                    setPortalLink(link);
                    try {
                      await navigator.clipboard.writeText(link);
                    } catch {
                      const ta = document.createElement('textarea');
                      ta.value = link;
                      ta.style.position = 'fixed';
                      ta.style.opacity = '0';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                    }
                    setPortalLinkCopied(true);
                    setTimeout(() => setPortalLinkCopied(false), 2500);
                  }}
                  disabled={generatingPortalLink}
                  className="px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Link2 className="w-4 h-4" />
                  {generatingPortalLink ? 'Generando...' : portalLinkError ? 'Error al generar' : portalLinkCopied ? '¡Enlace copiado!' : portalLink ? 'Copiar enlace portal' : 'Portal cliente'}
                </button>
              )}
              {portalLink && (
                <a
                  href={portalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors flex items-center gap-1.5 text-xs"
                >
                  <ExternalLink className="w-3 h-3" /> Ver portal
                </a>
              )}
              <button
                onClick={() => setShowDeleteClientModal(true)}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-white/80 hover:text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold border border-red-400/30"
                title="Eliminar cliente"
              >
                <Trash2 className="w-3 h-3" /> Eliminar
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          tabs={tabsConfig}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {/* Tab Content */}
        {activeTab === 'resumen' && renderResumenTab()}
        {activeTab === 'datos' && renderDatosTab()}
        {activeTab === 'contactos' && renderContactosTab()}
        {activeTab === 'presupuestos' && renderPresupuestosTab()}
        {activeTab === 'facturas' && renderFacturasTab()}
        {activeTab === 'promociones' && renderPromocionesTab()}
        {activeTab === 'actividad' && renderActividadTab()}
        {activeTab === 'documents' && renderDocumentsTab()}
        {activeTab === 'gdpr' && renderGdprTab()}
      </div>

      {/* Create Contract Modal */}
      <SAAS__CreateContractModal
        isOpen={showCreateContractModal}
        onClose={() => setShowCreateContractModal(false)}
        client={client}
        vehicles={vehicles || []}
        userId={authUser?.user_id || authUser?.id || ''}
        responsibleName={authUser?.fullName || ''}
        companyName={authUser?.companyName || 'Vertial'}
        onSubmit={() => setShowCreateContractModal(false)}
      />

      {/* U-04: Confirm client deletion */}
      <ConfirmDestroyModal
        isOpen={showDeleteClientModal}
        onClose={() => setShowDeleteClientModal(false)}
        onConfirm={async () => {
          setIsDeletingClient(true);
          try {
            await deleteClient(client.id);
            navigate('/saas/crm/clientes?tab=clients');
          } finally {
            setIsDeletingClient(false);
            setShowDeleteClientModal(false);
          }
        }}
        title="Eliminar cliente"
        description={`Eliminarás permanentemente al cliente y todos sus datos asociados (interacciones, documentos, historial RGPD). Esta acción no se puede deshacer.`}
        itemName={client.name}
        destructiveLabel="Eliminar cliente"
        isDeleting={isDeletingClient}
      />
    </Layout>
  );
}

// ─── Sub-componentes para el detalle de Lead ─────────────────────────────────

const LEAD_PREDEFINED_TAGS = [
  'interesado en eléctrico', 'financiación', 'comprador recurrente',
  'compra inmediata', 'segunda mano', 'cambio de vehículo',
  'empresa / flota', 'joven conductor', 'alta gama',
];

function LeadTagsManager({
  lead,
  updateLead,
}: {
  lead: import('../../context/AppContext').Lead;
  updateLead: (id: string, updates: Partial<import('../../context/AppContext').Lead>) => Promise<void>;
}) {
  const [newTag, setNewTag] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    const current = lead.tags || [];
    if (current.includes(t)) return;
    await updateLead(lead.id, { tags: [...current, t] });
    setNewTag('');
    setShowSuggestions(false);
  };

  const handleRemove = async (tag: string) => {
    await updateLead(lead.id, { tags: (lead.tags || []).filter((t) => t !== tag) });
  };

  const search = newTag.toLowerCase().trim();
  const suggestions = LEAD_PREDEFINED_TAGS.filter(
    (s) => !(lead.tags || []).includes(s) && (search === '' || s.toLowerCase().includes(search)),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3 relative">
      {(lead.tags || []).map((tag) => (
        <span key={tag} className="flex items-center gap-1 px-2.5 py-1 bg-white/20 border border-white/30 rounded-full text-xs font-semibold text-white">
          {tag}
          <button onClick={() => void handleRemove(tag)} className="hover:text-rose-300 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <div className="relative">
        <input
          ref={inputRef}
          value={newTag}
          onChange={(e) => { setNewTag(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd(newTag); } }}
          placeholder="+ Etiqueta"
          className="px-2.5 py-1 bg-white/20 border border-white/30 rounded-full text-xs text-white placeholder-white/60 outline-none w-28 focus:bg-white/30"
        />
        {showSuggestions && (
          <div
            role="listbox"
            aria-label="Sugerencias de etiquetas"
            className="absolute top-full left-0 mt-1.5 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1.5 z-50 min-w-[220px] max-w-[280px] max-h-[200px] overflow-y-auto"
            onMouseDown={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
            }}
          >
            {suggestions.length > 0 ? (
              suggestions.slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="option"
                  onMouseDown={(e) => { e.preventDefault(); void handleAdd(s); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 hover:text-violet-700 transition-colors break-words leading-relaxed"
                >
                  {s}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 italic">
                {search ? 'Sin coincidencias. Pulsa Enter para añadir.' : 'Escribe para buscar…'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type LeadDetailTab = 'info' | 'interactions' | 'score';

function LeadDetailTabs({
  lead,
  vehicleName,
  sourceLabels,
  interactions,
  scoreBreakdown,
  updateLead,
  authUser,
}: {
  lead: import('../../context/AppContext').Lead;
  vehicleName: string;
  sourceLabels: Record<string, string>;
  interactions: import('../../context/AppContext').LeadInteraction[];
  scoreBreakdown: import('../../lib/leadScoring').ScoreBreakdown;
  updateLead: (id: string, updates: Partial<import('../../context/AppContext').Lead>) => Promise<void>;
  authUser: { fullName?: string } | null;
}) {
  const [tab, setTab] = useState<LeadDetailTab>('info');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<import('../../context/AppContext').LeadInteraction>({
    id: '', type: 'note', title: '', description: '', date: '', user: '',
  });

  const handleAddInteraction = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    const next: import('../../context/AppContext').LeadInteraction = {
      id: `interaction-${Date.now()}`,
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim(),
      date: form.date || new Date().toISOString(),
      user: form.user.trim() || authUser?.fullName || 'Sistema',
    };
    await updateLead(lead.id, { interactions: [next, ...interactions] });
    setForm({ id: '', type: 'note', title: '', description: '', date: '', user: '' });
    setShowForm(false);
  };

  const tabs: { id: LeadDetailTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'info', label: 'Información', icon: <User className="w-4 h-4" /> },
    { id: 'interactions', label: 'Historial', icon: <Activity className="w-4 h-4" />, count: interactions.length },
    { id: 'score', label: 'Scoring', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  const iconMap: Record<string, React.ReactNode> = {
    call: <Phone className="w-4 h-4" />,
    email: <Mail className="w-4 h-4" />,
    meeting: <Calendar className="w-4 h-4" />,
    note: <MessageSquare className="w-4 h-4" />,
    appointment: <Calendar className="w-4 h-4" />,
  };

  const colorMap: Record<string, string> = {
    call: 'bg-green-100 text-green-700',
    email: 'bg-blue-100 text-blue-700',
    meeting: 'bg-purple-100 text-purple-700',
    note: 'bg-amber-100 text-amber-700',
    appointment: 'bg-violet-100 text-violet-700',
  };

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-violet-600 text-white rounded-full text-[10px] font-bold leading-none">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Info tab */}
      {tab === 'info' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <User className="w-4 h-4 text-violet-600" />
              Contacto
            </h3>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Teléfono</p>
              <a href={`tel:${lead.phone}`} className="text-blue-600 font-semibold hover:underline">{lead.phone}</a>
            </div>
            {lead.email && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Email</p>
                <a href={`mailto:${lead.email}`} className="text-blue-600 font-semibold hover:underline break-all">{lead.email}</a>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Origen</p>
              <p className="text-gray-900 dark:text-gray-100 font-semibold">{sourceLabels[lead.source] || lead.source}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Responsable</p>
              <p className="text-gray-900 dark:text-gray-100 font-semibold flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                {lead.responsible || 'Sin asignar'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Creado el</p>
              <p className="text-gray-900 dark:text-gray-100 font-semibold">
                {new Date(lead.createdAt).toLocaleDateString('es-ES')}
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-5 space-y-3">
              <h3 className="font-bold text-green-900 flex items-center gap-2">
                <Car className="w-4 h-4 text-green-600" />
                Vehículo de interés
              </h3>
              {vehicleName ? (
                <p className="text-lg font-bold text-green-900">{vehicleName}</p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">Sin especificar</p>
              )}
              {lead.budget && (
                <div>
                  <p className="text-xs font-medium text-green-700 mb-0.5">Presupuesto</p>
                  <p className="text-2xl font-bold text-green-900">{lead.budget}</p>
                </div>
              )}
            </div>
            {lead.notes && (
              <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-amber-600" />
                  Notas
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">{lead.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interactions tab */}
      {tab === 'interactions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">{interactions.length} interacciones registradas</p>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Añadir
            </button>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-gray-800 border-2 border-violet-200 rounded-xl p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LeadInteraction['type'] }))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:border-violet-400"
                  >
                    <option value="note">Nota</option>
                    <option value="call">Llamada</option>
                    <option value="email">Email</option>
                    <option value="meeting">Reunión</option>
                    <option value="appointment">Cita de prueba</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Responsable</label>
                  <input
                    value={form.user}
                    onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
                    placeholder={authUser?.fullName || 'Usuario'}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:border-violet-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Título *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ej. Llamada de seguimiento"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Descripción *</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Detalla el resultado de la interacción…"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:border-violet-400 resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">
                  Cancelar
                </button>
                <button
                  onClick={() => void handleAddInteraction()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}

          {interactions.length === 0 && !showForm && (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin interacciones todavía</p>
            </div>
          )}

          <div className="space-y-3">
            {interactions.map((item, idx) => (
              <div key={item.id} className="relative flex gap-4">
                {idx < interactions.length - 1 && (
                  <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-gray-100 dark:bg-gray-700" />
                )}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorMap[item.type] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                  {iconMap[item.type] || <Clock className="w-4 h-4" />}
                </div>
                <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{item.title}</h4>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {new Date(item.date).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{item.description}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{item.user}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score tab */}
      {tab === 'score' && (
        <div className="space-y-4">
          {/* Total score */}
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6 flex items-center gap-6">
            <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center font-black text-2xl border-2 ${getScoreColor(scoreBreakdown.total)}`}>
              {scoreBreakdown.total}
              <span className="text-[10px] font-semibold mt-0.5">/100</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{getScoreLabel(scoreBreakdown.total)}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Puntuación calculada automáticamente</p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 text-sm">Desglose del scoring</h3>
            <div className="space-y-3">
              {[
                { label: 'Email registrado', value: scoreBreakdown.hasEmail, max: 10 },
                { label: 'Presupuesto indicado', value: scoreBreakdown.hasBudget, max: 10 },
                { label: 'Vehículo de interés', value: scoreBreakdown.hasVehicle, max: 10 },
                { label: 'Actividad (interacciones)', value: scoreBreakdown.interactionsBonus, max: 20 },
                { label: 'Recencia del contacto', value: scoreBreakdown.recencyBonus, max: 10 },
                { label: 'Progreso en el pipeline', value: scoreBreakdown.statusProgress, max: 50 },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{row.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{row.value}/{row.max}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${(row.value / row.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SendReminderButton({ lead }: { lead: import('../../context/AppContext').Lead }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!lead.email) return;
    setSending(true);
    setError('');
    try {
      await sendAppointmentReminderRequest({
        to: lead.email,
        name: lead.name,
        appointmentDate: lead.lastContact?.toISOString() || new Date().toISOString(),
        vehicleInterest: lead.vehicleInterest || lead.interestedVehicle || '',
        notes: lead.notes || '',
      });
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => void handleSend()}
        disabled={sending || sent}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-colors text-sm ${
          sent
            ? 'bg-emerald-500 text-white'
            : 'bg-white/20 hover:bg-white/30 text-white border border-white/30'
        }`}
      >
        {sending ? (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Bell className="w-4 h-4" />
        )}
        {sent ? '¡Recordatorio enviado!' : 'Enviar recordatorio'}
      </button>
      {error && <p className="text-xs text-rose-300 mt-1">{error}</p>}
    </div>
  );
}