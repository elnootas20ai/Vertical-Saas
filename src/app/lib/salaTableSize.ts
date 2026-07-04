export type TableSizePreset = 'small' | 'medium' | 'large' | 'bar';

export const TABLE_SIZE_PRESETS: Record<
  TableSizePreset,
  { label: string; shortLabel: string; gridW: number; gridH: number; capacity: number }
> = {
  small: { label: 'Pequeña · 2 pers.', shortLabel: 'Pequeña', gridW: 3, gridH: 3, capacity: 2 },
  medium: { label: 'Mediana · 4 pers.', shortLabel: 'Mediana', gridW: 4, gridH: 4, capacity: 4 },
  large: { label: 'Grande · 6 pers.', shortLabel: 'Grande', gridW: 6, gridH: 4, capacity: 6 },
  bar: { label: 'Barra · 2 pers.', shortLabel: 'Barra', gridW: 2, gridH: 2, capacity: 2 },
};

export function applyTableSizePreset(preset: TableSizePreset) {
  const p = TABLE_SIZE_PRESETS[preset];
  return { gridW: p.gridW, gridH: p.gridH, capacity: p.capacity, sizePreset: preset };
}

export function inferTableSizePreset(
  gridW: number,
  gridH: number,
  capacity: number,
): TableSizePreset {
  for (const [key, p] of Object.entries(TABLE_SIZE_PRESETS) as [TableSizePreset, typeof TABLE_SIZE_PRESETS[TableSizePreset]][]) {
    if (p.gridW === gridW && p.gridH === gridH) return key;
  }
  if (capacity <= 2) return 'bar';
  if (capacity <= 4) return 'medium';
  return 'large';
}

export function tableSizeLabel(gridW: number, gridH: number, capacity: number): string {
  return TABLE_SIZE_PRESETS[inferTableSizePreset(gridW, gridH, capacity)].shortLabel;
}
