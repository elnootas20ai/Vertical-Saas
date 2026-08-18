import { createSpaceKey, presetById } from './spacePresets';
import type {
  OnboardingConfirmRoom,
  OnboardingDraft,
  OnboardingSpace,
  OnboardingStepId,
  SpacePresetId,
} from './types';
import { ONBOARDING_STEPS } from './types';

export type OnboardingAction =
  | { type: 'HYDRATE'; draft: OnboardingDraft }
  | { type: 'RESET' }
  | { type: 'GO_STEP'; step: OnboardingStepId }
  | { type: 'TOGGLE_PRESET'; presetId: SpacePresetId }
  | { type: 'SET_SPACE_NAME'; key: string; name: string }
  | {
      type: 'SET_TABLES_FOR_SPACE';
      key: string;
      patch: Partial<
        Pick<
          OnboardingSpace,
          | 'tableCount'
          | 'defaultCapacity'
          | 'allSameCapacity'
          | 'capacitiesPerTable'
          | 'shape'
        >
      >;
    }
  | { type: 'SET_TABLES_SPACE_INDEX'; index: number }
  | { type: 'TOGGLE_SAME_CAPACITY'; key: string; enabled: boolean }
  | { type: 'SET_TABLE_CAPACITY'; key: string; tableIndex: number; capacity: number }
  | { type: 'NEXT_FROM_SPACES' }
  | { type: 'NEXT_FROM_NAMES' }
  | { type: 'NEXT_FROM_TABLES' }
  | { type: 'BACK' };

function clampCapacity(value: number): number {
  return Math.max(1, Math.min(30, Math.round(Number(value) || 1)));
}

export function resizeCapacities(
  count: number,
  fill: number,
  previous: number[] = [],
): number[] {
  const n = Math.max(1, count);
  const base = clampCapacity(fill);
  return Array.from({ length: n }, (_, i) => clampCapacity(previous[i] ?? base));
}

export function spaceCapacityTotal(space: OnboardingSpace): number {
  const count = Math.max(0, Number(space.tableCount) || 0);
  if (space.allSameCapacity !== false) {
    return count * clampCapacity(space.defaultCapacity);
  }
  const caps = resizeCapacities(count, space.defaultCapacity, space.capacitiesPerTable || []);
  return caps.reduce((sum, c) => sum + c, 0);
}

export function averageCapacity(space: OnboardingSpace): number {
  const count = Math.max(1, Number(space.tableCount) || 1);
  if (space.allSameCapacity !== false) {
    return clampCapacity(space.defaultCapacity);
  }
  const caps = resizeCapacities(count, space.defaultCapacity, space.capacitiesPerTable || []);
  const avg = Math.round(caps.reduce((sum, c) => sum + c, 0) / caps.length);
  return clampCapacity(avg);
}

function normalizeSpace(space: OnboardingSpace): OnboardingSpace {
  const tableCount = Math.max(1, Number(space.tableCount) || 1);
  const defaultCapacity = clampCapacity(space.defaultCapacity);
  const allSame = space.allSameCapacity !== false;
  return {
    ...space,
    tableCount,
    defaultCapacity,
    allSameCapacity: allSame,
    capacitiesPerTable: resizeCapacities(
      tableCount,
      defaultCapacity,
      space.capacitiesPerTable || [],
    ),
  };
}

function makeSpace(presetId: SpacePresetId, order: number): OnboardingSpace {
  const preset = presetById(presetId);
  const name =
    presetId === 'custom'
      ? `${preset.defaultName} ${order + 1}`
      : preset.defaultName;
  const tableCount = presetId === 'barra' ? 6 : presetId === 'privado' ? 4 : 8;
  const defaultCapacity = presetId === 'barra' ? 1 : 4;
  return {
    key: createSpaceKey(),
    presetId,
    roomType: preset.roomType,
    name,
    tableCount,
    defaultCapacity,
    allSameCapacity: true,
    capacitiesPerTable: resizeCapacities(tableCount, defaultCapacity),
    shape: presetId === 'barra' ? 'high' : 'square',
  };
}

export function createInitialDraft(): OnboardingDraft {
  return {
    step: 'spaces',
    tablesSpaceIndex: 0,
    spaces: [makeSpace('salon', 0)],
    updatedAt: Date.now(),
  };
}

function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEPS.indexOf(step);
}

function hydrateDraft(draft: OnboardingDraft): OnboardingDraft {
  return {
    ...draft,
    spaces: (draft.spaces || []).map((s) => normalizeSpace(s)),
    updatedAt: Date.now(),
  };
}

export function onboardingReducer(
  state: OnboardingDraft,
  action: OnboardingAction,
): OnboardingDraft {
  switch (action.type) {
    case 'HYDRATE':
      return hydrateDraft(action.draft);

    case 'RESET':
      return createInitialDraft();

    case 'GO_STEP':
      return { ...state, step: action.step, updatedAt: Date.now() };

    case 'TOGGLE_PRESET': {
      const id = action.presetId;
      if (id === 'custom') {
        return {
          ...state,
          spaces: [...state.spaces, makeSpace('custom', state.spaces.length)],
          updatedAt: Date.now(),
        };
      }
      const existing = state.spaces.filter((s) => s.presetId === id);
      if (existing.length > 0) {
        const next = state.spaces.filter((s) => s.presetId !== id);
        return {
          ...state,
          spaces: next.length > 0 ? next : state.spaces,
          updatedAt: Date.now(),
        };
      }
      return {
        ...state,
        spaces: [...state.spaces, makeSpace(id, state.spaces.length)],
        updatedAt: Date.now(),
      };
    }

    case 'SET_SPACE_NAME':
      return {
        ...state,
        spaces: state.spaces.map((s) =>
          s.key === action.key ? { ...s, name: action.name } : s,
        ),
        updatedAt: Date.now(),
      };

    case 'SET_TABLES_FOR_SPACE':
      return {
        ...state,
        spaces: state.spaces.map((s) => {
          if (s.key !== action.key) return s;
          const next = normalizeSpace({ ...s, ...action.patch });
          if (action.patch.tableCount != null) {
            next.capacitiesPerTable = resizeCapacities(
              next.tableCount,
              next.defaultCapacity,
              s.capacitiesPerTable || [],
            );
          }
          if (action.patch.defaultCapacity != null && next.allSameCapacity) {
            next.capacitiesPerTable = resizeCapacities(
              next.tableCount,
              next.defaultCapacity,
            );
          }
          return next;
        }),
        updatedAt: Date.now(),
      };

    case 'TOGGLE_SAME_CAPACITY':
      return {
        ...state,
        spaces: state.spaces.map((s) => {
          if (s.key !== action.key) return s;
          if (action.enabled) {
            const avg = averageCapacity(s);
            return normalizeSpace({
              ...s,
              allSameCapacity: true,
              defaultCapacity: avg,
              capacitiesPerTable: resizeCapacities(s.tableCount, avg),
            });
          }
          const fill = clampCapacity(s.defaultCapacity);
          return normalizeSpace({
            ...s,
            allSameCapacity: false,
            capacitiesPerTable: resizeCapacities(
              s.tableCount,
              fill,
              s.capacitiesPerTable?.length
                ? s.capacitiesPerTable
                : resizeCapacities(s.tableCount, fill),
            ),
          });
        }),
        updatedAt: Date.now(),
      };

    case 'SET_TABLE_CAPACITY':
      return {
        ...state,
        spaces: state.spaces.map((s) => {
          if (s.key !== action.key) return s;
          const caps = resizeCapacities(
            s.tableCount,
            s.defaultCapacity,
            s.capacitiesPerTable || [],
          );
          caps[action.tableIndex] = clampCapacity(action.capacity);
          return { ...s, allSameCapacity: false, capacitiesPerTable: caps };
        }),
        updatedAt: Date.now(),
      };

    case 'SET_TABLES_SPACE_INDEX':
      return {
        ...state,
        tablesSpaceIndex: Math.max(
          0,
          Math.min(state.spaces.length - 1, action.index),
        ),
        updatedAt: Date.now(),
      };

    case 'NEXT_FROM_SPACES':
      if (state.spaces.length < 1) return state;
      return { ...state, step: 'names', updatedAt: Date.now() };

    case 'NEXT_FROM_NAMES':
      return {
        ...state,
        step: 'tables',
        tablesSpaceIndex: 0,
        updatedAt: Date.now(),
      };

    case 'NEXT_FROM_TABLES': {
      const nextIndex = state.tablesSpaceIndex + 1;
      if (nextIndex < state.spaces.length) {
        return {
          ...state,
          tablesSpaceIndex: nextIndex,
          updatedAt: Date.now(),
        };
      }
      return { ...state, step: 'summary', updatedAt: Date.now() };
    }

    case 'BACK': {
      const idx = stepIndex(state.step);
      if (idx <= 0) return state;
      if (state.step === 'tables' && state.tablesSpaceIndex > 0) {
        return {
          ...state,
          tablesSpaceIndex: state.tablesSpaceIndex - 1,
          updatedAt: Date.now(),
        };
      }
      const prev = ONBOARDING_STEPS[idx - 1];
      return {
        ...state,
        step: prev,
        tablesSpaceIndex:
          prev === 'tables' ? Math.max(0, state.spaces.length - 1) : state.tablesSpaceIndex,
        updatedAt: Date.now(),
      };
    }

    default:
      return state;
  }
}

export function toConfirmRooms(spaces: OnboardingSpace[]): OnboardingConfirmRoom[] {
  return spaces
    .map((s, i) => {
      const normalized = normalizeSpace(s);
      const base: OnboardingConfirmRoom = {
        name: String(normalized.name || `Sala ${i + 1}`).trim() || `Sala ${i + 1}`,
        roomType: normalized.roomType,
        tableCount: normalized.tableCount,
        defaultCapacity: normalized.defaultCapacity,
        shape: normalized.shape || 'square',
      };
      if (!normalized.allSameCapacity) {
        base.capacities = [...normalized.capacitiesPerTable];
      }
      return base;
    })
    .filter((s) => s.name);
}

export function draftTotals(spaces: OnboardingSpace[]) {
  const tableCount = spaces.reduce(
    (sum, s) => sum + Math.max(0, Number(s.tableCount) || 0),
    0,
  );
  const capacity = spaces.reduce((sum, s) => sum + spaceCapacityTotal(s), 0);
  return { tableCount, capacity };
}
