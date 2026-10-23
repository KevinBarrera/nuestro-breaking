import { readCatalogEventContext } from '@/entities/event-catalog';
import {
  getEventSales,
  salesFailure,
  updateEventSales,
  type EventSales,
  type SalesFailure,
} from '@/entities/event-sales';
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { styles } from './catalog-copy';
import { DateField } from './date-field';
import {
  publicPath,
  salesFormFrom,
  salesInputFrom,
  salesStatus,
  salesZone,
  switchHint,
  type SalesForm,
  type SalesFormErrors,
  type SalesZone,
} from './sales-model';

type Loaded = { sales: EventSales; zone: SalesZone };
type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: SalesFailure }
  | { status: 'ready'; data: Loaded };

type Notice = { kind: 'success' } | { kind: 'failure'; failure: SalesFailure };

const saveFailures: Record<SalesFailure, string> = {
  invalid:
    'No se pudo guardar: el servidor rechazó las fechas. Revisa que sean válidas y que la apertura sea antes del cierre.',
  denied: 'Sin acceso: tu cuenta no puede cambiar la venta de este evento.',
  'not-found': 'No se encontró el evento. Recarga la página e inténtalo de nuevo.',
  error: 'No se pudo guardar la venta en línea. Inténtalo de nuevo más tarde.',
};

const cardHead = 'flex flex-wrap items-start justify-between gap-3 px-6 pt-6';

// "Venta en línea" on the event overview (#317 design): the sales state, the switch, the
// optional window, the public address and one "Guardar cambios" that sends one PUT. It loads
// on its own, so a sales failure never hides the catalog summary (and the other way around).
export function SalesSection({ eventId }: { eventId: string }) {
  const titleId = useId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getEventSales(eventId, controller.signal),
      // The time zone is a nicety: without it the dates use the labeled browser clock.
      readCatalogEventContext(eventId, controller.signal)
        .then((context) => context.timeZone)
        .catch(() => null),
    ])
      .then(([sales, timeZone]) => {
        if (!controller.signal.aborted)
          setState({ status: 'ready', data: { sales, zone: salesZone(timeZone) } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: 'failed', failure: salesFailure(error) });
      });
    return () => controller.abort();
  }, [eventId, revision]);

  const heading = (
    <div className="space-y-1">
      <h2 id={titleId} className="text-xl font-extrabold text-heading">
        Venta en línea
      </h2>
      <p className="text-sm text-muted">
        Decide si el público puede comprar pases y en qué fechas.
      </p>
    </div>
  );

  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-line bg-surface">
      {state.status === 'ready' ? (
        <SalesSettings eventId={eventId} loaded={state.data} heading={heading} />
      ) : (
        <>
          <div className={cardHead}>{heading}</div>
          <div className="px-6 py-5">
            {state.status === 'loading' && <p className="text-sm text-muted">Cargando la venta…</p>}
            {state.status === 'failed' && (
              // Not an alert: the section is secondary to the catalog summary on this page.
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-fg">
                  {state.failure === 'denied'
                    ? 'Sin acceso a la venta en línea de este evento.'
                    : 'No se pudo cargar el estado de la venta.'}
                </p>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setState({ status: 'loading' });
                    setRevision((value) => value + 1);
                  }}
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

type SalesSettingsProps = { eventId: string; loaded: Loaded; heading: ReactNode };

function SalesSettings({ eventId, loaded, heading }: SalesSettingsProps) {
  const { zone } = loaded;
  const [sales, setSales] = useState(loaded.sales);
  const [form, setForm] = useState<SalesForm>(() => salesFormFrom(loaded.sales, zone.timeZone));
  const [errors, setErrors] = useState<SalesFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const status = salesStatus(sales, zone.timeZone);
  const switchId = useId();
  const hintId = useId();

  const change = useCallback((next: Partial<SalesForm>) => {
    setForm((previous) => ({ ...previous, ...next }));
    setNotice(null);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = salesInputFrom(form, zone.timeZone);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await updateEventSales(eventId, result.input);
      setSales(saved);
      setForm(salesFormFrom(saved, zone.timeZone));
      setNotice({ kind: 'success' });
    } catch (error) {
      setNotice({ kind: 'failure', failure: salesFailure(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={cardHead}>
        {heading}
        <div className="flex flex-col items-end gap-1" data-testid="sales-status">
          <span
            className={`rounded-full border px-3 py-0.5 text-xs leading-4 font-semibold ${
              sales.state === 'open'
                ? 'border-success-fg bg-success text-success-fg'
                : 'border-line bg-chip text-muted'
            }`}
          >
            {status.label}
          </span>
          {status.detail && <span className="text-xs text-muted">{status.detail}</span>}
        </div>
      </div>
      <form
        aria-label="Configurar venta en línea"
        onSubmit={(event) => void save(event)}
        noValidate
      >
        <div className="space-y-6 px-6 py-5">
          <div className="flex items-center gap-4 rounded-lg bg-surface-inner p-4">
            <div className="flex flex-1 flex-col gap-0.5">
              <label htmlFor={switchId} className="text-sm font-semibold text-fg">
                Venta en línea activa
              </label>
              <span id={hintId} className="text-sm text-muted">
                {switchHint(form.enabled)}
              </span>
            </div>
            {/* A native checkbox keeps the switch semantics and covers the 44px target; the track
                and knob under it are drawn. */}
            <label className="relative flex min-h-11 min-w-13 shrink-0 cursor-pointer items-center justify-center">
              <input
                id={switchId}
                type="checkbox"
                role="switch"
                aria-describedby={hintId}
                className="peer absolute inset-0 m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-wait"
                checked={form.enabled}
                disabled={saving}
                onChange={(event) => change({ enabled: event.target.checked })}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none relative block h-6 w-11 rounded-full border border-input-line bg-chip transition-colors peer-checked:border-nav-active peer-checked:bg-nav-active peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:opacity-60 motion-reduce:transition-none"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-1/2 size-[1.125rem] -translate-x-[1.25rem] -translate-y-1/2 rounded-full bg-surface shadow-[0_0_0_1px_var(--nb-input-line)] transition-transform peer-checked:translate-x-[0.125rem] peer-checked:bg-nav-active-fg peer-checked:shadow-none motion-reduce:transition-none"
              />
            </label>
          </div>
          <div className="space-y-2.5">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-fg">Periodo de venta</p>
              <p className="text-sm text-muted">
                {zone.label}. Sin fecha, ese lado no tiene límite.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateField
                label="Apertura (opcional)"
                clearLabel="Quitar fecha de apertura"
                value={form.opensAt}
                error={errors.opensAt}
                disabled={saving}
                onChange={(opensAt) => change({ opensAt })}
              />
              <DateField
                label="Cierre (opcional)"
                clearLabel="Quitar fecha de cierre"
                value={form.closesAt}
                error={errors.closesAt}
                disabled={saving}
                onChange={(closesAt) => change({ closesAt })}
              />
            </div>
          </div>
          <PublicAddress slug={sales.slug} />
          <SaveNotice notice={notice} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
          <button type="submit" className={styles.primary} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </>
  );
}

const addressAction =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-input-line bg-surface px-3.5 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

type CopyState = 'idle' | 'copied' | 'failed';

// The read-only public address with "Copiar" (the full URL on this origin) and "Abrir". The
// outcome of a copy is announced, and a failure (no clipboard access) says what to do instead.
function PublicAddress({ slug }: { slug: string }) {
  const labelId = useId();
  const [copy, setCopy] = useState<CopyState>('idle');
  const path = publicPath(slug);

  async function copyAddress() {
    setCopy('idle');
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <div className="space-y-2" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="text-sm font-semibold text-fg">
        Dirección pública
      </p>
      <div className="flex flex-wrap gap-2">
        <p className="flex min-h-11 min-w-0 flex-[1_1_16rem] items-center rounded-lg border border-line bg-surface-inner px-3 font-mono text-sm break-all text-fg">
          {path}
        </p>
        <button type="button" className={addressAction} onClick={() => void copyAddress()}>
          <CopyIcon />
          {copy === 'copied' ? 'Copiada' : 'Copiar'}
        </button>
        <a href={path} target="_blank" rel="noreferrer" className={addressAction}>
          <OpenIcon />
          Abrir
        </a>
      </div>
      <p role="status" className={copy === 'failed' ? 'text-sm text-danger-fg' : 'sr-only'}>
        {copy === 'copied' && 'Dirección copiada.'}
        {copy === 'failed' && 'No se pudo copiar. Selecciona la dirección y cópiala a mano.'}
      </p>
    </div>
  );
}

const iconProps = {
  'aria-hidden': true,
  width: 16,
  height: 16,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'shrink-0',
} as const;

const CopyIcon = () => (
  <svg {...iconProps}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
  </svg>
);

const OpenIcon = () => (
  <svg {...iconProps}>
    <path d="M11 3.5h5.5V9M16.5 3.5L9 11M14 12.5v3a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 15.5v-8A1.5 1.5 0 0 1 4.5 6h3" />
  </svg>
);

function SaveNotice({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  if (notice.kind === 'success')
    return (
      <p
        role="status"
        className="rounded-lg border border-success-fg bg-success px-4 py-3 text-sm text-success-fg"
      >
        Venta en línea guardada.
      </p>
    );
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
    >
      {saveFailures[notice.failure]}
    </p>
  );
}
