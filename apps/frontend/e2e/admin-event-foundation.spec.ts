import { expect, test } from '@playwright/test';

const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const foundationPath = `/admin/events/${eventId}/foundation`;
const foundationEndpoint = (url: URL) => url.port === '3000' && url.pathname === foundationPath;

const foundation = {
  event: {
    id: eventId,
    name: 'Encuentro del barrio',
    timeZone: 'Europe/Madrid',
    startsAt: '2026-11-14T09:00:00.000Z',
    endsAt: '2026-11-15T19:00:00.000Z',
    windowStatus: 'bounded',
  },
  venues: [{ id: 'venue-1', name: 'Centro cultural' }],
  activities: [
    {
      id: 'activity-1',
      name: 'Batalla de crews',
      kind: 'battle',
      venueId: 'venue-1',
      startsAt: '2026-11-14T10:00:00.000Z',
      endsAt: '2026-11-14T12:00:00.000Z',
      planningStatus: 'draft',
    },
  ],
  deferredFields: ['priceDisplay', 'capacity', 'registrationRequirements'],
};

test('loads the endpoint-backed foundation for the event in the URL', async ({ page }) => {
  let releaseResponse!: () => void;
  const heldResponse = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let requestedPath: string | undefined;
  await page.route(foundationEndpoint, async (route) => {
    requestedPath = new URL(route.request().url()).pathname;
    await heldResponse;
    await route.fulfill({ json: foundation });
  });

  await page.goto(foundationPath);
  await expect(page.getByText('Cargando datos del evento…')).toBeVisible();
  releaseResponse();

  await expect(page.getByRole('heading', { name: 'Encuentro del barrio' })).toBeVisible();
  expect(requestedPath).toBe(foundationPath);
  await expect(
    page.getByText('Datos del endpoint · No aprueban la propuesta del MVP'),
  ).toBeVisible();
  await expect(page.getByText('Europe/Madrid')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Batalla de crews' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Sedes' }).getByText('Centro cultural'),
  ).toBeVisible();
  await expect(page.getByText('Borrador')).toBeVisible();
});

test('shows an empty activities state for a persisted event', async ({ page }) => {
  await page.route(foundationEndpoint, (route) =>
    route.fulfill({ json: { ...foundation, venues: [], activities: [] } }),
  );

  await page.goto(foundationPath);
  await expect(page.getByRole('heading', { name: 'Encuentro del barrio' })).toBeVisible();
  await expect(page.getByText('Aún no hay actividades para este evento.')).toBeVisible();
});

test('shows a safe failure for missing events and server errors', async ({ page }) => {
  await page.route(foundationEndpoint, (route) =>
    route.fulfill({ status: 404, json: { message: 'Private backend detail' } }),
  );
  await page.goto(foundationPath);
  await expect(page.getByRole('alert')).toContainText(
    'No se pudo cargar la información del evento.',
  );
  await expect(page.getByText('Private backend detail')).toHaveCount(0);

  await page.route(foundationEndpoint, (route) =>
    route.fulfill({ status: 500, json: { message: 'Internal database detail' } }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'No se pudo cargar la información del evento.',
  );
  await expect(page.getByText('Internal database detail')).toHaveCount(0);
});
