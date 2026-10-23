import { expect, test, type Page, type Route } from '@playwright/test';
import { eventAdmin, eventSummary, mockEventList, mockSession } from './support/event-mocks.ts';
import { selectTrigger } from './support/select.ts';

// "Archivar o eliminar" on Datos del evento (#213 T10). Blocker wording and the slug match are
// covered by `event-lifecycle-model.test.ts`.
const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const detailsPath = `/admin/events/${eventId}/foundation`;
const api = (url: URL) => url.port === '3000';
const foundationEndpoint = (url: URL) => api(url) && url.pathname === detailsPath;
const eventEndpoint =
  (suffix = '') =>
  (url: URL) =>
    api(url) && url.pathname === `/admin/events/${eventId}${suffix}`;

const event = {
  id: eventId,
  name: 'Encuentro del barrio',
  slug: 'encuentro-del-barrio',
  folioPrefix: 'EB',
  timeZone: 'America/Mexico_City',
  startsAt: null,
  endsAt: null,
  salesEnabled: false,
  archivedAt: null as string | null,
};
const archivedAt = '2026-10-01T12:00:00.000Z';

const foundation = (overrides: Partial<typeof event> = {}, deleteBlockers?: string[]) => ({
  event: { ...event, ...overrides, windowStatus: 'unbounded' },
  venues: [],
  activities: [],
  ...(deleteBlockers ? { deleteBlockers } : {}),
  deferredFields: [],
});

const main = (page: Page) => page.getByRole('main');
const section = (page: Page) => main(page).getByRole('region', { name: 'Archivar o eliminar' });

// The list serves `listed()`, so a screen that reads it after a write sees the new state.
// `json` may be a function, so a reload after a write sees the new state.
async function openDetails(
  page: Page,
  json: unknown,
  { session, listed }: { session?: unknown; listed?: () => ReturnType<typeof eventSummary>[] } = {},
) {
  await mockSession(page, session);
  await mockEventList(page, listed ?? (() => [eventSummary(eventId, event.name)]));
  await page.route(foundationEndpoint, (route) =>
    route.fulfill({ json: typeof json === 'function' ? (json as () => unknown)() : json }),
  );
  await page.goto(detailsPath);
  await expect(main(page).getByRole('form', { name: 'Datos del evento' })).toBeVisible();
}

// Records each request to `endpoint` and answers with `reply`.
async function capture(
  page: Page,
  endpoint: (url: URL) => boolean,
  method: string,
  reply: () => Parameters<Route['fulfill']>[0],
) {
  const calls: { body: unknown; csrf: string | undefined }[] = [];
  await page.route(endpoint, (route) => {
    if (route.request().method() !== method) return route.fallback();
    calls.push({
      body: route.request().postDataJSON() as unknown,
      csrf: route.request().headers()['x-csrf-token'],
    });
    return route.fulfill(reply());
  });
  return calls;
}

test('archives the event after the dialog and lands on the event list', async ({ page }) => {
  let archived = false;
  await openDetails(page, foundation({}, []), {
    listed: () => [eventSummary(eventId, event.name, { archivedAt: archived ? archivedAt : null })],
  });
  const calls = await capture(page, eventEndpoint('/archive'), 'POST', () => {
    archived = true;
    return { status: 201, json: { ...event, archivedAt } };
  });
  await expect(section(page)).toContainText('Cierra la venta y lo quita del selector');
  await section(page).getByRole('button', { name: 'Archivar evento' }).click();

  const dialog = page.getByRole('alertdialog', { name: '¿Archivar Encuentro del barrio?' });
  await expect(dialog.getByRole('listitem')).toHaveCount(5);
  await expect(dialog).toContainText('Los pagos que Mercado Pago confirme después');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls).toHaveLength(0);

  await section(page).getByRole('button', { name: 'Archivar evento' }).click();
  await dialog.getByRole('button', { name: 'Archivar evento' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(main(page).getByRole('status').first()).toContainText(
    '«Encuentro del barrio» se archivó.',
  );
  await expect(main(page).getByRole('tab', { name: /^Archivados/ })).toContainText('1');
  expect(calls).toEqual([{ body: null, csrf: 'csrf-token' }]);
});

test('restores an archived event here and makes it editable again', async ({ page }) => {
  let restored = false;
  await openDetails(page, foundation({ archivedAt }, []), {
    listed: () => [eventSummary(eventId, event.name, { archivedAt: restored ? null : archivedAt })],
  });
  const calls = await capture(page, eventEndpoint('/restore'), 'POST', () => {
    restored = true;
    return { status: 201, json: event };
  });
  const nav = page.getByRole('navigation', { name: 'Navegación administrativa' });
  await expect(selectTrigger(nav, 'Evento')).toHaveCount(0);
  await expect(main(page)).toContainText('Restáuralo abajo, en «Archivar o eliminar»');
  await expect(section(page).getByRole('button', { name: 'Archivar evento' })).toHaveCount(0);
  await expect(section(page)).toContainText('La venta en línea sigue cerrada');

  await section(page).getByRole('button', { name: 'Restaurar evento' }).click();
  await expect(main(page).getByRole('status')).toContainText(
    'Evento restaurado. La venta en línea sigue cerrada',
  );
  await expect(main(page).getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
  await expect(section(page).getByRole('button', { name: 'Archivar evento' })).toBeVisible();
  // The selector reads the list again and shows the event once more.
  await expect(selectTrigger(nav, 'Evento')).toContainText('Encuentro del barrio');
  expect(calls).toHaveLength(1);
});

test('deletes an empty event once its address is typed exactly', async ({ page }) => {
  await openDetails(page, foundation({}, []), { listed: () => [] });
  const calls = await capture(page, eventEndpoint(), 'DELETE', () => ({ status: 204, body: '' }));
  await expect(section(page)).toContainText('Solo para un evento vacío');
  await section(page).getByRole('button', { name: 'Eliminar evento' }).click();

  const dialog = page.getByRole('alertdialog', { name: '¿Eliminar Encuentro del barrio?' });
  await expect(dialog).toContainText(
    'Este evento no tiene actividades, pases ni inscripciones, así que se puede eliminar.',
  );
  await expect(dialog).toContainText('/e/encuentro-del-barrio quedará libre para otro evento.');
  const confirm = dialog.getByRole('button', { name: 'Eliminar para siempre' });
  const field = dialog.getByLabel('Para confirmar, escribe la dirección del evento');
  await expect(confirm).toBeDisabled();
  await field.fill('Encuentro-del-barrio');
  await expect(confirm).toBeDisabled();
  await field.fill('encuentro-del-barrio');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(main(page).getByRole('status').first()).toContainText(
    'Evento eliminado: «Encuentro del barrio» ya no existe',
  );
  expect(calls).toEqual([{ body: { confirmSlug: 'encuentro-del-barrio' }, csrf: 'csrf-token' }]);
});

test('an event with data cannot be deleted and says why', async ({ page }) => {
  await openDetails(page, foundation({}, ['activities', 'passTypes', 'registrations']));
  const button = section(page).getByRole('button', { name: 'Eliminar evento' });
  await expect(button).toBeDisabled();
  await expect(section(page)).toContainText(
    'No disponible: este evento ya tiene actividades, pases e inscripciones. Solo se elimina un evento vacío',
  );
});

test('a delete refused because the event is not empty explains what blocks it', async ({
  page,
}) => {
  // The foundation did not say (an older backend), so the API decides.
  await openDetails(page, foundation());
  await capture(page, eventEndpoint(), 'DELETE', () => ({
    status: 409,
    json: {
      code: 'event_not_empty',
      message: 'Event is not empty',
      blockers: ['registrations', 'checkIns'],
    },
  }));
  await expect(section(page)).toContainText('Si ya tiene actividades, pases o inscripciones');
  await section(page).getByRole('button', { name: 'Eliminar evento' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Eliminar Encuentro del barrio?' });
  await expect(dialog).toContainText('Solo se puede eliminar si no tiene actividades');
  await dialog.getByLabel('Para confirmar, escribe la dirección del evento').fill(event.slug);
  await dialog.getByRole('button', { name: 'Eliminar para siempre' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(section(page).getByRole('button', { name: 'Eliminar evento' })).toBeDisabled();
  await expect(section(page)).toContainText(
    'No disponible: este evento ya tiene inscripciones y check-ins.',
  );
  await expect(page.getByText('Event is not empty')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${detailsPath}$`));
});

test('a delete refused with blockers this panel does not know still says it cannot be deleted', async ({
  page,
}) => {
  await openDetails(page, foundation());
  await capture(page, eventEndpoint(), 'DELETE', () => ({
    status: 409,
    json: { code: 'event_not_empty', message: 'Event is not empty', blockers: ['futureKind'] },
  }));
  await section(page).getByRole('button', { name: 'Eliminar evento' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Eliminar Encuentro del barrio?' });
  await dialog.getByLabel('Para confirmar, escribe la dirección del evento').fill(event.slug);
  await dialog.getByRole('button', { name: 'Eliminar para siempre' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(section(page).getByRole('button', { name: 'Eliminar evento' })).toBeDisabled();
  await expect(section(page)).toContainText('No disponible: este evento ya tiene datos.');
  await expect(section(page)).not.toContainText('Solo para un evento vacío');
});

test('an archive refused because the event was archived meanwhile shows it archived', async ({
  page,
}) => {
  let archivedElsewhere = false;
  await openDetails(page, () => foundation(archivedElsewhere ? { archivedAt } : {}, []));
  await capture(page, eventEndpoint('/archive'), 'POST', () => {
    archivedElsewhere = true;
    return { status: 409, json: { code: 'event_archived', message: 'Event is archived' } };
  });
  await section(page).getByRole('button', { name: 'Archivar evento' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Archivar Encuentro del barrio?' });
  await dialog.getByRole('button', { name: 'Archivar evento' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(section(page).getByRole('button', { name: 'Restaurar evento' })).toBeVisible();
  await expect(main(page)).toContainText('Restáuralo abajo, en «Archivar o eliminar»');
  await expect(main(page).getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
  await expect(page.getByText('Event is archived')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${detailsPath}$`));
});

test('an archive whose answer was lost says so and shows the event as it is now', async ({
  page,
}) => {
  let archivedBeforeLoss = false;
  await openDetails(page, () => foundation(archivedBeforeLoss ? { archivedAt } : {}, []));
  // The archive went through, then the answer was lost.
  await page.route(eventEndpoint('/archive'), (route) => {
    archivedBeforeLoss = true;
    return route.abort('connectionreset');
  });
  await section(page).getByRole('button', { name: 'Archivar evento' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Archivar Encuentro del barrio?' });
  await dialog.getByRole('button', { name: 'Archivar evento' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(section(page).getByRole('button', { name: 'Restaurar evento' })).toBeVisible();
  await expect(main(page).getByRole('alert')).toContainText(
    'No pudimos confirmar si el evento se archivó. Revisamos su estado de nuevo.',
  );
});

test('a restore refused because the event was restored meanwhile shows it editable', async ({
  page,
}) => {
  let restoredElsewhere = false;
  await openDetails(page, () => foundation(restoredElsewhere ? {} : { archivedAt }, []));
  await capture(page, eventEndpoint('/restore'), 'POST', () => {
    restoredElsewhere = true;
    return { status: 409, json: { code: 'event_not_archived', message: 'Event is not archived' } };
  });
  await section(page).getByRole('button', { name: 'Restaurar evento' }).click();

  await expect(section(page).getByRole('button', { name: 'Archivar evento' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
  await expect(main(page)).not.toContainText('Restáuralo abajo');
  await expect(main(page).getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Event is not archived')).toHaveCount(0);
});

test('a delete whose answer was lost says it may be gone and shows the list', async ({ page }) => {
  await openDetails(page, foundation({}, []), { listed: () => [] });
  await page.route(eventEndpoint(), (route) =>
    route.request().method() === 'DELETE' ? route.abort('connectionreset') : route.fallback(),
  );
  await section(page).getByRole('button', { name: 'Eliminar evento' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Eliminar Encuentro del barrio?' });
  await dialog.getByLabel('Para confirmar, escribe la dirección del evento').fill(event.slug);
  await dialog.getByRole('button', { name: 'Eliminar para siempre' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(main(page).getByRole('status').first()).toContainText(
    'No pudimos confirmar si «Encuentro del barrio» se eliminó.',
  );
});

test('a failed archive keeps the dialog open with the reason', async ({ page }) => {
  await openDetails(page, foundation({}, []));
  await capture(page, eventEndpoint('/archive'), 'POST', () => ({
    status: 500,
    json: { message: 'Private backend detail' },
  }));
  await section(page).getByRole('button', { name: 'Archivar evento' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Archivar Encuentro del barrio?' });
  await dialog.getByRole('button', { name: 'Archivar evento' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo completar la operación.');
  await expect(page.getByText('Private backend detail')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${detailsPath}$`));
});

test('admins scoped to the event do not see the section', async ({ page }) => {
  await openDetails(page, foundation({}, []), { session: eventAdmin });
  await expect(main(page).getByRole('region', { name: 'Sedes' })).toBeVisible();
  await expect(section(page)).toHaveCount(0);
});

test('admins scoped to an archived event are told who can restore it', async ({ page }) => {
  await openDetails(page, foundation({ archivedAt }, []), { session: eventAdmin });
  await expect(main(page)).toContainText('Pide a un administrador general que lo restaure.');
  await expect(section(page)).toHaveCount(0);
});
