import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BusinessContext, type BusinessContextType } from './businessContextRef';
import { useAuthOptional } from './AuthContext';
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
import { notifyDeliveryWorkCentersChanged, normalizeBusinessScopeId } from '../lib/deliverySetup';

export type { BusinessContextType } from './businessContextRef';

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

function businessesSessionCacheKey(userId: string) {
  return `vertial_businesses_cache:${userId}`;
}

function businessesLocalCacheKey(userId: string) {
  return `vertial_businesses_cache_ls:${userId}`;
}

function parseBusinessesCache(raw: string | null): Business[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Business[]) : [];
  } catch {
    return [];
  }
}

function readBusinessesCache(userId: string): Business[] {
  try {
    const fromSession = parseBusinessesCache(sessionStorage.getItem(businessesSessionCacheKey(userId)));
    if (fromSession.length > 0) return fromSession;
    return parseBusinessesCache(localStorage.getItem(businessesLocalCacheKey(userId)));
  } catch {
    return [];
  }
}

function writeBusinessesCache(userId: string, list: Business[]) {
  try {
    if (list.length > 0) {
      const serialized = JSON.stringify(list);
      sessionStorage.setItem(businessesSessionCacheKey(userId), serialized);
      localStorage.setItem(businessesLocalCacheKey(userId), serialized);
    }
    // No borrar caché ante [] de la API: evita pantalla vacía por fallos puntuales en dev/recarga.
  } catch {
    // ignore
  }
}

function clearBusinessesCache(userId: string) {
  try {
    sessionStorage.removeItem(businessesSessionCacheKey(userId));
    localStorage.removeItem(businessesLocalCacheKey(userId));
  } catch {
    // ignore
  }
}

/** Solo la caché de lista confirma empresas previas (el id guardado puede quedar obsoleto). */
function userLikelyHasBusinesses(userId: string): boolean {
  return readBusinessesCache(userId).length > 0;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/** Errores transitorios: JWT aún no refleja email verificado tras /me o verify. */
function isEmailVerificationBlockedError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('verificar tu email') || m.includes('email_not_verified');
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const isInitializing = auth?.isInitializing ?? true;
  const refreshCurrentUser = auth?.refreshCurrentUser;

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusiness, setCurrentBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [businessesFetchSettled, setBusinessesFetchSettled] = useState(false);
  const [businessesLoadError, setBusinessesLoadError] = useState<string | null>(null);
  const businessesLoadSeqRef = useRef(0);

  const resolveCurrentBusiness = useCallback(
    (list: Business[], userId: string, linkedBusinessId?: string | null) => {
      if (list.length === 0) {
        setCurrentBusiness(null);
        return;
      }

      const linkedId = String(linkedBusinessId || '').trim();
      if (linkedId) {
        const linkedBiz = list.find(
          (b) =>
            normalizeBusinessScopeId(b.business_id) === normalizeBusinessScopeId(linkedId),
        );
        if (linkedBiz) {
          setCurrentBusiness((prev) =>
            prev?.business_id === linkedBiz.business_id ? prev : linkedBiz,
          );
          storeBusinessId(userId, linkedBiz.business_id);
          return;
        }
      }

      const storedId = getStoredBusinessId(userId);
      const found = storedId
        ? list.find(
            (b) =>
              normalizeBusinessScopeId(b.business_id) === normalizeBusinessScopeId(storedId),
          )
        : null;
      const resolved = found || list[0];

      setCurrentBusiness((prev) =>
        prev?.business_id === resolved.business_id ? prev : resolved,
      );
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
        setBusinessesLoadError(null);
      }
      return;
    }

    // Sin email verificado la API devuelve 403; no pedir empresas ni guardar error stale.
    if (!user.emailVerified) {
      setBusinessesLoadError(null);
      setBusinesses([]);
      setCurrentBusiness(null);
      setIsLoading(false);
      setBusinessesFetchSettled(true);
      return;
    }

    const userId = user.user_id;
    const loadSeq = ++businessesLoadSeqRef.current;
    const cachedBeforeFetch = readBusinessesCache(userId);
    if (cachedBeforeFetch.length === 0) {
      setIsLoading(true);
    }
    setBusinessesLoadError(null);

    const fetchWithRetry = async (): Promise<Business[]> => {
      try {
        const response = await listBusinessesRequest(userId);
        return response.businesses || [];
      } catch (firstError) {
        await new Promise((r) => setTimeout(r, 450));
        try {
          const response = await listBusinessesRequest(userId);
          return response.businesses || [];
        } catch (secondError) {
          const message =
            secondError instanceof Error
              ? secondError.message
              : firstError instanceof Error
                ? firstError.message
                : 'No se pudieron cargar las empresas';
          if (refreshCurrentUser && isEmailVerificationBlockedError(message)) {
            await refreshCurrentUser();
            await new Promise((r) => setTimeout(r, 150));
            try {
              const response = await listBusinessesRequest(userId);
              return response.businesses || [];
            } catch {
              /* sesión aún sincronizando */
            }
          }
          throw new Error(message);
        }
      }
    };

    try {
      const list = await fetchWithRetry();
      if (loadSeq !== businessesLoadSeqRef.current) return;

      if (list.length === 0 && userLikelyHasBusinesses(userId)) {
        const cached = readBusinessesCache(userId);
        if (cached.length > 0) {
          setBusinesses(cached);
          resolveCurrentBusiness(cached, userId, user?.linkedBusinessId);
        }
        setBusinessesLoadError(
          'El servidor devolvió 0 empresas, pero esta cuenta ya tenía negocios en este navegador. No se ha borrado nada: reintenta la carga.',
        );
        return;
      }

      setBusinesses(list);
      resolveCurrentBusiness(list, userId, user?.linkedBusinessId);
      if (list.length > 0) {
        writeBusinessesCache(userId, list);
        setBusinessesLoadError(null);
      } else {
        clearBusinessesCache(userId);
        storeBusinessId(userId, null);
        setBusinessesLoadError(null);
      }
    } catch (error) {
      console.error('Error loading businesses:', error);
      if (loadSeq !== businessesLoadSeqRef.current) return;
      const cached = readBusinessesCache(userId);
      const message =
        error instanceof Error ? error.message : 'No se pudieron cargar las empresas';
      if (cached.length > 0) {
        setBusinesses(cached);
        resolveCurrentBusiness(cached, userId, user?.linkedBusinessId);
        setBusinessesLoadError(
          `${message} Se muestran los datos guardados en este navegador.`,
        );
      } else if (isEmailVerificationBlockedError(message)) {
        setBusinessesLoadError(null);
      } else {
        setBusinessesLoadError(message);
      }
    } finally {
      if (loadSeq === businessesLoadSeqRef.current) {
        setIsLoading(false);
        setBusinessesFetchSettled(true);
      }
    }
  }, [user?.user_id, user?.emailVerified, user?.linkedBusinessId, isInitializing, resolveCurrentBusiness, refreshCurrentUser]);

  useEffect(() => {
    if (user?.user_id) return;
    businessesLoadSeqRef.current += 1;
    setBusinesses([]);
    setCurrentBusiness(null);
    setBusinessesFetchSettled(false);
    setBusinessesLoadError(null);
    setIsLoading(!isInitializing);
  }, [user?.user_id, isInitializing]);

  // Hidratar empresas desde caché de sesión antes del primer fetch (F5 no vacía la UI).
  useLayoutEffect(() => {
    const userId = user?.user_id;
    if (!userId) return;
    const cached = readBusinessesCache(userId);
    if (cached.length > 0) {
      setBusinesses(cached);
      resolveCurrentBusiness(cached, userId, user?.linkedBusinessId);
      setIsLoading(false);
      // Permite cargar tiendas/PDV en paralelo sin esperar listBusinesses.
      setBusinessesFetchSettled(true);
    } else {
      setBusinessesFetchSettled(false);
      setIsLoading(true);
    }
  }, [user?.user_id, user?.linkedBusinessId, resolveCurrentBusiness]);

  // Trabajador invitado: la empresa activa debe ser la del empleador (`linkedBusinessId`).
  useEffect(() => {
    const linkedId = String(user?.linkedBusinessId || '').trim();
    if (!linkedId || user?.accountType !== 'user' || businesses.length === 0) return;
    const found = businesses.find((b) => b.business_id === linkedId);
    if (!found || currentBusiness?.business_id === linkedId) return;
    setCurrentBusiness(found);
    if (user?.user_id) storeBusinessId(user.user_id, linkedId);
  }, [user?.linkedBusinessId, user?.accountType, user?.user_id, businesses, currentBusiness?.business_id]);

  useEffect(() => {
    void reloadBusinesses();
  }, [reloadBusinesses]);

  // Cuando el usuario acepta una invitación de equipo (por banner o por email),
  // su user_id no cambia pero su lista de negocios sí: ahora es miembro de otro
  // negocio (posiblemente de otra vertical). Sin este listener, el sidebar
  // conserva el currentBusiness obsoleto y muestra la vertical equivocada
  // (o el fallback 'carDealership') hasta el siguiente refresh manual.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onInvitationAccepted = () => {
      void reloadBusinesses();
    };
    window.addEventListener('vertial:invitation-accepted', onInvitationAccepted);
    return () => {
      window.removeEventListener('vertial:invitation-accepted', onInvitationAccepted);
    };
  }, [reloadBusinesses]);

  useEffect(() => {
    if (!user?.user_id || businesses.length === 0) return;
    void import('../lib/onboardingLocalKeys').then(({ migrateLegacyOnboardingGuidesForBusinesses }) => {
      migrateLegacyOnboardingGuidesForBusinesses(
        user.user_id,
        businesses.map((b) => b.business_id).filter(Boolean),
      );
    });
  }, [user?.user_id, businesses]);

  const switchBusiness = useCallback(
    (businessId: string) => {
      const norm = normalizeBusinessScopeId(businessId);
      const found = businesses.find(
        (b) => normalizeBusinessScopeId(b.business_id) === norm,
      );
      if (!found) return;
      setCurrentBusiness(found);
      if (user?.user_id) {
        storeBusinessId(user.user_id, found.business_id);
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

        setCurrentBusiness(response.business);
        storeBusinessId(user.user_id, response.business.business_id);
        const newBusinessId = String(response.business.business_id || '').trim();
        notifyDeliveryWorkCentersChanged(newBusinessId);
        if (newBusinessId) {
          void import('../lib/onboardingLocalKeys').then(
            ({ armOnboardingTourForBusiness, resetActivationGuidesForBusiness }) => {
              armOnboardingTourForBusiness(user.user_id, newBusinessId);
              resetActivationGuidesForBusiness(user.user_id, newBusinessId);
            },
          );
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
        if (user?.user_id) {
          if (newList.length > 0) {
            writeBusinessesCache(user.user_id, newList);
          } else {
            clearBusinessesCache(user.user_id);
          }
        }

        if (currentBusiness?.business_id === businessId) {
          const next = newList[0] || null;
          setCurrentBusiness(next);
          if (user?.user_id) {
            storeBusinessId(user.user_id, next?.business_id || null);
          }
        }

        await refreshCurrentUser?.();

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Error al eliminar la empresa',
        };
      }
    },
    [businesses, currentBusiness, user?.user_id, refreshCurrentUser],
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
        businessesLoadError,
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
