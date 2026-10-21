import type { ActivityKind } from '@/events/activity-admin/activity-kind';
import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';

export type AttendeeListPassType = {
  id: string;
  name: string;
  passClass: PassClass;
  status: string;
};

export type AttendeeListActivity = {
  id: string;
  name: string;
  kind: ActivityKind;
  startsAt: string;
};

// Contact-free by construction (#65): no email, phone, Instagram or birth date. `passTypeIds` and
// `activities` follow the order of the top-level `passTypes` and `activities` lists.
export type AttendeeListRegistration = {
  registrationId: string;
  folio: string | null;
  fullName: string;
  stageName: string | null;
  status: string;
  eventCheckedInAt: string | null;
  passTypeIds: string[];
  activities: { activityId: string; checkedInAt: string | null }[];
};

// One unpaginated snapshot of the `confirmed` and `pending_payment` registrations of an event, with
// the held pass types and the accessible `competition`/`workshop` activities to group them by.
export type AttendeeLists = {
  event: { id: string; name: string };
  generatedAt: string;
  passTypes: AttendeeListPassType[];
  activities: AttendeeListActivity[];
  registrations: AttendeeListRegistration[];
};
