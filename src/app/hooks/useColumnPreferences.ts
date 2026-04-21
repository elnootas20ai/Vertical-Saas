import { useCallback, useState } from 'react';

const STORAGE_PREFIX = 'udar_col_prefs_';

export interface ColumnDef<T extends string = string> {
  id: T;
  label: string;
  required?: boolean; // Cannot be hidden
}

interface ColumnPrefs<T extends string> {
  visibleIds: T[];
  order: T[];
}

function loadPrefs<T extends string>(tableKey: string, defaults: T[]): ColumnPrefs<T> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableKey);
    if (raw) {
      const parsed = JSON.parse(raw) as ColumnPrefs<T>;
      // Make sure all defaults are present in order (in case we added new columns)
      const savedOrder = parsed.order.filter(id => defaults.includes(id));
      const missingInOrder = defaults.filter(id => !savedOrder.includes(id));
      return {
        visibleIds: parsed.visibleIds.filter(id => defaults.includes(id)),
        order: [...savedOrder, ...missingInOrder],
      };
    }
  } catch {
    // ignore
  }
  return { visibleIds: defaults, order: defaults };
}

function savePrefs<T extends string>(tableKey: string, prefs: ColumnPrefs<T>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function useColumnPreferences<T extends string>(
  tableKey: string,
  columns: ColumnDef<T>[],
) {
  const defaultIds = columns.map(c => c.id);

  const [prefs, setPrefs] = useState<ColumnPrefs<T>>(() =>
    loadPrefs(tableKey, defaultIds),
  );

  const updatePrefs = useCallback((newPrefs: ColumnPrefs<T>) => {
    setPrefs(newPrefs);
    savePrefs(tableKey, newPrefs);
  }, [tableKey]);

  const toggleColumn = useCallback((id: T) => {
    const col = columns.find(c => c.id === id);
    if (col?.required) return;
    setPrefs(prev => {
      const next: ColumnPrefs<T> = {
        ...prev,
        visibleIds: prev.visibleIds.includes(id)
          ? prev.visibleIds.filter(v => v !== id)
          : [...prev.visibleIds, id],
      };
      savePrefs(tableKey, next);
      return next;
    });
  }, [columns, tableKey]);

  const reorderColumns = useCallback((fromIndex: number, toIndex: number) => {
    setPrefs(prev => {
      const newOrder = [...prev.order];
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      const next: ColumnPrefs<T> = { ...prev, order: newOrder };
      savePrefs(tableKey, next);
      return next;
    });
  }, [tableKey]);

  const resetToDefault = useCallback(() => {
    const next: ColumnPrefs<T> = { visibleIds: defaultIds, order: defaultIds };
    updatePrefs(next);
  }, [defaultIds, updatePrefs]);

  // Ordered columns that are visible
  const visibleColumns = prefs.order.filter(id => prefs.visibleIds.includes(id));

  return {
    allColumns: columns,
    visibleColumns,
    columnOrder: prefs.order,
    visibleIds: prefs.visibleIds,
    toggleColumn,
    reorderColumns,
    resetToDefault,
  };
}
