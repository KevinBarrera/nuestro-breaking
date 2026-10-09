import { describe, expect, it } from 'vitest';
import { emptyBuyerForm } from './buyer-form';
import { payFailure, reviewBuyer, reviewLines } from './purchase-review';
import { catalogPasses } from './test-fixtures';

describe('reviewLines', () => {
  it('lists chosen passes in catalog order with picked and included competitions', () => {
    const lines = reviewLines(catalogPasses, {
      passTypeIds: ['open-styles', 'breaking', 'general'],
      selectedActivityIds: { breaking: ['bgirl', 'bboy'] },
    });
    // General entry drops because a full pass is chosen.
    expect(lines).toEqual([
      { passId: 'breaking', name: 'Breaking', competitions: ['Bboy', 'Bgirl'], priceCents: 200000 },
      {
        passId: 'open-styles',
        name: 'Open Styles',
        competitions: ['Competencia 1vs1'],
        priceCents: 80000,
      },
    ]);
  });
});

describe('reviewBuyer', () => {
  it('joins the name, keeps the AKA and shows the phone with +52 in groups', () => {
    expect(
      reviewBuyer({
        ...emptyBuyerForm,
        firstName: ' Ana ',
        firstLastName: 'López',
        secondLastName: 'Ruiz',
        stageName: 'B-girl Ana',
        email: 'ana@ejemplo.com ',
        phone: '(33) 1234-5678',
      }),
    ).toEqual({
      name: 'Ana López Ruiz',
      stageName: 'B-girl Ana',
      email: 'ana@ejemplo.com',
      phone: '+52 33 1234 5678',
    });
  });

  it('leaves out a blank AKA', () => {
    const buyer = {
      ...emptyBuyerForm,
      firstName: 'Ana',
      firstLastName: 'López',
      phone: '3312345678',
    };
    expect(reviewBuyer(buyer).stageName).toBeNull();
  });
});

describe('payFailure', () => {
  it('lists buyer field errors with their labels and points to datos', () => {
    expect(
      payFailure({
        kind: 'invalid',
        fieldErrors: { 'buyer.email': 'invalid', 'buyer.phone': 'required' },
      }),
    ).toEqual({
      message: 'Revisa estos datos:',
      details: [
        'Correo electrónico: Escribe un correo válido, por ejemplo nombre@correo.com.',
        'Teléfono celular: Escribe tu teléfono celular.',
      ],
      fix: 'buyer',
    });
  });

  it('sends pass and body field errors to their screens', () => {
    expect(
      payFailure({ kind: 'invalid', fieldErrors: { 'passes[0].passTypeId': 'invalid' } }),
    ).toEqual({
      message: 'Algo cambió en tus pases. Vuelve a elegirlos e intenta de nuevo.',
      details: [],
      fix: 'passes',
    });
    expect(payFailure({ kind: 'invalid', fieldErrors: { body: 'invalid' } })).toEqual({
      message: 'No pudimos procesar tu compra. Revisa tus datos e intenta de nuevo.',
      details: [],
      fix: 'buyer',
    });
  });

  it('points each rule to the screen that fixes it', () => {
    expect(payFailure({ kind: 'rule', code: 'selection_unavailable' }).fix).toBe('competitions');
    for (const code of [
      'pass_type_unavailable',
      'general_with_full',
      'required_pass_missing',
    ] as const)
      expect(payFailure({ kind: 'rule', code }).fix).toBe('passes');
  });

  it('sends closed sales and an unknown event to the home', () => {
    expect(payFailure({ kind: 'sales-closed', reason: 'ended' })).toEqual({
      message: 'La venta en línea ya terminó.',
      details: [],
      fix: 'home',
    });
    expect(payFailure({ kind: 'not-found' }).fix).toBe('home');
  });

  it('asks to wait after too many attempts and to retry other failures', () => {
    expect(payFailure({ kind: 'rate-limited' })).toEqual({
      message: 'Demasiados intentos, espera un momento e intenta de nuevo.',
      details: [],
      fix: null,
    });
    expect(payFailure({ kind: 'error' }).message).toBe(
      'No pudimos completar la solicitud. Revisa tu conexión e intenta de nuevo.',
    );
    expect(payFailure({ kind: 'unavailable' }).fix).toBeNull();
  });
});
