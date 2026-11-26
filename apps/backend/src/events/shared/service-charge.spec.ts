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
    // [price, charge]: Mercado Pago rounds the rate with VAT up to 4.05% and the fixed fee with
    // VAT to $4.64, then total = (price + 4.64) / (1 − 4.05%), rounded up to the cent (#406).
    [50_000, 2_595], // 525.9406… → 525.95
    [200_000, 8_926], // 2,089.2548… → 2,089.26
    [100_000, 4_705], // 1,047.0453… → 1,047.05
    [280_000, 12_303], // 2,923.0224… → 2,923.03
    [1, 484], // 4.8462… → 4.85
  ])('grosses up a %p cent price to a %p cent charge', (price, charge) => {
    expect(serviceChargeCents(RATES, price)).toBe(charge);
  });

  it('rounds the rate with VAT up to a hundredth of a percent and the fixed fee up to the cent', () => {
    // 3.5% × 1.16 = 4.06% exactly, so nothing rounds: total = (1,000 + 4.64) / 0.9594.
    expect(serviceChargeCents({ ...RATES, rateBasisPoints: 350 }, 100_000)).toBe(4_716);
    // $4.01 × 1.16 = $4.6516 → $4.66: total = (1,000 + 4.66) / 0.9594 = 1,047.1753… → 1,047.18.
    expect(serviceChargeCents({ ...RATES, rateBasisPoints: 350, fixedCents: 401 }, 100_000)).toBe(
      4_718,
    );
  });

  it('charges only the fixed amount with VAT when the percentage is zero', () => {
    expect(serviceChargeCents({ ...RATES, rateBasisPoints: 0 }, 50_000)).toBe(464);
  });

  it('charges nothing when both rates are zero or nothing is paid', () => {
    expect(serviceChargeCents({ ...RATES, rateBasisPoints: 0, fixedCents: 0 }, 50_000)).toBe(0);
    expect(serviceChargeCents(RATES, 0)).toBe(0);
  });

  // Mercado Pago's fee as observed on staging (#406): round(total × 4.05% + $4.64) to the cent.
  const mercadoPagoFeeCents = (total: number) =>
    Number((BigInt(total) * 405n * 2n + 464n * 20_000n + 10_000n) / 20_000n);

  it.each([
    // [total charged, Mercado Pago fee] from the three staging payments in #406.
    [52_594, 2_594],
    [208_922, 8_925],
    [280_000, 11_804],
  ])('models the observed Mercado Pago fee on a %p cent payment as %p cents', (total, fee) => {
    expect(mercadoPagoFeeCents(total)).toBe(fee);
  });

  it('leaves the organizer the price or one cent more after the Mercado Pago fee', () => {
    for (let price = 1; price <= 1_000_000; price += 97) {
      const total = price + serviceChargeCents(RATES, price);
      const received = total - mercadoPagoFeeCents(total);
      expect([price, price + 1]).toContain(received);
    }
  });
});
