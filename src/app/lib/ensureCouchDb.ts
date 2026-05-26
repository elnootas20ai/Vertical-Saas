/**
 * Deduplicador en memoria de `ensureDb()`.
 *
 * Problema que resuelve
 * ─────────────────────
 * Antes, cada `*Api.ts` (clockins, quotes, vacations…) tenía su propio
 * `ensureDb()` que llamaba `PUT /api/couch/db/<name>` en cada listado, lectura
 * o guardado. En una recarga de página o tras el login se disparaban 12+
 * PUTs paralelos a CouchDB para crear bases que ya existían (200 → 412),
 * generando picos de I/O capaces de tumbar un VPS pequeño (visto en logs:
 * 10–15 PUTs en 25 ms tras cargar la app).
 *
 * Comportamiento
 * ──────────────
 * - La primera llamada a `ensureCouchDb(dbName, doPut)` ejecuta `doPut` y
 *   memoriza la promesa hasta que termine.
 * - Las llamadas concurrentes durante esa promesa esperan a la misma promesa
 *   en lugar de lanzar un PUT nuevo (coalescing).
 * - Si la promesa resuelve OK, el resultado se cachea para el resto de la
 *   sesión del navegador. Llamadas posteriores devuelven `undefined`
 *   sincrónicamente sin tocar la red.
 * - Si la promesa rechaza (red caída, 5xx), se invalida el cache para que el
 *   siguiente intento vuelva a probar — no nos quedamos en estado roto.
 *
 * Si quieres forzar un reintento (raro: el usuario tira de "limpiar caché"),
 * llama `resetEnsuredCouchDbs()`.
 */

const inflight = new Map<string, Promise<void>>();
const ensured = new Set<string>();

export async function ensureCouchDb(
  dbName: string,
  doPut: () => Promise<unknown>,
): Promise<void> {
  if (ensured.has(dbName)) return;

  const existing = inflight.get(dbName);
  if (existing) return existing;

  const promise = (async () => {
    try {
      await doPut();
      ensured.add(dbName);
    } finally {
      inflight.delete(dbName);
    }
  })();

  inflight.set(dbName, promise);
  return promise;
}

export function resetEnsuredCouchDbs(): void {
  ensured.clear();
  inflight.clear();
}
