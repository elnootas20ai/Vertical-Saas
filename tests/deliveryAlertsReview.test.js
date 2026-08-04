import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isDeliveryAlertsReviewPending,
  isDeliveryReviewRule,
  sanitizeDeliveryAlertsReview,
} from '../services/deliveryAlertsReview.js';

describe('deliveryAlertsReview', () => {
  it('pending until completedAt is set', () => {
    assert.equal(isDeliveryAlertsReviewPending(null), true);
    assert.equal(isDeliveryAlertsReviewPending({}), true);
    assert.equal(isDeliveryAlertsReviewPending({ completedAt: null }), true);
    assert.equal(
      isDeliveryAlertsReviewPending({ completedAt: '2026-07-17T12:00:00.000Z' }),
      false,
    );
  });

  it('sanitizes review payload', () => {
    assert.deepEqual(sanitizeDeliveryAlertsReview(undefined), {
      completedAt: null,
      notifSentAt: null,
    });
    assert.equal(
      sanitizeDeliveryAlertsReview({ completedAt: '2026-01-01T00:00:00.000Z' }).completedAt,
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('classifies delivery review rules (pack compacto)', () => {
    assert.equal(isDeliveryReviewRule({ id: 'delivery_delayed_order' }), true);
    assert.equal(isDeliveryReviewRule({ id: 'worker_no_clockin' }), true);
    assert.equal(isDeliveryReviewRule({ id: 'document_missing_required' }), true);
    assert.equal(isDeliveryReviewRule({ id: 'sala_incident' }), false);
    assert.equal(isDeliveryReviewRule({ id: 'delivery_product_out_of_stock' }), false);
    assert.equal(isDeliveryReviewRule({ id: 'stale_delivery' }), false);
    assert.equal(isDeliveryReviewRule({ id: 'cleaning_route' }), false);
  });
});

