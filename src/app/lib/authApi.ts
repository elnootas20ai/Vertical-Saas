import { getApiBase } from './apiBase';
// S-07: Sesión activa (dispositivo)
export interface ActiveSession {
  sessionId: string;
  deviceInfo: {
    browser: string;
    os: string;
    device: string;
  };
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface AgentSkin {
  id: string;
  name: string;
  headerBg: string;
  avatarBg: string;
  accentBorder: string;
  badgeBg: string;
  badgeText: string;
  dot: string;
  accentColor: string;
}

export interface AgentMCP {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  autoAssigned?: boolean;
}

export interface AuthUser {
  id: string;
  user_id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  avatar: string;
  accountType: 'user' | 'company';
  role: string;
  status?: 'active' | 'pending' | 'inactive';
  inviteStatus?: 'pending' | 'accepted';
  invitedBy?: string;
  companyName: string;
  provider?: string;
  password?: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  onboardingCompleted: boolean;
  onboardingData?: Record<string, unknown>;
  emailVerified: boolean;
  /** Definido por el servidor: solo true para la cuenta que puede usar el plan simulado (dev). */
  devPlanSwitcher?: boolean;
  paymentSummary?: BillingPaymentSummary;
  subscription?: BillingSubscription;
  permissions?: AccountPermissionMatrix;
  employment?: EmploymentInfo;
  personalData?: PersonalData;
  workerProfileCompletion?: WorkerProfileCompletion;
  /** true cuando DNI, nacimiento, teléfono y dirección están completos */
  workerIdentityCompleted?: boolean;
  recentActivity?: AccountActivityItem[];
  skinId?: string;
  animationId?: string;
  mcps?: AgentMCP[];
  googleId?: string | null;
  googleScopes?: string[] | null;
  googleProfile?: {
    locale?: string;
    picture?: string;
    name?: string;
  } | null;
  appleId?: string | null;
  landingPage?: string;
  linkedBusinessId?: string;
  username?: string;
}

/** Cuenta invitada al equipo (trabajador), no titular de suscripción. */
export function isWorkerAccount(
  user?: Pick<AuthUser, 'accountType' | 'invitedBy'> | null,
): boolean {
  if (!user) return false;
  // Titular empresa / CEO: nunca tratar como trabajador (aunque invitedBy/linked queden sucios).
  if (user.accountType === 'company') return false;
  return user.accountType === 'user' || Boolean(String(user.invitedBy || '').trim());
}

/** Titular CEO / empresa (no trabajador invitado). */
export function isCompanyAccount(
  user?: Pick<AuthUser, 'accountType'> | null,
): boolean {
  return Boolean(user && user.accountType === 'company');
}

export interface AccountPermissionValue {
  view: boolean;
  edit: boolean;
}

export type AccountPermissionMatrix = Record<string, AccountPermissionValue>;

export interface EmploymentSkill {
  id: string;
  name: string;
  level: number; // 1-5
}

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

export interface EmploymentInfo {
  department: string;
  position: string;
  schedule: string;
  notes: string;
  skills: EmploymentSkill[];
  startDate: string;
  endDate?: string;
  terminationReason?: string;
  terminationType?: 'voluntary' | 'dismissal' | 'end_of_contract' | 'mutual_agreement';
  contractType: string;
  workday: string;
  /** Horas semanales de contrato (p. ej. 40 completa, 20 media). Vacaciones se prorratean con esto. */
  hoursPerWeek?: number;
  salary: string;
  bankAccount: string;
  bankName: string;
  emergencyContact: string;
  emergencyPhone: string;
  salesPointId?: string;
  contributionGroup?: string;
  mutualInsurance?: string;
  // Labor cost
  grossSalary?: number;
  payPeriodsPerYear?: number;
  socialSecurityCost?: number;
  /** Tipo SS trabajador (0–0.2), p. ej. 0.0635. */
  employeeSsRate?: number;
  /** Tipo IRPF estimado (0–0.5), p. ej. 0.15. */
  irpfRate?: number;
  otherCosts?: number;
  costCurrency?: string;
  costPeriod?: 'monthly' | 'annual';
  lastCostReview?: string;
  nextCostReview?: string;
  // Productivity
  baseProductivity?: {
    type: 'hours' | 'units' | 'revenue' | 'custom';
    target: number;
    unit: string;
    period: 'daily' | 'weekly' | 'monthly';
  };
  // Assignments
  assignments?: WorkerAssignment[];
}

export interface WorkerAssignment {
  id: string;
  type: 'branch' | 'work_center' | 'project' | 'client';
  entityId: string;
  entityName: string;
  startDate: string;
  endDate?: string;
  isPrimary: boolean;
  status: 'active' | 'ended';
}

export interface AccountActivityItem {
  id: string;
  type: string;
  action: string;
  entityId?: string;
  entityLabel?: string;
  actorUserId?: string;
  actorName?: string;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface BillingPaymentSummary {
  cardId: string;
  lastFourDigits: string;
  cardHolderName: string;
  expiryDate: string;
  billingMode: string;
  selectedPlanId: string;
}

export interface BillingSubscription {
  status:
    | 'pending_payment'
    | 'payment_sent'
    | 'trial_active'
    | 'trial_expiring'
    | 'trial_expired'
    | 'subscription_active'
    | 'payment_failed'
    | 'grace_period'
    | 'suspended';
  planName: string;
  selectedPlanId?: string;
  billingMode?: 'monthly' | 'annual';
  trialEndsAt?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  gracePeriodEndsAt?: string;
  lastPaymentAt?: string;
  cancelAtPeriodEnd: boolean;
  moneiSubscriptionId?: string;
  moneiSubscriptionStatus?: string;
  moneiPaymentId?: string;
  /** PDV adicionales sin cobro (solo editable por superadmin). */
  extraPointOfSaleSlots?: number;
  /** Marcas comerciales extra sin cobro (solo superadmin; no cuenta la marca «General»). */
  extraCommercialBrandSlots?: number;
  /** Empresas extra contratadas o concedidas por admin. */
  extraBusinessSlots?: number;
  /** Trabajadores extra (además del maxUsers del plan). */
  extraWorkerSlots?: number;
  extraTpvTabletSlots?: number;
  /** PRO manual sin pasarela (solo superadmin). */
  adminProAccess?: boolean;
  /** Exento de suspensión automática por MONEI/cron. */
  billingExempt?: boolean;
  paymentConcept?: string;
  paymentSentAt?: string;
  paymentProvider?: string;
  activationDate?: string;
}

export interface BillingCard {
  id: string;
  user_id: string;
  cardNumber: string;
  cardHolderName: string;
  expiryDate: string;
  cvv: string;
  lastFourDigits: string;
  billingMode: string;
  selectedPlanId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password?: string;
  googleCredential?: string;
  appleCredential?: string;
  accountType?: 'user' | 'company';
  referralCode?: string;
}

export interface JoinRequest {
  _id: string;
  request_id: string;
  user_id: string;
  userFullName: string;
  userEmail: string;
  business_id: string;
  businessName: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  reviewedBy: string;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamInvitation {
  invitationId: string;
  email: string;
  fullName: string;
  phone?: string;
  businessId: string;
  businessName: string;
  role: string;
  permissions: AccountPermissionMatrix | null;
  landingPage: string;
  employment: Partial<EmploymentInfo> | null;
  scheduleTemplateId?: string;
  invitedBy: string;
  invitedByName: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'revoked';
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessSearchResult {
  business_id: string;
  name: string;
  legalName: string;
  city: string;
  businessType: string;
  logo: string;
}

export interface GoogleUserProfile {
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatar: string;
  googleId: string;
  locale: string;
  emailVerified: boolean;
}

export interface AppleUserProfile {
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  appleId: string;
  emailVerified: boolean;
}

export interface RoleDefinition {
  id: string;
  description: string;
  permissions: string[];
  users: number;
}

interface ApiEnvelope<T> {
  ok: boolean;
  error?: string;
  code?: string;
  lockUntil?: string;
  user?: T;
  users?: T[];
  roles?: RoleDefinition[];
  card?: BillingCard;
  activities?: AccountActivityItem[];
  activity?: AccountActivityItem;
  sessions?: ActiveSession[];
  generatedPassword?: string;
  emailSent?: boolean;
  redirectTo?: string;
  accessToken?: string;
  refreshToken?: string;
  message?: string;
  onboardingCompleted?: boolean;
  onboardingData?: Record<string, unknown>;
  googleUser?: GoogleUserProfile;
  invitation?: TeamInvitation;
  invitations?: TeamInvitation[];
  isExistingUser?: boolean;
  inviteExpiresAt?: string;
  pendingInvitationsCount?: number;
  companyCode?: string;
}

// ── Configuración base de la API ──────────────────────────────────────────────


const API_BASE = getApiBase();

// ── Gestión de tokens ─────────────────────────────────────────────────────────
// S-01: Los tokens JWT se almacenan en cookies httpOnly gestionadas por el backend.
// El frontend NO almacena tokens — las cookies se envían automáticamente con credentials:'include'.

let _onUnauthorized: (() => void) | null = null;

const TOKEN_STORAGE_KEY = 'vertial_access_token';
const REFRESH_STORAGE_KEY = 'vertial_refresh_token';
/** Señal cross-tab: otra pestaña cambió de cuenta (evita refresh zombie con tokens viejos en memoria). */
const AUTH_TAB_SIGNAL_KEY = 'vertial_auth_tab_signal';
const AUTH_TAB_CHANNEL = 'vertial_auth_tab';

function readBrowserStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let _inMemoryToken: string | null = readBrowserStorage(TOKEN_STORAGE_KEY);
let _inMemoryRefreshToken: string | null = readBrowserStorage(REFRESH_STORAGE_KEY);

/** Sube en logout / cambio de cuenta: invalida refreshes en vuelo. */
let _authSessionEpoch = 0;

export function bumpAuthSessionEpoch(): number {
  _authSessionEpoch += 1;
  return _authSessionEpoch;
}

/**
 * localStorage es la fuente de verdad entre pestañas.
 * La memoria de una pestaña puede quedarse con el refresh de María mientras otra
 * ya hizo login admin → ese refresh zombie pisaba cookies + tokens de admin.
 */
export function loadStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  _inMemoryToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  _inMemoryRefreshToken = localStorage.getItem(REFRESH_STORAGE_KEY);
  return { accessToken: _inMemoryToken, refreshToken: _inMemoryRefreshToken };
}

function broadcastAuthTabSignal(reason: string) {
  const stamp = `${Date.now()}:${reason}`;
  try {
    localStorage.setItem(AUTH_TAB_SIGNAL_KEY, stamp);
  } catch {
    /* ignore quota */
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(AUTH_TAB_CHANNEL);
      channel.postMessage({ type: 'auth-account-switch', reason, stamp });
      channel.close();
    }
  } catch {
    /* ignore */
  }
}

/** Otras pestañas: invalidar refresh en vuelo y alinear memoria con localStorage. */
function adoptTokensFromOtherTab() {
  bumpAuthSessionEpoch();
  loadStoredTokens();
}

let _crossTabAuthGuardInstalled = false;

/** Escucha cambios de tokens/cuenta en otras pestañas del mismo origen. */
export function installCrossTabAuthGuard() {
  if (_crossTabAuthGuardInstalled || typeof window === 'undefined') return;
  _crossTabAuthGuardInstalled = true;

  window.addEventListener('storage', (event) => {
    if (
      event.key === TOKEN_STORAGE_KEY
      || event.key === REFRESH_STORAGE_KEY
      || event.key === AUTH_TAB_SIGNAL_KEY
    ) {
      adoptTokensFromOtherTab();
    }
  });

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(AUTH_TAB_CHANNEL);
      channel.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type?: string } | null;
        if (data?.type === 'auth-account-switch') {
          adoptTokensFromOtherTab();
        }
      });
    }
  } catch {
    /* ignore */
  }
}

export function cacheAccessToken(token: string | null) {
  _inMemoryToken = token;
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function cacheRefreshToken(token: string | null) {
  _inMemoryRefreshToken = token;
  if (token) {
    localStorage.setItem(REFRESH_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  }
}

export function getAuthHeaders(): Record<string, string> {
  // Siempre alinear con localStorage: otra pestaña puede haber cambiado de cuenta.
  loadStoredTokens();
  return _inMemoryToken ? { Authorization: `Bearer ${_inMemoryToken}` } : {};
}

export function setAuthTokens(tokens: { accessToken: string; refreshToken?: string }) {
  bumpAuthSessionEpoch();
  cacheAccessToken(tokens.accessToken);
  if (tokens.refreshToken) {
    cacheRefreshToken(tokens.refreshToken);
  }
  broadcastAuthTabSignal('set-tokens');
}

export function clearAuthTokens() {
  bumpAuthSessionEpoch();
  _inMemoryToken = null;
  _inMemoryRefreshToken = null;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_STORAGE_KEY);
  broadcastAuthTabSignal('clear-tokens');
}

export function setOnUnauthorized(callback: () => void) {
  _onUnauthorized = callback;
}

export function triggerUnauthorized() {
  cacheAccessToken(null);
  cacheRefreshToken(null);
  _onUnauthorized?.();
}

// El refresh usa cookie httpOnly cuando existe; en tablet/Capacitor a menudo no llega
// (cross-site) → enviamos también el refreshToken persistido en el dispositivo.
// Lock para evitar refreshes paralelos que invalidan la sesión por rotación.
//
// 'refreshed'  → token renovado
// 'rejected'   → el servidor rechazó el refresh: la sesión ya no es válida
// 'network'    → no se pudo contactar con el servidor (red saturada/corte): NO cerrar sesión
type RefreshOutcome = 'refreshed' | 'rejected' | 'network';

let _refreshPromise: Promise<RefreshOutcome> | null = null;

/** Segundos restantes del access JWT (null si no hay token o no se puede leer). */
export function getAccessTokenSecondsLeft(): number | null {
  if (!_inMemoryToken) {
    _inMemoryToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  }
  const token = _inMemoryToken;
  if (!token) return null;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const json = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (!json.exp) return null;
    return Math.floor(json.exp - Date.now() / 1000);
  } catch {
    return null;
  }
}

/**
 * Renueva el access token si está cerca de caducar (TPV: JWT suele ser 15m).
 * Seguro llamar en paralelo: usa el mismo lock que tryRefreshToken.
 */
export async function ensureFreshAccessToken(minSecondsLeft = 120): Promise<RefreshOutcome | 'ok'> {
  loadStoredTokens();
  const left = getAccessTokenSecondsLeft();
  if (left == null) {
    // Sin exp legible: intentar refresh si hay refresh token guardado.
    if (_inMemoryRefreshToken || localStorage.getItem(REFRESH_STORAGE_KEY)) {
      return tryRefreshToken();
    }
    return 'ok';
  }
  if (left > minSecondsLeft) return 'ok';
  return tryRefreshToken();
}

let _keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let _keepaliveOnVis: (() => void) | null = null;

/** Mantiene viva la sesión en TPV/tablet mientras la pestaña esté abierta. */
export function startAuthSessionKeepalive() {
  stopAuthSessionKeepalive();
  const tick = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void ensureFreshAccessToken(180);
  };
  // Access típico 15m → renovar cada 5 min y al volver a primer plano.
  _keepaliveTimer = setInterval(tick, 5 * 60 * 1000);
  _keepaliveOnVis = tick;
  tick();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', tick);
  }
}

export function stopAuthSessionKeepalive() {
  if (_keepaliveTimer) {
    clearInterval(_keepaliveTimer);
    _keepaliveTimer = null;
  }
  if (_keepaliveOnVis && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', _keepaliveOnVis);
    _keepaliveOnVis = null;
  }
}

async function tryRefreshToken(): Promise<RefreshOutcome> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const epochAtStart = _authSessionEpoch;
    try {
      // Siempre leer localStorage (otra pestaña pudo cambiar de cuenta).
      loadStoredTokens();
      const refreshUsed = _inMemoryRefreshToken;

      const runOnce = async (credentials: RequestCredentials): Promise<{
        status: number;
        ok: boolean;
        payload: ApiEnvelope<AuthUser>;
      }> => {
        const response = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials,
          headers: {
            'Content-Type': 'application/json',
            ...(_inMemoryToken ? { Authorization: `Bearer ${_inMemoryToken}` } : {}),
          },
          body: JSON.stringify(
            _inMemoryRefreshToken ? { refreshToken: _inMemoryRefreshToken } : {},
          ),
        });
        const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<AuthUser>;
        return { status: response.status, ok: response.ok && payload.ok === true, payload };
      };

      const applyOk = (payload: ApiEnvelope<AuthUser>) => {
        // Login/logout durante el refresh: no reinstalar tokens de la cuenta vieja.
        if (epochAtStart !== _authSessionEpoch) {
          loadStoredTokens();
          return 'rejected' as const;
        }
        // Otra pestaña ya escribió otro refresh en localStorage: no pisar su cuenta.
        const currentLsRefresh = localStorage.getItem(REFRESH_STORAGE_KEY);
        if (currentLsRefresh && refreshUsed && currentLsRefresh !== refreshUsed) {
          loadStoredTokens();
          return 'rejected' as const;
        }
        if (payload.accessToken) {
          setAuthTokens({
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken,
          });
        }
        return 'refreshed' as const;
      };

      let result = await runOnce('include');
      if (result.ok) return applyOk(result.payload);

      // Cookie httpOnly antigua puede ganar en servers viejos: reintentar solo con body.
      if (
        _inMemoryRefreshToken &&
        (result.status === 401 || result.status === 400)
      ) {
        result = await runOnce('omit');
        if (result.ok) return applyOk(result.payload);
      }

      // 5xx / gateway / rate-limit: no concluyente, mantener la sesión.
      if (result.status >= 500 || result.status === 429) return 'network' as const;
      // Sin cookie ni body en tablet: no tratar como “sesión muerta” si aún hay access token local.
      if (result.status === 400 && _inMemoryToken) return 'network' as const;
      return 'rejected' as const;
    } catch {
      return 'network' as const;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

export type AuthFetchOptions = {
  /** Si true, un 401 tras refresh rechazado no dispara logout (sync en segundo plano). */
  suppressLogout?: boolean;
};

/**
 * Wrapper de fetch para rutas autenticadas:
 * - Adjunta Authorization si hay access token en memoria.
 * - Ante 401 intenta un refresh una vez y reintenta la petición.
 */
export async function authFetch(
  input: string,
  init?: RequestInit,
  attempt = 0,
  authRetried = false,
  options: AuthFetchOptions = {},
): Promise<Response> {
  // Renovar antes de caducar para no interrumpir el TPV a los ~15 min.
  if (!authRetried) {
    await ensureFreshAccessToken(90);
  }

  // Alinear con localStorage (otra pestaña pudo cambiar de cuenta).
  loadStoredTokens();
  const headers = new Headers(init?.headers || {});
  if (_inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${_inMemoryToken}`);
  }

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      credentials: 'include',
      headers,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error('La petición ha tardado demasiado. Inténtalo de nuevo.');
    }
    const isNetwork = err instanceof TypeError
      || (err instanceof Error && /failed to fetch|network|load failed/i.test(err.message));
    if (isNetwork && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return authFetch(input, init, attempt + 1, authRetried, options);
    }
    throw err;
  }

  if (response.status === 401 && !authRetried) {
    const refreshed = await tryRefreshToken();
    if (refreshed === 'refreshed') {
      return authFetch(input, init, attempt, true, options);
    }
    // Fallo de red ≠ sesión muerta: no devolver 401 (los callers muestran "Sesión expirada").
    if (refreshed === 'network') {
      throw new TypeError('No hay conexión con el servidor. Inténtalo de nuevo en unos segundos.');
    }
    // Solo cerrar sesión si el servidor rechazó el refresh.
    if (refreshed === 'rejected' && !options.suppressLogout) {
      _onUnauthorized?.();
    }
  }

  return response;
}

// ── Cliente HTTP con renovación automática de token ───────────────────────────

export function extractApiErrorMessage(payload: Record<string, unknown> | ApiEnvelope<unknown>): string {
  const err = payload.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
    if (typeof obj.reason === 'string' && obj.reason.trim()) return obj.reason.trim();
  }
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  return '';
}

async function request<T>(
  path: string,
  init?: RequestInit,
  _retried = false,
  _networkAttempt = 0,
): Promise<ApiEnvelope<T>> {
  if (!_retried) {
    await ensureFreshAccessToken(90);
  }

  if (!_inMemoryToken) {
    _inMemoryToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  }
  const extraHeaders: Record<string, string> = {};
  if (_inMemoryToken) {
    extraHeaders['Authorization'] = `Bearer ${_inMemoryToken}`;
  }

  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
        ...(init?.headers || {}),
      },
      ...init,
    });
  } catch (err) {
    const isNetwork = err instanceof TypeError
      || (err instanceof Error && /failed to fetch|network|load failed/i.test(err.message));
    if (isNetwork && _networkAttempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (_networkAttempt + 1)));
      return request<T>(path, init, _retried, _networkAttempt + 1);
    }
    throw new Error('No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.');
  }

  const rawText = await response.text();
  let payload = {} as ApiEnvelope<T>;
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as ApiEnvelope<T>;
    } catch {
      payload = { ok: false, error: rawText.slice(0, 300) } as ApiEnvelope<T>;
    }
  }

  if (response.status === 401) {
    const authErr = extractApiErrorMessage(payload as Record<string, unknown>);
    // Intentar refresh en cualquier 401 (no solo TOKEN_EXPIRED): en tablet
    // a veces llega un 401 genérico y antes se cerraba sesión sin renovar.
    if (!_retried) {
      const refreshed = await tryRefreshToken();
      if (refreshed === 'refreshed') {
        return request<T>(path, init, true, _networkAttempt);
      }
      if (refreshed === 'network') {
        // Sin conexión con el servidor: no cerrar sesión, dejar que el llamador reintente.
        throw new Error('No hay conexión con el servidor. Inténtalo de nuevo en unos segundos.');
      }
    }
    if (authErr) {
      throw new Error(authErr);
    }
    _onUnauthorized?.();
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    const fromPayload = extractApiErrorMessage(payload as Record<string, unknown>);
    const payloadRec = payload as Record<string, unknown>;
    const nestedErr = payloadRec.error && typeof payloadRec.error === 'object'
      ? (payloadRec.error as Record<string, unknown>)
      : null;
    const code = String(payloadRec.code || nestedErr?.code || '').trim();
    const message = fromPayload
      || (() => {
        const statusBit = `${response.status} ${response.statusText || ''}`.trim();
        const bodyBit = rawText && typeof payload.error !== 'string'
          ? rawText.replace(/\s+/g, ' ').trim().slice(0, 200)
          : '';
        return bodyBit
          ? `${statusBit}: ${bodyBit}`
          : 'No se pudo completar la solicitud. Inténtalo de nuevo.';
      })();
    const err = new Error(message) as Error & { code?: string; status?: number };
    if (code) err.code = code;
    err.status = response.status;
    throw err;
  }

  return payload as ApiEnvelope<T>;
}

/**
 * Login / registro público: NO reintenta con refresh de sesión.
 * Si no, un 401 de contraseña incorrecta + token viejo reenviaba el login
 * y el servidor contaba 2 fallos por cada intento (o ensuciaba el contador tras un acierto).
 */
export class AuthRequestError extends Error {
  status: number;
  code?: string;
  lockUntil?: string;

  constructor(message: string, opts?: { status?: number; code?: string; lockUntil?: string }) {
    super(message);
    this.name = 'AuthRequestError';
    this.status = opts?.status ?? 400;
    this.code = opts?.code;
    this.lockUntil = opts?.lockUntil;
  }
}

async function publicAuthRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    });
  } catch (err) {
    throw new Error('No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.');
  }

  const rawText = await response.text();
  let payload = {} as ApiEnvelope<T>;
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as ApiEnvelope<T>;
    } catch {
      payload = { ok: false, error: rawText.slice(0, 300) } as ApiEnvelope<T>;
    }
  }

  if (!response.ok || payload.ok === false) {
    const fromPayload = extractApiErrorMessage(payload as Record<string, unknown>);
    throw new AuthRequestError(
      fromPayload || 'Ahora mismo no podemos conectar. Inténtalo de nuevo en unos minutos.',
      {
        status: response.status,
        code: typeof payload.code === 'string' ? payload.code : undefined,
        lockUntil: typeof payload.lockUntil === 'string' ? payload.lockUntil : undefined,
      },
    );
  }

  return payload as ApiEnvelope<T>;
}

// ── Endpoints de autenticación ────────────────────────────────────────────────

export async function loginRequest(email: string, password: string) {
  const result = await publicAuthRequest<AuthUser>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  // Paso OTP admin: contraseña OK pero aún no hay sesión
  if ((result as { requiresLoginCode?: boolean }).requiresLoginCode) {
    return result;
  }
  if (result.accessToken) {
    setAuthTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }
  return result;
}

export async function registerRequest(data: RegisterPayload) {
  return request<
    AuthUser & { redirectTo?: string; pendingInvitationsCount?: number; verificationEmailSent?: boolean }
  >('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface GoogleLoginResult {
  ok: boolean;
  code?: string;
  error?: string;
  user?: AuthUser;
  googleUser?: GoogleUserProfile;
  redirectTo?: string;
  accessToken?: string;
  refreshToken?: string;
}

const GOOGLE_LOGIN_FETCH_MS = 30_000;

export async function googleLoginRequest(credential: string): Promise<GoogleLoginResult> {
  const extraHeaders: Record<string, string> = {};
  if (_inMemoryToken) {
    extraHeaders['Authorization'] = `Bearer ${_inMemoryToken}`;
  }

  const url = `${API_BASE}/api/auth/google-login`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({ credential }),
      signal: AbortSignal.timeout(GOOGLE_LOGIN_FETCH_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return {
        ok: false,
        error: 'El acceso con Google está tardando demasiado. Inténtalo de nuevo o usa email y contraseña.',
      };
    }
    return {
      ok: false,
      error: 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',
    };
  }

  const rawText = await response.text();
  let payload = {} as GoogleLoginResult;
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as GoogleLoginResult;
    } catch {
      payload = {
        ok: false,
        error: rawText.replace(/\s+/g, ' ').trim().slice(0, 240) || 'No se pudo completar el acceso. Inténtalo de nuevo.',
      };
    }
  }

  if (response.status === 404 && payload.code === 'GOOGLE_ACCOUNT_NOT_FOUND') {
    return payload;
  }

  if (!response.ok || payload.ok === false) {
    return {
      ok: false,
      error:
        (typeof payload.error === 'string' && payload.error.trim())
        || (typeof payload.message === 'string' && payload.message.trim())
        || `${response.status} ${response.statusText || ''}`.trim()
        || 'Error al acceder con Google',
    };
  }

  if (payload.accessToken) {
    setAuthTokens({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
    });
  }

  return payload;
}

export interface AppleLoginResult {
  ok: boolean;
  code?: string;
  error?: string;
  user?: AuthUser;
  appleUser?: AppleUserProfile;
  redirectTo?: string;
  accessToken?: string;
  refreshToken?: string;
}

export async function appleLoginRequest(
  identityToken: string,
  profile?: { givenName?: string; familyName?: string },
): Promise<AppleLoginResult> {
  const extraHeaders: Record<string, string> = {};
  if (_inMemoryToken) {
    extraHeaders['Authorization'] = `Bearer ${_inMemoryToken}`;
  }

  const url = `${API_BASE}/api/auth/apple-login`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({
        identityToken,
        givenName: profile?.givenName,
        familyName: profile?.familyName,
      }),
      signal: AbortSignal.timeout(GOOGLE_LOGIN_FETCH_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return {
        ok: false,
        error: 'El acceso con Apple está tardando demasiado. Inténtalo de nuevo o usa email y contraseña.',
      };
    }
    return {
      ok: false,
      error: 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',
    };
  }

  const rawText = await response.text();
  let payload = {} as AppleLoginResult;
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as AppleLoginResult;
    } catch {
      payload = {
        ok: false,
        error: rawText.replace(/\s+/g, ' ').trim().slice(0, 240) || 'Respuesta no JSON del servidor',
      };
    }
  }

  if (response.status === 404 && payload.code === 'APPLE_ACCOUNT_NOT_FOUND') {
    return payload;
  }

  if (!response.ok || payload.ok === false) {
    return {
      ok: false,
      error:
        (typeof payload.error === 'string' && payload.error.trim())
        || `${response.status} ${response.statusText || ''}`.trim()
        || 'Error al acceder con Apple',
    };
  }

  if (payload.accessToken) {
    setAuthTokens({
      accessToken: payload.accessToken,
      refreshToken: (payload as AppleLoginResult & { refreshToken?: string }).refreshToken,
    });
  }

  return payload;
}

export interface TeamLoginResult extends ApiEnvelope<AuthUser> {
  business?: {
    business_id: string;
    name: string;
    logo: string;
    companyCode: string;
  };
}

export async function teamLoginRequest(companyCode: string, username: string, password: string): Promise<TeamLoginResult> {
  const result = await publicAuthRequest<AuthUser>('/api/auth/team-login', {
    method: 'POST',
    body: JSON.stringify({ companyCode, username, password }),
  }) as TeamLoginResult;
  if (result.accessToken) {
    setAuthTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }
  return result;
}

export interface PosSwitchResult extends ApiEnvelope<AuthUser> {
  business?: {
    business_id: string;
    name: string;
    logo: string;
  };
  switchedFrom?: string;
}

export async function posSwitchUserRequest(username: string, password: string): Promise<PosSwitchResult> {
  const result = await request<AuthUser>('/api/auth/pos-switch', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }) as PosSwitchResult;
  if (result.accessToken) {
    setAuthTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }
  return result;
}

export async function recoverPasswordRequest(email: string) {
  return request<AuthUser>('/api/auth/recover', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function requestLoginCodeRequest(email: string) {
  return publicAuthRequest<AuthUser>('/api/auth/login-code/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyLoginCodeRequest(email: string, code: string) {
  const result = await publicAuthRequest<AuthUser>('/api/auth/login-code/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  if (result.accessToken) {
    setAuthTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }
  return result;
}

export async function resetPasswordRequest(token: string, email: string, newPassword: string) {
  return request<AuthUser>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, email, newPassword }),
  });
}

// ── Endpoints protegidos ──────────────────────────────────────────────────────

export async function updateProfileRequest(userId: string, data: Partial<AuthUser>) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updatePasswordRequest(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/password`, {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function listUsersRequest(businessId?: string) {
  const qs = businessId ? `?businessId=${encodeURIComponent(businessId)}` : '';
  return request<AuthUser>(`/api/auth/users${qs}`);
}

/** Ficha admin: un usuario por id (super-admin lista completa; resto según alcance del listado). */
export async function getUserByIdRequest(userId: string): Promise<ApiEnvelope<AuthUser>> {
  const id = String(userId || '').trim();
  if (!id) {
    return { ok: false, error: 'Falta el id del cliente' };
  }
  const data = await listUsersRequest();
  const users = Array.isArray(data.users) ? data.users : [];
  const user = users.find((u) => {
    const uid = String(u.user_id || u.id || '').trim();
    return uid === id;
  });
  if (!user) {
    return { ok: false, error: 'No se encontró esta cuenta en el panel admin.' };
  }
  return { ok: true, user };
}

export async function listRolesRequest() {
  return request<AuthUser>('/api/auth/roles');
}

export async function saveBillingCardRequest(
  userId: string,
  data: {
    cardNumber: string;
    cardHolderName: string;
    expiryDate: string;
    cvv: string;
    billingMode: string;
    selectedPlanId: string;
  },
) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/card`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function activateOnboardingTrialRequest(
  userId: string,
  data: {
    billingMode: string;
    selectedPlanId: string;
  },
) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/onboarding/activate-trial`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getBillingCardRequest(userId: string) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/card`);
}

export async function inviteUserRequest(data: {
  name?: string;
  email: string;
  role?: string;
  phone?: string;
  invitedBy?: string;
  companyName?: string;
  businessId?: string;
  permissions?: AccountPermissionMatrix;
  landingPage?: string;
  position?: string;
  contractType?: string;
  grossMonthlySalary?: string;
  payPeriodsPerYear?: number;
  workCenterId?: string;
  scheduleTemplateId?: string;
  message?: string;
}) {
  return request<AuthUser & {
    invitation?: TeamInvitation;
    isExistingUser?: boolean;
    emailSent?: boolean;
    inviteExpiresAt?: string;
    companyCode?: string;
  }>('/api/auth/invite', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface InviteLookupResult {
  exists: boolean;
  email?: string;
  fullName?: string;
  alreadyMember?: boolean;
  isOwner?: boolean;
  ownsOtherBusinessName?: string;
  isCompanyAccount?: boolean;
  accountType?: string;
  code?: string;
}

/**
 * Comprueba en vivo si un email está registrado en Vertial antes de invitarlo.
 * Devuelve también si esa cuenta ya es miembro/propietario del negocio o de otro,
 * para mostrar el feedback adecuado en el modal de invitación.
 */
export async function lookupInviteEmailRequest(
  email: string,
  businessId?: string,
): Promise<InviteLookupResult> {
  const response = await request<AuthUser>('/api/auth/invite/lookup', {
    method: 'POST',
    body: JSON.stringify({ email, businessId: businessId || '' }),
  });
  const data = response as ApiEnvelope<AuthUser> & InviteLookupResult;
  return {
    exists: Boolean(data.exists),
    email: data.email,
    fullName: data.fullName,
    alreadyMember: Boolean(data.alreadyMember),
    isOwner: Boolean(data.isOwner),
    ownsOtherBusinessName: data.ownsOtherBusinessName || '',
    isCompanyAccount: Boolean(data.isCompanyAccount),
    accountType: data.accountType,
    code: data.code,
  };
}

// ─── Preferencias personales de notificación ────────────────────────────────

export interface ClockinNotificationPreferences {
  onEntry: boolean;
  onLate: boolean;
  onEarlyEntry: boolean;
  onExit: boolean;
  onEarlyExit: boolean;
  onBreaks: boolean;
  onLongBreak: boolean;
}

export interface TeamNotificationPreferences {
  onIdentityCompleted: boolean;
  onWorkerProfileCompleted: boolean;
}

export interface PushConsentPreferences {
  decision: 'unset' | 'accepted' | 'declined';
  decidedAt?: string | null;
  /** Solo servidor: permitir bajar de accepted → declined */
  force?: boolean;
}

export interface NotificationPreferences {
  clockin: ClockinNotificationPreferences;
  team: TeamNotificationPreferences;
  pushConsent?: PushConsentPreferences;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  clockin: {
    onEntry: true,
    onLate: true,
    onEarlyEntry: false,
    onExit: true,
    onEarlyExit: true,
    onBreaks: false,
    onLongBreak: true,
  },
  team: {
    onIdentityCompleted: true,
    onWorkerProfileCompleted: true,
  },
  pushConsent: {
    decision: 'unset',
    decidedAt: null,
  },
};

export async function getNotificationPreferencesRequest(): Promise<NotificationPreferences> {
  const response = await request<unknown>('/api/auth/preferences');
  const data = response as ApiEnvelope<unknown> & { notificationPreferences?: NotificationPreferences };
  return data.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function updateNotificationPreferencesRequest(
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const response = await request<unknown>('/api/auth/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ notificationPreferences: prefs }),
  });
  const data = response as ApiEnvelope<unknown> & { notificationPreferences?: NotificationPreferences };
  return data.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function listMyInvitationsRequest() {
  return request<AuthUser>('/api/auth/invitations/mine');
}

export async function acceptInvitationRequest(invitationId: string) {
  return request<AuthUser>(`/api/auth/invitations/${encodeURIComponent(invitationId)}/accept`, {
    method: 'POST',
  });
}

export async function rejectInvitationRequest(invitationId: string) {
  return request<AuthUser>(`/api/auth/invitations/${encodeURIComponent(invitationId)}/reject`, {
    method: 'POST',
  });
}

export async function resendInvitationRequest(invitationId: string) {
  return request<AuthUser>(`/api/auth/invitations/${encodeURIComponent(invitationId)}/resend`, {
    method: 'POST',
  });
}

export async function revokeInvitationRequest(invitationId: string) {
  return request<AuthUser>(`/api/auth/invitations/${encodeURIComponent(invitationId)}`, {
    method: 'DELETE',
  });
}

export async function listBusinessInvitationsRequest(businessId: string, includeAll = false) {
  const qs = includeAll ? '?includeAll=true' : '';
  return request<AuthUser>(`/api/auth/businesses/${encodeURIComponent(businessId)}/invitations${qs}`);
}

export async function acceptInviteRequest(token: string, email: string, newPassword?: string) {
  const body: Record<string, string> = { token, email };
  if (newPassword) body.newPassword = newPassword;
  const result = await request<AuthUser>('/api/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (result.accessToken) {
    setAuthTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }
  return result;
}

export async function deleteUserRequest(userId: string) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function resetUserPasswordRequest(userId: string) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/reset-password`, {
    method: 'PUT',
  });
}

export async function getUserActivityRequest(userId: string) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/activity`);
}

export async function logActivityRequest(data: {
  actorUserId: string;
  actorName?: string;
  targetUserId?: string;
  type: string;
  action: string;
  entityId?: string;
  entityLabel?: string;
  metadata?: Record<string, unknown>;
}) {
  return request<AuthUser>('/api/auth/activity', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// S-01: Logout — cookie httpOnly + refreshToken del dispositivo (tablet)
export async function logoutRequest(_refreshToken?: string) {
  const bodyToken = _refreshToken || _inMemoryRefreshToken || localStorage.getItem(REFRESH_STORAGE_KEY) || '';
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyToken ? { refreshToken: bodyToken } : {}),
  }).catch(() => {});
}

// AUTH-02: Verificar email con token
export async function verifyEmailRequest(token: string, email: string) {
  const params = new URLSearchParams({ token, email });
  const result = await request<AuthUser & { accessToken?: string }>(`/api/auth/verify-email?${params.toString()}`);
  if (result.accessToken) {
    setAuthTokens({
      accessToken: result.accessToken,
      refreshToken: (result as { refreshToken?: string }).refreshToken,
    });
  }
  return result;
}

// AUTH-02: Reenviar email de verificación
export async function resendVerificationEmailRequest(email: string) {
  return request<AuthUser & { emailSent?: boolean; alreadyVerified?: boolean }>(
    '/api/auth/resend-verification',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  );
}

// AUTH-03: Obtener progreso de onboarding desde backend
export async function getOnboardingProgressRequest(userId: string) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/onboarding`);
}

// AUTH-03: Guardar progreso de onboarding en backend
export async function saveOnboardingProgressRequest(
  userId: string,
  data: { onboardingData: Record<string, unknown>; onboardingCompleted?: boolean },
) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/onboarding`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Perfil actual desde el servidor. No usa `request()`: un 401 aquí no debe llamar `_onUnauthorized` (evita “pérdida” de sesión al hidratar en local). */
export async function fetchCurrentUserRequest(): Promise<ApiEnvelope<AuthUser>> {
  const url = `${API_BASE}/api/auth/me`;

  const buildHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(_inMemoryToken ? { Authorization: `Bearer ${_inMemoryToken}` } : {}),
  });

  const parseEnvelope = (rawText: string): ApiEnvelope<AuthUser> => {
    if (!rawText) return {} as ApiEnvelope<AuthUser>;
    try {
      return JSON.parse(rawText) as ApiEnvelope<AuthUser>;
    } catch {
      return { ok: false, error: rawText.slice(0, 300) } as ApiEnvelope<AuthUser>;
    }
  };

  const doFetch = async (): Promise<{ response: Response; payload: ApiEnvelope<AuthUser>; rawText: string }> => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: buildHeaders(),
      });
    } catch (err) {
      throw new Error('No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.');
    }
    const rawText = await response.text();
    const payload = parseEnvelope(rawText);
    return { response, payload, rawText };
  };

  const run = async (_retried: boolean): Promise<ApiEnvelope<AuthUser>> => {
    const { response, payload, rawText } = await doFetch();

    if (response.status === 401) {
      // Intentar renovar siempre antes de dar la sesión por muerta (tablet/Capacitor).
      if (!_retried) {
        const refreshed = await tryRefreshToken();
        if (refreshed === 'refreshed') return run(true);
        if (refreshed === 'network') {
          throw new Error('Sin conexión con el servidor; se mantiene la sesión en caché.');
        }
      }
      const authErr = extractApiErrorMessage(payload as Record<string, unknown>);
      // No usar “ya no es válida” aquí: AuthContext lo trata como wipe definitivo y
      // expulsaba al login tras un refresh fallido temporal (cookie vieja / red).
      return {
        ok: false,
        error: authErr || 'No se pudo sincronizar el perfil.',
      };
    }

    if (response.status === 404) {
      return { ok: false, error: extractApiErrorMessage(payload as Record<string, unknown>) || 'Usuario no encontrado' };
    }

    if (!response.ok || payload.ok === false) {
      const fromPayload = extractApiErrorMessage(payload as Record<string, unknown>);
      if (fromPayload) {
        throw new Error(fromPayload);
      }
      const statusBit = `${response.status} ${response.statusText || ''}`.trim();
      const bodyBit =
        rawText && typeof payload.error !== 'string' ? rawText.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
      throw new Error(
        bodyBit ? `${statusBit}: ${bodyBit}` : `${statusBit}. La API no devolvió un mensaje de error.`,
      );
    }

    // /me puede reemitir JWT si emailVerified cambió en BD (p. ej. verificaste en el móvil).
    if (payload.accessToken) {
      setAuthTokens({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
      });
    }

    return payload as ApiEnvelope<AuthUser>;
  };

  return run(false);
}

// S-07: Listar sesiones activas del usuario actual
export async function listSessionsRequest() {
  return request<AuthUser>('/api/auth/sessions');
}

// S-07: Revocar una sesión específica
export async function revokeSessionRequest(sessionId: string) {
  return request<AuthUser>(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

// S-07: Revocar todas las demás sesiones (mantener la actual)
export async function revokeOtherSessionsRequest() {
  return request<AuthUser>('/api/auth/sessions/others', {
    method: 'DELETE',
  });
}

// ─── Join Requests ──────────────────────────────────────────────────────────

export async function createJoinRequestRequest(businessId: string, message = '') {
  return request<AuthUser>('/api/auth/join-requests', {
    method: 'POST',
    body: JSON.stringify({ businessId, message }),
  });
}

export async function getMyJoinRequestsRequest() {
  return request<AuthUser>('/api/auth/join-requests/mine');
}

export async function getBusinessJoinRequestsRequest(businessId: string) {
  return request<AuthUser>(`/api/auth/join-requests/business/${encodeURIComponent(businessId)}`);
}

export async function reviewJoinRequestRequest(requestId: string, action: 'accepted' | 'rejected') {
  return request<AuthUser>(`/api/auth/join-requests/${encodeURIComponent(requestId)}`, {
    method: 'PUT',
    body: JSON.stringify({ action }),
  });
}

export async function searchBusinessesRequest(query: string) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : '';
  return request<AuthUser>(`/api/auth/businesses/search${qs}`);
}

// ─── Worker invite links (QR / enlace por centro) ────────────────────────────

export interface WorkerInviteLink {
  link_id: string;
  business_id: string;
  businessName: string;
  workCenterId: string;
  workCenterName: string;
  role: string;
  landingPage: string;
  scheduleTemplateId: string;
  status: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  invitedByName: string;
}

export interface WorkerInviteLinkPreview {
  businessName: string;
  workCenterName: string;
  role: string;
  expiresAt: string;
}

export async function previewWorkerInviteLinkRequest(token: string): Promise<{
  ok: boolean;
  preview?: WorkerInviteLinkPreview;
  error?: string;
  code?: string;
}> {
  const url = `${API_BASE}/api/auth/join/preview?token=${encodeURIComponent(token)}`;
  const response = await fetch(url, { credentials: 'include' });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    preview?: WorkerInviteLinkPreview;
    error?: string;
    code?: string;
  };
  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || 'Enlace no válido',
      code: data.code,
    };
  }
  return { ok: true, preview: data.preview };
}

export async function createWorkerInviteLinkRequest(payload: {
  businessId: string;
  workCenterId: string;
  role?: string;
  permissions?: AccountPermissionMatrix;
  landingPage?: string;
  scheduleTemplateId?: string;
  position?: string;
  maxUses?: number | null;
  expiresInDays?: number;
}) {
  return request<AuthUser>('/api/auth/invite-links', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{
    ok: boolean;
    inviteLink?: WorkerInviteLink;
    token?: string;
    joinUrl?: string;
    error?: string;
  }>;
}

export async function listWorkerInviteLinksRequest(businessId: string, includeInactive = false) {
  const qs = includeInactive ? '?includeInactive=true' : '';
  return request<AuthUser>(
    `/api/auth/businesses/${encodeURIComponent(businessId)}/invite-links${qs}`,
  ) as Promise<{ ok: boolean; inviteLinks?: WorkerInviteLink[]; error?: string }>;
}

export async function revokeWorkerInviteLinkRequest(linkId: string) {
  return request<AuthUser>(`/api/auth/invite-links/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
  }) as Promise<{ ok: boolean; inviteLink?: WorkerInviteLink; error?: string }>;
}

export async function redeemWorkerInviteLinkRequest(token: string) {
  return request<AuthUser>('/api/auth/join', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }) as Promise<{
    ok: boolean;
    user?: AuthUser;
    redirectTo?: string;
    alreadyMember?: boolean;
    error?: string;
    code?: string;
  }>;
}

// RGPD: Descargar mis datos personales como JSON
export async function exportMyDataRequest(): Promise<void> {
  const extraHeaders: Record<string, string> = {};
  if (_inMemoryToken) {
    extraHeaders['Authorization'] = `Bearer ${_inMemoryToken}`;
  }
  const res = await fetch(`${API_BASE}/api/auth/export-my-data`, {
    credentials: 'include',
    headers: extraHeaders,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Error descargando datos');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  a.download = match?.[1] || `mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
