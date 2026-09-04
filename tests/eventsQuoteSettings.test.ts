import { describe, expect, it } from 'vitest';
import {
  buildQuoteRulesText,
  normalizeEventsQuoteSettings,
  shouldAutoSendReviewOnFinish,
  suggestedDepositFromTotal,
  templateLinesToQuoteLines,
} from '../src/app/lib/eventsQuoteSettings';

describe('eventsQuoteSettings', () => {
  it('no inventa reglas: defaults vacíos', () => {
    const s = normalizeEventsQuoteSettings({});
    expect(s.depositPercent).toBe(0);
    expect(s.balancePercent).toBe(0);
    expect(s.validityDays).toBe(0);
    expect(s.annotations).toBe('');
    expect(s.applyLinesOnNew).toBe(false);
    expect(s.designMode).toBe('vertial');
    expect(s.documentCompanyName).toBe('');
  });

  it('guarda nombre de cabecera del documento', () => {
    const s = normalizeEventsQuoteSettings({ documentCompanyName: '  MODOMIOFEST  ' });
    expect(s.documentCompanyName).toBe('MODOMIOFEST');
  });

  it('normaliza líneas y porcentajes', () => {
    const s = normalizeEventsQuoteSettings({
      defaultLines: [
        { concepto: '  Catering  ', cantidad: 0, precioUnitario: -5 },
        { concepto: '', cantidad: 2, precioUnitario: 10 },
      ],
      depositPercent: 150,
      balancePercent: 40,
      validityDays: 999,
      applyLinesOnNew: true,
    });
    expect(s.defaultLines).toEqual([{ concepto: 'Catering', cantidad: 1, precioUnitario: 0 }]);
    expect(s.depositPercent).toBe(100);
    expect(s.balancePercent).toBe(40);
    expect(s.validityDays).toBe(365);
    expect(s.applyLinesOnNew).toBe(true);
  });

  it('migra defaultNotes → annotations', () => {
    const s = normalizeEventsQuoteSettings({ defaultNotes: 'Pago 48h antes' } as never);
    expect(s.annotations).toBe('Pago 48h antes');
  });

  it('arma texto de reglas solo con lo configurado', () => {
    expect(buildQuoteRulesText(normalizeEventsQuoteSettings({}))).toBe('');
    expect(
      buildQuoteRulesText(normalizeEventsQuoteSettings({
        annotations: 'Sin IVA incluido',
        depositPercent: 30,
        balancePercent: 70,
        validityDays: 10,
      })),
    ).toContain('Sin IVA incluido');
    expect(
      buildQuoteRulesText(normalizeEventsQuoteSettings({
        depositPercent: 30,
        balancePercent: 70,
      })),
    ).toMatch(/30%.*70%/);
  });

  it('convierte plantilla a líneas de presupuesto', () => {
    const lines = templateLinesToQuoteLines(
      [{ concepto: 'DJ', cantidad: 1, precioUnitario: 400 }],
      () => 'id-1',
    );
    expect(lines).toEqual([
      { id: 'id-1', concepto: 'DJ', cantidad: 1, precioUnitario: 400, total: 400 },
    ]);
  });

  it('calcula depósito sugerido', () => {
    expect(suggestedDepositFromTotal(1000, 30)).toBe(300);
    expect(suggestedDepositFromTotal(0, 30)).toBe(0);
  });

  it('reseña auto: solo con URL + flag + email y sin envío previo', () => {
    const off = normalizeEventsQuoteSettings({
      reviewAutoSendOnFinish: true,
      reviewUrl: '',
    });
    expect(off.reviewAutoSendOnFinish).toBe(false);

    const on = normalizeEventsQuoteSettings({
      reviewAutoSendOnFinish: true,
      reviewUrl: 'https://g.page/r/demo',
      reviewMessage: 'Gracias',
    });
    expect(on.reviewAutoSendOnFinish).toBe(true);
    expect(shouldAutoSendReviewOnFinish(on, { clientEmail: 'a@b.com' })).toBe(true);
    expect(shouldAutoSendReviewOnFinish(on, { clientEmail: '' })).toBe(false);
    expect(shouldAutoSendReviewOnFinish(on, {
      clientEmail: 'a@b.com',
      reviewInviteSentAt: '2026-01-01',
    })).toBe(false);
  });
});
