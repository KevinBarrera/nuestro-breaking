import { formatMxn } from '@/entities/event-catalog';
import { emptySelection, passGroups, passOptions } from '@/features/public-purchase';
import { PublicFrame } from '@/widgets/public-layout';
import { Link } from 'react-router';
import { closedSalesMessage, eventDateRange } from './event-dates';
import { usePurchase } from './purchase-context';
import { stepPath } from './purchase-steps';
import { SecurePaymentNote } from './secure-payment-note';

// D5: the legal documents are placeholders until #180.
const legalLinks = ['Reglamento', 'Aviso de privacidad', 'Política de cancelación'];

// Screen 1 (Inicio): the event, how to buy, and the passes on sale with catalog prices.
export function PublicHomePage() {
  const { slug, catalog } = usePurchase();
  const { event, sales } = catalog;
  const dates = eventDateRange(event);
  const open = sales.state === 'open';
  const groups = passGroups(passOptions(catalog.passes, emptySelection));

  return (
    <PublicFrame>
      <main className="flex flex-1 flex-col">
        <div className="bg-header px-5 pt-5 pb-8 text-header-fg">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            <h1 className="text-[34px] leading-[1.05] font-extrabold tracking-[-0.01em] break-words uppercase sm:text-[40px]">
              {event.name}
            </h1>
            {dates ? <p className="text-base text-header-muted">{dates}</p> : null}
            {open ? (
              <Link
                to={stepPath(slug, 'passes')}
                className="mt-2 inline-flex min-h-13 items-center justify-center rounded-xl bg-header-fg px-6 text-[17px] font-extrabold text-header focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-header-fg sm:self-start"
              >
                Comprar pases
              </Link>
            ) : (
              <p className="mt-2 rounded-xl border border-header-line px-4 py-3 text-base font-semibold">
                {closedSalesMessage(sales, event)}
              </p>
            )}
          </div>
        </div>
        {open ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-6">
            {groups.length > 0 ? (
              <section aria-labelledby="home-passes" className="flex flex-col gap-3.5">
                <h2 id="home-passes" className="text-xl font-extrabold text-heading">
                  Pases
                </h2>
                {groups.map((group) => (
                  <div key={group.passClass} className="flex flex-col gap-2.5">
                    <h3 className="text-sm font-bold text-muted">{group.title}</h3>
                    <ul className="flex flex-col gap-2.5">
                      {group.options.map(({ pass, hint }) => (
                        <li
                          key={pass.id}
                          className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <strong className="text-[17px] text-heading">{pass.name}</strong>
                            <span className="shrink-0 font-mono text-base text-fg">
                              {formatMxn(pass.priceCents)}
                            </span>
                          </div>
                          {hint ? <p className="text-sm text-muted">{hint}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}
            <SecurePaymentNote />
          </div>
        ) : (
          <div className="flex-1" />
        )}
      </main>
      <footer className="border-t border-line px-5 pt-2 pb-6">
        <nav
          aria-label="Documentos legales"
          className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-5 text-sm"
        >
          {legalLinks.map((label) => (
            <a
              key={label}
              href="#"
              className="inline-flex min-h-11 items-center text-link underline-offset-2 hover:text-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {label}
            </a>
          ))}
        </nav>
      </footer>
    </PublicFrame>
  );
}
