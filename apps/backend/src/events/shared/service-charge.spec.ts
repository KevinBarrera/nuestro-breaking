import { readServiceCharge, serviceChargeCents, type ServiceCharge } from './service-charge';

// Placeholder rates shaped like Mercado Pago's: 3.49% + $4.00 MXN, both before 16% VAT.
const RATES: ServiceCharge = { rateBasisPoints: 349, fixedCents: 400, vatBasisPoints: 1600 };

const ENV = {
  ONLINE_SERVICE_CHARGE_PERCENT: '3.49',
  ONLINE_SERVICE_CHARGE_FIXED_MXN: '4.00',
  ONLINE_SERVICE_CHARGE_VAT_PERCENT: '16',
};

describe('readServiceCharge', () => {
  it('reads the percentage, fixed amount and VAT as exact integers', () => {
    expect(readServiceCharge(ENV)).toEqual(RATES);
    expect(
      readServiceCharge({
        ONLINE_SERVICE_CHARGE_PERCENT: ' 0 ',
        ONLINE_SERVICE_CHARGE_FIXED_MXN: '0',
        ONLINE_SERVICE_CHARGE_VAT_PERCENT: '8.5',
      }),
    ).toEqual({ rateBasisPoints: 0, fixedCents: 0, vatBasisPoints: 850 });
  });

  it.each([
    'ONLINE_SERVICE_CHARGE_PERCENT',
    'ONLINE_SERVICE_CHARGE_FIXED_MXN',
    'ONLINE_SERVICE_CHARGE_VAT_PERCENT',
  ])('requires %s', (name) => {
    expect(() => readServiceCharge({ ...ENV, [name]: ' ' })).toThrow(`${name} is required.`);
  });

  it.each(['-1', '3.495', '50', 'abc', '3,49', '1e1'])('rejects the percentage %p', (value) => {
    expect(() => readServiceCharge({ ...ENV, ONLINE_SERVICE_CHARGE_PERCENT: value })).toThrow(
      'ONLINE_SERVICE_CHARGE_PERCENT must be a percentage from 0 to 49.99 with at most two decimals.',
    );
  });

  it.each(['-4', '4.001', '1000.01', '$4'])('rejects the fixed amount %p', (value) => {
    expect(() => readServiceCharge({ ...ENV, ONLINE_SERVICE_CHARGE_FIXED_MXN: value })).toThrow(
      'ONLINE_SERVICE_CHARGE_FIXED_MXN must be an amount in MXN from 0 to 1000 with at most two decimals.',
    );
  });

  it.each(['100.01', '16.001', '-16'])('rejects the VAT %p', (value) => {
    expect(() => readServiceCharge({ ...ENV, ONLINE_SERVICE_CHARGE_VAT_PERCENT: value })).toThrow(
      'ONLINE_SERVICE_CHARGE_VAT_PERCENT must be a percentage from 0 to 100 with at most two decimals.',
    );
  });
});

describe('serviceChargeCents', () => {
  it.each([
    // [price, charge]: total = (price + fixed × 1.16) / (1 − 3.49% × 1.16), rounded up to the cent.
    [100_000, 4_703], // 1,047.0278… → 1,047.03
    [280_000, 12_298], // 2,922.9736… → 2,922.98
    [1, 484], // 4.8461… → 4.85
  ])('grosses up a %p cent price to a %p cent charge', (price, charge) => {
    expect(serviceChargeCents(RATES, price)).toBe(charge);
  });

  it('charges only the fixed amount with VAT when the percentage is zero', () => {
    expect(serviceChargeCents({ ...RATES, rateBasisPoints: 0 }, 50_000)).toBe(464);
  });

  it('charges nothing when both rates are zero or nothing is paid', () => {
    expect(serviceChargeCents({ ...RATES, rateBasisPoints: 0, fixedCents: 0 }, 50_000)).toBe(0);
    expect(serviceChargeCents(RATES, 0)).toBe(0);
  });

  it('always leaves the organizer at least the full price after the fee', () => {
    // What the organizer keeps, scaled by 10^8 so the check is exact integer math.
    const scaledNet = (total: bigint) =>
      total * 100_000_000n - total * 349n * 11_600n - 400n * 11_600n * 10_000n;
    for (let price = 1; price <= 500_000; price += 997) {
      const total = BigInt(price + serviceChargeCents(RATES, price));
      const scaledPrice = BigInt(price) * 100_000_000n;
      expect(scaledNet(total) >= scaledPrice).toBe(true);
      // Rounded up to the nearest cent only: one cent less would leave the organizer short.
      expect(scaledNet(total - 1n) < scaledPrice).toBe(true);
    }
  });
});
