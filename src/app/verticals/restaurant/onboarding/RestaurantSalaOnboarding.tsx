/**
 * Wizard de alta sala/mesas (4 pasos) — vertical bar/restaurante.
 * Persistencia de borrador en localStorage; confirmación vía applyRestaurantSalaQuickSetup.
 */

import { useEffect, useReducer, useRef } from 'react';
import type { SalaQuickSetupRoomDraft } from '../../../lib/salaQuickSetup';
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft } from './draftStorage';
import {
  createInitialDraft,
  onboardingReducer,
  toConfirmRooms,
} from './state';
import { StepNames } from './steps/StepNames';
import { StepSpaces } from './steps/StepSpaces';
import { StepSummary } from './steps/StepSummary';
import { StepTables } from './steps/StepTables';
import { ONBOARDING_STEPS, type OnboardingStepId } from './types';
import { cardCls, shellCls } from './ui';

type Props = {
  businessId: string;
  storeLabel?: string;
  saving?: boolean;
  /** delivery | restaurant — solo cambia textos del asistente. */
  verticalTone?: 'restaurant' | 'delivery';
  /** Se llama al confirmar; convierte el draft en el payload de persistencia. */
  onSubmit: (rooms: SalaQuickSetupRoomDraft[]) => void;
};

const STEP_TITLES: Record<OnboardingStepId, string> = {
  spaces: 'Espacios',
  names: 'Nombres',
  tables: 'Puestos',
  summary: 'Resumen',
};

export function RestaurantSalaOnboarding({
  businessId,
  storeLabel,
  saving,
  verticalTone = 'restaurant',
  onSubmit,
}: Props) {
  const [state, dispatch] = useReducer(onboardingReducer, undefined, createInitialDraft);
  const hydrated = useRef(false);
  const isDelivery = verticalTone === 'delivery';

  useEffect(() => {
    if (!businessId || hydrated.current) return;
    hydrated.current = true;
    const saved = loadOnboardingDraft(businessId);
    if (saved && saved.spaces?.length) {
      dispatch({ type: 'HYDRATE', draft: saved });
    }
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !hydrated.current) return;
    saveOnboardingDraft(businessId, state);
  }, [businessId, state]);

  const stepIndex = Math.max(0, ONBOARDING_STEPS.indexOf(state.step));

  const handleConfirm = () => {
    const rooms = toConfirmRooms(state.spaces).map((r) => ({
      name: r.name,
      roomType: r.roomType,
      tableCount: r.tableCount,
      defaultCapacity: r.defaultCapacity,
      ...(r.capacities ? { capacities: r.capacities } : {}),
    }));
    if (rooms.length === 0) return;
    clearOnboardingDraft(businessId);
    onSubmit(rooms);
  };

  return (
    <div className={shellCls}>
      <div className={cardCls}>
        <header className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              {isDelivery ? 'Alta · Delivery' : 'Alta · Bar / restaurante'}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
              {isDelivery ? 'Montamos tu sala / mostrador' : 'Montamos tu local'}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {storeLabel
                ? `«${storeLabel}». Cuatro pasos: espacios, nombres, puestos y confirmación.`
                : 'Cuatro pasos: espacios, nombres, puestos (mesas o taburetes) y confirmación.'}
            </p>
          </div>

          <div>
            <div className="flex gap-2">
              {ONBOARDING_STEPS.map((step, i) => (
                <div
                  key={step}
                  className={`h-1.5 flex-1 rounded-full ${
                    i <= stepIndex ? 'bg-neutral-900' : 'bg-neutral-200'
                  }`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              Paso {stepIndex + 1} de {ONBOARDING_STEPS.length} ·{' '}
              {state.step === 'tables' && state.spaces[state.tablesSpaceIndex]?.roomType === 'barra'
                ? 'Barra / taburetes'
                : STEP_TITLES[state.step]}
              {state.step === 'tables' && state.spaces.length > 1
                ? ` · zona ${state.tablesSpaceIndex + 1}/${state.spaces.length} («${
                    state.spaces[state.tablesSpaceIndex]?.name || 'Sala'
                  }»)`
                : ''}
            </p>
          </div>
        </header>

        {state.step === 'spaces' && (
          <StepSpaces
            spaces={state.spaces}
            onToggle={(presetId) => dispatch({ type: 'TOGGLE_PRESET', presetId })}
            onNext={() => dispatch({ type: 'NEXT_FROM_SPACES' })}
          />
        )}

        {state.step === 'names' && (
          <StepNames
            spaces={state.spaces}
            onRename={(key, name) => dispatch({ type: 'SET_SPACE_NAME', key, name })}
            onBack={() => dispatch({ type: 'BACK' })}
            onNext={() => dispatch({ type: 'NEXT_FROM_NAMES' })}
          />
        )}

        {state.step === 'tables' && (
          <StepTables
            spaces={state.spaces}
            spaceIndex={state.tablesSpaceIndex}
            onChange={(key, patch) =>
              dispatch({ type: 'SET_TABLES_FOR_SPACE', key, patch })
            }
            onToggleSameCapacity={(key, enabled) =>
              dispatch({ type: 'TOGGLE_SAME_CAPACITY', key, enabled })
            }
            onSetTableCapacity={(key, tableIndex, capacity) =>
              dispatch({ type: 'SET_TABLE_CAPACITY', key, tableIndex, capacity })
            }
            onBack={() => dispatch({ type: 'BACK' })}
            onNext={() => dispatch({ type: 'NEXT_FROM_TABLES' })}
          />
        )}

        {state.step === 'summary' && (
          <StepSummary
            spaces={state.spaces}
            saving={saving}
            onBack={() => dispatch({ type: 'BACK' })}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}
