import { expect, test, type Page } from '@playwright/test';
import { eventSummary } from './support/event-mocks.ts';
import { chooseOption, selectTrigger } from './support/select.ts';

// Check-in (#126, #336). Roster building, search, counts and row status are covered by
// `check-in-roster-model.test.ts`; these specs check the rendered flow, the dialog, the
// check-in requests and the failure states.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const otherEvent = 'b1b2c3d4-1234-4567-89ab-123456789abc';
const luzId = 'c1b2c3d4-1234-4567-89ab-123456789abc';
const mauId = 'c2b2c3d4-1234-4567-89ab-123456789abc';
const daniId = 'c3b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const workshopId = 'd0b2c3d4-1234-4567-89ab-123456789abc';
const fullPass = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const generalPass = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const path = `/admin/events/${eventId}/check-in`;
const api = (url: URL) => url.port === '3000';
const escalation =
  'Envía a la persona a coordinación general. En la entrada no se hacen cambios de inscripción ni de competencias.';

type Check = { battle?: string | null; workshop?: string | null; event?: string | null };
type Registration = Record<string, unknown>;

const luz = ({ battle = null, workshop = null }: Check = {}): Registration => ({
  registrationId: luzId,
  folio: 'NB-42AB',
  fullName: 'Luz Rivera',
  stageName: 'Luz',
  status: 'confirmed',
  eventCheckedInAt: battle ?? workshop ?? null,
  passTypeIds: [fullPass],
  // Listed in start order; the dialog sorts them by name.
  activities: [
    { activityId: workshopId, checkedInAt: workshop },
    { activityId: battleId, checkedInAt: battle },
  ],
});
const mau = ({ event = null }: Check = {}): Registration => ({
  registrationId: mauId,
  folio: 'NB-7K3Q',
  fullName: 'Mau Aczino',
  stageName: 'Aczino',
  status: 'confirmed',
  eventCheckedInAt: event,
  passTypeIds: [generalPass],
  activities: [],
});
const dani: Registration = {
  registrationId: daniId,
  folio: null,
  fullName: 'Dani Ruiz',
  stageName: 'Dani R',
  status: 'pending_payment',
  eventCheckedInAt: null,
  passTypeIds: [generalPass],
  activities: [],
};
const snapshot = (registrations: Registration[], id = eventId) => ({
  event: { id, name: 'Encuentro del barrio' },
  generatedAt: '2026-11-14T15:00:00.000Z',
  passTypes: [
    { id: fullPass, name: 'Pase completo', passClass: 'full', status: 'active' },
    { id: generalPass, name: 'Entrada general', passClass: 'general', status: 'active' },
  ],
  activities: [
    {
      id: workshopId,
      name: 'Taller de footwork',
      kind: 'workshop',
      startsAt: '2026-11-14T16:00:00Z',
    },
    { id: battleId, name: 'Batalla', kind: 'competition', startsAt: '2026-11-14T18:00:00Z' },
  ],
  registrations,
});
const fact = (
  registrationId: string,
  checkedInAt: string,
  alreadyCheckedIn = false,
  activityId: string | null = battleId,
) => ({
  id: 'fact',
  eventId,
  registrationId,
  ...(activityId ? { activityId } : {}),
  checkedInAt,
  alreadyCheckedIn,
});

// Serves the snapshot the test currently holds, so a check-in can change what the refresh reads.
async function mockRoster(page: Page, read: () => unknown) {
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/attendee-lists'),
    (route) => {
      const answer = read();
      return route.fulfill(
        typeof answer === 'number'
          ? { status: answer, json: { message: 'private' } }
          : { json: answer },
      );
    },
  );
}

const rows = (page: Page) => page.getByRole('list', { name: 'Inscripciones' }).getByRole('button');
const search = (page: Page) => page.getByRole('searchbox', { name: 'Buscar inscripción' });
const openRecord = (page: Page, name: string) => rows(page).filter({ hasText: name }).click();

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
    (route) =>
      route.fulfill({
        json: [
          eventSummary(eventId, 'Encuentro del barrio'),
          eventSummary(otherEvent, 'Batalla de otoño'),
        ],
      }),
  );
});

test('requires a session and never reads the roster when signed out', async ({ page }) => {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ status: 401, json: {} }),
  );
  let reads = 0;
  await mockRoster(page, () => {
    reads++;
    return snapshot([luz()]);
  });
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  expect(reads).toBe(0);
});

test('lists who is still to enter, with status chips, progress and the activity filter', async ({
  page,
}) => {
  await mockRoster(page, () =>
    snapshot([
      luz({ battle: '2026-11-14T15:30:00Z' }),
      mau({ event: '2026-11-14T15:10:00Z' }),
      dani,
    ]),
  );
  await page.goto(path);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Check-in', level: 1 })).toBeVisible();
  await expect(search(page)).toBeFocused();
  await expect(main.getByText('Entradas registradas')).toBeVisible();
  // Pending payments are left out of the progress: Luz has 1 of 2 and Mau 1 of 1.
  await expect(main.getByText('2 de 3')).toBeVisible();

  const chips = main.getByRole('group', { name: 'Filtrar por entrada' });
  await expect(chips.getByRole('button', { pressed: true })).toHaveText('Por entrar2');
  await expect(chips.getByRole('button')).toHaveText(['Por entrar2', 'Ya entraron1', 'Todas3']);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText('Dani RuizDani R');
  await expect(rows(page).nth(0)).toContainText('Pago por revisar');
  await expect(rows(page).nth(1)).toContainText('Luz Rivera');
  await expect(rows(page).nth(1)).toContainText('NB-42AB');
  await expect(rows(page).nth(1)).toContainText('Pase completo');
  await expect(rows(page).nth(1)).toContainText('1 de 2 actividades');

  await chips.getByRole('button', { name: /Ya entraron/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Entró 09:10');
  await expect(main.getByRole('status').filter({ hasText: 'persona' })).toHaveText('1 persona');

  await chooseOption(selectTrigger(page, 'Actividad'), 'Batalla');
  await expect(main.getByText('Entradas a Batalla')).toBeVisible();
  await expect(main.getByText('1 de 1')).toBeVisible();
  await expect(chips.getByRole('button')).toHaveText(['Por entrar0', 'Ya entraron1', 'Todas1']);
  await expect(rows(page).first()).toContainText('Entró 09:30');

  await chips.getByRole('button', { name: /Por entrar/ }).click();
  await expect(main.getByText('Ya entraron todas las personas')).toBeVisible();

  await chooseOption(selectTrigger(page, 'Actividad'), 'Entrada al evento (pase general)');
  await expect(main.getByText('Entradas al evento')).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Dani Ruiz');
});

test('searches as you type by name, alias or folio and opens the only result with Enter', async ({
  page,
}) => {
  await mockRoster(page, () => snapshot([luz(), mau({ event: '2026-11-14T15:10:00Z' })]));
  await page.goto(path);
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: 'Buscar', exact: true })).toHaveCount(0);

  // The status chips are ignored while searching: Mau already entered.
  await search(page).fill('aczino');
  await expect(main.getByRole('group', { name: 'Filtrar por entrada' })).toHaveCount(0);
  await expect(
    main.getByText('Buscando en todas las inscripciones, hayan entrado o no.'),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(main.getByText('1 resultado')).toBeVisible();
  await expect(main.getByText('Presiona Enter para abrirla')).toBeVisible();

  // Folio without its hyphen.
  await search(page).fill('nb42');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Luz Rivera');
  await search(page).press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Luz Rivera' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar' }).first().click();
  await expect(dialog).toHaveCount(0);

  await search(page).fill('nadie');
  await expect(main.getByText('No encontramos a nadie con “nadie”')).toBeVisible();
  await main.getByRole('button', { name: 'Borrar búsqueda' }).click();
  await expect(search(page)).toHaveValue('');
  await expect(main.getByRole('group', { name: 'Filtrar por entrada' })).toBeVisible();
});

test('checks in one activity of a pass from the dialog with the server time', async ({ page }) => {
  let current = luz();
  const posts: string[] = [];
  await mockRoster(page, () => snapshot([current]));
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts.push(new URL(route.request().url()).pathname);
      expect(route.request().headers()['x-csrf-token']).toBe('safe-token');
      expect(route.request().method()).toBe('POST');
      current = luz({ battle: '2026-11-14T15:30:00Z' });
      return route.fulfill({ status: 201, json: fact(luzId, '2026-11-14T15:30:00Z') });
    },
  );
  await page.goto(path);
  await openRecord(page, 'Luz Rivera');
  const dialog = page.getByRole('dialog', { name: 'Luz Rivera' });
  await expect(dialog.getByText('Inscripción confirmada')).toBeVisible();
  await expect(dialog.getByText('Luz · NB-42AB')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Actividades de sus pases' })).toBeVisible();
  await expect(dialog.getByText('0 de 2 registradas')).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveText([/^Batalla/, /^Taller de footwork/]);
  await expect(dialog.getByRole('button', { name: 'Registrar entrada al evento' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Buscar a otra persona' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Entrada a Batalla registrada a las 09:30.');
  await expect(dialog.getByText('Entró a las 09:30')).toBeVisible();
  await expect(dialog.getByText('1 de 2 registradas')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Registrar entrada a Batalla' })).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Registrar entrada a Taller de footwork' }),
  ).toBeVisible();
  expect(posts).toEqual([
    `/admin/events/${eventId}/registrations/${luzId}/activities/${battleId}/check-in`,
  ]);
  // The list behind follows the refreshed snapshot.
  await page.keyboard.press('Escape');
  await expect(rows(page).first()).toContainText('1 de 2 actividades');
});

test('a general pass checks in the event entry, then offers the next search', async ({ page }) => {
  let current = mau();
  const posts: string[] = [];
  await mockRoster(page, () => snapshot([current, luz()]));
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts.push(new URL(route.request().url()).pathname);
      current = mau({ event: '2026-11-14T15:12:00Z' });
      return route.fulfill({ status: 201, json: fact(mauId, '2026-11-14T15:12:00Z', false, null) });
    },
  );
  await page.goto(path);
  await search(page).fill('mau');
  await search(page).press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Mau Aczino' });
  await expect(dialog.getByText('Entrada general', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Aún no entra')).toBeVisible();
  await expect(
    dialog.getByText('Su pase es de entrada general: solo se registra la entrada al evento.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Registrar entrada al evento' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Entrada al evento registrada a las 09:12.');
  await expect(dialog.getByText('Entró a las 09:12')).toBeVisible();
  await expect(
    dialog.getByText('Ya está adentro. No vuelvas a registrar su entrada.'),
  ).toBeVisible();
  expect(posts).toEqual([`/admin/events/${eventId}/registrations/${mauId}/check-in`]);

  await dialog.getByRole('button', { name: 'Buscar a otra persona' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(search(page)).toHaveValue('');
  await expect(search(page)).toBeFocused();
});

test('does not announce before the answer; a repeat shows the first time', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let current = luz();
  let posts = 0;
  await mockRoster(page, () => snapshot([current]));
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    async (route) => {
      posts++;
      await held;
      // Another operator checked the person in first: the answer is the original fact.
      current = luz({ battle: '2026-11-14T15:05:00Z' });
      await route.fulfill({ status: 201, json: fact(luzId, '2026-11-14T15:05:00Z', true) });
    },
  );
  await page.goto(path);
  await openRecord(page, 'Luz Rivera');
  const dialog = page.getByRole('dialog', { name: 'Luz Rivera' });
  await dialog.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(dialog.getByRole('button', { name: /Registrar entrada a/ }).first()).toBeDisabled();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  release();
  await expect(dialog.getByRole('status')).toHaveText(
    'Esta entrada ya estaba registrada a las 09:05.',
  );
  await expect(dialog.getByText('Entró a las 09:05')).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(posts).toBe(1);
});

test('pending payments and registrations without actions never get a check-in button', async ({
  page,
}) => {
  let posts = 0;
  const noPasses = { ...luz(), passTypeIds: [], activities: [] };
  await mockRoster(page, () => snapshot([dani, noPasses]));
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts++;
      return route.fulfill({ json: {} });
    },
  );
  await page.goto(path);
  await openRecord(page, 'Dani Ruiz');
  const dialog = page.getByRole('dialog', { name: 'Dani Ruiz' });
  await expect(dialog.getByText('Dani R · Sin folio')).toBeVisible();
  await expect(dialog.getByText('Pago por revisar')).toBeVisible();
  await expect(dialog.getByRole('note')).toContainText('No registres su entrada todavía');
  await expect(dialog.getByRole('link', { name: 'Ir a Pagos por revisar' })).toHaveAttribute(
    'href',
    `/admin/events/${eventId}/payments-review`,
  );
  await expect(dialog.getByRole('button', { name: /Registrar entrada/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cerrar' }).first().click();

  // Confirmed, but no general-only pass and no activity to check in.
  await expect(rows(page).filter({ hasText: 'Luz Rivera' })).toContainText(
    'Consultar coordinación',
  );
  await openRecord(page, 'Luz Rivera');
  const other = page.getByRole('dialog', { name: 'Luz Rivera' });
  await expect(other.getByText(escalation)).toBeVisible();
  await expect(other.getByRole('button', { name: /Registrar entrada/ })).toHaveCount(0);
  expect(posts).toBe(0);
});

for (const [name, answer, message] of [
  ['a rejection sends the person to coordination', { status: 400 }, escalation],
  [
    'a denial never announces the admission',
    { status: 403 },
    'Acceso denegado para registrar esta entrada. Consulta al responsable.',
  ],
  [
    'a 500 with a refreshed fact cannot claim a new success',
    { status: 500 },
    'No se pudo registrar la entrada. Consulta al responsable antes de continuar.',
  ],
] as const) {
  test(`${name}`, async ({ page }) => {
    let current = luz();
    await mockRoster(page, () => snapshot([current]));
    await page.route(
      (url) => api(url) && url.pathname.endsWith('/check-in'),
      (route) => {
        if (answer.status === 500) current = luz({ battle: '2026-11-14T15:30:00Z' });
        return route.fulfill({ status: answer.status, json: { message: 'private detail' } });
      },
    );
    await page.goto(path);
    await openRecord(page, 'Luz Rivera');
    const dialog = page.getByRole('dialog', { name: 'Luz Rivera' });
    await dialog.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(message);
    await expect(dialog.getByText(/registrada a las/)).toHaveCount(0);
    await expect(page.getByText('private detail')).toHaveCount(0);
  });
}

test('a missing CSRF token or a failed refresh asks staff to verify', async ({ page }) => {
  let posts = 0;
  await mockRoster(page, () => (posts ? 500 : snapshot([luz()])));
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    (route) => {
      posts++;
      return route.fulfill({ status: 201, json: fact(luzId, '2026-11-14T15:30:00Z') });
    },
  );
  await page.goto(path);
  await openRecord(page, 'Luz Rivera');
  const dialog = page.getByRole('dialog', { name: 'Luz Rivera' });
  await dialog.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  const verify = 'No se pudo verificar el estado. Consulta al responsable antes de continuar.';
  await expect(dialog.getByRole('alert')).toHaveText(verify);
  expect(posts).toBe(0);

  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) =>
      route.fulfill({
        headers: { 'X-CSRF-Token': 'safe-token', 'Access-Control-Expose-Headers': 'X-CSRF-Token' },
        json: { user: { id: 'admin', roles: ['admin'] } },
      }),
  );
  await dialog.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(verify);
  await expect(dialog.getByText(/registrada a las/)).toHaveCount(0);
  expect(posts).toBe(1);
});

for (const [name, answer, message] of [
  ['denied', 403, 'Acceso denegado para este evento. Consulta al responsable.'],
  ['failed', 500, 'No se pudo verificar la inscripción o el estado.'],
  ['for another event', 'foreign', 'No se pudo verificar la inscripción o el estado.'],
] as const) {
  test(`a roster read ${name} shows no registration`, async ({ page }) => {
    await mockRoster(page, () => (answer === 'foreign' ? snapshot([luz()], otherEvent) : answer));
    await page.goto(path);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByText('Luz Rivera')).toHaveCount(0);
    await expect(page.getByText('private')).toHaveCount(0);
  });
}

test('an event with no registrations explains what to do', async ({ page }) => {
  await mockRoster(page, () => snapshot([]));
  await page.goto(path);
  const empty = page.getByRole('region', { name: 'Aún no hay a quién registrar' });
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('link', { name: 'Nueva inscripción' })).toHaveAttribute(
    'href',
    `/admin/events/${eventId}/registrations/new`,
  );
  await expect(empty.getByRole('link', { name: 'Revisar la venta en línea' })).toHaveAttribute(
    'href',
    `/admin/events/${eventId}`,
  );
  await expect(empty.getByRole('link', { name: 'listas de respaldo' })).toHaveAttribute(
    'href',
    `/admin/events/${eventId}/lists`,
  );
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});

test('switching events during an in-flight check-in drops the old dialog and data', async ({
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
    (url) => api(url) && url.pathname.endsWith('/attendee-lists'),
    (route) =>
      route.fulfill({
        json: route.request().url().includes(otherEvent)
          ? snapshot([], otherEvent)
          : snapshot([luz()]),
      }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/check-in'),
    async (route) => {
      postStarted();
      await held;
      await route
        .fulfill({ status: 201, json: fact(luzId, '2026-11-14T15:30:00Z') })
        .catch(() => {});
    },
  );
  await page.goto(path);
  await openRecord(page, 'Luz Rivera');
  await page.getByRole('button', { name: 'Registrar entrada a Batalla' }).click();
  await started;
  await page.evaluate(
    `history.pushState({}, '', '/admin/events/${otherEvent}/check-in'); dispatchEvent(new PopStateEvent('popstate'))`,
  );
  release();
  await expect(page.getByRole('region', { name: 'Aún no hay a quién registrar' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Luz Rivera')).toHaveCount(0);
  await expect(page.getByText(/registrada a las/)).toHaveCount(0);
});

test('a phone operator can find and check in someone without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockRoster(page, () => snapshot([luz(), mau()]));
  await page.goto(path);
  // Folio and pass columns give way to the name and the status on phones.
  await expect(rows(page).first().getByText('NB-42AB')).toBeHidden();
  await search(page).fill('Luz');
  await search(page).press('Enter');
  const admit = page.getByRole('button', { name: 'Registrar entrada a Batalla' });
  await expect(admit).toBeVisible();
  const box = (await admit.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    375,
  );
});
