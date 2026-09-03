import { describe, expect, it } from 'vitest';
import {
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
});

describe('parseRecipeQtyDraft', () => {
  it('parsea 0,15 y 0,50 bien', () => {
    expect(parseRecipeQtyDraft('0,15')).toBe(0.15);
    expect(parseRecipeQtyDraft('0,50')).toBe(0.5);
    expect(parseRecipeQtyDraft('0.50')).toBe(0.5);
    expect(parseRecipeQtyDraft('05')).toBe(0.5);
    expect(parseRecipeQtyDraft('050')).toBe(0.5);
  });

  it('commitIncomplete con coma suelta', () => {
    expect(parseRecipeQtyDraft('0,', { commitIncomplete: true })).toBe(0);
    expect(parseRecipeQtyDraft('0,')).toBe(null);
  });
});

describe('formatRecipeQtyDisplay', () => {
  it('muestra decimales en es-ES', () => {
    expect(formatRecipeQtyDisplay(0.15)).toBe('0,15');
    expect(formatRecipeQtyDisplay(0.5)).toBe('0,5');
    expect(formatRecipeQtyDisplay(0.05)).toBe('0,05');
    expect(formatRecipeQtyDisplay(100)).toBe('100');
  });
});
