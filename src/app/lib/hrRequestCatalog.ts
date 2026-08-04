/**
 * Catálogo MVP de solicitudes del trabajador → RRHH.
 * Se persisten como `vacation_request.leaveType` (misma DB / aprobación).
 */
export type LeaveType =
  | 'vacation'
  | 'personal'
  | 'sick'
  | 'accident'
  | 'unpaid'
  | 'maternity'
  | 'paternity'
  | 'bereavement'
  | 'marriage'
  | 'training'
  | 'other';

export type HrRequestUrgency = 'normal' | 'urgent';

export type HrRequestCategory = 'time_off' | 'health' | 'family' | 'work' | 'other';

export type HrRequestTypeDef = {
  id: LeaveType;
  /** Etiqueta corta ES */
  label: string;
  /** Una línea para el catálogo */
  description: string;
  category: HrRequestCategory;
  /** Descuenta saldo de vacaciones */
  consumesVacationBalance: boolean;
  /** Si RRHH aprueba, bloquea fichaje/TPV esos días */
  blocksWorkWhenApproved: boolean;
  /** Permite pedir con inicio = hoy (sin antelación) */
  allowSameDay: boolean;
  /** Motivo obligatorio */
  notesRequired: boolean;
  /** Por defecto urgente en el formulario */
  defaultUrgent: boolean;
  /** Orden en el catálogo worker */
  sort: number;
  /** Si true, el trabajador no puede pedirlo (sigue existiendo por historial/RRHH). */
  hiddenFromWorker?: boolean;
};

export const HR_REQUEST_TYPES: HrRequestTypeDef[] = [
  {
    id: 'vacation',
    label: 'Vacaciones',
    description: 'Días de descanso con cargo a tu saldo anual',
    category: 'time_off',
    consumesVacationBalance: true,
    blocksWorkWhenApproved: true,
    allowSameDay: false,
    notesRequired: false,
    defaultUrgent: false,
    sort: 10,
  },
  {
    id: 'personal',
    label: 'Asuntos propios',
    description: 'Día personal / gestiones (según política de empresa)',
    category: 'time_off',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: false,
    allowSameDay: true,
    notesRequired: true,
    defaultUrgent: false,
    sort: 20,
  },
  {
    id: 'sick',
    label: 'Baja por enfermedad',
    description: 'Incapacidad temporal por enfermedad común',
    category: 'health',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: true,
    notesRequired: true,
    defaultUrgent: true,
    sort: 30,
  },
  {
    id: 'accident',
    label: 'Accidente laboral',
    description: 'Accidente en el trabajo o in itinere',
    category: 'health',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: true,
    notesRequired: true,
    defaultUrgent: true,
    sort: 40,
  },
  {
    id: 'bereavement',
    label: 'Fallecimiento familiar',
    description: 'Permiso por duelo / fallecimiento de familiar',
    category: 'family',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: true,
    notesRequired: true,
    defaultUrgent: true,
    sort: 50,
  },
  {
    id: 'marriage',
    label: 'Matrimonio',
    description: 'Permiso por matrimonio o pareja de hecho',
    category: 'family',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: false,
    notesRequired: false,
    defaultUrgent: false,
    sort: 60,
  },
  {
    id: 'maternity',
    label: 'Maternidad / adopción',
    description: 'Permiso de maternidad, adopción o acogida',
    category: 'family',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: true,
    notesRequired: false,
    defaultUrgent: false,
    sort: 70,
    hiddenFromWorker: true,
  },
  {
    id: 'paternity',
    label: 'Paternidad',
    description: 'Permiso de paternidad / cuidado del menor',
    category: 'family',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: true,
    notesRequired: false,
    defaultUrgent: false,
    sort: 80,
  },
  {
    id: 'training',
    label: 'Formación',
    description: 'Curso, examen o formación autorizada',
    category: 'work',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: false,
    notesRequired: true,
    defaultUrgent: false,
    sort: 90,
  },
  {
    id: 'unpaid',
    label: 'Excedencia / no retribuido',
    description: 'Permiso sin sueldo o excedencia (lo valida RRHH)',
    category: 'time_off',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: false,
    notesRequired: true,
    defaultUrgent: false,
    sort: 100,
  },
  {
    id: 'other',
    label: 'Otra solicitud',
    description: 'Cualquier otro permiso; explica el motivo a RRHH',
    category: 'other',
    consumesVacationBalance: false,
    blocksWorkWhenApproved: true,
    allowSameDay: true,
    notesRequired: true,
    defaultUrgent: false,
    sort: 110,
  },
];

const BY_ID = new Map(HR_REQUEST_TYPES.map((t) => [t.id, t]));

export function getHrRequestType(id: string | null | undefined): HrRequestTypeDef {
  const key = String(id || 'other').trim() as LeaveType;
  return BY_ID.get(key) || BY_ID.get('other')!;
}

export function listHrRequestTypesForWorker(): HrRequestTypeDef[] {
  return HR_REQUEST_TYPES
    .filter((t) => !t.hiddenFromWorker)
    .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
}

/** Tipos que, aprobados, bloquean fichaje / TPV. */
export const WORK_BLOCKING_LEAVE_TYPES: LeaveType[] = HR_REQUEST_TYPES
  .filter((t) => t.blocksWorkWhenApproved)
  .map((t) => t.id);

export const LEAVE_TYPE_LABELS_ES: Record<LeaveType, string> = Object.fromEntries(
  HR_REQUEST_TYPES.map((t) => [t.id, t.label]),
) as Record<LeaveType, string>;

/** Etiquetas cortas para celdas del calendario de equipo. */
export const LEAVE_TYPE_SHORT_ES: Record<LeaveType, string> = {
  vacation: 'Vac.',
  personal: 'Pers.',
  sick: 'Baja',
  accident: 'Acc.',
  unpaid: 'S/sueldo',
  maternity: 'Mat.',
  paternity: 'Pat.',
  bereavement: 'Duelo',
  marriage: 'Matrim.',
  training: 'Form.',
  other: 'Otro',
};

/** Clases Tailwind para chips de ausencia en calendario (aprobada). */
export const LEAVE_TYPE_CHIP_CLASS: Record<LeaveType, string> = {
  vacation: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  personal: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
  sick: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  accident: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  unpaid: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  maternity: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  paternity: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
  bereavement: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  marriage: 'bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-400',
  training: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  other: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
};

export const HR_CATEGORY_LABELS_ES: Record<HrRequestCategory, string> = {
  time_off: 'Descanso',
  health: 'Salud',
  family: 'Familia',
  work: 'Trabajo',
  other: 'Otros',
};

export function todayIsoLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Suma días a una fecha ISO local (YYYY-MM-DD). */
export function addDaysIsoLocal(iso: string, days: number): string {
  const d = new Date(`${String(iso || '').trim()}T12:00:00`);
  if (Number.isNaN(d.getTime())) return todayIsoLocal();
  d.setDate(d.getDate() + Number(days || 0));
  return todayIsoLocal(d);
}
