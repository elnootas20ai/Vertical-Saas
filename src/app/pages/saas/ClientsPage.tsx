import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useBusiness } from '../../context/BusinessContext';
import { usePagination } from '../../hooks/usePagination';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { Pagination } from '../../components/saas/Pagination';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../../components/saas/EmptyState';
import { useModalClose } from '../../hooks/useModalClose';
import { LEAD_STATUS_TOKEN } from '../../components/saas/DesignTokens';
import { getDniOrNieError, getCifError } from '../../lib/dniCifValidator';
import { SAAS__LeadDrawer } from '../../components/design-system/SAAS__LeadDrawer';
import { SAAS__NewLeadModal } from '../../components/design-system/SAAS__NewLeadModal';
import { SAAS__ConvertToClientModal } from '../../components/design-system/SAAS__ConvertToClientModal';
import { SAAS__CreateContractModal } from '../../components/design-system/SAAS__CreateContractModal';
import { CrmImportWizard } from '../../components/saas/CrmImportWizard';
import { CrmNav } from '../../components/saas/CrmNav';
import { NuevoClienteModal } from '../../components/saas/NuevoClienteModal';
import { CrmAlertsPanel } from '../../components/saas/CrmAlertsPanel';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { useActivationFocus } from '../../hooks/useActivationFocus';
import { ActivationFieldWrap } from '../../components/saas/ActivationGuideUi';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { toast } from 'sonner';
import { DuplicatesMergeModal } from '../../components/saas/DuplicatesMergeModal';
import { SegmentBuilder, applySegmentFilters, type FilterCondition } from '../../components/saas/SegmentBuilder';
import { useColumnPreferences, type ColumnDef } from '../../hooks/useColumnPreferences';
import { resolveClientLocationFields } from '../../lib/clientAddressUtils';
import { ColumnCustomizer } from '../../components/saas/ColumnCustomizer';
import {
  createClientInvoiceRequest,
  listClientInvoicesRequest,
  updateClientInvoiceRequest,
  deleteClientInvoiceRequest,
} from '../../lib/clientInvoicesApi';
import { generateInvoicePdf } from '../../lib/invoicePdfGenerator';
import {
  checkLeadDuplicatesRequest,
  mergeLeadRequest,
  mergeClientRequest,
  listAssignmentRulesRequest,
  createAssignmentRuleRequest,
  updateAssignmentRuleRequest,
  deleteAssignmentRuleRequest,
  getSlaConfigRequest,
  saveSlaConfigRequest,
  type AssignmentRule,
  type SlaConfig,
} from '../../lib/crmApi';
import { InvoiceCreationModal, type InvoiceTypeSelection } from '../../components/saas/InvoiceCreationModal';
import {
  Users, Plus, Eye, Phone, Mail, UserPlus, Search, MapPin,
  TrendingUp, FileText, ExternalLink, Car, LayoutGrid, List,
  Receipt, Download, Calendar, X, ArrowUp, ArrowDown, Check, ChevronDown,
  User, Trash2, Package, BadgePercent, Upload, Tag, Kanban, AlertTriangle, Store,
  RotateCcw, ClipboardList, Zap, ReceiptText, Droplets,
  Settings2, Timer, Workflow, Save,
} from 'lucide-react';

// ─── Column definitions ───────────────────────────────────────────────────────

type LeadColId = 'nombre' | 'estado' | 'vehiculo' | 'responsable' | 'fecha';
type ClientColId = 'nombre' | 'estado' | 'direccion' | 'ciudad' | 'responsable' | 'docs';

const LEAD_COL_DEFS: ColumnDef<LeadColId>[] = [
  { id: 'nombre',      label: 'Nombre',       required: true },
  { id: 'estado',      label: 'Estado' },
  { id: 'vehiculo',    label: 'Vehículo' },
  { id: 'responsable', label: 'Responsable' },
  { id: 'fecha',       label: 'Fecha' },
];

const CLIENT_COL_DEFS: ColumnDef<ClientColId>[] = [
  { id: 'nombre',      label: 'Cliente',      required: true },
  { id: 'estado',      label: 'Estado' },
  { id: 'direccion',   label: 'Calle' },
  { id: 'ciudad',      label: 'Ciudad' },
  { id: 'responsable', label: 'Responsable' },
  { id: 'docs',        label: 'Docs' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'appointment' | 'reserved' | 'lost';
export type LeadPill   = 'all' | LeadStatus;

export interface Lead {
  id: string; name: string; phone: string; email: string;
  status: LeadStatus; vehicleInterest: string; vehicleInterestId?: string;
  budget?: string; notes: string; source: string; responsible: string; branch_id?: string; workCenterId?: string; createdAt: string;
}
export interface Client {
  id: string; name: string; dni: string; phone: string; email: string;
  address?: string; city?: string; postalCode?: string;
  status: 'active' | 'inactive'; responsible: string; branch_id?: string; workCenterId?: string; createdAt: string;
  consents: { dataProcessing: boolean; commercial: boolean; thirdParty: boolean };
  notes?: string; vehiclesPurchased?: string[]; vehiclesSold?: string[]; documentsCount?: number;
}
interface Invoice {
  id: string; clientId?: string; number: string; clientName: string; vehicleName: string;
  vehiclePlate: string; date: string; dueDate: string; total: number; paid: number;
  status: 'paid' | 'pending' | 'overdue' | 'draft'; paymentMethod?: string; notes?: string;
}
type SortState = { key: string; dir: 'asc' | 'desc' } | null;
type ClientTabId = 'leads' | 'clients' | 'billing' | 'alerts';

export type ClientsPageProps = {
  embedDeliveryOps?: boolean;
};

// ─── Tokens ───────────────────────────────────────────────────────────────────

const LEAD_TOKEN = {
  ...LEAD_STATUS_TOKEN,
  reserved: { label: 'Reserva', dot: 'bg-orange-500', badgeBg: 'bg-orange-50', badgeText: 'text-orange-700', accentBorder: 'border-l-orange-500' },
} as const;
type ExtLeadStatus = keyof typeof LEAD_TOKEN;

const INVOICE_STATUS = {
  paid:    { label: 'Cobrada',   bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-l-emerald-400' },
  pending: { label: 'Pendiente', bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   border: 'border-l-amber-400' },
  overdue: { label: 'Vencida',   bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     border: 'border-l-red-400' },
  draft:   { label: 'Borrador',  bg: 'bg-gray-100 dark:bg-gray-700',    text: 'text-gray-600 dark:text-gray-400',    dot: 'bg-gray-400',    border: 'border-l-gray-300' },
};

// ─── AddClientModal (helpers at module scope so inner inputs keep focus on re-render) ─

function addClientInputClass(err?: string, disabled?: boolean) {
  return `w-full px-3.5 py-2.5 text-sm border-2 rounded-xl focus:outline-none transition-all ${
    disabled ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-100 dark:border-gray-800'
    : err ? 'border-red-300 focus:border-red-400'
    : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
  }`;
}

function AddClientLbl({ label, id, req, err, children }: { label: string; id: string; req?: boolean; err?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
        {label}{req && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
}

function AddClientSec({ title }: { title: string }) {
  return (
    <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">{title}</p>
  );
}

function AddClientModal({ onClose, onAdd }: { onClose: () => void; onAdd: (c: Client) => Promise<Client | void> | void }) {
  useModalClose(true, onClose);
  const { currentBusiness } = useBusiness();
  const modalBranches = currentBusiness?.branches ?? [];
  const [clientType, setClientType] = useState<'particular' | 'empresa'>('particular');
  const [sendInvite, setSendInvite] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', email: '',
    dni: '',
    razonSocial: '', cif: '', contactName: '',
    fiscalName: '', fiscalNif: '', fiscalAddress: '', fiscalCity: '', fiscalPostalCode: '', fiscalCountry: 'España',
    sameAsContact: false,
    address: '', city: '', postalCode: '',
    responsible: 'Juan García', branch_id: '', notes: '',
    dataProcessing: false, commercial: false, thirdParty: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const handleSameAsContact = (checked: boolean) => {
    if (checked) {
      setForm(f => ({
        ...f,
        sameAsContact: true,
        fiscalName: clientType === 'empresa' ? f.razonSocial : f.name,
        fiscalNif: clientType === 'empresa' ? f.cif : f.dni,
        fiscalAddress: f.address,
        fiscalCity: f.city,
        fiscalPostalCode: f.postalCode,
      }));
    } else {
      set('sameAsContact', false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim())  e.name  = 'Obligatorio';
    if (!form.phone.trim()) e.phone = 'Obligatorio';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email no válido';
    if (sendInvite && !form.email.trim()) e.email = 'Requerido para enviar invitación';
    if (clientType === 'empresa') {
      if (!form.cif.trim()) {
        e.cif = 'Obligatorio';
      } else {
        const cifErr = getCifError(form.cif);
        if (cifErr) e.cif = cifErr;
      }
    } else if (form.dni.trim()) {
      const dniErr = getDniOrNieError(form.dni);
      if (dniErr) e.dni = dniErr;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const newClient: Client = {
      id: `client-${Date.now()}`,
      name: form.name.trim(),
      dni: clientType === 'empresa' ? form.cif.trim() : form.dni.trim(),
      phone: form.phone.trim(), email: form.email.trim(),
      address: form.address, city: form.city, postalCode: form.postalCode,
      status: 'active', responsible: form.responsible,
      branch_id: form.branch_id || undefined,
      createdAt: new Date().toISOString().split('T')[0], notes: form.notes,
      consents: { dataProcessing: form.dataProcessing, commercial: form.commercial, thirdParty: form.thirdParty },
      documentsCount: 0,
    };
    await onAdd(newClient);
    if (sendInvite && form.email) { setInviteSent(true); return; }
    onClose();
  };

  if (inviteSent) return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">¡Cliente creado!</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Invitación enviada a</p>
        <p className="text-sm font-semibold text-blue-600 mb-5">{form.email}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-6">
          El cliente recibirá un enlace seguro para completar sus datos personales, fiscales y firmar los consentimientos RGPD desde su dispositivo.
        </p>
        <button onClick={onClose} className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors">
          Entendido
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Nuevo cliente</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">Crear ficha de cliente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">

            {/* ── Tipo ── */}
            <div>
              <AddClientSec title="Tipo de cliente" />
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'particular', label: 'Particular', icon: '👤', desc: 'Persona física' },
                  { id: 'empresa',    label: 'Empresa',    icon: '🏢', desc: 'Persona jurídica' },
                ] as const).map(opt => (
                  <button key={opt.id} type="button" onClick={() => setClientType(opt.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      clientType === opt.id ? 'border-gray-900 bg-gray-900' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}>
                    <span className="text-xl">{opt.icon}</span>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${clientType === opt.id ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>{opt.label}</p>
                      <p className={`text-xs ${clientType === opt.id ? 'text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>{opt.desc}</p>
                    </div>
                    {clientType === opt.id && <Check className="w-4 h-4 text-white flex-shrink-0" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Datos de contacto ── */}
            <div>
              <AddClientSec title={clientType === 'empresa' ? 'Datos de la empresa' : 'Datos personales'} />
              <div className="space-y-3">
                {clientType === 'empresa' && (
                  <AddClientLbl label="Razón social" id="razonSocial" req>
                    <input id="razonSocial" value={form.razonSocial} onChange={e => set('razonSocial', e.target.value)}
                      placeholder="Coches García S.L." className={addClientInputClass()} />
                  </AddClientLbl>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {clientType === 'empresa' ? (
                    <AddClientLbl label="CIF" id="cif" req err={errors.cif}>
                      <input id="cif" value={form.cif} onChange={e => set('cif', e.target.value.toUpperCase())}
                        placeholder="B12345678" className={addClientInputClass(errors.cif)} />
                    </AddClientLbl>
                  ) : (
                    <AddClientLbl label="DNI / NIE" id="dni" err={errors.dni}>
                      <input id="dni" value={form.dni} onChange={e => set('dni', e.target.value.toUpperCase())}
                        placeholder="12345678A" className={addClientInputClass(errors.dni)} />
                    </AddClientLbl>
                  )}
                  <AddClientLbl label="Teléfono" id="phone" req err={errors.phone}>
                    <input id="phone" value={form.phone} onChange={e => set('phone', e.target.value)}
                      placeholder="666 000 000" className={addClientInputClass(errors.phone)} />
                  </AddClientLbl>
                </div>
                <AddClientLbl label={clientType === 'empresa' ? 'Nombre del contacto principal' : 'Nombre completo'} id="name" req err={errors.name}>
                  <input id="name" value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder={clientType === 'empresa' ? 'Nombre y apellidos' : 'Ej. Roberto Jiménez García'}
                    className={addClientInputClass(errors.name)} />
                </AddClientLbl>
                <AddClientLbl label="Email" id="email" req={sendInvite} err={errors.email}>
                  <input id="email" type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="cliente@email.com" className={addClientInputClass(errors.email)} />
                </AddClientLbl>
              </div>
            </div>

            {/* ── Dirección postal ── */}
            <div>
              <AddClientSec title="Dirección postal" />
              <div className="space-y-3">
                <AddClientLbl label="Dirección" id="address">
                  <input id="address" value={form.address} onChange={e => set('address', e.target.value)}
                    placeholder="Calle, número, piso…" className={addClientInputClass()} />
                </AddClientLbl>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <AddClientLbl label="Ciudad" id="city">
                      <input id="city" value={form.city} onChange={e => set('city', e.target.value)}
                        placeholder="Madrid" className={addClientInputClass()} />
                    </AddClientLbl>
                  </div>
                  <AddClientLbl label="C.P." id="postalCode">
                    <input id="postalCode" value={form.postalCode} onChange={e => set('postalCode', e.target.value)}
                      placeholder="28001" className={addClientInputClass()} />
                  </AddClientLbl>
                </div>
              </div>
            </div>

            {/* ── Datos fiscales ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <AddClientSec title="Datos fiscales" />
                <label className="flex items-center gap-2 cursor-pointer -mt-3">
                  <button type="button" onClick={() => handleSameAsContact(!form.sameAsContact)}
                    className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${
                      form.sameAsContact ? 'bg-gray-900 border-gray-900' : 'border-gray-300'
                    }`}>
                    {form.sameAsContact && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Mismos que contacto</span>
                </label>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <AddClientLbl label={clientType === 'empresa' ? 'Razón social fiscal' : 'Nombre fiscal'} id="fiscalName">
                    <input id="fiscalName" value={form.fiscalName} onChange={e => set('fiscalName', e.target.value)}
                      disabled={form.sameAsContact}
                      placeholder={clientType === 'empresa' ? 'Empresa S.L.' : 'Nombre completo'}
                      className={addClientInputClass(undefined, form.sameAsContact)} />
                  </AddClientLbl>
                  <AddClientLbl label={clientType === 'empresa' ? 'CIF fiscal' : 'NIF'} id="fiscalNif">
                    <input id="fiscalNif" value={form.fiscalNif} onChange={e => set('fiscalNif', e.target.value)}
                      disabled={form.sameAsContact}
                      placeholder={clientType === 'empresa' ? 'B12345678' : '12345678A'}
                      className={addClientInputClass(undefined, form.sameAsContact)} />
                  </AddClientLbl>
                </div>
                <AddClientLbl label="Dirección fiscal" id="fiscalAddress">
                  <input id="fiscalAddress" value={form.fiscalAddress} onChange={e => set('fiscalAddress', e.target.value)}
                    disabled={form.sameAsContact} placeholder="Dirección completa"
                    className={addClientInputClass(undefined, form.sameAsContact)} />
                </AddClientLbl>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <AddClientLbl label="Ciudad fiscal" id="fiscalCity">
                      <input id="fiscalCity" value={form.fiscalCity} onChange={e => set('fiscalCity', e.target.value)}
                        disabled={form.sameAsContact} placeholder="Madrid"
                        className={addClientInputClass(undefined, form.sameAsContact)} />
                    </AddClientLbl>
                  </div>
                  <AddClientLbl label="C.P. fiscal" id="fiscalPostalCode">
                    <input id="fiscalPostalCode" value={form.fiscalPostalCode} onChange={e => set('fiscalPostalCode', e.target.value)}
                      disabled={form.sameAsContact} placeholder="28001"
                      className={addClientInputClass(undefined, form.sameAsContact)} />
                  </AddClientLbl>
                </div>
                <AddClientLbl label="País" id="fiscalCountry">
                  <select id="fiscalCountry" value={form.fiscalCountry} onChange={e => set('fiscalCountry', e.target.value)}
                    disabled={form.sameAsContact} className={addClientInputClass(undefined, form.sameAsContact) + ' bg-white dark:bg-gray-800'}>
                    {['España', 'Portugal', 'Francia', 'Alemania', 'Italia', 'Reino Unido', 'Otro'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </AddClientLbl>
              </div>
            </div>

            {/* ── Asignación ── */}
            <div>
              <AddClientSec title="Asignación" />
              <div className="space-y-3">
                <AddClientLbl label="Responsable" id="responsible">
                  <select id="responsible" value={form.responsible} onChange={e => set('responsible', e.target.value)}
                    className={addClientInputClass() + ' bg-white dark:bg-gray-800'}>
                    {['Juan García', 'María López', 'Carlos Ruiz', 'Ana Torres'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </AddClientLbl>
                {modalBranches.length > 0 && (
                  <AddClientLbl label="Punto de Venta" id="branch_id">
                    <select id="branch_id" value={form.branch_id} onChange={e => set('branch_id', e.target.value)}
                      className={addClientInputClass() + ' bg-white dark:bg-gray-800'}>
                      <option value="">Sin punto de venta asignado</option>
                      {modalBranches.map(b => (
                        <option key={b.branch_id} value={b.branch_id}>{b.name}{b.city ? ` — ${b.city}` : ''}</option>
                      ))}
                    </select>
                  </AddClientLbl>
                )}
                <AddClientLbl label="Notas" id="notes">
                  <textarea id="notes" value={form.notes} onChange={e => set('notes', e.target.value)}
                    placeholder="Observaciones sobre el cliente…" rows={2}
                    className={addClientInputClass() + ' resize-none'} />
                </AddClientLbl>
              </div>
            </div>

            {/* ── Consentimientos RGPD ── */}
            <div>
              <AddClientSec title="Consentimientos RGPD" />
              <div className="space-y-2.5">
                {([
                  { key: 'dataProcessing', label: 'Tratamiento de datos personales', req: true },
                  { key: 'commercial',     label: 'Comunicaciones comerciales' },
                  { key: 'thirdParty',     label: 'Cesión a terceros' },
                ] as const).map(({ key, label, req }) => (
                  <label key={key} className="flex items-start gap-3 cursor-pointer group">
                    <button type="button" onClick={() => set(key, !form[key])}
                      className={`mt-0.5 w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                        form[key] ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-400'
                      }`}>
                      {form[key] && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-300 leading-tight">
                      {label}{req && <span className="text-red-500 ml-0.5">*</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* ── Portal del cliente ── */}
            <div className={`rounded-2xl border-2 transition-all overflow-hidden ${sendInvite ? 'border-blue-300 bg-blue-50' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}>
              <button type="button" onClick={() => setSendInvite(v => !v)}
                className="w-full flex items-start gap-4 p-4 text-left">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                  sendInvite ? 'bg-blue-500' : 'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700'
                }`}>
                  {sendInvite ? <Check className="w-5 h-5 text-white" strokeWidth={3} /> : <span className="text-lg">✉️</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${sendInvite ? 'text-blue-900' : 'text-gray-900 dark:text-gray-100'}`}>
                    Enviar invitación al portal del cliente
                  </p>
                  <p className={`text-xs mt-0.5 leading-relaxed ${sendInvite ? 'text-blue-700' : 'text-gray-400 dark:text-gray-500'}`}>
                    El cliente podrá completar sus datos, subir documentos y firmar consentimientos desde su móvil
                  </p>
                </div>
              </button>
              {sendInvite && (
                <div className="px-4 pb-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 p-3">
                    <p className="text-xs font-semibold text-blue-800 mb-2">El cliente podrá desde el portal:</p>
                    <ul className="space-y-1.5">
                      {[
                        'Completar sus datos personales y fiscales',
                        'Subir su DNI / documentación requerida',
                        'Firmar consentimientos RGPD digitalmente',
                        'Consultar el estado de sus vehículos y contratos',
                      ].map(item => (
                        <li key={item} className="flex items-start gap-2 text-xs text-blue-700">
                          <span className="text-blue-400 mt-0.5 flex-shrink-0">✓</span>{item}
                        </li>
                      ))}
                    </ul>
                    {!form.email && (
                      <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        ⚠️ Introduce el email del cliente para enviar la invitación
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer — sticky al borde inferior del modal */}
          <div className="sticky bottom-0 z-10 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/95 dark:backdrop-blur-sm flex items-center gap-3 flex-shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors flex items-center justify-center gap-2 ${
                sendInvite ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-black'
              }`}>
              {sendInvite ? '✉️ Crear y enviar invitación' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ColFilter ────────────────────────────────────────────────────────────────

function ColFilter({
  label, options, selected, onChange, renderOption,
  sortKey, currentSort, onSort, align = 'left',
}: {
  label: string; options: string[]; selected: string[];
  onChange: (vals: string[]) => void;
  renderOption?: (val: string) => React.ReactNode;
  sortKey?: string; currentSort?: SortState;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [innerSearch, setInnerSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const isActive = selected.length > 0;
  const isSorted = !!(sortKey && currentSort?.key === sortKey);
  const sortDir  = isSorted ? currentSort!.dir : null;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setInnerSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  const visible = innerSearch.trim() ? options.filter(o => o.toLowerCase().includes(innerSearch.toLowerCase())) : options;
  const handleSort = (dir: 'asc' | 'desc') => {
    if (sortKey && onSort) isSorted && sortDir === dir ? onSort('', dir) : onSort(sortKey, dir);
  };
  const hasSort    = !!(sortKey && onSort);
  const hasOptions = options.length > 0;

  return (
    <div ref={ref} className="relative inline-flex">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 transition-colors ${isActive || isSorted ? 'text-amber-700' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'}`}>
        <span className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{label}</span>
        {isActive && (
          <span className="bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
            {selected.length}
          </span>
        )}
        {isSorted && !isActive && (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-500 flex-shrink-0" /> : <ArrowDown className="w-3 h-3 text-amber-500 flex-shrink-0" />
        )}
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isActive || isSorted ? 'text-amber-600' : 'text-gray-400 dark:text-gray-500'}`} />
      </button>

      {open && (
        <div className={`absolute top-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 w-56 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {hasSort && (
            <div className="px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-gray-800">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Ordenar</p>
              <div className="flex gap-1.5">
                <button onClick={() => handleSort('asc')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    isSorted && sortDir === 'asc' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>
                  <ArrowUp className="w-3 h-3" /> Asc
                </button>
                <button onClick={() => handleSort('desc')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    isSorted && sortDir === 'desc' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>
                  <ArrowDown className="w-3 h-3" /> Desc
                </button>
              </div>
            </div>
          )}
          {hasOptions && (
            <>
              <div className="px-2.5 pt-2 pb-1">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Filtrar</p>
                  {isActive && (
                    <button onClick={() => onChange([])} className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-500 flex items-center gap-0.5">
                      <X className="w-2.5 h-2.5" /> Limpiar
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="w-3 h-3 text-gray-400 dark:text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input value={innerSearch} onChange={e => setInnerSearch(e.target.value)} placeholder="Buscar..."
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-400 focus:outline-none"
                    onClick={e => e.stopPropagation()} />
                </div>
              </div>
              <div className="px-1.5 pb-1 max-h-44 overflow-y-auto">
                {visible.map(opt => {
                  const checked = selected.includes(opt);
                  return (
                    <button key={opt} onClick={() => toggle(opt)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${checked ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <span className={`w-4 h-4 rounded-md flex-shrink-0 flex items-center justify-center border-2 ${checked ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                        {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{renderOption ? renderOption(opt) : opt}</span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-gray-400 dark:text-gray-500">{selected.length > 0 ? `${selected.length} sel.` : 'Ninguno'}</span>
                <button onClick={() => { setOpen(false); setInnerSearch(''); }}
                  className="text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 px-2.5 py-1 rounded-lg">Aplicar</button>
              </div>
            </>
          )}
          {!hasOptions && hasSort && (
            <div className="px-3 py-2 flex justify-end">
              <button onClick={() => setOpen(false)} className="text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 px-2.5 py-1 rounded-lg">Cerrar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── InvoiceTypeSelectModal ───────────────────────────────────────────────────

type InvoiceCreationType = 'direct' | 'from-quote' | 'from-order' | 'credit-note';

const INVOICE_TYPE_OPTIONS: {
  id: InvoiceCreationType;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  tag?: string;
  tagColor?: string;
}[] = [
  {
    id: 'from-quote',
    icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
    title: 'Desde presupuesto',
    description: 'Convierte un presupuesto aprobado en factura',
    tag: 'Recomendado',
    tagColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  },
  {
    id: 'from-order',
    icon: ClipboardList,
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
    title: 'Desde pedido / orden',
    description: 'Genera la factura a partir de un pedido existente',
  },
  {
    id: 'direct',
    icon: Zap,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    title: 'Factura directa',
    description: 'Crea una factura desde cero con todos los datos',
  },
  {
    id: 'credit-note',
    icon: RotateCcw,
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    title: 'Abono / Rectificativa',
    description: 'Genera un abono total o parcial sobre una factura existente',
  },
];

function InvoiceTypeSelectModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (type: InvoiceCreationType) => void;
}) {
  useModalClose(true, onClose);
  const [hoveredId, setHoveredId] = useState<InvoiceCreationType | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center">
              <ReceiptText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Nueva factura</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">Selecciona cómo quieres crear la factura</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Options */}
        <div className="p-4 sm:p-5 space-y-2.5 overflow-y-auto flex-1">
          {INVOICE_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isHovered = hoveredId === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onSelect(opt.id)}
                onMouseEnter={() => setHoveredId(opt.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left group ${
                  isHovered
                    ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform ${opt.iconBg} ${isHovered ? 'scale-110' : ''}`}>
                  <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{opt.title}</p>
                    {opt.tag && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${opt.tagColor}`}>{opt.tag}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{opt.description}</p>
                </div>
                <ExternalLink className={`w-4 h-4 flex-shrink-0 transition-all ${isHovered ? 'text-emerald-500 translate-x-0.5' : 'text-gray-300 dark:text-gray-600'}`} />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NewInvoiceModal ──────────────────────────────────────────────────────────

interface InvoiceLine { id: string; description: string; qty: number; price: number; tax: number; }

const PREDEFINED_SERVICES: { category: string; items: { label: string; price: number; tax: number }[] }[] = [
  {
    category: 'Vehículo',
    items: [
      { label: 'Venta de vehículo',           price: 0,    tax: 21 },
      { label: 'Preparación y limpieza',       price: 150,  tax: 21 },
      { label: 'Transporte / entrega',         price: 200,  tax: 21 },
      { label: 'Inspección técnica (ITV)',      price: 75,   tax: 21 },
      { label: 'Reparación / taller',          price: 0,    tax: 21 },
    ],
  },
  {
    category: 'Garantía y seguros',
    items: [
      { label: 'Garantía adicional 1 año',     price: 399,  tax: 21 },
      { label: 'Garantía adicional 2 años',    price: 699,  tax: 21 },
      { label: 'Seguro todo riesgo (mensual)',  price: 89,   tax: 0  },
      { label: 'Seguro a terceros (mensual)',   price: 49,   tax: 0  },
    ],
  },
  {
    category: 'Trámites',
    items: [
      { label: 'Gestión de transferencia',     price: 120,  tax: 21 },
      { label: 'Cambio de titularidad',        price: 80,   tax: 21 },
      { label: 'Informe DGT',                  price: 25,   tax: 21 },
      { label: 'Trámites de documentación',    price: 60,   tax: 21 },
    ],
  },
  {
    category: 'Financiación',
    items: [
      { label: 'Comisión de apertura',         price: 0,    tax: 21 },
      { label: 'Gastos de estudio financiero', price: 50,   tax: 21 },
    ],
  },
];

const TAX_OPTIONS = [0, 4, 10, 21];
const INV_PAY_METHODS = ['Transferencia', 'Efectivo', 'Tarjeta', 'Financiación', 'Bizum', 'PayPal', 'Otros'];

function NewInvoiceModal({ onClose, onAdd, clients: initialClients, onCreateClient }: {
  onClose: () => void;
  onAdd: (inv: Invoice) => Promise<void> | void;
  clients: Client[];
  onCreateClient?: (client: Client) => Promise<Client | void> | Client | void;
}) {
  useModalClose(true, onClose);
  const [mode,          setMode]          = useState<'concepts' | 'services'>('concepts');
  const [clientId,      setClientId]      = useState('');
  const [invoiceNum,    setInvoiceNum]    = useState(`FAC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`);
  const [issueDate,     setIssueDate]     = useState(new Date().toISOString().split('T')[0]);
  const [dueDate,       setDueDate]       = useState('');
  const [vehicleName,   setVehicleName]   = useState('');
  const [vehiclePlate,  setVehiclePlate]  = useState('');
  const [payMethod,     setPayMethod]     = useState('Transferencia');
  const [notes,         setNotes]         = useState('');
  const [lines,         setLines]         = useState<InvoiceLine[]>([
    { id: '1', description: '', qty: 1, price: 0, tax: 21 },
  ]);
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [serviceSearch, setServiceSearch] = useState('');
  const [openCategory,  setOpenCategory]  = useState<string | null>(PREDEFINED_SERVICES[0].category);
  const [showAddClient, setShowAddClient] = useState(false);
  const [localClients,  setLocalClients]  = useState<Client[]>([]);

  const clients = Array.from(
    new Map([...initialClients, ...localClients].map((client) => [client.id, client])).values(),
  );

  const handleNewClient = async (c: Client) => {
    const createdClient = (await onCreateClient?.(c)) || c;
    setLocalClients(prev =>
      prev.some((client) => client.id === createdClient.id) ? prev : [...prev, createdClient],
    );
    setClientId(createdClient.id);
    setShowAddClient(false);
  };

  const addLine = () => setLines(l => [...l, { id: Date.now().toString(), description: '', qty: 1, price: 0, tax: 21 }]);
  const removeLine = (id: string) => setLines(l => l.filter(x => x.id !== id));
  const updateLine = (id: string, key: keyof InvoiceLine, val: string | number) =>
    setLines(l => l.map(x => x.id === id ? { ...x, [key]: val } : x));
  const addService = (item: { label: string; price: number; tax: number }) =>
    setLines(l => [...l, { id: Date.now().toString(), description: item.label, qty: 1, price: item.price, tax: item.tax }]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const taxTotal  = lines.reduce((s, l) => s + l.qty * l.price * (l.tax / 100), 0);
  const total     = subtotal + taxTotal;

  const filteredServices = PREDEFINED_SERVICES.map(cat => ({
    ...cat,
    items: serviceSearch ? cat.items.filter(i => i.label.toLowerCase().includes(serviceSearch.toLowerCase())) : cat.items,
  })).filter(cat => !serviceSearch || cat.items.length > 0);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!clientId)       e.client = 'Selecciona un cliente';
    if (total <= 0)      e.total  = 'Añade al menos un concepto con precio';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const client = clients.find(c => c.id === clientId);
    const inv: Invoice = {
      id: `inv-${Date.now()}`,
      clientId,
      number: invoiceNum,
      clientName: client?.name || '',
      vehicleName, vehiclePlate,
      date: issueDate,
      dueDate: dueDate || issueDate,
      total: Math.round(total),
      paid: 0,
      status: 'pending',
      paymentMethod: payMethod,
      notes,
    };
    await onAdd(inv);
    onClose();
  };

  const inp = (err?: string) =>
    `w-full px-3 py-2 text-sm border-2 rounded-xl focus:outline-none transition-all ${err ? 'border-red-300 focus:border-red-400' : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94dvh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Receipt className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Nueva factura</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{invoiceNum}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500 dark:text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            {/* ── Cabecera factura ── */}
            <div>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Datos de la factura</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nº Factura</label>
                  <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} className={inp()} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Método de pago</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className={inp() + ' bg-white dark:bg-gray-800'}>
                    {INV_PAY_METHODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha emisión</label>
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp()} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha vencimiento</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp()} />
                </div>
              </div>
            </div>

            {/* ── Cliente ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Cliente</p>
                <button type="button" onClick={() => setShowAddClient(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-3 h-3" /> Añadir cliente
                </button>
              </div>

              {/* Selector con preview del cliente seleccionado */}
              {clientId ? (
                <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${errors.client ? 'border-red-300' : 'border-emerald-400 bg-emerald-50'}`}>
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{clients.find(c => c.id === clientId)?.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{clients.find(c => c.id === clientId)?.dni}</p>
                  </div>
                  <button type="button" onClick={() => setClientId('')}
                    className="p-1.5 hover:bg-emerald-200 rounded-lg transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-emerald-700" />
                  </button>
                </div>
              ) : (
                <select value={clientId} onChange={e => setClientId(e.target.value)} className={inp(errors.client) + ' bg-white dark:bg-gray-800'}>
                  <option value="">— Seleccionar cliente —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name} · {c.dni}</option>)}
                </select>
              )}
              {errors.client && <p className="text-xs text-red-500 mt-1">{errors.client}</p>}
            </div>

            {/* ── Vehículo (opcional) ── */}
            <div>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Vehículo <span className="text-gray-300 normal-case font-normal">(opcional)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Vehículo</label>
                  <input value={vehicleName} onChange={e => setVehicleName(e.target.value)} placeholder="BMW X3 2020" className={inp()} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Matrícula</label>
                  <input value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value.toUpperCase())} placeholder="1234-ABC" className={inp() + ' font-mono'} />
                </div>
              </div>
            </div>

            {/* ── Modo de entrada ── */}
            <div>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Conceptos</p>
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-4">
                <button type="button" onClick={() => setMode('concepts')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${mode === 'concepts' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                  <FileText className="w-3.5 h-3.5" /> Concepto libre
                </button>
                <button type="button" onClick={() => setMode('services')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${mode === 'services' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                  <Package className="w-3.5 h-3.5" /> Servicios predefinidos
                </button>
              </div>

              {/* Modo: servicios predefinidos */}
              {mode === 'services' && (
                <div className="mb-4">
                  <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input value={serviceSearch} onChange={e => setServiceSearch(e.target.value)}
                      placeholder="Buscar servicio…"
                      className="w-full pl-8 pr-3 py-2 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {filteredServices.map(cat => (
                      <div key={cat.category} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                        <button type="button" onClick={() => setOpenCategory(openCategory === cat.category ? null : cat.category)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{cat.category}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-[10px]">{cat.items.length} servicios</span>
                        </button>
                        {openCategory === cat.category && (
                          <div className="divide-y divide-gray-100">
                            {cat.items.map(item => (
                              <button key={item.label} type="button" onClick={() => addService(item)}
                                className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-blue-50 transition-colors text-left group">
                                <div>
                                  <p className="text-sm text-gray-800 dark:text-gray-200 group-hover:text-blue-800">{item.label}</p>
                                  <p className="text-xs text-gray-400 dark:text-gray-500">IVA {item.tax}%</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{item.price > 0 ? `${item.price.toLocaleString('es-ES')}€` : '—'}</span>
                                  <Plus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {lines.filter(l => l.description).length > 0 && (
                    <p className="text-xs text-blue-600 mt-2 font-semibold">{lines.filter(l => l.description).length} concepto(s) añadido(s) ↓</p>
                  )}
                </div>
              )}

              {/* Tabla de líneas */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 grid grid-cols-12 gap-0 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="col-span-5 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Descripción</div>
                  <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center">Cant.</div>
                  <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Precio</div>
                  <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">IVA</div>
                  <div className="col-span-1" />
                </div>
                <div className="divide-y divide-gray-100">
                  {lines.map((line, idx) => (
                    <div key={line.id} className="grid grid-cols-12 gap-1.5 px-3 py-2 items-center">
                      <div className="col-span-5">
                        <input value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)}
                          placeholder={`Concepto ${idx + 1}`}
                          className="w-full text-sm border-0 focus:outline-none text-gray-800 dark:text-gray-200 placeholder-gray-300 bg-transparent" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min={1} value={line.qty} onChange={e => updateLine(line.id, 'qty', Number(e.target.value))}
                          className="w-full text-sm text-center border border-gray-200 dark:border-gray-700 rounded-lg px-1.5 py-1 focus:outline-none focus:border-blue-400" />
                      </div>
                      <div className="col-span-2">
                        <div className="relative">
                          <input type="number" min={0} step={0.01} value={line.price} onChange={e => updateLine(line.id, 'price', Number(e.target.value))}
                            className="w-full text-sm text-right border border-gray-200 dark:border-gray-700 rounded-lg pr-4 pl-1.5 py-1 focus:outline-none focus:border-blue-400" />
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">€</span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <select value={line.tax} onChange={e => updateLine(line.id, 'tax', Number(e.target.value))}
                          className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-1 py-1 focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 text-right">
                          {TAX_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
                        </select>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(line.id)} className="p-1 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800">
                  <button type="button" onClick={addLine}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold">
                    <Plus className="w-3.5 h-3.5" /> Añadir línea
                  </button>
                </div>
              </div>

              {/* Totales */}
              <div className="mt-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>{subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1"><BadgePercent className="w-3.5 h-3.5" /> IVA</span>
                  <span>{taxTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Total</span>
                  <span className="text-base font-bold text-gray-900 dark:text-gray-100">{total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                </div>
                {errors.total && <p className="text-xs text-red-500">{errors.total}</p>}
              </div>
            </div>

            {/* ── Notas ── */}
            <div>
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Notas / condiciones</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Condiciones de pago, observaciones…"
                className={inp() + ' resize-none'} />
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex gap-3 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Receipt className="w-4 h-4" /> Crear factura
            </button>
          </div>
        </form>
      </div>

      {/* Modal nuevo cliente inline */}
      <NuevoClienteModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        onClientCreated={(client) => {
          handleNewClient(client);
          setShowAddClient(false);
        }}
        contexto="factura"
      />
    </div>
  );
}

// ─── InvoiceDetailModal ───────────────────────────────────────────────────────

function InvoiceDetailModal({ invoice, onClose, onUpdate, onDelete }: {
  invoice: Invoice;
  onClose: () => void;
  onUpdate: (updated: Invoice) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  useModalClose(true, onClose);
  const [updating, setUpdating] = useState(false);

  const s = INVOICE_STATUS[invoice.status];
  const pending = invoice.total - invoice.paid;
  const pct = invoice.total > 0 ? Math.min(100, Math.round((invoice.paid / invoice.total) * 100)) : 0;

  const handleMarkPaid = async () => {
    setUpdating(true);
    try {
      await onUpdate({ ...invoice, paid: invoice.total, status: 'paid' });
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkPending = async () => {
    setUpdating(true);
    try {
      await onUpdate({ ...invoice, status: 'pending' });
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar la factura ${invoice.number}?`)) return;
    setUpdating(true);
    try {
      await onDelete(invoice.id);
    } finally {
      setUpdating(false);
    }
  };

  const handleDownloadPdf = () => {
    generateInvoicePdf({
      number: invoice.number,
      date: invoice.date,
      dueDate: invoice.dueDate,
      issuer: { companyName: '' },
      recipient: { name: invoice.clientName },
      lines: [{
        description: invoice.vehicleName || 'Servicio',
        quantity: 1,
        unitPrice: invoice.total,
        taxRate: 0,
      }],
      notes: invoice.notes,
      payMethod: invoice.paymentMethod,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`px-6 py-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r ${
          invoice.status === 'paid' ? 'from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30' :
          invoice.status === 'overdue' ? 'from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30' :
          invoice.status === 'draft' ? 'from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900' :
          'from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                <Receipt className={`w-5 h-5 ${s.text}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Factura</p>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 font-mono">{invoice.number}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${s.bg} ${s.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </span>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Client & Vehicle */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Cliente</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{invoice.clientName}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Vehículo</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{invoice.vehicleName || '—'}</p>
              {invoice.vehiclePlate && (
                <span className="inline-block mt-1 font-mono text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">{invoice.vehiclePlate}</span>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Fecha de emisión</p>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {new Date(invoice.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Vencimiento</p>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                <p className={`text-sm ${invoice.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                  {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Payment method */}
          {invoice.paymentMethod && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Forma de pago</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{invoice.paymentMethod}</p>
            </div>
          )}

          {/* Amounts */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Total factura</span>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{invoice.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Cobrado</span>
              <span className="text-sm font-semibold text-emerald-600">{invoice.paid.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
            </div>
            {pending > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Pendiente</span>
                <span className="text-sm font-semibold text-red-600">{pending.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
              </div>
            )}
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-gray-400 dark:text-gray-500">{pct}% cobrado</span>
                {pct === 100
                  ? <span className="text-emerald-500 font-semibold">Completo</span>
                  : <span className="text-amber-500 font-semibold">{pending.toLocaleString('es-ES')} € pendiente</span>
                }
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Notas</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex flex-wrap gap-2">
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
          {invoice.status !== 'paid' && (
            <button
              onClick={handleMarkPaid}
              disabled={updating}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              Marcar cobrada
            </button>
          )}
          {invoice.status === 'paid' && (
            <button
              onClick={handleMarkPending}
              disabled={updating}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <Calendar className="w-3.5 h-3.5" />
              Marcar pendiente
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={handleDelete}
            disabled={updating}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LeadStatus }) {
  const t = LEAD_TOKEN[status as ExtLeadStatus];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${t.badgeBg} ${t.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />{t.label}
    </span>
  );
}
function ClientStatusBadge({ status }: { status: 'active' | 'inactive' }) {
  return status === 'active'
    ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Activo</span>
    : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Inactivo</span>;
}
function InvoiceBadge({ status }: { status: Invoice['status'] }) {
  const s = INVOICE_STATUS[status];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${s.bg} ${s.text}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span>;
}

// ─── ViewToggle ───────────────────────────────────────────────────────────────

function ViewToggle({ view, setView }: { view: 'cards' | 'table'; setView: (v: 'cards' | 'table') => void }) {
  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1 flex-shrink-0">
      <button onClick={() => setView('cards')}
        className={`p-1.5 rounded-lg transition-colors ${view === 'cards' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => setView('table')}
        className={`p-1.5 rounded-lg transition-colors ${view === 'table' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
        <List className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ClientsPage({ embedDeliveryOps }: ClientsPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const leadIdParam = searchParams.get('leadId');
  const {
    user,
    clients: contextClients,
    leads: contextLeads,
    vehicles,
    isLoadingClients,
    addLead,
    addClient,
    updateLead,
    deleteLead,
    deleteClient,
  } = useApp();
  const { user: authUser } = useAuth();
  const { currentBusiness } = useBusiness();
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const invoicesStorageKey = user?.id ? `vertial-crm-invoices:${user.id}` : 'vertial-crm-invoices:guest';

  const branches = useMemo(() => currentBusiness?.branches ?? [], [currentBusiness]);
  const isDeliveryBusiness = currentBusiness?.businessType === 'delivery';
  const clientColDefsForUi = useMemo(
    () => (isDeliveryBusiness ? CLIENT_COL_DEFS.filter((c) => c.id !== 'responsable') : CLIENT_COL_DEFS),
    [isDeliveryBusiness],
  );
  const viewClientDetail = useCallback((clientId: string) => {
    const path = `/saas/crm/clientes/${clientId}`;
    if (embedDeliveryOps) {
      navigate(path, { state: { returnToOps: true } });
      return;
    }
    navigate(path);
  }, [embedDeliveryOps, navigate]);

  const [activeTab,               setActiveTab]               = useState<ClientTabId>('clients');
  const [activePill,              setActivePill]              = useState<LeadPill>('all');
  const [leadsView,               setLeadsView]               = useState<'cards' | 'table'>('table');
  const [clientsView,             setClientsView]             = useState<'cards' | 'table'>('table');
  const [billingView,             setBillingView]             = useState<'cards' | 'table'>('cards');
  const [selectedInvoice,         setSelectedInvoice]         = useState<Invoice | null>(null);
  const [selectedLead,            setSelectedLead]            = useState<Lead | null>(null);
  const [showLeadDrawer,          setShowLeadDrawer]          = useState(false);
  const [showNewLeadModal,        setShowNewLeadModal]        = useState(false);
  const [showAddClientModal,      setShowAddClientModal]      = useState(false);
  const [showConvertModal,        setShowConvertModal]        = useState(false);
  const [showCreateContractModal, setShowCreateContractModal] = useState(false);
  const [crmImportMode,           setCrmImportMode]           = useState<'leads' | 'clients' | null>(null);
  const [showAIClientModal,       setShowAIClientModal]       = useState(false);
  const [showDuplicates,          setShowDuplicates]          = useState(false);
  const [showSegmentBuilder,      setShowSegmentBuilder]      = useState(false);
  const [segmentConditions,       setSegmentConditions]       = useState<FilterCondition[]>([]);
  const [leadToConvert,           setLeadToConvert]           = useState<Lead | null>(null);
  const [selectedClient,          setSelectedClient]          = useState<Client | null>(null);
  const [searchQuery,             setSearchQuery]             = useState('');
  const [filterLeadTag,           setFilterLeadTag]           = useState<string>('');
  const [filterClientTag,         setFilterClientTag]         = useState<string>('');
  const [filterBranch,            setFilterBranch]            = useState<string>('all');
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');
  const { focus: activationFocus, clearFocus: clearActivationFocus } = useActivationFocus();

  useEffect(() => {
    if (!activationFocus) return;
    if (activationFocus === 'client-add') {
      setShowAddClientModal(true);
      clearActivationFocus();
    } else if (activationFocus === 'client-import') {
      setCrmImportMode('clients');
      clearActivationFocus();
    }
  }, [activationFocus, clearActivationFocus]);

  // ── Col-filter state: Leads ────────────────────────────────────────────────
  const [lFilterName,        setLFilterName]        = useState<string[]>([]);
  const [lFilterStatus,      setLFilterStatus]      = useState<string[]>([]);
  const [lFilterVehicle,     setLFilterVehicle]     = useState<string[]>([]);
  const [lFilterResponsible, setLFilterResponsible] = useState<string[]>([]);
  const [lSort,              setLSort]              = useState<SortState>(null);

  // ── Col-filter state: Clients ──────────────────────────────────────────────
  const [cFilterName,   setCFilterName]   = useState<string[]>([]);
  const [cFilterStatus, setCFilterStatus] = useState<string[]>([]);
  const [cFilterCity,   setCFilterCity]   = useState<string[]>([]);
  const [cSort,         setCSort]         = useState<SortState>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [assignmentRules, setAssignmentRules] = useState<AssignmentRule[]>([]);
  const [loadingAutomation, setLoadingAutomation] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleHours, setNewRuleHours] = useState('24');
  const [newRuleFromUser, setNewRuleFromUser] = useState('');
  const [newRuleToUser, setNewRuleToUser] = useState('');
  const [newRuleStrategy, setNewRuleStrategy] = useState<'specific' | 'roundrobin' | 'leastload'>('specific');
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({
    enabled: false,
    maxResponseHours: 4,
    alertAfterHours: 2,
    applyToStatuses: ['new'],
    escalationUser: '',
  });

  const CLIENT_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre completo' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'dni', label: 'DNI / NIF / CIF' },
    { key: 'address', label: 'Dirección' },
    { key: 'city', label: 'Ciudad' },
    { key: 'postalCode', label: 'Código postal' },
    { key: 'notes', label: 'Notas' },
  ];

  const allLeads = useMemo<Lead[]>(
    () =>
      (contextLeads || [])
        .filter((lead) => ['new', 'contacted', 'appointment', 'reserved', 'lost'].includes(lead.status))
        .map((lead) => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email || '',
          status: lead.status as LeadStatus,
          vehicleInterest: lead.vehicleInterest || lead.interestedVehicle || 'Sin vehículo definido',
          vehicleInterestId: lead.vehicleInterestId || '',
          budget: lead.budget || '',
          notes: lead.notes || '',
          source: lead.source || 'web',
          responsible: lead.responsible || 'Sin asignar',
          branch_id: lead.branch_id || '',
          workCenterId: (lead as { workCenterId?: string }).workCenterId || '',
          createdAt: lead.createdAt instanceof Date ? lead.createdAt.toISOString() : String(lead.createdAt),
        })),
    [contextLeads],
  );

  const baseClients = useMemo<Client[]>(() => {
    const fromCtx = (contextClients || []).map((c, i) => {
      const location = resolveClientLocationFields(c);
      return {
      id: c.id,
      name: c.name,
      dni: c.dni || `${12000000 + i}X`,
      phone: c.phone,
      email: c.email,
      address: location.address,
      city: location.city,
      postalCode: location.postalCode,
      status: c.status,
      responsible: c.responsible || 'Sin asignar',
      branch_id: c.branch_id || '',
      workCenterId: (c as { workCenterId?: string }).workCenterId || '',
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      consents: c.consents || { dataProcessing: false, commercial: false, thirdParty: false },
      notes: c.notes,
      vehiclesPurchased: c.vehiclesPurchased || [],
      vehiclesSold: c.vehiclesSold || [],
      documentsCount: c.documentsCount || c.documentsList?.length || 0,
    };
    });
    return fromCtx;
  }, [contextClients]);
  const allClients = useMemo(() => baseClients, [baseClients]);

  useEffect(() => {
    let cancelled = false;

    const loadInvoices = async () => {
      if (!user?.id) {
        try {
          const saved = localStorage.getItem(invoicesStorageKey);
          if (saved && !cancelled) {
            setInvoices(JSON.parse(saved) as Invoice[]);
            return;
          }
        } catch (error) {
          console.error('Error loading guest invoices:', error);
        }
        if (!cancelled) {
          setInvoices([]);
        }
        return;
      }

      try {
        const storedInvoices = await listClientInvoicesRequest(user.id);
        if (!cancelled) {
          setInvoices(storedInvoices.map((invoice) => ({
            id: invoice.id,
            clientId: invoice.clientId,
            number: invoice.number,
            clientName: invoice.clientName,
            vehicleName: invoice.vehicleName,
            vehiclePlate: invoice.vehiclePlate,
            date: invoice.date,
            dueDate: invoice.dueDate,
            total: invoice.total,
            paid: invoice.paid,
            status: invoice.status,
            paymentMethod: invoice.paymentMethod || '',
            notes: invoice.notes || '',
          })));
        }
      } catch (error) {
        console.error('Error loading invoices from CouchDB:', error);
        try {
          const saved = localStorage.getItem(invoicesStorageKey);
          if (saved && !cancelled) {
            setInvoices(JSON.parse(saved) as Invoice[]);
          }
        } catch (storageError) {
          console.error('Error loading invoice cache:', storageError);
        }
      }
    };

    void loadInvoices();

    return () => {
      cancelled = true;
    };
  }, [invoicesStorageKey, user?.id]);

  useEffect(() => {
    localStorage.setItem(invoicesStorageKey, JSON.stringify(invoices));
  }, [invoices, invoicesStorageKey]);

  const allInvoices = useMemo<Invoice[]>(() => invoices, [invoices]);

  // ── Counts ─────────────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all:         allLeads.length,
    new:         allLeads.filter(l => l.status === 'new').length,
    contacted:   allLeads.filter(l => l.status === 'contacted').length,
    appointment: allLeads.filter(l => l.status === 'appointment').length,
    reserved:    allLeads.filter(l => l.status === 'reserved').length,
    lost:        allLeads.filter(l => l.status === 'lost').length,
  }), [allLeads]);

  // ── Options for ColFilter ──────────────────────────────────────────────────

  const lNameOptions        = useMemo(() => [...new Set(allLeads.map(l => l.name))].sort(), [allLeads]);
  const lStatusOptions      = useMemo(() => [...new Set(allLeads.map(l => LEAD_TOKEN[l.status as ExtLeadStatus]?.label ?? l.status))].sort(), [allLeads]);
  const lVehicleOptions     = useMemo(() => [...new Set(allLeads.map(l => l.vehicleInterest))].sort(), [allLeads]);
  const lResponsibleOptions = useMemo(() => [...new Set(allLeads.map(l => l.responsible))].sort(), [allLeads]);

  const cNameOptions   = useMemo(() => [...new Set(allClients.map(c => c.name))].sort(), [allClients]);
  const cStatusOptions = ['Activo', 'Inactivo'];
  const cCityOptions   = useMemo(() => [...new Set(allClients.map(c => c.city).filter(Boolean) as string[])].sort(), [allClients]);

  // ── Filtered leads ─────────────────────────────────────────────────────────

  const filteredLeads = useMemo(() => {
    let r = activePill === 'all' ? allLeads : allLeads.filter(l => l.status === activePill);
    if (filterBranch !== 'all') {
      r = r.filter(l => l.branch_id === filterBranch);
    }
    r = r.filter((l) => !(filterWorkCenter !== 'all' && (l as any).workCenterId !== filterWorkCenter));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(l => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || l.phone.includes(q) || l.vehicleInterest.toLowerCase().includes(q));
    }
    if (filterLeadTag) {
      r = r.filter(l => {
        const ctxLead = contextLeads?.find(cl => cl.id === l.id);
        return ctxLead?.tags?.includes(filterLeadTag);
      });
    }
    if (lFilterName.length)        r = r.filter(l => lFilterName.includes(l.name));
    if (lFilterStatus.length)      r = r.filter(l => lFilterStatus.includes(LEAD_TOKEN[l.status as ExtLeadStatus]?.label ?? l.status));
    if (lFilterVehicle.length)     r = r.filter(l => lFilterVehicle.includes(l.vehicleInterest));
    if (lFilterResponsible.length) r = r.filter(l => lFilterResponsible.includes(l.responsible));
    if (lSort?.key) {
      const { key, dir } = lSort; const mul = dir === 'asc' ? 1 : -1;
      r = [...r].sort((a, b) => {
        if (key === 'name')        return a.name.localeCompare(b.name, 'es') * mul;
        if (key === 'status')      return a.status.localeCompare(b.status) * mul;
        if (key === 'vehicle')     return a.vehicleInterest.localeCompare(b.vehicleInterest, 'es') * mul;
        if (key === 'responsible') return a.responsible.localeCompare(b.responsible, 'es') * mul;
        if (key === 'createdAt')   return a.createdAt.localeCompare(b.createdAt) * mul;
        return 0;
      });
    }
    if (segmentConditions.length > 0 && (activeTab === 'leads' || activeTab !== 'clients')) {
      const ctxMap = new Map((contextLeads || []).map(l => [l.id, l]));
      r = applySegmentFilters(r.map(l => ({ ...l, ...ctxMap.get(l.id) } as unknown as Lead)), segmentConditions) as Lead[];
    }
    return r;
  }, [allLeads, activePill, filterBranch, filterWorkCenter, searchQuery, lFilterName, lFilterStatus, lFilterVehicle, lFilterResponsible, lSort, segmentConditions, activeTab, contextLeads]);

  // ── Filtered clients ───────────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    let r = allClients.slice();
    if (filterBranch !== 'all') {
      r = r.filter(c => c.branch_id === filterBranch);
    }
    r = r.filter((c) => !(filterWorkCenter !== 'all' && (c as any).workCenterId !== filterWorkCenter));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q) || c.dni.toLowerCase().includes(q));
    }
    if (filterClientTag) {
      r = r.filter(c => {
        const ctxClient = contextClients?.find(cc => cc.id === c.id);
        return ctxClient?.tags?.includes(filterClientTag);
      });
    }
    if (cFilterName.length)   r = r.filter(c => cFilterName.includes(c.name));
    if (cFilterStatus.length) r = r.filter(c => cFilterStatus.includes(c.status === 'active' ? 'Activo' : 'Inactivo'));
    if (cFilterCity.length)   r = r.filter(c => c.city && cFilterCity.includes(c.city));
    if (cSort?.key) {
      const { key, dir } = cSort; const mul = dir === 'asc' ? 1 : -1;
      r = [...r].sort((a, b) => {
        if (key === 'name')   return a.name.localeCompare(b.name, 'es') * mul;
        if (key === 'status') return a.status.localeCompare(b.status) * mul;
        if (key === 'city')   return (a.city || '').localeCompare(b.city || '', 'es') * mul;
        return 0;
      });
    }
    if (segmentConditions.length > 0 && activeTab === 'clients') {
      const ctxMap = new Map((contextClients || []).map(c => [c.id, c]));
      r = applySegmentFilters(r.map(c => ({ ...c, ...ctxMap.get(c.id) } as unknown as Client)), segmentConditions) as Client[];
    }
    return r;
  }, [allClients, filterBranch, filterWorkCenter, searchQuery, cFilterName, cFilterStatus, cFilterCity, cSort, segmentConditions, activeTab, contextClients]);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery) return allInvoices;
    const q = searchQuery.toLowerCase();
    return allInvoices.filter(i => i.number.toLowerCase().includes(q));
  }, [allInvoices, searchQuery]);

  const { paginated: paginatedLeads, pagination: leadsPagination } = usePagination(filteredLeads, 20);
  const { paginated: paginatedClients, pagination: clientsPagination } = usePagination(filteredClients, 20);

  const getTabFromParam = useCallback((rawTab: string | null): ClientTabId | null => {
    if (!rawTab) return null;
    const normalized = rawTab.trim().toLowerCase();
    if (normalized === 'leads' || normalized === 'clients' || normalized === 'billing' || normalized === 'alerts') {
      return normalized;
    }
    if (normalized === 'lead') {
      return 'leads';
    }
    if (normalized === 'facturacion' || normalized === 'facturación') {
      return 'billing';
    }
    if (normalized === 'alertas') {
      return 'alerts';
    }
    return null;
  }, []);

  const updateTabQueryParam = useCallback((tab: ClientTabId) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tab);
    if (tab !== 'leads') {
      nextParams.delete('leadId');
    }
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (embedDeliveryOps) return;
    const parsedTab = getTabFromParam(tabParam);
    if (parsedTab) {
      setActiveTab(parsedTab);
      if (tabParam !== parsedTab) {
        updateTabQueryParam(parsedTab);
      }
    }
  }, [embedDeliveryOps, tabParam, getTabFromParam, updateTabQueryParam]);

  useEffect(() => {
    if (embedDeliveryOps) return;
    if (!leadIdParam) {
      return;
    }

    const lead = allLeads.find((item) => item.id === leadIdParam);
    if (lead) {
      setActiveTab('leads');
      setSelectedLead(lead);
      setShowLeadDrawer(true);
    }
  }, [embedDeliveryOps, allLeads, leadIdParam]);

  useEffect(() => {
    if (!embedDeliveryOps) return;
    setActiveTab('clients');
  }, [embedDeliveryOps]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const [billingPill, setBillingPill] = useState<Invoice['status'] | 'all'>('all');
  const [billingSubTab, setBillingSubTab] = useState<'list' | 'create' | 'detail'>('list');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [showInvoiceTypeModal, setShowInvoiceTypeModal] = useState(false);
  const [invForm, setInvForm] = useState<{
    clientId: string; invoiceNum: string; issueDate: string; dueDate: string;
    vehicleName: string; vehiclePlate: string; payMethod: string; notes: string;
    lines: InvoiceLine[];
  }>({
    clientId: '', invoiceNum: `FAC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
    issueDate: new Date().toISOString().split('T')[0], dueDate: '', vehicleName: '', vehiclePlate: '',
    payMethod: 'Transferencia', notes: '',
    lines: [{ id: '1', description: '', qty: 1, price: 0, tax: 21 }],
  });
  const [invFormErrors, setInvFormErrors] = useState<Record<string, string>>({});
  const [invSaving, setInvSaving] = useState(false);

  const resetInvForm = useCallback(() => {
    setInvForm({
      clientId: '', invoiceNum: `FAC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
      issueDate: new Date().toISOString().split('T')[0], dueDate: '', vehicleName: '', vehiclePlate: '',
      payMethod: 'Transferencia', notes: '',
      lines: [{ id: '1', description: '', qty: 1, price: 0, tax: 21 }],
    });
    setInvFormErrors({});
    setEditingInvoiceId(null);
  }, []);

  const handleInvoiceTypeSelect = useCallback((selection: InvoiceTypeSelection) => {
    setShowInvoiceTypeModal(false);
    const { type } = selection;
    if (type === 'direct') {
      resetInvForm();
      setBillingSubTab('create');
    } else if (type === 'from-quote' && selection.quote) {
      const q = selection.quote;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      setInvForm({
        clientId: q.clientId || '',
        invoiceNum: `FAC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        vehicleName: q.vehicleName || '',
        vehiclePlate: q.vehiclePlate || '',
        payMethod: q.paymentMethod || 'Transferencia',
        notes: `Generada desde presupuesto ${q.number}`,
        lines: q.lines.length > 0
          ? q.lines.map(l => ({
              id: l.id,
              description: l.description,
              qty: l.quantity,
              price: l.unitPrice * (1 - l.discountPercent / 100),
              tax: l.taxRate,
            }))
          : [{ id: '1', description: q.vehicleName || 'Servicio', qty: 1, price: q.total, tax: 0 }],
      });
      setInvFormErrors({});
      setEditingInvoiceId(null);
      setBillingSubTab('create');
    } else if (type === 'from-order' && selection.order) {
      const o = selection.order;
      setInvForm({
        clientId: '',
        invoiceNum: `FAC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        vehicleName: '',
        vehiclePlate: '',
        payMethod: 'Transferencia',
        notes: `Generada desde pedido ${o.orderNumber} — ${o.supplierName}`,
        lines: o.items.length > 0
          ? o.items.map(item => ({
              id: item.id,
              description: item.name,
              qty: item.quantity,
              price: item.unitCost,
              tax: o.taxRate ?? 21,
            }))
          : [{ id: '1', description: o.supplierName, qty: 1, price: o.total, tax: 0 }],
      });
      setInvFormErrors({});
      setEditingInvoiceId(null);
      setBillingSubTab('create');
    } else if (type === 'credit-note' && selection.sourceInvoice) {
      const src = selection.sourceInvoice;
      const amount = selection.creditNoteMode === 'partial' && selection.partialAmount
        ? selection.partialAmount
        : src.total;
      setInvForm({
        clientId: src.clientId || '',
        invoiceNum: `ABONO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        vehicleName: src.vehicleName || '',
        vehiclePlate: src.vehiclePlate || '',
        payMethod: src.paymentMethod || 'Transferencia',
        notes: `Abono ${selection.creditNoteMode === 'partial' ? 'parcial' : 'total'} sobre factura ${src.number}`,
        lines: [{ id: '1', description: `Abono sobre factura ${src.number}`, qty: 1, price: -Math.abs(amount), tax: 0 }],
      });
      setInvFormErrors({});
      setEditingInvoiceId(null);
      setBillingSubTab('create');
    }
  }, [resetInvForm]);

  const invSubtotal = invForm.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const invTaxTotal = invForm.lines.reduce((s, l) => s + l.qty * l.price * (l.tax / 100), 0);
  const invTotal = invSubtotal + invTaxTotal;

  const handleInvStartEdit = useCallback((inv: Invoice) => {
    setInvForm({
      clientId: inv.clientId || '',
      invoiceNum: inv.number,
      issueDate: inv.date.slice(0, 10),
      dueDate: inv.dueDate?.slice(0, 10) || '',
      vehicleName: inv.vehicleName,
      vehiclePlate: inv.vehiclePlate,
      payMethod: inv.paymentMethod || 'Transferencia',
      notes: inv.notes || '',
      lines: [{ id: '1', description: inv.vehicleName || 'Servicio', qty: 1, price: inv.total, tax: 0 }],
    });
    setEditingInvoiceId(inv.id);
    setBillingSubTab('create');
  }, []);

  const handleInvSaveEdit = useCallback(async () => {
    if (!editingInvoiceId) return;
    const original = invoices.find((i) => i.id === editingInvoiceId);
    if (!original) return;
    if (!invForm.clientId) { setInvFormErrors({ client: 'Selecciona un cliente' }); return; }
    if (invTotal <= 0) { setInvFormErrors({ total: 'Añade al menos un concepto con precio' }); return; }
    setInvSaving(true);
    try {
      const client = allClients.find(c => c.id === invForm.clientId);
      const updated: Invoice = {
        ...original,
        clientId: invForm.clientId,
        clientName: client?.name || original.clientName,
        number: invForm.invoiceNum,
        vehicleName: invForm.vehicleName,
        vehiclePlate: invForm.vehiclePlate,
        date: invForm.issueDate,
        dueDate: invForm.dueDate || invForm.issueDate,
        total: Math.round(invTotal),
        paymentMethod: invForm.payMethod,
        notes: invForm.notes,
      };
      if (authUser?.user_id) {
        const result = await updateClientInvoiceRequest(authUser.user_id, {
          id: updated.id, clientId: updated.clientId || '', clientName: updated.clientName,
          number: updated.number, vehicleName: updated.vehicleName, vehiclePlate: updated.vehiclePlate,
          date: updated.date, dueDate: updated.dueDate, total: updated.total, paid: updated.paid,
          status: updated.status, paymentMethod: updated.paymentMethod || '', notes: updated.notes || '',
          createdAt: updated.date,
        });
        if (result) {
          setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
          setSelectedInvoice(updated);
        }
      } else {
        setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
        setSelectedInvoice(updated);
      }
      resetInvForm();
      setBillingSubTab('detail');
    } finally {
      setInvSaving(false);
    }
  }, [editingInvoiceId, invoices, invForm, invTotal, allClients, authUser?.user_id, resetInvForm]);

  const handleTabChange = useCallback((tab: ClientTabId) => {
    setActiveTab(tab);
    setSearchQuery('');
    setActivePill('all');
    updateTabQueryParam(tab);
  }, [updateTabQueryParam]);

  const loadAutomationSettings = useCallback(async () => {
    if (!authUser?.user_id) return;
    setLoadingAutomation(true);
    try {
      const [rules, sla] = await Promise.all([
        listAssignmentRulesRequest(authUser.user_id),
        getSlaConfigRequest(authUser.user_id),
      ]);
      setAssignmentRules(rules);
      if (sla) setSlaConfig(sla);
    } catch {
      toast.error('No se pudo cargar configuración de asignación/SLA');
    } finally {
      setLoadingAutomation(false);
    }
  }, [authUser?.user_id]);

  useEffect(() => {
    if (activeTab === 'alerts' && authUser?.user_id) {
      void loadAutomationSettings();
    }
  }, [activeTab, authUser?.user_id, loadAutomationSettings]);

  const handleCreateRule = async () => {
    if (!authUser?.user_id || !newRuleName.trim()) {
      toast.error('Pon un nombre para la regla');
      return;
    }
    setSavingAutomation(true);
    try {
      const created = await createAssignmentRuleRequest(authUser.user_id, {
        name: newRuleName.trim(),
        inactiveHours: Math.max(1, Number(newRuleHours || 1)),
        fromUser: newRuleFromUser.trim(),
        toUser: newRuleToUser.trim(),
        toStrategy: newRuleStrategy,
        enabled: true,
      });
      if (created) {
        setAssignmentRules((prev) => [created, ...prev]);
        setNewRuleName('');
        setNewRuleHours('24');
        setNewRuleFromUser('');
        setNewRuleToUser('');
        setNewRuleStrategy('specific');
        toast.success('Regla creada');
      }
    } catch {
      toast.error('No se pudo crear la regla');
    } finally {
      setSavingAutomation(false);
    }
  };

  const toggleRule = async (rule: AssignmentRule) => {
    if (!authUser?.user_id) return;
    const updated = await updateAssignmentRuleRequest(authUser.user_id, rule.id, { enabled: !rule.enabled });
    if (updated) {
      setAssignmentRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  };

  const removeRule = async (ruleId: string) => {
    if (!authUser?.user_id) return;
    await deleteAssignmentRuleRequest(authUser.user_id, ruleId);
    setAssignmentRules((prev) => prev.filter((r) => r.id !== ruleId));
    toast.success('Regla eliminada');
  };

  const handleSaveSla = async () => {
    if (!authUser?.user_id) return;
    setSavingAutomation(true);
    try {
      const saved = await saveSlaConfigRequest(authUser.user_id, {
        ...slaConfig,
        maxResponseHours: Math.max(1, Number(slaConfig.maxResponseHours || 1)),
        alertAfterHours: Math.max(1, Number(slaConfig.alertAfterHours || 1)),
      });
      if (saved) {
        setSlaConfig(saved);
        toast.success('SLA guardado');
      }
    } catch {
      toast.error('No se pudo guardar el SLA');
    } finally {
      setSavingAutomation(false);
    }
  };

  const handleLeadClick      = (lead: Lead)     => { navigate(`/saas/crm/clientes/${lead.id}`); };
  const handleConvertLead    = (lead: Lead)      => { setLeadToConvert(lead); setShowConvertModal(true); setShowLeadDrawer(false); };
  const handleCreateContract = (client: Client)  => { setSelectedClient(client); setShowCreateContractModal(true); };
  const handleAddInvoice = async (inv: Invoice) => {
    if (!user?.id) {
      setInvoices(prev => [inv, ...prev]);
      return;
    }

    const createdInvoice = await createClientInvoiceRequest(user.id, {
      clientId: inv.clientId || '',
      clientName: inv.clientName,
      number: inv.number,
      vehicleName: inv.vehicleName,
      vehiclePlate: inv.vehiclePlate,
      date: inv.date,
      dueDate: inv.dueDate,
      total: inv.total,
      paid: inv.paid,
      status: inv.status,
      paymentMethod: inv.paymentMethod || '',
      notes: inv.notes || '',
    });

    if (createdInvoice) {
      setInvoices(prev => [
        {
          id: createdInvoice.id,
          clientId: createdInvoice.clientId,
          number: createdInvoice.number,
          clientName: createdInvoice.clientName,
          vehicleName: createdInvoice.vehicleName,
          vehiclePlate: createdInvoice.vehiclePlate,
          date: createdInvoice.date,
          dueDate: createdInvoice.dueDate,
          total: createdInvoice.total,
          paid: createdInvoice.paid,
          status: createdInvoice.status,
          paymentMethod: createdInvoice.paymentMethod || '',
          notes: createdInvoice.notes || '',
        },
        ...prev,
      ]);
    }
  };

  const handleAddLead = async (data: any) => {
    await addLead({
      name: data.name,
      phone: data.phone,
      email: data.email || '',
      source: data.source || 'web',
      interestedVehicle: data.vehicleInterest || '',
      vehicleInterest: data.vehicleInterest || '',
      vehicleInterestId: data.vehicleInterestId || '',
      budget: data.budget || '',
      notes: data.notes || '',
      responsible: data.responsible || 'Sin asignar',
      branch_id: data.branch_id || undefined,
    });
    setShowNewLeadModal(false);
  };

  const handleAddClient = async (client: Client) => {
    await addClient({
      name: client.name,
      phone: client.phone,
      email: client.email,
      dni: client.dni,
      address: client.address,
      city: client.city,
      postalCode: client.postalCode,
      status: client.status,
      responsible: client.responsible,
      branch_id: client.branch_id || undefined,
      notes: client.notes,
      consents: client.consents,
      vehiclesPurchased: client.vehiclesPurchased,
      vehiclesSold: client.vehiclesSold,
      documentsCount: client.documentsCount,
      interactions: [],
      documentsList: [],
    });
  };

  const handleConvertLeadToClient = async (data: any) => {
    if (!leadToConvert) {
      return;
    }

    const createdClient = await addClient({
      name: data.name || leadToConvert.name,
      phone: data.phone || leadToConvert.phone,
      email: data.email || leadToConvert.email,
      dni: data.dni || '',
      address: data.address || '',
      city: data.city || '',
      postalCode: data.postalCode || '',
      status: 'active',
      responsible: leadToConvert.responsible,
      notes: data.notes || leadToConvert.notes,
      consents: {
        dataProcessing: Boolean(data.consentDataProcessing),
        commercial: Boolean(data.consentCommercial),
        thirdParty: Boolean(data.consentThirdParty),
      },
      vehiclesPurchased: leadToConvert.vehicleInterest ? [leadToConvert.vehicleInterest] : [],
      vehiclesSold: [],
      documentsCount: 0,
      interactions: [
        {
          id: `interaction-${Date.now()}`,
          type: 'note',
          title: 'Lead convertido a cliente',
          description: `Conversión desde lead con origen ${leadToConvert.source}.`,
          date: new Date().toISOString(),
          user: leadToConvert.responsible || 'Sistema',
        },
      ],
      documentsList: [],
    });

    if (!createdClient) {
      return;
    }

    const conversionNotes = [leadToConvert.notes, data.notes]
      .filter((value, index, items) => Boolean(value) && items.indexOf(value) === index)
      .join('\n\n');

    await updateLead(leadToConvert.id, {
      status: 'won',
      notes: conversionNotes,
      lastContact: new Date(),
      convertedAt: new Date(),
      convertedToClientId: createdClient.id,
      convertedToClientName: createdClient.name,
    });

    setShowConvertModal(false);
    setLeadToConvert(null);
  };

  const handleExportClients = async () => {
    if (filteredClients.length === 0) {
      toast.error('No hay clientes para exportar');
      return;
    }
    try {
      const rows = filteredClients.map((c) => ({
        Nombre: c.name,
        Teléfono: c.phone,
        Email: c.email,
        'DNI/NIF': c.dni,
        Calle: c.address || '',
        Ciudad: c.city || '',
        'C.P.': c.postalCode || '',
        Estado: c.status === 'active' ? 'Activo' : 'Inactivo',
        Responsable: c.responsible || '',
      }));
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      XLSX.writeFile(wb, `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Exportados ${rows.length} clientes`);
    } catch {
      toast.error('No se pudo exportar el Excel');
    }
  };

  const handleExportInvoices = () => {
    if (filteredBilling.length === 0) {
      return;
    }

    const rows = [
      ['Numero', 'Cliente', 'Vehiculo', 'Matricula', 'Fecha', 'Vencimiento', 'Estado', 'Total', 'Cobrado'],
      ...filteredBilling.map((invoice) => [
        invoice.number,
        invoice.clientName,
        invoice.vehicleName,
        invoice.vehiclePlate,
        invoice.date,
        invoice.dueDate,
        INVOICE_STATUS[invoice.status].label,
        String(invoice.total),
        String(invoice.paid),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `facturas-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const lActiveFilters = lFilterName.length + lFilterStatus.length + lFilterVehicle.length + lFilterResponsible.length + (filterBranch !== 'all' ? 1 : 0) + (filterWorkCenter !== 'all' ? 1 : 0);
  const cActiveFilters = cFilterName.length + cFilterStatus.length + cFilterCity.length + (filterBranch !== 'all' ? 1 : 0) + (filterWorkCenter !== 'all' ? 1 : 0);
  const clearLFilters  = () => { setLFilterName([]); setLFilterStatus([]); setLFilterVehicle([]); setLFilterResponsible([]); setLSort(null); setFilterBranch('all'); setFilterWorkCenter('all'); };
  const clearCFilters  = () => { setCFilterName([]); setCFilterStatus([]); setCFilterCity([]); setCSort(null); setFilterBranch('all'); setFilterWorkCenter('all'); };

  const { visibleColumns: visibleLeadCols, visibleIds: visibleLeadColIds, columnOrder: leadColOrder, toggleColumn: toggleLeadCol, reorderColumns: reorderLeadCols, resetToDefault: resetLeadCols } = useColumnPreferences('leads', LEAD_COL_DEFS);
  const clientColPrefsKey = isDeliveryBusiness ? 'clients-delivery' : 'clients';
  const { visibleColumns: visibleClientCols, visibleIds: visibleClientColIds, columnOrder: clientColOrder, toggleColumn: toggleClientCol, reorderColumns: reorderClientCols, resetToDefault: resetClientCols } = useColumnPreferences(clientColPrefsKey, clientColDefsForUi);


  const PILLS: { id: LeadPill; label: string }[] = [
    { id: 'all',         label: 'Todos' },
    { id: 'new',         label: 'Nuevos' },
    { id: 'contacted',   label: 'Contactados' },
    { id: 'appointment', label: 'Cita' },
    { id: 'reserved',    label: 'Reserva' },
    { id: 'lost',        label: 'Perdidos' },
  ];

  // ─── Tab: Leads ───────────────────────────────────────────────────────────

  const renderLeadsTab = () => (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {branches.length > 0 && (
          <div className="relative flex-shrink-0">
            <Store className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <select
              value={filterBranch}
              onChange={e => setFilterBranch(e.target.value)}
              className={`pl-7 pr-7 py-2.5 border-2 rounded-xl text-xs font-semibold focus:outline-none transition-all appearance-none bg-white dark:bg-gray-800 ${
                filterBranch !== 'all'
                  ? 'border-violet-400 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <option value="all">Todos los PDV</option>
              {branches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
        )}
        <ViewToggle view={leadsView} setView={setLeadsView} />
        <button onClick={() => navigate('/saas/pipeline')} title="Vista Pipeline"
          className="flex-shrink-0 p-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl transition-colors">
          <Kanban className="w-4 h-4" />
        </button>
        <button onClick={() => setShowDuplicates(true)} title="Detectar duplicados"
          className="flex-shrink-0 p-2.5 border-2 border-amber-200 hover:border-amber-300 text-amber-600 rounded-xl transition-colors">
          <AlertTriangle className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowSegmentBuilder(prev => !prev)}
          title="Segmentación avanzada"
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 border-2 rounded-xl transition-colors text-sm font-semibold ${
            segmentConditions.length > 0
              ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          {segmentConditions.length > 0 && <span className="text-xs bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center">{segmentConditions.length}</span>}
        </button>
        <ActivationFieldWrap fieldKey="client-import" activeKey={activationFocus}>
          <button onClick={() => setCrmImportMode('leads')} title="Importar leads desde CSV"
            className="flex-shrink-0 p-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl transition-colors">
            <Upload className="w-4 h-4" />
          </button>
        </ActivationFieldWrap>
        <button onClick={() => setShowNewLeadModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Lead</span>
        </button>
      </div>

      {/* Segment Builder */}
      {showSegmentBuilder && (
        <div className="mt-3">
          <SegmentBuilder
            entityType={activeTab === 'clients' ? 'clients' : 'leads'}
            conditions={segmentConditions}
            onChange={setSegmentConditions}
            resultCount={activeTab === 'clients' ? filteredClients.length : filteredLeads.length}
            onClose={() => setShowSegmentBuilder(false)}
          />
        </div>
      )}

      {/* Filtro por tags */}
      {(() => {
        const allLeadTags = Array.from(new Set(
          (contextLeads || []).flatMap(l => l.tags || [])
        )).sort();
        if (allLeadTags.length === 0) return null;
        return (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <Tag className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <button onClick={() => setFilterLeadTag('')}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${!filterLeadTag ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
              Todas las etiquetas
            </button>
            {allLeadTags.map(tag => (
              <button key={tag} onClick={() => setFilterLeadTag(filterLeadTag === tag ? '' : tag)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${filterLeadTag === tag ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                {tag}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Chips en una línea */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {PILLS.map(pill => {
          const isActive = activePill === pill.id;
          return (
            <button key={pill.id} onClick={() => setActivePill(pill.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all whitespace-nowrap ${
                isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
              }`}>
              {pill.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{counts[pill.id]}</span>
            </button>
          );
        })}
        {(activePill !== 'all' || searchQuery || lActiveFilters > 0) && (
          <>
            <div className="flex-shrink-0 w-px h-4 bg-gray-200 mx-1" />
            <button onClick={() => { setActivePill('all'); setSearchQuery(''); clearLFilters(); }}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold text-red-500 hover:bg-red-50 border-2 border-transparent transition-all whitespace-nowrap">
              <X className="w-3 h-3" /> Limpiar
            </button>
          </>
        )}
      </div>

      {/* Pills de Puntos de Venta — Leads */}
      {branches.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <Store className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <button onClick={() => setFilterBranch('all')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
              filterBranch === 'all'
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300'
            }`}>
            Todos los PDV
          </button>
          {branches.map(b => (
            <button key={b.branch_id} onClick={() => setFilterBranch(filterBranch === b.branch_id ? 'all' : b.branch_id)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                filterBranch === b.branch_id
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300'
              }`}>
              {b.name}
              {b.city && <span className="ml-1 opacity-60">· {b.city}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Skeleton Cards — Leads */}
      {leadsView === 'cards' && isLoadingClients && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-5 w-20 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="flex gap-4">
                <div className="h-3 w-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-28 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="h-8 bg-blue-50 rounded-xl animate-pulse" />
              <div className="flex justify-between">
                <div className="h-3 w-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cards */}
      {leadsView === 'cards' && !isLoadingClients && (
        filteredLeads.length > 0 ? (
          <div className="space-y-3">
            {paginatedLeads.map(lead => {
              const t = LEAD_TOKEN[lead.status as ExtLeadStatus];
              return (
                <div key={lead.id} onClick={() => handleLeadClick(lead)}
                  className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 ${t.accentBorder} rounded-2xl p-4 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 leading-tight">{lead.name}</h3>
                    <StatusBadge status={lead.status} />
                  </div>
                  <div className="flex flex-wrap gap-3 mb-2">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><Phone className="w-3.5 h-3.5" />{lead.phone}</div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0"><Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{lead.email}</span></div>
                  </div>
                  <div className="flex items-center gap-1.5 p-2.5 bg-blue-50 rounded-xl mb-2">
                    <Car className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    <p className="text-xs font-semibold text-blue-800 truncate">{lead.vehicleInterest}</p>
                    {lead.budget && <span className="ml-auto text-xs text-blue-600 flex-shrink-0">{lead.budget}</span>}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span>{lead.source}</span>
                    <span>{new Date(lead.createdAt).toLocaleDateString('es-ES')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <EmptyState
              type={searchQuery || activePill !== 'all' ? 'search' : 'clients'}
              title={searchQuery || activePill !== 'all' ? 'Sin resultados' : 'No hay leads aún'}
              description={
                searchQuery || activePill !== 'all'
                  ? 'Ningún lead coincide con los filtros activos.'
                  : 'Registra tu primer lead para comenzar a gestionar tu pipeline de ventas.'
              }
              ctaLabel={!searchQuery && activePill === 'all' ? 'Añadir primer lead' : undefined}
              onCta={!searchQuery && activePill === 'all' ? () => setShowNewLeadModal(true) : undefined}
            />
          </div>
        )
      )}

      {/* Tabla con ColFilter */}
      {leadsView === 'table' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredLeads.length}</span> lead{filteredLeads.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              {(lActiveFilters > 0 || lSort) && (
                <button onClick={clearLFilters} className="text-xs text-red-500 font-medium flex items-center gap-1"><X className="w-3 h-3" /> Limpiar filtros</button>
              )}
              <ColumnCustomizer columns={LEAD_COL_DEFS} visibleIds={visibleLeadColIds} columnOrder={leadColOrder} onToggle={toggleLeadCol} onReorder={reorderLeadCols} onReset={resetLeadCols} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                  <th className="w-1 px-0" />
                  {visibleLeadCols.includes('nombre') && (
                    <th className="px-5 py-3 text-left">
                      <ColFilter label="Nombre" options={lNameOptions} selected={lFilterName} onChange={setLFilterName}
                        sortKey="name" currentSort={lSort} onSort={(k, d) => setLSort(k ? { key: k, dir: d } : null)} />
                    </th>
                  )}
                  {visibleLeadCols.includes('estado') && (
                    <th className="px-5 py-3 text-left">
                      <ColFilter label="Estado" options={lStatusOptions} selected={lFilterStatus} onChange={setLFilterStatus}
                        sortKey="status" currentSort={lSort} onSort={(k, d) => setLSort(k ? { key: k, dir: d } : null)}
                        renderOption={opt => { const e = Object.values(LEAD_TOKEN).find(t => t.label === opt); return <span className="flex items-center gap-2">{e && <span className={`w-2 h-2 rounded-full ${e.dot}`} />}{opt}</span>; }} />
                    </th>
                  )}
                  {visibleLeadCols.includes('vehiculo') && (
                    <th className="px-5 py-3 text-left">
                      <ColFilter label="Vehículo" options={lVehicleOptions} selected={lFilterVehicle} onChange={setLFilterVehicle}
                        sortKey="vehicle" currentSort={lSort} onSort={(k, d) => setLSort(k ? { key: k, dir: d } : null)} />
                    </th>
                  )}
                  {visibleLeadCols.includes('responsable') && (
                    <th className="px-5 py-3 text-left">
                      <ColFilter label="Responsable" options={lResponsibleOptions} selected={lFilterResponsible} onChange={setLFilterResponsible}
                        sortKey="responsible" currentSort={lSort} onSort={(k, d) => setLSort(k ? { key: k, dir: d } : null)} />
                    </th>
                  )}
                  {visibleLeadCols.includes('fecha') && (
                    <th className="px-5 py-3 text-left">
                      <ColFilter label="Fecha" options={[]} selected={[]} onChange={() => {}}
                        sortKey="createdAt" currentSort={lSort} onSort={(k, d) => setLSort(k ? { key: k, dir: d } : null)} />
                    </th>
                  )}
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredLeads.length === 0 ? (
                  <tr><td colSpan={visibleLeadCols.length + 2} className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">Sin resultados</td></tr>
                ) : paginatedLeads.map(lead => {
                  const t = LEAD_TOKEN[lead.status as ExtLeadStatus];
                  return (
                    <tr key={lead.id} onClick={() => navigate(`/saas/crm/clientes/${lead.id}`)} className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors group">
                      <td className="pl-3 pr-0 py-0"><div className={`w-1 h-12 rounded-full ${t.dot}`} /></td>
                      {visibleLeadCols.includes('nombre') && (
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{lead.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{lead.phone}</p>
                        </td>
                      )}
                      {visibleLeadCols.includes('estado') && <td className="px-5 py-3.5"><StatusBadge status={lead.status} /></td>}
                      {visibleLeadCols.includes('vehiculo') && (
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{lead.vehicleInterest}</p>
                          {lead.budget && <p className="text-xs text-gray-400 dark:text-gray-500">{lead.budget}</p>}
                        </td>
                      )}
                      {visibleLeadCols.includes('responsable') && <td className="px-5 py-3.5"><span className="text-xs text-gray-500 dark:text-gray-400">{lead.responsible}</span></td>}
                      {visibleLeadCols.includes('fecha') && <td className="px-5 py-3.5"><span className="text-xs text-gray-400 dark:text-gray-500">{new Date(lead.createdAt).toLocaleDateString('es-ES')}</span></td>}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/saas/crm/clientes/${lead.id}`);
                            }}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            title="Ver ficha"
                          >
                            <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredLeads.length > 0 && <Pagination pagination={leadsPagination} />}
        </div>
      )}
    </div>
  );

  // ─── Tab: Clients ─────────────────────────────────────────────────────────

  const renderClientsTab = () => (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className={`flex items-center gap-2 ${isDeliveryBusiness ? 'justify-between' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          {branches.length > 0 && (
            <div className="relative flex-shrink-0">
              <Store className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <select
                value={filterBranch}
                onChange={e => setFilterBranch(e.target.value)}
                className={`pl-7 pr-7 py-2.5 border-2 rounded-xl text-xs font-semibold focus:outline-none transition-all appearance-none bg-white dark:bg-gray-800 ${
                  filterBranch !== 'all'
                    ? 'border-violet-400 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <option value="all">Todos los PDV</option>
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          )}
          <ViewToggle view={clientsView} setView={setClientsView} />
        </div>

        <div className={`flex items-center gap-2 flex-shrink-0 ${isDeliveryBusiness ? 'ml-auto' : ''}`}>
          <button
            type="button"
            onClick={() => void handleExportClients()}
            disabled={filteredClients.length === 0}
            title="Exportar clientes a Excel"
            className="flex items-center gap-1.5 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <ActivationFieldWrap fieldKey="client-add" activeKey={activationFocus}>
            <AddButtonDropdown
              label="Cliente"
              onQuickAdd={() => setShowAddClientModal(true)}
              onAIAdd={() => setShowAIClientModal(true)}
              onImport={() => setCrmImportMode('clients')}
              quickAddLabel="Alta rápida"
              quickAddDesc="Formulario de nuevo cliente"
            />
          </ActivationFieldWrap>
        </div>
      </div>

      {/* Filtro por tags de clientes */}
      {(() => {
        const allClientTags = Array.from(new Set(
          (contextClients || []).flatMap(c => c.tags || [])
        )).sort();
        if (allClientTags.length === 0) return null;
        return (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <Tag className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <button onClick={() => setFilterClientTag('')}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${!filterClientTag ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
              Todas las etiquetas
            </button>
            {allClientTags.map(tag => (
              <button key={tag} onClick={() => setFilterClientTag(filterClientTag === tag ? '' : tag)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${filterClientTag === tag ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                {tag}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Pills de Puntos de Venta — Clientes */}
      {branches.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <Store className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <button onClick={() => setFilterBranch('all')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
              filterBranch === 'all'
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300'
            }`}>
            Todos los PDV
          </button>
          {branches.map(b => (
            <button key={b.branch_id} onClick={() => setFilterBranch(filterBranch === b.branch_id ? 'all' : b.branch_id)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                filterBranch === b.branch_id
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300'
              }`}>
              {b.name}
              {b.city && <span className="ml-1 opacity-60">· {b.city}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      {clientsView === 'cards' && (
        filteredClients.length > 0 ? (
          <div className="space-y-3">
            {paginatedClients.map(client => (
              <div key={client.id}
                className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 ${client.status === 'active' ? 'border-l-emerald-500' : 'border-l-slate-400'} rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer`}
                onClick={() => viewClientDetail(client.id)}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">{client.name}</h3>
                    <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{client.dni}</span>
                  </div>
                  <ClientStatusBadge status={client.status} />
                </div>
                <div className="flex flex-wrap gap-3 mb-2">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><Phone className="w-3.5 h-3.5" />{client.phone}</div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0"><Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{client.email}</span></div>
                  {client.city && <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><MapPin className="w-3.5 h-3.5" />{client.city}</div>}
                </div>
                {!isDeliveryBusiness && (client.vehiclesPurchased?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 p-2 bg-gray-50 dark:bg-gray-800 rounded-xl mb-2">
                    <Car className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{client.vehiclesPurchased!.join(' · ')}</p>
                  </div>
                )}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                  {!isDeliveryBusiness && (
                    <div className="flex items-center gap-1.5"><UserPlus className="w-3 h-3 text-gray-400 dark:text-gray-500" /><span className="text-xs text-gray-400 dark:text-gray-500">{client.responsible}</span></div>
                  )}
                  {isDeliveryBusiness && <div />}
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleCreateContract(client)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="Contrato"><FileText className="w-4 h-4 text-blue-500" /></button>
                    <button onClick={() => navigate(`/saas/vertical/limpieza/clientes?search=${encodeURIComponent(client.name)}`)} className="p-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg" title="Ver en limpieza"><Droplets className="w-4 h-4 text-cyan-500" /></button>
                    <button onClick={() => viewClientDetail(client.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Ver ficha"><Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <EmptyState
              type={searchQuery ? 'search' : 'clients'}
              title={searchQuery ? 'Sin resultados' : 'No hay clientes aún'}
              description={
                searchQuery
                  ? 'Ningún cliente coincide con la búsqueda.'
                  : 'Añade tu primer cliente para comenzar a gestionar tu cartera.'
              }
              ctaLabel={!searchQuery ? 'Añadir primer cliente' : undefined}
              onCta={!searchQuery ? () => setShowAddClientModal(true) : undefined}
            />
          </div>
        )
      )}

      {/* Tabla con ColFilter */}
      {clientsView === 'table' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredClients.length}</span> cliente{filteredClients.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              {(cActiveFilters > 0 || cSort) && (
                <button onClick={clearCFilters} className="text-xs text-red-500 font-medium flex items-center gap-1"><X className="w-3 h-3" /> Limpiar filtros</button>
              )}
              <ColumnCustomizer columns={clientColDefsForUi} visibleIds={visibleClientColIds} columnOrder={clientColOrder} onToggle={toggleClientCol} onReorder={reorderClientCols} onReset={resetClientCols} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                  <th className="w-1 px-0" />
                  {visibleClientCols.includes('nombre') && (
                    <th className="px-5 py-3 text-left">
                      <ColFilter label="Cliente" options={cNameOptions} selected={cFilterName} onChange={setCFilterName}
                        sortKey="name" currentSort={cSort} onSort={(k, d) => setCSort(k ? { key: k, dir: d } : null)} />
                    </th>
                  )}
                  {visibleClientCols.includes('estado') && (
                    <th className="px-5 py-3 text-left">
                      <ColFilter label="Estado" options={cStatusOptions} selected={cFilterStatus} onChange={setCFilterStatus}
                        sortKey="status" currentSort={cSort} onSort={(k, d) => setCSort(k ? { key: k, dir: d } : null)}
                        renderOption={opt => <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${opt === 'Activo' ? 'bg-emerald-500' : 'bg-slate-400'}`} />{opt}</span>} />
                    </th>
                  )}
                  {visibleClientCols.includes('direccion') && (
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Calle
                    </th>
                  )}
                  {visibleClientCols.includes('ciudad') && (
                    <th className="px-5 py-3 text-left">
                      <ColFilter label="Ciudad" options={cCityOptions} selected={cFilterCity} onChange={setCFilterCity}
                        sortKey="city" currentSort={cSort} onSort={(k, d) => setCSort(k ? { key: k, dir: d } : null)} />
                    </th>
                  )}
                  {visibleClientCols.includes('responsable') && <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Responsable</th>}
                  {visibleClientCols.includes('docs') && <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Docs</th>}
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredClients.length === 0 ? (
                  <tr><td colSpan={visibleClientCols.length + 2} className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">Sin resultados</td></tr>
                ) : paginatedClients.map(client => (
                  <tr key={client.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group cursor-pointer" onClick={() => viewClientDetail(client.id)}>
                    <td className="pl-3 pr-0 py-0"><div className={`w-1 h-14 rounded-full ${client.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} /></td>
                    {visibleClientCols.includes('nombre') && (
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{client.name}</p>
                        <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{client.dni}</p>
                      </td>
                    )}
                    {visibleClientCols.includes('estado') && <td className="px-5 py-3.5"><ClientStatusBadge status={client.status} /></td>}
                    {visibleClientCols.includes('direccion') && (
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{client.address || '—'}</span>
                      </td>
                    )}
                    {visibleClientCols.includes('ciudad') && <td className="px-5 py-3.5"><span className="text-sm text-gray-600 dark:text-gray-400">{client.city || '—'}</span></td>}
                    {visibleClientCols.includes('responsable') && <td className="px-5 py-3.5"><span className="text-xs text-gray-500 dark:text-gray-400">{client.responsible}</span></td>}
                    {visibleClientCols.includes('docs') && <td className="px-5 py-3.5 text-right"><span className="text-sm font-bold text-gray-700 dark:text-gray-300">{client.documentsCount || 0}</span></td>}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleCreateContract(client)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="Contrato"><FileText className="w-4 h-4 text-blue-500" /></button>
                        <button onClick={() => navigate(`/saas/vertical/limpieza/clientes?search=${encodeURIComponent(client.name)}`)} className="p-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg" title="Ver en limpieza"><Droplets className="w-4 h-4 text-cyan-500" /></button>
                        <button onClick={() => viewClientDetail(client.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Ver ficha"><Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredClients.length > 0 && <Pagination pagination={clientsPagination} />}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Tab: Billing ─────────────────────────────────────────────────────────

  const filteredBilling = useMemo(() => {
    let r = billingPill === 'all' ? filteredInvoices : filteredInvoices.filter(i => i.status === billingPill);
    return r;
  }, [filteredInvoices, billingPill]);

  const invAddLine = () => setInvForm(f => ({ ...f, lines: [...f.lines, { id: Date.now().toString(), description: '', qty: 1, price: 0, tax: 21 }] }));
  const invRemoveLine = (id: string) => setInvForm(f => ({ ...f, lines: f.lines.filter(x => x.id !== id) }));
  const invUpdateLine = (id: string, key: keyof InvoiceLine, val: string | number) =>
    setInvForm(f => ({ ...f, lines: f.lines.map(x => x.id === id ? { ...x, [key]: val } : x) }));
  const invInp = (err?: string) =>
    `w-full px-3 py-2 text-sm border-2 rounded-xl focus:outline-none transition-all ${err ? 'border-red-300 focus:border-red-400' : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'}`;

  const handleInvFormSubmit = async () => {
    const e: Record<string, string> = {};
    if (!invForm.clientId) e.client = 'Selecciona un cliente';
    if (invTotal <= 0) e.total = 'Añade al menos un concepto con precio';
    setInvFormErrors(e);
    if (Object.keys(e).length > 0) return;
    setInvSaving(true);
    try {
      const client = allClients.find(c => c.id === invForm.clientId);
      const inv: Invoice = {
        id: `inv-${Date.now()}`, clientId: invForm.clientId, number: invForm.invoiceNum,
        clientName: client?.name || '', vehicleName: invForm.vehicleName, vehiclePlate: invForm.vehiclePlate,
        date: invForm.issueDate, dueDate: invForm.dueDate || invForm.issueDate,
        total: Math.round(invTotal), paid: 0, status: 'pending',
        paymentMethod: invForm.payMethod, notes: invForm.notes,
      };
      await handleAddInvoice(inv);
      resetInvForm();
      setBillingSubTab('list');
    } finally {
      setInvSaving(false);
    }
  };

  const handleInvDetailUpdate = async (updated: Invoice) => {
    if (authUser?.user_id) {
      const result = await updateClientInvoiceRequest(authUser.user_id, {
        id: updated.id, clientId: updated.clientId || '', clientName: updated.clientName,
        number: updated.number, vehicleName: updated.vehicleName, vehiclePlate: updated.vehiclePlate,
        date: updated.date, dueDate: updated.dueDate, total: updated.total, paid: updated.paid,
        status: updated.status, paymentMethod: updated.paymentMethod || '', notes: updated.notes || '',
        createdAt: updated.date,
      });
      if (result) {
        setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
        setSelectedInvoice(updated);
      }
    } else {
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      setSelectedInvoice(updated);
    }
  };

  const handleInvDetailDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta factura?')) return;
    if (authUser?.user_id) await deleteClientInvoiceRequest(authUser.user_id, id);
    setInvoices(prev => prev.filter(i => i.id !== id));
    setSelectedInvoice(null);
    setBillingSubTab('list');
  };

  const renderBillingTab = () => (
    <div className="space-y-4">

      {/* Sub-tabs */}
      <div className="flex items-center gap-3">
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {([['list', 'Lista'], ['create', editingInvoiceId ? 'Editar' : 'Nueva']] as const).map(([tab, label], i) => {
            const isActive = billingSubTab === tab;
            return (
              <button key={tab}
                onClick={() => { if (tab === 'create' && !editingInvoiceId) { setShowInvoiceTypeModal(true); return; } setBillingSubTab(tab as 'list' | 'create'); if (tab === 'list') setEditingInvoiceId(null); }}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}>
                {label}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full" />}
              </button>
            );
          })}
          {selectedInvoice && (() => {
            const isActive = billingSubTab === 'detail';
            return (
              <button onClick={() => setBillingSubTab('detail')}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap border-l border-gray-100 dark:border-gray-800 ${
                  isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                }`}>
                Detalle
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-t-full" />}
              </button>
            );
          })()}
        </div>
        <button onClick={() => setShowInvoiceTypeModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /> Nueva factura
        </button>
      </div>

      {/* ── LIST SUB-TAB ── */}
      {billingSubTab === 'list' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <ViewToggle view={billingView} setView={setBillingView} />
            <button onClick={handleExportInvoices} disabled={filteredBilling.length === 0}
              className="flex-shrink-0 p-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Status chips */}
          <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {(['all', 'paid', 'pending', 'overdue', 'draft'] as const).map((st, i) => {
              const count = st === 'all' ? allInvoices.length : allInvoices.filter(iv => iv.status === st).length;
              if (st !== 'all' && count === 0) return null;
              const isActive = billingPill === st;
              return (
                <button key={st} onClick={() => setBillingPill(st)}
                  className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                  } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}>
                  {st === 'all' ? 'Todas' : INVOICE_STATUS[st].label}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>{count}</span>
                  {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />}
                </button>
              );
            })}
          </div>

          {/* Cards view */}
          {billingView === 'cards' && (
            filteredBilling.length > 0 ? (
              <div className="space-y-3">
                {filteredBilling.map(inv => {
                  const s = INVOICE_STATUS[inv.status];
                  const pending = inv.total - inv.paid;
                  const pct = inv.total > 0 ? Math.min(100, Math.round((inv.paid / inv.total) * 100)) : 0;
                  return (
                    <div key={inv.id} onClick={() => { setSelectedInvoice(inv); setBillingSubTab('detail'); }}
                      className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 ${s.border} hover:shadow-md cursor-pointer transition-all overflow-hidden`}>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2"><Receipt className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /><span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{inv.number}</span></div>
                          <InvoiceBadge status={inv.status} />
                        </div>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-0.5">{inv.clientName}</p>
                        <div className="flex items-center gap-2 mb-3">
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{inv.vehicleName || '—'}</p>
                          {inv.vehiclePlate && <span className="font-mono text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded flex-shrink-0">{inv.vehiclePlate}</span>}
                        </div>
                        <div className="mb-3">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-gray-400 dark:text-gray-500">{pct}% cobrado</span>
                            {pending > 0 ? <span className="text-red-500 font-semibold">{pending.toLocaleString('es-ES')}€ pend.</span> : <span className="text-emerald-500 font-semibold">Completo</span>}
                          </div>
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                          <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(inv.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{inv.total.toLocaleString('es-ES')}€</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-14 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <Receipt className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No se encontraron facturas</p>
                {!searchQuery && (
                  <button onClick={() => setShowInvoiceTypeModal(true)}
                    className="mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold">
                    + Nueva factura
                  </button>
                )}
              </div>
            )
          )}

          {/* Table view */}
          {billingView === 'table' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold text-gray-900 dark:text-gray-100">{filteredBilling.length}</span> factura{filteredBilling.length !== 1 ? 's' : ''}</span>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{filteredBilling.reduce((s, iv) => s + iv.total, 0).toLocaleString('es-ES')}€ total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                      <th className="w-1 px-0" />
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nº Factura</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Cliente</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Vehículo</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fecha</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Estado</th>
                      <th className="px-4 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredBilling.length === 0 ? (
                      <tr><td colSpan={8} className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">Sin resultados</td></tr>
                    ) : filteredBilling.map(inv => {
                      const s = INVOICE_STATUS[inv.status];
                      const pct = inv.total > 0 ? Math.min(100, Math.round((inv.paid / inv.total) * 100)) : 0;
                      return (
                        <tr key={inv.id} onClick={() => { setSelectedInvoice(inv); setBillingSubTab('detail'); }} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group cursor-pointer">
                          <td className="pl-3 pr-0 py-0"><div className={`w-1 h-14 rounded-full ${s.dot}`} /></td>
                          <td className="px-5 py-3.5"><span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{inv.number}</span></td>
                          <td className="px-5 py-3.5"><p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[140px]">{inv.clientName}</p></td>
                          <td className="px-5 py-3.5">
                            <p className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[110px]">{inv.vehicleName || '—'}</p>
                            {inv.vehiclePlate && <span className="font-mono text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">{inv.vehiclePlate}</span>}
                          </td>
                          <td className="px-5 py-3.5"><p className="text-xs text-gray-500 dark:text-gray-400">{new Date(inv.date).toLocaleDateString('es-ES')}</p></td>
                          <td className="px-5 py-3.5 text-right">
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{inv.total.toLocaleString('es-ES')}€</p>
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              <div className="w-12 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5"><InvoiceBadge status={inv.status} /></td>
                          <td className="px-4 py-3.5">
                            <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-opacity">
                              <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredBilling.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                        <td colSpan={5} className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 font-semibold">{filteredBilling.length} factura{filteredBilling.length !== 1 ? 's' : ''}</td>
                        <td className="px-5 py-3 text-right">
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{filteredBilling.reduce((s, iv) => s + iv.total, 0).toLocaleString('es-ES')}€</p>
                          <p className="text-[10px] text-emerald-600 font-semibold">{filteredBilling.reduce((s, iv) => s + iv.paid, 0).toLocaleString('es-ES')}€ cobrado</p>
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          <button onClick={() => navigate('/saas/sales')}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-sm text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-600 transition-colors">
            <ExternalLink className="w-4 h-4" /> Ver módulo completo de Ventas y Facturación
          </button>
        </>
      )}

      {/* ── CREATE / EDIT SUB-TAB ── */}
      {billingSubTab === 'create' && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Invoice header */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold">1</span>
              Datos de la factura
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nº Factura</label>
                <input value={invForm.invoiceNum} onChange={e => setInvForm(f => ({ ...f, invoiceNum: e.target.value }))} className={invInp()} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Método de pago</label>
                <select value={invForm.payMethod} onChange={e => setInvForm(f => ({ ...f, payMethod: e.target.value }))} className={invInp() + ' bg-white dark:bg-gray-800'}>
                  {INV_PAY_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha emisión</label>
                <input type="date" value={invForm.issueDate} onChange={e => setInvForm(f => ({ ...f, issueDate: e.target.value }))} className={invInp()} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha vencimiento</label>
                <input type="date" value={invForm.dueDate} onChange={e => setInvForm(f => ({ ...f, dueDate: e.target.value }))} className={invInp()} />
              </div>
            </div>
          </div>

          {/* Client */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold">2</span>
              Cliente
            </h2>
            {invForm.clientId ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-emerald-400 bg-emerald-50">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{allClients.find(c => c.id === invForm.clientId)?.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{allClients.find(c => c.id === invForm.clientId)?.dni}</p>
                </div>
                <button type="button" onClick={() => setInvForm(f => ({ ...f, clientId: '' }))}
                  className="p-1.5 hover:bg-emerald-200 rounded-lg transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5 text-emerald-700" />
                </button>
              </div>
            ) : (
              <select value={invForm.clientId} onChange={e => setInvForm(f => ({ ...f, clientId: e.target.value }))}
                className={invInp(invFormErrors.client) + ' bg-white dark:bg-gray-800'}>
                <option value="">— Seleccionar cliente —</option>
                {allClients.map(c => <option key={c.id} value={c.id}>{c.name} · {c.dni}</option>)}
              </select>
            )}
            {invFormErrors.client && <p className="text-xs text-red-500 mt-1">{invFormErrors.client}</p>}
          </div>

          {/* Vehicle */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold">3</span>
              Vehículo <span className="text-gray-300 dark:text-gray-600 normal-case font-normal text-sm">(opcional)</span>
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Vehículo</label>
                <input value={invForm.vehicleName} onChange={e => setInvForm(f => ({ ...f, vehicleName: e.target.value }))} placeholder="BMW X3 2020" className={invInp()} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Matrícula</label>
                <input value={invForm.vehiclePlate} onChange={e => setInvForm(f => ({ ...f, vehiclePlate: e.target.value.toUpperCase() }))} placeholder="1234-ABC" className={invInp() + ' font-mono'} />
              </div>
            </div>
          </div>

          {/* Lines */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-bold">4</span>
              Conceptos
            </h2>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-800 grid grid-cols-12 gap-0 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="col-span-5 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Descripción</div>
                <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center">Cant.</div>
                <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Precio</div>
                <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">IVA</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-gray-100">
                {invForm.lines.map((line, idx) => (
                  <div key={line.id} className="grid grid-cols-12 gap-1.5 px-3 py-2 items-center">
                    <div className="col-span-5">
                      <input value={line.description} onChange={e => invUpdateLine(line.id, 'description', e.target.value)}
                        placeholder={`Concepto ${idx + 1}`}
                        className="w-full text-sm border-0 focus:outline-none text-gray-800 dark:text-gray-200 placeholder-gray-300 bg-transparent" />
                    </div>
                    <div className="col-span-2">
                      <input type="number" min={1} value={line.qty} onChange={e => invUpdateLine(line.id, 'qty', Number(e.target.value))}
                        className="w-full text-sm text-center border border-gray-200 dark:border-gray-700 rounded-lg px-1.5 py-1 focus:outline-none focus:border-blue-400" />
                    </div>
                    <div className="col-span-2">
                      <div className="relative">
                        <input type="number" min={0} step={0.01} value={line.price} onChange={e => invUpdateLine(line.id, 'price', Number(e.target.value))}
                          className="w-full text-sm text-right border border-gray-200 dark:border-gray-700 rounded-lg pr-4 pl-1.5 py-1 focus:outline-none focus:border-blue-400" />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">€</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <select value={line.tax} onChange={e => invUpdateLine(line.id, 'tax', Number(e.target.value))}
                        className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-1 py-1 focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 text-right">
                        {TAX_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
                      </select>
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {invForm.lines.length > 1 && (
                        <button type="button" onClick={() => invRemoveLine(line.id)} className="p-1 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800">
                <button type="button" onClick={invAddLine}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Añadir línea
                </button>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 flex justify-end">
              <div className="space-y-1 text-sm w-64">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>{invSubtotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1"><BadgePercent className="w-3.5 h-3.5" /> IVA</span>
                  <span>{invTaxTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 text-base border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
                  <span>Total</span>
                  <span>{invTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                </div>
                {invFormErrors.total && <p className="text-xs text-red-500">{invFormErrors.total}</p>}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Notas / condiciones</label>
            <textarea value={invForm.notes} onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              placeholder="Condiciones de pago, observaciones…"
              className={invInp() + ' resize-none'} />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button onClick={() => { resetInvForm(); setBillingSubTab(editingInvoiceId ? 'detail' : 'list'); }}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            {editingInvoiceId ? (
              <button disabled={invSaving} onClick={handleInvSaveEdit}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm">
                <Check className="w-4 h-4" />
                {invSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            ) : (
              <button disabled={invSaving} onClick={handleInvFormSubmit}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm">
                <Receipt className="w-4 h-4" />
                {invSaving ? 'Guardando...' : 'Crear factura'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── DETAIL SUB-TAB ── */}
      {billingSubTab === 'detail' && selectedInvoice && (() => {
        const inv = selectedInvoice;
        const s = INVOICE_STATUS[inv.status];
        const pending = inv.total - inv.paid;
        const pct = inv.total > 0 ? Math.min(100, Math.round((inv.paid / inv.total) * 100)) : 0;
        return (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Header */}
              <div className={`px-6 py-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r ${
                inv.status === 'paid' ? 'from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30' :
                inv.status === 'overdue' ? 'from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30' :
                inv.status === 'draft' ? 'from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900' :
                'from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                      <Receipt className={`w-5 h-5 ${s.text}`} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Factura</p>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 font-mono">{inv.number}</h2>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${s.bg} ${s.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Cliente</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{inv.clientName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Vehículo</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{inv.vehicleName || '—'}</p>
                    {inv.vehiclePlate && <span className="inline-block mt-1 font-mono text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">{inv.vehiclePlate}</span>}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Emisión</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{new Date(inv.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Vencimiento</p>
                    <p className={`font-medium ${inv.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-900 dark:text-gray-100'}`}>
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                    </p>
                  </div>
                </div>

                {inv.paymentMethod && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Forma de pago</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{inv.paymentMethod}</p>
                  </div>
                )}

                {/* Amounts */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Total factura</span>
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{inv.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Cobrado</span>
                    <span className="text-sm font-semibold text-emerald-600">{inv.paid.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                  </div>
                  {pending > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Pendiente</span>
                      <span className="text-sm font-semibold text-red-600">{pending.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-gray-400 dark:text-gray-500">{pct}% cobrado</span>
                      {pct === 100
                        ? <span className="text-emerald-500 font-semibold">Completo</span>
                        : <span className="text-amber-500 font-semibold">{pending.toLocaleString('es-ES')} € pendiente</span>
                      }
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                {inv.notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notas</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{inv.notes}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex flex-wrap gap-3">
                <button onClick={() => handleInvStartEdit(inv)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors">
                  <FileText className="w-3.5 h-3.5" /> Editar
                </button>
                <button onClick={() => generateInvoicePdf({
                  number: inv.number, date: inv.date, dueDate: inv.dueDate,
                  issuer: { companyName: '' }, recipient: { name: inv.clientName },
                  lines: [{ description: inv.vehicleName || 'Servicio', quantity: 1, unitPrice: inv.total, taxRate: 0 }],
                  notes: inv.notes, payMethod: inv.paymentMethod,
                })}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                {inv.status !== 'paid' && (
                  <button onClick={() => handleInvDetailUpdate({ ...inv, paid: inv.total, status: 'paid' })}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors">
                    <Check className="w-3.5 h-3.5" /> Marcar cobrada
                  </button>
                )}
                {inv.status === 'paid' && (
                  <button onClick={() => handleInvDetailUpdate({ ...inv, status: 'pending' })}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors">
                    <Calendar className="w-3.5 h-3.5" /> Marcar pendiente
                  </button>
                )}
                <div className="flex-1" />
                <button onClick={() => handleInvDetailDelete(inv.id)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );

  // ─── Layout ───────────────────────────────────────────────────────────────

  const layoutTitleByTab: Record<ClientTabId, string> = {
    leads: 'Leads',
    clients: 'Clientes',
    billing: 'Facturación',
    alerts: 'Alertas CRM',
  };

  const layoutSubtitleByTab: Record<ClientTabId, string> = {
    leads: 'Gestión de leads',
    clients: 'Gestión de clientes',
    billing: 'Gestión de facturación',
    alerts: 'Alertas y recordatorios comerciales',
  };

  const pageBody = (
    <>
      <div className="space-y-4">
        {!embedDeliveryOps && <CrmNav active={activeTab} />}

        {/* Misma barra de búsqueda en todas las pestañas: debajo del nav, altura fija, sin saltos al cambiar */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm px-3 py-3 md:px-4 md:py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder={
                  activeTab === 'billing'
                    ? 'Buscar facturas por número, cliente o matrícula…'
                    : activeTab === 'clients'
                      ? 'Buscar clientes por nombre, email o teléfono…'
                      : activeTab === 'alerts'
                        ? 'Buscar en alertas (texto visible en la lista)…'
                        : 'Buscar leads por nombre, vehículo o contacto…'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-xl border-2 border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                aria-label="Buscar en CRM"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                </button>
              ) : null}
            </div>
            {hasWorkCenters ? (
              <select
                className="h-11 w-full shrink-0 rounded-xl border-2 border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:w-[min(100%,280px)] sm:min-w-[200px]"
                value={filterWorkCenter}
                onChange={(e) => setFilterWorkCenter(e.target.value)}
              >
                <option value="all">Todos los centros</option>
                {activeWorkCenters.map((wc) => (
                  <option key={wc.id} value={wc.id}>{wc.name}</option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        {activeTab === 'leads'   && renderLeadsTab()}
        {activeTab === 'clients' && renderClientsTab()}
        {activeTab === 'billing' && renderBillingTab()}
        {activeTab === 'alerts'  && (
          <div className="space-y-4">
            <CrmAlertsPanel userId={authUser?.user_id || ''} searchQuery={searchQuery} />
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 md:p-5 space-y-5">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Automatización CRM (reasignación y SLA)</h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Reglas de reasignación</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)} placeholder="Nombre de regla"
                      className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
                    <input type="number" min={1} value={newRuleHours} onChange={(e) => setNewRuleHours(e.target.value)} placeholder="Horas inactivo"
                      className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
                    <input value={newRuleFromUser} onChange={(e) => setNewRuleFromUser(e.target.value)} placeholder="Desde usuario (opcional)"
                      className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
                    <input value={newRuleToUser} onChange={(e) => setNewRuleToUser(e.target.value)} placeholder="Hacia usuario (opcional)"
                      className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
                  </div>
                  <select value={newRuleStrategy} onChange={(e) => setNewRuleStrategy(e.target.value as 'specific' | 'roundrobin' | 'leastload')}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                    <option value="specific">Específico</option>
                    <option value="roundrobin">Round-robin</option>
                    <option value="leastload">Menor carga</option>
                  </select>
                  <button onClick={handleCreateRule} disabled={savingAutomation}
                    className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    Crear regla
                  </button>

                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {loadingAutomation ? (
                      <p className="text-xs text-gray-400">Cargando reglas...</p>
                    ) : assignmentRules.length === 0 ? (
                      <p className="text-xs text-gray-400">Sin reglas configuradas</p>
                    ) : assignmentRules.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-gray-100 dark:border-gray-700 p-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-700 dark:text-gray-300 truncate">{rule.name}</p>
                          <p className="text-gray-500">{rule.inactiveHours}h · {rule.toStrategy}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleRule(rule)} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">
                            {rule.enabled ? 'Activa' : 'Pausada'}
                          </button>
                          <button onClick={() => removeRule(rule.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4 text-amber-500" />
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">SLA de contacto de leads</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={slaConfig.enabled}
                      onChange={(e) => setSlaConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                    Activar SLA
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min={1} value={slaConfig.maxResponseHours}
                      onChange={(e) => setSlaConfig((prev) => ({ ...prev, maxResponseHours: Number(e.target.value || 1) }))}
                      placeholder="Máx. horas respuesta"
                      className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
                    <input type="number" min={1} value={slaConfig.alertAfterHours}
                      onChange={(e) => setSlaConfig((prev) => ({ ...prev, alertAfterHours: Number(e.target.value || 1) }))}
                      placeholder="Alerta tras horas"
                      className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
                  </div>
                  <input
                    value={slaConfig.escalationUser}
                    onChange={(e) => setSlaConfig((prev) => ({ ...prev, escalationUser: e.target.value }))}
                    placeholder="Usuario de escalado (opcional)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                  />
                  <button onClick={handleSaveSla} disabled={savingAutomation}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                    <Save className="w-3.5 h-3.5" /> Guardar SLA
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showInvoiceTypeModal && (
        <InvoiceCreationModal
          userId={user?.id || authUser?.user_id || ''}
          invoices={invoices}
          onClose={() => setShowInvoiceTypeModal(false)}
          onSelect={handleInvoiceTypeSelect}
        />
      )}
      {showLeadDrawer && selectedLead && (
        <SAAS__LeadDrawer isOpen={showLeadDrawer} onClose={() => { setShowLeadDrawer(false); setSelectedLead(null); }}
          lead={selectedLead} onConvert={() => handleConvertLead(selectedLead)} />
      )}
      <SAAS__NewLeadModal
        isOpen={showNewLeadModal}
        onClose={() => setShowNewLeadModal(false)}
        onCreate={(data: any) => { void handleAddLead(data); }}
        vehicles={vehicles || []}
        onCheckDuplicates={authUser?.user_id ? async (phone, email) => checkLeadDuplicatesRequest(authUser.user_id, { phone, email }) : undefined}
        onViewLead={(id) => { navigate(`/saas/crm/clientes/${id}`); }}
      />
      <NuevoClienteModal
        open={showAddClientModal}
        onClose={() => setShowAddClientModal(false)}
        onClientCreated={(client) => {
          toast.success(`Cliente "${client.name}" creado correctamente`);
          setShowAddClientModal(false);
        }}
        contexto="crm"
      />
      {leadToConvert && (
        <SAAS__ConvertToClientModal isOpen={showConvertModal} onClose={() => { setShowConvertModal(false); setLeadToConvert(null); }}
          lead={leadToConvert} onConvert={(data: any) => { void handleConvertLeadToClient(data); }} />
      )}
      {selectedClient && (
        <SAAS__CreateContractModal isOpen={showCreateContractModal} onClose={() => { setShowCreateContractModal(false); setSelectedClient(null); }}
          client={selectedClient} vehicles={vehicles || []}
          userId={authUser?.user_id || ''}
          onSubmit={(data: any) => { console.log('Contract:', data); setShowCreateContractModal(false); setSelectedClient(null); }} />
      )}
      
      <CrmImportWizard isOpen={crmImportMode !== null} onClose={() => setCrmImportMode(null)} initialMode={crmImportMode ?? undefined} />
      <AIAddModal
        isOpen={showAIClientModal}
        onClose={() => setShowAIClientModal(false)}
        module="clients"
        moduleLabel="Clientes"
        fields={CLIENT_AI_FIELDS}
        onEntriesParsed={async (entries) => {
          let created = 0;
          for (const entry of entries) {
            try {
              await addClient({
                name: String(entry.name || ''),
                phone: String(entry.phone || ''),
                email: String(entry.email || ''),
                dni: String(entry.dni || ''),
                address: String(entry.address || ''),
                city: String(entry.city || ''),
                postalCode: String(entry.postalCode || ''),
                notes: String(entry.notes || ''),
                status: 'active',
                responsible: '',
                interactions: [],
                documentsList: [],
              });
              created++;
            } catch { /* skip failed */ }
          }
          if (created > 0) toast.success(`${created} cliente(s) creado(s) con IA`);
          setShowAIClientModal(false);
        }}
        placeholder="Ej: Juan García, teléfono 600123456, email juan@email.com, DNI 12345678A, vive en Madrid..."
      />
      {showDuplicates && (
        <DuplicatesMergeModal
          leads={contextLeads || []}
          clients={contextClients || []}
          onMergeLead={async (keepId, deleteId) => {
            if (authUser?.user_id) {
              await mergeLeadRequest(authUser.user_id, keepId, deleteId);
            } else {
              await deleteLead(deleteId);
            }
          }}
          onMergeClient={async (keepId, deleteId) => {
            if (authUser?.user_id) {
              await mergeClientRequest(authUser.user_id, keepId, deleteId);
            } else {
              await deleteClient(deleteId);
            }
          }}
          onClose={() => setShowDuplicates(false)}
        />
      )}
    </>
  );

  if (embedDeliveryOps) {
    return pageBody;
  }

  return (
    <Layout title={layoutTitleByTab[activeTab]} subtitle={layoutSubtitleByTab[activeTab]}>
      {pageBody}
    </Layout>
  );
}
