import type { SalaRoomType } from '../../lib/salaStudioTypes';

/** 4 skins visuales del plano (varios roomType pueden compartir skin). */
export type SalaFloorSkinId = 'salon' | 'terraza' | 'barra' | 'vip';

export type SalaFloorSkin = {
  id: SalaFloorSkinId;
  label: string;
  /** Fondo del canvas */
  floorClass: string;
  /** Patrón / atmósfera */
  atmosphereClass: string;
  /** Mesa en el plano */
  tableClass: string;
  /** Texto sobre mesa */
  tableTextClass: string;
  /** Hint de zona */
  badgeClass: string;
};

export const SALA_FLOOR_SKINS: Record<SalaFloorSkinId, SalaFloorSkin> = {
  salon: {
    id: 'salon',
    label: 'Salón',
    floorClass: 'bg-gradient-to-br from-amber-50 via-stone-100 to-amber-100/80 dark:from-stone-900 dark:via-stone-950 dark:to-amber-950/40',
    atmosphereClass:
      'bg-[radial-gradient(ellipse_at_30%_20%,rgba(251,191,36,0.12),transparent_50%),radial-gradient(ellipse_at_80%_80%,rgba(120,113,108,0.08),transparent_45%)]',
    tableClass:
      'border-2 border-amber-800/40 bg-amber-100/95 shadow-md shadow-amber-900/10 dark:border-amber-600/50 dark:bg-amber-950/80',
    tableTextClass: 'text-amber-950 dark:text-amber-50',
    badgeClass: 'bg-amber-900/80 text-amber-50',
  },
  terraza: {
    id: 'terraza',
    label: 'Terraza',
    floorClass: 'bg-gradient-to-br from-emerald-50 via-lime-50/80 to-sky-100 dark:from-emerald-950 dark:via-stone-950 dark:to-sky-950/50',
    atmosphereClass:
      'bg-[radial-gradient(ellipse_at_20%_10%,rgba(74,222,128,0.18),transparent_45%),radial-gradient(ellipse_at_90%_30%,rgba(125,211,252,0.2),transparent_40%)]',
    tableClass:
      'border-2 border-emerald-700/35 bg-white/90 shadow-md shadow-emerald-900/10 dark:border-emerald-500/40 dark:bg-emerald-950/70',
    tableTextClass: 'text-emerald-950 dark:text-emerald-50',
    badgeClass: 'bg-emerald-800/85 text-emerald-50',
  },
  barra: {
    id: 'barra',
    label: 'Barra',
    floorClass: 'bg-gradient-to-b from-zinc-200 via-stone-200 to-zinc-300 dark:from-zinc-900 dark:via-stone-950 dark:to-zinc-900',
    atmosphereClass:
      'bg-[linear-gradient(90deg,transparent_0%,rgba(63,63,70,0.12)_8%,rgba(63,63,70,0.12)_22%,transparent_30%)]',
    tableClass:
      'border-2 border-zinc-700/40 bg-zinc-100 shadow-md dark:border-zinc-400/40 dark:bg-zinc-800',
    tableTextClass: 'text-zinc-900 dark:text-zinc-50',
    badgeClass: 'bg-zinc-800 text-zinc-50',
  },
  vip: {
    id: 'vip',
    label: 'VIP',
    floorClass: 'bg-gradient-to-br from-violet-950 via-stone-950 to-fuchsia-950/80',
    atmosphereClass:
      'bg-[radial-gradient(ellipse_at_50%_0%,rgba(167,139,250,0.25),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(232,121,249,0.12),transparent_40%)]',
    tableClass:
      'border-2 border-violet-400/50 bg-violet-950/90 shadow-lg shadow-violet-900/40',
    tableTextClass: 'text-violet-50',
    badgeClass: 'bg-violet-500/90 text-white',
  },
};

export function skinIdForRoomType(roomType: SalaRoomType | string | undefined): SalaFloorSkinId {
  switch (String(roomType || '').trim()) {
    case 'terraza':
    case 'patio':
      return 'terraza';
    case 'barra':
      return 'barra';
    case 'vip':
      return 'vip';
    case 'privado':
    case 'salon':
    default:
      return 'salon';
  }
}

export function skinForRoomType(roomType: SalaRoomType | string | undefined): SalaFloorSkin {
  return SALA_FLOOR_SKINS[skinIdForRoomType(roomType)];
}

export const DEFAULT_FLOOR_WIDTH = 960;
export const DEFAULT_FLOOR_HEIGHT = 640;
export const TABLE_NODE_SIZE = 72;
