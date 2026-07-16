import { ArrowLeft } from 'lucide-react';
import { presetById } from '../spacePresets';
import type { OnboardingSpace } from '../types';
import { inputCls, labelCls, primaryBtn, secondaryBtn } from '../ui';

type Props = {
  spaces: OnboardingSpace[];
  onRename: (key: string, name: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function StepNames({ spaces, onRename, onBack, onNext }: Props) {
  return (
    <div className="mt-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Nombra cada espacio
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Así aparecerán en el plano, reservas e informes.
        </p>
      </div>

      <div className="space-y-3">
        {spaces.map((space, index) => {
          const preset = presetById(space.presetId);
          return (
            <div
              key={space.key}
              className="rounded-[12px] border border-neutral-200 p-4"
            >
              <label className={labelCls}>
                Espacio {index + 1} · {preset.label}
              </label>
              <input
                value={space.name}
                onChange={(e) => onRename(space.key, e.target.value)}
                placeholder={preset.defaultName}
                className={inputCls}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} className={secondaryBtn}>
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Atrás
        </button>
        <button type="button" onClick={onNext} className={primaryBtn}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
