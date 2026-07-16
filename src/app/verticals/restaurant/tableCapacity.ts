import type { DiningTable } from '../../lib/salaApi';
import { TABLE_SIZE_PRESETS, type TableSizePreset } from '../../lib/salaTableSize';

/**
 * Capacidad real de comensales.
 * Corrige un bug histórico donde capacity quedaba = gridW×gridH (p. ej. 3×3 → 9).
 */
export function resolveTableCapacity(table: Pick<DiningTable, 'capacity' | 'gridW' | 'gridH' | 'sizePreset'>): number {
  const n = Number(table.capacity);
  const gw = Number(table.gridW) || 0;
  const gh = Number(table.gridH) || 0;
  const area = gw * gh;
  const looksLikeGridArea = area > 0 && Number.isFinite(n) && n === area;

  if (Number.isFinite(n) && n > 0 && !looksLikeGridArea) {
    return Math.round(n);
  }

  const preset = String(table.sizePreset || '') as TableSizePreset;
  if (preset && TABLE_SIZE_PRESETS[preset]) {
    return TABLE_SIZE_PRESETS[preset].capacity;
  }

  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return 4;
}
