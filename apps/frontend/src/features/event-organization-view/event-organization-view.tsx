import {
  getEventOrganizationView,
  type EventOrganizationView,
} from '@/entities/event-organization';
import { useEffect, useState } from 'react';

const loadingMessage = 'Loading event organization.';
const errorMessage = 'Unable to load the event organization.';

type ViewState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; view: EventOrganizationView };

function formatSchedule(startsAt: string): string {
  const [date, time] = startsAt.replace('.000Z', '').split('T');

  return `${date} ${time.slice(0, 5)} UTC`;
}

export function EventOrganizationView() {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    let current = true;

    void getEventOrganizationView()
      .then((view) => {
        if (current) {
          setState({ kind: 'loaded', view });
        }
      })
      .catch(() => {
        if (current) {
          setState({ kind: 'error' });
        }
      });

    return () => {
      current = false;
    };
  }, []);

  if (state.kind === 'loading') {
    return <p role="status">{loadingMessage}</p>;
  }

  if (state.kind === 'error') {
    return <p role="alert">{errorMessage}</p>;
  }

  const { events, organization } = state.view;

  return (
    <section aria-labelledby="organization-heading">
      <a
        className="inline-flex rounded-sm px-2 py-1 text-sm font-medium text-zinc-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
        href="#events-heading"
      >
        Skip to events
      </a>
      <h2 className="mt-4 text-2xl font-semibold text-zinc-950" id="organization-heading">
        {organization.name}
      </h2>
      <p role="status">
        {events.length} {events.length === 1 ? 'event' : 'events'} loaded
      </p>
      <section className="mt-6 text-left" aria-labelledby="events-heading">
        <h3 className="text-lg font-semibold text-zinc-950" id="events-heading">
          Events
        </h3>
        <ul className="mt-3 space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <article className="rounded-lg border border-zinc-200 p-4">
                <h4 className="font-semibold text-zinc-950">{event.name}</h4>
                <dl className="mt-2 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-zinc-950">Venue</dt>
                    <dd>{event.venue.name}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-950">Schedule</dt>
                    <dd>
                      <time dateTime={event.schedule.startsAt}>
                        {formatSchedule(event.schedule.startsAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
