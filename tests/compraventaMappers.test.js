import test from 'node:test';
import assert from 'node:assert/strict';

const TRADE_IN_TO_TASACION_STATUS = {
  pending: 'pendiente',
  negotiation: 'negociacion',
  accepted: 'aceptada',
  rejected: 'rechazada',
};

const ACQUISITION_TO_COMPRA_STATUS = {
  borrador: 'pendiente',
  pendiente_aprobacion: 'pendiente',
  aprobada: 'confirmada',
  en_transito: 'confirmada',
  recibida: 'completada',
  documentada: 'completada',
  cerrada: 'completada',
  rechazada: 'cancelada',
  cancelada: 'cancelada',
};

test('trade-in status maps to tasacion UI status', () => {
  assert.equal(TRADE_IN_TO_TASACION_STATUS.pending, 'pendiente');
  assert.equal(TRADE_IN_TO_TASACION_STATUS.negotiation, 'negociacion');
  assert.equal(TRADE_IN_TO_TASACION_STATUS.accepted, 'aceptada');
});

test('acquisition status maps to compra UI status', () => {
  assert.equal(ACQUISITION_TO_COMPRA_STATUS.aprobada, 'confirmada');
  assert.equal(ACQUISITION_TO_COMPRA_STATUS.recibida, 'completada');
  assert.equal(ACQUISITION_TO_COMPRA_STATUS.cancelada, 'cancelada');
});
