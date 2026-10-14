export const routes = {
  // Public purchase (#176): `/` is the configured event (`VITE_PUBLIC_EVENT_SLUG`), `/e/:slug`
  // any event; the steps always live under `/e/:slug`.
  publicHome: '/',
  publicEvent: '/e/:slug',
  publicPasses: '/e/:slug/pases',
  publicCompetitions: '/e/:slug/competencias',
  publicBuyer: '/e/:slug/datos',
  publicReview: '/e/:slug/revisar',
  // Mercado Pago's return address for every outcome (#177 D8): `?registration=<id>`.
  publicPayment: '/e/:slug/pago',
  admin: '/admin',
  // Nuevo evento (#213), global admins only. A static segment, so it wins over `:eventId`.
  adminEventNew: '/admin/events/new',
  adminEventOverview: '/admin/events/:eventId',
  adminEventFoundation: '/admin/events/:eventId/foundation',
  adminEventCheckIn: '/admin/events/:eventId/check-in',
  // Pagos por revisar (#230): flagged Mercado Pago payments, read only.
  adminEventPaymentsReview: '/admin/events/:eventId/payments-review',
  adminEventActivities: '/admin/events/:eventId/activities',
  adminEventPasses: '/admin/events/:eventId/passes',
  adminEventPassNew: '/admin/events/:eventId/passes/new',
  adminEventPass: '/admin/events/:eventId/passes/:passTypeId',
  // Team management (#214), global admins only.
  adminTeam: '/admin/team',
  adminTeamNew: '/admin/team/new',
  // Public activation page; the one-time token travels in the fragment (#214 D7).
  activateAccount: '/activar-cuenta',
  // Former address of the pass list; it redirects to `adminEventPasses` for old bookmarks.
  adminEventPassTypesLegacy: '/admin/events/:eventId/pass-types',
  dancer: '/dancer',
} as const;
