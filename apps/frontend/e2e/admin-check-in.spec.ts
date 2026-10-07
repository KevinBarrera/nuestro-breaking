import { expect, test } from '@playwright/test';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const otherEvent = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const registrationId = 'c1b2c3d4-1234-4567-89ab-123456789abc';
const activityId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const path = `/admin/events/${eventId}/check-in`;
const api = (url: URL) => url.port === '3000';
const participant = (checkedInAt: string | null = null) => ({
  participant: { id: 'person', fullName: 'Luz Rivera', email: 'luz@example.org', stageName: 'Luz' },
  registration: { id: registrationId, eventId, folio: 'NB-42', status: 'confirmed', checkedInAt },
  activities: [
    { id: activityId, name: 'Batalla', kind: 'battle', checkedInAt: null },
    { id: 'other', name: 'Fiesta', kind: 'social', checkedInAt: null },
  ],
});
const results = (rows = [participant()]) => ({
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

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        headers: { 'X-CSRF-Token': 'safe-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
        json: { user: { id: 'admin', roles: ['admin'] } },
      }),
  );
});

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

test('searches within event, selects confirmation and orders event then eligible activity admission', async ({
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
      if (posts.length === 1) current = participant('2026-11-14T09:00:00Z');
      else
        current = {
          ...current,
          activities: current.activities.map((a) =>
            a.id === activityId ? { ...a, checkedInAt: '2026-11-14T09:30:00Z' } : a,
          ),
        };
      return route.fulfill({
        json: {
          id: 'fact',
          eventId,
          registrationId,
          ...(posts.length === 2 ? { activityId } : {}),
          checkedInAt: '2026-11-14T09:00:00Z',
        },
      });
    },
  );
  await search(page);
  await expect(page.getByText('NB-42')).toBeVisible();
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await expect(page.getByText('Inscripción confirmada')).toBeVisible();
  await expect(page.getByText('Fiesta')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registrar Batalla' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
  await expect(page.getByText('Entrada al evento registrada')).toBeVisible();
  await expect(page.getByText('Actividad pendiente')).toBeVisible();
  await page.getByRole('button', { name: 'Registrar Batalla' }).click();
  await expect(page.getByText('Entrada a Batalla registrada')).toBeVisible();
  expect(posts).toEqual([
    `/admin/events/${eventId}/registrations/${registrationId}/check-in`,
    `/admin/events/${eventId}/registrations/${registrationId}/activities/${activityId}/check-in`,
  ]);
});

test('does not announce success before POST; duplicate refreshes attendance without new success', async ({
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
      current = participant('2026-11-14T09:00:00Z');
      await route.fulfill({ status: 409, json: { message: 'private conflict detail' } });
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
  await expect(page.getByRole('button', { name: 'Registrando…' })).toBeDisabled();
  await expect(page.getByText('Entrada al evento registrada')).toHaveCount(0);
  release();
  await expect(page.getByText('Ya registrada por otro operador')).toBeVisible();
  await expect(page.getByText('Entrada al evento registrada')).toHaveCount(0);
  await expect(page.getByText('private conflict detail')).toHaveCount(0);
  expect(postCount).toBe(1);
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
        status: 200,
        json: { id: 'fact', eventId, registrationId, checkedInAt: '2026-11-14T09:00:00Z' },
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
  await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
  await expect(page.getByRole('alert').last()).toContainText('No se pudo verificar el estado');
  await expect(page.getByText('Entrada al evento registrada')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'Inicio' })).toBeVisible();
});

test('pending registration and excluded activities cannot be admitted', async ({ page }) => {
  let posts = 0;
  await page.route(
    (url) => api(url) && url.pathname.includes('/participants'),
    (route) =>
      route.fulfill({
        json: results([
          {
            ...participant('2026-11-14T09:00:00Z'),
            registration: { ...participant().registration, status: 'pending' },
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
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await expect(page.getByText('Inscripción no confirmada · No registrar entrada')).toBeVisible();
  await expect(page.getByText('Fiesta')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Registrar (entrada|Batalla)/ })).toHaveCount(0);
  expect(posts).toBe(0);
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
  await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
  await expect(page.getByRole('alert')).toContainText('Acceso denegado');
  await expect(page.getByText('Entrada al evento registrada')).toHaveCount(0);
  await expect(page.getByText('private denial')).toHaveCount(0);
  expect(posts).toBe(1);

  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
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
      current = participant('2026-11-14T09:00:00Z');
      return route.fulfill({ status: 500, json: { message: 'private failure' } });
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo registrar la entrada');
  await expect(page.getByText('Entrada al evento registrada')).toHaveCount(0);
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
      await route
        .fulfill({ json: { eventId, registrationId, checkedInAt: '2026-11-14T09:00:00Z' } })
        .catch(() => {});
    },
  );
  await search(page);
  await page.getByRole('button', { name: /Luz Rivera/ }).click();
  await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
  await started;
  await page.evaluate(
    `history.pushState({}, '', '/admin/events/${otherEvent}/check-in'); dispatchEvent(new PopStateEvent('popstate'))`,
  );
  release();
  await expect(page.getByText(`Administración · Evento ${otherEvent}`)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar inscripción' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Buscar inscripción' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Buscar' })).toBeEnabled();
  await expect(page.getByText('Luz Rivera')).toHaveCount(0);
  await expect(page.getByText('Entrada al evento registrada')).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: 'Registrar entrada al evento' })).toBeVisible();
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    375,
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación administrativa' })
      .getByRole('link', { name: 'Resumen' }),
  ).toBeVisible();
});
