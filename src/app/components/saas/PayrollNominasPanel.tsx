import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Receipt,
  Search,
  User,
  Wallet,
} from 'lucide-react';
import type { AuthUser } from '../../lib/authApi';
import {
  formatPayrollPeriodLabel,
  type PayrollDocument,
} from '../../lib/payrollApi';
import { computeLaborCostBreakdown } from '../../lib/laborCost';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import { formatDateEs } from '../../lib/formatDateEs';
import {
  VERTIAL_ACCENT_BG,
  VERTIAL_ACCENT_BORDER,
  VERTIAL_ACCENT_TEXT,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../lib/vertialUiTokens';

type MonthPayStatus = 'paid' | 'pending' | 'future' | 'before_hire';

export type WorkerPayrollProfile = {
  member: AuthUser;
  grossMonthly: number | null;
  netMonthly: number | null;
  employerCostMonthly: number | null;
  payslips: PayrollDocument[];
  lastPayslip: PayrollDocument | null;
  currentPeriod: string;
  currentMonthPaid: boolean;
  paidYtd: number;
  pendingNow: number;
  months: Array<{
    period: string;
    label: string;
    status: MonthPayStatus;
    doc: PayrollDocument | null;
  }>;
  hasSalary: boolean;
};

function currentPeriodKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodKeysFrom(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    keys.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function parseHireDate(iso?: string): Date | null {
  if (!iso) return null;
  const raw = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function initials(name?: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export function buildWorkerPayrollProfiles(
  members: AuthUser[],
  documents: PayrollDocument[],
  now = new Date(),
): WorkerPayrollProfile[] {
  const currentPeriod = currentPeriodKey(now);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  return members
    .filter((m) => m.status !== 'inactive')
    .map((member) => {
      const breakdown = computeLaborCostBreakdown(member.employment || {});
      const netMonthly = breakdown?.estimatedNetMonthly ?? null;
      const grossMonthly = breakdown?.grossMonthly ?? null;
      const employerCostMonthly = breakdown?.totalMonthlyEmployerCost ?? null;
      const hasSalary = netMonthly != null && netMonthly > 0;

      const payslips = documents
        .filter(
          (d) =>
            d.worker_id === member.user_id && d.documentType === 'nomina',
        )
        .sort((a, b) => String(b.period || b.createdAt).localeCompare(String(a.period || a.createdAt)));

      const byPeriod = new Map<string, PayrollDocument>();
      for (const doc of payslips) {
        if (doc.period && !byPeriod.has(doc.period)) {
          byPeriod.set(doc.period, doc);
        }
      }

      const hire = parseHireDate(member.employment?.startDate);
      const rangeStart =
        hire && hire > yearStart
          ? new Date(hire.getFullYear(), hire.getMonth(), 1)
          : yearStart;
      const monthKeys = periodKeysFrom(rangeStart, now);

      const months = monthKeys.map((period) => {
        const doc = byPeriod.get(period) || null;
        let status: MonthPayStatus = 'pending';
        if (doc) status = 'paid';
        else if (period > currentPeriod) status = 'future';
        else if (hire) {
          const hireKey = `${hire.getFullYear()}-${String(hire.getMonth() + 1).padStart(2, '0')}`;
          if (period < hireKey) status = 'before_hire';
        }
        return {
          period,
          label: formatPayrollPeriodLabel(period),
          status,
          doc,
        };
      });

      const currentMonthPaid = byPeriod.has(currentPeriod);
      const paidMonthsCount = months.filter((m) => m.status === 'paid').length;
      const pendingMonths = months.filter((m) => m.status === 'pending').length;
      const paidYtd = hasSalary ? paidMonthsCount * (netMonthly || 0) : 0;
      const pendingNow = hasSalary
        ? pendingMonths * (netMonthly || 0)
        : 0;

      return {
        member,
        grossMonthly,
        netMonthly,
        employerCostMonthly,
        payslips,
        lastPayslip: payslips[0] || null,
        currentPeriod,
        currentMonthPaid,
        paidYtd,
        pendingNow,
        months,
        hasSalary,
      };
    })
    .sort((a, b) => {
      // Pendientes primero, luego sin salario, luego alfabético
      const rank = (p: WorkerPayrollProfile) => {
        if (p.hasSalary && !p.currentMonthPaid) return 0;
        if (!p.hasSalary) return 1;
        return 2;
      };
      const dr = rank(a) - rank(b);
      if (dr !== 0) return dr;
      return String(a.member.fullName || '').localeCompare(
        String(b.member.fullName || ''),
        'es',
      );
    });
}

type Props = {
  members: AuthUser[];
  documents: PayrollDocument[];
  loading?: boolean;
  selectedWorkerId?: string;
  onSelectWorker: (workerId: string) => void;
  onOpenDocuments: (workerId?: string) => void;
  onUploadPayslips: () => void;
};

export function PayrollNominasPanel({
  members,
  documents,
  loading = false,
  selectedWorkerId,
  onSelectWorker,
  onOpenDocuments,
  onUploadPayslips,
}: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const profiles = useMemo(
    () => buildWorkerPayrollProfiles(members, documents),
    [members, documents],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(
      (p) =>
        p.member.fullName?.toLowerCase().includes(q) ||
        p.member.email?.toLowerCase().includes(q) ||
        p.member.employment?.position?.toLowerCase().includes(q) ||
        p.member.employment?.department?.toLowerCase().includes(q),
    );
  }, [profiles, search]);

  const selected =
    filtered.find((p) => p.member.user_id === selectedWorkerId) ||
    profiles.find((p) => p.member.user_id === selectedWorkerId) ||
    filtered[0] ||
    null;

  const pendingCount = profiles.filter(
    (p) => p.hasSalary && !p.currentMonthPaid,
  ).length;
  const paidCount = profiles.filter((p) => p.currentMonthPaid).length;
  const noSalaryCount = profiles.filter((p) => !p.hasSalary).length;
  const totalPending = profiles.reduce((s, p) => s + p.pendingNow, 0);
  const totalPaidYtd = profiles.reduce((s, p) => s + p.paidYtd, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando nóminas…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Pendientes este mes"
          value={String(pendingCount)}
          hint={totalPending > 0 ? formatMoneyEs(totalPending) : undefined}
          tone="amber"
        />
        <SummaryCard
          label="Pagadas este mes"
          value={String(paidCount)}
          tone="green"
        />
        <SummaryCard
          label="Pagado (año)"
          value={formatMoneyEs(totalPaidYtd) || '—'}
          tone="blue"
        />
        <SummaryCard
          label="Sin salario en ficha"
          value={String(noSalaryCount)}
          tone="slate"
        />
      </div>

      <div className={`grid min-h-[28rem] overflow-hidden lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] ${VERTIAL_SURFACE}`}>
        {/* Lista trabajadores */}
        <div className="border-b lg:border-b-0 lg:border-r border-stone-200 dark:border-stone-800 flex flex-col min-h-0">
          <div className="p-3 border-b border-stone-100 dark:border-stone-800 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar trabajador…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm text-stone-900 dark:text-stone-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <p className="text-xs text-stone-500 px-0.5">
              {filtered.length} trabajador{filtered.length === 1 ? '' : 'es'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[32rem] lg:max-h-none">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-stone-500">
                {profiles.length === 0
                  ? 'No hay trabajadores activos en esta empresa.'
                  : 'Sin resultados.'}
              </div>
            ) : (
              <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                {filtered.map((p) => {
                  const active = selected?.member.user_id === p.member.user_id;
                  return (
                    <li key={p.member.user_id}>
                      <button
                        type="button"
                        onClick={() => onSelectWorker(p.member.user_id)}
                        className={`w-full text-left px-3 py-3 flex gap-3 transition-colors ${
                          active
                            ? `${VERTIAL_ACCENT_BG} border-l-2 border-l-blue-600`
                            : 'hover:bg-stone-50 dark:hover:bg-stone-900/60 border-l-2 border-l-transparent'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {initials(p.member.fullName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                            {p.member.fullName || 'Sin nombre'}
                          </p>
                          <p className="text-xs text-stone-500 truncate">
                            {p.member.employment?.position ||
                              p.member.employment?.department ||
                              p.member.email ||
                              '—'}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <StatusPill profile={p} />
                            {p.hasSalary && (
                              <span className="text-[11px] text-stone-500 tabular-nums">
                                {formatMoneyEs(p.netMonthly)} / mes
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Perfil */}
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-stone-500">
              <User className="w-10 h-10 mb-3 text-stone-300" />
              <p className="text-sm font-medium">Selecciona un trabajador</p>
              <p className="text-xs mt-1 max-w-xs">
                Verás lo pagado, lo pendiente y las fechas de nómina.
              </p>
            </div>
          ) : (
            <WorkerPayrollDetail
              profile={selected}
              onOpenTeam={() =>
                navigate(`/saas/team/${selected.member.user_id}`)
              }
              onOpenDocuments={() =>
                onOpenDocuments(selected.member.user_id)
              }
              onUploadPayslips={onUploadPayslips}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'amber' | 'green' | 'blue' | 'slate';
}) {
  const tones = {
    amber: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20',
    green: 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20',
    blue: 'border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20',
    slate: 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900',
  };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </p>
      <p className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums mt-1">
        {value}
      </p>
      {hint ? (
        <p className="text-xs text-stone-500 mt-0.5 tabular-nums">{hint}</p>
      ) : null}
    </div>
  );
}

function StatusPill({ profile }: { profile: WorkerPayrollProfile }) {
  if (!profile.hasSalary) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
        Sin salario
      </span>
    );
  }
  if (profile.currentMonthPaid) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="w-3 h-3" />
        Pagada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
      <Clock className="w-3 h-3" />
      Pendiente
    </span>
  );
}

function WorkerPayrollDetail({
  profile,
  onOpenTeam,
  onOpenDocuments,
  onUploadPayslips,
}: {
  profile: WorkerPayrollProfile;
  onOpenTeam: () => void;
  onOpenDocuments: () => void;
  onUploadPayslips: () => void;
}) {
  const m = profile.member;
  const emp = m.employment;
  const periodLabel = formatPayrollPeriodLabel(profile.currentPeriod);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
          {initials(m.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 truncate">
              {m.fullName || 'Sin nombre'}
            </h2>
            <StatusPill profile={profile} />
          </div>
          <p className="text-sm text-stone-500 mt-0.5">
            {[emp?.position, emp?.department].filter(Boolean).join(' · ') ||
              m.email ||
              '—'}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-stone-500">
            {emp?.startDate ? (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Alta {formatDateEs(emp.startDate)}
              </span>
            ) : null}
            {emp?.contractType ? (
              <span>Contrato: {emp.contractType}</span>
            ) : null}
            {emp?.workday ? <span>Jornada: {emp.workday}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" onClick={onOpenTeam} className={VERTIAL_BTN_SECONDARY}>
            Ver ficha
          </button>
          <button type="button" onClick={onOpenDocuments} className={VERTIAL_BTN_SECONDARY}>
            Documentos
          </button>
        </div>
      </div>

      {!profile.hasSalary ? (
        <div className={`rounded-xl border p-4 flex gap-3 ${VERTIAL_ACCENT_BORDER} ${VERTIAL_ACCENT_BG}`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${VERTIAL_ACCENT_TEXT}`} />
          <div>
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Falta configurar el salario
            </p>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
              Añádelo en Equipo → ficha del trabajador → Datos laborales para calcular
              lo pagado y lo pendiente.
            </p>
            <button
              type="button"
              onClick={onOpenTeam}
              className={`mt-3 text-xs font-semibold inline-flex items-center gap-1 ${VERTIAL_ACCENT_TEXT}`}
            >
              Ir a la ficha <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <AmountCard
            icon={<Wallet className="w-4 h-4" />}
            label={`Neto estimado (${periodLabel})`}
            value={formatMoneyEs(profile.netMonthly)}
            sub={
              profile.grossMonthly
                ? `Bruto ${formatMoneyEs(profile.grossMonthly)}`
                : undefined
            }
          />
          <AmountCard
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            label="Pagado (año en curso)"
            value={formatMoneyEs(profile.paidYtd)}
            sub={`${profile.months.filter((x) => x.status === 'paid').length} nómina(s) documentada(s)`}
            tone="green"
          />
          <AmountCard
            icon={<Clock className="w-4 h-4 text-amber-600" />}
            label="Pendiente de pagar"
            value={formatMoneyEs(profile.pendingNow)}
            sub={
              profile.currentMonthPaid
                ? 'Mes actual documentado'
                : `Incluye ${periodLabel} y meses sin nómina`
            }
            tone="amber"
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
            Calendario de nóminas {new Date().getFullYear()}
          </h3>
          <button
            type="button"
            onClick={onUploadPayslips}
            className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !px-3 !py-1.5 !text-xs`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Subir nóminas
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {profile.months.map((month) => (
            <div
              key={month.period}
              className={`rounded-xl border px-3 py-2.5 ${
                month.status === 'paid'
                  ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20'
                  : month.status === 'pending'
                    ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20'
                    : 'border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40'
              }`}
            >
              <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                {month.label}
              </p>
              <p className="text-[11px] mt-1 font-medium">
                {month.status === 'paid' && (
                  <span className="text-emerald-700 dark:text-emerald-300">Documentada</span>
                )}
                {month.status === 'pending' && (
                  <span className="text-amber-800 dark:text-amber-300">Pendiente</span>
                )}
                {month.status === 'before_hire' && (
                  <span className="text-stone-400">Antes del alta</span>
                )}
                {month.status === 'future' && (
                  <span className="text-stone-400">Futuro</span>
                )}
              </p>
              {month.doc?.createdAt ? (
                <p className="text-[10px] text-stone-500 mt-1">
                  {formatDateEs(month.doc.createdAt)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mb-3">
          Últimas nóminas
        </h3>
        {profile.payslips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-200 dark:border-stone-700 py-8 text-center text-sm text-stone-500">
            Aún no hay nóminas subidas para este trabajador.
          </div>
        ) : (
          <ul className="rounded-xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
            {profile.payslips.slice(0, 8).map((doc) => (
              <li
                key={doc._id}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-stone-900"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                      {doc.name}
                    </p>
                    <p className="text-xs text-stone-500">
                      {doc.period
                        ? formatPayrollPeriodLabel(doc.period)
                        : 'Sin período'}
                      {doc.createdAt ? ` · ${formatDateEs(doc.createdAt)}` : ''}
                    </p>
                  </div>
                </div>
                {doc.fileData ? (
                  <a
                    href={doc.fileData}
                    download={doc.fileName || doc.name}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                  >
                    Descargar
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AmountCard({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'green' | 'amber';
}) {
  const tones = {
    neutral: 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900',
    green: 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20',
    amber: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-stone-500 mb-1">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
        {value || '—'}
      </p>
      {sub ? (
        <p className="text-xs text-stone-500 mt-1">{sub}</p>
      ) : null}
    </div>
  );
}
