import { expect, test } from '@playwright/test';
import { eventSummary } from './support/event-mocks.ts';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const otherEvent = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const registrationId = 'c1b2c3d4-1234-4567-89ab-123456789abc';
const activityId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const workshopId = 'd0b2c3d4-1234-4567-89ab-123456789abc';
const path = `/admin/events/${eventId}/check-in`;
const api = (url: URL) => url.port === '3000';
const escalation =
  'Envía a la persona a coordinación general. En la entrada no se hacen cambios de inscripción ni de competencias.';
type Activity = { id: string; name: string; kind: string; checkedInAt: string | null };
// The backend lists activities by id; the screen shows them by name.
const passActivities = (): Activity[] => [
  { id: workshopId, name: 'Taller de footwork', kind: 'workshop', checkedInAt: null },
  { id: activityId, name: 'Batalla', kind: 'competition', checkedInAt: null },
  { id: 'other', name: 'Fiesta', kind: 'social', checkedInAt: null },
];
const participant = ({
  checkedInAt = null as string | null,
  status = 'confirmed',
  generalEntryOnly = false,
  activities = passActivities(),
} = {}) => ({
  participant: { id: 'person', fullName: 'Luz Rivera', email: 'luz@example.org', stageName: 'Luz' },
  registration: {
    id: registrationId,
    eventId,
    folio: 'NB-42',
    status,
    checkedInAt,
    generalEntryOnly,
  },
  activities,
});
const generalOnly = (checkedInAt: string | null = null) =>
  participant({ checkedInAt, generalEntryOnly: true, activities: [] });
const withActivityCheckIn = (checkedInAt: string) => ({
  ...participant({ checkedInAt }),
  activities: passActivities().map((a) => (a.id === activityId ? { ...a, checkedInAt } : a)),
});
const fact = (
  checkedInAt: string,
  alreadyCheckedIn = false,
  activity: string | null = activityId,
) => ({
  id: 'fact',
  eventId,
  registrationId,
  ...(activity ? { activityId: activity } : {}),
  checkedInAt,
  alreadyCheckedIn,
});
const events = [
  eventSummary(eventId, 'Encuentro del barrio'),
  eventSummary(otherEvent, 'Batalla de otoño'),
];
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const results = (rows: unknown[] = [participant()]) => ({
  total: rows.length,
  limit: 20,
  offset: 0,
  results: rows,
});

async function search(page: import('@playwright/test').Page) {
  await page.goto(path);
  await page.getByRole('textbox', { name: 'Buscar inscripción' }).fill('Luz');
  await page.getByRole('button', { name: 'Buscar' }).click();
}

// Check-in times are shown in the browser zone; pin it so the clock times are stable.
test.use({ timezoneId: 'America/Mexico_City' });

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        headers: { 'X-CSRF-Token': 'safe-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
        json: { user: { id: 'admin', roles: ['admin'] } },
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: events }),
  );
});

test('names the event instead of showing its UUID', async ({ page }) => {
  await page.goto(path);
  const main = page.getByRole('main');
  await expect(main.getByText('Administración · Encuentro del barrio')).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Control de entrada' })).toBeVisible();
  expect(await main.innerText()).not.toMatch(uuidPattern);
});

for (const [name, respond] of [
  ['the event list fails', { status: 500, json: { message: 'error' } }],
  ['the event is not in the list', { json: [events[1]] }],
] as const) {
  test(`shows only "Administración" without a UUID when ${name}`, async ({ page }) => {
    // The admin shell's event selector requests the same list, so a served-request flag can
    // flip before the page handled its own response. The eyebrow's settled state is set only by
    // the check-in page after its own lookup finished, so wait for it before the negatives.
    let served = 0;
    await page.route(
      (url) => api(url) && url.pathname === '/admin/events',
      (route) => {
        served++;
        return route.fulfill(respond);
      },
    );
    await page.goto(path);
    const main = page.getByRole('main');
    const eyebrow = main.locator('[data-event-name-state]');
    await expect(eyebrow).toHaveAttribute('data-event-name-state', 'unavailable');
    expect(served).toBeGreaterThanOrEqual(1);
    await expect(eyebrow).toHaveText('Administración');
    await expect(main.getByText(/Administración ·/)).toHaveCount(0);
    expect(await main.innerText()).not.toMatch(uuidPattern);
    // Stays settled: no late response replaces the fallback.
    await page.waitForLoadState('networkidle');
    await expect(eyebrow).toHaveAttribute('data-event-name-state', 'unavailable');
    await expect(eyebrow).toHaveText('Administración');
    expect(await main.innerText()).not.toMatch(uuidPattern);
  });
}

test('requires session and never requests protected search when signed out', async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ status: 401, json: {} }),
  );
  let requests = 0;
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => {
      requests++;
      return route.fulfill({ json: results() });
    },
  );
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(requests).toBe(0);
});

test('one action checks in an activity without a prior event check-in, sorted by name', async ({
  page,
}) => {
  let current = participant();
  const posts: string[] = [];
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => {
      expect(new URL(route.request().url()).pathname).toBe(`/admin/events/${eventId}/participants`);
      expect(new URL(route.request().url()).searchParams.get('q')).toBe('Luz');
      return route.fulfill({ json: results([current]) });
    },
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts.push(new URL(route.request().url()).pathname);
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      expect(route.request().method()).toBe('POST');
      // The backend records the event fact with the first activity check-in.
      current = withActivityCheckIn('2026-11-14T15:30:00Z');
      return route.fulfill({ status: 201, json: fact('2026-11-14T15:30:00Z') });
    },
  );
  await search(page);
  await expect(page.getByText('NB-42')).toBeVisible();
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  const selected = page.getByRole('region', { name: 'Inscripción seleccionada' });
  await expect(selected.getByText('Inscripción confirmada')).toBeVisible();
  await expect(selected.getByRole('heading', { level: 4 })).toHaveText([
    'Batalla',
    'Taller de footwork',
  ]);
  await expect(selected.getByText('Fiesta')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registrar entrada al evento' })).toHaveCount(0);
  await expect(page.getByText(escalation)).toHaveCount(0);
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(page.getByRole('status')).toHaveText('Entrada a Batalla registrada');
  await expect(selected.getByText('Entrada registrada a las 09:30')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar entrada a Batalla' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Registrar entrada a Taller de footwork' }),
  ).toBeVisible();
  expect(posts).toEqual([
    `/admin/events/${eventId}/registrations/${registrationId}/activities/${activityId}/check-in`,
  ]);
});

test('general-entry-only registration gets only the event action', async ({ page }) => {
  let current = generalOnly();
  const posts: string[] = [];
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ json: results([current]) }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts.push(new URL(route.request().url()).pathname);
      current = generalOnly('2026-11-14T15:00:00Z');
      return route.fulfill({ status: 201, json: fact('2026-11-14T15:00:00Z', false, null) });
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await expect(page.getByRole('button', { name: /Registrar entrada a / })).toHaveCount(0);
  await expect(page.getByText(escalation)).toHaveCount(0);
  await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
  await expect(page.getByRole('status')).toHaveText('Entrada al evento registrada');
  await expect(page.getByText('Entrada registrada a las 09:00')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar entrada al evento' })).toHaveCount(0);
  expect(posts).toEqual([`/admin/events/${eventId}/registrations/${registrationId}/check-in`]);
});

test('does not announce before POST; a repeat shows the already-registered state', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let current = participant();
  let postCount = 0;
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ json: results([current]) }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    async (route) => {
      postCount++;
      await held;
      // Another operator checked the person in first: the answer is the original fact.
      current = withActivityCheckIn('2026-11-14T15:05:00Z');
      await route.fulfill({ status: 201, json: fact('2026-11-14T15:05:00Z', true) });
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(page.getByRole('button', { name: 'Registrando…' }).first()).toBeDisabled();
  await expect(page.getByText('Entrada a Batalla registrada')).toHaveCount(0);
  release();
  await expect(page.getByRole('status')).toHaveText(
    'Esta entrada ya estaba registrada a las 09:05.',
  );
  await expect(page.getByText('Entrada registrada a las 09:05')).toBeVisible();
  await expect(page.getByText('Entrada a Batalla registrada')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(postCount).toBe(1);
});

test('a registration already checked in shows its time and no action', async ({ page }) => {
  let posts = 0;
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ json: results([withActivityCheckIn('2026-11-14T15:30:00Z')]) }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts++;
      return route.fulfill({ status: 201, json: {} });
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await expect(page.getByText('Entrada registrada a las 09:30')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar entrada a Batalla' })).toHaveCount(0);
  expect(posts).toBe(0);
});

test('wrong event and denial never expose or submit a registration', async ({ page }) => {
  let posts = 0;
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) =>
      route.fulfill({
        json: results([
          {
            ...participant(),
            registration: { ...participant().registration, eventId: otherEvent },
          },
        ]),
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts++;
      return route.fulfill({ json: {} });
    },
  );
  await search(page);
  await expect(page.getByRole('alert')).toContainText('No se pudo verificar');
  await expect(page.getByText('Luz Rivera')).toHaveCount(0);
  expect(posts).toBe(0);
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ status: 403, json: { message: 'private' } }),
  );
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('alert')).toContainText('Acceso denegado');
  await expect(page.getByText('private')).toHaveCount(0);
});

test('loading, empty and refresh failure offer safe handoff', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    async (route) => {
      reads++;
      if (reads === 1) {
        await held;
        return route.fulfill({ json: results([]) });
      }
      if (reads === 2) return route.fulfill({ json: results() });
      return route.fulfill({ status: 500, json: { message: 'private' } });
    },
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) =>
      route.fulfill({
        status: 201,
        json: fact('2026-11-14T15:30:00Z'),
      }),
  );
  await page.goto(path);
  await page.getByRole('textbox', { name: 'Buscar inscripción' }).fill('Luz');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Buscando inscripciones…')).toBeVisible();
  release();
  await expect(page.getByText('No se encontraron inscripciones.')).toBeVisible();
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(page.getByRole('alert').last()).toContainText('No se pudo verificar el estado');
  await expect(page.getByText('Entrada a Batalla registrada')).toHaveCount(0);
  const overview = page.getByRole('main').getByRole('link', { name: 'resumen del evento' });
  await expect(overview).toHaveAttribute('href', `/admin/events/${eventId}`);
  await expect(page.getByRole('main')).toContainText(
    'Consulta al responsable o vuelve al resumen del evento.',
  );
  await expect(page.getByRole('main').getByRole('link', { name: 'Inicio' })).toHaveCount(0);
});

test('unconfirmed registrations and registrations without access go to coordination', async ({
  page,
}) => {
  let posts = 0;
  let current = participant({ checkedInAt: '2026-11-14T15:00:00Z', status: 'pending' });
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ json: results([current]) }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts++;
      return route.fulfill({ json: {} });
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await expect(page.getByText('Inscripción no confirmada · No registrar entrada')).toBeVisible();
  await expect(page.getByText(escalation)).toBeVisible();
  await expect(page.getByText('Fiesta')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Registrar entrada/ })).toHaveCount(0);

  // Confirmed, but no general-only pass and no activity to check in.
  current = participant({ activities: [passActivities()[2]] });
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await expect(page.getByText('Inscripción confirmada')).toBeVisible();
  await expect(page.getByText(escalation)).toBeVisible();
  await expect(page.getByRole('button', { name: /Registrar entrada/ })).toHaveCount(0);
  expect(posts).toBe(0);
});

test('a check-in the backend rejects sends the person to coordination', async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ json: results() }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => route.fulfill({ status: 400, json: { message: 'private rule detail' } }),
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(page.getByRole('alert')).toHaveText(escalation);
  await expect(page.getByText('Entrada a Batalla registrada')).toHaveCount(0);
  await expect(page.getByText('private rule detail')).toHaveCount(0);
});

test('POST denial and missing CSRF token never announce admission', async ({ page }) => {
  let posts = 0;
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ json: results() }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts++;
      return route.fulfill({ status: 403, json: { message: 'private denial' } });
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(page.getByRole('alert')).toContainText('Acceso denegado');
  await expect(page.getByText('Entrada a Batalla registrada')).toHaveCount(0);
  await expect(page.getByText('private denial')).toHaveCount(0);
  expect(posts).toBe(1);

  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(page.getByRole('alert').last()).toContainText('No se pudo verificar');
  expect(posts).toBe(1);
});

test('POST 500 with a refreshed attendance fact cannot claim a new success', async ({ page }) => {
  let current = participant();
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ json: results([current]) }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      current = withActivityCheckIn('2026-11-14T15:30:00Z');
      return route.fulfill({ status: 500, json: { message: 'private failure' } });
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo registrar la entrada');
  await expect(page.getByText('Entrada a Batalla registrada')).toHaveCount(0);
  await expect(page.getByText('private failure')).toHaveCount(0);
});

test('switching events during an in-flight POST clears old data, notice, search and busy state', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let postStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    postStarted = resolve;
  });
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.includes(otherEvent)
          ? results([])
          : results(),
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    async (route) => {
      postStarted();
      await held;
      await route.fulfill({ status: 201, json: fact('2026-11-14T15:30:00Z') }).catch(() => {});
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await started;
  await page.evaluate(
    `history.pushState({}, '', '/admin/events/${otherEvent}/check-in'); dispatchEvent(new PopStateEvent('popstate'))`,
  );
  release();
  await expect(page.getByText('Administración · Batalla de otoño')).toBeVisible();
  expect(await page.getByRole('main').innerText()).not.toMatch(uuidPattern);
  await expect(page.getByRole('textbox', { name: 'Buscar inscripción' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Buscar inscripción' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Buscar' })).toBeEnabled();
  await expect(page.getByText('Luz Rivera')).toHaveCount(0);
  await expect(page.getByText('Entrada a Batalla registrada')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Buscar inscripción' }).fill('Luz');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('No se encontraron inscripciones.')).toBeVisible();
});

test('mobile operator can search and hand off without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) => route.fulfill({ json: results() }),
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  const admit = page.getByRole('button', { name: 'Registrar entrada a Batalla' });
  await expect(admit).toBeVisible();
  // The standard primary button: full width of its activity card on phones, with the usual size.
  await expect(admit).toHaveCSS('font-size', '14px');
  const box = (await admit.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeLessThan(56);
  expect(box.width).toBeGreaterThan(250);
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    375,
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación administrativa' })
      .getByRole('link', { name: 'Resumen' }),
  ).toBeVisible();
});
