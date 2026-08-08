import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { hasMinimumWorkerIdentity, mergePersonalData, computeWorkerProfileCompletion } from '../lib/workerProfileCompletion';
import {
  clearVertialClientCaches,
  SESSION_USER_STORAGE_KEY,
} from '../lib/clientSessionStorage';
import { clearForceFreshLogin, mustForceFreshLogin } from '../lib/appInstallStamp';
import { clearTpvTabletBinding, readTpvTabletBinding } from '../lib/tpvTabletSession';
import {
  type AccountActivityItem,
  type ActiveSession,
  type AuthUser,
  type BillingCard,
  type GoogleUserProfile,
  type RegisterPayload,
  type RoleDefinition,
  type TeamInvitation,
  acceptInviteRequest,
  acceptInvitationRequest,
  redeemWorkerInviteLinkRequest,
  clearAuthTokens,
  deleteUserRequest,
  fetchCurrentUserRequest,
  startAuthSessionKeepalive,
  stopAuthSessionKeepalive,
  getBillingCardRequest,
  getUserActivityRequest,
  googleLoginRequest,
  appleLoginRequest,
  type AppleUserProfile,
  inviteUserRequest,
  lookupInviteEmailRequest,
  type InviteLookupResult,
  listBusinessInvitationsRequest,
  listMyInvitationsRequest,
  listRolesRequest,
  listSessionsRequest,
  listUsersRequest,
  loadStoredTokens,
  loginRequest,
  logoutRequest,
  AuthRequestError,
  posSwitchUserRequest,
  recoverPasswordRequest,
  requestLoginCodeRequest,
  verifyLoginCodeRequest,
  rejectInvitationRequest,
  resendInvitationRequest,
  resendVerificationEmailRequest,
  resetPasswordRequest,
  resetUserPasswordRequest,
  revokeInvitationRequest,
  revokeSessionRequest,
  revokeOtherSessionsRequest,
  registerRequest,
  saveBillingCardRequest,
  activateOnboardingTrialRequest,
  setAuthTokens,
  setOnUnauthorized,
  teamLoginRequest,
  updatePasswordRequest,
  updateProfileRequest,
  verifyEmailRequest,
} from '../lib/authApi';
import { tpvTabletActivateRequest, tpvTabletSwitchRequest } from '../lib/tpvTabletApi';

type User = AuthUser;

function mergeProfilePatch(base: User, patch: Partial<User>): User {
  const merged: User = { ...base, ...patch };
  if (patch.personalData !== undefined) {
    merged.personalData = mergePersonalData(base.personalData, patch.personalData);
  }
  if (patch.employment !== undefined) {
    merged.employment = { ...(base.employment || {}), ...patch.employment };
  }
  if (patch.phone !== undefined) {
    merged.phone = String(patch.phone).trim();
  }
  merged.workerIdentityCompleted = hasMinimumWorkerIdentity(merged);
  merged.workerProfileCompletion = computeWorkerProfileCompletion(merged);
  return merged;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    lockUntil?: string;
    otpHint?: string;
  }>;
  register: (data: RegisterPayload) => Promise<{
    success: boolean;
    redirectTo?: string;
    emailVerified?: boolean;
    verificationEmailSent?: boolean;
    error?: string;
  }>;
  logout: () => Promise<void>;
  updateOnboardingData: (data: Record<string, unknown>) => Promise<void>;
  verifyEmail: (token: string, email: string) => Promise<{ success: boolean; redirectTo?: string; error?: string }>;
  /** Sincroniza usuario con /api/auth/me (p. ej. verificación hecha en otra pestaña). */
  refreshCurrentUser: () => Promise<{ ok: boolean; emailVerified: boolean; sessionInvalid?: boolean }>;
  /** true tras confirmar el perfil con el servidor (evita redirigir por caché local antigua). */
  sessionSyncedWithServer: boolean;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; error?: string; info?: string }>;
  googleLogin: (credential: string) => Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    googleUser?: GoogleUserProfile;
  }>;
  appleLogin: (
    identityToken: string,
    profile?: { givenName?: string; familyName?: string },
  ) => Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    appleUser?: AppleUserProfile;
  }>;
  updateProfile: (data: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  recoverPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  requestLoginCode: (email: string) => Promise<{ success: boolean; error?: string; info?: string }>;
  verifyLoginCode: (email: string, code: string) => Promise<{ success: boolean; redirectTo?: string; error?: string }>;
  resetPassword: (
    token: string,
    email: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  saveBillingCard: (data: {
    cardNumber: string;
    cardHolderName: string;
    expiryDate: string;
    cvv: string;
    billingMode: string;
    selectedPlanId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  activateOnboardingTrialWithoutCard: (data: {
    billingMode: string;
    selectedPlanId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  getBillingCard: () => Promise<BillingCard | null>;
  listUsers: (businessId?: string) => Promise<User[]>;
  listRoles: () => Promise<RoleDefinition[]>;
  acceptInvite: (
    token: string,
    email: string,
    newPassword?: string,
  ) => Promise<{ success: boolean; redirectTo?: string; isExistingUser?: boolean; error?: string }>;
  inviteUser: (data: {
    name?: string;
    email: string;
    role?: string;
    phone?: string;
    businessId?: string;
    permissions?: User['permissions'];
    landingPage?: string;
    position?: string;
    contractType?: string;
    grossMonthlySalary?: string;
    payPeriodsPerYear?: number;
    workCenterId?: string;
    message?: string;
  }) => Promise<{
    success: boolean;
    invitation?: TeamInvitation;
    isExistingUser?: boolean;
    emailSent?: boolean;
    inviteExpiresAt?: string;
    companyCode?: string;
    error?: string;
  }>;
  lookupInviteEmail: (
    email: string,
    businessId?: string,
  ) => Promise<InviteLookupResult & { success: boolean; error?: string }>;
  listMyInvitations: () => Promise<TeamInvitation[]>;
  listBusinessInvitations: (businessId: string, includeAll?: boolean) => Promise<TeamInvitation[]>;
  acceptInvitation: (invitationId: string) => Promise<{ success: boolean; redirectTo?: string; alreadyAccepted?: boolean; error?: string; code?: string }>;
  joinByInviteLink: (token: string) => Promise<{ success: boolean; redirectTo?: string; alreadyMember?: boolean; error?: string; code?: string }>;
  rejectInvitation: (invitationId: string) => Promise<{ success: boolean; error?: string }>;
  resendInvitation: (invitationId: string) => Promise<{ success: boolean; inviteExpiresAt?: string; error?: string }>;
  revokeInvitation: (invitationId: string) => Promise<{ success: boolean; error?: string }>;
  updateUser: (userId: string, data: Partial<User>) => Promise<{ success: boolean; user?: User; error?: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
  resetUserPassword: (userId: string) => Promise<{ success: boolean; generatedPassword?: string; error?: string }>;
  getUserActivity: (userId: string) => Promise<AccountActivityItem[]>;
  // S-07: Gestión de sesiones
  listSessions: () => Promise<ActiveSession[]>;
  revokeSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  revokeOtherSessions: () => Promise<{ success: boolean; error?: string }>;
  teamLogin: (companyCode: string, username: string, password: string) => Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    lockUntil?: string;
    business?: { business_id: string; name: string; logo: string; companyCode: string };
  }>;
  posSwitchUser: (username: string, password: string) => Promise<{
    success: boolean;
    error?: string;
    switchedFrom?: string;
  }>;
  tpvTabletLogin: (terminalCode: string, isSwitch?: boolean) => Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    lockUntil?: string;
    user?: User;
    business?: { business_id: string; name: string; logo: string; owner_user_id?: string };
    pointOfSale?: import('../lib/deliveryApi').PointOfSale;
    terminalBinding?: {
      terminalCode: string;
      pdvId: string;
      workCenterId: string;
      businessId: string;
      dataUserId: string;
      salaTerminalId?: string;
      tpvVertical?: 'delivery';
    };
    needsClockIn?: boolean;
  }>;
}

// HMR-safe singleton (mismo patrón que AppContext): evita "useAuth must be used within AuthProvider"
// cuando Vite recarga el módulo y el Provider sigue en el árbol con la identidad antigua del contexto.
const AUTH_CONTEXT_KEY = '__vertial_auth_ctx__';

function getOrCreateAuthContext(): React.Context<AuthContextType | undefined> {
  const g = globalThis as typeof globalThis & { [AUTH_CONTEXT_KEY]?: React.Context<AuthContextType | undefined> };
  if (!g[AUTH_CONTEXT_KEY]) {
    g[AUTH_CONTEXT_KEY] = createContext<AuthContextType | undefined>(undefined);
  }
  return g[AUTH_CONTEXT_KEY];
}

const AuthContext = getOrCreateAuthContext();

function persistSession(nextUser: User | null) {
  if (nextUser) {
    localStorage.setItem(SESSION_USER_STORAGE_KEY, JSON.stringify(nextUser));
    return;
  }
  localStorage.removeItem(SESSION_USER_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionSyncedWithServer, setSessionSyncedWithServer] = useState(false);

  const setSessionUser = useCallback((nextUser: User) => {
    clearForceFreshLogin();
    try {
      const binding = readTpvTabletBinding();
      const boundAuth = String(binding?.authUserId || '').trim();
      const nextId = String(nextUser.user_id || nextUser.id || '').trim();
      // Otra cuenta en el mismo dispositivo → no reutilizar el código tablet de Pau/etc.
      if (boundAuth && nextId && boundAuth !== nextId) {
        clearTpvTabletBinding();
      }
    } catch {
      // ignore
    }
    // Completitud siempre desde personalData/employment (evita banner con flag viejo).
    const normalized: User = {
      ...nextUser,
      workerProfileCompletion: computeWorkerProfileCompletion(nextUser),
      workerIdentityCompleted:
        Boolean(nextUser.workerIdentityCompleted) || hasMinimumWorkerIdentity(nextUser),
    };
    setUser(normalized);
    setIsAuthenticated(true);
    persistSession(normalized);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // S-01: Ya no se cargan tokens de localStorage — las cookies httpOnly se envían automáticamente
    loadStoredTokens();

    setOnUnauthorized(() => {
      stopAuthSessionKeepalive();
      setUser(null);
      setIsAuthenticated(false);
      persistSession(null);
      clearAuthTokens();
    });

    // Tras actualizar TestFlight: no rehidratar la cuenta anterior (ni con cookie/basura local).
    if (mustForceFreshLogin()) {
      stopAuthSessionKeepalive();
      persistSession(null);
      clearAuthTokens();
      setUser(null);
      setIsAuthenticated(false);
      setSessionSyncedWithServer(true);
      setIsInitializing(false);
      return () => {
        cancelled = true;
      };
    }

    const sessionUser = localStorage.getItem(SESSION_USER_STORAGE_KEY);
    if (!sessionUser) {
      setSessionSyncedWithServer(true);
      setIsInitializing(false);
      return () => {
        cancelled = true;
      };
    }

    let parsedFromStorage: User | null = null;
    try {
      parsedFromStorage = JSON.parse(sessionUser) as User;
      setUser(parsedFromStorage);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error loading session:', error);
      persistSession(null);
      setIsInitializing(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const hydrate = async (): Promise<boolean> => {
        const response = await fetchCurrentUserRequest();
        if (response.user) {
          setSessionUser(response.user);
          setSessionSyncedWithServer(true);
          return true;
        }
        // Solo borrar sesión si el servidor confirma que ya no es válida.
        // Errores de red / timeout no deben echar de la tablet a los 2 minutos.
        if (response.ok === false && Boolean(parsedFromStorage)) {
          const msg = String(response.error || '').toLowerCase();
          // Solo borrar si el servidor confirma sesión muerta de forma explícita.
          // “unauthorized / refresh token” genéricos expulsaban el TPV tras sleep/red.
          const definitive =
            /refresh token (inválido|expirado|no reconocido)|sesión revocada|usuario no encontrado/.test(
              msg,
            );
          if (definitive) {
            persistSession(null);
            setUser(null);
            setIsAuthenticated(false);
            clearAuthTokens();
            setSessionSyncedWithServer(true);
            return true;
          }
          // Mantener sesión local; se reintentará después.
          setSessionSyncedWithServer(false);
          return true;
        }
        return false;
      };

      const hydrateWithTimeout = () =>
        Promise.race([
          hydrate(),
          new Promise<boolean>((resolve) => {
            globalThis.setTimeout(() => resolve(false), 12_000);
          }),
        ]);

      try {
        for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
          try {
            if (await hydrateWithTimeout()) return;
          } catch {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            }
          }
        }
      } catch {
        /* fallthrough */
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Renueva el access JWT en segundo plano (TPV ~15–20 min sin esto → "sesión caducada").
  useEffect(() => {
    if (!isAuthenticated) {
      stopAuthSessionKeepalive();
      return;
    }
    startAuthSessionKeepalive();
    return () => stopAuthSessionKeepalive();
  }, [isAuthenticated]);

  // Otra pestaña inició/cerró sesión: alinear con localStorage + servidor.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_USER_STORAGE_KEY) return;
      if (!event.newValue) {
        stopAuthSessionKeepalive();
        setUser(null);
        setIsAuthenticated(false);
        clearAuthTokens();
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue) as User;
        const prevId = String(user?.user_id || user?.id || '').trim();
        const nextId = String(parsed.user_id || parsed.id || '').trim();
        if (prevId && nextId && prevId !== nextId) {
          clearVertialClientCaches([SESSION_USER_STORAGE_KEY]);
        }
        setUser(parsed);
        setIsAuthenticated(true);
        void fetchCurrentUserRequest()
          .then((res) => {
            if (res.user) setSessionUser(res.user);
          })
          .catch(() => undefined);
      } catch {
        persistSession(null);
        setUser(null);
        setIsAuthenticated(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setSessionUser, user?.user_id, user?.id]);

  const register = async (data: RegisterPayload): Promise<{
    success: boolean;
    redirectTo?: string;
    emailVerified?: boolean;
    verificationEmailSent?: boolean;
    error?: string;
  }> => {
    try {
      const response = await registerRequest(data);
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      // S-01: Cookies establecidas por el backend
      setSessionUser(response.user);
      const newUserId = String(response.user.user_id || response.user.id || '').trim();
      if (newUserId) {
        const { clearOnboardingDraftForNewAccount } = await import('../lib/onboardingLocalKeys');
        clearOnboardingDraftForNewAccount(newUserId);
      }
      return {
        success: true,
        redirectTo: response.redirectTo,
        emailVerified: Boolean(response.user.emailVerified),
        verificationEmailSent: response.verificationEmailSent !== false,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al crear la cuenta',
      };
    }
  };

  const login = async (
    email: string,
    password: string,
  ): Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    lockUntil?: string;
    otpHint?: string;
  }> => {
    try {
      clearVertialClientCaches();
      const response = await loginRequest(email, password);
      if ((response as { requiresLoginCode?: boolean }).requiresLoginCode) {
        return {
          success: false,
          code: 'REQUIRES_LOGIN_CODE',
          error:
            typeof (response as { message?: string }).message === 'string'
              ? (response as { message: string }).message
              : 'Introduce el código que te hemos enviado por email',
          otpHint:
            typeof (response as { otpHint?: string }).otpHint === 'string'
              ? (response as { otpHint: string }).otpHint
              : undefined,
        };
      }
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      setSessionUser(response.user);
      return { success: true, redirectTo: response.redirectTo };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al iniciar sesión';
      if (!message.includes('bloqueada')) {
        console.warn('[auth/login]', message);
      }
      if (error instanceof AuthRequestError) {
        return {
          success: false,
          error: message,
          code: error.code || (message.includes('bloqueada') ? 'ACCOUNT_LOCKED' : undefined),
          lockUntil: error.lockUntil,
        };
      }
      if (message.includes('bloqueada')) {
        return { success: false, error: message, code: 'ACCOUNT_LOCKED' };
      }
      return { success: false, error: message };
    }
  };

  const googleLogin = async (credential: string): Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    googleUser?: GoogleUserProfile;
  }> => {
    try {
      clearVertialClientCaches();
      const response = await googleLoginRequest(credential);

      if (response.code === 'GOOGLE_ACCOUNT_NOT_FOUND' && response.googleUser) {
        return {
          success: false,
          code: 'GOOGLE_ACCOUNT_NOT_FOUND',
          error: response.error,
          googleUser: response.googleUser,
        };
      }

      if (!response.ok || !response.user) {
        return { success: false, error: response.error || 'No se recibió usuario desde Google login' };
      }

      setSessionUser(response.user);
      return { success: true, redirectTo: response.redirectTo || '/saas/dashboard' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al acceder con Google',
      };
    }
  };

  const appleLogin = async (
    identityToken: string,
    profile?: { givenName?: string; familyName?: string },
  ): Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    appleUser?: AppleUserProfile;
  }> => {
    try {
      clearVertialClientCaches();
      const response = await appleLoginRequest(identityToken, profile);

      if (response.code === 'APPLE_ACCOUNT_NOT_FOUND' && response.appleUser) {
        return {
          success: false,
          code: 'APPLE_ACCOUNT_NOT_FOUND',
          error: response.error,
          appleUser: response.appleUser,
        };
      }

      if (!response.ok || !response.user) {
        return { success: false, error: response.error || 'No se recibió usuario desde Apple login' };
      }

      setSessionUser(response.user);
      return { success: true, redirectTo: response.redirectTo || '/saas/dashboard' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al acceder con Apple',
      };
    }
  };

  const logout = async () => {
    const { clearAllDeliveryPdvSessionFlags } = await import('../lib/deliverySetup');
    clearAllDeliveryPdvSessionFlags();
    clearVertialClientCaches();
    stopAuthSessionKeepalive();
    setUser(null);
    setIsAuthenticated(false);
    persistSession(null);
    clearAuthTokens();
    // S-01: El backend lee el token de la cookie httpOnly y la limpia
    logoutRequest().catch(() => {});
  };

  const recoverPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await recoverPasswordRequest(email);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al solicitar la recuperación',
      };
    }
  };

  const requestLoginCode = async (email: string): Promise<{ success: boolean; error?: string; info?: string }> => {
    try {
      const res = await requestLoginCodeRequest(email);
      const hint =
        typeof (res as { otpHint?: string }).otpHint === 'string'
          ? (res as { otpHint: string }).otpHint
          : '';
      const message =
        typeof res.message === 'string' && res.message.trim()
          ? res.message
          : hint
            ? `Código enviado. Revisa ${hint} (y spam).`
            : 'Código enviado. Revisa tu correo (y spam). Caduca en 10 minutos.';
      return { success: true, info: message };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al enviar el código',
      };
    }
  };

  const verifyLoginCode = async (
    email: string,
    code: string,
  ): Promise<{ success: boolean; redirectTo?: string; error?: string }> => {
    try {
      clearVertialClientCaches();
      const response = await verifyLoginCodeRequest(email, code);
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      setSessionUser(response.user);
      return { success: true, redirectTo: response.redirectTo };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Código inválido o expirado',
      };
    }
  };

  const resetPassword = async (
    token: string,
    email: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await resetPasswordRequest(token, email, newPassword);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al restablecer la contraseña',
      };
    }
  };

  const updateProfile = async (data: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'No hay usuario autenticado' };
    }

    try {
      const response = await updateProfileRequest(user.user_id, data);
      if (!response.user) {
        return { success: false, error: 'No se pudo actualizar el perfil' };
      }
      setSessionUser(response.user);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al actualizar el perfil',
      };
    }
  };

  const updatePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'No hay usuario autenticado' };
    }

    try {
      await updatePasswordRequest(user.user_id, currentPassword, newPassword);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al actualizar la contraseña',
      };
    }
  };

  const saveBillingCard = async (data: {
    cardNumber: string;
    cardHolderName: string;
    expiryDate: string;
    cvv: string;
    billingMode: string;
    selectedPlanId: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'No hay usuario autenticado' };
    }

    const attemptSave = async () => saveBillingCardRequest(user.user_id, data);

    try {
      let response;
      try {
        response = await attemptSave();
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (/verificar tu email/i.test(msg)) {
          const me = await fetchCurrentUserRequest();
          if (me.user) setSessionUser(me.user);
          response = await attemptSave();
        } else if (/token expirado|sesión expirada|session expired/i.test(msg)) {
          const refreshed = await refreshCurrentUser();
          if (!refreshed.ok) throw error;
          response = await attemptSave();
        } else {
          throw error;
        }
      }
      if (response.user) {
        setSessionUser(response.user);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al guardar la tarjeta',
      };
    }
  };

  const activateOnboardingTrialWithoutCard = async (data: {
    billingMode: string;
    selectedPlanId: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'No hay usuario autenticado' };
    }

    const attemptActivate = async () => activateOnboardingTrialRequest(user.user_id, data);

    try {
      let response;
      try {
        response = await attemptActivate();
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (/token expirado|sesión expirada|session expired/i.test(msg)) {
          const refreshed = await refreshCurrentUser();
          if (!refreshed.ok) throw error;
          response = await attemptActivate();
        } else {
          throw error;
        }
      }
      if (response.user) {
        setSessionUser(response.user);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al activar la prueba',
      };
    }
  };

  const getBillingCard = async (): Promise<BillingCard | null> => {
    if (!user) return null;

    try {
      const response = await getBillingCardRequest(user.user_id);
      return response.card || null;
    } catch (error) {
      console.error('Error loading billing card:', error);
      return null;
    }
  };

  const listUsers = useCallback(async (businessId?: string): Promise<User[]> => {
    const response = await listUsersRequest(businessId);
    return response.users || [];
  }, []);

  const listRoles = useCallback(async (): Promise<RoleDefinition[]> => {
    const response = await listRolesRequest();
    return response.roles || [];
  }, []);

  const acceptInvite = async (
    token: string,
    email: string,
    newPassword?: string,
  ): Promise<{ success: boolean; redirectTo?: string; isExistingUser?: boolean; error?: string }> => {
    try {
      const response = await acceptInviteRequest(token, email, newPassword);
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      setSessionUser(response.user);
      // Mismo motivo que en acceptInvitation: el usuario acaba de unirse a un
      // negocio nuevo, hay que disparar la recarga para que el sidebar reciba
      // el currentBusiness correcto y, con él, la vertical (delivery, comercial…).
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vertial:invitation-accepted'));
      }
      return {
        success: true,
        redirectTo: response.redirectTo || '/saas/dashboard',
        isExistingUser: Boolean(response.isExistingUser),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al aceptar la invitación',
      };
    }
  };

  const inviteUser = async (data: {
    name?: string;
    email: string;
    role?: string;
    phone?: string;
    businessId?: string;
    permissions?: User['permissions'];
    landingPage?: string;
    position?: string;
    contractType?: string;
    grossMonthlySalary?: string;
    payPeriodsPerYear?: number;
    workCenterId?: string;
    scheduleTemplateId?: string;
    message?: string;
  }) => {
    try {
      const response = await inviteUserRequest({
        ...data,
        invitedBy: user?.user_id || '',
        companyName: user?.companyName || '',
      });
      return {
        success: true,
        invitation: response.invitation,
        isExistingUser: Boolean(response.isExistingUser),
        emailSent: response.emailSent !== false,
        inviteExpiresAt: response.inviteExpiresAt,
        companyCode: response.companyCode,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al invitar usuario',
      };
    }
  };

  const lookupInviteEmail = async (
    email: string,
    businessId?: string,
  ): Promise<InviteLookupResult & { success: boolean; error?: string }> => {
    try {
      const result = await lookupInviteEmailRequest(email, businessId);
      return { success: true, ...result };
    } catch (error) {
      return {
        success: false,
        exists: false,
        error: error instanceof Error ? error.message : 'Error consultando el email',
      };
    }
  };

  const listMyInvitations = async (): Promise<TeamInvitation[]> => {
    try {
      const response = await listMyInvitationsRequest();
      return response.invitations || [];
    } catch {
      return [];
    }
  };

  const listBusinessInvitations = async (businessId: string, includeAll = false): Promise<TeamInvitation[]> => {
    try {
      const response = await listBusinessInvitationsRequest(businessId, includeAll);
      return response.invitations || [];
    } catch {
      return [];
    }
  };

  const acceptInvitation = async (invitationId: string) => {
    try {
      const response = await acceptInvitationRequest(invitationId);
      if (response.user) {
        setSessionUser(response.user);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vertial:invitation-accepted'));
      }
      return {
        success: true,
        redirectTo: response.redirectTo,
        alreadyAccepted: Boolean((response as { alreadyAccepted?: boolean }).alreadyAccepted),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al aceptar la invitación';
      const code = (error as Error & { code?: string }).code;
      return { success: false, error: message, code };
    }
  };

  const joinByInviteLink = async (token: string) => {
    try {
      const response = await redeemWorkerInviteLinkRequest(token);
      if (response.user) {
        setSessionUser(response.user);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vertial:invitation-accepted'));
      }
      return {
        success: true,
        redirectTo: response.redirectTo,
        alreadyMember: Boolean(response.alreadyMember),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al unirse al equipo';
      const code = (error as Error & { code?: string }).code;
      return { success: false, error: message, code };
    }
  };

  const rejectInvitation = async (invitationId: string) => {
    try {
      await rejectInvitationRequest(invitationId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Error al rechazar la invitación' };
    }
  };

  const resendInvitation = async (invitationId: string) => {
    try {
      const response = await resendInvitationRequest(invitationId);
      return { success: true, inviteExpiresAt: response.invitation?.expiresAt };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Error al renovar la invitación' };
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    try {
      await revokeInvitationRequest(invitationId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Error al revocar la invitación' };
    }
  };

  const updateUser = async (
    userId: string,
    data: Partial<User>,
  ): Promise<{ success: boolean; user?: User; error?: string }> => {
    try {
      const response = await updateProfileRequest(userId, data);
      if (!response.user) {
        return { success: false, error: 'No se pudo actualizar el usuario' };
      }
      const updated = response.user as User;
      const mergedUser = mergeProfilePatch(updated, data);
      const targetId = String(userId || '').trim();
      const actorIds = [user?.user_id, user?.id]
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      // Solo actualizar la sesión activa si el usuario editado es quien está logueado.
      // Antes, `updatedIds.includes(requestId)` era siempre true al editar a un tercero
      // (p. ej. alta laboral en Equipo) y la UI pasaba a la cuenta del trabajador.
      const isSelfUpdate = Boolean(targetId && actorIds.includes(targetId));
      if (isSelfUpdate) {
        flushSync(() => setSessionUser(mergedUser));
      } else {
        // Edición de otro usuario (alta laboral, permisos, admin…): nunca adoptar su perfil.
        // Re-sincroniza con la cookie httpOnly por si quedó JS antiguo o caché mezclada.
        try {
          const me = await fetchCurrentUserRequest();
          const meId = String(me.user?.user_id || me.user?.id || '').trim();
          if (me.user && meId && actorIds.includes(meId)) {
            flushSync(() => setSessionUser(me.user as User));
          }
        } catch {
          /* sin red: mantener sesión actual */
        }
      }
      return { success: true, user: mergedUser };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al actualizar el usuario',
      };
    }
  };

  const deleteUser = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await deleteUserRequest(userId);
      if (user?.user_id === userId) {
        logout();
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al eliminar el usuario',
      };
    }
  };

  const resetUserPassword = async (
    userId: string,
  ): Promise<{ success: boolean; generatedPassword?: string; error?: string }> => {
    try {
      const response = await resetUserPasswordRequest(userId);
      if (response.user && user?.user_id === userId) {
        setSessionUser(response.user);
      }
      return {
        success: true,
        generatedPassword: response.generatedPassword,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al restablecer la contraseña',
      };
    }
  };

  const getUserActivity = async (userId: string): Promise<AccountActivityItem[]> => {
    try {
      const response = await getUserActivityRequest(userId);
      return response.activities || [];
    } catch (error) {
      console.error('Error loading user activity:', error);
      return [];
    }
  };

  // S-07: Gestión de sesiones simultáneas
  const listSessions = async (): Promise<ActiveSession[]> => {
    try {
      const response = await listSessionsRequest();
      return response.sessions || [];
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [];
    }
  };

  const revokeSession = async (sessionId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await revokeSessionRequest(sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Error al revocar sesión' };
    }
  };

  const revokeOtherSessions = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await revokeOtherSessionsRequest();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Error al revocar sesiones' };
    }
  };

  const verifyEmail = async (token: string, email: string): Promise<{ success: boolean; redirectTo?: string; error?: string }> => {
    try {
      const response = await verifyEmailRequest(token, email);
      if (!response.user) {
        return { success: false, error: 'No se pudo verificar el email' };
      }
      // S-01: Cookies establecidas por el backend
      setSessionUser(response.user);
      return { success: true, redirectTo: response.redirectTo };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al verificar el email',
      };
    }
  };

  const refreshCurrentUser = useCallback(async (): Promise<{ ok: boolean; emailVerified: boolean; sessionInvalid?: boolean }> => {
    try {
      const response = await fetchCurrentUserRequest();
      if (!response.ok || !response.user) {
        const err = String(response.error || '');
        if (/no encontrado|not found/i.test(err)) {
          persistSession(null);
          setUser(null);
          setIsAuthenticated(false);
          return { ok: false, emailVerified: false, sessionInvalid: true };
        }
        return { ok: false, emailVerified: false };
      }
      const next = response.user;
      setUser((prev) => {
        const prevSub = JSON.stringify(prev?.subscription ?? null);
        const nextSub = JSON.stringify(next.subscription ?? null);
        const prevSalesPoint = String(prev?.employment?.salesPointId || '').trim();
        const nextSalesPoint = String(next.employment?.salesPointId || '').trim();
        const prevLinked = String(prev?.linkedBusinessId || '').trim();
        const nextLinked = String(next.linkedBusinessId || '').trim();
        if (
          prev?.user_id === next.user_id &&
          prev.emailVerified === next.emailVerified &&
          prev.updatedAt === next.updatedAt &&
          prevSub === nextSub &&
          prevSalesPoint === nextSalesPoint &&
          prevLinked === nextLinked
        ) {
          return prev;
        }
        persistSession(next);
        return next;
      });
      setSessionSyncedWithServer(true);
      setIsAuthenticated(true);
      return { ok: true, emailVerified: Boolean(next.emailVerified) };
    } catch {
      return { ok: false, emailVerified: false };
    }
  }, []);

  const resendVerificationEmail = async (email: string): Promise<{ success: boolean; error?: string; info?: string }> => {
    try {
      const target = (user?.email || email).trim().toLowerCase();
      if (!target) {
        return { success: false, error: 'Indica el email con el que te registraste' };
      }
      const response = await resendVerificationEmailRequest(target);
      if (response.alreadyVerified) {
        return {
          success: true,
          info: response.message || 'Este email ya está verificado. Puedes iniciar sesión.',
        };
      }
      if (response.emailSent === false) {
        return {
          success: false,
          error: response.message || 'No se pudo enviar el correo de verificación',
        };
      }
      return { success: true, info: response.message };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al reenviar el email de verificación',
      };
    }
  };

  const teamLogin = async (companyCode: string, username: string, password: string): Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    lockUntil?: string;
    business?: { business_id: string; name: string; logo: string; companyCode: string };
  }> => {
    try {
      const response = await teamLoginRequest(companyCode, username, password);
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      setSessionUser(response.user);
      return {
        success: true,
        redirectTo: response.redirectTo,
        business: response.business,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al iniciar sesión de equipo';
      if (message.includes('bloqueada')) {
        return { success: false, error: message, code: 'ACCOUNT_LOCKED' };
      }
      return { success: false, error: message };
    }
  };

  const posSwitchUser = async (username: string, password: string): Promise<{
    success: boolean;
    error?: string;
    switchedFrom?: string;
  }> => {
    try {
      const response = await posSwitchUserRequest(username, password);
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      setSessionUser(response.user);
      return { success: true, switchedFrom: response.switchedFrom };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al cambiar de usuario',
      };
    }
  };

  const tpvTabletLogin = async (terminalCode: string, isSwitch = false): Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    lockUntil?: string;
    user?: User;
    business?: { business_id: string; name: string; logo: string; owner_user_id?: string };
    pointOfSale?: import('../lib/deliveryApi').PointOfSale;
    terminalBinding?: {
      terminalCode: string;
      pdvId: string;
      workCenterId: string;
      businessId: string;
      dataUserId: string;
      salaTerminalId?: string;
      tpvVertical?: 'delivery';
    };
    needsClockIn?: boolean;
  }> => {
    try {
      const { getOrCreateTpvDeviceId } = await import('../lib/tpvTabletSession');
      const deviceId = getOrCreateTpvDeviceId();
      const deviceLabel =
        typeof navigator !== 'undefined'
          ? String(navigator.userAgent || '').slice(0, 80)
          : 'Dispositivo';
      const response = isSwitch
        ? await tpvTabletSwitchRequest(terminalCode, deviceId, deviceLabel)
        : await tpvTabletActivateRequest(terminalCode, deviceId, deviceLabel);
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      setSessionUser(response.user);
      return {
        success: true,
        redirectTo: response.redirectTo,
        user: response.user,
        business: response.business,
        pointOfSale: response.pointOfSale,
        terminalBinding: response.terminalBinding,
        needsClockIn: response.needsClockIn,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al iniciar sesión en el TPV';
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code || '')
          : '';
      if (message.includes('bloqueada')) {
        return { success: false, error: message, code: 'ACCOUNT_LOCKED' };
      }
      return { success: false, error: message, code: code || undefined };
    }
  };

  const updateOnboardingData = async (data: Record<string, unknown>) => {
    const nextCompanyName =
      typeof data.companyProfile === 'object' &&
      data.companyProfile !== null &&
      typeof (data.companyProfile as { tradeName?: unknown }).tradeName === 'string'
        ? ((data.companyProfile as { tradeName: string }).tradeName || user?.companyName || '')
        : (user?.companyName || '');

    const result = await updateProfile({
      onboardingCompleted: true,
      onboardingData: data,
      companyName: nextCompanyName,
    });

    if (!result.success) {
      throw new Error(result.error || 'No se pudo guardar el onboarding');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isInitializing,
        login,
        register,
        logout,
        updateOnboardingData,
        verifyEmail,
        refreshCurrentUser,
        sessionSyncedWithServer,
        resendVerificationEmail,
        googleLogin,
        appleLogin,
        updateProfile,
        updatePassword,
        recoverPassword,
        requestLoginCode,
        verifyLoginCode,
        resetPassword,
        acceptInvite,
        saveBillingCard,
        activateOnboardingTrialWithoutCard,
        getBillingCard,
        listUsers,
        listRoles,
        inviteUser,
        lookupInviteEmail,
        listMyInvitations,
        listBusinessInvitations,
        acceptInvitation,
        joinByInviteLink,
        rejectInvitation,
        resendInvitation,
        revokeInvitation,
        updateUser,
        deleteUser,
        resetUserPassword,
        getUserActivity,
        listSessions,
        revokeSession,
        revokeOtherSessions,
        teamLogin,
        posSwitchUser,
        tpvTabletLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/** Para banners/layout que pueden montarse fuera del árbol de auth (HMR o rutas auxiliares). */
export function useAuthOptional() {
  return useContext(AuthContext);
}
