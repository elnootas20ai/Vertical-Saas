import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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
  clearAuthTokens,
  deleteUserRequest,
  fetchCurrentUserRequest,
  getBillingCardRequest,
  getUserActivityRequest,
  googleLoginRequest,
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
  posSwitchUserRequest,
  recoverPasswordRequest,
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
  setAuthTokens,
  setOnUnauthorized,
  teamLoginRequest,
  updatePasswordRequest,
  updateProfileRequest,
  verifyEmailRequest,
} from '../lib/authApi';

type User = AuthUser;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; redirectTo?: string; error?: string; code?: string; lockUntil?: string }>;
  register: (data: RegisterPayload) => Promise<{
    success: boolean;
    redirectTo?: string;
    emailVerified?: boolean;
    verificationEmailSent?: boolean;
    error?: string;
  }>;
  logout: () => Promise<void>;
  updateOnboardingData: (data: Record<string, unknown>) => Promise<void>;
  verifyEmail: (token: string, email: string) => Promise<{ success: boolean; error?: string }>;
  /** Sincroniza usuario con /api/auth/me (p. ej. verificación hecha en otra pestaña). */
  refreshCurrentUser: () => Promise<{ ok: boolean; emailVerified: boolean; sessionInvalid?: boolean }>;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; error?: string; info?: string }>;
  googleLogin: (credential: string) => Promise<{
    success: boolean;
    redirectTo?: string;
    error?: string;
    code?: string;
    googleUser?: GoogleUserProfile;
  }>;
  updateProfile: (data: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  recoverPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
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
    workCenterId?: string;
    message?: string;
  }) => Promise<{
    success: boolean;
    invitation?: TeamInvitation;
    isExistingUser?: boolean;
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
  acceptInvitation: (invitationId: string) => Promise<{ success: boolean; redirectTo?: string; error?: string }>;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function persistSession(nextUser: User | null) {
  if (nextUser) {
    localStorage.setItem('vertial_session_user', JSON.stringify(nextUser));
    return;
  }
  localStorage.removeItem('vertial_session_user');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const setSessionUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    setIsAuthenticated(true);
    persistSession(nextUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // S-01: Ya no se cargan tokens de localStorage — las cookies httpOnly se envían automáticamente
    loadStoredTokens();

    setOnUnauthorized(() => {
      setUser(null);
      setIsAuthenticated(false);
      persistSession(null);
      clearAuthTokens();
    });

    const sessionUser = localStorage.getItem('vertial_session_user');
    if (!sessionUser) {
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
      try {
        const response = await fetchCurrentUserRequest();
        if (cancelled || !response.user || !parsedFromStorage) return;
        if (response.user.user_id !== parsedFromStorage.user_id) return;
        setSessionUser(response.user);
      } catch {
        // Sin red o sesión inválida: se mantiene el usuario leído de localStorage
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const login = async (email: string, password: string): Promise<{ success: boolean; redirectTo?: string; error?: string; code?: string; lockUntil?: string }> => {
    try {
      const response = await loginRequest(email, password);
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

  const logout = async () => {
    const { clearAllDeliveryPdvSessionFlags } = await import('../lib/deliverySetup');
    clearAllDeliveryPdvSessionFlags();
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

  const listUsers = async (businessId?: string): Promise<User[]> => {
    const response = await listUsersRequest(businessId);
    return response.users || [];
  };

  const listRoles = async (): Promise<RoleDefinition[]> => {
    const response = await listRolesRequest();
    return response.roles || [];
  };

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
    workCenterId?: string;
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
      return { success: true, redirectTo: response.redirectTo };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Error al aceptar la invitación' };
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
      if (user?.user_id === userId) {
        setSessionUser(response.user);
      }
      return { success: true, user: response.user };
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

  const verifyEmail = async (token: string, email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await verifyEmailRequest(token, email);
      if (!response.user) {
        return { success: false, error: 'No se pudo verificar el email' };
      }
      // S-01: Cookies establecidas por el backend
      setSessionUser(response.user);
      return { success: true };
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
        if (
          prev?.user_id === next.user_id &&
          prev.emailVerified === next.emailVerified &&
          prev.updatedAt === next.updatedAt
        ) {
          return prev;
        }
        persistSession(next);
        return next;
      });
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
        resendVerificationEmail,
        googleLogin,
        updateProfile,
        updatePassword,
        recoverPassword,
        resetPassword,
        acceptInvite,
        saveBillingCard,
        getBillingCard,
        listUsers,
        listRoles,
        inviteUser,
        lookupInviteEmail,
        listMyInvitations,
        listBusinessInvitations,
        acceptInvitation,
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
