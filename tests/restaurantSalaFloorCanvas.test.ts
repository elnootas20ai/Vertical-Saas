import { describe, expect, it } from 'vitest';
import type { DiningTable } from '../src/app/lib/salaApi';
import type { SalaRoom } from '../src/app/lib/salaStudioTypes';
import {
  compactFloorDimensions,
  fallbackFloorTablePosition,
  positionTablesForFloor,
} from '../src/app/verticals/restaurant/RestaurantSalaFloorCanvas';

const salon = {
  id: 'salon-1',
  name: 'Salón',
  roomType: 'salon',
} as SalaRoom;

function table(id: string, x?: number, y?: number): DiningTable {
  return {
    _id: id,
    number: Number(id.replace(/\D/g, '')) || 1,
    roomId: salon.id,
    x,
    y,
  } as DiningTable;
}

describe('RestaurantSalaFloorCanvas geometry', () => {
  it('respeta las coordenadas guardadas por el editor', () => {
    const [positioned] = positionTablesForFloor([table('mesa-1', 245, 136)], salon);
    expect(positioned).toMatchObject({ x: 245, y: 136 });
  });

  it('coloca mesas legacy sin posición en un grid determinista', () => {
    const positioned = positionTablesForFloor(
      [table('mesa-1'), table('mesa-2', 0, 0), table('mesa-3', 0, 0)],
      salon,
    );
    expect(positioned.map(({ x, y }) => ({ x, y }))).toEqual([
      fallbackFloorTablePosition(0, false),
      fallbackFloorTablePosition(1, false),
      fallbackFloorTablePosition(2, false),
    ]);
  });

  it('usa una distribución más compacta para barra', () => {
    expect(fallbackFloorTablePosition(5, true)).toEqual({ x: 580, y: 80 });
    expect(fallbackFloorTablePosition(6, true)).toEqual({ x: 80, y: 180 });
  });

  it('elimina el espacio vacío del lienzo legacy sin ocultar mesas alejadas', () => {
    expect(compactFloorDimensions([table('mesa-1', 500, 300)], 2000, 1200)).toEqual({
      width: 960,
      height: 640,
    });
    expect(compactFloorDimensions([table('mesa-1', 1500, 800)], 2000, 1200)).toEqual({
      width: 1700,
      height: 980,
    });
  });
});
