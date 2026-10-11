import { expect, test } from '@playwright/test';
import { activationToken, mockActivation } from './support/activation-mocks.ts';

const invalidLink = 'Este enlace no es válido o ya venció. Pide uno nuevo a un administrador.';
const strong = 'Breaking2026!';

test('activates from the link, clears the token from the address and goes to sign-in', async ({
  page,
}) => {
  await page.route(
    (url) => url.port === '3000' && url.pathname === '/auth/session',
    (route) => route.fulfill({ status: 401, json: {} }),
  );
  const requests = await mockActivation(page);
  await page.goto(`/activar-cuenta#${activationToken}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Activa tu cuenta' })).toBeVisible();
  await expect(page.getByText('Persona de entrada')).toBeVisible();
  await expect(page.getByText('staff1@example.org')).toBeVisible();
  expect(page.url()).toMatch(/\/activar-cuenta$/);
  // The dev server's StrictMode may check twice (the first one aborted); each sends the token
  // only in the body and without cookies.
  expect(requests.check.length).toBeGreaterThanOrEqual(1);
  for (const check of requests.check) {
    expect(check.url()).not.toContain(activationToken);
    expect(check.postDataJSON()).toEqual({ token: activationToken });
    expect(check.headers().cookie).toBeUndefined();
  }

  const form = page.getByRole('form', { name: 'Activa tu cuenta' });
  const rules = form.getByRole('list', { name: 'Reglas de la contraseña' });
  await form.getByLabel('Crea tu contraseña').fill('Breaking2026');
  await expect(rules.getByRole('listitem')).toHaveText([
    'Cumple: 12 caracteres o más',
    'Cumple: Una letra mayúscula',
    'Cumple: Una letra minúscula',
    'Cumple: Un número',
    'Falta: Un símbolo, por ejemplo ! # $ %',
  ]);
  await form.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(form.getByText('La contraseña todavía no cumple todas las reglas.')).toBeVisible();
  await expect(form.getByLabel('Crea tu contraseña')).toBeFocused();

  await form.getByLabel('Crea tu contraseña').fill(strong);
  await form.getByLabel('Repite la contraseña').fill('Breaking2026?');
  await form.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(form.getByText('Las contraseñas no coinciden.')).toBeVisible();
  expect(requests.activate).toHaveLength(0);

  await form.getByLabel('Repite la contraseña').fill(strong);
  await form.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(page).toHaveURL('/admin');
  expect(requests.activate.map((request) => request.postDataJSON() as unknown)).toEqual([
    { token: activationToken, password: strong },
  ]);
  await expect(page.getByRole('status')).toHaveText(
    'Tu cuenta está activa. Inicia sesión con tu correo y tu nueva contraseña.',
  );
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('staff1@example.org');
});

test('an expired or used link shows the generic invalid-link message', async ({ page }) => {
  await mockActivation(page, {
    status: 410,
    json: { statusCode: 410, message: 'Invalid or expired link', code: 'invalid_link' },
  });
  await page.goto(`/activar-cuenta#${activationToken}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Enlace no válido' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(invalidLink);
  expect(page.url()).toMatch(/\/activar-cuenta$/);
});

test('a link without a valid token is refused without asking the server', async ({ page }) => {
  const requests = await mockActivation(page);
  await page.goto('/activar-cuenta#no-es-un-token');
  await expect(page.getByRole('alert')).toHaveText(invalidLink);
  expect(requests.check).toHaveLength(0);
});

test('the rules the server reports for a weak password are shown', async ({ page }) => {
  const requests = await mockActivation(page, undefined, {
    status: 400,
    json: { statusCode: 400, message: 'Weak password', failedRules: ['min_length'] },
  });
  await page.goto(`/activar-cuenta#${activationToken}`);
  const form = page.getByRole('form', { name: 'Activa tu cuenta' });
  await form.getByLabel('Crea tu contraseña').fill(strong);
  await form.getByLabel('Repite la contraseña').fill(strong);
  await form.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(form.getByText('La contraseña no cumple: 12 caracteres o más.')).toBeVisible();
  await expect(page).toHaveURL(/\/activar-cuenta$/);
  expect(requests.activate).toHaveLength(1);
});

test('a link that stops working during activation shows the invalid-link message', async ({
  page,
}) => {
  await mockActivation(page, undefined, { status: 410, json: { code: 'invalid_link' } });
  await page.goto(`/activar-cuenta#${activationToken}`);
  const form = page.getByRole('form', { name: 'Activa tu cuenta' });
  await form.getByLabel('Crea tu contraseña').fill(strong);
  await form.getByLabel('Repite la contraseña').fill(strong);
  await form.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(page.getByRole('alert')).toHaveText(invalidLink);
});
