import { failureMessage } from '@/features/public-purchase';
import { configuredEventSlug } from '@/shared/config';
import { Notice } from '@/shared/ui';
import { PublicFrame } from '@/widgets/public-layout';
import { useEffect, type ReactNode } from 'react';
import { Outlet, useLocation, useParams } from 'react-router';
import { PurchaseProvider } from './purchase-provider';
import { usePublicCatalog } from './use-public-catalog';

// Layout of every public purchase route. `/` uses the configured event (D2); `/e/:slug` and its
// steps use the slug in the URL. Pathless, so it stays mounted (one catalog load) from `/` to
// the steps of the same event.
export function PublicPurchaseLayout() {
  const { slug: routeSlug } = useParams<'slug'>();
  const { pathname } = useLocation();
  const slug = routeSlug ?? configuredEventSlug;

  // Each step starts at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  if (!slug)
    return (
      <Message title="No hay evento a la venta">
        <p>Por ahora no hay un evento con venta en línea. Vuelve pronto.</p>
      </Message>
    );
  return <EventCatalog key={slug} slug={slug} />;
}

function EventCatalog({ slug }: { slug: string }) {
  const { state, retry } = usePublicCatalog(slug);

  if (state.status === 'loading')
    return (
      <Message>
        <p role="status">Cargando evento…</p>
      </Message>
    );
  if (state.status === 'failed') {
    if (state.failure.kind === 'not-found')
      return (
        <Message title="Este evento no existe">
          <p>Revisa la dirección o pide a la organización el enlace correcto.</p>
        </Message>
      );
    return (
      <Message>
        <Notice tone="danger">{failureMessage(state.failure)}</Notice>
        <button
          type="button"
          onClick={retry}
          className="mt-4 min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Reintentar
        </button>
      </Message>
    );
  }
  return (
    <PurchaseProvider slug={slug} catalog={state.catalog}>
      <Outlet />
    </PurchaseProvider>
  );
}

function Message({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <PublicFrame>
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-10 text-fg">
        {title ? <h1 className="mb-3 text-2xl font-extrabold text-heading">{title}</h1> : null}
        {children}
      </main>
    </PublicFrame>
  );
}
