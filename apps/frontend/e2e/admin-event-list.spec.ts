import { expect, test, type Page } from '@playwright/test';
import { mockAdminApi } from './support/admin-mocks.ts';
import {
  activeEventId,
  archivedEvent,
  archivedEventId,
  eventAdmin,
  mockEventList,
  mockSession,
  sampleEvents,
  type EventSummary,
} from './support/event-mocks.ts';

const main = (page: Page) => page.getByRole('main');
const createLink = (page: Page) => main(page).getByRole('link', { name: 'Crear evento' });
const eventList = (page: Page) => main(page).getByRole('list', { name: 'Eventos', exact: true });

test('a global admin sees every event with its address, folio prefix and Crear evento', async ({
  page,
}) => {
  await mockSession(page);
  const queries = await mockEventList(page, () => sampleEvents);
  await page.goto('/admin');
  await expect(createLink(page)).toHaveAttribute('href', '/admin/events/new');
  const first = eventList(page).getByRole('link', { name: sampleEvents[0].name, exact: true });
  await expect(first).toHaveAttribute('href', `/admin/events/${activeEventId}`);
  await expect(first).toContainText('/e/los-mas-pesados-nov-2026');
  await expect(first).toContainText('Folios LMP-····');
  await expect(eventList(page).getByRole('listitem')).toHaveCount(2);
  // Global admins ask for archived events too; none here, so no Archivados toggle.
  expect(queries).toContain('?archived=true');
  await expect(main(page).getByRole('button', { name: /^Archivados/ })).toHaveCount(0);
});

test('an event admin sees their events without Crear evento or archived events', async ({
  page,
}) => {
  await mockSession(page, eventAdmin);
  const queries = await mockEventList(page, () => [...sampleEvents, archivedEvent]);
  await page.goto('/admin');
  await expect(eventList(page).getByRole('listitem')).toHaveCount(2);
  await expect(createLink(page)).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /^Archivados/ })).toHaveCount(0);
  expect(queries).not.toContain('?archived=true');
});

test('a global admin with one event stays on the list instead of being redirected', async ({
  page,
}) => {
  await mockSession(page);
  await mockEventList(page, () => [sampleEvents[0]]);
  await page.goto('/admin');
  await expect(eventList(page).getByRole('listitem')).toHaveCount(1);
  await expect(createLink(page)).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
});

test('first run shows the empty state with the next steps and Crear evento', async ({ page }) => {
  await mockSession(page);
  await mockEventList(page, () => []);
  await page.goto('/admin');
  const empty = main(page).getByRole('region', { name: 'Aún no hay eventos' });
  await expect(empty).toContainText('Crea el primer evento para empezar a configurarlo.');
  await expect(empty.getByRole('listitem')).toContainText([
    'Agregar competencias y workshops',
    'Crear los pases y sus precios',
    'Abrir la venta en línea y operar el check-in',
  ]);
  // One Crear evento, inside the empty state.
  await expect(createLink(page)).toHaveCount(1);
  await empty.getByRole('link', { name: 'Crear evento' }).click();
  await expect(page).toHaveURL('/admin/events/new');
});

test('an event admin without events gets a message and no Crear evento', async ({ page }) => {
  await mockSession(page, eventAdmin);
  await mockEventList(page, () => []);
  await page.goto('/admin');
  await expect(main(page).getByText('No hay eventos disponibles para tu cuenta.')).toBeVisible();
  await expect(main(page).getByRole('link')).toHaveCount(0);
});

test('Archivados reveals archived events, and Restaurar brings one back with sales closed', async ({
  page,
}) => {
  await mockSession(page);
  let events: EventSummary[] = [...sampleEvents, archivedEvent];
  await mockEventList(page, () => events);
  // The CSRF header of each restore request.
  const restores: (string | undefined)[] = [];
  await page.route(
    (url) => url.port === '3000' && url.pathname === `/admin/events/${archivedEventId}/restore`,
    async (route) => {
      restores.push(route.request().headers()['x-csrf-token']);
      events = events.map((event) =>
        event.id === archivedEventId ? { ...event, archivedAt: null } : event,
      );
      await route.fulfill({
        status: 201,
        json: {
          ...archivedEvent,
          archivedAt: null,
          timeZone: 'America/Mexico_City',
          startsAt: null,
          endsAt: null,
          salesEnabled: false,
        },
      });
    },
  );
  await page.goto('/admin');
  // Archived events stay out of the main list.
  await expect(eventList(page).getByRole('listitem')).toHaveCount(2);
  const toggle = main(page).getByRole('button', { name: 'Archivados (1)' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const archived = main(page).getByRole('list', { name: 'Eventos archivados' });
  const card = archived.getByRole('article', { name: archivedEvent.name });
  await expect(card).toContainText('Archivado');
  await expect(card).toContainText('Folios BP-····');

  await card.getByRole('button', { name: `Restaurar ${archivedEvent.name}` }).click();
  await expect(main(page).getByRole('status')).toContainText(
    `«${archivedEvent.name}» volvió a la lista de eventos. La venta en línea sigue cerrada`,
  );
  expect(restores).toEqual(['csrf-token']);
  await expect(eventList(page).getByRole('listitem')).toHaveCount(3);
  await expect(
    eventList(page).getByRole('link', { name: archivedEvent.name, exact: true }),
  ).toBeVisible();
  await expect(main(page).getByRole('button', { name: /^Archivados/ })).toHaveCount(0);
  await expect(main(page).getByRole('heading', { name: 'Eventos', level: 1 })).toBeFocused();
});

test('a failed restore keeps the event archived and says why', async ({ page }) => {
  await mockSession(page);
  await mockEventList(page, () => [...sampleEvents, archivedEvent]);
  await page.route(
    (url) => url.port === '3000' && url.pathname.endsWith('/restore'),
    (route) => route.fulfill({ status: 500, json: { message: 'private' } }),
  );
  await page.goto('/admin');
  await main(page).getByRole('button', { name: 'Archivados (1)' }).click();
  await main(page)
    .getByRole('button', { name: `Restaurar ${archivedEvent.name}` })
    .click();
  await expect(main(page).getByRole('alert')).toContainText('No se pudo completar la operación');
  await expect(page.getByText('private')).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Archivados (1)' })).toBeVisible();
});

test('an archived event still opens its overview, without the event selector', async ({ page }) => {
  await mockAdminApi(page);
  // The shell's list leaves the archived event out, as the backend does.
  await mockEventList(page, () => [{ ...sampleEvents[1] }]);
  await page.goto(`/admin/events/${activeEventId}`);
  await expect(page.getByRole('heading', { name: 'Resumen del evento' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Evento$/ })).toHaveCount(0);
});
