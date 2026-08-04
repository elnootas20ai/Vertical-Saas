import test from 'node:test';
import assert from 'node:assert/strict';
import { isPositiveAlertDoc, isActivityNotificationDoc } from '../services/alertEmitter.js';

test('alerta positiva (fue bien) se reconoce', () => {
  assert.equal(isPositiveAlertDoc({ polarity: 'positive' }), true);
  assert.equal(isPositiveAlertDoc({ kind: 'positive' }), true);
  assert.equal(isPositiveAlertDoc({ kind: 'activity' }), true);
  assert.equal(isPositiveAlertDoc({ excludeFromAlertCenter: true }), true);
  assert.equal(isPositiveAlertDoc({ metadata: { polarity: 'positive' } }), true);
  assert.equal(isActivityNotificationDoc({ kind: 'activity' }), true);
});

test('alerta negativa no se marca como positiva', () => {
  assert.equal(
    isPositiveAlertDoc({
      category: 'delivery_register_closed_discrepancy',
      polarity: 'negative',
      priority: 'critical',
      title: 'Caja cerrada con descuadre',
    }),
    false,
  );
  assert.equal(isPositiveAlertDoc(null), false);
});
