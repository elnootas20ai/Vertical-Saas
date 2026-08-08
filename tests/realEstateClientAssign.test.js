import { describe, it, expect } from 'vitest';
import { clientBelongsToAgent } from '../src/app/lib/realEstateTeamAgents.ts';

describe('clientBelongsToAgent', () => {
  it('matches by responsibleUserId', () => {
    expect(clientBelongsToAgent({ responsibleUserId: 'u1', responsible: 'Ana' }, 'u1')).toBe(true);
    expect(clientBelongsToAgent({ responsibleUserId: 'u1' }, 'u2')).toBe(false);
  });

  it('falls back to responsible name when no userId', () => {
    expect(clientBelongsToAgent({ responsible: 'Ana López' }, 'u1', 'Ana López')).toBe(true);
    expect(clientBelongsToAgent({ responsible: 'Sin asignar' }, 'u1', 'Ana López')).toBe(false);
  });
});
