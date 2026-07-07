import { describe, it, expect } from 'vitest';
import { ImportAbortError, throwIfAborted, isImportAbortError } from '../src/app/lib/importAbort';

describe('importAbort', () => {
  it('detecta cancelación', () => {
    const err = new ImportAbortError();
    expect(isImportAbortError(err)).toBe(true);
  });

  it('lanza si el signal está abortado', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(ImportAbortError);
  });
});
