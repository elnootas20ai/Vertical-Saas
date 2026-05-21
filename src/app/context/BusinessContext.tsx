import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  type Business,
  type BusinessMember,
  type CreateBusinessPayload,
  type UpdateBusinessPayload,
  addBusinessMemberRequest,
  createBusinessRequest,
  deleteBusinessRequest,
  listBusinessesRequest,
  removeBusinessMemberRequest,
  updateBusinessMemberRequest,
  updateBusinessRequest,
} from '../lib/businessApi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BusinessContextType {
  businesses: Business[];
  currentBusiness: Business | null;
  isLoading: boolean;
  /** Primera carga de empresas terminada (éxito o error). Evita mandar a Gate antes de tiempo. */
  businessesFetchSettled: boolean;
  switchBusiness: (businessId: string) => void;
  createBusiness: (data: CreateBusinessPayload) => Promise<{ success: boolean; business?: Business; error?: string }>;
  updateBusiness: (businessId: string, data: UpdateBusinessPayload) => Promise<{ success: boolean; business?: Business; error?: string }>;
  deleteBusiness: (businessId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  addMember: (businessId: string, member: Omit<BusinessMember, 'joinedAt'>) => Promise<{ success: boolean; business?: Business; error?: string }>;
  updateMember: (businessId: string, memberId: string, updates: Pick<BusinessMember, 'role' | 'permissions'>) => Promise<{ success: boolean; business?: Business; error?: string }>;
  removeMember: (businessId: string, memberId: string) => Promise<{ success: boolean; business?: Business; error?: string }>;
  reloadBusinesses: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

function getStoredBusinessId(userId: string): string | null {
  try {
    return localStorage.getItem(`vertial_current_business:${userId}`);
  } catch {
    return null;
  }
}

function storeBusinessId(userId: string, businessId: string | null) {
  try {
    if (businessId) {
      localStorage.setItem(`vertial_current_business:${userId}`, businessId);
    } else {
      localStorage.removeItem(`vertial_current_business:${userId}`);
    }
  } catch {
    // ignore
  }
}

function businessesCacheKey(userId: string) {
  return `vertial_businesses_cache:${userId}`;
}

function readBusinessesCache(userId: string): Business[] {
  try {
    const raw = sessionStorage.getItem(businessesCacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Business[]) : [];
  } catch {
    return [];
  }
}

function writeBusinessesCache(userId: string, list: Business[]) {
  try {
    if (list.length > 0) {
      sessionStorage.setItem(businessesCacheKey(userId), JSON.stringify(list));
    } else {
      sessionStorage.removeItem(businessesCacheKey(userId));
    }
  } catch {
    // ignore
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user, isInitializing } = useAuth();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusiness, setCurrentBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [businessesFetchSettled, setBusinessesFetchSettled] = useState(false);

  const resolveCurrentBusiness = useCallback(
    (list: Business[], userId: string) => {
      if (list.length === 0) {
        setCurrentBusiness(null);
        return;
      }

      const storedId = getStoredBusinessId(userId);
      const found = storedId ? list.find((b) => b.business_id === storedId) : null;
      const resolved = found || list[0];

      setCurrentBusiness(resolved);
      storeBusinessId(userId, resolved.business_id);
    },
    [],
  );

  const reloadBusinesses = useCallback(async () => {
    if (!user?.user_id) {
      setIsLoading(isInitializing);
      if (!isInitializing) {
        setBusinessesFetchSettled(true);
        setBusinesses([]);
        setCurrentBusiness(null);
      }
      return;
    }

    setIsLoading(true);
    const userId = user.user_id;

    const fetchWithRetry = async (): Promise<Business[]> => {
      try {
        const response = await listBusinessesRequest(userId);
        return response.businesses || [];
      } catch {
        await new Promise((r) => setTimeout(r, 450));
        const response = await listBusinessesRequest(userId);
        return response.businesses || [];
      }
    };

    try {
      const list = await fetchWithRetry();
      setBusinesses(list);
      resolveCurrentBusiness(list, userId);
      writeBusinessesCache(userId, list);
    } catch (error) {
      console.error('Error loading businesses:', error);
      const cached = readBusinessesCache(userId);
      if (cached.length > 0) {
        setBusinesses(cached);
        resolveCurrentBusiness(cached, userId);
      }
    } finally {
      setIsLoading(false);
      setBusinessesFetchSettled(true);
    }
  }, [user?.user_id, isInitializing, resolveCurrentBusiness]);

  // Hidratar empresas desde caché de sesión antes del primer fetch (F5 no vacía la UI).
  useLayoutEffect(() => {
    const userId = user?.user_id;
    if (!userId) return;
    setBusinessesFetchSettled(false);
    setIsLoading(true);
    const cached = readBusinessesCache(userId);
    if (cached.length > 0) {
      setBusinesses(cached);
      resolveCurrentBusiness(cached, userId);
    }
  }, [user?.user_id, resolveCurrentBusiness]);

  useEffect(() => {
    void reloadBusinesses();
  }, [reloadBusinesses]);

  const switchBusiness = useCallback(
    (businessId: string) => {
      const found = businesses.find((b) => b.business_id === businessId);
      if (!found) return;
      setCurrentBusiness(found);
      if (user?.user_id) {
        storeBusinessId(user.user_id, businessId);
      }
    },
    [businesses, user?.user_id],
  );

  const createBusiness = useCallback(
    async (data: CreateBusinessPayload) => {
      if (!user?.user_id) return { success: false, error: 'No hay usuario autenticado' };
      try {
        const response = await createBusinessRequest(user.user_id, data);
        if (!response.business) return { success: false, error: 'No se recibió empresa desde el servidor' };

        const newList = [...businesses, response.business];
        setBusinesses(newList);
        if (user?.user_id) writeBusinessesCache(user.user_id, newList);

        if (!currentBusiness) {
          setCurrentBusiness(response.business);
          storeBusinessId(user.user_id, response.business.business_id);
        }

        return { success: true, business: response.business };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Error al crear la empresa',
        };
      }
    },
    [businesses, currentBusiness, user?.user_id],
  );

  const updateBusiness = useCallback(
    async (businessId: string, data: UpdateBusinessPayload) => {
      try {
        const response = await updateBusinessRequest(businessId, data);
        if (!response.business) return { success: false, error: 'No se recibió empresa actualizada' };

        const updatedList = businesses.map((b) =>
          b.business_id === businessId ? response.business! : b,
        );
        setBusinesses(updatedList);
        if (user?.user_id) writeBusinessesCache(user.user_id, updatedList);

        if (currentBusiness?.business_id === businessId) {
          setCurrentBusiness(response.business);
        }

        return { success: true, business: response.business };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Error al actualizar la empresa',
        };
      }
    },
    [businesses, currentBusiness, user?.user_id],
  );

  const deleteBusiness = useCallback(
    async (businessId: string, password: string) => {
      try {
        await deleteBusinessRequest(businessId, password);

        const newList = businesses.filter((b) => b.business_id !== businessId);
        setBusinesses(newList);
        if (user?.user_id) writeBusinessesCache(user.user_id, newList);

        if (currentBusiness?.business_id === businessId) {
          const next = newList[0] || null;
          setCurrentBusiness(next);
          if (user?.user_id) {
            storeBusinessId(user.user_id, next?.business_id || null);
          }
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Error al eliminar la empresa',
        };
      }
    },
    [businesses, currentBusiness, user?.user_id],
  );

  const addMember = useCallback(
    async (businessId: string, member: Omit<BusinessMember, 'joinedAt'>) => {
      try {
        const response = await addBusinessMemberRequest(businessId, member);
        if (!response.business) return { success: false, error: 'No se recibió empresa actualizada' };

        const updatedList = businesses.map((b) =>
          b.business_id === businessId ? response.business! : b,
        );
        setBusinesses(updatedList);
        if (currentBusiness?.business_id === businessId) {
          setCurrentBusiness(response.business);
        }

        return { success: true, business: response.business };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Error al añadir miembro',
        };
      }
    },
    [businesses, currentBusiness],
  );

  const updateMember = useCallback(
    async (businessId: string, memberId: string, updates: Pick<BusinessMember, 'role' | 'permissions'>) => {
      try {
        const response = await updateBusinessMemberRequest(businessId, memberId, updates);
        if (!response.business) return { success: false, error: 'No se recibió empresa actualizada' };

        const updatedList = businesses.map((b) =>
          b.business_id === businessId ? response.business! : b,
        );
        setBusinesses(updatedList);
        if (currentBusiness?.business_id === businessId) {
          setCurrentBusiness(response.business);
        }

        return { success: true, business: response.business };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Error al actualizar miembro',
        };
      }
    },
    [businesses, currentBusiness],
  );

  const removeMember = useCallback(
    async (businessId: string, memberId: string) => {
      try {
        const response = await removeBusinessMemberRequest(businessId, memberId);
        if (!response.business) return { success: false, error: 'No se recibió empresa actualizada' };

        const updatedList = businesses.map((b) =>
          b.business_id === businessId ? response.business! : b,
        );
        setBusinesses(updatedList);
        if (currentBusiness?.business_id === businessId) {
          setCurrentBusiness(response.business);
        }

        return { success: true, business: response.business };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Error al eliminar miembro',
        };
      }
    },
    [businesses, currentBusiness],
  );

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        currentBusiness,
        isLoading,
        businessesFetchSettled,
        switchBusiness,
        createBusiness,
        updateBusiness,
        deleteBusiness,
        addMember,
        updateMember,
        removeMember,
        reloadBusinesses,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessOptional(): BusinessContextType | undefined {
  return useContext(BusinessContext);
}

export function useBusiness() {
  const context = useBusinessOptional();
  if (context === undefined) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}
