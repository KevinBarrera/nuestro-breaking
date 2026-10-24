import { describe, expect, it } from 'vitest';
import {
  registrationStatuses,
  type AdminRegistrationFailure,
  type PossibleDuplicate,
} from '@/entities/admin-registration';
import { emptyParticipantForm } from '@/entities/participant';
import {
  createFailureMessage,
  duplicateMatchRows,
  listCountText,
  liveSearchQuery,
  noMatchTitle,
  participantDisplayName,
  readRegistrationContext,
  registrationLoadMessage,
  readStatusFilter,
  registrationRow,
  registrationServerErrors,
  registrationStatusLabel,
  searchPageNavigation,
  statusChips,
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

describe('liveSearchQuery', () => {
  it('lists everything for blank text, waits on one character and searches from two', () => {
    expect(liveSearchQuery('')).toBe('');
    expect(liveSearchQuery('   ')).toBe('');
    expect(liveSearchQuery(' a ')).toBeNull();
    expect(liveSearchQuery(' Lu ')).toBe('Lu');
    expect(liveSearchQuery('a'.repeat(200))).toBe('a'.repeat(200));
  });
});

describe('readStatusFilter', () => {
  it('reads a known status from the URL and ignores anything else', () => {
    expect(readStatusFilter('confirmed')).toBe('confirmed');
    expect(readStatusFilter('pending_payment')).toBe('pending_payment');
    expect(readStatusFilter('voided')).toBe('voided');
    for (const value of [null, '', 'todas', 'paid']) expect(readStatusFilter(value)).toBeNull();
  });
});

describe('statusChips', () => {
  const counts = { all: 7, pending_payment: 1, confirmed: 5, voided: 1 };

  it('offers every status in the design order with its count', () => {
    expect(statusChips(counts, null)).toEqual([
      { status: null, label: 'Todas', count: 7, selected: true },
      { status: 'confirmed', label: 'Confirmadas', count: 5, selected: false },
      { status: 'pending_payment', label: 'Pendientes de pago', count: 1, selected: false },
      { status: 'voided', label: 'Anuladas', count: 1, selected: false },
    ]);
  });

  it('marks only the chosen status', () => {
    expect(
      statusChips(counts, 'voided')
        .filter((chip) => chip.selected)
        .map((chip) => chip.label),
    ).toEqual(['Anuladas']);
  });
});

describe('listCountText', () => {
  it('counts registrations, or results while searching, in singular and plural', () => {
    expect(listCountText(1, false)).toBe('1 inscripción');
    expect(listCountText(45, false)).toBe('45 inscripciones');
    expect(listCountText(1, true)).toBe('1 resultado');
    expect(listCountText(0, true)).toBe('0 resultados');
  });
});

describe('noMatchTitle', () => {
  it('names the search, or the filter when there is none', () => {
    expect(noMatchTitle('zz')).toBe('No encontramos a nadie con “zz”');
    expect(noMatchTitle('')).toBe('No hay inscripciones con este filtro');
  });
});

describe('registrationRow', () => {
  const result = {
    participant: { id: 'p1', fullName: 'Ale Ferman', email: null, stageName: 'Alesita' },
    registration: {
      id: id(1),
      eventId: id(9),
      folio: 'EV-P8TA',
      status: 'confirmed' as const,
      checkedInAt: null,
    },
    // The backend sorts by name; the row puts the base pass before its add-ons.
    passes: [
      { name: 'Open Styles', passClass: 'add_on' as const },
      { name: 'Pase completo Locking', passClass: 'full' as const },
    ],
    activities: [
      { id: 'a1', name: 'Open Styles 1vs1', kind: 'competition', checkedInAt: null },
      { id: 'a2', name: 'Taller de locking', kind: 'workshop', checkedInAt: null },
      { id: 'a3', name: 'Locking 1v1', kind: 'competition', checkedInAt: null },
    ],
  };

  it('shows the passes joined and only the competitions', () => {
    expect(registrationRow(result)).toEqual({
      name: 'Ale Ferman',
      aka: 'AKA Alesita',
      folio: 'EV-P8TA',
      passes: 'Pase completo Locking + Open Styles',
      competitions: 'Open Styles 1vs1, Locking 1v1',
      status: 'Confirmada',
      accessibleName: 'Ale Ferman, EV-P8TA, Confirmada. Ver inscripción',
    });
  });

  it('says what is missing', () => {
    const bare = {
      ...result,
      participant: { ...result.participant, stageName: null },
      registration: { ...result.registration, folio: null, status: 'pending_payment' as const },
      passes: [],
      activities: [],
    };
    expect(registrationRow(bare)).toMatchObject({
      aka: 'Sin AKA',
      folio: null,
      passes: 'Sin pases',
      competitions: 'Sin competencias',
      status: 'Pendiente de pago',
      accessibleName: 'Ale Ferman, sin folio, Pendiente de pago. Ver inscripción',
    });
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

  it('reads the contact line the new registration passes to its sale (#346)', () => {
    const contact = { email: 'ana@example.org', phone: '+52 3312345678' };
    expect(
      readRegistrationContext({ participantName: 'Ana López', status: 'pending_payment', contact }),
    ).toEqual({ participantName: 'Ana López', status: 'pending_payment', contact });
    expect(
      readRegistrationContext({
        participantName: 'Ana López',
        status: 'pending_payment',
        contact: { email: 'ana@example.org' },
      }),
    ).toEqual({ participantName: 'Ana López', status: 'pending_payment' });
  });

  it('ignores missing or malformed state', () => {
    expect(readRegistrationContext(null)).toBeNull();
    expect(readRegistrationContext({ participantName: '', status: 'confirmed' })).toBeNull();
    expect(readRegistrationContext({ participantName: 'Ana', status: 'paid' })).toBeNull();
  });
});

describe('registrationLoadMessage', () => {
  it('explains why a registration could not be read', () => {
    expect(registrationLoadMessage('forbidden')).toBe(
      'Sin acceso: tu cuenta no puede consultar las inscripciones de este evento.',
    );
    expect(registrationLoadMessage('not_found')).toBe(
      'No encontramos esta inscripción en este evento.',
    );
    expect(registrationLoadMessage('unknown')).toBe(
      'No pudimos cargar la inscripción. Intenta de nuevo.',
    );
  });
});
