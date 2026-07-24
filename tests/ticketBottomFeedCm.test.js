import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TICKET_BOTTOM_FEED_CM,
  MAX_TICKET_BOTTOM_FEED_CM,
  MIN_TICKET_BOTTOM_FEED_CM,
  clampTicketBottomFeedCm,
} from '../src/app/lib/vertialPrint/printerConfig.ts';
import { normalizeVertialPrinterConfig } from '../src/app/lib/vertialPrint/printerConfigNormalize.ts';
import { tailFeedCmForVariant } from '../src/app/lib/vertialPrint/escposEncode.ts';

describe('ticketBottomFeedCm', () => {
  it('clamp usa default y respeta rango 4–18', () => {
    expect(clampTicketBottomFeedCm(undefined)).toBe(DEFAULT_TICKET_BOTTOM_FEED_CM);
    expect(clampTicketBottomFeedCm(null)).toBe(DEFAULT_TICKET_BOTTOM_FEED_CM);
    expect(clampTicketBottomFeedCm(NaN)).toBe(DEFAULT_TICKET_BOTTOM_FEED_CM);
    expect(clampTicketBottomFeedCm(2)).toBe(MIN_TICKET_BOTTOM_FEED_CM);
    expect(clampTicketBottomFeedCm(99)).toBe(MAX_TICKET_BOTTOM_FEED_CM);
    expect(clampTicketBottomFeedCm(8)).toBe(8);
  });

  it('normalize rellena ticketBottomFeedCm sin romper configs viejas', () => {
    const n = normalizeVertialPrinterConfig({
      connectionType: 'network',
      networkHost: '192.168.1.20',
      networkPort: 9100,
    });
    expect(n.ticketBottomFeedCm).toBe(DEFAULT_TICKET_BOTTOM_FEED_CM);
    expect(n.networkHost).toBe('192.168.1.20');
  });

  it('cocina ignora override; cliente/delivery lo usan', () => {
    expect(tailFeedCmForVariant('kitchen', 15)).toBe(6);
    expect(tailFeedCmForVariant('customer', 8)).toBe(8);
    expect(tailFeedCmForVariant('delivery', 12)).toBe(12);
    expect(tailFeedCmForVariant('customer')).toBe(8);
  });
});
