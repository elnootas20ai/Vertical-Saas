/**
 * Resolución de nombre de marca en UI (caja / ops).
 * Solo frontend: no cambia IDs ni backend.
 */

export function brandIdAliases(brandId: string): string[] {
  const id = String(brandId || '').trim();
  if (!id) return [];
  const out = new Set<string>([id]);
  const noColon = id.replace(/^brand:/i, '');
  if (noColon) out.add(noColon);
  const bare = noColon.replace(/^brand-/i, '');
  if (bare) {
    out.add(bare);
    out.add(`brand-${bare}`);
    out.add(`brand:${bare}`);
  }
  return [...out];
}

/** Busca el nombre legible; si no hay, ''. */
export function lookupBrandLabel(
  brandId: string,
  labels: Record<string, string> | null | undefined,
): string {
  if (!labels) return '';
  for (const key of brandIdAliases(brandId)) {
    const name = String(labels[key] || '').trim();
    if (name) return name;
  }
  const bare = String(brandId || '')
    .replace(/^brand:/i, '')
    .replace(/^brand-/i, '')
    .trim()
    .toLowerCase();
  if (bare.length >= 8) {
    for (const [k, v] of Object.entries(labels)) {
      const kb = String(k || '')
        .replace(/^brand:/i, '')
        .replace(/^brand-/i, '')
        .trim()
        .toLowerCase();
      if (kb === bare) {
        const name = String(v || '').trim();
        if (name) return name;
      }
    }
  }
  return '';
}

/** Índice con alias (_id, id, con/sin prefijo brand-). */
export function buildBrandLabelsMap(
  brands: Array<{ _id?: string; id?: string; name?: string }>,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const b of brands || []) {
    const name = String(b.name || '').trim();
    if (!name) continue;
    for (const raw of [b._id, b.id]) {
      for (const key of brandIdAliases(String(raw || ''))) {
        labels[key] = name;
      }
    }
  }
  return labels;
}

export function displayBrandName(
  brandId: string,
  labels: Record<string, string> | null | undefined,
): string {
  const id = String(brandId || '').trim();
  if (!id) return '';
  return lookupBrandLabel(id, labels) || id;
}
