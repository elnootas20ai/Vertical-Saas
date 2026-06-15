export const DEFAULT_BULK_BATCH_SIZE = 500;
export const DEFAULT_BULK_MAX_DOCS = 100_000;

export function resolveBulkImportLimits(env = process.env) {
  const batchSize = Math.min(
    1000,
    Math.max(50, Number(env.BULK_IMPORT_BATCH_SIZE || DEFAULT_BULK_BATCH_SIZE)),
  );
  const maxDocs = Math.max(1000, Number(env.BULK_IMPORT_MAX_DOCS || DEFAULT_BULK_MAX_DOCS));
  return { batchSize, maxDocs };
}

export function capDocsForImport(docs, maxDocs) {
  const total = docs.length;
  const capped = docs.slice(0, maxDocs);
  return { capped, total, skipped: Math.max(0, total - capped.length) };
}

export function chunkDocs(docs, batchSize) {
  const chunks = [];
  for (let i = 0; i < docs.length; i += batchSize) {
    chunks.push(docs.slice(i, i + batchSize));
  }
  return chunks;
}
