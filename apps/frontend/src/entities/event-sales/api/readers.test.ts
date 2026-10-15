import { describe, expect, it } from 'vitest';
import { isEventSales } from './readers';

const open = {
  slug: 'los-mas-pesados-nov-2026',
  salesEnabled: true,
  salesOpensAt: '2026-10-15T15:00:00.000Z',
  salesClosesAt: null,
  state: 'open',
  reason: null,
};

describe('isEventSales', () => {
  it('accepts an open and a closed response', () => {
    expect(isEventSales(open)).toBe(true);
    expect(
      isEventSales({
        ...open,
        salesEnabled: false,
        salesOpensAt: null,
        state: 'closed',
        reason: 'disabled',
      }),
    ).toBe(true);
  });

  it('rejects a state that does not match its reason', () => {
    expect(isEventSales({ ...open, reason: 'ended' })).toBe(false);
    expect(isEventSales({ ...open, state: 'closed' })).toBe(false);
    expect(isEventSales({ ...open, state: 'closed', reason: 'later' })).toBe(false);
  });

  it('rejects missing fields and unreadable dates', () => {
    expect(isEventSales({ ...open, slug: '' })).toBe(false);
    expect(isEventSales({ ...open, salesEnabled: 'yes' })).toBe(false);
    expect(isEventSales({ ...open, salesClosesAt: 'pronto' })).toBe(false);
    expect(isEventSales(null)).toBe(false);
  });
});
