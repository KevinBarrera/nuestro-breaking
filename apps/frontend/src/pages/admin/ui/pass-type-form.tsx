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
import { Select } from '@/shared/ui';
import { type FormEvent, useId, useState } from 'react';
import { passClassLabels, styles } from './catalog-copy';

type PassTypeFormProps = {
  title: string;
  passType?: CatalogPassType;
  busy: boolean;
  onSubmit: (input: PassTypeInput) => void;
  onCancel: () => void;
  // Only an existing active pass can be archived; archiving asks for confirmation first.
  onArchive?: () => void;
};

// "Ninguno" stands for no required class (stored as ''), so it gets an explicit key.
const requiredOptions = [
  { id: 'none', label: 'Ninguno' },
  ...requiredPassClasses.map((value) => ({ id: value, label: passClassLabels[value] })),
];

const segment =
  'relative flex min-h-11 items-center justify-center rounded-md px-2 text-sm font-semibold text-fg has-checked:bg-nav-active has-checked:text-nav-active-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus';

export function PassTypeForm({
  title,
  passType,
  busy,
  onSubmit,
  onCancel,
  onArchive,
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
    setError(null);
    onSubmit({
      name: name.trim(),
      passClass,
      priceCents,
      // Only add-ons may require another pass class; the backend rejects it on other classes.
      requiresPassClass: passClass === 'add_on' && requires ? requires : null,
    });
  }

  return (
    <form aria-label={title} onSubmit={submit} className={`${styles.card} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-heading">{title}</h2>
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
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg border border-input-line bg-input p-1">
            {passClasses.map((value) => (
              <label key={value} className={segment}>
                <input
                  type="radio"
                  name={`${id}-class`}
                  value={value}
                  checked={passClass === value}
                  onChange={() => setPassClass(value)}
                  className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-md"
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
          <Select
            label="Requiere pase"
            options={requiredOptions}
            selectedKey={requires || 'none'}
            onSelectionChange={(key) =>
              setRequires(key === 'none' ? '' : (key as RequiredPassClass))
            }
          />
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
      {confirmingArchive && passType ? (
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-sm text-warning-fg">
            ¿Archivar {passType.name}? Ya no se podrá asignar a nuevas inscripciones.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} className={styles.danger} onClick={onArchive}>
              Confirmar archivo
            </button>
            <button
              type="button"
              disabled={busy}
              className={styles.secondary}
              onClick={() => setConfirmingArchive(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
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
      )}
    </form>
  );
}
