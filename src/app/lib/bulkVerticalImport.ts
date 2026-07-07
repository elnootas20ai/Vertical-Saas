/** Helpers for bulk AI/import flows on vertical CRUD pages. */

export function entryStr(entry: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = entry[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function entryNum(entry: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = entry[key];
    if (value != null && value !== '') {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

export async function bulkCreateVerticalEntries<T extends Record<string, unknown>>(
  userId: string,
  api: { create: (uid: string, data: Partial<T>) => Promise<unknown> },
  entries: Record<string, unknown>[],
  mapEntry: (entry: Record<string, unknown>) => Partial<T> | null,
): Promise<number> {
  if (!userId) return 0;
  let created = 0;
  for (const entry of entries) {
    const data = mapEntry(entry);
    if (!data) continue;
    try {
      await api.create(userId, data);
      created++;
    } catch {
      /* skip failed row */
    }
  }
  return created;
}
