import { type ActivityKind } from '@/events/activity-admin/activity-kind';

// Kinds staff check in at an activity entrance; the same set the check-in command accepts.
export const CHECK_IN_KINDS: readonly ActivityKind[] = ['workshop', 'competition'];
