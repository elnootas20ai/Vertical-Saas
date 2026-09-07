import { Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { AggregatorIntegrationKey } from '../../../lib/deliveryIntegrationsUi';

export type IntegrationStatusTone = 'active' | 'warning' | 'inactive' | 'info';

export interface IntegrationPlatformSummary {
  key: AggregatorIntegrationKey;
  label: string;
  badgeClass: string;
  status: string;
  statusTone: IntegrationStatusTone;
  storeLabel: string;
  enabled: boolean;
  busy?: boolean;
  disabled?: boolean;
  toggleTitle: string;
}

interface IntegrationPlatformSummaryBarProps {
  platforms: IntegrationPlatformSummary[];
  activePlatform: AggregatorIntegrationKey | null;
  onSelect: (platform: AggregatorIntegrationKey) => void;
  onToggle: (platform: AggregatorIntegrationKey) => void;
}

const STATUS_TONES: Record<IntegrationStatusTone, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  inactive: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
};

export function IntegrationPlatformSummaryBar({
  platforms,
  activePlatform,
  onSelect,
  onToggle,
}: IntegrationPlatformSummaryBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Integradores"
      className="flex w-full gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible"
      style={{ scrollbarWidth: 'none' }}
    >
      {platforms.map((platform) => {
        const selected = activePlatform === platform.key;
        return (
          <div
            key={platform.key}
            className={`min-w-[9.25rem] rounded-xl border bg-white p-2.5 transition-colors dark:bg-stone-950 sm:min-w-0 ${
              selected
                ? 'border-blue-300 ring-2 ring-blue-500/15 dark:border-blue-700'
                : 'border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700'
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(platform.key)}
              className="block w-full min-w-0 text-left"
            >
              <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold ${platform.badgeClass}`}>
                {platform.label}
              </span>
              <span className={`mt-2 block w-fit rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_TONES[platform.statusTone]}`}>
                {platform.status}
              </span>
              <span className="mt-1.5 block truncate text-[10px] text-stone-500" title={platform.storeLabel}>
                {platform.storeLabel}
              </span>
            </button>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
              <button
                type="button"
                onClick={() => onSelect(platform.key)}
                className="text-[10px] font-semibold text-[var(--v-blue,#2563eb)]"
              >
              {selected ? 'Configurando' : 'Configurar'}
              </button>
              <button
                type="button"
                onClick={() => onToggle(platform.key)}
                disabled={platform.disabled || platform.busy}
                title={platform.toggleTitle}
                aria-label={platform.toggleTitle}
                className="text-stone-500 transition-colors hover:text-stone-700 disabled:opacity-40 dark:hover:text-stone-300"
              >
                {platform.busy
                  ? <Loader2 className="h-6 w-6 animate-spin text-[var(--v-blue,#2563eb)]" />
                  : platform.enabled
                    ? <ToggleRight className="h-6 w-6 text-emerald-500" />
                    : <ToggleLeft className="h-6 w-6" />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
