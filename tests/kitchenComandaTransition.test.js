import { describe, expect, it } from 'vitest';
import { isValidKitchenComandaTransition } from '../services/salaService.js';

describe('isValidKitchenComandaTransition', () => {
  it('permite solo un paso adelante', () => {
    expect(isValidKitchenComandaTransition('sent_to_kitchen', 'in_preparation')).toBe(true);
    expect(isValidKitchenComandaTransition('in_preparation', 'ready')).toBe(true);
    expect(isValidKitchenComandaTransition('ready', 'served')).toBe(true);
  });

  it('bloquea saltos (p. ej. Empezar → Listo por doble toque)', () => {
    expect(isValidKitchenComandaTransition('sent_to_kitchen', 'ready')).toBe(false);
    expect(isValidKitchenComandaTransition('sent_to_kitchen', 'served')).toBe(false);
    expect(isValidKitchenComandaTransition('in_preparation', 'served')).toBe(false);
  });

  it('permite idempotencia del mismo status', () => {
    expect(isValidKitchenComandaTransition('in_preparation', 'in_preparation')).toBe(true);
  });
});
