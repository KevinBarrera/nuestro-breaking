import { formatMxn } from '@/entities/event-catalog';
import { passGroups, passOptions, purchaseTotals } from '@/features/public-purchase';
import {
  continueButtonClass,
  PublicFrame,
  PurchaseBar,
  StepProgress,
} from '@/widgets/public-layout';
import { Link, useNavigate } from 'react-router';
import { closedSalesMessage, eventDateRange } from './event-dates';
import { usePurchase } from './purchase-context';
import { purchaseStepCount, stepAfterPasses, stepNumber, stepPath } from './purchase-steps';
import { PassCard } from './pass-card';
import { SecurePaymentNote } from './secure-payment-note';

const blockedHint = 'Elige al menos un pase para continuar.';

// Screen 2 (Elige tus pases). Phones get a sticky bottom bar; from lg up the same state shows in
// a side panel beside a two-column list (PasesEscritorio).
export function PublicPassesPage() {
  const { slug, catalog, selection, togglePass } = usePurchase();
  const navigate = useNavigate();
  const options = passOptions(catalog.passes, selection);
  const chosen = options.filter((option) => option.selected);
  const { passCount, totalCents } = purchaseTotals(catalog.passes, selection);
  const hint = passCount === 0 ? blockedHint : null;
  const next = () => void navigate(stepPath(slug, stepAfterPasses(catalog.passes, selection)));

  if (catalog.sales.state === 'closed')
    return (
      <PublicFrame backTo={stepPath(slug, 'home')}>
        <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10">
          <h1 className="mb-3 text-2xl font-extrabold text-heading">Elige tus pases</h1>
          <p>{closedSalesMessage(catalog.sales, catalog.event)}</p>
          <Link
            to={stepPath(slug, 'home')}
            className="mt-4 inline-flex min-h-11 items-center text-link underline"
          >
            Volver al inicio
          </Link>
        </main>
      </PublicFrame>
    );

  return (
    <PublicFrame backTo={stepPath(slug, 'home')} aside={eventDateRange(catalog.event)}>
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-start gap-10 px-5 pt-5 pb-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-16 lg:py-10">
        <main className="flex min-w-0 flex-col gap-4">
          <StepProgress step={stepNumber('passes')} total={purchaseStepCount} />
          <h1 className="text-[26px] leading-tight font-extrabold text-heading lg:text-[34px]">
            Elige tus pases
          </h1>
          {passGroups(options).map((group) => (
            <fieldset key={group.passClass} className="flex flex-col gap-3 pt-2">
              <legend className="mb-3 text-sm font-bold text-muted">{group.title}</legend>
              <div className="grid gap-3 lg:grid-cols-2 lg:gap-3.5">
                {group.options.map((option) => (
                  <PassCard
                    key={option.pass.id}
                    option={option}
                    onToggle={() => togglePass(option.pass.id)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </main>
        <aside
          aria-label="Tu compra"
          className="sticky top-6 hidden flex-col gap-3.5 rounded-2xl border border-line bg-surface p-6 shadow-[0_10px_30px_rgb(0_0_0/0.08)] lg:flex"
        >
          <strong className="text-lg text-heading">Tu compra</strong>
          {chosen.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {chosen.map(({ pass }) => (
                <li key={pass.id} className="flex justify-between gap-3">
                  <span>{pass.name}</span>
                  <span className="font-mono">{formatMxn(pass.priceCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aún no eliges pases.</p>
          )}
          <div className="flex items-baseline justify-between border-t border-line pt-3.5">
            <strong>Total</strong>
            <strong className="font-mono text-2xl font-medium text-heading">
              {formatMxn(totalCents)}
            </strong>
          </div>
          <button type="button" disabled={!!hint} onClick={next} className={continueButtonClass}>
            Continuar
          </button>
          {hint ? <p className="text-sm text-muted">{hint}</p> : null}
          <SecurePaymentNote />
        </aside>
      </div>
      <PurchaseBar
        passCount={passCount}
        totalCents={totalCents}
        blockedHint={hint}
        onContinue={next}
        className="lg:hidden"
      />
    </PublicFrame>
  );
}
