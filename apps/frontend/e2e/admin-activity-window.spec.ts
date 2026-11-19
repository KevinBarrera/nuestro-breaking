import { expect, test, type Page, type Route } from '@playwright/test';

// The activity form keeps "Empieza" and "Termina" inside a bounded event's dates (#295): "Día"
// offers only the event days, a time outside the event is marked before anything is sent, and a
// server answer that names the failing fields marks them and brings the current event dates.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const activitiesPath = `/admin/events/${eventId}/activities`;
const api = (url: URL) => url.port === '3000';

// Mexico City is UTC-6 in November: Saturday 14 09:00 to Sunday 15 23:00 on the event's clock.
const eventDates = {
  startsAt: '2026-11-14T15:00:00.000Z',
  endsAt: '2026-11-16T05:00:00.000Z',
};

const outsideStart = 'El inicio debe estar dentro de las fechas del evento.';
const outsideEnd = 'El fin debe estar dentro de las fechas del evento.';

function foundation(dates: { startsAt: string | null; endsAt: string | null }) {
  return {
    event: {
      id: eventId,
      name: 'Encuentro del barrio',
      timeZone: 'America/Mexico_City',
      ...dates,
      windowStatus: dates.startsAt ? 'bounded' : 'unbounded',
    },
    venues: [{ id: venueId, name: 'Centro cultural' }],
    activities: [],
    deferredFields: [],
  };
}

async function mockCatalog(
  page: Page,
  event = foundation(eventDates),
  write: (route: Route) => Promise<void> | void = (route) =>
    route.fulfill({ status: 500, json: {} }),
) {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        headers: { 'X-CSRF-Token': 'safe-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
        json: { user: { id: 'admin', roles: ['admin'] } },
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/foundation`,
    (route) => route.fulfill({ json: event }),
  );
  await page.route(
    (url) => api(url) && url.pathname.startsWith(activitiesPath),
    (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [] }) : write(route)),
  );
}

// A valid create answer; its values do not matter to these checks.
const created = {
  id: 'd9b2c3d4-1234-4567-89ab-123456789abc',
  eventId,
  venueId,
  kind: 'social',
  name: 'Cypher',
  startsAt: '2026-11-14T16:00:00.000Z',
  endsAt: '2026-11-14T17:00:00.000Z',
  status: 'active',
  version: 1,
};

async function openNewActivity(page: Page) {
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });
  await dialog.getByLabel('Nombre').fill('Cypher');
  await dialog.getByRole('radio', { name: 'Social' }).check();
  return dialog;
}

const create = (dialog: ReturnType<Page['getByRole']>) =>
  dialog.getByRole('button', { name: 'Crear actividad' }).click();
const startOf = (dialog: ReturnType<Page['getByRole']>) => dialog.getByLabel('Empieza');
const endOf = (dialog: ReturnType<Page['getByRole']>) =>
  dialog.getByLabel('Termina', { exact: true });

test('offers the event days on the event clock for "Día"', async ({ page }) => {
  await mockCatalog(page);
  const dialog = await openNewActivity(page);

  await expect(dialog.getByRole('group', { name: 'Día' }).getByRole('radio')).toHaveCount(2);
  await expect(dialog.getByRole('radio', { name: 'Sábado 14 de noviembre' })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Domingo 15 de noviembre' })).not.toBeChecked();
  await expect(startOf(dialog)).toHaveAttribute('step', '300');
});

test('blocks a start and end outside the event, marks them and sends nothing', async ({ page }) => {
  const writes: unknown[] = [];
  await mockCatalog(page, foundation(eventDates), (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: created });
  });
  const dialog = await openNewActivity(page);

  // Saturday opens at 09:00.
  await startOf(dialog).fill('08:00');
  await endOf(dialog).fill('10:00');
  await create(dialog);
  await expect(startOf(dialog)).toHaveAttribute('aria-invalid', 'true');
  await expect(startOf(dialog)).toHaveAccessibleDescription(new RegExp(outsideStart));
  await expect(startOf(dialog)).toBeFocused();
  expect(writes).toEqual([]);

  // Sunday closes at 23:00.
  await dialog.getByRole('radio', { name: /Domingo/ }).check();
  await startOf(dialog).fill('22:30');
  await endOf(dialog).fill('23:30');
  await create(dialog);
  await expect(endOf(dialog)).toHaveAttribute('aria-invalid', 'true');
  await expect(endOf(dialog)).toHaveAccessibleDescription(new RegExp(outsideEnd));
  await expect(endOf(dialog)).toBeFocused();
  await expect(startOf(dialog)).not.toHaveAttribute('aria-invalid');
  expect(writes).toEqual([]);

  // Editing a time clears the mark.
  await endOf(dialog).fill('23:00');
  await expect(endOf(dialog)).not.toHaveAttribute('aria-invalid');
  await create(dialog);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toHaveLength(1);
});

test('a server answer naming the fields marks them and updates the event dates', async ({
  page,
}) => {
  const bodies: unknown[] = [];
  // The event was shortened to Saturday 14 while the form was open.
  const shorter = { startsAt: '2026-11-14T15:00:00.000Z', endsAt: '2026-11-15T05:00:00.000Z' };
  await mockCatalog(page, foundation(eventDates), (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({
      status: 400,
      json: {
        statusCode: 400,
        message: 'Invalid activity window',
        fieldErrors: { startsAt: 'outside_event_window', endsAt: 'outside_event_window' },
        eventWindow: shorter,
      },
    });
  });
  const dialog = await openNewActivity(page);
  await dialog.getByRole('radio', { name: /Domingo/ }).check();
  await startOf(dialog).fill('12:00');
  await endOf(dialog).fill('13:00');
  await create(dialog);

  await expect(startOf(dialog)).toHaveAttribute('aria-invalid', 'true');
  await expect(startOf(dialog)).toHaveAccessibleDescription(new RegExp(outsideStart));
  await expect(endOf(dialog)).toHaveAttribute('aria-invalid', 'true');
  await expect(startOf(dialog)).toBeFocused();
  // "Día" now offers Saturday only.
  await expect(dialog.getByRole('group', { name: 'Día' }).getByRole('radio')).toHaveCount(1);
  expect(bodies).toHaveLength(1);

  // The new dates apply at once: the same wrong day is now caught without another request.
  await create(dialog);
  await expect(startOf(dialog)).toHaveAttribute('aria-invalid', 'true');
  expect(bodies).toHaveLength(1);
});

test('an unbounded event asks for a date', async ({ page }) => {
  const bodies: unknown[] = [];
  await mockCatalog(page, foundation({ startsAt: null, endsAt: null }), (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: created });
  });
  const dialog = await openNewActivity(page);

  await expect(dialog.getByRole('radio', { name: /Sábado/ })).toHaveCount(0);
  await dialog.getByLabel('Día', { exact: true }).fill('2031-01-02');
  await startOf(dialog).fill('20:00');
  await endOf(dialog).fill('19:00');
  await expect(dialog.getByRole('alert')).toHaveText('La hora de fin debe ser después del inicio.');
  await endOf(dialog).fill('21:00');
  await create(dialog);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(bodies).toEqual([
    {
      name: 'Cypher',
      kind: 'social',
      venueId,
      startsAt: '2031-01-03T02:00:00.000Z',
      endsAt: '2031-01-03T03:00:00.000Z',
    },
  ]);
});
