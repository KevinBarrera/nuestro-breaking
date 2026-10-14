// The three legal documents a buyer accepts before paying (#180), each published as a public page
// that shows its version. The backend checks the same versions
// (`apps/backend/src/events/legal-documents/legal-documents.ts`); the apps share no code, so a new
// text changes the version in both. Placeholder versions until the organizer delivers the final
// texts (#182).
export type LegalDocumentKey = 'rules' | 'privacy' | 'cancellation';

export type LegalDocument = {
  key: LegalDocumentKey;
  title: string;
  path: string;
  version: string;
};

export const legalDocuments: readonly LegalDocument[] = [
  {
    key: 'rules',
    title: 'Reglamento oficial',
    path: '/legal/reglamento',
    version: 'borrador-2026-10-13',
  },
  {
    key: 'privacy',
    title: 'Aviso de privacidad',
    path: '/legal/privacidad',
    version: 'borrador-2026-10-13',
  },
  {
    key: 'cancellation',
    title: 'Política de cancelación',
    path: '/legal/cancelacion',
    version: 'borrador-2026-10-13',
  },
];
