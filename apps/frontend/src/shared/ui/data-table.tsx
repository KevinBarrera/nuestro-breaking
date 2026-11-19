import { useId, type ReactNode } from 'react';

// One column of a `DataTable`: its header and how a row fills its cell. `rowHeader` marks the
// column that names the row (a `<th scope="row">`); `align: 'end'` is for amounts.
export type TableColumn<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  rowHeader?: boolean;
  align?: 'start' | 'end';
  // Muted secondary text, such as a description column.
  muted?: boolean;
  // Monospaced figures, such as prices.
  mono?: boolean;
};

type DataTableProps<Row> = {
  title: string;
  description?: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  // Shown instead of the table when there are no rows.
  empty: string;
  // The footer: a row count on the left and an optional note on the right.
  count?: string;
  note?: string;
  // The width below which the table scrolls inside its box instead of squeezing.
  minWidth?: string;
};

// A titled card holding a data table (#317, "Componente · Tabla" in the UI canvas): sentence-case
// headers on a tinted band, rows separated by lines, and a tinted footer. Wide tables scroll
// inside the card, so the page never scrolls sideways.
export function DataTable<Row>({
  title,
  description,
  columns,
  rows,
  rowKey,
  empty,
  count,
  note,
  minWidth = '45rem',
}: DataTableProps<Row>) {
  const titleId = useId();
  const align = (column: TableColumn<Row>) => (column.align === 'end' ? 'text-right' : 'text-left');
  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="space-y-1 px-6 pt-5 pb-4">
        <h2 id={titleId} className="text-xl font-extrabold text-heading">
          {title}
        </h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-line px-6 py-5 text-sm text-muted">{empty}</p>
      ) : (
        <div data-testid="data-table-scroll" className="overflow-x-auto">
          <table aria-labelledby={titleId} className="w-full text-sm" style={{ minWidth }}>
            <thead>
              <tr className="border-y border-line bg-surface-inner">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-3 py-3 text-xs font-semibold text-muted first:pl-6 last:pr-6 ${align(column)}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="h-13 border-b border-line last:border-b-0 hover:bg-surface-inner"
                >
                  {columns.map((column) => {
                    const className = `px-3 py-1 align-middle first:pl-6 last:pr-6 ${align(column)} ${
                      column.muted ? 'text-muted' : 'text-fg'
                    } ${column.mono ? 'font-mono' : ''}`;
                    return column.rowHeader ? (
                      <th key={column.key} scope="row" className={`${className} font-normal`}>
                        {column.cell(row)}
                      </th>
                    ) : (
                      <td key={column.key} className={className}>
                        {column.cell(row)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(count || note) && (
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-line bg-surface-inner px-6 py-3 text-sm text-muted">
          {count && <span>{count}</span>}
          {note && <span>{note}</span>}
        </div>
      )}
    </section>
  );
}

// A neutral chip for a short category inside a table cell, such as a pass class.
export function TableChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-line bg-chip px-2.5 text-xs leading-[18px] font-semibold text-fg">
      {children}
    </span>
  );
}
