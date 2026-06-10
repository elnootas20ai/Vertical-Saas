import { useMemo } from 'react';
import { useBusiness } from '../context/BusinessContext';
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
  const { currentBusiness } = useBusiness();
  const vertical = currentBusiness?.businessType || 'delivery';

  const departments = useMemo(
    () => getAlertDepartmentsForVertical(vertical),
    [vertical],
  );

  return {
    vertical,
    departments,
    departmentSourceFilter: (deptId: string) => deptSourceFilter(deptId, vertical),
    isDepartmentVisible: (deptId: string) => isDepartmentVisibleForVertical(deptId, vertical),
  };
}
