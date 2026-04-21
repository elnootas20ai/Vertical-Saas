import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

const MANAGER_ROLES = new Set(['admin', 'manager', 'owner', 'superadmin', 'gerente']);

export interface SalePermissions {
  canClose: boolean;
  canCloseWithExceptions: boolean;
  canChangePrice: boolean;
  canPriceBelowMin: boolean;
  canDeliver: boolean;
  canDelete: boolean;
  canViewReports: boolean;
  isManager: boolean;
}

export function useSalePermissions(): SalePermissions {
  const { user } = useAuth();

  return useMemo(() => {
    const role = String(user?.role || '').toLowerCase();
    const isManager = MANAGER_ROLES.has(role);

    const perm = user?.permissions || {};
    const salesPerm = typeof perm.sales === 'string' ? perm.sales : '';
    const hasFullSales = salesPerm === 'full' || salesPerm === 'all';

    return {
      isManager,
      canClose: true,
      canCloseWithExceptions: isManager || hasFullSales,
      canChangePrice: isManager || hasFullSales,
      canPriceBelowMin: isManager,
      canDeliver: true,
      canDelete: isManager,
      canViewReports: isManager || hasFullSales,
    };
  }, [user]);
}
