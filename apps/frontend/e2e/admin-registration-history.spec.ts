import { expect, test, type Page } from '@playwright/test';
import { eventSummary, mockEventTimeZone } from './support/event-mocks.ts';
import {
  cashCorrection,
  complimentary,
  expiry,
  historyRegistrationId,
  manualRegistration,
  nameCorrection,
  onlinePurchase,
  onSiteCash,
  onSitePass,
  selectionChange,
} from './support/history-mocks.ts';

// "Historial" (#104, #357). Entries, day groups, on-site groups and labels are covered by
// `history-feed-model.test.ts` and `history-model.test.ts`, and the response validation by
// `readers.test.ts`; these specs check the rendered flow, the search, filter and pagination
// requests and the empty and failure states.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const historyPath = `/admin/events/${eventId}/history`;
const api = (url: URL) => url.port === '3000';
const noCounts = { all: 0, corrections: 0, on_site: 0, complimentary: 0 };
const counts = { all: 9, corrections: 3, on_site: 1, complimentary: 1 };

type Answer = { status?: number; json: unknown };
type Query = { filter: string | null; cursor: string | null; q: string | null };

// Answers by query, so StrictMode's double mount and retries read the same page; every
// request's filter, search and cursor is recorded.
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
      const query = {
        filter: params.get('filter'),
        cursor: params.get('cursor'),
        q: params.get('q'),
      };
      queries.push(query);
      const answer = resolve(query);
      // Pages carry the counts the backend adds since #356.
      const json =
        answer.status === undefined || answer.status === 200
          ? { counts, ...(answer.json as object) }
          : answer.json;
      return route.fulfill({ status: answer.status ?? 200, json });
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
const entries = (page: Page) => page.getByRole('main').getByRole('article');
const titles = (page: Page) => entries(page).getByRole('heading', { level: 3 });
const day = (page: Page, name: string) => page.getByRole('region', { name });
const chips = (page: Page) => page.getByRole('group', { name: 'Filtrar por tipo' });
const search = (page: Page) => page.getByRole('searchbox', { name: 'Buscar en el historial' });
const loadMore = (page: Page) => page.getByRole('button', { name: 'Cargar días anteriores' });

test('reaches Historial from the navigation and lists the entries by day', async ({ page }) => {
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
  await expect(page.getByRole('main').getByText('Encuentro del barrio')).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'Historial' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('Horas de Tijuana')).toBeVisible();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Sábado 14 de noviembre',
    'Viernes 13 de noviembre',
  ]);
  await expect(day(page, 'Sábado 14 de noviembre')).toContainText('3 movimientos');
  await expect(titles(page)).toHaveText([
    'Corrección de pago en efectivo',
    'Corrección de nombre o AKA',
    'Inscripción presencial',
    'Compra en línea',
    'Inscripción vencida',
  ]);
  const cash = entries(page).nth(0);
  await expect(cash).toContainText('10:04');
  await expect(cash).toContainText('Corrección');
  await expect(cash).toContainText('por Coordinación');
  await expect(cash.getByRole('definition')).toHaveText([
    'Antes: $1,500.00Después: $1,200.00',
    'Antes: A-1Después: A-2',
  ]);
  await expect(cash).toContainText('Motivo“Recibo equivocado”');
  await expect(
    cash.getByRole('link', { name: 'Ana López, EB-0042. Ver inscripción' }),
  ).toHaveAttribute('href', `/admin/events/${eventId}/registrations/${historyRegistrationId}`);
  await expect(entries(page).nth(1)).toContainText('Cambiónombre, AKA');
  await expect(entries(page).nth(2)).toContainText('por Administrador');
  await expect(entries(page).nth(2)).not.toContainText('Motivo');
  await expect(entries(page).nth(3).getByRole('link')).toHaveAccessibleName(
    'Beto Ruiz, Sin folio. Ver inscripción',
  );
  await expect(entries(page).nth(4)).toContainText('por Sistema');
  await expect(entries(page).nth(4).getByRole('definition')).toHaveText(
    'Antes: Pendiente de pagoDespués: Vencida',
  );
  await expect(page.getByText('Mostrando del 13 al 14 de noviembre · 5 movimientos')).toBeVisible();
  await expect(loadMore(page)).toHaveCount(0);
  expect(
    history.queries.every((query) => query.filter === 'all' && !query.cursor && !query.q),
  ).toBe(true);
});

test('groups an on-site registration and shows its operations on demand', async ({ page }) => {
  await mockHistory(page, () => ({
    json: {
      items: [selectionChange, onSiteCash, onSitePass, manualRegistration, complimentary],
      nextCursor: null,
    },
  }));
  await page.goto(historyPath);
  await expect(titles(page)).toHaveText([
    'Cambio de competencias',
    'Inscripción en mesa',
    'Cortesía',
  ]);
  const competitions = entries(page).nth(0);
  await expect(competitions.getByRole('listitem')).toHaveText([
    'Breaking 2v2',
    'Toprock',
    'Breaking 1v1',
  ]);
  await expect(competitions).toContainText('Agregó');
  await expect(competitions).toContainText('Quitó');

  const group = entries(page).nth(1);
  await expect(group).toContainText('09:00');
  await expect(group).toContainText('Pase completo Breaking · $1,500.00 en efectivo, recibo A-1');
  const toggle = group.getByRole('button', { name: 'Ver 3 operaciones' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(group.getByRole('listitem')).toHaveCount(0);
  await toggle.click();
  await expect(group.getByRole('button', { name: 'Ocultar 3 operaciones' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(group.getByRole('listitem')).toHaveText([
    '09:00Inscripción presencial',
    '09:01Pase agregadoPase completo Breaking',
    '09:02Pago en efectivo$1,500.00, recibo A-1',
  ]);

  await expect(entries(page).nth(2)).toContainText('Pase sin costo');
  await expect(entries(page).nth(2)).toContainText('Motivo“Ganador de torneo”');
});

test('the type chips filter from the first page and keep the counts', async ({ page }) => {
  const history = await mockHistory(page, ({ filter }) => ({
    json:
      filter === 'corrections'
        ? { items: [cashCorrection], nextCursor: null }
        : { items: [cashCorrection, manualRegistration], nextCursor: 'page-2' },
  }));
  await page.goto(historyPath);
  await expect(entries(page)).toHaveCount(2);
  await expect(chips(page).getByRole('button')).toHaveText([
    'Todo9',
    'Correcciones3',
    'Inscripciones en mesa1',
    'Cortesías1',
  ]);
  await expect(chips(page).getByRole('button', { name: /^Todo/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await chips(page)
    .getByRole('button', { name: /^Correcciones/ })
    .click();
  await expect(page).toHaveURL(`${historyPath}?tipo=correcciones`);
  await expect(entries(page)).toHaveCount(1);
  await expect(chips(page).getByRole('button', { name: /^Correcciones/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByText(
      'Anulaciones y cambios de nombre, disciplina, competencias o pago en inscripciones confirmadas.',
    ),
  ).toBeVisible();
  await expect(loadMore(page)).toHaveCount(0);
  expect(history.queries.at(-1)).toEqual({ filter: 'corrections', cursor: null, q: null });

  await chips(page)
    .getByRole('button', { name: /^Inscripciones en mesa/ })
    .click();
  await expect(page).toHaveURL(`${historyPath}?tipo=mesa`);
  await expect
    .poll(() => history.queries.at(-1))
    .toEqual({ filter: 'on_site', cursor: null, q: null });
  await expect(
    page.getByText('Cada inscripción en mesa junta el registro, sus pases y el pago en efectivo.'),
  ).toBeVisible();
  await chips(page).getByRole('button', { name: /^Todo/ }).click();
  await expect(page).toHaveURL(historyPath);
  await expect(entries(page)).toHaveCount(2);
});

test('searches live, keeps the search in the URL and clears it', async ({ page }) => {
  const history = await mockHistory(page, ({ q }) => ({
    json: q
      ? { items: [cashCorrection], nextCursor: null }
      : { items: [cashCorrection, nameCorrection], nextCursor: null },
  }));
  await page.goto(`${historyPath}?tipo=cortesias`);
  await expect(chips(page).getByRole('button', { name: /^Cortesías/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await search(page).fill('A');
  await page.waitForTimeout(400);
  expect(history.queries.some((query) => query.q !== null)).toBe(false);

  await search(page).fill('EB-0042');
  await expect(page).toHaveURL(`${historyPath}?q=EB-0042&tipo=cortesias`);
  await expect(entries(page)).toHaveCount(1);
  expect(history.queries.at(-1)).toEqual({ filter: 'complimentary', cursor: null, q: 'EB-0042' });

  await page.reload();
  await expect(search(page)).toHaveValue('EB-0042');
  await page.getByRole('button', { name: 'Borrar búsqueda' }).click();
  await expect(search(page)).toHaveValue('');
  await expect(page).toHaveURL(`${historyPath}?tipo=cortesias`);
  await expect(entries(page)).toHaveCount(2);
});

test('says when nothing matches and goes back to the whole history', async ({ page }) => {
  await mockHistory(page, ({ q, filter }) => ({
    json:
      q || filter !== 'all'
        ? { items: [], nextCursor: null }
        : { items: [cashCorrection], nextCursor: null },
  }));
  await page.goto(`${historyPath}?q=zzz&tipo=correcciones`);
  await expect(page.getByText('Nada en el historial coincide con “zzz”')).toBeVisible();
  await expect(
    page.getByText('Prueba con otro nombre, folio o número de recibo, o quita el filtro.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ver todo el historial' }).click();
  await expect(page).toHaveURL(historyPath);
  await expect(search(page)).toHaveValue('');
  await expect(entries(page)).toHaveCount(1);

  await chips(page)
    .getByRole('button', { name: /^Cortesías/ })
    .click();
  await expect(page.getByText('No hay movimientos de este tipo')).toBeVisible();
});

test('an event without movements explains the history and links to Inscripciones', async ({
  page,
}) => {
  await mockHistory(page, () => ({ json: { items: [], nextCursor: null, counts: noCounts } }));
  await page.goto(historyPath);
  await expect(page.getByRole('heading', { name: 'Todavía no hay movimientos' })).toBeVisible();
  await expect(
    page.getByText(
      'Aquí verás cada inscripción, pago, cortesía y corrección del evento: cuándo pasó, quién la hizo y el motivo.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir a Inscripciones' })).toHaveAttribute(
    'href',
    `/admin/events/${eventId}/registrations`,
  );
  await expect(search(page)).toHaveCount(0);
  await expect(chips(page)).toHaveCount(0);
});

test('"Cargar días anteriores" appends the next page and keeps focus', async ({ page }) => {
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
  await expect(page.getByText('Mostrando el 14 de noviembre · 2 movimientos')).toBeVisible();

  await loadMore(page).click();
  await expect(loadMore(page)).toBeDisabled();
  releaseSecond();
  await expect(entries(page)).toHaveCount(4);
  await expect(entries(page).nth(2)).toContainText('Compra en línea');
  await expect(entries(page).nth(2)).toBeFocused();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Sábado 14 de noviembre',
    'Viernes 13 de noviembre',
  ]);
  await expect(loadMore(page)).toHaveCount(0);
  expect(history.queries.at(-1)).toEqual({ filter: 'all', cursor: 'page-2', q: null });
});

test('marks today and moves the time into the meta line at phone width', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T20:00:00.000Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHistory(page, () => ({ json: { items: [cashCorrection], nextCursor: null } }));
  await page.goto(historyPath);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Hoy · sábado 14 de noviembre',
  ]);
  await expect(entries(page).first().getByText('· 10:04')).toBeVisible();
  await expect(entries(page).first().getByText('10:04', { exact: true })).toBeHidden();
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
    await expect(entries(page)).toHaveCount(0);
    await expect(search(page)).toHaveCount(0);
  });
}
