import { AlertCenterSettingsPanel } from './AlertCenterSettingsPanel';
import { DevicePushStatusCard } from './settings/DevicePushStatusCard';

interface Props {
  businessId: string;
  onSaved?: () => void;
}

/**
 * Ajustes de alertas — pack gerente + estado push del dispositivo.
 */
export function AlertCenterAjustesView({ businessId, onSaved }: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-950">
        <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Qué te avisamos</p>
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
          Solo lo importante: caja, equipo y operación. En el móvil: push si activaste avisos.
        </p>
      </div>
      <DevicePushStatusCard />
      <AlertCenterSettingsPanel
        businessId={businessId}
        featured
        onSaved={onSaved}
      />
    </div>
  );
}
