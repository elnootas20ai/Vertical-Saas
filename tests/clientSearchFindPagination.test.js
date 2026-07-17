import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Copia de la lógica de paginación de findDocuments (sin Couch)
 * para asegurar el corte de bookmark / pageSize.
 */
function paginateFindMock(pages, pageSize = 500, maxDocs = 50_000) {
  const docs = [];
  let bookmark;
  let previousBookmark;
  let pageIdx = 0;

  while (docs.length < maxDocs && pageIdx < pages.length) {
    const batch = pages[pageIdx];
    pageIdx += 1;
    docs.push(...batch.slice(0, Math.min(pageSize, maxDocs - docs.length)));
    if (batch.length < pageSize) break;
    previousBookmark = bookmark;
    bookmark = `b${pageIdx}`;
    if (!bookmark || bookmark === previousBookmark) break;
  }
  return docs;
}

describe('client search find pagination', () => {
  it('stops when last page is smaller than pageSize', () => {
    const pages = [
      Array.from({ length: 500 }, (_, i) => ({ id: i })),
      Array.from({ length: 12 }, (_, i) => ({ id: 500 + i })),
    ];
    const docs = paginateFindMock(pages, 500);
    assert.equal(docs.length, 512);
  });

  it('respects maxDocs', () => {
    const pages = [
      Array.from({ length: 500 }, (_, i) => ({ id: i })),
      Array.from({ length: 500 }, (_, i) => ({ id: 500 + i })),
    ];
    const docs = paginateFindMock(pages, 500, 700);
    assert.equal(docs.length, 700);
  });
});
