import React, { useEffect, useRef, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  X, Mail, User, Shield, ChevronDown, Wrench, Star, Check, CheckCircle2,
  ArrowLeft, ArrowRight, LayoutDashboard, Car, Users, TrendingUp, FileText,
  DollarSign, CalendarDays, Copy, AlertTriangle, Key, Briefcase,
  Building2, MapPin, ClipboardList, UserCheck, FileWarning,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RoleDefinition } from '../../lib/authApi';
import type { WorkCenter } from '../../lib/workCentersApi';
import type { Business } from '../../lib/businessApi';

// --- Types ---

interface InviteResult {
  generatedPassword?: string;
  emailSent?: boolean;
  isExistingUser?: boolean;
  inviteExpiresAt?: string;
}

export interface InviteUserPayload {
  name: string;
  email: string;
  phone: string;
  role: string;
  landingPage: string;
  position: string;
  contractType: string;
  grossMonthlySalary: string;
  workCenterId: string;
  businessId?: string;
}

interface InviteUserModalProps {
  onClose: () => void;
  onInvite?: (data: InviteUserPayload) => Promise<InviteResult | void> | InviteResult | void;
  roles?: RoleDefinition[];
  workCenters?: WorkCenter[];
  businesses?: Business[];
  currentBusinessId?: string;
}

// --- Constants ---

const COUNTRY_PREFIXES = [
  { code: 'ES', prefix: '+34', flag: '\u{1F1EA}\u{1F1F8}', name: 'Espana' },
  { code: 'FR', prefix: '+33', flag: '\u{1F1EB}\u{1F1F7}', name: 'Francia' },
  { code: 'PT', prefix: '+351', flag: '\u{1F1F5}\u{1F1F9}', name: 'Portugal' },
  { code: 'IT', prefix: '+39', flag: '\u{1F1EE}\u{1F1F9}', name: 'Italia' },
  { code: 'DE', prefix: '+49', flag: '\u{1F1E9}\u{1F1EA}', name: 'Alemania' },
  { code: 'GB', prefix: '+44', flag: '\u{1F1EC}\u{1F1E7}', name: 'Reino Unido' },
  { code: 'NL', prefix: '+31', flag: '\u{1F1F3}\u{1F1F1}', name: 'Paises Bajos' },
  { code: 'BE', prefix: '+32', flag: '\u{1F1E7}\u{1F1EA}', name: 'Belgica' },
  { code: 'CH', prefix: '+41', flag: '\u{1F1E8}\u{1F1ED}', name: 'Suiza' },
  { code: 'AT', prefix: '+43', flag: '\u{1F1E6}\u{1F1F9}', name: 'Austria' },
  { code: 'PL', prefix: '+48', flag: '\u{1F1F5}\u{1F1F1}', name: 'Polonia' },
  { code: 'RO', prefix: '+40', flag: '\u{1F1F7}\u{1F1F4}', name: 'Rumania' },
  { code: 'SE', prefix: '+46', flag: '\u{1F1F8}\u{1F1EA}', name: 'Suecia' },
  { code: 'NO', prefix: '+47', flag: '\u{1F1F3}\u{1F1F4}', name: 'Noruega' },
  { code: 'DK', prefix: '+45', flag: '\u{1F1E9}\u{1F1F0}', name: 'Dinamarca' },
  { code: 'IE', prefix: '+353', flag: '\u{1F1EE}\u{1F1EA}', name: 'Irlanda' },
  { code: 'US', prefix: '+1', flag: '\u{1F1FA}\u{1F1F8}', name: 'Estados Unidos' },
  { code: 'MX', prefix: '+52', flag: '\u{1F1F2}\u{1F1FD}', name: 'Mexico' },
  { code: 'AR', prefix: '+54', flag: '\u{1F1E6}\u{1F1F7}', name: 'Argentina' },
  { code: 'CO', prefix: '+57', flag: '\u{1F1E8}\u{1F1F4}', name: 'Colombia' },
  { code: 'CL', prefix: '+56', flag: '\u{1F1E8}\u{1F1F1}', name: 'Chile' },
  { code: 'PE', prefix: '+51', flag: '\u{1F1F5}\u{1F1EA}', name: 'Peru' },
  { code: 'EC', prefix: '+593', flag: '\u{1F1EA}\u{1F1E8}', name: 'Ecuador' },
  { code: 'VE', prefix: '+58', flag: '\u{1F1FB}\u{1F1EA}', name: 'Venezuela' },
  { code: 'MA', prefix: '+212', flag: '\u{1F1F2}\u{1F1E6}', name: 'Marruecos' },
  { code: 'BR', prefix: '+55', flag: '\u{1F1E7}\u{1F1F7}', name: 'Brasil' },
] as const;

const CONTRACT_TYPES = [
  { id: 'indefinido', label: 'Indefinido' },
  { id: 'temporal', label: 'Temporal' },
  { id: 'practicas', label: 'En practicas' },
  { id: 'formacion', label: 'Formacion y aprendizaje' },
  { id: 'obra_servicio', label: 'Por obra o servicio' },
  { id: 'interinidad', label: 'Interinidad' },
  { id: 'fijo_discontinuo', label: 'Fijo discontinuo' },
] as const;

const LANDING_PAGES = [
  { id: '/saas/worker', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: '/saas/vehicles', icon: <Car className="w-3.5 h-3.5" /> },
  { id: '/saas/clients', icon: <Users className="w-3.5 h-3.5" /> },
  { id: '/saas/sales', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { id: '/saas/workshop', icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: '/saas/documents', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: '/saas/calendar', icon: <CalendarDays className="w-3.5 h-3.5" /> },
] as const;

// --- Worker Function Config ---

const ROLES: {
  id: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
  dotColor: string;
  icon: React.ReactNode;
  desc: string;
  tier: 'standard' | 'normal' | 'pro';
}[] = [
  { id: 'Administrador', dot: 'bg-slate-900', badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', dotColor: '#111827', icon: <Shield className="w-3.5 h-3.5" />, desc: 'Responsable del negocio o del local.', tier: 'standard' },
  { id: 'Encargado', dot: 'bg-blue-500', badgeBg: 'bg-blue-50', badgeText: 'text-blue-700', dotColor: '#3b82f6', icon: <Star className="w-3.5 h-3.5" />, desc: 'Coordina la operativa diaria.', tier: 'standard' },
  { id: 'Mostrador / Atención', dot: 'bg-emerald-500', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700', dotColor: '#10b981', icon: <User className="w-3.5 h-3.5" />, desc: 'Atiende clientes, mostrador, sala o food truck.', tier: 'standard' },
  { id: 'Cocina', dot: 'bg-orange-500', badgeBg: 'bg-orange-50', badgeText: 'text-orange-700', dotColor: '#f97316', icon: <Wrench className="w-3.5 h-3.5" />, desc: 'Prepara pedidos y cocina.', tier: 'standard' },
  { id: 'Reparto', dot: 'bg-violet-500', badgeBg: 'bg-violet-50', badgeText: 'text-violet-700', dotColor: '#8b5cf6', icon: <MapPin className="w-3.5 h-3.5" />, desc: 'Entrega pedidos a domicilio.', tier: 'standard' },
];

function TierPill({ tier }: { tier: 'standard' | 'normal' | 'pro' }) {
  if (tier === 'pro') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-violet-600 text-white text-[9px] font-bold tracking-wide uppercase leading-none">
        <Star className="w-2 h-2 fill-white stroke-none" />
        Pro
      </span>
    );
  }
  if (tier === 'normal') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-[9px] font-bold tracking-wide uppercase leading-none">
        Normal
      </span>
    );
  }
  return null;
}

function getRoleTier(roleId: string) {
  void roleId;
  return 'standard' as const;
}

function getRoleConfig(role: RoleDefinition) {
  const fallback = {
    id: role.id, dot: 'bg-sky-500', badgeBg: 'bg-sky-50', badgeText: 'text-sky-700',
    dotColor: '#0ea5e9', icon: <Shield className="w-3.5 h-3.5" />,
    desc: role.description || 'Funcion del trabajador.', tier: 'standard' as const,
  };
  const preset = ROLES.find((item) => item.id === role.id);
  if (preset) return { ...preset, desc: role.description || preset.desc };
  return { ...fallback, tier: getRoleTier(role.id) };
}

// --- SelectDropdown ---

function SelectDropdown({
  value, onChange, options, placeholder, error, icon,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  placeholder: string;
  error?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = value ? options.find((o) => o.id === value) : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 border-2 rounded-xl text-sm text-left transition-colors outline-none ${
          error ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
            : open ? 'border-blue-500 bg-white dark:bg-gray-800'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        {icon && <span className="text-gray-300 flex-shrink-0">{icon}</span>}
        {selected
          ? <span className="text-gray-900 dark:text-gray-100">{selected.label}</span>
          : <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>}
        <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
          {options.map((opt) => {
            const isSel = value === opt.id;
            return (
              <button key={opt.id} type="button" onClick={() => { onChange(opt.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isSel ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}
              >
                <span className={isSel ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'}>{opt.label}</span>
                {isSel && <Check className="w-4 h-4 text-gray-900 dark:text-gray-100 ml-auto flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// --- RoleDropdown ---

function RoleDropdown({
  value, onChange, error, roles, selectRolePlaceholder,
}: {
  value: string | null; onChange: (r: string) => void; error?: string; roles: RoleDefinition[]; selectRolePlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = value ? getRoleConfig(roles.find((r) => r.id === value) || { id: value, description: '', permissions: [], users: 0 }) : null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 border-2 rounded-xl text-sm text-left transition-colors outline-none ${
          error ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
            : open ? 'border-blue-500 bg-white dark:bg-gray-800'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        <Shield className="w-4 h-4 text-gray-300 flex-shrink-0" />
        {selected ? (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${selected.badgeBg} ${selected.badgeText}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selected.dot}`} />
            {selected.id}
            <TierPill tier={selected.tier} />
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{selectRolePlaceholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
          {roles.map((role, i) => {
            const r = getRoleConfig(role);
            const isSel = value === r.id;
            const prevTier = i > 0 ? getRoleConfig(roles[i - 1]).tier : null;
            const showDiv = prevTier && prevTier !== r.tier;
            return (
              <div key={r.id}>
                {showDiv && <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3" />}
                <button type="button" onClick={() => { onChange(r.id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${isSel ? 'bg-gray-50 dark:bg-gray-800' : ''} ${i === 0 ? 'rounded-t-2xl' : ''} ${i === roles.length - 1 ? 'rounded-b-2xl' : ''}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.dot}`} />
                    <span className={`text-sm font-semibold ${isSel ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{r.id}</span>
                    <TierPill tier={r.tier} />
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate ml-1 hidden sm:block">{r.desc}</span>
                  </div>
                  {isSel && <Check className="w-4 h-4 text-gray-900 dark:text-gray-100 flex-shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// --- CountryPrefixDropdown ---

function CountryPrefixDropdown({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = COUNTRY_PREFIXES.find((c) => c.prefix === value) || COUNTRY_PREFIXES[0];

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2.5 py-2.5 border-2 border-r-0 border-gray-200 dark:border-gray-700 rounded-l-xl bg-gray-50 dark:bg-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors outline-none min-w-[85px]"
      >
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="text-gray-700 dark:text-gray-300 font-medium text-xs">{selected.prefix}</span>
        <ChevronDown className={`w-3 h-3 text-gray-400 ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden max-h-52 overflow-y-auto w-56">
          {COUNTRY_PREFIXES.map((c) => {
            const isSel = value === c.prefix;
            return (
              <button key={c.code} type="button" onClick={() => { onChange(c.prefix); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isSel ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}
              >
                <span className="text-base leading-none">{c.flag}</span>
                <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{c.name}</span>
                <span className="text-gray-400 dark:text-gray-500 text-xs font-mono">{c.prefix}</span>
                {isSel && <Check className="w-3.5 h-3.5 text-gray-900 dark:text-gray-100 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- StepIndicator ---

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const s = i + 1;
        const isActive = s === current;
        const isDone = s < current;
        return (
          <React.Fragment key={s}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              isDone ? 'bg-emerald-500 text-white'
                : isActive ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              {isDone ? <Check className="w-3.5 h-3.5" /> : s}
            </div>
            {i < total - 1 && (
              <div className={`h-0.5 w-8 rounded-full transition-colors ${isDone ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// --- Main Modal ---

export function InviteUserModal({ onClose, onInvite, roles, workCenters, businesses, currentBusinessId }: InviteUserModalProps) {
  useModalClose(true, onClose);
  const { t } = useTranslation();
  void roles;
  const roleOptions = ROLES.map((item) => ({ id: item.id, description: item.desc, permissions: [], users: 0 }));

  const hasMultipleBusinesses = (businesses?.length ?? 0) > 1;
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(currentBusinessId || businesses?.[0]?.business_id || null);

  const [step, setStep] = useState(1);

  // Step 1
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+34');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Step 2
  const [position, setPosition] = useState('');
  const [contractType, setContractType] = useState<string | null>(null);
  const [grossSalary, setGrossSalary] = useState('');
  const [workCenterId, setWorkCenterId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [landingPage, setLandingPage] = useState('/saas/worker');

  // UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  function validateStep1(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t('team.inviteModal.nameRequired', 'El nombre es obligatorio');
    else if (name.trim().length < 2) e.name = t('team.inviteModal.nameMinLength', 'Minimo 2 caracteres');
    if (!email.trim()) e.email = t('team.inviteModal.emailRequired', 'El email es obligatorio');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t('team.inviteModal.emailInvalid', 'Email no valido');
    return e;
  }

  function validateStep2(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!contractType) e.contractType = 'Selecciona un tipo de contrato';
    if (!role) e.role = 'Selecciona una funcion';
    return e;
  }

  function clearFieldError(field: string) {
    if (touched[field]) {
      setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
    }
  }

  function handleNext() {
    const errs = validateStep1();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setTouched({ name: true, email: true });
      return;
    }
    setErrors({});
    setStep(2);
  }

  function handleBack() {
    setErrors({});
    setStep(1);
  }

  async function handleSubmit() {
    const errs = validateStep2();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setTouched({ contractType: true, role: true });
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const fullPhone = phoneNumber.trim() ? `${phonePrefix}${phoneNumber.trim()}` : '';
      const result = await onInvite?.({
        name: name.trim(),
        email: email.trim(),
        phone: fullPhone,
        role: role!,
        landingPage,
        position: position.trim(),
        contractType: contractType!,
        grossMonthlySalary: grossSalary.trim(),
        workCenterId: workCenterId || '',
        businessId: selectedBusinessId || undefined,
      });
      if (result) setInviteResult(result);
      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Error al enviar la invitacion';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { /* noop */ }
  }

  const selectedRoleConfig = role ? getRoleConfig(roleOptions.find((r) => r.id === role) || { id: role, description: '', permissions: [], users: 0 }) : null;
  const selectedContract = contractType ? CONTRACT_TYPES.find((c) => c.id === contractType) : null;

  function handleInviteAnother() {
    setName(''); setEmail(''); setPhonePrefix('+34'); setPhoneNumber('');
    setPosition(''); setContractType(null); setGrossSalary(''); setWorkCenterId(null);
    setRole(null); setLandingPage('/saas/worker');
    setSelectedBusinessId(currentBusinessId || businesses?.[0]?.business_id || null);
    setErrors({}); setTouched({}); setSuccess(false); setSubmitError(null);
    setInviteResult(null); setCopiedField(null); setStep(1);
  }

  const filteredWorkCenters = (workCenters || []).filter((wc) => {
    if (!wc.active) return false;
    if (!selectedBusinessId) return true;
    if (!wc.businessId) return true;
    return wc.businessId === selectedBusinessId;
  });
  const wcOptions = filteredWorkCenters.map((wc) => ({ id: wc.id, label: wc.name }));
  const businessOptions = (businesses || []).map((b) => ({ id: b.business_id, label: b.name }));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}>
      <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border-2 border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">

        {success ? (
          <>
            {/* Success header */}
            <div className="flex items-center justify-end px-6 pt-5 flex-shrink-0">
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            {/* Success body */}
            <div className="px-6 pb-6 flex flex-col items-center text-center overflow-y-auto">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                {inviteResult?.isExistingUser
                  ? 'Invitación enviada al usuario existente'
                  : 'Invitación creada'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-xs">
                {inviteResult?.isExistingUser
                  ? 'Este email ya tiene cuenta en Vertial. Verá tu invitación la próxima vez que inicie sesión y podrá aceptarla desde dentro de la app.'
                  : 'Cuando esta persona se registre en Vertial con este email, verá tu invitación y podrá unirse al equipo en un clic.'}
              </p>

              {/* Summary card */}
              <div className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center text-sm font-bold text-gray-500">
                    {name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{name.trim()}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{email.trim()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedRoleConfig && (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${selectedRoleConfig.badgeBg} ${selectedRoleConfig.badgeText}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedRoleConfig.dot}`} />
                      {selectedRoleConfig.id}
                    </span>
                  )}
                  {selectedContract && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {selectedContract.label}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {t('team.inviteModal.successPending', 'Pendiente de aceptar')}
                  </span>
                </div>
              </div>

              {/* Credentials */}
              {inviteResult?.generatedPassword && (
                <div className="w-full bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Key className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Credenciales de acceso</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-3 py-2 border border-amber-200 dark:border-amber-700">
                      <div className="text-left min-w-0">
                        <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Email</p>
                        <p className="text-sm text-gray-900 dark:text-gray-100 font-mono truncate">{email.trim()}</p>
                      </div>
                      <button type="button" onClick={() => copyToClipboard(email.trim(), 'email')} className="ml-2 p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors flex-shrink-0">
                        {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-amber-500" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-3 py-2 border border-amber-200 dark:border-amber-700">
                      <div className="text-left min-w-0">
                        <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Contrasena temporal</p>
                        <p className="text-sm text-gray-900 dark:text-gray-100 font-mono truncate">{inviteResult.generatedPassword}</p>
                      </div>
                      <button type="button" onClick={() => copyToClipboard(inviteResult.generatedPassword!, 'password')} className="ml-2 p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors flex-shrink-0">
                        {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-amber-500" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Worker must complete */}
              <div className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl px-4 py-3 mb-3 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <p className="text-xs font-bold text-blue-800 dark:text-blue-300">El trabajador debe completar</p>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {['DNI / NIE', 'Fecha de nacimiento', 'Nacionalidad', 'Lugar de nacimiento', 'Direccion completa', 'Contacto emergencia', 'N. Seguridad Social', 'Cuenta bancaria'].map((item) => (
                    <p key={item} className="text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                      {item}
                    </p>
                  ))}
                </div>
              </div>

              {/* HR must complete */}
              <div className="w-full bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-2xl px-4 py-3 mb-5 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <FileWarning className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  <p className="text-xs font-bold text-violet-800 dark:text-violet-300">Gestoria / RRHH debe completar</p>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {['Fecha de alta', 'Grupo de cotizacion', 'Mutua'].map((item) => (
                    <p key={item} className="text-[11px] text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-violet-400 flex-shrink-0" />
                      {item}
                    </p>
                  ))}
                </div>
              </div>

              {/* Estado de la invitación (in-app) */}
              <div className="w-full flex items-start gap-2.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-2xl px-4 py-3 mb-5">
                <Mail className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed text-left">
                  La invitación queda registrada para <strong>{email.trim()}</strong>.
                  {inviteResult?.inviteExpiresAt
                    ? ` Caduca el ${new Date(inviteResult.inviteExpiresAt).toLocaleDateString()}.`
                    : ''}
                </p>
              </div>

              {/* Actions */}
              <div className="w-full flex items-center gap-3">
                <button type="button" onClick={handleInviteAnother}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-semibold hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('team.inviteModal.inviteAnother', 'Invitar otro')}
                </button>
                <button type="button" onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors">
                  <Check className="w-4 h-4" />
                  {t('team.inviteModal.successClose', 'Listo')}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                  {step === 1 ? <User className="w-4 h-4 text-gray-600 dark:text-gray-400" /> : <Briefcase className="w-4 h-4 text-gray-600 dark:text-gray-400" />}
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-gray-100">
                    {step === 1 ? 'Datos personales' : 'Datos laborales'}
                  </h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {step === 1 ? 'Informacion basica del trabajador' : 'Informacion del puesto de trabajo'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StepIndicator current={step} total={2} />
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                  <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {step === 1 ? (
                <>
                  {/* Nombre completo */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Nombre completo <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                      <input type="text" value={name}
                        onChange={(e) => { setName(e.target.value); clearFieldError('name'); }}
                        onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                        placeholder="Maria Lopez Garcia"
                        className={`w-full pl-10 pr-4 py-2.5 border-2 rounded-xl text-sm outline-none transition-colors text-gray-900 dark:text-gray-100 ${
                          errors.name ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                            : touched.name && name && !errors.name ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-500'
                        }`} />
                    </div>
                    {errors.name && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><span>&#x2715;</span>{errors.name}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Email <span className="text-red-400">*</span>
                    </label>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-1.5">
                      Usa el email personal del trabajador. Recibira las credenciales para acceder y completar su perfil.
                    </p>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                      <input type="email" value={email}
                        onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                        onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                        placeholder="maria@gmail.com"
                        className={`w-full pl-10 pr-4 py-2.5 border-2 rounded-xl text-sm outline-none transition-colors text-gray-900 dark:text-gray-100 ${
                          errors.email ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                            : touched.email && email && !errors.email ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-500'
                        }`} />
                    </div>
                    {errors.email && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><span>&#x2715;</span>{errors.email}</p>}
                  </div>

                  {/* Telefono */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Numero de telefono
                    </label>
                    <div className="flex">
                      <CountryPrefixDropdown value={phonePrefix} onChange={setPhonePrefix} />
                      <input type="tel" value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                        placeholder="612 345 678"
                        className="flex-1 px-3.5 py-2.5 border-2 border-l-0 border-gray-200 dark:border-gray-700 rounded-r-xl text-sm outline-none transition-colors text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:border-blue-500" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Cargo interno */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Cargo interno
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                      <input type="text" value={position}
                        onChange={(e) => { setPosition(e.target.value); clearFieldError('position'); }}
                        onBlur={() => setTouched((p) => ({ ...p, position: true }))}
                        placeholder="Opcional: turno, notas internas, etc."
                        className={`w-full pl-10 pr-4 py-2.5 border-2 rounded-xl text-sm outline-none transition-colors text-gray-900 dark:text-gray-100 ${
                          errors.position ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-500'
                        }`} />
                    </div>
                    {errors.position && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><span>&#x2715;</span>{errors.position}</p>}
                  </div>

                  {/* Tipo de contrato */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Tipo de contrato <span className="text-red-400">*</span>
                    </label>
                    <SelectDropdown value={contractType}
                      onChange={(v) => { setContractType(v); setErrors((p) => { const n = { ...p }; delete n.contractType; return n; }); }}
                      options={CONTRACT_TYPES.map((c) => ({ id: c.id, label: c.label }))}
                      placeholder="Selecciona tipo de contrato" error={errors.contractType}
                      icon={<ClipboardList className="w-4 h-4" />} />
                  </div>

                  {/* Sueldo bruto mensual */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Sueldo bruto mensual
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                      <input type="text" value={grossSalary}
                        onChange={(e) => setGrossSalary(e.target.value.replace(/[^\d.,]/g, ''))}
                        placeholder="Ej: 1.800,00"
                        className="w-full pl-10 pr-12 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none transition-colors text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:border-blue-500" />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">&euro;/mes</span>
                    </div>
                  </div>

                  {/* Empresa */}
                  {hasMultipleBusinesses && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                        Empresa
                      </label>
                      <SelectDropdown value={selectedBusinessId} onChange={(id) => {
                        setSelectedBusinessId(id);
                        setWorkCenterId(null);
                      }}
                        options={businessOptions} placeholder="Selecciona empresa"
                        icon={<Building2 className="w-4 h-4" />} />
                    </div>
                  )}

                  {/* Centro de trabajo / PDV */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Centro de trabajo / PDV
                    </label>
                    {wcOptions.length > 0 ? (
                      <SelectDropdown value={workCenterId} onChange={setWorkCenterId}
                        options={wcOptions} placeholder="Selecciona centro de trabajo"
                        icon={<MapPin className="w-4 h-4" />} />
                    ) : (
                      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                        <MapPin className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <p className="text-xs text-gray-400 dark:text-gray-500">No hay centros de trabajo configurados. Puedes anadirlos en Ajustes.</p>
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-gray-100 dark:bg-gray-700" />

                  {/* Funcion */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Funcion del trabajador <span className="text-red-400">*</span>
                    </label>
                    <RoleDropdown value={role}
                      onChange={(r) => { setRole(r); setErrors((p) => { const n = { ...p }; delete n.role; return n; }); }}
                      error={errors.role} roles={roleOptions}
                      selectRolePlaceholder="Selecciona funcion" />
                  </div>

                  {/* Pagina inicial */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      {t('team.inviteModal.landingPage', 'Pagina inicial')}
                    </label>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
                      {t('team.inviteModal.landingPageHint', 'La primera pantalla que vera este usuario al iniciar sesion.')}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {LANDING_PAGES.map((page) => {
                        const isActive = landingPage === page.id;
                        const label = t(`team.inviteModal.pages.${page.id.replace('/saas/', '')}`, page.id.replace('/saas/', ''));
                        return (
                          <button key={page.id} type="button" onClick={() => setLandingPage(page.id)}
                            className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                              isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}>
                            <span className={isActive ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}>{page.icon}</span>
                            <span className="truncate w-full text-center text-[10px] leading-tight">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl px-4 py-3">
                    <Mail className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                      {t('team.inviteModal.emailInfo', 'Se enviara un correo al trabajador con las credenciales de acceso para que complete su perfil.')}
                    </p>
                  </div>

                  {submitError && (
                    <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3">
                      <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">{submitError}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-3 flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              {step === 1 ? (
                <>
                  <button type="button" onClick={onClose}
                    className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-semibold hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                    {t('common.cancel', 'Cancelar')}
                  </button>
                  <button type="button" onClick={handleNext}
                    className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors">
                    Siguiente
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={handleBack}
                    className="flex items-center gap-2 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-semibold hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Atras
                  </button>
                  <button type="button" onClick={handleSubmit} disabled={isSubmitting}
                    className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                    <Mail className="w-4 h-4" />
                    {isSubmitting ? t('team.inviteModal.submitting', 'Enviando...') : t('team.inviteModal.submit', 'Enviar invitacion')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
