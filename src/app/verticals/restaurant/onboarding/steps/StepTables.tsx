import { ArrowLeft } from 'lucide-react';
import { spaceCapacityTotal } from '../state';
import type { OnboardingSpace } from '../types';
import { inputCls, labelCls, primaryBtn, secondaryBtn } from '../ui';

type Props = {
  spaces: OnboardingSpace[];
  spaceIndex: number;
  onChange: (
    key: string,
    patch: Partial<Pick<OnboardingSpace, 'tableCount' | 'defaultCapacity' | 'allSameCapacity'>>,
  ) => void;
  onToggleSameCapacity: (key: string, enabled: boolean) => void;
  onSetTableCapacity: (key: string, tableIndex: number, capacity: number) => void;
  onBack: () => void;
  onNext: () => void;
};

function CapacityToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Todas iguales (misma capacidad)"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${
        checked ? 'bg-neutral-900' : 'bg-neutral-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function StepTables({
  spaces,
  spaceIndex,
  onChange,
  onToggleSameCapacity,
  onSetTableCapacity,
  onBack,
  onNext,
}: Props) {
  const space = spaces[spaceIndex];
  if (!space) return null;

  const allSame = space.allSameCapacity !== false;
  const aforo = spaceCapacityTotal(space);
  const perTable =
    space.capacitiesPerTable?.length === space.tableCount
      ? space.capacitiesPerTable
      : Array.from({ length: space.tableCount }, () => space.defaultCapacity);

  return (
    <div className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Sala {spaceIndex + 1} de {spaces.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-neutral-900">
          Mesas de «{space.name || 'Espacio'}»
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Indica cuántas mesas y comensales. Puedes igualar todas de un golpe.
        </p>
      </div>

      <div className="space-y-4 rounded-[12px] border border-neutral-200 p-5">
        <div>
          <label className={labelCls}>Número de mesas</label>
          <input
            type="number"
            min={1}
            max={99}
            value={space.tableCount}
            onChange={(e) =>
              onChange(space.key, { tableCount: Math.max(1, Number(e.target.value) || 1) })
            }
            className={`${inputCls} max-w-[10rem]`}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-neutral-100 px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">
              Todas iguales (misma capacidad)
            </p>
            <p className="text-xs text-neutral-500">
              {allSame
                ? 'Un valor para todas las mesas'
                : 'Capacidad distinta por mesa'}
            </p>
          </div>
          <CapacityToggle
            checked={allSame}
            onChange={(enabled) => onToggleSameCapacity(space.key, enabled)}
          />
        </div>

        <div
          key={allSame ? 'same' : 'per-table'}
          style={{ animation: 'salaCapFade 180ms ease-out' }}
        >
          {allSame ? (
            <div>
              <label className={labelCls}>Capacidad por mesa</label>
              <input
                type="number"
                min={1}
                max={30}
                value={space.defaultCapacity}
                onChange={(e) =>
                  onChange(space.key, {
                    defaultCapacity: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className={`${inputCls} max-w-[10rem]`}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className={labelCls}>Capacidad por mesa</p>
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {perTable.map((cap, index) => (
                  <div
                    key={`${space.key}-mesa-${index}`}
                    className="flex items-center gap-2 rounded-[12px] border border-neutral-100 px-3 py-2"
                  >
                    <label className="w-16 shrink-0 text-xs font-medium text-neutral-500">
                      Mesa {index + 1}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={cap}
                      onChange={(e) =>
                        onSetTableCapacity(
                          space.key,
                          index,
                          Math.max(1, Number(e.target.value) || 1),
                        )
                      }
                      className={`${inputCls} py-1.5`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-neutral-500">
          Aforo de esta sala ≈ {aforo} personas
        </p>
      </div>

      <style>{`
        @keyframes salaCapFade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} className={secondaryBtn}>
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Atrás
        </button>
        <button type="button" onClick={onNext} className={primaryBtn}>
          {spaceIndex + 1 < spaces.length ? 'Siguiente sala' : 'Ver resumen'}
        </button>
      </div>
    </div>
  );
}
