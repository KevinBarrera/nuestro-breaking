import { salesState, type SalesSettings } from './sales-state';

const opensAt = new Date('2026-10-15T15:00:00Z');
const closesAt = new Date('2026-11-20T06:00:00Z');
const settings = (overrides: Partial<SalesSettings> = {}): SalesSettings => ({
  salesEnabled: true,
  salesOpensAt: null,
  salesClosesAt: null,
  ...overrides,
});
const at = (iso: string) => new Date(iso);

describe('salesState', () => {
  it('is closed as disabled when the switch is off, whatever the dates say', () => {
    expect(salesState(settings({ salesEnabled: false }), at('2026-10-20T00:00:00Z'))).toEqual({
      state: 'closed',
      reason: 'disabled',
    });
    expect(
      salesState(
        settings({ salesEnabled: false, salesOpensAt: opensAt, salesClosesAt: closesAt }),
        at('2026-10-20T00:00:00Z'),
      ),
    ).toEqual({ state: 'closed', reason: 'disabled' });
  });

  it('is open when the switch is on and no dates are set', () => {
    expect(salesState(settings(), at('2030-01-01T00:00:00Z'))).toEqual({
      state: 'open',
      reason: null,
    });
  });

  it('is closed as not yet open before the opening date', () => {
    expect(salesState(settings({ salesOpensAt: opensAt }), at('2026-10-15T14:59:59.999Z'))).toEqual(
      { state: 'closed', reason: 'not_yet_open' },
    );
  });

  it('opens exactly at the opening date', () => {
    expect(salesState(settings({ salesOpensAt: opensAt }), opensAt)).toEqual({
      state: 'open',
      reason: null,
    });
  });

  it('is open inside the window', () => {
    expect(
      salesState(
        settings({ salesOpensAt: opensAt, salesClosesAt: closesAt }),
        at('2026-11-01T12:00:00Z'),
      ),
    ).toEqual({ state: 'open', reason: null });
  });

  it('is closed as ended exactly at the closing date and after it', () => {
    expect(salesState(settings({ salesClosesAt: closesAt }), closesAt)).toEqual({
      state: 'closed',
      reason: 'ended',
    });
    expect(
      salesState(
        settings({ salesOpensAt: opensAt, salesClosesAt: closesAt }),
        at('2026-12-01T00:00:00Z'),
      ),
    ).toEqual({ state: 'closed', reason: 'ended' });
  });

  it('is open just before the closing date', () => {
    expect(
      salesState(settings({ salesClosesAt: closesAt }), at('2026-11-20T05:59:59.999Z')),
    ).toEqual({ state: 'open', reason: null });
  });
});
