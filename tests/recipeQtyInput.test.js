import { describe, expect, it } from 'vitest';
import {
  commitRecipeQtyDraft,
  formatRecipeQtyDisplay,
  parseRecipeQtyDraft,
  sanitizeRecipeQtyTyping,
} from '../src/app/lib/recipeQtyInput.ts';

describe('sanitizeRecipeQtyTyping', () => {
  it('acepta coma y punto como decimal', () => {
    expect(sanitizeRecipeQtyTyping('0,15')).toBe('0,15');
    expect(sanitizeRecipeQtyTyping('0.15')).toBe('0,15');
    expect(sanitizeRecipeQtyTyping('0,50')).toBe('0,50');
    expect(sanitizeRecipeQtyTyping('0.50')).toBe('0,50');
  });

  it('recupera coma perdida (0,05 → 05 / 050)', () => {
    expect(sanitizeRecipeQtyTyping('05')).toBe('0,5');
    expect(sanitizeRecipeQtyTyping('050')).toBe('0,50');
    expect(sanitizeRecipeQtyTyping('015')).toBe('0,15');
  });

  it('permite escribir 0, y enteros normales', () => {
    expect(sanitizeRecipeQtyTyping('0,')).toBe('0,');
    expect(sanitizeRecipeQtyTyping('0')).toBe('0');
    expect(sanitizeRecipeQtyTyping('50')).toBe('50');
    expect(sanitizeRecipeQtyTyping('100')).toBe('100');
  });

  it('conserva ceros finales y hasta 4 decimales', () => {
    expect(sanitizeRecipeQtyTyping('1,1200')).toBe('1,1200');
    expect(sanitizeRecipeQtyTyping('1,2000')).toBe('1,2000');
    expect(sanitizeRecipeQtyTyping('1,0005')).toBe('1,0005');
    expect(sanitizeRecipeQtyTyping('1,00055')).toBe('1,0005');
  });
});

describe('parseRecipeQtyDraft', () => {
  it('parsea 0,15 y 0,50 bien', () => {
    expect(parseRecipeQtyDraft('0,15')).toBe(0.15);
    expect(parseRecipeQtyDraft('0,50')).toBe(0.5);
    expect(parseRecipeQtyDraft('0.50')).toBe(0.5);
    expect(parseRecipeQtyDraft('05')).toBe(0.5);
    expect(parseRecipeQtyDraft('050')).toBe(0.5);
  });

  it('parsea 4 decimales (1,0005)', () => {
    expect(parseRecipeQtyDraft('1,0005')).toBe(1.0005);
    expect(parseRecipeQtyDraft('1,1200')).toBe(1.12);
  });

  it('commitIncomplete con coma suelta', () => {
    expect(parseRecipeQtyDraft('0,', { commitIncomplete: true })).toBe(0);
    expect(parseRecipeQtyDraft('0,')).toBe(null);
  });
});

describe('commitRecipeQtyDraft', () => {
  it('no borra ceros finales tipados al confirmar', () => {
    expect(commitRecipeQtyDraft('1,1200', 0)).toBe('1,1200');
    expect(commitRecipeQtyDraft('1,2000', 0)).toBe('1,2000');
    expect(commitRecipeQtyDraft('1,0005', 0)).toBe('1,0005');
    expect(commitRecipeQtyDraft('0,50', 0)).toBe('0,50');
    expect(commitRecipeQtyDraft('2,50', 0)).toBe('2,50');
  });
});

describe('resolveRecipeQtyDisplay', () => {
  it('reabre con el 0 final tipado (2,50)', async () => {
    const { resolveRecipeQtyDisplay } = await import('../src/app/lib/recipeQtyInput.ts');
    expect(resolveRecipeQtyDisplay(2.5, '2,50')).toBe('2,50');
    expect(resolveRecipeQtyDisplay(0.5, '0,50')).toBe('0,50');
    expect(resolveRecipeQtyDisplay(1.2, '1,2000')).toBe('1,2000');
  });

  it('si el texto no cuadra con el número, reformatea', async () => {
    const { resolveRecipeQtyDisplay } = await import('../src/app/lib/recipeQtyInput.ts');
    expect(resolveRecipeQtyDisplay(3, '2,50')).toBe('3');
    expect(resolveRecipeQtyDisplay(2.5)).toBe('2,5');
  });
});

describe('formatRecipeQtyDisplay', () => {
  it('muestra decimales en es-ES', () => {
    expect(formatRecipeQtyDisplay(0.15)).toBe('0,15');
    expect(formatRecipeQtyDisplay(0.5)).toBe('0,5');
    expect(formatRecipeQtyDisplay(0.05)).toBe('0,05');
    expect(formatRecipeQtyDisplay(100)).toBe('100');
    expect(formatRecipeQtyDisplay(1.0005)).toBe('1,0005');
  });
});
