import { formatMxn, type CatalogActivity, type CatalogPassType } from '@/entities/event-catalog';
import { Link } from 'react-router';
import { passClassLabels, passStatusLabels, styles } from './catalog-copy';
import { describeAccess } from './overview-model';

type PassTypeListProps = {
  // Active passes only; archived ones go to `ArchivedPassList`.
  passTypes: CatalogPassType[];
  activities: Map<string, CatalogActivity>;
  detailPath: (passTypeId: string) => string;
  // Shown when there is no active pass.
  emptyText: string;
};

const cardClass = 'relative flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4';
const badgeClass = 'rounded-full border px-2.5 py-0.5 text-xs font-semibold';

function CardTop({ passType }: { passType: CatalogPassType }) {
  const active = passType.status === 'active';
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
          {passClassLabels[passType.passClass]}
        </span>
        <span
          className={`${badgeClass} ${
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
    </>
  );
}

// Active pass cards; the whole card is one link to the pass's own screen, laid over the card
// content and named "Editar <pass name>".
export function PassTypeList({ passTypes, activities, detailPath, emptyText }: PassTypeListProps) {
  if (passTypes.length === 0) return <p className="text-muted">{emptyText}</p>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {passTypes.map((passType) => (
        <li key={passType.id} className={`${cardClass} hover:border-heading`}>
          <CardTop passType={passType} />
          <p className="mt-1 flex-1 text-sm text-muted">{describeAccess(passType, activities)}</p>
          {/* The list screen looks this link up to focus it after a restore. */}
          <Link
            to={detailPath(passType.id)}
            data-pass-link={passType.id}
            className="absolute inset-0 min-h-11 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className="sr-only">Editar {passType.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type ArchivedPassListProps = {
  passTypes: CatalogPassType[];
  busy: boolean;
  // Asks for confirmation; the screen restores only after it.
  onRestore: (passType: CatalogPassType) => void;
};

// Archived pass cards cannot be edited; their only control is "Restaurar".
export function ArchivedPassList({ passTypes, busy, onRestore }: ArchivedPassListProps) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {passTypes.map((passType) => (
        <li key={passType.id} className={cardClass}>
          <CardTop passType={passType} />
          <div className="mt-3 flex flex-1 items-end">
            <button
              type="button"
              disabled={busy}
              className={styles.secondary}
              // The name says which pass; the visible "Restaurar" stays at its start.
              aria-label={`Restaurar ${passType.name}`}
              onClick={() => onRestore(passType)}
            >
              Restaurar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
