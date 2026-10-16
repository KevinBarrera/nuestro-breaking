import { expect, test, type Page } from '@playwright/test';
import {
  created,
  duplicateMatch,
  eventId,
  heldPass,
  mockRegistrations,
  newRegistrationPath,
  otherRegistrationId,
  possibleDuplicates,
  registrationId,
  registrationPath,
  registrationsPath,
  searchPage,
  searchResult,
  thirdRegistrationId,
} from './support/registration-mocks.ts';

// Inscripciones (#105). Status labels, query rules, server field errors and duplicate rows are
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

const register = (page: Page) => form(page).getByRole('button', { name: 'Registrar' }).click();

const expectedBody = {
  firstName: 'Ana',
  firstLastName: 'López',
  email: 'ana@example.org',
  phone: '+52 3312345678',
};

test('searches registrations and opens one from the results', async ({ page }) => {
  const { searches } = await mockRegistrations(page, {
    search: () => ({
      json: searchPage([
        {
          ...searchResult(registrationId, 'Luz Rivera', {
            stageName: 'Luz',
            folio: 'EV-7K3Q',
            status: 'confirmed',
          }),
          activities: [
            { id: 'a1', name: 'Batalla de crews', kind: 'battle', checkedInAt: null },
            { id: 'a2', name: 'Taller de footwork', kind: 'workshop', checkedInAt: null },
          ],
        },
        searchResult(otherRegistrationId, 'Luis Ruiz'),
      ]),
    }),
    entitlements: () => ({ json: { passes: [heldPass], accessibleActivityIds: [] } }),
  });
  await page.goto(`/admin/events/${eventId}`);
  await sideNav(page).getByRole('link', { name: 'Inscripciones' }).click();
  await expect(page).toHaveURL(registrationsPath);
  await expect(sideNav(page).getByRole('link', { name: 'Inscripciones' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await searchBox(page).fill(' Lu ');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('2 inscripciones')).toBeVisible();
  expect(searches.map((url) => url.search)).toEqual(['?q=Lu&limit=20&offset=0']);
  const results = page.getByRole('region', { name: 'Resultados' }).getByRole('listitem');
  await expect(results).toHaveCount(2);
  const luz = results.nth(0);
  for (const text of ['Luz Rivera', 'AKA Luz', 'EV-7K3Q', 'Confirmada'])
    await expect(luz).toContainText(text);
  await expect(luz).toContainText('Batalla de crews, Taller de footwork');
  await expect(results.nth(1)).toContainText('Sin folio');
  await expect(results.nth(1)).toContainText('Pendiente de pago');
  await expect(results.nth(1)).toContainText('Sin actividades');

  await luz.getByRole('link').click();
  await expect(page).toHaveURL(registrationPath(registrationId));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inscripción de Luz Rivera' }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Confirmada');
  const passes = page.getByRole('region', { name: 'Pases' });
  await expect(passes).toContainText('Pase completo');
  await expect(passes).toContainText('$1,500.00');
  await expect(sideNav(page).getByRole('link', { name: 'Inscripciones' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Back keeps the search in the URL, so the results come back.
  await page.goBack();
  await expect(searchBox(page)).toHaveValue('Lu');
  await expect(page.getByText('2 inscripciones')).toBeVisible();
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

test('asks for 2 characters before searching', async ({ page }) => {
  const { searches } = await mockRegistrations(page);
  await page.goto(registrationsPath);
  await searchBox(page).fill(' a ');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Escribe al menos 2 caracteres para buscar.')).toBeVisible();
  await expect(searchBox(page)).toHaveAttribute('aria-invalid', 'true');
  expect(searches).toHaveLength(0);
});

test('says when a search finds nothing', async ({ page }) => {
  await mockRegistrations(page);
  await page.goto(registrationsPath);
  await searchBox(page).fill('zz');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Sin resultados para «zz».')).toBeVisible();
});

test('searching again with the same text retries a failed search', async ({ page }) => {
  let failing = true;
  const { searches } = await mockRegistrations(page, {
    search: () =>
      failing
        ? { abort: true }
        : { json: searchPage([searchResult(registrationId, 'Luz Rivera')]) },
  });
  await page.goto(registrationsPath);
  await searchBox(page).fill('Luz');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(
    page.getByText('No pudimos buscar las inscripciones. Intenta de nuevo.'),
  ).toBeVisible();

  failing = false;
  const before = searches.length;
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('1 inscripción')).toBeVisible();
  expect(searches.length).toBeGreaterThan(before);
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

  await fillRequired(page);
  await field(page, 'AKA / nombre artístico (opcional)').fill('Anita');
  await register(page);

  await expect(page).toHaveURL(registrationPath(registrationId));
  expect(creates).toEqual([{ body: { ...expectedBody, stageName: 'Anita' }, csrf: 'csrf-token' }]);
  expect(creates[0].body).not.toHaveProperty('activityIds');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inscripción de Ana López' }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Pendiente de pago');
  await expect(page.getByText('Aún no tiene pases.')).toBeVisible();
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
  await form(page).getByText('Más datos (opcional)').click();
  await form(page).getByLabel('Fecha de nacimiento').fill('2999-01-01');
  await form(page).getByText('Más datos (opcional)').click();
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
  await expect(page).toHaveURL(registrationPath(registrationId));
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

  await expect(page).toHaveURL(registrationPath(registrationId));
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
  });
  await page.goto(newRegistrationPath);
  await fillRequired(page);
  await register(page);
  await duplicatesDialog(page)
    .getByRole('button', { name: 'Continuar con esta inscripción: Alex Rivera' })
    .click();

  // No unsaved-changes warning: the operator chose where to go.
  await expect(page).toHaveURL(registrationPath(otherRegistrationId));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inscripción de Alex Rivera' }),
  ).toBeVisible();
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
