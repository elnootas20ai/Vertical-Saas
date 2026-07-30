import { describe, expect, it } from 'vitest';
import { formatMoneyAsYouType, parseSpanishMoneyInput } from '../src/app/lib/workCenterMoneyInput.ts';
import { parseAggregatorAmount } from '../src/app/lib/deliveryIntegrationsUi.ts';

describe('formatMoneyAsYouType decimals', () => {
  it('acepta coma es-ES', () => {
    expect(formatMoneyAsYouType('15,5', true)).toBe('15,5');
    expect(formatMoneyAsYouType('15,50', true)).toBe('15,50');
    expect(formatMoneyAsYouType('1.400,5', true)).toBe('1.400,5');
  });

  it('convierte punto iPad/EN a coma decimal', () => {
    expect(formatMoneyAsYouType('15.5', true)).toBe('15,5');
    expect(formatMoneyAsYouType('15.50', true)).toBe('15,50');
    expect(formatMoneyAsYouType('15.', true)).toBe('15,');
    expect(formatMoneyAsYouType('0.90', true)).toBe('0,90');
  });

  it('no trata 1.400 (3 dígitos) como decimal', () => {
    expect(formatMoneyAsYouType('1.400', true)).toBe('1.400');
  });
});

describe('parseAggregatorAmount', () => {
  it('lee coma y punto decimal', () => {
    expect(parseAggregatorAmount('15,50')).toBe(15.5);
    expect(parseAggregatorAmount('15.50')).toBe(15.5);
    expect(parseAggregatorAmount('1.400,50')).toBe(1400.5);
  });
});

describe('parseSpanishMoneyInput', () => {
  it('lee coma decimal', () => {
    expect(parseSpanishMoneyInput('90,5')).toBe(90.5);
  });
});
