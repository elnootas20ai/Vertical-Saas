import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  DollarSign,
  Download,
  Copy,
  Edit2,
  Eye,
  File,
  Save,
  FileText,
  FolderOpen,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Receipt,
  ScrollText,
  Search,
  Shield,
  ShieldCheck,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Umbrella,
  Upload,
  User,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { formatDateEs } from '../../lib/formatDateEs';
import { formatIbanInput } from '../../lib/employmentBankUtils';
import { computeTotalLaborCost, formatLaborCurrency, computeLaborCostBreakdown, applyLaborCostToEmployment } from '../../lib/laborCost';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import type {
  AuthUser,
  AccountPermissionMatrix,
  EmploymentInfo,
  RoleDefinition,
  WorkerAssignment,
} from '../../lib/authApi';
import { listClockins, formatMinutes, mapsUrlForGeo, clockinPrimaryGeo } from '../../lib/clockinsApi';
import type { ClockinRecord } from '../../lib/clockinsApi';
import {
  getSchedule,
  saveSchedule,
  defaultWeekly,
  getMonday,
  WEEKDAYS,
  WEEKDAY_LABELS,
  computeWeeklyHours,
  computeDayHours,
  computeDayWorkMinutes,
  inferWorkdayFromWeeklyHours,
  firstEnabledShift,
  applyShiftTimesToEnabledDays,
  applyShiftTimesToLaborDays,
  defaultTenMinuteBreak,
  breakEndFromStart,
} from '../../lib/schedulesApi';
import type { ScheduleTemplate, DayShift, Weekday } from '../../lib/schedulesApi';
import { ScheduleTimeField } from '../../components/saas/ScheduleTimeField';
import {
  listVacations,
  getSettings,
  getMemberVacationBalance,
  reviewVacation,
  LEAVE_TYPE_LABELS,
  STATUS_LABELS,
} from '../../lib/vacationsApi';
import type { VacationRequest, VacationSettings } from '../../lib/vacationsApi';
import { listStaffExpensesRequest } from '../../lib/staffExpensesApi';
import type { StaffExpense } from '../../lib/staffExpensesApi';
import {
  listPayrollDocumentsRequest,
  createPayrollDocumentRequest,
  deletePayrollDocumentRequest,
  finalizePayrollDocumentUpload,
  payrollUploadSuccessMessage,
  getDocumentExpiryStatus,
  PAYROLL_DOC_TYPE_LABELS,
  buildPayrollDocumentDisplayName,
  type PayrollDocument,
  type PayrollDocumentType,
} from '../../lib/payrollApi';
import { PayrollDocumentPreviewModal } from '../../components/saas/PayrollDocumentPreviewModal';
import { getVertialAccessPermissionModules } from '../../lib/roleCatalog';
import { getRetailOpsUiCopy } from '../../lib/retailUiCopy';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { getHrLocationCopy } from '../../lib/retailLocationCopy';
import {
  assignPrimaryWorkSite,
  clearPrimaryWorkSite,
  hasExplicitSiteAssignment,
  listActiveSiteAssignments,
} from '../../lib/workerStoreAssignment';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { toast } from 'sonner';

const HR_MANAGER_ROLES = new Set([
  'Admin',
  'Superadmin',
  'Gerente',
  'Administrador',
  'Encargado',
  'Gestor',
]);

const inputClassName =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

type DetailTab = 'info' | 'labor-cost' | 'schedule' | 'clockins' | 'vacations' | 'assignments' | 'permissions' | 'documents' | 'message';

type DocCategory = 'all' | 'payslips' | 'contracts' | 'personal_docs' | 'expenses' | 'other';

const DOC_CATEGORIES: { id: DocCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'Todos', icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'payslips', label: 'Nóminas', icon: <Receipt className="w-4 h-4" /> },
  { id: 'contracts', label: 'Contratos', icon: <ScrollText className="w-4 h-4" /> },
  { id: 'personal_docs', label: 'Documentación', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'expenses', label: 'Gastos', icon: <Receipt className="w-4 h-4" /> },
  { id: 'other', label: 'Otros', icon: <File className="w-4 h-4" /> },
];

function normalizePermissions(
  permissions: AccountPermissionMatrix | undefined,
  businessType?: string | null,
): AccountPermissionMatrix {
  const modules = getVertialAccessPermissionModules(businessType);
  const result: AccountPermissionMatrix = { ...(permissions || {}) };
  for (const mod of modules) {
    const current = permissions?.[mod.key];
    result[mod.key] = {
      view: Boolean(current?.view),
      edit: Boolean(current?.edit),
    };
    if (result[mod.key].edit) result[mod.key].view = true;
  }
  return result;
}

function permissionModuleLabel(key: string, fallback: string, businessType?: string | null): string {
  if (key === 'delivery') return getRetailOpsUiCopy(businessType).permissionDeliveryModule;
  if (key === 'sala') return isRestaurantBusinessType(businessType) ? 'Sala / Mesas' : 'Sala';
  return fallback;
}

function buildEmploymentInfo(emp?: EmploymentInfo): EmploymentInfo {
  return {
    department: emp?.department || '',
    position: emp?.position || '',
    schedule: emp?.schedule || '',
    notes: emp?.notes || '',
    skills: emp?.skills || [],
    startDate: emp?.startDate || '',
    endDate: emp?.endDate || '',
    terminationReason: emp?.terminationReason || '',
    terminationType: emp?.terminationType,
    contractType: emp?.contractType || '',
    workday: emp?.workday || '',
    hoursPerWeek: emp?.hoursPerWeek,
    salary: emp?.salary || '',
    bankAccount: emp?.bankAccount || '',
    bankName: emp?.bankName || '',
    emergencyContact: emp?.emergencyContact || '',
    emergencyPhone: emp?.emergencyPhone || '',
    salesPointId: emp?.salesPointId || '',
    contributionGroup: emp?.contributionGroup || '',
    mutualInsurance: emp?.mutualInsurance || '',
    grossSalary: emp?.grossSalary,
    payPeriodsPerYear: emp?.payPeriodsPerYear,
    socialSecurityCost: emp?.socialSecurityCost,
    employeeSsRate: emp?.employeeSsRate,
    irpfRate: emp?.irpfRate,
    otherCosts: emp?.otherCosts,
    costCurrency: emp?.costCurrency || 'EUR',
    costPeriod: emp?.costPeriod || 'monthly',
    lastCostReview: emp?.lastCostReview || '',
    nextCostReview: emp?.nextCostReview || '',
    baseProductivity: emp?.baseProductivity,
    assignments: emp?.assignments || [],
  };
}

const TERMINATION_LABELS: Record<string, string> = {
  voluntary: 'Baja voluntaria',
  dismissal: 'Despido',
  end_of_contract: 'Fin de contrato',
  mutual_agreement: 'Mutuo acuerdo',
};

function formatCurrency(value: number | undefined, currency = 'EUR'): string {
  if (value == null) return '—';
  return formatLaborCurrency(value, currency);
}

function roundPct(rate: number): string {
  return String(Math.round(Number(rate) * 1000) / 10);
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  indefinido: 'Indefinido',
  temporal: 'Temporal',
  practicas: 'Prácticas',
  formacion: 'Formación',
  autonomo: 'Autónomo',
};

const WORKDAY_LABELS: Record<string, string> = {
  completa: 'Completa',
  parcial: 'Parcial',
  media: 'Media jornada',
  flexible: 'Flexible',
};

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
        active
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {icon}
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
      )}
    </button>
  );
}

// ─── InfoField ────────────────────────────────────────────────────────────────

function InfoField({
  label,
  value,
  monoLarge,
}: {
  label: string;
  value: string | undefined;
  monoLarge?: boolean;
}) {
  const display = monoLarge && value ? formatIbanInput(value) : (value || '—');
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={monoLarge && value ? `break-all font-mono text-sm text-gray-900 dark:text-gray-100` : 'text-sm text-gray-900 dark:text-gray-100'}>
        {display}
      </p>
    </div>
  );
}

// ─── Payroll Upload Modal (from worker profile) ──────────────────────────────

interface PayrollUploadModalProps {
  member: AuthUser;
  currentUser: AuthUser;
  businessId: string;
  initialType?: PayrollDocumentType;
  onClose: () => void;
  onUploaded: (doc: PayrollDocument) => void;
}

function PayrollUploadModal({
  member,
  currentUser,
  businessId,
  initialType = 'nomina',
  onClose,
  onUploaded,
}: PayrollUploadModalProps) {
  const [documentType, setDocumentType] = useState<PayrollDocumentType>(initialType);
  const [name, setName] = useState(() =>
    buildPayrollDocumentDisplayName({
      documentType: initialType,
      workerName: member.fullName,
    }),
  );
  const [period, setPeriod] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function handleFileChange(selected: File | null) {
    if (!selected) return;
    setFile(selected);
    setName(
      buildPayrollDocumentDisplayName({
        documentType,
        workerName: member.fullName,
        period: documentType === 'nomina' ? period : undefined,
        fileName: selected.name,
      }),
    );
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Indica un nombre para el documento.'); return; }
    if (!file) { setError('Adjunta un archivo.'); return; }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const doc = await createPayrollDocumentRequest({
        business_id: businessId,
        worker_id: member.user_id,
        worker_name: member.fullName,
        documentType,
        name: buildPayrollDocumentDisplayName({
          documentType,
          workerName: member.fullName,
          period: documentType === 'nomina' ? period : undefined,
          fileName: file.name,
          customName: name.trim(),
        }),
        period: documentType === 'nomina' ? (period.trim() || undefined) : undefined,
        expiryDate: expiryDate || undefined,
        fileData,
        mimeType: file.type,
        fileName: file.name,
        size: file.size,
        uploadedBy: currentUser.user_id,
        uploadedByName: currentUser.fullName,
      });
      onUploaded(doc);
      void finalizePayrollDocumentUpload(doc);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento.');
    } finally {
      setIsUploading(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              Subir {PAYROLL_DOC_TYPE_LABELS[documentType] || 'documento'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Para {member.fullName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              ¿Qué parte quieres subir?
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
              Elige el tipo y después adjunta el archivo.
            </p>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
              {(Object.entries(PAYROLL_DOC_TYPE_LABELS) as [PayrollDocumentType, string][]).map(([k, v]) => {
                const selected = documentType === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setDocumentType(k);
                      setName(
                        buildPayrollDocumentDisplayName({
                          documentType: k,
                          workerName: member.fullName,
                          period: k === 'nomina' ? period : undefined,
                          fileName: file?.name,
                        }),
                      );
                    }}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          {documentType === 'nomina' ? (
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Período (nómina)</label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            />
          </div>
          ) : null}

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha de caducidad</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            />
            <p className="mt-1 text-[11px] text-gray-400">Opcional. Se activarán alertas 30 días antes.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Nombre del documento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Ej. ${PAYROLL_DOC_TYPE_LABELS[documentType]}`}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400">
              Ahora el PDF de {PAYROLL_DOC_TYPE_LABELS[documentType].toLowerCase()}
            </p>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
              isDragging
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : file
                  ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-1">
                <FileText className="w-6 h-6 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{file.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Arrastra aquí o haz clic para seleccionar</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">PDF, Word, Excel, imagen — máx. 10 MB</p>
              </div>
            )}
          </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <Lock className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 px-5 py-2 text-sm font-semibold text-white dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors disabled:opacity-60"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Subir documento
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TeamMemberDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const { user, listUsers, listRoles, updateUser } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const hrCopy = getHrLocationCopy(currentBusiness?.businessType);
  const { activeWorkCenters, loading: workCentersLoading } = useWorkCenters();
  const lang = (i18n.language?.slice(0, 2) || 'es') as string;

  const [member, setMember] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('info');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'clockins') setActiveTab('clockins');
  }, [searchParams]);

  // Clockins
  const [clockins, setClockins] = useState<ClockinRecord[]>([]);
  const [clockinsLoading, setClockinsLoading] = useState(false);
  const [clockinMonth, setClockinMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Schedule
  const [schedule, setSchedule] = useState<ScheduleTemplate | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editWeekly, setEditWeekly] = useState<Record<Weekday, DayShift>>(() => defaultWeekly());
  /** Franja rápida para unificar varios días (mismo patrón que horario de tienda). */
  const [quickShift, setQuickShift] = useState<Pick<DayShift, 'start' | 'end' | 'breakStart' | 'breakEnd'>>(() => {
    const br = defaultTenMinuteBreak('09:00', '17:00');
    return {
      start: '09:00',
      end: '17:00',
      breakStart: br.breakStart,
      breakEnd: br.breakEnd,
    };
  });
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Vacations
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [vacationSettings, setVacationSettings] = useState<VacationSettings | null>(null);
  const [vacationsLoading, setVacationsLoading] = useState(false);
  const [vacationYear] = useState(() => new Date().getFullYear());

  // Permissions
  const [permissions, setPermissions] = useState<AccountPermissionMatrix>({});
  const [permissionSaving, setPermissionSaving] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignSiteId, setAssignSiteId] = useState('');

  // Documents
  const [docCategory, setDocCategory] = useState<DocCategory>('all');
  const [docSearch, setDocSearch] = useState('');
  const [expenses, setExpenses] = useState<StaffExpense[]>([]);
  const [payrollDocs, setPayrollDocs] = useState<PayrollDocument[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [showPayrollUpload, setShowPayrollUpload] = useState(false);
  const [payrollUploadType, setPayrollUploadType] = useState<PayrollDocumentType>('nomina');
  const [payrollPreviewDoc, setPayrollPreviewDoc] = useState<PayrollDocument | null>(null);
  const openPayrollUpload = (type: PayrollDocumentType = 'nomina') => {
    setPayrollUploadType(type);
    setShowPayrollUpload(true);
  };
  const [payrollDeleting, setPayrollDeleting] = useState<string | null>(null);
  const [editingHr, setEditingHr] = useState(false);
  const [hrForm, setHrForm] = useState<EmploymentInfo>(() => buildEmploymentInfo());
  const [savingHr, setSavingHr] = useState(false);

  const canManageHr = HR_MANAGER_ROLES.has(String(user?.role || ''));
  // ─── Load member ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([listUsers(currentBusiness?.business_id), listRoles()])
      .then(([users, roleList]) => {
        const found = users.find((u) => u.user_id === userId);
        setMember(found || null);
        setRoles(roleList);
        if (found) {
          setPermissions(normalizePermissions(found.permissions, currentBusiness?.businessType));
          setAssignSiteId(String(found.employment?.salesPointId || '').trim());
        }
      })
      .finally(() => setLoading(false));
  }, [userId, currentBusiness?.business_id]);

  useEffect(() => {
    if (!member) return;
    setHrForm(buildEmploymentInfo(member.employment));
    setAssignSiteId(String(member.employment?.salesPointId || '').trim());
    setEditingHr(false);
  }, [member]);

  const handleSaveHr = async () => {
    if (!member) return;
    setSavingHr(true);
    try {
      const employment = applyLaborCostToEmployment(buildEmploymentInfo({
        ...member.employment,
        ...hrForm,
        startDate: hrForm.startDate,
        contributionGroup: hrForm.contributionGroup?.trim() || '',
        mutualInsurance: hrForm.mutualInsurance?.trim() || '',
        contractType: hrForm.contractType,
        workday: hrForm.workday,
        hoursPerWeek:
          hrForm.hoursPerWeek != null && Number(hrForm.hoursPerWeek) > 0
            ? Number(hrForm.hoursPerWeek)
            : undefined,
        salary: hrForm.salary?.trim() || '',
        department: hrForm.department?.trim() || '',
        position: hrForm.position?.trim() || '',
        schedule: hrForm.schedule?.trim() || '',
        irpfRate: hrForm.irpfRate != null && Number(hrForm.irpfRate) >= 0
          ? Number(hrForm.irpfRate)
          : undefined,
        employeeSsRate: hrForm.employeeSsRate != null && Number(hrForm.employeeSsRate) >= 0
          ? Number(hrForm.employeeSsRate)
          : undefined,
      }));
      const result = await updateUser(member.user_id, { employment });
      if (!result.success || !result.user) {
        toast.error(result.error || 'No se pudo guardar el alta laboral');
        return;
      }
      setMember(result.user);
      setHrForm(buildEmploymentInfo(result.user.employment));
      setEditingHr(false);
      toast.success('Alta laboral guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSavingHr(false);
    }
  };

  // ─── Load tab data ──────────────────────────────────────────────────────────

  const loadClockins = useCallback(async () => {
    if (!businessId || !userId) return;
    setClockinsLoading(true);
    try {
      const all = await listClockins(businessId, { memberId: userId, recordsOnly: true });
      setClockins(all.filter((c) => c.date.startsWith(clockinMonth)));
    } catch {
      setClockins([]);
    } finally {
      setClockinsLoading(false);
    }
  }, [businessId, userId, clockinMonth]);

  const loadSchedule = useCallback(async () => {
    if (!businessId || !userId) return;
    setScheduleLoading(true);
    try {
      const s = await getSchedule(businessId, userId);
      setSchedule(s);
      if (s?.weekly) setEditWeekly(s.weekly);
    } catch {
      setSchedule(null);
    } finally {
      setScheduleLoading(false);
    }
  }, [businessId, userId]);

  const startEditSchedule = () => {
    const weekly = schedule?.weekly || defaultWeekly();
    setEditWeekly(weekly);
    const seed = firstEnabledShift(weekly);
    const looksLikeNoBreak =
      !seed.breakStart
      || !seed.breakEnd
      || seed.breakStart === seed.breakEnd
      || (seed.breakStart === '00:00' && seed.breakEnd === '00:00');
    const br = looksLikeNoBreak
      ? defaultTenMinuteBreak(seed.start, seed.end)
      : { breakStart: seed.breakStart, breakEnd: seed.breakEnd };
    setQuickShift({
      start: seed.start,
      end: seed.end,
      breakStart: br.breakStart,
      breakEnd: br.breakEnd,
    });
    setEditingSchedule(true);
  };

  const updateEditDay = (day: Weekday, field: keyof DayShift, value: string | boolean) => {
    setEditWeekly((prev) => {
      const current = prev[day];
      const nextDay: DayShift = { ...current, [field]: value };
      if (field === 'breakStart') {
        nextDay.breakEnd = breakEndFromStart(String(value));
      } else if (field === 'enabled' && value === true) {
        const br = defaultTenMinuteBreak(nextDay.start, nextDay.end);
        nextDay.breakStart = br.breakStart;
        nextDay.breakEnd = br.breakEnd;
      }
      return { ...prev, [day]: nextDay };
    });
  };

  const updateQuickShift = (
    field: 'start' | 'end' | 'breakStart' | 'breakEnd',
    value: string,
  ) => {
    setQuickShift((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'start' || field === 'end') {
        const br = defaultTenMinuteBreak(
          field === 'start' ? value : next.start,
          field === 'end' ? value : next.end,
        );
        next.breakStart = br.breakStart;
        next.breakEnd = br.breakEnd;
      } else if (field === 'breakStart') {
        next.breakEnd = breakEndFromStart(value);
      }
      return next;
    });
  };

  const applyQuickToEnabledDays = () => {
    const enabledCount = WEEKDAYS.filter((d) => editWeekly[d]?.enabled).length;
    if (enabledCount === 0) {
      toast.error('Marca al menos un día como laborable');
      return;
    }
    setEditWeekly((prev) => applyShiftTimesToEnabledDays(prev, quickShift));
    toast.success(`Horario copiado a ${enabledCount} día${enabledCount === 1 ? '' : 's'} activo${enabledCount === 1 ? '' : 's'}`);
  };

  const applyQuickToLaborDays = () => {
    setEditWeekly((prev) => applyShiftTimesToLaborDays(prev, quickShift));
    toast.success('Lunes a viernes con el mismo horario');
  };

  const handleSaveSchedule = async () => {
    if (!businessId || !userId || !member) return;
    setSavingSchedule(true);
    try {
      const weekStart = schedule?.week_start || getMonday();
      const saved = await saveSchedule(
        businessId,
        userId,
        member.fullName || member.email || userId,
        editWeekly,
        schedule && schedule.week_start === weekStart ? schedule : null,
        schedule?.template_id,
        weekStart,
        schedule?.work_center_id,
        schedule?.work_center_name,
      );
      setSchedule(saved);
      setEditingSchedule(false);

      // Vacaciones/jornada: horas salen del horario, no hay que rellenar a mano.
      const hours = computeWeeklyHours(editWeekly);
      if (hours > 0 && canManageHr) {
        const workday = inferWorkdayFromWeeklyHours(hours);
        const result = await updateUser(userId, {
          employment: applyLaborCostToEmployment(
            buildEmploymentInfo({
              ...member.employment,
              hoursPerWeek: hours,
              workday: workday || member.employment?.workday || '',
            }),
          ),
        } as any);
        if (result.success && result.user) {
          setMember(result.user as AuthUser);
          setHrForm(buildEmploymentInfo(result.user.employment));
        }
      }
      toast.success(`Horario guardado · ${hours.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h/sem`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el horario');
    } finally {
      setSavingSchedule(false);
    }
  };

  const loadVacations = useCallback(async () => {
    if (!businessId || !userId) return;
    setVacationsLoading(true);
    try {
      const [reqs, settings] = await Promise.all([
        listVacations(businessId, { memberId: userId }),
        getSettings(businessId),
      ]);
      setVacations(reqs);
      setVacationSettings(settings);
    } catch {
      setVacations([]);
    } finally {
      setVacationsLoading(false);
    }
  }, [businessId, userId]);

  const loadExpenses = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await listStaffExpensesRequest(userId);
      setExpenses(list);
    } catch {
      setExpenses([]);
    }
  }, [userId]);

  const loadPayrollDocs = useCallback(async () => {
    if (!userId) return;
    setPayrollLoading(true);
    try {
      const docs = await listPayrollDocumentsRequest({
        businessId,
        workerId: userId,
      });
      setPayrollDocs(docs);
    } catch {
      setPayrollDocs([]);
    } finally {
      setPayrollLoading(false);
    }
  }, [businessId, userId]);

  // Load all data on mount for summary cards, then reload on tab switch
  useEffect(() => {
    if (businessId && userId) {
      loadClockins();
      loadSchedule();
      loadVacations();
      loadPayrollDocs();
      loadExpenses();
    }
  }, [businessId, userId]);

  useEffect(() => {
    if (activeTab === 'clockins') loadClockins();
  }, [activeTab, loadClockins]);

  useEffect(() => {
    if (activeTab === 'schedule') loadSchedule();
  }, [activeTab, loadSchedule]);

  useEffect(() => {
    if (activeTab === 'vacations') loadVacations();
  }, [activeTab, loadVacations]);

  useEffect(() => {
    if (activeTab === 'documents') {
      loadExpenses();
      loadPayrollDocs();
    }
  }, [activeTab, loadExpenses, loadPayrollDocs]);

  // ─── Site assignment (fichaje / TPV) ───────────────────────────────────────

  const handleAssignWorkSite = async () => {
    if (!member || !canManageHr) return;
    const siteId = String(assignSiteId || '').trim();
    if (!siteId) {
      toast.error('Elige un sitio para asignar');
      return;
    }
    const wc = activeWorkCenters.find(
      (w) => String(w._id || w.id || '').trim() === siteId,
    );
    setAssignmentSaving(true);
    try {
      const employment = assignPrimaryWorkSite(member.employment, {
        id: siteId,
        name: wc?.name || siteId,
      });
      const result = await updateUser(member.user_id, { employment });
      if (!result.success || !result.user) {
        toast.error(result.error || 'No se pudo asignar el sitio');
        return;
      }
      setMember(result.user);
      toast.success('Sitio asignado. El trabajador ya puede fichar ahí.');
    } catch {
      toast.error('Error al asignar sitio');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleClearWorkSite = async () => {
    if (!member || !canManageHr) return;
    setAssignmentSaving(true);
    try {
      const employment = clearPrimaryWorkSite(member.employment);
      const result = await updateUser(member.user_id, { employment });
      if (!result.success || !result.user) {
        toast.error(result.error || 'No se pudo quitar la asignación');
        return;
      }
      setMember(result.user);
      setAssignSiteId('');
      toast.success('Asignación quitada. El fichaje sigue siendo posible sin sitio.');
    } catch {
      toast.error('Error al quitar asignación');
    } finally {
      setAssignmentSaving(false);
    }
  };

  // ─── Permissions handler ──────────────────────────────────────────────────

  const handlePermissionToggle = async (moduleKey: string, field: 'view' | 'edit') => {
    if (!member) return;
    const next = normalizePermissions(
      { ...(member.permissions || {}), ...permissions },
      currentBusiness?.businessType,
    );
    const current = next[moduleKey]?.[field] || false;
    next[moduleKey] = {
      view: next[moduleKey]?.view || false,
      edit: next[moduleKey]?.edit || false,
    };
    next[moduleKey][field] = !current;
    if (field === 'edit' && next[moduleKey].edit) next[moduleKey].view = true;
    if (field === 'view' && !next[moduleKey].view) next[moduleKey].edit = false;

    setPermissions(next);
    setPermissionSaving(`${moduleKey}:${field}`);
    try {
      const result = await updateUser(member.user_id, { permissions: next });
      if (result.success && result.user) {
        setMember(result.user);
        setPermissions(normalizePermissions(result.user.permissions, currentBusiness?.businessType));
        toast.success('Permisos actualizados');
      }
    } catch {
      toast.error('Error al guardar permisos');
    } finally {
      setPermissionSaving('');
    }
  };

  // ─── Vacation review handler ──────────────────────────────────────────────

  const handleVacationReview = async (req: VacationRequest, decision: 'approved' | 'rejected') => {
    if (!user) return;
    try {
      const updated = await reviewVacation(req, decision, user.user_id, user.fullName);
      setVacations((prev) => prev.map((v) => (v._id === updated._id ? updated : v)));
      toast.success(decision === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada');
    } catch {
      toast.error('Error al procesar solicitud');
    }
  };

  // ─── Computed vacation data ─────────────────────────────────────────────────

  const vacationSummary = useMemo(() => {
    if (!vacationSettings || !userId || !member) {
      return { allowed: 0, used: 0, pending: 0, remaining: 0, requestable: 0 };
    }
    const bal = getMemberVacationBalance(vacationSettings, vacations, userId, {
      startDate: member.employment?.startDate || '',
      endDate: member.employment?.endDate || '',
      year: vacationYear,
      hoursPerWeek: member.employment?.hoursPerWeek,
      workday: member.employment?.workday,
      scheduleWeeklyHours: schedule ? computeWeeklyHours(schedule.weekly) : undefined,
    });
    return {
      allowed: bal.accrued,
      used: bal.used,
      pending: bal.pending,
      remaining: bal.remaining,
      requestable: bal.requestable,
    };
  }, [vacationSettings, vacations, userId, vacationYear, member, schedule]);

  // ─── Clockin summary ───────────────────────────────────────────────────────

  const clockinSummary = useMemo(() => {
    const totalMinutes = clockins.reduce((sum, c) => sum + c.totalMinutes, 0);
    const totalSessions = clockins.length;
    const completedSessions = clockins.filter((c) => c.status === 'completed').length;
    return { totalMinutes, totalSessions, completedSessions };
  }, [clockins]);

  // ─── Weekday labels ─────────────────────────────────────────────────────────

  const weekdayLabels = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.es;
  const leaveLabels = LEAVE_TYPE_LABELS[lang] || LEAVE_TYPE_LABELS.es;
  const statusLabels = STATUS_LABELS[lang] || STATUS_LABELS.es;

  // ─── Loading / Not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout title="Cargando..." subtitle="">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </Layout>
    );
  }

  if (!member) {
    return (
      <Layout title="Trabajador no encontrado" subtitle="">
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No se encontró el trabajador solicitado.</p>
          <button
            onClick={() => navigate('/saas/team')}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al equipo
          </button>
        </div>
      </Layout>
    );
  }

  const emp = buildEmploymentInfo(member.employment);
  const laborBreakdown = computeLaborCostBreakdown(emp);

  return (
    <Layout title={member.fullName} subtitle={emp.position || member.role || 'Trabajador'}>
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white via-white to-gray-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900 p-5">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate('/saas/team')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-xl shadow-lg shadow-blue-500/20">
                {member.avatar ? (
                  <img src={member.avatar} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                ) : (
                  (member.fullName || '?').charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{member.fullName}</h2>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    member.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : member.status === 'pending'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  }`}>
                    {member.status === 'active' ? 'Activo' : member.status === 'pending' ? 'Pendiente' : 'Inactivo'}
                  </span>
                  <span className="flex-shrink-0 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
                    {member.role || 'Usuario'}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{member.email}</span>
                  {member.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{member.phone}</span>}
                  {emp.position && <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{emp.position}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button type="button" onClick={() => setActiveTab('clockins')} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5 text-gray-500 hover:text-blue-600 hover:border-blue-300 dark:hover:border-blue-700 transition-colors" title="Ver fichajes">
                  <Clock className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => navigate(`/saas/schedules?memberId=${userId}`)} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5 text-gray-500 hover:text-emerald-600 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors" title="Ver horarios">
                  <CalendarDays className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors" onClick={() => setActiveTab('clockins')}>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Horas mes</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{clockinSummary.totalMinutes > 0 ? formatMinutes(clockinSummary.totalMinutes) : '—'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors" onClick={() => setActiveTab('vacations')}>
            <div className="flex items-center gap-2 mb-1">
              <Umbrella className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Vacaciones</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{vacationSummary.requestable > 0 ? `${vacationSummary.requestable}d` : '0d'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 transition-colors" onClick={() => setActiveTab('labor-cost')}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Coste</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{emp.grossSalary ? formatCurrency(computeTotalLaborCost(emp)) : '—'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 transition-colors" onClick={() => setActiveTab('documents')}>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Docs</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{payrollDocs.length || '—'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 cursor-pointer hover:border-rose-300 dark:hover:border-rose-700 transition-colors" onClick={() => setActiveTab('assignments')}>
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Asignaciones</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {hasExplicitSiteAssignment(emp) || listActiveSiteAssignments(emp.assignments).length > 0
                ? Math.max(
                    listActiveSiteAssignments(emp.assignments).length,
                    hasExplicitSiteAssignment(emp) ? 1 : 0,
                  )
                : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 cursor-pointer hover:border-cyan-300 dark:hover:border-cyan-700 transition-colors" onClick={() => setActiveTab('schedule')}>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Horario</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{schedule ? `${computeWeeklyHours(schedule.weekly)}h` : '—'}</p>
          </div>
        </div>

        {/* Document expiry alerts */}
        {payrollDocs.some(d => {
          const s = getDocumentExpiryStatus(d);
          return s === 'expired' || s === 'expiring';
        }) && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Documentos requieren atención</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {payrollDocs.filter(d => getDocumentExpiryStatus(d) === 'expired').map(d => (
                    <span key={d._id} className="inline-flex items-center gap-1 rounded-lg bg-red-100 dark:bg-red-900/30 px-2 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
                      <X className="w-3 h-3" /> {d.name} — caducado
                    </span>
                  ))}
                  {payrollDocs.filter(d => getDocumentExpiryStatus(d) === 'expiring').map(d => (
                    <span key={d._id} className="inline-flex items-center gap-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-3 h-3" /> {d.name} — próximo a caducar
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <TabButton active={activeTab === 'info'} onClick={() => setActiveTab('info')} icon={<User className="w-4 h-4" />} label="Información" />
          <TabButton active={activeTab === 'labor-cost'} onClick={() => setActiveTab('labor-cost')} icon={<DollarSign className="w-4 h-4" />} label="Coste laboral" />
          <TabButton active={activeTab === 'assignments'} onClick={() => setActiveTab('assignments')} icon={<MapPin className="w-4 h-4" />} label="Asignaciones" />
          <TabButton active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon={<CalendarDays className="w-4 h-4" />} label="Horarios" />
          <TabButton active={activeTab === 'clockins'} onClick={() => setActiveTab('clockins')} icon={<Clock className="w-4 h-4" />} label="Fichajes" />
          <TabButton active={activeTab === 'vacations'} onClick={() => setActiveTab('vacations')} icon={<Umbrella className="w-4 h-4" />} label="Vacaciones" />
          <TabButton active={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')} icon={<Shield className="w-4 h-4" />} label="Permisos" />
          <TabButton active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={<FileText className="w-4 h-4" />} label="Documentos" />
          <TabButton active={activeTab === 'message'} onClick={() => setActiveTab('message')} icon={<MessageSquare className="w-4 h-4" />} label="Mensaje" />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            INFORMACIÓN
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            {/* Datos personales */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                Datos personales
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Nombre completo" value={member.fullName} />
                <InfoField label="Email" value={member.email} />
                <InfoField label="Teléfono" value={member.phone} />
                {emp.emergencyContact?.trim() ? (
                  <InfoField label="Contacto de emergencia" value={emp.emergencyContact} />
                ) : null}
                {emp.emergencyPhone?.trim() ? (
                  <InfoField label="Teléfono de emergencia" value={emp.emergencyPhone} />
                ) : null}
                <InfoField label="Fecha de registro" value={member.createdAt ? formatDateEs(member.createdAt) : undefined} />
              </div>
            </div>

            {/* Alta laboral — RRHH / gestoría (editable) */}
            <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-800 p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-violet-500" />
                  Alta laboral (RRHH / gestoría)
                </h3>
                {canManageHr && !editingHr && (
                  <button
                    type="button"
                    onClick={() => setEditingHr(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-200 dark:hover:bg-violet-900/50"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar alta laboral
                  </button>
                )}
              </div>

              {!canManageHr && (
                <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                  Solo Admin o Gerente puede completar el alta. Los datos bancarios los rellena el trabajador en su ficha.
                </p>
              )}

              {editingHr && canManageHr ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-violet-800 dark:text-violet-300">
                        Fecha de alta *
                      </label>
                      <input
                        type="date"
                        className={inputClassName}
                        value={hrForm.startDate?.slice(0, 10) || ''}
                        onChange={(e) => setHrForm((prev) => ({ ...prev, startDate: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-violet-800 dark:text-violet-300">
                        Grupo de cotización *
                      </label>
                      <input
                        className={inputClassName}
                        value={hrForm.contributionGroup || ''}
                        onChange={(e) => setHrForm((prev) => ({ ...prev, contributionGroup: e.target.value }))}
                        placeholder="Ej: 05"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-violet-800 dark:text-violet-300">
                        Mutua *
                      </label>
                      <input
                        className={inputClassName}
                        value={hrForm.mutualInsurance || ''}
                        onChange={(e) => setHrForm((prev) => ({ ...prev, mutualInsurance: e.target.value }))}
                        placeholder="Nombre de la mutua"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Departamento</label>
                      <input
                        className={inputClassName}
                        value={hrForm.department || ''}
                        onChange={(e) => setHrForm((prev) => ({ ...prev, department: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Cargo / Posición</label>
                      <input
                        className={inputClassName}
                        value={hrForm.position || ''}
                        onChange={(e) => setHrForm((prev) => ({ ...prev, position: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Tipo de contrato</label>
                      <select
                        className={inputClassName}
                        value={hrForm.contractType || ''}
                        onChange={(e) => setHrForm((prev) => ({ ...prev, contractType: e.target.value }))}
                      >
                        <option value="">Sin especificar</option>
                        <option value="indefinido">Indefinido</option>
                        <option value="temporal">Temporal</option>
                        <option value="practicas">Prácticas</option>
                        <option value="formacion">Formación</option>
                        <option value="autonomo">Autónomo</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Jornada</label>
                      <select
                        className={inputClassName}
                        value={hrForm.workday || ''}
                        onChange={(e) => {
                          const workday = e.target.value;
                          setHrForm((prev) => {
                            const next = { ...prev, workday };
                            // Prefill horas si aún no hay valor (vacaciones se prorratean con esto).
                            if (prev.hoursPerWeek == null || !(Number(prev.hoursPerWeek) > 0)) {
                              if (workday === 'completa') next.hoursPerWeek = 40;
                              else if (workday === 'media' || workday === 'parcial') next.hoursPerWeek = 20;
                            }
                            return next;
                          });
                        }}
                      >
                        <option value="">Sin especificar</option>
                        <option value="completa">Completa (40 h)</option>
                        <option value="parcial">Parcial</option>
                        <option value="media">Media jornada (20 h)</option>
                        <option value="flexible">Flexible</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">
                        Horas / semana
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        step={0.5}
                        className={inputClassName}
                        value={hrForm.hoursPerWeek != null ? hrForm.hoursPerWeek : ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setHrForm((prev) => ({
                            ...prev,
                            hoursPerWeek: raw === '' ? undefined : Number(raw),
                          }));
                        }}
                        placeholder="Ej: 40 o 20"
                      />
                      <p className="mt-1 text-[11px] text-gray-400">
                        Se rellena solo con el horario de la invitación / pestaña Horarios
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Salario bruto anual</label>
                      <input
                        className={inputClassName}
                        value={hrForm.salary || ''}
                        onChange={(e) => setHrForm((prev) => ({ ...prev, salary: e.target.value }))}
                        placeholder="Ej: 28.000 €"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">IRPF % (estimado)</label>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={0.5}
                        className={inputClassName}
                        value={hrForm.irpfRate != null ? roundPct(hrForm.irpfRate) : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setHrForm((prev) => ({
                            ...prev,
                            irpfRate: v === '' ? undefined : Number(v) / 100,
                          }));
                        }}
                        placeholder="15"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">SS trabajador % (estimado)</label>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.1}
                        className={inputClassName}
                        value={hrForm.employeeSsRate != null ? roundPct(hrForm.employeeSsRate) : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setHrForm((prev) => ({
                            ...prev,
                            employeeSsRate: v === '' ? undefined : Number(v) / 100,
                          }));
                        }}
                        placeholder="6.35"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">Horario</label>
                      <input
                        className={inputClassName}
                        value={hrForm.schedule || ''}
                        onChange={(e) => setHrForm((prev) => ({ ...prev, schedule: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={savingHr}
                      onClick={() => void handleSaveHr()}
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                    >
                      {savingHr ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Guardar alta laboral
                    </button>
                    <button
                      type="button"
                      disabled={savingHr}
                      onClick={() => {
                        setHrForm(buildEmploymentInfo(member.employment));
                        setEditingHr(false);
                      }}
                      className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <InfoField label="Rol" value={member.role} />
                  <InfoField label="Fecha de alta" value={emp.startDate ? formatDateEs(emp.startDate) : undefined} />
                  <InfoField label="Grupo de cotización" value={emp.contributionGroup} />
                  <InfoField label="Mutua" value={emp.mutualInsurance} />
                  <InfoField label="Departamento" value={emp.department} />
                  <InfoField label="Cargo / Posición" value={emp.position} />
                  <InfoField label="Tipo de contrato" value={emp.contractType ? CONTRACT_TYPE_LABELS[emp.contractType] || emp.contractType : undefined} />
                  <InfoField label="Jornada" value={emp.workday ? WORKDAY_LABELS[emp.workday] || emp.workday : undefined} />
                  <InfoField
                    label="Horas / semana"
                    value={
                      emp.hoursPerWeek != null && Number(emp.hoursPerWeek) > 0
                        ? `${Number(emp.hoursPerWeek).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`
                        : undefined
                    }
                  />
                  <InfoField label="Salario bruto anual" value={emp.salary} />
                  <InfoField label="Horario" value={emp.schedule} />
                  {emp.notes && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <InfoField label="Notas" value={emp.notes} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Datos del trabajador (nómina — rellena el empleado) */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-500" />
                Datos de nómina (trabajador)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Cuenta bancaria (IBAN)" value={emp.bankAccount} monoLarge />
                <InfoField label="Banco" value={emp.bankName} />
                <InfoField label="Último acceso" value={member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString('es-ES') : undefined} />
              </div>
            </div>

            {/* Baja laboral / estado */}
            {member.status === 'inactive' && emp.endDate && (
              <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6">
                <h3 className="text-sm font-bold text-red-800 dark:text-red-200 mb-4 flex items-center gap-2">
                  <UserMinus className="w-4 h-4 text-red-500" />
                  Información de baja
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <InfoField label="Fecha de baja" value={formatDateEs(emp.endDate)} />
                  <InfoField label="Tipo de baja" value={emp.terminationType ? TERMINATION_LABELS[emp.terminationType] || emp.terminationType : undefined} />
                  <InfoField label="Motivo" value={emp.terminationReason} />
                </div>
              </div>
            )}

            {/* Acciones de alta/baja */}
            {(user?.role === 'Admin' || user?.role === 'Superadmin') && member.user_id !== user?.user_id && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-gray-500" />
                  Gestión del estado laboral
                </h3>
                <div className="flex flex-wrap gap-3">
                  {member.status !== 'inactive' ? (
                    <button
                      type="button"
                      onClick={() => {
                        const reason = prompt('Motivo de la baja:');
                        if (reason === null) return;
                        const endDate = new Date().toISOString().slice(0, 10);
                        updateUser(member.user_id, {
                          status: 'inactive' as AuthUser['status'],
                          employment: {
                            ...buildEmploymentInfo(member.employment),
                            endDate,
                            terminationReason: reason,
                            terminationType: 'voluntary',
                          },
                        }).then(result => {
                          if (result.success && result.user) {
                            setMember(result.user);
                            toast.success('Trabajador dado de baja');
                          }
                        }).catch(() => toast.error('Error al dar de baja'));
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    >
                      <UserMinus className="w-4 h-4" />
                      Dar de baja
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        updateUser(member.user_id, {
                          status: 'active' as AuthUser['status'],
                          employment: {
                            ...buildEmploymentInfo(member.employment),
                            endDate: '',
                            terminationReason: '',
                            terminationType: undefined,
                          },
                        }).then(result => {
                          if (result.success && result.user) {
                            setMember(result.user);
                            toast.success('Trabajador reactivado');
                          }
                        }).catch(() => toast.error('Error al reactivar'));
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      Reactivar trabajador
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            COSTE LABORAL
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'labor-cost' && (
          <div className="space-y-6">
            {/* Cost summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Bruto nómina</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(emp.grossSalary)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {laborBreakdown
                    ? `${laborBreakdown.payPeriodsPerYear} pagas/año${laborBreakdown.extraPayCount > 0 ? ` (${laborBreakdown.extraPayCount} extras)` : ''}`
                    : 'por nómina'}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Bruto medio/mes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {formatCurrency(laborBreakdown?.monthlyAverageGross ?? emp.grossSalary)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Con pagas extras repartidas</p>
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Seg. Social empresa/mes</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{formatCurrency(emp.socialSecurityCost)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {laborBreakdown ? `${(laborBreakdown.employerRate * 100).toFixed(1)}% sobre base (media con extras)` : ''}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 border-l-4 border-l-emerald-500 bg-white dark:bg-gray-800 p-5">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Coste total empresa/mes</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{formatCurrency(computeTotalLaborCost(emp))}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {laborBreakdown ? `Anual bruto: ${formatCurrency(laborBreakdown.annualGross)}` : 'mensual'}
                </p>
              </div>
            </div>

            {laborBreakdown && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase">SS trabajador/mes</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {formatCurrency(laborBreakdown.employeeSocialSecurity)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{(laborBreakdown.employeeSsRate * 100).toFixed(2)}%</p>
                </div>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase">IRPF estimado/mes</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {formatCurrency(laborBreakdown.irpfWithholding)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{(laborBreakdown.irpfRate * 100).toFixed(1)}%</p>
                </div>
                <div className="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-5">
                  <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase">Neto estimado/mes</p>
                  <p className="text-xl font-bold text-sky-700 dark:text-sky-300 mt-1">
                    {formatCurrency(laborBreakdown.estimatedNetMonthly)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Orientativo; no es nómina oficial</p>
                </div>
              </div>
            )}

            {/* Cost review status */}
            {emp.nextCostReview && new Date(emp.nextCostReview) < new Date() && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Revisión de coste pendiente</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">La próxima revisión estaba prevista para el {formatDateEs(emp.nextCostReview)}</p>
                </div>
              </div>
            )}

            {/* Cost details */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-purple-500" />
                Detalle de coste laboral
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Salario bruto (texto)" value={emp.salary} />
                <InfoField label="Tipo de contrato" value={emp.contractType ? CONTRACT_TYPE_LABELS[emp.contractType] || emp.contractType : undefined} />
                <InfoField label="Pagas al año" value={laborBreakdown ? String(laborBreakdown.payPeriodsPerYear) : undefined} />
                <InfoField label="Bruto anual" value={laborBreakdown ? formatCurrency(laborBreakdown.annualGross) : undefined} />
                <InfoField label="Próxima revisión" value={emp.nextCostReview ? formatDateEs(emp.nextCostReview) : undefined} />
                <InfoField label="Moneda" value={emp.costCurrency || 'EUR'} />
              </div>
            </div>

            {/* Productivity */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-500" />
                Productividad base
              </h3>
              {emp.baseProductivity ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <InfoField label="Tipo" value={emp.baseProductivity.type === 'hours' ? 'Horas' : emp.baseProductivity.type === 'units' ? 'Unidades' : emp.baseProductivity.type === 'revenue' ? 'Facturación' : 'Personalizado'} />
                    <InfoField label="Objetivo" value={`${emp.baseProductivity.target} ${emp.baseProductivity.unit}`} />
                    <InfoField label="Período" value={emp.baseProductivity.period === 'daily' ? 'Diario' : emp.baseProductivity.period === 'weekly' ? 'Semanal' : 'Mensual'} />
                  </div>
                  {emp.baseProductivity.type === 'hours' && clockinSummary.totalMinutes > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500">Cumplimiento este mes</span>
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                          {Math.round((clockinSummary.totalMinutes / 60) / emp.baseProductivity.target * 100)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                          style={{ width: `${Math.min(100, Math.round((clockinSummary.totalMinutes / 60) / emp.baseProductivity.target * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Target className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="font-medium">Sin productividad base definida</p>
                  <p className="text-sm mt-1">Define un objetivo de productividad para medir el rendimiento.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            ASIGNACIONES
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'assignments' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-500" />
                  Asignaciones del trabajador
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-xl">
                  Envía a este trabajador a un sitio para fichar y TPV. No es obligatorio: sin sitio también puede fichar.
                </p>
              </div>
            </div>

            {canManageHr ? (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {hrCopy.memberStoreLabel}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hrCopy.memberStoreHint}</p>
                </div>
                {workCentersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando sitios…
                  </div>
                ) : activeWorkCenters.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                    {hrCopy.inviteNoWorkCenters}
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <label className="flex-1 block text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Sitio
                      <select
                        value={assignSiteId}
                        onChange={(e) => setAssignSiteId(e.target.value)}
                        className={`${inputClassName} mt-1.5`}
                      >
                        <option value="">{hrCopy.memberStoreEmpty}</option>
                        {activeWorkCenters.map((wc) => {
                          const id = String(wc._id || wc.id || '').trim();
                          return (
                            <option key={id} value={id}>
                              {wc.name}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={assignmentSaving || !assignSiteId}
                        onClick={() => void handleAssignWorkSite()}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {assignmentSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                        Asignar sitio
                      </button>
                      {hasExplicitSiteAssignment(emp) ? (
                        <button
                          type="button"
                          disabled={assignmentSaving}
                          onClick={() => void handleClearWorkSite()}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {(() => {
              const activeAssignments = listActiveSiteAssignments(emp.assignments);
              const endedAssignments = (emp.assignments || []).filter((a) => a.status === 'ended');
              const salesOnly =
                hasExplicitSiteAssignment(emp)
                && activeAssignments.length === 0
                && String(emp.salesPointId || '').trim();
              const salesName =
                activeWorkCenters.find(
                  (w) => String(w._id || w.id || '').trim() === String(emp.salesPointId || '').trim(),
                )?.name || String(emp.salesPointId || '');

              return (
                <>
                  {activeAssignments.length === 0 && !salesOnly ? (
                    <div className="rounded-2xl border border-stone-200 dark:border-stone-700 border-dashed bg-stone-50/80 dark:bg-stone-900/40 p-8 text-center">
                      <MapPin className="w-10 h-10 mx-auto mb-3 text-stone-300 dark:text-stone-600" />
                      <p className="font-medium text-stone-800 dark:text-stone-200">Sin sitio asignado</p>
                      <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                        Opcional. Cuando lo actives, el trabajador lo verá en su app para fichar.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {salesOnly ? (
                        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                              <MapPin className="w-5 h-5 text-emerald-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{salesName}</p>
                              <p className="text-[11px] text-gray-400">Sitio de fichaje / TPV · Principal</p>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Activa
                          </span>
                        </div>
                      ) : null}
                      {activeAssignments.map((a) => (
                        <div key={a.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                              a.type === 'branch' ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-emerald-50 dark:bg-emerald-900/30'
                            }`}>
                              {a.type === 'branch'
                                ? <Building2 className="w-5 h-5 text-blue-500" />
                                : <MapPin className="w-5 h-5 text-emerald-500" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{a.entityName}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                  {a.type === 'branch' ? 'Sede' : 'Centro de trabajo'} · Fichaje / TPV
                                </span>
                                <span className="text-[11px] text-gray-400">·</span>
                                <span className="text-[11px] text-gray-400">Desde {formatDateEs(a.startDate)}</span>
                                {a.isPrimary ? (
                                  <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                    Principal
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Activa
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {endedAssignments.length > 0 && (
                    <div className="mt-2">
                      <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">Historial</h4>
                      <div className="space-y-2">
                        {endedAssignments.map((a) => (
                          <div key={a.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 flex items-center justify-between opacity-70">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                                <MapPin className="w-4 h-4 text-gray-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 truncate">{a.entityName}</p>
                                <span className="text-[11px] text-gray-400">
                                  {formatDateEs(a.startDate)} → {a.endDate ? formatDateEs(a.endDate) : '—'}
                                </span>
                              </div>
                            </div>
                            <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                              Finalizada
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            HORARIOS
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'schedule' && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  Horario laboral
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Viene de la plantilla de la invitación. Aquí puedes ver y cambiar los días que trabaja.
                </p>
              </div>
              {canManageHr && !scheduleLoading && !editingSchedule && (
                <button
                  type="button"
                  onClick={startEditSchedule}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Edit2 className="w-4 h-4" />
                  {schedule ? 'Cambiar horario' : 'Asignar horario'}
                </button>
              )}
            </div>

            {scheduleLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : editingSchedule ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-sm font-bold text-blue-700 dark:text-blue-300">
                    {computeWeeklyHours(editWeekly).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h / semana
                  </span>
                  <span className="text-xs text-gray-400">
                    Horas en formato 24 h (ej. salida 17:00 = 5 de la tarde)
                  </span>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-600 dark:bg-stone-900/50">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Unificar horario</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                    Pon la franja una vez y cópiala a varios días de golpe.
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <ScheduleTimeField
                      compact
                      label="Entrada"
                      value={quickShift.start}
                      onChange={(v) => updateQuickShift('start', v)}
                    />
                    <ScheduleTimeField
                      compact
                      label="Salida"
                      value={quickShift.end}
                      onChange={(v) => updateQuickShift('end', v)}
                    />
                    <span className="mx-1 hidden text-xs text-stone-300 sm:inline">|</span>
                    <ScheduleTimeField
                      compact
                      label="Ini. pausa"
                      value={quickShift.breakStart}
                      onChange={(v) => updateQuickShift('breakStart', v)}
                    />
                    <ScheduleTimeField
                      compact
                      label="Fin pausa"
                      value={quickShift.breakEnd}
                      onChange={(v) => updateQuickShift('breakEnd', v)}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyQuickToEnabledDays}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <Copy className="h-4 w-4" />
                      Copiar a días activos
                    </button>
                    <button
                      type="button"
                      onClick={applyQuickToLaborDays}
                      className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
                    >
                      Lun–Vie iguales
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {WEEKDAYS.map((day) => {
                    const shift = editWeekly[day];
                    const dayH = computeDayHours(shift);
                    return (
                      <div
                        key={day}
                        className={`flex flex-wrap items-center gap-3 rounded-xl p-3 ${
                          shift.enabled
                            ? 'bg-stone-50 dark:bg-stone-900/40'
                            : 'bg-stone-50/50 opacity-70 dark:bg-stone-900/20'
                        }`}
                      >
                        <label className="flex w-28 shrink-0 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={shift.enabled}
                            onChange={(e) => updateEditDay(day, 'enabled', e.target.checked)}
                            className="h-4 w-4 rounded border-stone-300 text-[#2563EB] focus:ring-blue-500"
                          />
                          <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                            {weekdayLabels[day]}
                          </span>
                        </label>
                        {shift.enabled ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <ScheduleTimeField
                                compact
                                label="Entrada"
                                value={shift.start}
                                onChange={(v) => updateEditDay(day, 'start', v)}
                              />
                              <ScheduleTimeField
                                compact
                                label="Salida"
                                value={shift.end}
                                onChange={(v) => updateEditDay(day, 'end', v)}
                              />
                              <span className="mx-1 text-xs text-stone-300">|</span>
                              <ScheduleTimeField
                                compact
                                label="Ini. pausa"
                                value={shift.breakStart}
                                onChange={(v) => updateEditDay(day, 'breakStart', v)}
                              />
                              <ScheduleTimeField
                                compact
                                label="Fin pausa"
                                value={shift.breakEnd}
                                onChange={(v) => updateEditDay(day, 'breakEnd', v)}
                              />
                            </div>
                            <span className="ml-auto text-xs font-bold tabular-nums text-stone-600 dark:text-stone-300">
                              {dayH.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h
                            </span>
                          </>
                        ) : (
                          <span className="text-sm italic text-stone-400">Libre</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    disabled={savingSchedule}
                    onClick={() => void handleSaveSchedule()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar horario
                  </button>
                  <button
                    type="button"
                    disabled={savingSchedule}
                    onClick={() => {
                      setEditingSchedule(false);
                      if (schedule?.weekly) setEditWeekly(schedule.weekly);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : !schedule ? (
              <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
                <p className="font-medium">No hay horario asignado</p>
                <p className="mt-1 text-sm">
                  Si la invitación tenía plantilla, debería aparecer aquí al aceptar.
                  {canManageHr ? ' También puedes asignarlo ahora.' : ''}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {computeWeeklyHours(schedule.weekly).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h / semana
                  </span>
                  {schedule.template_id && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">Desde plantilla de invitación</span>
                  )}
                  {schedule.week_start && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Semana del {schedule.week_start}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Día</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Entrada</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Salida</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Descanso</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WEEKDAYS.map((day) => {
                        const shift = schedule.weekly[day];
                        if (!shift?.enabled) {
                          return (
                            <tr key={day} className="border-b border-gray-50 dark:border-gray-800">
                              <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100">{weekdayLabels[day]}</td>
                              <td colSpan={4} className="px-3 py-3 italic text-gray-400 dark:text-gray-500">Libre</td>
                            </tr>
                          );
                        }
                        const hours = computeDayHours(shift);
                        const breakUsed =
                          computeDayWorkMinutes(shift) <
                          computeDayWorkMinutes({ ...shift, breakStart: '00:00', breakEnd: '00:00' });
                        return (
                          <tr key={day} className="border-b border-gray-50 dark:border-gray-800">
                            <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100">{weekdayLabels[day]}</td>
                            <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{shift.start}</td>
                            <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{shift.end}</td>
                            <td className="px-3 py-3 text-gray-500 dark:text-gray-400">
                              {breakUsed ? `${shift.breakStart} - ${shift.breakEnd}` : '—'}
                            </td>
                            <td className="px-3 py-3 font-semibold text-gray-900 dark:text-gray-100">
                              {hours.toLocaleString('es-ES', { maximumFractionDigits: 1 })}h
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            FICHAJES
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'clockins' && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Horas trabajadas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatMinutes(clockinSummary.totalMinutes)}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Sesiones totales</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{clockinSummary.totalSessions}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Completadas</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{clockinSummary.completedSessions}</p>
              </div>
            </div>

            {/* Month selector */}
            <div className="flex items-center gap-3">
              <input
                type="month"
                value={clockinMonth}
                onChange={(e) => setClockinMonth(e.target.value)}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400"
              />
            </div>

            {/* Clockin list */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              {clockinsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : clockins.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Clock className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="font-medium">Sin fichajes en este período</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fecha</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Entrada</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Salida</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Horas</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Descanso</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ubicación</th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clockins.map((record) => {
                      const clockInEntry = record.entries.find((e) => e.type === 'clock_in');
                      const clockOutEntry = record.entries.find((e) => e.type === 'clock_out');
                      const geo = clockinPrimaryGeo(record);
                      const mapsHref = mapsUrlForGeo(geo);
                      return (
                        <tr key={record._id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                          <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
                            {new Date(record.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </td>
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                            {clockInEntry ? new Date(clockInEntry.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                            {clockOutEntry ? new Date(clockOutEntry.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="py-3 px-4 font-semibold text-gray-900 dark:text-gray-100">{formatMinutes(record.totalMinutes)}</td>
                          <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{record.breakMinutes > 0 ? formatMinutes(record.breakMinutes) : '—'}</td>
                          <td className="py-3 px-4">
                            {mapsHref ? (
                              <a
                                href={mapsHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
                              >
                                <MapPin className="w-3.5 h-3.5" /> Ver mapa
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">Sin GPS</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              record.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : record.status === 'break'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            }`}>
                              {record.status === 'completed' ? (
                                <><Check className="w-3 h-3" /> Completado</>
                              ) : record.status === 'break' ? (
                                <><Coffee className="w-3 h-3" /> Descanso</>
                              ) : (
                                <><Clock className="w-3 h-3" /> Activo</>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            VACACIONES
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'vacations' && (
          <div className="space-y-4">
            <a href="/saas/equipo/solicitudes" className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center gap-1">Ver gestión completa en Solicitudes RRHH →</a>
            {vacationsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                {/* Balance cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Cargados</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{vacationSummary.allowed} <span className="text-sm font-normal text-gray-400">días</span></p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Consumidos</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{vacationSummary.used} <span className="text-sm font-normal text-gray-400">días</span></p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Pendientes</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{vacationSummary.pending} <span className="text-sm font-normal text-gray-400">días</span></p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">Disponibles</p>
                    <p className={`text-2xl font-bold mt-1 ${vacationSummary.requestable > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-500 dark:text-stone-400'}`}>
                      {vacationSummary.requestable} <span className="text-sm font-normal text-gray-400">días</span>
                    </p>
                  </div>
                </div>

                {/* Vacation requests list */}
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Solicitudes ({vacationYear})</h3>
                  </div>

                  {vacations.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <Umbrella className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="font-medium">Sin solicitudes de vacaciones</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                          <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tipo</th>
                          <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Desde</th>
                          <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Hasta</th>
                          <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Días</th>
                          <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                          <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vacations.map((vac) => (
                          <tr key={vac._id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{leaveLabels[vac.leaveType] || vac.leaveType}</td>
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{formatDateEs(vac.startDate)}</td>
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{formatDateEs(vac.endDate)}</td>
                            <td className="py-3 px-4 font-semibold text-gray-900 dark:text-gray-100">{vac.totalDays}</td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                vac.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : vac.status === 'rejected'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              }`}>
                                {statusLabels[vac.status] || vac.status}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {vac.status === 'pending' && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleVacationReview(vac, 'approved')}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                                  >
                                    <ThumbsUp className="w-3 h-3" />
                                    Aprobar
                                  </button>
                                  <button
                                    onClick={() => handleVacationReview(vac, 'rejected')}
                                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 dark:bg-red-900/30 px-2 py-1 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                                  >
                                    <ThumbsDown className="w-3 h-3" />
                                    Rechazar
                                  </button>
                                </div>
                              )}
                              {vac.status !== 'pending' && vac.reviewedByName && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  por {vac.reviewedByName}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            PERMISOS
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'permissions' && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                Permisos del trabajador
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Módulos reales de Vertial (clientes, finanzas, caja, delivery…). Ver y editar por módulo.
              </p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Módulo</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ver</th>
                  <th className="py-3 px-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Editar</th>
                </tr>
              </thead>
              <tbody>
                {getVertialAccessPermissionModules(currentBusiness?.businessType).map((mod) => {
                  const perm = permissions[mod.key] || { view: false, edit: false };
                  const isSavingView = permissionSaving === `${mod.key}:view`;
                  const isSavingEdit = permissionSaving === `${mod.key}:edit`;
                  return (
                    <tr key={mod.key} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {permissionModuleLabel(mod.key, mod.label, currentBusiness?.businessType)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handlePermissionToggle(mod.key, 'view')}
                          disabled={!!permissionSaving}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                            perm.view
                              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isSavingView ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : perm.view ? <Eye className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handlePermissionToggle(mod.key, 'edit')}
                          disabled={!!permissionSaving}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                            perm.edit
                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : perm.edit ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            DOCUMENTOS
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {/* Category filter */}
            <div className="flex flex-wrap gap-2">
              {DOC_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setDocCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    docCategory === cat.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Upload button */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Buscar documentos..."
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400"
                />
              </div>
              <button
                type="button"
                onClick={() => openPayrollUpload('nomina')}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Subir archivo
              </button>
            </div>

            {/* Nóminas section */}
            {(docCategory === 'all' || docCategory === 'payslips') && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-500" />
                    Nóminas
                  </h4>
                  {(HR_MANAGER_ROLES.has(String(user?.role || ''))
                    || Boolean(currentBusiness?.owner_user_id && user?.user_id === currentBusiness.owner_user_id)) && (
                    <button
                      type="button"
                      onClick={() => openPayrollUpload('nomina')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Subir nómina
                    </button>
                  )}
                </div>

                {payrollLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                ) : payrollDocs.filter((d) => d.documentType === 'nomina').length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm">No hay nóminas todavía.</p>
                    {(user?.role === 'Admin' || user?.role === 'Superadmin') && (
                      <button
                        onClick={() => openPayrollUpload('nomina')}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Subir nómina
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {payrollDocs
                      .filter((d) => d.documentType === 'nomina')
                      .filter((d) => {
                        if (!docSearch.trim()) return true;
                        const q = docSearch.toLowerCase();
                        return d.name.toLowerCase().includes(q) || (d.period || '').includes(q) || PAYROLL_DOC_TYPE_LABELS[d.documentType].toLowerCase().includes(q);
                      })
                      .map((doc) => (
                      <div key={doc._id} className="group flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
                            <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{doc.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                doc.documentType === 'nomina' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                                  : doc.documentType === 'contrato' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                                    : doc.documentType === 'certificado' ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700'
                                      : doc.documentType === 'baja' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700'
                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                              }`}>
                                {PAYROLL_DOC_TYPE_LABELS[doc.documentType]}
                              </span>
                              {doc.period && (
                                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                  {(() => {
                                    const [y, m] = doc.period.split('-');
                                    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                                    return m ? `${months[parseInt(m, 10) - 1]} ${y}` : doc.period;
                                  })()}
                                </span>
                              )}
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                {new Date(doc.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              {getDocumentExpiryStatus(doc) === 'expired' && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">Caducado</span>
                              )}
                              {getDocumentExpiryStatus(doc) === 'expiring' && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Por caducar</span>
                              )}
                              {doc.expiryDate && getDocumentExpiryStatus(doc) === 'valid' && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Vigente</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {doc.fileData && (
                            <button
                              type="button"
                              onClick={() => setPayrollPreviewDoc(doc)}
                              title="Ver documento"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {doc.fileData && (
                            <button
                              type="button"
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = doc.fileData!;
                                link.download = doc.fileName || doc.name;
                                link.click();
                              }}
                              title="Descargar"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          {(user?.role === 'Admin' || user?.role === 'Superadmin') && (
                            <button
                              type="button"
                              disabled={payrollDeleting === doc._id}
                              onClick={async () => {
                                if (!confirm(`¿Eliminar "${doc.name}"?`)) return;
                                setPayrollDeleting(doc._id);
                                try {
                                  await deletePayrollDocumentRequest(doc);
                                  setPayrollDocs((prev) => prev.filter((d) => d._id !== doc._id));
                                  toast.success('Documento eliminado');
                                } catch {
                                  toast.error('No se pudo eliminar el documento');
                                } finally {
                                  setPayrollDeleting(null);
                                }
                              }}
                              title="Eliminar"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              {payrollDeleting === doc._id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Contratos section */}
            {(docCategory === 'all' || docCategory === 'contracts') && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-blue-500" />
                    Contratos
                  </h4>
                  <button
                    type="button"
                    onClick={() => openPayrollUpload('contrato')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Subir contrato
                  </button>
                </div>
                {payrollDocs.filter((d) => d.documentType === 'contrato').length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <ScrollText className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm">No hay contratos subidos todavía.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {payrollDocs
                      .filter((d) => d.documentType === 'contrato')
                      .map((doc) => (
                        <div key={doc._id} className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{doc.name}</p>
                            <p className="text-xs text-gray-500">
                              Contrato · {new Date(doc.createdAt).toLocaleDateString('es-ES')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {doc.fileData ? (
                              <button
                                type="button"
                                onClick={() => setPayrollPreviewDoc(doc)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Ver contrato"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : null}
                            {doc.fileData ? (
                              <a href={doc.fileData} download={doc.fileName || doc.name} className="text-xs font-semibold text-blue-600">
                                Descargar
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Documentación del trabajador (DNI/NIE, cuenta bancaria...) */}
            {(docCategory === 'all' || docCategory === 'personal_docs') && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-500" />
                  Documentación del trabajador
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">DNI/NIE, pasaporte, permisos…</p>
                {payrollDocs.filter((d) => ['dni_nie', 'pasaporte', 'permiso_trabajo', 'carnet_conducir'].includes(d.documentType)).length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm">Sube documentos de identidad (DNI anverso/reverso).</p>
                    <button
                      type="button"
                      onClick={() => openPayrollUpload('dni_nie')}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-purple-50 dark:bg-purple-900/30 px-3 py-2 text-xs font-semibold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Subir DNI / documento
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {payrollDocs
                      .filter((d) => ['dni_nie', 'pasaporte', 'permiso_trabajo', 'carnet_conducir'].includes(d.documentType))
                      .map((doc) => (
                        <div key={doc._id} className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{doc.name}</p>
                            <p className="text-xs text-gray-500">{PAYROLL_DOC_TYPE_LABELS[doc.documentType]}</p>
                          </div>
                          {doc.fileData ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPayrollPreviewDoc(doc)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Ver documento"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <a href={doc.fileData} download={doc.fileName || doc.name} className="text-xs font-semibold text-blue-600">
                                Descargar
                              </a>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    <button
                      type="button"
                      onClick={() => openPayrollUpload('dni_nie')}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-purple-50 dark:bg-purple-900/30 px-3 py-2 text-xs font-semibold text-purple-700 dark:text-purple-300"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Subir otro
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Gastos */}
            {(docCategory === 'all' || docCategory === 'expenses') && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-500" />
                  Gastos del trabajador
                </h4>

                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm">Tickets y gastos del trabajador.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((exp) => (
                      <div key={exp._id} className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{exp.concept}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{exp.category} · {formatDateEs(exp.date)}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{exp.amount.toFixed(2)} €</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            exp.status === 'aprobado' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : exp.status === 'rechazado' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : exp.status === 'pagado' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}>
                            {exp.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Otros documentos */}
            {(docCategory === 'all' || docCategory === 'other') && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <File className="w-4 h-4 text-gray-500" />
                  Otros documentos
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Certificados, informes y otros documentos.</p>
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <File className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">Sube certificados, informes y demás documentación.</p>
                  <button
                    type="button"
                    onClick={() => openPayrollUpload('certificado')}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Subir documento
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            ENVIAR MENSAJE
        ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'message' && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <div className="text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30">
                <MessageSquare className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Chat con {member.fullName}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
                Envía mensajes directos a {member.fullName} dentro del chat del equipo. También puedes usar el canal general para hablar con todo el equipo.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/saas/chat?dm=${encodeURIComponent(member.user_id)}`)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Abrir chat directo
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/saas/chat')}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  Ver chat del equipo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showPayrollUpload && member && businessId && (
        <PayrollUploadModal
          member={member}
          currentUser={user!}
          businessId={businessId}
          initialType={payrollUploadType}
          onClose={() => setShowPayrollUpload(false)}
          onUploaded={(doc) => {
            setPayrollDocs((prev) => [doc, ...prev]);
            toast.success(payrollUploadSuccessMessage(doc));
          }}
        />
      )}
      {payrollPreviewDoc ? (
        <PayrollDocumentPreviewModal
          doc={payrollPreviewDoc}
          onClose={() => setPayrollPreviewDoc(null)}
        />
      ) : null}
    </Layout>
  );
}
