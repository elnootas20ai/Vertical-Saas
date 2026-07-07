/** Lanzada cuando el usuario cancela una importación en curso. */
export class ImportAbortError extends Error {
  constructor(message = 'Importación cancelada') {
    super(message);
    this.name = 'ImportAbortError';
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new ImportAbortError();
}

export function isImportAbortError(err: unknown): boolean {
  return err instanceof ImportAbortError || (err as Error)?.name === 'ImportAbortError';
}
