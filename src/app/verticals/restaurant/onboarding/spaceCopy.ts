import type { SalaRoomType } from '../../../lib/salaStudioTypes';
import type { OnboardingSpace } from './types';

export type SpaceUnitCopy = {
  /** mesa | taburete | plaza… */
  unitSingular: string;
  unitPlural: string;
  /** «Mesas de…» / «Taburetes de…» */
  titlePrefix: string;
  countLabel: string;
  capacityLabel: string;
  sameCapacityHint: string;
  differentCapacityHint: string;
  unitIndexLabel: (index: number) => string;
  aforoLabel: (name: string, aforo: number) => string;
  introHint: string;
  summaryCount: (n: number) => string;
  summaryPax: (pax: number) => string;
};

const MESA_COPY: SpaceUnitCopy = {
  unitSingular: 'mesa',
  unitPlural: 'mesas',
  titlePrefix: 'Mesas de',
  countLabel: 'Número de mesas',
  capacityLabel: 'Capacidad por mesa',
  sameCapacityHint: 'Un valor para todas las mesas',
  differentCapacityHint: 'Capacidad distinta por mesa',
  unitIndexLabel: (index) => `Mesa ${index + 1}`,
  aforoLabel: (name, aforo) => `Aforo de «${name}» ≈ ${aforo} personas`,
  introHint: 'Indica cuántas mesas y comensales.',
  summaryCount: (n) => `${n} ${n === 1 ? 'mesa' : 'mesas'}`,
  summaryPax: (pax) => `${pax} pax/mesa`,
};

const BARRA_COPY: SpaceUnitCopy = {
  unitSingular: 'taburete',
  unitPlural: 'taburetes',
  titlePrefix: 'Taburetes / plazas de',
  countLabel: 'Número de taburetes (plazas de barra)',
  capacityLabel: 'Personas por taburete',
  sameCapacityHint: 'Misma capacidad en todos los taburetes',
  differentCapacityHint: 'Capacidad distinta por taburete',
  unitIndexLabel: (index) => `Taburete ${index + 1}`,
  aforoLabel: (name, aforo) => `Aforo de la barra «${name}» ≈ ${aforo} personas`,
  introHint: 'En barra contamos taburetes o plazas, no mesas.',
  summaryCount: (n) => `${n} ${n === 1 ? 'taburete' : 'taburetes'}`,
  summaryPax: (pax) => `${pax} pax/taburete`,
};

export function isBarraSpace(space: Pick<OnboardingSpace, 'roomType' | 'presetId'>): boolean {
  return space.roomType === 'barra' || space.presetId === 'barra';
}

export function spaceUnitCopy(
  space: Pick<OnboardingSpace, 'roomType' | 'presetId'> | null | undefined,
): SpaceUnitCopy {
  if (space && isBarraSpace(space)) return BARRA_COPY;
  return MESA_COPY;
}

export function spaceUnitCopyForRoomType(roomType: SalaRoomType | string): SpaceUnitCopy {
  if (roomType === 'barra') return BARRA_COPY;
  return MESA_COPY;
}
