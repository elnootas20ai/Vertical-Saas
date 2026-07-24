import { describe, expect, it } from 'vitest';

/**
 * Regla UI: no mostrar «No se encontró» hasta que la query actual haya terminado de buscar.
 */
function shouldShowEmptyMessage(params) {
  const ready = String(params.input || '').trim().length >= (params.minLen ?? 2);
  return (
    !params.isSearching
    && params.resultsLength === 0
    && ready
    && params.settledQuery === String(params.input || '').trim()
  );
}

describe('TPV client search empty-message gate', () => {
  it('no muestra vacío mientras debounce / teclas intermedias', () => {
    expect(
      shouldShowEmptyMessage({
        isSearching: false,
        resultsLength: 0,
        input: 'ca',
        settledQuery: '',
      }),
    ).toBe(false);
  });

  it('muestra vacío solo cuando terminó esa query', () => {
    expect(
      shouldShowEmptyMessage({
        isSearching: false,
        resultsLength: 0,
        input: 'zzzz',
        settledQuery: 'zzzz',
      }),
    ).toBe(true);
  });

  it('no muestra vacío si hay resultados', () => {
    expect(
      shouldShowEmptyMessage({
        isSearching: false,
        resultsLength: 2,
        input: 'campi',
        settledQuery: 'campi',
      }),
    ).toBe(false);
  });
});
