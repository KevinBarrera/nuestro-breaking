import {
  centsToInput,
  parseMxnToCents,
  passClasses,
  requiredPassClasses,
  type CatalogPassType,
  type PassClass,
  type PassTypeInput,
  type RequiredPassClass,
} from '@/entities/event-catalog';
import { ConfirmDialog, Select } from '@/shared/ui';
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { passClassLabels, styles } from './catalog-copy';
import { passFieldRows } from './pass-changes';

type PassTypeFormProps = {
  title: string;
  passType?: CatalogPassType;
  busy: boolean;
  // A valid submit that changes something; the screen reviews it before saving.
  onSubmit: (input: PassTypeInput) => void;
  onCancel: () => void;
  // Only an existing active pass can be archived, after a confirmation dialog. Resolves to
  // whether the archive succeeded; a failure closes the dialog so the page alert shows.
  onArchive?: () => Promise<boolean>;
  // Reports whether the fields differ from the saved pass (or, for a new pass, from empty).
  onDirtyChange?: (dirty: boolean) => void;
  // The card heading; the form's accessible name stays `title`.
  heading?: string;
  // A second card beside the fields (the new pass's access list). With it, the form lays out
  // both cards in two columns from `lg` up, stacked on phones, and the actions go below both.
  aside?: ReactNode;
};

// "Ninguno" stands for no required class (stored as ''), so it gets an explicit key.
const requiredOptions = [
  { id: 'none', label: 'Ninguno' },
  ...requiredPassClasses.map((value) => ({ id: value, label: passClassLabels[value] })),
];

export function PassTypeForm({
  title,
  passType,
  busy,
  onSubmit,
  onCancel,
  onArchive,
  onDirtyChange,
  heading = title,
  aside,
}: PassTypeFormProps) {
  const id = useId();
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [name, setName] = useState(passType?.name ?? '');
  const [passClass, setPassClass] = useState<PassClass>(passType?.passClass ?? 'full');
  const [price, setPrice] = useState(passType ? centsToInput(passType.priceCents) : '');
  const [requires, setRequires] = useState<RequiredPassClass | ''>(
    passType?.requiresPassClass ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  // Only add-ons may require another pass class; the backend rejects it on other classes.
  const requiresPassClass = passClass === 'add_on' && requires ? requires : null;
  // Compared with the pass as it is now, so a confirmed save (applied in place) reads as clean.
  const dirty = passType
    ? name.trim() !== passType.name ||
      passClass !== passType.passClass ||
      parseMxnToCents(price) !== passType.priceCents ||
      requiresPassClass !== passType.requiresPassClass
    : name !== '' || passClass !== 'full' || price !== '' || requires !== '';

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const priceCents = parseMxnToCents(price);
    if (!name.trim()) {
      setError('Escribe el nombre del pase.');
      return;
    }
    if (priceCents === null) {
      setError(
        'Escribe un precio válido en pesos, sin separadores de miles y con hasta 2 decimales, por ejemplo 1500 o 1500,50.',
      );
      return;
    }
    const input = { name: name.trim(), passClass, priceCents, requiresPassClass };
    // "Guardar cambios" stays enabled and explains itself: a disabled button is skipped by the
    // keyboard and would not tell anyone why nothing can be saved.
    if (passType && passFieldRows(passType, input).length === 0) {
      setError('No hay cambios para guardar.');
      return;
    }
    setError(null);
    onSubmit(input);
  }

  async function archive() {
    if (busy || !onArchive) return;
    if (!(await onArchive())) setConfirmingArchive(false);
  }

  const fields = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-heading">{heading}</h2>
        {passType && (
          <span className="font-mono text-sm text-muted">
            <span className="sr-only">Versión </span>v{passType.version}
          </span>
        )}
      </div>
      <div className="grid gap-4">
        <label className={styles.label}>
          Nombre
          <input
            className={styles.field}
            value={name}
            maxLength={200}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <fieldset>
          <legend className={styles.label}>Clase</legend>
          <div className={`mt-1 ${styles.segments}`}>
            {passClasses.map((value) => (
              <label key={value} className={styles.segment}>
                <input
                  type="radio"
                  name={`${id}-class`}
                  value={value}
                  checked={passClass === value}
                  onChange={() => setPassClass(value)}
                  className={styles.segmentInput}
                />
                {passClassLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={styles.label}>
          Precio (MXN)
          <input
            className={`${styles.field} font-mono`}
            value={price}
            inputMode="decimal"
            required
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        {passClass === 'add_on' && (
          <div>
            <Select
              label="Requiere pase"
              options={requiredOptions}
              selectedKey={requires || 'none'}
              onSelectionChange={(key) =>
                setRequires(key === 'none' ? '' : (key as RequiredPassClass))
              }
            />
            <p className="mt-1 text-sm text-muted">Solo aplica a pases adicionales.</p>
          </div>
        )}
      </div>
    </>
  );

  const actions = (
    <>
      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={styles.primary}>
          {busy ? 'Guardando…' : passType ? 'Guardar cambios' : 'Guardar'}
        </button>
        {onArchive && (
          <button
            type="button"
            disabled={busy}
            className={styles.secondary}
            onClick={() => setConfirmingArchive(true)}
          >
            Archivar
          </button>
        )}
        <button type="button" disabled={busy} onClick={onCancel} className={styles.secondary}>
          Cancelar
        </button>
      </div>
      {passType && onArchive && (
        <ConfirmDialog
          isOpen={confirmingArchive}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirmingArchive(false);
          }}
          title={`¿Archivar ${passType.name}?`}
          consequence="Ya no se podrá asignar a nuevas inscripciones."
          confirmLabel="Archivar"
          pendingLabel="Archivando…"
          tone="destructive"
          isPending={busy}
          onConfirm={() => void archive()}
        />
      )}
    </>
  );

  if (!aside)
    return (
      <form aria-label={title} onSubmit={submit} className={`${styles.card} space-y-4`}>
        {fields}
        {actions}
      </form>
    );

  // One form and one submit for both cards, so the access list goes out with the fields.
  return (
    <form aria-label={title} onSubmit={submit} className="space-y-4">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={`${styles.card} min-w-0 space-y-4`}>{fields}</div>
        <div className="min-w-0">{aside}</div>
      </div>
      {actions}
    </form>
  );
}
