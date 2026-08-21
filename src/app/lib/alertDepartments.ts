/**
 * Apartados del Centro de Alertas — alineados con los grupos del sidebar por vertical.
 * Modomio (delivery) solo ve: PDVs, Delivery, RRHH, Catálogo y proveedores, Finanzas, Documentación.
 */

import type { AlertSource } from './alertCenterApi';
import { isDeliveryCompactAlertRuleId } from './deliveryAlertsReview';
import { ruleDepartment, type AlertRule } from './settingsApi';

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

/** Bar/restaurante: misma estructura, labels de sala (sin “Delivery”). */
const RESTAURANT_DEPARTMENTS: BusinessAlertDepartment[] = [
  ALL_DEPT,
  {
    id: 'pdvs',
    label: 'Locales',
    icon: 'store',
    gradient: 'from-amber-500 to-orange-600',
    sources: ['delivery', 'restaurant'],
  },
  {
    id: 'delivery',
    label: 'Sala y caja',
    icon: 'utensils',
    gradient: 'from-stone-600 to-stone-800',
    sources: ['delivery', 'restaurant'],
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
  restaurant: ['pdvs', 'delivery', 'rrhh', 'catalogProviders', 'finanzas', 'documentacion'],
  events: ['pdvs', 'rrhh', 'catalogProviders', 'finanzas', 'documentacion'],
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
  if (String(vertical || '').trim() === 'restaurant') {
    return RESTAURANT_DEPARTMENTS;
  }
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

/**
 * ¿Mostrar esta regla en ajustes del vertical?
 * Delivery / restaurante: solo pack compacto (gerente), no 200 reglas.
 */
export function isAlertRuleListedForVertical(
  rule: Pick<AlertRule, 'id' | 'department' | 'category'>,
  vertical: string | null | undefined,
): boolean {
  const v = String(vertical || 'delivery').toLowerCase();
  if (v === 'events') {
    const id = String(rule.id || '').toLowerCase();
    const cat = String(rule.category || '').toLowerCase();
    return (
      id.startsWith('events_')
      || cat === 'eventos'
      || id === 'merma_registered'
      || id === 'worker_no_clockin'
      || id.startsWith('document_')
    );
  }
  if (!isRuleVisibleForVertical(ruleDepartment(rule), vertical)) return false;
  if (v === 'delivery' || v === 'restaurant' || !vertical) {
    return isDeliveryCompactAlertRuleId(rule.id);
  }
  // Otras verticales: solo reglas enabled en config se listan vía panel;
  // aquí aún filtramos por departamento visible.
  return true;
}

export function getDepartmentLabel(deptId: string, vertical?: string | null): string {
  if (String(vertical || '').trim() === 'restaurant') {
    const fromRestaurant = RESTAURANT_DEPARTMENTS.find((d) => d.id === deptId);
    if (fromRestaurant) return fromRestaurant.label;
  }
  return DEPARTMENT_CATALOG[deptId]?.label || deptId;
}
