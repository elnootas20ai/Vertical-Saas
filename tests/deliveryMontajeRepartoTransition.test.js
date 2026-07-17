import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeliveryOrderDocument } from '../services/couchdb.js';

describe('buildDeliveryOrderDocument — stageHistory', () => {
  it('no duplica la fila de historial si el cliente ya la envió', () => {
    const existing = buildDeliveryOrderDocument('user-1', {
      status: 'listo',
      customerName: 'Ana',
      customerPhone: '600000000',
      items: [{ name: 'Pizza', quantity: 1, unitPrice: 10, total: 10 }],
    });
    const now = new Date().toISOString();
    const updated = buildDeliveryOrderDocument(
      'user-1',
      {
        ...existing,
        status: 'en_reparto',
        stageHistory: [
          ...(existing.stageHistory || []),
          { status: 'en_reparto', date: now, user: 'Tablet', notes: 'A reparto' },
        ],
      },
      existing,
    );
    const enRepartoRows = (updated.stageHistory || []).filter(
      (row) => row.status === 'en_reparto',
    );
    assert.equal(enRepartoRows.length, 1);
  });

  it('sigue añadiendo historial si el cliente no lo envió', () => {
    const existing = buildDeliveryOrderDocument('user-1', {
      status: 'listo',
      customerName: 'Ana',
      customerPhone: '600000000',
      items: [{ name: 'Pizza', quantity: 1, unitPrice: 10, total: 10 }],
    });
    const updated = buildDeliveryOrderDocument(
      'user-1',
      {
        ...existing,
        status: 'en_reparto',
        stageHistory: existing.stageHistory || [],
      },
      existing,
    );
    const enRepartoRows = (updated.stageHistory || []).filter(
      (row) => row.status === 'en_reparto',
    );
    assert.equal(enRepartoRows.length, 1);
  });

  it('montaje→reparto puede cerrar montaje sin pasar a en_reparto', () => {
    const existing = buildDeliveryOrderDocument('user-1', {
      status: 'listo',
      customerName: 'Ana',
      customerPhone: '600000000',
      items: [{ name: 'Pizza', quantity: 1, unitPrice: 10, total: 10 }],
    });
    const now = new Date().toISOString();
    const updated = buildDeliveryOrderDocument(
      'user-1',
      {
        ...existing,
        status: 'listo',
        assemblyCompletedAt: now,
        stageHistory: [
          ...(existing.stageHistory || []),
          { status: 'listo', date: now, user: 'Montaje', notes: 'Montaje completado → listo para reparto' },
        ],
      },
      existing,
    );
    assert.equal(updated.status, 'listo');
    assert.equal(updated.assemblyCompletedAt, now);
    assert.ok(!updated.departedAt);
  });
});
