import { describe, expect, it } from 'vitest';
import {
  listTeamAgentOptions,
  resolveTeamAgent,
  visitBelongsToAgent,
} from '../src/app/lib/realEstateTeamAgents.ts';

describe('realEstateTeamAgents', () => {
  const members = [
    { user_id: 'u1', fullName: 'Ana Pérez', role: 'Comercial' },
    { user_id: 'u2', fullName: 'Luis Gómez', role: 'Admin' },
  ];

  it('lista agentes del Equipo', () => {
    const agents = listTeamAgentOptions(members);
    expect(agents).toHaveLength(2);
    expect(agents[0].name).toBe('Ana Pérez');
  });

  it('resuelve por nombre en import', () => {
    const agents = listTeamAgentOptions(members);
    expect(resolveTeamAgent(agents, { name: 'luis gómez' })?.userId).toBe('u2');
  });

  it('visita pertenece al agente por userId', () => {
    expect(visitBelongsToAgent({ agenteUserId: 'u1', agente: 'Ana' }, 'u1')).toBe(true);
    expect(visitBelongsToAgent({ agenteUserId: 'u1' }, 'u2')).toBe(false);
  });
});
