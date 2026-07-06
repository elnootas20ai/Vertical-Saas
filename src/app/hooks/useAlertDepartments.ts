import { useCallback, useMemo } from 'react';
import { useBusinessOptional } from '../context/BusinessContext';
import {
  getAlertDepartmentsForVertical,
  departmentSourceFilter as deptSourceFilter,
  isDepartmentVisibleForVertical,
  type BusinessAlertDepartment,
} from '../lib/alertDepartments';

export function useAlertDepartments(): {
  vertical: string;
  departments: BusinessAlertDepartment[];
  departmentSourceFilter: (deptId: string) => string | undefined;
  isDepartmentVisible: (deptId: string) => boolean;
} {
  const currentBusiness = useBusinessOptional()?.currentBusiness;
  const vertical = currentBusiness?.businessType || 'delivery';

  const departments = useMemo(
    () => getAlertDepartmentsForVertical(vertical),
    [vertical],
  );

  const departmentSourceFilter = useCallback(
    (deptId: string) => deptSourceFilter(deptId, vertical),
    [vertical],
  );

  const isDepartmentVisible = useCallback(
    (deptId: string) => isDepartmentVisibleForVertical(deptId, vertical),
    [vertical],
  );

  return {
    vertical,
    departments,
    departmentSourceFilter,
    isDepartmentVisible,
  };
}
