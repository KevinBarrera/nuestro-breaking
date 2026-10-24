import { expect, test, type Page } from '@playwright/test';
import { eventSummary } from './support/event-mocks.ts';

// "Listas de respaldo" (#65, #362). List building, grouping, freshness, progress and search
// are covered by `attendee-lists-model.test.ts` and `readers.test.ts`; these specs check the
// rendered flow and the failure states.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const listsPath = `/admin/events/${eventId}/lists`;
const api = (url: URL) => url.port === '3000';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const generalPassId = 'f2b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const generatedAt = '2026-11-13T20:00:00.000Z';

const snapshot = {
  event: { id: eventId, name: 'Encuentro del barrio' },
  generatedAt,
  passTypes: [
    { id: fullPassId, name: 'Pase completo', passClass: 'full', status: 'active' },
    { id: generalPassId, name: 'Entrada general', passClass: 'general', status: 'active' },
  ],
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
      passTypeIds: [generalPassId],
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

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });
const picker = (page: Page) => page.getByRole('region', { name: 'Qué imprimir' });
const include = (page: Page, list: string) =>
  page.getByRole('checkbox', { name: `Incluir ${list} en el PDF` });
const show = (page: Page, list: string) =>
  picker(page).getByRole('button', { name: new RegExp(`^${list} \\d+$`) });

test('reaches the lists from the navigation and previews the event list', async ({ page }) => {
  await mockLists(page, { json: snapshot });
  await page.goto(`/admin/events/${eventId}`);
  await nav(page).getByRole('link', { name: 'Listas de respaldo' }).click();
  await expect(page).toHaveURL(listsPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Listas de respaldo' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Listas de respaldo' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Groups in print order; only the event list is checked and shown at first.
  const groups = picker(page).getByRole('group');
  await expect(groups).toHaveCount(3);
  for (const [index, name] of ['Evento', 'Pases · 2', 'Competencias'].entries())
    await expect(groups.nth(index)).toHaveAccessibleName(name);
  await expect(include(page, 'Evento completo')).toBeChecked();
  await expect(include(page, 'Pase completo')).not.toBeChecked();
  await expect(show(page, 'Evento completo')).toHaveAttribute('aria-pressed', 'true');
  await expect(show(page, 'Evento completo')).toHaveAccessibleName('Evento completo 2');
  await expect(page.getByRole('button', { name: 'Imprimir 1 lista' })).toBeEnabled();

  const region = page.getByRole('region', { name: 'Evento completo' });
  await expect(region).toContainText('Incluida en el PDF');
  await expect(region).toContainText('1 de 2 personas ya entraron · 1 por entrar');
  const rows = region.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveText(
    /^1Ana LópezAKA FlashEB-7K3QPase completoEntró \d{2}:\d{2}$/,
  );
  // A pending payment shows its status instead of the entry.
  await expect(rows.nth(1)).toHaveText('2Beto Ruiz—Entrada generalPendiente de pago');

  const text = await page.getByRole('main').innerText();
  expect(text).not.toContain('ana@example.org');
  expect(text).not.toContain('5512345678');
});

test('checks lists for the PDF and previews another one', async ({ page }) => {
  await mockLists(page, { json: snapshot });
  await page.goto(listsPath);

  await picker(page).getByRole('button', { name: 'Marcar todas' }).click();
  await expect(include(page, 'Pase completo')).toBeChecked();
  await expect(include(page, 'Entrada general')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Imprimir 3 listas' })).toBeVisible();
  await picker(page).getByRole('button', { name: 'Quitar todas' }).click();
  await expect(include(page, 'Pase completo')).not.toBeChecked();

  await show(page, 'Batalla 1vs1').click();
  await expect(show(page, 'Batalla 1vs1')).toHaveAttribute('aria-pressed', 'true');
  const region = page.getByRole('region', { name: 'Batalla 1vs1' });
  await expect(region).toContainText('Competencia · la entrada se cuenta por competencia');
  await expect(region).toContainText('No incluida en el PDF');
  // The activity list shows that activity's entry, not the event entry, and no passes.
  await expect(region.getByRole('listitem')).toHaveText(['1Ana LópezAKA FlashEB-7K3QSin entrar']);
  await include(page, 'Batalla 1vs1').check();
  await expect(region).toContainText('Incluida en el PDF');

  await include(page, 'Evento completo').uncheck();
  await include(page, 'Batalla 1vs1').uncheck();
  await expect(page.getByRole('button', { name: 'Elige una lista para imprimir' })).toBeDisabled();
});

test('searches inside the shown list', async ({ page }) => {
  await mockLists(page, { json: snapshot });
  await page.goto(listsPath);
  const search = page.getByRole('searchbox', { name: 'Buscar en esta lista' });
  const region = page.getByRole('region', { name: 'Evento completo' });

  await search.fill('eb7k');
  await expect(region.getByRole('listitem')).toHaveCount(1);
  await expect(region.getByRole('listitem')).toContainText('Ana López');
  await search.fill('zzz');
  await expect(region.getByRole('listitem')).toHaveCount(0);
  await expect(region).toContainText('Nadie en esta lista coincide con “zzz”.');
  // Showing another list starts a new search.
  await show(page, 'Pase completo').click();
  await expect(search).toHaveValue('');
});

test('prints through the browser', async ({ page }) => {
  await page.addInitScript({
    content: 'window.__prints = 0; window.print = () => { window.__prints += 1; };',
  });
  await mockLists(page, { json: snapshot });
  await page.goto(listsPath);
  await page.getByRole('button', { name: 'Imprimir 1 lista' }).click();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
});

test('warns when the data gets old and "Actualizar datos" reads it again', async ({ page }) => {
  await page.clock.install({ time: new Date(Date.parse(generatedAt) + 5 * 60_000) });
  const lists = await mockLists(page, { json: snapshot });
  await page.goto(listsPath);
  const notice = page.getByRole('status').filter({ hasText: 'Datos' });
  await expect(notice).toContainText('Datos al día');
  await expect(notice).toContainText('Imprime ahora para llevar la versión más reciente.');

  await show(page, 'Batalla 1vs1').click();
  await include(page, 'Pase completo').check();
  await page.clock.fastForward('01:00:00');
  await expect(notice).toContainText('Datos de hace 1 hora');
  await expect(notice).toContainText('Actualiza antes de imprimir');

  // The new snapshot drops "Entrada general"; the other choices stay.
  const before = lists.calls();
  lists.answer({
    json: {
      ...snapshot,
      generatedAt: new Date(Date.parse(generatedAt) + 65 * 60_000).toISOString(),
      passTypes: snapshot.passTypes.slice(0, 1),
      registrations: snapshot.registrations.slice(0, 1),
    },
  });
  await notice.getByRole('button', { name: 'Actualizar datos' }).click();
  await expect(notice).toContainText('Datos al día');
  expect(lists.calls()).toBeGreaterThan(before);
  await expect(show(page, 'Evento completo')).toHaveAccessibleName('Evento completo 1');
  await expect(show(page, 'Batalla 1vs1')).toHaveAttribute('aria-pressed', 'true');
  await expect(include(page, 'Pase completo')).toBeChecked();
  await expect(include(page, 'Entrada general')).toHaveCount(0);
});

test('an event without registrations has nothing to print yet', async ({ page }) => {
  await mockLists(page, {
    json: { ...snapshot, passTypes: [], activities: [], registrations: [] },
  });
  await page.goto(listsPath);
  const empty = page.getByRole('region', { name: 'Aún no hay listas que imprimir' });
  await expect(empty).toContainText(
    'Las listas se arman con las inscripciones confirmadas o pendientes de pago del evento.',
  );
  await expect(empty).toContainText('Imprímelas el día anterior y otra vez justo antes');
  await expect(page.getByRole('button', { name: /^Imprimir|^Elige/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Qué imprimir' })).toHaveCount(0);
  await empty.getByRole('link', { name: 'Ir a Inscripciones' }).click();
  await expect(page).toHaveURL(`/admin/events/${eventId}/registrations`);
});

test('a failed load shows an alert and retries', async ({ page }) => {
  const lists = await mockLists(page, { status: 500, json: { message: 'boom' } });
  await page.goto(listsPath);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se pudieron cargar las listas. Intenta de nuevo.');
  lists.answer({ json: snapshot });
  await alert.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('region', { name: 'Evento completo' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a denied read shows no lists and no retry', async ({ page }) => {
  await mockLists(page, { status: 401, json: { message: 'Unauthorized' } });
  await page.goto(listsPath);
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('No tienes acceso a las listas de este evento.');
  await expect(alert.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Qué imprimir' })).toHaveCount(0);
});
