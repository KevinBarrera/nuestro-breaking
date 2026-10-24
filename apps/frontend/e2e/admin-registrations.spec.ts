import { expect, test, type Page } from '@playwright/test';
import {
  cashConfirmed,
  catalogActivity,
  catalogPassType,
  created,
  duplicateMatch,
  eventId,
  heldPass,
  heldPassId,
  mockRegistrations,
  newRegistrationPath,
  otherRegistrationId,
  possibleDuplicates,
  registrationId,
  registrationPath,
  registrationsPath,
  registrationSummary,
  saleActivities,
  saleBackend,
  salePassTypes,
  salePath,
  searchPage,
  searchResult,
  thirdRegistrationId,
} from './support/registration-mocks.ts';

// Inscripciones (#105, #345). Status labels, list rows and chips, query rules, server field errors and duplicate rows are
// covered by `registration-model.test.ts`; these specs check the rendered flows.
const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });
const form = (page: Page) => page.getByRole('form', { name: 'Nueva inscripción' });
const field = (page: Page, name: string) => form(page).getByRole('textbox', { name, exact: true });
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Buscar inscripción' });
const duplicatesDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: '¿Es la misma persona?' });

async function fillRequired(page: Page, phone = '33 1234 5678') {
  await field(page, 'Nombre(s)').fill(' Ana ');
  await field(page, 'Primer apellido').fill('López');
  await field(page, 'Correo electrónico').fill('ana@example.org');
  await field(page, 'Teléfono celular').fill(phone);
}

const register = (page: Page) =>
  form(page).getByRole('button', { name: 'Continuar a pases' }).click();
const steps = (page: Page) => page.getByRole('list', { name: 'Pasos' }).getByRole('listitem');

const expectedBody = {
  firstName: 'Ana',
  firstLastName: 'López',
  email: 'ana@example.org',
  phone: '+52 3312345678',
};

test('lists the roster, filters by status, searches live and opens one', async ({ page }) => {
  const luz = {
    ...searchResult(registrationId, 'Luz Rivera', {
      stageName: 'Luz',
      folio: 'EV-7K3Q',
      status: 'confirmed',
    }),
    passes: [
      { name: 'Open Styles', passClass: 'add_on' },
      { name: 'Pase completo', passClass: 'full' },
    ],
    activities: [
      { id: 'a1', name: 'Batalla de crews', kind: 'competition', checkedInAt: null },
      { id: 'a2', name: 'Taller de footwork', kind: 'workshop', checkedInAt: null },
    ],
  };
  const luis = searchResult(otherRegistrationId, 'Luis Ruiz');
  const counts = { all: 2, pending_payment: 1, confirmed: 1, voided: 0 };
  const { searches } = await mockRegistrations(page, {
    search: (url) => {
      const status = url.searchParams.get('status');
      const rows = [luz, luis].filter((row) => !status || row.registration.status === status);
      return { json: searchPage(rows, { counts }) };
    },
    entitlements: (id) => ({
      json: {
        registration: registrationSummary(id, {
          fullName: 'Luz Rivera',
          stageName: 'Luz',
          folio: 'EV-7K3Q',
          status: 'confirmed',
        }),
        passes: [heldPass],
        accessibleActivityIds: [],
      },
    }),
  });
  await page.goto(`/admin/events/${eventId}`);
  await sideNav(page).getByRole('link', { name: 'Inscripciones' }).click();
  await expect(page).toHaveURL(registrationsPath);
  await expect(sideNav(page).getByRole('link', { name: 'Inscripciones' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // The roster shows without searching.
  await expect(page.getByText('2 inscripciones')).toBeVisible();
  const rows = page.getByRole('list', { name: 'Inscripciones' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  const luzRow = rows.nth(0).getByRole('link', {
    name: 'Luz Rivera, EV-7K3Q, Confirmada. Ver inscripción',
  });
  for (const text of ['AKA Luz', 'Pase completo + Open Styles', 'Batalla de crews'])
    await expect(luzRow).toContainText(text);
  await expect(luzRow).not.toContainText('Taller de footwork');
  await expect(
    rows
      .nth(1)
      .getByRole('link', { name: 'Luis Ruiz, sin folio, Pendiente de pago. Ver inscripción' }),
  ).toContainText('Sin pases');

  // The chips filter by status and keep every count.
  const chips = page.getByRole('group', { name: 'Filtrar por estado' });
  await expect(chips.getByRole('button', { name: 'Todas 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await chips.getByRole('button', { name: 'Pendientes de pago 1' }).click();
  await expect(page).toHaveURL(`${registrationsPath}?estado=pending_payment`);
  await expect(rows).toHaveCount(1);
  await expect(chips.getByRole('button', { name: 'Confirmadas 1' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await chips.getByRole('button', { name: 'Todas 2' }).click();
  await expect(rows).toHaveCount(2);

  // Typing searches once it settles, without a button.
  await searchBox(page).fill(' Lu ');
  await expect(page).toHaveURL(`${registrationsPath}?q=Lu`);
  await expect(page.getByText('2 resultados')).toBeVisible();
  expect(searches.at(-1)?.search).toBe('?q=Lu&limit=20&offset=0');

  await luzRow.click();
  await expect(page).toHaveURL(registrationPath(registrationId));
  await expect(sideNav(page).getByRole('link', { name: 'Inscripciones' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Back keeps the search in the URL, so the results come back.
  await page.goBack();
  await expect(searchBox(page)).toHaveValue('Lu');
  await expect(page.getByText('2 resultados')).toBeVisible();
  await page.getByRole('button', { name: 'Borrar búsqueda' }).click();
  await expect(searchBox(page)).toHaveValue('');
  await expect(page).toHaveURL(registrationsPath);
  await expect(page.getByText('2 inscripciones')).toBeVisible();
});

test('opens a pending registration with its sale from the list', async ({ page }) => {
  const breaking = catalogActivity(
    'a1b2c3d4-1234-4567-89ab-123456789abc',
    'Breaking 1 vs 1',
    '2026-11-14T18:00:00.000Z',
  );
  await mockRegistrations(page, {
    search: () => ({
      json: searchPage([
        searchResult(registrationId, 'Luz Rivera', { folio: 'EV-7K3Q', status: 'confirmed' }),
        searchResult(otherRegistrationId, 'Luis Ruiz'),
      ]),
    }),
    entitlements: (id) => ({
      json: {
        registration: registrationSummary(id, { fullName: 'Luis Ruiz' }),
        passes: [heldPass],
        accessibleActivityIds: [],
      },
    }),
    passTypes: () => ({
      json: [
        catalogPassType(heldPass.passTypeId, 'Pase completo', 'full', 150000, {
          activities: [{ activityId: breaking.id, access: 'selectable' }],
        }),
      ],
    }),
    activities: () => ({ json: [breaking] }),
  });
  await page.goto(registrationsPath);
  await page.getByRole('link', { name: /^Luis Ruiz, sin folio, Pendiente de pago/ }).click();

  await expect(page).toHaveURL(registrationPath(otherRegistrationId));
  await expect(page.getByRole('heading', { level: 1, name: 'Luis Ruiz' })).toBeVisible();
  // The sale goes on in Nueva inscripción's steps (#346), not on the detail.
  const sale = page.getByRole('region', { name: 'Venta pendiente' });
  await expect(sale).toBeVisible();
  for (const name of ['Agregar pase', 'Competencias', 'Pago en efectivo'])
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Pases' })).toContainText(
    'Sin competencias elegidas.',
  );

  await sale.getByRole('link', { name: 'Continuar venta' }).click();
  await expect(page).toHaveURL(salePath(otherRegistrationId));
  await expect(steps(page).nth(1)).toHaveAttribute('aria-current', 'step');
  // The held pass and its competitions are already chosen.
  await expect(page.getByRole('radio', { name: /^Pase completo/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Breaking 1 vs 1' })).not.toBeChecked();
});

test('pages through results 20 at a time', async ({ page }) => {
  const { searches } = await mockRegistrations(page, {
    search: (url) => {
      const offset = Number(url.searchParams.get('offset'));
      const rows = offset === 0 ? 20 : 5;
      return {
        json: searchPage(
          Array.from({ length: rows }, (_, index) =>
            searchResult(
              `c${String(index).padStart(2, '0')}b2c3d-1234-4567-89ab-123456789abc`,
              `Persona ${offset + index + 1}`,
            ),
          ),
          { total: 25, offset },
        ),
      };
    },
  });
  await page.goto(`${registrationsPath}?q=Persona`);
  await expect(page.getByText('Mostrando 1–20 de 25')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anteriores' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Siguientes' }).click();
  await expect(page.getByText('Mostrando 21–25 de 25')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguientes' })).toHaveCount(0);
  // The dev server's StrictMode may send the first search twice (the first one is aborted).
  expect(new Set(searches.map((url) => url.searchParams.get('offset')))).toEqual(
    new Set(['0', '20']),
  );
});

test('waits for 2 characters before searching', async ({ page }) => {
  const { searches } = await mockRegistrations(page, {
    search: () => ({ json: searchPage([searchResult(registrationId, 'Luz Rivera')]) }),
  });
  await page.goto(registrationsPath);
  await expect(page.getByText('1 inscripción')).toBeVisible();
  const before = searches.length;
  await searchBox(page).fill(' a ');
  // Longer than the search delay: one character never reaches the API.
  await page.waitForTimeout(600);
  expect(searches).toHaveLength(before);
  await expect(page).toHaveURL(registrationsPath);
});

test('says when a search finds nothing', async ({ page }) => {
  await mockRegistrations(page, {
    search: (url) => ({
      json: url.searchParams.get('q')
        ? searchPage([], { counts: { all: 0, pending_payment: 0, confirmed: 0, voided: 0 } })
        : searchPage([searchResult(registrationId, 'Luz Rivera')]),
    }),
  });
  await page.goto(registrationsPath);
  await searchBox(page).fill('zz');
  await expect(page.getByText('No encontramos a nadie con “zz”')).toBeVisible();
  await expect(page.getByText('0 resultados')).toBeVisible();
  await page.getByRole('link', { name: 'Inscribir a una persona nueva' }).click();
  await expect(page).toHaveURL(newRegistrationPath);
});

test('explains how registrations arrive when the event has none', async ({ page }) => {
  await mockRegistrations(page);
  await page.goto(registrationsPath);
  await expect(page.getByRole('heading', { name: 'Aún no hay inscripciones' })).toBeVisible();
  await expect(searchBox(page)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Filtrar por estado' })).toHaveCount(0);
  for (const [name, path] of [
    ['Catálogo › Actividades', 'activities'],
    ['Catálogo › Pases', 'passes'],
  ])
    await expect(page.getByRole('link', { name })).toHaveAttribute(
      'href',
      `/admin/events/${eventId}/${path}`,
    );
  await expect(page.getByRole('link', { name: 'Resumen del evento' })).toHaveAttribute(
    'href',
    `/admin/events/${eventId}`,
  );
  await page.getByRole('link', { name: 'Inscribir a alguien en mesa' }).click();
  await expect(page).toHaveURL(newRegistrationPath);
});

test('retries a list that failed to load', async ({ page }) => {
  let failing = true;
  await mockRegistrations(page, {
    search: () =>
      failing
        ? { abort: true }
        : { json: searchPage([searchResult(registrationId, 'Luz Rivera')]) },
  });
  await page.goto(registrationsPath);
  await expect(
    page.getByText('No pudimos cargar las inscripciones. Intenta de nuevo.'),
  ).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('1 inscripción')).toBeVisible();
  await expect(page.getByText('No pudimos cargar las inscripciones.')).toHaveCount(0);
});

test('registers a participant and opens the new registration', async ({ page }) => {
  const { creates } = await mockRegistrations(page);
  await page.goto(registrationsPath);
  await page.getByRole('link', { name: 'Nueva inscripción' }).click();
  await expect(page).toHaveURL(newRegistrationPath);
  await expect(page.getByRole('heading', { level: 1, name: 'Nueva inscripción' })).toBeVisible();
  await expect(sideNav(page).getByRole('link', { name: 'Inscripciones' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Step 1 of 3, with autofill off for someone else's data.
  await expect(steps(page)).toHaveText([
    /^1Participante, paso actual/,
    /^2Pases, pendiente/,
    /^3Cobro, pendiente/,
  ]);
  await expect(steps(page).nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(form(page)).toHaveAttribute('autocomplete', 'off');
  await expect(field(page, 'Nombre(s)')).toHaveAttribute('autocomplete', 'off');
  await expect(form(page).getByRole('link', { name: 'Cancelar' })).toHaveAttribute(
    'href',
    registrationsPath,
  );

  await fillRequired(page);
  await field(page, 'AKA o nombre artístico (opcional)').fill('Anita');
  await register(page);

  await expect(page).toHaveURL(salePath(registrationId));
  expect(creates).toEqual([{ body: { ...expectedBody, stageName: 'Anita' }, csrf: 'csrf-token' }]);
  expect(creates[0].body).not.toHaveProperty('activityIds');
  await expect(page.getByRole('heading', { level: 1, name: 'Nueva inscripción' })).toBeVisible();
  await expect(steps(page).nth(0)).toContainText('completado');
  await expect(steps(page).nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Pase de Ana' })).toBeVisible();
  await expect(sideNav(page).getByRole('link', { name: 'Inscripciones' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('sells a registration in three steps, confirms it and starts the next one', async ({
  page,
}) => {
  const { general, popping, openStyles } = salePassTypes;
  const backend = saleBackend();
  const sent = await mockRegistrations(page, {
    ...backend.mocks,
    cash: () => ({ status: 201, json: cashConfirmed(registrationId, 'LMP-K2M7') }),
  });
  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await register(page);
  await expect(page).toHaveURL(salePath(registrationId));

  // Step 2: an add-on waits for a full pass; changing the full pass drops its competitions.
  const footer = page.getByRole('form', { name: 'Pase de Ana' });
  const addOn = page.getByRole('checkbox', { name: /^Open Styles/ });
  await expect(addOn).toBeDisabled();
  await expect(page.getByText('Requiere un pase completo.')).toBeVisible();
  await footer.getByRole('button', { name: 'Continuar al cobro' }).click();
  await expect(page.getByRole('alert')).toHaveText('Elige un pase para continuar.');
  expect(sent.addedPasses).toHaveLength(0);

  await page.getByRole('radio', { name: /^Entrada general/ }).check();
  await expect(footer).toContainText('Total$1,000.00');
  await page.getByRole('radio', { name: /^Pase completo Popping/ }).check();
  const competitions = page.getByRole('group', { name: 'Competencias de Pase completo Popping' });
  await expect(competitions.locator('label')).toHaveText(['Popping 1v1', 'Popping 2v2']);
  await competitions.getByRole('checkbox', { name: 'Popping 2v2' }).check();
  await competitions.getByRole('checkbox', { name: 'Popping 1v1' }).check();
  await addOn.check();
  await expect(page.getByText('Open Styles 1vs1. Se suma al pase completo.')).toBeVisible();
  await expect(footer).toContainText('Total$2,800.00');
  await footer.getByRole('button', { name: 'Continuar al cobro' }).click();

  // The base first, then its add-on, then the competitions in the order shown.
  const cobro = page.getByRole('form', { name: 'Cobro en efectivo' });
  await expect(cobro).toBeVisible();
  expect(sent.addedPasses).toEqual([
    { registrationId, body: { passTypeId: popping.id }, csrf: 'csrf-token' },
    { registrationId, body: { passTypeId: openStyles.id }, csrf: 'csrf-token' },
  ]);
  expect(sent.selections).toEqual([
    {
      registrationId,
      registrationPassId: heldPassId(popping),
      body: { activityIds: [saleActivities.popping1.id, saleActivities.popping2.id] },
      csrf: 'csrf-token',
    },
  ]);
  expect(sent.addedPasses.map((pass) => pass.body)).not.toContainEqual({
    passTypeId: general.id,
  });

  // Step 3: the summary, the prefilled amount and the receipt.
  await expect(steps(page).nth(2)).toHaveAttribute('aria-current', 'step');
  await expect(cobro).toContainText('Ana López');
  await expect(cobro).toContainText('ana@example.org · +52 3312345678');
  const lines = cobro.getByRole('list', { name: 'Pases' }).getByRole('listitem');
  await expect(lines).toHaveText([
    'Pase completo PoppingPopping 1v1, Popping 2v2$2,000.00',
    'Open StylesOpen Styles 1vs1$800.00',
  ]);
  await expect(cobro).toContainText('Total a cobrar$2,800.00');
  const amount = cobro.getByRole('textbox', { name: 'Monto recibido (MXN)' });
  await expect(amount).toHaveValue('2800.00');
  await expect(cobro).toContainText('Coincide con el total.');
  await amount.fill('2500');
  await expect(cobro).toContainText(
    'No coincide con el total ($2,800.00). Puedes continuar si así dice el recibo.',
  );
  await cobro.getByRole('button', { name: 'Confirmar inscripción' }).click();
  await expect(cobro.getByText('Escribe el número impreso en el recibo.')).toBeVisible();
  expect(sent.cash).toHaveLength(0);
  await cobro.getByRole('textbox', { name: 'Número de recibo' }).fill(' 08590 ');
  await cobro.getByRole('button', { name: 'Confirmar inscripción' }).click();

  // Step 4: the folio from the answer.
  await expect(page.getByRole('heading', { name: 'Inscripción confirmada' })).toBeFocused();
  expect(sent.cash).toEqual([
    { registrationId, body: { amount: 250000, receipt: '08590' }, csrf: 'csrf-token' },
  ]);
  const main = page.getByRole('main');
  await expect(main).toContainText(
    'La inscripción de Ana López quedó lista. Le enviamos la confirmación y el folio a ana@example.org.',
  );
  await expect(main).toContainText('LMP-K2M7');
  await expect(main).toContainText('Pase completo Popping + Open Styles · $2,800.00');
  await expect(page.getByRole('list', { name: 'Pasos' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ver inscripción' })).toHaveAttribute(
    'href',
    registrationPath(registrationId),
  );

  await page.getByRole('link', { name: 'Inscribir a otra persona' }).click();
  await expect(page).toHaveURL(newRegistrationPath);
  await expect(field(page, 'Nombre(s)')).toHaveValue('');
  await expect(steps(page).nth(0)).toHaveAttribute('aria-current', 'step');
});

test('goes back to the saved participant and on to the passes', async ({ page }) => {
  await mockRegistrations(page, saleBackend().mocks);
  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await field(page, 'AKA o nombre artístico (opcional)').fill('Anita');
  await register(page);
  await page.getByRole('button', { name: 'Atrás' }).click();

  // Read-only: the registration exists, so name fixes go through its correction.
  const saved = page.getByRole('form', { name: '¿Quién se inscribe?' });
  await expect(saved.getByRole('heading', { name: '¿Quién se inscribe?' })).toBeFocused();
  await expect(saved.getByRole('textbox')).toHaveCount(0);
  await expect(saved).toContainText('Ana López');
  await expect(saved).toContainText('ana@example.org · +52 3312345678');
  await expect(saved).toContainText('«Corregir nombre o AKA»');
  await expect(steps(page).nth(0)).toHaveAttribute('aria-current', 'step');
  await saved.getByRole('button', { name: 'Continuar a pases' }).click();
  await expect(page.getByRole('heading', { name: 'Pase de Ana' })).toBeFocused();
});

test('fits a phone screen on every step', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockRegistrations(page, saleBackend().mocks);
  const fits = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
  await page.goto(newRegistrationPath);
  await fits();
  await fillRequired(page);
  await register(page);
  await page.getByRole('radio', { name: /^Pase completo Popping/ }).check();
  await fits();
  await page.getByRole('button', { name: 'Continuar al cobro' }).click();
  await page.getByRole('textbox', { name: 'Número de recibo' }).waitFor();
  await fits();
});

test('focuses the first invalid field and opens Más datos for its errors', async ({ page }) => {
  const { creates } = await mockRegistrations(page);
  await page.goto(newRegistrationPath);
  await field(page, 'Correo electrónico').fill('ana@example.org');
  await register(page);
  await expect(field(page, 'Nombre(s)')).toBeFocused();
  await expect(form(page).getByText('Escribe el nombre.')).toHaveCount(2);
  await expect(page.getByRole('alert')).toContainText('Revisa estos datos:');

  await fillRequired(page);
  await form(page).locator('summary').click();
  await form(page).getByLabel('Fecha de nacimiento').fill('2999-01-01');
  await form(page).locator('summary').click();
  await register(page);
  await expect(form(page).getByLabel('Fecha de nacimiento')).toBeFocused();
  await expect(form(page).getByText('La fecha no puede ser futura.').first()).toBeVisible();
  expect(creates).toHaveLength(0);
});

test('sends an international phone with its country code', async ({ page }) => {
  const { creates } = await mockRegistrations(page);
  await page.goto(newRegistrationPath);
  await form(page).getByRole('radio', { name: 'Otro país' }).check();
  await fillRequired(page, '+1 (555) 123-4567');
  await register(page);
  await expect(page).toHaveURL(salePath(registrationId));
  expect(creates.map((sent) => sent.body)).toEqual([{ ...expectedBody, phone: '+15551234567' }]);
});

test('confirms possible duplicates and registers another person', async ({ page }) => {
  const first = duplicateMatch(otherRegistrationId);
  const second = duplicateMatch(thirdRegistrationId, {
    fullName: 'Ana López',
    stageName: null,
    folio: 'EV-7K3Q',
    status: 'confirmed',
    maskedEmail: null,
    maskedPhone: '******5678',
  });
  const { creates } = await mockRegistrations(page, {
    create: (attempt) =>
      attempt === 1
        ? possibleDuplicates([first])
        : attempt === 2
          ? possibleDuplicates([first, second])
          : { status: 201, json: created() },
  });
  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await register(page);

  const dialog = duplicatesDialog(page);
  await expect(dialog).toBeVisible();
  for (const text of ['Alex Rivera', 'Flash', 'Sin folio', 'Pendiente de pago', 'a***@example.com'])
    await expect(dialog).toContainText(text);
  await expect(dialog).toContainText('******4567');
  await dialog.getByRole('button', { name: 'Es otra persona, registrar' }).click();

  // The server found another match meanwhile: it is shown before anything is confirmed.
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  const confirmed = dialog.getByRole('listitem').nth(1);
  for (const text of ['Ana López', 'EV-7K3Q', 'Confirmada', 'Sin correo', '******5678'])
    await expect(confirmed).toContainText(text);
  await expect(
    confirmed.getByRole('button', { name: /Continuar con esta inscripción/ }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Es otra persona, registrar' }).click();

  await expect(page).toHaveURL(salePath(registrationId));
  expect(creates.map((sent) => sent.body)).toEqual([
    expectedBody,
    { ...expectedBody, confirmedDuplicateRegistrationIds: [otherRegistrationId] },
    {
      ...expectedBody,
      confirmedDuplicateRegistrationIds: [otherRegistrationId, thirdRegistrationId],
    },
  ]);
});

test('continues with a pending duplicate instead of registering again', async ({ page }) => {
  const { creates } = await mockRegistrations(page, {
    create: () => possibleDuplicates([duplicateMatch(otherRegistrationId)]),
    entitlements: (id) => ({
      json: {
        registration: registrationSummary(id, {
          fullName: 'Alex Rivera',
          firstName: 'Alex',
          firstLastName: 'Rivera',
          stageName: 'Flash',
        }),
        passes: [],
        accessibleActivityIds: [],
      },
    }),
  });
  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await register(page);
  await duplicatesDialog(page)
    .getByRole('button', { name: 'Continuar con esta inscripción: Alex Rivera' })
    .click();

  // No unsaved-changes warning: the operator chose where to go, the pass step of that sale.
  await expect(page).toHaveURL(salePath(otherRegistrationId));
  await expect(page.getByRole('heading', { name: 'Pase de Alex' })).toBeVisible();
  expect(creates).toHaveLength(1);
});

test('cancelling the duplicates dialog keeps the form as typed', async ({ page }) => {
  const { creates } = await mockRegistrations(page, {
    create: () => possibleDuplicates([duplicateMatch(otherRegistrationId)]),
  });
  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await register(page);
  await duplicatesDialog(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(duplicatesDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(newRegistrationPath);
  await expect(field(page, 'Nombre(s)')).toHaveValue(' Ana ');
  expect(creates).toHaveLength(1);
});

test('shows server field errors on their fields', async ({ page }) => {
  await mockRegistrations(page, {
    create: () => ({
      status: 400,
      json: {
        statusCode: 400,
        message: 'Invalid manual registration',
        fieldErrors: { email: 'invalid' },
      },
    }),
  });
  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await register(page);
  const email = field(page, 'Correo electrónico');
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(
    form(page).getByText('Escribe un correo válido, por ejemplo nombre@correo.com.').first(),
  ).toBeVisible();
  await expect(page).toHaveURL(newRegistrationPath);
});

test('says when the account has no access', async ({ page }) => {
  await mockRegistrations(page, {
    search: () => ({ status: 401, json: { statusCode: 401 } }),
    create: () => ({ status: 401, json: { statusCode: 401 } }),
  });
  await page.goto(`${registrationsPath}?q=Luz`);
  await expect(page.getByRole('alert')).toHaveText(
    'Sin acceso: tu cuenta no puede consultar las inscripciones de este evento.',
  );

  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await register(page);
  await expect(form(page).getByRole('alert')).toHaveText(
    'Sin acceso: tu cuenta no puede registrar inscripciones en este evento.',
  );
});

test('does not claim or retry a registration whose answer was lost', async ({ page }) => {
  const { creates } = await mockRegistrations(page, { create: () => ({ abort: true }) });
  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await register(page);
  const alert = form(page).getByRole('alert');
  await expect(alert).toContainText(
    'No pudimos confirmar si la inscripción se guardó. Busca al participante antes de intentarlo de nuevo.',
  );
  await expect(alert.getByRole('link', { name: 'Ir a Inscripciones' })).toHaveAttribute(
    'href',
    registrationsPath,
  );
  await expect(page).toHaveURL(newRegistrationPath);
  expect(creates).toHaveLength(1);
});

test('says when the registration is not in this event', async ({ page }) => {
  await mockRegistrations(page, {
    entitlements: () => ({ status: 404, json: { statusCode: 404 } }),
  });
  await page.goto(registrationPath(otherRegistrationId));
  await expect(page.getByRole('heading', { level: 1, name: 'Inscripción' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(
    'No encontramos esta inscripción en este evento.',
  );
  await expect(
    page.getByRole('navigation', { name: 'Ruta de navegación' }).getByRole('link', {
      name: 'Inscripciones',
    }),
  ).toHaveAttribute('href', registrationsPath);
});
