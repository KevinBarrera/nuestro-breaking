import { expect, test, type Page } from '@playwright/test';
import { globalAdminSession, mockTeamApi } from './support/team-mocks.ts';

const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Navegación administrativa' });
const members = (page: Page) => page.getByRole('table', { name: 'Equipo' });
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
  await expect(rows.nth(0)).toContainText('Kevin Barrera');
  await expect(rows.nth(0)).toContainText('Tú');
  // The person's own row offers no actions (D9).
  await expect(rows.nth(0).getByRole('button')).toHaveCount(0);
  await expect(rows.nth(0).getByRole('cell').last()).toHaveText('Tu cuenta');
  await expect(rows.nth(0)).toContainText('Todos los eventosIncluye eventos nuevos y el equipo');
  await expect(rows.nth(0)).toContainText('Activo');
  await expect(rows.nth(2)).toContainText('Los más pesados - Preliminares - Noviembre 2026');
  await expect(rows.nth(2)).toContainText('1 evento');
  await expect(rows.nth(2)).toContainText('Invitación pendiente');
  await expect(rows.nth(2)).toContainText('Vence en 2 días');
  await expect(rows.nth(3)).toContainText(
    'Los más pesados - Preliminares - Noviembre 2026, Nuestro Breaking Noviembre 2026',
  );
  await expect(rows.nth(3)).toContainText('2 eventos');
  await expect(rows.nth(3)).toContainText('Invitación vencida');
  await expect(rows.nth(4)).toContainText('Desactivado');
  await expect(page.getByText('5 personas', { exact: true })).toBeVisible();

  // On a wide screen the actions share the row's line instead of stacking under it.
  await page.setViewportSize({ width: 1280, height: 800 });
  const chip = await rows.nth(1).getByText('Activo').boundingBox();
  const action = await rows
    .nth(1)
    .getByRole('button', { name: /^Acciones para/ })
    .boundingBox();
  expect(action!.y).toBeLessThan(chip!.y + chip!.height);
});

test('search and status chips narrow the team, and Limpiar filtros brings everyone back', async ({
  page,
}) => {
  await mockTeamApi(page);
  await page.goto('/admin/team');
  const chips = page.getByRole('group', { name: 'Filtrar por estado' }).getByRole('button');
  await expect(chips).toHaveText(['Todos5', 'Activos2', 'Pendientes2', 'Desactivados1']);
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');

  await chips.filter({ hasText: 'Pendientes' }).click();
  await expect(memberRows(page)).toHaveCount(2);
  await expect(page.getByText('Mostrando 2 de 5 personas')).toBeVisible();

  // Accents and case do not matter.
  await page.getByRole('searchbox', { name: 'Buscar en el equipo' }).fill('NOVIEMBRE');
  await expect(memberRows(page)).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Buscar en el equipo' }).fill('kevin');
  await expect(memberRows(page)).toHaveCount(0);
  await expect(page.getByText('Nadie coincide con la búsqueda')).toBeVisible();

  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(memberRows(page)).toHaveCount(5);
  await expect(page.getByRole('searchbox', { name: 'Buscar en el equipo' })).toHaveValue('');
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
});

test('the Acciones menu lists what each status allows', async ({ page }) => {
  await mockTeamApi(page);
  await page.goto('/admin/team');
  const menuFor = async (name: string) => {
    await page.getByRole('button', { name: `Acciones para ${name}` }).click();
    const items = page.getByRole('menu', { name: `Acciones para ${name}` }).getByRole('menuitem');
    const labels = await items.allTextContents();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: `Acciones para ${name}` })).toBeFocused();
    return labels;
  };
  expect(await menuFor('Coordinación principal')).toEqual([
    'Cambiar acceso',
    'Generar nuevo enlace',
    'Desactivar',
  ]);
  expect(await menuFor('Persona de caja')).toEqual(['Reactivar', 'Cambiar acceso']);
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
