import type { ImportFieldDef } from '../components/saas/GenericImportModal';

/** Normaliza cabecera Excel/CSV: BOM, acentos, mayúsculas, asteriscos. */
export function normalizeImportHeader(value: string): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s*\*\s*/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ImportHeaderAliases = Record<string, string[]>;

/**
 * Auto-mapea columnas del archivo a campos del importador.
 * `aliases[fieldKey]` = sinónimos extra (nombre, categoría, price…).
 */
export function autoMapImportFields(
  fields: ImportFieldDef[],
  headers: string[],
  aliases?: ImportHeaderAliases,
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<number>();

  const indexed = headers.map((raw, idx) => ({
    idx,
    raw: String(raw ?? ''),
    norm: normalizeImportHeader(String(raw ?? '')),
  }));

  for (const field of fields) {
    const candidates = new Set<string>();
    for (const part of [field.label, field.key, ...(aliases?.[field.key] ?? [])]) {
      const norm = normalizeImportHeader(part);
      if (norm) candidates.add(norm);
    }

    const hit = indexed.find(({ idx, norm }) => !used.has(idx) && candidates.has(norm));
    if (!hit) continue;
    mapping[field.key] = hit.raw;
    used.add(hit.idx);
  }

  return mapping;
}
