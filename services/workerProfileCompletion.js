/**
 * Perfil de trabajador — campos obligatorios y estado de completitud.
 * Usado en todo el SaaS (invitación, trabajador, gerente, alertas).
 */

export const WORKER_OWNED_FIELD_DEFS = [
  { id: 'dni', label: 'DNI / NIE', paths: ['personalData.dni'], phase: 'identity' },
  { id: 'birthDate', label: 'Fecha de nacimiento', paths: ['personalData.birthDate'], phase: 'identity' },
  { id: 'nationality', label: 'Nacionalidad', paths: ['personalData.nationality'], phase: 'payroll' },
  { id: 'address', label: 'Dirección completa', paths: ['personalData.address', 'personalData.city'], phase: 'identity' },
  { id: 'emergencyContact', label: 'Contacto emergencia', paths: ['employment.emergencyContact', 'employment.emergencyPhone'], phase: 'payroll' },
  { id: 'socialSecurityNumber', label: 'N. Seguridad Social', paths: ['personalData.socialSecurityNumber'], phase: 'payroll' },
  { id: 'bankAccount', label: 'Cuenta bancaria (IBAN)', paths: ['employment.bankAccount'], phase: 'payroll' },
];

export const WORKER_PAYROLL_FIELD_DEFS = WORKER_OWNED_FIELD_DEFS.filter((f) => f.phase === 'payroll');
export const WORKER_PAYROLL_SETUP_PATH = '/saas/worker/complete-payroll';
export const WORKER_LEGACY_HOME_PATH = '/saas/worker';
export const WORKER_DEFAULT_LANDING_PATH = '/saas/worker/tasks';

export function normalizeWorkerLandingPage(path) {
  const trimmed = String(path || '').trim();
  if (!trimmed || trimmed === WORKER_LEGACY_HOME_PATH) {
    return WORKER_DEFAULT_LANDING_PATH;
  }
  return trimmed;
}

export const HR_OWNED_FIELD_DEFS = [
  { id: 'startDate', label: 'Fecha de alta', paths: ['employment.startDate'] },
  { id: 'contributionGroup', label: 'Grupo de cotización', paths: ['employment.contributionGroup'] },
  { id: 'mutualInsurance', label: 'Mutua', paths: ['employment.mutualInsurance'] },
];

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isFilled(value) {
  return String(value ?? '').trim().length > 0;
}

function fieldIsComplete(account, fieldDef) {
  const paths = Array.isArray(fieldDef.paths) ? fieldDef.paths : [fieldDef.path];
  if (fieldDef.id === 'address') {
    return isFilled(getNestedValue(account, 'personalData.address'))
      && isFilled(getNestedValue(account, 'personalData.city'));
  }
  if (fieldDef.id === 'emergencyContact') {
    return isFilled(getNestedValue(account, 'employment.emergencyContact'))
      || isFilled(getNestedValue(account, 'employment.emergencyPhone'));
  }
  return paths.some((path) => isFilled(getNestedValue(account, path)));
}

function normalizeBirthDateIso(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const isoDateTime = /^(\d{4}-\d{2}-\d{2})T/.exec(raw);
  if (isoDateTime) return isoDateTime[1];
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(raw);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  return '';
}

export function buildDefaultPersonalData(overrides = {}) {
  return {
    dni: String(overrides.dni || '').trim(),
    birthDate: normalizeBirthDateIso(String(overrides.birthDate || '').trim()),
    nationality: String(overrides.nationality || '').trim(),
    address: String(overrides.address || '').trim(),
    city: String(overrides.city || '').trim(),
    postalCode: String(overrides.postalCode || '').trim(),
    socialSecurityNumber: String(overrides.socialSecurityNumber || '').trim(),
  };
}

export function mergePersonalData(existing = {}, incoming = {}) {
  const base = buildDefaultPersonalData(existing);
  if (!incoming || typeof incoming !== 'object') return base;
  return buildDefaultPersonalData({ ...base, ...incoming });
}

export function mergeEmploymentInfo(existing = {}, incoming = {}) {
  const prev = existing && typeof existing === 'object' ? existing : {};
  const next = incoming && typeof incoming === 'object' ? incoming : {};
  const merged = { ...prev, ...next };
  if (!Object.prototype.hasOwnProperty.call(next, 'assignments') && Array.isArray(prev.assignments)) {
    merged.assignments = prev.assignments;
  }
  if (!Object.prototype.hasOwnProperty.call(next, 'baseProductivity') && prev.baseProductivity) {
    merged.baseProductivity = prev.baseProductivity;
  }
  return {
    department: String(merged.department || '').trim(),
    position: String(merged.position || '').trim(),
    schedule: String(merged.schedule || '').trim(),
    notes: String(merged.notes || '').trim(),
    skills: Array.isArray(merged.skills)
      ? merged.skills.map((s) => ({
        id: String(s?.id || '').trim(),
        name: String(s?.name || '').trim(),
        level: Math.max(1, Math.min(5, Number(s?.level) || 1)),
      }))
      : [],
    startDate: String(merged.startDate || '').trim(),
    endDate: String(merged.endDate || '').trim(),
    contractType: String(merged.contractType || '').trim(),
    workday: String(merged.workday || '').trim(),
    salary: String(merged.salary || '').trim(),
    bankAccount: String(merged.bankAccount || '').trim(),
    bankName: String(merged.bankName || '').trim(),
    emergencyContact: String(merged.emergencyContact || '').trim(),
    emergencyPhone: String(merged.emergencyPhone || '').trim(),
    salesPointId: String(merged.salesPointId || '').trim(),
    contributionGroup: String(merged.contributionGroup || '').trim(),
    mutualInsurance: String(merged.mutualInsurance || '').trim(),
    terminationReason: String(merged.terminationReason || '').trim(),
    terminationType: merged.terminationType || undefined,
    grossSalary: merged.grossSalary != null ? Number(merged.grossSalary) : undefined,
    socialSecurityCost: merged.socialSecurityCost != null ? Number(merged.socialSecurityCost) : undefined,
    otherCosts: merged.otherCosts != null ? Number(merged.otherCosts) : undefined,
    costCurrency: merged.costCurrency || undefined,
    costPeriod: merged.costPeriod || undefined,
    lastCostReview: merged.lastCostReview || undefined,
    nextCostReview: merged.nextCostReview || undefined,
    baseProductivity: merged.baseProductivity || undefined,
    assignments: Array.isArray(merged.assignments) ? merged.assignments : undefined,
  };
}

export function computeWorkerProfileCompletion(account) {
  const workerMissing = WORKER_OWNED_FIELD_DEFS
    .filter((field) => !fieldIsComplete(account, field))
    .map((field) => field.id);
  const hrMissing = HR_OWNED_FIELD_DEFS
    .filter((field) => !fieldIsComplete(account, field))
    .map((field) => field.id);

  return {
    workerCompleted: workerMissing.length === 0,
    hrCompleted: hrMissing.length === 0,
    fullyCompleted: workerMissing.length === 0 && hrMissing.length === 0,
    workerMissing,
    hrMissing,
    updatedAt: new Date().toISOString(),
  };
}

export function isWorkerProfileSubject(account) {
  if (!account) return false;
  if (account.accountType === 'user') return true;
  if (String(account.invitedBy || '').trim()) return true;
  if (String(account.linkedBusinessId || '').trim() && account.role && account.role !== 'Admin' && account.role !== 'Gerente') {
    return true;
  }
  return false;
}

/** Campos mínimos para identificar al trabajador antes de unirse a una empresa. */
export function hasMinimumWorkerIdentity(account) {
  if (!account) return false;
  if (!isFilled(account.phone)) return false;
  if (!isFilled(getNestedValue(account, 'personalData.dni'))) return false;
  if (!isFilled(getNestedValue(account, 'personalData.birthDate'))) return false;
  if (!isFilled(getNestedValue(account, 'personalData.address'))) return false;
  if (!isFilled(getNestedValue(account, 'personalData.city'))) return false;
  return true;
}

export function getWorkerPayrollMissingIds(account) {
  if (!account) return WORKER_PAYROLL_FIELD_DEFS.map((f) => f.id);
  const completion = account.workerProfileCompletion || computeWorkerProfileCompletion(account);
  const payrollIds = new Set(WORKER_PAYROLL_FIELD_DEFS.map((f) => f.id));
  return (completion.workerMissing || []).filter((id) => payrollIds.has(id));
}

export function hasWorkerPayrollFieldsComplete(account) {
  return getWorkerPayrollMissingIds(account).length === 0;
}

/** Paso 2: datos de nómina obligatorios tras unirse a una empresa. */
export function needsWorkerPayrollSetup(account) {
  if (!account) return false;
  if (!String(account.linkedBusinessId || '').trim()) return false;
  if (!isWorkerProfileSubject(account)) return false;
  if (!hasMinimumWorkerIdentity(account)) return false;
  return !hasWorkerPayrollFieldsComplete(account);
}

export function resolveRedirectAfterInvitationAccept(account) {
  if (needsWorkerPayrollSetup(account)) {
    return WORKER_PAYROLL_SETUP_PATH;
  }
  const landing = String(account.landingPage || '').trim();
  if (landing.startsWith('/saas/') && landing !== WORKER_PAYROLL_SETUP_PATH) {
    return normalizeWorkerLandingPage(landing);
  }
  return WORKER_DEFAULT_LANDING_PATH;
}

export function computeProfileCompletionAlerts(members) {
  const alerts = [];
  const now = new Date().toISOString();

  for (const member of members) {
    if (member.status === 'inactive') continue;
    if (!isWorkerProfileSubject(member)) continue;

    const completion = member.workerProfileCompletion || computeWorkerProfileCompletion(member);
    if (completion.fullyCompleted) continue;

    const workerPending = !completion.workerCompleted;
    const hrPending = !completion.hrCompleted;
    const missingLabels = [
      ...WORKER_OWNED_FIELD_DEFS.filter((f) => completion.workerMissing?.includes(f.id)).map((f) => f.label),
      ...HR_OWNED_FIELD_DEFS.filter((f) => completion.hrMissing?.includes(f.id)).map((f) => f.label),
    ];

    alerts.push({
      id: `profile-incomplete-${member.user_id}`,
      type: 'profile_incomplete',
      severity: workerPending && hrPending ? 'warning' : 'info',
      workerId: member.user_id,
      workerName: member.fullName || '',
      message: workerPending && hrPending
        ? `${member.fullName || 'Trabajador'}: faltan datos personales y de gestoría`
        : workerPending
          ? `${member.fullName || 'Trabajador'}: debe completar su ficha personal`
          : `${member.fullName || 'Trabajador'}: RRHH debe completar alta laboral`,
      metadata: {
        workerMissing: completion.workerMissing || [],
        hrMissing: completion.hrMissing || [],
        missingLabels,
      },
      createdAt: now,
    });
  }

  return alerts;
}
