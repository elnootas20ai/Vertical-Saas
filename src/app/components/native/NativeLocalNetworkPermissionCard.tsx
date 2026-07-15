import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Settings, ShieldCheck, Wifi } from 'lucide-react';
import { settingsListCardClass, settingsPrimaryBtnClass } from '../saas/settings/settingsFormStyles';
import {
  dispatchNativeLocalNetworkPermissionPrompt,
  openNativeAppSettings,
  rerequestNativeLocalNetworkPermission,
} from '../../lib/vertialPrint/localNetworkPermission';

export function NativeLocalNetworkPermissionCard() {
  const [busy, setBusy] = useState(false);

  const handleRetryPermission = async () => {
    setBusy(true);
    try {
      await rerequestNativeLocalNetworkPermission();
      toast.success('Si sale el aviso de iOS, pulsa Permitir. Si no, usa IP manual o Ajustes → Vertial → Red local.', { duration: 9000 });
    } catch {
      dispatchNativeLocalNetworkPermissionPrompt();
      toast.message('Tardó demasiado. Pon la IP manual o activa Red local en Ajustes → Vertial.', { duration: 9000 });
    } finally {
      setBusy(false);
    }
  };

  const handleOpenSettings = async () => {
    setBusy(true);
    try {
      const opened = await openNativeAppSettings();
      if (!opened) {
        toast.message('Ajustes → Privacidad → Red local → Vertial → activar.', { duration: 10000 });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${settingsListCardClass()} space-y-3 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
          <Wifi className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Permiso de red local (iPhone/iPad)</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            Sin este permiso iOS no deja buscar impresoras WiFi. Si no te salió el aviso, pulsa abajo para volver a pedirlo.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => { void handleRetryPermission(); }}
          className={`${settingsPrimaryBtnClass} w-full`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {busy ? 'Pidiendo permiso…' : 'Volver a pedir permiso'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => { void handleOpenSettings(); }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
          Abrir Ajustes de Vertial
        </button>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        Si iOS no muestra el aviso: Ajustes → Privacidad → Red local → Vertial → activar.
      </p>
    </div>
  );
}
