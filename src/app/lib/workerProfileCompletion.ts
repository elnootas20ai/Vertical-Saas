import type { AuthUser, EmploymentInfo } from './authApi';
import { normalizeBirthDateIso } from './birthDateIso';

export interface PersonalData {
  dni: string;
  birthDate: string;
  nationality: string;
  address: string;
  city: string;
  postalCode: string;
  socialSecurityNumber: string;
}

export interface WorkerProfileCompletion {
  workerCompleted: boolean;
  hrCompleted: boolean;
  fullyCompleted: boolean;
  workerMissing: string[];
  hrMissing: string[];
  updatedAt: string;
}

export const WORKER_OWNED_FIELD_DEFS = [
  { id: 'dni', label: 'DNI / NIE', paths: ['personalData.dni'], phase: 'identity' as const },
  { id: 'birthDate', label: 'Fecha de nacimiento', paths: ['personalData.birthDate'], phase: 'identity' as const },
  { id: 'nationality', label: 'Nacionalidad', paths: ['personalData.nationality'], phase: 'payroll' as const },
  { id: 'address', label: 'Dirección completa', paths: ['personalData.address', 'personalData.city'], phase: 'identity' as const },
  { id: 'emergencyContact', label: 'Contacto emergencia', paths: ['employment.emergencyContact', 'employment.emergencyPhone'], phase: 'payroll' as const },
  { id: 'socialSecurityNumber', label: 'N. Seguridad Social', paths: ['personalData.socialSecurityNumber'], phase: 'payroll' as const },
  { id: 'bankAccount', label: 'Cuenta bancaria (IBAN)', paths: ['employment.bankAccount'], phase: 'payroll' as const },
] as const;

export const WORKER_PAYROLL_FIELD_DEFS = WORKER_OWNED_FIELD_DEFS.filter((f) => f.phase === 'payroll');

export const HR_OWNED_FIELD_DEFS = [
  { id: 'startDate', label: 'Fecha de alta', paths: ['employment.startDate'] },
  { id: 'contributionGroup', label: 'Grupo de cotización', paths: ['employment.contributionGroup'] },
  { id: 'mutualInsurance', label: 'Mutua', paths: ['employment.mutualInsurance'] },
] as const;

type AccountLike = {
  personalData?: Partial<PersonalData> | null;
  employment?: Partial<EmploymentInfo> | null;
};

function getNestedValue(obj: AccountLike | null | undefined, path: string): unknown {
  if (!obj) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function isFilled(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

function fieldIsComplete(account: AccountLike, fieldId: string, paths: readonly string[]): boolean {
  if (fieldId === 'address') {
    return isFilled(getNestedValue(account, 'personalData.address'))
      && isFilled(getNestedValue(account, 'personalData.city'));
  }
  if (fieldId === 'emergencyContact') {
    return isFilled(getNestedValue(account, 'employment.emergencyContact'))
      || isFilled(getNestedValue(account, 'employment.emergencyPhone'));
  }
  return paths.some((path) => isFilled(getNestedValue(account, path)));
}

export function buildDefaultPersonalData(overrides?: Partial<PersonalData> | null): PersonalData {
  return {
    dni: String(overrides?.dni || '').trim(),
    birthDate: normalizeBirthDateIso(String(overrides?.birthDate || '').trim()),
    nationality: String(overrides?.nationality || '').trim(),
    address: String(overrides?.address || '').trim(),
    city: String(overrides?.city || '').trim(),
    postalCode: String(overrides?.postalCode || '').trim(),
    socialSecurityNumber: String(overrides?.socialSecurityNumber || '').trim(),
  };
}

export function mergePersonalData(
  existing?: Partial<PersonalData> | null,
  incoming?: Partial<PersonalData> | null,
): PersonalData {
  return buildDefaultPersonalData({ ...buildDefaultPersonalData(existing), ...(incoming || {}) });
}

export function computeWorkerProfileCompletion(account: AccountLike): WorkerProfileCompletion {
  const workerMissing = WORKER_OWNED_FIELD_DEFS
    .filter((field) => !fieldIsComplete(account, field.id, field.paths))
    .map((field) => field.id);
  const hrMissing = HR_OWNED_FIELD_DEFS
    .filter((field) => !fieldIsComplete(account, field.id, field.paths))
    .map((field) => field.id);

  return {
    workerCompleted: workerMissing.length === 0,
    hrCompleted: hrMissing.length === 0,
    fullyCompleted: workerMissing.length === 0 && hrMissing.length === 0,
    workerMissing: [...workerMissing],
    hrMissing: [...hrMissing],
    updatedAt: new Date().toISOString(),
  };
}

export function getWorkerOwnedLabels(): string[] {
  return WORKER_OWNED_FIELD_DEFS.map((f) => f.label);
}

export function getHrOwnedLabels(): string[] {
  return HR_OWNED_FIELD_DEFS.map((f) => f.label);
}

/** Roles que gestionan el equipo desde back office; no pasan por el gate de ficha trabajador. */
export const MANAGER_ROLES = new Set([
  'Admin',
  'Gerente',
  'Administrador',
  'Encargado',
  'Gestor',
  'Superadmin',
  'owner',
  'admin',
  'manager',
  'gerente',
]);

export function isManagerRole(role?: string | null): boolean {
  const normalized = String(role || '').trim();
  if (!normalized) return false;
  return MANAGER_ROLES.has(normalized) || MANAGER_ROLES.has(normalized.toLowerCase());
}

export function isWorkerProfileSubject(user?: Pick<AuthUser, 'accountType' | 'invitedBy' | 'linkedBusinessId' | 'role'> | null): boolean {
  if (!user) return false;
  if (user.accountType === 'company') return false;
  if (isManagerRole(user.role)) return false;
  if (user.accountType === 'user') return true;
  if (String(user.invitedBy || '').trim()) return true;
  if (user.linkedBusinessId && user.role) return true;
  return false;
}

/** Identidad mínima: DNI, nacimiento, teléfono y dirección (antes de invitación o uso del SaaS). */
export function hasMinimumWorkerIdentity(
  user?: Pick<AuthUser, 'phone' | 'personalData' | 'workerIdentityCompleted'> | null,
): boolean {
  if (!user) return false;
  if (user.workerIdentityCompleted) return true;
  if (!String(user.phone || '').trim()) return false;
  const pd = user.personalData;
  if (!String(pd?.dni || '').trim()) return false;
  if (!String(pd?.birthDate || '').trim()) return false;
  if (!String(pd?.address || '').trim()) return false;
  if (!String(pd?.city || '').trim()) return false;
  return true;
}

export function getWorkerIdentityMissingFields(
  user?: Pick<AuthUser, 'phone' | 'personalData' | 'workerIdentityCompleted'> | null,
): string[] {
  if (!user) return ['sesión'];
  if (user.workerIdentityCompleted) return [];
  const missing: string[] = [];
  if (!String(user.phone || '').trim()) missing.push('teléfono');
  const pd = user.personalData;
  if (!String(pd?.dni || '').trim()) missing.push('DNI / NIE');
  if (!String(pd?.birthDate || '').trim()) missing.push('fecha de nacimiento');
  if (!String(pd?.address || '').trim()) missing.push('dirección');
  if (!String(pd?.city || '').trim()) missing.push('ciudad');
  return missing;
}

export const WORKER_IDENTITY_SETUP_PATH = '/saas/worker/setup-profile';
export const WORKER_PAYROLL_SETUP_PATH = '/saas/worker/complete-payroll';
/** Antigua home «Mi Espacio» — redirigida a Mi trabajo. */
export const WORKER_LEGACY_HOME_PATH = '/saas/worker';
export const WORKER_DEFAULT_LANDING_PATH = '/saas/worker/tasks';
export const WORKER_UNLINKED_HOME_PATH = '/saas/user-dashboard';

/** Rutas accesibles para trabajador sin empresa vinculada. */
export const WORKER_UNLINKED_ALLOWED_PATHS = [
  WORKER_UNLINKED_HOME_PATH,
  '/saas/invitations',
  '/saas/worker/profile',
  '/saas/worker/security',
  '/saas/worker/notifications',
  WORKER_IDENTITY_SETUP_PATH,
  WORKER_PAYROLL_SETUP_PATH,
] as const;

/** Ítems de sidebar trabajador que requieren empresa vinculada. */
export const WORKER_BUSINESS_REQUIRED_ITEM_IDS = new Set([
  'worker-tpv',
  'worker-tasks',
  'worker-stock-review',
  'worker-calendar',
  'worker-clock',
  'worker-chat',
  'worker-docs',
  'worker-butcher-orders',
  'worker-onboarding',
  'worker-contract-info',
  'worker-position',
]);

export function userOwnsAnyBusiness(
  userId?: string | null,
  businesses?: ReadonlyArray<{ owner_user_id?: string | null }> | null,
): boolean {
  const uid = String(userId || '').trim();
  if (!uid || !businesses?.length) return false;
  return businesses.some((b) => String(b.owner_user_id || '').trim() === uid);
}

export function workerNeedsBusinessLink(
  user?: Pick<AuthUser, 'accountType' | 'invitedBy' | 'linkedBusinessId'> | null,
): boolean {
  if (!user) return false;
  const isWorker = user.accountType === 'user' || Boolean(String(user.invitedBy || '').trim());
  if (!isWorker) return false;
  return !String(user.linkedBusinessId || '').trim();
}

export function isWorkerUnlinkedAllowedPath(pathname: string): boolean {
  const path = String(pathname || '').trim();
  return WORKER_UNLINKED_ALLOWED_PATHS.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`),
  );
}

/** Rutas de onboarding puntual: no deben persistirse como landing tras login. */
export function isEphemeralWorkerSetupPath(path?: string | null): boolean {
  const trimmed = String(path || '').trim();
  return trimmed === WORKER_IDENTITY_SETUP_PATH || trimmed === WORKER_PAYROLL_SETUP_PATH;
}

export function normalizeWorkerLandingPage(path?: string | null): string {
  const trimmed = String(path || '').trim();
  if (!trimmed || trimmed === WORKER_LEGACY_HOME_PATH || isEphemeralWorkerSetupPath(trimmed)) {
    return WORKER_DEFAULT_LANDING_PATH;
  }
  return trimmed;
}

/** Destino al entrar en sesión (login, gate, rutas obsoletas). */
export function resolveWorkerSessionEntryPath(
  user?: Pick<
    AuthUser,
    | 'accountType'
    | 'linkedBusinessId'
    | 'landingPage'
    | 'invitedBy'
    | 'role'
    | 'workerProfileCompletion'
    | 'phone'
    | 'personalData'
    | 'employment'
    | 'workerIdentityCompleted'
  > | null,
): string {
  if (!user) return WORKER_DEFAULT_LANDING_PATH;
  if (user.accountType === 'company') return '/saas/dashboard';
  if (user.accountType === 'user' && !String(user.linkedBusinessId || '').trim()) {
    return '/saas/user-dashboard';
  }
  if (needsWorkerPayrollSetup(user)) return WORKER_PAYROLL_SETUP_PATH;
  const landing = String(user.landingPage || '').trim();
  if (landing.startsWith('/saas/') && !isEphemeralWorkerSetupPath(landing)) {
    return normalizeWorkerLandingPage(landing);
  }
  return WORKER_DEFAULT_LANDING_PATH;
}

export function getWorkerPayrollMissingIds(
  user?: Pick<AuthUser, 'personalData' | 'employment' | 'workerProfileCompletion'> | null,
): string[] {
  if (!user) return WORKER_PAYROLL_FIELD_DEFS.map((f) => f.id);
  const completion = user.workerProfileCompletion || computeWorkerProfileCompletion(user);
  const payrollIds = new Set(WORKER_PAYROLL_FIELD_DEFS.map((f) => f.id));
  return (completion.workerMissing || []).filter((id) => payrollIds.has(id as typeof WORKER_PAYROLL_FIELD_DEFS[number]['id']));
}

/** Solo campos de nómina (paso 2), no identidad (paso 1). */
export function hasWorkerPayrollFieldsComplete(
  user?: Pick<AuthUser, 'personalData' | 'employment' | 'workerProfileCompletion'> | null,
): boolean {
  return getWorkerPayrollMissingIds(user).length === 0;
}

/** Paso 2 (solo con empresa vinculada): identidad + nómina pendientes tras aceptar invitación. */
export function needsWorkerPayrollSetup(
  user?: Pick<AuthUser, 'linkedBusinessId' | 'accountType' | 'invitedBy' | 'role' | 'workerProfileCompletion' | 'phone' | 'personalData' | 'employment' | 'workerIdentityCompleted'> | null,
): boolean {
  if (!user) return false;
  if (!String(user.linkedBusinessId || '').trim()) return false;
  if (!isWorkerProfileSubject(user)) return false;
  if (!hasMinimumWorkerIdentity(user)) return true;
  return !hasWorkerPayrollFieldsComplete(user);
}

export function getWorkerPayrollMissingLabels(
  user?: Pick<AuthUser, 'workerProfileCompletion'> | null,
): string[] {
  const missing = user?.workerProfileCompletion?.workerMissing || [];
  return WORKER_PAYROLL_FIELD_DEFS
    .filter((f) => missing.includes(f.id))
    .map((f) => f.label);
}

export function resolveLandingAfterWorkerSetup(
  savedUser: Pick<AuthUser, 'accountType' | 'linkedBusinessId' | 'landingPage'>,
): string {
  if (savedUser.accountType === 'user' && !String(savedUser.linkedBusinessId || '').trim()) {
    return '/saas/user-dashboard';
  }
  if (String(savedUser.linkedBusinessId || '').trim()) {
    return WORKER_DEFAULT_LANDING_PATH;
  }
  const landing = String(savedUser.landingPage || '').trim();
  if (landing.startsWith('/saas/') && landing !== WORKER_IDENTITY_SETUP_PATH && landing !== WORKER_PAYROLL_SETUP_PATH) {
    return normalizeWorkerLandingPage(landing);
  }
  return '/saas/user-dashboard';
}

export function resolveRedirectAfterInvitationAccept(
  account: Pick<AuthUser, 'linkedBusinessId' | 'landingPage' | 'workerProfileCompletion' | 'phone' | 'personalData' | 'workerIdentityCompleted' | 'accountType' | 'invitedBy' | 'role'>,
): string {
  if (needsWorkerPayrollSetup(account)) {
    return WORKER_PAYROLL_SETUP_PATH;
  }
  const landing = String(account.landingPage || '').trim();
  if (landing.startsWith('/saas/') && landing !== WORKER_IDENTITY_SETUP_PATH && landing !== WORKER_PAYROLL_SETUP_PATH) {
    return normalizeWorkerLandingPage(landing);
  }
  return WORKER_DEFAULT_LANDING_PATH;
}

/** Evita bucle payroll setup mientras React sincroniza la sesión (30 s). */
export const WORKER_PAYROLL_BYPASS_KEY = 'vertial_worker_payroll_bypass';

export function markWorkerPayrollBypass(userId?: string): void {
  try {
    sessionStorage.setItem(WORKER_PAYROLL_BYPASS_KEY, String(Date.now()));
    if (userId) {
      sessionStorage.setItem(`${WORKER_PAYROLL_BYPASS_KEY}:done:${userId}`, '1');
    }
  } catch {
    /* ignore */
  }
}

export function hasWorkerPayrollBypass(userId?: string): boolean {
  try {
    if (userId && sessionStorage.getItem(`${WORKER_PAYROLL_BYPASS_KEY}:done:${userId}`) === '1') {
      return true;
    }
    const raw = sessionStorage.getItem(WORKER_PAYROLL_BYPASS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < 120_000;
  } catch {
    return false;
  }
}

export function clearWorkerPayrollBypass(userId?: string): void {
  try {
    sessionStorage.removeItem(WORKER_PAYROLL_BYPASS_KEY);
    if (userId) {
      sessionStorage.removeItem(`${WORKER_PAYROLL_BYPASS_KEY}:done:${userId}`);
    }
  } catch {
    /* ignore */
  }
}

/** Evita bucle setup → guardar → setup mientras React sincroniza la sesión (30 s). */
export const WORKER_IDENTITY_BYPASS_KEY = 'vertial_worker_identity_bypass';

export function markWorkerIdentityBypass(): void {
  try {
    sessionStorage.setItem(WORKER_IDENTITY_BYPASS_KEY, String(Date.now()));
  } catch {
    /* storage no disponible */
  }
}

export function hasWorkerIdentityBypass(): boolean {
  try {
    const raw = sessionStorage.getItem(WORKER_IDENTITY_BYPASS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < 30_000;
  } catch {
    return false;
  }
}

export function clearWorkerIdentityBypass(): void {
  try {
    sessionStorage.removeItem(WORKER_IDENTITY_BYPASS_KEY);
  } catch {
    /* ignore */
  }
}

/** Salir de los gates de ficha (evita bucles). */
export const WORKER_GATES_SKIPPED_KEY = 'vertial_worker_gates_skipped';

export function skipWorkerProfileGates(userId: string): void {
  const id = String(userId || '').trim();
  if (!id) return;
  try {
    localStorage.setItem(`${WORKER_GATES_SKIPPED_KEY}:${id}`, '1');
    markWorkerIdentityBypass();
    markWorkerPayrollBypass(id);
  } catch {
    /* ignore */
  }
}

export function hasSkippedWorkerProfileGates(userId?: string): boolean {
  const id = String(userId || '').trim();
  if (!id) return false;
  try {
    return localStorage.getItem(`${WORKER_GATES_SKIPPED_KEY}:${id}`) === '1';
  } catch {
    return false;
  }
}
