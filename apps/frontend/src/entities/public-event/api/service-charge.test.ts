import { describe, expect, it } from 'vitest';
import { serviceChargeCents } from './service-charge';

// Same placeholder rates and cases as the backend calculator (`service-charge.spec.ts`), so the
// review screen shows exactly the charge the checkout sends to Mercado Pago.
const RATES = { rateBasisPoints: 349, fixedCents: 400, vatBasisPoints: 1600 };

describe('serviceChargeCents', () => {
  it.each([
    [100_000, 4_703],
    [280_000, 12_298],
    [1, 484],
  ])('grosses up a %i cent price to a %i cent charge', (price, charge) => {
    expect(serviceChargeCents(RATES, price)).toBe(charge);
  });

  it('charges only the fixed amount with VAT when the percentage is zero', () => {
    expect(serviceChargeCents({ ...RATES, rateBasisPoints: 0 }, 50_000)).toBe(464);
  });

  it('charges nothing when both rates are zero or nothing is paid', () => {
    expect(serviceChargeCents({ ...RATES, rateBasisPoints: 0, fixedCents: 0 }, 50_000)).toBe(0);
    expect(serviceChargeCents(RATES, 0)).toBe(0);
  });
});
