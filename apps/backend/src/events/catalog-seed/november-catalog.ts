// November 2026 MVP catalog, from docs/product/november-2026-mvp-proposal.md.
// PENDING ORGANIZER CONFIRMATION: the agenda, venues, and dates below are sample local data.
// Only passes, prices, and competitions per discipline are approved scope. Workshops are
// announced later and are intentionally absent.

export type SeedPassClass = 'full' | 'general' | 'add_on';
export type SeedAccess = 'selectable' | 'included';

export type SeedActivity = {
  name: string;
  /** Accepted by check-in eligibility (`check-in.service.ts`, migration 0010). */
  kind: 'competition';
  startsAt: string;
  endsAt: string;
};

export type SeedPassType = {
  name: string;
  passClass: SeedPassClass;
  priceCents: number;
  requiresPassClass: SeedPassClass | null;
  access: { activity: string; access: SeedAccess }[];
};

export type CatalogSeedDefinition = {
  organizationName: string;
  venueName: string;
  event: { name: string; slug: string; timeZone: string; startsAt: string; endsAt: string };
  activities: SeedActivity[];
  passTypes: SeedPassType[];
};

// Sample dates: Saturday 21 and Sunday 22 November 2026, Mexico City time (UTC-6, no DST).
const day1 = '2026-11-21';
const day2 = '2026-11-22';
const competition = (name: string, day: string, startHour: number): SeedActivity => ({
  name,
  kind: 'competition',
  startsAt: `${day}T${String(startHour).padStart(2, '0')}:00:00-06:00`,
  endsAt: `${day}T${String(startHour + 1).padStart(2, '0')}:00:00-06:00`,
});

const disciplines: Record<'Breaking' | 'Popping' | 'Locking' | 'Dancehall', string[]> = {
  Breaking: [
    'Breaking 1v1 Toprock',
    'Breaking Footwork',
    'Breaking Bboy',
    'Breaking Bgirl',
    'Breaking Kids',
    'Breaking Cypher queen/king',
    'Breaking 3v3',
  ],
  Popping: ['Popping 1v1', 'Popping 2v2', 'Popping 1v1 beginner', 'Popping Cypher queen/king'],
  Locking: ['Locking 1v1', 'Locking 3v3'],
  Dancehall: ['Dancehall batallas mixtas'],
};
const openStylesCompetition = 'Open Styles 1vs1';

const day2Competitions = [...disciplines.Popping, ...disciplines.Locking, ...disciplines.Dancehall];

export const novemberCatalog: CatalogSeedDefinition = {
  organizationName: 'Nuestro Breaking',
  venueName: 'Estudio principal',
  event: {
    name: 'Los más pesados - Preliminares - Noviembre 2026',
    slug: 'los-mas-pesados-nov-2026',
    timeZone: 'America/Mexico_City',
    startsAt: `${day1}T09:00:00-06:00`,
    endsAt: `${day2}T22:00:00-06:00`,
  },
  activities: [
    ...disciplines.Breaking.map((name, index) => competition(name, day1, 10 + index)),
    ...day2Competitions.map((name, index) => competition(name, day2, 10 + index)),
    // Open Styles must not overlap any full-pass competition.
    competition(openStylesCompetition, day2, 19),
  ],
  passTypes: [
    ...Object.entries(disciplines).map(([discipline, competitions]): SeedPassType => ({
      name: `Pase completo ${discipline}`,
      passClass: 'full',
      priceCents: 200000,
      requiresPassClass: null,
      access: competitions.map((activity) => ({ activity, access: 'selectable' })),
    })),
    {
      name: 'Entrada general',
      passClass: 'general',
      priceCents: 100000,
      requiresPassClass: null,
      access: [],
    },
    {
      name: 'Open Styles',
      passClass: 'add_on',
      priceCents: 80000,
      requiresPassClass: 'full',
      access: [{ activity: openStylesCompetition, access: 'included' }],
    },
  ],
};
