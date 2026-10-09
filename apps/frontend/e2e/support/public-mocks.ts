import type { BrowserContext, Page, Request } from '@playwright/test';

// Mocked public API (`GET /public/events/:slug/catalog`) for the public purchase specs. The
// catalog follows the November seed: four full passes with competitions to pick, general entry
// and the Open Styles add-on that needs a full pass.
export const slug = 'los-mas-pesados-nov-2026';
export const eventName = 'Los más pesados - Preliminares - Noviembre 2026';
export const draftKey = `nb-purchase-draft:${slug}`;

const competition = (id: string, name: string, startsAt: string) => ({
  id,
  name,
  kind: 'competition',
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
});

const fullPass = (id: string, discipline: string, competitions: string[]) => ({
  id,
  name: `Pase completo ${discipline}`,
  passClass: 'full',
  priceCents: 200000,
  requiresPassClass: null,
  selectableActivities: competitions.map((name, index) =>
    competition(`${id}-${index}`, name, `2026-11-21T${16 + index}:00:00.000Z`),
  ),
  includedActivities: [],
});

const passes = [
  fullPass('breaking', 'Breaking', ['Breaking Bboy', 'Breaking Bgirl', 'Breaking 3v3']),
  fullPass('dancehall', 'Dancehall', ['Dancehall batallas mixtas']),
  {
    id: 'general',
    name: 'Entrada general',
    passClass: 'general',
    priceCents: 100000,
    requiresPassClass: null,
    selectableActivities: [],
    includedActivities: [],
  },
  {
    id: 'open-styles',
    name: 'Open Styles',
    passClass: 'add_on',
    priceCents: 80000,
    requiresPassClass: 'full',
    selectableActivities: [],
    includedActivities: [competition('open-1v1', 'Open Styles 1vs1', '2026-11-23T01:00:00.000Z')],
  },
];

const event = {
  slug,
  name: eventName,
  timeZone: 'America/Mexico_City',
  startsAt: '2026-11-21T15:00:00.000Z',
  endsAt: '2026-11-23T04:00:00.000Z',
};

export const openCatalog = {
  event,
  sales: { state: 'open', reason: null, opensAt: null, closesAt: null },
  passes,
};

export const closedCatalog = (reason: 'disabled' | 'not_yet_open' | 'ended', opensAt?: string) => ({
  event,
  sales: { state: 'closed', reason, opensAt: opensAt ?? null, closesAt: null },
  passes: [],
});

type CatalogReply = { status: number; json: unknown };

const catalogEndpoint = (url: URL) =>
  url.port === '3000' && /^\/public\/events\/[^/]+\/catalog$/.test(url.pathname);

/**
 * Answers every catalog request with the current reply and records the requests, so specs can
 * check their headers. `answer` swaps the reply (the dev server's StrictMode may ask twice).
 */
export async function mockPublicCatalog(page: Page, reply: CatalogReply) {
  const requests: Request[] = [];
  let current = reply;
  await page.route(catalogEndpoint, (route) => {
    requests.push(route.request());
    return route.fulfill(current);
  });
  return {
    requests,
    answer: (next: CatalogReply) => {
      current = next;
    },
  };
}

export const catalogReply = (json: unknown = openCatalog): CatalogReply => ({ status: 200, json });

// An admin session cookie on the API host: public requests must still go out without it.
export async function addApiSessionCookie(context: BrowserContext) {
  await context.addCookies([
    { name: 'nb_session', value: 'admin-session', domain: 'localhost', path: '/' },
  ]);
}

type RegistrationReply = { status: number; json?: unknown } | 'network-error';

const registrationEndpoint = (url: URL) =>
  url.port === '3000' && /^\/public\/events\/[^/]+\/registrations$/.test(url.pathname);

/**
 * Answers `POST /public/events/:slug/registrations` with the current reply (or a dropped
 * connection) and records the requests, so specs can check the body and headers. `answer`
 * swaps the reply; `hold` keeps the next answers pending until `release`.
 */
export async function mockRegistration(page: Page, reply: RegistrationReply) {
  const requests: Request[] = [];
  let current = reply;
  let gate: Promise<void> | null = null;
  let open = () => {};
  await page.route(registrationEndpoint, async (route) => {
    requests.push(route.request());
    if (gate) await gate;
    if (current === 'network-error') return route.abort('failed');
    return route.fulfill(current);
  });
  return {
    requests,
    answer: (next: RegistrationReply) => {
      current = next;
    },
    hold: () => {
      gate = new Promise((resolve) => {
        open = resolve;
      });
    },
    release: () => {
      gate = null;
      open();
    },
  };
}

// The 201 for Pase completo Breaking (Bboy and 3v3 picked) plus Open Styles.
export const reservedRegistration = {
  registrationId: '6b0f0b5e-6d1f-4f8f-9a55-0f1c2b3d4e5f',
  status: 'pending_payment',
  passes: [
    {
      passTypeId: 'breaking',
      name: 'Pase completo Breaking',
      passClass: 'full',
      priceCents: 200000,
      selectedActivityIds: ['breaking-0', 'breaking-2'],
    },
    {
      passTypeId: 'open-styles',
      name: 'Open Styles',
      passClass: 'add_on',
      priceCents: 80000,
      selectedActivityIds: [],
    },
  ],
  totalCents: 280000,
};

export const registrationReply = (json: unknown = reservedRegistration) => ({ status: 201, json });
