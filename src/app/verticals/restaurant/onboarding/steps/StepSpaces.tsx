import { Check } from 'lucide-react';
import { SPACE_PRESETS } from '../spacePresets';
import type { OnboardingSpace, SpacePresetId } from '../types';
import { primaryBtn } from '../ui';

type Props = {
  spaces: OnboardingSpace[];
  onToggle: (presetId: SpacePresetId) => void;
  onNext: () => void;
};

export function StepSpaces({ spaces, onToggle, onNext }: Props) {
  const selectedPresets = new Set(spaces.map((s) => s.presetId));
  const customCount = spaces.filter((s) => s.presetId === 'custom').length;

  return (
    <div className="mt-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          ¿Qué espacios tiene tu local?
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Elige uno o varios. Puedes añadir varios «Otro» si necesitas más.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SPACE_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const selected =
            preset.id === 'custom' ? customCount > 0 : selectedPresets.has(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onToggle(preset.id)}
              className={`relative flex items-start gap-3 rounded-[12px] border p-4 text-left transition-colors ${
                selected
                  ? 'border-neutral-900 bg-neutral-50'
                  : 'border-neutral-200 bg-white hover:border-neutral-300'
              }`}
            >
              <div className="rounded-[12px] border border-neutral-200 p-2 text-neutral-700">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900">
                  {preset.label}
                  {preset.id === 'custom' && customCount > 1 ? ` (${customCount})` : ''}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{preset.description}</p>
              </div>
              {selected && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-white">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={spaces.length < 1}
          className={primaryBtn}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
