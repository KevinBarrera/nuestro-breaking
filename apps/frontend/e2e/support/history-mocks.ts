// Registration history (#104) items as `GET /admin/events/:eventId/registration-history` returns
// them, shared by the Historial spec and the admin sweeps.
type HistoryItemFixture = {
  id: string;
  occurredAt: string;
  operationType: string;
  actor: { kind: 'admin' | 'public' | 'system'; name: string | null };
  registration: { id: string; folio: string | null; participantName: string };
  reason: string | null;
  details: { kind: string } & Record<string, unknown>;
};

export const historyRegistrationId = 'c1b2c3d4-1234-4567-89ab-123456789abc';
const otherRegistrationId = 'c2b2c3d4-1234-4567-89ab-123456789abc';

let sequence = 0;
export function historyItem(
  operationType: string,
  overrides: Partial<HistoryItemFixture> = {},
): HistoryItemFixture {
  sequence += 1;
  return {
    id: `a${String(sequence).padStart(7, '0')}-1234-4567-89ab-123456789abc`,
    occurredAt: '2026-11-14T18:04:00.000Z',
    operationType,
    actor: { kind: 'admin', name: null },
    registration: { id: historyRegistrationId, folio: 'EB-0042', participantName: 'Ana López' },
    reason: null,
    details: { kind: operationType },
    ...overrides,
  };
}

export const cashCorrection = historyItem('cash_correction', {
  actor: { kind: 'admin', name: 'Coordinación' },
  reason: 'Recibo equivocado',
  details: {
    kind: 'cash_correction',
    previous: { amountCents: 150000, receipt: 'A-1' },
    current: { amountCents: 120000, receipt: 'A-2' },
  },
});

export const nameCorrection = historyItem('registration_correction', {
  occurredAt: '2026-11-14T17:30:00.000Z',
  reason: 'Error de captura',
  details: { kind: 'registration_correction', changedFields: ['firstName', 'stageName'] },
});

export const manualRegistration = historyItem('manual_registration', {
  occurredAt: '2026-11-14T17:00:00.000Z',
});

export const onlinePurchase = historyItem('online_registration', {
  occurredAt: '2026-11-13T20:00:00.000Z',
  actor: { kind: 'public', name: null },
  registration: { id: otherRegistrationId, folio: null, participantName: 'Beto Ruiz' },
});

export const expiry = historyItem('registration_expiry', {
  occurredAt: '2026-11-13T19:00:00.000Z',
  actor: { kind: 'system', name: null },
  registration: { id: otherRegistrationId, folio: null, participantName: 'Beto Ruiz' },
  details: { kind: 'registration_expiry', fromStatus: 'pending_payment', toStatus: 'expired' },
});

// Its pass and cash payment, a minute apart: the screen groups them into one "Inscripción en mesa".
export const onSitePass = historyItem('pass_assignment', {
  occurredAt: '2026-11-14T17:01:00.000Z',
  details: { kind: 'pass_assignment', passTypeName: 'Pase completo Breaking' },
});

export const onSiteCash = historyItem('cash_confirmation', {
  occurredAt: '2026-11-14T17:02:00.000Z',
  details: { kind: 'cash_confirmation', amountCents: 150000, receipt: 'A-1' },
});

export const selectionChange = historyItem('pass_selection_change', {
  occurredAt: '2026-11-14T17:45:00.000Z',
  reason: 'Cambio a la entrada',
  details: {
    kind: 'pass_selection_change',
    passTypeName: 'Pase completo Breaking',
    fromActivityNames: ['Breaking 1v1'],
    toActivityNames: ['Breaking 2v2', 'Toprock'],
  },
});

export const complimentary = historyItem('complimentary_confirmation', {
  occurredAt: '2026-11-13T18:00:00.000Z',
  reason: 'Ganador de torneo',
  registration: { id: otherRegistrationId, folio: 'EB-0099', participantName: 'Beto Ruiz' },
});

// The longest wording of each part, so the sweeps measure wrapping at phone width.
export const sweepHistory = {
  items: [
    {
      ...cashCorrection,
      reason: 'Motivo largo para revisar cómo se acomoda en pantallas angostas',
    },
    historyItem('registration_discipline_swap', {
      registration: {
        id: historyRegistrationId,
        folio: 'EB-0042',
        participantName: 'Persona con un nombre muy largo para pantallas angostas',
      },
      reason: 'Cambio solicitado en mesa',
      details: {
        kind: 'registration_discipline_swap',
        fromPassTypeName: 'Batalla 1vs1 con nombre largo',
        toPassTypeName: 'Batalla 2vs2 con nombre largo',
        fromActivityNames: ['Batalla 1vs1 con nombre largo'],
        toActivityNames: ['Batalla 2vs2 con nombre largo'],
      },
    }),
    onlinePurchase,
    selectionChange,
    complimentary,
  ],
  nextCursor: 'sweep-next-page',
  counts: { all: 12, corrections: 4, on_site: 2, complimentary: 1 },
};
