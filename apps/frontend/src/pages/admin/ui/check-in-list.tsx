import { Select } from '@/shared/ui';
import { useState, type KeyboardEvent, type Ref } from 'react';
import {
  activityOptions,
  eventEntryName,
  progress,
  progressLabel,
  rowStatus,
  statusCounts,
  visibleRoster,
  type ActivityFilter,
  type RosterPerson,
  type StatusFilter,
} from './check-in-roster-model';
import { StatusPill } from './team-list';

const statusFilters: { id: StatusFilter; label: string }[] = [
  { id: 'pending', label: 'Por entrar' },
  { id: 'done', label: 'Ya entraron' },
  { id: 'all', label: 'Todas' },
];

const chipClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input-line bg-surface px-3.5 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-chip-selected aria-pressed:bg-chip-selected aria-pressed:text-chip-selected-fg aria-pressed:hover:bg-chip-selected';

// Rows render in pages so a large event stays responsive.
const pageSize = 100;

const svg = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export type CheckInFilters = { query: string; status: StatusFilter; activity: ActivityFilter };

export function CheckInProgress({
  roster,
  activity,
}: {
  roster: RosterPerson[];
  activity: ActivityFilter;
}) {
  const { registered, total } = progress(roster, activity);
  const percent = total ? Math.round((registered * 100) / total) : 0;
  return (
    <div className="flex min-w-60 flex-[0_1_300px] flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-heading">{progressLabel(roster, activity)}</span>
        <span className="font-mono text-fg">
          {registered} de {total}
        </span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-chip">
        <div className="h-full rounded-full bg-heading" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function CheckInList({
  roster,
  filters,
  onFiltersChange,
  onOpen,
  searchRef,
}: {
  roster: RosterPerson[];
  filters: CheckInFilters;
  onFiltersChange: (filters: CheckInFilters) => void;
  onOpen: (person: RosterPerson) => void;
  searchRef: Ref<HTMLInputElement>;
}) {
  const [shown, setShown] = useState(pageSize);
  const searching = !!filters.query.trim();
  const rows = visibleRoster(roster, filters);
  const counts = statusCounts(roster, filters.activity);
  const options = activityOptions(roster);
  const set = (change: Partial<CheckInFilters>) => {
    setShown(pageSize);
    onFiltersChange({ ...filters, ...change });
  };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && rows.length === 1) {
      event.preventDefault();
      onOpen(rows[0]);
    }
  }

  const listTitle = searching
    ? `${rows.length} ${rows.length === 1 ? 'resultado' : 'resultados'}`
    : `${rows.length} ${rows.length === 1 ? 'persona' : 'personas'}`;
  const empty = searching
    ? {
        title: `No encontramos a nadie con “${filters.query.trim()}”`,
        text: 'Revisa el folio o busca por alias. Si la persona no aparece, no está inscrita en este evento.',
      }
    : filters.status === 'pending'
      ? {
          title: 'Ya entraron todas las personas',
          text: 'No queda nadie por registrar con este filtro.',
        }
      : filters.status === 'done'
        ? { title: 'Todavía no entra nadie', text: 'Las entradas que registres aparecen aquí.' }
        : { title: 'Nadie tiene esta actividad', text: 'Elige otra actividad.' };

  return (
    <div className="@container flex flex-col gap-3">
      <label className="flex min-h-14 items-center gap-2.5 rounded-lg border border-input-line bg-input pr-2 pl-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
        <svg {...svg} width="20" height="20" strokeWidth="1.75" className="shrink-0 text-muted">
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13 13l4 4" />
        </svg>
        <span className="sr-only">Buscar inscripción</span>
        <input
          ref={searchRef}
          type="search"
          // Staff open the screen to find someone, so the search takes the focus.
          autoFocus
          value={filters.query}
          onChange={(event) => set({ query: event.target.value })}
          onKeyDown={onKeyDown}
          placeholder="Nombre, alias o folio"
          className="min-h-13 min-w-0 flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => set({ query: '' })}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-focus"
          >
            <svg {...svg} width="18" height="18" strokeWidth="1.75">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        )}
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {searching ? (
          <p className="text-sm text-muted">
            Buscando en todas las inscripciones, hayan entrado o no.
          </p>
        ) : (
          <div role="group" aria-label="Filtrar por entrada" className="flex flex-wrap gap-2">
            {statusFilters.map((entry) => {
              const selected = filters.status === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={selected}
                  className={chipClass}
                  onClick={() => set({ status: entry.id })}
                >
                  {selected && (
                    <svg {...svg} width="14" height="14" strokeWidth="2.25">
                      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                    </svg>
                  )}
                  {entry.label}
                  <span className="font-mono text-[13px] font-medium">{counts[entry.id]}</span>
                </button>
              );
            })}
          </div>
        )}
        <Select
          variant="filter"
          label="Actividad"
          options={options}
          selectedKey={filters.activity}
          selectedLabel={
            filters.activity === 'all'
              ? 'Todas'
              : filters.activity === 'event'
                ? eventEntryName
                : undefined
          }
          onSelectionChange={(activity) => set({ activity })}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex justify-between gap-3 border-b border-line bg-surface-inner px-5 py-3 text-sm">
          <span role="status" className="font-semibold text-heading">
            {listTitle}
          </span>
          {searching && rows.length === 1 && (
            <span className="text-muted">Presiona Enter para abrirla</span>
          )}
        </div>
        {rows.length ? (
          <ul aria-label="Inscripciones">
            {rows.slice(0, shown).map((person) => {
              const status = rowStatus(person, filters.activity);
              return (
                <li key={person.registrationId} className="border-line not-first:border-t">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`${person.fullName}, ${person.folio ?? 'sin folio'}, ${status.text}. Abrir ficha`}
                    onClick={() => onOpen(person)}
                    className="grid min-h-17 w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-x-4 px-4 py-3 text-left text-sm text-fg hover:bg-surface-inner focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus @3xl:grid-cols-[minmax(0,1.6fr)_104px_minmax(0,1.2fr)_180px_20px] @3xl:px-5"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] leading-[22px] font-bold text-heading">
                        {person.fullName}
                      </span>
                      <span className="truncate text-muted">{person.stageName ?? 'Sin alias'}</span>
                    </span>
                    <span className="hidden font-mono @3xl:block">
                      {person.folio ?? 'Sin folio'}
                    </span>
                    <span className="hidden truncate text-muted @3xl:block">{person.pass}</span>
                    <span className="flex">
                      <StatusPill tone={status.tone}>{status.text}</StatusPill>
                    </span>
                    <svg {...svg} width="18" height="18" strokeWidth="1.75" className="text-muted">
                      <path d="M8 5l5 5-5 5" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
            <span className="text-base font-bold text-heading">{empty.title}</span>
            <span className="max-w-[480px] text-sm text-muted">{empty.text}</span>
          </div>
        )}
        {rows.length > shown && (
          <div className="flex justify-center border-t border-line p-3">
            <button
              type="button"
              onClick={() => setShown(shown + pageSize)}
              className="min-h-11 rounded-lg px-4 text-sm font-semibold text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-focus"
            >
              Mostrar más ({rows.length - shown} restantes)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
