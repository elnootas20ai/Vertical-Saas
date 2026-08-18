import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useModalClose } from '../../hooks/useModalClose';
import { useActivationFocus } from '../../hooks/useActivationFocus';
import { ActivationFieldWrap } from '../../components/saas/ActivationGuideUi';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Banknote,
  Bot,
  Brain,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  DollarSign,
  Edit2,
  FileText,
  Heart,
  ImagePlus,
  Key,
  LogIn,
  Mail,
  Package,
  Palette,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  UsersRound,
  Network,
  QrCode,
  Wrench,
  X,
  Zap,
  MapPin,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { PayrollTab } from '../../components/saas/PayrollTab';
import { StaffExpensesTab } from '../../components/saas/StaffExpensesTab';
import { StaffConsumptionsTab } from '../../components/saas/StaffConsumptionsTab';
import { CreateRoleModal } from '../../components/saas/CreateRoleModal';
import { toast } from 'sonner';
import { InviteUserModal, type InviteUserPayload } from '../../components/saas/InviteUserModal';
import { WorkerInviteQrModal } from '../../components/saas/WorkerInviteQrModal';
import { loadInviteWorkCenters } from '../../lib/inviteWorkCenters';
import type { WorkCenter } from '../../lib/workCentersApi';
import {
  getWorkerSeatStatusRequest,
  workerSeatBillingWarning,
  type WorkerSeatStatus,
} from '../../lib/workerSeatLimits';
import { VertialBillingUpgradeLink } from '../../components/saas/VertialBillingUpgradeLink';
import { formatAddonPriceShort } from '../../lib/planAddonCatalog';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { OrgChartModal } from '../../components/saas/OrgChartModal';
import { ConfirmDestroyModal } from '../../components/saas/ConfirmDestroyModal';
import { EmptyState } from '../../components/saas/EmptyState';
import { TableColHeader, applySortToArray, type SortState } from '../../components/saas/TableColHeader';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useApp } from '../../context/AppContext';
import type {
  AccountActivityItem,
  AccountPermissionMatrix,
  AgentMCP,
  AgentSkin,
  AuthUser,
  EmploymentInfo,
  PersonalData,
  RoleDefinition,
  TeamInvitation,
} from '../../lib/authApi';
import { BirthDateEsField } from '../../components/saas/BirthDateEsField';
import { buildDefaultPersonalData } from '../../lib/workerProfileCompletion';
import {
  formatIbanInput,
  IBAN_DISPLAY_MAX_LENGTH,
  IBAN_INPUT_CLASS,
  normalizeBankName,
  normalizeEmergencyContact,
  normalizeEmergencyPhone,
  normalizeIbanInput,
} from '../../lib/employmentBankUtils';
import { getUserActivityRequest } from '../../lib/authApi';
import {
  buildCustomRolePermissionMatrix,
  formatRoleAccessSummary,
  getInvitePermissionsForUser,
  getVertialAccessPermissionModules,
  loadCustomRoles,
  mergeRoleCatalog,
  upsertCustomRole,
} from '../../lib/roleCatalog';
import { assignPrimaryWorkSite, clearPrimaryWorkSite } from '../../lib/workerStoreAssignment';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { getFunctionRolesForBusiness, getInviteRoleDisplayLabel } from '../../lib/inviteFunctionRoles';
import { getRoleTaskBundle } from '../../lib/roleTaskTemplates';
import { getRetailOpsUiCopy } from '../../lib/retailUiCopy';
import { getHrLocationCopy } from '../../lib/retailLocationCopy';
import { fetchTeamAlerts, type TeamAlert } from '../../lib/teamAlertsApi';
import { canManagePayroll } from '../../lib/teamManagerAccess';
import { canOwnerPrecedenceRemoveMember } from '../../lib/accountOwnerPrecedence';

type TeamTab = 'members' | 'roles' | 'activity' | 'staff-expenses' | 'staff-consumptions' | 'payroll';
type MemberStatus = 'active' | 'pending' | 'inactive';

// ─── Skin System ──────────────────────────────────────────────────────────────

const SKIN_PRESETS: AgentSkin[] = [
  {
    id: 'default',
    name: 'Clásico',
    headerBg: 'bg-gradient-to-br from-gray-50 to-gray-100',
    avatarBg: 'bg-gray-800',
    accentBorder: 'border-l-gray-700',
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-700',
    dot: 'bg-gray-700',
    accentColor: '#374151',
  },
  {
    id: 'ocean',
    name: 'Océano',
    headerBg: 'bg-gradient-to-br from-blue-50 to-cyan-100',
    avatarBg: 'bg-blue-600',
    accentBorder: 'border-l-blue-500',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    dot: 'bg-blue-500',
    accentColor: '#2563EB',
  },
  {
    id: 'forest',
    name: 'Bosque',
    headerBg: 'bg-gradient-to-br from-emerald-50 to-green-100',
    avatarBg: 'bg-emerald-600',
    accentBorder: 'border-l-emerald-500',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    dot: 'bg-emerald-500',
    accentColor: '#059669',
  },
  {
    id: 'sunset',
    name: 'Atardecer',
    headerBg: 'bg-gradient-to-br from-orange-50 to-amber-100',
    avatarBg: 'bg-orange-500',
    accentBorder: 'border-l-orange-500',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    dot: 'bg-orange-500',
    accentColor: '#F97316',
  },
  {
    id: 'galaxy',
    name: 'Galaxia',
    headerBg: 'bg-gradient-to-br from-violet-50 to-purple-100',
    avatarBg: 'bg-violet-600',
    accentBorder: 'border-l-violet-500',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    dot: 'bg-violet-500',
    accentColor: '#7C3AED',
  },
  {
    id: 'rose',
    name: 'Rosa',
    headerBg: 'bg-gradient-to-br from-rose-50 to-pink-100',
    avatarBg: 'bg-rose-500',
    accentBorder: 'border-l-rose-500',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    dot: 'bg-rose-500',
    accentColor: '#F43F5E',
  },
  {
    id: 'slate',
    name: 'Pizarra',
    headerBg: 'bg-gradient-to-br from-slate-100 to-slate-200',
    avatarBg: 'bg-slate-700',
    accentBorder: 'border-l-slate-600',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    dot: 'bg-slate-600',
    accentColor: '#475569',
  },
  {
    id: 'gold',
    name: 'Dorado',
    headerBg: 'bg-gradient-to-br from-yellow-50 to-amber-100',
    avatarBg: 'bg-amber-500',
    accentBorder: 'border-l-amber-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    dot: 'bg-amber-500',
    accentColor: '#F59E0B',
  },
];

const SKINS_STORAGE_KEY = 'vertial_agent_skins';

// ─── Animation System ─────────────────────────────────────────────────────────

interface AgentAnimation {
  id: string;
  name: string;
  cssClass: string;
}

const ANIMATION_PRESETS: AgentAnimation[] = [
  { id: 'none',      name: 'Ninguna',   cssClass: '' },
  { id: 'pulse',     name: 'Pulso',     cssClass: 'agnt-anim-pulse' },
  { id: 'float',     name: 'Flotante',  cssClass: 'agnt-anim-float' },
  { id: 'heartbeat', name: 'Latido',    cssClass: 'agnt-anim-heartbeat' },
  { id: 'breathe',   name: 'Respirar',  cssClass: 'agnt-anim-breathe' },
  { id: 'shake',     name: 'Vibrar',    cssClass: 'agnt-anim-shake' },
  { id: 'rainbow',   name: 'Arcoíris',  cssClass: 'agnt-anim-rainbow' },
  { id: 'neon',      name: 'Neón',      cssClass: 'agnt-anim-neon' },
  { id: 'flash',     name: 'Destello',  cssClass: 'agnt-anim-flash' },
  { id: 'glitch',    name: 'Glitch',    cssClass: 'agnt-anim-glitch' },
  { id: 'slide',     name: 'Desliz',    cssClass: 'agnt-anim-slide' },
  { id: 'tilt',      name: 'Tilt 3D',   cssClass: 'agnt-anim-tilt' },
];

const AGENT_ANIMATION_STYLES = `
@keyframes agnt-pulse {
  0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,.35),0 4px 14px rgba(0,0,0,.08);}
  50%{box-shadow:0 0 0 14px rgba(139,92,246,0),0 4px 14px rgba(0,0,0,.08);}
}
@keyframes agnt-float {
  0%,100%{transform:translateY(0);}
  50%{transform:translateY(-8px);}
}
@keyframes agnt-heartbeat {
  0%,100%{transform:scale(1);}
  12%{transform:scale(1.08);}
  24%{transform:scale(1);}
  36%{transform:scale(1.05);}
  58%{transform:scale(1);}
}
@keyframes agnt-breathe {
  0%,100%{transform:scale(1);}
  50%{transform:scale(1.03);}
}
@keyframes agnt-shake {
  0%,80%,100%{transform:translateX(0) rotate(0);}
  83%{transform:translateX(-5px) rotate(-.6deg);}
  86%{transform:translateX(5px) rotate(.6deg);}
  89%{transform:translateX(-3px);}
  92%{transform:translateX(3px);}
  95%{transform:translateX(0);}
}
@keyframes agnt-rainbow {
  0%{border-color:#ef4444;}
  16%{border-color:#f97316;}
  33%{border-color:#eab308;}
  50%{border-color:#22c55e;}
  66%{border-color:#3b82f6;}
  83%{border-color:#a855f7;}
  100%{border-color:#ef4444;}
}
@keyframes agnt-neon {
  0%,100%{box-shadow:0 0 4px rgba(99,102,241,.6),0 0 18px rgba(99,102,241,.35),0 0 36px rgba(99,102,241,.15);}
  50%{box-shadow:0 0 8px rgba(99,102,241,.9),0 0 36px rgba(99,102,241,.55),0 0 72px rgba(99,102,241,.25);}
}
@keyframes agnt-flash {
  0%,55%,100%{opacity:1;}
  60%{opacity:.45;}
  65%{opacity:1;}
  70%{opacity:.25;}
  75%{opacity:1;}
}
@keyframes agnt-glitch {
  0%,78%,100%{transform:translate(0) skew(0);}
  80%{transform:translate(-5px,1px) skewX(-2deg);filter:hue-rotate(90deg) brightness(1.3);}
  82%{transform:translate(5px,-1px) skewX(2deg);filter:hue-rotate(-90deg);}
  84%{transform:translate(-2px,0);filter:brightness(1.5);}
  86%{transform:translate(0);filter:none;}
}
@keyframes agnt-slide {
  0%,100%{transform:translateX(0);}
  50%{transform:translateX(7px);}
}
@keyframes agnt-tilt {
  0%,100%{transform:perspective(500px) rotateY(0) rotateX(0);}
  25%{transform:perspective(500px) rotateY(4deg) rotateX(1.5deg);}
  75%{transform:perspective(500px) rotateY(-4deg) rotateX(-1.5deg);}
}
.agnt-anim-pulse    { animation:agnt-pulse     2.2s ease-in-out infinite; }
.agnt-anim-float    { animation:agnt-float     3s   ease-in-out infinite; }
.agnt-anim-heartbeat{ animation:agnt-heartbeat 1.6s ease-in-out infinite; }
.agnt-anim-breathe  { animation:agnt-breathe   4s   ease-in-out infinite; }
.agnt-anim-shake    { animation:agnt-shake     3.5s ease-in-out infinite; }
.agnt-anim-rainbow  { animation:agnt-rainbow   3s   linear     infinite; border-width:2px!important; }
.agnt-anim-neon     { animation:agnt-neon      2s   ease-in-out infinite; }
.agnt-anim-flash    { animation:agnt-flash     4s   linear     infinite; }
.agnt-anim-glitch   { animation:agnt-glitch    5s   linear     infinite; }
.agnt-anim-slide    { animation:agnt-slide     2.5s ease-in-out infinite; }
.agnt-anim-tilt     { animation:agnt-tilt      4s   ease-in-out infinite; transform-style:preserve-3d; }
`;

function getAnimationById(animationId?: string): AgentAnimation {
  return ANIMATION_PRESETS.find((a) => a.id === animationId) ?? ANIMATION_PRESETS[0];
}

function loadSavedSkins(): AgentSkin[] {
  try {
    const raw = localStorage.getItem(SKINS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AgentSkin[];
  } catch {
    return [];
  }
}

function saveSkinToStorage(skin: AgentSkin): void {
  const existing = loadSavedSkins().filter((s) => s.id !== skin.id);
  localStorage.setItem(SKINS_STORAGE_KEY, JSON.stringify([skin, ...existing]));
}

function deleteSkinFromStorage(skinId: string): void {
  const existing = loadSavedSkins().filter((s) => s.id !== skinId);
  localStorage.setItem(SKINS_STORAGE_KEY, JSON.stringify(existing));
}

function getSkinById(skinId?: string): AgentSkin {
  if (!skinId) return SKIN_PRESETS[0];
  const preset = SKIN_PRESETS.find((s) => s.id === skinId);
  if (preset) return preset;
  const saved = loadSavedSkins().find((s) => s.id === skinId);
  return saved || SKIN_PRESETS[0];
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
      case gn: h = ((bn - rn) / d + 2) / 6; break;
      case bn: h = ((rn - gn) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function findClosestPresetByColor(hsl: { h: number; s: number; l: number }): string {
  if (hsl.s < 12) return 'slate';
  const h = hsl.h;
  if (h >= 345 || h < 15) return 'rose';
  if (h < 45) return 'sunset';
  if (h < 65) return 'gold';
  if (h < 160) return 'forest';
  if (h < 260) return 'ocean';
  if (h < 310) return 'galaxy';
  return 'rose';
}

// ─── MCP System ───────────────────────────────────────────────────────────────

const ALL_MCPS: Omit<AgentMCP, 'enabled' | 'autoAssigned'>[] = [
  { id: 'crm', name: 'CRM', description: 'Gestión de clientes y leads', icon: 'Users' },
  { id: 'vehicles', name: 'Vehículos', description: 'Catálogo y stock de vehículos', icon: 'Car' },
  { id: 'sales', name: 'Ventas', description: 'Registro y seguimiento de ventas', icon: 'TrendingUp' },
  { id: 'documents', name: 'Documentos', description: 'Contratos, facturas y archivos', icon: 'FileText' },
  { id: 'finance', name: 'Finanzas', description: 'Comisiones, márgenes y contabilidad', icon: 'DollarSign' },
  { id: 'inventory', name: 'Inventario', description: 'Control de stock y almacén', icon: 'Package' },
  { id: 'analytics', name: 'Analítica', description: 'Métricas, KPIs y reportes', icon: 'Brain' },
  { id: 'workshop', name: 'Taller', description: 'Órdenes de trabajo y reparaciones', icon: 'Wrench' },
  { id: 'database', name: 'Base de datos', description: 'Acceso directo a CouchDB', icon: 'Database' },
  { id: 'ai_assistant', name: 'Asistente IA', description: 'Sugerencias y automatizaciones IA', icon: 'Sparkles' },
  { id: 'integrations', name: 'Integraciones', description: 'Webhooks y APIs externas', icon: 'Zap' },
  { id: 'ancove', name: 'ANCOVE', description: 'Módulo regulatorio ANCOVE', icon: 'Shield' },
];

/* Categorías para submenú de MCPs */
const MCP_CATEGORIES: { id: string; label: string; mcpIds: string[] }[] = [
  { id: 'operativa', label: 'Operativa', mcpIds: ['crm', 'vehicles', 'sales', 'inventory'] },
  { id: 'administracion', label: 'Administración', mcpIds: ['documents', 'finance', 'workshop'] },
  { id: 'analitica', label: 'Analítica', mcpIds: ['analytics'] },
  { id: 'sistema', label: 'Sistema', mcpIds: ['database', 'ai_assistant', 'integrations', 'ancove'] },
];

function getMCPIcon(icon: string) {
  const map: Record<string, React.ReactNode> = {
    Users: <Users className="w-3.5 h-3.5" />,
    Car: <Car className="w-3.5 h-3.5" />,
    TrendingUp: <TrendingUp className="w-3.5 h-3.5" />,
    FileText: <FileText className="w-3.5 h-3.5" />,
    DollarSign: <DollarSign className="w-3.5 h-3.5" />,
    Package: <Package className="w-3.5 h-3.5" />,
    Brain: <Brain className="w-3.5 h-3.5" />,
    Wrench: <Wrench className="w-3.5 h-3.5" />,
    Database: <Database className="w-3.5 h-3.5" />,
    Sparkles: <Sparkles className="w-3.5 h-3.5" />,
    Zap: <Zap className="w-3.5 h-3.5" />,
    Shield: <Shield className="w-3.5 h-3.5" />,
  };
  return map[icon] || <Bot className="w-3.5 h-3.5" />;
}

function autoAssignMCPs(role: string, notes?: string): AgentMCP[] {
  const notesLower = (notes || '').toLowerCase();
  const roleLower = role.toLowerCase();

  const assignments: Record<string, string[]> = {
    Admin: ['crm', 'vehicles', 'sales', 'documents', 'finance', 'inventory', 'analytics', 'database', 'ai_assistant', 'integrations', 'ancove', 'workshop'],
    Gerente: ['crm', 'vehicles', 'sales', 'documents', 'finance', 'analytics', 'ai_assistant', 'integrations', 'ancove'],
    Comercial: ['crm', 'vehicles', 'sales', 'documents', 'ai_assistant'],
    Administración: ['crm', 'documents', 'finance', 'analytics', 'ancove'],
    Taller: ['vehicles', 'workshop', 'documents', 'inventory'],
    Usuario: ['crm', 'vehicles'],
  };

  const baseMcpIds: Set<string> = new Set(assignments[role] || assignments.Usuario);

  if (notesLower.includes('finanz') || notesLower.includes('contabilid')) baseMcpIds.add('finance');
  if (notesLower.includes('ventas') || notesLower.includes('comercial')) { baseMcpIds.add('sales'); baseMcpIds.add('crm'); }
  if (notesLower.includes('taller') || notesLower.includes('mecánic') || notesLower.includes('mecanico')) { baseMcpIds.add('workshop'); baseMcpIds.add('inventory'); }
  if (notesLower.includes('analíti') || notesLower.includes('analiti') || notesLower.includes('kpi') || notesLower.includes('report')) baseMcpIds.add('analytics');
  if (notesLower.includes('ia') || notesLower.includes('inteligencia') || notesLower.includes('automatiz')) baseMcpIds.add('ai_assistant');
  if (notesLower.includes('integra') || notesLower.includes('api') || notesLower.includes('webhook')) baseMcpIds.add('integrations');
  if (roleLower.includes('admin') || notesLower.includes('base de datos') || notesLower.includes('couchdb')) baseMcpIds.add('database');

  return ALL_MCPS.map((mcp) => ({
    ...mcp,
    enabled: baseMcpIds.has(mcp.id),
    autoAssigned: baseMcpIds.has(mcp.id),
  }));
}

function McpsSubmenu({
  mcps,
  onToggle,
  onRegenerate,
  onReassign,
  getMCPIcon,
  onMcpClick,
}: {
  mcps: AgentMCP[];
  onToggle: (mcpId: string) => void;
  onRegenerate: (mcpId: string) => void;
  onReassign: () => void;
  getMCPIcon: (icon: string) => React.ReactNode;
  onMcpClick?: (mcp: AgentMCP) => void;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() =>
    MCP_CATEGORIES.reduce((acc, c) => ({ ...acc, [c.id]: true }), {})
  );
  const mcpMap = Object.fromEntries(mcps.map((m) => [m.id, m]));
  const enabledCount = mcps.filter((m) => m.enabled).length;

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className="grid grid-cols-[176px_1fr] divide-x divide-gray-100 dark:divide-gray-700/50">
      {/* ── Panel izquierdo: controles ── */}
      <div className="flex flex-col gap-4 px-5 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">MCPs</p>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            Herramientas disponibles para este agente
          </p>
        </div>

        {/* Contador de activas */}
        <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 p-3 text-center">
          <p className="text-2xl font-bold text-violet-700 dark:text-violet-400">{enabledCount}</p>
          <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-0.5">de {mcps.length} activas</p>
        </div>

        {/* Resumen por categoría */}
        <div className="space-y-2">
          {MCP_CATEGORIES.map((cat) => {
            const catMcps = cat.mcpIds.map((id) => mcpMap[id]).filter(Boolean);
            if (catMcps.length === 0) return null;
            const active = catMcps.filter((m) => m.enabled).length;
            return (
              <div key={cat.id} className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{cat.label}</span>
                <span className={`text-[11px] font-semibold tabular-nums ml-2 ${active > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-gray-300 dark:text-gray-600'}`}>
                  {active}/{catMcps.length}
                </span>
              </div>
            );
          })}
        </div>

        {/* Botón auto-asignar */}
        <button
          type="button"
          onClick={() => void onReassign()}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-700 dark:hover:text-violet-400 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          Auto-asignar
        </button>

        {/* Info */}
        <div className="flex items-start gap-1.5 mt-auto">
          <Brain className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-violet-400" />
          <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
            Se asignan según rol y notas del agente.
          </p>
        </div>
      </div>

      {/* ── Panel derecho: lista de MCPs ── */}
      <div className="py-3">
        {MCP_CATEGORIES.map((cat) => {
          const categoryMcps = cat.mcpIds.map((id) => mcpMap[id]).filter(Boolean);
          if (categoryMcps.length === 0) return null;
          const isExpanded = expandedCategories[cat.id] ?? true;
          const activeCount = categoryMcps.filter((m) => m.enabled).length;
          return (
            <div key={cat.id} className="border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
              <button
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50/80 dark:hover:bg-gray-800/80 transition-colors"
              >
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{cat.label}</span>
                <div className="flex items-center gap-2">
                  {activeCount > 0 && (
                    <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded-full">
                      {activeCount}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-gray-50 dark:border-gray-800 bg-gray-50/20 dark:bg-gray-800/20">
                  {categoryMcps.map((mcp, index) => (
                    <div
                      key={mcp.id}
                      className={`flex items-center gap-2.5 px-4 py-2.5 ${index < categoryMcps.length - 1 ? 'border-b border-gray-50 dark:border-gray-800' : ''} ${mcp.enabled ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/40 dark:bg-gray-800/40'}`}
                    >
                      <button
                        type="button"
                        onClick={() => onMcpClick?.(mcp)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                        title={`Ver detalle de ${mcp.name}`}
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-xl flex-shrink-0 transition-colors ${mcp.enabled ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-600'}`}>
                          {getMCPIcon(mcp.icon)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className={`text-xs font-semibold ${mcp.enabled ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>{mcp.name}</p>
                            {mcp.autoAssigned && mcp.enabled && (
                              <span className="rounded-full bg-violet-50 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-violet-500">auto</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{mcp.description}</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => void onRegenerate(mcp.id)}
                          className="rounded-lg p-1 text-gray-400 dark:text-gray-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-600 transition-colors"
                          title="Regenerar según rol"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onToggle(mcp.id)}
                          className={`relative h-5 w-9 rounded-full transition-colors ${mcp.enabled ? 'bg-violet-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${mcp.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MCP Detail Modal ─────────────────────────────────────────────────────────

interface McpOrderEntry {
  id: string;
  agentName: string;
  agentRole: string;
  agentAvatarBg: string;
  action: string;
  entityLabel: string;
  processedAt: string;
  status: 'completed' | 'processing';
}

const MCP_MOCK_ACTIONS: Record<string, string[]> = {};

const MCP_ENTITY_LABELS: Record<string, string[]> = {};

function generateMcpHistory(_mcp: AgentMCP, _members: AuthUser[]): McpOrderEntry[] {
  return [];
}

function McpDetailModal({
  mcp,
  members,
  onClose,
}: {
  mcp: AgentMCP;
  members: AuthUser[];
  onClose: () => void;
}) {
  useModalClose(true, onClose);
  const [history] = useState<McpOrderEntry[]>(() => generateMcpHistory(mcp, members));
  const liveCount = 0;
  const latestId: string | null = null;

  const agentsCount = members.filter((m) =>
    m.mcps?.some((mp) => mp.id === mcp.id && mp.enabled)
  ).length || members.filter((m) => m.status === 'active' || !m.status).length;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="bg-gradient-to-br from-violet-50 to-purple-100 dark:from-violet-950/50 dark:to-purple-950/50 px-6 py-5 border-b border-violet-100 dark:border-violet-800/50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${mcp.enabled ? 'bg-violet-600' : 'bg-gray-300'}`}>
                  <span className="text-white scale-125">{getMCPIcon(mcp.icon)}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{mcp.name}</h2>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${mcp.enabled ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${mcp.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                      {mcp.enabled ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{mcp.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-1.5 hover:bg-white/70 dark:hover:bg-gray-700/70 text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: 'Agentes activos', value: String(agentsCount) },
                { label: 'Órdenes hoy', value: String(history.length) },
                { label: 'Nuevas en vivo', value: String(liveCount), live: true },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl bg-white/70 dark:bg-gray-800/70 p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {stat.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    <p className={`text-xl font-bold ${stat.live ? 'text-emerald-600' : 'text-violet-700'}`}>{stat.value}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* History */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Historial de procesamiento</h3>
              </div>
              {history.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">Sin actividad registrada para este MCP.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-3 rounded-xl border p-3 transition-all duration-300 ${
                        entry.id === latestId
                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20'
                          : entry.status === 'processing'
                            ? 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-900/20'
                            : 'border-gray-100 dark:border-gray-700/50 bg-gray-50/40 dark:bg-gray-800/40'
                      }`}
                    >
                      <div className={`h-8 w-8 rounded-full ${entry.agentAvatarBg} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-[10px] font-bold text-white">{getInitials(entry.agentName)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{entry.agentName}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getRoleToken(entry.agentRole).badgeBg} ${getRoleToken(entry.agentRole).badgeText}`}>
                            {entry.agentRole}
                          </span>
                          {entry.status === 'processing' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                              <span className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                              Procesando
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{entry.action}</p>
                        <p className="mt-0.5 text-[10px] font-medium text-violet-500">{entry.entityLabel}</p>
                      </div>
                      <span className="flex-shrink-0 pt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{formatRelativeTime(entry.processedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 px-6 py-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">Actualización automática cada ~10s</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const inputClassName =
  'w-full rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none transition-colors focus:border-blue-500';

const ROLE_TOKEN: Record<
  string,
  { badgeBg: string; badgeText: string; dot: string; accentBorder: string; headerBg: string; avatarBg: string }
> = {
  Administrador: {
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    dot: 'bg-slate-700',
    accentBorder: 'border-l-slate-700',
    headerBg: 'bg-gradient-to-br from-slate-50 to-slate-100',
    avatarBg: 'bg-slate-800',
  },
  Gestor: {
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    dot: 'bg-violet-500',
    accentBorder: 'border-l-violet-500',
    headerBg: 'bg-gradient-to-br from-violet-50 to-violet-100/70',
    avatarBg: 'bg-violet-600',
  },
  Encargado: {
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    dot: 'bg-blue-500',
    accentBorder: 'border-l-blue-500',
    headerBg: 'bg-gradient-to-br from-blue-50 to-blue-100/70',
    avatarBg: 'bg-blue-600',
  },
  'Mostrador / Atención': {
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    dot: 'bg-emerald-500',
    accentBorder: 'border-l-emerald-500',
    headerBg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/70',
    avatarBg: 'bg-emerald-600',
  },
  Cocina: {
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    dot: 'bg-orange-500',
    accentBorder: 'border-l-orange-500',
    headerBg: 'bg-gradient-to-br from-orange-50 to-orange-100/70',
    avatarBg: 'bg-orange-600',
  },
  Reparto: {
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    dot: 'bg-violet-500',
    accentBorder: 'border-l-violet-500',
    headerBg: 'bg-gradient-to-br from-violet-50 to-violet-100/70',
    avatarBg: 'bg-violet-600',
  },
  Admin: {
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    dot: 'bg-slate-700',
    accentBorder: 'border-l-slate-700',
    headerBg: 'bg-gradient-to-br from-slate-50 to-slate-100',
    avatarBg: 'bg-slate-800',
  },
  Gerente: {
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    dot: 'bg-blue-500',
    accentBorder: 'border-l-blue-500',
    headerBg: 'bg-gradient-to-br from-blue-50 to-blue-100/70',
    avatarBg: 'bg-blue-600',
  },
  Comercial: {
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    dot: 'bg-emerald-500',
    accentBorder: 'border-l-emerald-500',
    headerBg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/70',
    avatarBg: 'bg-emerald-600',
  },
  Administración: {
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    dot: 'bg-amber-500',
    accentBorder: 'border-l-amber-500',
    headerBg: 'bg-gradient-to-br from-amber-50 to-amber-100/70',
    avatarBg: 'bg-amber-500',
  },
  Taller: {
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    dot: 'bg-violet-500',
    accentBorder: 'border-l-violet-500',
    headerBg: 'bg-gradient-to-br from-violet-50 to-violet-100/70',
    avatarBg: 'bg-violet-600',
  },
  Usuario: {
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-600',
    dot: 'bg-gray-400',
    accentBorder: 'border-l-gray-400',
    headerBg: 'bg-gradient-to-br from-gray-50 to-gray-100',
    avatarBg: 'bg-gray-500',
  },
};

const PERMISSION_MODULE_ICONS: Record<string, React.ReactNode> = {
  workshop: <Wrench className="w-3.5 h-3.5" />,
  vehicles: <Car className="w-3.5 h-3.5" />,
  clients: <Users className="w-3.5 h-3.5" />,
  sales: <TrendingUp className="w-3.5 h-3.5" />,
  reservations: <Calendar className="w-3.5 h-3.5" />,
  documents: <FileText className="w-3.5 h-3.5" />,
  finance: <DollarSign className="w-3.5 h-3.5" />,
  ancove: <Building2 className="w-3.5 h-3.5" />,
  team: <UsersRound className="w-3.5 h-3.5" />,
  fleet: <Car className="w-3.5 h-3.5" />,
  delivery: <Package className="w-3.5 h-3.5" />,
  sala: <Package className="w-3.5 h-3.5" />,
  cash_register: <Banknote className="w-3.5 h-3.5" />,
  cleaning_materials: <Package className="w-3.5 h-3.5" />,
  acquisitions: <Package className="w-3.5 h-3.5" />,
  butcher_purchases: <Package className="w-3.5 h-3.5" />,
  butcher_waste: <Package className="w-3.5 h-3.5" />,
  reports: <FileText className="w-3.5 h-3.5" />,
  scrapyard: <Wrench className="w-3.5 h-3.5" />,
  scrapyard_docs: <FileText className="w-3.5 h-3.5" />,
};

function resolvePermissionModuleLabel(key: string, fallbackLabel: string, businessType?: string | null): string {
  if (key === 'delivery') {
    return getRetailOpsUiCopy(businessType).permissionDeliveryModule;
  }
  if (key === 'sala') {
    return isRestaurantBusinessType(businessType) ? 'Sala / Mesas' : 'Sala';
  }
  return fallbackLabel;
}

function getRoleToken(role?: string, skinId?: string) {
  if (skinId) {
    const skin = getSkinById(skinId);
    return {
      badgeBg: skin.badgeBg,
      badgeText: skin.badgeText,
      dot: skin.dot,
      accentBorder: skin.accentBorder,
      headerBg: skin.headerBg,
      avatarBg: skin.avatarBg,
    };
  }
  return ROLE_TOKEN[role || 'Usuario'] || ROLE_TOKEN.Usuario;
}

function getInitials(value?: string) {
  return (
    String(value || 'UU')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'UU'
  );
}

function buildEmploymentInfo(overrides?: Partial<EmploymentInfo>): EmploymentInfo {
  return {
    department: overrides?.department || '',
    position: overrides?.position || '',
    schedule: overrides?.schedule || '',
    notes: overrides?.notes || '',
    skills: Array.isArray(overrides?.skills) ? overrides.skills : [],
    startDate: overrides?.startDate || '',
    contractType: overrides?.contractType || '',
    workday: overrides?.workday || '',
    hoursPerWeek: overrides?.hoursPerWeek,
    salary: overrides?.salary || '',
    bankAccount: formatIbanInput(overrides?.bankAccount || ''),
    bankName: overrides?.bankName || '',
    emergencyContact: overrides?.emergencyContact || '',
    emergencyPhone: overrides?.emergencyPhone || '',
    salesPointId: overrides?.salesPointId || '',
    contributionGroup: overrides?.contributionGroup || '',
    mutualInsurance: overrides?.mutualInsurance || '',
    assignments: overrides?.assignments,
  };
}

function buildPersonalDataInfo(overrides?: Partial<PersonalData> | null): PersonalData {
  return buildDefaultPersonalData(overrides);
}

function buildRolePermissions(role = 'Usuario', roleDefinitions: RoleDefinition[] = []): AccountPermissionMatrix {
  return getInvitePermissionsForUser(role, roleDefinitions);
}

function normalizePermissions(
  permissions?: AccountPermissionMatrix,
  role?: string,
  businessType?: string | null,
) {
  const modules = getVertialAccessPermissionModules(businessType);
  const base: AccountPermissionMatrix = {
    ...buildRolePermissions(role),
    ...(permissions || {}),
  };
  if (!permissions) {
    return base;
  }

  for (const module of modules) {
    const current = permissions[module.key];
    base[module.key] = {
      view: Boolean(current?.view),
      edit: Boolean(current?.edit),
    };
    if (base[module.key].edit) {
      base[module.key].view = true;
    }
  }

  return base;
}

function formatFullDate(value?: string) {
  if (!value) {
    return 'Sin registro';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin registro';
  }
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(value?: string) {
  if (!value) {
    return 'Sin actividad';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin actividad';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return 'Hace unos segundos';
  }
  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Hace ${diffHours}h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return `Ayer ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return `Hace ${diffDays} días`;
  }
  return date.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function getActivityMeta(type?: string) {
  if (type === 'sale') {
    return { icon: <TrendingUp className="w-3.5 h-3.5" />, bg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' };
  }
  if (type === 'vehicle') {
    return { icon: <Car className="w-3.5 h-3.5" />, bg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' };
  }
  if (type === 'client') {
    return { icon: <Users className="w-3.5 h-3.5" />, bg: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600' };
  }
  if (type === 'document') {
    return { icon: <FileText className="w-3.5 h-3.5" />, bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' };
  }
  if (type === 'security') {
    return { icon: <Key className="w-3.5 h-3.5" />, bg: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600' };
  }
  if (type === 'team') {
    return { icon: <Shield className="w-3.5 h-3.5" />, bg: 'bg-slate-100 dark:bg-slate-800 text-slate-600' };
  }
  return { icon: <LogIn className="w-3.5 h-3.5" />, bg: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' };
}

function getPermissionSummary(
  permissions?: AccountPermissionMatrix,
  role?: string,
  businessType?: string | null,
) {
  const modules = getVertialAccessPermissionModules(businessType);
  const matrix = normalizePermissions(permissions, role, businessType);
  const totalView = modules.filter((module) => matrix[module.key]?.view).length;
  const totalEdit = modules.filter((module) => matrix[module.key]?.edit).length;
  return { totalView, totalEdit, total: modules.length };
}

function PageNotification({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const isSuccess = type === 'success';
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
      isSuccess
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
    }`}>
      <span className={`mt-0.5 flex-shrink-0 ${isSuccess ? 'text-emerald-500' : 'text-red-500'}`}>
        {isSuccess ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      </span>
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onClose} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function RoleBadge({
  role,
  skinId,
  businessType,
}: {
  role?: string;
  skinId?: string;
  businessType?: string | null;
}) {
  const token = getRoleToken(role, skinId);
  const label = getInviteRoleDisplayLabel(role || 'Usuario', businessType) || role || 'Usuario';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${token.badgeBg} ${token.badgeText}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Pendiente
      </span>
    );
  }
  if (status === 'inactive') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
        Inactivo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Activo
    </span>
  );
}

function Avatar({ member, size = 'md', skinId }: { member: AuthUser; size?: 'sm' | 'md' | 'lg' | 'xl'; skinId?: string }) {
  const token = getRoleToken(member.role, skinId ?? member.skinId);
  const sizeMap = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-12 w-12 text-sm',
    xl: 'h-16 w-16 text-lg',
  };

  return (
    <div className={`${token.avatarBg} ${sizeMap[size]} overflow-hidden rounded-full flex items-center justify-center flex-shrink-0`}>
      {member.avatar ? (
        <img src={member.avatar} alt={member.fullName} className="h-full w-full object-cover" />
      ) : (
        <span className="font-bold text-white">{getInitials(member.fullName)}</span>
      )}
    </div>
  );
}

function PermissionIconButton({
  active,
  disabled,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
        active ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-700'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:scale-105'}`}
    >
      {active ? <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={3} /> : <X className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" strokeWidth={2.5} />}
    </button>
  );
}

// ─── Skeleton Loaders ─────────────────────────────────────────────────────────

function TeamRowSkeleton() {
  return (
    <tr className="border-b border-gray-50 dark:border-gray-800">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-3 w-40 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
          </div>
        </div>
      </td>
      <td className="px-5 py-4"><div className="h-6 w-20 bg-gray-100 dark:bg-gray-700/50 rounded-full animate-pulse" /></td>
      <td className="px-5 py-4">
        <div className="h-6 w-24 bg-gray-100 dark:bg-gray-700/50 rounded-full animate-pulse mb-1" />
        <div className="h-3 w-28 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4"><div className="h-3.5 w-28 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" /></td>
      <td className="px-5 py-4"><div className="h-3.5 w-36 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" /></td>
      <td className="px-5 py-4"><div className="h-3.5 w-20 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" /></td>
      <td className="px-5 py-4" />
    </tr>
  );
}

function TeamCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-3 w-36 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-6 w-20 bg-gray-100 dark:bg-gray-700/50 rounded-full animate-pulse" />
        <div className="h-6 w-16 bg-gray-100 dark:bg-gray-700/50 rounded-full animate-pulse" />
      </div>
    </div>
  );
}

// ─── MemberDrawer ─────────────────────────────────────────────────────────────

type DrawerTab = 'info' | 'appearance' | 'mcps';

function MemberDrawer({
  member,
  members,
  roles,
  businessType,
  currentUserId,
  currentBusiness,
  workCenters = [],
  onClose,
  onMemberUpdated,
  onMemberDeleted,
}: {
  member: AuthUser;
  members?: AuthUser[];
  roles: RoleDefinition[];
  businessType?: string | null;
  currentUserId?: string;
  currentBusiness?: { owner_user_id?: string; members?: { user_id?: string; role?: string }[] } | null;
  /** Tiendas/locales para asignar TPV y fichaje. */
  workCenters?: WorkCenter[];
  onClose: () => void;
  onMemberUpdated: (member: AuthUser) => void;
  onMemberDeleted: (member: AuthUser) => void;
}) {
  useModalClose(true, onClose);
  const { updateUser, deleteUser, resetUserPassword, getUserActivity } = useAuth();
  const { t } = useTranslation();
  const hrCopy = getHrLocationCopy(businessType);
  const [memberState, setMemberState] = useState<AuthUser>(member);
  const [activity, setActivity] = useState<AccountActivityItem[]>(member.recentActivity || []);
  const [editing, setEditing] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('info');
  const [selectedMcp, setSelectedMcp] = useState<AgentMCP | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [permissionSavingKey, setPermissionSavingKey] = useState('');
  const [formErrors, setFormErrors] = useState<{ fullName?: string; email?: string }>({});

  // Skin state
  const [selectedSkinId, setSelectedSkinId] = useState<string>(member.skinId || 'default');
  const [originalSkinId] = useState<string>(member.skinId || 'default');
  const [savedSkins, setSavedSkins] = useState<AgentSkin[]>(loadSavedSkins);
  const [skinNameInput, setSkinNameInput] = useState('');
  const [showSaveSkinForm, setShowSaveSkinForm] = useState(false);
  const [isGeneratingSkinFromPhoto, setIsGeneratingSkinFromPhoto] = useState(false);
  const [photoSkinPreview, setPhotoSkinPreview] = useState<string | null>(null);

  // Animation state
  const [selectedAnimationId, setSelectedAnimationId] = useState<string>(member.animationId || 'none');
  const [originalAnimationId] = useState<string>(member.animationId || 'none');

  // MCP state
  const [mcps, setMcps] = useState<AgentMCP[]>(
    member.mcps && member.mcps.length > 0
      ? member.mcps
      : autoAssignMCPs(member.role || 'Usuario', member.employment?.notes),
  );

  const [form, setForm] = useState({
    fullName: member.fullName || '',
    email: member.email || '',
    phone: member.phone || '',
    avatar: member.avatar || '',
    role: member.role || 'Usuario',
    status: (member.status || 'active') as MemberStatus,
    employment: buildEmploymentInfo(member.employment),
    personalData: buildPersonalDataInfo(member.personalData),
  });

  useEffect(() => {
    setMemberState(member);
    setActivity(member.recentActivity || []);
    setForm({
      fullName: member.fullName || '',
      email: member.email || '',
      phone: member.phone || '',
      avatar: member.avatar || '',
      role: member.role || 'Usuario',
      status: (member.status || 'active') as MemberStatus,
      employment: buildEmploymentInfo(member.employment),
      personalData: buildPersonalDataInfo(member.personalData),
    });
    setSelectedSkinId(member.skinId || 'default');
    setSelectedAnimationId(member.animationId || 'none');
    setMcps(
      member.mcps && member.mcps.length > 0
        ? member.mcps
        : autoAssignMCPs(member.role || 'Usuario', member.employment?.notes),
    );
    setGeneratedPassword('');
    setPasswordCopied(false);
    setFeedback(null);
    setEditing(false);
    setDrawerTab('info');
    setFormErrors({});
  }, [member]);

  useEffect(() => {
    let cancelled = false;
    getUserActivity(member.user_id).then((items) => {
      if (!cancelled) {
        setActivity(items);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getUserActivity, member.user_id]);

  const activeSkin = getSkinById(selectedSkinId);
  const token = getRoleToken(memberState.role, memberState.skinId);
  const permissions = normalizePermissions(memberState.permissions, memberState.role, businessType);
  const permissionSummary = getPermissionSummary(memberState.permissions, memberState.role, businessType);
  const accessModules = getVertialAccessPermissionModules(businessType);
  const isCurrentUser = currentUserId === memberState.user_id;
  const canDeleteMember = canOwnerPrecedenceRemoveMember(
    currentBusiness,
    currentUserId,
    memberState.user_id,
    memberState.role,
  );

  const persistMember = async (payload: Partial<AuthUser>) => {
    setIsSaving(true);
    setFeedback(null);
    const result = await updateUser(memberState.user_id, payload);
    setIsSaving(false);

    if (!result.success || !result.user) {
      setFeedback(result.error || 'No se pudo guardar el usuario.');
      return null;
    }

    setMemberState(result.user);
    onMemberUpdated(result.user);
    return result.user;
  };

  const handlePermissionToggle = async (moduleKey: string, field: 'view' | 'edit') => {
    const nextPermissions = normalizePermissions(memberState.permissions, memberState.role, businessType);
    const currentValue = nextPermissions[moduleKey]?.[field] || false;

    nextPermissions[moduleKey] = {
      view: nextPermissions[moduleKey]?.view || false,
      edit: nextPermissions[moduleKey]?.edit || false,
    };
    nextPermissions[moduleKey][field] = !currentValue;

    if (field === 'edit' && nextPermissions[moduleKey].edit) {
      nextPermissions[moduleKey].view = true;
    }
    if (field === 'view' && !nextPermissions[moduleKey].view) {
      nextPermissions[moduleKey].edit = false;
    }

    setPermissionSavingKey(`${moduleKey}:${field}`);
    const updated = await persistMember({ permissions: nextPermissions });
    setPermissionSavingKey('');
    if (updated) {
      setFeedback('Permisos guardados en `accounts`.');
    }
  };

  const validateFormField = (field: 'fullName' | 'email', value: string) => {
    if (field === 'fullName') {
      if (!value.trim()) return 'El nombre es obligatorio';
      if (value.trim().length < 2) return 'Mínimo 2 caracteres';
      return undefined;
    }
    if (field === 'email') {
      if (!value.trim()) return 'El email es obligatorio';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Email no válido';
      return undefined;
    }
    return undefined;
  };

  const handleFormBlur = (field: 'fullName' | 'email') => {
    const value = field === 'fullName' ? form.fullName : form.email;
    const error = validateFormField(field, value);
    setFormErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleFormFieldChange = (field: 'fullName' | 'email', value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      const error = validateFormField(field, value);
      setFormErrors((prev) => ({ ...prev, [field]: error }));
    }
  };

  const handleSaveForm = async () => {
    const fullNameError = validateFormField('fullName', form.fullName);
    const emailError = validateFormField('email', form.email);
    if (fullNameError || emailError) {
      setFormErrors({ fullName: fullNameError, email: emailError });
      return;
    }

    const inviteStatus = form.status === 'pending' ? 'pending' : 'accepted';
    const siteId = String(form.employment.salesPointId || '').trim();
    const siteWc = workCenters.find((w) => String(w._id || w.id || '').trim() === siteId);
    const employmentSynced = siteId
      ? assignPrimaryWorkSite(
          {
            ...form.employment,
            bankAccount: normalizeIbanInput(form.employment.bankAccount),
            bankName: normalizeBankName(form.employment.bankName),
            emergencyContact: normalizeEmergencyContact(form.employment.emergencyContact),
            emergencyPhone: normalizeEmergencyPhone(form.employment.emergencyPhone),
          },
          { id: siteId, name: siteWc?.name || siteId },
        )
      : clearPrimaryWorkSite({
          ...form.employment,
          bankAccount: normalizeIbanInput(form.employment.bankAccount),
          bankName: normalizeBankName(form.employment.bankName),
          emergencyContact: normalizeEmergencyContact(form.employment.emergencyContact),
          emergencyPhone: normalizeEmergencyPhone(form.employment.emergencyPhone),
        });

    const nextUser = await persistMember({
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      avatar: form.avatar,
      role: form.role,
      status: form.status,
      inviteStatus,
      employment: employmentSynced,
      personalData: buildDefaultPersonalData(form.personalData),
    });

    if (nextUser) {
      setEditing(false);
      setFeedback('Datos personales guardados en CouchDB.');
    }
  };

  const handleRoleChange = async (nextRole: string) => {
    setForm((prev) => ({ ...prev, role: nextRole }));
    const nextPermissions = buildRolePermissions(nextRole, roles);
    const nextMcps = autoAssignMCPs(nextRole, form.employment.notes);
    setMcps(nextMcps);
    const updated = await persistMember({ role: nextRole, permissions: nextPermissions, mcps: nextMcps });
    if (updated) {
      setFeedback('Funcion actualizada.');
    }
  };

  const handleResetPassword = async () => {
    setIsResettingPassword(true);
    setGeneratedPassword('');
    setPasswordCopied(false);
    const result = await resetUserPassword(memberState.user_id);
    setIsResettingPassword(false);

    if (!result.success || !result.generatedPassword) {
      setFeedback(result.error || 'No se pudo restablecer la contraseña.');
      return;
    }

    setGeneratedPassword(result.generatedPassword);
    setFeedback('Contraseña restablecida y guardada en CouchDB.');
    try {
      await navigator.clipboard.writeText(result.generatedPassword);
      setPasswordCopied(true);
    } catch {
      setPasswordCopied(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!generatedPassword) {
      return;
    }
    await navigator.clipboard.writeText(generatedPassword);
    setPasswordCopied(true);
  };

  const handleDeleteConfirmed = async () => {
    setIsDeleting(true);
    const result = await deleteUser(memberState.user_id);
    setIsDeleting(false);
    setShowConfirmDelete(false);
    if (!result.success) {
      setFeedback(result.error || 'No se pudo eliminar el usuario.');
      return;
    }
    onMemberDeleted(memberState);
    onClose();
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, avatar: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Skin handlers ──

  const handleApplySkin = async (skinId: string) => {
    setSelectedSkinId(skinId);
    const updated = await persistMember({ skinId });
    if (updated) {
      setFeedback(`Apariencia "${getSkinById(skinId).name}" aplicada.`);
    }
  };

  const handleRevertSkin = async () => {
    setSelectedSkinId(originalSkinId);
    const updated = await persistMember({ skinId: originalSkinId });
    if (updated) {
      setFeedback('Apariencia revertida al estado anterior.');
    }
  };

  const handleSaveSkin = () => {
    if (!skinNameInput.trim()) return;
    const newSkin: AgentSkin = {
      ...activeSkin,
      id: `custom_${Date.now()}`,
      name: skinNameInput.trim(),
    };
    saveSkinToStorage(newSkin);
    setSavedSkins(loadSavedSkins());
    setSkinNameInput('');
    setShowSaveSkinForm(false);
    setFeedback(`Skin "${newSkin.name}" guardado. Puedes aplicarlo a cualquier agente.`);
  };

  const handleDeleteSavedSkin = (skinId: string) => {
    deleteSkinFromStorage(skinId);
    setSavedSkins(loadSavedSkins());
  };

  const handleApplyAnimation = async (animationId: string) => {
    setSelectedAnimationId(animationId);
    const updated = await persistMember({ animationId });
    if (updated) {
      const anim = getAnimationById(animationId);
      setFeedback(animationId === 'none' ? 'Animación eliminada.' : `Animación "${anim.name}" aplicada.`);
    }
  };

  const generateSkinFromPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    setIsGeneratingSkinFromPhoto(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoSkinPreview(dataUrl);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 80;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setIsGeneratingSkinFromPhoto(false); return; }

        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const saturation = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
          if (brightness < 235 && brightness > 25 && saturation > 15) {
            r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
          }
        }
        if (count === 0) {
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
          }
        }

        const hsl = rgbToHsl(Math.round(r / count), Math.round(g / count), Math.round(b / count));
        const presetId = findClosestPresetByColor(hsl);
        setIsGeneratingSkinFromPhoto(false);
        void handleApplySkin(presetId);
      };
      img.onerror = () => setIsGeneratingSkinFromPhoto(false);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // ── MCP handlers ──

  const handleMcpToggle = async (mcpId: string) => {
    const nextMcps = mcps.map((m) => (m.id === mcpId ? { ...m, enabled: !m.enabled } : m));
    setMcps(nextMcps);
    const updated = await persistMember({ mcps: nextMcps });
    if (updated) {
      setFeedback('MCPs actualizados.');
    }
  };

  const handleReassignMCPs = async () => {
    const nextMcps = autoAssignMCPs(memberState.role || 'Usuario', memberState.employment?.notes);
    setMcps(nextMcps);
    const updated = await persistMember({ mcps: nextMcps });
    if (updated) {
      setFeedback('MCPs reasignados según rol y descripción.');
    }
  };

  const handleRegenerateSingleMCP = async (mcpId: string) => {
    const autoResult = autoAssignMCPs(memberState.role || 'Usuario', memberState.employment?.notes);
    const autoMcp = autoResult.find((m) => m.id === mcpId);
    if (!autoMcp) return;
    const nextMcps = mcps.map((m) => (m.id === mcpId ? { ...m, enabled: autoMcp.enabled, autoAssigned: autoMcp.autoAssigned } : m));
    setMcps(nextMcps);
    const updated = await persistMember({ mcps: nextMcps });
    if (updated) {
      setFeedback(`MCP "${autoMcp.name}" regenerado según rol.`);
    }
  };

  const drawerHeaderBg = editing && drawerTab === 'appearance'
    ? activeSkin.headerBg
    : token.headerBg;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col overflow-hidden bg-white dark:bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className={`${drawerHeaderBg} border-b border-gray-200 dark:border-gray-700 px-6 py-5 transition-all duration-300`}>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={editing ? () => { setEditing(false); setDrawerTab('info'); } : onClose}
              className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800/70"
            >
              {editing ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {editing ? 'Volver' : 'Cerrar'}
            </button>
            <div className="flex items-center gap-2">
              <RoleBadge role={memberState.role} skinId={memberState.skinId} businessType={businessType} />
              <StatusBadge status={memberState.status} />
              {memberState.workerProfileCompletion && !memberState.workerProfileCompletion.fullyCompleted && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  Ficha incompleta
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Avatar
              member={editing ? { ...memberState, avatar: form.avatar, fullName: form.fullName } : memberState}
              size="xl"
              skinId={editing && drawerTab === 'appearance' ? selectedSkinId : memberState.skinId}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {editing ? form.fullName || memberState.fullName : memberState.fullName}
                </h2>
                {isCurrentUser && <span className="rounded-full bg-gray-900 px-2 py-1 text-[10px] font-bold text-white">Tú</span>}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{memberState.employment?.position || 'Sin cargo asignado'}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{memberState.email}</p>
            </div>
          </div>

          {/* Edit mode tab bar */}
          {editing && (
            <div className="mt-4 flex gap-1 rounded-xl bg-white/60 dark:bg-gray-800/60 p-1">
              {([
                { id: 'info' as const, label: 'Datos', icon: <Edit2 className="w-3.5 h-3.5" /> },
                { id: 'appearance' as const, label: 'Apariencia', icon: <Palette className="w-3.5 h-3.5" /> },
                { id: 'mcps' as const, label: 'MCPs', icon: <Bot className="w-3.5 h-3.5" /> },
              ] as { id: DrawerTab; label: string; icon: React.ReactNode }[]).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDrawerTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                    drawerTab === tab.id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {editing && drawerTab === 'info' && (
            <div className="space-y-5 px-6 py-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-[auto_1fr]">
                <div className="flex flex-col items-center gap-3">
                  <Avatar member={{ ...memberState, avatar: form.avatar, fullName: form.fullName }} size="xl" />
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600">
                    <Camera className="w-4 h-4" />
                    Avatar
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Nombre completo *</label>
                    <input
                      className={`${inputClassName} ${formErrors.fullName ? 'border-red-400 bg-red-50 focus:border-red-400' : ''}`}
                      value={form.fullName}
                      onChange={(event) => handleFormFieldChange('fullName', event.target.value)}
                      onBlur={() => handleFormBlur('fullName')}
                    />
                    {formErrors.fullName && <p className="mt-1 text-xs text-red-500">{formErrors.fullName}</p>}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Email *</label>
                    <input
                      className={`${inputClassName} ${formErrors.email ? 'border-red-400 bg-red-50 focus:border-red-400' : ''}`}
                      value={form.email}
                      onChange={(event) => handleFormFieldChange('email', event.target.value)}
                      onBlur={() => handleFormBlur('email')}
                    />
                    {formErrors.email && <p className="mt-1 text-xs text-red-500">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Teléfono</label>
                    <input className={inputClassName} value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Funcion</label>
                    <div className="relative">
                      <select className={`${inputClassName} appearance-none pr-9 cursor-pointer`} value={form.role} onChange={(event) => void handleRoleChange(event.target.value)}>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.id}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Estado</label>
                    <div className="relative">
                      <select className={`${inputClassName} appearance-none pr-9 cursor-pointer`} value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MemberStatus }))}>
                        <option value="active">Activo</option>
                        <option value="pending">Pendiente</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Información laboral</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Departamento</label>
                    <input className={inputClassName} value={form.employment.department} onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, department: event.target.value } }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">{hrCopy.memberStoreLabel}</label>
                    <div className="relative">
                      <select
                        className={`${inputClassName} appearance-none pr-9 cursor-pointer`}
                        value={form.employment.salesPointId || ''}
                        onChange={(event) => setForm((prev) => ({
                          ...prev,
                          employment: { ...prev.employment, salesPointId: event.target.value },
                        }))}
                      >
                        <option value="">{hrCopy.memberStoreEmpty}</option>
                        {workCenters.filter((wc) => wc.active !== false).map((wc) => (
                          <option key={wc._id || wc.id} value={wc._id || wc.id}>
                            {wc.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                      {hrCopy.memberStoreHint}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Cargo / Posición</label>
                    <input
                      className={inputClassName}
                      value={form.employment.position}
                      onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, position: event.target.value } }))}
                      placeholder={hrCopy.memberPositionPlaceholder}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Horario</label>
                    <input className={inputClassName} value={form.employment.schedule} onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, schedule: event.target.value } }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Fecha de alta</label>
                    <input type="date" className={inputClassName} value={form.employment.startDate} onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, startDate: event.target.value } }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Grupo de cotización</label>
                    <input className={inputClassName} value={form.employment.contributionGroup || ''} onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, contributionGroup: event.target.value } }))} placeholder="Ej: 05" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Mutua</label>
                    <input className={inputClassName} value={form.employment.mutualInsurance || ''} onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, mutualInsurance: event.target.value } }))} placeholder="Nombre de la mutua" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Tipo de contrato</label>
                    <div className="relative">
                      <select className={`${inputClassName} appearance-none pr-9 cursor-pointer`} value={form.employment.contractType} onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, contractType: event.target.value } }))}>
                        <option value="">Sin especificar</option>
                        <option value="indefinido">Indefinido</option>
                        <option value="temporal">Temporal</option>
                        <option value="practicas">Prácticas</option>
                        <option value="formacion">Formación</option>
                        <option value="autonomo">Autónomo / colaborador</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Jornada</label>
                    <div className="relative">
                      <select
                        className={`${inputClassName} appearance-none pr-9 cursor-pointer`}
                        value={form.employment.workday}
                        onChange={(event) => {
                          const workday = event.target.value;
                          setForm((prev) => {
                            const nextHours =
                              prev.employment.hoursPerWeek != null && Number(prev.employment.hoursPerWeek) > 0
                                ? prev.employment.hoursPerWeek
                                : workday === 'completa'
                                  ? 40
                                  : workday === 'media' || workday === 'parcial'
                                    ? 20
                                    : prev.employment.hoursPerWeek;
                            return {
                              ...prev,
                              employment: { ...prev.employment, workday, hoursPerWeek: nextHours },
                            };
                          });
                        }}
                      >
                        <option value="">Sin especificar</option>
                        <option value="completa">Completa (40 h)</option>
                        <option value="parcial">Parcial</option>
                        <option value="media">Media jornada (20 h)</option>
                        <option value="flexible">Flexible</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Horas / semana</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={0.5}
                      className={inputClassName}
                      value={form.employment.hoursPerWeek != null ? form.employment.hoursPerWeek : ''}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setForm((prev) => ({
                          ...prev,
                          employment: {
                            ...prev.employment,
                            hoursPerWeek: raw === '' ? undefined : Number(raw),
                          },
                        }));
                      }}
                      placeholder="Ej: 40 o 20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Salario bruto anual</label>
                    <input className={inputClassName} value={form.employment.salary} onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, salary: event.target.value } }))} placeholder="Ej: 28.000 €" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Cuenta bancaria (IBAN)</label>
                    <input
                      className={`${inputClassName} ${IBAN_INPUT_CLASS}`}
                      value={form.employment.bankAccount}
                      onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, bankAccount: formatIbanInput(event.target.value) } }))}
                      maxLength={IBAN_DISPLAY_MAX_LENGTH}
                      placeholder="ES00 0000 0000 0000 0000 0000"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Banco</label>
                    <input
                      className={inputClassName}
                      value={form.employment.bankName}
                      onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, bankName: normalizeBankName(event.target.value) } }))}
                      maxLength={60}
                      placeholder="Ej: CaixaBank, BBVA…"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Contacto de emergencia</label>
                    <input
                      className={inputClassName}
                      value={form.employment.emergencyContact}
                      onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, emergencyContact: normalizeEmergencyContact(event.target.value) } }))}
                      maxLength={80}
                      placeholder="Nombre y parentesco"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Teléfono emergencia</label>
                    <input
                      className={inputClassName}
                      value={form.employment.emergencyPhone}
                      onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, emergencyPhone: normalizeEmergencyPhone(event.target.value) } }))}
                      maxLength={20}
                      placeholder="+34 600 000 000"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Notas internas</label>
                    <textarea
                      rows={3}
                      className={`${inputClassName} resize-none`}
                      value={form.employment.notes}
                      onChange={(event) => setForm((prev) => ({ ...prev, employment: { ...prev.employment, notes: event.target.value } }))}
                      placeholder="Describe el rol del agente (afecta a la asignación automática de MCPs)..."
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Datos personales del trabajador</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">DNI / NIE</label>
                    <input className={inputClassName} value={form.personalData.dni} onChange={(event) => setForm((prev) => ({ ...prev, personalData: { ...prev.personalData, dni: event.target.value } }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Fecha de nacimiento</label>
                    <BirthDateEsField
                      value={form.personalData.birthDate}
                      onChange={(iso) => setForm((prev) => ({ ...prev, personalData: { ...prev.personalData, birthDate: iso } }))}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Nacionalidad</label>
                    <input className={inputClassName} value={form.personalData.nationality} onChange={(event) => setForm((prev) => ({ ...prev, personalData: { ...prev.personalData, nationality: event.target.value } }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Dirección</label>
                    <input className={inputClassName} value={form.personalData.address} onChange={(event) => setForm((prev) => ({ ...prev, personalData: { ...prev.personalData, address: event.target.value } }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Ciudad</label>
                    <input className={inputClassName} value={form.personalData.city} onChange={(event) => setForm((prev) => ({ ...prev, personalData: { ...prev.personalData, city: event.target.value } }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">C.P.</label>
                    <input className={inputClassName} value={form.personalData.postalCode} onChange={(event) => setForm((prev) => ({ ...prev, personalData: { ...prev.personalData, postalCode: event.target.value } }))} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Nº Seguridad Social</label>
                    <input className={inputClassName} value={form.personalData.socialSecurityNumber} onChange={(event) => setForm((prev) => ({ ...prev, personalData: { ...prev.personalData, socialSecurityNumber: event.target.value } }))} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {editing && drawerTab === 'appearance' && (
            <div className="space-y-5 px-6 py-5">
              <style>{AGENT_ANIMATION_STYLES}</style>
              {/* Preview */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Vista previa del frame</p>
                  <button
                    type="button"
                    onClick={() => {
                      const presets = [...SKIN_PRESETS, ...savedSkins];
                      const currentIdx = presets.findIndex((s) => s.id === selectedSkinId);
                      const nextIdx = (currentIdx + 1) % presets.length;
                      void handleApplySkin(presets[nextIdx].id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Generar siguiente frame"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerar
                  </button>
                </div>
                <div className={`rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden ${getAnimationById(selectedAnimationId).cssClass}`}>
                  <div className={`${activeSkin.headerBg} px-4 py-4`}>
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-full ${activeSkin.avatarBg} flex items-center justify-center flex-shrink-0`}>
                        {memberState.avatar
                          ? <img src={memberState.avatar} alt="" className="h-full w-full object-cover rounded-full" />
                          : <span className="font-bold text-white text-sm">{getInitials(memberState.fullName)}</span>
                        }
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 dark:text-gray-100">{memberState.fullName}</p>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${activeSkin.badgeBg} ${activeSkin.badgeText}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${activeSkin.dot}`} />
                          {memberState.role || 'Usuario'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`border-l-4 ${activeSkin.accentBorder} bg-white dark:bg-gray-800 px-4 py-2`}>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{activeSkin.name}</p>
                  </div>
                </div>
              </div>

              {/* Generate skin from photo */}
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Generar desde foto</p>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      {photoSkinPreview ? (
                        <>
                          <img src={photoSkinPreview} alt="Referencia" className="h-12 w-12 rounded-full object-cover border-2 border-white shadow-sm" />
                          {isGeneratingSkinFromPhoto && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                              <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                          <ImagePlus className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {isGeneratingSkinFromPhoto
                          ? 'Analizando colores...'
                          : photoSkinPreview
                            ? 'Skin generado desde foto'
                            : 'Sube una foto de referencia'}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">
                        {photoSkinPreview
                          ? 'Los colores dominantes se usaron para elegir el skin más parecido'
                          : 'Se extraerán los colores dominantes para aplicar el frame más similar'}
                      </p>
                    </div>
                    <label className={`flex-shrink-0 cursor-pointer inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${isGeneratingSkinFromPhoto ? 'pointer-events-none opacity-50 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-white dark:hover:bg-gray-800'}`}>
                      <Camera className="w-3.5 h-3.5" />
                      {photoSkinPreview ? 'Cambiar' : 'Subir foto'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={generateSkinFromPhoto} disabled={isGeneratingSkinFromPhoto} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Presets */}
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Frames predefinidos</p>
                <div className="grid grid-cols-4 gap-2">
                  {SKIN_PRESETS.map((skin) => (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => void handleApplySkin(skin.id)}
                      className={`relative flex flex-col items-center gap-2 rounded-xl p-2.5 transition-all border-2 ${
                        selectedSkinId === skin.id
                          ? 'border-gray-900 dark:border-gray-100 shadow-md'
                          : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                      }`}
                    >
                      <div className={`h-10 w-10 rounded-full ${skin.avatarBg} flex items-center justify-center`}>
                        <span className="text-xs font-bold text-white">{getInitials(memberState.fullName)}</span>
                      </div>
                      <div className={`h-1.5 w-full rounded-full ${skin.dot}`} />
                      <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 text-center leading-tight">{skin.name}</span>
                      {selectedSkinId === skin.id && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900">
                          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Animations */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Animaciones</p>
                  {selectedAnimationId !== 'none' && (
                    <button
                      type="button"
                      onClick={() => void handleApplyAnimation('none')}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Quitar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {ANIMATION_PRESETS.map((anim) => (
                    <button
                      key={anim.id}
                      type="button"
                      onClick={() => void handleApplyAnimation(anim.id)}
                      className={`relative flex flex-col items-center gap-1.5 rounded-xl p-2.5 transition-all border-2 ${
                        selectedAnimationId === anim.id
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800 shadow-md'
                          : 'border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                      }`}
                    >
                      <div
                        className={`h-9 w-9 rounded-xl ${anim.id === 'none' ? 'border-2 border-dashed border-gray-300 bg-gray-50' : `${activeSkin.avatarBg}`} flex items-center justify-center ${anim.cssClass}`}
                      >
                        {anim.id === 'none'
                          ? <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                          : <span className="text-[10px] font-bold text-white leading-none">{getInitials(memberState.fullName)}</span>
                        }
                      </div>
                      <span className="text-[9px] font-semibold text-gray-600 dark:text-gray-400 text-center leading-tight">{anim.name}</span>
                      {selectedAnimationId === anim.id && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900">
                          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Saved skins */}
              {savedSkins.length > 0 && (
                <div>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Skins guardados</p>
                  <div className="space-y-2">
                    {savedSkins.map((skin) => (
                      <div
                        key={skin.id}
                        className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all ${
                          selectedSkinId === skin.id ? 'border-gray-900 dark:border-gray-100' : 'border-gray-100 dark:border-gray-700/50 hover:border-gray-200 dark:hover:border-gray-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void handleApplySkin(skin.id)}
                          className="flex flex-1 items-center gap-3 min-w-0"
                        >
                          <div className={`h-9 w-9 rounded-full ${skin.avatarBg} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-xs font-bold text-white">{getInitials(memberState.fullName)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{skin.name}</p>
                            <div className={`mt-1 h-1.5 w-12 rounded-full ${skin.dot}`} />
                          </div>
                          {selectedSkinId === skin.id && <Check className="w-4 h-4 text-gray-900 ml-auto flex-shrink-0" strokeWidth={3} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedSkin(skin.id)}
                          className="flex-shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save current as skin */}
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4">
                {showSaveSkinForm ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Nombre del skin</p>
                    <div className="flex gap-2">
                      <input
                        className={`${inputClassName} flex-1`}
                        value={skinNameInput}
                        onChange={(e) => setSkinNameInput(e.target.value)}
                        placeholder="Ej: Mi tema azul..."
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSkin(); if (e.key === 'Escape') setShowSaveSkinForm(false); }}
                      />
                      <button
                        type="button"
                        onClick={handleSaveSkin}
                        disabled={!skinNameInput.trim()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Guardar
                      </button>
                      <button type="button" onClick={() => setShowSaveSkinForm(false)} className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSaveSkinForm(true)}
                    className="flex w-full items-center justify-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                  >
                    <Star className="w-4 h-4" />
                    Guardar frame actual como skin reutilizable
                  </button>
                )}
              </div>

              {/* Revert */}
              {selectedSkinId !== originalSkinId && (
                <button
                  type="button"
                  onClick={() => void handleRevertSkin()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Revertir al frame original
                </button>
              )}
            </div>
          )}

          {editing && drawerTab === 'mcps' && (
            <McpsSubmenu
              mcps={mcps}
              onToggle={handleMcpToggle}
              onRegenerate={handleRegenerateSingleMCP}
              onReassign={handleReassignMCPs}
              getMCPIcon={getMCPIcon}
              onMcpClick={(mcp) => setSelectedMcp(mcp)}
            />
          )}

          {!editing && (
            <>
              <section className="border-b border-gray-100 dark:border-gray-700/50 px-6 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Contacto</h3>
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setDrawerTab('info'); }}
                    className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Editar contacto"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: <Mail className="w-4 h-4 text-gray-500 dark:text-gray-400" />, label: 'Email', value: memberState.email || 'Sin email' },
                    { icon: <Phone className="w-4 h-4 text-gray-500 dark:text-gray-400" />, label: 'Teléfono', value: memberState.phone || 'Sin teléfono' },
                    { icon: <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />, label: 'Departamento', value: memberState.employment?.department || 'Sin departamento' },
                    {
                      icon: <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400" />,
                      label: hrCopy.memberStoreLabel.replace(' (TPV y fichaje)', ' (TPV)'),
                      value: (() => {
                        const ref = String(memberState.employment?.salesPointId || '').trim();
                        if (!ref) return hrCopy.memberStoreEmpty;
                        const wc = workCenters.find((w) => String(w._id || w.id || '').trim() === ref);
                        return wc?.name || ref;
                      })(),
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">{row.icon}</div>
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{row.label}</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{row.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border-b border-gray-100 dark:border-gray-700/50 px-6 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Información laboral</h3>
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setDrawerTab('info'); }}
                    className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Editar información"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Fecha de alta</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{memberState.employment?.startDate || formatFullDate(memberState.createdAt)}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                      <LogIn className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Último acceso</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatFullDate(memberState.lastLoginAt)}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Horario</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{memberState.employment?.schedule || 'Sin horario asignado'}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                      <Briefcase className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Contrato</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{memberState.employment?.contractType || 'Sin especificar'}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Jornada</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{memberState.employment?.workday || 'Sin especificar'}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                      <Banknote className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">Salario</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{memberState.employment?.salary || 'No definido'}</p>
                  </div>
                  {(memberState.employment?.emergencyContact?.trim() || memberState.employment?.emergencyPhone?.trim()) && (
                    <div className="rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 p-3 md:col-span-2">
                      <div className="mb-1 flex items-center gap-1.5 text-red-500">
                        <Heart className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-medium uppercase tracking-wide">Contacto de emergencia</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {memberState.employment?.emergencyContact || 'Sin nombre'}
                        {memberState.employment?.emergencyPhone ? ` · ${memberState.employment.emergencyPhone}` : ''}
                      </p>
                    </div>
                  )}
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 md:col-span-2">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">Notas internas</p>
                    <p className="text-sm text-amber-900 dark:text-amber-200">{memberState.employment?.notes || 'Sin notas internas.'}</p>
                  </div>
                </div>
              </section>

              {/* Apariencia read-only */}
              <section className="border-b border-gray-100 dark:border-gray-700/50 px-6 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Apariencia</h3>
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setDrawerTab('appearance'); }}
                    className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    title="Editar apariencia"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-full ${activeSkin.avatarBg} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-xs font-bold text-white">{getInitials(memberState.fullName)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{activeSkin.name}</p>
                    <div className={`mt-1 h-1.5 w-12 rounded-full ${activeSkin.dot}`} />
                  </div>
                </div>
              </section>

              {/* MCPs read-only view */}
              <section className="border-b border-gray-100 dark:border-gray-700/50 px-6 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">MCPs asignados</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{mcps.filter((m) => m.enabled).length} activos</span>
                    <button
                      type="button"
                      onClick={() => { setEditing(true); setDrawerTab('mcps'); }}
                      className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      title="Editar MCPs"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {mcps.filter((m) => m.enabled).map((mcp) => (
                    <button
                      key={mcp.id}
                      type="button"
                      onClick={() => setSelectedMcp(mcp)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 dark:bg-violet-900/20 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                      title={`Ver detalle de ${mcp.name}`}
                    >
                      {getMCPIcon(mcp.icon)}
                      {mcp.name}
                    </button>
                  ))}
                  {mcps.filter((m) => m.enabled).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Sin MCPs activos</p>
                  )}
                </div>
              </section>
            </>
          )}

          <section className="border-b border-gray-100 dark:border-gray-700/50 px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Permisos de acceso</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {permissionSummary.totalView} ver · {permissionSummary.totalEdit} editar
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-[1fr_56px_56px] bg-gray-50 dark:bg-gray-800 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                <span>Módulo</span>
                <span className="text-center">Ver</span>
                <span className="text-center">Editar</span>
              </div>
              {accessModules.map((module, index) => {
                const current = permissions[module.key] || { view: false, edit: false };
                return (
                  <div key={module.key} className={`grid grid-cols-[1fr_56px_56px] items-center px-3 py-2.5 ${index < accessModules.length - 1 ? 'border-t border-gray-100 dark:border-gray-700/50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 dark:text-gray-500">{PERMISSION_MODULE_ICONS[module.key] || <Shield className="w-3.5 h-3.5" />}</span>
                      <span className={`text-xs font-medium ${current.view ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>{resolvePermissionModuleLabel(module.key, module.label, businessType)}</span>
                    </div>
                    <div className="flex justify-center">
                      <PermissionIconButton active={current.view} disabled={permissionSavingKey === `${module.key}:view`} onClick={() => void handlePermissionToggle(module.key, 'view')} />
                    </div>
                    <div className="flex justify-center">
                      <PermissionIconButton active={current.edit} disabled={permissionSavingKey === `${module.key}:edit`} onClick={() => void handlePermissionToggle(module.key, 'edit')} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="border-b border-gray-100 dark:border-gray-700/50 px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Actividad reciente</h3>
              <Activity className="w-4 h-4 text-gray-300 dark:text-gray-600" />
            </div>
            <div className="space-y-3">
              {activity.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay actividad registrada para este usuario.</p>}
              {activity.map((item) => {
                const meta = getActivityMeta(item.type);
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl ${meta.bg}`}>{meta.icon}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-gray-700 dark:text-gray-300">{item.action}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{formatRelativeTime(item.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="px-6 py-4 pb-8">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Acciones</h3>
            <div className="space-y-3">
              <button type="button" onClick={() => void handleResetPassword()} disabled={isResettingPassword} className="flex w-full items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600 disabled:cursor-not-allowed disabled:opacity-60">
                <div className="flex items-center gap-2.5">
                  <Key className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  {isResettingPassword ? 'Restableciendo contraseña...' : 'Restablecer contraseña'}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
              </button>

              {generatedPassword && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-700">Nueva contraseña</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={generatedPassword} className="h-11 flex-1 rounded-xl border border-blue-200 bg-white px-3 text-sm font-mono text-blue-900" />
                    <button type="button" onClick={() => void handleCopyPassword()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                      <Copy className="w-4 h-4" />
                      {passwordCopied ? 'Copiada' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isCurrentUser) {
                    setFeedback('No puedes eliminar tu propia cuenta desde aquí.');
                    return;
                  }
                  if (!canDeleteMember) {
                    setFeedback('Solo el propietario puede expulsar a un Admin u otro rol de administración.');
                    return;
                  }
                  setShowConfirmDelete(true);
                }}
                disabled={isDeleting || isCurrentUser || !canDeleteMember}
                className="flex w-full items-center justify-between rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 className="w-4 h-4" />
                  {isDeleting ? 'Eliminando usuario...' : 'Eliminar usuario'}
                </div>
                <ChevronRight className="w-4 h-4 text-red-300" />
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-700/50 bg-white dark:bg-gray-900 px-6 py-4">
          <div className="mb-3 min-h-5 text-sm text-gray-500 dark:text-gray-400">{feedback || (isSaving ? 'Guardando cambios...' : 'Cambios sincronizados con `accounts` en CouchDB.')}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={editing ? () => { setEditing(false); setDrawerTab('info'); } : onClose}
              className="flex-1 rounded-xl border-2 border-gray-200 dark:border-gray-700 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
            >
              {editing ? 'Cancelar' : 'Cerrar'}
            </button>
            <button
              type="button"
              onClick={editing ? () => void handleSaveForm() : () => setEditing(true)}
              disabled={isSaving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editing ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              {editing ? (drawerTab === 'appearance' ? 'Confirmar frame' : 'Guardar cambios') : 'Editar agente'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDestroyModal
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleDeleteConfirmed}
        title={t('team.deleteUser.title')}
        description={t('team.deleteUser.description', { name: memberState.fullName })}
        itemName={memberState.fullName}
        confirmLabel={t('team.deleteUser.confirmLabel')}
        destructiveLabel={t('team.deleteUser.destructiveLabel')}
        isDeleting={isDeleting}
      />

      {selectedMcp && (
        <McpDetailModal
          mcp={selectedMcp}
          members={members || [memberState]}
          onClose={() => setSelectedMcp(null)}
        />
      )}
    </>
  );
}

// ─── TeamActivityPanel ────────────────────────────────────────────────────────

function ActivityTimeline({ items }: { items: AccountActivityItem[] }) {
  const TYPE_ICON: Record<string, React.ReactNode> = {
    vehicle: <Car className="w-3.5 h-3.5" />,
    sale: <TrendingUp className="w-3.5 h-3.5" />,
    client: <Users className="w-3.5 h-3.5" />,
    document: <FileText className="w-3.5 h-3.5" />,
  };
  const TYPE_COLOR: Record<string, string> = {
    vehicle: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    sale: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
    client: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600',
    document: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `Hace ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Hace ${h}h`;
    return `Hace ${Math.floor(h / 24)}d`;
  }

  if (items.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">Sin actividad reciente</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.slice(0, 8).map((item) => (
        <div key={item.id} className="flex items-start gap-2">
          <span className={`mt-0.5 flex-shrink-0 p-1 rounded-md ${TYPE_COLOR[item.type] || 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            {TYPE_ICON[item.type] || <Activity className="w-3.5 h-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-tight truncate">{item.action}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(item.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamActivityPanel({ members }: { members: AuthUser[] }) {
  const [filter, setFilter] = useState<'today' | 'week'>('today');
  const [activityMap, setActivityMap] = useState<Record<string, AccountActivityItem[]>>({});
  const [loading, setLoading] = useState(false);
  const memberIdsKey = useMemo(
    () => members.map((m) => m.user_id).sort().join('|'),
    [members],
  );

  useEffect(() => {
    if (!memberIdsKey) return;
    const hasCachedData = memberIdsKey.split('|').every((id) => id in activityMap);
    if (!hasCachedData) setLoading(true);
    let cancelled = false;
    Promise.allSettled(
      members.map(async (m) => {
        try {
          const res = await getUserActivityRequest(m.user_id);
          return { userId: m.user_id, items: (res as any).recentActivity || [] };
        } catch {
          return { userId: m.user_id, items: [] };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, AccountActivityItem[]> = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          map[r.value.userId] = r.value.items;
        }
      });
      setActivityMap(map);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [memberIdsKey]);

  const now = new Date();
  const cutoff = filter === 'today'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(now.getTime() - 7 * 86400000);

  const filterItems = (items: AccountActivityItem[]) =>
    items.filter((i) => new Date(i.createdAt) >= cutoff);

  const totalActions = members.reduce(
    (s, m) => s + filterItems(activityMap[m.user_id] || []).length, 0,
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
          {(['today', 'week'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                filter === f
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {f === 'today' ? 'Hoy' : 'Esta semana'}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{totalActions}</span> acciones totales
        </p>
      </div>

      {/* Cards de miembros */}
      {loading && members.length === 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-700/50 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((j) => <div key={j} className="h-2.5 bg-gray-100 dark:bg-gray-700/50 rounded" />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((member) => {
            const items = filterItems(activityMap[member.user_id] || []);
            const token = getRoleToken(member.role);
            const initials = getInitials(member.fullName || `${member.firstName} ${member.lastName}`);
            return (
              <div key={member.user_id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full ${token.avatarBg} flex items-center justify-center flex-shrink-0`}>
                    {member.avatar ? (
                      <img src={member.avatar} alt={member.fullName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-white">{initials}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {member.fullName || `${member.firstName} ${member.lastName}`.trim()}
                    </p>
                    <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${token.badgeBg} ${token.badgeText}`}>
                      {member.role || 'Usuario'}
                    </span>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{items.length}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">acciones</p>
                  </div>
                </div>
                <ActivityTimeline items={items} />
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="col-span-3 text-center py-12 text-gray-400 dark:text-gray-500">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay miembros en el equipo</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type TeamCrmNavTab =
  | { id: 'clients' | 'leads' | 'billing'; label: string; count?: number }
  | { id: 'quotes-nav' | 'promotions-nav'; label: string; route: string };

export function Team() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    listUsers,
    listRoles,
    inviteUser,
    lookupInviteEmail,
    listBusinessInvitations,
    resendInvitation,
    revokeInvitation,
  } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const hrCopy = getHrLocationCopy(currentBusiness?.businessType);
  const { clients: contextClients, leads: contextLeads } = useApp();
  const [searchParams] = useSearchParams();
  const memberIdParam = searchParams.get('memberId');
  const [activeTab, setActiveTab] = useState<TeamTab>(() => {
    const tab = String(new URLSearchParams(window.location.search).get('tab') || '').trim();
    if (
      tab === 'members'
      || tab === 'roles'
      || tab === 'activity'
      || tab === 'staff-expenses'
      || tab === 'staff-consumptions'
      || tab === 'payroll'
    ) {
      return tab;
    }
    return 'members';
  });
  const [showInvite, setShowInvite] = useState(false);
  const [showInviteQr, setShowInviteQr] = useState(false);
  const [showSeatBillingWarn, setShowSeatBillingWarn] = useState(false);
  const [workerSeats, setWorkerSeats] = useState<WorkerSeatStatus | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOrgChart, setShowOrgChart] = useState(false);
  const [workCentersData, setWorkCentersData] = useState<WorkCenter[]>([]);
  const { focus: activationFocus, clearFocus: clearActivationFocus } = useActivationFocus();

  useEffect(() => {
    if (activationFocus === 'team-invite') {
      if (workerSeats && !workerSeats.canInvite) {
        setShowSeatBillingWarn(true);
      } else {
        setShowInvite(true);
      }
      clearActivationFocus();
    }
  }, [activationFocus, clearActivationFocus, workerSeats]);

  const TEAM_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: 'María López' },
    { key: 'email', label: 'Email', required: true, example: 'maria@empresa.com' },
    { key: 'phone', label: 'Teléfono', example: '600123456' },
    { key: 'role', label: 'Funcion', example: 'Cocina' },
    { key: 'department', label: 'Departamento', example: 'Ventas' },
    { key: 'position', label: 'Cargo', example: isRestaurantBusinessType(currentBusiness?.businessType) ? 'Camarero/a' : 'Comercial' },
  ];
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [members, setMembers] = useState<AuthUser[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<TeamInvitation[]>([]);
  const [baseRoles, setBaseRoles] = useState<RoleDefinition[]>([]);
  const [customRoles, setCustomRoles] = useState<RoleDefinition[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortState, setSortState] = useState<SortState>({ key: '', dir: null });
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());
  const [filterRole, setFilterRole] = useState<Set<string>>(new Set());
  const [filterBranch, setFilterBranch] = useState<Set<string>>(new Set());
  const [teamAlerts, setTeamAlerts] = useState<TeamAlert[]>([]);
  const roleScope = user?.user_id || 'guest';
  const resolvedUserId = user?.id || user?.user_id || '';

  const loadDirectory = async (nextSelectedMemberId?: string | null) => {
    setIsLoading(true);
    try {
      const [nextMembers, nextRoles] = await Promise.all([listUsers(currentBusiness?.business_id), listRoles()]);
      setMembers(nextMembers);
      setBaseRoles(nextRoles);
      if (typeof nextSelectedMemberId !== 'undefined') {
        setSelectedMemberId(nextSelectedMemberId);
      }
    } catch (error) {
      setPageMessage({ text: error instanceof Error ? error.message : 'No se pudo cargar el equipo.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendingInvitations = async () => {
    if (!currentBusiness?.business_id) {
      setPendingInvitations([]);
      return;
    }
    const list = await listBusinessInvitations(currentBusiness.business_id, false);
    setPendingInvitations(list);
  };

  const loadWorkerSeats = async () => {
    if (!currentBusiness?.business_id) {
      setWorkerSeats(null);
      return;
    }
    const seats = await getWorkerSeatStatusRequest(currentBusiness.business_id);
    setWorkerSeats(seats);
  };

  const accountUserId = user?.user_id || user?.id || '';

  useEffect(() => {
    if (!currentBusiness?.business_id) return;
    void loadDirectory();
    void loadPendingInvitations();
    void loadWorkerSeats();
    if (accountUserId) {
      loadInviteWorkCenters(user, currentBusiness)
        .then(setWorkCentersData)
        .catch(() => {});
    }
    fetchTeamAlerts(currentBusiness.business_id).then(setTeamAlerts).catch(() => {});
  }, [currentBusiness?.business_id, accountUserId]);

  useEffect(() => {
    if (!resolvedUserId || !currentBusiness) return;
    const refreshWorkCenters = () => {
      loadInviteWorkCenters(user, currentBusiness)
        .then(setWorkCentersData)
        .catch(() => {});
    };
    window.addEventListener('work-centers:changed', refreshWorkCenters);
    return () => window.removeEventListener('work-centers:changed', refreshWorkCenters);
  }, [currentBusiness, resolvedUserId, user]);

  useEffect(() => {
    setCustomRoles(loadCustomRoles(roleScope));
  }, [roleScope]);

  useEffect(() => {
    if (memberIdParam) {
      navigate(`/saas/team/${memberIdParam}`, { replace: true });
    }
  }, [memberIdParam, navigate]);

  const orderedMembers = useMemo(() => {
    const seen = new Set<string>();
    const unique = members.filter((member) => {
      const uid = String(member.user_id || '').trim();
      if (!uid || seen.has(uid)) return false;
      seen.add(uid);
      return true;
    });
    return [...unique].sort((a, b) => {
      if (a.user_id === user?.user_id) {
        return -1;
      }
      if (b.user_id === user?.user_id) {
        return 1;
      }
      if (a.status === 'pending' && b.status !== 'pending') {
        return -1;
      }
      if (b.status === 'pending' && a.status !== 'pending') {
        return 1;
      }
      return (a.fullName || '').localeCompare(b.fullName || '');
    });
  }, [members, user?.user_id]);
  const roles = useMemo(() => {
    const base = getFunctionRolesForBusiness(currentBusiness?.businessType, {
      ownDeliveryEnabled: Boolean(currentBusiness?.ownDeliveryEnabled),
    });
    return mergeRoleCatalog(base, customRoles, members);
  }, [customRoles, members, currentBusiness?.businessType]);

  const selectedMember = orderedMembers.find((member) => member.user_id === selectedMemberId) || null;
  const totalActive = orderedMembers.filter((member) => member.status === 'active').length;
  const totalPending = orderedMembers.filter((member) => member.status === 'pending').length;
  const totalRoles = roles.length;

  const statusFilterOptions = useMemo(() => {
    const values = [...new Set(members.map(m => m.status || 'active'))];
    const labels: Record<string, string> = { active: 'Activo', pending: 'Pendiente', inactive: 'Inactivo' };
    return values.map(v => ({ value: v, label: labels[v] || v }));
  }, [members]);

  const roleFilterOptions = useMemo(() => {
    const values = [...new Set(members.map(m => m.role || 'Usuario'))];
    return values.map(v => ({ value: v, label: v }));
  }, [members]);

  const branchFilterOptions = useMemo(() => {
    const branches = new Set<string>();
    for (const m of members) {
      const activeAssignments = m.employment?.assignments?.filter(a => a.status === 'active' && (a.type === 'branch' || a.type === 'work_center')) || [];
      for (const a of activeAssignments) branches.add(a.entityName);
      if (m.employment?.salesPointId) {
        const wc = workCentersData.find(w => w._id === m.employment?.salesPointId || w.id === m.employment?.salesPointId);
        if (wc) branches.add(wc.name);
      }
    }
    return [...branches].sort().map(v => ({ value: v, label: v }));
  }, [members, workCentersData]);

  const displayMembers = useMemo(() => {
    let result = orderedMembers;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m =>
        (m.fullName || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q) ||
        (m.employment?.department || '').toLowerCase().includes(q) ||
        (m.employment?.position || '').toLowerCase().includes(q)
      );
    }

    if (filterStatus.size > 0) {
      result = result.filter(m => filterStatus.has(m.status || 'active'));
    }

    if (filterRole.size > 0) {
      result = result.filter(m => filterRole.has(m.role || 'Usuario'));
    }

    if (filterBranch.size > 0) {
      result = result.filter(m => {
        const activeAssignments = m.employment?.assignments?.filter(a => a.status === 'active') || [];
        const names = activeAssignments.map(a => a.entityName);
        const wc = workCentersData.find(w => w._id === m.employment?.salesPointId || w.id === m.employment?.salesPointId);
        if (wc) names.push(wc.name);
        return names.some(n => filterBranch.has(n));
      });
    }

    if (sortState.dir) {
      result = applySortToArray(result, sortState, (member, key) => {
        switch (key) {
          case 'user': return member.fullName || '';
          case 'status': return member.status || '';
          case 'role': return member.role || '';
          case 'permissions': {
            const s = getPermissionSummary(member.permissions, member.role, currentBusiness?.businessType);
            return s.totalView + s.totalEdit;
          }
          case 'activity': return member.recentActivity?.[0]?.action || '';
          case 'lastAccess': return member.lastLoginAt || '';
          default: return null;
        }
      });
    }

    return result;
  }, [orderedMembers, searchQuery, filterStatus, filterRole, filterBranch, sortState, workCentersData]);

  const hasActiveFilters = searchQuery.trim() !== '' || filterStatus.size > 0 || filterRole.size > 0 || filterBranch.size > 0;

  const crmClientsCount = contextClients?.length ?? 0;
  const crmLeadsCount = useMemo(
    () =>
      (contextLeads || []).filter((lead) =>
        ['new', 'contacted', 'appointment', 'reserved', 'lost'].includes(lead.status))
        .length,
    [contextLeads],
  );

  const CRM_TABS: TeamCrmNavTab[] = useMemo(
    () => [
      { id: 'quotes-nav',     label: 'Presupuestos',        route: '/saas/quotes' },
      { id: 'leads',          label: 'Clientes lead',       count: crmLeadsCount },
      { id: 'promotions-nav', label: 'Promociones',         route: '/saas/promotions' },
      { id: 'billing',        label: 'Factura de clientes' },
    ],
    [crmLeadsCount],
  );

  const toggleFilterSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (value: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleInvite = async (payload: InviteUserPayload) => {
    const { name, email, role, landingPage, phone, position, contractType, grossMonthlySalary, payPeriodsPerYear, workCenterId, scheduleTemplateId, businessId } = payload;
    const permissions = getInvitePermissionsForUser(role, roles);
    const result = await inviteUser({
      name, email, role, phone, permissions,
      businessId: businessId || currentBusiness?.business_id,
      landingPage, position, contractType, grossMonthlySalary, payPeriodsPerYear, workCenterId,
      scheduleTemplateId,
    });
    if (!result.success) {
      const errText = result.error || 'No se pudo invitar al usuario.';
      if (/cupo|facturaci[oó]n|WORKER_SEAT|trabajador extra/i.test(errText)) {
        setShowSeatBillingWarn(true);
        void loadWorkerSeats();
      }
      throw new Error(errText);
    }

    const isExistingUser = Boolean(result.isExistingUser);
    const emailSent = result.emailSent !== false;
    setPageMessage({
      text: emailSent
        ? (isExistingUser
          ? `Invitación enviada a ${email}. Recibirá un correo para unirse al equipo con el rol «${role}».`
          : `Invitación enviada a ${email}. Recibirá un correo para crear su acceso con el rol «${role}».`)
        : `Invitación creada para ${email}, pero el correo no se pudo enviar. Revisa la configuración de email o reenvía desde Equipo.`,
      type: emailSent ? 'success' : 'error',
    });
    await loadDirectory(null);
    await loadPendingInvitations();
    await loadWorkerSeats();
    window.dispatchEvent(new CustomEvent('vertial:invitations:refresh'));

    return {
      isExistingUser,
      emailSent: result.emailSent !== false,
      inviteExpiresAt: result.inviteExpiresAt,
    };
  };

  const handleCreateRole = (data: { id: string; description: string; permissions: string[] }) => {
    const nextRoles = upsertCustomRole(roleScope, data);
    setCustomRoles(nextRoles);
    setShowCreateRole(false);
    setPageMessage({ text: `Funcion "${data.id}" creada correctamente.`, type: 'success' });
  };

  const handleMemberUpdated = (updatedMember: AuthUser) => {
    setMembers((prev) => prev.map((member) => (member.user_id === updatedMember.user_id ? updatedMember : member)));
    setSelectedMemberId(updatedMember.user_id);
    setPageMessage({ text: `Datos de ${updatedMember.fullName} actualizados.`, type: 'success' });
    void loadDirectory(updatedMember.user_id);
  };

  const handleMemberDeleted = (deletedMember: AuthUser) => {
    setMembers((prev) => prev.filter((member) => member.user_id !== deletedMember.user_id));
    setSelectedMemberId(null);
    setPageMessage({ text: `${deletedMember.fullName} eliminado del equipo.`, type: 'success' });
    void loadDirectory(null);
  };

  const crmTabParam = searchParams.get('tab');
  const crmPath = location.pathname;
  const isCrmLeadsActive =
    crmPath === '/saas/clients' && (crmTabParam === 'leads' || crmTabParam === 'lead');
  const isCrmClientsActive =
    crmPath.startsWith('/saas/clients') && !isCrmLeadsActive && crmTabParam !== 'billing';

  const isDelivery = currentBusiness?.businessType === 'delivery';
  return (
    <Layout title={t('team.title')} subtitle={t('team.subtitle')}>
      <div className="space-y-4">
        {/* Search — always first */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('team.searchPlaceholder', 'Buscar por nombre, email, rol...')}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-9 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
          )}
        </div>

        {/* Barra CRM (solo para verticales donde aplica; en delivery debe ser nulo) */}
        {!isDelivery && (
          <div
            className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {CRM_TABS.map((tab, i) => {
              const isNavTab = tab.id === 'quotes-nav' || tab.id === 'promotions-nav';
              const isActive = isNavTab
                ? false
                : tab.id === 'leads'
                  ? isCrmLeadsActive
                  : tab.id === 'billing'
                    ? false
                    : isCrmClientsActive;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (isNavTab) {
                      navigate((tab as { route: string }).route);
                      return;
                    }
                    if (tab.id === 'billing') {
                      navigate('/saas/clients?tab=billing');
                      return;
                    }
                    navigate(tab.id === 'leads' ? '/saas/clients?tab=leads' : '/saas/clients?tab=clients');
                  }}
                  className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                  } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
                >
                  {tab.label}
                  {'count' in tab && tab.count != null && (
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
              <UsersRound className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-gray-100">{orderedMembers.length} {t('team.members')}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {totalActive} {t('team.active')} · {totalPending} {t('team.pending')}
                {workerSeats
                  ? ` · Cupo trabajadores ${workerSeats.used}/${workerSeats.limit}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowOrgChart(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-600">
              <Network className="w-4 h-4" />
              {t('team.orgchart.button')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (workerSeats && !workerSeats.canInvite) {
                  setShowSeatBillingWarn(true);
                  return;
                }
                setShowInviteQr(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-600"
              title="QR / enlace por tienda u oficina"
            >
              <QrCode className="w-4 h-4" />
              QR invitación
            </button>
            <ActivationFieldWrap fieldKey="team-invite" activeKey={activationFocus}>
              <button
                type="button"
                onClick={() => {
                  if (workerSeats && !workerSeats.canInvite) {
                    setShowSeatBillingWarn(true);
                    return;
                  }
                  setShowInvite(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                title={
                  workerSeats && !workerSeats.canInvite
                    ? `Cupo completo (${workerSeats.used}/${workerSeats.limit}) · subir facturación`
                    : undefined
                }
              >
                <UserPlus className="w-4 h-4" />
                {t('team.inviteUser')}
              </button>
            </ActivationFieldWrap>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'Plantilla total', value: orderedMembers.length, icon: <UsersRound className="w-4 h-4 text-gray-400 dark:text-gray-500" />, color: 'text-gray-900 dark:text-gray-100', border: 'border-gray-200 dark:border-gray-700', sub: '' },
            { label: 'Activos', value: totalActive, icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, color: 'text-emerald-600', border: 'border-gray-200 dark:border-gray-700 border-l-4 border-l-emerald-500', sub: orderedMembers.length > 0 ? `${Math.round(totalActive / orderedMembers.length * 100)}%` : '' },
            { label: 'Pendientes', value: totalPending, icon: <AlertCircle className="w-4 h-4 text-amber-500" />, color: 'text-amber-600', border: 'border-gray-200 dark:border-gray-700 border-l-4 border-l-amber-500', sub: 'invitaciones' },
            { label: 'Inactivos', value: orderedMembers.filter(m => m.status === 'inactive').length, icon: <Users className="w-4 h-4 text-gray-400" />, color: 'text-gray-500', border: 'border-gray-200 dark:border-gray-700 border-l-4 border-l-gray-400', sub: 'bajas' },
            { label: 'Alertas', value: teamAlerts.length, icon: <AlertCircle className="w-4 h-4 text-red-500" />, color: teamAlerts.length > 0 ? 'text-red-600' : 'text-gray-400', border: teamAlerts.length > 0 ? 'border-red-200 dark:border-red-800 border-l-4 border-l-red-500' : 'border-gray-200 dark:border-gray-700', sub: teamAlerts.filter(a => a.severity === 'critical').length > 0 ? `${teamAlerts.filter(a => a.severity === 'critical').length} críticas` : '' },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl border bg-white dark:bg-gray-800 p-4 ${item.border}`}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{item.label}</p>
                {item.icon}
              </div>
              <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
              {item.sub && <p className="text-[11px] text-gray-400 mt-0.5">{item.sub}</p>}
            </div>
          ))}
        </div>

        {/* Team alerts banner */}
        {teamAlerts.length > 0 && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                  {teamAlerts.length} alerta{teamAlerts.length !== 1 ? 's' : ''} de equipo
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {teamAlerts.filter(a => a.severity === 'critical').length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 dark:bg-red-900/30 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
                      {teamAlerts.filter(a => a.severity === 'critical').length} doc. caducados
                    </span>
                  )}
                  {teamAlerts.filter(a => a.type === 'document_expiring').length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {teamAlerts.filter(a => a.type === 'document_expiring').length} por caducar
                    </span>
                  )}
                  {teamAlerts.filter(a => a.type === 'no_assignment').length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                      {teamAlerts.filter(a => a.type === 'no_assignment').length} sin asignar
                    </span>
                  )}
                  {teamAlerts.filter(a => a.type === 'cost_review_pending').length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300">
                      {teamAlerts.filter(a => a.type === 'cost_review_pending').length} coste pendiente
                    </span>
                  )}
                  {teamAlerts.filter(a => a.type === 'profile_incomplete').length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-orange-100 dark:bg-orange-900/30 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
                      {teamAlerts.filter(a => a.type === 'profile_incomplete').length} ficha incompleta
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          id="team-tabs"
          data-testid="team-tabs"
          className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {[
            { id: 'members' as const, label: t('team.tabs.members'), count: orderedMembers.length },
            { id: 'roles' as const, label: 'Funciones', count: roles.length },
            { id: 'activity' as const, label: t('team.tabs.activity'), count: null },
            { id: 'staff-expenses' as const, label: t('team.tabs.staffExpenses'), count: null },
            { id: 'staff-consumptions' as const, label: t('team.tabs.staffConsumptions'), count: null },
            { id: 'payroll' as const, label: t('team.tabs.payroll'), count: null },
          ].map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                } ${index !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
              >
                {tab.label}
                {tab.count !== null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    isActive
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />}
              </button>
            );
          })}
        </div>

        {pageMessage && (
          <PageNotification
            message={pageMessage.text}
            type={pageMessage.type}
            onClose={() => setPageMessage(null)}
          />
        )}

        {activeTab === 'members' && pendingInvitations.length > 0 && (
          <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-violet-800 dark:text-violet-200">Invitaciones pendientes</p>
                <p className="text-xs text-violet-700/80 dark:text-violet-300/80">Verán tu invitación cuando entren en Vertial con su email.</p>
              </div>
              <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                {pendingInvitations.length}
              </span>
            </div>
            <div className="space-y-2">
              {pendingInvitations.map((inv) => (
                <div
                  key={inv.invitationId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {inv.fullName || inv.email}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {inv.email}
                      {inv.phone ? ` · ${inv.phone}` : ''}
                      {' · '}{inv.role}
                      {inv.expiresAt
                        ? ` · caduca el ${new Date(inv.expiresAt).toLocaleDateString()}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await resendInvitation(inv.invitationId);
                        if (res.success) {
                          toast.success('Invitación renovada por 30 días más.');
                          await loadPendingInvitations();
                        } else {
                          toast.error(res.error || 'No se pudo renovar la invitación.');
                        }
                      }}
                      className="rounded-lg border border-violet-200 dark:border-violet-800 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                    >
                      Renovar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await revokeInvitation(inv.invitationId);
                        if (res.success) {
                          toast.success('Invitación revocada.');
                          await loadPendingInvitations();
                        } else {
                          toast.error(res.error || 'No se pudo revocar la invitación.');
                        }
                      }}
                      className="rounded-lg border border-red-200 dark:border-red-800 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      Revocar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <>
            {!isLoading && orderedMembers.length === 0 ? (
              <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <EmptyState
                  className="min-h-[min(70vh,560px)] py-20"
                  type="team"
                  title={t('team.empty.noMembers')}
                  description={t('team.empty.noMembersDesc')}
                  ctaLabel={t('team.inviteUser')}
                  onCta={() => setShowInvite(true)}
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <div className="flex items-center gap-2 flex-wrap">
                    {filterStatus.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterStatus(new Set())}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        Estado ({filterStatus.size})
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {filterRole.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterRole(new Set())}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        Funcion ({filterRole.size})
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {filterBranch.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterBranch(new Set())}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                      >
                        Sede ({filterBranch.size})
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {hasActiveFilters && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                        {displayMembers.length} de {orderedMembers.length}
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 md:block">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/80">
                        <TableColHeader
                          label={t('team.table.user')}
                          sortKey="user"
                          sortState={sortState}
                          onSort={setSortState}
                        />
                        <TableColHeader
                          label={t('team.table.status')}
                          sortKey="status"
                          sortState={sortState}
                          onSort={setSortState}
                          filterOptions={statusFilterOptions}
                          filterSelected={filterStatus}
                          onFilterToggle={toggleFilterSet(setFilterStatus)}
                          onFilterClear={() => setFilterStatus(new Set())}
                        />
                        <TableColHeader
                          label={t('team.table.roleDept')}
                          sortKey="role"
                          sortState={sortState}
                          onSort={setSortState}
                          filterOptions={roleFilterOptions}
                          filterSelected={filterRole}
                          onFilterToggle={toggleFilterSet(setFilterRole)}
                          onFilterClear={() => setFilterRole(new Set())}
                        />
                        {branchFilterOptions.length > 0 && (
                          <TableColHeader
                            label="Sede"
                            sortKey="branch"
                            sortState={sortState}
                            onSort={setSortState}
                            filterOptions={branchFilterOptions}
                            filterSelected={filterBranch}
                            onFilterToggle={toggleFilterSet(setFilterBranch)}
                            onFilterClear={() => setFilterBranch(new Set())}
                          />
                        )}
                        <TableColHeader
                          label={t('team.table.permissions')}
                          sortKey="permissions"
                          sortState={sortState}
                          onSort={setSortState}
                        />
                        <TableColHeader
                          label={t('team.table.activity')}
                          sortKey="activity"
                          sortState={sortState}
                          onSort={setSortState}
                        />
                        <TableColHeader
                          label={t('team.table.lastAccess')}
                          sortKey="lastAccess"
                          sortState={sortState}
                          onSort={setSortState}
                        />
                        <th className="w-20 px-5 py-3.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {isLoading && orderedMembers.length === 0
                        ? Array.from({ length: 4 }).map((_, i) => <TeamRowSkeleton key={i} />)
                        : displayMembers.map((member) => {
                        const token = getRoleToken(member.role);
                        const summary = getPermissionSummary(member.permissions, member.role, currentBusiness?.businessType);
                        return (
                          <tr key={member.user_id} onClick={() => navigate(`/saas/team/${member.user_id}`)} className={`group cursor-pointer border-l-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${token.accentBorder}`}>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar member={member} />
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 group-hover:text-blue-700">{member.fullName}</p>
                                    {member.user_id === user?.user_id && <span className="rounded-full bg-gray-900 px-2 py-1 text-[10px] font-bold text-white">Tú</span>}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                                    <Mail className="w-3 h-3" />
                                    {member.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4"><StatusBadge status={member.status} /></td>
                            <td className="px-5 py-4">
                              <RoleBadge role={member.role} businessType={currentBusiness?.businessType} />
                              <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{member.employment?.department || 'Sin departamento'}</p>
                              {(() => {
                                const ref = String(member.employment?.salesPointId || '').trim();
                                const wc = ref
                                  ? workCentersData.find((w) => String(w._id || w.id || '').trim() === ref)
                                  : null;
                                if (wc?.name) {
                                  return <p className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">{wc.name}</p>;
                                }
                                const role = String(member.role || '').trim();
                                if (role === 'Admin' || role === 'Gerente') {
                                  return <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Admin: puede fichar en cualquier local</p>;
                                }
                                return <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">{hrCopy.memberMissingStoreBadge}</p>;
                              })()}
                            </td>
                            {branchFilterOptions.length > 0 && (
                              <td className="px-5 py-4">
                                {(() => {
                                  const active = (member.employment?.assignments || []).filter(a => a.status === 'active' && (a.type === 'branch' || a.type === 'work_center'));
                                  if (active.length > 0) return <span className="text-xs text-gray-600 dark:text-gray-400">{active.map(a => a.entityName).join(', ')}</span>;
                                  return <span className="text-xs text-gray-300 dark:text-gray-600 italic">Sin asignar</span>;
                                })()}
                              </td>
                            )}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Shield className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                                <span>{summary.totalView} ver · {summary.totalEdit} editar</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">{member.recentActivity?.[0]?.action || 'Sin actividad reciente'}</td>
                            <td className="px-5 py-4 text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(member.lastLoginAt)}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/saas/team/${member.user_id}?tab=clockins`); }} title="Fichajes" className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors">
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/saas/schedules?memberId=${member.user_id}`); }} title="Horarios" className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 transition-colors">
                                  <Calendar className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/saas/team/${member.user_id}`); }} title="Ver perfil" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 transition-colors">
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {isLoading && orderedMembers.length === 0
                    ? Array.from({ length: 3 }).map((_, i) => <TeamCardSkeleton key={i} />)
                    : displayMembers.map((member) => (
                    <div key={member.user_id} onClick={() => navigate(`/saas/team/${member.user_id}`)} className={`cursor-pointer rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 bg-white dark:bg-gray-800 p-4 active:scale-[0.99] ${getRoleToken(member.role).accentBorder}`}>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar member={member} />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{member.fullName}</p>
                              {member.user_id === user?.user_id && <span className="rounded-full bg-gray-900 px-2 py-1 text-[10px] font-bold text-white">Tú</span>}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                              <Mail className="w-3 h-3" />
                              {member.email}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="mt-1 w-4 h-4 text-gray-300 dark:text-gray-600" />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <RoleBadge role={member.role} businessType={currentBusiness?.businessType} />
                          <StatusBadge status={member.status} />
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{formatRelativeTime(member.lastLoginAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {!isLoading && displayMembers.length === 0 && hasActiveFilters && (
                  <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 p-8 text-center">
                    <Search className="mx-auto mb-3 w-8 h-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No se encontraron miembros</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Prueba ajustando la búsqueda o los filtros</p>
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(''); setFilterStatus(new Set()); setFilterRole(new Set()); setFilterBranch(new Set()); setSortState({ key: '', dir: null }); }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Limpiar filtros
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'roles' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Cada función tiene permisos y tareas de «Mi trabajo» que se asignan al invitar.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateRole(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black"
              >
                <Plus className="w-4 h-4" />
                Nueva funcion
              </button>
            </div>
            {roles.map((role) => {
              const roleMembers = orderedMembers.filter((member) => member.role === role.id);
              const taskBundle = getRoleTaskBundle(role.id, currentBusiness?.businessType);
              const accessSummary = formatRoleAccessSummary(
                role.id,
                roles,
                currentBusiness?.businessType,
              );
              return (
                <div key={role.id} className={`rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 border-l-4 ${getRoleToken(role.id).accentBorder}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <RoleBadge role={role.id} businessType={currentBusiness?.businessType} />
                    <span className="text-xs text-gray-400 dark:text-gray-500">{role.users} usuario{role.users !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {taskBundle?.summary || role.description}
                  </p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-600 dark:text-gray-300">Permisos: </span>
                    {accessSummary}
                  </p>
                  {taskBundle?.tasks?.length ? (
                    <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Tareas en Mi trabajo ({taskBundle.tasks.length})
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {taskBundle.tasks.map((task) => (
                          <li key={task.key} className="text-xs text-gray-600 dark:text-gray-300">
                            · {task.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs italic text-gray-400">
                      Sin tareas predefinidas (función personalizada).
                    </p>
                  )}
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Personas con este rol
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {roleMembers.length === 0 && (
                        <span className="text-xs italic text-gray-300 dark:text-gray-600">
                          Sin trabajadores con esta función
                        </span>
                      )}
                      {roleMembers.map((member) => (
                        <button
                          key={member.user_id}
                          type="button"
                          onClick={() => navigate(`/saas/team/${member.user_id}`)}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Avatar member={member} size="sm" />
                          <span className="flex flex-col items-start leading-tight">
                            <span>{member.fullName}</span>
                            <span className="text-[10px] font-normal text-gray-400">
                              {getInviteRoleDisplayLabel(member.role, currentBusiness?.businessType)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isLoading && orderedMembers.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-400 animate-spin" />
            Sincronizando equipo...
          </div>
        )}

        {activeTab === 'activity' && (
          <TeamActivityPanel members={orderedMembers} />
        )}

        {activeTab === 'staff-expenses' && user && (
          <StaffExpensesTab
            members={orderedMembers}
            currentUser={user}
            isAdmin={canManagePayroll(user, businesses)}
          />
        )}

        {activeTab === 'staff-consumptions' && user && (
          <StaffConsumptionsTab
            members={orderedMembers}
            currentUser={user}
          />
        )}

        {activeTab === 'payroll' && user && (
          <PayrollTab
            members={orderedMembers}
            currentUser={user}
            isAdmin={canManagePayroll(user, businesses)}
          />
        )}
      </div>

      {selectedMember && (
        <MemberDrawer
          member={selectedMember}
          members={orderedMembers}
          roles={roles}
          businessType={currentBusiness?.businessType}
          currentUserId={user?.user_id}
          currentBusiness={currentBusiness}
          workCenters={workCentersData}
          onClose={() => setSelectedMemberId(null)}
          onMemberUpdated={handleMemberUpdated}
          onMemberDeleted={handleMemberDeleted}
        />
      )}

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          roles={roles}
          businesses={businesses}
          currentBusinessId={currentBusiness?.business_id}
          workerSeats={workerSeats}
          onInvite={async (payload) => {
            return await handleInvite(payload);
          }}
          onLookupEmail={lookupInviteEmail}
        />
      )}

      {showInviteQr && (
        <WorkerInviteQrModal
          onClose={() => setShowInviteQr(false)}
          business={currentBusiness}
        />
      )}

      {showSeatBillingWarn && workerSeats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSeatBillingWarn(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/40">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-gray-100">
                  {workerSeatBillingWarning(workerSeats)?.title || 'Cupo completo'}
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {workerSeatBillingWarning(workerSeats)?.body
                    || `Llevas ${workerSeats.used}/${workerSeats.limit} plazas. Si invitas a alguien más, te sube la facturación (${formatAddonPriceShort('extra_worker')} por trabajador).`}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowSeatBillingWarn(false)}
                className="rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                Entendido
              </button>
              <VertialBillingUpgradeLink
                to="/saas/settings/facturacion"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Ir a Mi plan
              </VertialBillingUpgradeLink>
            </div>
          </div>
        </div>
      )}

      <CreateRoleModal
        isOpen={showCreateRole}
        onClose={() => setShowCreateRole(false)}
        onCreate={handleCreateRole}
        existingRoleIds={roles.map((role) => role.id)}
        businessType={currentBusiness?.businessType}
      />

      <OrgChartModal
        open={showOrgChart}
        onClose={() => setShowOrgChart(false)}
        businessId={currentBusiness?.business_id || ''}
        members={members}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Miembros del equipo"
        fields={TEAM_IMPORT_FIELDS}
        onImport={async (entries) => {
          let invited = 0;
          for (const entry of entries) {
            try {
              await handleInvite({
                name: entry.name || '',
                email: entry.email || '',
                phone: '',
                role: entry.role || 'employee',
                landingPage: '/saas/worker/tasks',
                position: entry.position || '',
                contractType: '',
                grossMonthlySalary: '',
                workCenterId: '',
              });
              invited++;
            } catch { /* skip */ }
          }
          toast.success(`${invited} miembro(s) importado(s)`);
        }}
      />
    </Layout>
  );
}
