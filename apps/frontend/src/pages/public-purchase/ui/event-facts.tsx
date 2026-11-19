import { eventLocation } from '@/entities/event-catalog';
import type { PublicEventSummary } from '@/entities/public-event';
import { eventDateRange } from './event-dates';

// When and where the event happens, under its name on the home header (#330). Each line is left
// out when the event lacks it; the place never falls back to the time zone.
export function EventFacts({ event }: { event: PublicEventSummary }) {
  const dates = eventDateRange(event);
  const location = eventLocation(event);
  if (!dates && !location) return null;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-base text-header-muted">
      {dates ? (
        <p className="inline-flex items-center gap-2">
          <CalendarIcon />
          {dates}
        </p>
      ) : null}
      {location ? (
        <p className="inline-flex items-center gap-2">
          <PlaceIcon />
          <span className="sr-only">Lugar: </span>
          {location}
        </p>
      ) : null}
    </div>
  );
}

const iconProps = {
  'aria-hidden': true,
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'shrink-0',
} as const;

const CalendarIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="4.5" width="14" height="13" rx="2" />
    <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
  </svg>
);

const PlaceIcon = () => (
  <svg {...iconProps}>
    <path d="M10 17.5s5.5-4.8 5.5-9a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9 5.5 9z" />
    <circle cx="10" cy="8.5" r="2" />
  </svg>
);
