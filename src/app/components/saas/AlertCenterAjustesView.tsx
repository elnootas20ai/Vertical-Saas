import { useState } from 'react';
import { Bell, SlidersHorizontal, Zap } from 'lucide-react';
import { AlertCenterSettingsPanel } from './AlertCenterSettingsPanel';
import { AlertsTab } from './settings/AlertsTab';

interface Props {
  businessId: string;
  onSaved?: () => void;
}

type AjustesSection = 'reglas' | 'avanzado';

export function AlertCenterAjustesView({ businessId, onSaved }: Props) {
  const [section, setSection] = useState<AjustesSection>('reglas');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSection('reglas')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            section === 'reglas'
              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          <Zap className="h-4 w-4" />
          Qué avisarme
        </button>
        <button
          type="button"
          onClick={() => setSection('avanzado')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            section === 'avanzado'
              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Canales y detalle
        </button>
        {section === 'avanzado' && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Push, email, urgencia y destinatarios
          </span>
        )}
      </div>

      {section === 'reglas' ? (
        <AlertCenterSettingsPanel
          businessId={businessId}
          featured
          onSaved={onSaved}
          onOpenAdvanced={() => setSection('avanzado')}
        />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Bell className="h-4 w-4" />
            Configuración detallada de cada regla
          </div>
          <AlertsTab businessId={businessId} />
        </div>
      )}
    </div>
  );
}
