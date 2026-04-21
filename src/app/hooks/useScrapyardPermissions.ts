import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

export type ScrapyardRole = 'gerente' | 'trabajador' | 'readonly';

interface ScrapyardPermissions {
  role: ScrapyardRole;
  canCreateFull: boolean;
  canCreateBasic: boolean;
  canValidate: boolean;
  canManageDocs: boolean;
  canManageLocation: boolean;
  canManageBaja: boolean;
  canDelete: boolean;
  canEditFinancials: boolean;
  canViewList: boolean;
}

const MANAGER_ROLES = new Set(['Admin', 'Gerente']);

export function useScrapyardPermissions(): ScrapyardPermissions {
  const { user } = useAuth();

  return useMemo(() => {
    const userRole = (user as any)?.role || (user as any)?.roleId || '';
    const permissions: string[] = (user as any)?.permissions || [];
    const isManager = MANAGER_ROLES.has(userRole);

    if (isManager) {
      return {
        role: 'gerente' as const,
        canCreateFull: true,
        canCreateBasic: true,
        canValidate: true,
        canManageDocs: true,
        canManageLocation: true,
        canManageBaja: true,
        canDelete: true,
        canEditFinancials: true,
        canViewList: true,
      };
    }

    const hasPermission = (key: string) => permissions.includes(key);

    const canBasic = hasPermission('scrapyard.entry.basic') || hasPermission('scrapyard.entry.full');
    const canFull = hasPermission('scrapyard.entry.full');

    return {
      role: canBasic ? 'trabajador' as const : 'readonly' as const,
      canCreateFull: canFull,
      canCreateBasic: canBasic,
      canValidate: hasPermission('scrapyard.entry.validate'),
      canManageDocs: hasPermission('scrapyard.docs.manage') || canFull,
      canManageLocation: hasPermission('scrapyard.location.manage') || canFull,
      canManageBaja: hasPermission('scrapyard.baja.manage') || canFull,
      canDelete: hasPermission('scrapyard.delete'),
      canEditFinancials: canFull,
      canViewList: true,
    };
  }, [user]);
}
