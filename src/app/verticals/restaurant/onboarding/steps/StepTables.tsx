import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../../lib/vertialUiTokens';
import { ClearableNumberInput } from '../../ClearableNumberInput';
import { spaceCapacityTotal } from '../state';
import { spaceUnitCopy } from '../spaceCopy';
import type { OnboardingSpace } from '../types';
import { inputCls, labelCls } from '../ui';

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
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-blue,#2563eb)] ${
        checked ? 'bg-[var(--v-blue,#2563eb)]' : 'bg-neutral-300'
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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!space) return;
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [space?.key, spaceIndex]);

  if (!space) return null;

  const copy = spaceUnitCopy(space);
  const displayName = space.name || 'Espacio';
  const allSame = space.allSameCapacity !== false;
  const aforo = spaceCapacityTotal(space);
  const isLast = spaceIndex + 1 >= spaces.length;
  const perTable =
    space.capacitiesPerTable?.length === space.tableCount
      ? space.capacitiesPerTable
      : Array.from({ length: space.tableCount }, () => space.defaultCapacity);

  return (
    <div ref={panelRef} className="mt-8 space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {spaces.map((row, i) => {
            const done = i < spaceIndex;
            const current = i === spaceIndex;
            return (
              <span
                key={row.key}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  current
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : done
                      ? 'bg-blue-50 text-[var(--v-blue,#2563eb)]'
                      : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {done ? <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} /> : null}
                <span className="truncate">{row.name || `Sala ${i + 1}`}</span>
              </span>
            );
          })}
        </div>

        <div
          key={space.key}
          style={{ animation: 'salaRoomAdvance 220ms ease-out' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--v-blue,#2563eb)]">
            Espacio {spaceIndex + 1} de {spaces.length}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-neutral-900">
            {copy.titlePrefix} «{displayName}»
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {copy.introHint} Luego{' '}
            {isLast ? 'verás el resumen' : `pasarás a «${spaces[spaceIndex + 1]?.name || 'el siguiente'}»`}.
          </p>
        </div>
      </div>

      <div
        key={`form-${space.key}`}
        className="space-y-4 rounded-[12px] border border-neutral-200 p-5"
        style={{ animation: 'salaRoomAdvance 220ms ease-out' }}
      >
        <div>
          <label className={labelCls}>{copy.countLabel}</label>
          <ClearableNumberInput
            min={1}
            max={99}
            value={space.tableCount}
            aria-label={copy.countLabel}
            onCommit={(n) => onChange(space.key, { tableCount: n })}
            className={`${inputCls} max-w-[10rem]`}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-neutral-100 px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">
              Todos iguales (misma capacidad)
            </p>
            <p className="text-xs text-neutral-500">
              {allSame ? copy.sameCapacityHint : copy.differentCapacityHint}
            </p>
          </div>
          <CapacityToggle
            checked={allSame}
            ariaLabel="Todas iguales (misma capacidad)"
            onChange={(enabled) => onToggleSameCapacity(space.key, enabled)}
          />
        </div>

        <div
          key={allSame ? 'same' : 'per-table'}
          style={{ animation: 'salaCapFade 180ms ease-out' }}
        >
          {allSame ? (
            <div>
              <label className={labelCls}>{copy.capacityLabel}</label>
              <ClearableNumberInput
                min={1}
                max={30}
                value={space.defaultCapacity}
                aria-label={copy.capacityLabel}
                onCommit={(n) => onChange(space.key, { defaultCapacity: n })}
                className={`${inputCls} max-w-[10rem]`}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className={labelCls}>{copy.capacityLabel}</p>
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {perTable.map((cap, index) => (
                  <div
                    key={`${space.key}-unit-${index}`}
                    className="flex items-center gap-2 rounded-[12px] border border-neutral-100 px-3 py-2"
                  >
                    <label className="w-20 shrink-0 text-xs font-medium text-neutral-500">
                      {copy.unitIndexLabel(index)}
                    </label>
                    <ClearableNumberInput
                      min={1}
                      max={30}
                      value={cap}
                      aria-label={copy.unitIndexLabel(index)}
                      onCommit={(n) => onSetTableCapacity(space.key, index, n)}
                      className={`${inputCls} py-1.5`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-neutral-500">
          {copy.aforoLabel(displayName, aforo)}
        </p>
      </div>

      <style>{`
        @keyframes salaCapFade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes salaRoomAdvance {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} className={VERTIAL_BTN_SECONDARY}>
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Atrás
        </button>
        <button type="button" onClick={onNext} className={VERTIAL_BTN_PRIMARY}>
          {isLast ? 'Ver resumen' : `Siguiente: ${spaces[spaceIndex + 1]?.name || 'espacio'}`}
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
