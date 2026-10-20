import { describe, expect, it } from 'vitest';
import {
  registrationStatuses,
  type AdminRegistrationFailure,
  type PossibleDuplicate,
} from '@/entities/admin-registration';
import { emptyParticipantForm } from '@/entities/participant';
import {
  activitySummary,
  createFailureMessage,
  duplicateMatchRows,
  participantDisplayName,
  readRegistrationContext,
  registrationServerErrors,
  registrationStatusLabel,
  resultsCount,
  searchPageNavigation,
  searchQueryHint,
} from './registration-model';
import { validateSaleParticipant } from './sale-participant-model';

const id = (n: number) => `c${n}b2c3d4-1234-4567-89ab-123456789abc`;

describe('registrationStatusLabel', () => {
  it('labels every status the backend returns in Spanish', () => {
    expect(registrationStatuses.map(registrationStatusLabel)).toEqual([
      'Pendiente de pago',
      'Confirmada',
      'Anulada',
    ]);
  });
});

describe('searchQueryHint', () => {
  it('asks for at least 2 characters once trimmed', () => {
    expect(searchQueryHint('')).toBe('Escribe al menos 2 caracteres para buscar.');
    expect(searchQueryHint('  a ')).toBe('Escribe al menos 2 caracteres para buscar.');
  });

  it('rejects more than 200 characters', () => {
    expect(searchQueryHint('a'.repeat(201))).toBe('Usa máximo 200 caracteres.');
  });

  it('accepts 2 to 200 characters', () => {
    expect(searchQueryHint(' Lu ')).toBeNull();
    expect(searchQueryHint('a'.repeat(200))).toBeNull();
  });
});

describe('resultsCount', () => {
  it('counts registrations in singular and plural', () => {
    expect(resultsCount(1)).toBe('1 inscripción');
    expect(resultsCount(45)).toBe('45 inscripciones');
  });
});

describe('searchPageNavigation', () => {
  it('has no range or offsets when every result fits one page', () => {
    expect(searchPageNavigation({ total: 3, limit: 20, offset: 0, shown: 3 })).toEqual({
      range: null,
      previousOffset: null,
      nextOffset: null,
    });
  });

  it('offers the next page from the first one', () => {
    expect(searchPageNavigation({ total: 45, limit: 20, offset: 0, shown: 20 })).toEqual({
      range: 'Mostrando 1–20 de 45',
      previousOffset: null,
      nextOffset: 20,
    });
  });

  it('offers both directions in the middle and only previous on the last page', () => {
    expect(searchPageNavigation({ total: 45, limit: 20, offset: 20, shown: 20 })).toEqual({
      range: 'Mostrando 21–40 de 45',
      previousOffset: 0,
      nextOffset: 40,
    });
    expect(searchPageNavigation({ total: 45, limit: 20, offset: 40, shown: 5 })).toEqual({
      range: 'Mostrando 41–45 de 45',
      previousOffset: 20,
      nextOffset: null,
    });
  });

  it('never goes before the first result', () => {
    expect(
      searchPageNavigation({ total: 30, limit: 20, offset: 5, shown: 20 }).previousOffset,
    ).toBe(0);
  });
});

describe('activitySummary', () => {
  it('names the activities, or says there are none', () => {
    expect(activitySummary([])).toBe('Sin actividades');
    expect(activitySummary([{ name: 'Batalla' }, { name: 'Taller' }])).toBe('Batalla, Taller');
  });
});

describe('participantDisplayName', () => {
  it('joins the trimmed name parts that were typed', () => {
    expect(
      participantDisplayName({
        ...emptyParticipantForm,
        firstName: ' Ana ',
        firstLastName: 'López',
        secondLastName: ' ',
      }),
    ).toBe('Ana López');
    expect(
      participantDisplayName({
        ...emptyParticipantForm,
        firstName: 'Ana',
        firstLastName: 'López',
        secondLastName: 'Ruiz',
      }),
    ).toBe('Ana López Ruiz');
  });
});

describe('registrationServerErrors', () => {
  it('maps the backend codes onto the form fields with the sale copy', () => {
    expect(
      registrationServerErrors(
        {
          firstName: 'required',
          email: 'invalid',
          phone: 'invalid',
          city: 'too_long',
          birthDate: 'in_future',
        },
        'mx',
      ),
    ).toEqual({
      errors: {
        firstName: 'Escribe el nombre.',
        email: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
        phone: 'Escribe los 10 dígitos del celular.',
        city: 'Usa máximo 100 caracteres.',
        birthDate: 'La fecha no puede ser futura.',
      },
      unmapped: false,
    });
  });

  it('uses the phone message of the chosen mode', () => {
    expect(registrationServerErrors({ phone: 'invalid' }, 'international').errors).toEqual({
      phone: 'Escribe el número completo con clave de país, de 10 a 15 dígitos.',
    });
  });

  it('reads like the client check of the same mistakes', () => {
    const typed = {
      ...emptyParticipantForm,
      email: 'ana',
      phone: '123',
      instagram: 'a b',
      birthDate: '2026-02-30',
    };
    for (const mode of ['mx', 'international'] as const) {
      const client = validateSaleParticipant(typed, '2026-10-16', mode);
      const server = registrationServerErrors(
        {
          firstName: 'required',
          firstLastName: 'required',
          email: 'invalid',
          phone: 'invalid',
          instagram: 'invalid',
          birthDate: 'invalid',
        },
        mode,
      );
      expect(server.errors).toEqual(client);
    }
  });

  it('falls back to a generic field message for a code without specific copy', () => {
    expect(registrationServerErrors({ level: 'invalid' }, 'mx').errors).toEqual({
      level: 'Revisa este dato.',
    });
  });

  it('reports fields and codes it cannot place on the form', () => {
    expect(
      registrationServerErrors({ activityIds: 'invalid', email: 'unknown_field' }, 'mx'),
    ).toEqual({ errors: {}, unmapped: true });
    expect(registrationServerErrors({ nickname: 'unknown_field' }, 'mx').unmapped).toBe(true);
  });
});

describe('duplicateMatchRows', () => {
  const match = (overrides: Partial<PossibleDuplicate>): PossibleDuplicate => ({
    registrationId: id(1),
    fullName: 'Alex Rivera',
    stageName: 'Flash',
    folio: null,
    status: 'pending_payment',
    maskedEmail: 'a***@example.com',
    maskedPhone: '******4567',
    ...overrides,
  });

  it('presents every match with masked contact data and Spanish status', () => {
    expect(
      duplicateMatchRows([
        match({}),
        match({
          registrationId: id(2),
          stageName: null,
          folio: 'LMP-7K3Q',
          status: 'confirmed',
          maskedEmail: null,
          maskedPhone: null,
        }),
      ]),
    ).toEqual([
      {
        registrationId: id(1),
        fullName: 'Alex Rivera',
        stageName: 'Flash',
        folio: 'Sin folio',
        status: 'Pendiente de pago',
        email: 'a***@example.com',
        phone: '******4567',
        canContinue: true,
      },
      {
        registrationId: id(2),
        fullName: 'Alex Rivera',
        stageName: null,
        folio: 'LMP-7K3Q',
        status: 'Confirmada',
        email: 'Sin correo',
        phone: 'Sin teléfono',
        canContinue: false,
      },
    ]);
  });
});

describe('createFailureMessage', () => {
  it('gives each failure a safe Spanish message', () => {
    const message = (failure: AdminRegistrationFailure) => createFailureMessage(failure);
    expect(message({ kind: 'unauthorized' })).toBe(
      'Sin acceso: tu cuenta no puede registrar inscripciones en este evento.',
    );
    expect(message({ kind: 'forbidden' })).toBe(message({ kind: 'unauthorized' }));
    expect(message({ kind: 'unknown' })).toBe(
      'No pudimos confirmar si la inscripción se guardó. Busca al participante antes de intentarlo de nuevo.',
    );
    for (const kind of ['error', 'not_found'] as const)
      expect(message({ kind })).toBe('No pudimos registrar la inscripción. Intenta de nuevo.');
    expect(message({ kind: 'invalid', fieldErrors: {} })).toBe(
      'Revisa los datos del participante e intenta de nuevo.',
    );
  });
});

describe('readRegistrationContext', () => {
  it('reads the participant name and status passed by the previous screen', () => {
    expect(readRegistrationContext({ participantName: 'Ana López', status: 'confirmed' })).toEqual({
      participantName: 'Ana López',
      status: 'confirmed',
    });
  });

  it('ignores missing or malformed state', () => {
    expect(readRegistrationContext(null)).toBeNull();
    expect(readRegistrationContext({ participantName: '', status: 'confirmed' })).toBeNull();
    expect(readRegistrationContext({ participantName: 'Ana', status: 'paid' })).toBeNull();
  });
});
