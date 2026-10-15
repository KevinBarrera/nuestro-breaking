import type { Locator, Page } from '@playwright/test';
import { archivedEvent, eventSummary } from './event-mocks.ts';
import { teamMembers } from './team-mocks.ts';

// Shared mocked admin API for specs that sweep every admin screen (contrast, targets, phone
// width). Screen-specific behavior stays in each screen's own spec.
export const eventId = 'a1b2c3d4-1234-4567-89ab-123456789abc';
const venueId = 'e1b2c3d4-1234-4567-89ab-123456789abc';
const battleId = 'd1b2c3d4-1234-4567-89ab-123456789abc';
const workshopId = 'd2b2c3d4-1234-4567-89ab-123456789abc';
const cypherId = 'd3b2c3d4-1234-4567-89ab-123456789abc';
const fullPassId = 'f1b2c3d4-1234-4567-89ab-123456789abc';
const api = (url: URL) => url.port === '3000';

export const adminScreens = [
  { name: 'Resumen', path: `/admin/events/${eventId}` },
  { name: 'Check-in', path: `/admin/events/${eventId}/check-in` },
  { name: 'Actividades', path: `/admin/events/${eventId}/activities` },
  { name: 'Pases', path: `/admin/events/${eventId}/passes` },
  { name: 'Pase', path: `/admin/events/${eventId}/passes/${fullPassId}` },
  { name: 'Nuevo pase', path: `/admin/events/${eventId}/passes/new` },
  { name: 'Datos del evento', path: `/admin/events/${eventId}/foundation` },
  { name: 'Pagos por revisar', path: `/admin/events/${eventId}/payments-review` },
  // Team screens (#214): global admins only, outside any event.
  { name: 'Equipo', path: '/admin/team' },
  { name: 'Agregar administrador', path: '/admin/team/new' },
  // The event list (#213): global admins see Crear evento and the Archivados toggle. Kept
  // after the event screens, since sweeps use the first entry for the event selector.
  { name: 'Eventos', path: '/admin' },
  { name: 'Nuevo evento', path: '/admin/events/new' },
] as const;

export type AdminScreenName = (typeof adminScreens)[number]['name'];
export const adminScreen = (name: AdminScreenName) =>
  adminScreens.find((screen) => screen.name === name)!;

export const themes = ['light', 'dark'] as const;

const activity = (id: string, kind: string, name: string, startsAt: string, endsAt: string) => ({
  id,
  eventId,
  venueId,
  kind,
  name,
  startsAt,
  endsAt,
  status: 'active',
  version: 1,
});

const activities = [
  activity(
    battleId,
    'battle',
    'Batalla de crews con nombre largo para pantallas angostas',
    '2026-11-21T22:00:00.000Z',
    '2026-11-22T00:00:00.000Z',
  ),
  activity(
    workshopId,
    'workshop',
    'Taller de footwork',
    '2026-11-21T16:00:00.000Z',
    '2026-11-21T18:00:00.000Z',
  ),
  // Hidden until "Mostrar archivadas"; it opens the restore confirmation.
  {
    ...activity(
      cypherId,
      'social',
      'Cypher archivado con nombre largo para pantallas angostas',
      '2026-11-22T01:00:00.000Z',
      '2026-11-22T02:00:00.000Z',
    ),
    status: 'archived',
    version: 2,
  },
];

const passTypes = [
  {
    id: fullPassId,
    eventId,
    name: 'Pase completo',
    passClass: 'full',
    priceCents: 150000,
    requiresPassClass: null,
    status: 'active',
    version: 1,
    activities: [
      { activityId: battleId, access: 'selectable' },
      { activityId: workshopId, access: 'included' },
    ],
  },
  {
    id: 'f2b2c3d4-1234-4567-89ab-123456789abc',
    eventId,
    name: 'Entrada general',
    passClass: 'general',
    priceCents: 30000,
    requiresPassClass: null,
    status: 'active',
    version: 1,
    activities: [],
  },
  // Listed under "Archivados" on the pass list; it opens the pass restore confirmation.
  {
    id: 'f3b2c3d4-1234-4567-89ab-123456789abc',
    eventId,
    name: 'Pase archivado con nombre largo para pantallas angostas',
    passClass: 'general',
    priceCents: 20000,
    requiresPassClass: null,
    status: 'archived',
    version: 3,
    activities: [{ activityId: workshopId, access: 'included' }],
  },
];

// Also Datos del evento (#213 T9), which reads the full event and its venues.
const foundation = {
  event: {
    id: eventId,
    name: 'Encuentro del barrio',
    slug: 'encuentro-del-barrio-con-nombre-largo-para-pantallas-angostas',
    folioPrefix: 'EB',
    timeZone: 'America/Mexico_City',
    startsAt: '2026-11-21T15:00:00.000Z',
    endsAt: '2026-11-23T05:00:00.000Z',
    windowStatus: 'bounded',
    salesEnabled: true,
    archivedAt: null,
  },
  venues: [
    { id: venueId, name: 'Centro cultural' },
    { id: 'e2b2c3d4-1234-4567-89ab-123456789abc', name: 'Foro al aire libre con nombre largo' },
  ],
  activities: [],
  // Empty, so "Eliminar evento" is enabled and its dialog can be opened (#213 T10).
  deleteBlockers: [],
  deferredFields: [],
};

// Open with both dates set, so the overview shows the status detail and both "Quitar" buttons.
const sales = {
  slug: 'encuentro-del-barrio-con-nombre-largo-para-pantallas-angostas',
  salesEnabled: true,
  salesOpensAt: '2026-10-01T15:00:00.000Z',
  salesClosesAt: '2026-11-20T06:00:00.000Z',
  state: 'open',
  reason: null,
};

const registration = {
  participant: {
    id: 'person',
    fullName: 'Luz Rivera',
    email: 'luz@example.org',
    stageName: 'Luz',
  },
  registration: {
    id: 'c1b2c3d4-1234-4567-89ab-123456789abc',
    eventId,
    folio: 'NB-42',
    status: 'confirmed',
    checkedInAt: null,
  },
  activities: [{ id: battleId, name: 'Batalla de crews', kind: 'battle', checkedInAt: null }],
};

// One flagged payment per reason with the longest copy, so sweeps measure every card.
const flaggedPayments = {
  payments: [
    'approved_after_expiry_duplicate',
    'approved_after_expiry_event_ended',
    'approved_after_confirmation',
    'approved_after_void',
  ].map((reason, index) => ({
    providerPaymentId: `98765432${index}`,
    reason,
    receivedAt: '2026-11-02T18:04:00.000Z',
    amountCents: 150000,
    registration: {
      id: `c${index}b2c3d4-1234-4567-89ab-123456789abc`,
      folio: index % 2 ? 'EB-0042' : null,
      participantName: 'Persona con un nombre muy largo para pantallas angostas',
      status: index === 2 ? 'confirmed' : 'voided',
    },
  })),
};

export async function mockAdminApi(page: Page) {
  const routes: [(url: URL) => boolean, unknown][] = [
    [
      (url) => url.pathname === '/auth/session',
      { user: { id: 'admin', roles: ['admin'], globalAdmin: true } },
    ],
    [(url) => url.pathname === '/admin/team', { members: teamMembers() }],
    [(url) => url.pathname.endsWith('/foundation'), foundation],
    [(url) => url.pathname.endsWith('/activities'), activities],
    [(url) => url.pathname.endsWith('/pass-types'), passTypes],
    [(url) => url.pathname.endsWith('/sales'), sales],
    [(url) => url.pathname.endsWith('/flagged-payments'), flaggedPayments],
    [
      (url) => url.pathname.endsWith('/participants'),
      { total: 1, limit: 20, offset: 0, results: [registration] },
    ],
  ];
  for (const [matches, json] of routes)
    await page.route(
      (url) => api(url) && matches(url),
      (route) => route.fulfill({ json }),
    );
  // Archived events only with `?archived=true`, as the backend answers.
  const events = [eventSummary(eventId, 'Encuentro del barrio', { folioPrefix: 'EB' })];
  await page.route(
    (url) => api(url) && url.pathname === '/admin/events',
    (route) =>
      route.fulfill({
        json:
          new URL(route.request().url()).searchParams.get('archived') === 'true'
            ? [...events, archivedEvent]
            : events,
      }),
  );
}

export async function useTheme(page: Page, theme: (typeof themes)[number]) {
  await page.addInitScript({ content: `localStorage.setItem('nb-theme', '${theme}');` });
}

const accessControls = (page: Page) =>
  page.getByRole('region', { name: 'Acceso a actividades' }).getByRole('radiogroup');

// Puts each screen in a state that shows its main interactive controls.
export async function revealControls(page: Page, name: AdminScreenName) {
  if (name === 'Eventos') {
    await page.getByRole('button', { name: /^Archivados/ }).click();
    await page.getByRole('button', { name: /^Restaurar / }).waitFor();
  }
  // An empty submit shows the field errors, so their text is measured too.
  if (name === 'Nuevo evento') {
    const form = page.getByRole('form', { name: 'Nuevo evento' });
    await form.getByRole('button', { name: 'Crear evento' }).click();
    await form.getByText('Escribe el nombre del evento.').waitFor();
  }
  // The add-venue form with its field error, and an edit so both form buttons are enabled.
  if (name === 'Datos del evento') {
    await page
      .getByRole('form', { name: 'Datos del evento' })
      .getByLabel('Nombre del evento')
      .fill('Encuentro del barrio 2026');
    const venues = page.getByRole('region', { name: 'Sedes' });
    await venues.getByRole('button', { name: 'Agregar sede' }).click();
    await venues.getByRole('button', { name: 'Agregar', exact: true }).click();
    await venues.getByText('Escribe el nombre de la sede.').waitFor();
  }
  if (name === 'Check-in') {
    await page.getByRole('textbox', { name: 'Buscar inscripción' }).fill('Luz');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('button', { name: /Luz Rivera/ }).click();
    await page.getByRole('button', { name: 'Registrar entrada al evento' }).waitFor();
  }
  // The list holds cards: links to each pass's own screen and "Restaurar" on archived ones.
  if (name === 'Pases') {
    await page.getByRole('link', { name: 'Editar Pase completo' }).waitFor();
    await page.getByRole('button', { name: /^Restaurar Pase archivado/ }).waitFor();
  }
  if (name === 'Pagos por revisar')
    await page
      .getByRole('table', { name: 'Pagos por revisar' })
      .getByRole('cell')
      .first()
      .waitFor();
  if (name === 'Pase' || name === 'Nuevo pase') await accessControls(page).first().waitFor();
  if (name === 'Actividades') await page.getByRole('button', { name: /^Todas/ }).waitFor();
  if (name === 'Equipo')
    await page
      .getByRole('table', { name: 'Miembros del equipo' })
      .getByRole('cell')
      .first()
      .waitFor();
  if (name === 'Agregar administrador')
    await page.getByRole('group', { name: 'Eventos' }).getByRole('checkbox').first().waitFor();
  if (name === 'Resumen') {
    await page.getByRole('table', { name: 'Pases a la venta' }).waitFor();
    await page.getByRole('button', { name: 'Quitar fecha de cierre' }).waitFor();
  }
}

// The catalog dialogs, each opened from its screen (after `revealControls`) without writing:
// the activity form modal, "Revisar cambios", the destructive archive confirmation, the
// activity and pass restore confirmations and the unsaved-changes warning. `open` returns the open dialog.
export const adminDialogs: {
  name: string;
  screen: AdminScreenName;
  open: (page: Page) => Promise<Locator>;
}[] = [
  {
    name: 'activity form',
    screen: 'Actividades',
    open: async (page) => {
      await page.getByRole('button', { name: 'Nueva actividad' }).click();
      return page.getByRole('dialog', { name: 'Nueva actividad' });
    },
  },
  {
    name: 'review changes',
    screen: 'Pase',
    open: async (page) => {
      const form = page.getByRole('form', { name: 'Editar pase' });
      await form
        .getByLabel('Nombre')
        .fill('Pase completo con nombre largo para pantallas angostas');
      await form.getByRole('button', { name: 'Guardar cambios' }).click();
      return page.getByRole('dialog', { name: 'Revisar cambios' });
    },
  },
  {
    name: 'archive confirmation',
    screen: 'Pase',
    open: async (page) => {
      await page
        .getByRole('form', { name: 'Editar pase' })
        .getByRole('button', { name: 'Archivar' })
        .click();
      return page.getByRole('alertdialog', { name: '¿Archivar Pase completo?' });
    },
  },
  {
    name: 'activity restore confirmation',
    screen: 'Actividades',
    open: async (page) => {
      await page.getByRole('checkbox', { name: 'Mostrar archivadas' }).check();
      await page.getByRole('button', { name: /^Restaurar Cypher archivado/ }).click();
      return page.getByRole('alertdialog', { name: /^¿Restaurar Cypher archivado/ });
    },
  },
  {
    name: 'pass restore confirmation',
    screen: 'Pases',
    open: async (page) => {
      await page.getByRole('button', { name: /^Restaurar Pase archivado/ }).click();
      return page.getByRole('alertdialog', { name: /^¿Restaurar Pase archivado/ });
    },
  },
  {
    name: 'unsaved changes warning',
    screen: 'Pase',
    open: async (page) => {
      await page.getByRole('form', { name: 'Editar pase' }).getByLabel('Nombre').fill('Pase VIP');
      await page
        .getByRole('navigation', { name: 'Ruta de navegación' })
        .getByRole('link', { name: 'Pases' })
        .click();
      return page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
    },
  },
  {
    name: 'archive event',
    screen: 'Datos del evento',
    open: async (page) => {
      await page
        .getByRole('region', { name: 'Archivar o eliminar' })
        .getByRole('button', { name: 'Archivar evento' })
        .click();
      return page.getByRole('alertdialog', { name: /^¿Archivar Encuentro del barrio/ });
    },
  },
  {
    name: 'delete empty event',
    screen: 'Datos del evento',
    open: async (page) => {
      await page
        .getByRole('region', { name: 'Archivar o eliminar' })
        .getByRole('button', { name: 'Eliminar evento' })
        .click();
      const dialog = page.getByRole('alertdialog', { name: /^¿Eliminar Encuentro del barrio/ });
      // The typed address enables "Eliminar para siempre", so its contrast is measured.
      await dialog
        .getByLabel('Para confirmar, escribe la dirección del evento')
        .fill(foundation.event.slug);
      return dialog;
    },
  },
  {
    name: 'deactivate access',
    screen: 'Equipo',
    open: async (page) => {
      await page.getByRole('button', { name: 'Desactivar a Coordinación principal' }).click();
      const dialog = page.getByRole('alertdialog', {
        name: '¿Desactivar a Coordinación principal?',
      });
      // The empty-reason error shows too, so its text is measured.
      await dialog.getByRole('button', { name: 'Desactivar acceso' }).click();
      await dialog.getByText('Escribe el motivo.').waitFor();
      return dialog;
    },
  },
  {
    name: 'change access',
    screen: 'Equipo',
    open: async (page) => {
      await page.getByRole('button', { name: /^Cambiar acceso de Persona de entrada/ }).click();
      const dialog = page.getByRole('dialog', { name: /^Cambiar acceso de Persona de entrada/ });
      await dialog.getByRole('checkbox').first().waitFor();
      return dialog;
    },
  },
  {
    name: 'cancel invitation',
    screen: 'Equipo',
    open: async (page) => {
      await page
        .getByRole('button', { name: /^Cancelar invitación de Persona de entrada/ })
        .click();
      return page.getByRole('alertdialog', { name: /^¿Cancelar la invitación de/ });
    },
  },
];
