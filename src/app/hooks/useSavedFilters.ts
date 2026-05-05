import { useCallback, useState } from 'react';

const STORAGE_PREFIX = 'vertial_saved_filters_';

export interface FilterPreset<T> {
  id: string;
  name: string;
  filters: T;
  createdAt: string;
}

function loadPresets<T>(tableKey: string): FilterPreset<T>[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableKey);
    if (raw) return JSON.parse(raw) as FilterPreset<T>[];
  } catch {
    // ignore
  }
  return [];
}

function savePresets<T>(tableKey: string, presets: FilterPreset<T>[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

export function useSavedFilters<T>(tableKey: string) {
  const [presets, setPresets] = useState<FilterPreset<T>[]>(() => loadPresets<T>(tableKey));

  const savePreset = useCallback((name: string, filters: T) => {
    const preset: FilterPreset<T> = {
      id: `preset_${Date.now()}`,
      name: name.trim(),
      filters,
      createdAt: new Date().toISOString(),
    };
    setPresets(prev => {
      const next = [...prev, preset];
      savePresets(tableKey, next);
      return next;
    });
    return preset;
  }, [tableKey]);

  const deletePreset = useCallback((id: string) => {
    setPresets(prev => {
      const next = prev.filter(p => p.id !== id);
      savePresets(tableKey, next);
      return next;
    });
  }, [tableKey]);

  const renamePreset = useCallback((id: string, newName: string) => {
    setPresets(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name: newName.trim() } : p);
      savePresets(tableKey, next);
      return next;
    });
  }, [tableKey]);

  return { presets, savePreset, deletePreset, renamePreset };
}
