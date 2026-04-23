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
  paymentSummary?: BillingPaymentSummary;
  subscription?: BillingSubscription;
  permissions?: AccountPermissionMatrix;
  employment?: EmploymentInfo;
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
  landingPage?: string;
  linkedBusinessId?: string;
  username?: string;
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
  salary: string;
  bankAccount: string;
  emergencyContact: string;
  emergencyPhone: string;
  salesPointId?: string;
  // Labor cost
  grossSalary?: number;
  socialSecurityCost?: number;
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
  password: string;
  googleCredential?: string;
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
}

// ── Configuración base de la API ──────────────────────────────────────────────

function getApiBase(): string {
  const env = import.meta.env;
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol =
    env.VITE_API_PROTOCOL ||
    (typeof window !== 'undefined' && window.location.protocol
      ? window.location.protocol.replace(':', '')
      : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

const API_BASE = getApiBase();

// ── Gestión de tokens ─────────────────────────────────────────────────────────
// S-01: Los tokens JWT se almacenan en cookies httpOnly gestionadas por el backend.
// El frontend NO almacena tokens — las cookies se envían automáticamente con credentials:'include'.

let _onUnauthorized: (() => void) | null = null;

const TOKEN_STORAGE_KEY = 'udar_access_token';

let _inMemoryToken: string | null = localStorage.getItem(TOKEN_STORAGE_KEY);

export function cacheAccessToken(token: string | null) {
  _inMemoryToken = token;
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getAuthHeaders(): Record<string, string> {
  if (!_inMemoryToken) {
    _inMemoryToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  }
  return _inMemoryToken ? { Authorization: `Bearer ${_inMemoryToken}` } : {};
}

export function loadStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  _inMemoryToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  return { accessToken: _inMemoryToken, refreshToken: null };
}

export function setAuthTokens(_tokens: { accessToken: string; refreshToken: string }) {
  cacheAccessToken(_tokens.accessToken);
}

export function clearAuthTokens() {
  _inMemoryToken = null;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem('udar_refresh_token');
}

export function setOnUnauthorized(callback: () => void) {
  _onUnauthorized = callback;
}

export function triggerUnauthorized() {
  cacheAccessToken(null);
  _onUnauthorized?.();
}

// S-01: El refresh se hace enviando la cookie automáticamente (no se necesita token en body)
// Lock para evitar que múltiples peticiones simultáneas lancen varios refresh en paralelo,
// lo que causaría que el token rotado invalide las demás solicitudes de refresh.
let _refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(_inMemoryToken ? { Authorization: `Bearer ${_inMemoryToken}` } : {}),
        },
      });
      const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<AuthUser>;
      if (response.ok && payload.ok === true && payload.accessToken) {
        cacheAccessToken(payload.accessToken);
      }
      return response.ok && payload.ok === true;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

/**
 * Wrapper de fetch para rutas autenticadas:
 * - Adjunta Authorization si hay access token en memoria.
 * - Ante 401 intenta un refresh una vez y reintenta la petición.
 */
export async function authFetch(
  input: string,
  init?: RequestInit,
  _retried = false,
): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  if (_inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${_inMemoryToken}`);
  }

  const response = await fetch(input, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (response.status === 401 && !_retried) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return authFetch(input, init, true);
    }
    _onUnauthorized?.();
  }

  return response;
}

// ── Cliente HTTP con renovación automática de token ───────────────────────────

async function request<T>(
  path: string,
  init?: RequestInit,
  _retried = false,
): Promise<ApiEnvelope<T>> {
  const extraHeaders: Record<string, string> = {};
  if (_inMemoryToken) {
    extraHeaders['Authorization'] = `Bearer ${_inMemoryToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
      ...(init?.headers || {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (response.status === 401) {
    if (payload.error && !payload.code) {
      throw new Error(typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error));
    }
    if (payload.code === 'TOKEN_EXPIRED' && !_retried) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(path, init, true);
      }
    }
    _onUnauthorized?.();
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok || payload.ok === false) {
    const errMsg = typeof payload.error === 'string' ? payload.error : (payload.error ? JSON.stringify(payload.error) : 'Error inesperado en la API');
    throw new Error(errMsg);
  }

  return payload as ApiEnvelope<T>;
}

// ── Endpoints de autenticación ────────────────────────────────────────────────

export async function loginRequest(email: string, password: string) {
  const result = await request<AuthUser>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (result.accessToken) {
    cacheAccessToken(result.accessToken);
  }
  return result;
}

export async function registerRequest(data: RegisterPayload) {
  return request<AuthUser>('/api/auth/register', {
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
}

export async function googleLoginRequest(credential: string): Promise<GoogleLoginResult> {
  const extraHeaders: Record<string, string> = {};
  if (_inMemoryToken) {
    extraHeaders['Authorization'] = `Bearer ${_inMemoryToken}`;
  }

  const response = await fetch(`${API_BASE}/api/auth/google-login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify({ credential }),
  });

  const payload = (await response.json().catch(() => ({}))) as GoogleLoginResult;

  if (response.status === 404 && payload.code === 'GOOGLE_ACCOUNT_NOT_FOUND') {
    return payload;
  }

  if (!response.ok || payload.ok === false) {
    return { ok: false, error: payload.error || 'Error al acceder con Google' };
  }

  if (payload.accessToken) {
    cacheAccessToken(payload.accessToken);
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
  const result = await request<AuthUser>('/api/auth/team-login', {
    method: 'POST',
    body: JSON.stringify({ companyCode, username, password }),
  }) as TeamLoginResult;
  if (result.accessToken) {
    cacheAccessToken(result.accessToken);
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
    cacheAccessToken(result.accessToken);
  }
  return result;
}

export async function recoverPasswordRequest(email: string) {
  return request<AuthUser>('/api/auth/recover', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
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

export async function getBillingCardRequest(userId: string) {
  return request<AuthUser>(`/api/auth/profile/${encodeURIComponent(userId)}/card`);
}

export async function inviteUserRequest(data: {
  name: string;
  email: string;
  role: string;
  phone?: string;
  invitedBy?: string;
  companyName?: string;
  businessId?: string;
  permissions?: AccountPermissionMatrix;
  landingPage?: string;
  position?: string;
  contractType?: string;
  grossMonthlySalary?: string;
  workCenterId?: string;
}) {
  return request<AuthUser>('/api/auth/invite', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function acceptInviteRequest(token: string, email: string, newPassword: string) {
  const result = await request<AuthUser>('/api/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify({ token, email, newPassword }),
  });
  if (result.accessToken) {
    cacheAccessToken(result.accessToken);
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

// S-01: Logout — el backend lee el refreshToken de la cookie httpOnly y limpia las cookies
export async function logoutRequest(_refreshToken?: string) {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {});
}

// AUTH-02: Verificar email con token
export async function verifyEmailRequest(token: string, email: string) {
  const params = new URLSearchParams({ token, email });
  return request<AuthUser>(`/api/auth/verify-email?${params.toString()}`);
}

// AUTH-02: Reenviar email de verificación
export async function resendVerificationEmailRequest(email: string) {
  return request<AuthUser>('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
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
