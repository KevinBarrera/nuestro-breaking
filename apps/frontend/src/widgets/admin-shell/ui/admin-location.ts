import { routes } from '@/shared/config';
import { matchPath } from 'react-router';

export type EventSection = 'overview' | 'foundation' | 'check-in' | 'activities' | 'passes';

const sectionRoutes: Record<EventSection, string> = {
  overview: routes.adminEventOverview,
  foundation: routes.adminEventFoundation,
  'check-in': routes.adminEventCheckIn,
  activities: routes.adminEventActivities,
  passes: routes.adminEventPasses,
};

// Sections whose screens have sub-routes (Pases: list, new and detail); the section stays
// current on every route below its path.
const nestedSections = new Set<EventSection>(['passes']);

export type AdminLocation = { eventId?: string; section?: EventSection };

export function readAdminLocation(pathname: string): AdminLocation {
  for (const [section, pattern] of Object.entries(sectionRoutes) as [EventSection, string][]) {
    const match = matchPath({ path: pattern, end: !nestedSections.has(section) }, pathname);
    if (match?.params.eventId) return { eventId: match.params.eventId, section };
  }
  return {};
}

export function eventSectionPath(eventId: string, section: EventSection) {
  return sectionRoutes[section].replace(':eventId', eventId);
}
