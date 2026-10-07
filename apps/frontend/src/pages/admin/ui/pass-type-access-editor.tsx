import type {
  ActivityAccess,
  CatalogActivity,
  CatalogPassType,
  PassTypeActivity,
} from '@/entities/event-catalog';
import { type FormEvent, useId, useState } from 'react';
import { accessLabels, styles } from './catalog-copy';

type Choice = ActivityAccess | 'none';

type PassTypeAccessEditorProps = {
  passType: CatalogPassType;
  activities: CatalogActivity[];
  busy: boolean;
  onSubmit: (activities: PassTypeActivity[]) => void;
  onCancel: () => void;
};

// The backend only accepts active activities of the event, so only those are editable here;
// links to archived activities are dropped when the list is saved.
export function PassTypeAccessEditor({
  passType,
  activities,
  busy,
  onSubmit,
  onCancel,
}: PassTypeAccessEditorProps) {
  const id = useId();
  const active = activities.filter((activity) => activity.status === 'active');
  const activeIds = new Set(active.map((activity) => activity.id));
  const droppedLinks = passType.activities.filter((link) => !activeIds.has(link.activityId));
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(passType.activities.map((link) => [link.activityId, link.access])),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    onSubmit(
      active.flatMap((activity) => {
        const access = choices[activity.id] ?? 'none';
        return access === 'none' ? [] : [{ activityId: activity.id, access }];
      }),
    );
  }

  const title = `Acceso de ${passType.name}`;
  return (
    <form aria-label={title} onSubmit={submit} className={`${styles.card} space-y-4`}>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted">
        Seleccionable: la persona elige esa competencia con su pase. Incluida: el pase da acceso
        directo.
      </p>
      {active.length === 0 ? (
        <p className="text-muted">No hay actividades activas en este evento.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((activity, index) => (
            <div key={activity.id}>
              <label htmlFor={`${id}-${index}`} className={styles.label}>
                {activity.name}
              </label>
              <select
                id={`${id}-${index}`}
                className={styles.field}
                value={choices[activity.id] ?? 'none'}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [activity.id]: event.target.value as Choice,
                  }))
                }
              >
                <option value="none">Sin acceso</option>
                <option value="selectable">{accessLabels.selectable}</option>
                <option value="included">{accessLabels.included}</option>
              </select>
            </div>
          ))}
        </div>
      )}
      {droppedLinks.length > 0 && (
        <p className="text-sm text-warning-fg">
          Este pase tiene {droppedLinks.length} actividad(es) archivada(s) vinculada(s); se quitarán
          al guardar.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={styles.primary}>
          {busy ? 'Guardando…' : 'Guardar acceso'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={styles.secondary}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
