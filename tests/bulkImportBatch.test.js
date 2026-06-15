import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  capDocsForImport,
  chunkDocs,
  DEFAULT_BULK_MAX_DOCS,
} from '../services/bulkImportBatch.js';

describe('bulkImportBatch', () => {
  it('capDocsForImport allows more than 5000 docs', () => {
    const docs = Array.from({ length: 7500 }, (_, i) => ({ _id: `c-${i}` }));
    const { capped, total, skipped } = capDocsForImport(docs, DEFAULT_BULK_MAX_DOCS);
    assert.equal(total, 7500);
    assert.equal(capped.length, 7500);
    assert.equal(skipped, 0);
  });

  it('chunkDocs splits in batches', () => {
    const docs = Array.from({ length: 1200 }, (_, i) => i);
    const chunks = chunkDocs(docs, 500);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 500);
    assert.equal(chunks[2].length, 200);
  });
});
