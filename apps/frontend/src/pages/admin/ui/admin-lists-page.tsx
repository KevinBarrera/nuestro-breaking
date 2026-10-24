import {
  attendeeListsFailure,
  fetchAttendeeLists,
  type AttendeeLists,
  type AttendeeListsFailure,
} from '@/entities/attendee-list';
import { buttonClass, Select } from '@/shared/ui';
import { useEffect, useId, useState } from 'react';
import { useParams } from 'react-router';
import {
  buildAttendeeLists,
  entryLabel,
  folioLabel,
  formatGeneratedAt,
  listKind,
  peopleCount,
  type AttendeeListView,
} from './attendee-lists-model';
import { styles } from './catalog-copy';

const allListsOption = 'all';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: AttendeeListsFailure }
  | { status: 'ready'; snapshot: AttendeeLists };

const failureMessages: Record<AttendeeListsFailure, string> = {
  denied: 'No tienes acceso a las listas de este evento.',
  'not-found': 'No encontramos este evento.',
  error: 'No se pudieron cargar las listas. Intenta de nuevo.',
};

export function AdminListsPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <AttendeeListsScreen key={eventId} eventId={eventId} />;
}

// Listas de respaldo (#65): contact-free lists to print or save as PDF before the event, for
// the paper fallback when the system is down. Each load is one snapshot from the server.
function AttendeeListsScreen({ eventId }: { eventId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState(allListsOption);

  useEffect(() => {
    const controller = new AbortController();
    fetchAttendeeLists(eventId, controller.signal)
      .then((snapshot) => {
        if (!controller.signal.aborted) setState({ status: 'ready', snapshot });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: 'failed', failure: attendeeListsFailure(error) });
      });
    return () => controller.abort();
  }, [eventId, version]);

  function reload() {
    setState({ status: 'loading' });
    setVersion((current) => current + 1);
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12 print:p-0">
      <div className="mx-auto max-w-5xl space-y-6 print:max-w-none">
        <header className="space-y-2 print:hidden">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">
            Listas de respaldo
          </h1>
          {state.status === 'ready' && <p className="text-muted">{state.snapshot.event.name}</p>}
          <p className="max-w-3xl text-sm text-muted">
            Listas sin datos de contacto para imprimir o guardar como PDF antes del evento. Úsalas
            si el sistema no está disponible.
          </p>
        </header>
        {state.status === 'loading' && <p role="status">Cargando listas…</p>}
        {state.status === 'failed' && (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
          >
            <p>{failureMessages[state.failure]}</p>
            {state.failure !== 'denied' && (
              <button type="button" className={buttonClass('secondary')} onClick={reload}>
                Reintentar
              </button>
            )}
          </div>
        )}
        {state.status === 'ready' && (
          <Snapshot
            snapshot={state.snapshot}
            selection={selection}
            onSelect={setSelection}
            onReload={reload}
          />
        )}
      </div>
    </main>
  );
}

type SnapshotProps = {
  snapshot: AttendeeLists;
  selection: string;
  onSelect: (selection: string) => void;
  onReload: () => void;
};

function Snapshot({ snapshot, selection, onSelect, onReload }: SnapshotProps) {
  const lists = buildAttendeeLists(snapshot).map((list) => ({
    ...list,
    title: list.group === 'event' ? list.title : `${listKind(list)} · ${list.title}`,
  }));
  const chosen = lists.filter((list) => list.id === selection);
  const shown = chosen.length > 0 ? chosen : lists;
  const generatedAt = formatGeneratedAt(snapshot.generatedAt);
  const options = [
    { id: allListsOption, label: 'Todas las listas' },
    ...lists.map((list) => ({
      id: list.id,
      label: `${list.title} (${peopleCount(list.rows.length)})`,
    })),
  ];

  return (
    <>
      <div className={`${styles.card} flex flex-wrap items-end gap-3 print:hidden`}>
        <Select
          label="Lista"
          options={options}
          selectedKey={lists.some((list) => list.id === selection) ? selection : allListsOption}
          onSelectionChange={onSelect}
          className="min-w-0 flex-1 basis-64"
        />
        <button type="button" className={buttonClass('primary')} onClick={() => window.print()}>
          Imprimir o guardar PDF
        </button>
        <button type="button" className={buttonClass('secondary')} onClick={onReload}>
          Actualizar
        </button>
      </div>
      {shown.map((list, index) => (
        <ListTable
          key={list.id}
          list={list}
          eventName={snapshot.event.name}
          generatedAt={generatedAt}
          breakBefore={index > 0}
        />
      ))}
    </>
  );
}

const headerCell = 'px-3 py-2.5 text-left font-bold first:pl-5 last:pr-5 print:px-2 print:py-1';
const cell = 'px-3 py-3 align-top first:pl-5 last:pr-5 print:px-2 print:py-1.5';
// Printed cells get black borders so the grid stays readable on paper.
const printBorder = 'print:border print:border-black';

type ListTableProps = {
  list: AttendeeListView;
  eventName: string;
  generatedAt: string;
  breakBefore: boolean;
};

function ListTable({ list, eventName, generatedAt, breakBefore }: ListTableProps) {
  const titleId = useId();
  const columns = list.showPasses ? 7 : 6;
  return (
    <section
      aria-labelledby={titleId}
      className={`space-y-3 ${breakBefore ? 'print:break-before-page' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={titleId} className="text-xl font-bold text-heading">
          {list.title}
        </h2>
        <p className="text-sm text-muted">{peopleCount(list.rows.length)}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface print:overflow-visible print:rounded-none print:border-0">
        <table
          aria-labelledby={titleId}
          className="w-full min-w-[48rem] border-collapse text-sm print:min-w-0 print:text-xs"
        >
          {/* The event and the generation time sit in the table head, so browsers repeat them
              at the top of every printed page of the list. */}
          <thead>
            <tr className="border-b border-line">
              <td colSpan={columns} className={`${cell} text-muted ${printBorder}`}>
                <p className="font-semibold text-fg">
                  {eventName} · {list.title}
                </p>
                <p>Generada el {generatedAt}</p>
                <p>Instantánea: puede no reflejar cambios posteriores.</p>
              </td>
            </tr>
            <tr className="border-b border-line text-xs tracking-[0.06em] text-muted uppercase">
              <th scope="col" className={`${headerCell} ${printBorder}`}>
                Nombre
              </th>
              <th scope="col" className={`${headerCell} ${printBorder}`}>
                AKA
              </th>
              <th scope="col" className={`${headerCell} ${printBorder}`}>
                Folio
              </th>
              <th scope="col" className={`${headerCell} ${printBorder}`}>
                Estado
              </th>
              {list.showPasses && (
                <th scope="col" className={`${headerCell} ${printBorder}`}>
                  Pases
                </th>
              )}
              <th scope="col" className={`${headerCell} ${printBorder}`}>
                Asistencia
              </th>
              <th scope="col" className={`${headerCell} w-28 ${printBorder}`}>
                Marca
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Only the event list can be empty: the others exist because someone holds them. */}
            {list.rows.length === 0 && (
              <tr>
                <td colSpan={columns} className={`${cell} ${printBorder}`}>
                  Aún no hay inscripciones confirmadas ni pendientes.
                </td>
              </tr>
            )}
            {list.rows.map((row) => (
              <tr
                key={row.registrationId}
                className="border-b border-row last:border-b-0 print:break-inside-avoid"
              >
                <th
                  scope="row"
                  className={`${cell} text-left font-semibold break-words text-heading ${printBorder}`}
                >
                  {row.fullName}
                </th>
                <td className={`${cell} break-words ${printBorder}`}>{row.stageName ?? ''}</td>
                <td className={`${cell} font-mono whitespace-nowrap ${printBorder}`}>
                  {folioLabel(row.folio)}
                </td>
                <td className={`${cell} ${printBorder}`}>
                  {row.pending ? 'Pendiente de pago' : 'Confirmada'}
                </td>
                {list.showPasses && (
                  <td className={`${cell} ${printBorder}`}>{row.passes.join(', ')}</td>
                )}
                <td className={`${cell} whitespace-nowrap ${printBorder}`}>
                  {entryLabel(row.checkedInAt)}
                </td>
                {/* Left blank for a handwritten mark on paper. */}
                <td className={`${cell} ${printBorder}`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
