import { FieldError, Select, TextField, type SelectOption } from '@/shared/ui';
import { locationHint, type EventErrors, type EventLocationDraft } from './event-form-model';

type LocationFieldsProps = {
  value: EventLocationDraft;
  errors: EventErrors;
  countries: SelectOption[];
  // Nuevo evento disables the fields while sending; Datos del evento makes them read-only.
  locked: boolean;
  lockMode: 'disabled' | 'readOnly';
  onChange: (changes: Partial<EventLocationDraft>) => void;
};

// "Ubicación" on Nuevo evento and Datos del evento (#322): city, state and country.
export function LocationFields({
  value,
  errors,
  countries,
  locked,
  lockMode,
  onChange,
}: LocationFieldsProps) {
  const lock = lockMode === 'disabled' ? { disabled: locked } : { readOnly: locked };
  return (
    // `min-w-0`: a fieldset defaults to its content width.
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-semibold text-fg">Ubicación</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-start">
        <TextField
          label="Ciudad"
          name="city"
          autoComplete="address-level2"
          placeholder="Ej. Guadalajara"
          value={value.city}
          error={errors.city}
          {...lock}
          onChange={(event) => onChange({ city: event.currentTarget.value })}
        />
        <TextField
          label="Estado"
          name="state"
          autoComplete="address-level1"
          placeholder="Ej. Jalisco"
          value={value.state}
          error={errors.state}
          {...lock}
          onChange={(event) => onChange({ state: event.currentTarget.value })}
        />
        <div>
          <Select
            label="País"
            name="country"
            options={countries}
            selectedKey={value.country}
            onSelectionChange={(country) => onChange({ country })}
            isDisabled={locked}
          />
          {errors.country && <FieldError>{errors.country}</FieldError>}
        </div>
      </div>
      <p className="text-sm text-muted">{locationHint}</p>
    </fieldset>
  );
}
