import type { Page } from '@playwright/test';
import { activeEventId, eventSummary, mockSession } from './event-mocks.ts';

// Mocked admin registration API (#105): search, entitlements, the manual registration, the
// event's pass types and activities, adding a pass, replacing a pass's selections, confirming
// a cash payment and confirming without payment (#263), and the #104 void, participant correction
// and discipline swap.
// Each handler answers per request, and the helper returns what the screens sent.
const api = (url: URL) => url.port === '3000';

export const eventId = activeEventId;
export const registrationId = 'c1b2c3d4-1234-4567-89ab-123456789abc';
export const otherRegistrationId = 'c2b2c3d4-1234-4567-89ab-123456789abc';
export const thirdRegistrationId = 'c3b2c3d4-1234-4567-89ab-123456789abc';

export const registrationsPath = `/admin/events/${eventId}/registrations`;
export const newRegistrationPath = `${registrationsPath}/new`;
export const registrationPath = (id: string) => `${registrationsPath}/${id}`;
// Nueva inscripción's pass, cash and confirmed steps of a pending registration (#346).
export const salePath = (id: string) => `${registrationsPath}/${id}/sale`;

export const searchResult = (
  id: string,
  fullName: string,
  overrides: { stageName?: string | null; folio?: string | null; status?: string } = {},
) => ({
  participant: {
    id: `participant-${id}`,
    fullName,
    email: 'persona@example.org',
    stageName: overrides.stageName ?? null,
  },
  registration: {
    id,
    eventId,
    folio: overrides.folio ?? null,
    status: overrides.status ?? 'pending_payment',
    checkedInAt: null,
    generalEntryOnly: false,
  },
  passes: [] as { name: string; passClass: string }[],
  activities: [] as { id: string; name: string; kind: string; checkedInAt: null }[],
});

// `counts` default to the statuses of the given results (#344).
export const searchPage = (
  results: ReturnType<typeof searchResult>[],
  {
    total = results.length,
    offset = 0,
    counts = {
      all: results.length,
      pending_payment: results.filter((r) => r.registration.status === 'pending_payment').length,
      confirmed: results.filter((r) => r.registration.status === 'confirmed').length,
      voided: results.filter((r) => r.registration.status === 'voided').length,
    },
  } = {},
) => ({ total, limit: 20, offset, counts, results });

export const heldPass = {
  registrationPassId: 'f9b2c3d4-1234-4567-89ab-123456789abc',
  passTypeId: 'f1b2c3d4-1234-4567-89ab-123456789abc',
  name: 'Pase completo',
  passClass: 'full',
  priceCents: 150000,
  selections: [],
};

// A catalog pass type as `GET /admin/events/:eventId/pass-types` lists it.
export const catalogPassType = (
  id: string,
  name: string,
  passClass: string,
  priceCents: number,
  overrides: {
    requiresPassClass?: string | null;
    status?: string;
    activities?: { activityId: string; access: string }[];
  } = {},
) => ({
  id,
  eventId,
  name,
  passClass,
  priceCents,
  requiresPassClass: overrides.requiresPassClass ?? null,
  onlineSalesClosesAt: null,
  status: overrides.status ?? 'active',
  version: 1,
  activities: overrides.activities ?? [],
});

// A catalog activity as `GET /admin/events/:eventId/activities` lists it.
export const catalogActivity = (
  id: string,
  name: string,
  startsAt: string,
  overrides: { status?: string } = {},
) => ({
  id,
  eventId,
  venueId: 'a9b2c3d4-1234-4567-89ab-123456789abc',
  kind: 'competition',
  name,
  startsAt,
  endsAt: startsAt,
  status: overrides.status ?? 'active',
  version: 1,
});

export const created = (id = registrationId) => ({
  registrationId: id,
  participantId: 'participant-new',
  eventId,
  status: 'pending_payment',
  auditId: 'audit-1',
});

export const duplicateMatch = (id: string, overrides: Record<string, unknown> = {}) => ({
  registrationId: id,
  fullName: 'Alex Rivera',
  stageName: 'Flash',
  folio: null,
  status: 'pending_payment',
  maskedEmail: 'a***@example.com',
  maskedPhone: '******4567',
  ...overrides,
});

export const possibleDuplicates = (matches: ReturnType<typeof duplicateMatch>[]) => ({
  status: 409,
  json: {
    statusCode: 409,
    message: 'Possible duplicate registrations need confirmation',
    code: 'possible_duplicates',
    matches,
  },
});

// The summary every entitlements answer carries: pending, no folio, in person, no cash payment,
// the created participant. A name part given as null stays null, as on a legacy participant.
export const registrationSummary = (
  id: string,
  overrides: {
    status?: string;
    folio?: string | null;
    channel?: 'in_person' | 'online';
    cash?: { amountCents: number; receipt: string | null } | null;
    fullName?: string;
    firstName?: string | null;
    firstLastName?: string | null;
    secondLastName?: string | null;
    stageName?: string | null;
  } = {},
) => ({
  id,
  status: overrides.status ?? 'pending_payment',
  folio: overrides.folio ?? null,
  channel: overrides.channel ?? 'in_person',
  cash: overrides.cash ?? null,
  participant: {
    fullName: overrides.fullName ?? 'Ana López',
    firstName: overrides.firstName === undefined ? 'Ana' : overrides.firstName,
    firstLastName: overrides.firstLastName === undefined ? 'López' : overrides.firstLastName,
    secondLastName: overrides.secondLastName ?? null,
    stageName: overrides.stageName ?? null,
  },
});

type Answer = { status?: number; json?: unknown; abort?: boolean };

// Every entitlements answer names its registration (#105); specs only set the passes.
function withSummary(id: string, answer: Answer): Answer {
  const json = answer.json as Record<string, unknown> | undefined;
  return json && Array.isArray(json.passes) && !('registration' in json)
    ? { ...answer, json: { registration: registrationSummary(id), ...json } }
    : answer;
}

export type RegistrationMocks = {
  search?: (url: URL) => Answer;
  entitlements?: (id: string) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  create?: (attempt: number) => Answer;
  passTypes?: () => Answer;
  // `attempt` counts the POSTs, starting at 1; `sent` is what this one sent.
  addPass?: (attempt: number, sent: SentPass) => Answer;
  activities?: () => Answer;
  // `attempt` counts the PUTs, starting at 1; `sent` is what this one sent.
  selections?: (attempt: number, sent: SentSelections) => Answer;
  // `attempt` counts the DELETEs, starting at 1; `sent` is what this one sent.
  removePass?: (attempt: number, sent: SentRemoval) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  cash?: (attempt: number) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  complimentary?: (attempt: number) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  void?: (attempt: number) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  correction?: (attempt: number) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  swap?: (attempt: number) => Answer;
  // `attempt` counts the POSTs, starting at 1.
  cashCorrection?: (attempt: number) => Answer;
};

export type SentCreate = { body: Record<string, unknown>; csrf: string | null };
export type SentPass = { registrationId: string; body: unknown; csrf: string | null };
export type SentSelections = SentPass & { registrationPassId: string };
export type SentRemoval = {
  registrationId: string;
  registrationPassId: string;
  csrf: string | null;
};
export type SentCash = SentPass;
export type SentComplimentary = SentPass;
export type SentVoid = SentPass;
export type SentCorrection = SentPass;
export type SentSwap = SentPass;
export type SentCashCorrection = SentPass;

// The answer of a recorded cash payment.
export const cashConfirmed = (id: string, folio: string) => ({
  registrationId: id,
  eventId,
  status: 'confirmed',
  folio,
  auditId: 'audit-cash-1',
});

// A held pass the registration got for free, such as a golden ticket.
export const freeHeldPass = {
  registrationPassId: 'f8b2c3d4-1234-4567-89ab-123456789abc',
  passTypeId: 'f2b2c3d4-1234-4567-89ab-123456789abc',
  name: 'Golden ticket',
  passClass: 'full',
  priceCents: 0,
  selections: [],
};

// The catalog of the stepper specs (#346): a general entry, two full passes with competitions
// to choose and an add-on that requires a full pass and includes its own competition.
export const saleActivities = {
  popping1: catalogActivity(
    'b1b2c3d4-1234-4567-89ab-123456789abc',
    'Popping 1v1',
    '2026-11-14T17:00:00Z',
  ),
  popping2: catalogActivity(
    'b2b2c3d4-1234-4567-89ab-123456789abc',
    'Popping 2v2',
    '2026-11-14T18:00:00Z',
  ),
  breaking: catalogActivity(
    'b3b2c3d4-1234-4567-89ab-123456789abc',
    'Breaking Bboy',
    '2026-11-14T16:00:00Z',
  ),
  openStyles: catalogActivity(
    'b4b2c3d4-1234-4567-89ab-123456789abc',
    'Open Styles 1vs1',
    '2026-11-14T19:00:00Z',
  ),
};

export const salePassTypes = {
  general: catalogPassType(
    'e1b2c3d4-1234-4567-89ab-123456789abc',
    'Entrada general',
    'general',
    100000,
  ),
  popping: catalogPassType(
    'e2b2c3d4-1234-4567-89ab-123456789abc',
    'Pase completo Popping',
    'full',
    200000,
    {
      activities: [
        { activityId: saleActivities.popping2.id, access: 'selectable' },
        { activityId: saleActivities.popping1.id, access: 'selectable' },
      ],
    },
  ),
  breaking: catalogPassType(
    'e3b2c3d4-1234-4567-89ab-123456789abc',
    'Pase completo Breaking',
    'full',
    200000,
    { activities: [{ activityId: saleActivities.breaking.id, access: 'selectable' }] },
  ),
  openStyles: catalogPassType(
    'e4b2c3d4-1234-4567-89ab-123456789abc',
    'Open Styles',
    'add_on',
    80000,
    {
      requiresPassClass: 'full',
      activities: [{ activityId: saleActivities.openStyles.id, access: 'included' }],
    },
  ),
};

export type SaleHeldPass = {
  registrationPassId: string;
  passTypeId: string;
  name: string;
  passClass: string;
  priceCents: number;
  selections: string[];
};

// The id a held pass of this pass type gets: a UUID, as the entitlements reader requires.
export const heldPassId = (passType: { id: string }) => `d${passType.id.slice(1)}`;

// A held pass of a catalog pass type, as the entitlements list it.
export const heldOf = (
  passType: ReturnType<typeof catalogPassType>,
  selections: string[] = [],
): SaleHeldPass => ({
  registrationPassId: heldPassId(passType),
  passTypeId: passType.id,
  name: passType.name,
  passClass: passType.passClass,
  priceCents: passType.priceCents,
  selections,
});

// A pending registration whose passes follow the writes, as the backend answers them: each add,
// removal and competition change answers with the current entitlements.
export function saleBackend(
  held: SaleHeldPass[] = [],
  summary: Parameters<typeof registrationSummary>[1] = {},
) {
  const state = { held: [...held], summary };
  const answer = (id: string, status = 200): Answer => ({
    status,
    json: {
      registration: registrationSummary(id, state.summary),
      passes: state.held,
      accessibleActivityIds: [],
    },
  });
  const passTypes = Object.values(salePassTypes);
  const mocks: RegistrationMocks = {
    passTypes: () => ({ json: passTypes }),
    activities: () => ({ json: Object.values(saleActivities) }),
    entitlements: (id) => answer(id),
    addPass: (_attempt, sent) => {
      const { passTypeId } = sent.body as { passTypeId: string };
      state.held.push(heldOf(passTypes.find((passType) => passType.id === passTypeId)!));
      return answer(sent.registrationId, 201);
    },
    removePass: (_attempt, sent) => {
      state.held = state.held.filter((pass) => pass.registrationPassId !== sent.registrationPassId);
      return answer(sent.registrationId);
    },
    selections: (_attempt, sent) => {
      const { activityIds } = sent.body as { activityIds: string[] };
      state.held = state.held.map((pass) =>
        pass.registrationPassId === sent.registrationPassId
          ? { ...pass, selections: activityIds }
          : pass,
      );
      return answer(sent.registrationId);
    },
  };
  return { state, mocks };
}

export async function mockRegistrations(page: Page, mocks: RegistrationMocks = {}) {
  const searches: URL[] = [];
  const creates: SentCreate[] = [];
  const addedPasses: SentPass[] = [];
  const selections: SentSelections[] = [];
  const removedPasses: SentRemoval[] = [];
  const cash: SentCash[] = [];
  const complimentary: SentComplimentary[] = [];
  const voids: SentVoid[] = [];
  const corrections: SentCorrection[] = [];
  const swaps: SentSwap[] = [];
  const cashCorrections: SentCashCorrection[] = [];
  await mockSession(page);
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: [eventSummary(eventId, 'Encuentro del barrio')] }),
  );
  const fulfill = async (
    route: Parameters<Parameters<Page['route']>[1]>[0],
    { status = 200, json, abort }: Answer,
  ) => (abort ? route.abort('failed') : route.fulfill({ status, json }));
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/participants`,
    (route) => {
      const url = new URL(route.request().url());
      searches.push(url);
      return fulfill(route, mocks.search?.(url) ?? { json: searchPage([]) });
    },
  );
  await page.route(
    (url) =>
      api(url) && /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/entitlements$/.test(url.pathname),
    (route) => {
      const id = new URL(route.request().url()).pathname.split('/')[5];
      const answer = mocks.entitlements?.(id) ?? {
        json: { passes: [], accessibleActivityIds: [] },
      };
      return fulfill(route, withSummary(id, answer));
    },
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/registrations/manual`,
    (route) => {
      const request = route.request();
      creates.push({
        body: request.postDataJSON() as Record<string, unknown>,
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      return fulfill(route, mocks.create?.(creates.length) ?? { status: 201, json: created() });
    },
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/pass-types`,
    (route) => fulfill(route, mocks.passTypes?.() ?? { json: [] }),
  );
  await page.route(
    (url) =>
      api(url) && /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/passes$/.test(url.pathname),
    (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/')[5];
      const sent = {
        registrationId: id,
        body: request.postDataJSON() as unknown,
        csrf: request.headers()['x-csrf-token'] ?? null,
      };
      addedPasses.push(sent);
      const answer = mocks.addPass?.(addedPasses.length, sent) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(id, answer));
    },
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/activities`,
    (route) => fulfill(route, mocks.activities?.() ?? { json: [] }),
  );
  await page.route(
    (url) =>
      api(url) &&
      /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/passes\/[^/]+\/selections$/.test(
        url.pathname,
      ),
    (route) => {
      const request = route.request();
      const segments = new URL(request.url()).pathname.split('/');
      const sent = {
        registrationId: segments[5],
        registrationPassId: segments[7],
        body: request.postDataJSON() as unknown,
        csrf: request.headers()['x-csrf-token'] ?? null,
      };
      selections.push(sent);
      const answer = mocks.selections?.(selections.length, sent) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(segments[5], answer));
    },
  );
  await page.route(
    (url) =>
      api(url) &&
      /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/passes\/[^/]+$/.test(url.pathname),
    (route) => {
      const request = route.request();
      if (request.method() !== 'DELETE') return route.fallback();
      const segments = new URL(request.url()).pathname.split('/');
      const sent = {
        registrationId: segments[5],
        registrationPassId: segments[7],
        csrf: request.headers()['x-csrf-token'] ?? null,
      };
      removedPasses.push(sent);
      const answer = mocks.removePass?.(removedPasses.length, sent) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(segments[5], answer));
    },
  );
  await page.route(
    (url) =>
      api(url) &&
      /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/cash-confirmation$/.test(url.pathname),
    (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/')[5];
      cash.push({
        registrationId: id,
        body: request.postDataJSON(),
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      return fulfill(route, mocks.cash?.(cash.length) ?? { status: 500, json: {} });
    },
  );
  await page.route(
    (url) =>
      api(url) &&
      /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/complimentary-confirmation$/.test(
        url.pathname,
      ),
    (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/')[5];
      complimentary.push({
        registrationId: id,
        body: request.postDataJSON(),
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      const answer = mocks.complimentary?.(complimentary.length) ?? { status: 500, json: {} };
      return fulfill(route, answer);
    },
  );
  await page.route(
    (url) => api(url) && /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/void$/.test(url.pathname),
    (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/')[5];
      voids.push({
        registrationId: id,
        body: request.postDataJSON(),
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      const answer = mocks.void?.(voids.length) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(id, answer));
    },
  );
  await page.route(
    (url) =>
      api(url) &&
      /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/participant-correction$/.test(url.pathname),
    (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/')[5];
      corrections.push({
        registrationId: id,
        body: request.postDataJSON(),
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      const answer = mocks.correction?.(corrections.length) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(id, answer));
    },
  );
  await page.route(
    (url) =>
      api(url) &&
      /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/discipline-swap$/.test(url.pathname),
    (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/')[5];
      swaps.push({
        registrationId: id,
        body: request.postDataJSON(),
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      const answer = mocks.swap?.(swaps.length) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(id, answer));
    },
  );
  await page.route(
    (url) =>
      api(url) &&
      /^\/admin\/events\/[^/]+\/registrations\/[^/]+\/cash-correction$/.test(url.pathname),
    (route) => {
      const request = route.request();
      const id = new URL(request.url()).pathname.split('/')[5];
      cashCorrections.push({
        registrationId: id,
        body: request.postDataJSON(),
        csrf: request.headers()['x-csrf-token'] ?? null,
      });
      const answer = mocks.cashCorrection?.(cashCorrections.length) ?? { status: 500, json: {} };
      return fulfill(route, withSummary(id, answer));
    },
  );
  return {
    searches,
    creates,
    addedPasses,
    selections,
    removedPasses,
    cash,
    complimentary,
    voids,
    corrections,
    swaps,
    cashCorrections,
  };
}

// The registration screen in each status, and the search with a pending result, for the
// accessibility and phone-width sweeps. Each case layers its answers over `mockAdminApi`.
const sweepEntitlements = (
  status: string,
  folio: string | null,
  passes: SaleHeldPass[] = [heldPass],
  cash: { amountCents: number; receipt: string | null } | null = null,
) => ({
  json: {
    registration: registrationSummary(registrationId, {
      status,
      folio,
      cash,
      fullName: 'Persona con un nombre muy largo para pantallas angostas',
      firstName: 'Persona con un nombre muy largo',
      firstLastName: 'para pantallas angostas',
    }),
    passes,
    accessibleActivityIds: [],
  },
});

async function overrideRoute(page: Page, suffix: string, json: unknown) {
  await page.route(
    (url) => api(url) && url.pathname.endsWith(suffix),
    (route) => route.fulfill({ json }),
  );
}

// A pending registration holding a full pass with one competition and the add-on, with the
// stepper catalog, for the sale steps' sweeps.
const mockSweepSale = () => async (page: Page) => {
  await overrideRoute(
    page,
    '/entitlements',
    sweepEntitlements('pending_payment', null, [
      heldOf(salePassTypes.popping, [saleActivities.popping1.id]),
      heldOf(salePassTypes.openStyles),
    ]).json,
  );
  await overrideRoute(page, '/pass-types', Object.values(salePassTypes));
  await overrideRoute(page, '/activities', Object.values(saleActivities));
};

export const registrationSweepCases: {
  name: string;
  path: string;
  mock: (page: Page) => Promise<void>;
  // Waits until the screen shows the controls the sweeps measure.
  ready: (page: Page) => Promise<void>;
}[] = [
  {
    // A pending registration's detail leads to its sale (#346).
    name: 'Inscripción pendiente',
    path: registrationPath(registrationId),
    mock: (page) =>
      overrideRoute(page, '/entitlements', sweepEntitlements('pending_payment', null).json),
    ready: (page) => page.getByRole('link', { name: 'Continuar venta' }).waitFor(),
  },
  {
    // Nueva inscripción's pass step with a full pass, its competitions and an add-on (#346).
    name: 'Nueva inscripción pases',
    path: salePath(registrationId),
    mock: mockSweepSale(),
    ready: (page) =>
      page.getByRole('group', { name: 'Competencias de Pase completo Popping' }).waitFor(),
  },
  {
    // The read-only participant step of a registration that already exists.
    name: 'Nueva inscripción participante guardado',
    path: salePath(registrationId),
    mock: mockSweepSale(),
    ready: async (page) => {
      await page.getByRole('button', { name: 'Atrás' }).click();
      await page.getByRole('heading', { name: '¿Quién se inscribe?' }).waitFor();
    },
  },
  {
    // The cash step with an amount that differs from the total, so its warning shows too.
    name: 'Nueva inscripción cobro',
    path: salePath(registrationId),
    mock: mockSweepSale(),
    ready: async (page) => {
      await page.getByRole('button', { name: 'Continuar al cobro' }).click();
      await page.getByRole('textbox', { name: 'Monto recibido (MXN)' }).fill('1000');
      await page.getByText(/^No coincide con el total/).waitFor();
    },
  },
  {
    // A $0 registration confirms without cash, with its reason (#263).
    name: 'Nueva inscripción sin cobro',
    path: salePath(registrationId),
    mock: (page) =>
      overrideRoute(
        page,
        '/entitlements',
        sweepEntitlements('pending_payment', null, [freeHeldPass]).json,
      ),
    ready: async (page) => {
      await page.getByRole('button', { name: 'Continuar al cobro' }).click();
      await page.getByRole('textbox', { name: 'Motivo' }).waitFor();
    },
  },
  {
    // The confirmed step with its folio.
    name: 'Nueva inscripción confirmada',
    path: salePath(registrationId),
    mock: async (page) => {
      await mockSweepSale()(page);
      await overrideRoute(page, '/cash-confirmation', cashConfirmed(registrationId, 'EB-7K3Q'));
    },
    ready: async (page) => {
      await page.getByRole('button', { name: 'Continuar al cobro' }).click();
      await page.getByRole('textbox', { name: 'Número de recibo' }).fill('08590');
      await page.getByRole('button', { name: 'Confirmar inscripción' }).click();
      await page.getByRole('heading', { name: 'Inscripción confirmada' }).waitFor();
    },
  },
  {
    name: 'Inscripción confirmada',
    path: registrationPath(registrationId),
    mock: (page) =>
      overrideRoute(page, '/entitlements', sweepEntitlements('confirmed', 'EB-7K3Q').json),
    ready: (page) => page.getByRole('region', { name: 'Resumen' }).waitFor(),
  },
  {
    // The competition editor of a confirmed registration (#170), open with its reason field.
    name: 'Inscripción confirmada editando competencias',
    path: registrationPath(registrationId),
    mock: async (page) => {
      const activity = catalogActivity(
        'b1b2c3d4-1234-4567-89ab-123456789abc',
        'Competencia con un nombre largo para pantallas angostas',
        '2026-11-14T16:00:00Z',
      );
      await overrideRoute(page, '/entitlements', sweepEntitlements('confirmed', 'EB-7K3Q').json);
      await overrideRoute(page, '/pass-types', [
        catalogPassType(heldPass.passTypeId, heldPass.name, 'full', heldPass.priceCents, {
          activities: [{ activityId: activity.id, access: 'selectable' }],
        }),
      ]);
      await overrideRoute(page, '/activities', [activity]);
    },
    ready: async (page) => {
      await page.getByRole('button', { name: /^Editar competencias de/ }).click();
      await page.getByRole('textbox', { name: 'Motivo' }).waitFor();
    },
  },
  {
    // The void dialog of a pending in-person registration (#104), open with its reason field.
    name: 'Inscripción pendiente anulando',
    path: registrationPath(registrationId),
    mock: (page) =>
      overrideRoute(page, '/entitlements', sweepEntitlements('pending_payment', null).json),
    ready: async (page) => {
      await page.getByRole('button', { name: 'Anular inscripción' }).click();
      await page.getByRole('alertdialog').getByRole('textbox', { name: 'Motivo' }).waitFor();
    },
  },
  {
    // The name and AKA correction modal of a confirmed registration (#104, #345), with its reason.
    name: 'Inscripción confirmada corrigiendo nombre',
    path: registrationPath(registrationId),
    mock: (page) =>
      overrideRoute(page, '/entitlements', sweepEntitlements('confirmed', 'EB-7K3Q').json),
    ready: async (page) => {
      await page.getByRole('button', { name: 'Corregir nombre o AKA' }).click();
      await page.getByRole('textbox', { name: 'Motivo' }).waitFor();
    },
  },
  {
    // The discipline swap of a confirmed registration (#104), open with a target and its reason.
    name: 'Inscripción confirmada cambiando disciplina',
    path: registrationPath(registrationId),
    mock: async (page) => {
      const activity = catalogActivity(
        'b1b2c3d4-1234-4567-89ab-123456789abc',
        'Competencia con un nombre largo para pantallas angostas',
        '2026-11-14T16:00:00Z',
      );
      await overrideRoute(page, '/entitlements', sweepEntitlements('confirmed', 'EB-7K3Q').json);
      await overrideRoute(page, '/pass-types', [
        catalogPassType(heldPass.passTypeId, heldPass.name, 'full', heldPass.priceCents),
        catalogPassType(
          'f3b2c3d4-1234-4567-89ab-123456789abc',
          'Pase completo de una disciplina con nombre largo',
          'full',
          heldPass.priceCents,
          { activities: [{ activityId: activity.id, access: 'selectable' }] },
        ),
      ]);
      await overrideRoute(page, '/activities', [activity]);
    },
    ready: async (page) => {
      await page.getByRole('button', { name: 'Cambiar disciplina' }).click();
      await page.getByRole('radio', { name: /^Pase completo de una disciplina/ }).check();
      await page.getByRole('checkbox', { name: /^Competencia con un nombre largo/ }).waitFor();
    },
  },
  {
    // The cash correction modal of a confirmed cash registration (#104, #345), with an amount that
    // differs from the pass total, so its hint and the card's notice show too.
    name: 'Inscripción confirmada corrigiendo pago en efectivo',
    path: registrationPath(registrationId),
    mock: (page) =>
      overrideRoute(
        page,
        '/entitlements',
        sweepEntitlements('confirmed', 'EB-7K3Q', [heldPass], {
          amountCents: 120000,
          receipt: 'RECIBO-0000000000000000000000000000000000000000001',
        }).json,
      ),
    ready: async (page) => {
      await page.getByRole('button', { name: 'Corregir pago' }).click();
      await page.getByRole('checkbox', { name: 'Revisé el recibo en papel' }).waitFor();
      await page.getByText(/^No coincide con el total de los pases/).waitFor();
    },
  },
  {
    name: 'Inscripción anulada',
    path: registrationPath(registrationId),
    mock: (page) => overrideRoute(page, '/entitlements', sweepEntitlements('voided', null).json),
    ready: (page) => page.getByText('Inscripción anulada', { exact: true }).waitFor(),
  },
  {
    name: 'Inscripciones con venta pendiente',
    path: `${registrationsPath}?q=Persona`,
    mock: (page) =>
      overrideRoute(
        page,
        '/participants',
        searchPage([
          searchResult(registrationId, 'Persona con un nombre muy largo para pantallas angostas', {
            stageName: 'Flash',
          }),
        ]),
      ),
    ready: (page) =>
      page
        .getByRole('link', { name: /^Persona con un nombre muy largo.*Pendiente de pago/ })
        .waitFor(),
  },
];
