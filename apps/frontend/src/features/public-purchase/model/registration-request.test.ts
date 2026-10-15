import { legalDocuments } from '@/shared/config';
import { describe, expect, it } from 'vitest';
import { emptyBuyerForm } from './buyer-form';
import { buildRegistrationRequest, failureMessage, serverErrors } from './registration-request';
import { breaking, catalogPasses, openStyles } from './test-fixtures';

const buyer = {
  ...emptyBuyerForm,
  firstName: 'Ana',
  firstLastName: 'López',
  email: 'ana@ejemplo.com',
  phone: '3312345678',
};

describe('buildRegistrationRequest', () => {
  it('sends chosen passes in catalog order with their competitions', () => {
    const request = buildRegistrationRequest(
      catalogPasses,
      {
        passTypeIds: ['open-styles', 'breaking'],
        selectedActivityIds: { breaking: ['bboy'] },
      },
      buyer,
    );
    expect(request).toEqual({
      buyer: {
        firstName: 'Ana',
        firstLastName: 'López',
        email: 'ana@ejemplo.com',
        phone: '+52 3312345678',
      },
      passes: [
        { passTypeId: 'breaking', selectedActivityIds: ['bboy'] },
        { passTypeId: 'open-styles' },
      ],
      legalAcceptances: {
        rules: 'borrador-2026-10-13',
        privacy: 'borrador-2026-10-13',
        cancellation: 'borrador-2026-10-13',
      },
    });
  });

  it('accepts the version each legal document page shows', () => {
    const { legalAcceptances } = buildRegistrationRequest(
      catalogPasses,
      { passTypeIds: ['breaking'], selectedActivityIds: {} },
      buyer,
    );
    expect(legalAcceptances).toEqual(
      Object.fromEntries(legalDocuments.map(({ key, version }) => [key, version])),
    );
  });
});

describe('serverErrors', () => {
  it('maps buyer paths to Spanish messages per field', () => {
    expect(
      serverErrors({
        'buyer.email': 'invalid',
        'buyer.firstName': 'required',
        'buyer.city': 'too_long',
        'buyer.birthDate': 'in_future',
        'buyer.level': 'something_new',
      }),
    ).toEqual({
      buyer: {
        email: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
        firstName: 'Escribe tu nombre.',
        city: 'Usa máximo 100 caracteres.',
        birthDate: 'La fecha no puede ser futura.',
        level: 'Revisa este dato.',
      },
      passes: null,
      legal: null,
      other: null,
    });
  });

  it('collects pass and unknown problems into one message each', () => {
    const errors = serverErrors({
      'passes[0].passTypeId': 'invalid',
      'passes[1].selectedActivityIds[0]': 'duplicate',
      'buyer.country': 'unknown_field',
    });
    expect(errors.buyer).toEqual({});
    expect(errors.passes).toBe('Algo cambió en tus pases. Vuelve a elegirlos e intenta de nuevo.');
    expect(errors.other).toBe(
      'No pudimos procesar tu compra. Revisa tus datos e intenta de nuevo.',
    );
  });
});

describe('serverErrors for legal documents', () => {
  it('asks to reload when a legal document changed or was not accepted', () => {
    const errors = serverErrors({
      'legalAcceptances.rules': 'outdated',
      'legalAcceptances.privacy': 'required',
    });
    expect(errors).toEqual({
      buyer: {},
      passes: null,
      legal:
        'Actualizamos los documentos legales. Recarga la página, revísalos y acéptalos de nuevo para pagar.',
      other: null,
    });
  });
});

describe("a pass that closes on the buyer's clock (#240)", () => {
  it('is still sent, so the server answers why it cannot be bought', () => {
    const lapsed = { ...breaking, onlineSalesClosesAt: '2000-01-01T00:00:00.000Z' };
    const request = buildRegistrationRequest(
      [lapsed, openStyles],
      { passTypeIds: [lapsed.id, openStyles.id], selectedActivityIds: { [lapsed.id]: ['bboy'] } },
      buyer,
    );
    expect(request.passes).toEqual([
      { passTypeId: lapsed.id, selectedActivityIds: ['bboy'] },
      { passTypeId: openStyles.id },
    ]);
  });
});

describe('failureMessage', () => {
  it('explains every failure in Spanish', () => {
    expect(failureMessage({ kind: 'sales-closed', reason: 'ended' })).toBe(
      'La venta en línea ya terminó.',
    );
    expect(failureMessage({ kind: 'rule', code: 'general_with_full' })).toBe(
      'La entrada general ya está incluida en los pases completos. Quítala para continuar.',
    );
    expect(failureMessage({ kind: 'rule', code: 'pass_type_sales_closed' })).toBe(
      'La venta en línea de uno de tus pases ya cerró. Vuelve a elegir tus pases.',
    );
    expect(failureMessage({ kind: 'unavailable' })).toBe(
      'No podemos completar esta inscripción en línea. Comunícate con la organización.',
    );
    expect(failureMessage({ kind: 'rate-limited' })).toBe(
      'Hiciste muchos intentos seguidos. Espera un minuto e intenta de nuevo.',
    );
    for (const kind of ['not-found', 'error'] as const)
      expect(failureMessage({ kind })).toMatch(/\.$/);
    expect(failureMessage({ kind: 'invalid', fieldErrors: {} })).toBe('Revisa los datos marcados.');
  });
});
