/**
 * Etiquetas y defaults de puestos en sala (mesas vs taburetes de barra).
 * Compartido por el asistente de alta y la edición en vivo.
 */

import type { SalaRoomType } from '../../lib/salaStudioTypes';

/** Nombre operativo del puesto en plano / TPV / cocina. */
export function seatingUnitLabel(roomType: SalaRoomType | string | undefined, number: number): string {
  if (roomType === 'barra') return `Taburete ${number}`;
  return `Mesa ${number}`;
}

/** Capacidad por defecto al crear zona. */
export function defaultSeatingCapacity(roomType: SalaRoomType): number {
  switch (roomType) {
    case 'barra':
      return 1;
    case 'vip':
    case 'privado':
      return 6;
    default:
      return 4;
  }
}

/** Nº de puestos sugerido al crear una zona nueva. */
export function defaultSeatingCount(roomType: SalaRoomType): number {
  switch (roomType) {
    case 'barra':
      return 6;
    case 'terraza':
    case 'patio':
      return 6;
    case 'vip':
    case 'privado':
      return 2;
    default:
      return 4;
  }
}

export function isBarraRoomType(roomType: SalaRoomType | string | undefined): boolean {
  return roomType === 'barra';
}
