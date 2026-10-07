import { CheckIcon } from '@/shared/ui';
import type { AgendaFilters, KindOption } from './activity-agenda-model';
import { styles } from './catalog-copy';

type ActivityAgendaFiltersProps = {
  filters: AgendaFilters;
  kinds: KindOption[];
  total: number;
  onChange: (filters: AgendaFilters) => void;
};

// Unselected chips are transparent with a border; the selected chip is a solid fill that
// differs in lightness from them in both themes and adds a check icon.
const chip =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-transparent px-4 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-chip-selected aria-pressed:bg-chip-selected aria-pressed:text-chip-selected-fg aria-pressed:hover:bg-chip-selected';

export function ActivityAgendaFilters({
  filters,
  kinds,
  total,
  onChange,
}: ActivityAgendaFiltersProps) {
  const options = [{ kind: null, label: 'Todas', count: total }, ...kinds];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 lg:flex-row lg:items-center lg:justify-between">
      <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.kind ?? 'all'}
            type="button"
            aria-pressed={filters.kind === option.kind}
            className={chip}
            onClick={() => onChange({ ...filters, kind: option.kind })}
          >
            {filters.kind === option.kind && <CheckIcon />}
            {option.label} · {option.count}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-fg">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={filters.showArchived}
            onChange={(event) => onChange({ ...filters, showArchived: event.target.checked })}
          />
          Mostrar archivadas
        </label>
        <label className="relative min-w-0 sm:w-56">
          <span className="sr-only">Buscar actividad</span>
          <input
            type="search"
            placeholder="Buscar actividad"
            className={styles.field}
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
