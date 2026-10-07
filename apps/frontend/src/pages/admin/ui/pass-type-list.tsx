import { formatMxn, type CatalogActivity, type CatalogPassType } from '@/entities/event-catalog';
import { passClassLabels, passStatusLabels } from './catalog-copy';
import { describeAccess } from './overview-model';

type PassTypeListProps = {
  passTypes: CatalogPassType[];
  activities: Map<string, CatalogActivity>;
  selectedId: string | null;
  busy: boolean;
  onSelect: (passType: CatalogPassType) => void;
};

// Pass cards; the whole active card is one button, laid over the card content and named
// "Editar <pass name>". Archived cards stay visible but cannot be edited.
export function PassTypeList({
  passTypes,
  activities,
  selectedId,
  busy,
  onSelect,
}: PassTypeListProps) {
  if (passTypes.length === 0)
    return <p className="text-muted">Aún no hay pases para este evento.</p>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {passTypes.map((passType) => {
        const active = passType.status === 'active';
        const selected = passType.id === selectedId;
        return (
          <li
            key={passType.id}
            className={`relative flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 ${
              selected ? 'ring-2 ring-heading' : ''
            } ${active ? 'hover:border-heading' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
                {passClassLabels[passType.passClass]}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  active
                    ? 'border-success-fg bg-success text-success-fg'
                    : 'border-line bg-row text-muted'
                }`}
              >
                {passStatusLabels[passType.status]}
              </span>
            </div>
            <h3 className="mt-2 text-base font-bold break-words text-heading">{passType.name}</h3>
            <p className="mt-1 font-mono text-lg font-semibold">{formatMxn(passType.priceCents)}</p>
            <p className="mt-1 flex-1 text-sm text-muted">{describeAccess(passType, activities)}</p>
            {active && (
              <button
                type="button"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => onSelect(passType)}
                className="absolute inset-0 min-h-11 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait"
              >
                <span className="sr-only">Editar {passType.name}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
