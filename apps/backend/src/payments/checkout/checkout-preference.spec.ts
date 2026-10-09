import { buildPreferenceRequest, centsToPesos } from './checkout-preference';

describe('centsToPesos', () => {
  it.each([
    [150050, 1500.5],
    [200000, 2000],
    [1999, 19.99],
    [1, 0.01],
  ])('converts %p cents to %p pesos', (cents, pesos) => {
    expect(centsToPesos(cents)).toBe(pesos);
  });
});

describe('buildPreferenceRequest', () => {
  const input = {
    registrationId: '11111111-1111-4111-8111-111111111111',
    slug: 'los-mas-pesados-nov-2026',
    passes: [
      { name: 'Pase completo Breaking', priceCents: 150050 },
      { name: 'Open Styles', priceCents: 80000 },
    ],
    publicAppUrl: 'https://example.test',
    notificationUrl: 'https://api.example.test/webhook',
  };

  it('sends one MXN item per pass, the registration as reference and the return page', () => {
    const returnUrl =
      'https://example.test/e/los-mas-pesados-nov-2026/pago?registration=11111111-1111-4111-8111-111111111111';

    expect(buildPreferenceRequest(input)).toEqual({
      items: [
        { title: 'Pase completo Breaking', quantity: 1, unit_price: 1500.5, currency_id: 'MXN' },
        { title: 'Open Styles', quantity: 1, unit_price: 800, currency_id: 'MXN' },
      ],
      external_reference: input.registrationId,
      back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
      auto_return: 'approved',
      notification_url: 'https://api.example.test/webhook',
    });
  });

  it('leaves free passes out of the items, so every item has a positive price', () => {
    const request = buildPreferenceRequest({
      ...input,
      passes: [...input.passes, { name: 'Cortesía', priceCents: 0 }],
    });

    expect(request.items.map((item) => item.title)).toEqual([
      'Pase completo Breaking',
      'Open Styles',
    ]);
  });

  it('asks for the automatic return only when the buyer site is https', () => {
    const local = buildPreferenceRequest({ ...input, publicAppUrl: 'http://localhost:5173' });

    // Mercado Pago rejects auto_return toward a non-https site such as localhost.
    expect(local).not.toHaveProperty('auto_return');
    expect(local.back_urls.success).toBe(
      'http://localhost:5173/e/los-mas-pesados-nov-2026/pago?registration=11111111-1111-4111-8111-111111111111',
    );
  });

  it('sends no payer data', () => {
    expect(buildPreferenceRequest(input)).not.toHaveProperty('payer');
  });
});
