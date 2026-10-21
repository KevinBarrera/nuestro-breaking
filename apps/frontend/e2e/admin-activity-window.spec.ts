import { expect, test, type Page, type Route } from '@playwright/test';
import { chooseOption, selectTrigger } from './support/select.ts';

// The activity form keeps "Inicio" and "Fin" inside a bounded event's dates (#295): the pickers
// are limited, a wrong field is marked before anything is sent, and a server answer that names
// the failing fields marks them and brings the current event dates.
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
const notAfterStart = 'El fin debe ser posterior al inicio.';

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

async function openNewActivity(page: Page) {
  await page.goto(activitiesPath);
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva actividad' });
  await dialog.getByLabel('Nombre').fill('Cypher');
  await chooseOption(selectTrigger(dialog, 'Tipo'), 'Social');
  return dialog;
}

const save = (dialog: ReturnType<Page['getByRole']>) =>
  dialog.getByRole('button', { name: 'Guardar', exact: true }).click();

test('limits the pickers to the event dates and says them under the fields', async ({ page }) => {
  await mockCatalog(page);
  const dialog = await openNewActivity(page);
  const start = dialog.getByLabel('Inicio');
  const end = dialog.getByLabel('Fin');

  await expect(start).toHaveAttribute('min', '2026-11-14T09:00');
  await expect(start).toHaveAttribute('max', '2026-11-15T23:00');
  await expect(end).toHaveAttribute('min', '2026-11-14T09:00');
  await expect(end).toHaveAttribute('max', '2026-11-15T23:00');
  await expect(dialog.getByText('El evento va del 14 al 15 de noviembre de 2026.')).toBeVisible();

  await start.fill('2026-11-14T12:30');
  await expect(end).toHaveAttribute('min', '2026-11-14T12:30');
});

test('blocks a start and end outside the event, marks them and sends nothing', async ({ page }) => {
  const writes: string[] = [];
  await mockCatalog(page, foundation(eventDates), (route) => {
    writes.push(route.request().method());
    return route.fulfill({ status: 500, json: {} });
  });
  const dialog = await openNewActivity(page);
  const start = dialog.getByLabel('Inicio');
  const end = dialog.getByLabel('Fin');

  await start.fill('2026-11-14T08:00');
  await end.fill('2026-11-16T01:00');
  await save(dialog);

  await expect(start).toHaveAttribute('aria-invalid', 'true');
  await expect(start).toHaveAccessibleDescription(new RegExp(outsideStart));
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await expect(end).toHaveAccessibleDescription(new RegExp(outsideEnd));
  await expect(start).toBeFocused();
  // "Inicio" has the focus, which recolors its border; "Fin" shows the danger state at rest.
  await expect(end).toHaveCSS('border-top-color', await dangerColor(dialog));
  await expect(page.getByRole('dialog', { name: 'Revisar cambios' })).toHaveCount(0);
  expect(writes).toEqual([]);

  // Fixing the start clears only its own mark; the end stays wrong and takes the focus.
  await start.fill('2026-11-14T10:00');
  await expect(start).not.toHaveAttribute('aria-invalid');
  await expect(dialog.getByText(outsideStart)).toHaveCount(0);
  await save(dialog);
  await expect(end).toBeFocused();
  await expect(start).not.toHaveAttribute('aria-invalid');

  await end.fill('2026-11-14T12:00');
  await save(dialog);
  await expect(page.getByRole('dialog', { name: 'Revisar cambios' })).toBeVisible();
  expect(writes).toEqual([]);
});

// The danger border is a `--nb-*` token, so read it from the page instead of hard-coding a color.
async function dangerColor(dialog: ReturnType<Page['getByRole']>) {
  return dialog.evaluate((node) => {
    const probe = document.createElement('span');
    probe.className = 'border border-danger-fg';
    node.append(probe);
    const color = getComputedStyle(probe).borderTopColor;
    probe.remove();
    return color;
  });
}

test('marks only "Fin" when it is not after "Inicio"', async ({ page }) => {
  await mockCatalog(page);
  const dialog = await openNewActivity(page);
  const start = dialog.getByLabel('Inicio');
  const end = dialog.getByLabel('Fin');

  await start.fill('2026-11-14T12:00');
  await end.fill('2026-11-14T12:00');
  await save(dialog);

  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await expect(end).toHaveAccessibleDescription(new RegExp(notAfterStart));
  await expect(end).toBeFocused();
  await expect(start).not.toHaveAttribute('aria-invalid');
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
        fieldErrors: { endsAt: 'outside_event_window' },
        eventWindow: shorter,
      },
    });
  });
  const dialog = await openNewActivity(page);
  await dialog.getByLabel('Inicio').fill('2026-11-14T20:00');
  await dialog.getByLabel('Fin').fill('2026-11-15T10:00');
  await save(dialog);
  await page
    .getByRole('dialog', { name: 'Revisar cambios' })
    .getByRole('button', { name: 'Guardar cambios' })
    .click();

  const end = dialog.getByLabel('Fin');
  await expect(page.getByRole('dialog', { name: 'Revisar cambios' })).toHaveCount(0);
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await expect(end).toHaveAccessibleDescription(new RegExp(outsideEnd));
  await expect(end).toBeFocused();
  await expect(dialog.getByLabel('Inicio')).not.toHaveAttribute('aria-invalid');
  await expect(end).toHaveAttribute('max', '2026-11-14T23:00');
  await expect(dialog.getByText('El evento es el 14 de noviembre de 2026.')).toBeVisible();
  expect(bodies).toHaveLength(1);

  // The new limits apply at once: the same wrong end is now caught without another request.
  await save(dialog);
  await expect(page.getByRole('dialog', { name: 'Revisar cambios' })).toHaveCount(0);
  expect(bodies).toHaveLength(1);
});

test('an unbounded event offers no limits and no hint', async ({ page }) => {
  await mockCatalog(page, foundation({ startsAt: null, endsAt: null }));
  const dialog = await openNewActivity(page);

  await expect(dialog.getByLabel('Inicio')).not.toHaveAttribute('min');
  await expect(dialog.getByLabel('Fin')).not.toHaveAttribute('max');
  await expect(dialog.getByText(/El evento (va del|es el)/)).toHaveCount(0);

  await dialog.getByLabel('Inicio').fill('2031-01-02T20:00');
  await dialog.getByLabel('Fin').fill('2031-01-02T19:00');
  await save(dialog);
  await expect(dialog.getByLabel('Fin')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Fin')).toHaveAccessibleDescription(new RegExp(notAfterStart));
});
