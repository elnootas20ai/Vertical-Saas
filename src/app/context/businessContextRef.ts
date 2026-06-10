import { createContext } from 'react';
import type {
  Business,
  BusinessMember,
  CreateBusinessPayload,
  UpdateBusinessPayload,
} from '../lib/businessApi';

/** Contexto de empresa activa — archivo aparte para evitar ciclos de import con AppContext/routes. */
export interface BusinessContextType {
  businesses: Business[];
  currentBusiness: Business | null;
  isLoading: boolean;
  businessesFetchSettled: boolean;
  /** Error al cargar empresas desde la API (distinto de «sin empresas»). */
  businessesLoadError: string | null;
  switchBusiness: (businessId: string) => void;
  createBusiness: (
    data: CreateBusinessPayload,
  ) => Promise<{ success: boolean; business?: Business; error?: string }>;
  updateBusiness: (
    businessId: string,
    data: UpdateBusinessPayload,
  ) => Promise<{ success: boolean; business?: Business; error?: string }>;
  deleteBusiness: (
    businessId: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  addMember: (
    businessId: string,
    member: Omit<BusinessMember, 'joinedAt'>,
  ) => Promise<{ success: boolean; business?: Business; error?: string }>;
  updateMember: (
    businessId: string,
    memberId: string,
    updates: Pick<BusinessMember, 'role' | 'permissions'>,
  ) => Promise<{ success: boolean; business?: Business; error?: string }>;
  removeMember: (
    businessId: string,
    memberId: string,
  ) => Promise<{ success: boolean; business?: Business; error?: string }>;
  reloadBusinesses: () => Promise<void>;
}

export const BusinessContext = createContext<BusinessContextType | undefined>(undefined);
