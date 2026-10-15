import { describe, expect, it } from 'vitest';
import {
  isCheckout,
  isPaymentStatus,
  isPublicCatalog,
  isRegistration,
  readFailure,
} from './readers';

const activity = {
  id: 'a1',
  name: 'Bboy 1vs1',
  kind: 'competition',
  startsAt: '2026-11-21T18:00:00.000Z',
  endsAt: '2026-11-21T20:00:00.000Z',
};

const catalog = {
  event: {
    slug: 'los-mas-pesados-nov-2026',
    name: 'Los más pesados',
    timeZone: 'America/Mexico_City',
    startsAt: '2026-11-20T14:00:00.000Z',
    endsAt: null,
  },
  sales: { state: 'open', reason: null, opensAt: null, closesAt: null },
  passes: [
    {
      id: 'p1',
      name: 'Open Styles',
      passClass: 'add_on',
      priceCents: 80000,
      requiresPassClass: 'full',
      selectableActivities: [],
      includedActivities: [activity],
    },
  ],
};

describe('isPublicCatalog', () => {
  it('accepts an open catalog and a closed one without passes', () => {
    expect(isPublicCatalog(catalog)).toBe(true);
    expect(
      isPublicCatalog({
        ...catalog,
        sales: {
          state: 'closed',
          reason: 'not_yet_open',
          opensAt: activity.startsAt,
          closesAt: null,
        },
        passes: [],
      }),
    ).toBe(true);
  });

  it('rejects a sales state that does not match its reason', () => {
    expect(isPublicCatalog({ ...catalog, sales: { ...catalog.sales, reason: 'ended' } })).toBe(
      false,
    );
    expect(isPublicCatalog({ ...catalog, sales: { ...catalog.sales, state: 'closed' } })).toBe(
      false,
    );
  });

  it('rejects malformed events, passes and activities', () => {
    const pass = catalog.passes[0];
    expect(isPublicCatalog({ ...catalog, event: { ...catalog.event, slug: '' } })).toBe(false);
    expect(isPublicCatalog({ ...catalog, event: { ...catalog.event, startsAt: 'pronto' } })).toBe(
      false,
    );
    expect(isPublicCatalog({ ...catalog, passes: [{ ...pass, passClass: 'vip' }] })).toBe(false);
    expect(isPublicCatalog({ ...catalog, passes: [{ ...pass, priceCents: -1 }] })).toBe(false);
    expect(isPublicCatalog({ ...catalog, passes: [{ ...pass, requiresPassClass: 'x' }] })).toBe(
      false,
    );
    expect(
      isPublicCatalog({
        ...catalog,
        passes: [{ ...pass, selectableActivities: [{ ...activity, endsAt: null }] }],
      }),
    ).toBe(false);
    expect(isPublicCatalog({ ...catalog, passes: null })).toBe(false);
    expect(isPublicCatalog(null)).toBe(false);
  });
});

describe('isRegistration', () => {
  const registration = {
    registrationId: 'r1',
    status: 'pending_payment',
    passes: [
      {
        passTypeId: 'p1',
        name: 'Breaking',
        passClass: 'full',
        priceCents: 200000,
        selectedActivityIds: ['a1'],
      },
    ],
    totalCents: 200000,
  };

  it('accepts a pending registration', () => {
    expect(isRegistration(registration)).toBe(true);
  });

  it('rejects another status or malformed passes', () => {
    expect(isRegistration({ ...registration, status: 'confirmed' })).toBe(false);
    expect(isRegistration({ ...registration, totalCents: '2000' })).toBe(false);
    expect(
      isRegistration({
        ...registration,
        passes: [{ ...registration.passes[0], selectedActivityIds: [1] }],
      }),
    ).toBe(false);
  });
});

describe('isCheckout', () => {
  it('accepts a checkout with a URL string', () => {
    expect(isCheckout({ checkoutUrl: 'https://example.test/checkout/1' })).toBe(true);
  });

  it('rejects a missing or blank URL', () => {
    expect(isCheckout({})).toBe(false);
    expect(isCheckout({ checkoutUrl: '' })).toBe(false);
    expect(isCheckout({ checkoutUrl: 3 })).toBe(false);
    expect(isCheckout(null)).toBe(false);
  });
});

describe('readFailure', () => {
  it('maps 404 and 429', () => {
    expect(readFailure(404, { message: 'Event not found' })).toEqual({ kind: 'not-found' });
    expect(readFailure(429, null)).toEqual({ kind: 'rate-limited' });
  });

  it('maps 400 field errors and keeps only string codes', () => {
    expect(
      readFailure(400, {
        fieldErrors: { 'buyer.email': 'invalid', 'passes[0].passTypeId': 'required', odd: 3 },
      }),
    ).toEqual({
      kind: 'invalid',
      fieldErrors: { 'buyer.email': 'invalid', 'passes[0].passTypeId': 'required' },
    });
    expect(readFailure(400, 'nope')).toEqual({ kind: 'invalid', fieldErrors: {} });
  });

  it('tells the 409 bodies apart', () => {
    expect(readFailure(409, { message: 'Sales are closed', reason: 'ended' })).toEqual({
      kind: 'sales-closed',
      reason: 'ended',
    });
    expect(readFailure(409, { code: 'general_with_full' })).toEqual({
      kind: 'rule',
      code: 'general_with_full',
    });
    expect(readFailure(409, { code: 'registration_unavailable' })).toEqual({
      kind: 'unavailable',
    });
    expect(readFailure(409, { code: 'registration_not_payable' })).toEqual({
      kind: 'not-payable',
    });
    expect(readFailure(409, { code: 'something_new' })).toEqual({ kind: 'error' });
  });

  it('maps a 502 from the payment provider only with its code', () => {
    expect(readFailure(502, { code: 'payment_provider_unavailable' })).toEqual({
      kind: 'provider-unavailable',
    });
    expect(readFailure(502, null)).toEqual({ kind: 'error' });
  });

  it('treats any other status as a generic error', () => {
    expect(readFailure(500, null)).toEqual({ kind: 'error' });
  });
});

const paymentStatus = {
  status: 'confirmed',
  firstName: 'Ana',
  maskedEmail: 'a***@gmail.com',
  folio: 'LMP-2345',
  passes: [
    { name: 'Pase completo Breaking', competitions: ['Popping 1v1', 'Breaking 1v1'] },
    { name: 'Open Styles', competitions: [] },
  ],
  totalCents: 220050,
};

describe('isPaymentStatus', () => {
  it('accepts a confirmed answer and a waiting one without folio or email', () => {
    expect(isPaymentStatus(paymentStatus)).toBe(true);
    for (const status of ['confirming', 'pending', 'rejected', 'unavailable'])
      expect(
        isPaymentStatus({ ...paymentStatus, status, folio: null, maskedEmail: null }),
        status,
      ).toBe(true);
  });

  it('rejects an unknown status value', () => {
    expect(isPaymentStatus({ ...paymentStatus, status: 'approved' })).toBe(false);
    expect(isPaymentStatus({ ...paymentStatus, status: undefined })).toBe(false);
  });

  it('rejects a confirmed answer without folio and a folio on any other status', () => {
    expect(isPaymentStatus({ ...paymentStatus, folio: null })).toBe(false);
    expect(isPaymentStatus({ ...paymentStatus, status: 'pending' })).toBe(false);
  });

  it('rejects malformed bodies', () => {
    for (const body of [
      null,
      [],
      'confirmed',
      { ...paymentStatus, firstName: 7 },
      { ...paymentStatus, maskedEmail: 3 },
      { ...paymentStatus, passes: null },
      { ...paymentStatus, passes: [{ name: '', competitions: [] }] },
      { ...paymentStatus, passes: [{ name: 'Open Styles', competitions: [1] }] },
      { ...paymentStatus, totalCents: -1 },
      { ...paymentStatus, totalCents: 10.5 },
    ])
      expect(isPaymentStatus(body), JSON.stringify(body)).toBe(false);
  });
});
