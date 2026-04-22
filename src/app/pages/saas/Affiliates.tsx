import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  BadgeDollarSign, Building2, CheckCircle2, ChevronDown, ChevronRight,
  CircleDollarSign, Clock, Copy, Check as CheckIcon, Edit2, ExternalLink, FileText,
  HandshakeIcon, Link2, Mail, MessageSquare, Phone, Plus, Search, Trash2,
  TrendingUp, UserCheck, Users, X, XCircle, Tag,
  CreditCard, MailOpen, UserPlus, Eye, DollarSign, ArrowRight,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listAffiliateVerticals,
  buildAffiliateSummaries,
  createAffiliate,
  createAffiliateCommission,
  createContact,
  createFollowUp,
  deleteAffiliate,
  deleteAffiliateCommission,
  deleteContact,
  deleteFollowUp,
  listAffiliateCommissions,
  listAffiliates,
  listContacts,
  listFollowUps,
  saveAffiliate,
  saveContact,
  updateAffiliateStatus,
  updateCommissionStatus,
  type Affiliate,
  type AffiliateCommission,
  type AffiliateContact,
  type AffiliateFollowUp,
  type AffiliateStatus,
  type CommissionStatus,
  type ContactType,
  type FollowUpType,
} from '../../lib/affiliatesApi';

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtCurrency(v: number) {
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function getId(doc: { _id?: string; id?: string }) {
  return doc._id || doc.id || '';
}

const STATUS_CFG: Record<AffiliateStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:  { label: 'Pendiente', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  accepted: { label: 'Aceptado',  bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rechazado', bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
};

const COMM_STATUS_CFG: Record<CommissionStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:   { label: 'Pendiente', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  paid:      { label: 'Pagada',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelada', bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
};

const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  lead: 'Lead', client: 'Cliente', prospect: 'Prospecto',
};

const FOLLOWUP_TYPE_CFG: Record<FollowUpType, { label: string; color: string; bg: string }> = {
  call:     { label: 'Llamada',   color: 'text-blue-600',    bg: 'bg-blue-50' },
  email:    { label: 'Email',     color: 'text-violet-600',  bg: 'bg-violet-50' },
  meeting:  { label: 'Reunión',   color: 'text-emerald-600', bg: 'bg-emerald-50' },
  note:     { label: 'Nota',      color: 'text-slate-600',   bg: 'bg-slate-50' },
  whatsapp: { label: 'WhatsApp',  color: 'text-green-600',   bg: 'bg-green-50' },
};

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Pipeline config ────────────────────────────────────────────────────────────

type PipelineKey = 'registered' | 'emailSent' | 'emailOpened' | 'cardAdded' | 'isPaying';

interface PipelineStage {
  key: PipelineKey;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  activeColor: string;
  activeBg: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'registered',  label: 'Registrado',       shortLabel: 'Reg.',    icon: UserPlus,         activeColor: 'text-blue-600',    activeBg: 'bg-blue-500' },
  { key: 'emailSent',   label: 'Email enviado',    shortLabel: 'Enviado', icon: Mail,             activeColor: 'text-violet-600',  activeBg: 'bg-violet-500' },
  { key: 'emailOpened', label: 'Email abierto',    shortLabel: 'Abierto', icon: MailOpen,         activeColor: 'text-indigo-600',  activeBg: 'bg-indigo-500' },
  { key: 'cardAdded',   label: 'Tarjeta añadida',  shortLabel: 'Tarjeta', icon: CreditCard,       activeColor: 'text-amber-600',   activeBg: 'bg-amber-500' },
  { key: 'isPaying',    label: 'Pagando',          shortLabel: 'Pagando', icon: CircleDollarSign, activeColor: 'text-emerald-600', activeBg: 'bg-emerald-500' },
];

function getPipelineValue(contact: AffiliateContact, key: PipelineKey): boolean {
  if (key === 'registered') return true;
  return Boolean(contact[key as keyof AffiliateContact]);
}

function getPipelineProgress(contact: AffiliateContact): number {
  let count = 1;
  if (contact.emailSent) count++;
  if (contact.emailOpened) count++;
  if (contact.cardAdded) count++;
  if (contact.isPaying) count++;
  return count;
}

function PipelineStepper({ contact, onToggle, compact }: {
  contact: AffiliateContact;
  onToggle?: (key: PipelineKey) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {PIPELINE_STAGES.map((stage, i) => {
        const active = getPipelineValue(contact, stage.key);
        const Icon = stage.icon;
        const isClickable = stage.key !== 'registered' && onToggle;
        return (
          <React.Fragment key={stage.key}>
            {i > 0 && (
              <div className={`h-0.5 flex-1 min-w-[8px] max-w-[20px] rounded-full transition-colors ${
                active ? 'bg-emerald-300' : 'bg-slate-200'
              }`} />
            )}
            <button
              type="button"
              onClick={() => isClickable && onToggle(stage.key)}
              disabled={!isClickable}
              title={`${stage.label}${active ? ' (activo)' : ''}`}
              className={`relative group flex items-center justify-center rounded-full transition-all flex-shrink-0 ${
                compact ? 'w-7 h-7' : 'w-8 h-8'
              } ${active
                ? `${stage.activeBg} text-white shadow-sm`
                : 'bg-slate-100 text-slate-400'
              } ${isClickable ? 'cursor-pointer hover:scale-110 hover:shadow-md' : 'cursor-default'}`}
            >
              <Icon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap font-medium text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {stage.shortLabel}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function getEstimatedCommission(contact: AffiliateContact, affiliateRate: number): number {
  const rate = contact.commissionPercent ?? affiliateRate;
  const amount = contact.monthlyAmount ?? 0;
  return (amount * rate) / 100;
}

// ── Affiliate Form Modal ───────────────────────────────────────────────────────

interface AffiliateFormData {
  name: string; email: string; phone: string; whatsapp: string;
  company: string; commissionRate: string; status: AffiliateStatus; notes: string;
}

const emptyAffForm = (): AffiliateFormData => ({
  name: '', email: '', phone: '', whatsapp: '', company: '',
  commissionRate: '10', status: 'pending', notes: '',
});

function AffiliateModal({ affiliate, onSave, onClose }: {
  affiliate: Affiliate | null;
  onSave: (data: AffiliateFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AffiliateFormData>(() =>
    affiliate ? {
      name: affiliate.name, email: affiliate.email, phone: affiliate.phone,
      whatsapp: affiliate.whatsapp || '', company: affiliate.company ?? '',
      commissionRate: String(affiliate.commissionRate), status: affiliate.status,
      notes: affiliate.notes ?? '',
    } : emptyAffForm()
  );

  const field = (key: keyof AffiliateFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-lg">{affiliate ? 'Editar afiliado' : 'Nuevo afiliado'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {[
            { label: 'Nombre completo *', key: 'name', placeholder: 'Ej: Carlos Martínez' },
            { label: 'Email *', key: 'email', placeholder: 'correo@ejemplo.com' },
            { label: 'Teléfono', key: 'phone', placeholder: '+34 600 000 000' },
            { label: 'WhatsApp', key: 'whatsapp', placeholder: '+34 600 000 000' },
            { label: 'Empresa', key: 'company', placeholder: 'Nombre de empresa (opcional)' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input value={form[key as keyof AffiliateFormData]}
                onChange={field(key as keyof AffiliateFormData)}
                placeholder={placeholder}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Comisión (%)</label>
              <input type="number" min="0" max="100" step="0.5" value={form.commissionRate}
                onChange={field('commissionRate')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
              <div className="relative">
                <select value={form.status} onChange={field('status')}
                  className="w-full appearance-none bg-white dark:bg-gray-800 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                  <option value="pending">Pendiente</option>
                  <option value="accepted">Aceptado</option>
                  <option value="rejected">Rechazado</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
            <textarea rows={3} value={form.notes} onChange={field('notes')}
              placeholder="Notas sobre este afiliado..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.name.trim() || !form.email.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {affiliate ? 'Guardar cambios' : 'Crear afiliado'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Contact Form Modal ─────────────────────────────────────────────────────────

interface ContactFormData {
  contactName: string; contactEmail: string; contactPhone: string;
  contactType: ContactType; company: string; notes: string; signedSaas: boolean;
  affiliateId: string; verticals: string[];
  emailSent: boolean; emailOpened: boolean; cardAdded: boolean; isPaying: boolean;
  monthlyAmount: string; commissionPercent: string;
}

function ContactModal({ affiliates, contact, onSave, onClose, verticalOptions }: {
  affiliates: Affiliate[];
  contact: AffiliateContact | null;
  onSave: (data: ContactFormData) => void;
  onClose: () => void;
  verticalOptions: string[];
}) {
  const acceptedAffiliates = affiliates.filter((a) => a.status === 'accepted');
  const [form, setForm] = useState<ContactFormData>(() =>
    contact ? {
      contactName: contact.contactName, contactEmail: contact.contactEmail ?? '',
      contactPhone: contact.contactPhone ?? '', contactType: contact.contactType,
      company: contact.company ?? '', notes: contact.notes ?? '',
      signedSaas: contact.signedSaas, affiliateId: contact.affiliateId,
      verticals: contact.verticals ?? [],
      emailSent: contact.emailSent ?? false,
      emailOpened: contact.emailOpened ?? false,
      cardAdded: contact.cardAdded ?? false,
      isPaying: contact.isPaying ?? false,
      monthlyAmount: String(contact.monthlyAmount ?? ''),
      commissionPercent: contact.commissionPercent !== undefined ? String(contact.commissionPercent) : '',
    } : {
      contactName: '', contactEmail: '', contactPhone: '',
      contactType: 'lead', company: '', notes: '', signedSaas: false,
      affiliateId: getId(acceptedAffiliates[0]) || '', verticals: [],
      emailSent: false, emailOpened: false, cardAdded: false, isPaying: false,
      monthlyAmount: '', commissionPercent: '',
    }
  );

  const field = (key: keyof ContactFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleVertical = (v: string) => {
    setForm((prev) => ({
      ...prev,
      verticals: prev.verticals.includes(v) ? prev.verticals.filter((x) => x !== v) : [...prev.verticals, v],
    }));
  };

  const selectedAffiliate = affiliates.find((a) => getId(a) === form.affiliateId);
  const affRate = selectedAffiliate?.commissionRate ?? 10;
  const rate = form.commissionPercent ? Number(form.commissionPercent) : affRate;
  const monthly = Number(form.monthlyAmount) || 0;
  const estimatedComm = (monthly * rate) / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="font-semibold text-slate-800 text-lg">{contact ? 'Editar contacto' : 'Nuevo contacto referido'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Datos básicos */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" /> Datos del contacto
            </h4>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Afiliado *</label>
              <div className="relative">
                <select value={form.affiliateId} onChange={field('affiliateId')}
                  className="w-full appearance-none bg-white dark:bg-gray-800 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                  {acceptedAffiliates.map((a) => <option key={getId(a)} value={getId(a)}>{a.name} ({a.commissionRate}%)</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Nombre *', key: 'contactName', placeholder: 'Nombre completo' },
                { label: 'Email', key: 'contactEmail', placeholder: 'correo@email.com' },
                { label: 'Teléfono', key: 'contactPhone', placeholder: '+34 600 000 000' },
                { label: 'Empresa', key: 'company', placeholder: 'Empresa (opcional)' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                  <input value={form[key as keyof ContactFormData] as string}
                    onChange={field(key as keyof ContactFormData)}
                    placeholder={placeholder}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
              <div className="relative">
                <select value={form.contactType} onChange={field('contactType')}
                  className="w-full appearance-none bg-white dark:bg-gray-800 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                  <option value="lead">Lead</option>
                  <option value="prospect">Prospecto</option>
                  <option value="client">Cliente</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Categorías */}
          {verticalOptions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Categorías / Sectores
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {verticalOptions.map((v) => {
                  const selected = form.verticals.includes(v);
                  return (
                    <button key={v} type="button" onClick={() => toggleVertical(v)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left ${
                        selected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50'
                      }`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                      }`}>
                        {selected && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                      </div>
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pipeline de estado */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5" /> Estado del pipeline
            </h4>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              {[
                { key: 'signedSaas' as const, label: 'Ha firmado acceso SaaS', icon: CheckCircle2, color: 'text-emerald-600' },
                { key: 'emailSent' as const, label: 'Email enviado al cliente', icon: Mail, color: 'text-violet-600' },
                { key: 'emailOpened' as const, label: 'El cliente abrió el email', icon: MailOpen, color: 'text-indigo-600' },
                { key: 'cardAdded' as const, label: 'Tarjeta de pago añadida', icon: CreditCard, color: 'text-amber-600' },
                { key: 'isPaying' as const, label: 'Cliente está pagando activamente', icon: CircleDollarSign, color: 'text-emerald-600' },
              ].map(({ key, label, icon: Icon, color }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form[key] as boolean}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                    className="rounded w-4 h-4 text-blue-600 flex-shrink-0"
                  />
                  <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Financiero */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Datos financieros
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cuota mensual del cliente (€)</label>
                <input type="number" min="0" step="0.01" value={form.monthlyAmount}
                  onChange={field('monthlyAmount')}
                  placeholder="0.00"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Comisión % <span className="text-xs text-slate-400">(vacío = {affRate}% del afiliado)</span>
                </label>
                <input type="number" min="0" max="100" step="0.5" value={form.commissionPercent}
                  onChange={field('commissionPercent')}
                  placeholder={String(affRate)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {monthly > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                <BadgeDollarSign className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    Comisión estimada: {fmtCurrency(estimatedComm)}/mes
                  </p>
                  <p className="text-xs text-emerald-600">{rate}% de {fmtCurrency(monthly)} mensuales</p>
                </div>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
            <textarea rows={3} value={form.notes} onChange={field('notes')}
              placeholder="Notas sobre este contacto..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.contactName.trim() || !form.affiliateId}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {contact ? 'Guardar cambios' : 'Añadir contacto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Follow-up Form Modal ───────────────────────────────────────────────────────

interface FollowUpFormData {
  affiliateId: string; type: FollowUpType;
  title: string; content: string; date: string;
}

function FollowUpModal({ affiliates, onSave, onClose }: {
  affiliates: Affiliate[];
  onSave: (data: FollowUpFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FollowUpFormData>({
    affiliateId: getId(affiliates.filter((a) => a.status !== 'rejected')[0]) || '',
    type: 'call', title: '', content: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const field = (key: keyof FollowUpFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-lg">Nueva interacción</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Afiliado *</label>
            <div className="relative">
              <select value={form.affiliateId} onChange={field('affiliateId')}
                className="w-full appearance-none bg-white dark:bg-gray-800 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                {affiliates.filter((a) => a.status !== 'rejected').map((a) =>
                  <option key={getId(a)} value={getId(a)}>{a.name}</option>
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
              <div className="relative">
                <select value={form.type} onChange={field('type')}
                  className="w-full appearance-none bg-white dark:bg-gray-800 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                  <option value="call">Llamada</option>
                  <option value="email">Email</option>
                  <option value="meeting">Reunión</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="note">Nota</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
              <input type="date" value={form.date} onChange={field('date')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Título *</label>
            <input value={form.title} onChange={field('title')} placeholder="Ej: Llamada de seguimiento mensual"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <textarea rows={4} value={form.content} onChange={field('content')}
              placeholder="Detalles de la interacción..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.title.trim() || !form.affiliateId}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            Registrar interacción
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Commission Form Modal ─────────────────────────────────────────────────────

interface CommissionFormData {
  affiliateId: string; description: string;
  amount: string; dueDate: string;
}

function CommissionModal({ affiliates, onSave, onClose }: {
  affiliates: Affiliate[];
  onSave: (data: CommissionFormData) => void;
  onClose: () => void;
}) {
  const accepted = affiliates.filter((a) => a.status === 'accepted');
  const [form, setForm] = useState<CommissionFormData>({
    affiliateId: getId(accepted[0]) || '',
    description: '', amount: '',
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  const field = (key: keyof CommissionFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-lg">Nueva comisión</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Afiliado *</label>
            <div className="relative">
              <select value={form.affiliateId} onChange={field('affiliateId')}
                className="w-full appearance-none bg-white dark:bg-gray-800 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                {accepted.map((a) => <option key={getId(a)} value={getId(a)}>{a.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción *</label>
            <input value={form.description} onChange={field('description')}
              placeholder="Ej: Comisión por cliente referido - Empresa XYZ"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Importe (€) *</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={field('amount')}
                placeholder="120.00"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha límite</label>
              <input type="date" value={form.dueDate} onChange={field('dueDate')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.description.trim() || !form.amount || !form.affiliateId}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            Crear comisión
          </button>
        </div>
      </div>
    </div>
  );
}

// ── StatusBadge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AffiliateStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = 'affiliates' | 'contacts' | 'followups' | 'commissions';

export function Affiliates() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [contacts, setContacts] = useState<AffiliateContact[]>([]);
  const [followUps, setFollowUps] = useState<AffiliateFollowUp[]>([]);
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [tab, setTab] = useState<Tab>('affiliates');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AffiliateStatus | 'all'>('all');
  const [expandedAffiliate, setExpandedAffiliate] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [showAffModal, setShowAffModal] = useState(false);
  const [editingAff, setEditingAff] = useState<Affiliate | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<AffiliateContact | null>(null);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [verticalOptions, setVerticalOptions] = useState<string[]>([]);
  const [pipelineFilter, setPipelineFilter] = useState<PipelineKey | 'all'>('all');

  useModalClose(showAffModal, () => setShowAffModal(false));
  useModalClose(showContactModal, () => setShowContactModal(false));
  useModalClose(showFollowUpModal, () => setShowFollowUpModal(false));
  useModalClose(showCommissionModal, () => setShowCommissionModal(false));

  useEffect(() => {
    listAffiliateVerticals()
      .then((verticals) => setVerticalOptions(verticals))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const [aff, cnt, fu, comm] = await Promise.all([
        listAffiliates(userId),
        listContacts(userId),
        listFollowUps(userId),
        listAffiliateCommissions(userId),
      ]);
      setAffiliates(aff);
      setContacts(cnt);
      setFollowUps(fu);
      setCommissions(comm);
    } catch (err) {
      console.error('Error loading affiliate data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const summaries = useMemo(() => buildAffiliateSummaries(affiliates, contacts, commissions), [affiliates, contacts, commissions]);

  const kpis = useMemo(() => {
    const totalMRR = contacts.filter((c) => c.isPaying).reduce((s, c) => s + (c.monthlyAmount ?? 0), 0);
    const totalEstComm = contacts.filter((c) => c.isPaying).reduce((s, c) => {
      const aff = affiliates.find((a) => getId(a) === c.affiliateId);
      return s + getEstimatedCommission(c, aff?.commissionRate ?? 10);
    }, 0);
    return {
      total: affiliates.length,
      accepted: affiliates.filter((a) => a.status === 'accepted').length,
      pending: affiliates.filter((a) => a.status === 'pending').length,
      totalContacts: contacts.length,
      signedContacts: contacts.filter((c) => c.signedSaas).length,
      emailsSent: contacts.filter((c) => c.emailSent).length,
      emailsOpened: contacts.filter((c) => c.emailOpened).length,
      cardsAdded: contacts.filter((c) => c.cardAdded).length,
      paying: contacts.filter((c) => c.isPaying).length,
      totalMRR,
      totalEstComm,
      totalCommission: commissions.reduce((s, c) => s + c.amount, 0),
      pendingCommission: commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0),
      paidCommission: commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0),
    };
  }, [affiliates, contacts, commissions]);

  const filteredAffiliates = useMemo(() => {
    return summaries.filter((s) => {
      if (statusFilter !== 'all' && s.affiliate.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return s.affiliate.name.toLowerCase().includes(q) || s.affiliate.email.toLowerCase().includes(q) ||
          (s.affiliate.company ?? '').toLowerCase().includes(q) || (s.affiliate.affiliateCode ?? '').toLowerCase().includes(q) ||
          (s.affiliate.referralCode ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [summaries, statusFilter, search]);

  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (pipelineFilter !== 'all') {
      result = result.filter((c) => getPipelineValue(c, pipelineFilter));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.contactName.toLowerCase().includes(q) || c.affiliateName.toLowerCase().includes(q) ||
        (c.contactEmail ?? '').toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [contacts, search, pipelineFilter]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSaveAffiliate = async (data: AffiliateFormData) => {
    try {
      if (editingAff) {
        await saveAffiliate(userId, getId(editingAff), { ...data, commissionRate: Number(data.commissionRate) });
      } else {
        await createAffiliate(userId, { ...data, commissionRate: Number(data.commissionRate) });
      }
      setShowAffModal(false);
      setEditingAff(null);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAffiliate = async (id: string) => {
    if (!confirm('¿Eliminar este afiliado y todos sus datos asociados?')) return;
    try { await deleteAffiliate(userId, id); load(); } catch (err) { console.error(err); }
  };

  const handleStatusChange = async (id: string, status: AffiliateStatus) => {
    try { await updateAffiliateStatus(userId, id, status); load(); } catch (err) { console.error(err); }
  };

  const handleSaveContact = async (data: ContactFormData) => {
    const aff = affiliates.find((a) => getId(a) === data.affiliateId);
    if (!aff) return;
    try {
      const payload = {
        ...data,
        affiliateName: aff.name,
        verticals: data.verticals,
        monthlyAmount: data.monthlyAmount ? Number(data.monthlyAmount) : 0,
        commissionPercent: data.commissionPercent ? Number(data.commissionPercent) : undefined,
      };
      if (editingContact) {
        await saveContact(userId, getId(editingContact), payload);
      } else {
        await createContact(userId, payload);
      }
      load();
      setShowContactModal(false);
      setEditingContact(null);
    } catch (err) { console.error(err); }
  };

  const handleTogglePipeline = async (contact: AffiliateContact, key: PipelineKey) => {
    if (key === 'registered') return;
    const current = Boolean(contact[key as keyof AffiliateContact]);
    try {
      await saveContact(userId, getId(contact), { [key]: !current });
      load();
    } catch (err) { console.error(err); }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('¿Eliminar este contacto?')) return;
    try { await deleteContact(userId, id); load(); } catch (err) { console.error(err); }
  };

  const handleSaveFollowUp = async (data: FollowUpFormData) => {
    const aff = affiliates.find((a) => getId(a) === data.affiliateId);
    if (!aff) return;
    try {
      await createFollowUp(userId, { ...data, affiliateName: aff.name });
      setShowFollowUpModal(false);
      load();
    } catch (err) { console.error(err); }
  };

  const handleDeleteFollowUp = async (id: string) => {
    try { await deleteFollowUp(userId, id); load(); } catch (err) { console.error(err); }
  };

  const handleSaveCommission = async (data: CommissionFormData) => {
    const aff = affiliates.find((a) => getId(a) === data.affiliateId);
    if (!aff) return;
    try {
      await createAffiliateCommission(userId, {
        affiliateId: getId(aff), affiliateName: aff.name,
        description: data.description, amount: Number(data.amount),
        status: 'pending', dueDate: data.dueDate || undefined,
      });
      setShowCommissionModal(false);
      load();
    } catch (err) { console.error(err); }
  };

  const handleCommissionStatus = async (id: string, status: CommissionStatus) => {
    try { await updateCommissionStatus(userId, id, status); load(); } catch (err) { console.error(err); }
  };

  const handleDeleteCommission = async (id: string) => {
    try { await deleteAffiliateCommission(userId, id); load(); } catch (err) { console.error(err); }
  };

  const copyAffiliateCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'affiliates',  label: 'Afiliados',   icon: <Users className="w-4 h-4" />,          count: affiliates.length },
    { id: 'contacts',    label: 'Contactos',   icon: <UserCheck className="w-4 h-4" />,       count: contacts.length },
    { id: 'followups',   label: 'Seguimiento', icon: <MessageSquare className="w-4 h-4" />,   count: followUps.length },
    { id: 'commissions', label: 'Comisiones',  icon: <BadgeDollarSign className="w-4 h-4" />, count: commissions.length },
  ];

  const addButtons: Record<Tab, { label: string; onClick: () => void }> = {
    affiliates:  { label: 'Nuevo afiliado',   onClick: () => { setEditingAff(null); setShowAffModal(true); } },
    contacts:    { label: 'Nuevo contacto',    onClick: () => { setEditingContact(null); setShowContactModal(true); } },
    followups:   { label: 'Nueva interacción', onClick: () => setShowFollowUpModal(true) },
    commissions: { label: 'Nueva comisión',    onClick: () => setShowCommissionModal(true) },
  };

  return (
    <Layout title="Afiliados" subtitle="Gestión del programa de afiliados" noPadding>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                <HandshakeIcon className="w-5 h-5 text-white" />
              </div>
              Dashboard Afiliados
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Gestiona afiliados, contactos, seguimientos y comisiones</p>
          </div>
          <button onClick={addButtons[tab].onClick}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <Plus className="w-4 h-4" />{addButtons[tab].label}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Afiliados activos', value: kpis.accepted, sub: `${kpis.pending} pendientes`, icon: <Users className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50' },
            { label: 'Contactos referidos', value: kpis.totalContacts, sub: `${kpis.signedContacts} firmados SaaS`, icon: <UserCheck className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50' },
            { label: 'Comisión pendiente', value: fmtCurrency(kpis.pendingCommission), sub: 'Por pagar', icon: <CircleDollarSign className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50' },
            { label: 'Comisión pagada', value: fmtCurrency(kpis.paidCommission), sub: 'Total histórico', icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 p-4">
              <div className={`inline-flex p-2 rounded-xl ${kpi.bg} mb-3`}>{kpi.icon}</div>
              <div className="text-xl font-bold text-slate-900 leading-tight">{kpi.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{kpi.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((t, i) => {
            const isActive = tab === t.id;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); }}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}>
                {t.icon}{t.label}
                {t.count !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
                )}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />}
              </button>
            );
          })}
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800" />
          </div>
          {tab === 'affiliates' && (
            <div className="relative">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AffiliateStatus | 'all')}
                className="appearance-none bg-white dark:bg-gray-800 border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option value="all">Todos los estados</option>
                <option value="accepted">Aceptados</option>
                <option value="pending">Pendientes</option>
                <option value="rejected">Rechazados</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          )}
          {tab === 'contacts' && (
            <div className="relative">
              <select value={pipelineFilter} onChange={(e) => setPipelineFilter(e.target.value as PipelineKey | 'all')}
                className="appearance-none bg-white dark:bg-gray-800 border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                <option value="all">Todos los estados</option>
                <option value="registered">Registrados</option>
                <option value="emailSent">Email enviado</option>
                <option value="emailOpened">Email abierto</option>
                <option value="cardAdded">Tarjeta añadida</option>
                <option value="isPaying">Pagando</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          )}
        </div>

        {/* TAB: AFILIADOS */}
        {tab === 'affiliates' && (
          <div className="space-y-3">
            {filteredAffiliates.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 p-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">{isLoading ? 'Cargando...' : 'No hay afiliados'}</p>
                {!isLoading && <p className="text-sm text-slate-400 mt-1">Crea el primer afiliado para empezar</p>}
              </div>
            ) : filteredAffiliates.map(({ affiliate: aff, contactCount, signedCount, totalCommission, pendingCommission }) => {
              const affId = getId(aff);
              return (
                <div key={affId} className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {initials(aff.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 text-sm">{aff.name}</p>
                        <StatusBadge status={aff.status} />
                        {aff.affiliateCode && (
                          <button onClick={() => copyAffiliateCode(aff.affiliateCode)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-mono text-slate-600 transition-colors"
                            title="Copiar código de acceso">
                            {copiedCode === aff.affiliateCode ? <CheckIcon className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            {aff.affiliateCode}
                          </button>
                        )}
                        {aff.referralCode && (
                          <button onClick={() => copyAffiliateCode(aff.referralCode!)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 rounded text-xs font-mono text-amber-700 transition-colors"
                            title="Copiar código de referido">
                            {copiedCode === aff.referralCode ? <CheckIcon className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            {aff.referralCode}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{aff.email}</span>
                        {aff.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{aff.phone}</span>}
                        {aff.whatsapp && aff.whatsapp !== aff.phone && (
                          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-green-500" />WA: {aff.whatsapp}</span>
                        )}
                        {aff.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{aff.company}</span>}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-6 text-center">
                      <div>
                        <p className="text-xs text-slate-400">Contactos</p>
                        <p className="text-base font-bold text-slate-800">{contactCount}</p>
                        <p className="text-[10px] text-emerald-600">{signedCount} firmados</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Comisión</p>
                        <p className="text-base font-bold text-slate-800">{aff.commissionRate}%</p>
                        <p className="text-[10px] text-amber-600">{fmtCurrency(pendingCommission)} pdte.</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Total generado</p>
                        <p className="text-base font-bold text-blue-700">{fmtCurrency(totalCommission)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {aff.status === 'pending' && (
                        <>
                          <button onClick={() => handleStatusChange(affId, 'accepted')} title="Aceptar"
                            className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleStatusChange(affId, 'rejected')} title="Rechazar"
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {aff.status === 'rejected' && (
                        <button onClick={() => handleStatusChange(affId, 'accepted')} title="Reactivar"
                          className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {aff.affiliateCode && aff.status === 'accepted' && (
                        <a href={`/panel-afiliado/${aff.affiliateCode}`} target="_blank" rel="noopener noreferrer" title="Ver panel del afiliado"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={() => { setEditingAff(aff); setShowAffModal(true); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteAffiliate(affId)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setExpandedAffiliate(expandedAffiliate === affId ? null : affId)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                        {expandedAffiliate === affId ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {expandedAffiliate === affId && (
                    <div className="border-t border-slate-100 dark:border-gray-700 px-5 py-4 bg-slate-50/50 dark:bg-gray-800/50 space-y-4">
                      {aff.notes && (
                        <div className="flex gap-2 text-sm text-slate-600 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-slate-100 dark:border-gray-700 p-3">
                          <FileText className="w-4 h-4 text-slate-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />{aff.notes}
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">Últimos contactos</p>
                        {contacts.filter((c) => c.affiliateId === affId).length === 0 ? (
                          <p className="text-sm text-slate-400 dark:text-gray-500">Sin contactos registrados</p>
                        ) : (
                          <div className="space-y-1.5">
                            {contacts.filter((c) => c.affiliateId === affId).slice(0, 3).map((c) => (
                              <div key={getId(c)} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl border border-slate-100 dark:border-gray-700 p-2.5">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
                                  {initials(c.contactName)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-800">{c.contactName}</p>
                                  <p className="text-xs text-slate-400">{c.contactEmail}</p>
                                </div>
                                {c.signedSaas && (
                                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                    <Link2 className="w-3 h-3" /> SaaS
                                  </span>
                                )}
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                  c.contactType === 'client' ? 'bg-blue-50 text-blue-700' :
                                  c.contactType === 'prospect' ? 'bg-violet-50 text-violet-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>{CONTACT_TYPE_LABELS[c.contactType]}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Últimas interacciones</p>
                        {followUps.filter((f) => f.affiliateId === affId).length === 0 ? (
                          <p className="text-sm text-slate-400">Sin interacciones registradas</p>
                        ) : (
                          <div className="space-y-1.5">
                            {followUps.filter((f) => f.affiliateId === affId).slice(0, 3).map((f) => {
                              const fType = (f.followUpType || f.type) as FollowUpType;
                              const cfg = FOLLOWUP_TYPE_CFG[fType] || FOLLOWUP_TYPE_CFG.note;
                              return (
                                <div key={getId(f)} className="flex items-start gap-3 bg-white rounded-xl border border-slate-100 p-2.5">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color} flex-shrink-0 mt-0.5`}>{cfg.label}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800">{f.title}</p>
                                    <p className="text-xs text-slate-400 truncate">{f.content}</p>
                                  </div>
                                  <span className="text-xs text-slate-400 whitespace-nowrap">{fmt(f.date)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB: CONTACTOS */}
        {tab === 'contacts' && (
          <div className="space-y-4">
            {/* Pipeline funnel metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Registrados', value: kpis.totalContacts, icon: <UserPlus className="w-4 h-4 text-blue-500" />, bg: 'bg-blue-50', filterKey: 'registered' as PipelineKey },
                { label: 'Email enviado', value: kpis.emailsSent, icon: <Mail className="w-4 h-4 text-violet-500" />, bg: 'bg-violet-50', filterKey: 'emailSent' as PipelineKey },
                { label: 'Email abierto', value: kpis.emailsOpened, icon: <MailOpen className="w-4 h-4 text-indigo-500" />, bg: 'bg-indigo-50', filterKey: 'emailOpened' as PipelineKey },
                { label: 'Tarjeta añadida', value: kpis.cardsAdded, icon: <CreditCard className="w-4 h-4 text-amber-500" />, bg: 'bg-amber-50', filterKey: 'cardAdded' as PipelineKey },
                { label: 'Pagando', value: kpis.paying, icon: <CircleDollarSign className="w-4 h-4 text-emerald-500" />, bg: 'bg-emerald-50', filterKey: 'isPaying' as PipelineKey },
              ].map((m) => (
                <button key={m.label} onClick={() => setPipelineFilter(pipelineFilter === m.filterKey ? 'all' : m.filterKey)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    pipelineFilter === m.filterKey
                      ? 'border-blue-400 ring-2 ring-blue-100 bg-white'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                  <div className={`inline-flex p-1.5 rounded-lg ${m.bg} mb-2`}>{m.icon}</div>
                  <p className="text-lg font-bold text-slate-900">{m.value}</p>
                  <p className="text-[11px] text-slate-500">{m.label}</p>
                  {kpis.totalContacts > 0 && (
                    <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all" style={{ width: `${Math.round((m.value / kpis.totalContacts) * 100)}%` }} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* MRR + Commission summary */}
            {kpis.paying > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl p-4 text-white">
                  <p className="text-sm text-blue-100 mb-1">MRR (Ingresos recurrentes)</p>
                  <p className="text-2xl font-bold">{fmtCurrency(kpis.totalMRR)}</p>
                  <p className="text-xs text-blue-200 mt-1">{kpis.paying} clientes pagando</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl p-4 text-white">
                  <p className="text-sm text-emerald-100 mb-1">Comisión mensual estimada</p>
                  <p className="text-2xl font-bold">{fmtCurrency(kpis.totalEstComm)}</p>
                  <p className="text-xs text-emerald-200 mt-1">A repartir entre afiliados</p>
                </div>
              </div>
            )}

            {/* Pipeline filter indicator */}
            {pipelineFilter !== 'all' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Filtrando por: <strong className="text-slate-700">{PIPELINE_STAGES.find((s) => s.key === pipelineFilter)?.label}</strong></span>
                <button onClick={() => setPipelineFilter('all')} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Limpiar filtro</button>
              </div>
            )}

            {/* Contact cards */}
            {filteredContacts.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 p-12 text-center">
                <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">{isLoading ? 'Cargando...' : 'No hay contactos'}</p>
                {!isLoading && <p className="text-sm text-slate-400 mt-1">Añade un contacto referido para empezar</p>}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredContacts.map((c) => {
                  const aff = affiliates.find((a) => getId(a) === c.affiliateId);
                  const estComm = getEstimatedCommission(c, aff?.commissionRate ?? 10);
                  const progress = getPipelineProgress(c);
                  const isExpanded = expandedAffiliate === `cnt-${getId(c)}`;
                  return (
                    <div key={getId(c)} className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 overflow-hidden hover:shadow-sm transition-shadow">
                      <div className="px-5 py-4">
                        {/* Top row: identity + pipeline + actions */}
                        <div className="flex items-center gap-4">
                          {/* Avatar + name */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                              {initials(c.contactName)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900 text-sm">{c.contactName}</p>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                  c.contactType === 'client' ? 'bg-blue-50 text-blue-700' :
                                  c.contactType === 'prospect' ? 'bg-violet-50 text-violet-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>{CONTACT_TYPE_LABELS[c.contactType]}</span>
                                {c.isPaying && (
                                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                    <CircleDollarSign className="w-2.5 h-2.5" /> Pagando
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                {c.contactEmail && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{c.contactEmail}</span>}
                                {c.contactPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.contactPhone}</span>}
                                {c.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.company}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Pipeline stepper */}
                          <div className="hidden sm:block flex-shrink-0">
                            <PipelineStepper
                              contact={c}
                              onToggle={(key) => handleTogglePipeline(c, key)}
                              compact
                            />
                          </div>

                          {/* Commission + actions */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {(c.monthlyAmount ?? 0) > 0 && (
                              <div className="text-right hidden sm:block">
                                <p className="text-xs text-slate-400">Comisión</p>
                                <p className="text-sm font-bold text-emerald-700">{fmtCurrency(estComm)}<span className="text-[10px] font-normal text-slate-400">/mes</span></p>
                              </div>
                            )}
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => { setEditingContact(c); setShowContactModal(true); }}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteContact(getId(c))}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => setExpandedAffiliate(isExpanded ? null : `cnt-${getId(c)}`)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors" title="Detalles">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Progress bar (mobile-friendly) */}
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                progress >= 5 ? 'bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500' :
                                progress >= 3 ? 'bg-gradient-to-r from-blue-500 to-violet-500' :
                                'bg-blue-400'
                              }`}
                              style={{ width: `${(progress / 5) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">{progress}/5</span>
                          {c.affiliateName && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 whitespace-nowrap">
                              <HandshakeIcon className="w-3 h-3" /> {c.affiliateName}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmt(c.createdAt)}</span>
                        </div>

                        {/* Mobile pipeline (visible on small screens) */}
                        <div className="sm:hidden mt-3">
                          <PipelineStepper
                            contact={c}
                            onToggle={(key) => handleTogglePipeline(c, key)}
                          />
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 space-y-4">
                          {/* Pipeline detail */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Detalle del pipeline</p>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                              {PIPELINE_STAGES.map((stage) => {
                                const active = getPipelineValue(c, stage.key);
                                const Icon = stage.icon;
                                const dateField = stage.key === 'registered' ? 'createdAt'
                                  : stage.key === 'emailSent' ? 'emailSentAt'
                                  : stage.key === 'emailOpened' ? 'emailOpenedAt'
                                  : stage.key === 'cardAdded' ? 'cardAddedAt'
                                  : 'payingStartedAt';
                                const dateVal = c[dateField as keyof AffiliateContact] as string | undefined;
                                return (
                                  <div key={stage.key} className={`rounded-xl p-3 border text-center ${
                                    active ? 'bg-white border-emerald-200' : 'bg-slate-100/50 border-slate-200'
                                  }`}>
                                    <Icon className={`w-5 h-5 mx-auto mb-1 ${active ? stage.activeColor : 'text-slate-300'}`} />
                                    <p className={`text-xs font-semibold ${active ? 'text-slate-800' : 'text-slate-400'}`}>{stage.label}</p>
                                    {active && dateVal && (
                                      <p className="text-[10px] text-slate-400 mt-0.5">{fmt(dateVal)}</p>
                                    )}
                                    {!active && stage.key !== 'registered' && (
                                      <button onClick={() => handleTogglePipeline(c, stage.key)}
                                        className="text-[10px] text-blue-600 hover:text-blue-800 font-medium mt-1">
                                        Marcar
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Financial details */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-white rounded-xl border border-slate-200 p-3">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cuota mensual</p>
                              <p className="text-sm font-bold text-slate-800 mt-0.5">{(c.monthlyAmount ?? 0) > 0 ? fmtCurrency(c.monthlyAmount ?? 0) : '—'}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-3">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">% Comisión</p>
                              <p className="text-sm font-bold text-slate-800 mt-0.5">{c.commissionPercent ?? aff?.commissionRate ?? 10}%</p>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-3">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Comisión/mes</p>
                              <p className="text-sm font-bold text-emerald-700 mt-0.5">{estComm > 0 ? fmtCurrency(estComm) : '—'}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-3">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Estado SaaS</p>
                              <p className="text-sm font-bold mt-0.5">{c.signedSaas
                                ? <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Firmado</span>
                                : <span className="text-slate-400">Pendiente</span>
                              }</p>
                            </div>
                          </div>

                          {/* Categories */}
                          {c.verticals && c.verticals.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Categorías</p>
                              <div className="flex flex-wrap gap-1">
                                {c.verticals.map((v) => (
                                  <span key={v} className="text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">{v}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          {c.notes && (
                            <div className="bg-white rounded-xl border border-slate-100 p-3 flex gap-2 text-sm text-slate-600">
                              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />{c.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB: SEGUIMIENTO */}
        {tab === 'followups' && (
          <div className="space-y-3">
            {followUps.filter((f) => !search || f.title.toLowerCase().includes(search.toLowerCase()) || f.affiliateName.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 p-12 text-center">
                <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Sin interacciones registradas</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {followUps.filter((f) => !search ||
                  f.title.toLowerCase().includes(search.toLowerCase()) ||
                  f.affiliateName.toLowerCase().includes(search.toLowerCase())
                ).map((f) => {
                  const fType = (f.followUpType || f.type) as FollowUpType;
                  const cfg = FOLLOWUP_TYPE_CFG[fType] || FOLLOWUP_TYPE_CFG.note;
                  return (
                    <div key={getId(f)} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                        {fType === 'call' && <Phone className={`w-4 h-4 ${cfg.color}`} />}
                        {fType === 'email' && <Mail className={`w-4 h-4 ${cfg.color}`} />}
                        {fType === 'meeting' && <Users className={`w-4 h-4 ${cfg.color}`} />}
                        {fType === 'note' && <FileText className={`w-4 h-4 ${cfg.color}`} />}
                        {fType === 'whatsapp' && <MessageSquare className={`w-4 h-4 ${cfg.color}`} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <p className="font-semibold text-slate-800 text-sm">{f.title}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-1">{f.affiliateName}</p>
                        {f.content && <p className="text-xs text-slate-600 line-clamp-2">{f.content}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-slate-400 whitespace-nowrap flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {fmt(f.date)}
                          </p>
                        </div>
                        <button onClick={() => handleDeleteFollowUp(getId(f))}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB: COMISIONES */}
        {tab === 'commissions' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total comisiones', value: fmtCurrency(kpis.totalCommission), bg: 'bg-blue-50', text: 'text-blue-700' },
                { label: 'Pendiente pago', value: fmtCurrency(kpis.pendingCommission), bg: 'bg-amber-50', text: 'text-amber-700' },
                { label: 'Ya pagado', value: fmtCurrency(kpis.paidCommission), bg: 'bg-emerald-50', text: 'text-emerald-700' },
              ].map((s) => (
                <div key={s.label} className={`rounded-2xl ${s.bg} border border-slate-200/50 p-4 text-center`}>
                  <p className={`text-xl font-bold ${s.text}`}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 overflow-hidden">
              {commissions.length === 0 ? (
                <div className="p-12 text-center">
                  <BadgeDollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Sin comisiones registradas</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                        <th className="px-4 py-3 text-left">Afiliado</th>
                        <th className="px-4 py-3 text-left">Descripción</th>
                        <th className="px-4 py-3 text-right">Importe</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                        <th className="px-4 py-3 text-left">Vencimiento</th>
                        <th className="px-4 py-3 text-left">Pagado</th>
                        <th className="px-4 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commissions.map((c) => {
                        const cfg = COMM_STATUS_CFG[c.status];
                        return (
                          <tr key={getId(c)} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                  {initials(c.affiliateName)}
                                </div>
                                <span className="font-medium text-slate-800">{c.affiliateName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{c.description}</td>
                            <td className="px-4 py-3 text-right font-bold text-blue-700">{fmtCurrency(c.amount)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{c.dueDate ? fmt(c.dueDate) : '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{c.paidAt ? fmt(c.paidAt) : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 justify-center">
                                {c.status === 'pending' && (
                                  <button onClick={() => handleCommissionStatus(getId(c), 'paid')} title="Marcar pagada"
                                    className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button onClick={() => handleDeleteCommission(getId(c))}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAffModal && (
        <AffiliateModal affiliate={editingAff} onSave={handleSaveAffiliate}
          onClose={() => { setShowAffModal(false); setEditingAff(null); }} />
      )}
      {showContactModal && (
        <ContactModal affiliates={affiliates} contact={editingContact} onSave={handleSaveContact}
          onClose={() => { setShowContactModal(false); setEditingContact(null); }} verticalOptions={verticalOptions} />
      )}
      {showFollowUpModal && (
        <FollowUpModal affiliates={affiliates} onSave={handleSaveFollowUp} onClose={() => setShowFollowUpModal(false)} />
      )}
      {showCommissionModal && (
        <CommissionModal affiliates={affiliates} onSave={handleSaveCommission} onClose={() => setShowCommissionModal(false)} />
      )}
    </Layout>
  );
}
