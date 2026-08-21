import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  X, Mail, User, Shield, ChevronDown, Wrench, Star, Check, CheckCircle2,
  ArrowLeft, ArrowRight, Loader2, Briefcase,
  Building2, MapPin, ClipboardList, UserCheck, FileWarning,
  DollarSign, Clock, AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InviteLookupResult, RoleDefinition } from '../../lib/authApi';
import { isWorkerAccount } from '../../lib/authApi';
import type { Business } from '../../lib/businessApi';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useInviteWorkCenters } from '../../hooks/useInviteWorkCenters';
import { getDefaultInviteLandingPage } from '../../lib/inviteDefaults';
import { getHrLocationCopy } from '../../lib/retailLocationCopy';
import {
  getFunctionRolesForBusiness,
  getInvitePositionSuggestions,
  getInviteRoleDisplayLabel,
  suggestPositionForInviteRole,
} from '../../lib/inviteFunctionRoles';
import { isBusinessOwner, isOwnerOnlyPeerRole } from '../../lib/accountOwnerPrecedence';
import { isEventsBusinessType, isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import {
  computeLaborCostBreakdown,
  formatLaborCurrency,
  resolvePayPeriodsPerYear,
} from '../../lib/laborCost';
import { listShiftTemplates, type ShiftTemplate } from '../../lib/schedulesApi';
import { getRoleTaskBundle } from '../../lib/roleTaskTemplates';
import { workerSeatBillingWarning } from '../../lib/workerSeatLimits';
import { VertialBillingUpgradeLink } from './VertialBillingUpgradeLink';
import { inviteRoleUsesCeoAdminPanel } from '../../lib/teamManagerAccess';

interface InviteResult {
  isExistingUser?: boolean;
  inviteExpiresAt?: string;
  emailSent?: boolean;
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
  payPeriodsPerYear?: number;
  workCenterId: string;
  scheduleTemplateId?: string;
  businessId?: string;
}

interface InviteUserModalProps {
  onClose: () => void;
  onInvite?: (data: InviteUserPayload) => Promise<InviteResult | void> | InviteResult | void;
  /** Comprueba en vivo si el email está registrado en Vertial (y si es invitable). */
  onLookupEmail?: (
    email: string,
    businessId?: string,
  ) => Promise<InviteLookupResult & { success: boolean; error?: string }>;
  roles?: RoleDefinition[];
  /** @deprecated El modal carga tiendas solo; mantener solo por compatibilidad. */
  workCenters?: { id: string; name: string; active?: boolean; businessId?: string }[];
  businesses?: Business[];
  currentBusinessId?: string;
  /** Cupo de trabajadores (para avisar si al pasarse sube la facturación). */
  workerSeats?: {
    used: number;
    limit: number;
    remaining: number;
    canInvite: boolean;
  } | null;
}

type EmailStatus =
  | 'idle'
  | 'invalid'
  | 'checking'
  | 'ready'
  | 'not_registered'
  | 'already_member'
  | 'owns_other'
  | 'company_account'
  | 'error';

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

const PAY_PERIODS_OPTIONS = [
  { id: '14', label: '14 pagas (12 mensuales + 2 extras)' },
  { id: '12', label: '12 pagas (extras prorrateadas en nómina)' },
] as const;

const CONTRACT_TYPES = [
  { id: 'indefinido', label: 'Indefinido' },
  { id: 'temporal', label: 'Temporal' },
  { id: 'practicas', label: 'En practicas' },
  { id: 'formacion', label: 'Formacion y aprendizaje' },
  { id: 'obra_servicio', label: 'Por obra o servicio' },
  { id: 'interinidad', label: 'Interinidad' },
  { id: 'fijo_discontinuo', label: 'Fijo discontinuo' },
  { id: 'autonomo', label: 'Autónomo / colaborador (sin nómina)' },
] as const;

function isNoPayrollContract(contractId?: string | null): boolean {
  return contractId === 'autonomo';
}

/** Sueldo: solo dígitos → miles con punto (es-ES), p. ej. 1200 → "1.200". */
function formatSalaryThousandsEs(digitsOnly: string): string {
  if (!digitsOnly) return '';
  const n = Number(digitsOnly);
  if (!Number.isFinite(n) || n < 0) return '';
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: true });
}

function salaryDigitsFromDisplay(display: string): string {
  return display.replace(/\D/g, '');
}

// --- Worker Function Config (estilos; textos/lista vienen de inviteFunctionRoles) ---

const ROLE_STYLE: Record<
  string,
  {
    dot: string;
    badgeBg: string;
    badgeText: string;
    dotColor: string;
    icon: React.ReactNode;
    tier: 'standard' | 'normal' | 'pro';
  }
> = {
  Admin: {
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    dotColor: '#f59e0b',
    icon: <Shield className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
  Administrador: {
    dot: 'bg-slate-900',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    dotColor: '#111827',
    icon: <Shield className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
  Gestor: {
    dot: 'bg-violet-500',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    dotColor: '#8b5cf6',
    icon: <ClipboardList className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
  Encargado: {
    dot: 'bg-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    dotColor: '#3b82f6',
    icon: <Star className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
  'Mostrador / Atención': {
    dot: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    dotColor: '#10b981',
    icon: <User className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
  Cocina: {
    dot: 'bg-orange-500',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    dotColor: '#f97316',
    icon: <Wrench className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
  Reparto: {
    dot: 'bg-violet-500',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    dotColor: '#8b5cf6',
    icon: <MapPin className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
  Comercial: {
    dot: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    dotColor: '#10b981',
    icon: <Briefcase className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
  Operaciones: {
    dot: 'bg-sky-500',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
    dotColor: '#0ea5e9',
    icon: <Clock className="w-3.5 h-3.5" />,
    tier: 'standard',
  },
};

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

function getRoleTier(_roleId: string) {
  void _roleId;
  return 'standard' as const;
}

function getRoleConfig(
  role: RoleDefinition,
  businessType?: string | null,
) {
  const style = ROLE_STYLE[role.id];
  const label = getInviteRoleDisplayLabel(role.id, businessType);
  const desc = role.description || 'Función del trabajador.';
  if (style) {
    return { ...style, id: role.id, label, desc };
  }
  return {
    id: role.id,
    label,
    desc,
    dot: 'bg-sky-500',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
    dotColor: '#0ea5e9',
    icon: <Shield className="w-3.5 h-3.5" />,
    tier: getRoleTier(role.id),
  };
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
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
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
  value, onChange, error, roles, selectRolePlaceholder, businessType,
}: {
  value: string | null;
  onChange: (r: string) => void;
  error?: string;
  roles: RoleDefinition[];
  selectRolePlaceholder: string;
  businessType?: string | null;
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

  const selected = value
    ? getRoleConfig(roles.find((r) => r.id === value) || { id: value, description: '', permissions: [], users: 0 }, businessType)
    : null;

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
            {selected.label}
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
            const r = getRoleConfig(role, businessType);
            const isSel = value === r.id;
            const prevTier = i > 0 ? getRoleConfig(roles[i - 1], businessType).tier : null;
            const showDiv = prevTier && prevTier !== r.tier;
            return (
              <div key={r.id}>
                {showDiv && <div className="h-px bg-gray-100 dark:bg-gray-700 mx-3" />}
                <button type="button" onClick={() => { onChange(r.id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${isSel ? 'bg-gray-50 dark:bg-gray-800' : ''} ${i === 0 ? 'rounded-t-2xl' : ''} ${i === roles.length - 1 ? 'rounded-b-2xl' : ''}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.dot}`} />
                    <span className={`text-sm font-semibold ${isSel ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{r.label}</span>
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

function CountryPrefixDropdown({ value, onChange, embedded }: { value: string; onChange: (p: string) => void; embedded?: boolean }) {
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
    <div ref={ref} className={`relative ${embedded ? 'h-full' : ''}`}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={
          embedded
            ? 'flex h-full min-h-[44px] items-center gap-1 px-2.5 border-0 bg-gray-50 dark:bg-gray-700/90 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors outline-none min-w-[88px]'
            : 'flex items-center gap-1 px-2.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors outline-none min-w-[85px]'
        }
      >
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="text-gray-700 dark:text-gray-300 font-medium text-xs">{selected.prefix}</span>
        <ChevronDown className={`w-3 h-3 text-gray-400 ml-auto shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
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

export function InviteUserModal({ onClose, onInvite, onLookupEmail, roles, workCenters, businesses, currentBusinessId, workerSeats }: InviteUserModalProps) {
  useModalClose(true, onClose);
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness: ctxBusiness } = useBusiness();

  const businessList = businesses?.length ? businesses : ctxBusiness ? [ctxBusiness] : [];
  const hasMultipleBusinesses = businessList.length > 1;
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(
    currentBusinessId || businessList[0]?.business_id || null,
  );

  const inviteBusiness = businessList.find((b) => b.business_id === selectedBusinessId)
    ?? ctxBusiness
    ?? businessList[0]
    ?? null;

  const inviteAsOwner = isBusinessOwner(inviteBusiness, user?.user_id) && !isWorkerAccount(user);

  const roleOptions = useMemo(() => {
    const base = roles?.length
      ? roles
      : getFunctionRolesForBusiness(inviteBusiness?.businessType ?? ctxBusiness?.businessType, {
          ownDeliveryEnabled: Boolean(
            inviteBusiness?.ownDeliveryEnabled ?? ctxBusiness?.ownDeliveryEnabled,
          ),
        });
    // Titular: todos los roles. Admin invitado: todo excepto Admin/Administrador (solo titular).
    if (inviteAsOwner) return base;
    return base.filter((r) => !isOwnerOnlyPeerRole(r.id));
  }, [
    roles,
    inviteBusiness?.businessType,
    inviteBusiness?.ownDeliveryEnabled,
    ctxBusiness?.businessType,
    ctxBusiness?.ownDeliveryEnabled,
    inviteAsOwner,
  ]);

  const hrCopy = getHrLocationCopy(inviteBusiness?.businessType ?? ctxBusiness?.businessType);
  const inviteBusinessType = inviteBusiness?.businessType ?? ctxBusiness?.businessType;
  const isRestaurantInvite = isRestaurantBusinessType(inviteBusinessType);
  const isEventsInvite = isEventsBusinessType(inviteBusinessType);
  const positionSuggestions = useMemo(
    () => getInvitePositionSuggestions(inviteBusinessType),
    [inviteBusinessType],
  );

  const { options: loadedWorkCenterOptions, loading: workCentersLoading } = useInviteWorkCenters(
    inviteBusiness,
    true,
  );

  const [step, setStep] = useState(1);

  // Step 1
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+34');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Lookup en vivo: solo se permite invitar a cuentas que ya existen en Vertial.
  const [emailStatus, setEmailStatus] = useState<EmailStatus>('idle');
  const [lookupResult, setLookupResult] = useState<InviteLookupResult | null>(null);
  const lookupSeqRef = useRef(0);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2
  const [contractType, setContractType] = useState<string | null>(null);
  const [grossSalary, setGrossSalary] = useState('');
  const [payPeriodsPerYear, setPayPeriodsPerYear] = useState<string>('14');
  const [workCenterId, setWorkCenterId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [position, setPosition] = useState('');
  const [scheduleTemplateId, setScheduleTemplateId] = useState<string | null>(null);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Al cambiar negocio: si el rol ya no existe en el catálogo, resetear.
  // Inmobiliaria: preseleccionar Comercial (rol operativo de visitas).
  useEffect(() => {
    const ids = new Set(roleOptions.map((r) => r.id));
    if (inviteBusinessType === 'realEstate' && ids.has('Comercial')) {
      setRole((prev) => (prev && ids.has(prev) ? prev : 'Comercial'));
      setPosition((prev) => {
        if (prev.trim()) return prev;
        return suggestPositionForInviteRole('Comercial', 'realEstate');
      });
      return;
    }
    setRole((prev) => (prev && ids.has(prev) ? prev : null));
  }, [inviteBusinessType, roleOptions, selectedBusinessId]);

  useEffect(() => {
    setWorkCenterId(null);
    setScheduleTemplateId(null);
  }, [selectedBusinessId]);

  useEffect(() => {
    const businessId = selectedBusinessId || currentBusinessId || inviteBusiness?.business_id || '';
    if (!businessId) {
      setShiftTemplates([]);
      return;
    }
    let cancelled = false;
    setTemplatesLoading(true);
    listShiftTemplates(businessId)
      .then((list) => {
        if (!cancelled) setShiftTemplates(list);
      })
      .catch(() => {
        if (!cancelled) setShiftTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedBusinessId, currentBusinessId, inviteBusiness?.business_id]);

  // UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  // ── Lookup del email en Vertial ──────────────────────────────────────────────
  useEffect(() => {
    if (lookupTimerRef.current) {
      clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = null;
    }

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailStatus('idle');
      setLookupResult(null);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailStatus('invalid');
      setLookupResult(null);
      return;
    }
    if (!onLookupEmail) {
      setEmailStatus('ready');
      setLookupResult(null);
      return;
    }

    setEmailStatus('checking');
    const seq = lookupSeqRef.current + 1;
    lookupSeqRef.current = seq;

    lookupTimerRef.current = setTimeout(async () => {
      const result = await onLookupEmail(trimmed, selectedBusinessId || currentBusinessId || '');
      if (seq !== lookupSeqRef.current) return;

      if (!result.success) {
        setEmailStatus('error');
        setLookupResult(null);
        return;
      }
      if (!result.exists) {
        setEmailStatus('not_registered');
        setLookupResult(result);
        return;
      }
      if (result.alreadyMember || result.isOwner) {
        setEmailStatus('already_member');
        setLookupResult(result);
        return;
      }
      if (result.ownsOtherBusinessName) {
        setEmailStatus('owns_other');
        setLookupResult(result);
        return;
      }
      if (result.isCompanyAccount) {
        setEmailStatus('company_account');
        setLookupResult(result);
        return;
      }
      setEmailStatus('ready');
      setLookupResult(result);
      if (result.fullName && !name.trim()) {
        setName(result.fullName);
      }
    }, 450);

    return () => {
      if (lookupTimerRef.current) {
        clearTimeout(lookupTimerRef.current);
        lookupTimerRef.current = null;
      }
    };
    // Intencional: no incluimos `name` para no relanzar el lookup al autocompletarlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, selectedBusinessId, currentBusinessId, onLookupEmail]);

  function validateStep1(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t('team.inviteModal.nameRequired', 'El nombre es obligatorio');
    else if (name.trim().length < 2) e.name = t('team.inviteModal.nameMinLength', 'Minimo 2 caracteres');
    if (!email.trim()) e.email = t('team.inviteModal.emailRequired', 'El email es obligatorio');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t('team.inviteModal.emailInvalid', 'Email no valido');
    else if (emailStatus === 'not_registered') { /* se puede invitar: llegará email para registrarse */ }
    else if (emailStatus === 'already_member') e.email = 'Esta persona ya forma parte del equipo de esta empresa.';
    else if (emailStatus === 'owns_other') e.email = `Esta persona administra otra empresa (${lookupResult?.ownsOtherBusinessName || 'sin nombre'}). Por ahora no puede unirse a un segundo equipo.`;
    else if (emailStatus === 'company_account') e.email = 'Este email es una cuenta de empresa. Debe crearse una cuenta de trabajador (Acceso empleado) para poder invitarla.';
    else if (emailStatus === 'checking') e.email = 'Comprobando el email en Vertial…';
    return e;
  }

  function validateStep2(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!contractType) e.contractType = 'Selecciona un tipo de contrato';
    if (!role) e.role = 'Selecciona una funcion';
    const salaryDigits = salaryDigitsFromDisplay(grossSalary);
    if (!isNoPayrollContract(contractType)) {
      if (!salaryDigits) e.grossSalary = 'Indica el bruto mensual del contrato';
      else if (Number(salaryDigits) < 200) e.grossSalary = 'El importe parece demasiado bajo';
    }
    // Tienda/PDV: obligatorio solo si hay locales y no es eventos (sin PDV).
    const hasStoreOptions =
      !workCentersLoading
      && (
        loadedWorkCenterOptions.length > 0
        || (workCenters || []).some((wc) => wc.active !== false)
      );
    if (!isEventsInvite && hasStoreOptions && !String(workCenterId || '').trim()) {
      e.workCenterId = 'Selecciona la tienda o local del trabajador';
    }
    // Horario obligatorio salvo Eventos (sin fichaje de tienda).
    if (!isEventsInvite) {
      if (!templatesLoading && shiftTemplates.length === 0) {
        e.scheduleTemplateId =
          'Crea una plantilla de horario en Equipo → Horarios y vacaciones antes de invitar.';
      } else if (!templatesLoading && !String(scheduleTemplateId || '').trim()) {
        e.scheduleTemplateId = 'Selecciona la plantilla de horario del trabajador';
      }
    }
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
    if (emailStatus !== 'ready' && emailStatus !== 'not_registered') {
      setErrors({ email: emailStatus === 'checking'
        ? 'Espera a que terminemos de comprobar el email en Vertial.'
        : 'No se puede invitar este email.' });
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
    if (workerSeats && workerSeats.canInvite === false) {
      const warn = workerSeatBillingWarning(workerSeats);
      setSubmitError(
        warn?.body
        || 'Cupo completo: invitar a alguien más sube la facturación. Amplía el cupo en Mi plan.',
      );
      return;
    }
    const errs = validateStep2();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setTouched({
        contractType: true,
        role: true,
        grossSalary: true,
        workCenterId: true,
        scheduleTemplateId: true,
      });
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
        landingPage: getDefaultInviteLandingPage(inviteBusiness?.businessType, role),
        position: position.trim() || suggestPositionForInviteRole(role, inviteBusinessType),
        contractType: contractType!,
        grossMonthlySalary: salaryDigitsFromDisplay(grossSalary),
        payPeriodsPerYear: Number(payPeriodsPerYear) || resolvePayPeriodsPerYear(contractType!),
        workCenterId: workCenterId || '',
        scheduleTemplateId: scheduleTemplateId || '',
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

  const seatBillingWarn = useMemo(
    () => workerSeatBillingWarning(workerSeats || null),
    [workerSeats],
  );

  const selectedRoleConfig = role
    ? getRoleConfig(
      roleOptions.find((r) => r.id === role) || { id: role, description: '', permissions: [], users: 0 },
      inviteBusinessType,
    )
    : null;
  const selectedContract = contractType ? CONTRACT_TYPES.find((c) => c.id === contractType) : null;
  const selectedTemplate = scheduleTemplateId
    ? shiftTemplates.find((t) => t._id === scheduleTemplateId)
    : null;

  const templateOptions = useMemo(
    () =>
      shiftTemplates.map((t) => ({
        id: t._id,
        label: `${t.name}${t.weeklyHours ? ` · ${t.weeklyHours}h` : ''}`,
      })),
    [shiftTemplates],
  );

  const salaryPreview = useMemo(() => {
    const digits = salaryDigitsFromDisplay(grossSalary);
    if (!digits || !contractType) return null;
    return computeLaborCostBreakdown({
      salary: digits,
      contractType,
      workday: 'completa',
      payPeriodsPerYear: Number(payPeriodsPerYear) || resolvePayPeriodsPerYear(contractType),
    });
  }, [grossSalary, contractType, payPeriodsPerYear]);

  function handleInviteAnother() {
    setName(''); setEmail(''); setPhonePrefix('+34'); setPhoneNumber('');
    setContractType(null); setGrossSalary(''); setPayPeriodsPerYear('14'); setWorkCenterId(null);
    setRole(null); setScheduleTemplateId(null);
    setSelectedBusinessId(currentBusinessId || businesses?.[0]?.business_id || null);
    setErrors({}); setTouched({}); setSuccess(false); setSubmitError(null);
    setInviteResult(null); setStep(1);
    setEmailStatus('idle'); setLookupResult(null);
  }

  const legacyWcOptions = (workCenters || [])
    .filter((wc) => wc.active !== false)
    .filter((wc) => !selectedBusinessId || !wc.businessId || wc.businessId === selectedBusinessId)
    .map((wc) => ({ id: wc.id, label: wc.name }));

  const wcOptions = loadedWorkCenterOptions.length > 0
    ? loadedWorkCenterOptions.map((wc) => ({ id: wc.id, label: wc.label }))
    : legacyWcOptions;

  const businessOptions = businessList.map((b) => ({ id: b.business_id, label: b.name }));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}>
      <div className="bg-white dark:bg-gray-800 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border-2 border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[min(92vh,880px)]">

        {success ? (
          <>
            {/* Success header */}
            <div className="flex items-center justify-end px-6 pt-5 flex-shrink-0">
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            {/* Success body */}
            <div className="px-6 pb-6 flex flex-col items-center text-center overflow-y-auto overscroll-contain">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                Invitación enviada
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-sm">
                Hemos enviado un correo a{' '}
                <strong className="text-gray-700 dark:text-gray-200">{email.trim()}</strong>
                {inviteResult?.isExistingUser
                  ? ' para que acepte y se una al equipo.'
                  : ' para que cree su acceso y se una al equipo.'}
                {' '}Al aceptar, entrará con la función y permisos asignados.
              </p>

              {/* Summary card */}
              <div className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center text-sm font-bold text-gray-500">
                    {(lookupResult?.fullName || name).trim().charAt(0).toUpperCase() || email.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{(lookupResult?.fullName || name).trim() || email.trim()}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{email.trim()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedRoleConfig && (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${selectedRoleConfig.badgeBg} ${selectedRoleConfig.badgeText}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedRoleConfig.dot}`} />
                      {selectedRoleConfig.label}
                    </span>
                  )}
                  {selectedContract && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {selectedContract.label}
                    </span>
                  )}
                  {selectedTemplate && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                      <Clock className="w-3 h-3" />
                      {selectedTemplate.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {t('team.inviteModal.successPending', 'Pendiente de aceptar')}
                  </span>
                </div>
              </div>

              <div className="w-full flex items-start gap-2.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-2xl px-4 py-3 mb-5">
                <Mail className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed text-left">
                  Revisa la bandeja de entrada (y spam) de <strong>{email.trim()}</strong>.
                  {inviteResult?.emailSent === false
                    ? ' Ojo: el correo puede no haberse enviado; prueba a reenviar desde Equipo.'
                    : ''}
                  {inviteResult?.inviteExpiresAt
                    ? ` El enlace caduca el ${new Date(inviteResult.inviteExpiresAt).toLocaleDateString()}.`
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

            {seatBillingWarn && (
              <div
                className={`mx-6 mt-4 rounded-xl border px-3.5 py-3 flex gap-2.5 flex-shrink-0 ${
                  seatBillingWarn.tone === 'block'
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40'
                    : seatBillingWarn.tone === 'warn'
                      ? 'border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30'
                      : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
                }`}
              >
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    seatBillingWarn.tone === 'info' ? 'text-blue-600' : 'text-amber-600'
                  }`}
                />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{seatBillingWarn.title}</p>
                  <p className="mt-0.5 text-gray-600 dark:text-gray-300 leading-snug">{seatBillingWarn.body}</p>
                  {seatBillingWarn.tone === 'block' && (
                    <VertialBillingUpgradeLink
                      to="/saas/settings/facturacion"
                      className="mt-2 inline-flex text-sm font-semibold text-blue-600 hover:underline"
                    >
                      Ir a Mi plan / facturación
                    </VertialBillingUpgradeLink>
                  )}
                </div>
              </div>
            )}

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
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
                      La persona debe tener cuenta en Vertial. Verá tu invitación al iniciar sesión y podrá aceptarla con un clic.
                    </p>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                      <input type="email" value={email}
                        onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                        onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                        placeholder="maria@gmail.com"
                        className={`w-full pl-10 pr-10 py-2.5 border-2 rounded-xl text-sm outline-none transition-colors text-gray-900 dark:text-gray-100 ${
                          emailStatus === 'already_member' || emailStatus === 'owns_other' || emailStatus === 'company_account' || (errors.email && touched.email)
                            ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                            : emailStatus === 'ready' || emailStatus === 'not_registered'
                              ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-500'
                        }`} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                        {emailStatus === 'checking' && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                        {(emailStatus === 'ready' || emailStatus === 'not_registered') && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        {(emailStatus === 'already_member' || emailStatus === 'owns_other' || emailStatus === 'company_account') && (
                          <X className="w-4 h-4 text-red-500" />
                        )}
                      </span>
                    </div>

                    {/* Feedback contextual del lookup */}
                    {emailStatus === 'ready' && lookupResult?.fullName && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                            {lookupResult.fullName}
                          </p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            Cuenta verificada en Vertial · puedes invitarla
                          </p>
                        </div>
                      </div>
                    )}
                    {emailStatus === 'not_registered' && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
                        <Mail className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed text-blue-700 dark:text-blue-300">
                          Este email aún no tiene cuenta. Al invitar, le enviaremos un correo para que cree su acceso y se una al equipo.
                        </p>
                      </div>
                    )}
                    {emailStatus === 'already_member' && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                        <UserCheck className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                          {lookupResult?.fullName ? `${lookupResult.fullName} ya forma parte` : 'Esta persona ya forma parte'} del equipo de esta empresa.
                        </p>
                      </div>
                    )}
                    {emailStatus === 'owns_other' && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                        <Building2 className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                          Esta persona administra otra empresa{lookupResult?.ownsOtherBusinessName ? ` (${lookupResult.ownsOtherBusinessName})` : ''}. Por ahora no puede unirse a un segundo equipo.
                        </p>
                      </div>
                    )}
                    {emailStatus === 'company_account' && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                        <Building2 className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                          Este email es una cuenta de empresa. Para el equipo hace falta una cuenta de trabajador (Acceso empleado).
                        </p>
                      </div>
                    )}
                    {errors.email && emailStatus !== 'not_registered' && emailStatus !== 'already_member' && emailStatus !== 'owns_other' && emailStatus !== 'company_account' && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><span>&#x2715;</span>{errors.email}</p>
                    )}
                  </div>

                  {/* Telefono */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Numero de telefono
                    </label>
                    <div className="flex min-h-[46px] items-stretch rounded-xl border-2 border-gray-200 bg-white transition-colors focus-within:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:focus-within:border-blue-500">
                      <CountryPrefixDropdown embedded value={phonePrefix} onChange={setPhonePrefix} />
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="612345678"
                        className="min-w-0 flex-1 border-0 border-l border-gray-200 bg-transparent py-2.5 pl-3.5 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Funcion del trabajador (primera linea) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Función del trabajador <span className="text-red-400">*</span>
                    </label>
                    <RoleDropdown
                      value={role}
                      onChange={(r) => {
                        setRole(r);
                        setPosition((prev) => {
                          const suggested = suggestPositionForInviteRole(r, inviteBusinessType);
                          if (!prev.trim()) return suggested;
                          // Si el cargo actual era la sugerencia del rol anterior, actualízalo.
                          const prevSuggested = suggestPositionForInviteRole(role, inviteBusinessType);
                          if (prev.trim() === prevSuggested) return suggested;
                          return prev;
                        });
                        setErrors((p) => {
                          const n = { ...p };
                          delete n.role;
                          return n;
                        });
                      }}
                      error={errors.role}
                      roles={roleOptions}
                      selectRolePlaceholder={isRestaurantInvite ? 'Selecciona función (sala, cocina…)' : 'Selecciona función'}
                      businessType={inviteBusinessType}
                    />
                    {role && (() => {
                      if (inviteRoleUsesCeoAdminPanel(role)) {
                        const isEvents = inviteBusinessType === 'events';
                        const isAccountAdmin = role === 'Admin' || role === 'Gerente' || role === 'GerenteGrupo';
                        const isAdministrador = role === 'Administrador';
                        return (
                          <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 dark:border-blue-900 dark:bg-blue-950/30">
                            <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-200">
                              {isAccountAdmin
                                ? 'Al aceptar, tendrá acceso como el creador de la cuenta:'
                                : isAdministrador
                                  ? 'Al aceptar, llevará el SaaS del negocio:'
                                  : 'Al aceptar, entrará al panel de administración:'}
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {isAccountAdmin ? (
                                <>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Todo el panel (dashboard, finanzas, clientes, equipo y ajustes)
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Misma capacidad operativa que el titular en el día a día
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Campana y push del negocio (presupuestos, cobros, caja…)
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Puede invitar Encargado/Gestor y operativos
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Solo el titular: plan/facturación e invitar otros Admin
                                  </li>
                                </>
                              ) : isAdministrador ? (
                                <>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Panel SaaS: operación, cobros, clientes y equipo
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Gestiona el negocio en el día a día
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Campana y push del negocio (presupuestos, cobros, caja…)
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Sin restricción a «Mi trabajo»
                                  </li>
                                </>
                              ) : isEvents ? (
                                <>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Centro de eventos, contrataciones y presupuestos
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Clientes, cobros, finanzas y equipo
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Campana y push del negocio (presupuestos, cobros, caja…)
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Todo el menú de la vertical eventos
                                  </li>
                                </>
                              ) : (
                                <>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Dashboard y menú completo del negocio
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Equipo, nóminas y operación
                                  </li>
                                  <li className="text-[11px] text-blue-900/85 dark:text-blue-100/85">
                                    · Campana y push del negocio
                                  </li>
                                </>
                              )}
                            </ul>
                          </div>
                        );
                      }
                      const bundle = getRoleTaskBundle(role, inviteBusinessType);
                      if (!bundle?.tasks?.length) return null;
                      return (
                        <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 dark:border-indigo-900 dark:bg-indigo-950/30">
                          <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                            Al aceptar, verá en Mi trabajo:
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {bundle.tasks.slice(0, 4).map((task) => (
                              <li key={task.key} className="text-[11px] text-indigo-900/80 dark:text-indigo-100/80">
                                · {task.title}
                              </li>
                            ))}
                            {bundle.tasks.length > 4 ? (
                              <li className="text-[11px] text-indigo-600/70 dark:text-indigo-300/70">
                                · +{bundle.tasks.length - 4} más
                              </li>
                            ) : null}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Cargo / posición RRHH */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Cargo / posición
                    </label>
                    <input
                      type="text"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder={hrCopy.memberPositionPlaceholder}
                      className="w-full px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
                    />
                    {positionSuggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {positionSuggestions.map((chip) => {
                          const active = position.trim() === chip;
                          return (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setPosition(chip)}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${
                                active
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                              }`}
                            >
                              {chip}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Tipo de contrato */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Tipo de contrato <span className="text-red-400">*</span>
                    </label>
                    <SelectDropdown
                      value={contractType}
                      onChange={(v) => {
                        setContractType(v);
                        setPayPeriodsPerYear(String(resolvePayPeriodsPerYear(v)));
                        setErrors((p) => {
                          const n = { ...p };
                          delete n.contractType;
                          if (isNoPayrollContract(v)) delete n.grossSalary;
                          return n;
                        });
                      }}
                      options={CONTRACT_TYPES.map((c) => ({ id: c.id, label: c.label }))}
                      placeholder="Selecciona tipo de contrato"
                      error={errors.contractType}
                      icon={<ClipboardList className="w-4 h-4" />}
                    />
                    {(role === 'Admin' || role === 'Administrador') && (
                      <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        Si es un ayudante y no va a nómina, elige <span className="font-semibold">Autónomo / colaborador</span>.
                      </p>
                    )}
                  </div>

                  {/* Sueldo: obligatorio en nómina; opcional si autónomo */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      {isNoPayrollContract(contractType)
                        ? 'Honorarios / importe (opcional)'
                        : 'Bruto mensual del contrato'}
                      {!isNoPayrollContract(contractType) && <span className="text-red-400"> *</span>}
                    </label>
                    <div className="relative">
                      <DollarSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={grossSalary}
                        onChange={(e) => {
                          const digits = salaryDigitsFromDisplay(e.target.value);
                          setGrossSalary(digits ? formatSalaryThousandsEs(digits) : '');
                          setErrors((p) => {
                            const n = { ...p };
                            delete n.grossSalary;
                            return n;
                          });
                        }}
                        placeholder={isNoPayrollContract(contractType) ? 'Sin importe o lo que facture' : 'Ej: 1.200'}
                        className={`w-full rounded-xl border-2 bg-white py-2.5 pl-10 pr-14 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 ${
                          errors.grossSalary ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'
                        }`}
                      />
                      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">
                        &euro;/mes
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      {isNoPayrollContract(contractType)
                        ? 'No entra en nómina ni Seguridad Social de empresa. Puedes dejarlo vacío.'
                        : 'Lo que cobra en nómina cada mes, antes de IRPF. Con esto calculamos la Seguridad Social y el coste real para la empresa.'}
                    </p>
                    {errors.grossSalary && (
                      <p className="mt-1 text-xs text-red-500">{errors.grossSalary}</p>
                    )}
                  </div>

                  {!isNoPayrollContract(contractType) && (
                  <>
                  {/* Pagas al año */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Pagas al año
                    </label>
                    <SelectDropdown
                      value={payPeriodsPerYear}
                      onChange={setPayPeriodsPerYear}
                      options={PAY_PERIODS_OPTIONS.map((p) => ({ id: p.id, label: p.label }))}
                      placeholder="Pagas al año"
                      icon={<ClipboardList className="w-4 h-4" />}
                    />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      En España lo habitual son 14 pagas (junio y diciembre extras). Si tiene 2 pagas extras, el coste mensual real es mayor que el bruto de nómina.
                    </p>
                  </div>
                  </>
                  )}

                  {salaryPreview && (
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 space-y-2">
                      <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200 uppercase tracking-wide">
                        Coste calculado con estos datos
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Bruto nómina</span>
                        <span className="text-right font-semibold text-gray-900 dark:text-white">{formatLaborCurrency(salaryPreview.grossMonthly)}</span>
                        <span className="text-gray-600 dark:text-gray-400">
                          Pagas extras ({salaryPreview.extraPayCount})
                        </span>
                        <span className="text-right text-gray-900 dark:text-white">
                          {salaryPreview.extraPayCount > 0
                            ? `${formatLaborCurrency(salaryPreview.grossMonthly)} × ${salaryPreview.extraPayCount}`
                            : '—'}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">Bruto medio/mes (con extras)</span>
                        <span className="text-right font-semibold text-gray-900 dark:text-white">{formatLaborCurrency(salaryPreview.monthlyAverageGross)}</span>
                        <span className="text-gray-600 dark:text-gray-400">SS empresa/mes</span>
                        <span className="text-right font-semibold text-blue-600 dark:text-blue-400">{formatLaborCurrency(salaryPreview.socialSecurityCost)}</span>
                        <span className="text-gray-600 dark:text-gray-400 font-medium">Coste total empresa/mes</span>
                        <span className="text-right font-bold text-emerald-700 dark:text-emerald-300">{formatLaborCurrency(salaryPreview.totalMonthlyEmployerCost)}</span>
                      </div>
                    </div>
                  )}

                  {/* Empresa */}
                  {hasMultipleBusinesses && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                        Empresa
                      </label>
                      <SelectDropdown
                        value={selectedBusinessId}
                        onChange={(id) => {
                          setSelectedBusinessId(id);
                          setWorkCenterId(null);
                        }}
                        options={businessOptions}
                        placeholder="Selecciona empresa"
                        icon={<Building2 className="w-4 h-4" />}
                      />
                    </div>
                  )}

                  {/* Centro de trabajo / local — en eventos no hay PDV */}
                  {isEventsInvite ? (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3.5 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/20">
                      <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-200">
                        Sin tienda ni PDV
                      </p>
                      <p className="mt-0.5 text-[11px] text-emerald-900/80 dark:text-emerald-100/80">
                        En catering/eventos no se asigna caja ni punto de venta. Puedes invitar sin crear tiendas.
                      </p>
                    </div>
                  ) : (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      {hrCopy.inviteWorkCenterLabel} <span className="text-red-500">*</span>
                    </label>
                    {workCentersLoading ? (
                      <div className="flex items-center gap-2.5 rounded-xl border-2 border-gray-200 bg-gray-50 px-3.5 py-2.5 dark:border-gray-700 dark:bg-gray-800/50">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">{hrCopy.inviteWorkCentersLoading}</p>
                      </div>
                    ) : wcOptions.length > 0 ? (
                      <>
                        <SelectDropdown
                          value={workCenterId}
                          onChange={(id) => {
                            setWorkCenterId(id);
                            clearFieldError('workCenterId');
                          }}
                          options={wcOptions}
                          placeholder={hrCopy.inviteWorkCenterPlaceholder}
                          icon={<MapPin className="w-4 h-4" />}
                          error={errors.workCenterId}
                        />
                        {errors.workCenterId ? (
                          <p className="mt-1 text-xs text-red-500">{errors.workCenterId}</p>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex items-center gap-2.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-3.5 py-2.5 dark:border-gray-700 dark:bg-gray-800/50">
                        <MapPin className="h-4 w-4 shrink-0 text-gray-300" />
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {hrCopy.inviteNoWorkCenters}
                        </p>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Plantilla de horario: no en Eventos */}
                  {!isEventsInvite && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      Plantilla de horario <span className="text-red-500">*</span>
                    </label>
                    <p className="mb-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                      Obligatorio. Al aceptar la invitación se le asignará este horario automáticamente (Control y semana).
                    </p>
                    {templatesLoading ? (
                      <div className="flex items-center gap-2.5 rounded-xl border-2 border-gray-200 bg-gray-50 px-3.5 py-2.5 dark:border-gray-700 dark:bg-gray-800/50">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">Cargando plantillas…</p>
                      </div>
                    ) : shiftTemplates.length > 0 ? (
                      <>
                        <SelectDropdown
                          value={scheduleTemplateId}
                          onChange={(id) => {
                            setScheduleTemplateId(id);
                            clearFieldError('scheduleTemplateId');
                          }}
                          options={templateOptions}
                          placeholder="Selecciona plantilla de horario"
                          icon={<Clock className="w-4 h-4" />}
                          error={errors.scheduleTemplateId}
                        />
                        {errors.scheduleTemplateId ? (
                          <p className="mt-1 text-xs text-red-500">{errors.scheduleTemplateId}</p>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex items-start gap-2.5 rounded-xl border-2 border-dashed border-red-200 bg-red-50 px-3.5 py-2.5 dark:border-red-800 dark:bg-red-900/20">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                        <p className="text-xs text-red-600 dark:text-red-300">
                          {errors.scheduleTemplateId
                            || 'No hay plantillas. Créalas en Equipo → Horarios y vacaciones → Configuración antes de invitar.'}
                        </p>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Info */}
                  <div className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-300">
                      Verá tu invitación dentro de Vertial al iniciar sesión. Al aceptarla cambiará automáticamente a esta empresa con la función seleccionada.
                    </p>
                  </div>

                  {submitError && (
                    <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <p className="text-xs leading-relaxed text-red-700 dark:text-red-300">{submitError}</p>
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
                    disabled={emailStatus === 'checking' || emailStatus === 'already_member' || emailStatus === 'owns_other' || emailStatus === 'company_account' || emailStatus === 'idle' || emailStatus === 'invalid' || emailStatus === 'error'}
                    className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900 dark:disabled:hover:bg-gray-100">
                    {emailStatus === 'checking' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Comprobando…
                      </>
                    ) : (
                      <>
                        Siguiente
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
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
