import {
  buyerFieldLabels,
  buyerFields,
  buyerMaxLength,
  detailsHaveError,
  firstInvalidField,
  localIsoDate,
  validateBuyer,
  type BuyerField,
} from '@/features/public-purchase';
import { phoneModes, type PhoneMode } from '@/entities/participant';
import { CheckIcon, Notice, TextField } from '@/shared/ui';
import { continueButtonClass, PublicFrame, StepBar, StepProgress } from '@/widgets/public-layout';
import { useEffect, useState, type ComponentProps, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { usePurchase } from './purchase-context';
import {
  purchaseStepCount,
  stepBefore,
  stepNumber,
  stepPath,
  stepRedirect,
} from './purchase-steps';

type FieldSetup = Omit<ComponentProps<typeof TextField>, 'value' | 'onChange' | 'error'>;

// Labels double as the error summary names.
const fieldSetup: Record<BuyerField, FieldSetup> = {
  firstName: { label: buyerFieldLabels.firstName, autoComplete: 'given-name' },
  firstLastName: { label: buyerFieldLabels.firstLastName, autoComplete: 'family-name' },
  secondLastName: {
    label: buyerFieldLabels.secondLastName,
    optional: true,
    autoComplete: 'additional-name',
  },
  stageName: { label: buyerFieldLabels.stageName, optional: true, autoComplete: 'nickname' },
  email: {
    label: buyerFieldLabels.email,
    hint: 'Aquí te enviaremos tu confirmación y tu folio.',
    type: 'email',
    autoComplete: 'email',
  },
  // The prefix, hint and placeholder depend on the phone mode (`phoneSetup`).
  phone: { label: buyerFieldLabels.phone, type: 'tel', inputMode: 'tel' },
  city: { label: buyerFieldLabels.city, optional: true, autoComplete: 'address-level2' },
  instagram: {
    label: buyerFieldLabels.instagram,
    optional: true,
    autoComplete: 'off',
    placeholder: '@usuario',
  },
  level: { label: buyerFieldLabels.level, optional: true, autoComplete: 'off' },
  birthDate: {
    label: buyerFieldLabels.birthDate,
    optional: true,
    type: 'date',
    autoComplete: 'bday',
  },
};

// The phone field per mode (#390): a fixed +52 before the 10 national digits, or the full
// number with its country code. `autoComplete` asks the browser for the matching part.
const phoneSetup: Record<PhoneMode, FieldSetup> = {
  mx: {
    label: buyerFieldLabels.phone,
    prefix: '+52',
    hint: '10 dígitos, sin lada de país.',
    placeholder: '33 1234 5678',
    autoComplete: 'tel-national',
  },
  international: {
    label: buyerFieldLabels.phone,
    hint: 'Incluye la lada de tu país, por ejemplo +1.',
    placeholder: '+1 555 123 4567',
    autoComplete: 'tel',
  },
};

const phoneModeLabels: Record<PhoneMode, string> = {
  mx: 'México +52',
  international: 'Otro país',
};

// A segmented radio control: each label wraps a radio stretched over it, so the whole segment is
// the 44px target. The chosen one takes the selected chip tokens and a CheckIcon, so it differs
// in lightness, not only hue.
const segment =
  'relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-center text-sm font-semibold text-fg has-checked:bg-chip-selected has-checked:text-chip-selected-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus';

const inputId = (field: BuyerField) => `buyer-${field}`;

// Screen 4 (Tus datos). Values go to the draft as typed. "Revisar compra" validates with the
// purchase model; after a failed attempt errors update while typing, the summary lists them and
// the first invalid field gets focus (opening "Más datos" when the error is inside it).
export function PublicBuyerPage() {
  const { slug, catalog, selection, buyer, setBuyer } = usePurchase();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // A new object per failed attempt, so focus moves on every attempt but not while typing.
  const [focusRequest, setFocusRequest] = useState<{ field: BuyerField } | null>(null);
  const errors = submitted ? validateBuyer(buyer, localIsoDate(new Date())) : {};

  // Focus after the render that shows the errors (and opens the details block).
  useEffect(() => {
    if (focusRequest) document.getElementById(inputId(focusRequest.field))?.focus();
  }, [focusRequest]);

  const redirect = stepRedirect('buyer', catalog.passes, selection);
  if (redirect) return <Navigate replace to={stepPath(slug, redirect)} />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateBuyer(buyer, localIsoDate(new Date()));
    const field = firstInvalidField(found);
    if (!field) {
      void navigate(stepPath(slug, 'review'));
      return;
    }
    if (detailsHaveError(found)) setDetailsOpen(true);
    setSubmitted(true);
    setFocusRequest({ field });
  };

  const input = (field: BuyerField) => (
    <TextField
      {...fieldSetup[field]}
      {...(field === 'phone' ? phoneSetup[buyer.phoneMode] : {})}
      id={inputId(field)}
      name={field}
      maxLength={buyerMaxLength[field]}
      value={buyer[field]}
      onChange={(event) => setBuyer({ ...buyer, [field]: event.target.value })}
      error={errors[field]}
    />
  );
  const listed = buyerFields.filter((field) => errors[field]);

  return (
    <PublicFrame backTo={stepPath(slug, stepBefore('buyer', catalog.passes, selection))}>
      <form noValidate onSubmit={submit} className="flex flex-1 flex-col">
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-5">
          <StepProgress step={stepNumber('buyer')} total={purchaseStepCount} />
          <h1 className="text-[26px] leading-tight font-extrabold text-heading">Tus datos</h1>
          <p className="text-muted">Los datos de la persona que va a asistir y competir.</p>
          {listed.length > 0 ? (
            <Notice tone="danger" title="Revisa estos datos:">
              <ul className="list-disc pl-5">
                {listed.map((field) => (
                  <li key={field}>
                    {fieldSetup[field].label}: {errors[field]}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {input('firstName')}
          <div className="grid grid-cols-2 gap-3 *:min-w-0">
            {input('firstLastName')}
            {input('secondLastName')}
          </div>
          {input('stageName')}
          {input('email')}
          <div className="flex flex-col gap-1">
            <fieldset>
              <legend className="text-sm font-semibold text-fg">País de tu teléfono</legend>
              <div className="mt-1 flex gap-1 rounded-lg border border-input-line bg-input p-1">
                {phoneModes.map((mode) => (
                  <label key={mode} className={segment}>
                    <input
                      type="radio"
                      name="phoneMode"
                      value={mode}
                      checked={buyer.phoneMode === mode}
                      onChange={() => setBuyer({ ...buyer, phoneMode: mode })}
                      className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-md"
                    />
                    {buyer.phoneMode === mode ? <CheckIcon /> : null}
                    {phoneModeLabels[mode]}
                  </label>
                ))}
              </div>
            </fieldset>
            {input('phone')}
          </div>
          <details
            open={detailsOpen}
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
            className="rounded-xl border border-line bg-surface px-4"
          >
            <summary className="flex min-h-12 cursor-pointer items-center font-bold text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              Más datos (opcional): ciudad, Instagram, nivel
            </summary>
            <div className="flex flex-col gap-4 pb-4">
              {input('city')}
              {input('instagram')}
              {input('level')}
              {input('birthDate')}
            </div>
          </details>
        </main>
        <StepBar backTo={stepPath(slug, stepBefore('buyer', catalog.passes, selection))}>
          <button type="submit" className={continueButtonClass}>
            Revisar compra
          </button>
        </StepBar>
      </form>
    </PublicFrame>
  );
}
