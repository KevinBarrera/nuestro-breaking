import { expect, test } from '@playwright/test';

test('renders a Spanish sample event and activity foundation at /admin', async ({ page }) => {
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  await expect(page.getByText('Vista preliminar del espacio de administración para el equipo organizador y los jueces.')).toBeVisible();
  await expect(page.getByText('Vista de planificación · Datos de ejemplo')).toBeVisible();
  await expect(page.getByText('La propuesta del MVP de noviembre sigue en borrador; no está aprobada.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fin de semana de breaking' })).toBeVisible();
  const event = page.getByRole('region', { name: 'Evento de ejemplo' });
  const summary = event.getByRole('article', { name: 'Fin de semana de breaking' });
  await expect(summary.getByText('Fecha ilustrativa')).toBeVisible();
  await expect(summary.getByText('14 de noviembre')).toBeVisible();
  await expect(summary.getByText('Sede')).toBeVisible();
  await expect(summary.getByText('Por confirmar')).toBeVisible();

  const activities = event.getByRole('region', { name: 'Actividades de ejemplo' });
  const battle = activities.getByRole('article', { name: 'Batalla individual' });
  await expect(battle.getByText('Borrador')).toBeVisible();
  await expect(battle.getByText('Batalla', { exact: true })).toBeVisible();
  await expect(battle.getByText('14 de noviembre, 10:00')).toBeVisible();
  await expect(battle.getByText('Pista principal')).toBeVisible();
  await expect(battle.getByText('Precio')).toBeVisible();
  await expect(battle.getByText('Cupo')).toBeVisible();
  await expect(battle.getByText('Por confirmar')).toHaveCount(2);

  const workshop = activities.getByRole('article', { name: 'Taller de equipos' });
  await expect(workshop.getByText('Borrador')).toBeVisible();
  await expect(workshop.getByText('Taller', { exact: true })).toBeVisible();
  await expect(workshop.getByText('14 de noviembre, 14:00')).toBeVisible();
  await expect(workshop.getByText('Sala de talleres')).toBeVisible();

  const planning = page.getByRole('region', { name: 'Estado de planificación' });
  await expect(planning.getByText('2 actividades de ejemplo')).toBeVisible();
  await expect(planning.getByText('Pendiente de definir')).toBeVisible();
  await expect(page.getByText('Los campos que dependen de la organización siguen siendo configurables o quedan pendientes de definir.')).toBeVisible();
});

test('renders the dancer placeholder at /dancer', async ({ page }) => {
  await page.goto('/dancer');

  await expect(page).toHaveURL(/\/dancer$/);
  await expect(page.getByRole('heading', { name: 'Dancer area' })).toBeVisible();
  await expect(
    page.getByText('The future dancer workspace is available at /dancer.'),
  ).toBeVisible();
});
