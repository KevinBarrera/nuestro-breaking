import { expect, test, type Page } from '@playwright/test';
import { globalAdminSession, mockTeamApi } from './support/team-mocks.ts';

const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });
const members = (page: Page) => page.getByRole('table', { name: 'Miembros del equipo' });
// Member rows only: the header row holds column headers, not cells.
const memberRows = (page: Page) =>
  members(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });

test('a global admin reaches Equipo from the navigation and sees every status', async ({
  page,
}) => {
  await mockTeamApi(page);
  await page.goto('/admin');
  const team = sideNav(page).getByRole('link', { name: 'Equipo' });
  await team.click();
  await expect(page).toHaveURL('/admin/team');
  await expect(team).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Equipo' })).toBeVisible();

  await expect(members(page).getByRole('columnheader')).toHaveText([
    'Persona',
    'Acceso',
    'Estado',
    'Acciones',
  ]);
  const rows = memberRows(page);
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText('Kevin Barrera (tú)');
  // The person's own row offers no actions (D9).
  await expect(rows.nth(0).getByRole('button')).toHaveCount(0);
  await expect(rows.nth(0).getByRole('cell').last()).toHaveText('—Sin acciones');
  await expect(rows.nth(0)).toContainText('Todos los eventos');
  await expect(rows.nth(0)).toContainText('Activo');
  await expect(rows.nth(2)).toContainText('Los más pesados - Preliminares - Noviembre 2026');
  await expect(rows.nth(2)).toContainText('Invitación pendiente');
  await expect(rows.nth(2)).toContainText('Vence en 2 días');
  await expect(rows.nth(3)).toContainText(
    'Los más pesados - Preliminares - Noviembre 2026, Nuestro Breaking Noviembre 2026',
  );
  await expect(rows.nth(3)).toContainText('Invitación vencida');
  await expect(rows.nth(4)).toContainText('Desactivado');

  // From `lg` up the actions share the row's line instead of wrapping under it.
  await page.setViewportSize({ width: 1280, height: 800 });
  const chip = await rows.nth(1).getByText('Activo').boundingBox();
  const action = await rows
    .nth(1)
    .getByRole('button', { name: /^Desactivar/ })
    .boundingBox();
  expect(action!.y).toBeLessThan(chip!.y + chip!.height);
});

test('an event-scoped admin has no Equipo item and a direct visit shows Sin acceso', async ({
  page,
}) => {
  const teamRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.port === '3000' && url.pathname.startsWith('/admin/team')) teamRequests.push(url.href);
  });
  await mockTeamApi(page, {
    user: { ...globalAdminSession.user, globalAdmin: false },
  });
  await page.goto('/admin');
  await expect(sideNav(page).getByRole('link', { name: 'Todos los eventos' })).toBeVisible();
  await expect(sideNav(page).getByRole('link', { name: 'Equipo' })).toHaveCount(0);

  await page.goto('/admin/team');
  await expect(page.getByRole('alert')).toHaveText(
    'Sin acceso: solo quien tiene acceso a todos los eventos puede administrar el equipo.',
  );
  await expect(members(page)).toHaveCount(0);
  expect(teamRequests).toEqual([]);
});

test('a team list failure offers Reintentar', async ({ page }) => {
  await mockTeamApi(page);
  let failing = true;
  await page.route(
    (url) => url.port === '3000' && url.pathname === '/admin/team',
    (route) => (failing ? route.fulfill({ status: 500, json: {} }) : route.fallback()),
  );
  await page.goto('/admin/team');
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar el equipo.');
  failing = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(memberRows(page)).toHaveCount(5);
});
