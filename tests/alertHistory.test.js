import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAlertHistory,
  mutateAlertStatus,
  mutateAlertDeletion,
  deriveAlertTimeline,
  alertHistorySortKey,
} from '../services/alertHistory.js';

test('mutateAlertStatus appends history and sets resolved fields', () => {
  const doc = {
    status: 'new',
    read: false,
    statusHistory: [{ action: 'created', status: 'new', at: '2026-01-01T10:00:00.000Z', by: 'u1' }],
  };

  const updated = mutateAlertStatus(doc, {
    status: 'resolved',
    userId: 'ceo1',
    now: '2026-01-01T11:00:00.000Z',
  });

  assert.equal(updated.status, 'resolved');
  assert.equal(updated.resolvedBy, 'ceo1');
  assert.equal(updated.resolvedAt, '2026-01-01T11:00:00.000Z');
  assert.equal(updated.statusHistory.length, 2);
  assert.equal(updated.statusHistory[1].action, 'status_change');
  assert.equal(updated.statusHistory[1].to, 'resolved');
});

test('deriveAlertTimeline rebuilds legacy docs', () => {
  const events = deriveAlertTimeline({
    status: 'resolved',
    createdAt: '2026-01-01T10:00:00.000Z',
    resolvedAt: '2026-01-01T12:00:00.000Z',
    resolvedBy: 'ceo1',
  });

  assert.ok(events.some((e) => e.action === 'created'));
  assert.ok(events.some((e) => e.to === 'resolved'));
});

test('alertHistorySortKey prefers resolvedAt', () => {
  assert.equal(
    alertHistorySortKey({ resolvedAt: '2026-02-01', updatedAt: '2026-01-01' }),
    '2026-02-01',
  );
});

test('mutateAlertDeletion records deleted event', () => {
  const updated = mutateAlertDeletion({ statusHistory: [] }, { userId: 'ceo1', now: '2026-01-02T09:00:00.000Z' });
  assert.ok(updated.deletedAt);
  assert.equal(updated.statusHistory.at(-1).action, 'deleted');
});
