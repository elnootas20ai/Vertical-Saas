import { describe, expect, it } from 'vitest';
import {
  createInitialDraft,
  draftTotals,
  onboardingReducer,
  spaceCapacityTotal,
  toConfirmRooms,
} from '../src/app/verticals/restaurant/onboarding/state';

describe('restaurant sala onboarding reducer', () => {
  it('starts with salón and advances spaces → names → tables → summary', () => {
    let state = createInitialDraft();
    expect(state.step).toBe('spaces');
    expect(state.spaces.length).toBe(1);

    state = onboardingReducer(state, { type: 'TOGGLE_PRESET', presetId: 'terraza' });
    expect(state.spaces.map((s) => s.presetId).sort()).toEqual(['salon', 'terraza']);

    state = onboardingReducer(state, { type: 'NEXT_FROM_SPACES' });
    expect(state.step).toBe('names');

    state = onboardingReducer(state, {
      type: 'SET_SPACE_NAME',
      key: state.spaces[0].key,
      name: 'Salón',
    });
    state = onboardingReducer(state, { type: 'NEXT_FROM_NAMES' });
    expect(state.step).toBe('tables');
    expect(state.tablesSpaceIndex).toBe(0);

    state = onboardingReducer(state, { type: 'NEXT_FROM_TABLES' });
    expect(state.step).toBe('tables');
    expect(state.tablesSpaceIndex).toBe(1);

    state = onboardingReducer(state, { type: 'NEXT_FROM_TABLES' });
    expect(state.step).toBe('summary');

    const rooms = toConfirmRooms(state.spaces);
    expect(rooms.length).toBe(2);
    expect(draftTotals(state.spaces).tableCount).toBeGreaterThan(0);
  });

  it('BACK from second table returns to first table, then to names', () => {
    let state = createInitialDraft();
    state = onboardingReducer(state, { type: 'TOGGLE_PRESET', presetId: 'barra' });
    state = onboardingReducer(state, { type: 'NEXT_FROM_SPACES' });
    state = onboardingReducer(state, { type: 'NEXT_FROM_NAMES' });
    state = onboardingReducer(state, { type: 'NEXT_FROM_TABLES' });
    expect(state.tablesSpaceIndex).toBe(1);

    state = onboardingReducer(state, { type: 'BACK' });
    expect(state.step).toBe('tables');
    expect(state.tablesSpaceIndex).toBe(0);

    state = onboardingReducer(state, { type: 'BACK' });
    expect(state.step).toBe('names');
  });

  it('toggle same capacity preloads per-table and averages when re-enabled', () => {
    let state = createInitialDraft();
    const key = state.spaces[0].key;
    state = onboardingReducer(state, {
      type: 'SET_TABLES_FOR_SPACE',
      key,
      patch: { tableCount: 3, defaultCapacity: 4 },
    });
    state = onboardingReducer(state, { type: 'TOGGLE_SAME_CAPACITY', key, enabled: false });
    expect(state.spaces[0].allSameCapacity).toBe(false);
    expect(state.spaces[0].capacitiesPerTable).toEqual([4, 4, 4]);
    expect(spaceCapacityTotal(state.spaces[0])).toBe(12);

    state = onboardingReducer(state, { type: 'SET_TABLE_CAPACITY', key, tableIndex: 0, capacity: 2 });
    state = onboardingReducer(state, { type: 'SET_TABLE_CAPACITY', key, tableIndex: 1, capacity: 6 });
    expect(spaceCapacityTotal(state.spaces[0])).toBe(2 + 6 + 4);

    state = onboardingReducer(state, { type: 'TOGGLE_SAME_CAPACITY', key, enabled: true });
    expect(state.spaces[0].allSameCapacity).toBe(true);
    expect(state.spaces[0].defaultCapacity).toBe(Math.round((2 + 6 + 4) / 3));
  });
});
