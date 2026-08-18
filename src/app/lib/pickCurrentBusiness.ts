import { normalizeBusinessScopeId } from './deliverySetup';

export type BusinessIdLike = {
  business_id?: string | null;
  id?: string | null;
};

export function findBusinessInList<T extends BusinessIdLike>(
  list: T[],
  id: string | null | undefined,
): T | undefined {
  const n = normalizeBusinessScopeId(id);
  if (!n) return undefined;
  return list.find(
    (b) =>
      normalizeBusinessScopeId(b.business_id) === n
      || normalizeBusinessScopeId(b.id) === n,
  );
}

/**
 * Tras recargar empresas: la empresa visible en pantalla manda.
 * Nunca caer al primero (bodegeta) por recargas en segundo plano,
 * ids guardados de otra pestaña o índices lentos al crear.
 */
export function resolveBusinessAfterReload<T extends BusinessIdLike>(
  list: T[],
  opts: {
    storedId: string | null;
    previous: T | null;
    linkedId?: string | null;
  },
): { business: T | null; persistStoredId: boolean } {
  if (list.length === 0) {
    return { business: null, persistStoredId: true };
  }

  const linked = findBusinessInList(list, opts.linkedId);
  if (linked) return { business: linked, persistStoredId: true };

  const prev = opts.previous;
  const prevId = normalizeBusinessScopeId(prev?.business_id || prev?.id);
  const storedNorm = normalizeBusinessScopeId(opts.storedId);

  // La empresa en pantalla sigue existiendo: no saltar aunque el
  // localStorage diga otra cosa (otra pestaña, TPV, recarga en background).
  const prevInList = findBusinessInList(list, prevId);
  if (prevInList) return { business: prevInList, persistStoredId: true };

  // Empresa recién creada: el fetch aún no la trae pero está en memoria.
  if (prev && storedNorm && prevId === storedNorm) {
    return { business: prev, persistStoredId: false };
  }

  const stored = findBusinessInList(list, opts.storedId);
  if (stored) return { business: stored, persistStoredId: true };

  // Id guardado que aún no aparece: no devolver list[0] (bodegeta).
  if (storedNorm) {
    return { business: prev, persistStoredId: false };
  }

  return { business: null, persistStoredId: false };
}
