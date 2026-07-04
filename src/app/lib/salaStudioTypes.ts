import type { DiningTable, DiningTableStatus, DiningWall, DiningZone, LayoutDecorItem } from './salaApi';

export type SalaRoomType = 'salon' | 'terraza' | 'patio' | 'barra' | 'vip' | 'privado';

export interface SalaRoom {
  id: string;
  name: string;
  color: string;
  roomType: SalaRoomType;
  sortOrder: number;
  /** PDV de caja compartido del restaurante */
  pdvId?: string;
  workCenterId?: string;
  /** Terminal TPV dentro del PDV (caja independiente por sala) */
  terminalId?: string;
  /** Etiqueta del terminal (p. ej. SALA-ABC12345) */
  terminalLabel?: string;
  /** Código tablet del PDV (compartido; activación en tablet) */
  terminalCode?: string;
}

export type EditorTool =
  | 'select'
  | 'table_square'
  | 'table_round'
  | 'table_rect'
  | 'table_high'
  | 'bar'
  | 'wall'
  | 'door'
  | 'window'
  | 'plant'
  | 'divider'
  | 'text'
  | 'zone';

export type TableShape = 'square' | 'round' | 'rect' | 'high' | 'stool';

export type DecorKind =
  | 'plant'
  | 'planter'
  | 'divider'
  | 'column'
  | 'decor'
  | 'bar'
  | 'door'
  | 'window'
  | 'kitchen'
  | 'bathroom'
  | 'stairs'
  | 'text'
  | 'zone';

export interface SalaDecorItem extends LayoutDecorItem {
  roomId?: string;
  rotation?: number;
  locked?: boolean;
  zIndex?: number;
  decorKind?: DecorKind;
  text?: string;
  color?: string;
}

export interface ExtendedDiningTable extends DiningTable {
  roomId?: string;
  shape?: TableShape;
  rotation?: number;
  locked?: boolean;
  notes?: string;
  qrCode?: string;
  visible?: boolean;
  sizePreset?: 'small' | 'medium' | 'large' | 'bar';
}

export interface ExtendedDiningWall extends DiningWall {
  roomId?: string;
  rotation?: number;
  color?: string;
}

export type SelectionKind = 'table' | 'wall' | 'zone' | 'decor' | null;

export interface StudioSelection {
  kind: SelectionKind;
  ids: string[];
}

export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface RestaurantSummary {
  roomCount: number;
  tableCount: number;
  capacity: number;
  availableCount: number;
  occupiedCount: number;
}

export interface RoomStats {
  tableCount: number;
  capacity: number;
  occupiedCount: number;
}

export const SALA_ROOM_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
] as const;

export const SALA_ROOM_TYPE_LABELS: Record<SalaRoomType, string> = {
  salon: 'Salón',
  terraza: 'Terraza',
  patio: 'Patio',
  barra: 'Barra',
  vip: 'VIP',
  privado: 'Privado',
};

export const STATUS_COLORS: Record<DiningTableStatus, string> = {
  available: '#22c55e',
  occupied: '#f97316',
  pending_order: '#eab308',
  served: '#3b82f6',
  pending_payment: '#a855f7',
  unavailable: '#ef4444',
  reserved: '#6366f1',
  hidden: '#9ca3af',
};

export const STATUS_LABELS: Record<DiningTableStatus, string> = {
  available: 'Disponible',
  occupied: 'Ocupada',
  pending_order: 'Esperando',
  served: 'Servida',
  pending_payment: 'Pendiente cobro',
  unavailable: 'No disponible',
  reserved: 'Reservada',
  hidden: 'Oculta',
};

export const TEMPLATE_OPTIONS = [
  { id: 'bar', label: 'Bar', icon: '🍺' },
  { id: 'cafeteria', label: 'Cafetería', icon: '☕' },
  { id: 'pizzeria', label: 'Pizzería', icon: '🍕' },
  { id: 'restaurant', label: 'Restaurante', icon: '🍽️' },
  { id: 'fastfood', label: 'Fast Food', icon: '🍔' },
  { id: 'terraza', label: 'Terraza', icon: '🌿' },
  { id: 'marisqueria', label: 'Marisquería', icon: '🦐' },
  { id: 'large', label: 'Restaurante grande', icon: '🏛️' },
  { id: 'duplicate', label: 'Duplicar distribución existente', icon: '📋' },
] as const;

export type TemplateId = (typeof TEMPLATE_OPTIONS)[number]['id'];

export interface StudioSnapshot {
  tables: ExtendedDiningTable[];
  walls: ExtendedDiningWall[];
  zones: DiningZone[];
  decor: SalaDecorItem[];
  rooms: SalaRoom[];
}
