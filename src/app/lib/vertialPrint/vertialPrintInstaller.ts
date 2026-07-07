/** Ruta pública del ejecutable Windows (se copia a dist en el build del frontend). */
export const VERTIAL_PRINT_EXE_PATH = '/downloads/VertialPrint.exe';

export function resolveVertialPrintDownloadUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${VERTIAL_PRINT_EXE_PATH}`;
  }
  return `https://vertialapp.com${VERTIAL_PRINT_EXE_PATH}`;
}

export const VERTIAL_PRINT_INSTALL_HINT =
  'Descarga Vertial Print en el PC del mostrador (Windows), ábrelo y deja la ventana en segundo plano.';
