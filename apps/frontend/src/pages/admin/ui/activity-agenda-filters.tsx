import { CheckIcon } from '@/shared/ui';
import { type KeyboardEvent, useRef } from 'react';
import {
  agendaPanelId,
  agendaTabId,
  type AgendaFilters,
  type AgendaTab,
  type KindOption,
} from './activity-agenda-model';

type ActivityAgendaFiltersProps = {
  // Prefix for the tab and panel ids; the page renders the panel.
  id: string;
  filters: AgendaFilters;
  tabCounts: Record<AgendaTab, number>;
  // "Todas" first, as `kindOptions` returns them.
  kinds: KindOption[];
  onChange: (filters: AgendaFilters) => void;
};

const tabs: { id: AgendaTab; label: string }[] = [
  { id: 'active', label: 'Activas' },
  { id: 'archived', label: 'Archivadas' },
];

// Unselected chips are white with a border; the selected chip is a solid fill that differs in
// lightness from them in both themes and adds a check icon.
const chip =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input-line bg-surface px-3.5 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-chip-selected aria-pressed:bg-chip-selected aria-pressed:text-chip-selected-fg aria-pressed:hover:bg-chip-selected';

// "Activas" / "Archivadas" tabs, then the search and the type chips. Changing tab resets the
// chip to "Todas": each tab has its own kinds.
export function ActivityAgendaFilters({
  id,
  filters,
  tabCounts,
  kinds,
  onChange,
}: ActivityAgendaFiltersProps) {
  const tabRefs = useRef<Partial<Record<AgendaTab, HTMLButtonElement | null>>>({});

  const pickTab = (tab: AgendaTab) => onChange({ ...filters, tab, kind: null });

  // Arrow keys move between the two tabs, as in the WAI-ARIA tabs pattern.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: AgendaTab = filters.tab === 'active' ? 'archived' : 'active';
    pickTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Estado"
        onKeyDown={onKeyDown}
        className="flex gap-2 border-b border-line"
      >
        {tabs.map((tab) => {
          const selected = filters.tab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={agendaTabId(id, tab.id)}
              aria-selected={selected}
              aria-controls={agendaPanelId(id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => pickTab(tab.id)}
              className={`-mb-px flex min-h-12 items-center gap-1.5 border-b-[3px] px-3 text-[15px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                selected
                  ? 'border-link text-heading'
                  : 'border-transparent text-muted hover:text-heading'
              }`}
            >
              {tab.label}{' '}
              <span className="font-mono text-[13px] font-medium">{tabCounts[tab.id]}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-12 min-w-0 flex-[1_1_280px] items-center gap-2.5 rounded-lg border border-input-line bg-input pr-1.5 pl-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          <SearchIcon />
          <span className="sr-only">Buscar actividad</span>
          <input
            type="search"
            placeholder="Buscar actividad"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted"
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
          />
        </label>
        <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
          {kinds.map((option) => (
            <button
              key={option.kind ?? 'all'}
              type="button"
              aria-pressed={filters.kind === option.kind}
              className={chip}
              onClick={() => onChange({ ...filters, kind: option.kind })}
            >
              {filters.kind === option.kind && <CheckIcon />}
              <span>{option.label}</span>{' '}
              <span className="font-mono text-[13px] font-medium">{option.count}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

const SearchIcon = () => (
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0 text-muted"
  >
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13 13l4 4" />
  </svg>
);
