import type { SalaRoomType, TableShape } from '../../../lib/salaStudioTypes';

export type OnboardingStepId = 'spaces' | 'names' | 'tables' | 'summary';

export const ONBOARDING_STEPS: OnboardingStepId[] = [
  'spaces',
  'names',
  'tables',
  'summary',
];

export type SpacePresetId =
  | 'salon'
  | 'terraza'
  | 'barra'
  | 'privado'
  | 'otra_planta'
  | 'custom';

export type OnboardingSpace = {
  /** Id estable en el borrador del wizard */
  key: string;
  presetId: SpacePresetId;
  roomType: SalaRoomType;
  name: string;
  tableCount: number;
  defaultCapacity: number;
  /** true = todas las mesas de esta sala con la misma capacidad */
  allSameCapacity: boolean;
  /** Capacidad por mesa cuando allSameCapacity = false */
  capacitiesPerTable: number[];
  shape: TableShape;
};

export type OnboardingDraft = {
  step: OnboardingStepId;
  /** Índice de sala en el paso "mesas" (sala 1 de N) */
  tablesSpaceIndex: number;
  spaces: OnboardingSpace[];
  updatedAt: number;
};

export type OnboardingConfirmRoom = {
  name: string;
  roomType: SalaRoomType;
  tableCount: number;
  defaultCapacity: number;
  /** Si está definido, una capacidad por mesa (modo distintas). */
  capacities?: number[];
  shape: TableShape;
};
