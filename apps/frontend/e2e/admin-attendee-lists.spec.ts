import { expect, test, type Page } from '@playwright/test';
import { eventSummary } from './support/event-mocks.ts';
import { chooseOption, expectSelected, selectTrigger } from './support/select.ts';

// "Listas de respaldo" (#65). List building, labels and response validation are covered by
// `attendee-lists-model.test.ts` and `readers.test.ts`; these specs check the rendered flow,
// the print layout and the failure states.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const listsPath = `/admin/events/${eventId}/lists`;
const api = (url: URL) => url.port === '3000';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';

const snapshot = {
  event: { id: eventId, name: 'Encuentro del barrio' },
  generatedAt: '2026-11-13T20:00:00.000Z',
  passTypes: [{ id: fullPassId, name: 'Pase completo', passClass: 'full', status: 'active' }],
  activities: [
    { id: battleId, name: 'Batalla 1vs1', kind: 'competition', startsAt: '2026-11-14T18:00:00Z' },
  ],
  registrations: [
    {
      registrationId: 'c1b2c3d4-1234-4567-89ab-123456789abc',
      folio: 'EB-7K3Q',
      fullName: 'Ana López',
      stageName: 'Flash',
      status: 'confirmed',
      eventCheckedInAt: '2026-11-14T16:05:00.000Z',
      passTypeIds: [fullPassId],
      activities: [{ activityId: battleId, checkedInAt: null }],
      // Never expected from the backend; the screen must not show it even if it arrives.
      email: 'ana@example.org',
      phone: '+52 5512345678',
    },
    {
      registrationId: 'c2b2c3d4-1234-4567-89ab-123456789abc',
      folio: null,
      fullName: 'Beto Ruiz',
      stageName: null,
      status: 'pending_payment',
      eventCheckedInAt: null,
      passTypeIds: [],
      activities: [],
    },
  ],
};

type Answer = { status?: number; json: unknown };

// The answer stays until the test replaces it, since a dev-mode StrictMode mount may read twice.
async function mockLists(page: Page, first: Answer) {
  await page.route(
    (url) => api(url) && url.pathname === '/auth/session',
    (route) => route.fulfill({ json: { user: { id: 'admin', roles: ['admin'] } } }),
  );
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) => route.fulfill({ json: [eventSummary(eventId, 'Encuentro del barrio')] }),
  );
  await page.route(
    (url) => api(url) && url.pathname.endsWith('/activities'),
    (route) => route.fulfill({ json: [] }),
  );
  let answer = first;
  let calls = 0;
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/attendee-lists`,
    (route) => {
      calls += 1;
      return route.fulfill({ status: answer.status ?? 200, json: answer.json });
    },
  );
  return {
    answer: (next: Answer) => {
      answer = next;
    },
    calls: () => calls,
  };
}

const listTable = (page: Page, name: string) => page.getByRole('table', { name, exact: true });
const bodyRows = (page: Page, name: string) =>
  listTable(page, name).locator('tbody').getByRole('row');
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });

test('reaches the lists from the navigation and shows each list with its people', async ({
  page,
}) => {
  await mockLists(page, { json: snapshot });
  await page.goto(`/admin/events/${eventId}`);
  await nav(page).getByRole('link', { name: 'Listas de respaldo' }).click();
  await expect(page).toHaveURL(listsPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Listas de respaldo' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Listas de respaldo' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Evento completo',
    'Pase · Pase completo',
    'Competencia · Batalla 1vs1',
  ]);
  const event = listTable(page, 'Evento completo');
  await expect(event.getByRole('columnheader')).toHaveText([
    'Nombre',
    'AKA',
    'Folio',
    'Estado',
    'Pases',
    'Asistencia',
    'Marca',
  ]);
  await expect(event).toContainText('Encuentro del barrio · Evento completo');
  await expect(event).toContainText('Generada el');
  await expect(event).toContainText('Instantánea: puede no reflejar cambios posteriores.');
  const count = (name: string) =>
    page.getByRole('region', { name, exact: true }).getByText(/^\d+ personas?$/);
  await expect(count('Evento completo')).toHaveText('2 personas');
  await expect(count('Pase · Pase completo')).toHaveText('1 persona');
  await expect(count('Competencia · Batalla 1vs1')).toHaveText('1 persona');

  const [ana, beto] = [
    bodyRows(page, 'Evento completo').nth(0),
    bodyRows(page, 'Evento completo').nth(1),
  ];
  await expect(ana.getByRole('rowheader')).toHaveText('Ana López');
  await expect(ana.getByRole('cell')).toHaveText([
    'Flash',
    'EB-7K3Q',
    'Confirmada',
    'Pase completo',
    /^Entró \d{2}:\d{2}$/,
    '',
  ]);
  await expect(beto.getByRole('cell')).toHaveText([
    '',
    '—',
    'Pendiente de pago',
    '',
    'Sin entrar',
    '',
  ]);
  // The activity list shows that activity's attendance, not the event entry.
  await expect(bodyRows(page, 'Competencia · Batalla 1vs1').getByRole('cell').nth(3)).toHaveText(
    'Sin entrar',
  );

  const text = await page.getByRole('main').innerText();
  expect(text).not.toContain('ana@example.org');
  expect(text).not.toContain('5512345678');
});

test('narrows to one list with the selector', async ({ page }) => {
  await mockLists(page, { json: snapshot });
  await page.goto(listsPath);
  const selector = selectTrigger(page, 'Lista');
  await expectSelected(selector, 'Todas las listas');
  await chooseOption(selector, 'Competencia · Batalla 1vs1 (1 persona)');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Competencia · Batalla 1vs1']);
  await chooseOption(selector, 'Todas las listas');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
});

test('prints the current selection through the browser', async ({ page }) => {
  await page.addInitScript({
    content: 'window.__prints = 0; window.print = () => { window.__prints += 1; };',
  });
  await mockLists(page, { json: snapshot });
  await page.goto(listsPath);
  await page.getByRole('button', { name: 'Imprimir o guardar PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
});

test('print layout hides the admin chrome and the controls and keeps each list header', async ({
  page,
}) => {
  await page.addInitScript({ content: "localStorage.setItem('nb-theme', 'dark');" });
  await mockLists(page, { json: snapshot });
  await page.goto(listsPath);
  await expect(listTable(page, 'Evento completo')).toBeVisible();
  await page.emulateMedia({ media: 'print' });

  await expect(nav(page)).toBeHidden();
  await expect(page.getByRole('banner', { name: 'Espacio de administración' })).toBeHidden();
  await expect(selectTrigger(page, 'Lista')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Imprimir o guardar PDF' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toBeHidden();

  const tables = page.getByRole('table');
  await expect(tables).toHaveCount(3);
  for (const table of await tables.all()) {
    await expect(table.locator('thead')).toContainText('Encuentro del barrio');
    await expect(table.locator('thead')).toContainText('Generada el');
  }
  // Every list after the first starts on a new sheet, and rows never split across sheets.
  const breaks = await page
    .getByRole('main')
    .locator('section')
    .evaluateAll((sections) => sections.map((node) => getComputedStyle(node).breakBefore));
  expect(breaks).toEqual(['auto', 'page', 'page']);
  await expect(bodyRows(page, 'Evento completo').first()).toHaveCSS('break-inside', 'avoid');
  // Black on white even in the dark theme.
  await expect(page.getByRole('heading', { name: 'Evento completo' })).toHaveCSS(
    'color',
    'rgb(0, 0, 0)',
  );
  await expect(bodyRows(page, 'Evento completo').first().getByRole('cell').first()).toHaveCSS(
    'color',
    'rgb(0, 0, 0)',
  );
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('Actualizar reads a new snapshot', async ({ page }) => {
  const lists = await mockLists(page, { json: snapshot });
  await page.goto(listsPath);
  await expect(bodyRows(page, 'Evento completo')).toHaveCount(2);
  const before = lists.calls();
  lists.answer({
    json: {
      ...snapshot,
      generatedAt: '2026-11-14T20:00:00.000Z',
      registrations: snapshot.registrations.slice(1),
    },
  });
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(bodyRows(page, 'Evento completo')).toHaveCount(1);
  expect(lists.calls()).toBeGreaterThan(before);
});

test('an event without registrations says so and can still be printed', async ({ page }) => {
  await mockLists(page, {
    json: { ...snapshot, passTypes: [], activities: [], registrations: [] },
  });
  await page.goto(listsPath);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Evento completo']);
  await expect(
    listTable(page, 'Evento completo').getByText(
      'Aún no hay inscripciones confirmadas ni pendientes.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Evento completo' }).getByText('0 personas', { exact: true }),
  ).toBeVisible();
  await expectSelected(selectTrigger(page, 'Lista'), 'Todas las listas');
  await expect(page.getByRole('button', { name: 'Imprimir o guardar PDF' })).toBeEnabled();
});

test('a failed load shows an alert and retries', async ({ page }) => {
  const lists = await mockLists(page, { status: 500, json: { message: 'boom' } });
  await page.goto(listsPath);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se pudieron cargar las listas. Intenta de nuevo.');
  lists.answer({ json: snapshot });
  await alert.getByRole('button', { name: 'Reintentar' }).click();
  await expect(listTable(page, 'Evento completo')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a denied read shows no lists and no retry', async ({ page }) => {
  await mockLists(page, { status: 401, json: { message: 'Unauthorized' } });
  await page.goto(listsPath);
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('No tienes acceso a las listas de este evento.');
  await expect(alert.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
});
