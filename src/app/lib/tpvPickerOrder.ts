export type TpvPickerOrderStore = {
  sections?: string[];
  categoriesBySection?: Record<string, string[]>;
};

const STORAGE_PREFIX = 'vertial.tpvPickerOrder:v1:';

export function tpvPickerOrderStorageKey(userId: string, businessId: string): string {
  return `${STORAGE_PREFIX}${String(userId || '').trim()}:${String(businessId || '').trim()}`;
}

function readStore(key: string): TpvPickerOrderStore {
  if (typeof localStorage === 'undefined' || !key) return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TpvPickerOrderStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(key: string, store: TpvPickerOrderStore): void {
  if (typeof localStorage === 'undefined' || !key) return;
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

/** Conserva el orden guardado e inserta ids nuevos al final. */
export function mergeTpvPickerOrder(saved: string[], current: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of saved) {
    if (!current.includes(id) || seen.has(id)) continue;
    out.push(id);
    seen.add(id);
  }
  for (const id of current) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

export function reorderTpvPickerIds(ids: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex === toIndex) return ids;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function readTpvSectionOrder(key: string, sectionIds: string[]): string[] {
  const store = readStore(key);
  return mergeTpvPickerOrder(store.sections ?? [], sectionIds);
}

export function writeTpvSectionOrder(key: string, sectionIds: string[]): void {
  const store = readStore(key);
  writeStore(key, { ...store, sections: sectionIds });
}

export function readTpvCategoryOrder(key: string, sectionId: string, categoryIds: string[]): string[] {
  const store = readStore(key);
  const saved = store.categoriesBySection?.[sectionId] ?? [];
  return mergeTpvPickerOrder(saved, categoryIds);
}

export function writeTpvCategoryOrder(key: string, sectionId: string, categoryIds: string[]): void {
  const store = readStore(key);
  writeStore(key, {
    ...store,
    categoriesBySection: {
      ...(store.categoriesBySection ?? {}),
      [sectionId]: categoryIds,
    },
  });
}
