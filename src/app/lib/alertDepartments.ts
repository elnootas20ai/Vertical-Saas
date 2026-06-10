/**
 * Apartados del Centro de Alertas — alineados con los grupos del sidebar por vertical.
 * Modomio (delivery) solo ve: PDVs, Delivery, RRHH, Catálogo y proveedores, Finanzas, Documentación.
 */

import type { AlertSource } from './alertCenterApi';

export interface BusinessAlertDepartment {
  id: string;
  label: string;
  icon: string;
  gradient: string;
  /** Fuentes de notificaciones en bandeja (inbox) */
  sources: AlertSource[];
}

const ALL_DEPT: BusinessAlertDepartment = {
  id: 'all',
  label: 'Todas',
  icon: 'bell',
  gradient: 'from-indigo-500 to-violet-600',
  sources: [],
};

/** Delivery / restaurante — mismo orden que sidebar */
const DELIVERY_DEPARTMENTS: BusinessAlertDepartment[] = [
  ALL_DEPT,
  {
    id: 'pdvs',
    label: "PDV's",
    icon: 'store',
    gradient: 'from-amber-500 to-orange-600',
    sources: ['delivery'],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    icon: 'bike',
    gradient: 'from-red-500 to-orange-500',
    sources: ['delivery'],
  },
  {
    id: 'rrhh',
    label: 'RRHH',
    icon: 'users',
    gradient: 'from-indigo-500 to-blue-600',
    sources: ['equipo', 'documentacion'],
  },
  {
    id: 'catalogProviders',
    label: 'Catálogo y proveedores',
    icon: 'package',
    gradient: 'from-emerald-500 to-teal-600',
    sources: ['stock', 'finanzas'],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    icon: 'dollar',
    gradient: 'from-emerald-600 to-green-700',
    sources: ['finanzas', 'conciliacion', 'ocr'],
  },
  {
    id: 'documentacion',
    label: 'Documentación',
    icon: 'file',
    gradient: 'from-slate-500 to-gray-600',
    sources: ['documentacion', 'equipo'],
  },
];

const VERTICAL_DEPARTMENT_IDS: Record<string, string[]> = {
  delivery: ['pdvs', 'delivery', 'rrhh', 'catalogProviders', 'finanzas', 'documentacion'],
  carDealership: ['rrhh', 'catalogProviders', 'finanzas', 'documentacion', 'operaciones'],
  workshop: ['rrhh', 'catalogProviders', 'finanzas', 'documentacion', 'operaciones'],
  cleaning: ['rrhh', 'catalogProviders', 'finanzas', 'documentacion', 'limpieza'],
  construction: ['rrhh', 'catalogProviders', 'finanzas', 'documentacion', 'construccion'],
  butcherShop: ['rrhh', 'catalogProviders', 'finanzas', 'documentacion', 'verticales'],
  scrapyard: ['rrhh', 'catalogProviders', 'finanzas', 'documentacion', 'verticales'],
};

const DEPARTMENT_CATALOG: Record<string, BusinessAlertDepartment> = {
  all: ALL_DEPT,
  pdvs: DELIVERY_DEPARTMENTS[1],
  delivery: DELIVERY_DEPARTMENTS[2],
  rrhh: DELIVERY_DEPARTMENTS[3],
  catalogProviders: DELIVERY_DEPARTMENTS[4],
  finanzas: DELIVERY_DEPARTMENTS[5],
  documentacion: DELIVERY_DEPARTMENTS[6],
  operaciones: {
    id: 'operaciones',
    label: 'Operaciones',
    icon: 'activity',
    gradient: 'from-blue-500 to-cyan-600',
    sources: ['verticales', 'stock', 'taller', 'crm'],
  },
  limpieza: {
    id: 'limpieza',
    label: 'Limpieza',
    icon: 'sparkles',
    gradient: 'from-cyan-500 to-teal-600',
    sources: ['limpieza'],
  },
  construccion: {
    id: 'construccion',
    label: 'Construcción',
    icon: 'hard-hat',
    gradient: 'from-amber-500 to-orange-600',
    sources: ['construccion'],
  },
  verticales: {
    id: 'verticales',
    label: 'Verticales',
    icon: 'layers',
    gradient: 'from-violet-500 to-purple-600',
    sources: ['carniceria', 'compraventa', 'adquisiciones', 'desguaces'],
  },
  sistema: {
    id: 'sistema',
    label: 'Sistema',
    icon: 'shield',
    gradient: 'from-gray-500 to-slate-600',
    sources: ['sistema'],
  },
};

export function getAlertDepartmentsForVertical(vertical: string | null | undefined): BusinessAlertDepartment[] {
  const ids = VERTICAL_DEPARTMENT_IDS[vertical || ''] || VERTICAL_DEPARTMENT_IDS.delivery;
  return [ALL_DEPT, ...ids.map((id) => DEPARTMENT_CATALOG[id]).filter(Boolean)];
}

/** Compat: export principal para delivery (mayoría de cuentas actuales) */
export const CEO_ALERT_DEPARTMENTS = DELIVERY_DEPARTMENTS;

export function departmentSourceFilter(deptId: string, vertical?: string | null): string | undefined {
  if (!deptId || deptId === 'all') return undefined;
  const dept = getAlertDepartmentsForVertical(vertical).find((d) => d.id === deptId);
  if (!dept?.sources.length) return undefined;
  return dept.sources.join(',');
}

export function isDepartmentVisibleForVertical(deptId: string, vertical: string | null | undefined): boolean {
  if (deptId === 'all') return true;
  const ids = VERTICAL_DEPARTMENT_IDS[vertical || ''] || VERTICAL_DEPARTMENT_IDS.delivery;
  return ids.includes(deptId);
}

/** Regla pertenece a un apartado del negocio actual (no limpieza/construcción en delivery). */
export function isRuleVisibleForVertical(
  deptId: string,
  vertical: string | null | undefined,
): boolean {
  return isDepartmentVisibleForVertical(deptId, vertical);
}

export function getDepartmentLabel(deptId: string): string {
  return DEPARTMENT_CATALOG[deptId]?.label || deptId;
}
