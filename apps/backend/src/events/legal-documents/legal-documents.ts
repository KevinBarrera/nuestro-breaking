import { LEGAL_DOCUMENT_KEY_VALUES } from '@/database/schema';

/**
 * The three legal documents a buyer accepts before paying (#180). The frontend publishes each one
 * as a page that shows this same version; the two apps share no code, so a new text changes the
 * version in both (`apps/frontend/src/shared/config/legal-documents.ts`). Stored acceptances keep
 * the version the buyer accepted, so changing a version here never alters them.
 *
 * The keys are the ones the `registration_legal_acceptances` check constraint allows.
 */
export const LEGAL_DOCUMENT_KEYS = LEGAL_DOCUMENT_KEY_VALUES;
export type LegalDocumentKey = (typeof LEGAL_DOCUMENT_KEYS)[number];

// Placeholder versions until the organizer delivers the final texts (#182).
export const LEGAL_DOCUMENT_VERSIONS: Record<LegalDocumentKey, string> = {
  rules: 'borrador-2026-10-13',
  privacy: 'borrador-2026-10-13',
  cancellation: 'borrador-2026-10-13',
};

export type LegalAcceptance = { document: LegalDocumentKey; version: string };
