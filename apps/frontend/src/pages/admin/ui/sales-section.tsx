import { readCatalogEventContext } from '@/entities/event-catalog';
import {
  getEventSales,
  salesFailure,
  updateEventSales,
  type EventSales,
  type SalesFailure,
} from '@/entities/event-sales';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { styles } from './catalog-copy';
import {
  publicPath,
  salesFormFrom,
  salesInputFrom,
  salesStatus,
  salesZone,
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

// "Venta en línea" on the event overview: the sales state, the public address and the form
// that replaces the switch and the optional window with one PUT. It loads on its own, so a
// sales failure never hides the catalog summary (and the other way around).
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

  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-4`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Venta en línea
      </h2>
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
      {state.status === 'ready' && <SalesSettings eventId={eventId} loaded={state.data} />}
    </section>
  );
}

function SalesSettings({ eventId, loaded }: { eventId: string; loaded: Loaded }) {
  const { zone } = loaded;
  const [sales, setSales] = useState(loaded.sales);
  const [form, setForm] = useState<SalesForm>(() => salesFormFrom(loaded.sales, zone.timeZone));
  const [errors, setErrors] = useState<SalesFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const status = salesStatus(sales, zone.timeZone);

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
      <div className="flex flex-wrap items-center gap-3" data-testid="sales-status">
        <span
          className={`rounded-md px-2.5 py-1 text-sm font-bold ${
            status.label === 'Abierta' ? 'bg-success text-success-fg' : 'bg-chip text-fg'
          }`}
        >
          {status.label}
        </span>
        {status.detail && <span className="text-sm text-fg">{status.detail}</span>}
      </div>
      <dl className="grid gap-1 rounded-lg bg-surface-inner p-3 text-sm">
        <dt className="font-semibold text-muted">Dirección pública</dt>
        <dd className="font-mono break-all text-fg">{publicPath(sales.slug)}</dd>
        <dd className="text-muted">
          Identificador: <span className="font-mono break-all">{sales.slug}</span>
        </dd>
      </dl>
      <form
        aria-label="Configurar venta en línea"
        className="space-y-4"
        onSubmit={(event) => void save(event)}
        noValidate
      >
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-fg">
          <input
            type="checkbox"
            role="switch"
            className="size-5 accent-primary"
            checked={form.enabled}
            disabled={saving}
            onChange={(event) => change({ enabled: event.target.checked })}
          />
          Venta en línea activa
        </label>
        <p className="text-sm text-muted">
          Apagada, la venta queda cerrada aunque las fechas estén dentro del periodo.
        </p>
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
        <p className="text-xs text-muted">{zone.label}. Sin fecha, ese lado no tiene límite.</p>
        <SaveNotice notice={notice} />
        <button type="submit" className={styles.primary} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </>
  );
}

type DateFieldProps = {
  label: string;
  clearLabel: string;
  value: string;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
};

function DateField({ label, clearLabel, value, error, disabled, onChange }: DateFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error) input.current?.focus();
  }, [error]);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className="flex items-start gap-2">
        <input
          ref={input}
          id={id}
          className={`${styles.field} min-w-0 font-mono`}
          type="datetime-local"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={`${styles.secondary} mt-1 shrink-0`}
          aria-label={clearLabel}
          disabled={disabled || value === ''}
          onClick={() => onChange('')}
        >
          Quitar
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

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
