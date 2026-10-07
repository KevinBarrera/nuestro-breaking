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
import { type FormEvent, useState } from 'react';
import { passClassLabels, styles } from './catalog-copy';

type PassTypeFormProps = {
  title: string;
  passType?: CatalogPassType;
  busy: boolean;
  onSubmit: (input: PassTypeInput) => void;
  onCancel: () => void;
};

export function PassTypeForm({ title, passType, busy, onSubmit, onCancel }: PassTypeFormProps) {
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
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${styles.label} sm:col-span-2`}>
          Nombre
          <input
            className={styles.field}
            value={name}
            maxLength={200}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={styles.label}>
          Clase
          <select
            className={styles.field}
            value={passClass}
            onChange={(event) => setPassClass(event.target.value as PassClass)}
          >
            {passClasses.map((value) => (
              <option key={value} value={value}>
                {passClassLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.label}>
          Precio (MXN)
          <input
            className={styles.field}
            value={price}
            inputMode="decimal"
            required
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        {passClass === 'add_on' && (
          <label className={styles.label}>
            Requiere pase
            <select
              className={styles.field}
              value={requires}
              onChange={(event) => setRequires(event.target.value as RequiredPassClass | '')}
            >
              <option value="">Ninguno</option>
              {requiredPassClasses.map((value) => (
                <option key={value} value={value}>
                  {passClassLabels[value]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-200">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={styles.primary}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={styles.secondary}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
