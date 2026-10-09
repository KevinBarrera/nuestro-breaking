import { describe, expect, it } from 'vitest';
import { checkoutFailure, paymentReturnRegistration, safeCheckoutUrl } from './checkout';

describe('safeCheckoutUrl', () => {
  it('accepts an absolute https URL', () => {
    expect(safeCheckoutUrl('https://example.test/checkout/v1/redirect?pref_id=1')).toBe(
      'https://example.test/checkout/v1/redirect?pref_id=1',
    );
  });

  it('rejects any other scheme, a relative URL or garbage', () => {
    for (const value of [
      'http://example.test/checkout',
      'javascript:alert(1)',
      'data:text/html,hi',
      '/e/nov/pago',
      '//example.test/checkout',
      'not a url',
      '',
    ])
      expect(safeCheckoutUrl(value), value).toBeNull();
  });
});

describe('checkoutFailure', () => {
  it('offers a retry when the provider or the connection failed', () => {
    expect(checkoutFailure({ kind: 'provider-unavailable' })).toEqual({
      message: 'Mercado Pago no respondió. Intenta de nuevo en un momento.',
      retry: true,
      fix: null,
    });
    expect(checkoutFailure({ kind: 'error' })).toEqual({
      message: 'No pudimos abrir Mercado Pago. Revisa tu conexión e intenta de nuevo.',
      retry: true,
      fix: null,
    });
    expect(checkoutFailure({ kind: 'rate-limited' }).retry).toBe(true);
  });

  it('sends the buyer home when the event or sales are gone', () => {
    expect(checkoutFailure({ kind: 'sales-closed', reason: 'ended' })).toEqual({
      message: 'La venta en línea ya terminó.',
      retry: false,
      fix: 'home',
    });
    expect(checkoutFailure({ kind: 'not-found' })).toMatchObject({ retry: false, fix: 'home' });
  });

  it('does not retry a registration that can no longer be paid', () => {
    expect(checkoutFailure({ kind: 'not-payable' })).toEqual({
      message:
        'Esta inscripción ya no se puede pagar en línea. Si ya pagaste, revisa tu correo; si no, comunícate con la organización.',
      retry: false,
      fix: null,
    });
  });
});

describe('paymentReturnRegistration', () => {
  it('reads the registration id and nothing from Mercado Pago', () => {
    const params = new URLSearchParams(
      'registration=6b0f0b5e-6d1f-4f8f-9a55-0f1c2b3d4e5f&status=approved&collection_status=approved&payment_id=1',
    );
    expect(paymentReturnRegistration(params)).toBe('6b0f0b5e-6d1f-4f8f-9a55-0f1c2b3d4e5f');
  });

  it('is null when the id is missing or blank', () => {
    expect(paymentReturnRegistration(new URLSearchParams('status=approved'))).toBeNull();
    expect(paymentReturnRegistration(new URLSearchParams('registration=%20'))).toBeNull();
  });
});
