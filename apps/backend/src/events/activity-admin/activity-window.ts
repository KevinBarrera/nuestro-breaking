// Pure event-window rules for an activity's start and end (#295). The error codes are the contract
// the admin form maps onto its fields.

export type ActivityWindowCode = 'outside_event_window' | 'not_after_start';
export type ActivityWindowErrors = Partial<Record<'startsAt' | 'endsAt', ActivityWindowCode>>;
// The event's dates; `null` when the event is unbounded (no dates) and accepts any time.
export type EventWindow = { startsAt: Date; endsAt: Date } | null;

/**
 * Every failing field of an activity window. A value is `outside_event_window` when it is before the
 * event start or after the event end (the event bounds themselves are allowed). `endsAt` is
 * `not_after_start` when it is not strictly after `startsAt`. When `endsAt` is both outside the
 * window and not after the start, `outside_event_window` wins: it is true of the value alone, while
 * the order depends on a start that may also be wrong.
 */
export function activityWindowErrors(
  draft: { startsAt: Date; endsAt: Date },
  event: EventWindow,
): ActivityWindowErrors {
  const errors: ActivityWindowErrors = {};
  const outside = (value: Date) =>
    !!event &&
    (value.getTime() < event.startsAt.getTime() || value.getTime() > event.endsAt.getTime());
  if (outside(draft.startsAt)) errors.startsAt = 'outside_event_window';
  if (outside(draft.endsAt)) errors.endsAt = 'outside_event_window';
  else if (draft.startsAt.getTime() >= draft.endsAt.getTime()) errors.endsAt = 'not_after_start';
  return errors;
}
