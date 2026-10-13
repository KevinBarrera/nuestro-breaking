import { expect, test, type Page, type Request } from '@playwright/test';
import {
  coordinatorId,
  deactivatedId,
  firstEventId,
  globalAdminSession,
  mockTeamApi,
  noAccessId,
  noAccessMember,
  pendingId,
  secondEventId,
  teamMembers,
} from './support/team-mocks.ts';

const api = (url: URL) => url.port === '3000';
const link = `http://127.0.0.1:4173/activar-cuenta#${'a1'.repeat(32)}`;
const issued = (userId: string) => ({
  userId,
  activationUrl: link,
  expiresAt: new Date(Date.now() + 72 * 3_600_000).toISOString(),
});
const pendingName = 'Persona de entrada con un nombre largo para pantallas angostas';

// Records each write to a team endpoint and answers it with `reply`.
async function mockWrite(
  page: Page,
  method: string,
  path: string,
  reply: { status: number; json: unknown },
) {
  const requests: Request[] = [];
  await page.route(
    (url) => api(url) && url.pathname === path,
    (route) => {
      if (route.request().method() !== method) return route.fallback();
      requests.push(route.request());
      return route.fulfill(reply);
    },
  );
  return requests;
}

const member = (page: Page, name: string) =>
  page.getByRole('table', { name: 'Miembros del equipo' }).getByRole('row').filter({
    hasText: name,
  });

test('inviting shows the link once, copies it and returns to Equipo', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockTeamApi(page);
  const invites = await mockWrite(page, 'POST', '/admin/team', {
    status: 201,
    json: issued(pendingId),
  });
  await page.goto('/admin/team');
  await page.getByRole('link', { name: 'Agregar administrador' }).click();
  await expect(page).toHaveURL('/admin/team/new');

  const form = page.getByRole('form', { name: 'Agregar administrador' });
  await form.getByLabel('Nombre').fill('Persona de entrada');
  await form.getByLabel('Correo').fill('staff1@example.org');
  await form.getByRole('button', { name: 'Crear invitación' }).click();
  await expect(form.getByText('Elige al menos un evento.')).toBeVisible();
  expect(invites).toHaveLength(0);

  await form
    .getByRole('group', { name: 'Eventos' })
    .getByRole('checkbox', { name: 'Los más pesados - Preliminares - Noviembre 2026' })
    .check();
  await form.getByRole('button', { name: 'Crear invitación' }).click();

  await expect(page.getByRole('heading', { name: 'Invitación creada' })).toBeFocused();
  expect(invites).toHaveLength(1);
  expect(invites[0].postDataJSON()).toEqual({
    displayName: 'Persona de entrada',
    email: 'staff1@example.org',
    access: { kind: 'events', eventIds: [firstEventId] },
  });
  expect(invites[0].headers()['x-csrf-token']).toBe('csrf-token');
  await expect(page.getByLabel('Enlace de activación')).toHaveValue(link);
  await expect(page.getByText('Se muestra una sola vez.')).toBeVisible();
  // The link never reaches the address bar.
  expect(page.url()).not.toContain('#');

  await page.getByRole('button', { name: 'Copiar enlace' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enlace copiado.' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  await page.getByRole('button', { name: 'Volver a Equipo' }).click();
  await expect(page).toHaveURL('/admin/team');
  // Equipo must finish loading before going back, or the back navigation can race it.
  await expect(page.getByRole('table', { name: 'Miembros del equipo' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('form', { name: 'Agregar administrador' })).toBeVisible();
  await expect(page.getByLabel('Enlace de activación')).toHaveCount(0);
});

test('an email that already has an account is explained on the field', async ({ page }) => {
  await mockTeamApi(page);
  await mockWrite(page, 'POST', '/admin/team', {
    status: 409,
    json: { statusCode: 409, message: 'Email in use', code: 'email_in_use' },
  });
  await page.goto('/admin/team/new');
  const form = page.getByRole('form', { name: 'Agregar administrador' });
  await form.getByLabel('Nombre').fill('Ana');
  await form.getByLabel('Correo').fill('kevin@example.org');
  await form.getByText('Todos los eventos', { exact: true }).click();
  await form.getByRole('button', { name: 'Crear invitación' }).click();
  await expect(form.getByRole('alert')).toHaveText(
    'Ese correo ya tiene una cuenta. Usa otro correo.',
  );
  await expect(form.getByLabel('Correo')).toHaveAttribute('aria-invalid', 'true');
});

test('a lost invite answer points to Equipo instead of asking for another email', async ({
  page,
}) => {
  await mockTeamApi(page);
  let attempts = 0;
  await page.route(
    (url) => api(url) && url.pathname === '/admin/team',
    (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      attempts += 1;
      // The first invite is created, but its answer never arrives.
      if (attempts === 1) return route.abort('failed');
      return route.fulfill({ status: 409, json: { statusCode: 409, code: 'email_in_use' } });
    },
  );
  const mayExist =
    'Es posible que la invitación sí se haya creado. Revisa Equipo: si la persona aparece, usa «Nuevo enlace» para darle un enlace. Ir a Equipo';
  await page.goto('/admin/team/new');
  const form = page.getByRole('form', { name: 'Agregar administrador' });
  await form.getByLabel('Nombre').fill('Ana');
  await form.getByLabel('Correo').fill('ana@example.org');
  await form.getByText('Todos los eventos', { exact: true }).click();
  await form.getByRole('button', { name: 'Crear invitación' }).click();
  await expect(form.getByRole('alert')).toHaveText(mayExist);

  await form.getByRole('button', { name: 'Crear invitación' }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(form.getByRole('alert')).toHaveText(mayExist);
  await expect(form.getByLabel('Correo')).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByRole('link', { name: 'Ir a Equipo' }).click();
  await expect(page).toHaveURL('/admin/team');
});

test('deactivating requires a reason and reports the last global admin rule', async ({ page }) => {
  await mockTeamApi(page);
  let reply = { status: 409, json: { statusCode: 409, code: 'last_global_admin' } as unknown };
  const writes: Request[] = [];
  await page.route(
    (url) => api(url) && url.pathname === `/admin/team/${coordinatorId}/deactivate`,
    (route) => {
      writes.push(route.request());
      return route.fulfill(reply);
    },
  );
  await page.goto('/admin/team');
  await expect(
    member(page, 'Kevin Barrera').getByRole('button', { name: /^Desactivar/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Desactivar a Coordinación principal' }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Desactivar a Coordinación principal?' });
  await expect(dialog).toContainText('Su sesión se cierra de inmediato');
  await dialog.getByRole('button', { name: 'Desactivar acceso' }).click();
  await expect(dialog.getByText('Escribe el motivo.')).toBeVisible();
  await expect(dialog.getByLabel('Motivo')).toBeFocused();
  expect(writes).toHaveLength(0);

  await dialog.getByLabel('Motivo').fill('Terminó su participación');
  await dialog.getByRole('button', { name: 'Desactivar acceso' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Debe quedar al menos una persona activa con acceso a todos los eventos.',
  );
  reply = { status: 200, json: { status: 'deactivated' } };
  await dialog.getByRole('button', { name: 'Desactivar acceso' }).click();
  await expect(dialog).toBeHidden();
  expect(writes.map((request) => request.postDataJSON() as unknown)).toEqual([
    { reason: 'Terminó su participación' },
    { reason: 'Terminó su participación' },
  ]);
  await expect(page.getByRole('status')).toHaveText(
    'Se desactivó el acceso de Coordinación principal.',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Equipo' })).toBeFocused();
});

test('a new link for a pending member is shown once on Equipo', async ({ page }) => {
  await mockTeamApi(page);
  const writes = await mockWrite(page, 'POST', `/admin/team/${pendingId}/invitation`, {
    status: 201,
    json: issued(pendingId),
  });
  await page.goto('/admin/team');
  await page.getByRole('button', { name: `Nuevo enlace para ${pendingName}` }).click();
  await page
    .getByRole('alertdialog', { name: `¿Generar un nuevo enlace para ${pendingName}?` })
    .getByRole('button', { name: 'Generar enlace' })
    .click();
  await expect(page.getByRole('heading', { name: 'Nuevo enlace creado' })).toBeFocused();
  await expect(page.getByLabel('Enlace de activación')).toHaveValue(link);
  expect(writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Volver a Equipo' }).click();
  await expect(page.getByLabel('Enlace de activación')).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Miembros del equipo' })).toBeVisible();
});

test('cancels an invitation, reactivates and changes access', async ({ page }) => {
  await mockTeamApi(page);
  const cancels = await mockWrite(page, 'DELETE', `/admin/team/${pendingId}/invitation`, {
    status: 200,
    json: { cancelled: true },
  });
  const reactivations = await mockWrite(page, 'POST', `/admin/team/${deactivatedId}/reactivate`, {
    status: 200,
    json: { status: 'active' },
  });
  const changes = await mockWrite(page, 'PUT', `/admin/team/${pendingId}/access`, {
    status: 200,
    json: { changed: true },
  });
  await page.goto('/admin/team');

  await page.getByRole('button', { name: `Cancelar invitación de ${pendingName}` }).click();
  await page
    .getByRole('alertdialog', { name: `¿Cancelar la invitación de ${pendingName}?` })
    .getByRole('button', { name: 'Cancelar invitación' })
    .click();
  await expect(page.getByRole('status')).toHaveText(`Se canceló la invitación de ${pendingName}.`);
  expect(cancels).toHaveLength(1);

  await page.getByRole('button', { name: 'Reactivar a Persona de caja' }).click();
  await page
    .getByRole('alertdialog', { name: '¿Reactivar a Persona de caja?' })
    .getByRole('button', { name: 'Reactivar' })
    .click();
  await expect(page.getByRole('status')).toHaveText('Persona de caja está activo otra vez.');
  expect(reactivations).toHaveLength(1);

  await page.getByRole('button', { name: `Cambiar acceso de ${pendingName}` }).click();
  const dialog = page.getByRole('dialog', { name: `Cambiar acceso de ${pendingName}` });
  await expect(
    dialog.getByRole('checkbox', { name: 'Los más pesados - Preliminares - Noviembre 2026' }),
  ).toBeChecked();
  await dialog.getByText('Todos los eventos', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(page.getByRole('status')).toHaveText(`Se cambió el acceso de ${pendingName}.`);
  expect(changes.map((request) => request.postDataJSON() as unknown)).toEqual([
    { access: { kind: 'global' } },
  ]);
});

test('a member without access shows "Sin acceso" and gets events back', async ({ page }) => {
  let restored = false;
  await mockTeamApi(page, globalAdminSession, () => [
    ...teamMembers(),
    restored
      ? {
          ...noAccessMember,
          status: 'active',
          access: {
            kind: 'events',
            events: [{ id: secondEventId, name: 'Nuestro Breaking Noviembre 2026' }],
          },
        }
      : noAccessMember,
  ]);
  const changes = await mockWrite(page, 'PUT', `/admin/team/${noAccessId}/access`, {
    status: 200,
    json: { changed: true },
  });
  await page.goto('/admin/team');

  const row = member(page, 'Persona sin acceso');
  await expect(row.getByRole('cell').nth(1)).toHaveText('Sin acceso');
  await expect(row.getByRole('cell').nth(2)).toContainText('Sin acceso');
  await expect(row.getByRole('cell').nth(2)).toContainText(
    'Usa «Cambiar acceso» para darle eventos',
  );
  // No new link: it would only set a password that cannot sign in.
  await expect(row.getByRole('button')).toHaveText(['Cambiar acceso', 'Desactivar']);

  await row.getByRole('button', { name: 'Cambiar acceso de Persona sin acceso' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar acceso de Persona sin acceso' });
  await dialog.getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(dialog.getByText('Elige al menos un evento.')).toBeVisible();
  expect(changes).toHaveLength(0);

  await dialog.getByRole('checkbox', { name: 'Nuestro Breaking Noviembre 2026' }).check();
  restored = true;
  await dialog.getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(page.getByRole('status')).toHaveText('Se cambió el acceso de Persona sin acceso.');
  expect(changes.map((request) => request.postDataJSON() as unknown)).toEqual([
    { access: { kind: 'events', eventIds: [secondEventId] } },
  ]);
  await expect(row).toContainText('Nuestro Breaking Noviembre 2026');
  await expect(row).toContainText('Activo');
});
