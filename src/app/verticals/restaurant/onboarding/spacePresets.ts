import {
  Armchair,
  Layers,
  LayoutGrid,
  Plus,
  Umbrella,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import type { SalaRoomType } from '../../../lib/salaStudioTypes';
import type { SpacePresetId } from './types';

export type SpacePreset = {
  id: SpacePresetId;
  label: string;
  description: string;
  roomType: SalaRoomType;
  defaultName: string;
  icon: LucideIcon;
};

export const SPACE_PRESETS: SpacePreset[] = [
  {
    id: 'salon',
    label: 'Salón principal',
    description: 'Comedor interior',
    roomType: 'salon',
    defaultName: 'Salón Principal',
    icon: LayoutGrid,
  },
  {
    id: 'terraza',
    label: 'Terraza',
    description: 'Exterior / patio',
    roomType: 'terraza',
    defaultName: 'Terraza',
    icon: Umbrella,
  },
  {
    id: 'barra',
    label: 'Barra',
    description: 'Taburetes y servicio rápido',
    roomType: 'barra',
    defaultName: 'Barra',
    icon: Wine,
  },
  {
    id: 'privado',
    label: 'Reservados',
    description: 'Sala privada / VIP',
    roomType: 'privado',
    defaultName: 'Reservados',
    icon: Armchair,
  },
  {
    id: 'otra_planta',
    label: 'Otra planta',
    description: 'Piso superior u otro nivel',
    roomType: 'salon',
    defaultName: 'Planta 1',
    icon: Layers,
  },
  {
    id: 'custom',
    label: 'Otro',
    description: 'Espacio personalizado',
    roomType: 'salon',
    defaultName: 'Espacio',
    icon: Plus,
  },
];

export function presetById(id: SpacePresetId): SpacePreset {
  return SPACE_PRESETS.find((p) => p.id === id) || SPACE_PRESETS[0];
}

let spaceKeySeq = 0;

export function createSpaceKey(): string {
  spaceKeySeq += 1;
  return `space_${Date.now().toString(36)}_${spaceKeySeq}`;
}
