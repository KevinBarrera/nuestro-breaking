import { routes } from '@/shared/config';
import { matchPath } from 'react-router';

export type EventSection =
  | 'overview'
  | 'foundation'
  | 'check-in'
  | 'payments-review'
  | 'registrations'
  | 'activities'
  | 'passes';

const sectionRoutes: Record<EventSection, string> = {
  overview: routes.adminEventOverview,
  foundation: routes.adminEventFoundation,
  'check-in': routes.adminEventCheckIn,
  'payments-review': routes.adminEventPaymentsReview,
  registrations: routes.adminEventRegistrations,
  activities: routes.adminEventActivities,
  passes: routes.adminEventPasses,
};

// Sections whose screens have sub-routes (Pases and Inscripciones: list, new and detail); the
// section stays current on every route below its path.
const nestedSections = new Set<EventSection>(['passes', 'registrations']);

export type AdminLocation = { eventId?: string; section?: EventSection };

export function readAdminLocation(pathname: string): AdminLocation {
  // Nuevo evento sits under `/admin/events/` but is not an event.
  if (matchPath(routes.adminEventNew, pathname)) return {};
  for (const [section, pattern] of Object.entries(sectionRoutes) as [EventSection, string][]) {
    const match = matchPath({ path: pattern, end: !nestedSections.has(section) }, pathname);
    if (match?.params.eventId) return { eventId: match.params.eventId, section };
  }
  return {};
}

export function eventSectionPath(eventId: string, section: EventSection) {
  return sectionRoutes[section].replace(':eventId', eventId);
}
