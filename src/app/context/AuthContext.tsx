import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type AccountActivityItem,
  type ActiveSession,
  type AuthUser,
  type BillingCard,
  type GoogleUserProfile,
  type RegisterPayload,
  type RoleDefinition,
  acceptInviteRequest,
  clearAuthTokens,
  deleteUserRequest,
  getBillingCardRequest,
  getUserActivityRequest,
  googleLoginRequest,
  inviteUserRequest,
  listRolesRequest,
  listSessionsRequest,
  listUsersRequest,
  loadStoredTokens,
  loginRequest,
  logoutRequest,
  posSwitchUserRequest,
  recoverPasswordRequest,
  resendVerificationEmailRequest,
  resetPasswordRequest,
  resetUserPasswordRequest,
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
  register: (data: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateOnboardingData: (data: Record<string, unknown>) => Promise<void>;
  verifyEmail: (token: string, email: string) => Promise<{ success: boolean; error?: string }>;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
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
    newPassword: string,
  ) => Promise<{ success: boolean; redirectTo?: string; error?: string }>;
  inviteUser: (data: {
    name: string;
    email: string;
    role: string;
    phone?: string;
    businessId?: string;
    permissions?: User['permissions'];
    landingPage?: string;
    position?: string;
    contractType?: string;
    grossMonthlySalary?: string;
    workCenterId?: string;
  }) => Promise<{ success: boolean; user?: User; generatedPassword?: string; emailSent?: boolean; error?: string }>;
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
    localStorage.setItem('udar_session_user', JSON.stringify(nextUser));
    return;
  }
  localStorage.removeItem('udar_session_user');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // S-01: Ya no se cargan tokens de localStorage — las cookies httpOnly se envían automáticamente
    loadStoredTokens();

    setOnUnauthorized(() => {
      setUser(null);
      setIsAuthenticated(false);
      persistSession(null);
      clearAuthTokens();
    });

    const sessionUser = localStorage.getItem('udar_session_user');
    if (!sessionUser) {
      setIsInitializing(false);
      return;
    }

    try {
      const userData = JSON.parse(sessionUser) as User;
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error loading session:', error);
      persistSession(null);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const setSessionUser = (nextUser: User) => {
    setUser(nextUser);
    setIsAuthenticated(true);
    persistSession(nextUser);
  };

  const register = async (data: RegisterPayload): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await registerRequest(data);
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      // S-01: Cookies establecidas por el backend
      setSessionUser(response.user);
      return { success: true };
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

    try {
      const response = await saveBillingCardRequest(user.user_id, data);
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
    newPassword: string,
  ): Promise<{ success: boolean; redirectTo?: string; error?: string }> => {
    try {
      const response = await acceptInviteRequest(token, email, newPassword);
      if (!response.user) {
        return { success: false, error: 'No se recibió usuario desde el backend' };
      }
      setSessionUser(response.user);
      return { success: true, redirectTo: response.redirectTo || '/saas/dashboard' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al aceptar la invitación',
      };
    }
  };

  const inviteUser = async (data: {
    name: string;
    email: string;
    role: string;
    phone?: string;
    businessId?: string;
    permissions?: User['permissions'];
    landingPage?: string;
    position?: string;
    contractType?: string;
    grossMonthlySalary?: string;
    workCenterId?: string;
  }): Promise<{ success: boolean; user?: User; generatedPassword?: string; emailSent?: boolean; error?: string }> => {
    try {
      const response = await inviteUserRequest({
        ...data,
        invitedBy: user?.user_id || '',
        companyName: user?.companyName || '',
      });
      return {
        success: true,
        user: response.user,
        generatedPassword: response.generatedPassword,
        emailSent: response.emailSent,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al invitar usuario',
      };
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

  const resendVerificationEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await resendVerificationEmailRequest(email);
      return { success: true };
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
