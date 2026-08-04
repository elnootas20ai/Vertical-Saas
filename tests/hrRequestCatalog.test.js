import { describe, expect, it } from 'vitest';
import {
  WORK_BLOCKING_LEAVE_TYPES,
  getHrRequestType,
  listHrRequestTypesForWorker,
} from '../src/app/lib/hrRequestCatalog.ts';

describe('hrRequestCatalog', () => {
  it('incluye tipos MVP y bloquea trabajo en salud / vacaciones', () => {
    const ids = listHrRequestTypesForWorker().map((t) => t.id);
    expect(ids).toContain('vacation');
    expect(ids).toContain('personal');
    expect(ids).toContain('accident');
    expect(ids).toContain('sick');
    expect(ids).not.toContain('maternity');
    expect(WORK_BLOCKING_LEAVE_TYPES).toContain('accident');
    expect(WORK_BLOCKING_LEAVE_TYPES).not.toContain('personal');
  });

  it('asuntos propios no consumen saldo y permiten mismo día', () => {
    const personal = getHrRequestType('personal');
    expect(personal.consumesVacationBalance).toBe(false);
    expect(personal.allowSameDay).toBe(true);
    expect(personal.notesRequired).toBe(true);
  });

  it('accidente es urgente y bloquea trabajo', () => {
    const accident = getHrRequestType('accident');
    expect(accident.defaultUrgent).toBe(true);
    expect(accident.blocksWorkWhenApproved).toBe(true);
  });
});
