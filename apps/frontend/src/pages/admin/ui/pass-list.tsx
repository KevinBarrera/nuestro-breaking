import {
  formatEventTime,
  type CatalogActivity,
  type CatalogPassType,
  type CatalogStatus,
} from '@/entities/event-catalog';
import type { EventSales } from '@/entities/event-sales';
import { type KeyboardEvent, useId, useRef } from 'react';
import { Link } from 'react-router';
import { PlusIcon, RestoreIcon, WarningIcon } from './activity-icons';
import { styles } from './catalog-copy';
import {
  noAccess,
  noAccessPill,
  passAccessSummary,
  passPanelId,
  passPriceLabel,
  saleLabel,
  saleOpen,
  soldLabel,
  passTabId,
  type PassGroup,
} from './pass-catalog-model';

const tabs: { id: CatalogStatus; label: string }[] = [
  { id: 'active', label: 'Activos' },
  { id: 'archived', label: 'Archivados' },
];

type PassTabsProps = {
  // Prefix for the tab and panel ids; the screen renders the panel.
  id: string;
  tab: CatalogStatus;
  counts: Record<CatalogStatus, number>;
  onChange: (tab: CatalogStatus) => void;
};

// "Activos N" / "Archivados N", with the arrow keys of the WAI-ARIA tabs pattern.
export function PassTabs({ id, tab, counts, onChange }: PassTabsProps) {
  const refs = useRef<Partial<Record<CatalogStatus, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: CatalogStatus = tab === 'active' ? 'archived' : 'active';
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Estado"
      onKeyDown={onKeyDown}
      className="flex gap-2 border-b border-line"
    >
      {tabs.map((entry) => {
        const selected = tab === entry.id;
        return (
          <button
            key={entry.id}
            ref={(node) => {
              refs.current[entry.id] = node;
            }}
            type="button"
            role="tab"
            id={passTabId(id, entry.id)}
            aria-selected={selected}
            aria-controls={passPanelId(id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(entry.id)}
            className={`-mb-px flex min-h-12 items-center gap-1.5 border-b-[3px] px-3 text-[15px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              selected
                ? 'border-link text-heading'
                : 'border-transparent text-muted hover:text-heading'
            }`}
          >
            {entry.label}{' '}
            <span className="font-mono text-[13px] font-medium">{counts[entry.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

type PassListProps = {
  groups: PassGroup[];
  activityById: Map<string, CatalogActivity>;
  // Vendidos per pass; null hides the column (the snapshot could not be read).
  sold: Map<string, number> | null;
  // The event's online sale; null when it could not be read (only the pass date decides).
  sales: EventSales | null;
  now: number;
  // The event's IANA time zone, for a pass's own online close time (#240).
  timeZone: string;
  detailPath: (passTypeId: string) => string;
  busy: boolean;
  // Archived rows restore right away instead of linking to the editor.
  onRestore: (passType: CatalogPassType) => void;
};

// The columns at full width. Under 760px (container query) the header hides and each row
// stacks: name, access and vendidos on the left, the pill and the price on the right.
// The last column is the chevron of a linked row, or "Restaurar" on an archived one.
const columns = (withSold: boolean, archived = false) =>
  archived
    ? withSold
      ? '@min-[760px]:grid-cols-[minmax(0,1.4fr)_132px_minmax(0,1.3fr)_104px_128px_auto]'
      : '@min-[760px]:grid-cols-[minmax(0,1.4fr)_132px_minmax(0,1.3fr)_128px_auto]'
    : withSold
      ? '@min-[760px]:grid-cols-[minmax(0,1.4fr)_132px_minmax(0,1.3fr)_104px_128px_20px]'
      : '@min-[760px]:grid-cols-[minmax(0,1.4fr)_132px_minmax(0,1.3fr)_128px_20px]';

export function PassList({ groups, ...rowProps }: PassListProps) {
  return (
    <div className="@container space-y-7">
      {groups.map((group) => (
        <PassGroupSection key={group.passClass} group={group} {...rowProps} />
      ))}
    </div>
  );
}

function PassGroupSection({
  group,
  ...rowProps
}: Omit<PassListProps, 'groups'> & { group: PassGroup }) {
  const headingId = useId();
  const withSold = rowProps.sold !== null;
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h2 id={headingId} className="text-lg font-bold text-heading">
          {group.label}
        </h2>
        <span className="text-sm text-muted">{group.help}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div
          aria-hidden="true"
          className={`hidden gap-x-4 border-b border-line bg-surface-inner px-5 py-2.5 text-[13px] leading-[18px] font-semibold text-muted @min-[760px]:grid ${columns(withSold, group.passes[0]?.status === 'archived')}`}
        >
          <span>Pase</span>
          <span>Precio</span>
          <span>Acceso</span>
          {withSold && <span>Vendidos</span>}
          <span>Venta en línea</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {group.passes.map((passType) => (
            <li key={passType.id}>
              <PassRow passType={passType} {...rowProps} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PassRow({
  passType,
  activityById,
  sold,
  sales,
  now,
  timeZone,
  detailPath,
  busy,
  onRestore,
}: Omit<PassListProps, 'groups'> & { passType: CatalogPassType }) {
  const archived = passType.status === 'archived';
  const price = passPriceLabel(passType.priceCents);
  const access = passAccessSummary(passType, activityById);
  const count = sold ? (sold.get(passType.id) ?? 0) : null;
  const open = saleOpen(passType, sales, now);
  const issue = !archived && noAccess(passType, activityById);
  // A pass that closes before the event sale does keeps its date under the pill (#240).
  const closesAt =
    open && passType.onlineSalesClosesAt
      ? `Hasta ${formatEventTime(passType.onlineSalesClosesAt, timeZone)}`
      : null;
  const cells = (
    <>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-bold break-words">{passType.name}</span>
        {issue && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-warning-fg bg-warning px-2.5 py-0.5 text-xs font-semibold text-warning-fg">
            <WarningIcon />
            {noAccessPill}
          </span>
        )}
      </span>
      <span className="col-start-2 row-start-2 text-right font-mono font-medium @min-[760px]:col-start-auto @min-[760px]:row-start-auto @min-[760px]:text-left">
        {price}
      </span>
      <span className="col-start-1 min-w-0 text-sm text-muted @min-[760px]:col-start-auto">
        {access}
      </span>
      {count !== null && (
        <span className="col-start-1 text-sm @min-[760px]:col-start-auto">
          <span className="font-mono font-medium">{count}</span>{' '}
          <span className="text-muted">{soldLabel(count)}</span>
        </span>
      )}
      <span className="col-start-2 row-start-1 flex flex-col items-end gap-1 justify-self-end @min-[760px]:col-start-auto @min-[760px]:row-start-auto @min-[760px]:items-start @min-[760px]:justify-self-start">
        {archived ? (
          <span className="inline-flex rounded-full border border-line bg-row px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-muted">
            Archivado
          </span>
        ) : (
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
              open
                ? 'border-success-fg bg-success text-success-fg'
                : 'border-line bg-row text-muted'
            }`}
          >
            {saleLabel(open)}
          </span>
        )}
        {closesAt && <span className="text-xs text-muted">{closesAt}</span>}
      </span>
    </>
  );
  const grid = `grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-heading @min-[760px]:px-5 ${columns(count !== null, archived)}`;

  if (archived)
    return (
      <div className={grid}>
        {cells}
        <button
          type="button"
          disabled={busy}
          className={`${styles.secondary} col-span-full inline-flex items-center justify-center gap-2 justify-self-start @min-[760px]:col-span-1`}
          aria-label={`Restaurar ${passType.name}`}
          onClick={() => onRestore(passType)}
        >
          <RestoreIcon />
          Restaurar
        </button>
      </div>
    );

  const label = [
    passType.name,
    price,
    access,
    ...(count !== null ? [`${count} ${soldLabel(count)}`] : []),
    saleLabel(open),
    ...(closesAt ? [closesAt] : []),
  ].join(', ');
  return (
    <Link
      to={detailPath(passType.id)}
      data-pass-link={passType.id}
      aria-label={`${label}${issue ? `. Atención: ${noAccessPill.toLowerCase()}` : ''}. Editar pase`}
      className={`${grid} hover:bg-surface-inner focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`}
    >
      {cells}
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
        className="hidden text-muted @min-[760px]:block"
      >
        <path d="M8 5l5 5-5 5" />
      </svg>
    </Link>
  );
}

// The event has no pass at all: no tabs, just the way to start.
export function PassesEmpty({
  newPath,
  activitiesPath,
}: {
  newPath: string;
  activitiesPath: string;
}) {
  return (
    <section
      aria-labelledby="passes-empty"
      className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-surface-inner text-heading"
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5V5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v1.5a2 2 0 0 0 0 4V13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-2.5a2 2 0 0 0 0-4z" />
          <path d="M12 4v10" strokeDasharray="1.5 2" />
        </svg>
      </span>
      <h2 id="passes-empty" className="mt-1 text-xl font-bold text-heading">
        Aún no hay pases
      </h2>
      <p className="max-w-[480px] text-[15px] leading-[22px] text-muted">
        Crea lo que vas a vender: un pase completo por disciplina, una entrada general y, si
        quieres, adicionales como Open Styles.
      </p>
      <Link to={newPath} className={`${styles.primaryLarge} mt-2`}>
        <PlusIcon />
        Crear el primer pase
      </Link>
      <p className="mt-4 flex max-w-[480px] items-start gap-2 text-left text-sm text-muted">
        <InfoIcon />
        <span>
          Conviene crear antes las{' '}
          <Link to={activitiesPath} className="text-link underline underline-offset-[3px]">
            actividades
          </Link>
          : al armar el pase eliges a cuáles da acceso.
        </span>
      </p>
    </section>
  );
}

export const InfoIcon = () => (
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
    className="mt-px shrink-0"
  >
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v4.5M10 6.5v.01" />
  </svg>
);
