import { Wifi, ShieldCheck, Settings, X } from 'lucide-react';
import { settingsPrimaryBtnClass } from './settings/settingsFormStyles';

export function LocalNetworkPermissionModal({
  open,
  onContinue,
  onOpenSettings,
  onClose,
  busy = false,
  blocking = false,
}: {
  open: boolean;
  onContinue: () => void;
  onOpenSettings: () => void;
  onClose?: () => void;
  busy?: boolean;
  /** Si true, no se puede cerrar sin Continuar o Ajustes (popup obligatorio). */
  blocking?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        role="dialog"
        aria-labelledby="lan-permission-title"
      >
        <div className="px-5 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700 flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
            <Wifi className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="lan-permission-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Buscar impresoras en la WiFi
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              Vertial necesita acceder a la red local de tu local para encontrar impresoras térmicas.
            </p>
          </div>
          {onClose && !blocking && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          <ol className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed list-decimal list-inside space-y-2">
            <li>Pulsa <strong>Continuar</strong> abajo.</li>
            <li>Si sale el aviso del iPad/iPhone, pulsa <strong>Permitir</strong>.</li>
            <li>Vertial buscará impresoras en la WiFi automáticamente.</li>
          </ol>

          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3">
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              Si no te sale el aviso, abre Ajustes del dispositivo → Vertial → activa <strong>Red local</strong>.
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-2">
          <button type="button" onClick={onContinue} disabled={busy} className={settingsPrimaryBtnClass}>
            <ShieldCheck className="w-4 h-4" />
            {busy ? 'Activando permiso…' : 'Continuar y buscar impresoras'}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <Settings className="w-4 h-4" />
            Abrir Ajustes de Vertial
          </button>
        </div>
      </div>
    </div>
  );
}
