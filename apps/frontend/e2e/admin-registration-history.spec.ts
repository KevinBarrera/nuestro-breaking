import { expect, test, type Page } from '@playwright/test';
import { eventSummary, mockEventTimeZone } from './support/event-mocks.ts';
import {
  cashCorrection,
  expiry,
  historyRegistrationId,
  manualRegistration,
  nameCorrection,
  onlinePurchase,
} from './support/history-mocks.ts';

// "Historial" (#104). Titles, actors and detail lines per operation type are covered by
// `history-model.test.ts` and the response validation by `readers.test.ts`; these specs check
// the rendered flow, the filter and pagination requests and the failure states.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const historyPath = `/admin/events/${eventId}/history`;
const api = (url: URL) => url.port === '3000';

type Answer = { status?: number; json: unknown };
type Query = { filter: string | null; cursor: string | null };

// Answers by query, so StrictMode's double mount and retries read the same page; every
// request's filter and cursor is recorded.
async function mockHistory(page: Page, answerFor: (query: Query) => Answer) {
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
  // Tijuana, not the browser's zone, so the times prove they use the event clock.
  await mockEventTimeZone(page, eventId, 'America/Tijuana');
  const queries: Query[] = [];
  let resolve = answerFor;
  await page.route(
    (url) => api(url) && url.pathname === `/admin/events/${eventId}/registration-history`,
    (route) => {
      const params = new URL(route.request().url()).searchParams;
      const query = { filter: params.get('filter'), cursor: params.get('cursor') };
      queries.push(query);
      const answer = resolve(query);
      return route.fulfill({ status: answer.status ?? 200, json: answer.json });
    },
  );
  return {
    queries,
    answer: (next: (query: Query) => Answer) => {
      resolve = next;
    },
  };
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });
const entries = (page: Page) =>
  page.getByRole('list', { name: 'Operaciones' }).getByRole('article');
const filterBox = (page: Page) => page.getByRole('checkbox', { name: 'Solo correcciones' });
const loadMore = (page: Page) => page.getByRole('button', { name: 'Cargar más' });

test('reaches Historial from the navigation and lists the operations newest first', async ({
  page,
}) => {
  const history = await mockHistory(page, () => ({
    json: {
      items: [cashCorrection, nameCorrection, manualRegistration, onlinePurchase, expiry],
      nextCursor: null,
    },
  }));
  await page.goto(`/admin/events/${eventId}`);
  await nav(page).getByRole('link', { name: 'Historial' }).click();
  await expect(page).toHaveURL(historyPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Historial' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Historial' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await expect(entries(page).getByRole('heading', { level: 2 })).toHaveText([
    'Corrección de pago en efectivo',
    'Corrección de nombre o AKA',
    'Inscripción presencial',
    'Compra en línea',
    'Inscripción vencida',
  ]);
  const cash = entries(page).nth(0);
  await expect(cash).toContainText('14 nov 2026, 10:04');
  await expect(cash).toContainText('Coordinación');
  await expect(cash).toContainText('$1,500.00, recibo A-1 → $1,200.00, recibo A-2');
  await expect(cash).toContainText('Motivo: Recibo equivocado');
  await expect(cash).toContainText('Folio EB-0042');
  await expect(cash.getByRole('link', { name: 'Ana López' })).toHaveAttribute(
    'href',
    `/admin/events/${eventId}/registrations/${historyRegistrationId}`,
  );
  await expect(entries(page).nth(1)).toContainText('Cambió: nombre, AKA');
  await expect(entries(page).nth(1)).toContainText('Motivo: Error de captura');
  await expect(entries(page).nth(2)).toContainText('Administrador');
  await expect(entries(page).nth(2)).not.toContainText('Motivo:');
  await expect(entries(page).nth(3)).toContainText('Beto Ruiz');
  await expect(entries(page).nth(3)).toContainText('Sin folio');
  await expect(entries(page).nth(4)).toContainText('Sistema');
  await expect(entries(page).nth(4)).toContainText('Pendiente de pago → Vencida');
  await expect(loadMore(page)).toHaveCount(0);
  expect(history.queries.every((query) => query.filter === 'all' && !query.cursor)).toBe(true);
});

test('"Solo correcciones" reloads the list from the first page with the filter', async ({
  page,
}) => {
  const history = await mockHistory(page, ({ filter }) => ({
    json:
      filter === 'corrections'
        ? { items: [cashCorrection], nextCursor: null }
        : { items: [cashCorrection, manualRegistration], nextCursor: 'page-2' },
  }));
  await page.goto(historyPath);
  await expect(entries(page)).toHaveCount(2);

  await filterBox(page).check();
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toContainText('Corrección de pago en efectivo');
  await expect(loadMore(page)).toHaveCount(0);
  expect(history.queries.at(-1)).toEqual({ filter: 'corrections', cursor: null });

  await filterBox(page).uncheck();
  await expect(entries(page)).toHaveCount(2);
  expect(history.queries.at(-1)).toEqual({ filter: 'all', cursor: null });
});

test('"Cargar más" appends the next page and keeps focus in the list', async ({ page }) => {
  let releaseSecond = () => {};
  const secondPage = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const history = await mockHistory(page, ({ cursor }) => ({
    json:
      cursor === 'page-2'
        ? { items: [onlinePurchase, expiry], nextCursor: null }
        : { items: [cashCorrection, nameCorrection], nextCursor: 'page-2' },
  }));
  // Holds the second page so the disabled state is visible while it loads.
  await page.route(
    (url) => api(url) && url.searchParams.get('cursor') === 'page-2',
    async (route) => {
      await secondPage;
      await route.fallback();
    },
  );
  await page.goto(historyPath);
  await expect(entries(page)).toHaveCount(2);

  await loadMore(page).click();
  await expect(loadMore(page)).toBeDisabled();
  releaseSecond();
  await expect(entries(page)).toHaveCount(4);
  await expect(entries(page).nth(2)).toContainText('Compra en línea');
  await expect(entries(page).nth(2)).toBeFocused();
  await expect(loadMore(page)).toHaveCount(0);
  expect(history.queries.at(-1)).toEqual({ filter: 'all', cursor: 'page-2' });
});

test('says so when there are no operations, also with the filter', async ({ page }) => {
  await mockHistory(page, () => ({ json: { items: [], nextCursor: null } }));
  await page.goto(historyPath);
  await expect(page.getByText('Todavía no hay operaciones registradas.')).toBeVisible();
  await filterBox(page).check();
  await expect(page.getByText('Todavía no hay correcciones registradas.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Operaciones' })).toHaveCount(0);
});

test('a failed load shows an alert and retries', async ({ page }) => {
  const history = await mockHistory(page, () => ({ status: 500, json: { message: 'boom' } }));
  await page.goto(historyPath);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No se pudo cargar el historial. Intenta de nuevo.');
  await expect(page.getByText('boom')).toHaveCount(0);
  history.answer(() => ({ json: { items: [cashCorrection], nextCursor: null } }));
  await alert.getByRole('button', { name: 'Reintentar' }).click();
  await expect(entries(page)).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const status of [401, 403]) {
  test(`a denied read (${status}) shows no history and no retry`, async ({ page }) => {
    await mockHistory(page, () => ({ status, json: { message: 'Forbidden' } }));
    await page.goto(historyPath);
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('No tienes acceso al historial de este evento.');
    await expect(alert.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Operaciones' })).toHaveCount(0);
  });
}
