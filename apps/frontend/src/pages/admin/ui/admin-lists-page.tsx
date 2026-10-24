import {
  attendeeListsFailure,
  fetchAttendeeLists,
  type AttendeeLists,
  type AttendeeListsFailure,
} from '@/entities/attendee-list';
import { routes } from '@/shared/config';
import { buttonClass, CheckboxField } from '@/shared/ui';
import { useEffect, useState } from 'react';
import { generatePath, Link, useParams } from 'react-router';
import {
  buildAttendeeLists,
  defaultPrintOptions,
  entryLabel,
  estimateSheets,
  eventListId,
  folioLabel,
  freshness,
  groupAttendeeLists,
  keptSelection,
  listKindLabel,
  listProgress,
  printLabel,
  searchList,
  sheetsLabel,
  type AttendeeListView,
  type PrintOptions,
} from './attendee-lists-model';
import { AttendeeListsPrintout } from './attendee-lists-printout';

const failureMessages: Record<AttendeeListsFailure, string> = {
  denied: 'No tienes acceso a las listas de este evento.',
  'not-found': 'No encontramos este evento.',
  error: 'No se pudieron cargar las listas. Intenta de nuevo.',
};

// The freshness notice re-reads the clock this often while the page stays open.
const clockTickMs = 60_000;

const svg = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const printerIcon = (size: number, strokeWidth: string) => (
  <svg {...svg} width={size} height={size} strokeWidth={strokeWidth}>
    <path d="M5.5 7.5V3h9v4.5" />
    <rect x="2.5" y="7.5" width="15" height="7" rx="1.5" />
    <path d="M5.5 12h9v5h-9z" />
  </svg>
);

const pill =
  'inline-flex rounded-full border px-2.5 py-0.5 text-xs leading-4 font-semibold whitespace-nowrap';

const toneClasses = {
  success: 'border-success-fg bg-success text-success-fg',
  warning: 'border-warning-fg bg-warning text-warning-fg',
  neutral: 'border-line bg-chip text-muted',
};

const cardClass = 'rounded-xl border border-line bg-surface';

type Load =
  { status: 'loading' } | { status: 'failed'; failure: AttendeeListsFailure } | { status: 'ready' };

export function AdminListsPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <AttendeeListsScreen key={eventId} eventId={eventId} />;
}

// Listas de respaldo (#65, #362): contact-free lists to print or save as PDF before the event,
// for the paper fallback when the system is down. Each load is one snapshot from the server;
// "Actualizar datos" keeps the last one on screen while it reads the next.
function AttendeeListsScreen({ eventId }: { eventId: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [snapshot, setSnapshot] = useState<AttendeeLists | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<string[]>([eventListId]);
  const [focused, setFocused] = useState(eventListId);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState(defaultPrintOptions);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const controller = new AbortController();
    fetchAttendeeLists(eventId, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setNow(new Date());
        setLoad({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoad({ status: 'failed', failure: attendeeListsFailure(error) });
      });
    return () => controller.abort();
  }, [eventId, version]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), clockTickMs);
    return () => clearInterval(timer);
  }, []);

  function reload() {
    setLoad({ status: 'loading' });
    setVersion((current) => current + 1);
  }

  const lists = snapshot ? buildAttendeeLists(snapshot) : [];
  const hasPeople = !!snapshot && snapshot.registrations.length > 0;
  // A checked or focused list that a refresh removed drops out; the focus falls back to the event.
  const checked = keptSelection(selection, lists);
  const printed = lists.filter((list) => checked.includes(list.id));
  const shown = lists.find((list) => list.id === focused) ?? lists[0];

  return (
    <>
      <main
        aria-busy={load.status === 'loading'}
        className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16 print:hidden"
      >
        <div className="@container mx-auto max-w-[1180px] space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <header className="max-w-[640px] space-y-1.5">
              <h1 className="text-3xl font-extrabold tracking-tight text-heading">
                Listas de respaldo
              </h1>
              <p className="text-muted">
                Imprímelas o guárdalas en PDF antes de abrir puertas. Si el sistema falla, la mesa
                sigue registrando entradas en papel. No incluyen correos ni teléfonos.
              </p>
            </header>
            {hasPeople && (
              <button
                type="button"
                disabled={checked.length === 0}
                onClick={() => window.print()}
                className={buttonClass(
                  'primary',
                  'inline-flex min-h-12 items-center gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {printerIcon(18, '1.75')}
                {printLabel(checked.length)}
              </button>
            )}
          </div>

          {load.status === 'failed' && (
            <div
              role="alert"
              className="space-y-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
            >
              <p>{failureMessages[load.failure]}</p>
              {load.failure !== 'denied' && (
                <button type="button" className={buttonClass('secondary')} onClick={reload}>
                  Reintentar
                </button>
              )}
            </div>
          )}
          {!snapshot && load.status === 'loading' && (
            <p role="status" className="text-muted">
              Cargando listas…
            </p>
          )}

          {snapshot && !hasPeople && <EmptyEvent eventId={eventId} />}

          {snapshot && hasPeople && shown && (
            <>
              <FreshnessNotice
                generatedAt={snapshot.generatedAt}
                now={now}
                refreshing={load.status === 'loading'}
                onRefresh={reload}
              />
              <div className="grid items-start gap-5 @min-[900px]:grid-cols-[340px_minmax(0,1fr)]">
                <div className="flex flex-col gap-4">
                  <ListPicker
                    lists={lists}
                    checked={checked}
                    focused={shown.id}
                    onCheck={setSelection}
                    onFocus={(id) => {
                      setFocused(id);
                      setQuery('');
                    }}
                  />
                  <PrintOptionsCard
                    options={options}
                    onChange={setOptions}
                    sheets={estimateSheets(printed, options)}
                  />
                </div>
                <Preview
                  list={shown}
                  included={checked.includes(shown.id)}
                  query={query}
                  onQuery={setQuery}
                />
              </div>
            </>
          )}
        </div>
      </main>
      {snapshot && hasPeople && printed.length > 0 && (
        <AttendeeListsPrintout
          eventName={snapshot.event.name}
          generatedAt={snapshot.generatedAt}
          lists={printed}
          options={options}
        />
      )}
    </>
  );
}

const optionCopy: { key: keyof PrintOptions; label: string; help: string }[] = [
  {
    key: 'cover',
    label: 'Portada con índice',
    help: 'Cómo usar las listas y qué lleva el PDF.',
  },
  {
    key: 'paper',
    label: 'Hoja para inscripciones en papel',
    help: 'Renglones en blanco para quien se inscriba mientras no hay sistema.',
  },
  {
    key: 'sheetPerList',
    label: 'Cada lista en hoja nueva',
    help: 'Útil para repartir una hoja a cada juez. Usa más papel.',
  },
];

type PrintOptionsCardProps = {
  options: PrintOptions;
  onChange: (options: PrintOptions) => void;
  sheets: number;
};

function PrintOptionsCard({ options, onChange, sheets }: PrintOptionsCardProps) {
  return (
    <section aria-labelledby="lists-options-title" className={`${cardClass} flex flex-col p-4`}>
      <h2 id="lists-options-title" className="mb-1 text-lg leading-7 font-bold text-heading">
        Opciones del PDF
      </h2>
      {optionCopy.map(({ key, label, help }) => (
        <CheckboxField
          key={key}
          checked={options[key]}
          onChange={(event) => onChange({ ...options, [key]: event.target.checked })}
          label={
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-heading">{label}</span>
              <span className="text-[13px] leading-[18px] text-muted">{help}</span>
            </span>
          }
        />
      ))}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <span className="text-muted">Tamaño aproximado</span>
        <span className="font-bold text-heading">{sheetsLabel(sheets)}</span>
      </div>
    </section>
  );
}

type FreshnessNoticeProps = {
  generatedAt: string;
  now: Date;
  refreshing: boolean;
  onRefresh: () => void;
};

function FreshnessNotice({ generatedAt, now, refreshing, onRefresh }: FreshnessNoticeProps) {
  const notice = freshness(generatedAt, now);
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 rounded-lg border py-3 pr-3 pl-4 ${toneClasses[notice.tone]}`}
    >
      <svg {...svg} width="20" height="20" strokeWidth="1.75" className="shrink-0">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6v4l2.5 2" />
      </svg>
      <div className="flex min-w-[220px] flex-1 flex-col gap-0.5 text-sm">
        <span className="font-bold">{notice.title}</span>
        <span>{notice.text}</span>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className={buttonClass('secondary', 'inline-flex min-h-11 items-center gap-2 px-4')}
      >
        <svg {...svg} width="16" height="16" strokeWidth="1.75">
          <path d="M16 10a6 6 0 1 1-1.8-4.3" />
          <path d="M16 3.5v3.5h-3.5" />
        </svg>
        {refreshing ? 'Actualizando…' : 'Actualizar datos'}
      </button>
    </div>
  );
}

type ListPickerProps = {
  lists: AttendeeListView[];
  checked: string[];
  focused: string;
  onCheck: (selection: string[]) => void;
  onFocus: (id: string) => void;
};

function ListPicker({ lists, checked, focused, onCheck, onFocus }: ListPickerProps) {
  const toggle = (ids: string[], on: boolean) =>
    onCheck(on ? [...new Set([...checked, ...ids])] : checked.filter((id) => !ids.includes(id)));

  return (
    <section aria-labelledby="lists-picker-title" className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-col gap-0.5 px-4 pt-4 pb-2">
        <h2 id="lists-picker-title" className="text-lg leading-7 font-bold text-heading">
          Qué imprimir
        </h2>
        <p className="text-sm text-muted">Marca las listas del PDF. Toca una para verla.</p>
      </div>
      {groupAttendeeLists(lists).map((group) => {
        const ids = group.lists.map((list) => list.id);
        const allOn = ids.every((id) => checked.includes(id));
        return (
          <div
            key={group.id}
            role="group"
            aria-label={group.label}
            className="border-t border-line px-2 pt-2 pb-3"
          >
            <div className="flex min-h-11 items-center justify-between gap-2 px-2">
              <span className="text-xs leading-4 font-semibold text-muted">{group.label}</span>
              {group.lists.length > 1 && (
                <button
                  type="button"
                  onClick={() => toggle(ids, !allOn)}
                  className="min-h-11 px-1 text-[13px] font-semibold text-link underline underline-offset-3 hover:text-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {allOn ? 'Quitar todas' : 'Marcar todas'}
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.lists.map((list) => {
                const on = checked.includes(list.id);
                const current = list.id === focused;
                return (
                  <li key={list.id} className="flex items-center gap-0.5">
                    <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-row">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle([list.id], !on)}
                        aria-label={`Incluir ${list.title} en el PDF`}
                        className="size-5 accent-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      />
                    </label>
                    <button
                      type="button"
                      aria-pressed={current}
                      onClick={() => onFocus(list.id)}
                      className="group flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-sm text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:bg-nav-active aria-pressed:text-nav-active-fg aria-pressed:hover:bg-nav-active"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">{list.title}</span>
                      <span className="shrink-0 font-mono text-[13px] text-muted group-aria-pressed:text-nav-active-fg">
                        {list.rows.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

type PreviewProps = {
  list: AttendeeListView;
  included: boolean;
  query: string;
  onQuery: (query: string) => void;
};

function Preview({ list, included, query, onQuery }: PreviewProps) {
  const progress = listProgress(list);
  const numbers = new Map(list.rows.map((row, index) => [row.registrationId, index + 1]));
  const rows = searchList(list, query);
  // Number, name, folio, pases (event list only) and the entry pill; narrow width keeps two.
  const columns = list.showPasses
    ? '@min-[640px]:grid-cols-[32px_minmax(0,1.3fr)_96px_minmax(0,1.4fr)_150px]'
    : '@min-[640px]:grid-cols-[32px_minmax(0,1.3fr)_96px_150px]';

  return (
    <section aria-labelledby="lists-preview-title" className={`${cardClass} @container min-w-0`}>
      <div className="flex flex-col gap-4 border-b border-line p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-muted">{listKindLabel(list)}</span>
            <h2 id="lists-preview-title" className="text-[22px] leading-7 font-bold text-heading">
              {list.title}
            </h2>
          </div>
          <span
            className={`${pill} ${included ? 'border-heading bg-surface text-heading' : toneClasses.neutral}`}
          >
            {included ? 'Incluida en el PDF' : 'No incluida en el PDF'}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-chip">
            <div
              className="h-full rounded-full bg-success-fg"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="text-sm">{progress.label}</span>
        </div>
        <label className="flex min-h-12 items-center gap-2.5 rounded-lg border border-input-line bg-input pr-2 pl-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          <svg {...svg} width="18" height="18" strokeWidth="1.75" className="shrink-0 text-muted">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13 13l4 4" />
          </svg>
          <span className="sr-only">Buscar en esta lista</span>
          <input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar en esta lista: nombre, AKA o folio"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted"
          />
        </label>
      </div>
      {rows.length > 0 ? (
        <ol aria-label={list.title} className="divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row.registrationId}
              className={`grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2.5 @min-[640px]:px-5 @min-[640px]:py-2 ${columns}`}
            >
              <span className="hidden font-mono text-[13px] text-muted @min-[640px]:block">
                {numbers.get(row.registrationId)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] leading-[22px] font-bold text-heading">
                  {row.fullName}
                </span>
                {row.stageName && (
                  <span className="truncate text-sm text-muted">AKA {row.stageName}</span>
                )}
              </span>
              <span className="hidden font-mono text-sm @min-[640px]:block">
                {folioLabel(row.folio)}
              </span>
              {list.showPasses && (
                <span className="hidden text-sm @min-[640px]:block">{row.passes.join(', ')}</span>
              )}
              <span>
                {row.pending ? (
                  <span className={`${pill} ${toneClasses.warning}`}>Pendiente de pago</span>
                ) : (
                  <span
                    className={`${pill} ${row.checkedInAt ? toneClasses.success : toneClasses.neutral}`}
                  >
                    {entryLabel(row.checkedInAt)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-6 py-8 text-center text-sm text-muted">
          Nadie en esta lista coincide con “{query.trim()}”.
        </p>
      )}
    </section>
  );
}

// An event without registrations: nothing to print yet, and when to print.
function EmptyEvent({ eventId }: { eventId: string }) {
  return (
    <section
      aria-labelledby="lists-empty-title"
      className={`${cardClass} flex flex-col items-center gap-3 px-6 py-12 text-center`}
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-chip text-heading"
      >
        {printerIcon(28, '1.5')}
      </span>
      <h2 id="lists-empty-title" className="mt-1 text-xl font-bold text-heading">
        Aún no hay listas que imprimir
      </h2>
      <p className="max-w-[480px] text-[15px] leading-[22px] text-muted">
        Las listas se arman con las inscripciones confirmadas o pendientes de pago del evento. En
        cuanto haya al menos una, podrás imprimirlas o guardarlas en PDF.
      </p>
      <Link
        to={generatePath(routes.adminEventRegistrations, { eventId })}
        className={buttonClass('secondary', 'mt-2 inline-flex min-h-12 items-center px-[18px]')}
      >
        Ir a Inscripciones
      </Link>
      <p className="mt-4 flex max-w-[480px] items-start gap-2 text-left text-sm text-muted">
        <svg {...svg} width="18" height="18" strokeWidth="1.75" className="mt-px shrink-0">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9v4.5M10 6.5v.01" />
        </svg>
        <span>
          Imprímelas el día anterior y otra vez justo antes de abrir puertas, para llevar la versión
          más reciente.
        </span>
      </p>
    </section>
  );
}
