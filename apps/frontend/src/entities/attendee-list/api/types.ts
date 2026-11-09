// Contact-free attendee lists of an event (#65): one snapshot of its `confirmed` and
// `pending_payment` registrations with the pass types and activities to group them by.
export const attendeeListStatuses = ['confirmed', 'pending_payment'] as const;
export const attendeeListActivityKinds = ['competition', 'workshop'] as const;
export const attendeeListPassClasses = ['full', 'general', 'add_on'] as const;

export type AttendeeListStatus = (typeof attendeeListStatuses)[number];
export type AttendeeListActivityKind = (typeof attendeeListActivityKinds)[number];
export type AttendeeListPassClass = (typeof attendeeListPassClasses)[number];

export type AttendeeListPassType = {
  id: string;
  name: string;
  passClass: AttendeeListPassClass;
  archived: boolean;
};

export type AttendeeListActivity = {
  id: string;
  name: string;
  kind: AttendeeListActivityKind;
  startsAt: string;
};

export type AttendeeListRegistration = {
  registrationId: string;
  folio: string | null;
  fullName: string;
  stageName: string | null;
  status: AttendeeListStatus;
  eventCheckedInAt: string | null;
  passTypeIds: string[];
  // `competitorNumber` is the registration's number in that competition (#377), or null when it
  // has none there; always null on a workshop.
  activities: { activityId: string; checkedInAt: string | null; competitorNumber: number | null }[];
};

export type AttendeeLists = {
  event: { id: string; name: string };
  generatedAt: string;
  passTypes: AttendeeListPassType[];
  activities: AttendeeListActivity[];
  registrations: AttendeeListRegistration[];
};

export type AttendeeListsFailure = 'denied' | 'not-found' | 'error';
