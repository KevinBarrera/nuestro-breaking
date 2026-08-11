export const localOrganizationId = '50000000-0000-0000-0000-000000000001';

export type EventOrganizationView = {
  organization: { id: string; name: string };
  events: EventOrganizationEvent[];
};

export type EventOrganizationEvent = {
  id: string;
  name: string;
  lifecycle: 'draft' | 'published' | 'closed';
  venue: { id: string; name: string };
  schedule: { startsAt: string; endsAt: string | null };
};
