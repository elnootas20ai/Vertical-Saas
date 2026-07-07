import { Download, Monitor } from 'lucide-react';
import { resolveVertialPrintDownloadUrl, VERTIAL_PRINT_INSTALL_HINT } from '../../lib/vertialPrint/vertialPrintInstaller';

interface VertialPrintInstallHintProps {
  /** Si true, el texto habla de un PC distinto (p. ej. iPad → PC del mostrador). */
  remotePc?: boolean;
  compact?: boolean;
}

export function VertialPrintInstallHint({ remotePc = false, compact = false }: VertialPrintInstallHintProps) {
  const downloadUrl = resolveVertialPrintDownloadUrl();

  if (compact) {
    return (
      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
        {remotePc
          ? 'En el PC del mostrador (misma WiFi): descarga e inicia Vertial Print.'
          : 'Descarga e inicia Vertial Print en este PC.'}{' '}
        <a
          href={downloadUrl}
          className="font-semibold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
          download
        >
          Descargar para Windows
        </a>
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-3">
      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100 flex items-center gap-2">
        <Monitor className="w-4 h-4 shrink-0" />
        {remotePc ? 'Activa Vertial Print en el PC del mostrador' : 'Instala Vertial Print en este PC'}
      </p>
      <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">{VERTIAL_PRINT_INSTALL_HINT}</p>
      <ol className="text-xs text-amber-900/90 dark:text-amber-200/90 space-y-1 list-decimal list-inside leading-relaxed">
        <li>
          <a
            href={downloadUrl}
            className="font-semibold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-50"
            download
          >
            Descargar VertialPrint.exe
          </a>{' '}
          (Windows, sin instalar nada más).
        </li>
        <li>Abre el archivo y deja la ventana negra en segundo plano.</li>
        <li>
          {remotePc
            ? 'En la tablet, indica la IP de ese PC abajo y pulsa «Buscar impresora».'
            : 'Vuelve aquí y pulsa «Buscar impresora» o elige la impresora del PC.'}
        </li>
      </ol>
      <a
        href={downloadUrl}
        download
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-900 text-white text-sm font-semibold hover:bg-amber-800 dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        <Download className="w-4 h-4" />
        Descargar Vertial Print
      </a>
    </div>
  );
}
