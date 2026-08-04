// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  datesOverlap,
  findOverlappingLeaveRequests,
  findTeamLeaveOverlaps,
  buildLeaveCoverageSnapshot,
  mergeLeaveTypePolicies,
  resolveLeaveTypePolicy,
  ES_DEFAULT_MAX_DAYS,
} from '../src/app/lib/hrLeavePolicy.ts';
import {
  normalizeVacationSettings,
  validateVacationRequestPolicy,
  validateVacationBalanceForRequest,
} from '../src/app/lib/vacationsApi.ts';

describe('hrLeavePolicy', () => {
  it('matrimonio tiene 15 días por defecto (ET)', () => {
    expect(ES_DEFAULT_MAX_DAYS.marriage).toBe(15);
    expect(resolveLeaveTypePolicy('marriage').maxDays).toBe(15);
  });

  it('empresa puede bajar el cupo de matrimonio', () => {
    const resolved = resolveLeaveTypePolicy('marriage', { marriage: { maxDays: 10 } });
    expect(resolved.maxDays).toBe(10);
  });

  it('detecta solape matrimonio + vacaciones', () => {
    const overlaps = findOverlappingLeaveRequests(
      [
        {
          _id: 'a',
          member_id: 'u1',
          status: 'approved',
          leaveType: 'vacation',
          startDate: '2026-08-10',
          endDate: '2026-08-20',
        },
      ],
      'u1',
      '2026-08-15',
      '2026-08-17',
    );
    expect(overlaps).toHaveLength(1);
    expect(datesOverlap('2026-08-15', '2026-08-17', '2026-08-10', '2026-08-20')).toBe(true);
  });

  it('cobertura: quién falta y quién queda en el equipo', () => {
    const requests = [
      {
        _id: 'v1',
        member_id: 'u2',
        member_name: 'Ana',
        status: 'approved',
        leaveType: 'vacation',
        startDate: '2026-09-10',
        endDate: '2026-09-15',
      },
      {
        _id: 'v2',
        member_id: 'u3',
        member_name: 'Luis',
        status: 'pending',
        leaveType: 'personal',
        startDate: '2026-09-12',
        endDate: '2026-09-12',
      },
    ];
    const members = [
      { user_id: 'u1', fullName: 'Mati', role: 'Reparto' },
      { user_id: 'u2', fullName: 'Ana', role: 'Reparto' },
      { user_id: 'u3', fullName: 'Luis', role: 'Cocina' },
      { user_id: 'u4', fullName: 'Paco', role: 'Reparto' },
    ];
    const team = findTeamLeaveOverlaps(requests, 'u1', '2026-09-11', '2026-09-14');
    expect(team).toHaveLength(2);
    const snap = buildLeaveCoverageSnapshot(
      '2026-09-11',
      '2026-09-14',
      'u1',
      requests,
      members,
    );
    expect(snap.away.map((a) => a.memberName).sort()).toEqual(['Ana', 'Luis']);
    expect(snap.sameRoleAway).toHaveLength(1);
    expect(snap.sameRoleAway[0].memberName).toBe('Ana');
    expect(snap.available.map((a) => a.memberName)).toEqual(['Paco']);
    expect(snap.sameRoleAvailable.map((a) => a.memberName)).toEqual(['Paco']);
  });

  it('política normalizada: solo saldo generado por defecto', () => {
    const s = normalizeVacationSettings({
      _id: 'x',
      type: 'vacation_settings',
      business_id: 'b1',
      defaultDaysPerYear: 30,
      allowances: {},
      createdAt: '',
      updatedAt: '',
    });
    expect(s.allowRequestUnaccrued).toBe(false);
    expect(s.daysPerMonth).toBe(2.5);
    expect(mergeLeaveTypePolicies(s.leaveTypePolicies).marriage.maxDays).toBe(15);
  });

  it('valida tope matrimonio', () => {
    const settings = normalizeVacationSettings({
      _id: 'x',
      type: 'vacation_settings',
      business_id: 'b1',
      defaultDaysPerYear: 30,
      allowances: {},
      minNoticeDays: 0,
      createdAt: '',
      updatedAt: '',
    });
    const ok = validateVacationRequestPolicy('2026-09-01', '2026-09-10', settings, 'marriage');
    expect(ok.ok).toBe(true);
    const bad = validateVacationRequestPolicy('2026-09-01', '2026-09-20', settings, 'marriage');
    expect(bad.ok).toBe(false);
  });

  it('saldo estricto bloquea pedir más de lo generado', () => {
    const settings = normalizeVacationSettings({
      _id: 'x',
      type: 'vacation_settings',
      business_id: 'b1',
      defaultDaysPerYear: 30,
      allowances: { u1: 2 },
      accrualMode: 'annual_fixed',
      allowRequestUnaccrued: false,
      minTenureMonthsForVacation: 0,
      minNoticeDays: 0,
      maxConsecutiveDays: 0,
      createdAt: '',
      updatedAt: '',
    });
    const check = validateVacationBalanceForRequest(
      settings,
      [],
      'u1',
      '2026-10-01',
      '2026-10-05',
      'vacation',
      { year: 2026, startDate: '2025-01-01' },
    );
    expect(check.ok).toBe(false);
  });

  it('pendientes y canceladas no descuentan saldo; solo aprobadas', () => {
    const settings = normalizeVacationSettings({
      _id: 'x',
      type: 'vacation_settings',
      business_id: 'b1',
      defaultDaysPerYear: 30,
      allowances: { u1: 10 },
      accrualMode: 'annual_fixed',
      allowRequestUnaccrued: false,
      minTenureMonthsForVacation: 0,
      minNoticeDays: 0,
      maxConsecutiveDays: 0,
      createdAt: '',
      updatedAt: '',
    });
    const requests = [
      {
        _id: 'p1',
        member_id: 'u1',
        status: 'pending',
        leaveType: 'vacation',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        totalDays: 5,
      },
      {
        _id: 'c1',
        member_id: 'u1',
        status: 'cancelled',
        leaveType: 'vacation',
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        totalDays: 10,
      },
    ];
    // 5 días pendientes + 10 cancelados no deben impedir pedir 5 días (cupo 10).
    const check = validateVacationBalanceForRequest(
      settings,
      requests,
      'u1',
      '2026-08-01',
      '2026-08-05',
      'vacation',
      { year: 2026, startDate: '2025-01-01' },
    );
    expect(check.ok).toBe(true);

    // Cancelada no cuenta como solape activo
    expect(
      findOverlappingLeaveRequests(requests, 'u1', '2026-07-02', '2026-07-03'),
    ).toHaveLength(0);
  });
});
