import { routes, type LegalDocument } from '@/shared/config';
import { Notice } from '@/shared/ui';
import { PublicFrame } from '@/widgets/public-layout';
import { Link } from 'react-router';
import { legalTexts } from './legal-texts';

// One legal document of the purchase flow (#180), with the version the buyer accepts on revisar.
// A static page outside the purchase layout: it needs no catalog and no API call. The review
// screen opens it in another tab, so the purchase stays where it was.
export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  return (
    <PublicFrame>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-[18px] px-5 py-7">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-extrabold text-heading">
            {document.title}
          </h1>
          <p className="text-sm text-muted">Versión: {document.version}</p>
        </div>
        <Notice title="Texto provisional">
          La organización publicará el texto final antes de abrir la venta en línea.
        </Notice>
        {legalTexts[document.key].map((paragraph) => (
          <p key={paragraph} className="leading-relaxed text-fg">
            {paragraph}
          </p>
        ))}
        <Link
          to={routes.publicHome}
          className="inline-flex min-h-11 items-center self-start font-semibold text-link underline underline-offset-2 hover:text-link-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          Ir al inicio
        </Link>
      </main>
    </PublicFrame>
  );
}
